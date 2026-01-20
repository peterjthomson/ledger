/**
 * CanvasRenderer - Main canvas rendering component
 * 
 * Single entry point for rendering any canvas (preset or user-created).
 * Takes data and handlers, renders panels based on canvas configuration.
 * 
 * Design:
 * - One component renders all canvases
 * - Panels are self-contained and reusable
 * - Data flows down, events flow up
 * - Canvas config determines layout
 */

import React, { useCallback, useState, useEffect, useRef, type ReactNode } from 'react'
import type { Column } from '../../types/app-types'
import type {
  PullRequest,
  Branch,
  Worktree,
  StashEntry,
  GraphCommit,
  WorkingStatus,
  CommitDiff,
  RepoInfo,
  TechTreeNode,
} from '../../types/electron'
import { useCanvas } from './CanvasContext'
import { Canvas } from './Canvas'
import { EditorSlot } from './EditorSlot'

// Import panels
import { PRList, BranchList, WorktreeList, StashList, CommitList, Sidebar, RepoList } from '../panels/list'
import { GitGraph, ContributorChart, TechTreeChart } from '../panels/viz'
import { ERDCanvasPanel } from '../panels/viz/erd'

// ========================================
// Data Interface
// ========================================

/**
 * All the data any panel might need.
 * Pass everything - panels take what they need.
 */
export interface CanvasData {
  // Repository
  repoPath: string | null
  
  // Pull requests
  prs: PullRequest[]
  prError: string | null
  
  // Branches
  branches: Branch[]
  currentBranch: string | null
  
  // Worktrees
  worktrees: Worktree[]
  
  // Stashes
  stashes: StashEntry[]
  
  // Commits (for git graph)
  commits: GraphCommit[]
  
  // Working status (for uncommitted changes)
  workingStatus: WorkingStatus | null
  
  // Commit diff (for viewing diffs)
  commitDiff: CommitDiff | null
  loadingDiff: boolean
}

/**
 * Selection state - what's currently selected/focused
 */
export interface CanvasSelection {
  // Selected item (for highlighting in lists)
  selectedPR: PullRequest | null
  selectedBranch: Branch | null
  selectedWorktree: Worktree | null
  selectedStash: StashEntry | null
  selectedCommit: GraphCommit | null
  selectedRepo: RepoInfo | null
  uncommittedSelected?: boolean
}

/**
 * Event handlers for user interactions
 */
export interface CanvasHandlers {
  // Format helpers
  formatRelativeTime: (date: string) => string
  formatDate: (date: string) => string
  
  // PR handlers
  onSelectPR: (pr: PullRequest) => void
  onDoubleClickPR: (pr: PullRequest) => void
  onContextMenuPR: (e: React.MouseEvent, pr: PullRequest) => void
  
  // Branch handlers
  onSelectBranch: (branch: Branch) => void
  onDoubleClickBranch: (branch: Branch) => void
  onContextMenuLocalBranch: (e: React.MouseEvent, branch: Branch) => void
  onContextMenuRemoteBranch: (e: React.MouseEvent, branch: Branch) => void
  onCreateBranch: () => void
  
  // Worktree handlers
  onSelectWorktree: (worktree: Worktree) => void
  onDoubleClickWorktree: (worktree: Worktree) => void
  onContextMenuWorktree: (e: React.MouseEvent, worktree: Worktree) => void
  onCreateWorktree: () => void
  
  // Stash handlers
  onSelectStash: (stash: StashEntry) => void
  onDoubleClickStash: (stash: StashEntry) => void
  onContextMenuStash?: (e: React.MouseEvent, stash: StashEntry) => void
  
  // Repo handlers
  onSelectRepo?: (repo: RepoInfo) => void
  onDoubleClickRepo?: (repo: RepoInfo) => void
  
  // Commit/graph handlers
  onSelectCommit: (commit: GraphCommit) => void
  onDoubleClickCommit?: (commit: GraphCommit) => void
  onContextMenuCommit?: (e: React.MouseEvent, commit: GraphCommit) => void
  
  // Uncommitted changes handlers
  onSelectUncommitted?: () => void
  onDoubleClickUncommitted?: () => void
  onContextMenuUncommitted?: (e: React.MouseEvent, status: WorkingStatus) => void
  
  // Tech tree handlers
  onSelectTechTreeNode?: (branchName: string) => void
  
  // Editor panel rendering (for custom editor content)
  renderEditorContent?: () => ReactNode
  
  // Special panel triggers
  onOpenMailmap?: () => void
}

/**
 * UI state
 */
