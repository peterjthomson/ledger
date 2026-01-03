import { type BrowserWindow, shell, ipcMain } from 'electron'
import { handle } from '@/lib/main/shared'

// Track if handlers are registered to prevent duplicates on window recreation
let handlersRegistered = false

export const registerWindowHandlers = (window: BrowserWindow) => {
  // Remove existing handlers if re-registering (e.g., on macOS window recreation)
  if (handlersRegistered) {
    const channels = [
      'window-init', 'window-is-minimizable', 'window-is-maximizable',
      'window-minimize', 'window-maximize', 'window-close', 'window-maximize-toggle',
      'web-undo', 'web-redo', 'web-cut', 'web-copy', 'web-paste', 'web-delete',
      'web-select-all', 'web-reload', 'web-force-reload', 'web-toggle-devtools',
      'web-actual-size', 'web-zoom-in', 'web-zoom-out', 'web-toggle-fullscreen', 'web-open-url'
    ]
    channels.forEach(channel => ipcMain.removeHandler(channel))
  }
  handlersRegistered = true
  // Window operations
  handle('window-init', () => {
    const { width, height } = window.getBounds()
    const minimizable = window.isMinimizable()
    const maximizable = window.isMaximizable()
    const platform = process.platform

    return { width, height, minimizable, maximizable, platform }
  })

  handle('window-is-minimizable', () => window.isMinimizable())
  handle('window-is-maximizable', () => window.isMaximizable())
  handle('window-minimize', () => window.minimize())
  handle('window-maximize', () => window.maximize())
  handle('window-close', () => window.close())
  handle('window-maximize-toggle', () => (window.isMaximized() ? window.unmaximize() : window.maximize()))

  // Web content operations
  const webContents = window.webContents
  handle('web-undo', () => webContents.undo())
  handle('web-redo', () => webContents.redo())
  handle('web-cut', () => webContents.cut())
  handle('web-copy', () => webContents.copy())
  handle('web-paste', () => webContents.paste())
  handle('web-delete', () => webContents.delete())
  handle('web-select-all', () => webContents.selectAll())
  handle('web-reload', () => webContents.reload())
  handle('web-force-reload', () => webContents.reloadIgnoringCache())
  handle('web-toggle-devtools', () => webContents.toggleDevTools())
  handle('web-actual-size', () => webContents.setZoomLevel(0))
  handle('web-zoom-in', () => webContents.setZoomLevel(webContents.zoomLevel + 0.5))
  handle('web-zoom-out', () => webContents.setZoomLevel(webContents.zoomLevel - 0.5))
  handle('web-toggle-fullscreen', () => window.setFullScreen(!window.fullScreen))
  handle('web-open-url', (url: string) => shell.openExternal(url))
}
