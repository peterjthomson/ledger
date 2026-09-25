/**
 * WorktreeList - Worktree list panel
 * 
 * Self-contained list panel for displaying worktrees with:
 * - Search and parent filter controls
 * - Worktree items with branch, path, stats
 * - Working folder pseudo-entry support
 * - Selection and action handlers
 */

import { useMemo } from 'react'
import type { Worktree, WorktreeSort } from '../../../types/electron'
import type { Column } from '../../../types/app-types'
import { useListControl } from '../../../stores/list-controls-store'
import { ListPanelHeader } from './ListPanelHeader'
import {
  getWorktreeParents,
  matchesWorktreeParent,
  matchesWorktreeSearch,
  sortWorktrees,
  WORKTREE_SORT_OPTIONS,
} from './list-filters'

export interface WorktreeListProps {
  /** Column configuration */
  column?: Column
  /** List of worktrees */
  worktrees: Worktree[]
  /** Current branch name (to highlight matching worktree) */
  currentBranch?: string | null
  /** Path to main repo (for filtering) */
  repoPath?: string | null
  /** Currently selected worktree */
  selectedWorktree?: Worktree | null
  /** Called when worktree is clicked */
  onSelect?: (worktree: Worktree) => void
  /** Called when worktree is double-clicked */
  onDoubleClick?: (worktree: Worktree) => void
  /** Called for context menu */
  onContextMenu?: (e: React.MouseEvent, worktree: Worktree) => void
  /** Called to create new worktree */
  onCreateWorktree?: () => void
}

