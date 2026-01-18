/**
 * Preview Handler - Conveyor IPC handlers for the preview system
 *
 * Provides typed IPC handlers for previewing branches, PRs, worktrees, and commits.
 */

import { shell } from 'electron'
import { handle } from '@/lib/main/shared'
import { previewRegistry, initializePreviewProviders } from '@/lib/preview'
import {
  isHerdInstalled,
  isLaravelProject,
  setupWorktreeForPreview,
  ensurePreviewsDirectory,
  getPreviewWorktreePath,
} from '@/lib/main/herd-service'
import { createWorktree } from '@/lib/main/git-service'
import { existsSync } from 'fs'
import type { CreateWorktreeFn } from '@/lib/preview/preview-types'

// Initialize providers on first handler registration
let initialized = false

function ensureInitialized() {
  if (!initialized) {
    initializePreviewProviders()
    initialized = true
  }
}

// Wrapper for createWorktree that matches the CreateWorktreeFn signature
const createWorktreeFn: CreateWorktreeFn = async (options) => {
  return createWorktree({
    branchName: options.branchName,
    commitHash: options.commitHash,
    isNewBranch: options.isNewBranch,
    folderPath: options.folderPath,
  })
}

/**
 * Legacy Herd preview fallback for branches/PRs
 * Used when no provider is available/compatible
 */
async function legacyHerdPreview(
  worktreeName: string,
  branchName: string,
  mainRepoPath: string
): Promise<{ success: boolean; message: string; url?: string; worktreePath?: string; warnings?: string[] }> {
  await ensurePreviewsDirectory()
  const worktreePath = getPreviewWorktreePath(worktreeName)

  if (!existsSync(worktreePath)) {
    const createResult = await createWorktree({
      branchName,
      isNewBranch: false,
      folderPath: worktreePath,
    })

    if (!createResult.success) {
      return createResult
    }
  }

  const result = await setupWorktreeForPreview(worktreePath, mainRepoPath)
  if (result.success && result.url) {
    await shell.openExternal(result.url)
  }
  return { ...result, worktreePath }
}

