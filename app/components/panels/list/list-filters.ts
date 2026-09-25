/**
 * Shared list filtering and sorting
 *
 * The radar column headers and the Focus-mode sidebar section headers offer the same
 * controls for the same item type, so the option lists and the filter/sort functions
 * live here rather than being duplicated per panel.
 */

import type {
  Branch,
  BranchFilter,
  BranchSort,
  PullRequest,
  PRFilter,
  PRSort,
  RepoInfo,
  StashEntry,
  StashFilter,
  StashSort,
  Worktree,
  WorktreeSort,
} from '../../../types/electron'

export type RepoSort = 'current-first' | 'name'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

// ============================================================================
// Branches (also used for remotes)
// ============================================================================

export const BRANCH_FILTER_OPTIONS: SelectOption<BranchFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'local-only', label: 'Local Only' },
  { value: 'unmerged', label: 'Unmerged' },
]

export const BRANCH_SORT_OPTIONS: SelectOption<BranchSort>[] = [
  { value: 'name', label: 'Name' },
  { value: 'last-commit', label: 'Last Commit' },
  { value: 'first-commit', label: 'First Commit' },
  { value: 'most-commits', label: 'Most Commits' },
]

export function filterBranches(branchList: Branch[], filter: BranchFilter): Branch[] {
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
export function sortBranches(branchList: Branch[], sort: BranchSort): Branch[] {
  // Keep the live branch first, then the primary branches, under every sort.
  const priority = (branch: Branch) => {
    if (branch.current) return 0
    const name = branch.isRemote ? branch.name.replace(/^(?:remotes\/)?[^/]+\//, '') : branch.name
    return name === 'main' || name === 'master' ? 1 : 2
  }
  const pinned = (a: Branch, b: Branch) => priority(a) - priority(b)
  const byName = (a: Branch, b: Branch) => a.name.localeCompare(b.name)
  const sorted = [...branchList]

  switch (sort) {
    case 'last-commit':
      return sorted.sort((a, b) => {
        if (pinned(a, b)) return pinned(a, b)
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
        if (pinned(a, b)) return pinned(a, b)
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
        if (pinned(a, b)) return pinned(a, b)
        const aCount = a.commitCount ?? -1
        const bCount = b.commitCount ?? -1
        if (bCount !== aCount) return bCount - aCount
        return byName(a, b)
      })
    case 'name':
    default:
      return sorted.sort((a, b) => pinned(a, b) || byName(a, b))
  }
}

export function searchBranches(branchList: Branch[], search: string): Branch[] {
  const s = search.toLowerCase().trim()
  if (!s) return branchList
  return branchList.filter((b) => b.name.toLowerCase().includes(s))
}

export function applyBranchControls(
  branchList: Branch[],
  { search, filter, sort }: { search: string; filter: BranchFilter; sort: BranchSort }
): Branch[] {
  return sortBranches(searchBranches(filterBranches(branchList, filter), search), sort)
}

// ============================================================================
// Pull requests
// ============================================================================

export const PR_FILTER_OPTIONS: SelectOption<PRFilter>[] = [
  { value: 'all', label: 'All Open' },
  { value: 'open-not-draft', label: 'Open + Not Draft' },
  { value: 'open-draft', label: 'Open + Draft' },
]

export const PR_SORT_OPTIONS: SelectOption<PRSort>[] = [
  { value: 'updated', label: 'Last Updated' },
  { value: 'comments', label: 'Comments' },
  { value: 'first-commit', label: 'First Commit' },
  { value: 'last-commit', label: 'Last Commit' },
]

export function applyPRControls(
  prs: PullRequest[],
  { search, filter, sort }: { search: string; filter: PRFilter; sort: PRSort }
): PullRequest[] {
  let filtered = [...prs]

  switch (filter) {
    case 'open-not-draft':
      filtered = filtered.filter((pr) => !pr.isDraft)
      break
    case 'open-draft':
      filtered = filtered.filter((pr) => pr.isDraft)
      break
    case 'all':
    default:
      break
  }

  const s = search.toLowerCase().trim()
  if (s) {
    filtered = filtered.filter(
      (pr) =>
        pr.title.toLowerCase().includes(s) ||
        pr.branch.toLowerCase().includes(s) ||
        pr.author.toLowerCase().includes(s)
    )
  }

  switch (sort) {
    case 'comments':
      filtered.sort((a, b) => b.comments - a.comments)
      break
    case 'first-commit':
      filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      break
    case 'last-commit':
    case 'updated':
    default:
      filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      break
  }

  return filtered
}

// ============================================================================
// Worktrees
// ============================================================================

export const WORKTREE_SORT_OPTIONS: SelectOption<WorktreeSort>[] = [
  { value: 'last-modified', label: 'Last Modified' },
  { value: 'folder-name', label: 'Folder Name' },
  { value: 'branch-name', label: 'Branch Name' },
]

/**
 * Extract the parent folders worktrees can be grouped under (agent dirs plus 'main').
 * These become the worktree filter options alongside 'all'.
 */
export function getWorktreeParents(worktrees: Worktree[], repoPath: string | null): string[] {
  const parents = new Set<string>()

  for (const wt of worktrees) {
    const pathParts = wt.path.split('/')
    // Check for known agent folders
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i]
      if (
        part.startsWith('.') &&
        ['cursor', 'claude', 'gemini', 'junie'].some((a) => part.toLowerCase().includes(a))
      ) {
        parents.add(part)
        break
      }
      if (part === 'conductor' && pathParts[i + 1] === 'workspaces') {
        parents.add('conductor')
        break
      }
    }
    if (repoPath && wt.path.startsWith(repoPath)) {
      parents.add('main')
    }
  }

  return Array.from(parents).sort()
}