export function WorktreeList({
  column,
  worktrees,
  currentBranch,
  repoPath,
  selectedWorktree,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onCreateWorktree,
}: WorktreeListProps) {
  // Filter/sort state shared with the sidebar section and kept across panel switches
  const [controlsOpen, setControlsOpen] = useListControl('worktrees:open', false)
  const [search, setSearch] = useListControl('worktrees:search', '')
  const [storedParentFilter, setParentFilter] = useListControl<string>('worktrees:filter', 'all')
  const [sort, setSort] = useListControl<WorktreeSort>('worktrees:sort', 'last-modified')

  // Get available parent filters
  const parentFilters = useMemo(() => getWorktreeParents(worktrees, repoPath ?? null), [worktrees, repoPath])
  // A remembered parent folder may not exist in this repo; fall back to all
  const parentFilter = storedParentFilter === 'all' || parentFilters.includes(storedParentFilter) ? storedParentFilter : 'all'

  // Create working folder pseudo-worktree
  const workingFolderWorktree: Worktree | null = useMemo(() => {
    if (!repoPath) return null
    const repoName = repoPath.split('/').pop() || 'Repository'
    const mainWorktree = worktrees.find((wt) => wt.path === repoPath)
    
    return {
      path: repoPath,
      branch: mainWorktree?.branch || null,
      head: mainWorktree?.head || '',
      bare: false,
      agentIndex: 0,
      contextHint: '',
      lastModified: mainWorktree?.lastModified || '',
      activityStatus: mainWorktree?.activityStatus || 'unknown',
      lastFileModified: mainWorktree?.lastFileModified || '',
      lastGitActivity: mainWorktree?.lastGitActivity || '',
      activitySource: mainWorktree?.activitySource || 'git',
      agentTaskHint: mainWorktree?.agentTaskHint ?? null,
      displayName: repoName,
      agent: 'working-folder',
      additions: mainWorktree?.additions || 0,
      deletions: mainWorktree?.deletions || 0,
      changedFileCount: mainWorktree?.changedFileCount || 0,
    }
  }, [repoPath, worktrees])

  // Filter and sort worktrees
  const filteredWorktrees = useMemo(() => {
    // Filter out the main repo worktree (shown as working folder)
    let filtered = worktrees.filter((wt) => wt.path !== repoPath)

    // Apply parent filter and search, then sort
    filtered = sortWorktrees(
      filtered.filter(
        (wt) =>
          matchesWorktreeParent(wt, parentFilter, repoPath ?? null) && matchesWorktreeSearch(wt, search)
      ),
      sort
    )

    // Prepend working folder if it matches filters (always at top)
    if (workingFolderWorktree) {
      const matchesParent = parentFilter === 'all' || parentFilter === 'main'
      if (matchesParent && matchesWorktreeSearch(workingFolderWorktree, search)) {
        filtered = [workingFolderWorktree, ...filtered]
      }
    }

    return filtered
  }, [worktrees, repoPath, parentFilter, search, workingFolderWorktree, sort])

  const label = column?.label || 'Worktrees'
  const icon = column?.icon || '⧉'
  const emptyMessage = search.trim() || parentFilter !== 'all' 
    ? 'No worktrees match filter' 
    : 'No worktrees found'

  // Build active filter label
  const activeFilterParts: string[] = []
  if (search.trim()) activeFilterParts.push(`"${search.trim()}"`)
  if (parentFilter !== 'all') activeFilterParts.push(parentFilter)
  const activeFilter = activeFilterParts.length > 0 ? activeFilterParts.join(' · ') : undefined

  return (
    <div className="list-panel worktree-list-panel">
      <ListPanelHeader
        label={label}
        icon={icon}
        count={filteredWorktrees.length}
        controlsOpen={controlsOpen}
        onToggleControls={() => setControlsOpen(!controlsOpen)}
        activeFilter={activeFilter}
      />

      {/* Controls */}
      {controlsOpen && (
        <div className="column-controls" onClick={(e) => e.stopPropagation()}>
          <div className="control-row">
            <label>Search</label>
            <input
              type="text"
              className="control-search"
              placeholder="Name or branch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="control-row">
            <label>Filter</label>
            <select
              value={parentFilter}
              onChange={(e) => setParentFilter(e.target.value)}
              className="control-select"
            >
              <option value="all">All</option>
              {parentFilters.map((parent) => (
                <option key={parent} value={parent}>
                  {parent}
                </option>
              ))}
            </select>
          </div>
          <div className="control-row">
            <label>Sort</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as WorktreeSort)}
              className="control-select"
            >
              {WORKTREE_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {onCreateWorktree && (
            <div className="control-row">
              <button className="control-button" onClick={onCreateWorktree}>
                + New Worktree
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="column-content">
        {filteredWorktrees.length === 0 ? (
          <div className="empty-column">{emptyMessage}</div>
        ) : (
          <ul className="item-list">
            {filteredWorktrees.map((wt) => {
              const isWorkingFolder = wt.agent === 'working-folder'
              const isCurrent = !isWorkingFolder && wt.branch === currentBranch
              
              return (
                <li
                  key={wt.path}
                  className={`item worktree-item clickable ${isCurrent ? 'current' : ''} ${isWorkingFolder ? 'working-folder' : ''} ${selectedWorktree?.path === wt.path ? 'selected' : ''}`}
                  onClick={() => onSelect?.(wt)}
                  onDoubleClick={() => !isWorkingFolder && onDoubleClick?.(wt)}
                  onContextMenu={(e) => onContextMenu?.(e, wt)}
                >
                  <div className="item-main">
                    <span className="item-name">
                      {isWorkingFolder 
                        ? `Working Folder: ${wt.branch || 'detached'}` 
                        : (wt.branch || wt.displayName)}
                    </span>
                    {isCurrent && <span className="current-indicator">●</span>}
                  </div>
                  {!isWorkingFolder && wt.branch && (
                    <div className="item-agent-hint">{wt.displayName}</div>
                  )}
                  <div className="item-path" title={wt.path}>
                    {wt.path.replace(/^\/Users\/[^/]+/, '~')}
                  </div>
                  <div className="item-meta worktree-stats">
                    <code className="commit-hash">{wt.path.split('/').pop()}</code>
                    {(wt.additions > 0 || wt.deletions > 0) && (
                      <>
                        {wt.additions > 0 && <span className="diff-additions">+{wt.additions}</span>}
                        {wt.deletions > 0 && <span className="diff-deletions">-{wt.deletions}</span>}
                        <span className="diff-separator">·</span>
                      </>
                    )}
                    {wt.changedFileCount > 0 && (
                      <span className="file-count">
                        {wt.changedFileCount} {wt.changedFileCount === 1 ? 'file' : 'files'}
                      </span>
                    )}
                    {wt.changedFileCount === 0 && <span className="clean-indicator">clean</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

