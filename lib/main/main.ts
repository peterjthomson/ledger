import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createAppWindow } from './app'
import { 
  setRepoPath, 
  getRepoPath, 
  getBranches, 
  getBranchesWithMetadata, 
  getEnhancedWorktrees,
  checkoutBranch,
  checkoutRemoteBranch,
  getPullRequests,
  openPullRequest,
  openBranchInGitHub,
  pullBranch,
  checkoutPRBranch,
  getCommitHistory,
  getWorkingStatus,
} from './git-service'
import { getLastRepoPath, saveLastRepoPath } from './settings-service'

// Check for --repo command line argument (for testing)
const repoArgIndex = process.argv.findIndex(arg => arg.startsWith('--repo='))
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
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    const path = result.filePaths[0];
    setRepoPath(path);
    saveLastRepoPath(path); // Save for next launch
    return path;
  });

  ipcMain.handle('get-repo-path', () => {
    return getRepoPath();
  });

  ipcMain.handle('get-saved-repo-path', () => {
    return getLastRepoPath();
  });

  ipcMain.handle('load-saved-repo', () => {
    // Check for test repo path first (command line argument)
    if (testRepoPath) {
      setRepoPath(testRepoPath);
      return testRepoPath;
    }
    // Otherwise use saved settings
    const savedPath = getLastRepoPath();
    if (savedPath) {
      setRepoPath(savedPath);
      return savedPath;
    }
    return null;
  });

  ipcMain.handle('get-branches', async () => {
    try {
      return await getBranches();
    } catch (error) {
      return { error: (error as Error).message };
    }
  });

  ipcMain.handle('get-branches-with-metadata', async () => {
    try {
      return await getBranchesWithMetadata();
    } catch (error) {
      return { error: (error as Error).message };
    }
  });

  ipcMain.handle('get-worktrees', async () => {
    try {
      return await getEnhancedWorktrees();
    } catch (error) {
      return { error: (error as Error).message };
    }
  });

  ipcMain.handle('checkout-branch', async (_, branchName: string) => {
    try {
      return await checkoutBranch(branchName);
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('checkout-remote-branch', async (_, remoteBranch: string) => {
    try {
      return await checkoutRemoteBranch(remoteBranch);
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('open-worktree', async (_, worktreePath: string) => {
    try {
      // Open the worktree folder in Finder/Explorer
      await shell.openPath(worktreePath);
      return { success: true, message: `Opened ${worktreePath}` };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('get-pull-requests', async () => {
    return await getPullRequests();
  });

  ipcMain.handle('open-pull-request', async (_, url: string) => {
    return await openPullRequest(url);
  });

  ipcMain.handle('open-branch-in-github', async (_, branchName: string) => {
    return await openBranchInGitHub(branchName);
  });

  ipcMain.handle('pull-branch', async (_, remoteBranch: string) => {
    return await pullBranch(remoteBranch);
  });

  ipcMain.handle('checkout-pr-branch', async (_, branchName: string) => {
    return await checkoutPRBranch(branchName);
  });

  ipcMain.handle('get-commit-history', async (_, limit?: number) => {
    try {
      return await getCommitHistory(limit);
    } catch (error) {
      return [];
    }
  });

  ipcMain.handle('get-working-status', async () => {
    try {
      return await getWorkingStatus();
    } catch (error) {
      return { hasChanges: false, files: [], stagedCount: 0, unstagedCount: 0 };
    }
  });

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
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
