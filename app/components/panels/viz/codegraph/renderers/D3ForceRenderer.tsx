/**
 * D3ForceRenderer - Code Graph visualization using D3 force simulation
 *
 * Renders CodeGraphSchema as a force-directed network graph where
 * nodes cluster naturally based on their connections.
 *
 * Key design: Preserves viewport (zoom/pan) when data changes by:
 * - Storing zoom transform in a ref
 * - Using D3 data joins to update nodes/links in place
 * - Only auto-fitting on initial render, not on updates
 */

import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { CodeGraphSchema, CodeNode, CodeNodeKind, CodeEdgeKind } from '@/app/types/electron'

interface D3ForceRendererProps {
  schema: CodeGraphSchema | null
  /** Total nodes available (for initial framing) */
  totalNodes?: number
}

// D3 node with position
interface D3Node extends d3.SimulationNodeDatum {
  id: string
  data: CodeNode
}

// D3 link
interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  id: string
  kind: CodeEdgeKind
  resolved: boolean
}

// Persistent state across renders
interface RendererState {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null
  g: d3.Selection<SVGGElement, unknown, null, undefined> | null
  zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null
  simulation: d3.Simulation<D3Node, D3Link> | null
  transform: d3.ZoomTransform
  hasInitialFit: boolean
  nodePositions: Map<string, { x: number; y: number }>
}

/**
 * Get color for node based on change status, category, or kind
 */
function getNodeColor(node: CodeNode, showDiffColors: boolean = false): string {
  // If diff mode is enabled, check for change status first
  if (showDiffColors && node.changeStatus) {
    switch (node.changeStatus) {
      case 'added':
        return '#22c55e' // bright green - new files
      case 'modified':
        return '#22c55e' // bright green - modified files
      case 'deleted':
        return '#ef4444' // red - deleted files
    }
  }

  // Check for category (Laravel: model/controller/service)
  const category = (node as unknown as { category?: string }).category
  if (category) {
    switch (category) {
      case 'model':
        return '#10b981' // green - data/models
      case 'controller':
        return '#3b82f6' // blue - controllers
      case 'service':
        return '#f59e0b' // amber - services
    }
  }
  
  // Fall back to kind-based coloring
  switch (node.kind) {
    case 'file':
      return '#6b7280'
    case 'class':
      return '#3b82f6'
    case 'interface':
      return '#8b5cf6'
    case 'function':
      return '#10b981'
    case 'module':
      return '#f59e0b'
    case 'trait':
      return '#ec4899'
    case 'enum':
      return '#06b6d4'
    default:
      return '#9ca3af'
  }
}

/**
 * Get color for edge kind
 */
function getEdgeColor(kind: CodeEdgeKind): string {
  switch (kind) {
    case 'imports':
      return '#9ca3af'
    case 'extends':
      return '#3b82f6'
    case 'implements':
      return '#8b5cf6'
    case 'includes':
      return '#f59e0b'
    case 'exports':
      return '#10b981'
    default:
      return '#d1d5db'
  }
}

/**
 * Get node radius based on kind
 */
function getNodeRadius(kind: CodeNodeKind): number {
  switch (kind) {
    case 'file':
      return 6
    case 'class':
      return 10
    case 'interface':
      return 8
    case 'function':
      return 6
    case 'module':
      return 12
    case 'trait':
      return 7
    default:
      return 5
  }
}

// Target frame size for initial zoom (show room for this many nodes)
const INITIAL_FRAME_TARGET = 100

