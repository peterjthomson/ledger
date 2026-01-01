/**
 * Repository Manager Panel
 *
 * Panel for managing multiple repositories - switch, add, remove.
 * Accessible from plugin settings.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen,
  GitBranch,
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
} from 'lucide-react'

interface RepositorySummary {
  id: string
  name: string
  path: string
  isActive: boolean
  provider: string
}

interface RepositoryManagerPanelProps {
  onRepoSwitch?: (path: string) => void
  onClose?: () => void
}

export function RepositoryManagerPanel({ onRepoSwitch, onClose }: RepositoryManagerPanelProps) {
  const [openRepos, setOpenRepos] = useState<RepositorySummary[]>([])
  const [recentRepos, setRecentRepos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load repositories
  const loadRepos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [open, recent] = await Promise.all([
        window.conveyor.repo.listRepositories(),
        window.conveyor.repo.getRecentRepositories(),
      ])
      setOpenRepos(open)
      // Filter recent to exclude already-open repos
      const openPaths = new Set(open.map((r) => r.path))
      setRecentRepos(recent.filter((p) => !openPaths.has(p)))
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
        if (result.success && result.path) {
          onRepoSwitch?.(result.path)
          await loadRepos()
        } else {
          setError(result.error || 'Failed to switch repository')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to switch repository')
      } finally {
        setSwitching(null)
      }
    },
    [onRepoSwitch, loadRepos]
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
        onRepoSwitch?.(path)
        await loadRepos()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open repository')
    }
  }, [onRepoSwitch, loadRepos])

  // Open a recent repository
  const handleOpenRecent = useCallback(
    async (repoPath: string) => {
      setSwitching(repoPath)
      setError(null)
      try {
        const result = await window.conveyor.repo.openRepository(repoPath)
        if (result.success) {
          onRepoSwitch?.(repoPath)
          await loadRepos()
        } else {
          setError(result.error || 'Failed to open repository')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open repository')
      } finally {
        setSwitching(null)
      }
    },
    [onRepoSwitch, loadRepos]
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

  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'github':
        return <Github size={14} />
      default:
        return <FolderGit2 size={14} />
    }
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
        <h3>Repository Manager</h3>
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
                className={`repo-manager-item ${repo.isActive ? 'active' : ''}`}
                onClick={() => !repo.isActive && handleSwitch(repo.id)}
              >
                <div className="repo-manager-item-icon">{getProviderIcon(repo.provider)}</div>
                <div className="repo-manager-item-content">
                  <div className="repo-manager-item-name">
                    {repo.name}
                    {repo.isActive && <span className="repo-manager-active-badge">Active</span>}
                  </div>
                  <div className="repo-manager-item-path">{repo.path}</div>
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

      {/* Add Repository Button */}
      <div className="repo-manager-add-section">
        <button className="repo-manager-add-button" onClick={handleOpenNew}>
          <Plus size={16} />
          <span>Open Repository...</span>
        </button>
      </div>

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
