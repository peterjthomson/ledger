/**
 * Plugin Loader
 *
 * Handles loading plugins from various sources:
 * - Built-in plugins (bundled with Ledger)
 * - Local plugins (from filesystem)
 * - Remote plugins (from URLs or git repos)
 *
 * Security: Remote plugins require explicit user approval and are
 * loaded in a restricted context.
 */

import type { Plugin, PluginManifest, PluginPermission } from './plugin-types'
import { pluginManager } from './plugin-manager'
import { grantPermissions, revokePermissions } from './plugin-permissions'

// ============================================================================
// Types
// ============================================================================

export interface PluginSource {
  type: 'builtin' | 'local' | 'git' | 'url' | 'npm'
  location: string
}

export interface InstalledPlugin {
  id: string
  source: PluginSource
  manifest: PluginManifest
  installedAt: Date
  updatedAt: Date
  enabled: boolean
  permissions: PluginPermission[]
}

export interface PluginInstallOptions {
  /** Auto-enable after install */
  autoEnable?: boolean
  /** Permissions to grant */
  permissions?: PluginPermission[]
  /** Skip confirmation prompt (only for trusted/builtin plugins) */
  skipConfirmation?: boolean
  /** Whether this is from a trusted source (internal use only) */
  trustedSource?: boolean
}

/** Permission request callback type */
export type PermissionRequestFn = (
  pluginId: string,
  pluginName: string,
  permissions: PluginPermission[]
) => Promise<{ approved: boolean; permissions?: PluginPermission[] }>

export interface PluginInstallResult {
  success: boolean
  pluginId?: string
  error?: string
}

// ============================================================================
// Plugin Registry (Persistence)
// ============================================================================

const STORAGE_KEY = 'ledger:installed-plugins'

class PluginRegistry {
  private plugins: Map<string, InstalledPlugin> = new Map()

  constructor() {
    this.load()
  }

  private load(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (data) {
        const plugins: InstalledPlugin[] = JSON.parse(data)
        plugins.forEach((p) => {
          this.plugins.set(p.id, {
            ...p,
            installedAt: new Date(p.installedAt),
            updatedAt: new Date(p.updatedAt),
          })
        })
      }
    } catch (error) {
      console.error('[PluginRegistry] Failed to load:', error)
    }
  }

  private save(): void {
    try {
      const plugins = Array.from(this.plugins.values())
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plugins))
    } catch (error) {
      console.error('[PluginRegistry] Failed to save:', error)
    }
  }

  add(plugin: InstalledPlugin): void {
    this.plugins.set(plugin.id, plugin)
    this.save()
  }

  remove(id: string): void {
    this.plugins.delete(id)
    this.save()
  }

  get(id: string): InstalledPlugin | null {
    return this.plugins.get(id) ?? null
  }

  getAll(): InstalledPlugin[] {
    return Array.from(this.plugins.values())
  }

  setEnabled(id: string, enabled: boolean): void {
    const plugin = this.plugins.get(id)
    if (plugin) {
      plugin.enabled = enabled
      this.save()
    }
  }

  updatePermissions(id: string, permissions: PluginPermission[]): void {
    const plugin = this.plugins.get(id)
    if (plugin) {
      plugin.permissions = permissions
      this.save()
    }
  }
}

export const pluginRegistry = new PluginRegistry()

// ============================================================================
// Plugin Loader
// ============================================================================

class PluginLoader {
  private loadedPlugins: Map<string, Plugin> = new Map()
  private permissionRequestFn: PermissionRequestFn | null = null

  /**
   * Configure the permission request handler.
   * This should be called by the app during initialization.
   * If not set, permissions will be auto-approved (development mode).
   */
  setPermissionRequestHandler(handler: PermissionRequestFn): void {
    this.permissionRequestFn = handler
  }

