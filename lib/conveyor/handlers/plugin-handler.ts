/**
 * Plugin IPC Handlers
 *
 * Exposes plugin management operations to the renderer process.
 */

import { handle } from '@/lib/main/shared'
import {
  listInstalledPlugins,
  getPluginManifest,
  installPlugin,
  uninstallPlugin,
  setPluginEnabled,
  getPluginsDirectory,
  pathExists,
  readPluginFile,
  cloneRepository,
  downloadFile,
  type PluginSource,
} from '@/lib/main/plugin-service'
import {
  getPluginData,
  setPluginData,
  deletePluginData,
  getPluginKeys,
  clearPluginData,
  getPluginDatabaseInfo,
  isConnected,
  type PluginStorageOptions,
} from '@/lib/data'
import { serializeError } from '@/lib/utils/error-helpers'

export const registerPluginHandlers = () => {
  // List installed plugins
  handle('plugin-list-installed', async () => {
    try {
      return listInstalledPlugins()
    } catch (error) {
      console.error('[plugin-handler] plugin-list-installed error:', error)
      return []
    }
  })

  // Get plugin manifest from path
  handle('plugin-get-manifest', async (pluginPath: string) => {
    try {
      return getPluginManifest(pluginPath)
    } catch (error) {
      console.error('[plugin-handler] plugin-get-manifest error:', error)
      return null
    }
  })

  // Install plugin from source
  handle('plugin-install', async (source: PluginSource) => {
    try {
      return await installPlugin(source)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  // Uninstall plugin
  handle('plugin-uninstall', async (pluginId: string) => {
    try {
      return await uninstallPlugin(pluginId)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  // Enable/disable plugin
  handle('plugin-set-enabled', async (pluginId: string, enabled: boolean) => {
    try {
      return setPluginEnabled(pluginId, enabled)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  // Get plugins directory
  handle('plugin-get-directory', async () => {
    return getPluginsDirectory()
  })

  // Check if path exists
  handle('plugin-path-exists', async (checkPath: string) => {
    return pathExists(checkPath)
  })

  // Read plugin file
  handle('plugin-read-file', async (pluginId: string, relativePath: string) => {
    try {
      return readPluginFile(pluginId, relativePath)
    } catch (error) {
      console.error('[plugin-handler] plugin-read-file error:', error)
      return null
    }
  })

  // Clone git repository
  handle('plugin-clone-repo', async (gitUrl: string, targetDir: string) => {
    try {
      return await cloneRepository(gitUrl, targetDir)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  // Download file from URL
  handle('plugin-download', async (url: string, targetPath: string) => {
    try {
      return await downloadFile(url, targetPath)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  // ============================================================================
  // Plugin Data Storage (SQLite-backed)
  // ============================================================================

  // Get plugin data
  handle('plugin-data-get', async (pluginId: string, key: string) => {
    if (!isConnected()) {
      return { success: false, message: 'Database not connected' }
    }
    try {
      return { success: true, data: getPluginData(pluginId, key) }
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  // Set plugin data
  handle(
    'plugin-data-set',
    async (pluginId: string, key: string, value: unknown, options?: PluginStorageOptions) => {
      if (!isConnected()) {
        return { success: false, message: 'Database not connected' }
      }
      try {
        setPluginData(pluginId, key, value, options)
        return { success: true }
      } catch (error) {
        return { success: false, message: serializeError(error) }
      }
    }
  )

  // Delete plugin data
  handle('plugin-data-delete', async (pluginId: string, key: string) => {
    if (!isConnected()) {
      return { success: false, message: 'Database not connected' }
    }
    try {
      const deleted = deletePluginData(pluginId, key)
      return { success: true, deleted }
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  // Get all keys for a plugin
  handle('plugin-data-keys', async (pluginId: string) => {
    if (!isConnected()) {
      return { success: false, message: 'Database not connected', keys: [] }
    }
    try {
      return { success: true, keys: getPluginKeys(pluginId) }
    } catch (error) {
      return { success: false, message: serializeError(error), keys: [] }
    }
  })

  // Clear all plugin data
  handle('plugin-data-clear', async (pluginId: string) => {
    if (!isConnected()) {
      return { success: false, message: 'Database not connected', count: 0 }
    }
    try {
      const count = clearPluginData(pluginId)
      return { success: true, count }
    } catch (error) {
      return { success: false, message: serializeError(error), count: 0 }
    }
  })

  // Get plugin database info
  handle('plugin-data-info', async (pluginId: string) => {
    try {
      return { success: true, info: getPluginDatabaseInfo(pluginId) }
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })
}
