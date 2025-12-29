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
} from '@/lib/main/git-service'

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
      return await applyStash(stashIndex)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('pop-stash', async (stashIndex: number) => {
    try {
      return await popStash(stashIndex)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('drop-stash', async (stashIndex: number) => {
    try {
      return await dropStash(stashIndex)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('stash-to-branch', async (stashIndex: number, branchName: string) => {
    try {
      return await stashToBranch(stashIndex, branchName)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })
}
