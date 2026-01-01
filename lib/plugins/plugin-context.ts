/**
 * Plugin Context Factory
 *
 * Creates the context object provided to plugins. This is the plugin's
 * interface to Ledger's functionality.
 *
 * Architecture: Pure functional factory with dependency injection.
 * The factory takes store accessors and IPC functions as parameters,
 * avoiding tight coupling to specific implementations.
 *
 * Storage Options:
 * - localStorage (default): Fast, in-memory, cleared on app restart
 * - SQLite (persistent): Survives restarts, backed by database
 */

import type { PluginContext, PluginStorage, PluginLogger, PluginAPI, PluginEvents } from './plugin-types'
import { hasPermission } from './plugin-permissions'
import { agentEvents } from './agent-events'

// ============================================================================
// Types
// ============================================================================

/**
 * Dependencies required to create a full plugin context.
 * These are injected to allow testing and avoid circular imports.
 */
export interface PluginContextDependencies {
  // Store accessors (work with Zustand getState pattern)
  getRepoPath: () => string | null
  getCurrentBranch: () => string
  getBranches: () => unknown[]
  getWorktrees: () => unknown[]
  getPullRequests: () => unknown[]
  getCommits: () => unknown[]
  getWorkingStatus: () => unknown | null
  setStatus: (status: { type: string; message: string }) => void

  // Plugin store accessors
  openPanel: (pluginId: string, data?: unknown) => void
  closePanel: (instanceId: string) => void
  getOpenPanels: () => Array<{ pluginId: string; instanceId: string }>
  setActiveApp: (appId: string | null) => void

  // IPC functions (optional - for renderer process only)
  ipc?: {
    getBranches: () => Promise<unknown[]>
    getWorktrees: () => Promise<unknown[]>
    getPullRequests: () => Promise<unknown[]>
    getCommitHistory: () => Promise<unknown[]>
    getStagingStatus: () => Promise<unknown>
  }
}

// ============================================================================
// Storage Factory
// ============================================================================

/**
 * Create isolated storage for a plugin.
 * Uses localStorage with prefix-based isolation and key validation.
 *
 * Security features:
 * - Prefix isolation: Each plugin's keys are prefixed with its ID
 * - Key validation: Prevents path traversal and prefix manipulation
 * - Scoped enumeration: keys() and clear() only affect the plugin's own data
 */
export function createPluginStorage(pluginId: string): PluginStorage {
  const prefix = `ledger-plugin:${pluginId}:`

  /**
   * Validate and prefix a storage key.
   * Prevents:
   * - Path traversal (../, /, \)
   * - Prefix manipulation (keys containing :)
   * - Empty keys
   * - Excessively long keys
   */
  const validateKey = (key: string): string => {
    // Check for empty or whitespace-only keys
    if (!key || !key.trim()) {
      throw new Error('Storage key cannot be empty')
    }

    // Check for path traversal attempts
    if (key.includes('..') || key.startsWith('/') || key.startsWith('\\')) {
      throw new Error(`Invalid storage key (path traversal): ${key}`)
    }

    // Check for prefix manipulation (colon could break isolation)
    if (key.includes(':')) {
      throw new Error(`Invalid storage key (contains ':'): ${key}`)
    }

    // Check for reasonable key length (prevent DoS)
    if (key.length > 256) {
      throw new Error(`Storage key too long (max 256 chars): ${key.slice(0, 50)}...`)
    }

    return prefix + key
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const fullKey = validateKey(key)
        const value = localStorage.getItem(fullKey)
        return value ? JSON.parse(value) : null
      } catch {
        return null
      }
    },

    async set<T>(key: string, value: T): Promise<void> {
      const fullKey = validateKey(key)
      localStorage.setItem(fullKey, JSON.stringify(value))
    },

    async delete(key: string): Promise<void> {
      const fullKey = validateKey(key)
      localStorage.removeItem(fullKey)
    },

    async clear(): Promise<void> {
      // Only clear THIS plugin's keys - safe iteration
      const keysToRemove = Object.keys(localStorage).filter((k) => k.startsWith(prefix))
      keysToRemove.forEach((k) => localStorage.removeItem(k))
    },

    async keys(): Promise<string[]> {
      // Only return THIS plugin's keys (without prefix)
      return Object.keys(localStorage)
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length))
    },

    async has(key: string): Promise<boolean> {
      try {
        const fullKey = validateKey(key)
        return localStorage.getItem(fullKey) !== null
      } catch {
        return false
      }
    },
  }
}

