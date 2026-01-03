/**
 * Plugin Manager
 *
 * Manages plugin lifecycle: registration, activation, deactivation.
 * Handles different plugin types and their specific behaviors.
 */

import type {
  Plugin,
  PluginType,
  AppPlugin,
  PanelPlugin,
  WidgetPlugin,
  ServicePlugin,
  PluginRegistration,
  PluginContext,
  PluginHooks,
  PluginEvent,
  PluginEventType,
  BackgroundTask,
  WidgetSlot,
} from './plugin-types'
import { createPluginContext, PluginContextWithDispose } from './plugin-context'
import { grantPermissions, revokePermissions } from './plugin-permissions'

type HookCallback = PluginHooks[keyof PluginHooks]
type EventCallback = (event: PluginEvent) => void

interface TaskHandle {
  id: string
  intervalId?: ReturnType<typeof setInterval>
}

/**
 * Plugin Manager singleton
 */
class PluginManager {
  private plugins: Map<string, PluginRegistration> = new Map()
  private eventListeners: Map<PluginEventType, Set<EventCallback>> = new Map()
  private runningTasks: Map<string, TaskHandle[]> = new Map()
  private pluginContexts: Map<string, PluginContextWithDispose> = new Map()

  // Cache for getAllRegistrations to prevent returning new array references
  private registrationsCache: PluginRegistration[] | null = null

  // ============================================================================
  // Registration
  // ============================================================================

