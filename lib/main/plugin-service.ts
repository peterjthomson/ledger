/**
 * Plugin Service - Main Process
 *
 * Handles plugin file operations, installation, and management
 * in the main Electron process.
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
import simpleGit from 'simple-git'
import { safeExec, isValidNpmPackageName } from '@/lib/utils/safe-exec'

// Plugin storage directory
const PLUGINS_DIR = 'plugins'
const REGISTRY_FILE = 'plugin-registry.json'

export interface PluginSource {
  type: 'builtin' | 'local' | 'git' | 'url' | 'npm'
  location: string
}

export interface InstalledPlugin {
  id: string
  source: PluginSource
  installedAt: string
  version?: string
  enabled: boolean
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  type: 'app' | 'panel' | 'widget' | 'service'
  description?: string
  author?: string
  homepage?: string
  main: string
  permissions?: string[]
}

interface PluginRegistry {
  plugins: InstalledPlugin[]
}

/**
 * Get the plugins directory path
 */
export function getPluginsDirectory(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, PLUGINS_DIR)
}

/**
 * Ensure the plugins directory exists
 */
function ensurePluginsDirectory(): void {
  const pluginsDir = getPluginsDirectory()
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true })
  }
}

/**
 * Get the registry file path
 */
function getRegistryPath(): string {
  return path.join(getPluginsDirectory(), REGISTRY_FILE)
}

/**
 * Load the plugin registry
 */
function loadRegistry(): PluginRegistry {
  const registryPath = getRegistryPath()
  try {
    if (fs.existsSync(registryPath)) {
      const data = fs.readFileSync(registryPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Failed to load plugin registry:', error)
  }
  return { plugins: [] }
}

/**
 * Save the plugin registry
 */
function saveRegistry(registry: PluginRegistry): void {
  ensurePluginsDirectory()
  const registryPath = getRegistryPath()
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2))
}

/**
 * List all installed plugins
 */
export function listInstalledPlugins(): InstalledPlugin[] {
  const registry = loadRegistry()
  return registry.plugins
}

/**
 * Get plugin manifest from a directory
 */
export function getPluginManifest(pluginPath: string): PluginManifest | null {
  try {
    const manifestPath = path.join(pluginPath, 'plugin.json')
    if (fs.existsSync(manifestPath)) {
      const data = fs.readFileSync(manifestPath, 'utf-8')
      return JSON.parse(data)
    }

    // Try package.json with ledger field
    const packagePath = path.join(pluginPath, 'package.json')
    if (fs.existsSync(packagePath)) {
      const data = fs.readFileSync(packagePath, 'utf-8')
      const pkg = JSON.parse(data)
      if (pkg.ledger) {
        return {
          id: pkg.ledger.id || pkg.name,
          name: pkg.ledger.name || pkg.name,
          version: pkg.version,
          type: pkg.ledger.type || 'app',
          description: pkg.description,
          author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name,
          homepage: pkg.homepage,
          main: pkg.ledger.main || pkg.main || 'index.js',
          permissions: pkg.ledger.permissions,
        }
      }
    }
  } catch (error) {
    console.error('Failed to read plugin manifest:', error)
  }
  return null
}

/**
 * Check if a path exists
 */
export function pathExists(checkPath: string): boolean {
  return fs.existsSync(checkPath)
}

/**
 * Read a file from a plugin directory
 */
export function readPluginFile(pluginId: string, relativePath: string): string | null {
  try {
    const pluginsDir = getPluginsDirectory()
    const filePath = path.join(pluginsDir, pluginId, relativePath)

    // Security: prevent path traversal
    const resolvedPath = path.resolve(filePath)
    const pluginDir = path.resolve(pluginsDir, pluginId)
    if (!resolvedPath.startsWith(pluginDir)) {
      console.error('Path traversal attempt blocked:', relativePath)
      return null
    }

    if (fs.existsSync(resolvedPath)) {
      return fs.readFileSync(resolvedPath, 'utf-8')
    }
  } catch (error) {
    console.error('Failed to read plugin file:', error)
  }
  return null
}

/**
 * Clone a git repository
 */
export async function cloneRepository(
  gitUrl: string,
  targetDir: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Validate git URL
    if (!isValidGitUrl(gitUrl)) {
      return { success: false, message: 'Invalid git URL' }
    }

    ensurePluginsDirectory()
    const fullPath = path.join(getPluginsDirectory(), targetDir)

    // Security: prevent path traversal
    const resolvedPath = path.resolve(fullPath)
    const pluginsDir = path.resolve(getPluginsDirectory())
    if (!resolvedPath.startsWith(pluginsDir)) {
      return { success: false, message: 'Invalid target directory' }
    }

    // Use simple-git for safe cloning (no shell interpolation)
    const git = simpleGit()
    await git.clone(gitUrl, fullPath, ['--depth', '1'])
    return { success: true, message: 'Repository cloned successfully' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Download a file from URL
 */
export async function downloadFile(
  url: string,
  targetPath: string
): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    try {
      // Validate URL
      if (!isValidUrl(url)) {
        resolve({ success: false, message: 'Invalid URL' })
        return
      }

      ensurePluginsDirectory()
      const fullPath = path.join(getPluginsDirectory(), targetPath)

      // Security: prevent path traversal
      const resolvedPath = path.resolve(fullPath)
      const pluginsDir = path.resolve(getPluginsDirectory())
      if (!resolvedPath.startsWith(pluginsDir)) {
        resolve({ success: false, message: 'Invalid target path' })
        return
      }

      // Ensure parent directory exists
      const parentDir = path.dirname(fullPath)
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true })
      }

      const protocol = url.startsWith('https') ? https : http
      const file = fs.createWriteStream(fullPath)

      protocol.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirect
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            file.close()
            fs.unlinkSync(fullPath)
            downloadFile(redirectUrl, targetPath).then(resolve)
            return
          }
        }

        if (response.statusCode !== 200) {
          file.close()
          fs.unlinkSync(fullPath)
          resolve({ success: false, message: `HTTP ${response.statusCode}` })
          return
        }

        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve({ success: true, message: 'Download complete' })
        })
      }).on('error', (error) => {
        file.close()
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath)
        }
        resolve({ success: false, message: error.message })
      })
    } catch (error) {
      resolve({ success: false, message: (error as Error).message })
    }
  })
}

