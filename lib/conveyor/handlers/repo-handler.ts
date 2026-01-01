import { dialog } from 'electron'
import { handle } from '@/lib/main/shared'
import { setRepoPath, getRepoPath, initializeLegacySync } from '@/lib/main/git-service'
import { getLastRepoPath, saveLastRepoPath, getRecentRepos, addRecentRepo, removeRecentRepo } from '@/lib/main/settings-service'
import { getRepositoryManager } from '@/lib/repositories'
import { emitRepoOpened, emitRepoClosed, emitRepoSwitched } from '@/lib/events'

// Check for --repo command line argument (for testing)
const repoArgIndex = process.argv.findIndex((arg) => arg.startsWith('--repo='))
const testRepoPath = repoArgIndex !== -1 ? process.argv[repoArgIndex].split('=')[1] : null

export interface RepositorySummary {
  id: string
  name: string
  path: string
  isActive: boolean
  provider: string
}

export const registerRepoHandlers = () => {
  // SAFETY: Initialize legacy sync so git-service globals stay in sync with RepositoryManager
  initializeLegacySync()

  handle('select-repo', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Git Repository',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const selectedPath = result.filePaths[0]
    const previousPath = getRepoPath()

    // Use RepositoryManager for the new architecture
    const manager = getRepositoryManager()
    try {
      const ctx = await manager.open(selectedPath)
      // Also update legacy global state for backward compatibility
      setRepoPath(ctx.path)
      saveLastRepoPath(ctx.path)

      // Emit events
      emitRepoOpened(ctx.path)
      if (previousPath && previousPath !== ctx.path) {
        emitRepoSwitched(previousPath, ctx.path)
      }

      return ctx.path
    } catch (error) {
      // Fall back to legacy behavior if RepositoryManager fails
      setRepoPath(selectedPath)
      saveLastRepoPath(selectedPath)

      // Emit events
      emitRepoOpened(selectedPath)
      if (previousPath && previousPath !== selectedPath) {
        emitRepoSwitched(previousPath, selectedPath)
      }

      return selectedPath
    }
  })

  handle('get-repo-path', () => {
    // Try RepositoryManager first
    const manager = getRepositoryManager()
    const active = manager.getActive()
    if (active) return active.path

    // Fall back to legacy
    return getRepoPath()
  })

  handle('get-saved-repo-path', () => {
    return getLastRepoPath()
  })

  handle('load-saved-repo', async () => {
    const manager = getRepositoryManager()

    // Check for test repo path first (command line argument)
    if (testRepoPath) {
      try {
        const ctx = await manager.open(testRepoPath)
        setRepoPath(ctx.path)
        return ctx.path
      } catch {
        setRepoPath(testRepoPath)
        return testRepoPath
      }
    }

    // Otherwise use saved settings
    const savedPath = getLastRepoPath()
    if (savedPath) {
      try {
        const ctx = await manager.open(savedPath)
        setRepoPath(ctx.path)
        return ctx.path
      } catch {
        setRepoPath(savedPath)
        return savedPath
      }
    }

    return null
  })

  // ============================================================================
  // Multi-Repository Management Handlers
  // ============================================================================

  /**
   * Get list of all open repositories
   */
  handle('list-repositories', (): RepositorySummary[] => {
    const manager = getRepositoryManager()
    return manager.getSummary()
  })

  /**
   * Switch to a repository by ID
   */
  handle('switch-repository', async (id: string): Promise<{ success: boolean; path?: string; error?: string }> => {
    const manager = getRepositoryManager()
    const previousPath = getRepoPath()

    const success = manager.setActive(id)
    if (!success) {
      return { success: false, error: 'Repository not found' }
    }

    const active = manager.getActive()
    if (active) {
      setRepoPath(active.path)
      saveLastRepoPath(active.path)

      // Emit switch event
      emitRepoSwitched(previousPath, active.path)

      return { success: true, path: active.path }
    }

    return { success: false, error: 'Failed to switch repository' }
  })

  /**
   * Close a repository by ID
   */
  handle('close-repository', (id: string): { success: boolean; error?: string } => {
    const manager = getRepositoryManager()

    // Get the repo path before closing
    const repos = manager.getSummary()
    const repoToClose = repos.find(r => r.id === id)
    const closingPath = repoToClose?.path

    const success = manager.close(id)
    if (!success) {
      return { success: false, error: 'Repository not found' }
    }

    // Emit close event
    if (closingPath) {
      emitRepoClosed(closingPath)
    }

    // Update legacy state
    const active = manager.getActive()
    setRepoPath(active?.path || null)
    if (active) {
      saveLastRepoPath(active.path)
      // If there's a new active repo after close, emit switch
      if (closingPath && repoToClose?.isActive) {
        emitRepoSwitched(closingPath, active.path)
      }
    }

    return { success: true }
  })

  /**
   * Open a repository by path (without dialog)
   */
  handle('open-repository', async (repoPath: string): Promise<{ success: boolean; id?: string; error?: string }> => {
    const manager = getRepositoryManager()
    const previousPath = getRepoPath()

    try {
      const ctx = await manager.open(repoPath)
      setRepoPath(ctx.path)
      saveLastRepoPath(ctx.path)
      addRecentRepo(ctx.path)

      // Emit events
      emitRepoOpened(ctx.path)
      if (previousPath && previousPath !== ctx.path) {
        emitRepoSwitched(previousPath, ctx.path)
      }

      return { success: true, id: ctx.id }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open repository' }
    }
  })

  /**
   * Get recently opened repositories from settings
   */
  handle('get-recent-repositories', (): string[] => {
    return getRecentRepos()
  })

  /**
   * Add a repository to recent list
   */
  handle('add-recent-repository', (repoPath: string): void => {
    addRecentRepo(repoPath)
  })

  /**
   * Remove a repository from recent list
   */
  handle('remove-recent-repository', (repoPath: string): void => {
    removeRecentRepo(repoPath)
  })
}
