import { BrowserWindow, shell, app } from 'electron'
import { join } from 'path'
import appIcon from '@/resources/build/icon.png?asset'
import { registerWindowHandlers } from '@/lib/conveyor/handlers/window-handler'

export function createAppWindow(): void {

  // Create the main window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#FFFFFF',
    icon: appIcon,
    frame: false,
    titleBarStyle: 'hiddenInset',
    title: 'Ledger',
    maximizable: true,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      // ============================================
      // SECURITY CONFIGURATION
      // These settings enforce Electron security best practices.
      // Do NOT modify without security review.
      // ============================================
      sandbox: true,                    // Enable V8 sandbox
      contextIsolation: true,           // Isolate preload from renderer
      nodeIntegration: false,           // No Node.js in renderer
      nodeIntegrationInWorker: false,   // No Node.js in workers
      webSecurity: true,                // Enforce same-origin policy
    },
  })

  // Register window-specific IPC handlers (needs mainWindow reference)
  registerWindowHandlers(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
