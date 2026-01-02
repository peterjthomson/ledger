import { dialog } from 'electron'
import { simpleGit } from 'simple-git'
import * as path from 'path'
import { handle } from '@/lib/main/shared'
import { safeExec } from '@/lib/utils/safe-exec'
import { setRepoPath, getRepoPath, initializeGlobalStateSync } from '@/lib/main/git-service'
import { getLastRepoPath, saveLastRepoPath, getRecentRepos, addRecentRepo, removeRecentRepo } from '@/lib/main/settings-service'
import { getRepositoryManager } from '@/lib/repositories'
import { parseGitHubRepo, createRemoteRepositoryContext } from '@/lib/repositories/repository-context'
import { emitRepoOpened, emitRepoClosed, emitRepoSwitched } from '@/lib/events'

// Check for --repo command line argument (for testing)
const repoArgIndex = process.argv.findIndex((arg) => arg.startsWith('--repo='))
const testRepoPath = repoArgIndex !== -1 ? process.argv[repoArgIndex].split('=')[1] : null

export interface RepositorySummary {
  id: string
  name: string
  path: string | null
  isActive: boolean
  provider: string
  type: 'local' | 'remote'
  remote: { owner: string; repo: string; fullName: string } | null
}

export const registerRepoHandlers = () => {
  // Initialize global state sync so git-service module state stays in sync with RepositoryManager
  initializeGlobalStateSync().catch((err) => console.error('Failed to initialize global state sync:', err))

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

    // Open in RepositoryManager and sync module state
    const manager = getRepositoryManager()
    try {
      const ctx = await manager.open(selectedPath)
      // Update module state
      setRepoPath(ctx.path)
      saveLastRepoPath(ctx.path)
      addRecentRepo(ctx.path)

      // Emit events
      emitRepoOpened(ctx.path)
      if (previousPath && previousPath !== ctx.path) {
        emitRepoSwitched(previousPath, ctx.path)
      }

      return ctx.path
    } catch (_error) {
      // Direct path handling if RepositoryManager fails
      setRepoPath(selectedPath)
      saveLastRepoPath(selectedPath)
      addRecentRepo(selectedPath)

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

    // Fall back to module state
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
    try {
      const manager = getRepositoryManager()
      return manager.getSummary()
    } catch (error) {
      console.error('[repo-handler] list-repositories error:', error)
      return [] // Return empty array on error instead of throwing
    }
  })

  /**
   * Switch to a repository by ID
   */
  handle('switch-repository', async (id: string): Promise<{ success: boolean; path?: string; message?: string }> => {
    const manager = getRepositoryManager()
    const previousPath = getRepoPath()

    const success = manager.setActive(id)
    if (!success) {
      return { success: false, message: 'Repository not found' }
    }

    const active = manager.getActive()
    if (active) {
      // Only sync module state for local repos (remote repos have null path)
      if (active.path) {
        setRepoPath(active.path)
        saveLastRepoPath(active.path)
      } else {
        setRepoPath(null)
      }

      // Emit switch event (use fullName for remote repos)
      const activePath = active.path || active.remote?.fullName || null
      emitRepoSwitched(previousPath, activePath)

      return { success: true, path: active.path ?? undefined }
    }

    return { success: false, message: 'Failed to switch repository' }
  })

  /**
   * Close a repository by ID
   */
  handle('close-repository', (id: string): { success: boolean; message?: string } => {
    const manager = getRepositoryManager()

    // Get the repo info before closing
    const repos = manager.getSummary()
    const repoToClose = repos.find(r => r.id === id)
    // Use path for local repos, fullName for remote repos
    const closingPath = repoToClose?.path || repoToClose?.remote?.fullName || null

    const success = manager.close(id)
    if (!success) {
      return { success: false, message: 'Repository not found' }
    }

    // Emit close event
    if (closingPath) {
      emitRepoClosed(closingPath)
    }

    // Update module state
    const active = manager.getActive()
    setRepoPath(active?.path ?? null)
    if (active && active.path) {
      saveLastRepoPath(active.path)
    }
    // If there's a new active repo after close, emit switch
    if (active && closingPath && repoToClose?.isActive) {
      const activePath = active.path || active.remote?.fullName || null
      emitRepoSwitched(closingPath, activePath)
    }

    return { success: true }
  })

  /**
   * Open a repository by path (without dialog)
   */
  handle('open-repository', async (repoPath: string): Promise<{ success: boolean; id?: string; message?: string }> => {
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
      return { success: false, message: error instanceof Error ? error.message : 'Failed to open repository' }
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

  /**
   * Connect to a remote GitHub repository (API-only, no clone)
   * Uses `gh` CLI to validate and fetch repo info
   */
  handle('connect-remote-repository', async (repoInput: string): Promise<{
    success: boolean
    id?: string
    name?: string
    fullName?: string
    message?: string
  }> => {
    // Parse the input to extract owner/repo
    const remoteInfo = parseGitHubRepo(repoInput)
    if (!remoteInfo) {
      return { success: false, message: 'Invalid repository format. Use owner/repo or a GitHub URL.' }
    }

    const { owner, repo, fullName } = remoteInfo

    // Check if already connected
    const manager = getRepositoryManager()
    const existing = manager.getByRemote(fullName)
    if (existing) {
      manager.setActive(existing.id)
      return { success: true, id: existing.id, name: repo, fullName }
    }

    // Use gh CLI to validate the repo exists and get info
    // Uses safeExec to prevent command injection from owner/repo values
    try {
      const apiResult = await safeExec(
        'gh',
        ['api', `repos/${owner}/${repo}`, '--jq', '{default_branch: .default_branch, html_url: .html_url}'],
        { timeout: 30000 }
      )

      if (!apiResult.success) {
        throw new Error(apiResult.stderr || 'Failed to fetch repository info')
      }

      const repoInfo = JSON.parse(apiResult.stdout.trim())

      // Create remote repository context
      const context = createRemoteRepositoryContext(owner, repo, repoInfo)

      // Add to manager
      manager.addRemote(context, true)

      // Emit event
      emitRepoOpened(fullName)

      return { success: true, id: context.id, name: repo, fullName }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to repository'

      // Check for common errors
      if (errorMessage.includes('Could not resolve')) {
        return { success: false, message: `Repository not found: ${fullName}` }
      }
      if (errorMessage.includes('gh: command not found') || errorMessage.includes('not recognized')) {
        return { success: false, message: 'GitHub CLI (gh) is not installed. Please install it from https://cli.github.com' }
      }
      if (errorMessage.includes('not logged in')) {
        return { success: false, message: 'Not authenticated with GitHub. Run: gh auth login' }
      }

      return { success: false, message: errorMessage }
    }
  })

  /**
   * Clone a remote repository
   * Shows a folder picker dialog to select destination, then clones the repo
   */
  handle('clone-repository', async (gitUrl: string): Promise<{ success: boolean; path?: string; message?: string }> => {
    // Show folder picker for destination
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Clone Destination',
      buttonLabel: 'Clone Here',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: 'Clone cancelled' }
    }

    const destDir = result.filePaths[0]

    // Extract repo name from URL for the folder name
    let repoName = 'repository'
    try {
      // Handle both https and ssh URLs
      const match = gitUrl.match(/\/([^/]+?)(\.git)?$/) || gitUrl.match(/:([^/]+?)(\.git)?$/)
      if (match) {
        repoName = match[1]
      }
    } catch {
      // Use default name
    }

    const clonePath = path.join(destDir, repoName)

    try {
      // Clone the repository
      const git = simpleGit()
      await git.clone(gitUrl, clonePath)

      // Open the cloned repository
      const manager = getRepositoryManager()
      const previousPath = getRepoPath()
      const ctx = await manager.open(clonePath)

      setRepoPath(ctx.path)
      saveLastRepoPath(ctx.path)
      addRecentRepo(ctx.path)

      // Emit events
      emitRepoOpened(ctx.path)
      if (previousPath && previousPath !== ctx.path) {
        emitRepoSwitched(previousPath, ctx.path)
      }

      return { success: true, path: ctx.path }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to clone repository'
      }
    }
  })
}
