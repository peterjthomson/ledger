/**
 * IssueList - GitHub Issue list panel
 *
 * Self-contained list panel for displaying issues with:
 * - Search, filter, and sort controls
 * - Issue items with title, labels, metadata
 * - Priority detection and display
 * - Selection and action handlers
 */

import { useState, useMemo } from 'react'
import type { Issue, IssueLabel, IssueFilter, IssueSort } from '../../../types/electron'
import type { Column } from '../../../types/app-types'
import { ListPanelHeader } from './ListPanelHeader'

export interface IssueListProps {
  /** Column configuration */
  column?: Column
  /** List of issues */
  issues: Issue[]
  /** Currently selected issue */
  selectedIssue?: Issue | null
  /** Error message (e.g., gh CLI not available) */
  error?: string | null
  /** Loading state */
  loading?: boolean
  /** Format relative time */
  formatRelativeTime: (date: string) => string
  /** Called when issue is clicked */
  onSelect?: (issue: Issue) => void
  /** Called when issue is double-clicked */
  onDoubleClick?: (issue: Issue) => void
  /** Called for context menu */
  onContextMenu?: (e: React.MouseEvent, issue: Issue) => void
  /** Called when checkbox is clicked to close/reopen */
  onToggleState?: (issue: Issue) => void
}

/**
 * Detect priority from labels
 */
function detectPriority(labels: IssueLabel[]): {
  level: 'critical' | 'high' | 'medium' | 'low' | null
  label: string | null
} {
  for (const label of labels) {
    const name = label.name.toLowerCase()

    // P-levels (P1, P2, P3, P4)
    if (/^p[1-4]$/i.test(label.name)) {
      const level = label.name.toUpperCase()
      return {
        level: level === 'P1' ? 'critical' : level === 'P2' ? 'high' : level === 'P3' ? 'medium' : 'low',
        label: label.name,
      }
    }

    // Agile/common priority labels
    if (name.includes('critical') || name.includes('urgent')) {
      return { level: 'critical', label: label.name }
    }
    if (name === 'high' || name.includes('priority:high') || name.includes('priority-high') || name === 'high-priority') {
      return { level: 'high', label: label.name }
    }
    if (name === 'medium' || name.includes('priority:medium') || name.includes('priority-medium')) {
      return { level: 'medium', label: label.name }
    }
    if (name === 'low' || name.includes('priority:low') || name.includes('priority-low') || name === 'low-priority') {
      return { level: 'low', label: label.name }
    }
  }

  return { level: null, label: null }
}

/**
 * Get priority badge color
 */
function getPriorityColor(level: string | null): string {
  switch (level) {
    case 'critical':
      return '#e11d48' // red
    case 'high':
      return '#f97316' // orange
    case 'medium':
      return '#eab308' // yellow
    case 'low':
      return '#6b7280' // gray
    default:
      return ''
  }
}

/**
 * Label badge component
 */
function LabelBadge({ label }: { label: IssueLabel }) {
  const bgColor = `#${label.color}20` // 20% opacity
  const textColor = `#${label.color}`

  return (
    <span
      className="issue-label-badge"
      style={{
        backgroundColor: bgColor,
        color: textColor,
        borderColor: `#${label.color}40`,
      }}
      title={label.description || label.name}
    >
      {label.name}
    </span>
  )
}

