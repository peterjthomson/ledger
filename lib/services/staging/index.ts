/**
 * Staging Service Module
 *
 * Exports all staging-related types and functions.
 *
 * Usage:
 * ```typescript
 * import { stageFile, unstageFile, getFileDiff } from '@/lib/services/staging'
 *
 * const ctx = getRepositoryManager().requireActive()
 * await stageFile(ctx, 'path/to/file.ts')
 * ```
 */

// Types
export type { StagingDiffHunk, StagingDiffLine, StagingFileDiff, StagingResult } from './staging-types'

// Service functions
export {
  stageFile,
  unstageFile,
  stageAll,
  unstageAll,
  discardFileChanges,
  getFileDiff,
} from './staging-service'
