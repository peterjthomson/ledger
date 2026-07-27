/**
 * BranchList - Branch list panel (local or remote)
 * 
 * Self-contained list panel for displaying branches with:
 * - Search, filter, and sort controls
 * - Branch items with name, badges, metadata
 * - Selection and action handlers
 */

import { useState, useMemo } from 'react'
import type { Branch, BranchFilter, BranchSort } from '../../../types/electron'
import type { Column } from '../../../types/app-types'
import { ListPanelHeader } from './ListPanelHeader'

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

/**
 * Filter branches by type
 */
function filterBranches(branchList: Branch[], filter: BranchFilter): Branch[] {
  switch (filter) {
    case 'local-only':
      return branchList.filter((b) => b.isLocalOnly)
    case 'unmerged':
      return branchList.filter((b) => {
        // Always include main/master branches
        const isMainBranch = b.name === 'main' || b.name === 'master'
        return !b.isMerged || isMainBranch
      })
    case 'all':
    default:
      return branchList
  }
}

/**
 * Sort branches. Missing values sort last; ties break on name so order is stable.
 */
function sortBranches(branchList: Branch[], sort: BranchSort): Branch[] {
  const byName = (a: Branch, b: Branch) => a.name.localeCompare(b.name)
  const sorted = [...branchList]

  switch (sort) {
    case 'last-commit':
      return sorted.sort((a, b) => {
        const aTime = a.lastCommitDate ? new Date(a.lastCommitDate).getTime() : Number.NaN
        const bTime = b.lastCommitDate ? new Date(b.lastCommitDate).getTime() : Number.NaN
        const aMissing = Number.isNaN(aTime)
        const bMissing = Number.isNaN(bTime)
        if (aMissing && bMissing) return byName(a, b)
        if (aMissing) return 1
        if (bMissing) return -1
        if (bTime !== aTime) return bTime - aTime
        return byName(a, b)
      })
    case 'first-commit':
      return sorted.sort((a, b) => {
        const aTime = a.firstCommitDate ? new Date(a.firstCommitDate).getTime() : Number.NaN
        const bTime = b.firstCommitDate ? new Date(b.firstCommitDate).getTime() : Number.NaN
        const aMissing = Number.isNaN(aTime)
        const bMissing = Number.isNaN(bTime)
        if (aMissing && bMissing) return byName(a, b)
        if (aMissing) return 1
        if (bMissing) return -1
        if (aTime !== bTime) return aTime - bTime
        return byName(a, b)
      })
    case 'most-commits':
      return sorted.sort((a, b) => {
        const aCount = a.commitCount ?? -1
        const bCount = b.commitCount ?? -1
        if (bCount !== aCount) return bCount - aCount
        return byName(a, b)
      })
    case 'name':
    default:
      return sorted.sort(byName)
  }
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
  // Local filter/sort state
  const [controlsOpen, setControlsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<BranchFilter>('all')
  const [sort, setSort] = useState<BranchSort>('name')

  // Filter and sort branches
  const filteredBranches = useMemo(() => {
    let filtered = filterBranches(branches, filter)
    
    // Apply search
    if (search.trim()) {
      const searchLower = search.toLowerCase().trim()
      filtered = filtered.filter((b) => b.name.toLowerCase().includes(searchLower))
    }
    
    return sortBranches(filtered, sort)
  }, [branches, filter, sort, search])

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
              <option value="all">All</option>
              <option value="local-only">Local Only</option>
              <option value="unmerged">Unmerged</option>
            </select>
          </div>
          <div className="control-row">
            <label>Sort</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as BranchSort)}
              className="control-select"
            >
              <option value="name">Name</option>
              <option value="last-commit">Last Commit</option>
              <option value="first-commit">First Commit</option>
              <option value="most-commits">Most Commits</option>
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
              >
                <div className="item-main">
                  <span className="item-name">
                    {branch.current && <span className="arrow">→</span>}
                    {branch.name}
                  </span>
                  <div className="item-badges">
                    {branch.isLocalOnly && <span className="badge badge-local">local</span>}
                    {!branch.isMerged && <span className="badge badge-unmerged">unmerged</span>}
                    {branch.current && <span className="current-indicator">●</span>}
                  </div>
                </div>
                <div className="item-meta">
                  <code className="commit-hash">{branch.commit?.slice(0, 7)}</code>
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
