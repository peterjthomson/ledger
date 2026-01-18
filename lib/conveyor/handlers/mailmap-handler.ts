import { handle } from '@/lib/main/shared'
import { getRepositoryManager } from '@/lib/repositories'
import {
  getMailmap,
  getAuthorIdentities,
  suggestMailmapEntries,
  addMailmapEntries,
  removeMailmapEntry,
  MailmapEntry,
} from '@/lib/services/mailmap'
import { serializeError } from '@/lib/utils/error-helpers'

export const registerMailmapHandlers = () => {
  handle('get-mailmap', async () => {
    try {
      const ctx = getRepositoryManager().requireActive()
      return await getMailmap(ctx)
    } catch (_error) {
      return []
    }
  })

  handle('get-author-identities', async () => {
    try {
      const ctx = getRepositoryManager().requireActive()
      return await getAuthorIdentities(ctx)
    } catch (_error) {
      return []
    }
  })

  handle('suggest-mailmap-entries', async () => {
    try {
      const ctx = getRepositoryManager().requireActive()
      return await suggestMailmapEntries(ctx)
    } catch (_error) {
      return []
    }
  })

  handle('add-mailmap-entries', async (entries: MailmapEntry[]) => {
    try {
      const ctx = getRepositoryManager().requireActive()
      return await addMailmapEntries(ctx, entries)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('remove-mailmap-entry', async (entry: MailmapEntry) => {
    try {
      const ctx = getRepositoryManager().requireActive()
      return await removeMailmapEntry(ctx, entry)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })
}
