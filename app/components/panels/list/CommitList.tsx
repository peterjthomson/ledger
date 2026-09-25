/**
 * CommitList - Commit history list panel
 * 
 * Self-contained list panel for displaying git commits with:
 * - Uncommitted changes at top (when present)
 * - Commit items with message, hash, author, date, diff stats
 * - Filter controls (checkpoints, branch heads, unmerged)
 * - Selection and action handlers
 */

import { useMemo } from 'react'
import type { GraphCommit, WorkingStatus } from '../../../types/electron'
import type { Column } from '../../../types/app-types'
import { useListControl } from '../../../stores/list-controls-store'
import { ListPanelHeader } from './ListPanelHeader'

export type CommitFilter = 'all' | 'branch-heads' | 'unmerged'
export type CommitSort = 'date' | 'author' | 'message'

export interface CommitListProps {
  /** Column configuration */
  column?: Column
  /** List of commits */
  commits: GraphCommit[]
  /** Current branch name (shown in header) */
  currentBranch?: string | null
  /** Working status for uncommitted changes */
  workingStatus?: WorkingStatus | null
  /** Currently selected commit */
  selectedCommit?: GraphCommit | null
  /** Whether uncommitted is selected */
  uncommittedSelected?: boolean
  /** Format relative time */
  formatRelativeTime: (date: string) => string
  /** Called when commit is clicked */
  onSelectCommit?: (commit: GraphCommit) => void
  /** Called when commit is double-clicked */
  onDoubleClickCommit?: (commit: GraphCommit) => void
  /** Called for commit context menu */
  onContextMenuCommit?: (e: React.MouseEvent, commit: GraphCommit) => void
  /** Called when uncommitted is clicked */
  onSelectUncommitted?: () => void
  /** Called when uncommitted is double-clicked */
  onDoubleClickUncommitted?: () => void
  /** Called for uncommitted context menu */
  onContextMenuUncommitted?: (e: React.MouseEvent, status: WorkingStatus) => void
  /** Whether switching/checkout is in progress */
  switching?: boolean
}

