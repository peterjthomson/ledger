/**
 * Repository Manager Panel
 *
 * Plugin panel for managing multiple repositories - switch, add, remove.
 * Provides a richer interface than the header chip switcher.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen,
  X,
  Check,
  Clock,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Github,
  FolderGit2,
  ChevronRight,
  Globe,
  Download,
  Cloud,
  Link,
  MapPin,
} from 'lucide-react'
import type { PluginPanelProps } from '@/lib/plugins/plugin-types'
import type { RepoInfo } from '@/app/types/electron'
import './example-plugin-styles.css'

interface RemoteInfo {
  owner: string
  repo: string
  fullName: string
}

interface RepositorySummary {
  id: string
  name: string
  path: string | null
  isActive: boolean
  provider: string
  type: 'local' | 'remote'
  remote: RemoteInfo | null
}

export function RepositoryManagerPanel({ context, onClose }: PluginPanelProps) {
  const [openRepos, setOpenRepos] = useState<RepositorySummary[]>([])
  const [recentRepos, setRecentRepos] = useState<string[]>([])
  const [siblingRepos, setSiblingRepos] = useState<RepoInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloning, setCloning] = useState(false)
  const [showCloneInput, setShowCloneInput] = useState(false)
  const [connectInput, setConnectInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [showConnectInput, setShowConnectInput] = useState(false)

  // Load repositories
  const loadRepos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [open, recent, siblings] = await Promise.all([
        window.conveyor.repo.listRepositories(),
        window.conveyor.repo.getRecentRepositories(),
        window.electronAPI.getSiblingRepos(),
      ])
      setOpenRepos(open)
      // Filter recent to exclude already-open repos
      const openPaths = new Set(open.map((r) => r.path))
      setRecentRepos(recent.filter((p) => !openPaths.has(p)))
      // Filter siblings to exclude already-open repos and current repo
      setSiblingRepos(siblings.filter((s) => !openPaths.has(s.path) && !s.isCurrent))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRepos()
  }, [loadRepos])

  // Switch to a repository
  const handleSwitch = useCallback(
    async (id: string) => {
      setSwitching(id)
      setError(null)
      try {
        const result = await window.conveyor.repo.switchRepository(id)
        if (result.success) {
          context.api.refresh()
          await loadRepos()
          onClose() // Close panel after switch
        } else {
          setError(result.error || 'Failed to switch repository')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to switch repository')
      } finally {
        setSwitching(null)
      }
    },
    [context, loadRepos, onClose]
  )

  // Close a repository
  const handleClose = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setError(null)
      try {
        const result = await window.conveyor.repo.closeRepository(id)
        if (result.success) {
          await loadRepos()
        } else {
          setError(result.error || 'Failed to close repository')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to close repository')
      }
    },
    [loadRepos]
  )

  // Open a new repository via dialog
  const handleOpenNew = useCallback(async () => {
    setError(null)
    try {
      const path = await window.conveyor.repo.selectRepo()
      if (path) {
        context.api.refresh()
        await loadRepos()
        onClose() // Close panel after opening
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open repository')
    }
  }, [context, loadRepos, onClose])

  // Open a recent repository
  const handleOpenRecent = useCallback(
    async (repoPath: string) => {
      setSwitching(repoPath)
      setError(null)
      try {
        const result = await window.conveyor.repo.openRepository(repoPath)
        if (result.success) {
          context.api.refresh()
          await loadRepos()
          onClose() // Close panel after opening
        } else {
          setError(result.error || 'Failed to open repository')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open repository')
      } finally {
        setSwitching(null)
      }
    },
    [context, loadRepos, onClose]
  )

  // Remove from recent
  const handleRemoveRecent = useCallback(
    async (repoPath: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await window.conveyor.repo.removeRecentRepository(repoPath)
        setRecentRepos((prev) => prev.filter((p) => p !== repoPath))
      } catch (err) {
        console.error('Failed to remove from recent:', err)
      }
    },
    []
  )

  // Open a sibling repository
  const handleOpenSibling = useCallback(
    async (repoPath: string) => {
      setSwitching(repoPath)
      setError(null)
      try {
        const result = await window.conveyor.repo.openRepository(repoPath)
        if (result.success) {
          context.api.refresh()
          await loadRepos()
          onClose() // Close panel after opening
        } else {
          setError(result.error || 'Failed to open repository')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open repository')
      } finally {
        setSwitching(null)
      }
    },
    [context, loadRepos, onClose]
  )

  // Clone a remote repository
  const handleClone = useCallback(async () => {
    if (!cloneUrl.trim()) return

    setCloning(true)
    setError(null)
    try {
      const result = await window.conveyor.repo.cloneRepository(cloneUrl.trim())
      if (result.success && result.path) {
        context.api.refresh()
        await loadRepos()
        setCloneUrl('')
        setShowCloneInput(false)
        onClose() // Close panel after successful clone
      } else {
        setError(result.error || 'Failed to clone repository')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone repository')
    } finally {
      setCloning(false)
    }
  }, [cloneUrl, context, loadRepos, onClose])

  // Connect to a remote repository (API-only, no download)
  const handleConnect = useCallback(async () => {
    if (!connectInput.trim()) return

    setConnecting(true)
    setError(null)
    try {
      const result = await window.conveyor.repo.connectRemoteRepository(connectInput.trim())
      if (result.success) {
        context.api.refresh()
        await loadRepos()
        setConnectInput('')
        setShowConnectInput(false)
        onClose() // Close panel after successful connection
      } else {
        setError(result.error || 'Failed to connect to repository')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to repository')
    } finally {
      setConnecting(false)
    }
  }, [connectInput, context, loadRepos, onClose])

  const getRepoIcon = (repo: RepositorySummary) => {
    // Remote repos get a cloud icon
    if (repo.type === 'remote') {
      return <Cloud size={14} className="repo-manager-remote-icon" />
    }
    // Local repos show provider icon
    switch (repo.provider.toLowerCase()) {
      case 'github':
        return <Github size={14} />
      default:
        return <FolderGit2 size={14} />
    }
  }

  const getRepoSubtitle = (repo: RepositorySummary) => {
    if (repo.type === 'remote' && repo.remote) {
      return repo.remote.fullName
    }
    return repo.path || ''
  }

  const getRepoName = (path: string) => {
    const parts = path.split(/[/\\]/)
    return parts[parts.length - 1] || path
  }

  if (loading) {
    return (
      <div className="repo-manager-panel">
        <div className="repo-manager-loading">
          <RefreshCw size={24} className="spinning" />
          <span>Loading repositories...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="repo-manager-panel">
      {/* Header */}
      <div className="repo-manager-header">
        <h3>Repositories</h3>
        <button className="repo-manager-refresh" onClick={loadRepos} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {error && (
        <div className="repo-manager-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Open Repositories */}
      <div className="repo-manager-section">
        <div className="repo-manager-section-header">
          <FolderOpen size={14} />
          <span>Open Repositories</span>
          <span className="repo-manager-section-count">{openRepos.length}</span>
        </div>

        {openRepos.length === 0 ? (
          <div className="repo-manager-empty">
            <p>No repositories open</p>
          </div>
        ) : (
          <div className="repo-manager-list">
            {openRepos.map((repo) => (
              <div
                key={repo.id}
                className={`repo-manager-item ${repo.isActive ? 'active' : ''} ${repo.type === 'remote' ? 'remote' : ''}`}
                onClick={() => !repo.isActive && handleSwitch(repo.id)}
              >
                <div className="repo-manager-item-icon">{getRepoIcon(repo)}</div>
                <div className="repo-manager-item-content">
                  <div className="repo-manager-item-name">
                    {repo.name}
                    {repo.type === 'remote' && <span className="repo-manager-remote-badge">Remote</span>}
                    {repo.isActive && <span className="repo-manager-active-badge">Active</span>}
                  </div>
                  <div className="repo-manager-item-path">{getRepoSubtitle(repo)}</div>
                </div>
                <div className="repo-manager-item-actions">
                  {switching === repo.id ? (
                    <RefreshCw size={14} className="spinning" />
                  ) : repo.isActive ? (
                    <Check size={14} className="repo-manager-check" />
                  ) : (
                    <>
                      <button
                        className="repo-manager-item-switch"
                        onClick={() => handleSwitch(repo.id)}
                        title="Switch to this repository"
                      >
                        <ChevronRight size={14} />
                      </button>
                      <button
                        className="repo-manager-item-close"
                        onClick={(e) => handleClose(repo.id, e)}
                        title="Close repository"
                      >
                        <X size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Repository Buttons */}
      <div className="repo-manager-add-section">
        <button className="repo-manager-add-button" onClick={handleOpenNew}>
          <Plus size={16} />
          <span>Open Local Repository...</span>
        </button>
        <button
          className="repo-manager-add-button"
          onClick={() => {
            setShowConnectInput(!showConnectInput)
            setShowCloneInput(false)
          }}
        >
          <Link size={16} />
          <span>Connect to GitHub (API only)</span>
        </button>
        <button
          className="repo-manager-add-button"
          onClick={() => {
            setShowCloneInput(!showCloneInput)
            setShowConnectInput(false)
          }}
        >
          <Download size={16} />
          <span>Clone Repository</span>
        </button>
      </div>

      {/* Connect Input (API-only) */}
      {showConnectInput && (
        <div className="repo-manager-clone-section repo-manager-connect-section">
          <div className="repo-manager-clone-input-wrapper">
            <input
              type="text"
              className="repo-manager-clone-input"
              placeholder="owner/repo or https://github.com/owner/repo"
              value={connectInput}
              onChange={(e) => setConnectInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              disabled={connecting}
              autoFocus
            />
            <button
              className="repo-manager-clone-submit repo-manager-connect-submit"
              onClick={handleConnect}
              disabled={!connectInput.trim() || connecting}
              title="Connect to repository"
            >
              {connecting ? <RefreshCw size={16} className="spinning" /> : <Link size={16} />}
            </button>
          </div>
          <div className="repo-manager-clone-hint">
            Monitor PRs, branches, and commits without downloading. Requires GitHub CLI (gh).
          </div>
        </div>
      )}

      {/* Clone Input */}
      {showCloneInput && (
        <div className="repo-manager-clone-section">
          <div className="repo-manager-clone-input-wrapper">
            <input
              type="text"
              className="repo-manager-clone-input"
              placeholder="https://github.com/user/repo.git"
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleClone()}
              disabled={cloning}
              autoFocus
            />
            <button
              className="repo-manager-clone-submit"
              onClick={handleClone}
              disabled={!cloneUrl.trim() || cloning}
              title="Clone repository"
            >
              {cloning ? <RefreshCw size={16} className="spinning" /> : <Download size={16} />}
            </button>
          </div>
          <div className="repo-manager-clone-hint">
            Enter a Git URL (HTTPS or SSH) and select where to clone
          </div>
        </div>
      )}

      {/* Sibling Repositories */}
      {siblingRepos.length > 0 && (
        <div className="repo-manager-section">
          <div className="repo-manager-section-header">
            <MapPin size={14} />
            <span>Nearby Repositories</span>
          </div>

          <div className="repo-manager-list">
            {siblingRepos.map((repo) => (
              <div
                key={repo.path}
                className="repo-manager-item sibling"
                onClick={() => handleOpenSibling(repo.path)}
              >
                <div className="repo-manager-item-icon">
                  <FolderGit2 size={14} />
                </div>
                <div className="repo-manager-item-content">
                  <div className="repo-manager-item-name">{repo.name}</div>
                  <div className="repo-manager-item-path">{repo.path}</div>
                </div>
                <div className="repo-manager-item-actions">
                  {switching === repo.path ? (
                    <RefreshCw size={14} className="spinning" />
                  ) : (
                    <button
                      className="repo-manager-item-open"
                      onClick={() => handleOpenSibling(repo.path)}
                      title="Open repository"
                    >
                      <ExternalLink size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Repositories */}
      {recentRepos.length > 0 && (
        <div className="repo-manager-section">
          <div className="repo-manager-section-header">
            <Clock size={14} />
            <span>Recent Repositories</span>
          </div>

          <div className="repo-manager-list">
            {recentRepos.map((repoPath) => (
              <div
                key={repoPath}
                className="repo-manager-item recent"
                onClick={() => handleOpenRecent(repoPath)}
              >
                <div className="repo-manager-item-icon">
                  <FolderGit2 size={14} />
                </div>
                <div className="repo-manager-item-content">
                  <div className="repo-manager-item-name">{getRepoName(repoPath)}</div>
                  <div className="repo-manager-item-path">{repoPath}</div>
                </div>
                <div className="repo-manager-item-actions">
                  {switching === repoPath ? (
                    <RefreshCw size={14} className="spinning" />
                  ) : (
                    <>
                      <button
                        className="repo-manager-item-open"
                        onClick={() => handleOpenRecent(repoPath)}
                        title="Open repository"
                      >
                        <ExternalLink size={14} />
                      </button>
                      <button
                        className="repo-manager-item-remove"
                        onClick={(e) => handleRemoveRecent(repoPath, e)}
                        title="Remove from recent"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default RepositoryManagerPanel
