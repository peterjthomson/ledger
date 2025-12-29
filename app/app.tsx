import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type {
  Branch,
  Worktree,
  BranchFilter,
  BranchSort,
  CheckoutResult,
  PullRequest,
  Commit,
  WorkingStatus,
  PRFilter,
  PRSort,
  GraphCommit,
  CommitDiff,
  StashEntry,
} from './types/electron'
import type {
  ViewMode,
  MainPanelView,
  StatusMessage,
  ContextMenuType,
  ContextMenu,
  MenuItem,
  SidebarFocusType,
  SidebarFocus,
} from './types/app-types'
import './styles/app.css'
import { useWindowContext } from './components/window'
import { SettingsPanel } from './components/SettingsPanel'
import { GitGraph } from './components/panels/viz'
import {
  DiffPanel,
  StagingPanel,
  PRReviewPanel,
  SidebarDetailPanel,
} from './components/panels/editor'
import { initializeTheme, setThemeMode as applyThemeMode, getCurrentThemeMode, loadVSCodeTheme, type ThemeMode } from './theme'

export default function App() {
  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [currentBranch, setCurrentBranch] = useState<string>('')
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
  const [prError, setPrError] = useState<string | null>(null)
  const [_commits, setCommits] = useState<Commit[]>([])
  const [workingStatus, setWorkingStatus] = useState<WorkingStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [switching, setSwitching] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [showNewBranchModal, setShowNewBranchModal] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [githubUrl, setGithubUrl] = useState<string | null>(null)
  const [themeMode, setThemeMode] = useState<ThemeMode>('light')
  const { setTitle, setTitlebarActions } = useWindowContext()

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('radar')
  const [mainPanelView, setMainPanelView] = useState<MainPanelView>('history')

  // Focus mode state
  const [graphCommits, setGraphCommits] = useState<GraphCommit[]>([])
  const [selectedCommit, setSelectedCommit] = useState<GraphCommit | null>(null)
  const [commitDiff, setCommitDiff] = useState<CommitDiff | null>(null)
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [sidebarFocus, setSidebarFocus] = useState<SidebarFocus | null>(null)
  // History/Commits panel filters (shared between Radar and Focus modes)
  const [historyFilterOpen, setHistoryFilterOpen] = useState(false) // Focus mode filter panel
  const [radarCommitsFilterOpen, setRadarCommitsFilterOpen] = useState(false) // Radar mode filter panel
  const [showCheckpoints, setShowCheckpoints] = useState(false) // Hide Conductor checkpoints by default
  const [showGraphLines, setShowGraphLines] = useState(true) // Show git graph visualization (Focus mode only)
  const [onlyBranchHeads, setOnlyBranchHeads] = useState(false) // Show only commits that are branch HEADs
  const [onlyUnmergedBranches, setOnlyUnmergedBranches] = useState(false) // Show only commits from unmerged branches

  // Sidebar collapsed state
  const [sidebarSections, setSidebarSections] = useState({
    branches: true,
    remotes: false,
    worktrees: true,
    stashes: false,
    prs: true,
  })

  // Sidebar filter panels open state
  const [sidebarFiltersOpen, setSidebarFiltersOpen] = useState({
    prs: false,
    branches: false,
    remotes: false,
    worktrees: false,
  })

  // Filter and sort state
  const [localFilter, setLocalFilter] = useState<BranchFilter>('all')
  const [localSort, setLocalSort] = useState<BranchSort>('name')
  const [remoteFilter, setRemoteFilter] = useState<BranchFilter>('all')
  const [remoteSort, setRemoteSort] = useState<BranchSort>('name')
  const [prFilter, setPrFilter] = useState<PRFilter>('open-not-draft')
  const [prSort, setPrSort] = useState<PRSort>('updated')

  // Search state for Radar mode columns
  const [prSearch, setPrSearch] = useState('')
  const [localBranchSearch, setLocalBranchSearch] = useState('')
  const [remoteBranchSearch, setRemoteBranchSearch] = useState('')
  const [worktreeSearch, setWorktreeSearch] = useState('')

  // Collapsible controls state
  const [prControlsOpen, setPrControlsOpen] = useState(false)
  const [localControlsOpen, setLocalControlsOpen] = useState(false)
  const [remoteControlsOpen, setRemoteControlsOpen] = useState(false)
  const [worktreeControlsOpen, setWorktreeControlsOpen] = useState(false)

  // Worktree filter state
  const [worktreeParentFilter, setWorktreeParentFilter] = useState<string>('all')

  // Focus view panel state (resizable + collapsible)
  const [sidebarWidth, setSidebarWidth] = useState(220)
  const [detailWidth, setDetailWidth] = useState(400)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [mainVisible, setMainVisible] = useState(true)
  const [detailVisible, setDetailVisible] = useState(true)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [isResizingDetail, setIsResizingDetail] = useState(false)

  // Radar view column order (drag-and-drop)
  const [radarColumnOrder, setRadarColumnOrder] = useState<string[]>([
    'prs',
    'worktrees',
    'commits',
    'branches',
    'remotes',
  ])
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

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

  // Handle panel resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = Math.max(100, e.clientX)
        setSidebarWidth(newWidth)
      }
      if (isResizingDetail) {
        const newWidth = Math.max(200, window.innerWidth - e.clientX)
        setDetailWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizingSidebar(false)
      setIsResizingDetail(false)
    }

    if (isResizingSidebar || isResizingDetail) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingSidebar, isResizingDetail])

  // Titlebar actions for Focus mode panel toggles and settings button
  useEffect(() => {
    const actions: JSX.Element[] = []

    // Add Focus mode panel toggles if in focus mode with a repo
    if (repoPath && viewMode === 'focus') {
      actions.push(
        <button
          key="sidebar-toggle"
          className="panel-toggle-btn"
          onClick={() => setSidebarVisible(!sidebarVisible)}
          title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor" strokeWidth="1" />
            <rect x="1" y="1" width="4" height="14" fill={sidebarVisible ? 'currentColor' : 'none'} />
          </svg>
        </button>,
        <button
          key="main-toggle"
          className="panel-toggle-btn"
          onClick={() => setMainVisible(!mainVisible)}
          title={mainVisible ? 'Hide main panel' : 'Show main panel'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor" strokeWidth="1" />
            <rect x="5" y="1" width="6" height="14" fill={mainVisible ? 'currentColor' : 'none'} />
          </svg>
        </button>,
        <button
          key="detail-toggle"
          className="panel-toggle-btn"
          onClick={() => setDetailVisible(!detailVisible)}
          title={detailVisible ? 'Hide detail panel' : 'Show detail panel'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor" strokeWidth="1" />
            <rect x="11" y="1" width="4" height="14" fill={detailVisible ? 'currentColor' : 'none'} />
          </svg>
        </button>
      )
    }

    // Always add settings button
    const isSettingsActive = viewMode === 'focus' && mainPanelView === 'settings'
    actions.push(
      <button
        key="settings"
        className={`panel-toggle-btn ${isSettingsActive ? 'active' : ''}`}
        onClick={() => {
          if (viewMode === 'radar') {
            // Switch to Focus mode with Settings panel
            setViewMode('focus')
            setMainPanelView('settings')
            setMainVisible(true)
          } else {
            // Toggle between history and settings in Focus mode
            setMainPanelView(mainPanelView === 'settings' ? 'history' : 'settings')
            setMainVisible(true)
          }
        }}
        title="Settings"
        style={{ cursor: 'pointer' }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1" fill="none" />
          <path
            d="M8 1 L8.5 3 L9.5 3.5 L11.5 2.5 L13 4 L12 6 L12.5 7 L14.5 7.5 L14.5 8.5 L12.5 9 L12 10 L13 12 L11.5 13.5 L9.5 12.5 L8.5 13 L8 15 L7.5 15 L7 13 L6 12.5 L4 13.5 L2.5 12 L3.5 10 L3 9 L1 8.5 L1 7.5 L3 7 L3.5 6 L2.5 4 L4 2.5 L6 3.5 L7 3 L7.5 1 Z"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
        </svg>
      </button>
    )

    setTitlebarActions(actions.length > 0 ? <>{actions}</> : null)
  }, [repoPath, viewMode, mainPanelView, sidebarVisible, mainVisible, detailVisible, setTitlebarActions])

  // Column drag and drop handlers for Radar view
  const handleColumnDragStart = useCallback((e: React.DragEvent, columnId: string) => {
    setDraggingColumn(columnId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', columnId)
  }, [])

  const handleColumnDragOver = useCallback(
    (e: React.DragEvent, columnId: string) => {
      e.preventDefault()
      if (draggingColumn && draggingColumn !== columnId) {
        setDragOverColumn(columnId)
      }
    },
    [draggingColumn]
  )

  const handleColumnDragLeave = useCallback(() => {
    setDragOverColumn(null)
  }, [])

  const handleColumnDrop = useCallback(
    (e: React.DragEvent, targetColumnId: string) => {
      e.preventDefault()
      if (!draggingColumn || draggingColumn === targetColumnId) return

      setRadarColumnOrder((prev) => {
        const newOrder = [...prev]
        const dragIndex = newOrder.indexOf(draggingColumn)
        const targetIndex = newOrder.indexOf(targetColumnId)
        newOrder.splice(dragIndex, 1)
        newOrder.splice(targetIndex, 0, draggingColumn)
        return newOrder
      })
      setDraggingColumn(null)
      setDragOverColumn(null)
    },
    [draggingColumn]
  )

  const handleColumnDragEnd = useCallback(() => {
    setDraggingColumn(null)
    setDragOverColumn(null)
  }, [])

  const selectRepo = async () => {
    const path = await window.electronAPI.selectRepo()
    if (path) {
      // Clear state before switching to prevent stale data mixing with new repo
      setWorktrees([])
      setBranches([])
      setCommits([])
      setPullRequests([])
      setWorkingStatus(null)
      setRepoPath(path)
      await refresh()
    }
  }

  const refresh = async () => {
    setLoading(true)
    setError(null)
    setPrError(null)

    try {
      // Phase 1: Fast initial load - basic data without expensive per-item metadata
      // Uses getBranchesBasic() instead of getBranchesWithMetadata() (saves 600+ git commands)
      // Uses getCommitGraphHistory with skipStats=true (saves 100 git commands)
      const [branchResult, worktreeResult, prResult, commitResult, statusResult, ghUrl, graphResult, stashResult] =
        await Promise.all([
          window.electronAPI.getBranchesBasic(),
          window.electronAPI.getWorktrees(),
          window.electronAPI.getPullRequests(),
          window.electronAPI.getCommitHistory(15),
          window.electronAPI.getWorkingStatus(),
          window.electronAPI.getGitHubUrl(),
          window.electronAPI.getCommitGraphHistory(100, true, showCheckpoints), // skipStats for fast load
          window.electronAPI.getStashes(),
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
      setGraphCommits(graphResult)
      setStashes(stashResult)

      // Phase 2: Deferred metadata loading in background
      // This loads detailed branch metadata (commit counts, dates) after initial render
      window.electronAPI
        .getBranchesWithMetadata()
        .then((metaResult) => {
          if (!('error' in metaResult)) {
            setBranches(metaResult.branches)
          }
        })
        .catch(() => {
          // Silently ignore - we already have basic branch data
        })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Fetch diff when a commit is selected
  const handleSelectCommit = useCallback(async (commit: GraphCommit) => {
    setSidebarFocus(null) // Clear sidebar focus when selecting a commit
    setSelectedCommit(commit)
    setLoadingDiff(true)
    try {
      const diff = await window.electronAPI.getCommitDiff(commit.hash)
      setCommitDiff(diff)
    } catch (_err) {
      setCommitDiff(null)
    } finally {
      setLoadingDiff(false)
    }
  }, [])

  // Handle sidebar item focus (single click)
  const handleSidebarFocus = useCallback(
    (type: SidebarFocusType, data: PullRequest | Branch | Worktree | StashEntry | WorkingStatus) => {
      setSelectedCommit(null) // Clear commit selection when focusing sidebar item
      setCommitDiff(null)
      setSidebarFocus({ type, data })
    },
    []
  )

  // Toggle sidebar section
  const toggleSidebarSection = useCallback((section: keyof typeof sidebarSections) => {
    setSidebarSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }, [])

  // Toggle sidebar filter panel
  const toggleSidebarFilter = useCallback((section: keyof typeof sidebarFiltersOpen) => {
    setSidebarFiltersOpen((prev) => ({ ...prev, [section]: !prev[section] }))
  }, [])

  // Radar card double-click handlers - switch to Focus mode with item selected
  const handleRadarPRClick = useCallback(
    (pr: PullRequest) => {
      setViewMode('focus')
      setSidebarSections((prev) => ({ ...prev, prs: true }))
      handleSidebarFocus('pr', pr)
    },
    [handleSidebarFocus]
  )

  const handleRadarWorktreeClick = useCallback(
    (wt: Worktree) => {
      setViewMode('focus')
      setSidebarSections((prev) => ({ ...prev, worktrees: true }))
      handleSidebarFocus('worktree', wt)
    },
    [handleSidebarFocus]
  )

  const handleRadarBranchClick = useCallback(
    (branch: Branch) => {
      setViewMode('focus')
      setSidebarSections((prev) => ({ ...prev, branches: true }))
      handleSidebarFocus('branch', branch)
    },
    [handleSidebarFocus]
  )

  const handleRadarRemoteBranchClick = useCallback(
    (branch: Branch) => {
      setViewMode('focus')
      setSidebarSections((prev) => ({ ...prev, remotes: true }))
      handleSidebarFocus('remote', branch)
    },
    [handleSidebarFocus]
  )

  const handleRadarCommitClick = useCallback(
    (commit: Commit) => {
      setViewMode('focus')
      // Find the matching GraphCommit by hash and select it
      const graphCommit = graphCommits.find((gc) => gc.hash === commit.hash)
      if (graphCommit) {
        handleSelectCommit(graphCommit)
      }
    },
    [graphCommits, handleSelectCommit]
  )

  const handleRadarUncommittedClick = useCallback(() => {
    if (!workingStatus) return
    setViewMode('focus')
    setSidebarSections((prev) => ({ ...prev, branches: true }))
    handleSidebarFocus('uncommitted', workingStatus)
  }, [workingStatus, handleSidebarFocus])

  // Context menu handlers
  const handleContextMenu = (
    e: React.MouseEvent,
    type: ContextMenuType,
    data: PullRequest | Worktree | Branch | Commit | WorkingStatus
  ) => {
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
      const result = await window.electronAPI.checkoutPRBranch(pr.number)
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

  const handleWorktreeConvertToBranch = async (wt: Worktree) => {
    closeContextMenu()
    if (switching) return

    setSwitching(true)
    const folderName = wt.path.split('/').pop() || 'worktree'
    setStatus({ type: 'info', message: `Converting ${folderName} to branch...` })

    try {
      const result = await window.electronAPI.convertWorktreeToBranch(wt.path)
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

  // Push local branch to remote
  const handleLocalBranchPush = async (branch: Branch) => {
    closeContextMenu()
    setStatus({ type: 'info', message: `Pushing ${branch.name} to remote...` })

    try {
      const result = await window.electronAPI.pushBranch(branch.name, true)
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

  // Pull local branch from remote
  const handleLocalBranchPull = async (branch: Branch) => {
    closeContextMenu()
    setStatus({ type: 'info', message: `Pulling ${branch.name} from remote...` })

    try {
      // Construct the remote branch path (assumes origin as default remote)
      const remoteBranch = `origin/${branch.name}`
      const result = await window.electronAPI.pullBranch(remoteBranch)
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
          {
            label: 'Open in Focus',
            action: () => {
              closeContextMenu()
              handleRadarPRClick(pr)
            },
          },
          { label: 'Check Out', action: () => handlePRCheckout(pr), disabled: switching },
          { label: 'View Remote', action: () => handlePRViewRemote(pr) },
        ]
      }
      case 'worktree': {
        const wt = contextMenu.data as Worktree
        const hasChanges = wt.changedFileCount > 0 || wt.additions > 0 || wt.deletions > 0
        const isWorkingFolder = wt.agent === 'working-folder'

        if (isWorkingFolder) {
          // Working folder has different actions - you're already here!
          return [
            {
              label: 'Open in Focus',
              action: () => {
                closeContextMenu()
                handleRadarWorktreeClick(wt)
              },
            },
            { label: 'Open in Finder', action: () => handleWorktreeOpen(wt) },
          ]
        }

        // Different actions based on whether worktree has a branch
        const actions: MenuItem[] = [
          {
            label: 'Open in Focus',
            action: () => {
              closeContextMenu()
              handleRadarWorktreeClick(wt)
            },
          },
        ]

        if (wt.branch) {
          // Worktree has a branch - offer to checkout
          actions.push({
            label: 'Check Out Worktree',
            action: () => handleWorktreeDoubleClick(wt),
            disabled: wt.branch === currentBranch || switching,
          })
        } else {
          // Detached HEAD - offer to rescue with Create Branch
          actions.push({
            label: 'Create Branch (Rescue)',
            action: () => handleWorktreeConvertToBranch(wt),
            disabled: !hasChanges || switching,
          })
        }

        actions.push({ label: 'Open in Finder', action: () => handleWorktreeOpen(wt) })

        return actions
      }
      case 'local-branch': {
        const branch = contextMenu.data as Branch
        return [
          {
            label: 'Open in Focus',
            action: () => {
              closeContextMenu()
              handleRadarBranchClick(branch)
            },
          },
          {
            label: 'Switch to Latest Commit',
            action: () => handleLocalBranchSwitch(branch),
            disabled: branch.current || switching,
          },
          { label: 'Pull from Remote', action: () => handleLocalBranchPull(branch) },
          { label: 'Push to Remote', action: () => handleLocalBranchPush(branch) },
        ]
      }
      case 'remote-branch': {
        const branch = contextMenu.data as Branch
        return [
          {
            label: 'Open in Focus',
            action: () => {
              closeContextMenu()
              handleRadarRemoteBranchClick(branch)
            },
          },
          { label: 'Check Out', action: () => handleRemoteBranchDoubleClick(branch), disabled: switching },
          { label: 'Pull', action: () => handleRemoteBranchPull(branch) },
          { label: 'View Remote', action: () => handleRemoteBranchViewGitHub(branch) },
        ]
      }
      case 'commit': {
        const commit = contextMenu.data as Commit
        return [
          {
            label: 'Open in Focus',
            action: () => {
              closeContextMenu()
              handleRadarCommitClick(commit)
            },
          },
          { label: 'Check Out', action: () => handleCommitDoubleClick(commit), disabled: switching },
          { label: 'Reset to This Commit', action: () => handleCommitReset(commit), disabled: switching },
        ]
      }
      case 'uncommitted': {
        return [
          {
            label: 'Open in Focus',
            action: () => {
              closeContextMenu()
              handleRadarUncommittedClick()
            },
          },
        ]
      }
      default:
        return []
    }
  }

  // Double-click handlers (keep for convenience)
  const handleBranchDoubleClick = useCallback(
    async (branch: Branch) => {
      if (branch.current || switching) return
      handleLocalBranchSwitch(branch)
    },
    [switching]
  )

  // Create a new branch
  const handleCreateBranch = useCallback(async () => {
    if (!newBranchName.trim() || creatingBranch) return

    setCreatingBranch(true)
    setStatus({ type: 'info', message: `Creating branch '${newBranchName}'...` })

    try {
      const result = await window.electronAPI.createBranch(newBranchName.trim(), true)
      if (result.success) {
        setStatus({ type: 'success', message: result.message })
        setShowNewBranchModal(false)
        setNewBranchName('')
        await refresh()
      } else {
        setStatus({ type: 'error', message: result.message })
      }
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message })
    } finally {
      setCreatingBranch(false)
    }
  }, [newBranchName, creatingBranch, refresh])

  const handleRemoteBranchDoubleClick = useCallback(
    async (branch: Branch) => {
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
    },
    [switching]
  )

  const handleWorktreeDoubleClick = useCallback(
    async (worktree: Worktree) => {
      if (!worktree.branch || worktree.branch === currentBranch || switching) return

      setSwitching(true)
      setStatus({ type: 'info', message: `Checking out worktree ${worktree.displayName}...` })

      try {
        const result: CheckoutResult = await window.electronAPI.checkoutBranch(worktree.branch)
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
    },
    [currentBranch, switching]
  )

  const handlePRDoubleClick = useCallback(async (pr: PullRequest) => {
    handlePRViewRemote(pr)
  }, [])

  const handleCommitDoubleClick = useCallback(
    async (commit: Commit) => {
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
    },
    [switching]
  )

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

  // Initialize theme on app mount
  useEffect(() => {
    if (!window.electronAPI) return
    initializeTheme().catch(console.error)
    getCurrentThemeMode().then(setThemeMode).catch(console.error)
  }, [])

  // Theme change handler
  const handleThemeChange = useCallback(
    async (newMode: ThemeMode) => {
      try {
        if (newMode === 'custom') {
          const theme = await loadVSCodeTheme()
          if (theme) {
            setThemeMode('custom')
          }
        } else {
          await applyThemeMode(newMode)
          setThemeMode(newMode)
        }
      } catch (error) {
        console.error('Failed to change theme:', error)
        setStatus({ type: 'error', message: 'Failed to change theme' })
      }
    },
    []
  )

  // Filter and sort functions
  const filterBranches = (branchList: Branch[], filter: BranchFilter): Branch[] => {
    switch (filter) {
      case 'local-only':
        return branchList.filter((b) => b.isLocalOnly)
      case 'unmerged':
        // Always include master/main even if merged (they're never really "merged away")
        return branchList.filter((b) => {
          const baseName = b.name.replace('remotes/', '').replace(/^origin\//, '')
          const isMainBranch = baseName === 'main' || baseName === 'master'
          return !b.isMerged || isMainBranch
        })
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
    let filtered = filterBranches(local, localFilter)
    // Apply search filter
    if (localBranchSearch.trim()) {
      const search = localBranchSearch.toLowerCase().trim()
      filtered = filtered.filter((b) => b.name.toLowerCase().includes(search))
    }
    return sortBranches(filtered, localSort)
  }, [branches, localFilter, localSort, localBranchSearch])

  const remoteBranches = useMemo(() => {
    const remote = branches.filter((b) => b.isRemote)
    let filtered = filterBranches(remote, remoteFilter)
    // Apply search filter
    if (remoteBranchSearch.trim()) {
      const search = remoteBranchSearch.toLowerCase().trim()
      filtered = filtered.filter((b) => b.name.toLowerCase().includes(search))
    }
    return sortBranches(filtered, remoteSort)
  }, [branches, remoteFilter, remoteSort, remoteBranchSearch])

  // Create the "Working Folder" pseudo-worktree representing the main repo folder
  // This helps users understand they're already using worktrees conceptually
  const workingFolderWorktree: Worktree | null = useMemo(() => {
    if (!repoPath) return null

    // Get repo name from path (last segment)
    const repoName = repoPath.split('/').pop() || 'Repository'

    return {
      path: repoPath,
      head: '', // Will show current commit
      branch: currentBranch || null,
      bare: false,
      agent: 'working-folder' as const,
      agentIndex: 1,
      contextHint: repoName,
      displayName: `Working Folder`,
      changedFileCount: workingStatus?.files.length ?? 0,
      additions: workingStatus?.additions ?? 0,
      deletions: workingStatus?.deletions ?? 0,
      lastModified: new Date().toISOString(),
      activityStatus: 'active' as const, // Working folder is always "active"
      agentTaskHint: null, // No agent task for working folder
    }
  }, [repoPath, currentBranch, workingStatus])

  // Extract unique parent folders from worktrees
  const worktreeParents = useMemo(() => {
    const parents = new Set<string>()
    // Always include 'main' since working folder is always there
    if (repoPath) parents.add('main')

    for (const wt of worktrees) {
      // Extract parent folder from path (e.g., ~/.cursor/worktrees/xxx -> .cursor)
      const pathParts = wt.path.split('/')
      // Find known agent folders like .cursor, .claude, conductor, etc.
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i]
        // Check for dot folders (.cursor, .claude, etc.)
        if (
          part.startsWith('.') &&
          ['cursor', 'claude', 'gemini', 'junie'].some((a) => part.toLowerCase().includes(a))
        ) {
          parents.add(part)
          break
        }
        // Check for Conductor workspaces (~/conductor/workspaces/)
        if (part === 'conductor' && pathParts[i + 1] === 'workspaces') {
          parents.add('conductor')
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

  // Filter worktrees by parent and search
  const filteredWorktrees = useMemo(() => {
    // Filter out the main repo worktree since we show it as "Working Folder" pseudo-entry
    let filtered = worktrees.filter((wt) => wt.path !== repoPath)

    // Apply parent filter
    if (worktreeParentFilter !== 'all') {
      filtered = filtered.filter((wt) => {
        if (worktreeParentFilter === 'main') {
          return repoPath && wt.path.startsWith(repoPath)
        }
        return wt.path.includes(`/${worktreeParentFilter}/`)
      })
    }

    // Apply search filter
    if (worktreeSearch.trim()) {
      const search = worktreeSearch.toLowerCase().trim()
      filtered = filtered.filter(
        (wt) => wt.displayName.toLowerCase().includes(search) || (wt.branch && wt.branch.toLowerCase().includes(search))
      )
    }

    // Prepend the working folder pseudo-worktree
    // It should appear first and match the 'main' filter
    if (workingFolderWorktree) {
      const matchesParentFilter = worktreeParentFilter === 'all' || worktreeParentFilter === 'main'
      const matchesSearch =
        !worktreeSearch.trim() ||
        workingFolderWorktree.displayName.toLowerCase().includes(worktreeSearch.toLowerCase().trim()) ||
        (workingFolderWorktree.branch &&
          workingFolderWorktree.branch.toLowerCase().includes(worktreeSearch.toLowerCase().trim()))

      if (matchesParentFilter && matchesSearch) {
        filtered = [workingFolderWorktree, ...filtered]
      }
    }

    return filtered
  }, [worktrees, worktreeParentFilter, repoPath, worktreeSearch, workingFolderWorktree])

  // Filter and sort PRs
  const filteredPRs = useMemo(() => {
    let filtered = [...pullRequests]

    // Apply filter
    switch (prFilter) {
      case 'open-not-draft':
        filtered = filtered.filter((pr) => !pr.isDraft)
        break
      case 'open-draft':
        filtered = filtered.filter((pr) => pr.isDraft)
        break
      case 'all':
      default:
        break
    }

    // Apply search filter
    if (prSearch.trim()) {
      const search = prSearch.toLowerCase().trim()
      filtered = filtered.filter(
        (pr) =>
          pr.title.toLowerCase().includes(search) ||
          pr.branch.toLowerCase().includes(search) ||
          pr.author.toLowerCase().includes(search)
      )
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
  }, [pullRequests, prFilter, prSort, prSearch])

  // Filter graph commits based on history panel filters
  const filteredGraphCommits = useMemo(() => {
    let filtered = graphCommits

    // Filter to only branch heads (commits with refs that are branches)
    if (onlyBranchHeads) {
      filtered = filtered.filter((commit) => {
        // Keep commits that have branch refs (not just tags)
        return commit.refs.some((ref) => {
          const cleanRef = ref.replace('HEAD -> ', '')
          // It's a branch if it's not a tag and doesn't look like a tag (v1.0.0 etc)
          return !cleanRef.startsWith('tag:') && !cleanRef.match(/^v?\d+\.\d+/)
        })
      })
    }

    // Filter to only unmerged branches
    if (onlyUnmergedBranches) {
      // Get list of unmerged branch names from the branches data
      const unmergedBranchNames = new Set(
        branches.filter((b) => !b.isMerged).map((b) => b.name.replace('remotes/origin/', '').replace('origin/', ''))
      )
      // Also add the branch without origin/ prefix
      branches
        .filter((b) => !b.isMerged)
        .forEach((b) => {
          unmergedBranchNames.add(b.name)
        })

      filtered = filtered.filter((commit) => {
        // Keep commits that are on unmerged branches (via refs)
        return commit.refs.some((ref) => {
          const cleanRef = ref.replace('HEAD -> ', '').replace('origin/', '')
          return unmergedBranchNames.has(cleanRef)
        })
      })
    }

    return filtered
  }, [graphCommits, onlyBranchHeads, onlyUnmergedBranches, branches])

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
        <div ref={menuRef} className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
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

      {/* New Branch Modal */}
      {showNewBranchModal && (
        <div className="modal-overlay" onClick={() => setShowNewBranchModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create New Branch</h3>
              <button className="modal-close" onClick={() => setShowNewBranchModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <label className="modal-label">
                Branch name
                <input
                  type="text"
                  className="modal-input"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="feature/my-new-feature"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newBranchName.trim()) {
                      handleCreateBranch()
                    } else if (e.key === 'Escape') {
                      setShowNewBranchModal(false)
                    }
                  }}
                />
              </label>
              <p className="modal-hint">Branch will be created from current HEAD and checked out</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewBranchModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || creatingBranch}
              >
                {creatingBranch ? 'Creating...' : 'Create Branch'}
              </button>
            </div>
          </div>
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
            {status.stashed && <span className="status-stash">Stashed: {status.stashed}</span>}
          </div>
          <button className="status-dismiss" onClick={() => setStatus(null)}>
            ×
          </button>
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
          {repoPath && (
            <div className="view-toggle">
              <button
                className={`view-toggle-btn ${viewMode === 'radar' ? 'active' : ''}`}
                onClick={() => setViewMode('radar')}
                title="Radar Mode"
              >
                <span className="view-icon">⊞</span>
                <span className="view-label">Radar</span>
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'focus' ? 'active' : ''}`}
                onClick={() => setViewMode('focus')}
                title="Focus Mode"
              >
                <span className="view-icon">☰</span>
                <span className="view-label">Focus</span>
              </button>
            </div>
          )}
          {!repoPath ? (
            <button onClick={selectRepo} className="btn btn-secondary">
              <svg
                className="btn-icon-svg"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1.5 3.5a1 1 0 0 1 1-1h3.59a1 1 0 0 1 .7.3l1.42 1.4h5.29a1 1 0 0 1 1 1v7.3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9z" />
              </svg>
              Select Repository
            </button>
          ) : (
            <div className="view-toggle">
              <button onClick={selectRepo} className="view-toggle-btn" title="Change Repository">
                <svg
                  className="view-icon-svg"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1.5 3.5a1 1 0 0 1 1-1h3.59a1 1 0 0 1 .7.3l1.42 1.4h5.29a1 1 0 0 1 1 1v7.3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9z" />
                </svg>
                <span className="view-label">Change</span>
              </button>
              <button
                onClick={refresh}
                disabled={loading || switching}
                className="view-toggle-btn active"
                title="Refresh"
              >
                <span className={`view-icon ${loading || switching ? 'spinning' : ''}`}>↻</span>
                <span className="view-label">{loading ? 'Loading' : switching ? 'Switching' : 'Refresh'}</span>
              </button>
            </div>
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
            <svg
              className="btn-icon-svg"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1.5 3.5a1 1 0 0 1 1-1h3.59a1 1 0 0 1 .7.3l1.42 1.4h5.29a1 1 0 0 1 1 1v7.3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9z" />
            </svg>
            Select Repository
          </button>
        </div>
      )}

      {/* Main Content */}
      {repoPath && !error && viewMode === 'radar' && (
        <main className="ledger-content five-columns">
          {/* Pull Requests Column */}
          <section
            className={`column pr-column ${draggingColumn === 'prs' ? 'dragging' : ''} ${dragOverColumn === 'prs' ? 'drag-over' : ''}`}
            style={{ order: radarColumnOrder.indexOf('prs') }}
            draggable
            onDragStart={(e) => handleColumnDragStart(e, 'prs')}
            onDragOver={(e) => handleColumnDragOver(e, 'prs')}
            onDragLeave={handleColumnDragLeave}
            onDrop={(e) => handleColumnDrop(e, 'prs')}
            onDragEnd={handleColumnDragEnd}
          >
            <div className="column-drag-handle" title="Drag to reorder">
              ⋮⋮
            </div>
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
                <div className="control-row">
                  <label>Search</label>
                  <input
                    type="text"
                    className="control-search"
                    placeholder="Title, branch, author..."
                    value={prSearch}
                    onChange={(e) => setPrSearch(e.target.value)}
                  />
                </div>
                <div className="control-row">
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
                <div className="control-row">
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
                  {prSearch.trim() || prFilter !== 'all' ? 'No PRs match filter' : 'No open PRs'}
                </div>
              ) : (
                <ul className="item-list">
                  {filteredPRs.map((pr) => (
                    <li
                      key={pr.number}
                      className={`item pr-item clickable ${pr.isDraft ? 'draft' : ''}`}
                      onDoubleClick={() => handleRadarPRClick(pr)}
                      onContextMenu={(e) => handleContextMenu(e, 'pr', pr)}
                    >
                      <div className="item-main">
                        <span className="item-name" title={pr.title}>
                          {pr.title}
                        </span>
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
                        {pr.comments > 0 && <span className="pr-comments">💬 {pr.comments}</span>}
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
          <section
            className={`column worktrees-column ${draggingColumn === 'worktrees' ? 'dragging' : ''} ${dragOverColumn === 'worktrees' ? 'drag-over' : ''}`}
            style={{ order: radarColumnOrder.indexOf('worktrees') }}
            draggable
            onDragStart={(e) => handleColumnDragStart(e, 'worktrees')}
            onDragOver={(e) => handleColumnDragOver(e, 'worktrees')}
            onDragLeave={handleColumnDragLeave}
            onDrop={(e) => handleColumnDrop(e, 'worktrees')}
            onDragEnd={handleColumnDragEnd}
          >
            <div className="column-drag-handle" title="Drag to reorder">
              ⋮⋮
            </div>
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
                <div className="control-row">
                  <label>Search</label>
                  <input
                    type="text"
                    className="control-search"
                    placeholder="Name or branch..."
                    value={worktreeSearch}
                    onChange={(e) => setWorktreeSearch(e.target.value)}
                  />
                </div>
                <div className="control-row">
                  <label>Filter</label>
                  <select
                    value={worktreeParentFilter}
                    onChange={(e) => setWorktreeParentFilter(e.target.value)}
                    className="control-select"
                  >
                    <option value="all">All</option>
                    {worktreeParents.map((parent) => (
                      <option key={parent} value={parent}>
                        {parent}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="column-content">
              {filteredWorktrees.length === 0 ? (
                <div className="empty-column">
                  {worktreeSearch.trim() || worktreeParentFilter !== 'all'
                    ? 'No worktrees match filter'
                    : 'No worktrees found'}
                </div>
              ) : (
                <ul className="item-list">
                  {filteredWorktrees.map((wt) => {
                    const isWorkingFolder = wt.agent === 'working-folder'
                    return (
                      <li
                        key={wt.path}
                        className={`item worktree-item clickable ${!isWorkingFolder && wt.branch === currentBranch ? 'current' : ''} ${isWorkingFolder ? 'working-folder' : ''}`}
                        onDoubleClick={() => !isWorkingFolder && handleRadarWorktreeClick(wt)}
                        onContextMenu={(e) => handleContextMenu(e, 'worktree', wt)}
                      >
                        <div className="item-main">
                          <span className="item-name">
                            {wt.branch || wt.displayName}
                          </span>
                          {!isWorkingFolder && wt.branch === currentBranch && (
                            <span className="current-indicator">●</span>
                          )}
                        </div>
                        {wt.branch && (
                          <div className="item-agent-hint">{wt.displayName}</div>
                        )}
                        <div className="item-path" title={wt.path}>
                          {wt.path.replace(/^\/Users\/[^/]+/, '~')}
                        </div>
                        <div className="item-meta worktree-stats">
                          {isWorkingFolder ? (
                            <code className="commit-hash">{wt.branch || 'detached'}</code>
                          ) : (
                            <code className="commit-hash">{wt.path.split('/').pop()}</code>
                          )}
                          {(wt.additions > 0 || wt.deletions > 0) && (
                            <>
                              {wt.additions > 0 && <span className="diff-additions">+{wt.additions}</span>}
                              {wt.deletions > 0 && <span className="diff-deletions">-{wt.deletions}</span>}
                              <span className="diff-separator">·</span>
                            </>
                          )}
                          {wt.changedFileCount > 0 && (
                            <span className="file-count">
                              {wt.changedFileCount} {wt.changedFileCount === 1 ? 'file' : 'files'}
                            </span>
                          )}
                          {wt.changedFileCount === 0 && <span className="clean-indicator">clean</span>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Commits Timeline Column */}
          <section
            className={`column commits-column ${draggingColumn === 'commits' ? 'dragging' : ''} ${dragOverColumn === 'commits' ? 'drag-over' : ''}`}
            style={{ order: radarColumnOrder.indexOf('commits') }}
            draggable
            onDragStart={(e) => handleColumnDragStart(e, 'commits')}
            onDragOver={(e) => handleColumnDragOver(e, 'commits')}
            onDragLeave={handleColumnDragLeave}
            onDrop={(e) => handleColumnDrop(e, 'commits')}
            onDragEnd={handleColumnDragEnd}
          >
            <div className="column-drag-handle" title="Drag to reorder">
              ⋮⋮
            </div>
            <div
              className={`column-header clickable-header ${radarCommitsFilterOpen ? 'open' : ''}`}
              onClick={() => setRadarCommitsFilterOpen(!radarCommitsFilterOpen)}
            >
              <div className="column-title">
                <h2>
                  <span className="column-icon">◉</span>
                  Commits
                  {currentBranch && <code className="commit-hash branch-badge">{currentBranch}</code>}
                </h2>
                <span className={`header-chevron ${radarCommitsFilterOpen ? 'open' : ''}`}>▾</span>
              </div>
              <span className="count-badge">{filteredGraphCommits.length}</span>
            </div>
            {radarCommitsFilterOpen && (
              <div className="column-filter-panel">
                <label className="column-filter-option">
                  <input
                    type="checkbox"
                    checked={showCheckpoints}
                    onChange={async (e) => {
                      const newValue = e.target.checked
                      setShowCheckpoints(newValue)
                      const graphResult = await window.electronAPI.getCommitGraphHistory(100, true, newValue)
                      setGraphCommits(graphResult)
                    }}
                  />
                  <span>Checkpoints</span>
                </label>
                <label className="column-filter-option">
                  <input
                    type="checkbox"
                    checked={onlyBranchHeads}
                    onChange={(e) => setOnlyBranchHeads(e.target.checked)}
                  />
                  <span>Branch heads only</span>
                </label>
                <label className="column-filter-option">
                  <input
                    type="checkbox"
                    checked={onlyUnmergedBranches}
                    onChange={(e) => setOnlyUnmergedBranches(e.target.checked)}
                  />
                  <span>Unmerged only</span>
                </label>
              </div>
            )}
            <div className="column-content">
              {/* Uncommitted changes as virtual commit */}
              {workingStatus?.hasChanges && (
                <div
                  className="commit-item uncommitted clickable"
                  onDoubleClick={() => handleRadarUncommittedClick()}
                  onContextMenu={(e) => handleContextMenu(e, 'uncommitted', workingStatus)}
                >
                  <div className="commit-message uncommitted-label">Uncommitted changes</div>
                  <div className="commit-meta">
                    <code className="commit-hash">working</code>
                    <span className="commit-files-count">
                      {workingStatus.stagedCount + workingStatus.unstagedCount}{' '}
                      {workingStatus.stagedCount + workingStatus.unstagedCount === 1 ? 'file' : 'files'}
                    </span>
                    {(workingStatus.additions > 0 || workingStatus.deletions > 0) && (
                      <span className="commit-diff">
                        {workingStatus.additions > 0 && (
                          <span className="diff-additions">+{workingStatus.additions}</span>
                        )}
                        {workingStatus.deletions > 0 && (
                          <span className="diff-deletions">-{workingStatus.deletions}</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {/* Actual commits */}
              {filteredGraphCommits.length === 0 && !workingStatus?.hasChanges ? (
                <div className="empty-column">No commits found</div>
              ) : (
                filteredGraphCommits.map((commit) => (
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
                          {commit.additions !== undefined && commit.additions > 0 && (
                            <span className="diff-additions">+{commit.additions}</span>
                          )}
                          {commit.deletions !== undefined && commit.deletions > 0 && (
                            <span className="diff-deletions">-{commit.deletions}</span>
                          )}
                        </span>
                      )}
                      {commit.filesChanged !== undefined && commit.filesChanged > 0 && (
                        <span className="commit-files-count">
                          {commit.filesChanged} {commit.filesChanged === 1 ? 'file' : 'files'}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Local Branches Column */}
          <section
            className={`column branches-column ${draggingColumn === 'branches' ? 'dragging' : ''} ${dragOverColumn === 'branches' ? 'drag-over' : ''}`}
            style={{ order: radarColumnOrder.indexOf('branches') }}
            draggable
            onDragStart={(e) => handleColumnDragStart(e, 'branches')}
            onDragOver={(e) => handleColumnDragOver(e, 'branches')}
            onDragLeave={handleColumnDragLeave}
            onDrop={(e) => handleColumnDrop(e, 'branches')}
            onDragEnd={handleColumnDragEnd}
          >
            <div className="column-drag-handle" title="Drag to reorder">
              ⋮⋮
            </div>
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
                <div className="control-row">
                  <label>Search</label>
                  <input
                    type="text"
                    className="control-search"
                    placeholder="Branch name..."
                    value={localBranchSearch}
                    onChange={(e) => setLocalBranchSearch(e.target.value)}
                  />
                </div>
                <div className="control-row">
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
                <div className="control-row">
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
                  {localBranchSearch.trim() || localFilter !== 'all' ? 'No branches match filter' : 'No local branches'}
                </div>
              ) : (
                <ul className="item-list">
                  {localBranches.map((branch) => (
                    <li
                      key={branch.name}
                      className={`item branch-item clickable ${branch.current ? 'current' : ''} ${switching ? 'disabled' : ''}`}
                      onDoubleClick={() => handleRadarBranchClick(branch)}
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
          <section
            className={`column remotes-column ${draggingColumn === 'remotes' ? 'dragging' : ''} ${dragOverColumn === 'remotes' ? 'drag-over' : ''}`}
            style={{ order: radarColumnOrder.indexOf('remotes') }}
            draggable
            onDragStart={(e) => handleColumnDragStart(e, 'remotes')}
            onDragOver={(e) => handleColumnDragOver(e, 'remotes')}
            onDragLeave={handleColumnDragLeave}
            onDrop={(e) => handleColumnDrop(e, 'remotes')}
            onDragEnd={handleColumnDragEnd}
          >
            <div className="column-drag-handle" title="Drag to reorder">
              ⋮⋮
            </div>
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
                <div className="control-row">
                  <label>Search</label>
                  <input
                    type="text"
                    className="control-search"
                    placeholder="Branch name..."
                    value={remoteBranchSearch}
                    onChange={(e) => setRemoteBranchSearch(e.target.value)}
                  />
                </div>
                <div className="control-row">
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
                <div className="control-row">
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
                  {remoteBranchSearch.trim() || remoteFilter !== 'all'
                    ? 'No branches match filter'
                    : 'No remote branches'}
                </div>
              ) : (
                <ul className="item-list">
                  {remoteBranches.map((branch) => (
                    <li
                      key={branch.name}
                      className={`item remote-item clickable ${switching ? 'disabled' : ''}`}
                      onDoubleClick={() => handleRadarRemoteBranchClick(branch)}
                      onContextMenu={(e) => handleContextMenu(e, 'remote-branch', branch)}
                    >
                      <div className="item-main">
                        <span className="item-name">
                          {branch.name.replace('remotes/', '').replace(/^origin\//, '')}
                        </span>
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

      {/* Focus Mode Layout */}
      {repoPath && !error && viewMode === 'focus' && (
        <main className="focus-mode-layout">
          {/* Sidebar */}
          {sidebarVisible && (
            <aside className="focus-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
              {/* PRs Section */}
              <div className="sidebar-section">
                <div className="sidebar-section-header">
                  <div className="sidebar-section-toggle" onClick={() => toggleSidebarSection('prs')}>
                    <span className={`sidebar-chevron ${sidebarSections.prs ? 'open' : ''}`}>▸</span>
                    <span className="sidebar-section-title">Pull Requests</span>
                    <span className="sidebar-count">{filteredPRs.length}</span>
                  </div>
                  <button
                    className={`sidebar-section-action sidebar-filter-btn ${sidebarFiltersOpen.prs ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSidebarFilter('prs')
                    }}
                    title="Filter & Sort"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                    </svg>
                  </button>
                </div>
                {sidebarFiltersOpen.prs && (
                  <div className="sidebar-filter-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="sidebar-filter-group">
                      <label>Filter</label>
                      <select
                        value={prFilter}
                        onChange={(e) => setPrFilter(e.target.value as PRFilter)}
                        className="sidebar-filter-select"
                      >
                        <option value="all">All Open</option>
                        <option value="open-not-draft">Open + Not Draft</option>
                        <option value="open-draft">Open + Draft</option>
                      </select>
                    </div>
                    <div className="sidebar-filter-group">
                      <label>Sort</label>
                      <select
                        value={prSort}
                        onChange={(e) => setPrSort(e.target.value as PRSort)}
                        className="sidebar-filter-select"
                      >
                        <option value="updated">Last Updated</option>
                        <option value="comments">Comments</option>
                        <option value="first-commit">First Commit</option>
                        <option value="last-commit">Last Commit</option>
                      </select>
                    </div>
                  </div>
                )}
                {sidebarSections.prs && (
                  <ul className="sidebar-list">
                    {prError ? (
                      <li className="sidebar-empty sidebar-error">{prError}</li>
                    ) : filteredPRs.length === 0 ? (
                      <li className="sidebar-empty">No open PRs</li>
                    ) : (
                      filteredPRs.map((pr) => (
                        <li
                          key={pr.number}
                          className={`sidebar-item ${pr.isDraft ? 'draft' : ''} ${switching ? 'disabled' : ''} ${sidebarFocus?.type === 'pr' && (sidebarFocus.data as PullRequest).number === pr.number ? 'selected' : ''}`}
                          onClick={() => handleSidebarFocus('pr', pr)}
                          onDoubleClick={() => handlePRDoubleClick(pr)}
                          onContextMenu={(e) => handleContextMenu(e, 'pr', pr)}
                          title={`#${pr.number} ${pr.title}`}
                        >
                          <span className="sidebar-item-name">{pr.title}</span>
                          {pr.isDraft && <span className="sidebar-pr-draft">draft</span>}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>

              {/* Branches Section */}
              <div className="sidebar-section">
                <div className="sidebar-section-header">
                  <div className="sidebar-section-toggle" onClick={() => toggleSidebarSection('branches')}>
                    <span className={`sidebar-chevron ${sidebarSections.branches ? 'open' : ''}`}>▸</span>
                    <span className="sidebar-section-title">Branches</span>
                    <span className="sidebar-count">{localBranches.length}</span>
                  </div>
                  <button
                    className={`sidebar-section-action sidebar-filter-btn ${sidebarFiltersOpen.branches ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSidebarFilter('branches')
                    }}
                    title="Filter & Sort"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                    </svg>
                  </button>
                  <button
                    className="sidebar-section-action"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowNewBranchModal(true)
                    }}
                    title="Create new branch"
                  >
                    +
                  </button>
                </div>
                {sidebarFiltersOpen.branches && (
                  <div className="sidebar-filter-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="sidebar-filter-group">
                      <label>Filter</label>
                      <select
                        value={localFilter}
                        onChange={(e) => setLocalFilter(e.target.value as BranchFilter)}
                        className="sidebar-filter-select"
                      >
                        <option value="all">All</option>
                        <option value="local-only">Local Only</option>
                        <option value="unmerged">Unmerged</option>
                      </select>
                    </div>
                    <div className="sidebar-filter-group">
                      <label>Sort</label>
                      <select
                        value={localSort}
                        onChange={(e) => setLocalSort(e.target.value as BranchSort)}
                        className="sidebar-filter-select"
                      >
                        <option value="name">Name</option>
                        <option value="last-commit">Last Commit</option>
                        <option value="first-commit">First Commit</option>
                        <option value="most-commits">Most Commits</option>
                      </select>
                    </div>
                  </div>
                )}
                {sidebarSections.branches && (
                  <ul className="sidebar-list">
                    {/* Uncommitted changes entry */}
                    {workingStatus?.hasChanges && (
                      <li
                        className={`sidebar-item uncommitted ${sidebarFocus?.type === 'uncommitted' ? 'selected' : ''}`}
                        onClick={() => handleSidebarFocus('uncommitted', workingStatus)}
                      >
                        <span className="sidebar-uncommitted-icon">◐</span>
                        <span className="sidebar-item-name">Uncommitted</span>
                        <span className="sidebar-uncommitted-count">
                          {workingStatus.stagedCount + workingStatus.unstagedCount}
                        </span>
                      </li>
                    )}
                    {localBranches.map((branch) => (
                      <li
                        key={branch.name}
                        className={`sidebar-item ${branch.current ? 'current' : ''} ${switching ? 'disabled' : ''} ${sidebarFocus?.type === 'branch' && (sidebarFocus.data as Branch).name === branch.name ? 'selected' : ''}`}
                        onClick={() => handleSidebarFocus('branch', branch)}
                        onDoubleClick={() => handleBranchDoubleClick(branch)}
                      >
                        {branch.current && <span className="sidebar-current-dot">●</span>}
                        <span className="sidebar-item-name">{branch.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Remotes Section */}
              <div className="sidebar-section">
                <div className="sidebar-section-header">
                  <div className="sidebar-section-toggle" onClick={() => toggleSidebarSection('remotes')}>
                    <span className={`sidebar-chevron ${sidebarSections.remotes ? 'open' : ''}`}>▸</span>
                    <span className="sidebar-section-title">Remotes</span>
                    <span className="sidebar-count">{remoteBranches.length}</span>
                  </div>
                  <button
                    className={`sidebar-section-action sidebar-filter-btn ${sidebarFiltersOpen.remotes ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSidebarFilter('remotes')
                    }}
                    title="Filter & Sort"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                    </svg>
                  </button>
                </div>
                {sidebarFiltersOpen.remotes && (
                  <div className="sidebar-filter-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="sidebar-filter-group">
                      <label>Filter</label>
                      <select
                        value={remoteFilter}
                        onChange={(e) => setRemoteFilter(e.target.value as BranchFilter)}
                        className="sidebar-filter-select"
                      >
                        <option value="all">All</option>
                        <option value="unmerged">Unmerged</option>
                      </select>
                    </div>
                    <div className="sidebar-filter-group">
                      <label>Sort</label>
                      <select
                        value={remoteSort}
                        onChange={(e) => setRemoteSort(e.target.value as BranchSort)}
                        className="sidebar-filter-select"
                      >
                        <option value="name">Name</option>
                        <option value="last-commit">Last Commit</option>
                        <option value="first-commit">First Commit</option>
                        <option value="most-commits">Most Commits</option>
                      </select>
                    </div>
                  </div>
                )}
                {sidebarSections.remotes && (
                  <ul className="sidebar-list">
                    {remoteBranches.map((branch) => (
                      <li
                        key={branch.name}
                        className={`sidebar-item ${switching ? 'disabled' : ''} ${sidebarFocus?.type === 'remote' && (sidebarFocus.data as Branch).name === branch.name ? 'selected' : ''}`}
                        onClick={() => handleSidebarFocus('remote', branch)}
                        onDoubleClick={() => handleRemoteBranchDoubleClick(branch)}
                      >
                        <span className="sidebar-item-name">
                          {branch.name.replace('remotes/', '').replace(/^origin\//, '')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Worktrees Section */}
              <div className="sidebar-section">
                <div className="sidebar-section-header">
                  <div className="sidebar-section-toggle" onClick={() => toggleSidebarSection('worktrees')}>
                    <span className={`sidebar-chevron ${sidebarSections.worktrees ? 'open' : ''}`}>▸</span>
                    <span className="sidebar-section-title">Worktrees</span>
                    <span className="sidebar-count">
                      {worktrees.filter((wt) => wt.path !== repoPath).length + (workingFolderWorktree ? 1 : 0)}
                    </span>
                  </div>
                  <button
                    className="sidebar-section-action"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSidebarFocus({ type: 'create-worktree', data: null })
                    }}
                    title="Create Worktree"
                  >
                    +
                  </button>
                  <button
                    className={`sidebar-section-action sidebar-filter-btn ${sidebarFiltersOpen.worktrees ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSidebarFilter('worktrees')
                    }}
                    title="Filter"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                    </svg>
                  </button>
                </div>
                {sidebarFiltersOpen.worktrees && (
                  <div className="sidebar-filter-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="sidebar-filter-group">
                      <label>Parent</label>
                      <select
                        value={worktreeParentFilter}
                        onChange={(e) => setWorktreeParentFilter(e.target.value)}
                        className="sidebar-filter-select"
                      >
                        <option value="all">All</option>
                        {worktreeParents.map((parent) => (
                          <option key={parent} value={parent}>
                            {parent}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {sidebarSections.worktrees && (
                  <ul className="sidebar-list">
                    {/* Working Folder pseudo-worktree - always first */}
                    {workingFolderWorktree && (
                      <li
                        key="working-folder"
                        className={`sidebar-item working-folder-sidebar-item ${switching ? 'disabled' : ''} ${sidebarFocus?.type === 'worktree' && (sidebarFocus.data as Worktree).agent === 'working-folder' ? 'selected' : ''}`}
                        onClick={() => handleSidebarFocus('worktree', workingFolderWorktree)}
                      >
                        <span className="sidebar-item-name">{workingFolderWorktree.displayName}</span>
                      </li>
                    )}
                    {worktrees
                      .filter((wt) => wt.path !== repoPath)
                      .map((wt) => (
                        <li
                          key={wt.path}
                          className={`sidebar-item ${wt.branch === currentBranch ? 'current' : ''} ${switching ? 'disabled' : ''} ${sidebarFocus?.type === 'worktree' && (sidebarFocus.data as Worktree).path === wt.path ? 'selected' : ''}`}
                          onClick={() => handleSidebarFocus('worktree', wt)}
                          onDoubleClick={() => handleWorktreeDoubleClick(wt)}
                        >
                          {wt.branch === currentBranch && <span className="sidebar-current-dot">●</span>}
                          <span className="sidebar-item-name">{wt.displayName}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              {/* Stashes Section */}
              <div className="sidebar-section">
                <div className="sidebar-section-header">
                  <div className="sidebar-section-toggle" onClick={() => toggleSidebarSection('stashes')}>
                    <span className={`sidebar-chevron ${sidebarSections.stashes ? 'open' : ''}`}>▸</span>
                    <span className="sidebar-section-title">Stashes</span>
                    <span className="sidebar-count">{stashes.length}</span>
                  </div>
                </div>
                {sidebarSections.stashes && (
                  <ul className="sidebar-list">
                    {stashes.length === 0 ? (
                      <li className="sidebar-empty">No stashes</li>
                    ) : (
                      stashes.map((stash) => (
                        <li
                          key={stash.index}
                          className={`sidebar-item ${sidebarFocus?.type === 'stash' && (sidebarFocus.data as StashEntry).index === stash.index ? 'selected' : ''}`}
                          onClick={() => handleSidebarFocus('stash', stash)}
                        >
                          <span className="sidebar-item-name" title={`stash@{${stash.index}}: ${stash.message}`}>
                            {stash.message || `Stash ${stash.index}`}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </aside>
          )}

          {/* Sidebar Resize Handle */}
          {sidebarVisible && (
            <div
              className={`resize-handle resize-handle-sidebar ${isResizingSidebar ? 'active' : ''}`}
              onMouseDown={() => setIsResizingSidebar(true)}
            />
          )}

          {/* Main Content: Settings Panel OR Git Graph + Commit List */}
          {mainVisible && (
            <div className="focus-main">
              {mainPanelView === 'settings' ? (
                <SettingsPanel
                  themeMode={themeMode}
                  onThemeChange={handleThemeChange}
                  onBack={() => setMainPanelView('history')}
                />
              ) : (
                <>
                  <div
                    className={`focus-main-header clickable-header ${historyFilterOpen ? 'open' : ''}`}
                    onClick={() => setHistoryFilterOpen(!historyFilterOpen)}
                  >
                    <div className="column-title">
                      <h2>
                        <span className="column-icon">◉</span>
                        History
                        {currentBranch && <code className="commit-hash branch-badge">{currentBranch}</code>}
                      </h2>
                      <button
                        className={`header-filter-btn ${historyFilterOpen ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setHistoryFilterOpen(!historyFilterOpen)
                        }}
                        title="Filter"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                        </svg>
                      </button>
                    </div>
                  </div>
                  {historyFilterOpen && (
                    <div className="history-filter-panel">
                      <label className="history-filter-option">
                        <input
                          type="checkbox"
                          checked={showCheckpoints}
                          onChange={async (e) => {
                            const newValue = e.target.checked
                            setShowCheckpoints(newValue)
                            // Reload commits with new filter
                            const graphResult = await window.electronAPI.getCommitGraphHistory(100, true, newValue)
                            setGraphCommits(graphResult)
                          }}
                        />
                        <span>Checkpoints</span>
                        <span className="history-filter-hint">Show agent checkpoint commits</span>
                      </label>
                      <label className="history-filter-option">
                        <input
                          type="checkbox"
                          checked={showGraphLines}
                          onChange={(e) => setShowGraphLines(e.target.checked)}
                        />
                        <span>Graph</span>
                        <span className="history-filter-hint">Show branch/merge lines</span>
                      </label>
                      <label className="history-filter-option">
                        <input
                          type="checkbox"
                          checked={onlyBranchHeads}
                          onChange={(e) => setOnlyBranchHeads(e.target.checked)}
                        />
                        <span>Branch heads only</span>
                        <span className="history-filter-hint">Latest commit per branch</span>
                      </label>
                      <label className="history-filter-option">
                        <input
                          type="checkbox"
                          checked={onlyUnmergedBranches}
                          onChange={(e) => setOnlyUnmergedBranches(e.target.checked)}
                        />
                        <span>Unmerged only</span>
                        <span className="history-filter-hint">Commits from unmerged branches</span>
                      </label>
                    </div>
                  )}
                  <div className="git-graph-container">
                    <GitGraph
                      commits={filteredGraphCommits}
                      selectedCommit={selectedCommit}
                      onSelectCommit={handleSelectCommit}
                      formatRelativeTime={formatRelativeTime}
                      showGraph={showGraphLines}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Detail Panel Resize Handle - only show when main is visible */}
          {detailVisible && mainVisible && (
            <div
              className={`resize-handle resize-handle-detail ${isResizingDetail ? 'active' : ''}`}
              onMouseDown={() => setIsResizingDetail(true)}
            />
          )}

          {/* Detail Panel */}
          {detailVisible && (
            <aside 
              className={`focus-detail ${!mainVisible ? 'detail-expanded' : ''}`} 
              style={mainVisible ? { width: detailWidth } : undefined}
            >
              {sidebarFocus?.type === 'uncommitted' && workingStatus ? (
                <StagingPanel
                  workingStatus={workingStatus}
                  currentBranch={currentBranch}
                  onRefresh={refresh}
                  onStatusChange={setStatus}
                />
              ) : sidebarFocus?.type === 'pr' ? (
                <PRReviewPanel
                  pr={sidebarFocus.data as PullRequest}
                  formatRelativeTime={formatRelativeTime}
                  onCheckout={handlePRCheckout}
                  onPRMerged={refresh}
                  switching={switching}
                />
              ) : sidebarFocus ? (
                <SidebarDetailPanel
                  focus={sidebarFocus}
                  formatRelativeTime={formatRelativeTime}
                  formatDate={formatDate}
                  currentBranch={currentBranch}
                  switching={switching}
                  onStatusChange={setStatus}
                  onRefresh={refresh}
                  onClearFocus={() => setSidebarFocus(null)}
                  onCheckoutBranch={handleBranchDoubleClick}
                  onCheckoutRemoteBranch={handleRemoteBranchDoubleClick}
                  onCheckoutWorktree={handleWorktreeDoubleClick}
                  branches={branches}
                  repoPath={repoPath}
                  worktrees={worktrees}
                  onFocusWorktree={(wt) => setSidebarFocus({ type: 'worktree', data: wt })}
                />
              ) : !selectedCommit ? (
                <div className="detail-empty">
                  <span className="detail-empty-icon">◇</span>
                  <p>Select an item to view details</p>
                </div>
              ) : loadingDiff ? (
                <div className="detail-loading">Loading diff...</div>
              ) : commitDiff ? (
                <DiffPanel diff={commitDiff} formatRelativeTime={formatRelativeTime} />
              ) : (
                <div className="detail-error">Could not load diff</div>
              )}
            </aside>
          )}
        </main>
      )}
    </div>
  )
}
