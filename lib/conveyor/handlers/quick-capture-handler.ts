/**
 * Quick Capture IPC Handlers
 *
 * Handlers for the Quick Capture menu bar widget.
 */

import { ipcMain } from 'electron'
import {
  captureScreenshot,
  createQuickIssue,
  getQuickCaptureSettings,
  getQuickLabels,
  getPriorityLabels,
} from '@/lib/services/quick-capture'
import { getRepoPath } from '@/lib/main/git-service'
import { hideQuickCapture, updateBadgeCount } from '@/lib/main/tray'
import { getRepositoryManager } from '@/lib/repositories'

/**
 * Register all Quick Capture IPC handlers
 */
export function registerQuickCaptureHandlers(): void {
  // Create issue from quick capture
  ipcMain.handle(
    'quick-capture:create-issue',
    async (
      _event,
      issue: {
        description: string
        screenshot?: string
        labels?: string[]
        priority?: string
        repoPath: string
      }
    ) => {
      const result = await createQuickIssue(issue)

      // Update badge count after creating issue
      if (result.success) {
        await updateBadgeCount()
      }

      return result
    }
  )

  // Capture screenshot
  ipcMain.handle('quick-capture:screenshot', async () => {
    return captureScreenshot()
  })

  // Get recent repositories
  ipcMain.handle('quick-capture:recent-repos', async () => {
    try {
      const repoManager = getRepositoryManager()
      const repos = repoManager.getRecentRepositories()

      return repos.map((repo) => ({
        path: repo.path,
        name: repo.name,
        owner: repo.remote?.owner,
      }))
    } catch {
      return []
    }
  })

  // Get current repository
  ipcMain.handle('quick-capture:current-repo', async () => {
    return getRepoPath()
  })

  // Get quick labels for a repo
  ipcMain.handle('quick-capture:labels', async (_event, repoPath: string) => {
    return getQuickLabels(repoPath)
  })

  // Get priority labels for a repo
  ipcMain.handle('quick-capture:priority-labels', async (_event, repoPath: string) => {
    return getPriorityLabels(repoPath)
  })

  // Get settings
  ipcMain.handle('quick-capture:settings', async () => {
    return getQuickCaptureSettings()
  })

  // Hide window
  ipcMain.on('quick-capture:hide', () => {
    hideQuickCapture()
  })
}
