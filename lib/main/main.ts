import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import fixPath from 'fix-path'
import { createAppWindow } from './app'
import { registerResourcesProtocol } from './protocols'

// Fix PATH for macOS when launched from Finder/Dock (not terminal)
// Without this, git/gh commands may not be found if installed via Homebrew
fixPath()
import {
  setRepoPath,
  getRepoPath,
  getBranches,
  getBranchesBasic,
  getBranchesWithMetadata,
  getEnhancedWorktrees,
  checkoutBranch,
  createBranch,
  deleteBranch,
  deleteRemoteBranch,
  pushBranch,
  checkoutRemoteBranch,
  getPullRequests,
  openPullRequest,
  createPullRequest,
  getGitHubUrl,
  openBranchInGitHub,
  pullBranch,
  checkoutPRBranch,
  getCommitHistory,
  getWorkingStatus,
  resetToCommit,
  // Focus mode APIs
  getCommitGraphHistory,
  getCommitDiff,
  getBranchDiff,
  getStashes,
  getStashFiles,
  getStashFileDiff,
  getStashFileDiffParsed,
  getStashDiff,
  applyStash,
  popStash,
  dropStash,
  stashToBranch,
  applyStashToBranch,
  convertWorktreeToBranch,
  applyWorktreeChanges,
  removeWorktree,
  createWorktree,
  // Staging & commit APIs
  stageFile,
  unstageFile,
  stageAll,
  unstageAll,
  discardFileChanges,
  discardAllChanges,
  getFileDiff,
  commitChanges,
  pullCurrentBranch,
  // Worktree-specific staging & commit APIs
  getWorktreeWorkingStatus,
  stageFileInWorktree,
  unstageFileInWorktree,
  stageAllInWorktree,
  unstageAllInWorktree,
  getFileDiffInWorktree,
  commitInWorktree,
  pushWorktreeBranch,
  // PR Review APIs
  getPRDetail,
  getPRReviewComments,
  getPRFileDiff,
  commentOnPR,
  mergePR,
} from './git-service'
import {
  getLastRepoPath,
  saveLastRepoPath,
  getThemeMode,
  saveThemeMode,
  getCustomTheme,
  loadVSCodeThemeFile,
  loadBuiltInTheme,
  clearCustomTheme,
  mapVSCodeThemeToCSS,
  // Canvas functions
  getCanvases,
  saveCanvases,
  getActiveCanvasId,
  saveActiveCanvasId,
  addCanvas,
  removeCanvas,
  updateCanvas,
} from './settings-service'