export interface CanvasUIState {
  switching: boolean  // Branch checkout in progress
  deleting: boolean   // Delete operation in progress
}

export interface CanvasRendererProps {
  data: CanvasData
  selection: CanvasSelection
  handlers: CanvasHandlers
  uiState: CanvasUIState
}

// ========================================
// Canvas Renderer Component
// ========================================

export function CanvasRenderer({
  data,
  selection,
  handlers,
  uiState,
}: CanvasRendererProps) {
  const {
    activeCanvas,
    resizeColumn,
    reorderColumns,
    setColumnPanel,
  } = useCanvas()

  // Render a list panel based on column config
  const renderListSlot = useCallback(
    (column: Column): ReactNode => {
      switch (column.panel) {
        case 'pr-list':
          return (
            <PRList
              column={column}
              prs={data.prs}
              selectedPR={selection.selectedPR}
              error={data.prError}
              formatRelativeTime={handlers.formatRelativeTime}
              onSelect={handlers.onSelectPR}
              onDoubleClick={handlers.onDoubleClickPR}
              onContextMenu={handlers.onContextMenuPR}
            />
          )

        case 'branch-list':
          return (
            <BranchList
              column={column}
              branches={data.branches.filter((b) => !b.isRemote)}
              isRemote={false}
              selectedBranch={selection.selectedBranch}
              switching={uiState.switching}
              formatDate={handlers.formatDate}
              onSelect={handlers.onSelectBranch}
              onDoubleClick={handlers.onDoubleClickBranch}
              onContextMenu={handlers.onContextMenuLocalBranch}
              onCreateBranch={handlers.onCreateBranch}
            />
          )

        case 'remote-list':
          return (
            <BranchList
              column={column}
              branches={data.branches.filter((b) => b.isRemote)}
              isRemote={true}
              selectedBranch={selection.selectedBranch}
              switching={uiState.switching}
              formatDate={handlers.formatDate}
              onSelect={handlers.onSelectBranch}
              onDoubleClick={handlers.onDoubleClickBranch}
              onContextMenu={handlers.onContextMenuRemoteBranch}
            />
          )

        case 'worktree-list':
          return (
            <WorktreeList
              column={column}
              worktrees={data.worktrees}
              currentBranch={data.currentBranch}
              repoPath={data.repoPath}
              selectedWorktree={selection.selectedWorktree}
              onSelect={handlers.onSelectWorktree}
              onDoubleClick={handlers.onDoubleClickWorktree}
              onContextMenu={handlers.onContextMenuWorktree}
              onCreateWorktree={handlers.onCreateWorktree}
            />
          )

        case 'stash-list':
          return (
            <StashList
              column={column}
              stashes={data.stashes}
              selectedStash={selection.selectedStash}
              formatRelativeTime={handlers.formatRelativeTime}
              onSelect={handlers.onSelectStash}
              onDoubleClick={handlers.onDoubleClickStash}
              onContextMenu={handlers.onContextMenuStash}
            />
          )

        case 'commit-list':
          return (
            <CommitList
              column={column}
              commits={data.commits}
              currentBranch={data.currentBranch}
              workingStatus={data.workingStatus}
              selectedCommit={selection.selectedCommit}
              uncommittedSelected={selection.uncommittedSelected}
              formatRelativeTime={handlers.formatRelativeTime}
              onSelectCommit={handlers.onSelectCommit}
              onDoubleClickCommit={handlers.onDoubleClickCommit}
              onContextMenuCommit={handlers.onContextMenuCommit}
              onSelectUncommitted={handlers.onSelectUncommitted}
              onDoubleClickUncommitted={handlers.onDoubleClickUncommitted}
              onContextMenuUncommitted={handlers.onContextMenuUncommitted}
              switching={uiState.switching}
            />
          )

        case 'sidebar':
          return (
            <Sidebar
              column={column}
              prs={data.prs}
              branches={data.branches}
              worktrees={data.worktrees}
              stashes={data.stashes}
              repoPath={data.repoPath}
              workingStatus={data.workingStatus}
              selectedPR={selection.selectedPR}
              selectedBranch={selection.selectedBranch}
              selectedWorktree={selection.selectedWorktree}
              selectedStash={selection.selectedStash}
              selectedRepo={selection.selectedRepo}
              uncommittedSelected={selection.uncommittedSelected}
              onSelectPR={handlers.onSelectPR}
              onDoubleClickPR={handlers.onDoubleClickPR}
              onContextMenuPR={handlers.onContextMenuPR}
              onSelectBranch={handlers.onSelectBranch}
              onDoubleClickBranch={handlers.onDoubleClickBranch}
              onContextMenuBranch={handlers.onContextMenuLocalBranch}
              onSelectWorktree={handlers.onSelectWorktree}
              onDoubleClickWorktree={handlers.onDoubleClickWorktree}
              onContextMenuWorktree={handlers.onContextMenuWorktree}
              onSelectStash={handlers.onSelectStash}
              onDoubleClickStash={handlers.onDoubleClickStash}
              onSelectRepo={handlers.onSelectRepo}
              onDoubleClickRepo={handlers.onDoubleClickRepo}
              onSelectUncommitted={handlers.onSelectUncommitted}
              onDoubleClickUncommitted={handlers.onDoubleClickUncommitted}
              onCreateBranch={handlers.onCreateBranch}
              onCreateWorktree={handlers.onCreateWorktree}
              formatRelativeTime={handlers.formatRelativeTime}
            />
          )

        case 'repo-list':
          return (
            <RepoList
              column={column}
              repoPath={data.repoPath}
              selectedRepo={selection.selectedRepo}
              onSelect={handlers.onSelectRepo}
              onDoubleClick={handlers.onDoubleClickRepo}
            />
          )

        default:
          return (
            <div className="empty-column">
              <span>Unknown panel: {column.panel}</span>
            </div>
          )
      }
    },
    [data, selection, handlers, uiState]
  )

  // Git graph column widths state
  // Default widths: graph = 68px (3 branches), refs = null (auto), message = null (flex), meta = null (auto)
  type GitGraphColumn = 'graph' | 'refs' | 'message' | 'meta'
  const DEFAULT_COLUMN_WIDTHS = {
    graph: 68,      // 3 lanes * 16px + 20px padding
    refs: null,     // auto-size based on content
    message: null,  // flex to fill available space
    meta: null,     // auto-size based on content
  }
  const [columnWidths, setColumnWidths] = useState<Record<GitGraphColumn, number | null>>(DEFAULT_COLUMN_WIDTHS)
  const [resizingColumn, setResizingColumn] = useState<GitGraphColumn | null>(null)
  const resizeStartRef = useRef<{ startX: number; startWidth: number; column: GitGraphColumn } | null>(null)

  // Handle column resize
  useEffect(() => {
    if (!resizingColumn) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return
      const delta = e.clientX - resizeStartRef.current.startX
      const minWidths: Record<GitGraphColumn, number> = {
        graph: 36,
        refs: 60,
        message: 100,
        meta: 80,
      }
      const newWidth = Math.max(minWidths[resizeStartRef.current.column], resizeStartRef.current.startWidth + delta)
      setColumnWidths(prev => ({ ...prev, [resizeStartRef.current!.column]: newWidth }))
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
      resizeStartRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingColumn])

  const handleStartColumnResize = useCallback((column: GitGraphColumn, startX: number, currentWidth: number) => {
    resizeStartRef.current = { startX, startWidth: currentWidth, column }
    setResizingColumn(column)
  }, [])

  const handleResetColumnWidth = useCallback((column: GitGraphColumn) => {
    setColumnWidths(prev => ({ ...prev, [column]: DEFAULT_COLUMN_WIDTHS[column] }))
  }, [])

  // Render a viz panel based on column config
  const renderVizSlot = useCallback(
    (column: Column): ReactNode => {
      // Shared viz header with chart selector
      const VizHeader = ({ 
        panel, 
        label, 
        icon 
      }: { 
        panel: string
        label: string
        icon: string 
      }) => {
        const [controlsOpen, setControlsOpen] = useState(false)
        
        const chartOptions = [
          { id: 'git-graph', label: 'Git Graph', icon: '◉' },
          { id: 'timeline', label: 'Timeline', icon: '◔' },
          { id: 'tech-tree', label: 'Tech Tree', icon: '⬡' },
          { id: 'erd-canvas', label: 'ERD', icon: '◫' },
        ]
        
        return (
          <>
            <div 
              className={`column-header clickable-header ${controlsOpen ? 'open' : ''}`}
              onClick={() => setControlsOpen(!controlsOpen)}
            >
              <div className="column-title">
                <h2>
                  <span className="column-icon">{icon}</span>
                  {label}
                </h2>
                <span className={`header-chevron ${controlsOpen ? 'open' : ''}`}>▾</span>
              </div>
            </div>
            {controlsOpen && (
              <div className="column-controls" onClick={(e) => e.stopPropagation()}>
                <div className="control-row">
                  <label>Chart</label>
                  <select
                    value={panel}
                    onChange={(e) => {
                      // Update column panel through canvas context
                      if (activeCanvas) {
                        setColumnPanel(activeCanvas.id, column.id, e.target.value as import('../../types/app-types').PanelType)
                      }
                      setControlsOpen(false)
                    }}
                    className="control-select"
                  >
                    {chartOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.icon} {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </>
        )
      }
      
      switch (column.panel) {
        case 'git-graph':
          return (
            <div className="viz-panel git-graph-panel">
              <VizHeader 
                panel={column.panel}
                label={column.label || 'History'} 
                icon={column.icon || '◉'} 
              />
              <div className="viz-panel-content">
                <GitGraph
                  commits={data.commits}
                  selectedCommit={selection.selectedCommit}
                  onSelectCommit={handlers.onSelectCommit}
                  onDoubleClickCommit={handlers.onDoubleClickCommit}
                  formatRelativeTime={handlers.formatRelativeTime}
                  columnWidths={columnWidths}
                  onStartColumnResize={handleStartColumnResize}
                  onResetColumnWidth={handleResetColumnWidth}
                  resizingColumn={resizingColumn}
                />
              </div>
            </div>
          )

        case 'timeline':
          return (
            <div className="viz-panel timeline-panel">
              <VizHeader 
                panel={column.panel}
                label={column.label || 'Timeline'} 
                icon={column.icon || '◔'} 
              />
              <div className="viz-panel-content">
                <ContributorChart
                  topN={10}
                  bucketSize="week"
                  height={500}
                  invertedTheme={true}
                  onManageUsers={handlers.onOpenMailmap}
                />
              </div>
            </div>
          )

        case 'tech-tree':
          return (
            <div className="viz-panel tech-tree-panel">
              <VizHeader
                panel={column.panel}
                label={column.label || 'Tech Tree'}
                icon={column.icon || '⬡'}
              />
              <div className="viz-panel-content">
                <TechTreeChart
                  limit={25}
                  formatRelativeTime={handlers.formatRelativeTime}
                  onSelectNode={(node: TechTreeNode) => {
                    handlers.onSelectTechTreeNode?.(node.branchName)
                  }}
                />
              </div>
            </div>
          )

        case 'erd-canvas':
          return (
            <div className="viz-panel erd-canvas-panel">
              <VizHeader
                panel={column.panel}
                label={column.label || 'ERD'}
                icon={column.icon || '◫'}
              />
              <div className="viz-panel-content erd-canvas-content">
                <ERDCanvasPanel repoPath={data.repoPath} />
              </div>
            </div>
          )

        default:
          return (
            <div className="empty-column">
              <span>Unknown viz panel: {column.panel}</span>
            </div>
          )
      }
    },
    [
      data.commits,
      data.repoPath,
      selection.selectedCommit,
      handlers,
      activeCanvas,
      setColumnPanel,
      columnWidths,
      handleStartColumnResize,
      handleResetColumnWidth,
      resizingColumn,
    ]
  )

  // Render an editor panel based on column config
  const renderEditorSlot = useCallback(
    (column: Column): ReactNode => {
      // Use EditorSlot which handles back/forward navigation
      return (
        <div className="editor-panel">
          <EditorSlot
            column={column}
            renderPanel={(_panel, _panelData) => {
              // Try to render editor content from parent
              const content = handlers.renderEditorContent?.()
              if (content) {
                return content
              }
              
              // Empty state
              return (
                <div className="editor-slot-empty">
                  <div className="editor-slot-empty-icon">◇</div>
                  <p>Select an item to view details</p>
                  <p className="editor-slot-empty-hint">
                    Click on a PR, branch, or worktree
                  </p>
                </div>
              )
            }}
          />
        </div>
      )
    },
    [handlers.renderEditorContent]
  )

  // Handle column resize
  const handleResizeColumn = useCallback(
    (columnId: string, width: number) => {
      if (activeCanvas) {
        resizeColumn(activeCanvas.id, columnId, width)
      }
    },
    [activeCanvas, resizeColumn]
  )

  // Handle column reorder
  const handleReorderColumns = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (activeCanvas) {
        reorderColumns(activeCanvas.id, fromIndex, toIndex)
      }
    },
    [activeCanvas, reorderColumns]
  )

  // Don't render if no active canvas
  if (!activeCanvas) {
    return (
      <div className="canvas-empty">
        <p>No canvas selected</p>
      </div>
    )
  }

  return (
    <Canvas
      canvas={activeCanvas}
      renderListSlot={renderListSlot}
      renderVizSlot={renderVizSlot}
      renderEditorSlot={renderEditorSlot}
      onResizeColumn={handleResizeColumn}
      onReorderColumns={handleReorderColumns}
    />
  )
}

