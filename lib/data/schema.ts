/**
 * Database Schema Definitions
 *
 * Defines table schemas for Ledger's SQLite database.
 * Schemas are used by the migration system to create and update tables.
 *
 * Tables:
 * - migrations: Track applied migrations
 * - cache: Key-value cache with TTL
 * - repositories: Recently opened repositories
 * - plugin_data: Plugin-specific persistent data
 * - settings: Application settings (replaces JSON file)
 */

import type { Database } from 'better-sqlite3'

// ============================================================================
// Schema Version
// ============================================================================

/**
 * Current schema version.
 * Increment when adding new migrations.
 */
export const SCHEMA_VERSION = 1

// ============================================================================
// Table Definitions
// ============================================================================

/**
 * Core system tables SQL.
 */
export const TABLES = {
  /**
   * Migration tracking table.
   * Created first, before running any migrations.
   */
  migrations: `
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  /**
   * Key-value cache with TTL support.
   * Used by CacheManager for temporary data storage.
   */
  cache: `
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `,

  /**
   * Index for cache expiration queries.
   */
  cache_expires_idx: `
    CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at)
      WHERE expires_at IS NOT NULL
  `,

  /**
   * Recently opened repositories.
   * Ordered by last opened time for quick access list.
   */
  repositories: `
    CREATE TABLE IF NOT EXISTS repositories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      last_opened_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      open_count INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `,

  /**
   * Index for repository path lookups.
   */
  repositories_path_idx: `
    CREATE INDEX IF NOT EXISTS idx_repositories_path ON repositories(path)
  `,

  /**
   * Plugin-specific persistent data.
   * Isolated by plugin ID with optional TTL.
   */
  plugin_data: `
    CREATE TABLE IF NOT EXISTS plugin_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(plugin_id, key)
    )
  `,

  /**
   * Index for plugin data lookups.
   */
  plugin_data_idx: `
    CREATE INDEX IF NOT EXISTS idx_plugin_data_plugin ON plugin_data(plugin_id)
  `,

  /**
   * Application settings table.
   * Replaces JSON file for better concurrent access.
   */
  settings: `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `,
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Cache entry structure.
 */
export interface CacheEntry {
  key: string
  value: string
  expires_at: number | null
  created_at: number
  updated_at: number
}

/**
 * Repository entry structure.
 */
export interface RepositoryEntry {
  id: number
  path: string
  name: string
  last_opened_at: number
  open_count: number
  created_at: number
}

/**
 * Plugin data entry structure.
 */
export interface PluginDataEntry {
  id: number
  plugin_id: string
  key: string
  value: string
  expires_at: number | null
  created_at: number
  updated_at: number
}

/**
 * Settings entry structure.
 */
export interface SettingsEntry {
  key: string
  value: string
  updated_at: number
}

// ============================================================================
// Schema Utilities
// ============================================================================

/**
 * Create all tables in order.
 * Called by migration system for initial setup.
 */
export function createAllTables(db: Database): void {
  // Create tables in order (migrations first)
  db.exec(TABLES.migrations)
  db.exec(TABLES.cache)
  db.exec(TABLES.cache_expires_idx)
  db.exec(TABLES.repositories)
  db.exec(TABLES.repositories_path_idx)
  db.exec(TABLES.plugin_data)
  db.exec(TABLES.plugin_data_idx)
  db.exec(TABLES.settings)
}

/**
 * Check if a table exists.
 */
export function tableExists(db: Database, tableName: string): boolean {
  const result = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    )
    .get(tableName) as { name: string } | undefined

  return result !== undefined
}

/**
 * Get list of all tables.
 */
export function listTables(db: Database): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    )
    .all() as Array<{ name: string }>

  return rows.map((row) => row.name)
}

/**
 * Get table row count.
 */
export function getTableRowCount(db: Database, tableName: string): number {
  if (!tableExists(db, tableName)) return 0

  const result = db
    .prepare(`SELECT COUNT(*) as count FROM ${tableName}`)
    .get() as { count: number }

  return result.count
}
