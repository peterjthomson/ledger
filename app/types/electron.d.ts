export interface Branch {
  name: string
  current: boolean
  commit: string
  label: string
  isRemote: boolean
  // Extended metadata
  lastCommitDate?: string
  firstCommitDate?: string
  commitCount?: number
  isLocalOnly?: boolean
  isMerged?: boolean
}

export interface BranchesResult {
  current: string
  branches: Branch[]
  error?: string
}

export type WorktreeAgent = 'cursor' | 'claude' | 'conductor' | 'gemini' | 'junie' | 'unknown' | 'working-folder'
export type WorktreeActivityStatus = 'active' | 'recent' | 'stale' | 'unknown'

export interface Worktree {
  path: string
  head: string
  branch: string | null
  bare: boolean
  // Agent workspace metadata
  agent: WorktreeAgent
  agentIndex: number // 1, 2, 3... per agent type
  contextHint: string // Primary file or branch name
  displayName: string // "Cursor 1: DocsController"
  // Diff stats
  changedFileCount: number
  additions: number
  deletions: number
  // For ordering
  lastModified: string // Directory mtime (ISO string)
  // Activity tracking
  activityStatus: WorktreeActivityStatus // 'active' | 'recent' | 'stale' | 'unknown'
  agentTaskHint: string | null // The agent's current task/prompt if available
}

export type BranchFilter = 'all' | 'local-only' | 'unmerged'
export type BranchSort = 'name' | 'last-commit' | 'first-commit' | 'most-commits'

export interface CheckoutResult {
  success: boolean
  message: string
  stashed?: string
}

export interface PullRequest {
  number: number
  title: string
  author: string
  branch: string
  baseBranch: string
  url: string
  createdAt: string
  updatedAt: string
  additions: number
  deletions: number
  reviewDecision: string | null
  labels: string[]
  isDraft: boolean
  comments: number
}

export type PRFilter = 'all' | 'open-not-draft' | 'open-draft'
export type PRSort = 'updated' | 'comments' | 'first-commit' | 'last-commit'

export interface PullRequestsResult {
  prs: PullRequest[]
  error?: string
}

export interface Commit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  isMerge: boolean
  filesChanged?: number
  additions?: number
  deletions?: number
}

// Graph commit with parent info for git graph visualization
export interface GraphCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  parents: string[]
  refs: string[]
  isMerge: boolean
  filesChanged?: number
  additions?: number
  deletions?: number
}

// Diff types for commit detail view
export interface DiffFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  oldPath?: string
}

export interface DiffLine {
  type: 'context' | 'add' | 'delete' | 'header'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export interface FileDiff {
  file: DiffFile
  hunks: DiffHunk[]
  isBinary: boolean
}

export interface CommitDiff {
  hash: string
  message: string
  author: string
  date: string
  files: FileDiff[]
  totalAdditions: number
  totalDeletions: number
}

export interface BranchDiff {
  branchName: string
  baseBranch: string
  files: FileDiff[]
  totalAdditions: number
  totalDeletions: number
  commitCount: number
}

// Stash entry
export interface StashEntry {
  index: number
  message: string
  branch: string
  date: string
}

export interface StashFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
}

// Staging file diff types (for working directory changes)
export interface StagingDiffHunk {
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: StagingDiffLine[]
}

export interface StagingDiffLine {
  type: 'context' | 'add' | 'delete'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface StagingFileDiff {
  filePath: string
  oldPath?: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'
  hunks: StagingDiffHunk[]
  isBinary: boolean
  additions: number
  deletions: number
}

// ========================================
// PR Review Types
// ========================================

export interface PRComment {
  id: string
  author: { login: string }
  authorAssociation: string
  body: string
  createdAt: string
  url: string
  isMinimized: boolean
}

export interface PRReview {
  id: string
  author: { login: string }
  authorAssociation: string
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED'
  body: string
  submittedAt: string
}

export interface PRFile {
  path: string
  additions: number
  deletions: number
}

export interface PRCommit {
  oid: string
  messageHeadline: string
  author: { name: string; email: string }
  committedDate: string
}

export interface PRReviewComment {
  id: number
  author: { login: string }
  authorAssociation: string
  body: string
  path: string
  line: number | null
  startLine: number | null
  side: 'LEFT' | 'RIGHT'
  diffHunk: string
  createdAt: string
  inReplyToId: number | null
  url: string
}

export interface PRDetail {
  number: number
  title: string
  body: string
  author: { login: string }
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  baseRefName: string
  headRefName: string
  additions: number
  deletions: number
  createdAt: string
  updatedAt: string
  url: string
  comments: PRComment[]
  reviews: PRReview[]
  files: PRFile[]
  commits: PRCommit[]
  reviewComments?: PRReviewComment[]
}

export interface UncommittedFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
}