  /**
   * Register a plugin
   */
  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[PluginManager] Plugin "${plugin.id}" is already registered`)
      return
    }

    // Validate plugin
    const error = this.validatePlugin(plugin)
    if (error) {
      console.error(`[PluginManager] Invalid plugin "${plugin.id}": ${error}`)
      this.plugins.set(plugin.id, { plugin, enabled: false, error })
      return
    }

    this.plugins.set(plugin.id, {
      plugin,
      enabled: false,
    })

    this.registrationsCache = null  // Invalidate cache
    this.emit('registered', plugin.id)
    console.log(`[PluginManager] Registered ${plugin.type} plugin: ${plugin.name} (${plugin.id})`)
  }

  /**
   * Unregister a plugin
   */
  async unregister(id: string): Promise<void> {
    const registration = this.plugins.get(id)
    if (!registration) {
      console.warn(`[PluginManager] Plugin "${id}" is not registered`)
      return
    }

    if (registration.enabled) {
      await this.deactivate(id)
    }

    this.plugins.delete(id)
    this.registrationsCache = null  // Invalidate cache
    this.emit('unregistered', id)
    console.log(`[PluginManager] Unregistered plugin: ${id}`)
  }

  /**
   * Validate plugin structure
   */
  private validatePlugin(plugin: Plugin): string | null {
    if (!plugin.id || typeof plugin.id !== 'string') {
      return 'Missing or invalid plugin id'
    }
    if (!plugin.name || typeof plugin.name !== 'string') {
      return 'Missing or invalid plugin name'
    }
    if (!plugin.version || typeof plugin.version !== 'string') {
      return 'Missing or invalid plugin version'
    }
    if (!['app', 'panel', 'widget', 'service'].includes(plugin.type)) {
      return `Invalid plugin type: ${plugin.type}`
    }

    // Type-specific validation
    if (plugin.type === 'app' && !(plugin as AppPlugin).icon) {
      return 'App plugins require an icon'
    }
    if (plugin.type === 'widget' && !(plugin as WidgetPlugin).slots?.length) {
      return 'Widget plugins require at least one slot'
    }

    return null
  }

  // ============================================================================
  // Activation
  // ============================================================================

  /**
   * Activate a plugin
   */
  async activate(id: string): Promise<void> {
    const registration = this.plugins.get(id)
    if (!registration) {
      throw new Error(`Plugin "${id}" is not registered`)
    }

    if (registration.enabled) {
      console.warn(`[PluginManager] Plugin "${id}" is already active`)
      return
    }

    if (registration.error) {
      throw new Error(`Plugin "${id}" has validation errors: ${registration.error}`)
    }

    // Grant permissions declared by the plugin
    if (registration.plugin.permissions?.length) {
      grantPermissions(id, registration.plugin.permissions)
    }

    // Create context without dependencies (stub API)
    // Full API is provided by UI layer when rendering components
    const context = createPluginContext(id)

    // Store context for later cleanup
    this.pluginContexts.set(id, context)

    try {
      // Call activate hook
      if (registration.plugin.activate) {
        await registration.plugin.activate(context)
      }

      // Start background tasks for service plugins
      if (registration.plugin.type === 'service') {
        await this.startBackgroundTasks(id, registration.plugin as ServicePlugin, context)
      }

      registration.enabled = true
      registration.activatedAt = new Date()
      registration.error = undefined
      this.registrationsCache = null  // Invalidate cache
      this.emit('activated', id)
      console.log(`[PluginManager] Activated plugin: ${id}`)
    } catch (error) {
      // Clean up context on failure
      this.pluginContexts.delete(id)
      const message = error instanceof Error ? error.message : String(error)
      registration.error = message
      this.emit('error', id, { error: message })
      console.error(`[PluginManager] Failed to activate plugin "${id}":`, error)
      throw error
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivate(id: string): Promise<void> {
    const registration = this.plugins.get(id)
    if (!registration) {
      throw new Error(`Plugin "${id}" is not registered`)
    }

    if (!registration.enabled) {
      console.warn(`[PluginManager] Plugin "${id}" is not active`)
      return
    }

    try {
      // Stop background tasks
      this.stopBackgroundTasks(id)

      // Call deactivate hook
      if (registration.plugin.deactivate) {
        await registration.plugin.deactivate()
      }

      // Dispose plugin context (clears event subscriptions and calls onDispose callbacks)
      const context = this.pluginContexts.get(id)
      if (context) {
        context.dispose()
        this.pluginContexts.delete(id)
      }

      // Revoke permissions
      revokePermissions(id)

      registration.enabled = false
      registration.activatedAt = undefined
      this.registrationsCache = null  // Invalidate cache
      this.emit('deactivated', id)
      console.log(`[PluginManager] Deactivated plugin: ${id}`)
    } catch (error) {
      console.error(`[PluginManager] Failed to deactivate plugin "${id}":`, error)
      throw error
    }
  }

  // ============================================================================
  // Background Tasks (Service Plugins)
  // ============================================================================

  private async startBackgroundTasks(
    pluginId: string,
    plugin: ServicePlugin,
    context: PluginContext
  ): Promise<void> {
    if (!plugin.backgroundTasks?.length) return

    const handles: TaskHandle[] = []

    for (const task of plugin.backgroundTasks) {
      const handle: TaskHandle = { id: task.id }

      // Run task immediately
      try {
        await task.handler(context)
      } catch (error) {
        console.error(`[PluginManager] Background task "${task.id}" error:`, error)
      }

      // Set up interval if specified
      if (task.interval > 0) {
        handle.intervalId = setInterval(async () => {
          try {
            await task.handler(context)
          } catch (error) {
            console.error(`[PluginManager] Background task "${task.id}" error:`, error)
          }
        }, task.interval)
      }

      handles.push(handle)
    }

    this.runningTasks.set(pluginId, handles)
  }

  private stopBackgroundTasks(pluginId: string): void {
    const handles = this.runningTasks.get(pluginId)
    if (!handles) return

    for (const handle of handles) {
      if (handle.intervalId) {
        clearInterval(handle.intervalId)
      }
    }

    this.runningTasks.delete(pluginId)
  }

  // ============================================================================
  // Queries
  // ============================================================================

  get(id: string): Plugin | null {
    return this.plugins.get(id)?.plugin ?? null
  }

  getRegistration(id: string): PluginRegistration | null {
    return this.plugins.get(id) ?? null
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values()).map((r) => r.plugin)
  }

  getAllRegistrations(): PluginRegistration[] {
    // Return cached array to prevent new references on every call
    if (this.registrationsCache === null) {
      this.registrationsCache = Array.from(this.plugins.values())
    }
    return this.registrationsCache
  }

  getActive(): Plugin[] {
    return Array.from(this.plugins.values())
      .filter((r) => r.enabled)
      .map((r) => r.plugin)
  }

  isActive(id: string): boolean {
    return this.plugins.get(id)?.enabled ?? false
  }

  // ============================================================================
  // Type-specific Queries
  // ============================================================================

  getByType<T extends PluginType>(type: T): Plugin[] {
    return this.getAll().filter((p) => p.type === type)
  }

  getActiveByType<T extends PluginType>(type: T): Plugin[] {
    return this.getActive().filter((p) => p.type === type)
  }

  getAppPlugins(): AppPlugin[] {
    return this.getActiveByType('app') as AppPlugin[]
  }

  getPanelPlugins(): PanelPlugin[] {
    return this.getActiveByType('panel') as PanelPlugin[]
  }

  getWidgetPlugins(): WidgetPlugin[] {
    return this.getActiveByType('widget') as WidgetPlugin[]
  }

  getServicePlugins(): ServicePlugin[] {
    return this.getActiveByType('service') as ServicePlugin[]
  }

  /**
   * Get widgets for a specific slot
   */
  getWidgetsForSlot(slot: WidgetSlot): WidgetPlugin[] {
    return this.getWidgetPlugins().filter((w) => w.slots.includes(slot))
  }

  // ============================================================================
  // Hook Execution
  // ============================================================================

  async callHook<K extends keyof PluginHooks>(
    hook: K,
    ...args: Parameters<PluginHooks[K]>
  ): Promise<ReturnType<PluginHooks[K]> | null> {
    for (const registration of this.plugins.values()) {
      if (!registration.enabled) continue

      const handler = registration.plugin.hooks?.[hook] as HookCallback | undefined
      if (handler) {
        try {
          const result = await (handler as (...args: unknown[]) => Promise<unknown>)(...args)
          return result as ReturnType<PluginHooks[K]>
        } catch (error) {
          console.error(
            `[PluginManager] Hook "${hook}" failed in plugin "${registration.plugin.id}":`,
            error
          )
        }
      }
    }
    return null
  }

  async callHookAll<K extends keyof PluginHooks>(
    hook: K,
    ...args: Parameters<PluginHooks[K]>
  ): Promise<Array<ReturnType<PluginHooks[K]>>> {
    const results: Array<ReturnType<PluginHooks[K]>> = []

    for (const registration of this.plugins.values()) {
      if (!registration.enabled) continue

      const handler = registration.plugin.hooks?.[hook] as HookCallback | undefined
      if (handler) {
        try {
          const result = await (handler as (...args: unknown[]) => Promise<unknown>)(...args)
          if (result !== undefined && result !== null) {
            results.push(result as ReturnType<PluginHooks[K]>)
          }
        } catch (error) {
          console.error(
            `[PluginManager] Hook "${hook}" failed in plugin "${registration.plugin.id}":`,
            error
          )
        }
      }
    }

    return results
  }

  hasHook<K extends keyof PluginHooks>(hook: K): boolean {
    for (const registration of this.plugins.values()) {
      if (registration.enabled && registration.plugin.hooks?.[hook]) {
        return true
      }
    }
    return false
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(event: PluginEventType, callback: EventCallback): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)

    return () => {
      this.eventListeners.get(event)?.delete(callback)
    }
  }

  private emit(type: PluginEventType, pluginId: string, data?: unknown): void {
    const event: PluginEvent = {
      type,
      pluginId,
      timestamp: new Date(),
      data,
    }

    const listeners = this.eventListeners.get(type)
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event)
        } catch (error) {
          console.error(`[PluginManager] Event listener error:`, error)
        }
      }
    }
  }

}

// Singleton export
export const pluginManager = new PluginManager()