// Check for --repo command line argument (for testing)
const repoArgIndex = process.argv.findIndex((arg) => arg.startsWith('--repo='))
const testRepoPath = repoArgIndex !== -1 ? process.argv[repoArgIndex].split('=')[1] : null

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Register git IPC handlers
  ipcMain.handle('select-repo', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Git Repository',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const path = result.filePaths[0]
    setRepoPath(path)
    saveLastRepoPath(path) // Save for next launch
    return path
  })

  ipcMain.handle('get-repo-path', () => {
    return getRepoPath()
  })

  ipcMain.handle('get-saved-repo-path', () => {
    return getLastRepoPath()
  })

  ipcMain.handle('load-saved-repo', () => {
    // Check for test repo path first (command line argument)
    if (testRepoPath) {
      setRepoPath(testRepoPath)
      return testRepoPath
    }
    // Otherwise use saved settings
    const savedPath = getLastRepoPath()
    if (savedPath) {
      setRepoPath(savedPath)
      return savedPath
    }
    return null
  })

  ipcMain.handle('get-branches', async () => {
    try {
      return await getBranches()
    } catch (error) {
      return { error: (error as Error).message }
    }
  })

  // Fast branch loading for initial render (no per-branch metadata)
  ipcMain.handle('get-branches-basic', async () => {
    try {
      return await getBranchesBasic()
    } catch (error) {
      return { error: (error as Error).message }
    }
  })

  ipcMain.handle('get-branches-with-metadata', async () => {
    try {
      return await getBranchesWithMetadata()
    } catch (error) {
      return { error: (error as Error).message }
    }
  })

  ipcMain.handle('get-worktrees', async () => {
    try {
      return await getEnhancedWorktrees()
    } catch (error) {
      return { error: (error as Error).message }
    }
  })

  ipcMain.handle('checkout-branch', async (_, branchName: string) => {
    try {
      return await checkoutBranch(branchName)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('create-branch', async (_, branchName: string, checkout: boolean = true) => {
    try {
      return await createBranch(branchName, checkout)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('delete-branch', async (_, branchName: string, force: boolean = false) => {
    try {
      return await deleteBranch(branchName, force)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('delete-remote-branch', async (_, branchName: string) => {
    try {
      return await deleteRemoteBranch(branchName)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('push-branch', async (_, branchName?: string, setUpstream: boolean = true) => {
    try {
      return await pushBranch(branchName, setUpstream)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('checkout-remote-branch', async (_, remoteBranch: string) => {
    try {
      return await checkoutRemoteBranch(remoteBranch)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('open-worktree', async (_, worktreePath: string) => {
    try {
      // Open the worktree folder in Finder/Explorer
      await shell.openPath(worktreePath)
      return { success: true, message: `Opened ${worktreePath}` }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('get-pull-requests', async () => {
    return await getPullRequests()
  })

  ipcMain.handle('open-pull-request', async (_, url: string) => {
    return await openPullRequest(url)
  })

  ipcMain.handle(
    'create-pull-request',
    async (
      _,
      options: {
        title: string
        body?: string
        baseBranch?: string
        draft?: boolean
        web?: boolean
      }
    ) => {
      try {
        return await createPullRequest(options)
      } catch (error) {
        return { success: false, message: (error as Error).message }
      }
    }
  )

  ipcMain.handle('get-github-url', async () => {
    return await getGitHubUrl()
  })

  ipcMain.handle('open-branch-in-github', async (_, branchName: string) => {
    return await openBranchInGitHub(branchName)
  })

  ipcMain.handle('pull-branch', async (_, remoteBranch: string) => {
    return await pullBranch(remoteBranch)
  })

  ipcMain.handle('checkout-pr-branch', async (_, prNumber: number) => {
    return await checkoutPRBranch(prNumber)
  })

  ipcMain.handle('get-commit-history', async (_, limit?: number) => {
    try {
      return await getCommitHistory(limit)
    } catch (_error) {
      return []
    }
  })

  ipcMain.handle('get-working-status', async () => {
    try {
      return await getWorkingStatus()
    } catch (_error) {
      return { hasChanges: false, files: [], stagedCount: 0, unstagedCount: 0 }
    }
  })

  ipcMain.handle('reset-to-commit', async (_, commitHash: string, mode: 'soft' | 'mixed' | 'hard') => {
    try {
      return await resetToCommit(commitHash, mode)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  // Focus mode APIs
  ipcMain.handle(
    'get-commit-graph-history',
    async (_, limit?: number, skipStats?: boolean, showCheckpoints?: boolean) => {
      try {
        return await getCommitGraphHistory(limit, skipStats, showCheckpoints)
      } catch (_error) {
        return []
      }
    }
  )

  ipcMain.handle('get-commit-diff', async (_, commitHash: string) => {
    try {
      return await getCommitDiff(commitHash)
    } catch (_error) {
      return null
    }
  })

  ipcMain.handle('get-branch-diff', async (_, branchName: string, diffType?: 'diff' | 'changes' | 'preview') => {
    try {
      return await getBranchDiff(branchName, diffType)
    } catch (_error) {
      return null
    }
  })

  ipcMain.handle('convert-worktree-to-branch', async (_, worktreePath: string) => {
    try {
      return await convertWorktreeToBranch(worktreePath)
    } catch (_error) {
      return null
    }
  })

  ipcMain.handle('apply-worktree-changes', async (_, worktreePath: string) => {
    try {
      return await applyWorktreeChanges(worktreePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('remove-worktree', async (_, worktreePath: string, force: boolean) => {
    try {
      return await removeWorktree(worktreePath, force)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('create-worktree', async (_, options: { branchName: string; isNewBranch: boolean; folderPath: string }) => {
    try {
      return await createWorktree(options)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  // Worktree-specific staging & commit handlers
  ipcMain.handle('get-worktree-working-status', async (_, worktreePath: string) => {
    try {
      return await getWorktreeWorkingStatus(worktreePath)
    } catch (_error) {
      return { hasChanges: false, files: [], stagedCount: 0, unstagedCount: 0, additions: 0, deletions: 0 }
    }
  })

  ipcMain.handle('stage-file-in-worktree', async (_, worktreePath: string, filePath: string) => {
    try {
      return await stageFileInWorktree(worktreePath, filePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('unstage-file-in-worktree', async (_, worktreePath: string, filePath: string) => {
    try {
      return await unstageFileInWorktree(worktreePath, filePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('stage-all-in-worktree', async (_, worktreePath: string) => {
    try {
      return await stageAllInWorktree(worktreePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('unstage-all-in-worktree', async (_, worktreePath: string) => {
    try {
      return await unstageAllInWorktree(worktreePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('get-file-diff-in-worktree', async (_, worktreePath: string, filePath: string, staged: boolean) => {
    try {
      return await getFileDiffInWorktree(worktreePath, filePath, staged)
    } catch (_error) {
      return null
    }
  })

  ipcMain.handle('commit-in-worktree', async (_, worktreePath: string, message: string, description?: string) => {
    try {
      return await commitInWorktree(worktreePath, message, description)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('push-worktree-branch', async (_, worktreePath: string) => {
    try {
      return await pushWorktreeBranch(worktreePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('select-worktree-folder', async () => {
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

  ipcMain.handle('get-stashes', async () => {
    try {
      return await getStashes()
    } catch (_error) {
      return []
    }
  })

  ipcMain.handle('get-stash-files', async (_, stashIndex: number) => {
    try {
      return await getStashFiles(stashIndex)
    } catch (_error) {
      return []
    }
  })

  ipcMain.handle('get-stash-file-diff', async (_, stashIndex: number, filePath: string) => {
    try {
      return await getStashFileDiff(stashIndex, filePath)
    } catch (_error) {
      return null
    }
  })

  ipcMain.handle('get-stash-file-diff-parsed', async (_, stashIndex: number, filePath: string) => {
    try {
      return await getStashFileDiffParsed(stashIndex, filePath)
    } catch (_error) {
      return null
    }
  })

  ipcMain.handle('get-stash-diff', async (_, stashIndex: number) => {
    try {
      return await getStashDiff(stashIndex)
    } catch (_error) {
      return null
    }
  })

  ipcMain.handle('apply-stash', async (_, stashIndex: number) => {
    try {
      return await applyStash(stashIndex)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('pop-stash', async (_, stashIndex: number) => {
    try {
      return await popStash(stashIndex)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('drop-stash', async (_, stashIndex: number) => {
    try {
      return await dropStash(stashIndex)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('stash-to-branch', async (_, stashIndex: number, branchName: string) => {
    try {
      return await stashToBranch(stashIndex, branchName)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  // Apply stash to a different branch using worktrees (Ledger's "leapfrog" feature)
  ipcMain.handle('apply-stash-to-branch', async (_, stashIndex: number, targetBranch: string, stashMessage: string, keepWorktree?: boolean) => {
    try {
      return await applyStashToBranch(stashIndex, targetBranch, stashMessage, keepWorktree ?? false)
    } catch (error) {
      return { success: false, message: (error as Error).message, usedExistingWorktree: false }
    }
  })

  // Staging & Commit handlers
  ipcMain.handle('stage-file', async (_, filePath: string) => {
    try {
      return await stageFile(filePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('unstage-file', async (_, filePath: string) => {
    try {
      return await unstageFile(filePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('stage-all', async () => {
    try {
      return await stageAll()
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('unstage-all', async () => {
    try {
      return await unstageAll()
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('discard-file-changes', async (_, filePath: string) => {
    try {
      return await discardFileChanges(filePath)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('discard-all-changes', async () => {
    try {
      return await discardAllChanges()
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('get-file-diff', async (_, filePath: string, staged: boolean) => {
    try {
      return await getFileDiff(filePath, staged)
    } catch (_error) {
      return null
    }
  })

  ipcMain.handle('commit-changes', async (_, message: string, description?: string, force?: boolean) => {
    try {
      return await commitChanges(message, description, force)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('pull-current-branch', async () => {
    try {
      return await pullCurrentBranch()
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  // PR Review handlers
  ipcMain.handle('get-pr-detail', async (_, prNumber: number) => {
    try {
      return await getPRDetail(prNumber)
    } catch (_error) {
      return null
    }
  })

  ipcMain.handle('get-pr-review-comments', async (_, prNumber: number) => {
    try {
      return await getPRReviewComments(prNumber)
    } catch (_error) {
      return []
    }
  })

  ipcMain.handle('get-pr-file-diff', async (_, prNumber: number, filePath: string) => {
    try {
      return await getPRFileDiff(prNumber, filePath)
    } catch (_error) {
      return null
    }
  })

  ipcMain.handle('comment-on-pr', async (_, prNumber: number, body: string) => {
    try {
      return await commentOnPR(prNumber, body)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('merge-pr', async (_, prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge') => {
    try {
      return await mergePR(prNumber, mergeMethod)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  // Theme handlers
  ipcMain.handle('get-theme-mode', () => {
    return getThemeMode()
  })

  ipcMain.handle('set-theme-mode', (_, mode: 'light' | 'dark' | 'system' | 'custom') => {
    saveThemeMode(mode)
    return { success: true }
  })

  ipcMain.handle('get-system-theme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  ipcMain.handle('get-custom-theme', () => {
    const theme = getCustomTheme()
    if (theme) {
      return {
        theme,
        cssVars: mapVSCodeThemeToCSS(theme)
      }
    }
    return null
  })

  ipcMain.handle('load-vscode-theme', async () => {
    const theme = await loadVSCodeThemeFile()
    if (theme) {
      return {
        theme,
        cssVars: mapVSCodeThemeToCSS(theme)
      }
    }
    return null
  })

  ipcMain.handle('clear-custom-theme', () => {
    clearCustomTheme()
    return { success: true }
  })

  ipcMain.handle('load-built-in-theme', (_event, themeFileName: string) => {
    const theme = loadBuiltInTheme(themeFileName)
    if (theme) {
      return {
        theme,
        cssVars: mapVSCodeThemeToCSS(theme)
      }
    }
    return null
  })

  // Canvas handlers
  ipcMain.handle('get-canvases', () => {
    return getCanvases()
  })

  ipcMain.handle('save-canvases', (_event, canvases: unknown[]) => {
    saveCanvases(canvases as any)
    return { success: true }
  })

  ipcMain.handle('get-active-canvas-id', () => {
    return getActiveCanvasId()
  })

  ipcMain.handle('save-active-canvas-id', (_event, canvasId: string) => {
    saveActiveCanvasId(canvasId)
    return { success: true }
  })

  ipcMain.handle('add-canvas', (_event, canvas: unknown) => {
    addCanvas(canvas as any)
    return { success: true }
  })

  ipcMain.handle('remove-canvas', (_event, canvasId: string) => {
    removeCanvas(canvasId)
    return { success: true }
  })

  ipcMain.handle('update-canvas', (_event, canvasId: string, updates: unknown) => {
    updateCanvas(canvasId, updates as any)
    return { success: true }
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  
  // Register custom protocol for resources (must be done once before any windows)
  registerResourcesProtocol()
  
  // Create app window
  createAppWindow()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createAppWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file, you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
