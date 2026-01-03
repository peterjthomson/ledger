import { z } from 'zod'
import { SuccessResultSchema } from './shared-types'

/**
 * Plugin IPC Schema
 *
 * Defines the IPC channels for plugin management operations.
 */

// Plugin source schema
const PluginSourceSchema = z.object({
  type: z.enum(['builtin', 'local', 'git', 'url', 'npm']),
  location: z.string(),
})

// Installed plugin info schema
const InstalledPluginSchema = z.object({
  id: z.string(),
  source: PluginSourceSchema,
  installedAt: z.string(),
  version: z.string().optional(),
  enabled: z.boolean(),
})

// Plugin manifest schema (subset for IPC)
const PluginManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  type: z.enum(['app', 'panel', 'widget', 'service']),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().optional(),
  main: z.string(),
  permissions: z.array(z.string()).optional(),
})

// Plugin install result schema
const PluginInstallResultSchema = z.object({
  success: z.boolean(),
  pluginId: z.string().optional(),
  message: z.string().optional(),
})

export const pluginIpcSchema = {
  // List installed plugins
  'plugin-list-installed': {
    args: z.tuple([]),
    return: z.array(InstalledPluginSchema),
  },

  // Get plugin manifest from path
  'plugin-get-manifest': {
    args: z.tuple([z.string()]), // path
    return: PluginManifestSchema.nullable(),
  },

  // Install plugin from source
  'plugin-install': {
    args: z.tuple([PluginSourceSchema]),
    return: PluginInstallResultSchema,
  },

  // Uninstall plugin
  'plugin-uninstall': {
    args: z.tuple([z.string()]), // pluginId
    return: SuccessResultSchema,
  },

  // Enable/disable plugin
  'plugin-set-enabled': {
    args: z.tuple([z.string(), z.boolean()]), // pluginId, enabled
    return: SuccessResultSchema,
  },

  // Get plugin directory path
  'plugin-get-directory': {
    args: z.tuple([]),
    return: z.string(),
  },

  // Check if a plugin path exists
  'plugin-path-exists': {
    args: z.tuple([z.string()]),
    return: z.boolean(),
  },

  // Read plugin file contents
  'plugin-read-file': {
    args: z.tuple([z.string(), z.string()]), // pluginId, relativePath
    return: z.string().nullable(),
  },

  // Clone git repository for plugin
  'plugin-clone-repo': {
    args: z.tuple([z.string(), z.string()]), // gitUrl, targetDir
    return: SuccessResultSchema,
  },

  // Download file from URL
  'plugin-download': {
    args: z.tuple([z.string(), z.string()]), // url, targetPath
    return: SuccessResultSchema,
  },
}
