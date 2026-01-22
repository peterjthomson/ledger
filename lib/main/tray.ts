/**
 * Tray - Menu bar icon and Quick Capture popover
 *
 * Creates a macOS menu bar icon that provides:
 * - Left-click: Open Quick Capture popover for fast issue creation
 * - Right-click: Context menu (Open Ledger, Settings, Quit)
 * - Badge: Shows open issue count
 */

import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { getOpenIssueCount } from './git-service'
import type { Rectangle } from 'electron'

let tray: Tray | null = null
let quickCaptureWindow: BrowserWindow | null = null
let openIssueCount = 0

/**
 * Create a simple ticket/issue icon for the tray
 * 22x22 pixels, template-style (white on transparent for macOS)
 */
function createTrayIcon(): Electron.NativeImage {
  const size = 22
  const scale = 2 // For Retina displays
  const actualSize = size * scale

  // Create RGBA buffer
  const canvas = Buffer.alloc(actualSize * actualSize * 4)

  // Helper to set pixel
  const setPixel = (x: number, y: number, alpha: number = 255) => {
    const idx = (y * actualSize + x) * 4
    canvas[idx] = 0       // R (black for template)
    canvas[idx + 1] = 0   // G
    canvas[idx + 2] = 0   // B
    canvas[idx + 3] = alpha // A
  }

  // Draw a ticket/issue icon shape (scaled 2x)
  // Outer rectangle (ticket shape)
  for (let s = 0; s < scale; s++) {
    for (let t = 0; t < scale; t++) {
      // Top and bottom borders
      for (let x = 6; x < 38; x++) {
        setPixel(x, 8 + t)   // Top
        setPixel(x, 35 + t)  // Bottom
      }
      // Left and right borders
      for (let y = 8; y < 36; y++) {
        setPixel(6 + s, y)   // Left
        setPixel(37 + s, y)  // Right
      }
      // Middle divider (ticket stub line)
      for (let x = 6; x < 38; x++) {
        setPixel(x, 16 + t)
      }
      // Notches on sides (ticket style)
      for (let y = 14; y < 19; y++) {
        setPixel(4 + s, y, 0)  // Left notch (transparent)
        setPixel(39 + s, y, 0) // Right notch (transparent)
      }
    }
  }

  // Create native image with proper scaling
  const img = nativeImage.createFromBuffer(canvas, {
    width: actualSize,
    height: actualSize,
    scaleFactor: scale,
  })

  // Mark as template image for macOS dark/light mode support
  img.setTemplateImage(true)

  return img
}

/**
 * Create the menu bar tray icon
 */
export function createTray(): Tray | null {
  // Create programmatic icon (works without external asset)
  const icon = createTrayIcon()

  tray = new Tray(icon)

  tray.setToolTip('Ledger - Quick Issue Capture')

  // Left-click: Show Quick Capture popover
  tray.on('click', (_event, bounds) => {
    if (quickCaptureWindow?.isVisible()) {
      quickCaptureWindow.hide()
    } else {
      showQuickCaptureWindow(bounds)
    }
  })

  // Right-click: Show context menu
  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Ledger',
        click: () => {
          // Focus the main window or create it
          const mainWindow = BrowserWindow.getAllWindows().find(w =>
            !w.webContents.getURL().includes('quick-capture')
          )
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Refresh Issue Count',
        click: () => updateBadgeCount()
      },
      { type: 'separator' },
      {
        label: 'Quit Ledger',
        click: () => app.quit()
      }
    ])
    tray?.popUpContextMenu(contextMenu)
  })

  // Initial badge update
  updateBadgeCount()

  return tray
}

/**
 * Show the Quick Capture popover window
 */
function showQuickCaptureWindow(trayBounds: Rectangle): void {
  if (!quickCaptureWindow) {
    createQuickCaptureWindow()
  }

  if (!quickCaptureWindow) return

  // Position the window below the tray icon (macOS style)
  const windowWidth = 400
  const windowHeight = 500

  // Center horizontally under tray icon
  const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowWidth / 2))
  // Position below tray
  const y = trayBounds.y + trayBounds.height + 4

  quickCaptureWindow.setPosition(x, y)
  quickCaptureWindow.show()
  quickCaptureWindow.focus()
}

/**
 * Create the Quick Capture BrowserWindow
 */
function createQuickCaptureWindow(): void {
  quickCaptureWindow = new BrowserWindow({
    width: 400,
    height: 500,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // macOS specific
    vibrancy: 'popover',
    visualEffectState: 'active',
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, '../preload/quick-capture-preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Hide when losing focus (click outside)
  quickCaptureWindow.on('blur', () => {
    quickCaptureWindow?.hide()
  })

  // Prevent closing, just hide
  quickCaptureWindow.on('close', (e) => {
    e.preventDefault()
    quickCaptureWindow?.hide()
  })

  // Load the quick capture renderer
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    quickCaptureWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/quick-capture.html`)
  } else {
    quickCaptureWindow.loadFile(join(__dirname, '../renderer/quick-capture.html'))
  }
}

/**
 * Update the tray badge with open issue count
 */
export async function updateBadgeCount(): Promise<void> {
  try {
    const count = await getOpenIssueCount()
    openIssueCount = count

    // macOS: Show count next to icon
    if (tray) {
      tray.setTitle(count > 0 ? `${count}` : '')
    }
  } catch {
    // Silently fail - might not have a repo selected
  }
}

/**
 * Hide the Quick Capture window
 */
export function hideQuickCapture(): void {
  quickCaptureWindow?.hide()
}

/**
 * Get current open issue count
 */
export function getOpenCount(): number {
  return openIssueCount
}

/**
 * Destroy tray and windows on app quit
 */
export function destroyTray(): void {
  if (quickCaptureWindow) {
    quickCaptureWindow.destroy()
    quickCaptureWindow = null
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
}
