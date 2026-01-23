export interface Branch {
  name: string
  current: boolean
  commit: string
  label: string
  isRemote: boolean
  // Extended metadata
  lastCommitDate?: string
  lastCommitMessage?: string
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
  // Directory modification time (used for sorting worktrees by creation order)
  lastModified: string
  // Activity tracking - dual signals for reliable detection
  activityStatus: WorktreeActivityStatus // 'active' | 'recent' | 'stale' | 'unknown'
  /** Most recent file modification time in worktree (filesystem level) */
  lastFileModified: string
  /** Last git activity: commit time or working directory change time */
  lastGitActivity: string
  /** Source of activity status: 'file' | 'git' | 'both' */
  activitySource: 'file' | 'git' | 'both'
  agentTaskHint: string | null // The agent's current task/prompt if available
}

export type BranchFilter = 'all' | 'local-only' | 'unmerged'
export type BranchSort = 'name' | 'last-commit' | 'first-commit' | 'most-commits'

export type WorktreeSort = 'folder-name' | 'last-modified' | 'branch-name'

// Preview system types
export type PreviewType = 'local' | 'cloud'

export interface PreviewProviderInfo {
  id: string
  name: string
  description: string
  icon: string
  type: PreviewType
  available: boolean
  compatible: boolean
  reason?: string
}

export interface PreviewResult {
  success: boolean
  message: string
  url?: string
  deploymentId?: string
  warnings?: string[]
  worktreePath?: string
  provider?: string
}

export interface PreviewAvailability {
  herdInstalled: boolean
  isLaravel: boolean
}
export type StashFilter = 'all' | 'has-changes' | 'redundant'
export type StashSort = 'date' | 'message' | 'branch'

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

// Contributor statistics for ridgeline chart
export interface ContributorTimeSeries {
  author: string
  email: string
  totalCommits: number
  timeSeries: { date: string; count: number }[]
}

export interface ContributorStats {
  contributors: ContributorTimeSeries[]
  startDate: string
  endDate: string
  bucketSize: 'day' | 'week' | 'month'
}

// Mailmap types for author identity management
export interface AuthorIdentity {
  name: string
  email: string
  commitCount: number
}

export interface MailmapSuggestion {
  canonicalName: string
  canonicalEmail: string
  aliases: AuthorIdentity[]
  confidence: 'high' | 'medium' | 'low'
}

export interface MailmapEntry {
  canonicalName: string
  canonicalEmail: string
  aliasName?: string
  aliasEmail: string
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
  // For PR Preview mode - conflict information
  hasConflicts?: boolean
  conflictFiles?: string[]
}

// 'diff' = two-dot (current state vs master), 'changes' = three-dot (all branch changes since fork)
// 'preview' = simulated merge result (what a PR would contribute)
export type BranchDiffType = 'diff' | 'changes' | 'preview'

// Stash entry
export interface StashEntry {
  index: number
  message: string
  branch: string
  date: string
  /** True if stash changes already exist on the original branch */
  redundant?: boolean
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
  /** Raw patch text for this hunk (used for git apply) */
  rawPatch: string
}

export interface StagingDiffLine {
  type: 'context' | 'add' | 'delete'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
  /** Index of this line within the hunk (0-based, for selection) */
  lineIndex: number
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
  branchName?: string // Optional if using commitHash for detached HEAD
  commitHash?: string // For creating worktree at specific commit (detached HEAD)
  isNewBranch: boolean
  folderPath: string
}

export interface RepoInfo {
  path: string
  name: string
  isCurrent: boolean
}

// ========================================
// Tech Tree Types
// ========================================

export type TechTreeSizeTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export type TechTreeBranchType = 
  | 'feature'
  | 'fix'
  | 'chore'
  | 'refactor'
  | 'docs'
  | 'test'
  | 'release'
  | 'unknown'

export interface TechTreeNodeStats {
  linesAdded: number
  linesRemoved: number
  filesChanged: number
  filesAdded: number
  filesRemoved: number
  commitCount: number
  daysSinceMerge: number
}

