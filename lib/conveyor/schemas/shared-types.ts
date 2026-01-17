import { z } from 'zod'

// Common result schema used by many handlers
export const SuccessResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
})

export const CheckoutResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  stashed: z.string().optional(),
})

// Branch schema
export const BranchSchema = z.object({
  name: z.string(),
  current: z.boolean(),
  commit: z.string(),
  label: z.string(),
  isRemote: z.boolean(),
  lastCommitDate: z.string().optional(),
  firstCommitDate: z.string().optional(),
  commitCount: z.number().optional(),
  isLocalOnly: z.boolean().optional(),
  isMerged: z.boolean().optional(),
})

export const BranchesResultSchema = z.object({
  current: z.string(),
  branches: z.array(BranchSchema),
  error: z.string().optional(),
})

// Stash schemas
export const StashEntrySchema = z.object({
  index: z.number(),
  message: z.string(),
  branch: z.string(),
  date: z.string(),
})

export const StashFileSchema = z.object({
  path: z.string(),
  status: z.enum(['added', 'modified', 'deleted', 'renamed']),
  additions: z.number(),
  deletions: z.number(),
})

// Worktree schemas
export const WorktreeAgentSchema = z.enum(['cursor', 'claude', 'conductor', 'gemini', 'junie', 'unknown', 'working-folder'])
export const WorktreeActivityStatusSchema = z.enum(['active', 'recent', 'stale', 'unknown'])

export const ActivitySourceSchema = z.enum(['file', 'git', 'both'])

export const WorktreeSchema = z.object({
  path: z.string(),
  head: z.string(),
  branch: z.string().nullable(),
  bare: z.boolean(),
  agent: WorktreeAgentSchema,
  agentIndex: z.number(),
  contextHint: z.string(),
  displayName: z.string(),
  changedFileCount: z.number(),
  additions: z.number(),
  deletions: z.number(),
  lastModified: z.string(), // Directory mtime (used for sorting worktrees by creation order)
  activityStatus: WorktreeActivityStatusSchema,
  /** Most recent file modification time in worktree (filesystem level) */
  lastFileModified: z.string(),
  /** Last git activity: commit time or working directory change time */
  lastGitActivity: z.string(),
  /** Source of activity status: 'file' | 'git' | 'both' */
  activitySource: ActivitySourceSchema,
  agentTaskHint: z.string().nullable(),
})

export const WorktreeResultSchema = z.union([
  z.array(WorktreeSchema),
  z.object({ error: z.string() }),
])

export const CreateWorktreeOptionsSchema = z.object({
  branchName: z.string(),
  isNewBranch: z.boolean(),
  folderPath: z.string(),
})

export const CreateWorktreeResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  path: z.string().optional(),
})

export const ConvertWorktreeResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  branchName: z.string().optional(),
})

// Pull request schemas
export const PullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  author: z.string(),
  branch: z.string(),
  baseBranch: z.string(),
  url: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  additions: z.number(),
  deletions: z.number(),
  reviewDecision: z.string().nullable(),
  labels: z.array(z.string()),
  isDraft: z.boolean(),
  comments: z.number(),
})

export const PullRequestsResultSchema = z.object({
  prs: z.array(PullRequestSchema),
  error: z.string().optional(),
})

// Commit schemas
export const CommitSchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  message: z.string(),
  author: z.string(),
  date: z.string(),
  isMerge: z.boolean(),
  filesChanged: z.number().optional(),
  additions: z.number().optional(),
  deletions: z.number().optional(),
})

export const GraphCommitSchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  message: z.string(),
  author: z.string(),
  date: z.string(),
  parents: z.array(z.string()),
  refs: z.array(z.string()),
  isMerge: z.boolean(),
  filesChanged: z.number().optional(),
  additions: z.number().optional(),
  deletions: z.number().optional(),
})

// Diff schemas
export const DiffFileSchema = z.object({
  path: z.string(),
  status: z.enum(['added', 'modified', 'deleted', 'renamed']),
  additions: z.number(),
  deletions: z.number(),
  oldPath: z.string().optional(),
})

export const DiffLineSchema = z.object({
  type: z.enum(['context', 'add', 'delete', 'header']),
  content: z.string(),
  oldLineNumber: z.number().optional(),
  newLineNumber: z.number().optional(),
})

export const DiffHunkSchema = z.object({
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  lines: z.array(DiffLineSchema),
})

export const FileDiffSchema = z.object({
  file: DiffFileSchema,
  hunks: z.array(DiffHunkSchema),
  isBinary: z.boolean(),
})

export const CommitDiffSchema = z.object({
  hash: z.string(),
  message: z.string(),
  author: z.string(),
  date: z.string(),
  files: z.array(FileDiffSchema),
  totalAdditions: z.number(),
  totalDeletions: z.number(),
})

export const BranchDiffSchema = z.object({
  branchName: z.string(),
  baseBranch: z.string(),
  files: z.array(FileDiffSchema),
  totalAdditions: z.number(),
  totalDeletions: z.number(),
  commitCount: z.number(),
})

// Working status schemas
export const UncommittedFileSchema = z.object({
  path: z.string(),
  status: z.enum(['modified', 'added', 'deleted', 'renamed', 'untracked']),
  staged: z.boolean(),
})

export const WorkingStatusSchema = z.object({
  hasChanges: z.boolean(),
  files: z.array(UncommittedFileSchema),
  stagedCount: z.number(),
  unstagedCount: z.number(),
  additions: z.number(),
  deletions: z.number(),
})

