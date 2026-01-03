/**
 * Repository Store
 *
 * Manages all repository-related state: branches, commits, PRs, worktrees, stashes.
 * Replaces scattered useState calls in app.tsx.
 */

import type {
  Branch,
  Worktree,
  PullRequest,
  Commit,
  GraphCommit,
  CommitDiff,
  WorkingStatus,
  StashEntry,
} from '../types/electron'
import type { StatusMessage } from '../types/app-types'
import { createAppStore } from './create-store'

export interface RepositoryState {
  // Repository info
  repoPath: string | null
  githubUrl: string | null
  currentBranch: string

  // Data collections
  branches: Branch[]
  worktrees: Worktree[]
  pullRequests: PullRequest[]
  commits: Commit[]
  graphCommits: GraphCommit[]
  stashes: StashEntry[]
  workingStatus: WorkingStatus | null

  // Selected items
  selectedCommit: GraphCommit | null
  commitDiff: CommitDiff | null

  // Loading & error states
  loading: boolean
  switching: boolean
  loadingDiff: boolean
  error: string | null
  prError: string | null
  status: StatusMessage | null
}

export interface RepositoryActions {
  // Repository
  setRepoPath: (path: string | null) => void
  setGithubUrl: (url: string | null) => void
  setCurrentBranch: (branch: string) => void

  // Data setters
  setBranches: (branches: Branch[]) => void
  setWorktrees: (worktrees: Worktree[]) => void
  setPullRequests: (prs: PullRequest[]) => void
  setCommits: (commits: Commit[]) => void
  setGraphCommits: (commits: GraphCommit[]) => void
  setStashes: (stashes: StashEntry[]) => void
  setWorkingStatus: (status: WorkingStatus | null) => void

  // Selection
  setSelectedCommit: (commit: GraphCommit | null) => void
  setCommitDiff: (diff: CommitDiff | null) => void

  // Loading & status
  setLoading: (loading: boolean) => void
  setSwitching: (switching: boolean) => void
  setLoadingDiff: (loading: boolean) => void
  setError: (error: string | null) => void
  setPrError: (error: string | null) => void
  setStatus: (status: StatusMessage | null) => void

  // Bulk operations
  clearRepository: () => void
  setRepositoryData: (data: Partial<RepositoryState>) => void
}

const initialState: RepositoryState = {
  repoPath: null,
  githubUrl: null,
  currentBranch: '',
  branches: [],
  worktrees: [],
  pullRequests: [],
  commits: [],
  graphCommits: [],
  stashes: [],
  workingStatus: null,
  selectedCommit: null,
  commitDiff: null,
  loading: false,
  switching: false,
  loadingDiff: false,
  error: null,
  prError: null,
  status: null,
}

export const useRepositoryStore = createAppStore<RepositoryState & RepositoryActions>(
  'repository',
  (set) => ({
    ...initialState,

    // Repository
    setRepoPath: (path) => set({ repoPath: path }),
    setGithubUrl: (url) => set({ githubUrl: url }),
    setCurrentBranch: (branch) => set({ currentBranch: branch }),

    // Data setters
    setBranches: (branches) => set({ branches }),
    setWorktrees: (worktrees) => set({ worktrees }),
    setPullRequests: (prs) => set({ pullRequests: prs }),
    setCommits: (commits) => set({ commits }),
    setGraphCommits: (commits) => set({ graphCommits: commits }),
    setStashes: (stashes) => set({ stashes }),
    setWorkingStatus: (status) => set({ workingStatus: status }),

    // Selection
    setSelectedCommit: (commit) => set({ selectedCommit: commit }),
    setCommitDiff: (diff) => set({ commitDiff: diff }),

    // Loading & status
    setLoading: (loading) => set({ loading }),
    setSwitching: (switching) => set({ switching }),
    setLoadingDiff: (loading) => set({ loadingDiff: loading }),
    setError: (error) => set({ error }),
    setPrError: (error) => set({ prError: error }),
    setStatus: (status) => set({ status }),

    // Bulk operations
    clearRepository: () => set(initialState),
    setRepositoryData: (data) => set(data),
  })
)

// Selector helpers for common patterns
export const selectBranches = (state: RepositoryState) => state.branches
export const selectLocalBranches = (state: RepositoryState) =>
  state.branches.filter((b) => !b.isRemote)
export const selectRemoteBranches = (state: RepositoryState) =>
  state.branches.filter((b) => b.isRemote)
export const selectIsLoading = (state: RepositoryState) =>
  state.loading || state.switching