export const registerPreviewHandlers = () => {
  ensureInitialized()

  // Check if preview is available (legacy Herd check)
  handle('preview:check-available', async (worktreePath: string) => {
    try {
      const herdInstalled = await isHerdInstalled()
      const isLaravel = isLaravelProject(worktreePath)
      return { herdInstalled, isLaravel }
    } catch (_error) {
      return { herdInstalled: false, isLaravel: false }
    }
  })

  // Get available providers for a project
  handle('preview:get-providers', async (repoPath: string, targetPath?: string) => {
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
  })

  // Preview a worktree with specific provider
  handle('preview:worktree', async (providerId: string, worktreePath: string, mainRepoPath: string) => {
    const provider = previewRegistry.get(providerId)
    if (!provider) {
      return { success: false, message: `Unknown provider: ${providerId}` }
    }

    try {
      const result = await provider.previewWorktree(worktreePath, mainRepoPath, createWorktreeFn)
      if (result.success && result.url) {
        await shell.openExternal(result.url)
      }
      return result
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  // Preview a branch with specific provider
  handle('preview:branch', async (providerId: string, branchName: string, mainRepoPath: string) => {
    const provider = previewRegistry.get(providerId)
    if (!provider) {
      return { success: false, message: `Unknown provider: ${providerId}` }
    }

    try {
      const result = await provider.previewBranch(branchName, mainRepoPath, createWorktreeFn)
      if (result.success && result.url) {
        await shell.openExternal(result.url)
      }
      return result
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  // Preview a PR with specific provider
  handle('preview:pr', async (providerId: string, prNumber: number, prBranchName: string, mainRepoPath: string) => {
    const provider = previewRegistry.get(providerId)
    if (!provider) {
      return { success: false, message: `Unknown provider: ${providerId}` }
    }

    try {
      const result = await provider.previewPR(prNumber, prBranchName, mainRepoPath, createWorktreeFn)
      if (result.success && result.url) {
        await shell.openExternal(result.url)
      }
      return result
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  // Preview a commit with specific provider
  handle('preview:commit', async (providerId: string, commitHash: string, mainRepoPath: string) => {
    const provider = previewRegistry.get(providerId)
    if (!provider) {
      return { success: false, message: `Unknown provider: ${providerId}` }
    }

    try {
      await ensurePreviewsDirectory()

      const shortHash = commitHash.substring(0, 7)
      const worktreePath = getPreviewWorktreePath(`commit-${shortHash}`)

      // Create worktree at specific commit if it doesn't exist
      if (!existsSync(worktreePath)) {
        const createResult = await createWorktree({
          commitHash,
          isNewBranch: false,
          folderPath: worktreePath,
        })

        if (!createResult.success) {
          return createResult
        }
      }

      // Use the provider to preview the worktree
      const result = await provider.previewWorktree(worktreePath, mainRepoPath, createWorktreeFn)
      if (result.success && result.url) {
        await shell.openExternal(result.url)
      }
      return { ...result, worktreePath, provider: provider.name }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  // Auto-preview worktree (pick best provider)
  handle('preview:auto-worktree', async (worktreePath: string, mainRepoPath: string) => {
    const best = await previewRegistry.getBestProvider(mainRepoPath, worktreePath)
    if (!best) {
      // Fall back to legacy Herd preview
      try {
        const result = await setupWorktreeForPreview(worktreePath, mainRepoPath)
        if (result.success && result.url) {
          await shell.openExternal(result.url)
        }
        return result
      } catch (error) {
        return { success: false, message: (error as Error).message }
      }
    }

    try {
      const result = await best.provider.previewWorktree(worktreePath, mainRepoPath, createWorktreeFn)
      if (result.success && result.url) {
        await shell.openExternal(result.url)
      }
      return { ...result, provider: best.provider.name }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  // Auto-preview branch (pick best provider)
  handle('preview:auto-branch', async (branchName: string, mainRepoPath: string) => {
    const best = await previewRegistry.getBestProvider(mainRepoPath)
    if (!best) {
      // Fall back to legacy Herd preview
      try {
        const safeBranchName = branchName.replace(/\//g, '-')
        return await legacyHerdPreview(safeBranchName, branchName, mainRepoPath)
      } catch (error) {
        return { success: false, message: (error as Error).message }
      }
    }

    try {
      const result = await best.provider.previewBranch(branchName, mainRepoPath, createWorktreeFn)
      if (result.success && result.url) {
        await shell.openExternal(result.url)
      }
      return { ...result, provider: best.provider.name }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  // Auto-preview PR (pick best provider)
  handle('preview:auto-pr', async (prNumber: number, prBranchName: string, mainRepoPath: string) => {
    const best = await previewRegistry.getBestProvider(mainRepoPath)
    if (!best) {
      // Fall back to legacy Herd preview
      try {
        return await legacyHerdPreview(`pr-${prNumber}`, prBranchName, mainRepoPath)
      } catch (error) {
        return { success: false, message: (error as Error).message }
      }
    }

    try {
      const result = await best.provider.previewPR(prNumber, prBranchName, mainRepoPath, createWorktreeFn)
      if (result.success && result.url) {
        await shell.openExternal(result.url)
      }
      return { ...result, provider: best.provider.name }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  // Stop a preview
  handle('preview:stop', async (providerId: string, worktreePath: string) => {
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
  handle('preview:stop-all', async () => {
    previewRegistry.stopAll()
    return { success: true, message: 'All previews stopped' }
  })

  // Check if preview is running
  handle('preview:is-running', async (providerId: string, worktreePath: string) => {
    const provider = previewRegistry.get(providerId)
    if (!provider || !provider.isRunning) {
      return false
    }
    return provider.isRunning(worktreePath)
  })

  // Get URL of running preview
  handle('preview:get-url', async (providerId: string, worktreePath: string) => {
    const provider = previewRegistry.get(providerId)
    if (!provider || !provider.getUrl) {
      return null
    }
    return provider.getUrl(worktreePath)
  })

  console.info('[Preview] Conveyor handlers registered')
}

/**
 * Cleanup preview system on app quit
 */
export function cleanupPreviewHandlers(): void {
  previewRegistry.stopAll()
  console.info('[Preview] Cleaned up all running previews')
}