// ============================================================================
// Persistent Storage Factory (SQLite-backed via IPC)
// ============================================================================

/**
 * Create persistent SQLite-backed storage for a plugin.
 * Data survives app restarts, unlike localStorage.
 *
 * Requires window.conveyor.plugin to be available (renderer process only).
 * Falls back to localStorage if conveyor API is not available.
 */
export function createPersistentPluginStorage(pluginId: string): PluginStorage {
  // Check if we have conveyor API access
  const hasConveyor = typeof window !== 'undefined' && window.conveyor?.plugin

  if (!hasConveyor) {
    console.warn(`[Plugin:${pluginId}] No conveyor API available, falling back to localStorage`)
    return createPluginStorage(pluginId)
  }

  const pluginApi = window.conveyor.plugin

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const result = await pluginApi.getData<T>(pluginId, key)
        if (result.success) {
          return result.data ?? null
        }
        return null
      } catch {
        return null
      }
    },

    async set<T>(key: string, value: T): Promise<void> {
      try {
        const result = await pluginApi.setData(pluginId, key, value)
        if (!result.success) {
          console.warn(`[Plugin:${pluginId}] Storage set failed: ${result.message}`)
        }
      } catch (error) {
        console.error(`[Plugin:${pluginId}] Storage set error:`, error)
      }
    },

    async delete(key: string): Promise<void> {
      try {
        await pluginApi.deleteData(pluginId, key)
      } catch (error) {
        console.error(`[Plugin:${pluginId}] Storage delete error:`, error)
      }
    },

    async clear(): Promise<void> {
      try {
        await pluginApi.clearData(pluginId)
      } catch (error) {
        console.error(`[Plugin:${pluginId}] Storage clear error:`, error)
      }
    },

    async keys(): Promise<string[]> {
      try {
        const result = await pluginApi.getKeys(pluginId)
        return result.success ? result.keys : []
      } catch {
        return []
      }
    },

    async has(key: string): Promise<boolean> {
      const value = await this.get(key)
      return value !== null
    },
  }
}

// ============================================================================
// Logger Factory
// ============================================================================

/**
 * Create prefixed logger for a plugin.
 */
export function createPluginLogger(pluginId: string): PluginLogger {
  const tag = `[Plugin:${pluginId}]`

  return {
    debug: (msg, ...args) => console.debug(tag, msg, ...args),
    info: (msg, ...args) => console.info(tag, msg, ...args),
    warn: (msg, ...args) => console.warn(tag, msg, ...args),
    error: (msg, ...args) => console.error(tag, msg, ...args),
  }
}

// ============================================================================
// API Factory
// ============================================================================

/**
 * Create the plugin API with injected dependencies.
 * This allows the same factory to work in both main process (stubs)
 * and renderer process (real implementations).
 */
export function createPluginAPI(
  pluginId: string,
  deps: PluginContextDependencies
): PluginAPI {
  const logger = createPluginLogger(pluginId)

  // Helper to check permission and log if missing
  const checkPermission = (permission: 'git:read' | 'git:write' | 'notifications'): boolean => {
    if (!hasPermission(pluginId, permission)) {
      logger.warn(`Missing permission: ${permission}`)
      return false
    }
    return true
  }

  return {
    // Repository data access (requires git:read)
    getRepoPath: () => {
      if (!checkPermission('git:read')) return null
      return deps.getRepoPath()
    },
    getCurrentBranch: async () => {
      if (!checkPermission('git:read')) return ''
      return deps.getCurrentBranch()
    },
    getBranches: async () => {
      if (!checkPermission('git:read')) return []
      return deps.getBranches()
    },
    getWorktrees: async () => {
      if (!checkPermission('git:read')) return []
      return deps.getWorktrees()
    },
    getPullRequests: async () => {
      if (!checkPermission('git:read')) return []
      return deps.getPullRequests()
    },
    getCommits: async () => {
      if (!checkPermission('git:read')) return []
      return deps.getCommits()
    },
    getWorkingStatus: async () => {
      if (!checkPermission('git:read')) return null
      return deps.getWorkingStatus()
    },

    // Git operations (requires git:write)
    git: async (_args) => {
      if (!checkPermission('git:write')) return ''
      // Limited git access - plugins use specific APIs
      logger.warn('Direct git access is limited. Use specific API methods.')
      return ''
    },

    // Notifications (requires notifications permission)
    showNotification: (message, type) => {
      if (!checkPermission('notifications')) return
      deps.setStatus({ type: type ?? 'info', message })
    },

    // Plugin navigation
    openPanel: (panelPluginId, panelData) => {
      deps.openPanel(panelPluginId, panelData)
    },

    closePanel: () => {
      // Close all panels opened by this plugin
      const panels = deps.getOpenPanels()
      panels
        .filter((p) => p.pluginId === pluginId)
        .forEach((p) => deps.closePanel(p.instanceId))
    },

    navigateToApp: (appPluginId) => {
      deps.setActiveApp(appPluginId)
    },

    // Refresh repository data
    refresh: async () => {
      if (!deps.ipc) {
        logger.warn('Refresh not available (no IPC)')
        return
      }

      try {
        // Trigger refresh via IPC
        await deps.ipc.getBranches()
        await deps.ipc.getCommitHistory()
        await deps.ipc.getStagingStatus()
      } catch (error) {
        logger.error('Refresh failed:', error)
      }
    },
  }
}