/**
 * Install a plugin from source
 */
export async function installPlugin(
  source: PluginSource
): Promise<{ success: boolean; pluginId?: string; error?: string }> {
  try {
    ensurePluginsDirectory()
    let pluginDir: string

    switch (source.type) {
      case 'local': {
        // Copy from local path
        const manifest = getPluginManifest(source.location)
        if (!manifest) {
          return { success: false, message: 'No valid manifest found' }
        }
        pluginDir = path.join(getPluginsDirectory(), manifest.id)
        await copyDirectory(source.location, pluginDir)
        break
      }

      case 'git': {
        // Clone from git
        const tempDir = `temp-${Date.now()}`
        const result = await cloneRepository(source.location, tempDir)
        if (!result.success) {
          return { success: false, message: result.message }
        }

        const tempPath = path.join(getPluginsDirectory(), tempDir)
        const manifest = getPluginManifest(tempPath)
        if (!manifest) {
          // Cleanup
          fs.rmSync(tempPath, { recursive: true, force: true })
          return { success: false, message: 'No valid manifest found in repository' }
        }

        pluginDir = path.join(getPluginsDirectory(), manifest.id)
        if (tempPath !== pluginDir) {
          fs.renameSync(tempPath, pluginDir)
        }
        break
      }

      case 'url': {
        // Download from URL
        const tempDir = `temp-${Date.now()}`
        const result = await downloadFile(source.location, `${tempDir}/plugin.zip`)
        if (!result.success) {
          return { success: false, message: result.message }
        }

        // Would need to unzip here - simplified for now
        return { success: false, message: 'URL installation requires zip extraction (not implemented)' }
      }

      case 'npm': {
        // Validate npm package name to prevent injection
        if (!isValidNpmPackageName(source.location)) {
          return { success: false, message: 'Invalid npm package name' }
        }

        // Use safeExec for secure execution (no shell interpolation)
        const result = await safeExec('npm', [
          'pack',
          source.location,
          '--pack-destination',
          getPluginsDirectory()
        ])

        if (!result.success) {
          return { success: false, message: result.stderr || 'Failed to download npm package' }
        }

        // Would need to unpack - simplified
        return { success: false, message: 'NPM installation not fully implemented' }
      }

      default:
        return { success: false, message: 'Unknown source type' }
    }

    // Get manifest and register
    const manifest = getPluginManifest(pluginDir)
    if (!manifest) {
      return { success: false, message: 'Failed to read installed plugin manifest' }
    }

    // Add to registry
    const registry = loadRegistry()
    const existing = registry.plugins.findIndex((p) => p.id === manifest.id)
    const installed: InstalledPlugin = {
      id: manifest.id,
      source,
      installedAt: new Date().toISOString(),
      version: manifest.version,
      enabled: true,
    }

    if (existing >= 0) {
      registry.plugins[existing] = installed
    } else {
      registry.plugins.push(installed)
    }
    saveRegistry(registry)

    return { success: true, pluginId: manifest.id }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Uninstall a plugin
 */
export async function uninstallPlugin(
  pluginId: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Validate plugin ID (prevent path traversal)
    if (!isValidPluginId(pluginId)) {
      return { success: false, message: 'Invalid plugin ID' }
    }

    const pluginDir = path.join(getPluginsDirectory(), pluginId)
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true })
    }

    // Remove from registry
    const registry = loadRegistry()
    registry.plugins = registry.plugins.filter((p) => p.id !== pluginId)
    saveRegistry(registry)

    return { success: true, message: 'Plugin uninstalled' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Enable or disable a plugin
 */
export function setPluginEnabled(
  pluginId: string,
  enabled: boolean
): { success: boolean; message: string } {
  try {
    const registry = loadRegistry()
    const plugin = registry.plugins.find((p) => p.id === pluginId)
    if (!plugin) {
      return { success: false, message: 'Plugin not found' }
    }

    plugin.enabled = enabled
    saveRegistry(registry)
    return { success: true, message: `Plugin ${enabled ? 'enabled' : 'disabled'}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function isValidGitUrl(url: string): boolean {
  // Allow HTTPS git URLs and git@ SSH URLs
  return /^(https:\/\/|git@)[\w.-]+[/:][\w./-]+\.git$/.test(url) ||
         /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url)
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function isValidPluginId(id: string): boolean {
  // Plugin IDs should be alphanumeric with dots/dashes/underscores
  return /^[\w.-]+$/.test(id) && !id.includes('..')
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }

  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
