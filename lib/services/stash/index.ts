/**
 * Stash Service Module
 *
 * Exports all stash-related types and functions.
 *
 * Usage:
 * ```typescript
 * import { getStashes, applyStash, StashEntry } from '@/lib/services/stash'
 *
 * const ctx = getRepositoryManager().requireActive()
 * const stashes = await getStashes(ctx)
 * ```
 */

// Types
export type { StashEntry, StashFile, StashResult } from './stash-types'

// Service functions
export {
  getStashes,
  getStashFiles,
  getStashFileDiff,
  getStashDiff,
  applyStash,
  popStash,
  dropStash,
  stashToBranch,
} from './stash-service'
