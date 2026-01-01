/**
 * Plugin Settings Panel
 *
 * Modal panel for managing installed plugins.
 * Allows enabling/disabling plugins and configuring their settings.
 */

import { useState, useMemo, useEffect } from 'react'
import {
  X,
  Puzzle,
  Bot,
  Layers,
  Terminal,
  Settings,
  ExternalLink,
  ChevronLeft,
  AlertCircle,
  Sliders,
  FolderGit2,
  type LucideIcon,
} from 'lucide-react'
import { usePluginStore } from '@/app/stores/plugin-store'
import { pluginManager } from '@/lib/plugins'
import type { Plugin, PluginType, PluginRegistration } from '@/lib/plugins/plugin-types'
import { PluginConfigEditor } from './PluginConfigEditor'
import { RepositoryManagerPanel } from '@/app/components/RepositoryManagerPanel'

type TabId = 'all' | 'app' | 'panel' | 'widget' | 'service' | 'repositories'

const tabs: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'all', label: 'All Plugins', icon: Puzzle },
  { id: 'app', label: 'Apps', icon: Layers },
  { id: 'panel', label: 'Panels', icon: Terminal },
  { id: 'widget', label: 'Widgets', icon: Bot },
  { id: 'service', label: 'Services', icon: Settings },
  { id: 'repositories', label: 'Repositories', icon: FolderGit2 },
]

const typeColors: Record<PluginType, string> = {
  app: 'var(--color-blue)',
  panel: 'var(--color-purple)',
  widget: 'var(--color-green)',
  service: 'var(--color-orange)',
}

