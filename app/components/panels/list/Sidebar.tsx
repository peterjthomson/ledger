/**
 * Sidebar - Focus mode sidebar panel
 * 
 * Shows all items (PRs, branches, worktrees, stashes) in collapsible sections.
 * Each section has consistent header with filter toggle and optional add button.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import type { PullRequest, Branch, Worktree, StashEntry, RepoInfo, WorkingStatus } from '../../../types/electron'
import type { Column } from '../../../types/app-types'

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

interface SectionState {
  prs: boolean
  branches: boolean
  remotes: boolean
  worktrees: boolean
  stashes: boolean
  repos: boolean
}

interface FilterState {
  prs: boolean
  branches: boolean
  remotes: boolean
  worktrees: boolean
  stashes: boolean
  repos: boolean
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
  // Section expanded state
  const [sections, setSections] = useState<SectionState>({
    prs: true,
    branches: true,
    remotes: false,
    worktrees: true,
    stashes: false,
    repos: false,
  })

  // Section filter panel state
  const [filters, setFilters] = useState<FilterState>({
    prs: false,
    branches: false,
    remotes: false,
    worktrees: false,
    stashes: false,
    repos: false,
  })

  // Per-section search state
  const [sectionSearch, setSectionSearch] = useState({
    prs: '',
    branches: '',
    remotes: '',
    worktrees: '',
    stashes: '',
    repos: '',
  })

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

  // Filter items by per-section search
  const filteredPRs = useMemo(() => {
    const s = sectionSearch.prs.toLowerCase().trim()
    if (!s) return prs
    return prs.filter(
      (pr) =>
        pr.title.toLowerCase().includes(s) ||
        pr.branch.toLowerCase().includes(s)
    )
  }, [prs, sectionSearch.prs])

  const filteredLocalBranches = useMemo(() => {
    const s = sectionSearch.branches.toLowerCase().trim()
    if (!s) return localBranches
    return localBranches.filter((b) => b.name.toLowerCase().includes(s))
  }, [localBranches, sectionSearch.branches])

  const filteredRemoteBranches = useMemo(() => {
    const s = sectionSearch.remotes.toLowerCase().trim()
    if (!s) return remoteBranches
    return remoteBranches.filter((b) => b.name.toLowerCase().includes(s))
  }, [remoteBranches, sectionSearch.remotes])

  const filteredWorktrees = useMemo(() => {
    const s = sectionSearch.worktrees.toLowerCase().trim()
    if (!s) return worktrees
    return worktrees.filter(
      (wt) =>
        wt.path.toLowerCase().includes(s) ||
        (wt.branch && wt.branch.toLowerCase().includes(s))
    )
  }, [worktrees, sectionSearch.worktrees])

  const filteredStashes = useMemo(() => {
    const s = sectionSearch.stashes.toLowerCase().trim()
    if (!s) return stashes
    return stashes.filter((st) => st.message.toLowerCase().includes(s))
  }, [stashes, sectionSearch.stashes])

  const filteredRepos = useMemo(() => {
    const s = sectionSearch.repos.toLowerCase().trim()
    if (!s) return repos
    return repos.filter((r) => r.name.toLowerCase().includes(s))
  }, [repos, sectionSearch.repos])

  // Toggle section expand/collapse
  const toggleSection = useCallback((section: keyof SectionState) => {
    setSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }, [])

  // Toggle all sections expand/collapse
  const toggleAllSections = useCallback(() => {
    // If any section is expanded, collapse all. Otherwise expand all.
    const anyExpanded = Object.values(sections).some(v => v)
    const newState = !anyExpanded
    setSections({
      prs: newState,
      branches: newState,
      remotes: newState,
      worktrees: newState,
      stashes: newState,
      repos: newState,
    })
  }, [sections])

  // Toggle section filter panel
  const toggleFilter = useCallback((section: keyof FilterState) => {
    setFilters((prev) => ({ ...prev, [section]: !prev[section] }))
  }, [])

  // Update section search
  const updateSearch = useCallback((section: keyof typeof sectionSearch, value: string) => {
    setSectionSearch((prev) => ({ ...prev, [section]: value }))
  }, [])

  const icon = column?.icon || '☰'
  const label = column?.label || 'All Items'

  // Section header component for consistency
  const SectionHeader = ({
    sectionKey,
    sectionIcon,
    sectionLabel,
    count,
    hasActiveFilter,
    onAdd,
  }: {
    sectionKey: keyof SectionState
    sectionIcon: string
    sectionLabel: string
    count: number
    hasActiveFilter: boolean
    onAdd?: () => void
  }) => (
    <div className="sidebar-section-header-row">
      <button
        className={`sidebar-section-header ${sections[sectionKey] ? 'open' : ''}`}
        onClick={() => toggleSection(sectionKey)}
      >
        <span className="section-icon">{sectionIcon}</span>
        <span className="section-label">{sectionLabel}</span>
        <span className="section-chevron">{sections[sectionKey] ? '▾' : '▸'}</span>
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
        className={`section-filter-btn ${filters[sectionKey] || hasActiveFilter ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          toggleFilter(sectionKey)
        }}
        title="Toggle filter"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M0 1h10L6 5v4L4 10V5L0 1z" />
        </svg>
      </button>
    </div>
  )

  // Section filter panel component
  const SectionFilter = ({
    sectionKey,
    placeholder,
  }: {
    sectionKey: keyof FilterState
    placeholder: string
  }) => {
    if (!filters[sectionKey]) return null
    return (
      <div className="section-filter-panel">
        <input
          type="text"
          className="section-filter-input"
          placeholder={placeholder}
          value={sectionSearch[sectionKey]}
          onChange={(e) => updateSearch(sectionKey, e.target.value)}
          autoFocus
        />
      </div>
    )
  }

  // Check if all sections are expanded
  const allExpanded = Object.values(sections).every(v => v)

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
            sectionKey="prs"
            sectionIcon="⬡"
            sectionLabel="Pull Requests"
            count={filteredPRs.length}
            hasActiveFilter={!!sectionSearch.prs.trim()}
          />
          <SectionFilter sectionKey="prs" placeholder="Filter PRs..." />
          {sections.prs && (
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
            sectionKey="branches"
            sectionIcon="⎇"
            sectionLabel="Branches"
            count={filteredLocalBranches.length + (workingStatus?.hasChanges ? 1 : 0)}
            hasActiveFilter={!!sectionSearch.branches.trim()}
            onAdd={onCreateBranch}
          />
          <SectionFilter sectionKey="branches" placeholder="Filter branches..." />
          {sections.branches && (
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
            sectionKey="remotes"
            sectionIcon="◈"
            sectionLabel="Remotes"
            count={filteredRemoteBranches.length}
            hasActiveFilter={!!sectionSearch.remotes.trim()}
          />
          <SectionFilter sectionKey="remotes" placeholder="Filter remotes..." />
          {sections.remotes && (
            <ul className="sidebar-items">
              {filteredRemoteBranches.map((branch) => (
                <li
                  key={branch.name}
                  className={`sidebar-item ${selectedBranch?.name === branch.name && selectedBranch?.isRemote ? 'selected' : ''}`}
                  onClick={() => onSelectBranch?.(branch)}
                  onDoubleClick={() => onDoubleClickBranch?.(branch)}
                  onContextMenu={(e) => onContextMenuBranch?.(e, branch)}
                >
                  <span className="item-title">{branch.name}</span>
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
            sectionKey="worktrees"
            sectionIcon="⊙"
            sectionLabel="Worktrees"
            count={filteredWorktrees.length}
            hasActiveFilter={!!sectionSearch.worktrees.trim()}
            onAdd={onCreateWorktree}
          />
          <SectionFilter sectionKey="worktrees" placeholder="Filter worktrees..." />
          {sections.worktrees && (
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
            sectionKey="stashes"
            sectionIcon="⊡"
            sectionLabel="Stashes"
            count={filteredStashes.length}
            hasActiveFilter={!!sectionSearch.stashes.trim()}
          />
          <SectionFilter sectionKey="stashes" placeholder="Filter stashes..." />
          {sections.stashes && (
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
            sectionKey="repos"
            sectionIcon="⌂"
            sectionLabel="Repositories"
            count={filteredRepos.length}
            hasActiveFilter={!!sectionSearch.repos.trim()}
          />
          <SectionFilter sectionKey="repos" placeholder="Filter repos..." />
          {sections.repos && (
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