  /**
   * Install a plugin from a source
   */
  async install(
    source: PluginSource,
    options: PluginInstallOptions = {}
  ): Promise<PluginInstallResult> {
    try {
      // Fetch and validate manifest
      const manifest = await this.fetchManifest(source)
      if (!manifest) {
        return { success: false, error: 'Failed to fetch plugin manifest' }
      }

      // Check if already installed
      if (pluginRegistry.get(manifest.id)) {
        return { success: false, error: 'Plugin already installed' }
      }

      // Request user approval for permissions
      if (manifest.permissions?.length) {
        const approved = await this.requestPermissions(manifest, options)
        if (!approved) {
          return { success: false, error: 'Permission denied by user' }
        }
      }

      // Download plugin files (for remote sources)
      if (source.type === 'git' || source.type === 'url') {
        await this.downloadPlugin(source, manifest)
      }

      // Register in registry
      const installedPlugin: InstalledPlugin = {
        id: manifest.id,
        source,
        manifest,
        installedAt: new Date(),
        updatedAt: new Date(),
        enabled: options.autoEnable ?? false,
        permissions: options.permissions ?? manifest.permissions ?? [],
      }
      pluginRegistry.add(installedPlugin)

      // Load and register with plugin manager
      const plugin = await this.loadPlugin(manifest.id)
      if (plugin) {
        pluginManager.register(plugin)

        if (options.autoEnable) {
          await pluginManager.activate(manifest.id)
        }
      }

      return { success: true, pluginId: manifest.id }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, message }
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(pluginId: string): Promise<boolean> {
    try {
      // Deactivate if active
      if (pluginManager.isActive(pluginId)) {
        await pluginManager.deactivate(pluginId)
      }

      // Revoke all permissions
      revokePermissions(pluginId)

      // Unregister from manager
      await pluginManager.unregister(pluginId)

      // Remove from registry
      pluginRegistry.remove(pluginId)

      // Clean up loaded plugin
      this.loadedPlugins.delete(pluginId)

      return true
    } catch (error) {
      console.error('[PluginLoader] Uninstall failed:', error)
      return false
    }
  }

  /**
   * Load all installed plugins on startup
   */
  async loadInstalled(): Promise<void> {
    const installed = pluginRegistry.getAll()

    for (const entry of installed) {
      try {
        const plugin = await this.loadPlugin(entry.id)
        if (plugin) {
          pluginManager.register(plugin)

          if (entry.enabled) {
            await pluginManager.activate(entry.id)
          }
        }
      } catch (error) {
        console.error(`[PluginLoader] Failed to load ${entry.id}:`, error)
      }
    }
  }

  /**
   * Check for plugin updates
   */
  async checkForUpdates(): Promise<Map<string, string>> {
    const updates = new Map<string, string>()
    const installed = pluginRegistry.getAll()

    for (const entry of installed) {
      if (entry.source.type === 'git' || entry.source.type === 'url') {
        try {
          const manifest = await this.fetchManifest(entry.source)
          if (manifest && manifest.version !== entry.manifest.version) {
            updates.set(entry.id, manifest.version)
          }
        } catch {
          // Skip failed checks
        }
      }
    }

    return updates
  }

  /**
   * Update a plugin to latest version
   */
  async update(pluginId: string): Promise<PluginInstallResult> {
    const entry = pluginRegistry.get(pluginId)
    if (!entry) {
      return { success: false, error: 'Plugin not installed' }
    }

    // Uninstall current version
    const wasEnabled = entry.enabled
    await this.uninstall(pluginId)

    // Reinstall
    return this.install(entry.source, {
      autoEnable: wasEnabled,
      permissions: entry.permissions,
      skipConfirmation: true,
    })
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async fetchManifest(source: PluginSource): Promise<PluginManifest | null> {
    switch (source.type) {
      case 'builtin':
        return this.fetchBuiltinManifest(source.location)

      case 'local':
        return this.fetchLocalManifest(source.location)

      case 'git':
        return this.fetchGitManifest(source.location)

      case 'url':
        return this.fetchUrlManifest(source.location)

      case 'npm':
        return this.fetchNpmManifest(source.location)

      default:
        return null
    }
  }

  private async fetchBuiltinManifest(id: string): Promise<PluginManifest | null> {
    // Built-in plugins are imported directly, manifest is derived from plugin object
    return null
  }

  private async fetchLocalManifest(path: string): Promise<PluginManifest | null> {
    // In Electron, would use fs to read package.json or ledger-plugin.json
    try {
      const response = await window.electronAPI?.readPluginManifest?.(path)
      return response ?? null
    } catch {
      return null
    }
  }

  private async fetchGitManifest(repoUrl: string): Promise<PluginManifest | null> {
    // Fetch raw manifest from git repo
    // e.g., https://github.com/user/plugin/raw/main/ledger-plugin.json
    try {
      const manifestUrl = this.getGitManifestUrl(repoUrl)
      const response = await fetch(manifestUrl)
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  private async fetchUrlManifest(url: string): Promise<PluginManifest | null> {
    try {
      const response = await fetch(url)
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  private async fetchNpmManifest(packageName: string): Promise<PluginManifest | null> {
    try {
      const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`)
      if (!response.ok) return null
      const pkg = await response.json()
      return pkg.ledgerPlugin ?? null
    } catch {
      return null
    }
  }

  private getGitManifestUrl(repoUrl: string): string {
    // Convert GitHub URL to raw manifest URL
    // https://github.com/user/repo -> https://raw.githubusercontent.com/user/repo/main/ledger-plugin.json
    if (repoUrl.includes('github.com')) {
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
      if (match) {
        return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/main/ledger-plugin.json`
      }
    }
    throw new Error('Unsupported git provider')
  }

  private async downloadPlugin(source: PluginSource, manifest: PluginManifest): Promise<void> {
    // In production, this would:
    // 1. Clone git repo or download from URL
    // 2. Save to plugins directory
    // 3. Verify integrity (checksum)
    // 4. Extract/prepare files

    // For now, we'll rely on the IPC bridge
    await window.electronAPI?.installPlugin?.(source, manifest)
  }

  private async loadPlugin(pluginId: string): Promise<Plugin | null> {
    // Check cache
    if (this.loadedPlugins.has(pluginId)) {
      return this.loadedPlugins.get(pluginId)!
    }

    const entry = pluginRegistry.get(pluginId)
    if (!entry) return null

    try {
      let plugin: Plugin | null = null

      switch (entry.source.type) {
        case 'builtin':
          plugin = await this.loadBuiltinPlugin(entry.source.location)
          break

        case 'local':
        case 'git':
        case 'url':
          plugin = await this.loadExternalPlugin(pluginId)
          break

        case 'npm':
          plugin = await this.loadNpmPlugin(entry.source.location)
          break
      }

      if (plugin) {
        this.loadedPlugins.set(pluginId, plugin)
      }

      return plugin
    } catch (error) {
      console.error(`[PluginLoader] Failed to load ${pluginId}:`, error)
      return null
    }
  }

  private async loadBuiltinPlugin(id: string): Promise<Plugin | null> {
    // Import built-in plugins dynamically
    const builtins = await import('./examples')
    const plugin = builtins.examplePlugins.find((p) => p.id === id)
    return plugin ?? null
  }

  private async loadExternalPlugin(pluginId: string): Promise<Plugin | null> {
    // Load via IPC from plugins directory
    const plugin = await window.electronAPI?.loadPlugin?.(pluginId)
    return plugin ?? null
  }

  private async loadNpmPlugin(packageName: string): Promise<Plugin | null> {
    // Would require bundling or dynamic import
    return null
  }

  private async requestPermissions(
    manifest: PluginManifest,
    options: PluginInstallOptions = {}
  ): Promise<boolean> {
    // No permissions needed
    if (!manifest.permissions?.length) {
      return true
    }

    // Skip dialog for trusted sources (built-in plugins)
    if (options.skipConfirmation && options.trustedSource) {
      console.log(`[PluginLoader] Auto-approving trusted plugin ${manifest.id}:`, manifest.permissions)
      grantPermissions(manifest.id, manifest.permissions)
      return true
    }

    // Use permission request handler if available
    if (this.permissionRequestFn) {
      console.log(`[PluginLoader] Requesting user approval for ${manifest.id}:`, manifest.permissions)

      const result = await this.permissionRequestFn(
        manifest.id,
        manifest.name,
        manifest.permissions
      )

      if (!result.approved) {
        console.log(`[PluginLoader] User denied permissions for ${manifest.id}`)
        return false
      }

      // Grant only the permissions user approved
      const approvedPermissions = result.permissions ?? manifest.permissions
      grantPermissions(manifest.id, approvedPermissions)
      return true
    }

    // Fallback: auto-approve with warning (development mode)
    console.warn(
      `[PluginLoader] No permission handler configured. Auto-approving ${manifest.id}:`,
      manifest.permissions
    )
    grantPermissions(manifest.id, manifest.permissions)
    return true
  }
}

export const pluginLoader = new PluginLoader()

// ============================================================================
// Electron API Extensions (types)
// ============================================================================

declare global {
  interface Window {
    electronAPI?: {
      readPluginManifest?: (path: string) => Promise<PluginManifest | null>
      installPlugin?: (source: PluginSource, manifest: PluginManifest) => Promise<void>
      loadPlugin?: (pluginId: string) => Promise<Plugin | null>
      uninstallPlugin?: (pluginId: string) => Promise<void>
    }
  }
}
