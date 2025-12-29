import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import fixPath from 'fix-path'
import { createAppWindow } from './app'
import { registerResourcesProtocol } from './protocols'

// Import Conveyor handler registration functions
import { registerAppHandlers } from '@/lib/conveyor/handlers/app-handler'
import { registerWindowHandlers } from '@/lib/conveyor/handlers/window-handler'
import { registerRepoHandlers } from '@/lib/conveyor/handlers/repo-handler'
import { registerBranchHandlers } from '@/lib/conveyor/handlers/branch-handler'
import { registerWorktreeHandlers } from '@/lib/conveyor/handlers/worktree-handler'
import { registerPRHandlers } from '@/lib/conveyor/handlers/pr-handler'
import { registerCommitHandlers } from '@/lib/conveyor/handlers/commit-handler'
import { registerStashHandlers } from '@/lib/conveyor/handlers/stash-handler'
import { registerStagingHandlers } from '@/lib/conveyor/handlers/staging-handler'
import { registerThemeHandlers } from '@/lib/conveyor/handlers/theme-handler'

// Fix PATH for macOS when launched from Finder/Dock (not terminal)
// Without this, git/gh commands may not be found if installed via Homebrew
fixPath()

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Register all IPC handlers via Conveyor
  registerAppHandlers(app)
  registerRepoHandlers()
  registerBranchHandlers()
  registerWorktreeHandlers()
  registerPRHandlers()
  registerCommitHandlers()
  registerStashHandlers()
  registerStagingHandlers()
  registerThemeHandlers()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Register custom protocol for resources (must be done once before any windows)
  registerResourcesProtocol()

  // Create app window
  const mainWindow = createAppWindow()

  // Register window-specific handlers
  registerWindowHandlers(mainWindow)

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
