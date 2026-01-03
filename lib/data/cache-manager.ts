/**
 * Cache Manager
 *
 * Provides a key-value cache with TTL (time-to-live) support.
 * Uses SQLite for persistence, surviving app restarts.
 *
 * Features:
 * - TTL-based expiration
 * - Automatic cleanup of expired entries
 * - Namespace isolation (for plugins)
 * - In-memory LRU cache layer (optional)
 * - Batch operations
 */

import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type { CacheEntry } from './schema'

// ============================================================================
// Types
// ============================================================================

export interface CacheOptions {
  /** TTL in milliseconds (default: no expiration) */
  ttl?: number
  /** Namespace prefix for key isolation */
  namespace?: string
}

export interface CacheStats {
  totalEntries: number
  expiredEntries: number
  namespaces: string[]
}

// ============================================================================
// Cache Manager Class
// ============================================================================

export class CacheManager {
  private db: Database
  private namespace: string
  private defaultTtl: number | undefined

  /**
   * Create a cache manager instance.
   *
   * @param options - Cache options
   */
  constructor(options: CacheOptions = {}) {
    this.db = getDb()
    this.namespace = options.namespace || ''
    this.defaultTtl = options.ttl
  }

  /**
   * Build full key with namespace.
   */
  private buildKey(key: string): string {
    return this.namespace ? `${this.namespace}:${key}` : key
  }

  /**
   * Get current timestamp in seconds.
   */
  private now(): number {
    return Math.floor(Date.now() / 1000)
  }

  /**
   * Calculate expiration timestamp.
   */
  private getExpiry(ttl?: number): number | null {
    const effectiveTtl = ttl ?? this.defaultTtl
    if (!effectiveTtl) return null
    return this.now() + Math.floor(effectiveTtl / 1000)
  }

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  /**
   * Get a value from cache.
   *
   * @param key - Cache key
   * @returns Parsed value or null if not found/expired
   */
  get<T>(key: string): T | null {
    const fullKey = this.buildKey(key)
    const now = this.now()

    const row = this.db
      .prepare(
        `SELECT value, expires_at FROM cache
         WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`
      )
      .get(fullKey, now) as Pick<CacheEntry, 'value' | 'expires_at'> | undefined

    if (!row) return null

    try {
      return JSON.parse(row.value) as T
    } catch {
      return null
    }
  }

  /**
   * Set a value in cache.
   *
   * @param key - Cache key
   * @param value - Value to store (will be JSON serialized)
   * @param ttl - Optional TTL in milliseconds (overrides default)
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const fullKey = this.buildKey(key)
    const serialized = JSON.stringify(value)
    const expiresAt = this.getExpiry(ttl)
    const now = this.now()

    this.db
      .prepare(
        `INSERT INTO cache (key, value, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`
      )
      .run(fullKey, serialized, expiresAt, now, now)
  }

  /**
   * Delete a value from cache.
   *
   * @param key - Cache key
   * @returns true if deleted, false if not found
   */
  delete(key: string): boolean {
    const fullKey = this.buildKey(key)
    const result = this.db.prepare('DELETE FROM cache WHERE key = ?').run(fullKey)
    return result.changes > 0
  }

  /**
   * Check if key exists and is not expired.
   *
   * @param key - Cache key
   * @returns true if exists and valid
   */
  has(key: string): boolean {
    const fullKey = this.buildKey(key)
    const now = this.now()

    const row = this.db
      .prepare(
        `SELECT 1 FROM cache
         WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`
      )
      .get(fullKey, now)

    return row !== undefined
  }

  /**
   * Get or set a value using a factory function.
   *
   * @param key - Cache key
   * @param factory - Function to generate value if not cached
   * @param ttl - Optional TTL in milliseconds
   * @returns Cached or generated value
   */
  async getOrSet<T>(
    key: string,
    factory: () => T | Promise<T>,
    ttl?: number
  ): Promise<T> {
    const existing = this.get<T>(key)
    if (existing !== null) {
      return existing
    }

    const value = await factory()
    this.set(key, value, ttl)
    return value
  }

