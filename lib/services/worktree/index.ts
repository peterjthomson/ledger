/**
 * Worktree Service Module
 *
 * Exports all worktree-related types and functions.
 *
 * Usage:
 * ```typescript
 * import { getWorktrees, getEnhancedWorktrees, EnhancedWorktree } from '@/lib/services/worktree'
 *
 * const ctx = getRepositoryManager().requireActive()
 * const worktrees = await getEnhancedWorktrees(ctx)
 * ```
 */

// Types
export type {
  WorktreeAgent,
  WorktreeActivityStatus,
  BasicWorktree,
  EnhancedWorktree,
  WorktreeDiffStats,
  CreateWorktreeOptions,
  WorktreeResult,
  WorktreeApplyResult,
} from './worktree-types'

// Service functions
export {
  getWorktrees,
  getEnhancedWorktrees,
  convertWorktreeToBranch,
  applyWorktreeChanges,
  removeWorktree,
  createWorktree,
  getWorktreePath,
} from './worktree-service'
