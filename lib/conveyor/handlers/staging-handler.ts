import { handle } from '@/lib/main/shared'
import {
  stageFile,
  unstageFile,
  stageAll,
  unstageAll,
  discardFileChanges,
  getFileDiff,
} from '@/lib/main/git-service'

export const registerStagingHandlers = () => {
  handle('stage-file', async (filePath: string) => {
    try {
      return await stageFile(filePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('unstage-file', async (filePath: string) => {
    try {
      return await unstageFile(filePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('stage-all', async () => {
    try {
      return await stageAll()
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('unstage-all', async () => {
    try {
      return await unstageAll()
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('discard-file-changes', async (filePath: string) => {
    try {
      return await discardFileChanges(filePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
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
