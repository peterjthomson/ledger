import { handle } from '@/lib/main/shared'
import {
  stageFile,
  unstageFile,
  stageAll,
  unstageAll,
  discardFileChanges,
  getFileDiff,
  getWorkingStatus,
  getBehindMainCount,
  stageHunk,
  unstageHunk,
  discardHunk,
  stageLines,
  unstageLines,
  discardLines,
  getFileContent,
  saveFileContent,
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

  handle('get-behind-main-count', async () => {
    try {
      return await getBehindMainCount()
    } catch (_error) {
      return null
    }
  })

  // Hunk-level operations
  handle('stage-hunk', async (filePath: string, hunkIndex: number) => {
    try {
      return await stageHunk(filePath, hunkIndex)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('unstage-hunk', async (filePath: string, hunkIndex: number) => {
    try {
      return await unstageHunk(filePath, hunkIndex)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('discard-hunk', async (filePath: string, hunkIndex: number) => {
    try {
      return await discardHunk(filePath, hunkIndex)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  // Line-level operations
  handle('stage-lines', async (filePath: string, hunkIndex: number, lineIndices: number[]) => {
    try {
      return await stageLines(filePath, hunkIndex, lineIndices)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('unstage-lines', async (filePath: string, hunkIndex: number, lineIndices: number[]) => {
    try {
      return await unstageLines(filePath, hunkIndex, lineIndices)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('discard-lines', async (filePath: string, hunkIndex: number, lineIndices: number[]) => {
    try {
      return await discardLines(filePath, hunkIndex, lineIndices)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  // File content operations (for inline editing)
  handle('get-file-content', async (filePath: string) => {
    try {
      return await getFileContent(filePath)
    } catch (_error) {
      return null
    }
  })

  handle('save-file-content', async (filePath: string, content: string) => {
    try {
      return await saveFileContent(filePath, content)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })
}