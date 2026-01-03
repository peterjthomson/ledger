/**
 * PR Service Types
 *
 * Type definitions for Pull Request operations.
 * These types are used by both the service and handlers.
 */

/**
 * Basic pull request information for list display
 */
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

/**
 * Merge method options
 */
export type MergeMethod = 'merge' | 'squash' | 'rebase'

/**
 * PR comment (issue-level comment)
 */
export interface PRComment {
  id: string
  author: { login: string }
  authorAssociation: string
  body: string
  createdAt: string
  url: string
  isMinimized: boolean
}

/**
 * PR review (approval, changes requested, etc.)
 */
export interface PRReview {
  id: string
  author: { login: string }
  authorAssociation: string
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED'
  body: string
  submittedAt: string
}

/**
 * File changed in a PR
 */
export interface PRFile {
  path: string
  additions: number
  deletions: number
}

/**
 * Commit in a PR
 */
export interface PRCommit {
  oid: string
  messageHeadline: string
  author: { name: string; email: string }
  committedDate: string
}

/**
 * Line-specific review comment
 */
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

/**
 * Detailed PR information including comments, reviews, files
 */
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
  // Line-specific review comments (fetched separately)
  reviewComments?: PRReviewComment[]
}

/**
 * Result of PR list operations
 */
export interface PRListResult {
  prs: PullRequest[]
  error?: string
}

/**
 * Result of PR operations
 */
export interface PROperationResult {
  success: boolean
  message: string
  url?: string
}

/**
 * Options for creating a PR
 */
export interface CreatePROptions {
  title: string
  body?: string
  headBranch?: string
  baseBranch?: string
  draft?: boolean
  web?: boolean
}

/**
 * Options for merging a PR
 */
export interface MergePROptions {
  method?: MergeMethod
  deleteAfterMerge?: boolean
}

/**
 * Result of checkout operations
 */
export interface CheckoutResult {
  success: boolean
  message: string
  stashed?: string
}
