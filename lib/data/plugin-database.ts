/**
 * Plugin Database Service
 *
 * Provides database access for plugins with two storage tiers:
 *
 * 1. **Simple Storage** (default): Key-value storage in the main ledger.db
 *    - Uses the `plugin_data` table
 *    - Suitable for settings, state, small data
 *    - Shared connection, efficient
 *
 * 2. **Custom Database**: Isolated SQLite database per plugin
 *    - Plugin gets full control over schema
 *    - Located at: ~/Library/Application Support/ledger/plugins/<plugin-id>.db
 *    - Requested via `requestCustomDatabase()`
 *
 * Security:
 * - Plugin IDs are validated (alphanumeric, dots, hyphens only)
 * - Each plugin's data is isolated by plugin_id
 * - Custom databases are sandboxed to plugin-specific paths
 */

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { getDb, isConnected } from './database'
import type { PluginDataEntry } from './schema'

// ============================================================================
// Types
// ============================================================================

export interface PluginStorageOptions {
  /** TTL in milliseconds (optional) */
  ttl?: number
}

export interface PluginDatabaseInfo {
  pluginId: string
  path: string
  sizeBytes: number
  connected: boolean
}

// ============================================================================
// Plugin ID Validation
// ============================================================================

/**
 * Validate plugin ID format.
 * Allowed: alphanumeric, dots, hyphens (e.g., "my-org.plugin-name")
 */
function validatePluginId(pluginId: string): void {
  if (!pluginId || typeof pluginId !== 'string') {
    throw new Error('Plugin ID is required')
  }

  if (pluginId.length > 128) {
    throw new Error('Plugin ID too long (max 128 chars)')
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/.test(pluginId) && pluginId.length > 1) {
    throw new Error(`Invalid plugin ID format: ${pluginId}`)
  }

  // Single char plugin IDs must be alphanumeric
  if (pluginId.length === 1 && !/^[a-zA-Z0-9]$/.test(pluginId)) {
    throw new Error(`Invalid plugin ID format: ${pluginId}`)
  }
}

/**
 * Validate storage key format.
 */
function validateKey(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new Error('Storage key is required')
  }

  if (key.length > 256) {
    throw new Error('Storage key too long (max 256 chars)')
  }

  // Prevent path traversal and special chars
  if (key.includes('..') || key.includes('/') || key.includes('\\')) {
    throw new Error(`Invalid storage key: ${key}`)
  }
}

// ============================================================================
// Simple Storage (plugin_data table)
// ============================================================================

/**
 * Get current timestamp in seconds.
 */
function now(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * Get a value from plugin storage.
 */
export function getPluginData<T>(pluginId: string, key: string): T | null {
  validatePluginId(pluginId)
  validateKey(key)

  if (!isConnected()) return null

  const db = getDb()
  const currentTime = now()

  const row = db
    .prepare(
      `SELECT value, expires_at FROM plugin_data
       WHERE plugin_id = ? AND key = ?
       AND (expires_at IS NULL OR expires_at > ?)`
    )
    .get(pluginId, key, currentTime) as Pick<PluginDataEntry, 'value' | 'expires_at'> | undefined

  if (!row) return null

  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

/**
 * Set a value in plugin storage.
 * Returns true on success, false if database not connected.
 */
export function setPluginData<T>(
  pluginId: string,
  key: string,
  value: T,
  options: PluginStorageOptions = {}
): boolean {
  validatePluginId(pluginId)
  validateKey(key)

  if (!isConnected()) {
    return false
  }

  const db = getDb()
  const serialized = JSON.stringify(value)
  const currentTime = now()
  const expiresAt = options.ttl ? currentTime + Math.floor(options.ttl / 1000) : null

  db.prepare(
    `INSERT INTO plugin_data (plugin_id, key, value, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(plugin_id, key) DO UPDATE SET
       value = excluded.value,
       expires_at = excluded.expires_at,
       updated_at = excluded.updated_at`
  ).run(pluginId, key, serialized, expiresAt, currentTime, currentTime)

  return true
}

/**
 * Delete a value from plugin storage.
 */
export function deletePluginData(pluginId: string, key: string): boolean {
  validatePluginId(pluginId)
  validateKey(key)

  if (!isConnected()) return false

  const db = getDb()
  const result = db
    .prepare('DELETE FROM plugin_data WHERE plugin_id = ? AND key = ?')
    .run(pluginId, key)

  return result.changes > 0
}

/**
 * Get all keys for a plugin.
 */
export function getPluginKeys(pluginId: string): string[] {
  validatePluginId(pluginId)

  if (!isConnected()) return []

  const db = getDb()
  const currentTime = now()

  const rows = db
    .prepare(
      `SELECT key FROM plugin_data
       WHERE plugin_id = ?
       AND (expires_at IS NULL OR expires_at > ?)`
    )
    .all(pluginId, currentTime) as Array<{ key: string }>

  return rows.map((r) => r.key)
}

/**
 * Clear all data for a plugin.
 */
export function clearPluginData(pluginId: string): number {
  validatePluginId(pluginId)

  if (!isConnected()) return 0

  const db = getDb()
  const result = db.prepare('DELETE FROM plugin_data WHERE plugin_id = ?').run(pluginId)

  return result.changes
}

/**
 * Clean up expired plugin data entries.
 */
export function cleanupExpiredPluginData(): number {
  if (!isConnected()) return 0

  const db = getDb()
  const currentTime = now()

  const result = db
    .prepare('DELETE FROM plugin_data WHERE expires_at IS NOT NULL AND expires_at <= ?')
    .run(currentTime)

  return result.changes
}

// ============================================================================
// Custom Database (per-plugin)
// ============================================================================

/** Active custom plugin databases */
const customDatabases = new Map<string, DatabaseType>()

/**
 * Get the path to a plugin's custom database.
 */
function getPluginDbPath(pluginId: string): string {
  const pluginsDir = path.join(app.getPath('userData'), 'plugins')

  // Ensure plugins directory exists
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true })
  }

  return path.join(pluginsDir, `${pluginId}.db`)
}

