/**
 * Commit Service Module
 *
 * Exports all commit-related types and functions.
 *
 * Usage:
 * ```typescript
 * import { getCommitHistory, CommitInfo } from '@/lib/services/commit'
 *
 * const ctx = getRepositoryManager().requireActive()
 * const commits = await getCommitHistory(ctx, 50)
 * ```
 */

// Types
export type {
  CommitInfo,
  GraphCommit,
  UncommittedFile,
  CommitFileChange,
  CommitDetails,
  DiffFile,
  DiffLine,
  DiffHunk,
  FileDiff,
  CommitDiff,
  CommitResult,
  ResetResult,
  WorkingStatus,
  BranchDiff,
  BranchDiffType,
} from './commit-types'

// Service functions
export {
  getCommitHistory,
  getCommitHistoryForRef,
  getCommitGraphHistory,
  getUncommittedFiles,
  getCommitDetails,
  getCommitDiff,
  resetToCommit,
  commitChanges,
  getWorkingStatus,
  getBranchDiff,
} from './commit-service'
