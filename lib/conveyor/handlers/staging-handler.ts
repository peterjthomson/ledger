import { handle } from '@/lib/main/shared'
import {
  stageFile,
  unstageFile,
  stageAll,
  unstageAll,
  discardFileChanges,
  getFileDiff,
  getWorkingStatus,
} from '@/lib/main/git-service'
import { serializeError } from '@/lib/utils/error-helpers'

export const registerStagingHandlers = () => {
  handle('get-staging-status', async () => {
    try {
      return await getWorkingStatus()
    } catch (error) {
      // Return empty status object instead of null to prevent UI crashes
      console.error('[staging-handler] get-staging-status error:', error)
      return {
        hasChanges: false,
        files: [],
        stagedCount: 0,
        unstagedCount: 0,
        additions: 0,
        deletions: 0,
      }
    }
  })
  handle('stage-file', async (filePath: string) => {
    try {
      return await stageFile(filePath)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('unstage-file', async (filePath: string) => {
    try {
      return await unstageFile(filePath)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('stage-all', async () => {
    try {
      return await stageAll()
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('unstage-all', async () => {
    try {
      return await unstageAll()
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('discard-file-changes', async (filePath: string) => {
    try {
      return await discardFileChanges(filePath)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('get-file-diff', async (filePath: string, staged: boolean) => {
    try {
      return await getFileDiff(filePath, staged)
    } catch (_error) {
      return null
    }
  })
}