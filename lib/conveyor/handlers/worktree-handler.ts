import { dialog, shell } from 'electron'
import { handle } from '@/lib/main/shared'
import {
  getEnhancedWorktrees,
  convertWorktreeToBranch,
  applyWorktreeChanges,
  removeWorktree,
  createWorktree,
} from '@/lib/main/git-service'

export const registerWorktreeHandlers = () => {
  handle('get-worktrees', async () => {
    try {
      return await getEnhancedWorktrees()
    } catch (error) {
      return { error: (error as Error).message }
    }
  })

  handle('open-worktree', async (worktreePath: string) => {
    try {
      await shell.openPath(worktreePath)
      return { success: true, message: `Opened ${worktreePath}` }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('convert-worktree-to-branch', async (worktreePath: string) => {
    try {
      return await convertWorktreeToBranch(worktreePath)
    } catch (_error) {
      return null
    }
  })

  handle('apply-worktree-changes', async (worktreePath: string) => {
    try {
      return await applyWorktreeChanges(worktreePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('remove-worktree', async (worktreePath: string, force: boolean) => {
    try {
      return await removeWorktree(worktreePath, force)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('create-worktree', async (options: { branchName: string; isNewBranch: boolean; folderPath: string }) => {
    try {
      return await createWorktree(options)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('select-worktree-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Worktree Folder Location',
      buttonLabel: 'Select',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })
}