// ============================================================================
// Events Factory
// ============================================================================

/**
 * Create events interface for a plugin.
 * Provides access to AgentEvents system for subscribing to agent-related events.
 *
 * Supported event types:
 * - agent:detected - New agent worktree found
 * - agent:removed - Agent worktree removed
 * - agent:active - Agent showing file changes
 * - agent:idle - Agent stopped (5 min threshold)
 * - agent:stale - Agent inactive (1 hour threshold)
 * - agent:commit - Agent made a commit
 * - agent:push - Agent pushed changes
 * - agent:pr-created - Agent created a PR
 * - agent:conflict - Agent has merge conflicts
 * - agent:behind - Agent branch behind main
 * - '*' - Subscribe to all agent events
 */
export function createPluginEvents(pluginId: string): PluginEvents {
  const logger = createPluginLogger(pluginId)

  return {
    on(type: string, callback: (event: unknown) => void): () => void {
      // For agent events, delegate to agentEvents system
      if (type.startsWith('agent:') || type === '*') {
        // Cast to AgentEventType - all agent:* events are supported
        return agentEvents.on(type as Parameters<typeof agentEvents.on>[0], callback)
      }

      // For other event types, log a warning (future expansion)
      logger.warn(`Event type "${type}" is not yet supported for plugins`)
      return () => {} // No-op unsubscribe
    },

    once(type: string, callback: (event: unknown) => void): () => void {
      let unsubscribe: (() => void) | null = null

      const wrappedCallback = (event: unknown) => {
        callback(event)
        if (unsubscribe) {
          unsubscribe()
        }
      }

      unsubscribe = this.on(type, wrappedCallback)
      return unsubscribe
    },
  }
}

// ============================================================================
// Context Factory
// ============================================================================

/**
 * Create a complete plugin context.
 *
 * @param pluginId - Unique plugin identifier
 * @param deps - Dependencies for API creation (optional for stub context)
 * @returns Complete plugin context
 */
export function createPluginContext(
  pluginId: string,
  deps?: PluginContextDependencies
): PluginContext {
  const storage = createPluginStorage(pluginId)
  const logger = createPluginLogger(pluginId)
  const events = createPluginEvents(pluginId)
  const disposeCallbacks: Array<() => void> = []

  // Create API - use stubs if no dependencies provided
  const api = deps
    ? createPluginAPI(pluginId, deps)
    : createStubAPI()

  return {
    storage,
    logger,
    subscriptions: {
      onDispose: (callback) => {
        disposeCallbacks.push(callback)
      },
    },
    api,
    events,
  }
}

/**
 * Create stub API for contexts where real implementation isn't available.
 * Used by plugin manager when no dependencies are injected.
 */
function createStubAPI(): PluginAPI {
  return {
    getRepoPath: () => null,
    getCurrentBranch: async () => '',
    getBranches: async () => [],
    getWorktrees: async () => [],
    getPullRequests: async () => [],
    getCommits: async () => [],
    getWorkingStatus: async () => null,
    git: async () => '',
    showNotification: () => {},
    openPanel: () => {},
    closePanel: () => {},
    navigateToApp: () => {},
    refresh: async () => {},
  }
}
