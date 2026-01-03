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
  Plus,
  Trash2,
  Github,
  Link,
  Package,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { usePluginStore } from '@/app/stores/plugin-store'
import { pluginManager } from '@/lib/plugins'
import { pluginLoader, pluginRegistry, type PluginSource } from '@/lib/plugins/plugin-loader'
import type { Plugin, PluginType, PluginRegistration } from '@/lib/plugins/plugin-types'
import { PluginConfigEditor } from './PluginConfigEditor'

type TabId = 'all' | 'app' | 'panel' | 'widget' | 'service'

const tabs: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'all', label: 'All Plugins', icon: Puzzle },
  { id: 'app', label: 'Apps', icon: Layers },
  { id: 'panel', label: 'Panels', icon: Terminal },
  { id: 'widget', label: 'Widgets', icon: Bot },
  { id: 'service', label: 'Services', icon: Settings },
]

const typeColors: Record<PluginType, string> = {
  app: 'var(--color-blue)',
  panel: 'var(--color-purple)',
  widget: 'var(--color-green)',
  service: 'var(--color-orange)',
}

type InstallSourceType = 'github' | 'url' | 'npm'

export function PluginSettingsPanel() {
  const settingsOpen = usePluginStore((s) => s.settingsOpen)
  const closeSettings = usePluginStore((s) => s.closeSettings)
  const registrations = usePluginStore((s) => s.registrations)

  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [configuringPlugin, setConfiguringPlugin] = useState<Plugin | null>(null)

  // Install dialog state
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [installSource, setInstallSource] = useState<InstallSourceType>('github')
  const [installUrl, setInstallUrl] = useState('')
  const [isInstalling, setIsInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  // Uninstall state
  const [uninstallingId, setUninstallingId] = useState<string | null>(null)

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

  const handleInstall = async () => {
    if (!installUrl.trim()) return

    setIsInstalling(true)
    setInstallError(null)

    try {
      const source: PluginSource = {
        type: installSource === 'github' ? 'git' : installSource,
        location: installUrl.trim(),
      }

      const result = await pluginLoader.install(source, { autoEnable: true })

      if (result.success) {
        setShowInstallDialog(false)
        setInstallUrl('')
      } else {
        setInstallError(result.error ?? 'Failed to install plugin')
      }
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsInstalling(false)
    }
  }

  const handleUninstall = async (pluginId: string) => {
    setUninstallingId(pluginId)
    try {
      await pluginLoader.uninstall(pluginId)
    } catch (error) {
      console.error('Failed to uninstall plugin:', error)
    } finally {
      setUninstallingId(null)
    }
  }

  const isRemotePlugin = (pluginId: string): boolean => {
    const installed = pluginRegistry.get(pluginId)
    return installed !== null && installed.source.type !== 'builtin'
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
            <>
              <h2>Plugin Manager</h2>
              <button
                className="plugin-install-button"
                onClick={() => setShowInstallDialog(true)}
                title="Install plugin"
              >
                <Plus size={14} />
                Install Plugin
              </button>
            </>
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

              {/* Plugin List */}
              {filteredPlugins.length === 0 ? (
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
                      isUninstalling={uninstallingId === registration.plugin.id}
                      canUninstall={isRemotePlugin(registration.plugin.id)}
                      onToggle={() => handleToggle(registration.plugin.id, registration.enabled)}
                      onConfigure={() => handleConfigure(registration.plugin)}
                      onUninstall={() => handleUninstall(registration.plugin.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Install Plugin Dialog */}
        {showInstallDialog && (
          <div
            className="plugin-install-overlay"
            onClick={() => !isInstalling && setShowInstallDialog(false)}
          >
            <div className="plugin-install-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="plugin-install-header">
                <h3>Install Plugin</h3>
                <button
                  className="plugin-settings-close"
                  onClick={() => setShowInstallDialog(false)}
                  disabled={isInstalling}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="plugin-install-content">
                <div className="plugin-install-source-tabs">
                  <button
                    className={`plugin-install-source-tab ${installSource === 'github' ? 'active' : ''}`}
                    onClick={() => setInstallSource('github')}
                    disabled={isInstalling}
                  >
                    <Github size={14} />
                    GitHub
                  </button>
                  <button
                    className={`plugin-install-source-tab ${installSource === 'url' ? 'active' : ''}`}
                    onClick={() => setInstallSource('url')}
                    disabled={isInstalling}
                  >
                    <Link size={14} />
                    URL
                  </button>
                  <button
                    className={`plugin-install-source-tab ${installSource === 'npm' ? 'active' : ''}`}
                    onClick={() => setInstallSource('npm')}
                    disabled={isInstalling}
                  >
                    <Package size={14} />
                    NPM
                  </button>
                </div>

                <div className="plugin-install-input-wrapper">
                  <input
                    type="text"
                    className="plugin-install-input"
                    placeholder={
                      installSource === 'github'
                        ? 'https://github.com/user/repo'
                        : installSource === 'url'
                          ? 'https://example.com/plugin/manifest.json'
                          : 'package-name'
                    }
                    value={installUrl}
                    onChange={(e) => setInstallUrl(e.target.value)}
                    disabled={isInstalling}
                    onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
                  />
                </div>

                {installError && (
                  <div className="plugin-install-error">
                    <AlertCircle size={14} />
                    {installError}
                  </div>
                )}

                <p className="plugin-install-hint">
                  {installSource === 'github'
                    ? 'Enter a GitHub repository URL containing a ledger-plugin.json manifest.'
                    : installSource === 'url'
                      ? 'Enter a direct URL to the plugin manifest JSON file.'
                      : 'Enter the NPM package name of the Ledger plugin.'}
                </p>
              </div>

              <div className="plugin-install-actions">
                <button
                  className="plugin-config-button secondary"
                  onClick={() => setShowInstallDialog(false)}
                  disabled={isInstalling}
                >
                  Cancel
                </button>
                <button
                  className="plugin-config-button primary"
                  onClick={handleInstall}
                  disabled={isInstalling || !installUrl.trim()}
                >
                  {isInstalling ? (
                    <>
                      <Loader2 size={14} className="plugin-spinner" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      Install
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface PluginCardProps {
  registration: PluginRegistration
  isToggling: boolean
  isUninstalling: boolean
  canUninstall: boolean
  onToggle: () => void
  onConfigure: () => void
  onUninstall: () => void
}

function PluginCard({
  registration,
  isToggling,
  isUninstalling,
  canUninstall,
  onToggle,
  onConfigure,
  onUninstall,
}: PluginCardProps) {
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
        {canUninstall && (
          <button
            className="plugin-card-uninstall-button"
            onClick={onUninstall}
            disabled={isUninstalling}
            title="Uninstall plugin"
          >
            {isUninstalling ? <Loader2 size={14} className="plugin-spinner" /> : <Trash2 size={14} />}
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