/**
 * Request a custom database for a plugin.
 * Creates the database if it doesn't exist.
 *
 * @param pluginId - Plugin identifier
 * @returns Database instance with full SQLite access
 */
export function requestCustomDatabase(pluginId: string): DatabaseType {
  validatePluginId(pluginId)

  // Return existing connection if available
  const existing = customDatabases.get(pluginId)
  if (existing) {
    return existing
  }

  const dbPath = getPluginDbPath(pluginId)

  try {
    const db = new Database(dbPath)

    // Enable WAL mode
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    customDatabases.set(pluginId, db)

    console.log(`[PluginDatabase] Created custom database for ${pluginId} at ${dbPath}`)
    return db
  } catch (error) {
    console.error(`[PluginDatabase] Failed to create database for ${pluginId}:`, error)
    throw error
  }
}

/**
 * Check if a plugin has a custom database.
 */
export function hasCustomDatabase(pluginId: string): boolean {
  validatePluginId(pluginId)
  return fs.existsSync(getPluginDbPath(pluginId))
}

/**
 * Get info about a plugin's custom database.
 */
export function getPluginDatabaseInfo(pluginId: string): PluginDatabaseInfo | null {
  validatePluginId(pluginId)

  const dbPath = getPluginDbPath(pluginId)

  if (!fs.existsSync(dbPath)) {
    return null
  }

  try {
    const stats = fs.statSync(dbPath)
    return {
      pluginId,
      path: dbPath,
      sizeBytes: stats.size,
      connected: customDatabases.has(pluginId),
    }
  } catch {
    return null
  }
}

/**
 * Close a plugin's custom database.
 */
export function closeCustomDatabase(pluginId: string): void {
  validatePluginId(pluginId)

  const db = customDatabases.get(pluginId)
  if (db) {
    try {
      db.close()
      console.log(`[PluginDatabase] Closed custom database for ${pluginId}`)
    } catch (error) {
      console.error(`[PluginDatabase] Error closing database for ${pluginId}:`, error)
    } finally {
      customDatabases.delete(pluginId)
    }
  }
}

/**
 * Delete a plugin's custom database.
 * WARNING: This permanently deletes all plugin data.
 */
export function deleteCustomDatabase(pluginId: string): boolean {
  validatePluginId(pluginId)

  // Close connection first
  closeCustomDatabase(pluginId)

  const dbPath = getPluginDbPath(pluginId)

  if (!fs.existsSync(dbPath)) {
    return false
  }

  try {
    // Delete main db file
    fs.unlinkSync(dbPath)

    // Also delete WAL and SHM files if they exist
    const walPath = dbPath + '-wal'
    const shmPath = dbPath + '-shm'

    if (fs.existsSync(walPath)) fs.unlinkSync(walPath)
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath)

    console.log(`[PluginDatabase] Deleted custom database for ${pluginId}`)
    return true
  } catch (error) {
    console.error(`[PluginDatabase] Error deleting database for ${pluginId}:`, error)
    return false
  }
}

/**
 * Close all custom plugin databases.
 * Called during app shutdown.
 */
export function closeAllCustomDatabases(): void {
  for (const [pluginId] of customDatabases) {
    closeCustomDatabase(pluginId)
  }
}

/**
 * List all plugins with custom databases.
 */
export function listCustomDatabases(): PluginDatabaseInfo[] {
  const pluginsDir = path.join(app.getPath('userData'), 'plugins')

  if (!fs.existsSync(pluginsDir)) {
    return []
  }

  const files = fs.readdirSync(pluginsDir).filter((f) => f.endsWith('.db'))

  return files.map((file) => {
    const pluginId = file.slice(0, -3) // Remove .db extension
    return getPluginDatabaseInfo(pluginId)!
  }).filter(Boolean)
}

// ============================================================================
// Cleanup on shutdown
// ============================================================================

/**
 * Register cleanup handlers.
 */
app.on('will-quit', () => {
  closeAllCustomDatabases()
})
