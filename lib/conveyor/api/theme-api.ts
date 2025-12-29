import { ConveyorApi } from '@/lib/preload/shared'
import type { ThemeMode } from '@/lib/conveyor/schemas/shared-types'

export class ThemeApi extends ConveyorApi {
  getThemeMode = () => this.invoke('get-theme-mode')
  setThemeMode = (mode: ThemeMode) => this.invoke('set-theme-mode', mode)
  getSystemTheme = () => this.invoke('get-system-theme')
  getCustomTheme = () => this.invoke('get-custom-theme')
  loadVSCodeTheme = () => this.invoke('load-vscode-theme')
  loadBuiltInTheme = (themeFileName: string) => this.invoke('load-built-in-theme', themeFileName)
  clearCustomTheme = () => this.invoke('clear-custom-theme')
}