export function D3ForceRenderer({ schema, totalNodes }: D3ForceRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Persistent state that survives re-renders
  const stateRef = useRef<RendererState>({
    svg: null,
    g: null,
    zoom: null,
    simulation: null,
    transform: d3.zoomIdentity,
    hasInitialFit: false,
    nodePositions: new Map(),
  })

  // Initialize SVG and zoom (only once)
  const initializeSvg = useCallback(() => {
    if (!containerRef.current) return
    
    const state = stateRef.current
    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Only create SVG once
    if (!state.svg) {
      // Clear any existing content
      d3.select(container).selectAll('svg').remove()

      // Create SVG
      state.svg = d3
        .select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height])
        .attr('class', 'codegraph-d3-svg')

      // Create a group for zoom/pan
      state.g = state.svg.append('g')

      // Create defs for markers (once)
      const defs = state.svg.append('defs')
      const edgeKinds: CodeEdgeKind[] = ['imports', 'extends', 'implements', 'includes', 'exports']
      edgeKinds.forEach((kind) => {
        defs
          .append('marker')
          .attr('id', `arrow-${kind}`)
          .attr('viewBox', '0 -5 10 10')
          .attr('refX', 15)
          .attr('refY', 0)
          .attr('markerWidth', 6)
          .attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path')
          .attr('d', 'M0,-5L10,0L0,5')
          .attr('fill', getEdgeColor(kind))
      })

      // Create groups for links and nodes
      state.g.append('g').attr('class', 'links')
      state.g.append('g').attr('class', 'nodes')

      // Add zoom behavior
      state.zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          // Store the transform for persistence
          state.transform = event.transform
          state.g!.attr('transform', event.transform)
        })

      state.svg.call(state.zoom)
    } else {
      // Update dimensions on resize
      state.svg
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height])
    }
  }, [])

  // Update the graph data (called when schema changes)
  const updateGraph = useCallback(() => {
    const state = stateRef.current
    if (!containerRef.current || !state.svg || !state.g || !schema || schema.nodes.length === 0) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Check if diff mode is active
    const showDiffColors = schema.nodes.some((n) => n.changeStatus !== undefined)

    // Stop existing simulation
    if (state.simulation) {
      state.simulation.stop()
    }

    // Create node map and restore positions from previous render
    const nodeMap = new Map<string, D3Node>()
    const d3Nodes: D3Node[] = schema.nodes.map((node) => {
      // Try to restore position from previous state
      const savedPos = state.nodePositions.get(node.id)
      const d3Node: D3Node = {
        id: node.id,
        data: node,
        // Restore position if available, otherwise let simulation place it
        x: savedPos?.x ?? undefined,
        y: savedPos?.y ?? undefined,
      }
      nodeMap.set(node.id, d3Node)
      return d3Node
    })

    // Convert edges
    const d3Links: D3Link[] = schema.edges
      .filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        source: nodeMap.get(edge.source)!,
        target: nodeMap.get(edge.target)!,
        kind: edge.kind,
        resolved: edge.resolved,
      }))

    // Create force simulation
    state.simulation = d3
      .forceSimulation<D3Node>(d3Nodes)
      .force(
        'link',
        d3
          .forceLink<D3Node, D3Link>(d3Links)
          .id((d) => d.id)
          .distance(120)
          .strength(0.3)
      )
      .force('charge', d3.forceManyBody().strength(-400).distanceMax(500))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.08))
      .force('collision', d3.forceCollide().radius(25))

    // If nodes have restored positions, run simulation with lower alpha
    const hasRestoredPositions = d3Nodes.some((n) => n.x !== undefined)
    if (hasRestoredPositions) {
      state.simulation.alpha(0.3) // Gentle repositioning
    }

    // Update links using data join
    const linksGroup = state.g.select<SVGGElement>('g.links')
    const link = linksGroup
      .selectAll<SVGLineElement, D3Link>('line')
      .data(d3Links, (d) => d.id)
      .join(
        (enter) =>
          enter
            .append('line')
            .attr('stroke', (d) => getEdgeColor(d.kind))
            .attr('stroke-width', 1.5)
            .attr('stroke-opacity', 0.6)
            .attr('stroke-dasharray', (d) => (d.kind === 'implements' ? '5,5' : null))
            .attr('marker-end', (d) => `url(#arrow-${d.kind})`),
        (update) => update,
        (exit) => exit.remove()
      )

    // Update nodes using data join
    const nodesGroup = state.g.select<SVGGElement>('g.nodes')
    const node = nodesGroup
      .selectAll<SVGGElement, D3Node>('g.node')
      .data(d3Nodes, (d) => d.id)
      .join(
        (enter) => {
          const nodeEnter = enter.append('g').attr('class', 'node')

          // Add circle
          nodeEnter
            .append('circle')
            .attr('r', (d) => getNodeRadius(d.data.kind))
            .attr('fill', (d) => getNodeColor(d.data, showDiffColors))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)

          // Add label
          nodeEnter
            .append('text')
            .text((d) => d.data.name)
            .attr('x', (d) => getNodeRadius(d.data.kind) + 4)
            .attr('y', 4)
            .attr('font-size', 10)
            .attr('fill', 'var(--text-primary)')
            .attr('class', 'codegraph-d3-label')

          // Add title for hover
          nodeEnter
            .append('title')
            .text((d) => `${d.data.kind}: ${d.data.name}\n${d.data.filePath}`)

          return nodeEnter
        },
        (update) => {
          // Update colors for existing nodes (in case diff status changed)
          update
            .select('circle')
            .attr('fill', (d) => getNodeColor(d.data, showDiffColors))
          return update
        },
        (exit) => exit.remove()
      )

    // Add drag behavior to all nodes
    node.call(
      d3
        .drag<SVGGElement, D3Node>()
        .on('start', (event, d) => {
          if (!event.active) state.simulation!.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) state.simulation!.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
    )

    // Update positions on tick and save them
    state.simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as D3Node).x ?? 0)
        .attr('y1', (d) => (d.source as D3Node).y ?? 0)
        .attr('x2', (d) => (d.target as D3Node).x ?? 0)
        .attr('y2', (d) => (d.target as D3Node).y ?? 0)

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)

      // Save positions for next update
      d3Nodes.forEach((n) => {
        if (n.x !== undefined && n.y !== undefined) {
          state.nodePositions.set(n.id, { x: n.x, y: n.y })
        }
      })
    })

    // Only do initial zoom-to-fit on first render
    if (!state.hasInitialFit) {
      state.hasInitialFit = true
      setTimeout(() => {
        if (!state.svg || !state.zoom) return

        // Calculate expected bounds for target node count (not current visible nodes)
        // This frames the view to fit ~100 nodes so revealing more doesn't require reframing
        const frameTarget = Math.max(totalNodes || INITIAL_FRAME_TARGET, INITIAL_FRAME_TARGET)
        
        // Estimate spread based on force simulation parameters:
        // - charge strength: -400, collision radius: 25
        // - Approximate spread scales with sqrt(nodeCount) * spacing factor
        const spacingFactor = 50 // Approximate spacing between nodes
        const estimatedSpread = Math.sqrt(frameTarget) * spacingFactor
        
        // Create virtual bounds centered on the canvas
        const centerX = width / 2
        const centerY = height / 2
        const virtualBounds = {
          width: estimatedSpread * 1.5, // Landscape aspect
          height: estimatedSpread,
          x: centerX - (estimatedSpread * 1.5) / 2,
          y: centerY - estimatedSpread / 2,
        }

        const midX = virtualBounds.x + virtualBounds.width / 2
        const midY = virtualBounds.y + virtualBounds.height / 2
        const scale = 0.8 / Math.max(virtualBounds.width / width, virtualBounds.height / height)
        const translate = [width / 2 - scale * midX, height / 2 - scale * midY]
        const newTransform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)

        state.svg
          .transition()
          .duration(500)
          .call(state.zoom.transform, newTransform)
      }, 500)
    } else {
      // Restore previous transform (user's zoom/pan state)
      if (state.svg && state.zoom) {
        state.svg.call(state.zoom.transform, state.transform)
      }
    }
  }, [schema])

  // Initialize SVG on mount
  useEffect(() => {
    initializeSvg()
  }, [initializeSvg])

  // Update graph when schema changes
  useEffect(() => {
    initializeSvg() // Ensure SVG exists
    updateGraph()

    return () => {
      if (stateRef.current.simulation) {
        stateRef.current.simulation.stop()
      }
    }
  }, [initializeSvg, updateGraph])

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      initializeSvg()
      // Don't call updateGraph - just update dimensions
      // The existing transform will keep the view stable
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [initializeSvg])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const state = stateRef.current
      if (state.simulation) {
        state.simulation.stop()
      }
      // Reset state for next mount
      state.svg = null
      state.g = null
      state.zoom = null
      state.simulation = null
      state.hasInitialFit = false
    }
  }, [])

  if (!schema || schema.nodes.length === 0) {
    return (
      <div className="codegraph-renderer codegraph-d3-renderer codegraph-empty">
        <p>No nodes to display</p>
      </div>
    )
  }

  return <div ref={containerRef} className="codegraph-renderer codegraph-d3-renderer" />
}

export default D3ForceRenderer
