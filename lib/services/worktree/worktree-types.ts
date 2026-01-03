/**
 * Worktree Service Types
 *
 * Type definitions for Worktree operations.
 * These types are used by both the service and handlers.
 */

/**
 * Agent types that can create worktrees
 */
export type WorktreeAgent = 'cursor' | 'claude' | 'conductor' | 'gemini' | 'junie' | 'unknown' | 'working-folder'

/**
 * Activity status based on how recently the worktree was modified
 */
export type WorktreeActivityStatus = 'active' | 'recent' | 'stale' | 'unknown'

/**
 * Basic worktree information from git worktree list
 */
export interface BasicWorktree {
  path: string
  head: string
  branch: string | null
  bare: boolean
}

/**
 * Enhanced worktree with agent detection and metadata
 */
export interface EnhancedWorktree {
  path: string
  head: string
  branch: string | null
  bare: boolean
  agent: WorktreeAgent
  /** For multiple worktrees from same agent, e.g., cursor-1, cursor-2 */
  agentIndex: number
  /** Context hint (primary file, branch name, or commit message) */
  contextHint: string
  /** Display name for UI */
  displayName: string
  /** Number of files changed in working directory */
  changedFileCount: number
  /** Lines added in working directory */
  additions: number
  /** Lines deleted in working directory */
  deletions: number
  /** Last modification time of any file in worktree */
  lastModified: string
  /** Activity status based on lastModified */
  activityStatus: WorktreeActivityStatus
  /** Optional hint about what the agent is working on */
  agentTaskHint: string | null
}

/**
 * Diff stats for a worktree
 */
export interface WorktreeDiffStats {
  changedFileCount: number
  additions: number
  deletions: number
}

/**
 * Options for creating a worktree
 */
export interface CreateWorktreeOptions {
  branchName: string
  folderPath: string
  isNewBranch: boolean
}

/**
 * Result of worktree operations
 */
export interface WorktreeResult {
  success: boolean
  message: string
  path?: string
}

/**
 * Result of apply/convert operations with stash info
 */
export interface WorktreeApplyResult {
  success: boolean
  message: string
  stashed?: string
}
