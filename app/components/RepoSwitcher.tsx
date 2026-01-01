/**
 * Repo Switcher
 *
 * Simple chip-based UI for switching between repositories.
 * Shows all open repos with current highlighted, plus button to add.
 */

import { useState, useEffect, useCallback } from 'react'
import { Plus, X } from 'lucide-react'

interface RepoInfo {
  id: string
  name: string
  path: string
  isActive: boolean
}

interface RepoSwitcherProps {
  currentPath: string | null
  onRepoChange: (path: string) => void
}

export function RepoSwitcher({ currentPath, onRepoChange }: RepoSwitcherProps) {
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [switching, setSwitching] = useState<string | null>(null)
  const [showClose, setShowClose] = useState<string | null>(null)

  // Load repos
  const loadRepos = useCallback(async () => {
    try {
      const list = await window.conveyor.repo.listRepositories()
      setRepos(list.map(r => ({
        id: r.id,
        name: r.name,
        path: r.path,
        isActive: r.isActive
      })))
    } catch (err) {
      console.error('Failed to load repositories:', err)
    }
  }, [])

  useEffect(() => {
    loadRepos()
  }, [loadRepos, currentPath])

  // Switch to a repo
  const handleSwitch = useCallback(async (id: string, path: string) => {
    if (switching) return

    const repo = repos.find(r => r.id === id)
    if (repo?.isActive) return // Already active

    setSwitching(id)
    try {
      const result = await window.conveyor.repo.switchRepository(id)
      if (result.success && result.path) {
        onRepoChange(result.path)
        await loadRepos()
      }
    } catch (err) {
      console.error('Failed to switch repository:', err)
    } finally {
      setSwitching(null)
    }
  }, [repos, switching, onRepoChange, loadRepos])

  // Add a new repo
  const handleAdd = useCallback(async () => {
    try {
      const path = await window.conveyor.repo.selectRepo()
      if (path) {
        onRepoChange(path)
        await loadRepos()
      }
    } catch (err) {
      console.error('Failed to add repository:', err)
    }
  }, [onRepoChange, loadRepos])

  // Close a repo
  const handleClose = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const repo = repos.find(r => r.id === id)
    if (!repo) return

    // Don't allow closing the only repo
    if (repos.length === 1) return

    try {
      const result = await window.conveyor.repo.closeRepository(id)
      if (result.success) {
        await loadRepos()
        // If we closed the active repo, the backend picks a new active
        const newList = await window.conveyor.repo.listRepositories()
        const newActive = newList.find(r => r.isActive)
        if (newActive) {
          onRepoChange(newActive.path)
        }
      }
    } catch (err) {
      console.error('Failed to close repository:', err)
    }
  }, [repos, onRepoChange, loadRepos])

  // Get short name for display
  const getShortName = (path: string) => {
    const parts = path.split(/[/\\]/)
    return parts[parts.length - 1] || 'repo'
  }

  // If no repos and no current path, show nothing (empty state handles it)
  if (repos.length === 0 && !currentPath) {
    return null
  }

  // If only current path but no repos loaded yet, show just current
  if (repos.length === 0 && currentPath) {
    return (
      <div className="repo-switcher">
        <div className="repo-chip active">
          {getShortName(currentPath)}
        </div>
        <button
          className="repo-chip add"
          onClick={handleAdd}
          title="Open another repository"
        >
          <Plus size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="repo-switcher">
      {repos.map(repo => (
        <div
          key={repo.id}
          className={`repo-chip ${repo.isActive ? 'active' : ''} ${switching === repo.id ? 'switching' : ''}`}
          onClick={() => handleSwitch(repo.id, repo.path)}
          onMouseEnter={() => setShowClose(repo.id)}
          onMouseLeave={() => setShowClose(null)}
          title={repo.path}
        >
          <span className="repo-chip-name">{repo.name}</span>
          {showClose === repo.id && repos.length > 1 && !repo.isActive && (
            <button
              className="repo-chip-close"
              onClick={(e) => handleClose(repo.id, e)}
              title="Close repository"
            >
              <X size={10} />
            </button>
          )}
        </div>
      ))}
      <button
        className="repo-chip add"
        onClick={handleAdd}
        title="Open another repository"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

export default RepoSwitcher
