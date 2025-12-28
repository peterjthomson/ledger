/**
 * GitGraph - Visual git commit graph with lane-based branch visualization
 *
 * Displays commits as nodes on lanes (branches), with connecting lines showing
 * parent-child relationships. Supports both graphical view and flat list mode.
 */

import { useMemo } from 'react'
import type { GraphCommit } from '../../../types/electron'

export interface GitGraphProps {
  commits: GraphCommit[]
  selectedCommit: GraphCommit | null
  onSelectCommit: (commit: GraphCommit) => void
  formatRelativeTime: (date: string) => string
  showGraph?: boolean // Show graph lines/nodes, when false it's a flat list
}

// Lane colors for branches
const LANE_COLORS = [
  '#5B9BD5', // blue
  '#70AD47', // green
  '#ED7D31', // orange
  '#7030A0', // purple
  '#FFC000', // yellow
  '#C00000', // red
  '#00B0F0', // cyan
  '#FF6699', // pink
]

export function GitGraph({
  commits,
  selectedCommit,
  onSelectCommit,
  formatRelativeTime,
  showGraph = true,
}: GitGraphProps) {
  // Calculate lane assignments for the graph
  const { lanes, maxLane } = useMemo(() => {
    const laneMap = new Map<string, number>()
    const activeLanes = new Set<number>()
    let maxLaneUsed = 0

    // Process commits in order (newest first)
    for (const commit of commits) {
      // Find or assign a lane for this commit
      let lane = laneMap.get(commit.hash)

      if (lane === undefined) {
        // Find first available lane
        lane = 0
        while (activeLanes.has(lane)) lane++
        laneMap.set(commit.hash, lane)
      }

      activeLanes.add(lane)
      maxLaneUsed = Math.max(maxLaneUsed, lane)

      // Assign lanes to parents
      commit.parents.forEach((parentHash, idx) => {
        if (!laneMap.has(parentHash)) {
          if (idx === 0) {
            // First parent stays in same lane
            laneMap.set(parentHash, lane!)
          } else {
            // Other parents get new lanes
            let parentLane = 0
            while (activeLanes.has(parentLane) || parentLane === lane) parentLane++
            laneMap.set(parentHash, parentLane)
            activeLanes.add(parentLane)
            maxLaneUsed = Math.max(maxLaneUsed, parentLane)
          }
        }
      })

      // If commit has no parents, release the lane
      if (commit.parents.length === 0) {
        activeLanes.delete(lane)
      }
    }

    return { lanes: laneMap, maxLane: maxLaneUsed }
  }, [commits])

  const LANE_WIDTH = 16
  const ROW_HEIGHT = 36
  const NODE_RADIUS = 4
  const graphWidth = (maxLane + 1) * LANE_WIDTH + 20

  // Build a map of commit hash to index for drawing lines
  const commitIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    commits.forEach((c, i) => map.set(c.hash, i))
    return map
  }, [commits])

  return (
    <div className={`git-graph ${!showGraph ? 'no-graph' : ''}`}>
      {showGraph && (
        <svg
          className="git-graph-svg"
          width={graphWidth}
          height={commits.length * ROW_HEIGHT}
          style={{ minWidth: graphWidth }}
        >
          {/* Draw connecting lines */}
          {commits.map((commit, idx) => {
            const lane = lanes.get(commit.hash) || 0
            const x = 10 + lane * LANE_WIDTH
            const y = idx * ROW_HEIGHT + ROW_HEIGHT / 2
            const color = LANE_COLORS[lane % LANE_COLORS.length]

            return commit.parents.map((parentHash, pIdx) => {
              const parentIdx = commitIndexMap.get(parentHash)
              if (parentIdx === undefined) return null

              const parentLane = lanes.get(parentHash) || 0
              const px = 10 + parentLane * LANE_WIDTH
              const py = parentIdx * ROW_HEIGHT + ROW_HEIGHT / 2
              const parentColor = LANE_COLORS[parentLane % LANE_COLORS.length]

              // Draw curved line
              if (lane === parentLane) {
                // Straight line
                return (
                  <line
                    key={`${commit.hash}-${parentHash}`}
                    x1={x}
                    y1={y}
                    x2={px}
                    y2={py}
                    stroke={color}
                    strokeWidth={2}
                  />
                )
              } else {
                // Curved line for merges/branches
                const midY = (y + py) / 2
                return (
                  <path
                    key={`${commit.hash}-${parentHash}-${pIdx}`}
                    d={`M ${x} ${y} C ${x} ${midY}, ${px} ${midY}, ${px} ${py}`}
                    stroke={pIdx === 0 ? color : parentColor}
                    strokeWidth={2}
                    fill="none"
                  />
                )
              }
            })
          })}

          {/* Draw commit nodes */}
          {commits.map((commit, idx) => {
            const lane = lanes.get(commit.hash) || 0
            const x = 10 + lane * LANE_WIDTH
            const y = idx * ROW_HEIGHT + ROW_HEIGHT / 2
            const color = LANE_COLORS[lane % LANE_COLORS.length]
            const isSelected = selectedCommit?.hash === commit.hash

            return (
              <g key={commit.hash}>
                {/* Selection ring */}
                {isSelected && (
                  <circle cx={x} cy={y} r={NODE_RADIUS + 3} fill="none" stroke={color} strokeWidth={2} opacity={0.5} />
                )}
                {/* Node */}
                <circle
                  cx={x}
                  cy={y}
                  r={commit.isMerge ? NODE_RADIUS + 1 : NODE_RADIUS}
                  fill={commit.isMerge ? 'var(--bg-primary)' : color}
                  stroke={color}
                  strokeWidth={commit.isMerge ? 2 : 0}
                />
              </g>
            )
          })}
        </svg>
      )}

      {/* Commit list */}
      <div className="git-graph-list" style={{ marginLeft: showGraph ? graphWidth : 0 }}>
        {commits.map((commit) => (
          <div
            key={commit.hash}
            className={`graph-commit-row ${selectedCommit?.hash === commit.hash ? 'selected' : ''}`}
            style={{ height: ROW_HEIGHT }}
            onClick={() => onSelectCommit(commit)}
          >
            <div className="graph-commit-refs">
              {commit.refs.map((ref, i) => {
                const isHead = ref.includes('HEAD')
                const isBranch = ref.includes('origin/') || !ref.includes('/')
                const cleanRef = ref.replace('HEAD -> ', '').replace('origin/', '')
                return (
                  <span key={i} className={`graph-ref ${isHead ? 'head' : ''} ${isBranch ? 'branch' : 'tag'}`}>
                    {cleanRef}
                  </span>
                )
              })}
            </div>
            <span className="graph-commit-message" title={commit.message}>
              {commit.message}
            </span>
            <span className="graph-commit-meta">
              <code className="commit-hash">{commit.shortHash}</code>
              <span className="graph-commit-author">{commit.author}</span>
              <span className="graph-commit-date">{formatRelativeTime(commit.date)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
