/**
 * Plugin Store
 *
 * Manages plugin UI state: active app, open panels, widget visibility.
 * Also handles permission request flow for plugin installation.
 */

import { createAppStore } from './create-store'
import type { AppPlugin, PanelPlugin, PluginRegistration, PluginPermission } from '@/lib/plugins/plugin-types'

export interface OpenPanel {
  pluginId: string
  instanceId: string
  data?: unknown
}

/** Pending permission request from a plugin */
export interface PermissionRequest {
  pluginId: string
  pluginName: string
  permissions: PluginPermission[]
  resolve: (result: { approved: boolean; permissions?: PluginPermission[] }) => void
}

export interface PluginState {
  // Navigation
  activeAppId: string | null  // null = base Ledger view

  // Open panels
  openPanels: OpenPanel[]

  // Plugin registry (synced from pluginManager)
  registrations: PluginRegistration[]

  // Settings panel
  settingsOpen: boolean
  settingsPluginId: string | null

  // Permission request (for installation flow)
  pendingPermissionRequest: PermissionRequest | null
}

export interface PluginActions {
  // Navigation
  setActiveApp: (pluginId: string | null) => void
  navigateToLedger: () => void

  // Panels
  openPanel: (pluginId: string, data?: unknown) => void
  closePanel: (instanceId: string) => void
  closeAllPanels: () => void

  // Registry
  setRegistrations: (registrations: PluginRegistration[]) => void

  // Settings
  openSettings: (pluginId?: string) => void
  closeSettings: () => void

  // Permission requests
  requestPermissions: (
    pluginId: string,
    pluginName: string,
    permissions: PluginPermission[]
  ) => Promise<{ approved: boolean; permissions?: PluginPermission[] }>
  respondToPermissionRequest: (approved: boolean, permissions?: PluginPermission[]) => void
}

const initialState: PluginState = {
  activeAppId: null,
  openPanels: [],
  registrations: [],
  settingsOpen: false,
  settingsPluginId: null,
  pendingPermissionRequest: null,
}

let panelInstanceCounter = 0

export const usePluginStore = createAppStore<PluginState & PluginActions>(
  'plugins',
  (set, get) => ({
    ...initialState,

    // Navigation
    setActiveApp: (pluginId) => set({ activeAppId: pluginId }),
    navigateToLedger: () => set({ activeAppId: null }),

    // Panels
    openPanel: (pluginId, data) => {
      const instanceId = `${pluginId}-${++panelInstanceCounter}`
      set((state) => ({
        openPanels: [...state.openPanels, { pluginId, instanceId, data }],
      }))
    },
    closePanel: (instanceId) => {
      set((state) => ({
        openPanels: state.openPanels.filter((p) => p.instanceId !== instanceId),
      }))
    },
    closeAllPanels: () => set({ openPanels: [] }),

    // Registry
    // CRITICAL: Check both reference AND shallow equality to prevent unnecessary updates
    // During plugin initialization, getAllRegistrations() may return new array references
    // even when the content is identical, which would trigger cascading re-renders
    setRegistrations: (registrations) => {
      const current = get().registrations
      // Fast path: same reference
      if (registrations === current) return
      // Shallow comparison: same length and same plugin IDs with same enabled states
      if (
        registrations.length === current.length &&
        registrations.every((reg, i) =>
          reg.plugin.id === current[i]?.plugin.id &&
          reg.enabled === current[i]?.enabled
        )
      ) {
        return
      }
      set({ registrations })
    },

    // Settings
    openSettings: (pluginId) =>
      set({ settingsOpen: true, settingsPluginId: pluginId ?? null }),
    closeSettings: () =>
      set({ settingsOpen: false, settingsPluginId: null }),

    // Permission requests
    requestPermissions: (pluginId, pluginName, permissions) => {
      return new Promise((resolve) => {
        set({
          pendingPermissionRequest: {
            pluginId,
            pluginName,
            permissions,
            resolve,
          },
        })
      })
    },
    respondToPermissionRequest: (approved, permissions) => {
      const request = get().pendingPermissionRequest
      if (request) {
        request.resolve({ approved, permissions })
        set({ pendingPermissionRequest: null })
      }
    },
  }),
  {
    persist: true,
    partialize: (state) => ({
      // Only persist the active app preference
      activeAppId: state.activeAppId,
    }),
  }
)

// Selectors
export const selectActiveApp = (state: PluginState): AppPlugin | null => {
  if (!state.activeAppId) return null
  const reg = state.registrations.find(
    (r) => r.plugin.id === state.activeAppId && r.plugin.type === 'app'
  )
  return reg?.plugin as AppPlugin | null
}

// Memoized selector for app plugins - returns same reference if input unchanged
let cachedAppPlugins: AppPlugin[] = []
let cachedAppPluginsInput: PluginRegistration[] = []

export const selectAppPlugins = (state: PluginState): AppPlugin[] => {
  // Return cached result if registrations haven't changed
  if (state.registrations === cachedAppPluginsInput) {
    return cachedAppPlugins
  }

  cachedAppPluginsInput = state.registrations
  cachedAppPlugins = state.registrations
    .filter((r) => r.enabled && r.plugin.type === 'app')
    .map((r) => r.plugin as AppPlugin)
    .sort((a, b) => (a.iconOrder ?? 100) - (b.iconOrder ?? 100))

  return cachedAppPlugins
}

// Memoized selector for open panels - returns same reference if inputs unchanged
let cachedOpenPanels: Array<OpenPanel & { plugin: PanelPlugin }> = []
let cachedOpenPanelsInput: OpenPanel[] = []
let cachedOpenPanelsRegs: PluginRegistration[] = []

export const selectOpenPanels = (state: PluginState): Array<OpenPanel & { plugin: PanelPlugin }> => {
  // Return cached result if inputs haven't changed
  if (state.openPanels === cachedOpenPanelsInput && state.registrations === cachedOpenPanelsRegs) {
    return cachedOpenPanels
  }

  cachedOpenPanelsInput = state.openPanels
  cachedOpenPanelsRegs = state.registrations
  cachedOpenPanels = state.openPanels
    .map((panel) => {
      const reg = state.registrations.find((r) => r.plugin.id === panel.pluginId)
      if (!reg || reg.plugin.type !== 'panel') return null
      return { ...panel, plugin: reg.plugin as PanelPlugin }
    })
    .filter((p): p is OpenPanel & { plugin: PanelPlugin } => p !== null)

  return cachedOpenPanels
}