export interface TechTreeNode {
  id: string
  branchName: string
  commitHash: string
  mergeCommitHash: string
  author: string
  mergeDate: string
  message: string
  prNumber?: number
  stats: TechTreeNodeStats
  // Computed tier (populated by git service)
  sizeTier: TechTreeSizeTier
  branchType: TechTreeBranchType
  // Badge flags (percentile-based, computed by git service)
  badges: {
    massive: boolean     // Top 10% by total LOC
    destructive: boolean // Top 15% by lines removed
    additive: boolean    // Top 15% by lines added
    multiFile: boolean   // Top 20% by files changed
    surgical: boolean    // Bottom 10% by LOC (tiny changes)
    ancient: boolean     // Top 15% oldest
    fresh: boolean       // Top 15% newest
  }
}

export interface TechTreeData {
  masterBranch: string
  nodes: TechTreeNode[]
  // Global stats for normalization
  stats: {
    minLoc: number
    maxLoc: number
    minFiles: number
    maxFiles: number
    minAge: number
    maxAge: number
  }
}

// ========================================
// FileGraph Types (Code Treemap)
// ========================================

export interface FileNode {
  name: string
  path: string
  lines: number
  language: string | null
  isDirectory: boolean
  children?: FileNode[]
}

export interface FileGraphData {
  root: FileNode
  totalLines: number
  languages: { language: string; lines: number; color: string }[]
}

// ERD (Entity Relationship Diagram) types
export type ERDFramework = 'laravel' | 'rails' | 'generic'
export type ERDConstraint = 'PK' | 'FK' | 'UK' | 'nullable' | 'indexed'
export type ERDCardinality = 'one' | 'zero-or-one' | 'many' | 'one-or-more'

export interface ERDForeignKey {
  table: string
  column: string
}

export interface ERDAttribute {
  name: string
  type: string
  constraints: ERDConstraint[]
  foreignKey?: ERDForeignKey
  defaultValue?: string
  comment?: string
}

export interface ERDEntity {
  id: string
  name: string
  displayName: string
  attributes: ERDAttribute[]
  position?: { x: number; y: number }
}

export interface ERDRelationshipEndpoint {
  entity: string
  attribute?: string
  cardinality: ERDCardinality
}

export interface ERDRelationship {
  id: string
  from: ERDRelationshipEndpoint
  to: ERDRelationshipEndpoint
  label?: string
  type: 'identifying' | 'non-identifying'
}

export interface ERDSchema {
  entities: ERDEntity[]
  relationships: ERDRelationship[]
  framework: ERDFramework
  source: string
  parsedAt: string
}

export interface ERDParseResult {
  success: boolean
  data?: ERDSchema
  message?: string
}