// Staging diff schemas
export const StagingDiffLineSchema = z.object({
  type: z.enum(['context', 'add', 'delete']),
  content: z.string(),
  oldLineNumber: z.number().optional(),
  newLineNumber: z.number().optional(),
  lineIndex: z.number(),
})

export const StagingDiffHunkSchema = z.object({
  header: z.string(),
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  lines: z.array(StagingDiffLineSchema),
  rawPatch: z.string(),
})

export const StagingFileDiffSchema = z.object({
  filePath: z.string(),
  oldPath: z.string().optional(),
  status: z.enum(['added', 'modified', 'deleted', 'renamed', 'untracked']),
  hunks: z.array(StagingDiffHunkSchema),
  isBinary: z.boolean(),
  additions: z.number(),
  deletions: z.number(),
})

// PR Review schemas
export const PRCommentSchema = z.object({
  id: z.string(),
  author: z.object({ login: z.string() }),
  authorAssociation: z.string(),
  body: z.string(),
  createdAt: z.string(),
  url: z.string(),
  isMinimized: z.boolean(),
})

export const PRReviewSchema = z.object({
  id: z.string(),
  author: z.object({ login: z.string() }),
  authorAssociation: z.string(),
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'PENDING', 'DISMISSED']),
  body: z.string(),
  submittedAt: z.string(),
})

export const PRFileSchema = z.object({
  path: z.string(),
  additions: z.number(),
  deletions: z.number(),
})

export const PRCommitSchema = z.object({
  oid: z.string(),
  messageHeadline: z.string(),
  author: z.object({ name: z.string(), email: z.string() }),
  committedDate: z.string(),
})

export const PRReviewCommentSchema = z.object({
  id: z.number(),
  author: z.object({ login: z.string() }),
  authorAssociation: z.string(),
  body: z.string(),
  path: z.string(),
  line: z.number().nullable(),
  startLine: z.number().nullable(),
  side: z.enum(['LEFT', 'RIGHT']),
  diffHunk: z.string(),
  createdAt: z.string(),
  inReplyToId: z.number().nullable(),
  url: z.string(),
})

export const PRDetailSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string(),
  author: z.object({ login: z.string() }),
  state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  reviewDecision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED']).nullable(),
  baseRefName: z.string(),
  headRefName: z.string(),
  additions: z.number(),
  deletions: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  url: z.string(),
  comments: z.array(PRCommentSchema),
  reviews: z.array(PRReviewSchema),
  files: z.array(PRFileSchema),
  commits: z.array(PRCommitSchema),
  reviewComments: z.array(PRReviewCommentSchema).optional(),
})

// Commit result schemas
export const CommitResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  behindCount: z.number().optional(),
  hash: z.string().optional(),
})

export const PullResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  hadConflicts: z.boolean().optional(),
  autoStashed: z.boolean().optional(),
})

// PR creation options
export const CreatePROptionsSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  headBranch: z.string().optional(),
  baseBranch: z.string().optional(),
  draft: z.boolean().optional(),
  web: z.boolean().optional(),
})

export const CreatePRResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  url: z.string().optional(),
})

// Merge method schema for PR merging
export const MergeMethodSchema = z.enum(['merge', 'squash', 'rebase'])

// Git reset mode schema
export const ResetModeSchema = z.enum(['soft', 'mixed', 'hard'])

// Theme schemas
export const ThemeModeSchema = z.enum(['light', 'dark', 'system', 'custom'])
export const SystemThemeSchema = z.enum(['light', 'dark'])

export const CustomThemeSchema = z.object({
  name: z.string(),
  type: z.enum(['light', 'dark']),
  colors: z.record(z.string(), z.string()),
})

export const ThemeDataSchema = z.object({
  theme: CustomThemeSchema,
  cssVars: z.record(z.string(), z.string()),
})

// Result schema for custom theme operations (can be null if no custom theme)
// Returns ThemeData (theme + cssVars) or null
export const CustomThemeResultSchema = ThemeDataSchema.nullable()

// Type exports
export type SuccessResult = z.infer<typeof SuccessResultSchema>
export type CheckoutResult = z.infer<typeof CheckoutResultSchema>
export type Branch = z.infer<typeof BranchSchema>
export type BranchesResult = z.infer<typeof BranchesResultSchema>
export type StashEntry = z.infer<typeof StashEntrySchema>
export type StashFile = z.infer<typeof StashFileSchema>
export type Worktree = z.infer<typeof WorktreeSchema>
export type CreateWorktreeOptions = z.infer<typeof CreateWorktreeOptionsSchema>
export type PullRequest = z.infer<typeof PullRequestSchema>
export type Commit = z.infer<typeof CommitSchema>
export type GraphCommit = z.infer<typeof GraphCommitSchema>
export type CommitDiff = z.infer<typeof CommitDiffSchema>
export type BranchDiff = z.infer<typeof BranchDiffSchema>
export type WorkingStatus = z.infer<typeof WorkingStatusSchema>
export type StagingFileDiff = z.infer<typeof StagingFileDiffSchema>
export type PRDetail = z.infer<typeof PRDetailSchema>
export type PRReviewComment = z.infer<typeof PRReviewCommentSchema>
export type ThemeMode = z.infer<typeof ThemeModeSchema>
export type CustomTheme = z.infer<typeof CustomThemeSchema>
export type ThemeData = z.infer<typeof ThemeDataSchema>
export type MergeMethod = z.infer<typeof MergeMethodSchema>
export type ResetMode = z.infer<typeof ResetModeSchema>
export type CreatePROptions = z.infer<typeof CreatePROptionsSchema>
export type CreatePRResult = z.infer<typeof CreatePRResultSchema>