  /**
   * Update TTL for existing key without changing value.
   *
   * @param key - Cache key
   * @param ttl - New TTL in milliseconds
   * @returns true if updated, false if key not found
   */
  touch(key: string, ttl: number): boolean {
    const fullKey = this.buildKey(key)
    const expiresAt = this.getExpiry(ttl)
    const now = this.now()

    const result = this.db
      .prepare(
        `UPDATE cache SET expires_at = ?, updated_at = ?
         WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`
      )
      .run(expiresAt, now, fullKey, now)

    return result.changes > 0
  }

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  /**
   * Get multiple values at once.
   *
   * @param keys - Array of keys
   * @returns Map of key to value (missing keys omitted)
   */
  getMany<T>(keys: string[]): Map<string, T> {
    const result = new Map<string, T>()
    const fullKeys = keys.map((k) => this.buildKey(k))
    const now = this.now()

    // SQLite doesn't support arrays, so we build a parameterized IN clause
    const placeholders = fullKeys.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT key, value FROM cache
         WHERE key IN (${placeholders}) AND (expires_at IS NULL OR expires_at > ?)`
      )
      .all(...fullKeys, now) as Array<Pick<CacheEntry, 'key' | 'value'>>

    for (const row of rows) {
      try {
        // Strip namespace prefix to return original key
        const originalKey = this.namespace
          ? row.key.slice(this.namespace.length + 1)
          : row.key
        result.set(originalKey, JSON.parse(row.value))
      } catch {
        // Skip invalid entries
      }
    }

    return result
  }

  /**
   * Set multiple values at once.
   *
   * @param entries - Map or object of key-value pairs
   * @param ttl - Optional TTL in milliseconds
   */
  setMany<T>(entries: Map<string, T> | Record<string, T>, ttl?: number): void {
    const expiresAt = this.getExpiry(ttl)
    const now = this.now()

    const insert = this.db.prepare(
      `INSERT INTO cache (key, value, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`
    )

    const items = entries instanceof Map ? entries.entries() : Object.entries(entries)

    this.db.transaction(() => {
      for (const [key, value] of items) {
        const fullKey = this.buildKey(key)
        insert.run(fullKey, JSON.stringify(value), expiresAt, now, now)
      }
    })()
  }

  /**
   * Delete multiple values at once.
   *
   * @param keys - Array of keys
   * @returns Number of deleted entries
   */
  deleteMany(keys: string[]): number {
    const fullKeys = keys.map((k) => this.buildKey(k))
    const placeholders = fullKeys.map(() => '?').join(',')

    const result = this.db
      .prepare(`DELETE FROM cache WHERE key IN (${placeholders})`)
      .run(...fullKeys)

    return result.changes
  }

  // ==========================================================================
  // Namespace Operations
  // ==========================================================================

  /**
   * Get all keys in namespace.
   *
   * @param includeExpired - Include expired keys (default: false)
   * @returns Array of keys (without namespace prefix)
   */
  keys(includeExpired = false): string[] {
    const prefix = this.namespace ? `${this.namespace}:%` : '%'
    const now = this.now()

    let query = 'SELECT key FROM cache WHERE key LIKE ?'
    const params: (string | number)[] = [prefix]

    if (!includeExpired) {
      query += ' AND (expires_at IS NULL OR expires_at > ?)'
      params.push(now)
    }

    const rows = this.db.prepare(query).all(...params) as Array<{ key: string }>

    return rows.map((row) =>
      this.namespace ? row.key.slice(this.namespace.length + 1) : row.key
    )
  }

  /**
   * Clear all entries in namespace.
   *
   * @returns Number of deleted entries
   */
  clear(): number {
    if (this.namespace) {
      const result = this.db
        .prepare('DELETE FROM cache WHERE key LIKE ?')
        .run(`${this.namespace}:%`)
      return result.changes
    }

    // Clear all if no namespace
    const result = this.db.prepare('DELETE FROM cache').run()
    return result.changes
  }

  /**
   * Count entries in namespace.
   *
   * @param includeExpired - Include expired entries (default: false)
   */
  count(includeExpired = false): number {
    const prefix = this.namespace ? `${this.namespace}:%` : '%'
    const now = this.now()

    let query = 'SELECT COUNT(*) as count FROM cache WHERE key LIKE ?'
    const params: (string | number)[] = [prefix]

    if (!includeExpired) {
      query += ' AND (expires_at IS NULL OR expires_at > ?)'
      params.push(now)
    }

    const result = this.db.prepare(query).get(...params) as { count: number }
    return result.count
  }

  // ==========================================================================
  // Maintenance
  // ==========================================================================

  /**
   * Remove all expired entries.
   *
   * @returns Number of removed entries
   */
  cleanup(): number {
    const now = this.now()
    const result = this.db
      .prepare('DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at <= ?')
      .run(now)
    return result.changes
  }

  /**
   * Get cache statistics.
   */
  stats(): CacheStats {
    const now = this.now()

    const totalResult = this.db
      .prepare('SELECT COUNT(*) as count FROM cache')
      .get() as { count: number }

    const expiredResult = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM cache WHERE expires_at IS NOT NULL AND expires_at <= ?'
      )
      .get(now) as { count: number }

    const namespaceRows = this.db
      .prepare(
        `SELECT DISTINCT
           CASE
             WHEN key LIKE '%:%' THEN substr(key, 1, instr(key, ':') - 1)
             ELSE ''
           END as namespace
         FROM cache`
      )
      .all() as Array<{ namespace: string }>

    return {
      totalEntries: totalResult.count,
      expiredEntries: expiredResult.count,
      namespaces: namespaceRows.map((r) => r.namespace).filter(Boolean),
    }
  }
}

// ============================================================================
// Convenience Factory
// ============================================================================

/**
 * Create a namespaced cache instance.
 *
 * @param namespace - Namespace for key isolation
 * @param defaultTtl - Default TTL in milliseconds
 */
export function createCache(namespace: string, defaultTtl?: number): CacheManager {
  return new CacheManager({ namespace, ttl: defaultTtl })
}

/**
 * Get the global cache instance (no namespace).
 */
let globalCache: CacheManager | null = null

export function getGlobalCache(): CacheManager {
  if (!globalCache) {
    globalCache = new CacheManager()
  }
  return globalCache
}

/**
 * Run cache cleanup (removes expired entries).
 * Call periodically or on app startup.
 */
export function runCacheCleanup(): number {
  return getGlobalCache().cleanup()
}