export interface ERDFrameworkResult {
  success: boolean
  data?: ERDFramework
  message?: string
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
  checkoutCommit: (commitHash: string, branchName?: string) => Promise<CheckoutResult>
  createBranch: (branchName: string, checkout?: boolean) => Promise<{ success: boolean; message: string }>
  deleteBranch: (branchName: string, force?: boolean) => Promise<{ success: boolean; message: string }>
  renameBranch: (oldName: string, newName: string) => Promise<{ success: boolean; message: string }>
  deleteRemoteBranch: (branchName: string) => Promise<{ success: boolean; message: string }>
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
  getContributorStats: (topN?: number, bucketSize?: 'day' | 'week' | 'month') => Promise<ContributorStats>
  // Mailmap management
  getMailmap: () => Promise<MailmapEntry[]>
  getAuthorIdentities: () => Promise<AuthorIdentity[]>
  suggestMailmapEntries: () => Promise<MailmapSuggestion[]>
  addMailmapEntries: (entries: MailmapEntry[]) => Promise<{ success: boolean; message: string }>
  removeMailmapEntry: (entry: MailmapEntry) => Promise<{ success: boolean; message: string }>
  getCommitDiff: (commitHash: string) => Promise<CommitDiff | null>
  getBranchDiff: (branchName: string, diffType?: BranchDiffType) => Promise<BranchDiff | null>
  getStashes: () => Promise<StashEntry[]>
  getStashFiles: (stashIndex: number) => Promise<StashFile[]>
  getStashFileDiff: (stashIndex: number, filePath: string) => Promise<string | null>
  getStashFileDiffParsed: (stashIndex: number, filePath: string) => Promise<StagingFileDiff | null>
  getStashDiff: (stashIndex: number) => Promise<string | null>
  applyStash: (stashIndex: number) => Promise<{ success: boolean; message: string }>
  popStash: (stashIndex: number) => Promise<{ success: boolean; message: string }>
  dropStash: (stashIndex: number) => Promise<{ success: boolean; message: string }>
  stashToBranch: (stashIndex: number, branchName: string) => Promise<{ success: boolean; message: string }>
  applyStashToBranch: (
    stashIndex: number,
    targetBranch: string,
    stashMessage: string,
    keepWorktree?: boolean
  ) => Promise<{ success: boolean; message: string; usedExistingWorktree: boolean; worktreePath?: string }>
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
  discardAllChanges: () => Promise<{ success: boolean; message: string }>
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
  // Hunk-level staging operations
  stageHunk: (filePath: string, hunkIndex: number) => Promise<{ success: boolean; message: string }>
  unstageHunk: (filePath: string, hunkIndex: number) => Promise<{ success: boolean; message: string }>
  discardHunk: (filePath: string, hunkIndex: number) => Promise<{ success: boolean; message: string }>
  // Line-level staging operations
  stageLines: (filePath: string, hunkIndex: number, lineIndices: number[]) => Promise<{ success: boolean; message: string }>
  unstageLines: (filePath: string, hunkIndex: number, lineIndices: number[]) => Promise<{ success: boolean; message: string }>
  discardLines: (filePath: string, hunkIndex: number, lineIndices: number[]) => Promise<{ success: boolean; message: string }>
  // File content operations (for inline editing)
  getFileContent: (filePath: string) => Promise<string | null>
  saveFileContent: (filePath: string, content: string) => Promise<{ success: boolean; message: string }>
  // PR Review operations
  getPRDetail: (prNumber: number) => Promise<PRDetail | null>
  getPRReviewComments: (prNumber: number) => Promise<PRReviewComment[]>
  getPRFileDiff: (prNumber: number, filePath: string) => Promise<string | null>
  getPRFileDiffParsed: (prNumber: number, filePath: string) => Promise<StagingFileDiff | null>
  commentOnPR: (prNumber: number, body: string) => Promise<{ success: boolean; message: string }>
  mergePR: (prNumber: number, mergeMethod?: 'merge' | 'squash' | 'rebase') => Promise<{ success: boolean; message: string }>
  // Theme operations
  getThemeMode: () => Promise<'light' | 'dark' | 'system' | 'custom'>
  getSelectedThemeId: () => Promise<string>
  setThemeMode: (mode: 'light' | 'dark' | 'system' | 'custom', themeId?: string) => Promise<{ success: boolean }>
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
  loadBuiltInTheme: (themeFileName: string, themeId?: string) => Promise<{
    theme: {
      name: string
      path: string
      type: 'light' | 'dark'
      colors: Record<string, string>
    }
    cssVars: Record<string, string>
  } | null>
  clearCustomTheme: () => Promise<{ success: boolean }>
  // Tech tree operations
  getMergedBranchTree: (limit?: number) => Promise<TechTreeData>
  // FileGraph operations
  getFileGraph: () => Promise<FileGraphData>
  // Canvas operations
  getCanvases: () => Promise<CanvasConfig[]>
  saveCanvases: (canvases: CanvasConfig[]) => Promise<{ success: boolean }>
  getActiveCanvasId: () => Promise<string>
  saveActiveCanvasId: (canvasId: string) => Promise<{ success: boolean }>
  addCanvas: (canvas: CanvasConfig) => Promise<{ success: boolean }>
  removeCanvas: (canvasId: string) => Promise<{ success: boolean }>
  updateCanvas: (canvasId: string, updates: Partial<CanvasConfig>) => Promise<{ success: boolean }>
  // Repo operations
  getSiblingRepos: () => Promise<RepoInfo[]>
  // ERD operations
  getERDSchema: (repoPath?: string) => Promise<ERDParseResult>
  detectERDFramework: (repoPath?: string) => Promise<ERDFrameworkResult>
  parseMermaidERD: (content: string) => Promise<ERDParseResult>
}

// Canvas configuration types for persistence
interface CanvasColumnConfig {
  id: string
  slotType: 'list' | 'editor' | 'viz'
  panel: string
  width: number | 'flex'
  minWidth?: number
  config?: Record<string, unknown>
  // Display
  label?: string
  icon?: string
  // Visibility
  visible?: boolean
  collapsible?: boolean
}

interface CanvasConfig {
  id: string
  name: string
  icon?: string
  columns: CanvasColumnConfig[]
  isPreset?: boolean
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
