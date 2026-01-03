/**
 * Repo Switcher
 *
 * Simple chip-based UI for switching between repositories.
 * Shows all open repos with current highlighted, plus button to manage.
 * Keyboard navigation: Tab between chips, Enter/Space to select, Delete to close.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Settings2 } from 'lucide-react'
import { usePluginStore } from '@/app/stores/plugin-store'
import './repo-switcher.css'

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
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const openPanel = usePluginStore((s) => s.openPanel)

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
  const handleSwitch = useCallback(async (id: string, _path: string) => {
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

  // Open the repository manager panel
  const openManager = useCallback(() => {
    openPanel('ledger.repository-manager')
  }, [openPanel])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number, repo?: RepoInfo) => {
    const totalItems = repos.length + 1 // chips + manage button

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex((index + 1) % totalItems)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex((index - 1 + totalItems) % totalItems)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (repo) {
          handleSwitch(repo.id, repo.path)
        } else {
          openManager()
        }
        break
      case 'Delete':
      case 'Backspace':
        if (repo && repos.length > 1) {
          e.preventDefault()
          handleClose(repo.id, e as unknown as React.MouseEvent)
        }
        break
      case 'Escape':
        e.preventDefault()
        setFocusedIndex(-1)
        ;(e.target as HTMLElement).blur()
        break
    }
  }, [repos, handleSwitch, handleClose, openManager])

  // Focus management
  useEffect(() => {
    if (focusedIndex >= 0 && containerRef.current) {
      const items = containerRef.current.querySelectorAll('.repo-chip')
      const item = items[focusedIndex] as HTMLElement
      item?.focus()
    }
  }, [focusedIndex])

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
      <div className="repo-switcher" ref={containerRef}>
        <div
          className="repo-chip active"
          tabIndex={0}
          onKeyDown={(e) => handleKeyDown(e, 0)}
        >
          {getShortName(currentPath)}
        </div>
        <button
          className="repo-chip add"
          onClick={openManager}
          onKeyDown={(e) => handleKeyDown(e, 1)}
          title="Manage repositories"
        >
          <Settings2 size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="repo-switcher" ref={containerRef}>
      {repos.map((repo, index) => (
        <div
          key={repo.id}
          className={`repo-chip ${repo.isActive ? 'active' : ''} ${switching === repo.id ? 'switching' : ''}`}
          tabIndex={0}
          onClick={() => handleSwitch(repo.id, repo.path)}
          onKeyDown={(e) => handleKeyDown(e, index, repo)}
          onMouseEnter={() => setShowClose(repo.id)}
          onMouseLeave={() => setShowClose(null)}
          title={repo.path}
          role="button"
          aria-pressed={repo.isActive}
        >
          <span className="repo-chip-name">{repo.name}</span>
          {showClose === repo.id && repos.length > 1 && (
            <button
              className="repo-chip-close"
              onClick={(e) => handleClose(repo.id, e)}
              title="Close repository"
              tabIndex={-1}
            >
              <X size={10} />
            </button>
          )}
        </div>
      ))}
      <button
        className="repo-chip add"
        onClick={openManager}
        onKeyDown={(e) => handleKeyDown(e, repos.length)}
        title="Manage repositories"
      >
        <Settings2 size={14} />
      </button>
    </div>
  )
}

export default RepoSwitcher