export function IssueList({
  column,
  issues,
  selectedIssue,
  error,
  loading,
  formatRelativeTime,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onToggleState,
}: IssueListProps) {
  // Local filter/sort state
  const [controlsOpen, setControlsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<IssueFilter>('open')
  const [sort, setSort] = useState<IssueSort>('updated')

  // Filter and sort issues
  const filteredIssues = useMemo(() => {
    let filtered = [...issues]

    // Apply state filter
    switch (filter) {
      case 'open':
        filtered = filtered.filter((issue) => issue.state === 'OPEN')
        break
      case 'closed':
        filtered = filtered.filter((issue) => issue.state === 'CLOSED')
        break
      case 'all':
      default:
        break
    }

    // Apply search
    if (search.trim()) {
      const searchLower = search.toLowerCase().trim()
      filtered = filtered.filter(
        (issue) =>
          issue.title.toLowerCase().includes(searchLower) ||
          issue.author.toLowerCase().includes(searchLower) ||
          issue.labels.some((l) => l.name.toLowerCase().includes(searchLower)) ||
          `#${issue.number}`.includes(searchLower)
      )
    }

    // Apply sort
    switch (sort) {
      case 'comments':
        filtered.sort((a, b) => b.comments - a.comments)
        break
      case 'created':
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
      case 'created-asc':
        filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        break
      case 'updated':
      default:
        filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        break
    }

    // Sort pinned to top
    filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      return 0
    })

    return filtered
  }, [issues, filter, sort, search])

  const label = column?.label || 'Issues'
  const icon = column?.icon || '🎫'

  // Build active filter label
  const activeFilterParts: string[] = []
  if (search.trim()) activeFilterParts.push(`"${search.trim()}"`)
  if (filter === 'closed') activeFilterParts.push('Closed')
  if (filter === 'all') activeFilterParts.push('All')
  const activeFilter = activeFilterParts.length > 0 ? activeFilterParts.join(' · ') : undefined

  return (
    <div className="list-panel issue-list-panel">
      <ListPanelHeader
        label={label}
        icon={icon}
        count={filteredIssues.length}
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
              placeholder="Title, label, author..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="control-row">
            <label>State</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as IssueFilter)}
              className="control-select"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="control-row">
            <label>Sort</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as IssueSort)}
              className="control-select"
            >
              <option value="updated">Recently Updated</option>
              <option value="created">Newest</option>
              <option value="created-asc">Oldest</option>
              <option value="comments">Most Comments</option>
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="column-content">
        {loading ? (
          <div className="empty-column">Loading issues...</div>
        ) : error ? (
          <div className="empty-column issue-error">
            <span className="issue-error-icon">⚠</span>
            {error}
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="empty-column">
            {search.trim() || filter !== 'open' ? 'No issues match filter' : 'No open issues'}
          </div>
        ) : (
          <ul className="item-list">
            {filteredIssues.map((issue) => {
              const priority = detectPriority(issue.labels)
              const isSelected = selectedIssue?.number === issue.number
              const isClosed = issue.state === 'CLOSED'

              return (
                <li
                  key={issue.number}
                  className={`item issue-item clickable ${isClosed ? 'closed' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelect?.(issue)}
                  onDoubleClick={() => onDoubleClick?.(issue)}
                  onContextMenu={(e) => onContextMenu?.(e, issue)}
                >
                  <div className="issue-item-row">
                    {/* Checkbox for quick close/reopen */}
                    <button
                      className={`issue-checkbox ${isClosed ? 'checked' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleState?.(issue)
                      }}
                      title={isClosed ? 'Reopen issue' : 'Close issue'}
                    >
                      {isClosed ? (
                        issue.stateReason === 'not_planned' ? '⊘' : '✓'
                      ) : (
                        '○'
                      )}
                    </button>

                    <div className="issue-item-content">
                      <div className="item-main">
                        {issue.isPinned && <span className="issue-pinned" title="Pinned">📌</span>}
                        <span className="item-name" title={issue.title}>
                          {issue.title}
                        </span>
                        {priority.level && (
                          <span
                            className="issue-priority-badge"
                            style={{ backgroundColor: getPriorityColor(priority.level) }}
                            title={`Priority: ${priority.label}`}
                          >
                            {priority.label}
                          </span>
                        )}
                      </div>

                      {/* Labels */}
                      {issue.labels.length > 0 && (
                        <div className="issue-labels">
                          {issue.labels
                            .filter((l) => l.name !== priority.label) // Don't show priority label twice
                            .slice(0, 4) // Limit to 4 labels
                            .map((label) => (
                              <LabelBadge key={label.name} label={label} />
                            ))}
                          {issue.labels.length > 4 && (
                            <span className="issue-labels-more">+{issue.labels.length - 4}</span>
                          )}
                        </div>
                      )}

                      <div className="item-meta">
                        <code className="commit-hash">#{issue.number}</code>
                        <span className="issue-author">@{issue.author}</span>
                        <span className="issue-time">{formatRelativeTime(issue.updatedAt)}</span>
                        {issue.comments > 0 && (
                          <span className="issue-comments">💬 {issue.comments}</span>
                        )}
                        {issue.assignees.length > 0 && (
                          <span className="issue-assignees" title={issue.assignees.join(', ')}>
                            👤 {issue.assignees.length > 1 ? `${issue.assignees.length}` : issue.assignees[0]}
                          </span>
                        )}
                        {issue.milestone && (
                          <span className="issue-milestone" title={`Milestone: ${issue.milestone}`}>
                            🎯 {issue.milestone}
                          </span>
                        )}
                      </div>
                    </div>
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