export function CommitList({
  column,
  commits,
  currentBranch,
  workingStatus,
  selectedCommit,
  uncommittedSelected,
  formatRelativeTime,
  onSelectCommit,
  onDoubleClickCommit,
  onContextMenuCommit,
  onSelectUncommitted,
  onDoubleClickUncommitted,
  onContextMenuUncommitted,
  switching,
}: CommitListProps) {
  // Filter/sort state kept across panel switches
  const [controlsOpen, setControlsOpen] = useListControl('commits:open', false)
  const [search, setSearch] = useListControl('commits:search', '')
  const [filter, setFilter] = useListControl<CommitFilter>('commits:filter', 'all')
  const [sort, setSort] = useListControl<CommitSort>('commits:sort', 'date')

  // Sort commits
  const sortCommits = (commitList: GraphCommit[]): GraphCommit[] => {
    if (sort === 'date') {
      // Default order is already chronological (newest first from git)
      return commitList
    }
    const sorted = [...commitList]
    switch (sort) {
      case 'author':
        return sorted.sort((a, b) => a.author.localeCompare(b.author))
      case 'message':
        return sorted.sort((a, b) => a.message.localeCompare(b.message))
      default:
        return sorted
    }
  }

  // Filter and sort commits
  const filteredCommits = useMemo(() => {
    let filtered = [...commits]

    // Apply filter
    switch (filter) {
      case 'branch-heads':
        // Show only commits that have refs (are branch heads)
        filtered = filtered.filter((commit) => commit.refs.length > 0)
        break
      case 'unmerged':
        // Show only commits from unmerged branches (not on main/master)
        filtered = filtered.filter((commit) => {
          const refs = commit.refs.join(' ').toLowerCase()
          return !refs.includes('main') && !refs.includes('master')
        })
        break
      case 'all':
      default:
        break
    }

    // Apply search
    if (search.trim()) {
      const searchLower = search.toLowerCase().trim()
      filtered = filtered.filter(
        (commit) =>
          commit.message.toLowerCase().includes(searchLower) ||
          commit.author.toLowerCase().includes(searchLower) ||
          commit.shortHash.toLowerCase().includes(searchLower)
      )
    }

    return sortCommits(filtered)
  }, [commits, search, filter, sort])

  const label = column?.label || 'Commits'
  const icon = column?.icon || '◉'
  const totalCount = filteredCommits.length + (workingStatus?.hasChanges ? 1 : 0)
  const emptyMessage = search.trim() || filter !== 'all'
    ? 'No commits match filter'
    : 'No commits'

  // Build active filter label
  const activeFilterParts: string[] = []
  if (search.trim()) activeFilterParts.push(`"${search.trim()}"`)
  if (filter !== 'all') activeFilterParts.push(filter === 'branch-heads' ? 'Branch Heads' : 'Unmerged')
  const activeFilter = activeFilterParts.length > 0 ? activeFilterParts.join(' · ') : undefined

  return (
    <div className="list-panel commits-list-panel">
      <ListPanelHeader
        label={label}
        icon={icon}
        count={totalCount}
        controlsOpen={controlsOpen}
        onToggleControls={() => setControlsOpen(!controlsOpen)}
        badge={currentBranch ? <code className="commit-hash branch-badge">{currentBranch}</code> : undefined}
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
              placeholder="Message, author, hash..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="control-row">
            <label>Filter</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as CommitFilter)}
              className="control-select"
            >
              <option value="all">All Commits</option>
              <option value="branch-heads">Branch Heads</option>
              <option value="unmerged">Unmerged Only</option>
            </select>
          </div>
          <div className="control-row">
            <label>Sort</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as CommitSort)}
              className="control-select"
            >
              <option value="date">Date</option>
              <option value="author">Author</option>
              <option value="message">Message</option>
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="column-content">
        {/* Uncommitted changes at top */}
        {workingStatus?.hasChanges && (
          <div
            className={`item commit-item uncommitted clickable ${uncommittedSelected ? 'selected' : ''}`}
            onClick={() => onSelectUncommitted?.()}
            onDoubleClick={() => onDoubleClickUncommitted?.()}
            onContextMenu={(e) => onContextMenuUncommitted?.(e, workingStatus)}
          >
            <div className="commit-message uncommitted-label">Uncommitted changes</div>
            <div className="commit-meta">
              <code className="commit-hash">working</code>
              <span className="commit-files-count">
                {workingStatus.stagedCount + workingStatus.unstagedCount}{' '}
                {workingStatus.stagedCount + workingStatus.unstagedCount === 1 ? 'file' : 'files'}
              </span>
              {(workingStatus.additions > 0 || workingStatus.deletions > 0) && (
                <span className="commit-diff">
                  {workingStatus.additions > 0 && (
                    <span className="diff-additions">+{workingStatus.additions}</span>
                  )}
                  {workingStatus.deletions > 0 && (
                    <span className="diff-deletions">-{workingStatus.deletions}</span>
                  )}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Commits list */}
        {filteredCommits.length === 0 && !workingStatus?.hasChanges ? (
          <div className="empty-column">{emptyMessage}</div>
        ) : (
          filteredCommits.map((commit) => (
            <div
              key={commit.hash}
              className={`item commit-item clickable ${commit.isMerge ? 'merge' : ''} ${switching ? 'disabled' : ''} ${selectedCommit?.hash === commit.hash ? 'selected' : ''}`}
              onClick={() => onSelectCommit?.(commit)}
              onDoubleClick={() => onDoubleClickCommit?.(commit)}
              onContextMenu={(e) => onContextMenuCommit?.(e, commit)}
            >
              <div className="commit-message" title={commit.message}>
                {commit.message}
              </div>
              <div className="commit-meta">
                <code className="commit-hash">{commit.shortHash}</code>
                <span className="commit-author">{commit.author}</span>
                <span className="commit-date">{formatRelativeTime(commit.date)}</span>
                {(commit.additions !== undefined || commit.deletions !== undefined) && (
                  <span className="commit-diff">
                    {commit.additions !== undefined && commit.additions > 0 && (
                      <span className="diff-additions">+{commit.additions}</span>
                    )}
                    {commit.deletions !== undefined && commit.deletions > 0 && (
                      <span className="diff-deletions">-{commit.deletions}</span>
                    )}
                  </span>
                )}
                {commit.filesChanged !== undefined && commit.filesChanged > 0 && (
                  <span className="commit-files-count">
                    {commit.filesChanged} {commit.filesChanged === 1 ? 'file' : 'files'}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

