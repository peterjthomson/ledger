/**
 * Plugin Settings Store
 *
 * Persists plugin configuration values to localStorage.
 * Each plugin has its own isolated settings namespace.
 */

import type { PluginSetting, Plugin } from './plugin-types'

const STORAGE_PREFIX = 'ledger:plugin-settings:'

/**
 * Plugin Settings Store
 *
 * Handles persistence of plugin configuration values.
 */
class PluginSettingsStore {
  private cache: Map<string, Record<string, unknown>> = new Map()

  /**
   * Get all settings for a plugin
   */
  getAll(pluginId: string): Record<string, unknown> {
    // Check cache first
    if (this.cache.has(pluginId)) {
      return this.cache.get(pluginId)!
    }

    // Load from storage
    const key = STORAGE_PREFIX + pluginId
    try {
      const stored = localStorage.getItem(key)
      const values = stored ? JSON.parse(stored) : {}
      this.cache.set(pluginId, values)
      return values
    } catch (error) {
      console.error(`[PluginSettings] Failed to load settings for ${pluginId}:`, error)
      return {}
    }
  }

  /**
   * Get a single setting value
   */
  get<T>(pluginId: string, key: string, defaultValue?: T): T | undefined {
    const all = this.getAll(pluginId)
    return (all[key] as T) ?? defaultValue
  }

  /**
   * Set a single setting value
   */
  set<T>(pluginId: string, key: string, value: T): void {
    const all = this.getAll(pluginId)
    all[key] = value
    this.save(pluginId, all)
  }

  /**
   * Set multiple setting values
   */
  setMultiple(pluginId: string, values: Record<string, unknown>): void {
    const all = this.getAll(pluginId)
    Object.assign(all, values)
    this.save(pluginId, all)
  }

  /**
   * Reset a setting to its default value
   */
  reset(pluginId: string, key: string, defaultValue: unknown): void {
    const all = this.getAll(pluginId)
    all[key] = defaultValue
    this.save(pluginId, all)
  }

  /**
   * Reset all settings for a plugin to defaults
   */
  resetAll(pluginId: string, settings: PluginSetting[]): void {
    const defaults: Record<string, unknown> = {}
    for (const setting of settings) {
      defaults[setting.key] = setting.default
    }
    this.save(pluginId, defaults)
  }

  /**
   * Clear all settings for a plugin
   */
  clear(pluginId: string): void {
    this.cache.delete(pluginId)
    try {
      localStorage.removeItem(STORAGE_PREFIX + pluginId)
    } catch (error) {
      console.error(`[PluginSettings] Failed to clear settings for ${pluginId}:`, error)
    }
  }

  /**
   * Initialize settings with defaults for missing values
   */
  initializeDefaults(plugin: Plugin): void {
    if (!plugin.settings?.length) return

    const all = this.getAll(plugin.id)
    let needsSave = false

    for (const setting of plugin.settings) {
      if (!(setting.key in all)) {
        all[setting.key] = setting.default
        needsSave = true
      }
    }

    if (needsSave) {
      this.save(plugin.id, all)
    }
  }

  /**
   * Validate a setting value against its schema
   */
  validate(setting: PluginSetting, value: unknown): { valid: boolean; error?: string } {
    // Type validation
    switch (setting.type) {
      case 'string':
        if (typeof value !== 'string') {
          return { valid: false, error: 'Expected string' }
        }
        if (setting.validation?.pattern) {
          const regex = new RegExp(setting.validation.pattern)
          if (!regex.test(value)) {
            return { valid: false, error: setting.validation.message || 'Invalid format' }
          }
        }
        break

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return { valid: false, error: 'Expected number' }
        }
        if (setting.validation?.min !== undefined && value < setting.validation.min) {
          return { valid: false, error: `Minimum value is ${setting.validation.min}` }
        }
        if (setting.validation?.max !== undefined && value > setting.validation.max) {
          return { valid: false, error: `Maximum value is ${setting.validation.max}` }
        }
        break

      case 'boolean':
        if (typeof value !== 'boolean') {
          return { valid: false, error: 'Expected boolean' }
        }
        break

      case 'select':
      case 'multiselect':
        if (!setting.options?.some((opt) => opt.value === value)) {
          return { valid: false, error: 'Invalid selection' }
        }
        break
    }

    return { valid: true }
  }

  /**
   * Save settings to storage
   */
  private save(pluginId: string, values: Record<string, unknown>): void {
    this.cache.set(pluginId, values)
    try {
      localStorage.setItem(STORAGE_PREFIX + pluginId, JSON.stringify(values))
    } catch (error) {
      console.error(`[PluginSettings] Failed to save settings for ${pluginId}:`, error)
    }
  }
}

// Singleton export
export const pluginSettingsStore = new PluginSettingsStore()
