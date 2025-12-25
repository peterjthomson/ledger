import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { Branch, Worktree, BranchFilter, BranchSort, CheckoutResult, PullRequest, Commit, WorkingStatus } from './types/electron'
import './styles/app.css'

interface StatusMessage {
  type: 'success' | 'error' | 'info';
  message: string;
  stashed?: string;
}

type ContextMenuType = 'pr' | 'worktree' | 'local-branch' | 'remote-branch';

interface ContextMenu {
  type: ContextMenuType;
  x: number;
  y: number;
  data: PullRequest | Worktree | Branch;
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
  
  // Filter and sort state
  const [localFilter, setLocalFilter] = useState<BranchFilter>('all')
  const [localSort, setLocalSort] = useState<BranchSort>('name')
  const [remoteFilter, setRemoteFilter] = useState<BranchFilter>('all')
  const [remoteSort, setRemoteSort] = useState<BranchSort>('name')

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
      const [branchResult, worktreeResult, prResult, commitResult, statusResult] = await Promise.all([
        window.electronAPI.getBranchesWithMetadata(),
        window.electronAPI.getWorktrees(),
        window.electronAPI.getPullRequests(),
        window.electronAPI.getCommitHistory(15),
        window.electronAPI.getWorkingStatus(),
      ])

      if ('error' in branchResult) {
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
  const handleContextMenu = (e: React.MouseEvent, type: ContextMenuType, data: PullRequest | Worktree | Branch) => {
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
          { label: 'Open in Finder', action: () => handleWorktreeOpen(wt) },
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
    handleWorktreeOpen(worktree)
  }, [])

  const handlePRDoubleClick = useCallback(async (pr: PullRequest) => {
    handlePRViewRemote(pr)
  }, [])

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

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
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
          <h1 className="logo">
            <span className="logo-icon">◈</span>
            Ledger
          </h1>
          {repoPath && (
            <span className="repo-path" title={repoPath}>
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
            <div className="column-header">
              <h2>
                <span className="column-icon">⬡</span>
                Pull Requests
              </h2>
              <span className="count-badge">{pullRequests.length}</span>
            </div>
            <div className="column-content">
              {prError ? (
                <div className="empty-column pr-error">
                  <span className="pr-error-icon">⚠</span>
                  {prError}
                </div>
              ) : pullRequests.length === 0 ? (
                <div className="empty-column">No open PRs</div>
              ) : (
                <ul className="item-list">
                  {pullRequests.map((pr) => (
                    <li
                      key={pr.number}
                      className="item pr-item clickable"
                      onDoubleClick={() => handlePRDoubleClick(pr)}
                      onContextMenu={(e) => handleContextMenu(e, 'pr', pr)}
                    >
                      <div className="item-main">
                        <span className="pr-number">#{pr.number}</span>
                        <div className="item-badges">
                          {getReviewBadge(pr.reviewDecision)}
                        </div>
                      </div>
                      <div className="pr-title" title={pr.title}>
                        {pr.title}
                      </div>
                      <div className="pr-branch">
                        <span className="pr-branch-name">{pr.branch}</span>
                        <span className="pr-arrow">→</span>
                        <span className="pr-base">{pr.baseBranch}</span>
                      </div>
                      <div className="item-meta">
                        <span className="pr-author">@{pr.author}</span>
                        <span className="pr-time">{formatRelativeTime(pr.updatedAt)}</span>
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
            <div className="column-header">
              <h2>
                <span className="column-icon">📁</span>
                Worktrees
              </h2>
              <span className="count-badge">{worktrees.length}</span>
            </div>
            <div className="column-content">
              {worktrees.length === 0 ? (
                <div className="empty-column">No worktrees found</div>
              ) : (
                <ul className="item-list">
                  {worktrees.map((wt) => (
                    <li
                      key={wt.path}
                      className={`item worktree-item clickable ${wt.branch === currentBranch ? 'current' : ''}`}
                      onDoubleClick={() => handleWorktreeDoubleClick(wt)}
                      onContextMenu={(e) => handleContextMenu(e, 'worktree', wt)}
                    >
                      <div className="item-main">
                        <span className="item-name">{wt.branch || '(detached HEAD)'}</span>
                        {wt.branch === currentBranch && <span className="current-indicator">●</span>}
                      </div>
                      <div className="item-path" title={wt.path}>
                        {wt.path}
                      </div>
                      <div className="item-meta">
                        <code className="commit-hash">{wt.head?.slice(0, 7)}</code>
                        {wt.bare && <span className="bare-badge">bare</span>}
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
                <span className="column-icon">⦿</span>
                Commits
              </h2>
              <span className="count-badge">{commits.length}</span>
            </div>
            <div className="column-content">
              <div className="timeline">
                {/* Uncommitted changes as grey dot */}
                {workingStatus?.hasChanges && (
                  <div className="timeline-item uncommitted">
                    <div className="timeline-node">
                      <div className="timeline-dot uncommitted-dot" title="Uncommitted changes" />
                      <div className="timeline-line" />
                    </div>
                    <div className="timeline-content">
                      <div className="commit-message uncommitted-label">
                        Uncommitted changes
                      </div>
                      <div className="commit-meta">
                        <span className="commit-files">
                          {workingStatus.stagedCount > 0 && (
                            <span className="staged-count">{workingStatus.stagedCount} staged</span>
                          )}
                          {workingStatus.unstagedCount > 0 && (
                            <span className="unstaged-count">{workingStatus.unstagedCount} modified</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {/* Actual commits */}
                {commits.length === 0 && !workingStatus?.hasChanges ? (
                  <div className="empty-column">No commits found</div>
                ) : (
                  commits.map((commit, index) => (
                    <div 
                      key={commit.hash} 
                      className={`timeline-item ${commit.isMerge ? 'merge' : ''}`}
                    >
                      <div className="timeline-node">
                        <div 
                          className={`timeline-dot ${commit.isMerge ? 'merge-dot' : ''}`}
                          title={commit.hash}
                        />
                        {index < commits.length - 1 && <div className="timeline-line" />}
                      </div>
                      <div className="timeline-content">
                        <div className="commit-message" title={commit.message}>
                          {commit.message}
                        </div>
                        <div className="commit-meta">
                          <code className="commit-hash">{commit.shortHash}</code>
                          <span className="commit-author">{commit.author}</span>
                          <span className="commit-date">{formatRelativeTime(commit.date)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Local Branches Column */}
          <section className="column branches-column">
            <div className="column-header">
              <div className="column-title">
                <h2>
                  <span className="column-icon">⎇</span>
                  Local Branches
                </h2>
                <span className="count-badge">{localBranches.length}</span>
              </div>
            </div>
            <div className="column-controls">
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
            <div className="column-header">
              <div className="column-title">
                <h2>
                  <span className="column-icon">☁</span>
                  Remote Branches
                </h2>
                <span className="count-badge">{remoteBranches.length}</span>
              </div>
            </div>
            <div className="column-controls">
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
                        <span className="item-name">{branch.name.replace('remotes/', '')}</span>
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
