/**
 * StashList - Stash list panel
 * 
 * Self-contained list panel for displaying git stashes with:
 * - Search control
 * - Stash items with message, index, branch, date
 * - Selection and action handlers
 */

import { useMemo } from 'react'
import type { StashEntry, StashFilter, StashSort } from '../../../types/electron'
import type { Column } from '../../../types/app-types'
import { useListControl } from '../../../stores/list-controls-store'
import { ListPanelHeader } from './ListPanelHeader'
import { applyStashControls, STASH_FILTER_OPTIONS, STASH_SORT_OPTIONS } from './list-filters'

export interface StashListProps {
  /** Column configuration */
  column?: Column
  /** List of stashes */
  stashes: StashEntry[]
  /** Currently selected stash */
  selectedStash?: StashEntry | null
  /** Format relative time */
  formatRelativeTime: (date: string) => string
  /** Called when stash is clicked */
  onSelect?: (stash: StashEntry) => void
  /** Called when stash is double-clicked */
  onDoubleClick?: (stash: StashEntry) => void
  /** Called for context menu */
  onContextMenu?: (e: React.MouseEvent, stash: StashEntry) => void
}

export function StashList({
  column,
  stashes,
  selectedStash,
  formatRelativeTime,
  onSelect,
  onDoubleClick,
  onContextMenu,
}: StashListProps) {
  // Filter/sort state shared with the sidebar section and kept across panel switches
  const [controlsOpen, setControlsOpen] = useListControl('stashes:open', false)
  const [search, setSearch] = useListControl('stashes:search', '')
  const [filter, setFilter] = useListControl<StashFilter>('stashes:filter', 'all')
  const [sort, setSort] = useListControl<StashSort>('stashes:sort', 'date')

  // Filter and sort stashes
  const filteredStashes = useMemo(
    () => applyStashControls(stashes, { search, filter, sort }),
    [stashes, search, filter, sort]
  )

  const label = column?.label || 'Stashes'
  const icon = column?.icon || '⊡'
  const emptyMessage = search.trim() || filter !== 'all'
    ? 'No stashes match filter'
    : 'No stashes'

  // Build active filter label
  const activeFilterParts: string[] = []
  if (search.trim()) activeFilterParts.push(`"${search.trim()}"`)
  if (filter !== 'all') activeFilterParts.push(filter === 'has-changes' ? 'Has Changes' : 'Redundant')
  const activeFilter = activeFilterParts.length > 0 ? activeFilterParts.join(' · ') : undefined

  return (
    <div className="list-panel stash-list-panel">
      <ListPanelHeader
        label={label}
        icon={icon}
        count={filteredStashes.length}
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
              placeholder="Message or branch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="control-row">
            <label>Filter</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as StashFilter)}
              className="control-select"
            >
              {STASH_FILTER_OPTIONS.map((opt) => (
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
              onChange={(e) => setSort(e.target.value as StashSort)}
              className="control-select"
            >
              {STASH_SORT_OPTIONS.map((opt) => (
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
        {filteredStashes.length === 0 ? (
          <div className="empty-column">{emptyMessage}</div>
        ) : (
          <ul className="item-list">
            {filteredStashes.map((stash) => (
              <li
                key={stash.index}
                className={`item stash-item clickable ${stash.redundant ? 'redundant' : ''} ${selectedStash?.index === stash.index ? 'selected' : ''}`}
                onClick={() => onSelect?.(stash)}
                onDoubleClick={() => onDoubleClick?.(stash)}
                onContextMenu={(e) => onContextMenu?.(e, stash)}
              >
                <div className="item-main">
                  <span className="item-name" title={stash.message}>
                    {stash.message}
                  </span>
                  <div className="item-badges">
                    {stash.redundant && (
                      <span className="badge badge-redundant" title="Changes already exist on branch">
                        redundant
                      </span>
                    )}
                  </div>
                </div>
                <div className="item-meta">
                  <code className="commit-hash">stash@{'{' + stash.index + '}'}</code>
                  {stash.branch && <span className="stash-branch">{stash.branch}</span>}
                  <span className="stash-time">{formatRelativeTime(stash.date)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
