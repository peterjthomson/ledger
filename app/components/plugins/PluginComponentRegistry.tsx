/**
 * Plugin Component Registry
 *
 * Manages the registration and rendering of plugin React components.
 * Plugins reference components by string ID, and this registry resolves
 * them to actual React components.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode, type ComponentType } from 'react'
import type {
  PluginAppProps,
  PluginPanelProps,
  PluginWidgetProps,
  PluginContext,
} from '@/lib/plugins/plugin-types'

// ============================================================================
// Types
// ============================================================================

type PluginComponentType = 'app' | 'panel' | 'widget'

type AppComponent = ComponentType<PluginAppProps>
type PanelComponent = ComponentType<PluginPanelProps>
type WidgetComponent = ComponentType<PluginWidgetProps>

interface ComponentRegistration {
  type: PluginComponentType
  component: AppComponent | PanelComponent | WidgetComponent
}

interface PluginComponentContextValue {
  register: (id: string, type: PluginComponentType, component: ComponentRegistration['component']) => void
  unregister: (id: string) => void
  getComponent: (id: string) => ComponentRegistration | null
  getAppComponent: (id: string) => AppComponent | null
  getPanelComponent: (id: string) => PanelComponent | null
  getWidgetComponent: (id: string) => WidgetComponent | null
}

// ============================================================================
// Context
// ============================================================================

const PluginComponentContext = createContext<PluginComponentContextValue | null>(null)

export function usePluginComponents(): PluginComponentContextValue {
  const context = useContext(PluginComponentContext)
  if (!context) {
    throw new Error('usePluginComponents must be used within PluginComponentProvider')
  }
  return context
}

// ============================================================================
// Provider
// ============================================================================

interface PluginComponentProviderProps {
  children: ReactNode
}

export function PluginComponentProvider({ children }: PluginComponentProviderProps) {
  const [registry] = useState(() => new Map<string, ComponentRegistration>())

  // Note: registry is created once via useState initializer, so its reference never changes.
  // Empty dependency arrays ensure these callbacks are stable across renders.
  const register = useCallback(
    (id: string, type: PluginComponentType, component: ComponentRegistration['component']) => {
      registry.set(id, { type, component })
    },
     
    []
  )

  const unregister = useCallback(
    (id: string) => {
      registry.delete(id)
    },
     
    []
  )

  const getComponent = useCallback(
    (id: string): ComponentRegistration | null => {
      return registry.get(id) ?? null
    },
     
    []
  )

  const getAppComponent = useCallback(
    (id: string): AppComponent | null => {
      const reg = registry.get(id)
      if (reg?.type === 'app') {
        return reg.component as AppComponent
      }
      return null
    },
     
    []
  )

  const getPanelComponent = useCallback(
    (id: string): PanelComponent | null => {
      const reg = registry.get(id)
      if (reg?.type === 'panel') {
        return reg.component as PanelComponent
      }
      return null
    },
     
    []
  )

  const getWidgetComponent = useCallback(
    (id: string): WidgetComponent | null => {
      const reg = registry.get(id)
      if (reg?.type === 'widget') {
        return reg.component as WidgetComponent
      }
      return null
    },
     
    []
  )

  // Memoize context value to prevent unnecessary re-renders of consumers
  // All callbacks are stable (empty deps), so this only computes once
  const value = useMemo<PluginComponentContextValue>(
    () => ({
      register,
      unregister,
      getComponent,
      getAppComponent,
      getPanelComponent,
      getWidgetComponent,
    }),
     
    []
  )

  return (
    <PluginComponentContext.Provider value={value}>
      {children}
    </PluginComponentContext.Provider>
  )
}

// ============================================================================
// Component Registration Hook
// ============================================================================

/**
 * Register a plugin component. Use this in your plugin's React entry point.
 *
 * @example
 * ```tsx
 * // In your plugin's component file
 * import { useRegisterPluginComponent } from '@/app/components/plugins'
 *
 * function MyPluginApp(props: PluginAppProps) {
 *   return <div>My Plugin</div>
 * }
 *
 * // Register on mount
 * useRegisterPluginComponent('my-plugin.app', 'app', MyPluginApp)
 * ```
 */
export function useRegisterPluginComponent(
  id: string,
  type: PluginComponentType,
  component: ComponentRegistration['component']
): void {
  const { register, unregister } = usePluginComponents()

  React.useEffect(() => {
    register(id, type, component)
    return () => unregister(id)
  }, [id, type, component, register, unregister])
}

// ============================================================================
// Static Registry (for non-React contexts)
// ============================================================================

const staticRegistry = new Map<string, ComponentRegistration>()

export const pluginComponentRegistry = {
  register(id: string, type: PluginComponentType, component: ComponentRegistration['component']): void {
    staticRegistry.set(id, { type, component })
  },

  unregister(id: string): void {
    staticRegistry.delete(id)
  },

  get(id: string): ComponentRegistration | null {
    return staticRegistry.get(id) ?? null
  },

  getApp(id: string): AppComponent | null {
    const reg = staticRegistry.get(id)
    return reg?.type === 'app' ? (reg.component as AppComponent) : null
  },

  getPanel(id: string): PanelComponent | null {
    const reg = staticRegistry.get(id)
    return reg?.type === 'panel' ? (reg.component as PanelComponent) : null
  },

  getWidget(id: string): WidgetComponent | null {
    const reg = staticRegistry.get(id)
    return reg?.type === 'widget' ? (reg.component as WidgetComponent) : null
  },

  getAll(): Map<string, ComponentRegistration> {
    return new Map(staticRegistry)
  },
}
