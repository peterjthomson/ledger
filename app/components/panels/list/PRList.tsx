/**
 * PRList - Pull Request list panel
 * 
 * Self-contained list panel for displaying pull requests with:
 * - Search, filter, and sort controls
 * - PR items with title, branch info, metadata
 * - Selection and action handlers
 */

import { useState, useMemo } from 'react'
import type { PullRequest, PRFilter, PRSort } from '../../../types/electron'
import type { Column } from '../../../types/app-types'
import { ListPanelHeader } from './ListPanelHeader'
import { applyPRControls, PR_FILTER_OPTIONS, PR_SORT_OPTIONS } from './list-filters'

export interface PRListProps {
  /** Column configuration */
  column?: Column
  /** List of pull requests */
  prs: PullRequest[]
  /** Currently selected PR */
  selectedPR?: PullRequest | null
  /** Error message (e.g., gh CLI not available) */
  error?: string | null
  /** Loading state */
  loading?: boolean
  /** Format relative time */
  formatRelativeTime: (date: string) => string
  /** Called when PR is clicked */
  onSelect?: (pr: PullRequest) => void
  /** Called when PR is double-clicked */
  onDoubleClick?: (pr: PullRequest) => void
  /** Called for context menu */
  onContextMenu?: (e: React.MouseEvent, pr: PullRequest) => void
}

/**
 * Get review decision badge
 */
function getReviewBadge(decision: string | null) {
  switch (decision) {
    case 'APPROVED':
      return <span className="badge badge-approved">Approved</span>
    case 'CHANGES_REQUESTED':
      return <span className="badge badge-changes">Changes</span>
    case 'REVIEW_REQUIRED':
      return <span className="badge badge-review">Review</span>
    default:
      return null
  }
}

export function PRList({
  column,
  prs,
  selectedPR,
  error,
  loading,
  formatRelativeTime,
  onSelect,
  onDoubleClick,
  onContextMenu,
}: PRListProps) {
  // Local filter/sort state
  const [controlsOpen, setControlsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PRFilter>('open-not-draft')
  const [sort, setSort] = useState<PRSort>('updated')

  // Filter and sort PRs
  const filteredPRs = useMemo(
    () => applyPRControls(prs, { search, filter, sort }),
    [prs, filter, sort, search]
  )

  const label = column?.label || 'Pull Requests'
  const icon = column?.icon || '⬡'

  // Build active filter label
  const activeFilterParts: string[] = []
  if (search.trim()) activeFilterParts.push(`"${search.trim()}"`)
  if (filter === 'open-draft') activeFilterParts.push('Drafts')
  // Note: 'open-not-draft' is the default, so we don't show it
  const activeFilter = activeFilterParts.length > 0 ? activeFilterParts.join(' · ') : undefined

  return (
    <div className="list-panel pr-list-panel">
      <ListPanelHeader
        label={label}
        icon={icon}
        count={filteredPRs.length}
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
              placeholder="Title, branch, author..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="control-row">
            <label>Filter</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as PRFilter)}
              className="control-select"
            >
              {PR_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="control-row">
            <label>Sort</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as PRSort)}
              className="control-select"
            >
              {PR_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="column-content">
        {loading ? (
          <div className="empty-column">Loading PRs...</div>
        ) : error ? (
          <div className="empty-column pr-error">
            <span className="pr-error-icon">⚠</span>
            {error}
          </div>
        ) : filteredPRs.length === 0 ? (
          <div className="empty-column">
            {search.trim() || filter !== 'all' ? 'No PRs match filter' : 'No open PRs'}
          </div>
        ) : (
          <ul className="item-list">
            {filteredPRs.map((pr) => (
              <li
                key={pr.number}
                className={`item pr-item clickable ${pr.isDraft ? 'draft' : ''} ${selectedPR?.number === pr.number ? 'selected' : ''}`}
                onClick={() => onSelect?.(pr)}
                onDoubleClick={() => onDoubleClick?.(pr)}
                onContextMenu={(e) => onContextMenu?.(e, pr)}
              >
                <div className="item-main">
                  <span className="item-name" title={pr.title}>
                    {pr.title}
                  </span>
                  <div className="item-badges">
                    {pr.isDraft && <span className="badge badge-draft">draft</span>}
                    {getReviewBadge(pr.reviewDecision)}
                  </div>
                </div>
                <div className="pr-branch">
                  <span className="pr-branch-name">{pr.branch}</span>
                  <span className="pr-arrow">→</span>
                  <span className="pr-base">{pr.baseBranch}</span>
                </div>
                <div className="item-meta">
                  <code className="commit-hash">#{pr.number}</code>
                  <span className="pr-author">@{pr.author}</span>
                  <span className="pr-time">{formatRelativeTime(pr.updatedAt)}</span>
                  {pr.comments > 0 && <span className="pr-comments">💬 {pr.comments}</span>}
                  <span className="pr-diff">
                    <span className="pr-additions">+{pr.additions}</span>
                    <span className="pr-deletions">-{pr.deletions}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}



