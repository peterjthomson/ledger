/**
 * Sidebar - Focus mode sidebar panel
 * 
 * Shows all items (PRs, branches, worktrees, stashes) in collapsible sections.
 * Each section has consistent header with filter toggle and optional add button.
 */

import { useState, useMemo, useEffect } from 'react'
import type {
  PullRequest,
  Branch,
  Worktree,
  StashEntry,
  RepoInfo,
  WorkingStatus,
  BranchFilter,
  BranchSort,
  PRFilter,
  PRSort,
  StashFilter,
  StashSort,
  WorktreeSort,
} from '../../../types/electron'
import type { Column } from '../../../types/app-types'
import { useListControl, useListControlsStore } from '../../../stores/list-controls-store'
import {
  applyBranchControls,
  remoteBranchDisplayName,
  remoteNameOf,
  applyPRControls,
  applyRepoControls,
  applyStashControls,
  applyWorktreeControls,
  getWorktreeParents,
  BRANCH_FILTER_OPTIONS,
  BRANCH_SORT_OPTIONS,
  PR_FILTER_OPTIONS,
  PR_SORT_OPTIONS,
  REPO_SORT_OPTIONS,
  STASH_FILTER_OPTIONS,
  STASH_SORT_OPTIONS,
  WORKTREE_SORT_OPTIONS,
  type RepoSort,
  type SelectOption,
} from './list-filters'

export interface SidebarProps {
  column?: Column
  // Data
  prs: PullRequest[]
  branches: Branch[]
  worktrees: Worktree[]
  stashes: StashEntry[]
  repoPath?: string | null
  workingStatus?: WorkingStatus | null
  // Selection
  selectedPR?: PullRequest | null
  selectedBranch?: Branch | null
  selectedWorktree?: Worktree | null
  selectedStash?: StashEntry | null
  selectedRepo?: RepoInfo | null
  uncommittedSelected?: boolean
  // Handlers
  onSelectPR?: (pr: PullRequest) => void
  onDoubleClickPR?: (pr: PullRequest) => void
  onContextMenuPR?: (e: React.MouseEvent, pr: PullRequest) => void
  onSelectBranch?: (branch: Branch) => void
  onDoubleClickBranch?: (branch: Branch) => void
  onContextMenuBranch?: (e: React.MouseEvent, branch: Branch) => void
  onSelectWorktree?: (wt: Worktree) => void
  onDoubleClickWorktree?: (wt: Worktree) => void
  onContextMenuWorktree?: (e: React.MouseEvent, wt: Worktree) => void
  onSelectStash?: (stash: StashEntry) => void
  onDoubleClickStash?: (stash: StashEntry) => void
  onContextMenuStash?: (e: React.MouseEvent, stash: StashEntry) => void
  onSelectRepo?: (repo: RepoInfo) => void
  onDoubleClickRepo?: (repo: RepoInfo) => void
  onSelectUncommitted?: () => void
  onDoubleClickUncommitted?: () => void
  // Action handlers
  onCreateBranch?: () => void
  onCreateWorktree?: () => void
  // Utilities
  formatRelativeTime?: (date: string) => string
}

type SectionKey = 'prs' | 'branches' | 'remotes' | 'worktrees' | 'stashes' | 'repos'

const SECTION_KEYS: SectionKey[] = ['prs', 'branches', 'remotes', 'worktrees', 'stashes', 'repos']
const DEFAULT_EXPANDED: Record<SectionKey, boolean> = {
  prs: true,
  branches: true,
  remotes: false,
  worktrees: true,
  stashes: false,
  repos: false,
}

