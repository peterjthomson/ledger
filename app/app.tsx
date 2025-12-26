import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { Branch, Worktree, BranchFilter, BranchSort, CheckoutResult, PullRequest, Commit, WorkingStatus, PRFilter, PRSort } from './types/electron'
import './styles/app.css'
import { useWindowContext } from './components/window'

interface StatusMessage {
  type: 'success' | 'error' | 'info';
  message: string;
  stashed?: string;
}

type ContextMenuType = 'pr' | 'worktree' | 'local-branch' | 'remote-branch' | 'commit';

interface ContextMenu {
  type: ContextMenuType;
  x: number;
  y: number;
  data: PullRequest | Worktree | Branch | Commit;
}

interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
}

export default function App() {
  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [currentBranch, setCurrentBranch] = useState<string>('')
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
  const [prError, setPrError] = useState<string | null>(null)
  const [commits, setCommits] = useState<Commit[]>([])
  const [workingStatus, setWorkingStatus] = useState<WorkingStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [switching, setSwitching] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [githubUrl, setGithubUrl] = useState<string | null>(null)
  const { setTitle } = useWindowContext()
  
  // Filter and sort state
  const [localFilter, setLocalFilter] = useState<BranchFilter>('all')
  const [localSort, setLocalSort] = useState<BranchSort>('name')
  const [remoteFilter, setRemoteFilter] = useState<BranchFilter>('all')
  const [remoteSort, setRemoteSort] = useState<BranchSort>('name')
  const [prFilter, setPrFilter] = useState<PRFilter>('open-not-draft')
  const [prSort, setPrSort] = useState<PRSort>('updated')
  
  // Collapsible controls state
  const [prControlsOpen, setPrControlsOpen] = useState(false)
  const [localControlsOpen, setLocalControlsOpen] = useState(false)
  const [remoteControlsOpen, setRemoteControlsOpen] = useState(false)
  const [worktreeControlsOpen, setWorktreeControlsOpen] = useState(false)
  
  // Worktree filter state
  const [worktreeParentFilter, setWorktreeParentFilter] = useState<string>('all')

  const menuRef = useRef<HTMLDivElement>(null)

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  // Auto-dismiss status messages
  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(null), 4000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [status])

  const selectRepo = async () => {
    const path = await window.electronAPI.selectRepo()
    if (path) {
      setRepoPath(path)
      await refresh()
    }
  }

  const refresh = async () => {
    setLoading(true)
    setError(null)
    setPrError(null)

    try {
      const [branchResult, worktreeResult, prResult, commitResult, statusResult, ghUrl] = await Promise.all([
        window.electronAPI.getBranchesWithMetadata(),
        window.electronAPI.getWorktrees(),
        window.electronAPI.getPullRequests(),
        window.electronAPI.getCommitHistory(15),
        window.electronAPI.getWorkingStatus(),
        window.electronAPI.getGitHubUrl(),
      ])

      setGithubUrl(ghUrl)

      // Update window title with repo name
      if (repoPath) {
        const repoName = repoPath.split('/').pop() || 'Ledger'
        setTitle(repoName)
      } else {
        setTitle('Ledger')
      }

      if ('error' in branchResult && branchResult.error) {
        setError(branchResult.error)
      } else {
        setBranches(branchResult.branches)
        setCurrentBranch(branchResult.current)
      }

      if ('error' in worktreeResult) {
        setError((prev) => prev || worktreeResult.error)
      } else {
        setWorktrees(worktreeResult)
      }

      if (prResult.error) {
        setPrError(prResult.error)
        setPullRequests([])
      } else {
        setPullRequests(prResult.prs)
      }

      setCommits(commitResult)
      setWorkingStatus(statusResult)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, type: ContextMenuType, data: PullRequest | Worktree | Branch | Commit) => {
    e.preventDefault()
    setContextMenu({ type, x: e.clientX, y: e.clientY, data })
  }

  const closeContextMenu = () => setContextMenu(null)

  // PR context menu actions
  const handlePRCheckout = async (pr: PullRequest) => {
    closeContextMenu()
    setSwitching(true)
    setStatus({ type: 'info', message: `Checking out ${pr.branch}...` })
    
    try {
      const result = await window.electronAPI.checkoutPRBranch(pr.branch)
      if (result.success) {
        setStatus({ type: 'success', message: result.message, stashed: result.stashed })
        await refresh()
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    } finally {
      setSwitching(false)
    }
  }

  const handlePRViewRemote = async (pr: PullRequest) => {
    closeContextMenu()
    try {
      const result = await window.electronAPI.openPullRequest(pr.url)
      if (result.success) {
        setStatus({ type: 'success', message: `Opened PR #${pr.number} in browser` })
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    }
  }

  // Worktree context menu actions
  const handleWorktreeApply = async (wt: Worktree) => {
    closeContextMenu()
    if (!wt.branch || switching) return
    
    setSwitching(true)
    setStatus({ type: 'info', message: `Copying changes from ${wt.displayName}...` })
    
    try {
      const result: CheckoutResult = await window.electronAPI.applyWorktree(wt.path, wt.branch)
      if (result.success) {
        setStatus({ type: 'success', message: result.message, stashed: result.stashed })
        await refresh()
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    } finally {
      setSwitching(false)
    }
  }

  const handleWorktreeOpen = async (wt: Worktree) => {
    closeContextMenu()
    try {
      const result = await window.electronAPI.openWorktree(wt.path)
      if (result.success) {
        setStatus({ type: 'success', message: `Opened ${wt.path} in Finder` })
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    }
  }

  const handleWorktreeRemove = async (wt: Worktree) => {
    closeContextMenu()
    if (switching) return
    
    setSwitching(true)
    setStatus({ type: 'info', message: `Removing worktree ${wt.displayName}...` })
    
    try {
      const result = await window.electronAPI.removeWorktree(wt.path)
      if (result.success) {
        setStatus({ type: 'success', message: result.message })
        await refresh()
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    } finally {
      setSwitching(false)
    }
  }

  // Local branch context menu actions
  const handleLocalBranchSwitch = async (branch: Branch) => {
    closeContextMenu()
    if (branch.current || switching) return
    
    setSwitching(true)
    setStatus({ type: 'info', message: `Switching to ${branch.name}...` })
    
    try {
      const result: CheckoutResult = await window.electronAPI.checkoutBranch(branch.name)
      if (result.success) {
        setStatus({ type: 'success', message: result.message, stashed: result.stashed })
        await refresh()
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    } finally {
      setSwitching(false)
    }
  }

  // Remote branch context menu actions
  const handleRemoteBranchPull = async (branch: Branch) => {
    closeContextMenu()
    setStatus({ type: 'info', message: `Fetching ${branch.name.replace('remotes/', '')}...` })
    
    try {
      const result = await window.electronAPI.pullBranch(branch.name)
      if (result.success) {
        setStatus({ type: 'success', message: result.message })
        await refresh()
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    }
  }

  const handleRemoteBranchViewGitHub = async (branch: Branch) => {
    closeContextMenu()
    try {
      const result = await window.electronAPI.openBranchInGitHub(branch.name)
      if (result.success) {
        setStatus({ type: 'success', message: result.message })
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    }
  }

  // Commit context menu actions
  const handleCommitReset = async (commit: Commit) => {
    closeContextMenu()
    if (switching) return
    
    setSwitching(true)
    setStatus({ type: 'info', message: `Resetting to ${commit.shortHash}...` })
    
    try {
      const result = await window.electronAPI.resetToCommit(commit.hash, 'hard')
      if (result.success) {
        setStatus({ type: 'success', message: result.message, stashed: result.stashed })
        await refresh()
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    } finally {
      setSwitching(false)
    }
  }

  // Get menu items based on context menu type
  const getMenuItems = (): MenuItem[] => {
    if (!contextMenu) return []
    
    switch (contextMenu.type) {
      case 'pr': {
        const pr = contextMenu.data as PullRequest
        return [
          { label: 'Check Out', action: () => handlePRCheckout(pr), disabled: switching },
          { label: 'View Remote', action: () => handlePRViewRemote(pr) },
        ]
      }
      case 'worktree': {
        const wt = contextMenu.data as Worktree
        return [
          { label: 'Copy Changes Here', action: () => handleWorktreeApply(wt), disabled: !wt.branch || switching },
          { label: 'Open in Finder', action: () => handleWorktreeOpen(wt) },
          { label: 'Remove Worktree', action: () => handleWorktreeRemove(wt), disabled: switching },
        ]
      }
      case 'local-branch': {
        const branch = contextMenu.data as Branch
        return [
          { label: 'Switch to Latest Commit', action: () => handleLocalBranchSwitch(branch), disabled: branch.current || switching },
        ]
      }
      case 'remote-branch': {
        const branch = contextMenu.data as Branch
        return [
          { label: 'Pull', action: () => handleRemoteBranchPull(branch) },
          { label: 'View Remote', action: () => handleRemoteBranchViewGitHub(branch) },
        ]
      }
      case 'commit': {
        const commit = contextMenu.data as Commit
        return [
          { label: 'Check Out', action: () => handleCommitDoubleClick(commit), disabled: switching },
          { label: 'Reset to This Commit', action: () => handleCommitReset(commit), disabled: switching },
        ]
      }
      default:
        return []
    }
  }

  // Double-click handlers (keep for convenience)
  const handleBranchDoubleClick = useCallback(async (branch: Branch) => {
    if (branch.current || switching) return
    handleLocalBranchSwitch(branch)
  }, [switching])

  const handleRemoteBranchDoubleClick = useCallback(async (branch: Branch) => {
    if (switching) return
    
    setSwitching(true)
    const displayName = branch.name.replace('remotes/', '')
    setStatus({ type: 'info', message: `Checking out ${displayName}...` })
    
    try {
      const result: CheckoutResult = await window.electronAPI.checkoutRemoteBranch(branch.name)
      if (result.success) {
        setStatus({ type: 'success', message: result.message, stashed: result.stashed })
        await refresh()
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    } finally {
      setSwitching(false)
    }
  }, [switching])

  const handleWorktreeDoubleClick = useCallback(async (worktree: Worktree) => {
    if (!worktree.branch || switching) return
    
    setSwitching(true)
    setStatus({ type: 'info', message: `Copying changes from ${worktree.displayName}...` })
    
    try {
      const result: CheckoutResult = await window.electronAPI.applyWorktree(worktree.path, worktree.branch)
      if (result.success) {
        setStatus({ type: 'success', message: result.message, stashed: result.stashed })
        await refresh()
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    } finally {
      setSwitching(false)
    }
  }, [currentBranch, switching])

  const handlePRDoubleClick = useCallback(async (pr: PullRequest) => {
    handlePRViewRemote(pr)
  }, [])

  const handleCommitDoubleClick = useCallback(async (commit: Commit) => {
    if (switching) return
    
    setSwitching(true)
    setStatus({ type: 'info', message: `Checking out ${commit.shortHash}...` })
    
    try {
      const result: CheckoutResult = await window.electronAPI.checkoutBranch(commit.hash)
      if (result.success) {
        setStatus({ type: 'success', message: `Checked out commit ${commit.shortHash}`, stashed: result.stashed })
        await refresh()
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    } finally {
      setSwitching(false)
    }
  }, [switching])

  useEffect(() => {
    if (!window.electronAPI) return
    // Try to load the saved repo from last session
    window.electronAPI.loadSavedRepo().then((path) => {
      if (path) {
        setRepoPath(path)
        refresh()
      }
    })
  }, [])

  // Filter and sort functions
  const filterBranches = (branchList: Branch[], filter: BranchFilter): Branch[] => {
    switch (filter) {
      case 'local-only':
        return branchList.filter(b => b.isLocalOnly)
      case 'unmerged':
        return branchList.filter(b => !b.isMerged)
      default:
        return branchList
    }
  }

  const sortBranches = (branchList: Branch[], sort: BranchSort): Branch[] => {
    const sorted = [...branchList]
    switch (sort) {
      case 'last-commit':
        return sorted.sort((a, b) => {
          if (!a.lastCommitDate) return 1
          if (!b.lastCommitDate) return -1
          return new Date(b.lastCommitDate).getTime() - new Date(a.lastCommitDate).getTime()
        })
      case 'first-commit':
        return sorted.sort((a, b) => {
          if (!a.firstCommitDate) return 1
          if (!b.firstCommitDate) return -1
          return new Date(a.firstCommitDate).getTime() - new Date(b.firstCommitDate).getTime()
        })
      case 'most-commits':
        return sorted.sort((a, b) => (b.commitCount || 0) - (a.commitCount || 0))
      case 'name':
      default:
        return sorted.sort((a, b) => a.name.localeCompare(b.name))
    }
  }

  const localBranches = useMemo(() => {
    const local = branches.filter((b) => !b.isRemote)
    const filtered = filterBranches(local, localFilter)
    return sortBranches(filtered, localSort)
  }, [branches, localFilter, localSort])

  const remoteBranches = useMemo(() => {
    const remote = branches.filter((b) => b.isRemote)
    const filtered = filterBranches(remote, remoteFilter)
    return sortBranches(filtered, remoteSort)
  }, [branches, remoteFilter, remoteSort])

  // Extract unique parent folders from worktrees
  const worktreeParents = useMemo(() => {
    const parents = new Set<string>()
    for (const wt of worktrees) {
      // Extract parent folder from path (e.g., ~/.cursor/worktrees/xxx -> .cursor)
      const pathParts = wt.path.split('/')
      // Find known agent folders like .cursor, .claude, etc.
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i]
        if (part.startsWith('.') && ['cursor', 'claude', 'gemini', 'junie'].some(a => part.toLowerCase().includes(a))) {
          parents.add(part)
          break
        }
      }
      // Also check for worktrees in the main repo path
      if (repoPath && wt.path.startsWith(repoPath)) {
        parents.add('main')
      }
    }
    return Array.from(parents).sort()
  }, [worktrees, repoPath])

  // Filter worktrees by parent or time
  const filteredWorktrees = useMemo(() => {
    if (worktreeParentFilter === 'all') {
      return worktrees
    }
    if (worktreeParentFilter === 'today') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return worktrees.filter(wt => {
        const wtDate = new Date(wt.lastModified)
        wtDate.setHours(0, 0, 0, 0)
        return wtDate.getTime() === today.getTime()
      })
    }
    return worktrees.filter(wt => {
      if (worktreeParentFilter === 'main') {
        return repoPath && wt.path.startsWith(repoPath)
      }
      return wt.path.includes(`/${worktreeParentFilter}/`)
    })
  }, [worktrees, worktreeParentFilter, repoPath])

  // Filter and sort PRs
  const filteredPRs = useMemo(() => {
    let filtered = [...pullRequests]
    
    // Apply filter
    switch (prFilter) {
      case 'open-not-draft':
        filtered = filtered.filter(pr => !pr.isDraft)
        break
      case 'open-draft':
        filtered = filtered.filter(pr => pr.isDraft)
        break
      case 'all':
      default:
        break
    }
    
    // Apply sort
    switch (prSort) {
      case 'comments':
        filtered.sort((a, b) => b.comments - a.comments)
        break
      case 'first-commit':
        filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        break
      case 'last-commit':
        filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        break
      case 'updated':
      default:
        filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        break
    }
    
    return filtered
  }, [pullRequests, prFilter, prSort])

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }

  const formatRelativeTime = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    return `${Math.floor(diffDays / 30)}mo ago`
  }

  const getReviewBadge = (decision: string | null) => {
    switch (decision) {
      case 'APPROVED':
        return <span className="badge badge-approved">Approved</span>
      case 'CHANGES_REQUESTED':
        return <span className="badge badge-changes">Changes</span>
      case 'REVIEW_REQUIRED':
        return <span className="badge badge-review">Review</span>
      default:
        return null
    }
  }

  const menuItems = getMenuItems()

  return (
    <div className="ledger-app">
      {/* Context Menu */}
      {contextMenu && (
        <div 
          ref={menuRef}
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {menuItems.map((item, i) => (
            <button 
              key={i}
              className={`context-menu-item ${item.disabled ? 'disabled' : ''}`}
              onClick={item.action}
              disabled={item.disabled}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Status Toast */}
      {status && (
        <div className={`status-toast status-${status.type}`}>
          <span className="status-icon">
            {status.type === 'success' && '✓'}
            {status.type === 'error' && '✕'}
            {status.type === 'info' && '○'}
          </span>
          <div className="status-content">
            <span className="status-message">{status.message}</span>
            {status.stashed && (
              <span className="status-stash">Stashed: {status.stashed}</span>
            )}
          </div>
          <button className="status-dismiss" onClick={() => setStatus(null)}>×</button>
        </div>
      )}

      {/* Header */}
      <header className="ledger-header">
        <div className="header-left">
          {repoPath && (
            <span 
              className="repo-path clickable"
              title={githubUrl || repoPath}
              onClick={async () => {
                if (githubUrl) {
                  await window.electronAPI.openPullRequest(githubUrl)
                } else {
                  // Try to get GitHub URL fresh
                  const url = await window.electronAPI.getGitHubUrl()
                  if (url) {
                    setGithubUrl(url)
                    await window.electronAPI.openPullRequest(url)
                  } else {
                    setStatus({ type: 'error', message: 'No GitHub URL found for this repo' })
                  }
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              {repoPath.split('/').slice(-2).join('/')}
            </span>
          )}
        </div>
        <div className="header-actions">
          <button onClick={selectRepo} className="btn btn-secondary">
            <span className="btn-icon">📁</span>
            {repoPath ? 'Change Repo' : 'Select Repository'}
          </button>
          {repoPath && (
            <button onClick={refresh} disabled={loading || switching} className="btn btn-primary">
              <span className={`btn-icon ${loading || switching ? 'spinning' : ''}`}>↻</span>
              {loading ? 'Refreshing...' : switching ? 'Switching...' : 'Refresh'}
            </button>
          )}
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠</span>
          {error}
        </div>
      )}

      {/* Empty State */}
      {!repoPath && (
        <div className="empty-state">
          <div className="empty-icon">◈</div>
          <h2>Welcome to Ledger</h2>
          <p>Select a git repository to view your branches, worktrees and pull requests</p>
          <button onClick={selectRepo} className="btn btn-large btn-primary">
            <span className="btn-icon">📁</span>
            Select Repository
          </button>
        </div>
      )}

      {/* Main Content */}
      {repoPath && !error && (
        <main className="ledger-content five-columns">
          {/* Pull Requests Column */}
          <section className="column pr-column">
            <div 
              className={`column-header clickable-header ${prControlsOpen ? 'open' : ''}`}
              onClick={() => setPrControlsOpen(!prControlsOpen)}
            >
              <div className="column-title">
                <h2>
                  <span className="column-icon">⬡</span>
                  Pull Requests
                </h2>
                <span className={`header-chevron ${prControlsOpen ? 'open' : ''}`}>▾</span>
              </div>
              <span className="count-badge">{filteredPRs.length}</span>
            </div>
            {prControlsOpen && (
              <div className="column-controls" onClick={(e) => e.stopPropagation()}>
                <div className="control-group">
                  <label>Filter</label>
                  <select 
                    value={prFilter} 
                    onChange={(e) => setPrFilter(e.target.value as PRFilter)}
                    className="control-select"
                  >
                    <option value="all">All Open</option>
                    <option value="open-not-draft">Open + Not Draft</option>
                    <option value="open-draft">Open + Draft</option>
                  </select>
                </div>
                <div className="control-group">
                  <label>Sort</label>
                  <select 
                    value={prSort} 
                    onChange={(e) => setPrSort(e.target.value as PRSort)}
                    className="control-select"
                  >
                    <option value="updated">Last Updated</option>
                    <option value="comments">Comments</option>
                    <option value="first-commit">First Commit</option>
                    <option value="last-commit">Last Commit</option>
                  </select>
                </div>
              </div>
            )}
            <div className="column-content">
              {prError ? (
                <div className="empty-column pr-error">
                  <span className="pr-error-icon">⚠</span>
                  {prError}
                </div>
              ) : filteredPRs.length === 0 ? (
                <div className="empty-column">
                  {prFilter !== 'all' ? 'No PRs match filter' : 'No open PRs'}
                </div>
              ) : (
                <ul className="item-list">
                  {filteredPRs.map((pr) => (
                    <li
                      key={pr.number}
                      className={`item pr-item clickable ${pr.isDraft ? 'draft' : ''}`}
                      onDoubleClick={() => handlePRDoubleClick(pr)}
                      onContextMenu={(e) => handleContextMenu(e, 'pr', pr)}
                    >
                      <div className="item-main">
                        <span className="item-name" title={pr.title}>{pr.title}</span>
                        <div className="item-badges">
                          {pr.isDraft && <span className="badge badge-draft">draft</span>}
                          {getReviewBadge(pr.reviewDecision)}
                        </div>
                      </div>
                      <div className="pr-branch">
                        <span className="pr-branch-name">{pr.branch}</span>
                        <span className="pr-arrow">→</span>
                        <span className="pr-base">{pr.baseBranch}</span>
                      </div>
                      <div className="item-meta">
                        <code className="commit-hash">#{pr.number}</code>
                        <span className="pr-author">@{pr.author}</span>
                        <span className="pr-time">{formatRelativeTime(pr.updatedAt)}</span>
                        {pr.comments > 0 && (
                          <span className="pr-comments">💬 {pr.comments}</span>
                        )}
                        <span className="pr-diff">
                          <span className="pr-additions">+{pr.additions}</span>
                          <span className="pr-deletions">-{pr.deletions}</span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Worktrees Column */}
          <section className="column worktrees-column">
            <div 
              className={`column-header clickable-header ${worktreeControlsOpen ? 'open' : ''}`}
              onClick={() => setWorktreeControlsOpen(!worktreeControlsOpen)}
            >
              <div className="column-title">
                <h2>
                  <span className="column-icon">⧉</span>
                  Worktrees
                </h2>
                <span className={`header-chevron ${worktreeControlsOpen ? 'open' : ''}`}>▾</span>
              </div>
              <span className="count-badge">{filteredWorktrees.length}</span>
            </div>
            {worktreeControlsOpen && (
              <div className="column-controls" onClick={(e) => e.stopPropagation()}>
                <div className="control-group">
                  <label>Filter</label>
                  <select 
                    value={worktreeParentFilter} 
                    onChange={(e) => setWorktreeParentFilter(e.target.value)}
                    className="control-select"
                  >
                    <option value="all">All</option>
                    <option value="today">Today</option>
                    {worktreeParents.map(parent => (
                      <option key={parent} value={parent}>{parent}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="column-content">
              {filteredWorktrees.length === 0 ? (
                <div className="empty-column">
                  {worktreeParentFilter !== 'all' ? 'No worktrees match filter' : 'No worktrees found'}
                </div>
              ) : (
                <ul className="item-list">
                  {filteredWorktrees.map((wt) => (
                    <li
                      key={wt.path}
                      className={`item worktree-item clickable ${wt.branch === currentBranch ? 'current' : ''}`}
                      onDoubleClick={() => handleWorktreeDoubleClick(wt)}
                      onContextMenu={(e) => handleContextMenu(e, 'worktree', wt)}
                    >
                      <div className="item-main">
                        <span className="item-name">{wt.displayName}</span>
                        {wt.branch === currentBranch && <span className="current-indicator">●</span>}
                      </div>
                      <div className="item-path" title={wt.path}>
                        {wt.path.replace(/^\/Users\/[^/]+/, '~')}
                      </div>
                      <div className="item-meta worktree-stats">
                        <code className="commit-hash">{wt.path.split('/').pop()}</code>
                        {(wt.additions > 0 || wt.deletions > 0) && (
                          <>
                            {wt.additions > 0 && <span className="diff-additions">+{wt.additions}</span>}
                            {wt.deletions > 0 && <span className="diff-deletions">-{wt.deletions}</span>}
                            <span className="diff-separator">·</span>
                          </>
                        )}
                        {wt.changedFileCount > 0 && (
                          <span className="file-count">{wt.changedFileCount} {wt.changedFileCount === 1 ? 'file' : 'files'}</span>
                        )}
                        {wt.changedFileCount === 0 && <span className="clean-indicator">clean</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Commits Timeline Column */}
          <section className="column commits-column">
            <div className="column-header">
              <h2>
                <span className="column-icon">◉</span>
                Commits
                {currentBranch && <code className="commit-hash branch-badge">{currentBranch}</code>}
              </h2>
              <span className="count-badge">{commits.length}</span>
            </div>
            <div className="column-content">
              {/* Uncommitted changes as virtual commit */}
              {workingStatus?.hasChanges && (
                <div className="commit-item uncommitted">
                  <div className="commit-message uncommitted-label">
                    Uncommitted changes
                  </div>
                  <div className="commit-meta">
                    <code className="commit-hash">working</code>
                    <span className="commit-files-count">
                      {workingStatus.stagedCount + workingStatus.unstagedCount} {workingStatus.stagedCount + workingStatus.unstagedCount === 1 ? 'file' : 'files'}
                    </span>
                    {(workingStatus.additions > 0 || workingStatus.deletions > 0) && (
                      <span className="commit-diff">
                        {workingStatus.additions > 0 && <span className="diff-additions">+{workingStatus.additions}</span>}
                        {workingStatus.deletions > 0 && <span className="diff-deletions">-{workingStatus.deletions}</span>}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {/* Actual commits */}
              {commits.length === 0 && !workingStatus?.hasChanges ? (
                <div className="empty-column">No commits found</div>
              ) : (
                commits.map((commit) => (
                  <div 
                    key={commit.hash} 
                    className={`commit-item ${commit.isMerge ? 'merge' : ''} ${switching ? 'disabled' : ''}`}
                    onDoubleClick={() => handleCommitDoubleClick(commit)}
                    onContextMenu={(e) => handleContextMenu(e, 'commit', commit)}
                  >
                    <div className="commit-message" title={commit.message}>
                      {commit.message}
                    </div>
                    <div className="commit-meta">
                      <code className="commit-hash">{commit.shortHash}</code>
                      <span className="commit-author">{commit.author}</span>
                      <span className="commit-date">{formatRelativeTime(commit.date)}</span>
                      {(commit.additions !== undefined || commit.deletions !== undefined) && (
                        <span className="commit-diff">
                          {commit.additions !== undefined && commit.additions > 0 && <span className="diff-additions">+{commit.additions}</span>}
                          {commit.deletions !== undefined && commit.deletions > 0 && <span className="diff-deletions">-{commit.deletions}</span>}
                        </span>
                      )}
                      {commit.filesChanged !== undefined && commit.filesChanged > 0 && (
                        <span className="commit-files-count">{commit.filesChanged} {commit.filesChanged === 1 ? 'file' : 'files'}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Local Branches Column */}
          <section className="column branches-column">
            <div 
              className={`column-header clickable-header ${localControlsOpen ? 'open' : ''}`}
              onClick={() => setLocalControlsOpen(!localControlsOpen)}
            >
              <div className="column-title">
                <h2>
                  <span className="column-icon">⎇</span>
                  Local Branches
                </h2>
                <span className={`header-chevron ${localControlsOpen ? 'open' : ''}`}>▾</span>
              </div>
              <span className="count-badge">{localBranches.length}</span>
            </div>
            {localControlsOpen && (
              <div className="column-controls" onClick={(e) => e.stopPropagation()}>
                <div className="control-group">
                  <label>Filter</label>
                  <select 
                    value={localFilter} 
                    onChange={(e) => setLocalFilter(e.target.value as BranchFilter)}
                    className="control-select"
                  >
                    <option value="all">All</option>
                    <option value="local-only">Local Only</option>
                    <option value="unmerged">Unmerged</option>
                  </select>
                </div>
                <div className="control-group">
                  <label>Sort</label>
                  <select 
                    value={localSort} 
                    onChange={(e) => setLocalSort(e.target.value as BranchSort)}
                    className="control-select"
                  >
                    <option value="name">Name</option>
                    <option value="last-commit">Last Commit</option>
                    <option value="first-commit">First Commit</option>
                    <option value="most-commits">Most Commits</option>
                  </select>
                </div>
              </div>
            )}
            <div className="column-content">
              {localBranches.length === 0 ? (
                <div className="empty-column">
                  {localFilter !== 'all' ? 'No branches match filter' : 'No local branches'}
                </div>
              ) : (
                <ul className="item-list">
                  {localBranches.map((branch) => (
                    <li
                      key={branch.name}
                      className={`item branch-item clickable ${branch.current ? 'current' : ''} ${switching ? 'disabled' : ''}`}
                      onDoubleClick={() => handleBranchDoubleClick(branch)}
                      onContextMenu={(e) => handleContextMenu(e, 'local-branch', branch)}
                    >
                      <div className="item-main">
                        <span className="item-name">
                          {branch.current && <span className="arrow">→</span>}
                          {branch.name}
                        </span>
                        <div className="item-badges">
                          {branch.isLocalOnly && <span className="badge badge-local">local</span>}
                          {!branch.isMerged && <span className="badge badge-unmerged">unmerged</span>}
                          {branch.current && <span className="current-indicator">●</span>}
                        </div>
                      </div>
                      <div className="item-meta">
                        <code className="commit-hash">{branch.commit?.slice(0, 7)}</code>
                        {branch.lastCommitDate && (
                          <span className="date-info">{formatDate(branch.lastCommitDate)}</span>
                        )}
                        {branch.commitCount !== undefined && (
                          <span className="commit-count">{branch.commitCount} commits</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Remote Branches Column */}
          <section className="column remotes-column">
            <div 
              className={`column-header clickable-header ${remoteControlsOpen ? 'open' : ''}`}
              onClick={() => setRemoteControlsOpen(!remoteControlsOpen)}
            >
              <div className="column-title">
                <h2>
                  <span className="column-icon">☁</span>
                  Remote Branches
                </h2>
                <span className={`header-chevron ${remoteControlsOpen ? 'open' : ''}`}>▾</span>
              </div>
              <span className="count-badge">{remoteBranches.length}</span>
            </div>
            {remoteControlsOpen && (
              <div className="column-controls" onClick={(e) => e.stopPropagation()}>
                <div className="control-group">
                  <label>Filter</label>
                  <select 
                    value={remoteFilter} 
                    onChange={(e) => setRemoteFilter(e.target.value as BranchFilter)}
                    className="control-select"
                  >
                    <option value="all">All</option>
                    <option value="unmerged">Unmerged</option>
                  </select>
                </div>
                <div className="control-group">
                  <label>Sort</label>
                  <select 
                    value={remoteSort} 
                    onChange={(e) => setRemoteSort(e.target.value as BranchSort)}
                    className="control-select"
                  >
                    <option value="name">Name</option>
                    <option value="last-commit">Last Commit</option>
                    <option value="first-commit">First Commit</option>
                    <option value="most-commits">Most Commits</option>
                  </select>
                </div>
              </div>
            )}
            <div className="column-content">
              {remoteBranches.length === 0 ? (
                <div className="empty-column">
                  {remoteFilter !== 'all' ? 'No branches match filter' : 'No remote branches'}
                </div>
              ) : (
                <ul className="item-list">
                  {remoteBranches.map((branch) => (
                    <li 
                      key={branch.name} 
                      className={`item remote-item clickable ${switching ? 'disabled' : ''}`}
                      onDoubleClick={() => handleRemoteBranchDoubleClick(branch)}
                      onContextMenu={(e) => handleContextMenu(e, 'remote-branch', branch)}
                    >
                      <div className="item-main">
                        <span className="item-name">{branch.name.replace('remotes/', '').replace(/^origin\//, '')}</span>
                        <div className="item-badges">
                          {!branch.isMerged && <span className="badge badge-unmerged">unmerged</span>}
                        </div>
                      </div>
                      <div className="item-meta">
                        <code className="commit-hash">{branch.commit?.slice(0, 7)}</code>
                        {branch.lastCommitDate && (
                          <span className="date-info">{formatDate(branch.lastCommitDate)}</span>
                        )}
                        {branch.commitCount !== undefined && (
                          <span className="commit-count">{branch.commitCount} commits</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  )
}
