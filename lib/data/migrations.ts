/**
 * Database Migration System
 *
 * Handles database schema versioning and upgrades.
 * Migrations are run in order and tracked in the migrations table.
 *
 * Adding a new migration:
 * 1. Add a new entry to MIGRATIONS array with incremented version
 * 2. Increment SCHEMA_VERSION in schema.ts
 * 3. Implement the migration SQL/logic
 */

import type { Database } from 'better-sqlite3'
import { TABLES, tableExists, SCHEMA_VERSION } from './schema'

// ============================================================================
// Types
// ============================================================================

export interface Migration {
  /** Version number (must be sequential starting from 1) */
  version: number
  /** Human-readable name */
  name: string
  /** Migration function - receives database, should be idempotent */
  up: (db: Database) => void
  /** Optional rollback function */
  down?: (db: Database) => void
}

export interface MigrationRecord {
  version: number
  name: string
  applied_at: string
}

// ============================================================================
// Migration Definitions
// ============================================================================

/**
 * All migrations in order.
 * Each migration should be idempotent where possible.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      // Create all core tables
      db.exec(TABLES.cache)
      db.exec(TABLES.cache_expires_idx)
      db.exec(TABLES.repositories)
      db.exec(TABLES.repositories_path_idx)
      db.exec(TABLES.plugin_data)
      db.exec(TABLES.plugin_data_idx)
      db.exec(TABLES.settings)
    },
    down: (db) => {
      // Drop tables in reverse dependency order
      db.exec('DROP TABLE IF EXISTS settings')
      db.exec('DROP INDEX IF EXISTS idx_plugin_data_plugin')
      db.exec('DROP TABLE IF EXISTS plugin_data')
      db.exec('DROP INDEX IF EXISTS idx_repositories_path')
      db.exec('DROP TABLE IF EXISTS repositories')
      db.exec('DROP INDEX IF EXISTS idx_cache_expires')
      db.exec('DROP TABLE IF EXISTS cache')
    },
  },
]

// ============================================================================
// Migration Runner
// ============================================================================

/**
 * Ensure migrations table exists.
 */
function ensureMigrationsTable(db: Database): void {
  db.exec(TABLES.migrations)
}

/**
 * Get current schema version from database.
 */
export function getCurrentVersion(db: Database): number {
  if (!tableExists(db, 'migrations')) {
    return 0
  }

  const result = db
    .prepare('SELECT MAX(version) as version FROM migrations')
    .get() as { version: number | null }

  return result.version ?? 0
}

/**
 * Get all applied migrations.
 */
export function getAppliedMigrations(db: Database): MigrationRecord[] {
  if (!tableExists(db, 'migrations')) {
    return []
  }

  return db
    .prepare('SELECT version, name, applied_at FROM migrations ORDER BY version')
    .all() as MigrationRecord[]
}

/**
 * Get pending migrations.
 */
export function getPendingMigrations(db: Database): Migration[] {
  const currentVersion = getCurrentVersion(db)
  return MIGRATIONS.filter((m) => m.version > currentVersion)
}

/**
 * Run all pending migrations.
 *
 * @param db - Database instance
 * @returns Number of migrations applied
 */
export function runMigrations(db: Database): number {
  ensureMigrationsTable(db)

  const pending = getPendingMigrations(db)

  if (pending.length === 0) {
    console.log('[Migrations] Database is up to date')
    return 0
  }

  console.log(`[Migrations] Running ${pending.length} pending migration(s)...`)

  let applied = 0

  for (const migration of pending) {
    try {
      // Run in transaction
      db.transaction(() => {
        console.log(`[Migrations] Applying v${migration.version}: ${migration.name}`)

        // Run migration
        migration.up(db)

        // Record migration
        db.prepare(
          'INSERT INTO migrations (version, name) VALUES (?, ?)'
        ).run(migration.version, migration.name)

        applied++
      })()
    } catch (error) {
      console.error(
        `[Migrations] Failed at v${migration.version}: ${migration.name}`,
        error
      )
      throw error
    }
  }

  console.log(`[Migrations] Applied ${applied} migration(s). Now at v${SCHEMA_VERSION}`)
  return applied
}

/**
 * Rollback to a specific version.
 * Runs down() migrations in reverse order.
 *
 * @param db - Database instance
 * @param targetVersion - Target version to rollback to (0 = fresh)
 * @returns Number of migrations rolled back
 */
export function rollbackTo(db: Database, targetVersion: number): number {
  const currentVersion = getCurrentVersion(db)

  if (targetVersion >= currentVersion) {
    console.log('[Migrations] Nothing to rollback')
    return 0
  }

  // Get migrations to rollback (in reverse order)
  const toRollback = MIGRATIONS.filter(
    (m) => m.version > targetVersion && m.version <= currentVersion
  ).reverse()

  console.log(`[Migrations] Rolling back ${toRollback.length} migration(s)...`)

  let rolledBack = 0

  for (const migration of toRollback) {
    if (!migration.down) {
      throw new Error(
        `[Migrations] Cannot rollback v${migration.version}: no down() defined`
      )
    }

    try {
      db.transaction(() => {
        console.log(`[Migrations] Rolling back v${migration.version}: ${migration.name}`)

        // Run rollback
        migration.down!(db)

        // Remove migration record
        db.prepare('DELETE FROM migrations WHERE version = ?').run(migration.version)

        rolledBack++
      })()
    } catch (error) {
      console.error(
        `[Migrations] Rollback failed at v${migration.version}: ${migration.name}`,
        error
      )
      throw error
    }
  }

  console.log(`[Migrations] Rolled back ${rolledBack} migration(s). Now at v${targetVersion}`)
  return rolledBack
}

/**
 * Reset database to fresh state.
 * WARNING: This drops all data.
 */
export function resetDatabase(db: Database): void {
  console.log('[Migrations] Resetting database...')

  rollbackTo(db, 0)

  // Also drop migrations table
  db.exec('DROP TABLE IF EXISTS migrations')

  console.log('[Migrations] Database reset complete')
}

/**
 * Check if database needs migration.
 */
export function needsMigration(db: Database): boolean {
  return getCurrentVersion(db) < SCHEMA_VERSION
}

/**
 * Validate migration sequence.
 * Ensures versions are sequential and match expected schema version.
 */
export function validateMigrations(): boolean {
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const expected = i + 1
    const actual = MIGRATIONS[i].version

    if (actual !== expected) {
      console.error(
        `[Migrations] Invalid version sequence: expected ${expected}, got ${actual}`
      )
      return false
    }
  }

  if (MIGRATIONS.length !== SCHEMA_VERSION) {
    console.error(
      `[Migrations] Migration count (${MIGRATIONS.length}) doesn't match SCHEMA_VERSION (${SCHEMA_VERSION})`
    )
    return false
  }

  return true
}