// Section header: expand toggle, optional add button, count, and filter toggle.
// Defined at module scope so React keeps the same element across renders.
function SectionHeader({
  sectionIcon,
  sectionLabel,
  count,
  expanded,
  filterOpen,
  hasActiveFilter,
  onToggle,
  onToggleFilter,
  onAdd,
}: {
  sectionIcon: string
  sectionLabel: string
  count: number
  expanded: boolean
  filterOpen: boolean
  hasActiveFilter: boolean
  onToggle: () => void
  onToggleFilter: () => void
  onAdd?: () => void
}) {
  return (
    <div className="sidebar-section-header-row">
      <button className={`sidebar-section-header ${expanded ? 'open' : ''}`} onClick={onToggle}>
        <span className="section-icon">{sectionIcon}</span>
        <span className="section-label">{sectionLabel}</span>
        <span className="section-chevron">{expanded ? '▾' : '▸'}</span>
      </button>
      {onAdd && (
        <button
          className="section-action-btn"
          onClick={(e) => {
            e.stopPropagation()
            onAdd()
          }}
          title={`New ${sectionLabel.replace(/s$/, '')}`}
        >
          +
        </button>
      )}
      <span className="section-count">{count}</span>
      <button
        className={`section-filter-btn ${filterOpen || hasActiveFilter ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggleFilter()
        }}
        title="Toggle filter"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M0 1h10L6 5v4L4 10V5L0 1z" />
        </svg>
      </button>
    </div>
  )
}

/**
 * Section filter panel.
 *
 * Offers the same Search / Filter / Sort controls as the radar column header for the
 * matching item type. Sections without a filter dimension (repos) just omit that row.
 */
function SectionFilter<F extends string, S extends string>({
  placeholder,
  search,
  onSearchChange,
  filterOptions,
  filterValue,
  onFilterChange,
  sortOptions,
  sortValue,
  onSortChange,
}: {
  placeholder: string
  search: string
  onSearchChange: (value: string) => void
  filterOptions?: SelectOption<F>[]
  filterValue?: F
  onFilterChange?: (value: F) => void
  sortOptions: SelectOption<S>[]
  sortValue: S
  onSortChange: (value: S) => void
}) {
  return (
    <div className="section-filter-panel" data-testid="section-filter-panel">
      <input
        type="text"
        className="section-filter-input"
        placeholder={placeholder}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        autoFocus
      />
      {filterOptions && filterValue !== undefined && onFilterChange && (
        <div className="section-filter-row">
          <label>Filter</label>
          <select
            className="section-filter-select"
            value={filterValue}
            onChange={(e) => onFilterChange(e.target.value as F)}
          >
            {filterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="section-filter-row">
        <label>Sort</label>
        <select
          className="section-filter-select"
          value={sortValue}
          onChange={(e) => onSortChange(e.target.value as S)}
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export function Sidebar({
  column,
  prs,
  branches,
  worktrees,
  stashes,
  repoPath,
  workingStatus,
  selectedPR,
  selectedBranch,
  selectedWorktree,
  selectedStash,
  selectedRepo,
  uncommittedSelected,
  onSelectPR,
  onDoubleClickPR,
  onContextMenuPR,
  onSelectBranch,
  onDoubleClickBranch,
  onContextMenuBranch,
  onSelectWorktree,
  onDoubleClickWorktree,
  onContextMenuWorktree,
  onSelectStash,
  onDoubleClickStash,
  onContextMenuStash,
  onSelectRepo,
  onDoubleClickRepo,
  onSelectUncommitted,
  onDoubleClickUncommitted,
  onCreateBranch,
  onCreateWorktree,
  formatRelativeTime,
}: SidebarProps) {
  // Section expanded / filter-panel state lives in the list-controls store so it
  // survives switching canvases (this panel unmounts when its canvas isn't shown).
  const controlValues = useListControlsStore((s) => s.values)
  const setControlValue = useListControlsStore((s) => s.setValue)
  const isExpanded = (key: SectionKey) =>
    (controlValues[`sidebar:section:${key}`] as boolean | undefined) ?? DEFAULT_EXPANDED[key]
  const isFilterOpen = (key: SectionKey) => (controlValues[`sidebar:${key}:open`] as boolean | undefined) ?? false

  // Per-section search/filter/sort state.
  // Same keys, options, and defaults as the matching radar column, so a section behaves
  // the same whichever surface you drive it from.
  const [prSearch, setPrSearch] = useListControl('prs:search', '')
  const [prFilter, setPrFilter] = useListControl<PRFilter>('prs:filter', 'open-not-draft')
  const [prSort, setPrSort] = useListControl<PRSort>('prs:sort', 'updated')
  const [branchSearch, setBranchSearch] = useListControl('branches:search', '')
  const [branchFilter, setBranchFilter] = useListControl<BranchFilter>('branches:filter', 'all')
  const [branchSort, setBranchSort] = useListControl<BranchSort>('branches:sort', 'name')
  const [remoteSearch, setRemoteSearch] = useListControl('remotes:search', '')
  const [remoteFilter, setRemoteFilter] = useListControl<BranchFilter>('remotes:filter', 'all')
  const [remoteSort, setRemoteSort] = useListControl<BranchSort>('remotes:sort', 'name')
  const [worktreeSearch, setWorktreeSearch] = useListControl('worktrees:search', '')
  const [storedWorktreeParent, setWorktreeParent] = useListControl<string>('worktrees:filter', 'all')
  const [worktreeSort, setWorktreeSort] = useListControl<WorktreeSort>('worktrees:sort', 'last-modified')
  const [stashSearch, setStashSearch] = useListControl('stashes:search', '')
  const [stashFilter, setStashFilter] = useListControl<StashFilter>('stashes:filter', 'all')
  const [stashSort, setStashSort] = useListControl<StashSort>('stashes:sort', 'date')
  const [repoSearch, setRepoSearch] = useListControl('repos:search', '')
  const [repoSort, setRepoSort] = useListControl<RepoSort>('repos:sort', 'current-first')

  // Sibling repos state
  const [repos, setRepos] = useState<RepoInfo[]>([])

  // Load sibling repos when repoPath changes
  useEffect(() => {
    if (!repoPath) {
      setRepos([])
      return
    }
    window.electronAPI
      .getSiblingRepos()
      .then(setRepos)
      .catch(() => setRepos([]))
  }, [repoPath])

  // Split branches
  const localBranches = useMemo(() => branches.filter((b) => !b.isRemote), [branches])
  const remoteBranches = useMemo(() => branches.filter((b) => b.isRemote), [branches])

  // Filter/sort items using the same logic as the radar column headers
  const filteredPRs = useMemo(
    () => applyPRControls(prs, { search: prSearch, filter: prFilter, sort: prSort }),
    [prs, prSearch, prFilter, prSort]
  )

  const filteredLocalBranches = useMemo(
    () => applyBranchControls(localBranches, { search: branchSearch, filter: branchFilter, sort: branchSort }),
    [localBranches, branchSearch, branchFilter, branchSort]
  )

  const filteredRemoteBranches = useMemo(
    () => applyBranchControls(remoteBranches, { search: remoteSearch, filter: remoteFilter, sort: remoteSort }),
    [remoteBranches, remoteSearch, remoteFilter, remoteSort]
  )

  // Only label remote rows with their remote when there is more than one to tell apart
  const showRemoteNames = useMemo(
    () => new Set(remoteBranches.map((b) => remoteNameOf(b.name))).size > 1,
    [remoteBranches]
  )

  // Parent folders available as worktree filters, same as the radar column
  const worktreeParents = useMemo(
    () => getWorktreeParents(worktrees, repoPath ?? null),
    [worktrees, repoPath]
  )
  // A remembered parent folder may not exist in this repo; fall back to all
  const worktreeParent =
    storedWorktreeParent === 'all' || worktreeParents.includes(storedWorktreeParent) ? storedWorktreeParent : 'all'

  const worktreeFilterOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: 'all', label: 'All' },
      ...worktreeParents.map((parent) => ({ value: parent, label: parent })),
    ],
    [worktreeParents]
  )

  const filteredWorktrees = useMemo(
    () =>
      applyWorktreeControls(worktrees, {
        search: worktreeSearch,
        parentFilter: worktreeParent,
        sort: worktreeSort,
        repoPath: repoPath ?? null,
      }),
    [worktrees, worktreeSearch, worktreeParent, worktreeSort, repoPath]
  )

  const filteredStashes = useMemo(
    () => applyStashControls(stashes, { search: stashSearch, filter: stashFilter, sort: stashSort }),
    [stashes, stashSearch, stashFilter, stashSort]
  )

  const filteredRepos = useMemo(
    () => applyRepoControls(repos, { search: repoSearch, sort: repoSort }),
    [repos, repoSearch, repoSort]
  )

  const toggleSection = (key: SectionKey) => setControlValue(`sidebar:section:${key}`, !isExpanded(key))
  const toggleFilter = (key: SectionKey) => setControlValue(`sidebar:${key}:open`, !isFilterOpen(key))

  // Header click: if any section is expanded, collapse all. Otherwise expand all.
  const anyExpanded = SECTION_KEYS.some(isExpanded)
  const allExpanded = SECTION_KEYS.every(isExpanded)
  const toggleAllSections = () => {
    for (const key of SECTION_KEYS) setControlValue(`sidebar:section:${key}`, !anyExpanded)
  }

  // Shared header props for a section
  const headerProps = (key: SectionKey) => ({
    expanded: isExpanded(key),
    filterOpen: isFilterOpen(key),
    onToggle: () => toggleSection(key),
    onToggleFilter: () => toggleFilter(key),
  })

  const icon = column?.icon || '☰'
  const label = column?.label || 'All Items'

  return (
    <div className="sidebar-panel" data-testid="sidebar-panel">
      {/* Header - click to expand/collapse all */}
      <div
        className="sidebar-header clickable"
        onClick={toggleAllSections}
        title={allExpanded ? 'Collapse all sections' : 'Expand all sections'}
      >
        <h2>
          <span className="column-icon">{icon}</span>
          {label}
        </h2>
        <span className="sidebar-header-chevron">{allExpanded ? '▾' : '▸'}</span>
      </div>

      {/* Sections */}
      <div className="sidebar-sections">
        {/* PRs Section */}
        <div className="sidebar-section" data-testid="sidebar-section-prs">
          <SectionHeader
            {...headerProps('prs')}
            sectionIcon="⬡"
            sectionLabel="Pull Requests"
            count={filteredPRs.length}
            hasActiveFilter={!!prSearch.trim() || prFilter !== 'open-not-draft'}
          />
          {isFilterOpen('prs') && (
            <SectionFilter
              placeholder="Filter PRs..."
              search={prSearch}
              onSearchChange={setPrSearch}
              filterOptions={PR_FILTER_OPTIONS}
              filterValue={prFilter}
              onFilterChange={setPrFilter}
              sortOptions={PR_SORT_OPTIONS}
              sortValue={prSort}
              onSortChange={setPrSort}
            />
          )}
          {isExpanded('prs') && (
            <ul className="sidebar-items">
              {filteredPRs.map((pr) => (
                <li
                  key={pr.number}
                  className={`sidebar-item ${selectedPR?.number === pr.number ? 'selected' : ''}`}
                  onClick={() => onSelectPR?.(pr)}
                  onDoubleClick={() => onDoubleClickPR?.(pr)}
                  onContextMenu={(e) => onContextMenuPR?.(e, pr)}
                >
                  <span className="item-title" title={pr.title}>{pr.title}</span>
                  <span className="item-meta">#{pr.number}</span>
                </li>
              ))}
              {filteredPRs.length === 0 && (
                <li className="sidebar-empty">No PRs</li>
              )}
            </ul>
          )}
        </div>

        {/* Branches Section */}
        <div className="sidebar-section" data-testid="sidebar-section-branches">
          <SectionHeader
            {...headerProps('branches')}
            sectionIcon="⎇"
            sectionLabel="Branches"
            count={filteredLocalBranches.length + (workingStatus?.hasChanges ? 1 : 0)}
            hasActiveFilter={!!branchSearch.trim() || branchFilter !== 'all'}
            onAdd={onCreateBranch}
          />
          {isFilterOpen('branches') && (
            <SectionFilter
              placeholder="Filter branches..."
              search={branchSearch}
              onSearchChange={setBranchSearch}
              filterOptions={BRANCH_FILTER_OPTIONS}
              filterValue={branchFilter}
              onFilterChange={setBranchFilter}
              sortOptions={BRANCH_SORT_OPTIONS}
              sortValue={branchSort}
              onSortChange={setBranchSort}
            />
          )}
          {isExpanded('branches') && (
            <ul className="sidebar-items">
              {/* Uncommitted changes as virtual branch */}
              {workingStatus?.hasChanges && (
                <li
                  className={`sidebar-item uncommitted-item ${uncommittedSelected ? 'selected' : ''}`}
                  onClick={() => onSelectUncommitted?.()}
                  onDoubleClick={() => onDoubleClickUncommitted?.()}
                >
                  <span className="item-title">Uncommitted changes</span>
                  <span className="badge badge-uncommitted">
                    {workingStatus.stagedCount + workingStatus.unstagedCount}
                  </span>
                </li>
              )}
              {filteredLocalBranches.map((branch) => (
                <li
                  key={branch.name}
                  className={`sidebar-item ${selectedBranch?.name === branch.name && !selectedBranch?.isRemote ? 'selected' : ''}`}
                  onClick={() => onSelectBranch?.(branch)}
                  onDoubleClick={() => onDoubleClickBranch?.(branch)}
                  onContextMenu={(e) => onContextMenuBranch?.(e, branch)}
                >
                  <span className="item-title">{branch.name}</span>
                  {branch.current && <span className="badge badge-current">•</span>}
                </li>
              ))}
              {filteredLocalBranches.length === 0 && !workingStatus?.hasChanges && (
                <li className="sidebar-empty">No branches</li>
              )}
            </ul>
          )}
        </div>

        {/* Remotes Section */}
        <div className="sidebar-section" data-testid="sidebar-section-remotes">
          <SectionHeader
            {...headerProps('remotes')}
            sectionIcon="◈"
            sectionLabel="Remotes"
            count={filteredRemoteBranches.length}
            hasActiveFilter={!!remoteSearch.trim() || remoteFilter !== 'all'}
          />
          {isFilterOpen('remotes') && (
            <SectionFilter
              placeholder="Filter remotes..."
              search={remoteSearch}
              onSearchChange={setRemoteSearch}
              filterOptions={BRANCH_FILTER_OPTIONS}
              filterValue={remoteFilter}
              onFilterChange={setRemoteFilter}
              sortOptions={BRANCH_SORT_OPTIONS}
              sortValue={remoteSort}
              onSortChange={setRemoteSort}
            />
          )}
          {isExpanded('remotes') && (
            <ul className="sidebar-items">
              {filteredRemoteBranches.map((branch) => (
                <li
                  key={branch.name}
                  className={`sidebar-item ${selectedBranch?.name === branch.name && selectedBranch?.isRemote ? 'selected' : ''}`}
                  onClick={() => onSelectBranch?.(branch)}
                  onDoubleClick={() => onDoubleClickBranch?.(branch)}
                  onContextMenu={(e) => onContextMenuBranch?.(e, branch)}
                  title={branch.name}
                >
                  <span className="item-title">{remoteBranchDisplayName(branch.name)}</span>
                  {showRemoteNames && <span className="item-meta">{remoteNameOf(branch.name)}</span>}
                </li>
              ))}
              {filteredRemoteBranches.length === 0 && (
                <li className="sidebar-empty">No remotes</li>
              )}
            </ul>
          )}
        </div>

        {/* Worktrees Section */}
        <div className="sidebar-section" data-testid="sidebar-section-worktrees">
          <SectionHeader
            {...headerProps('worktrees')}
            sectionIcon="⊙"
            sectionLabel="Worktrees"
            count={filteredWorktrees.length}
            hasActiveFilter={!!worktreeSearch.trim() || worktreeParent !== 'all'}
            onAdd={onCreateWorktree}
          />
          {isFilterOpen('worktrees') && (
            <SectionFilter
              placeholder="Filter worktrees..."
              search={worktreeSearch}
              onSearchChange={setWorktreeSearch}
              filterOptions={worktreeFilterOptions}
              filterValue={worktreeParent}
              onFilterChange={setWorktreeParent}
              sortOptions={WORKTREE_SORT_OPTIONS}
              sortValue={worktreeSort}
              onSortChange={setWorktreeSort}
            />
          )}
          {isExpanded('worktrees') && (
            <ul className="sidebar-items">
              {filteredWorktrees.map((wt) => (
                <li
                  key={wt.path}
                  className={`sidebar-item ${selectedWorktree?.path === wt.path ? 'selected' : ''}`}
                  onClick={() => onSelectWorktree?.(wt)}
                  onDoubleClick={() => onDoubleClickWorktree?.(wt)}
                  onContextMenu={(e) => onContextMenuWorktree?.(e, wt)}
                >
                  <span className="item-title">{wt.branch || wt.path.split('/').pop()}</span>
                  {wt.agent && <span className="item-meta">{wt.agent}</span>}
                </li>
              ))}
              {filteredWorktrees.length === 0 && (
                <li className="sidebar-empty">No worktrees</li>
              )}
            </ul>
          )}
        </div>

        {/* Stashes Section */}
        <div className="sidebar-section" data-testid="sidebar-section-stashes">
          <SectionHeader
            {...headerProps('stashes')}
            sectionIcon="⊡"
            sectionLabel="Stashes"
            count={filteredStashes.length}
            hasActiveFilter={!!stashSearch.trim() || stashFilter !== 'all'}
          />
          {isFilterOpen('stashes') && (
            <SectionFilter
              placeholder="Filter stashes..."
              search={stashSearch}
              onSearchChange={setStashSearch}
              filterOptions={STASH_FILTER_OPTIONS}
              filterValue={stashFilter}
              onFilterChange={setStashFilter}
              sortOptions={STASH_SORT_OPTIONS}
              sortValue={stashSort}
              onSortChange={setStashSort}
            />
          )}
          {isExpanded('stashes') && (
            <ul className="sidebar-items">
              {filteredStashes.map((stash, index) => (
                <li
                  key={stash.index ?? index}
                  className={`sidebar-item ${selectedStash?.index === stash.index ? 'selected' : ''}`}
                  onClick={() => onSelectStash?.(stash)}
                  onDoubleClick={() => onDoubleClickStash?.(stash)}
                  onContextMenu={(e) => onContextMenuStash?.(e, stash)}
                >
                  <span className="item-title" title={stash.message}>{stash.message}</span>
                  {formatRelativeTime && (
                    <span className="item-meta">{formatRelativeTime(stash.date)}</span>
                  )}
                </li>
              ))}
              {filteredStashes.length === 0 && (
                <li className="sidebar-empty">No stashes</li>
              )}
            </ul>
          )}
        </div>

        {/* Repos Section */}
        <div className="sidebar-section" data-testid="sidebar-section-repos">
          <SectionHeader
            {...headerProps('repos')}
            sectionIcon="⌂"
            sectionLabel="Repositories"
            count={filteredRepos.length}
            hasActiveFilter={!!repoSearch.trim()}
          />
          {isFilterOpen('repos') && (
            <SectionFilter
              placeholder="Filter repos..."
              search={repoSearch}
              onSearchChange={setRepoSearch}
              sortOptions={REPO_SORT_OPTIONS}
              sortValue={repoSort}
              onSortChange={setRepoSort}
            />
          )}
          {isExpanded('repos') && (
            <ul className="sidebar-items">
              {filteredRepos.map((repo) => (
                <li
                  key={repo.path}
                  className={`sidebar-item ${selectedRepo?.path === repo.path ? 'selected' : ''}`}
                  onClick={() => onSelectRepo?.(repo)}
                  onDoubleClick={() => onDoubleClickRepo?.(repo)}
                >
                  <span className="item-title">{repo.name}</span>
                  {repo.isCurrent && <span className="badge badge-current">•</span>}
                </li>
              ))}
              {filteredRepos.length === 0 && (
                <li className="sidebar-empty">No sibling repos</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
