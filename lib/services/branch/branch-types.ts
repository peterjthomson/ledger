/**
 * Branch Service Types
 *
 * Type definitions for branch-related operations.
 * These types are used by both the service and handlers.
 */

/**
 * Information about a single branch
 */
export interface BranchInfo {
  name: string
  current: boolean
  commit: string
  label: string
  isRemote: boolean
  // Extended metadata (populated by getBranchMetadata)
  lastCommitDate?: string
  firstCommitDate?: string
  commitCount?: number
  isLocalOnly?: boolean
  isMerged?: boolean
}

/**
 * Result of getBranches operations
 */
export interface BranchesResult {
  current: string
  branches: BranchInfo[]
}

/**
 * Metadata about a branch (expensive to compute)
 */
export interface BranchMetadata {
  lastCommitDate: string
  firstCommitDate: string
  commitCount: number
}

/**
 * Result of checkout operations
 */
export interface CheckoutResult {
  success: boolean
  message: string
  stashed?: string // Message if changes were auto-stashed
}

/**
 * Result of push operations
 */
export interface PushResult {
  success: boolean
  message: string
}

/**
 * Result of create branch operations
 */
export interface CreateBranchResult {
  success: boolean
  message: string
}

/**
 * Result of pull operations
 */
export interface PullResult {
  success: boolean
  message: string
  behind?: number
  ahead?: number
}
