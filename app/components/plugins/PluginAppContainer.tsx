/**
 * Plugin App Container
 *
 * Renders an app plugin's component with proper context and error handling.
 */

import React, { useState, useMemo, Suspense } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { pluginComponentRegistry } from './PluginComponentRegistry'
import { pluginManager, createPluginContext, type PluginContextDependencies } from '@/lib/plugins'
import { useRepositoryStore } from '@/app/stores/repository-store'
import { usePluginStore } from '@/app/stores/plugin-store'
import type { AppPlugin, PluginContext, PluginAppProps } from '@/lib/plugins/plugin-types'

interface PluginAppContainerProps {
  plugin: AppPlugin
  activeNavItem?: string
  onNavigate?: (itemId: string) => void
}

export function PluginAppContainer({
  plugin,
  activeNavItem,
  onNavigate,
}: PluginAppContainerProps) {
  const [error, setError] = useState<Error | null>(null)
  const repoPath = useRepositoryStore((s) => s.repoPath)

  // Create plugin context with full API access
  const context = useMemo((): PluginContext => {
    return createFullPluginContext(plugin.id)
  }, [plugin.id])

  // Get the component - memoize to prevent re-renders from new references
  const Component = useMemo(
    () => pluginComponentRegistry.getApp(plugin.component),
    [plugin.component]
  )

  // Error boundary reset
  const handleRetry = () => {
    setError(null)
  }

  if (error) {
    return (
      <div className="plugin-app-container">
        <div className="plugin-app-header">
          <h3 className="plugin-app-title">{plugin.name}</h3>
        </div>
        <div className="plugin-error">
          <AlertCircle size={32} />
          <h4>Plugin Error</h4>
          <p>{error.message}</p>
          <button onClick={handleRetry}>
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!Component) {
    return (
      <div className="plugin-app-container">
        <div className="plugin-app-header">
          <h3 className="plugin-app-title">{plugin.name}</h3>
        </div>
        <div className="plugin-empty-state">
          <div className="plugin-empty-state-icon">
            <AlertCircle size={32} />
          </div>
          <h3 className="plugin-empty-state-title">Component Not Found</h3>
          <p className="plugin-empty-state-description">
            The component "{plugin.component}" is not registered.
            This plugin may need to be rebuilt or reinstalled.
          </p>
        </div>
      </div>
    )
  }

  const props: PluginAppProps = {
    context,
    repoPath,
    activeNavItem,
    onNavigate,
  }

  return (
    <div className="plugin-app-container">
      <div className="plugin-app-header">
        <h3 className="plugin-app-title">{plugin.name}</h3>

        {plugin.navigation && plugin.navigation.length > 0 && (
          <nav className="plugin-app-nav">
            {plugin.navigation.map((item) => (
              <button
                key={item.id}
                className={`plugin-app-nav-item ${activeNavItem === item.id ? 'active' : ''}`}
                onClick={() => onNavigate?.(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="plugin-app-content">
        <ErrorBoundary onError={setError}>
          <Suspense fallback={<PluginLoadingState />}>
            <Component {...props} />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  )
}

// ============================================================================
// Plugin Panel Container
// ============================================================================

interface PluginPanelContainerProps {
  pluginId: string
  instanceId: string
  data?: unknown
  onClose: () => void
}

export function PluginPanelContainer({
  pluginId,
  instanceId,
  data,
  onClose,
}: PluginPanelContainerProps) {
  const [error, setError] = useState<Error | null>(null)
  const repoPath = useRepositoryStore((s) => s.repoPath)

  const plugin = pluginManager.get(pluginId)
  if (!plugin || plugin.type !== 'panel') {
    return null
  }

  const panelPlugin = plugin as import('@/lib/plugins/plugin-types').PanelPlugin
  const Component = pluginComponentRegistry.getPanel(panelPlugin.component)
  const context = useMemo(() => createFullPluginContext(pluginId), [pluginId])

  const sizeClass = `size-${panelPlugin.size ?? 'medium'}`
  const positionClass = `position-${panelPlugin.position ?? 'center'}`

  if (!Component) {
    return null
  }

  return (
    <div className="plugin-panel-overlay" onClick={onClose}>
      <div
        className={`plugin-panel ${sizeClass} ${positionClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="plugin-panel-header">
          <h4 className="plugin-panel-title">{panelPlugin.title}</h4>
          {panelPlugin.closable !== false && (
            <button className="plugin-panel-close" onClick={onClose}>
              ×
            </button>
          )}
        </div>
        <div className="plugin-panel-content">
          <ErrorBoundary onError={setError}>
            <Suspense fallback={<PluginLoadingState />}>
              <Component
                context={context}
                repoPath={repoPath}
                data={data}
                onClose={onClose}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Widget Slot
// ============================================================================

interface PluginWidgetSlotProps {
  slot: import('@/lib/plugins/plugin-types').WidgetSlot
  data?: unknown
}

export const PluginWidgetSlot = React.memo(function PluginWidgetSlot({ slot, data }: PluginWidgetSlotProps) {
  const repoPath = useRepositoryStore((s) => s.repoPath)

  // Memoize widget lookup to prevent new array references on every render
  const widgets = useMemo(() => pluginManager.getWidgetsForSlot(slot), [slot])

  // Memoize widget components and contexts to prevent re-renders
  const widgetConfigs = useMemo(() => {
    return widgets.map((widget) => ({
      widget,
      Component: pluginComponentRegistry.getWidget(widget.component),
      context: createFullPluginContext(widget.id),
    }))
  }, [widgets])

  if (widgetConfigs.length === 0) {
    return null
  }

  return (
    <div className="plugin-widget-slot" data-slot={slot}>
      {widgetConfigs.map(({ widget, Component, context }) => {
        if (!Component) return null

        return (
          <div key={widget.id} className="plugin-widget">
            <ErrorBoundary>
              <Component
                context={context}
                repoPath={repoPath}
                slot={slot}
                data={data}
              />
            </ErrorBoundary>
          </div>
        )
      })}
    </div>
  )
})

// ============================================================================
// Helpers
// ============================================================================

/**
 * Cached plugin context dependencies.
 * Since all accessors use getState() which reads current state,
 * we can cache this object at module level and reuse it.
 */
let cachedDependencies: PluginContextDependencies | null = null

function getContextDependencies(): PluginContextDependencies {
  if (cachedDependencies) return cachedDependencies

  cachedDependencies = {
    // Repository store accessors
    getRepoPath: () => useRepositoryStore.getState().repoPath,
    getCurrentBranch: () => useRepositoryStore.getState().currentBranch,
    getBranches: () => useRepositoryStore.getState().branches,
    getWorktrees: () => useRepositoryStore.getState().worktrees,
    getPullRequests: () => useRepositoryStore.getState().pullRequests,
    getCommits: () => useRepositoryStore.getState().commits,
    getWorkingStatus: () => useRepositoryStore.getState().workingStatus,
    setStatus: (status) => useRepositoryStore.getState().setStatus(status),

    // Plugin store accessors
    openPanel: (pluginId, data) => usePluginStore.getState().openPanel(pluginId, data),
    closePanel: (instanceId) => usePluginStore.getState().closePanel(instanceId),
    getOpenPanels: () => usePluginStore.getState().openPanels,
    setActiveApp: (appId) => usePluginStore.getState().setActiveApp(appId),

    // IPC functions for refresh
    ipc: {
      getBranches: async () => {
        const result = await window.conveyor.branch.getBranches()
        // Result is { current, branches } - extract the branches array
        const branches = result.branches || []
        useRepositoryStore.getState().setBranches(branches)
        return branches
      },
      getWorktrees: async () => {
        const worktrees = await window.conveyor.worktree.getWorktrees()
        useRepositoryStore.getState().setWorktrees(worktrees)
        return worktrees
      },
      getPullRequests: async () => {
        const result = await window.conveyor.pr.getPullRequests()
        if (!result.error) {
          useRepositoryStore.getState().setPullRequests(result.prs)
          return result.prs
        }
        return []
      },
      getCommitHistory: async () => {
        const commits = await window.conveyor.commit.getCommitHistory()
        useRepositoryStore.getState().setCommits(commits)
        return commits
      },
      getStagingStatus: async () => {
        const status = await window.conveyor.staging.getStagingStatus()
        useRepositoryStore.getState().setWorkingStatus(status)
        return status
      },
    },
  }

  return cachedDependencies
}

/**
 * Cache of plugin contexts by ID.
 * Since deps are cached, we can also cache the resulting contexts.
 */
const pluginContextCache = new Map<string, PluginContext>()

/**
 * Create a plugin context with full API access.
 * Uses the consolidated context factory with real dependencies.
 * Results are cached by plugin ID for stable references.
 */
function createFullPluginContext(pluginId: string): PluginContext {
  let context = pluginContextCache.get(pluginId)
  if (context) return context

  const deps = getContextDependencies()
  context = createPluginContext(pluginId, deps)
  pluginContextCache.set(pluginId, context)
  return context
}

function PluginLoadingState() {
  return (
    <div className="plugin-loading">
      <div className="plugin-loading-spinner" />
      <span>Loading plugin...</span>
    </div>
  )
}

// Simple error boundary
interface ErrorBoundaryProps {
  children: React.ReactNode
  onError?: (error: Error) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="plugin-error-inline">
          <AlertCircle size={16} />
          <span>Plugin error: {this.state.error?.message}</span>
        </div>
      )
    }

    return this.props.children
  }
}

export default PluginAppContainer