export function sortWorktrees(wtList: Worktree[], sort: WorktreeSort): Worktree[] {
  const sorted = [...wtList]
  switch (sort) {
    case 'folder-name':
      return sorted.sort((a, b) => {
        const aName = a.path.split('/').pop() || ''
        const bName = b.path.split('/').pop() || ''
        return aName.localeCompare(bName)
      })
    case 'branch-name':
      return sorted.sort((a, b) => {
        const aName = a.branch || a.displayName || ''
        const bName = b.branch || b.displayName || ''
        return aName.localeCompare(bName)
      })
    case 'last-modified':
    default:
      return sorted.sort((a, b) => {
        if (!a.lastModified) return 1
        if (!b.lastModified) return -1
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      })
  }
}

export function matchesWorktreeParent(
  wt: Worktree,
  parentFilter: string,
  repoPath: string | null
): boolean {
  if (parentFilter === 'all') return true
  if (parentFilter === 'main') return !!repoPath && wt.path.startsWith(repoPath)
  return wt.path.includes(`/${parentFilter}/`)
}

export function matchesWorktreeSearch(wt: Worktree, search: string): boolean {
  const s = search.toLowerCase().trim()
  if (!s) return true
  return (
    wt.displayName.toLowerCase().includes(s) || !!(wt.branch && wt.branch.toLowerCase().includes(s))
  )
}

export function applyWorktreeControls(
  worktrees: Worktree[],
  {
    search,
    parentFilter,
    sort,
    repoPath,
  }: { search: string; parentFilter: string; sort: WorktreeSort; repoPath: string | null }
): Worktree[] {
  const filtered = worktrees.filter(
    (wt) => matchesWorktreeParent(wt, parentFilter, repoPath) && matchesWorktreeSearch(wt, search)
  )
  return sortWorktrees(filtered, sort)
}

// ============================================================================
// Stashes
// ============================================================================

export const STASH_FILTER_OPTIONS: SelectOption<StashFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'has-changes', label: 'Has Changes' },
  { value: 'redundant', label: 'Redundant' },
]

export const STASH_SORT_OPTIONS: SelectOption<StashSort>[] = [
  { value: 'date', label: 'Date Created' },
  { value: 'message', label: 'Message' },
  { value: 'branch', label: 'Branch' },
]

export function sortStashes(stashList: StashEntry[], sort: StashSort): StashEntry[] {
  const sorted = [...stashList]
  switch (sort) {
    case 'message':
      return sorted.sort((a, b) => a.message.localeCompare(b.message))
    case 'branch':
      return sorted.sort((a, b) => (a.branch || '').localeCompare(b.branch || ''))
    case 'date':
    default:
      // Default git stash order is already by date (newest first)
      return sorted.sort((a, b) => {
        if (!a.date) return 1
        if (!b.date) return -1
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
  }
}

export function applyStashControls(
  stashes: StashEntry[],
  { search, filter, sort }: { search: string; filter: StashFilter; sort: StashSort }
): StashEntry[] {
  let filtered = [...stashes]

  switch (filter) {
    case 'has-changes':
      // Show stashes that would add changes (not redundant)
      filtered = filtered.filter((stash) => !stash.redundant)
      break
    case 'redundant':
      // Show stashes whose changes already exist on the branch
      filtered = filtered.filter((stash) => stash.redundant)
      break
    case 'all':
    default:
      break
  }

  const s = search.toLowerCase().trim()
  if (s) {
    filtered = filtered.filter(
      (stash) =>
        stash.message.toLowerCase().includes(s) ||
        (stash.branch && stash.branch.toLowerCase().includes(s))
    )
  }

  return sortStashes(filtered, sort)
}

// ============================================================================
// Repositories
// ============================================================================

export const REPO_SORT_OPTIONS: SelectOption<RepoSort>[] = [
  { value: 'current-first', label: 'Current First' },
  { value: 'name', label: 'Name' },
]

export function applyRepoControls(
  repos: RepoInfo[],
  { search, sort }: { search: string; sort: RepoSort }
): RepoInfo[] {
  let filtered = repos

  const s = search.toLowerCase().trim()
  if (s) {
    filtered = filtered.filter((r) => r.name.toLowerCase().includes(s))
  }

  const sorted = [...filtered]
  switch (sort) {
    case 'current-first':
      return sorted.sort((a, b) => {
        if (a.isCurrent && !b.isCurrent) return -1
        if (!a.isCurrent && b.isCurrent) return 1
        return a.name.localeCompare(b.name)
      })
    case 'name':
    default:
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
  }
}
