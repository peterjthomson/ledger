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
