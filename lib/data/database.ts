/**
 * Database Connection Management
 *
 * Provides SQLite database access using better-sqlite3 for the main process.
 * Implements singleton pattern with graceful shutdown handling.
 *
 * Location: ~/Library/Application Support/ledger/ledger.db
 */

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { runMigrations, getCurrentVersion } from './migrations'

// ============================================================================
// Types
// ============================================================================

export interface DatabaseConfig {
  /** Custom database path (defaults to app userData) */
  path?: string
  /** Enable verbose logging */
  verbose?: boolean
  /** Run migrations on connect */
  autoMigrate?: boolean
}

export interface ConnectionInfo {
  path: string
  version: number
  connected: boolean
}

// ============================================================================
// Singleton Database Manager
// ============================================================================

let db: DatabaseType | null = null
let dbPath: string | null = null

/**
 * Get database path within user data directory.
 */
function getDefaultDbPath(): string {
  return path.join(app.getPath('userData'), 'ledger.db')
}

/**
 * Connect to the SQLite database.
 * Creates the database file if it doesn't exist.
 *
 * @param config - Optional configuration
 * @returns Database instance
 */
export function connect(config: DatabaseConfig = {}): DatabaseType {
  if (db) {
    return db
  }

  const targetPath = config.path || getDefaultDbPath()

  try {
    db = new Database(targetPath, {
      verbose: config.verbose ? console.log : undefined,
    })

    // Enable WAL mode for better concurrent access
    db.pragma('journal_mode = WAL')

    // Enable foreign keys
    db.pragma('foreign_keys = ON')

    dbPath = targetPath

    // Run migrations if enabled (default: true)
    if (config.autoMigrate !== false) {
      runMigrations(db)
    }

    console.log(`[Database] Connected to ${targetPath}`)
    return db
  } catch (error) {
    console.error('[Database] Connection failed:', error)
    throw error
  }
}

/**
 * Get the current database instance.
 * Throws if not connected.
 */
export function getDb(): DatabaseType {
  if (!db) {
    throw new Error('[Database] Not connected. Call connect() first.')
  }
  return db
}

/**
 * Get connection info.
 */
export function getConnectionInfo(): ConnectionInfo {
  return {
    path: dbPath || '',
    version: db ? getCurrentVersion(db) : 0,
    connected: db !== null,
  }
}

/**
 * Check if database is connected.
 */
export function isConnected(): boolean {
  return db !== null
}

/**
 * Close the database connection.
 * Safe to call multiple times.
 */
export function close(): void {
  if (db) {
    try {
      db.close()
      console.log('[Database] Connection closed')
    } catch (error) {
      console.error('[Database] Close failed:', error)
    } finally {
      db = null
      dbPath = null
    }
  }
}

/**
 * Execute a function within a transaction.
 * Automatically commits on success, rolls back on error.
 *
 * @param fn - Function to execute within transaction
 * @returns Result of the function
 */
export function transaction<T>(fn: (db: DatabaseType) => T): T {
  const database = getDb()
  return database.transaction(fn)(database)
}

/**
 * Perform database vacuum (compact and defragment).
 */
export function vacuum(): void {
  const database = getDb()
  database.exec('VACUUM')
  console.log('[Database] Vacuum completed')
}

/**
 * Get database file size in bytes.
 */
export function getFileSize(): number {
  if (!dbPath) return 0

  try {
    const stats = fs.statSync(dbPath)
    return stats.size
  } catch {
    return 0
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

/**
 * Register cleanup handlers for graceful shutdown.
 * Called automatically when the module is loaded.
 */
function registerShutdownHandlers(): void {
  // Handle app quit
  app.on('will-quit', () => {
    close()
  })

  // Handle process signals
  process.on('SIGINT', () => {
    close()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    close()
    process.exit(0)
  })
}

// Register handlers on module load
registerShutdownHandlers()
