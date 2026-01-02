import { handle } from '@/lib/main/shared'
import {
  getStashes,
  getStashFiles,
  getStashFileDiff,
  getStashDiff,
  applyStash,
  popStash,
  dropStash,
  stashToBranch,
  getRepoPath,
} from '@/lib/main/git-service'
import { emitGitStash } from '@/lib/events'
import { serializeError, logHandlerError } from '@/lib/utils/error-helpers'

export const registerStashHandlers = () => {
  handle('get-stashes', async () => {
    try {
      return await getStashes()
    } catch (_error) {
      return []
    }
  })

  handle('get-stash-files', async (stashIndex: number) => {
    try {
      return await getStashFiles(stashIndex)
    } catch (_error) {
      return []
    }
  })

  handle('get-stash-file-diff', async (stashIndex: number, filePath: string) => {
    try {
      return await getStashFileDiff(stashIndex, filePath)
    } catch (_error) {
      return null
    }
  })

  handle('get-stash-diff', async (stashIndex: number) => {
    try {
      return await getStashDiff(stashIndex)
    } catch (_error) {
      return null
    }
  })

  handle('apply-stash', async (stashIndex: number) => {
    try {
      const result = await applyStash(stashIndex)
      if (result.success) {
        const path = getRepoPath()
        if (path) emitGitStash(path, 'apply')
      }
      return result
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('pop-stash', async (stashIndex: number) => {
    try {
      const result = await popStash(stashIndex)
      if (result.success) {
        const path = getRepoPath()
        if (path) emitGitStash(path, 'pop')
      }
      return result
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('drop-stash', async (stashIndex: number) => {
    try {
      const result = await dropStash(stashIndex)
      if (result.success) {
        const path = getRepoPath()
        if (path) emitGitStash(path, 'drop')
      }
      return result
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('stash-to-branch', async (stashIndex: number, branchName: string) => {
    try {
      return await stashToBranch(stashIndex, branchName)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })
}
