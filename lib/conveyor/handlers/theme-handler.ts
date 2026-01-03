import { nativeTheme } from 'electron'
import { handle } from '@/lib/main/shared'
import {
  getThemeMode,
  saveThemeMode,
  getCustomTheme,
  loadVSCodeThemeFile,
  loadBuiltInTheme,
  clearCustomTheme,
  mapVSCodeThemeToCSS,
} from '@/lib/main/settings-service'

export const registerThemeHandlers = () => {
  handle('get-theme-mode', () => {
    return getThemeMode()
  })

  handle('set-theme-mode', (mode: 'light' | 'dark' | 'system' | 'custom') => {
    saveThemeMode(mode)
    return { success: true }
  })

  handle('get-system-theme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  handle('get-custom-theme', () => {
    const theme = getCustomTheme()
    if (theme) {
      return {
        theme,
        cssVars: mapVSCodeThemeToCSS(theme),
      }
    }
    return null
  })

  handle('load-vscode-theme', async () => {
    const theme = await loadVSCodeThemeFile()
    if (theme) {
      return {
        theme,
        cssVars: mapVSCodeThemeToCSS(theme),
      }
    }
    return null
  })

  handle('load-built-in-theme', (themeFileName: string) => {
    const theme = loadBuiltInTheme(themeFileName)
    if (theme) {
      return {
        theme,
        cssVars: mapVSCodeThemeToCSS(theme),
      }
    }
    return null
  })

  handle('clear-custom-theme', () => {
    clearCustomTheme()
    return { success: true }
  })
}
