/**
 * PR Service Module
 *
 * Exports all Pull Request-related types and functions.
 *
 * Usage:
 * ```typescript
 * import { getPullRequests, createPullRequest, PullRequest } from '@/lib/services/pr'
 *
 * const ctx = getRepositoryManager().requireActive()
 * const { prs, error } = await getPullRequests(ctx)
 * ```
 *
 * NOTE: PR operations require GitHub CLI (gh) to be installed and authenticated.
 */

// Types
export type {
  PullRequest,
  MergeMethod,
  PRComment,
  PRReview,
  PRFile,
  PRCommit,
  PRReviewComment,
  PRDetail,
  PRListResult,
  PROperationResult,
  CreatePROptions,
  MergePROptions,
  CheckoutResult,
} from './pr-types'

// Service functions
export {
  getGitHubUrl,
  getPullRequests,
  openPullRequest,
  createPullRequest,
  mergePullRequest,
  getPRDetail,
  getPRReviewComments,
  getPRFileDiff,
  commentOnPR,
  mergePR,
  openBranchInGitHub,
  checkoutPRBranch,
} from './pr-service'
