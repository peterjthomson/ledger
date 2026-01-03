import { ConveyorApi } from '@/lib/preload/shared'

export interface PluginSource {
  type: 'builtin' | 'local' | 'git' | 'url' | 'npm'
  location: string
}

export class PluginApi extends ConveyorApi {
  /**
   * List all installed plugins
   */
  listInstalled = () => this.invoke('plugin-list-installed')

  /**
   * Get plugin manifest from a path
   */
  getManifest = (pluginPath: string) => this.invoke('plugin-get-manifest', pluginPath)

  /**
   * Install a plugin from a source
   */
  install = (source: PluginSource) => this.invoke('plugin-install', source)

  /**
   * Uninstall a plugin
   */
  uninstall = (pluginId: string) => this.invoke('plugin-uninstall', pluginId)

  /**
   * Enable or disable a plugin
   */
  setEnabled = (pluginId: string, enabled: boolean) =>
    this.invoke('plugin-set-enabled', pluginId, enabled)

  /**
   * Get the plugins directory path
   */
  getDirectory = () => this.invoke('plugin-get-directory')

  /**
   * Check if a path exists
   */
  pathExists = (checkPath: string) => this.invoke('plugin-path-exists', checkPath)

  /**
   * Read a file from a plugin directory
   */
  readFile = (pluginId: string, relativePath: string) =>
    this.invoke('plugin-read-file', pluginId, relativePath)

  /**
   * Clone a git repository
   */
  cloneRepo = (gitUrl: string, targetDir: string) =>
    this.invoke('plugin-clone-repo', gitUrl, targetDir)

  /**
   * Download a file from URL
   */
  download = (url: string, targetPath: string) =>
    this.invoke('plugin-download', url, targetPath)

  // ===========================================================================
  // Plugin Data Storage (SQLite-backed)
  // ===========================================================================

  /**
   * Get a value from plugin storage
   */
  getData = <T>(pluginId: string, key: string) =>
    this.invoke('plugin-data-get', pluginId, key) as Promise<{
      success: boolean
      data?: T | null
      message?: string
    }>

  /**
   * Set a value in plugin storage
   */
  setData = (pluginId: string, key: string, value: unknown, options?: { ttl?: number }) =>
    this.invoke('plugin-data-set', pluginId, key, value, options) as Promise<{
      success: boolean
      message?: string
    }>

  /**
   * Delete a value from plugin storage
   */
  deleteData = (pluginId: string, key: string) =>
    this.invoke('plugin-data-delete', pluginId, key) as Promise<{
      success: boolean
      deleted?: boolean
      message?: string
    }>

  /**
   * Get all keys for a plugin
   */
  getKeys = (pluginId: string) =>
    this.invoke('plugin-data-keys', pluginId) as Promise<{
      success: boolean
      keys: string[]
      message?: string
    }>

  /**
   * Clear all data for a plugin
   */
  clearData = (pluginId: string) =>
    this.invoke('plugin-data-clear', pluginId) as Promise<{
      success: boolean
      count: number
      message?: string
    }>

  /**
   * Get plugin database info
   */
  getDataInfo = (pluginId: string) =>
    this.invoke('plugin-data-info', pluginId) as Promise<{
      success: boolean
      info?: { pluginId: string; path: string; sizeBytes: number; connected: boolean }
      message?: string
    }>
}
