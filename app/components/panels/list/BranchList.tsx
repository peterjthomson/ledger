/**
 * BranchList - Branch list panel (local or remote)
 * 
 * Self-contained list panel for displaying branches with:
 * - Search, filter, and sort controls
 * - Branch items with name, badges, metadata
 * - Selection and action handlers
 */

import { useMemo } from 'react'
import type { Branch, BranchFilter, BranchSort } from '../../../types/electron'
import type { Column } from '../../../types/app-types'
import { useListControl } from '../../../stores/list-controls-store'
import { ListPanelHeader } from './ListPanelHeader'
import {
  applyBranchControls,
  remoteBranchDisplayName,
  remoteNameOf,
  BRANCH_FILTER_OPTIONS,
  BRANCH_SORT_OPTIONS,
} from './list-filters'

export interface BranchListProps {
  /** Column configuration */
  column?: Column
  /** List of branches */
  branches: Branch[]
  /** Show only remote branches */
  isRemote?: boolean
  /** Currently selected branch */
  selectedBranch?: Branch | null
  /** Whether checkout is in progress */
  switching?: boolean
  /** Format date for display */
  formatDate?: (date: string) => string
  /** Called when branch is clicked */
  onSelect?: (branch: Branch) => void
  /** Called when branch is double-clicked */
  onDoubleClick?: (branch: Branch) => void
  /** Called for context menu */
  onContextMenu?: (e: React.MouseEvent, branch: Branch) => void
  /** Called to create new branch (only for local) */
  onCreateBranch?: () => void
}

export function BranchList({
  column,
  branches,
  isRemote = false,
  selectedBranch,
  switching,
  formatDate,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onCreateBranch,
}: BranchListProps) {
  // Filter/sort state shared with the matching sidebar section and kept across panel switches
  const kind = isRemote ? 'remotes' : 'branches'
  const [controlsOpen, setControlsOpen] = useListControl(`${kind}:open`, false)
  const [search, setSearch] = useListControl(`${kind}:search`, '')
  const [filter, setFilter] = useListControl<BranchFilter>(`${kind}:filter`, 'all')
  const [sort, setSort] = useListControl<BranchSort>(`${kind}:sort`, 'name')

  // Filter and sort branches
  const filteredBranches = useMemo(
    () => applyBranchControls(branches, { search, filter, sort }),
    [branches, filter, sort, search]
  )

  // Only label rows with their remote when there is more than one remote to tell apart
  const showRemoteNames = useMemo(
    () => isRemote && new Set(branches.map((b) => remoteNameOf(b.name))).size > 1,
    [isRemote, branches]
  )

  const label = column?.label || (isRemote ? 'Remotes' : 'Branches')
  const icon = column?.icon || (isRemote ? '◈' : '⎇')
  const emptyMessage = search.trim() || filter !== 'all' 
    ? 'No branches match filter' 
    : isRemote ? 'No remote branches' : 'No local branches'

  // Build active filter label
  const activeFilterParts: string[] = []
  if (search.trim()) activeFilterParts.push(`"${search.trim()}"`)
  if (filter !== 'all') activeFilterParts.push(filter === 'local-only' ? 'Local Only' : 'Unmerged')
  const activeFilter = activeFilterParts.length > 0 ? activeFilterParts.join(' · ') : undefined

  return (
    <div className={`list-panel branch-list-panel ${isRemote ? 'remote' : 'local'}`}>
      <ListPanelHeader
        label={label}
        icon={icon}
        count={filteredBranches.length}
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
              placeholder="Branch name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="control-row">
            <label>Filter</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as BranchFilter)}
              className="control-select"
            >
              {BRANCH_FILTER_OPTIONS.map((opt) => (
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
              onChange={(e) => setSort(e.target.value as BranchSort)}
              className="control-select"
            >
              {BRANCH_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {!isRemote && onCreateBranch && (
            <div className="control-row">
              <button className="control-button" onClick={onCreateBranch}>
                + New Branch
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="column-content">
        {filteredBranches.length === 0 ? (
          <div className="empty-column">{emptyMessage}</div>
        ) : (
          <ul className="item-list">
            {filteredBranches.map((branch) => (
              <li
                key={branch.name}
                className={`item branch-item clickable ${branch.current ? 'current' : ''} ${switching ? 'disabled' : ''} ${selectedBranch?.name === branch.name ? 'selected' : ''}`}
                onClick={() => onSelect?.(branch)}
                onDoubleClick={() => onDoubleClick?.(branch)}
                onContextMenu={(e) => onContextMenu?.(e, branch)}
                title={isRemote ? branch.name : undefined}
              >
                <div className="item-main">
                  <span className="item-name">
                    {branch.current && <span className="arrow">→</span>}
                    {isRemote ? remoteBranchDisplayName(branch.name) : branch.name}
                  </span>
                  <div className="item-badges">
                    {isRemote && showRemoteNames && <span className="badge badge-remote">{remoteNameOf(branch.name)}</span>}
                    {branch.isLocalOnly && <span className="badge badge-local">local</span>}
                    {!branch.isMerged && <span className="badge badge-unmerged">unmerged</span>}
                    {branch.current && <span className="current-indicator">●</span>}
                  </div>
                </div>
                <div className="item-meta">
                  {!isRemote && <code className="commit-hash">{branch.commit?.slice(0, 7)}</code>}
                  {branch.lastCommitDate && formatDate && (
                    <span className="date-info">{formatDate(branch.lastCommitDate)}</span>
                  )}
                  {branch.commitCount !== undefined && (
                    <span className="commit-count">{branch.commitCount} commits</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
