/**
 * Data Layer
 *
 * Provides SQLite database access and caching for Ledger.
 *
 * @example
 * ```typescript
 * import { connect, getDb, CacheManager, createCache } from '@/lib/data'
 *
 * // Initialize database on app startup
 * connect()
 *
 * // Use cache for temporary data
 * const cache = createCache('my-feature', 60000) // 1 min TTL
 * cache.set('key', { data: 'value' })
 * const data = cache.get('key')
 *
 * // Direct database access for custom queries
 * const db = getDb()
 * const rows = db.prepare('SELECT * FROM settings').all()
 * ```
 */

// Database connection
export {
  connect,
  getDb,
  close,
  isConnected,
  getConnectionInfo,
  transaction,
  vacuum,
  getFileSize,
  type DatabaseConfig,
  type ConnectionInfo,
} from './database'

// Schema
export {
  SCHEMA_VERSION,
  TABLES,
  createAllTables,
  tableExists,
  listTables,
  getTableRowCount,
  type CacheEntry,
  type RepositoryEntry,
  type PluginDataEntry,
  type SettingsEntry,
} from './schema'

// Migrations
export {
  MIGRATIONS,
  runMigrations,
  rollbackTo,
  resetDatabase,
  getCurrentVersion,
  getAppliedMigrations,
  getPendingMigrations,
  needsMigration,
  validateMigrations,
  type Migration,
  type MigrationRecord,
} from './migrations'

// Cache Manager
export {
  CacheManager,
  createCache,
  getGlobalCache,
  runCacheCleanup,
  type CacheOptions,
  type CacheStats,
} from './cache-manager'

// Plugin Database
export {
  // Simple storage (key-value in main db)
  getPluginData,
  setPluginData,
  deletePluginData,
  getPluginKeys,
  clearPluginData,
  cleanupExpiredPluginData,
  // Custom databases (per-plugin)
  requestCustomDatabase,
  hasCustomDatabase,
  getPluginDatabaseInfo,
  closeCustomDatabase,
  deleteCustomDatabase,
  closeAllCustomDatabases,
  listCustomDatabases,
  type PluginStorageOptions,
  type PluginDatabaseInfo,
} from './plugin-database'
