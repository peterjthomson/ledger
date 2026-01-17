/**
 * Mailmap Service Module
 *
 * Exports all mailmap-related types and functions.
 *
 * Usage:
 * ```typescript
 * import { getMailmap, addMailmapEntries, MailmapEntry } from '@/lib/services/mailmap'
 *
 * const ctx = getRepositoryManager().requireActive()
 * const entries = await getMailmap(ctx)
 * ```
 */

// Types
export type {
  AuthorIdentity,
  MailmapEntry,
  MailmapSuggestion,
  MailmapResult,
} from './mailmap-types'

// Service functions
export {
  getMailmap,
  getAuthorIdentities,
  suggestMailmapEntries,
  addMailmapEntries,
  removeMailmapEntry,
} from './mailmap-service'
