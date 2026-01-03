/**
 * Branch Service Module
 *
 * Exports all branch-related types and functions.
 *
 * Usage:
 * ```typescript
 * import { getBranches, checkoutBranch, BranchInfo } from '@/lib/services/branch'
 *
 * const ctx = getRepositoryManager().requireActive()
 * const { branches } = await getBranches(ctx)
 * ```
 */

// Types
export type {
  BranchInfo,
  BranchesResult,
  BranchMetadata,
  CheckoutResult,
  PushResult,
  CreateBranchResult,
  PullResult,
} from './branch-types'

// Service functions
export {
  getBranches,
  getBranchMetadata,
  getUnmergedBranches,
  getBranchesBasic,
  getBranchesWithMetadata,
  hasUncommittedChanges,
  stashChanges,
  checkoutBranch,
  pushBranch,
  createBranch,
  checkoutRemoteBranch,
  pullBranch,
  deleteBranch,
} from './branch-service'