export function PluginSettingsPanel() {
  const settingsOpen = usePluginStore((s) => s.settingsOpen)
  const closeSettings = usePluginStore((s) => s.closeSettings)
  const registrations = usePluginStore((s) => s.registrations)

  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [configuringPlugin, setConfiguringPlugin] = useState<Plugin | null>(null)

  // Sync registrations from plugin manager
  // Note: Using getState() directly instead of the selector to avoid dependency issues
  // Zustand selectors for functions can return new references on each render
  // CRITICAL: Debounce ALL syncRegistrations calls (including initial) to batch plugin events
  // Without this, each plugin activation triggers a separate store update causing re-render loops
  useEffect(() => {
    let syncTimeout: ReturnType<typeof setTimeout> | null = null
    let isMounted = true

    const syncRegistrations = () => {
      // Debounce to batch multiple events into single update
      if (syncTimeout) clearTimeout(syncTimeout)
      syncTimeout = setTimeout(() => {
        if (!isMounted) return
        usePluginStore.getState().setRegistrations(pluginManager.getAllRegistrations())
        syncTimeout = null
      }, 0)
    }

    // IMPORTANT: Subscribe to events FIRST to prevent race conditions
    // If we sync first and events fire during sync, they would be missed
    const unsubActivated = pluginManager.on('activated', syncRegistrations)
    const unsubDeactivated = pluginManager.on('deactivated', syncRegistrations)
    const unsubRegistered = pluginManager.on('registered', syncRegistrations)
    const unsubUnregistered = pluginManager.on('unregistered', syncRegistrations)

    // NOW do initial sync - events are now being collected and debounced
    // This allows all plugin registrations/activations to complete before syncing
    syncRegistrations()

    return () => {
      isMounted = false
      if (syncTimeout) clearTimeout(syncTimeout)
      unsubActivated()
      unsubDeactivated()
      unsubRegistered()
      unsubUnregistered()
    }
  }, [])

  const filteredPlugins = useMemo(() => {
    if (activeTab === 'all') return registrations
    return registrations.filter((r) => r.plugin.type === activeTab)
  }, [registrations, activeTab])

  const handleToggle = async (pluginId: string, currentlyEnabled: boolean) => {
    setTogglingId(pluginId)
    try {
      if (currentlyEnabled) {
        await pluginManager.deactivate(pluginId)
      } else {
        await pluginManager.activate(pluginId)
      }
    } catch (error) {
      console.error('Failed to toggle plugin:', error)
    } finally {
      setTogglingId(null)
    }
  }

  const handleConfigure = (plugin: Plugin) => {
    setConfiguringPlugin(plugin)
  }

  const handleBackToList = () => {
    setConfiguringPlugin(null)
  }

  if (!settingsOpen) return null

  return (
    <div className="plugin-settings-overlay" onClick={closeSettings}>
      <div className="plugin-settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="plugin-settings-header">
          {configuringPlugin ? (
            <>
              <button
                className="plugin-settings-back"
                onClick={handleBackToList}
                title="Back to plugin list"
              >
                <ChevronLeft size={16} />
              </button>
              <h2>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                  Settings /{' '}
                </span>
                {configuringPlugin.name}
              </h2>
            </>
          ) : (
            <h2>Plugin Manager</h2>
          )}
          <button className="plugin-settings-close" onClick={closeSettings}>
            <X size={16} />
          </button>
        </div>

        <div className="plugin-settings-content">
          {configuringPlugin ? (
            // Plugin Configuration View
            <PluginConfigEditor plugin={configuringPlugin} onClose={handleBackToList} />
          ) : (
            // Plugin List View
            <>
              {/* Tabs */}
              <div className="plugin-settings-tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={`plugin-settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <tab.icon size={14} style={{ marginRight: 6 }} />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Content based on active tab */}
              {activeTab === 'repositories' ? (
                // Repository Manager View
                <RepositoryManagerPanel />
              ) : filteredPlugins.length === 0 ? (
                <div className="plugin-empty-state">
                  <div className="plugin-empty-state-icon">
                    <Puzzle size={32} />
                  </div>
                  <h3 className="plugin-empty-state-title">No plugins found</h3>
                  <p className="plugin-empty-state-description">
                    {activeTab === 'all'
                      ? 'No plugins are installed yet. Check the documentation to learn how to create plugins.'
                      : `No ${activeTab} plugins are installed.`}
                  </p>
                </div>
              ) : (
                <div className="plugin-list">
                  {filteredPlugins.map((registration) => (
                    <PluginCard
                      key={registration.plugin.id}
                      registration={registration}
                      isToggling={togglingId === registration.plugin.id}
                      onToggle={() => handleToggle(registration.plugin.id, registration.enabled)}
                      onConfigure={() => handleConfigure(registration.plugin)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface PluginCardProps {
  registration: PluginRegistration
  isToggling: boolean
  onToggle: () => void
  onConfigure: () => void
}

function PluginCard({ registration, isToggling, onToggle, onConfigure }: PluginCardProps) {
  const { plugin, enabled, error } = registration
  const hasSettings = plugin.settings && plugin.settings.length > 0

  return (
    <div className={`plugin-card ${error ? 'has-error' : ''}`}>
      <div
        className="plugin-card-icon"
        style={{ color: enabled ? typeColors[plugin.type] : undefined }}
      >
        <Puzzle size={20} />
      </div>

      <div className="plugin-card-content">
        <div className="plugin-card-header">
          <h4 className="plugin-card-name">{plugin.name}</h4>
          <span className="plugin-card-version">v{plugin.version}</span>
        </div>

        {plugin.description && (
          <p className="plugin-card-description">{plugin.description}</p>
        )}

        <div className="plugin-card-meta">
          <span
            className="plugin-card-type"
            style={{ borderLeft: `3px solid ${typeColors[plugin.type]}` }}
          >
            {plugin.type}
          </span>
          {plugin.author && <span>by {plugin.author}</span>}
          {hasSettings && (
            <span style={{ color: 'var(--text-tertiary)' }}>
              {plugin.settings!.length} setting{plugin.settings!.length !== 1 ? 's' : ''}
            </span>
          )}
          {plugin.homepage && (
            <a
              href={plugin.homepage}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 8,
              color: 'var(--color-red)',
              fontSize: 12,
            }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        )}
      </div>

      <div className="plugin-card-actions">
        {hasSettings && (
          <button
            className="plugin-card-config-button"
            onClick={onConfigure}
            title="Configure plugin settings"
          >
            <Sliders size={14} />
          </button>
        )}
        <button
          className={`plugin-toggle ${enabled ? 'active' : ''}`}
          onClick={onToggle}
          disabled={isToggling || !!error}
          title={enabled ? 'Disable plugin' : 'Enable plugin'}
        />
      </div>
    </div>
  )
}

export default PluginSettingsPanel
