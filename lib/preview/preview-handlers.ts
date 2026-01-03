/**
 * Preview IPC Handlers
 *
 * Registers IPC handlers for the preview system.
 * Call registerPreviewHandlers() from main.ts during app initialization.
 */

import { ipcMain, shell } from 'electron'
import { previewRegistry, initializePreviewProviders } from './index'
import type { CreateWorktreeFn } from './preview-types'

/**
 * Register all preview-related IPC handlers
 *
 * @param createWorktree - Function from git-service to create worktrees
 */
export function registerPreviewHandlers(createWorktree: CreateWorktreeFn): void {
  // Initialize built-in providers
  initializePreviewProviders()

  // Get available providers for a project
  ipcMain.handle(
    'preview:get-providers',
    async (_event, repoPath: string, targetPath?: string) => {
      try {
        const providers = await previewRegistry.getAvailableProviders(repoPath, targetPath)
        return providers.map(({ provider, availability }) => ({
          id: provider.id,
          name: provider.name,
          description: provider.description,
          icon: provider.icon,
          type: provider.type,
          available: availability.available,
          compatible: availability.compatible,
          reason: availability.reason,
        }))
      } catch (error) {
        console.error('[Preview] Error getting providers:', error)
        return []
      }
    }
  )

  // Preview a worktree with specific provider
  ipcMain.handle(
    'preview:worktree',
    async (_event, providerId: string, worktreePath: string, mainRepoPath: string) => {
      const provider = previewRegistry.get(providerId)
      if (!provider) {
        return { success: false, message: `Unknown provider: ${providerId}` }
      }

      try {
        const result = await provider.previewWorktree(worktreePath, mainRepoPath, createWorktree)
        if (result.success && result.url) {
          await shell.openExternal(result.url)
        }
        return result
      } catch (error) {
        return { success: false, message: (error as Error).message }
      }
    }
  )

  // Preview a branch with specific provider
  ipcMain.handle(
    'preview:branch',
    async (_event, providerId: string, branchName: string, mainRepoPath: string) => {
      const provider = previewRegistry.get(providerId)
      if (!provider) {
        return { success: false, message: `Unknown provider: ${providerId}` }
      }

      try {
        const result = await provider.previewBranch(branchName, mainRepoPath, createWorktree)
        if (result.success && result.url) {
          await shell.openExternal(result.url)
        }
        return result
      } catch (error) {
        return { success: false, message: (error as Error).message }
      }
    }
  )

  // Preview a PR with specific provider
  ipcMain.handle(
    'preview:pr',
    async (
      _event,
      providerId: string,
      prNumber: number,
      prBranchName: string,
      mainRepoPath: string
    ) => {
      const provider = previewRegistry.get(providerId)
      if (!provider) {
        return { success: false, message: `Unknown provider: ${providerId}` }
      }

      try {
        const result = await provider.previewPR(prNumber, prBranchName, mainRepoPath, createWorktree)
        if (result.success && result.url) {
          await shell.openExternal(result.url)
        }
        return result
      } catch (error) {
        return { success: false, message: (error as Error).message }
      }
    }
  )

  // Auto-preview: Pick best provider and preview
  ipcMain.handle(
    'preview:auto-worktree',
    async (_event, worktreePath: string, mainRepoPath: string) => {
      const best = await previewRegistry.getBestProvider(mainRepoPath, worktreePath)
      if (!best) {
        return { success: false, message: 'No compatible preview provider found' }
      }

      try {
        const result = await best.provider.previewWorktree(
          worktreePath,
          mainRepoPath,
          createWorktree
        )
        if (result.success && result.url) {
          await shell.openExternal(result.url)
        }
        return { ...result, provider: best.provider.name }
      } catch (error) {
        return { success: false, message: (error as Error).message }
      }
    }
  )

  // Stop a preview
  ipcMain.handle('preview:stop', async (_event, providerId: string, worktreePath: string) => {
    const provider = previewRegistry.get(providerId)
    if (!provider) {
      return { success: false, message: `Unknown provider: ${providerId}` }
    }

    if (provider.stop) {
      provider.stop(worktreePath)
      return { success: true, message: 'Preview stopped' }
    }

    return { success: false, message: 'Provider does not support stopping' }
  })

  // Stop all previews
  ipcMain.handle('preview:stop-all', async () => {
    previewRegistry.stopAll()
    return { success: true, message: 'All previews stopped' }
  })

  // Check if preview is running
  ipcMain.handle('preview:is-running', async (_event, providerId: string, worktreePath: string) => {
    const provider = previewRegistry.get(providerId)
    if (!provider || !provider.isRunning) {
      return false
    }
    return provider.isRunning(worktreePath)
  })

  // Get URL of running preview
  ipcMain.handle('preview:get-url', async (_event, providerId: string, worktreePath: string) => {
    const provider = previewRegistry.get(providerId)
    if (!provider || !provider.getUrl) {
      return null
    }
    return provider.getUrl(worktreePath)
  })

  console.info('[Preview] IPC handlers registered')
}

/**
 * Cleanup preview system on app quit
 */
export function cleanupPreviewHandlers(): void {
  previewRegistry.stopAll()
  console.info('[Preview] Cleaned up all running previews')
}