export interface WorkingStatus {
  hasChanges: boolean
  files: UncommittedFile[]
  stagedCount: number
  unstagedCount: number
  additions: number
  deletions: number
}

export interface CreateWorktreeOptions {
  branchName: string
  isNewBranch: boolean
  folderPath: string
}

export interface ElectronAPI {
  selectRepo: () => Promise<string | null>
  getRepoPath: () => Promise<string | null>
  getSavedRepoPath: () => Promise<string | null>
  loadSavedRepo: () => Promise<string | null>
  getBranches: () => Promise<BranchesResult>
  getBranchesBasic: () => Promise<BranchesResult>
  getBranchesWithMetadata: () => Promise<BranchesResult>
  getWorktrees: () => Promise<Worktree[] | { error: string }>
  // Checkout operations
  checkoutBranch: (branchName: string) => Promise<CheckoutResult>
  createBranch: (branchName: string, checkout?: boolean) => Promise<{ success: boolean; message: string }>
  pushBranch: (branchName?: string, setUpstream?: boolean) => Promise<{ success: boolean; message: string }>
  checkoutRemoteBranch: (remoteBranch: string) => Promise<CheckoutResult>
  openWorktree: (worktreePath: string) => Promise<{ success: boolean; message: string }>
  // Pull requests
  getPullRequests: () => Promise<PullRequestsResult>
  openPullRequest: (url: string) => Promise<{ success: boolean; message: string }>
  createPullRequest: (options: {
    title: string
    body?: string
    headBranch?: string
    baseBranch?: string
    draft?: boolean
    web?: boolean
  }) => Promise<{ success: boolean; message: string; url?: string }>
  checkoutPRBranch: (prNumber: number) => Promise<CheckoutResult>
  // Remote operations
  getGitHubUrl: () => Promise<string | null>
  openBranchInGitHub: (branchName: string) => Promise<{ success: boolean; message: string }>
  pullBranch: (remoteBranch: string) => Promise<{ success: boolean; message: string }>
  // Commit history and working status
  getCommitHistory: (limit?: number) => Promise<Commit[]>
  getCommitHistoryForRef: (ref: string, limit?: number) => Promise<Commit[]>
  getCommitDetails: (commitHash: string) => Promise<Commit | null>
  getWorkingStatus: () => Promise<WorkingStatus>
  // Reset operations
  resetToCommit: (commitHash: string, mode: 'soft' | 'mixed' | 'hard') => Promise<CheckoutResult>
  // Focus mode APIs
  getCommitGraphHistory: (limit?: number, skipStats?: boolean, showCheckpoints?: boolean) => Promise<GraphCommit[]>
  getCommitDiff: (commitHash: string) => Promise<CommitDiff | null>
  getBranchDiff: (branchName: string) => Promise<BranchDiff | null>
  getStashes: () => Promise<StashEntry[]>
  getStashFiles: (stashIndex: number) => Promise<StashFile[]>
  getStashFileDiff: (stashIndex: number, filePath: string) => Promise<string | null>
  getStashDiff: (stashIndex: number) => Promise<string | null>
  applyStash: (stashIndex: number) => Promise<{ success: boolean; message: string }>
  popStash: (stashIndex: number) => Promise<{ success: boolean; message: string }>
  dropStash: (stashIndex: number) => Promise<{ success: boolean; message: string }>
  stashToBranch: (stashIndex: number, branchName: string) => Promise<{ success: boolean; message: string }>
  // Worktree operations
  convertWorktreeToBranch: (worktreePath: string) => Promise<{ success: boolean; message: string; branchName?: string }>
  applyWorktreeChanges: (worktreePath: string) => Promise<{ success: boolean; message: string }>
  removeWorktree: (worktreePath: string, force?: boolean) => Promise<{ success: boolean; message: string }>
  createWorktree: (options: CreateWorktreeOptions) => Promise<{ success: boolean; message: string; path?: string }>
  selectWorktreeFolder: () => Promise<string | null>
  // Worktree-specific staging & commit operations
  getWorktreeWorkingStatus: (worktreePath: string) => Promise<WorkingStatus>
  stageFileInWorktree: (worktreePath: string, filePath: string) => Promise<{ success: boolean; message: string }>
  unstageFileInWorktree: (worktreePath: string, filePath: string) => Promise<{ success: boolean; message: string }>
  stageAllInWorktree: (worktreePath: string) => Promise<{ success: boolean; message: string }>
  unstageAllInWorktree: (worktreePath: string) => Promise<{ success: boolean; message: string }>
  getFileDiffInWorktree: (
    worktreePath: string,
    filePath: string,
    staged: boolean
  ) => Promise<StagingFileDiff | null>
  commitInWorktree: (
    worktreePath: string,
    message: string,
    description?: string
  ) => Promise<{ success: boolean; message: string }>
  pushWorktreeBranch: (worktreePath: string) => Promise<{ success: boolean; message: string }>
  // Staging & commit operations
  stageFile: (filePath: string) => Promise<{ success: boolean; message: string }>
  unstageFile: (filePath: string) => Promise<{ success: boolean; message: string }>
  stageAll: () => Promise<{ success: boolean; message: string }>
  unstageAll: () => Promise<{ success: boolean; message: string }>
  discardFileChanges: (filePath: string) => Promise<{ success: boolean; message: string }>
  getFileDiff: (filePath: string, staged: boolean) => Promise<StagingFileDiff | null>
  commitChanges: (
    message: string,
    description?: string,
    force?: boolean
  ) => Promise<{ success: boolean; message: string; behindCount?: number }>
  pullCurrentBranch: () => Promise<{
    success: boolean
    message: string
    hadConflicts?: boolean
    autoStashed?: boolean
  }>
  // PR Review operations
  getPRDetail: (prNumber: number) => Promise<PRDetail | null>
  getPRReviewComments: (prNumber: number) => Promise<PRReviewComment[]>
  getPRFileDiff: (prNumber: number, filePath: string) => Promise<string | null>
  commentOnPR: (prNumber: number, body: string) => Promise<{ success: boolean; message: string }>
  mergePR: (prNumber: number, mergeMethod?: 'merge' | 'squash' | 'rebase') => Promise<{ success: boolean; message: string }>
  // Theme operations
  getThemeMode: () => Promise<'light' | 'dark' | 'system' | 'custom'>
  setThemeMode: (mode: 'light' | 'dark' | 'system' | 'custom') => Promise<{ success: boolean }>
  getSystemTheme: () => Promise<'light' | 'dark'>
  getCustomTheme: () => Promise<{
    theme: {
      name: string
      path: string
      type: 'light' | 'dark'
      colors: Record<string, string>
    }
    cssVars: Record<string, string>
  } | null>
  loadVSCodeTheme: () => Promise<{
    theme: {
      name: string
      path: string
      type: 'light' | 'dark'
      colors: Record<string, string>
    }
    cssVars: Record<string, string>
  } | null>
  loadBuiltInTheme: (themeFileName: string) => Promise<{
    theme: {
      name: string
      path: string
      type: 'light' | 'dark'
      colors: Record<string, string>
    }
    cssVars: Record<string, string>
  } | null>
  clearCustomTheme: () => Promise<{ success: boolean }>
  // Canvas operations
  getCanvases: () => Promise<CanvasConfig[]>
  saveCanvases: (canvases: CanvasConfig[]) => Promise<{ success: boolean }>
  getActiveCanvasId: () => Promise<string>
  saveActiveCanvasId: (canvasId: string) => Promise<{ success: boolean }>
  addCanvas: (canvas: CanvasConfig) => Promise<{ success: boolean }>
  removeCanvas: (canvasId: string) => Promise<{ success: boolean }>
  updateCanvas: (canvasId: string, updates: Partial<CanvasConfig>) => Promise<{ success: boolean }>
}

// Canvas configuration types for persistence
interface CanvasColumnConfig {
  id: string
  slotType: 'list' | 'editor' | 'viz'
  panel: string
  width: number | 'flex'
  minWidth?: number
  config?: Record<string, unknown>
}

interface CanvasConfig {
  id: string
  name: string
  columns: CanvasColumnConfig[]
  isPreset?: boolean
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
