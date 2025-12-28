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
  UncommittedFile,
  PRFilter,
  PRSort,
  GraphCommit,
  CommitDiff,
  StashEntry,
  StagingFileDiff,
  PRDetail,
  PRReviewComment,
  StashFile,
  BranchDiff,
} from './types/electron'
import './styles/app.css'
import { useWindowContext } from './components/window'
import { SettingsPanel } from './components/SettingsPanel'
import { initializeTheme, setThemeMode as applyThemeMode, getCurrentThemeMode, loadVSCodeTheme, type ThemeMode } from './theme'

type ViewMode = 'radar' | 'focus'
type MainPanelView = 'history' | 'settings'

interface StatusMessage {
  type: 'success' | 'error' | 'info'
  message: string
  stashed?: string
}

type ContextMenuType = 'pr' | 'worktree' | 'local-branch' | 'remote-branch' | 'commit' | 'uncommitted'

interface ContextMenu {
  type: ContextMenuType
  x: number
  y: number
  data: PullRequest | Worktree | Branch | Commit | WorkingStatus
}

interface MenuItem {
  label: string
  action: () => void
  disabled?: boolean
}

type SidebarFocusType = 'pr' | 'branch' | 'remote' | 'worktree' | 'stash' | 'uncommitted' | 'create-worktree'

interface SidebarFocus {
  type: SidebarFocusType
  data: PullRequest | Branch | Worktree | StashEntry | WorkingStatus | null
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
        const newWidth = Math.max(150, Math.min(400, e.clientX))
        setSidebarWidth(newWidth)
      }
      if (isResizingDetail) {
        const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX))
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

          {/* Detail Panel Resize Handle */}
          {detailVisible && (
            <div
              className={`resize-handle resize-handle-detail ${isResizingDetail ? 'active' : ''}`}
              onMouseDown={() => setIsResizingDetail(true)}
            />
          )}

          {/* Detail Panel */}
          {detailVisible && (
            <aside className="focus-detail" style={{ width: detailWidth, minWidth: detailWidth }}>
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

// ========================================
// Git Graph Component
// ========================================

interface GitGraphProps {
  commits: GraphCommit[]
  selectedCommit: GraphCommit | null
  onSelectCommit: (commit: GraphCommit) => void
  formatRelativeTime: (date: string) => string
  showGraph?: boolean // Show graph lines/nodes, when false it's a flat list
}

// Lane colors for branches
const LANE_COLORS = [
  '#5B9BD5', // blue
  '#70AD47', // green
  '#ED7D31', // orange
  '#7030A0', // purple
  '#FFC000', // yellow
  '#C00000', // red
  '#00B0F0', // cyan
  '#FF6699', // pink
]

function GitGraph({ commits, selectedCommit, onSelectCommit, formatRelativeTime, showGraph = true }: GitGraphProps) {
  // Calculate lane assignments for the graph
  const { lanes, maxLane } = useMemo(() => {
    const laneMap = new Map<string, number>()
    const activeLanes = new Set<number>()
    let maxLaneUsed = 0

    // Process commits in order (newest first)
    for (const commit of commits) {
      // Find or assign a lane for this commit
      let lane = laneMap.get(commit.hash)

      if (lane === undefined) {
        // Find first available lane
        lane = 0
        while (activeLanes.has(lane)) lane++
        laneMap.set(commit.hash, lane)
      }

      activeLanes.add(lane)
      maxLaneUsed = Math.max(maxLaneUsed, lane)

      // Assign lanes to parents
      commit.parents.forEach((parentHash, idx) => {
        if (!laneMap.has(parentHash)) {
          if (idx === 0) {
            // First parent stays in same lane
            laneMap.set(parentHash, lane!)
          } else {
            // Other parents get new lanes
            let parentLane = 0
            while (activeLanes.has(parentLane) || parentLane === lane) parentLane++
            laneMap.set(parentHash, parentLane)
            activeLanes.add(parentLane)
            maxLaneUsed = Math.max(maxLaneUsed, parentLane)
          }
        }
      })

      // If commit has no parents, release the lane
      if (commit.parents.length === 0) {
        activeLanes.delete(lane)
      }
    }

    return { lanes: laneMap, maxLane: maxLaneUsed }
  }, [commits])

  const LANE_WIDTH = 16
  const ROW_HEIGHT = 36
  const NODE_RADIUS = 4
  const graphWidth = (maxLane + 1) * LANE_WIDTH + 20

  // Build a map of commit hash to index for drawing lines
  const commitIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    commits.forEach((c, i) => map.set(c.hash, i))
    return map
  }, [commits])

  return (
    <div className={`git-graph ${!showGraph ? 'no-graph' : ''}`}>
      {showGraph && (
        <svg
          className="git-graph-svg"
          width={graphWidth}
          height={commits.length * ROW_HEIGHT}
          style={{ minWidth: graphWidth }}
        >
          {/* Draw connecting lines */}
          {commits.map((commit, idx) => {
            const lane = lanes.get(commit.hash) || 0
            const x = 10 + lane * LANE_WIDTH
            const y = idx * ROW_HEIGHT + ROW_HEIGHT / 2
            const color = LANE_COLORS[lane % LANE_COLORS.length]

            return commit.parents.map((parentHash, pIdx) => {
              const parentIdx = commitIndexMap.get(parentHash)
              if (parentIdx === undefined) return null

              const parentLane = lanes.get(parentHash) || 0
              const px = 10 + parentLane * LANE_WIDTH
              const py = parentIdx * ROW_HEIGHT + ROW_HEIGHT / 2
              const parentColor = LANE_COLORS[parentLane % LANE_COLORS.length]

              // Draw curved line
              if (lane === parentLane) {
                // Straight line
                return (
                  <line
                    key={`${commit.hash}-${parentHash}`}
                    x1={x}
                    y1={y}
                    x2={px}
                    y2={py}
                    stroke={color}
                    strokeWidth={2}
                  />
                )
              } else {
                // Curved line for merges/branches
                const midY = (y + py) / 2
                return (
                  <path
                    key={`${commit.hash}-${parentHash}-${pIdx}`}
                    d={`M ${x} ${y} C ${x} ${midY}, ${px} ${midY}, ${px} ${py}`}
                    stroke={pIdx === 0 ? color : parentColor}
                    strokeWidth={2}
                    fill="none"
                  />
                )
              }
            })
          })}

          {/* Draw commit nodes */}
          {commits.map((commit, idx) => {
            const lane = lanes.get(commit.hash) || 0
            const x = 10 + lane * LANE_WIDTH
            const y = idx * ROW_HEIGHT + ROW_HEIGHT / 2
            const color = LANE_COLORS[lane % LANE_COLORS.length]
            const isSelected = selectedCommit?.hash === commit.hash

            return (
              <g key={commit.hash}>
                {/* Selection ring */}
                {isSelected && (
                  <circle cx={x} cy={y} r={NODE_RADIUS + 3} fill="none" stroke={color} strokeWidth={2} opacity={0.5} />
                )}
                {/* Node */}
                <circle
                  cx={x}
                  cy={y}
                  r={commit.isMerge ? NODE_RADIUS + 1 : NODE_RADIUS}
                  fill={commit.isMerge ? 'var(--bg-primary)' : color}
                  stroke={color}
                  strokeWidth={commit.isMerge ? 2 : 0}
                />
              </g>
            )
          })}
        </svg>
      )}

      {/* Commit list */}
      <div className="git-graph-list" style={{ marginLeft: showGraph ? graphWidth : 0 }}>
        {commits.map((commit) => (
          <div
            key={commit.hash}
            className={`graph-commit-row ${selectedCommit?.hash === commit.hash ? 'selected' : ''}`}
            style={{ height: ROW_HEIGHT }}
            onClick={() => onSelectCommit(commit)}
          >
            <div className="graph-commit-refs">
              {commit.refs.map((ref, i) => {
                const isHead = ref.includes('HEAD')
                const isBranch = ref.includes('origin/') || !ref.includes('/')
                const cleanRef = ref.replace('HEAD -> ', '').replace('origin/', '')
                return (
                  <span key={i} className={`graph-ref ${isHead ? 'head' : ''} ${isBranch ? 'branch' : 'tag'}`}>
                    {cleanRef}
                  </span>
                )
              })}
            </div>
            <span className="graph-commit-message" title={commit.message}>
              {commit.message}
            </span>
            <span className="graph-commit-meta">
              <code className="commit-hash">{commit.shortHash}</code>
              <span className="graph-commit-author">{commit.author}</span>
              <span className="graph-commit-date">{formatRelativeTime(commit.date)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ========================================
// Diff Panel Component
// ========================================

interface DiffPanelProps {
  diff: CommitDiff
  formatRelativeTime: (date: string) => string
}

function DiffPanel({ diff, formatRelativeTime }: DiffPanelProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // Expand all files by default on mount or diff change
  useEffect(() => {
    setExpandedFiles(new Set(diff.files.map((f) => f.file.path)))
  }, [diff])

  return (
    <div className="diff-panel">
      {/* Commit header */}
      <div className="diff-commit-header">
        <div className="diff-commit-message">{diff.message}</div>
        <div className="diff-commit-meta">
          <code className="commit-hash">{diff.hash.slice(0, 7)}</code>
          <span>{diff.author}</span>
          <span>{formatRelativeTime(diff.date)}</span>
        </div>
        <div className="diff-commit-stats">
          <span className="diff-stat-files">
            {diff.files.length} {diff.files.length === 1 ? 'file' : 'files'}
          </span>
          <span className="diff-stat-additions">+{diff.totalAdditions}</span>
          <span className="diff-stat-deletions">-{diff.totalDeletions}</span>
        </div>
      </div>

      {/* File list with diffs */}
      <div className="diff-files">
        {diff.files.map((fileDiff) => (
          <div key={fileDiff.file.path} className="diff-file">
            <div className="diff-file-header" onClick={() => toggleFile(fileDiff.file.path)}>
              <span className={`diff-file-chevron ${expandedFiles.has(fileDiff.file.path) ? 'open' : ''}`}>▸</span>
              <span className={`diff-file-status diff-status-${fileDiff.file.status}`}>
                {fileDiff.file.status === 'added'
                  ? 'A'
                  : fileDiff.file.status === 'deleted'
                    ? 'D'
                    : fileDiff.file.status === 'renamed'
                      ? 'R'
                      : 'M'}
              </span>
              <span className="diff-file-path">
                {fileDiff.file.oldPath ? `${fileDiff.file.oldPath} → ` : ''}
                {fileDiff.file.path}
              </span>
              <span className="diff-file-stats">
                {fileDiff.file.additions > 0 && <span className="diff-additions">+{fileDiff.file.additions}</span>}
                {fileDiff.file.deletions > 0 && <span className="diff-deletions">-{fileDiff.file.deletions}</span>}
              </span>
            </div>

            {expandedFiles.has(fileDiff.file.path) && (
              <div className="diff-file-content">
                {fileDiff.isBinary ? (
                  <div className="diff-binary">Binary file</div>
                ) : fileDiff.hunks.length === 0 ? (
                  <div className="diff-empty">No changes</div>
                ) : (
                  fileDiff.hunks.map((hunk, hunkIdx) => (
                    <div key={hunkIdx} className="diff-hunk">
                      <div className="diff-hunk-header">
                        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                      </div>
                      <div className="diff-hunk-lines">
                        {hunk.lines.map((line, lineIdx) => (
                          <div key={lineIdx} className={`diff-line diff-line-${line.type}`}>
                            <span className="diff-line-number old">{line.oldLineNumber || ''}</span>
                            <span className="diff-line-number new">{line.newLineNumber || ''}</span>
                            <span className="diff-line-prefix">
                              {line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}
                            </span>
                            <span className="diff-line-content">{line.content}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ========================================
// Branch Detail Panel Component
// ========================================

interface BranchDetailPanelProps {
  branch: Branch
  formatDate: (date?: string) => string
  onStatusChange?: (status: StatusMessage | null) => void
  onCheckoutBranch?: (branch: Branch) => void
  switching?: boolean
}

function BranchDetailPanel({
  branch,
  formatDate,
  onStatusChange,
  onCheckoutBranch,
  switching,
}: BranchDetailPanelProps) {
  const [creatingPR, setCreatingPR] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [branchDiff, setBranchDiff] = useState<BranchDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  // PR creation form state
  const [showPRForm, setShowPRForm] = useState(false)
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [prDraft, setPrDraft] = useState(false)

  const isMainOrMaster = branch.name === 'main' || branch.name === 'master'

  // Load branch diff when branch changes
  useEffect(() => {
    if (isMainOrMaster) {
      setBranchDiff(null)
      return
    }

    let cancelled = false
    setLoadingDiff(true)

    window.electronAPI.getBranchDiff(branch.name).then((diff) => {
      if (!cancelled) {
        setBranchDiff(diff)
        // Expand first 3 files by default
        if (diff?.files) {
          setExpandedFiles(new Set(diff.files.slice(0, 3).map((f) => f.file.path)))
        }
        setLoadingDiff(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [branch.name, isMainOrMaster])

  const handleStartPRCreation = () => {
    // Auto-generate title from branch name
    const generatedTitle = branch.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    setPrTitle(generatedTitle)
    setPrBody('')
    setPrDraft(false)
    setShowPRForm(true)
  }

  const handleCancelPRCreation = () => {
    setShowPRForm(false)
    setPrTitle('')
    setPrBody('')
    setPrDraft(false)
  }

  const handleSubmitPR = async () => {
    if (!prTitle.trim()) return

    setCreatingPR(true)
    onStatusChange?.({ type: 'info', message: `Creating pull request for ${branch.name}...` })

    try {
      const result = await window.electronAPI.createPullRequest({
        title: prTitle.trim(),
        body: prBody.trim() || undefined,
        headBranch: branch.name,
        draft: prDraft,
        web: false,
      })

      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        setShowPRForm(false)
        setPrTitle('')
        setPrBody('')
        setPrDraft(false)
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setCreatingPR(false)
    }
  }

  const handlePush = async () => {
    setPushing(true)
    onStatusChange?.({ type: 'info', message: `Pushing ${branch.name} to origin...` })

    try {
      const result = await window.electronAPI.pushBranch(branch.name, true)

      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setPushing(false)
    }
  }

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  return (
    <div className="sidebar-detail-panel">
      <div className="detail-type-badge">Local Branch</div>
      <h3 className="detail-title">{branch.name}</h3>
      <div className="detail-meta-grid">
        <div className="detail-meta-item">
          <span className="meta-label">Commit</span>
          <code className="meta-value">{branch.commit?.slice(0, 7) || '—'}</code>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Status</span>
          <span className="meta-value">
            {branch.current ? 'Current' : 'Not checked out'}
            {branch.isLocalOnly && ' · Local only'}
          </span>
        </div>
        {branch.lastCommitDate && (
          <div className="detail-meta-item">
            <span className="meta-label">Last Commit</span>
            <span className="meta-value">{formatDate(branch.lastCommitDate)}</span>
          </div>
        )}
        {branch.firstCommitDate && (
          <div className="detail-meta-item">
            <span className="meta-label">First Commit</span>
            <span className="meta-value">{formatDate(branch.firstCommitDate)}</span>
          </div>
        )}
        {branch.commitCount !== undefined && (
          <div className="detail-meta-item">
            <span className="meta-label">Commits</span>
            <span className="meta-value">{branch.commitCount}</span>
          </div>
        )}
        <div className="detail-meta-item">
          <span className="meta-label">Merged</span>
          <span className="meta-value">{branch.isMerged ? 'Yes' : 'No'}</span>
        </div>
      </div>

      {/* PR Creation Form */}
      {showPRForm && !isMainOrMaster && (
        <div className="pr-create-form">
          <div className="pr-form-header">
            <span className="pr-form-title">Create Pull Request</span>
            <button className="pr-form-close" onClick={handleCancelPRCreation} title="Cancel">
              ×
            </button>
          </div>
          <div className="pr-form-field">
            <label className="pr-form-label">Title</label>
            <input
              type="text"
              className="pr-form-input"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              placeholder="Pull request title"
              autoFocus
            />
          </div>
          <div className="pr-form-field">
            <label className="pr-form-label">Description</label>
            <textarea
              className="pr-form-textarea"
              value={prBody}
              onChange={(e) => setPrBody(e.target.value)}
              placeholder="Describe your changes (optional)"
              rows={4}
            />
          </div>
          <div className="pr-form-checkbox">
            <label>
              <input type="checkbox" checked={prDraft} onChange={(e) => setPrDraft(e.target.checked)} />
              <span>Create as draft</span>
            </label>
          </div>
          <div className="pr-form-actions">
            <button className="btn btn-secondary" onClick={handleCancelPRCreation} disabled={creatingPR}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSubmitPR} disabled={creatingPR || !prTitle.trim()}>
              {creatingPR ? 'Creating...' : 'Create PR'}
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!showPRForm && (
        <div className="detail-actions">
          {!branch.current && onCheckoutBranch && (
            <button className="btn btn-primary" onClick={() => onCheckoutBranch(branch)} disabled={switching}>
              {switching ? 'Checking out...' : 'Checkout'}
            </button>
          )}
          {branch.current && (
            <button className="btn btn-primary" onClick={handlePush} disabled={pushing}>
              {pushing ? 'Pushing...' : 'Push to Origin'}
            </button>
          )}
          {!isMainOrMaster && (
            <button className="btn btn-secondary" onClick={handleStartPRCreation}>
              Create Pull Request
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => window.electronAPI.openBranchInGitHub(branch.name)}>
            View on GitHub
          </button>
        </div>
      )}

      {/* Branch Diff Section */}
      {!isMainOrMaster && (
        <div className="branch-diff-section">
          <div className="branch-diff-header">
            <span className="branch-diff-title">Changes vs {branchDiff?.baseBranch || 'master'}</span>
            {branchDiff && (
              <span className="branch-diff-stats">
                <span className="diff-stat-files">
                  {branchDiff.files.length} {branchDiff.files.length === 1 ? 'file' : 'files'}
                </span>
                <span className="diff-additions">+{branchDiff.totalAdditions}</span>
                <span className="diff-deletions">-{branchDiff.totalDeletions}</span>
              </span>
            )}
          </div>

          {loadingDiff ? (
            <div className="branch-diff-loading">Loading diff...</div>
          ) : !branchDiff ? (
            <div className="branch-diff-empty">Could not load diff</div>
          ) : branchDiff.files.length === 0 ? (
            <div className="branch-diff-empty">No changes from {branchDiff.baseBranch}</div>
          ) : (
            <div className="branch-diff-files">
              {branchDiff.files.map((fileDiff) => (
                <div key={fileDiff.file.path} className="branch-diff-file">
                  <div className="branch-diff-file-header" onClick={() => toggleFile(fileDiff.file.path)}>
                    <span className={`diff-file-chevron ${expandedFiles.has(fileDiff.file.path) ? 'open' : ''}`}>
                      ▸
                    </span>
                    <span className={`diff-file-status diff-status-${fileDiff.file.status}`}>
                      {fileDiff.file.status === 'added'
                        ? 'A'
                        : fileDiff.file.status === 'deleted'
                          ? 'D'
                          : fileDiff.file.status === 'renamed'
                            ? 'R'
                            : 'M'}
                    </span>
                    <span className="diff-file-path">
                      {fileDiff.file.oldPath ? `${fileDiff.file.oldPath} → ` : ''}
                      {fileDiff.file.path}
                    </span>
                    <span className="diff-file-stats">
                      {fileDiff.file.additions > 0 && (
                        <span className="diff-additions">+{fileDiff.file.additions}</span>
                      )}
                      {fileDiff.file.deletions > 0 && (
                        <span className="diff-deletions">-{fileDiff.file.deletions}</span>
                      )}
                    </span>
                  </div>

                  {expandedFiles.has(fileDiff.file.path) && (
                    <div className="diff-file-content">
                      {fileDiff.isBinary ? (
                        <div className="diff-binary">Binary file</div>
                      ) : fileDiff.hunks.length === 0 ? (
                        <div className="diff-empty">No changes</div>
                      ) : (
                        fileDiff.hunks.map((hunk, hunkIdx) => (
                          <div key={hunkIdx} className="diff-hunk">
                            <div className="diff-hunk-header">
                              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                            </div>
                            <div className="diff-hunk-lines">
                              {hunk.lines.map((line, lineIdx) => (
                                <div key={lineIdx} className={`diff-line diff-line-${line.type}`}>
                                  <span className="diff-line-number old">{line.oldLineNumber || ''}</span>
                                  <span className="diff-line-number new">{line.newLineNumber || ''}</span>
                                  <span className="diff-line-prefix">
                                    {line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}
                                  </span>
                                  <span className="diff-line-content">{line.content}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ========================================
// Sidebar Detail Panel Component
// ========================================

interface SidebarDetailPanelProps {
  focus: SidebarFocus
  formatRelativeTime: (date: string) => string
  formatDate: (date?: string) => string
  currentBranch: string
  switching?: boolean
  onStatusChange?: (status: StatusMessage | null) => void
  onRefresh?: () => Promise<void>
  onClearFocus?: () => void
  onCheckoutBranch?: (branch: Branch) => void
  onCheckoutRemoteBranch?: (branch: Branch) => void
  onCheckoutWorktree?: (worktree: Worktree) => void
  branches?: Branch[]
  repoPath?: string | null
  worktrees?: Worktree[]
  onFocusWorktree?: (worktree: Worktree) => void
}

function SidebarDetailPanel({
  focus,
  formatRelativeTime,
  formatDate,
  currentBranch,
  switching,
  onStatusChange,
  onRefresh,
  onClearFocus,
  onCheckoutBranch,
  onCheckoutRemoteBranch,
  onCheckoutWorktree,
  branches,
  repoPath,
  worktrees,
  onFocusWorktree,
}: SidebarDetailPanelProps) {
  switch (focus.type) {
    case 'pr': {
      // Handled by PRReviewPanel
      return null
    }

    case 'branch': {
      const branch = focus.data as Branch
      return (
        <BranchDetailPanel
          branch={branch}
          formatDate={formatDate}
          onStatusChange={onStatusChange}
          onCheckoutBranch={onCheckoutBranch}
          switching={switching}
        />
      )
    }

    case 'remote': {
      const branch = focus.data as Branch
      const displayName = branch.name.replace('remotes/', '').replace(/^origin\//, '')
      return (
        <div className="sidebar-detail-panel">
          <div className="detail-type-badge">Remote Branch</div>
          <h3 className="detail-title">{displayName}</h3>
          <div className="detail-meta-grid">
            <div className="detail-meta-item">
              <span className="meta-label">Full Name</span>
              <code className="meta-value">{branch.name}</code>
            </div>
            <div className="detail-meta-item">
              <span className="meta-label">Commit</span>
              <code className="meta-value">{branch.commit?.slice(0, 7) || '—'}</code>
            </div>
            {branch.lastCommitDate && (
              <div className="detail-meta-item">
                <span className="meta-label">Last Commit</span>
                <span className="meta-value">{formatDate(branch.lastCommitDate)}</span>
              </div>
            )}
            {branch.commitCount !== undefined && (
              <div className="detail-meta-item">
                <span className="meta-label">Commits</span>
                <span className="meta-value">{branch.commitCount}</span>
              </div>
            )}
            <div className="detail-meta-item">
              <span className="meta-label">Merged</span>
              <span className="meta-value">{branch.isMerged ? 'Yes' : 'No'}</span>
            </div>
          </div>
          {/* Actions */}
          <div className="detail-actions">
            {onCheckoutRemoteBranch && (
              <button className="btn btn-primary" onClick={() => onCheckoutRemoteBranch(branch)} disabled={switching}>
                {switching ? 'Checking out...' : 'Checkout'}
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => window.electronAPI.openBranchInGitHub(branch.name)}>
              View on GitHub
            </button>
          </div>
        </div>
      )
    }

    case 'worktree': {
      const wt = focus.data as Worktree
      return (
        <WorktreeDetailPanel
          worktree={wt}
          currentBranch={currentBranch}
          switching={switching}
          onStatusChange={onStatusChange}
          onRefresh={onRefresh}
          onClearFocus={onClearFocus}
          onCheckoutWorktree={onCheckoutWorktree}
        />
      )
    }

    case 'create-worktree': {
      return (
        <CreateWorktreePanel
          branches={branches || []}
          repoPath={repoPath || ''}
          onStatusChange={onStatusChange}
          onRefresh={onRefresh}
          onClearFocus={onClearFocus}
          onWorktreeCreated={onFocusWorktree ? (path) => {
            // Fetch fresh worktrees and find the new one
            window.electronAPI.getWorktrees().then((result) => {
              if (!('error' in result)) {
                const newWorktree = result.find((wt) => wt.path === path)
                if (newWorktree) {
                  onFocusWorktree(newWorktree)
                } else {
                  onClearFocus?.()
                }
              } else {
                onClearFocus?.()
              }
            })
          } : undefined}
        />
      )
    }

    case 'stash': {
      const stash = focus.data as StashEntry
      return (
        <StashDetailPanel
          stash={stash}
          formatRelativeTime={formatRelativeTime}
          onStatusChange={onStatusChange}
          onRefresh={onRefresh}
          onClearFocus={onClearFocus}
        />
      )
    }

    case 'uncommitted': {
      // Render the full staging panel
      return null // Handled by parent component
    }

    default:
      return null
  }
}

// ========================================
// Staging Panel Component
// ========================================

interface StagingPanelProps {
  workingStatus: WorkingStatus
  currentBranch: string
  onRefresh: () => Promise<void>
  onStatusChange: (status: StatusMessage | null) => void
}

function StagingPanel({ workingStatus, currentBranch, onRefresh, onStatusChange }: StagingPanelProps) {
  const [selectedFile, setSelectedFile] = useState<UncommittedFile | null>(null)
  const [fileDiff, setFileDiff] = useState<StagingFileDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [commitDescription, setCommitDescription] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [behindPrompt, setBehindPrompt] = useState<{ behindCount: number } | null>(null)
  const [isPulling, setIsPulling] = useState(false)
  const [pushAfterCommit, setPushAfterCommit] = useState(true)
  const [fileContextMenu, setFileContextMenu] = useState<{ x: number; y: number; file: UncommittedFile } | null>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)
  // New branch creation
  const [createNewBranch, setCreateNewBranch] = useState(false)
  const [branchFolder, setBranchFolder] = useState<string>('feature')
  const [customFolder, setCustomFolder] = useState('')
  const [branchName, setBranchName] = useState('')
  // PR creation option (inline with commit flow)
  const [createPR, setCreatePR] = useState(false)
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [prDraft, setPrDraft] = useState(false)

  const stagedFiles = workingStatus.files.filter((f) => f.staged)
  const unstagedFiles = workingStatus.files.filter((f) => !f.staged)


  // Close file context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileContextMenu(null)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFileContextMenu(null)
      }
    }

    if (fileContextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [fileContextMenu])

  // Load diff when file is selected
  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null)
      return
    }

    const loadDiff = async () => {
      setLoadingDiff(true)
      try {
        const diff = await window.electronAPI.getFileDiff(selectedFile.path, selectedFile.staged)
        setFileDiff(diff)
      } catch (_error) {
        setFileDiff(null)
      } finally {
        setLoadingDiff(false)
      }
    }

    loadDiff()
  }, [selectedFile])

  // Stage a file
  const handleStageFile = async (file: UncommittedFile) => {
    const result = await window.electronAPI.stageFile(file.path)
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Unstage a file
  const handleUnstageFile = async (file: UncommittedFile) => {
    const result = await window.electronAPI.unstageFile(file.path)
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Stage all files
  const handleStageAll = async () => {
    const result = await window.electronAPI.stageAll()
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Unstage all files
  const handleUnstageAll = async () => {
    const result = await window.electronAPI.unstageAll()
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Discard changes in a file
  const handleDiscardFile = async (file: UncommittedFile) => {
    setFileContextMenu(null)
    const result = await window.electronAPI.discardFileChanges(file.path)
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      if (selectedFile?.path === file.path) {
        setSelectedFile(null)
      }
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Handle right-click on unstaged file
  const handleFileContextMenu = (e: React.MouseEvent, file: UncommittedFile) => {
    e.preventDefault()
    setFileContextMenu({ x: e.clientX, y: e.clientY, file })
  }

  // Get the effective folder name (custom or preset)
  const effectiveFolder = branchFolder === 'custom' ? customFolder.trim() : branchFolder
  const fullBranchName = createNewBranch && branchName.trim() ? `${effectiveFolder}/${branchName.trim()}` : null

  // Commit with optional force to skip behind-check
  const handleCommit = async (force: boolean = false) => {
    if (!commitMessage.trim() || stagedFiles.length === 0) return

    setIsCommitting(true)
    try {
      // If creating a new branch, do that first
      if (fullBranchName) {
        onStatusChange({ type: 'info', message: `Creating branch ${fullBranchName}...` })
        const branchResult = await window.electronAPI.createBranch(fullBranchName, true)
        if (!branchResult.success) {
          onStatusChange({ type: 'error', message: `Failed to create branch: ${branchResult.message}` })
          setIsCommitting(false)
          return
        }
      }

      const result = await window.electronAPI.commitChanges(
        commitMessage.trim(),
        commitDescription.trim() || undefined,
        force
      )
      if (result.success) {
        const targetBranch = fullBranchName || currentBranch
        let finalMessage = fullBranchName ? `Created ${fullBranchName} and committed` : result.message

        // If push after commit is enabled, push the branch
        if (pushAfterCommit && targetBranch) {
          onStatusChange({ type: 'info', message: 'Pushing to remote...' })
          const pushResult = await window.electronAPI.pushBranch(targetBranch, true)
          if (pushResult.success) {
            finalMessage = `Committed and pushed to ${targetBranch}`

            // If create PR is enabled, create the PR
            if (createPR) {
              onStatusChange({ type: 'info', message: 'Creating pull request...' })
              const prTitleToUse = prTitle.trim() || generatePRTitle(targetBranch)
              const prResult = await window.electronAPI.createPullRequest({
                title: prTitleToUse,
                body: prBody.trim() || undefined,
                headBranch: targetBranch,
                draft: prDraft,
                web: false,
              })
              if (prResult.success) {
                finalMessage = `Committed, pushed, and created PR for ${targetBranch}`
              } else {
                // PR creation failed but commit+push succeeded
                onStatusChange({
                  type: 'error',
                  message: `Committed and pushed, but PR creation failed: ${prResult.message}`,
                })
                // Reset form state anyway since commit+push worked
                setCommitMessage('')
                setCommitDescription('')
                setBehindPrompt(null)
                if (fullBranchName) {
                  setCreateNewBranch(false)
                  setBranchName('')
                }
                setCreatePR(false)
                setPrTitle('')
                setPrBody('')
                setPrDraft(false)
                await onRefresh()
                return
              }
            }
          } else {
            // Commit succeeded but push failed
            onStatusChange({ type: 'error', message: `Committed, but push failed: ${pushResult.message}` })
            setCommitMessage('')
            setCommitDescription('')
            setBehindPrompt(null)
            if (fullBranchName) {
              setCreateNewBranch(false)
              setBranchName('')
            }
            await onRefresh()
            return
          }
        }

        onStatusChange({ type: 'success', message: finalMessage })
        setCommitMessage('')
        setCommitDescription('')
        setBehindPrompt(null)
        // Reset branch creation fields
        if (fullBranchName) {
          setCreateNewBranch(false)
          setBranchName('')
        }
        // Reset PR creation fields
        if (createPR) {
          setCreatePR(false)
          setPrTitle('')
          setPrBody('')
          setPrDraft(false)
        }
        await onRefresh()
      } else if (result.behindCount && result.behindCount > 0) {
        // Origin has moved ahead - prompt user
        setBehindPrompt({ behindCount: result.behindCount })
      } else {
        onStatusChange({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange({ type: 'error', message: (error as Error).message })
    } finally {
      setIsCommitting(false)
    }
  }

  // Pull then commit (aborts if conflicts arise)
  const handlePullThenCommit = async () => {
    setIsPulling(true)
    onStatusChange({ type: 'info', message: 'Pulling latest changes...' })

    try {
      const pullResult = await window.electronAPI.pullCurrentBranch()
      if (pullResult.success && !pullResult.hadConflicts) {
        onStatusChange({ type: 'success', message: pullResult.message })
        setBehindPrompt(null)
        await onRefresh()
        // Now commit with force (we just pulled)
        await handleCommit(true)
      } else if (pullResult.hadConflicts) {
        // Pull succeeded but restoring local changes caused conflicts - don't commit!
        onStatusChange({
          type: 'error',
          message: 'Pull & Commit aborted: conflicts detected. Please resolve them before committing.',
        })
        setBehindPrompt(null)
        await onRefresh()
      } else {
        onStatusChange({ type: 'error', message: pullResult.message })
        setBehindPrompt(null)
      }
    } catch (error) {
      onStatusChange({ type: 'error', message: (error as Error).message })
      setBehindPrompt(null)
    } finally {
      setIsPulling(false)
    }
  }

  // Commit anyway even though behind
  const handleCommitAnyway = async () => {
    setBehindPrompt(null)
    await handleCommit(true)
  }

  // Auto-generate PR title from branch name
  const generatePRTitle = (branch: string) => {
    return branch
      .replace(/^(feature|bugfix|hotfix)\//, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  // File status helpers
  const getFileStatusIcon = (status: UncommittedFile['status']) => {
    switch (status) {
      case 'added':
        return '+'
      case 'deleted':
        return '−'
      case 'modified':
        return '●'
      case 'renamed':
        return '→'
      case 'untracked':
        return '?'
      default:
        return '?'
    }
  }

  const getFileStatusClass = (status: UncommittedFile['status']) => {
    switch (status) {
      case 'added':
        return 'file-added'
      case 'deleted':
        return 'file-deleted'
      case 'modified':
        return 'file-modified'
      case 'renamed':
        return 'file-renamed'
      case 'untracked':
        return 'file-untracked'
      default:
        return ''
    }
  }

  return (
    <div className="staging-panel">
      {/* Header */}
      <div className="staging-header">
        <div className="staging-title">
          <span className="detail-type-badge uncommitted">Changes</span>
          <span className="staging-stats">
            <span className="diff-additions">+{workingStatus.additions}</span>
            <span className="diff-deletions">-{workingStatus.deletions}</span>
          </span>
        </div>
      </div>

      {/* File Lists */}
      <div className="staging-files">
        {/* Staged Section */}
        <div className="staging-section">
          <div className="staging-section-header">
            <span className="staging-section-title">Staged</span>
            <span className="staging-section-count">{stagedFiles.length}</span>
            {stagedFiles.length > 0 && (
              <button className="staging-action-btn" onClick={handleUnstageAll} title="Unstage all">
                Unstage All ↓
              </button>
            )}
          </div>
          {stagedFiles.length > 0 ? (
            <ul className="staging-file-list">
              {stagedFiles.map((file) => (
                <li
                  key={file.path}
                  className={`staging-file-item ${getFileStatusClass(file.status)} ${selectedFile?.path === file.path && selectedFile.staged ? 'selected' : ''}`}
                  onClick={() => setSelectedFile(file)}
                >
                  <span className="file-status-icon">{getFileStatusIcon(file.status)}</span>
                  <span className="file-path" title={file.path}>
                    {file.path}
                  </span>
                  <button
                    className="file-action-btn unstage"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleUnstageFile(file)
                    }}
                    title="Unstage file"
                  >
                    −
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="staging-empty">No staged changes</div>
          )}
        </div>

        {/* Unstaged Section */}
        <div className="staging-section">
          <div className="staging-section-header">
            <span className="staging-section-title">Unstaged</span>
            <span className="staging-section-count">{unstagedFiles.length}</span>
            {unstagedFiles.length > 0 && (
              <button className="staging-action-btn" onClick={handleStageAll} title="Stage all">
                Stage All ↑
              </button>
            )}
          </div>
          {unstagedFiles.length > 0 ? (
            <ul className="staging-file-list">
              {unstagedFiles.map((file) => (
                <li
                  key={file.path}
                  className={`staging-file-item ${getFileStatusClass(file.status)} ${selectedFile?.path === file.path && !selectedFile.staged ? 'selected' : ''}`}
                  onClick={() => setSelectedFile(file)}
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
                >
                  <span className="file-status-icon">{getFileStatusIcon(file.status)}</span>
                  <span className="file-path" title={file.path}>
                    {file.path}
                  </span>
                  <button
                    className="file-action-btn stage"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStageFile(file)
                    }}
                    title="Stage file"
                  >
                    ✓
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="staging-empty">No unstaged changes</div>
          )}
        </div>
      </div>

      {/* File Context Menu */}
      {fileContextMenu && (
        <div ref={fileMenuRef} className="context-menu" style={{ left: fileContextMenu.x, top: fileContextMenu.y }}>
          <button
            className="context-menu-item"
            onClick={() => {
              handleStageFile(fileContextMenu.file)
              setFileContextMenu(null)
            }}
          >
            Stage
          </button>
          <button className="context-menu-item" onClick={() => handleDiscardFile(fileContextMenu.file)}>
            Discard Changes
          </button>
        </div>
      )}

      {/* Diff Preview */}
      {selectedFile && (
        <div className="staging-diff">
          <div className="staging-diff-header">
            <span className="staging-diff-title">{selectedFile.path}</span>
            {fileDiff && (
              <span className="staging-diff-stats">
                <span className="diff-additions">+{fileDiff.additions}</span>
                <span className="diff-deletions">-{fileDiff.deletions}</span>
              </span>
            )}
          </div>
          <div className="staging-diff-content">
            {loadingDiff ? (
              <div className="staging-diff-loading">Loading diff...</div>
            ) : fileDiff?.isBinary ? (
              <div className="staging-diff-binary">Binary file</div>
            ) : fileDiff?.hunks.length === 0 ? (
              <div className="staging-diff-empty">No changes to display</div>
            ) : fileDiff ? (
              fileDiff.hunks.map((hunk, hunkIdx) => (
                <div key={hunkIdx} className="staging-hunk">
                  <div className="staging-hunk-header">{hunk.header}</div>
                  <div className="staging-hunk-lines">
                    {hunk.lines.map((line, lineIdx) => (
                      <div key={lineIdx} className={`staging-diff-line diff-line-${line.type}`}>
                        <span className="diff-line-number old">{line.oldLineNumber || ''}</span>
                        <span className="diff-line-number new">{line.newLineNumber || ''}</span>
                        <span className="diff-line-prefix">
                          {line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}
                        </span>
                        <span className="diff-line-content">{line.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="staging-diff-empty">Select a file to view diff</div>
            )}
          </div>
        </div>
      )}

      {/* Commit Form */}
      <div className="staging-commit">
        <input
          type="text"
          className="commit-summary-input"
          placeholder="Commit message (required)"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          maxLength={72}
        />
        <textarea
          className="commit-description-input"
          placeholder="Description (optional)"
          value={commitDescription}
          onChange={(e) => setCommitDescription(e.target.value)}
          rows={3}
        />
        {/* New Branch Option */}
        <div className="commit-options">
          <label className="commit-option-checkbox">
            <input
              type="checkbox"
              checked={createNewBranch}
              onChange={(e) => setCreateNewBranch(e.target.checked)}
            />
            <span>Create new branch</span>
          </label>
        </div>
        {createNewBranch && (
          <div className="new-branch-fields">
            <div className="branch-folder-row">
              <select
                className="branch-folder-select"
                value={branchFolder}
                onChange={(e) => setBranchFolder(e.target.value)}
              >
                <option value="feature">feature/</option>
                <option value="bugfix">bugfix/</option>
                <option value="hotfix">hotfix/</option>
                <option value="custom">custom...</option>
              </select>
              {branchFolder === 'custom' && (
                <input
                  type="text"
                  className="branch-custom-folder"
                  placeholder="folder"
                  value={customFolder}
                  onChange={(e) => setCustomFolder(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
                />
              )}
              <span className="branch-separator">/</span>
              <input
                type="text"
                className="branch-name-input"
                placeholder="branch-name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
              />
            </div>
            {fullBranchName && (
              <div className="branch-preview">
                → <code>{fullBranchName}</code>
              </div>
            )}
          </div>
        )}
        <div className="commit-options">
          <label className="commit-option-checkbox">
            <input type="checkbox" checked={pushAfterCommit} onChange={(e) => setPushAfterCommit(e.target.checked)} />
            <span>
              Push to <code>{fullBranchName || currentBranch || 'remote'}</code> after commit
            </span>
          </label>
        </div>

        {/* Create PR Option - only show when pushing and not on main/master */}
        {pushAfterCommit && !['main', 'master'].includes(fullBranchName || currentBranch) && (
          <>
            <div className="commit-options">
              <label className="commit-option-checkbox">
                <input type="checkbox" checked={createPR} onChange={(e) => setCreatePR(e.target.checked)} />
                <span>Create Pull Request after push</span>
              </label>
            </div>
            {createPR && (
              <div className="pr-inline-fields">
                <input
                  type="text"
                  className="pr-inline-title"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  placeholder={`PR title (default: ${generatePRTitle(fullBranchName || currentBranch)})`}
                />
                <textarea
                  className="pr-inline-body"
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                />
                <label className="commit-option-checkbox pr-draft-checkbox">
                  <input type="checkbox" checked={prDraft} onChange={(e) => setPrDraft(e.target.checked)} />
                  <span>Create as draft</span>
                </label>
              </div>
            )}
          </>
        )}

        {/* Behind Origin Prompt */}
        {behindPrompt && (
          <div className="behind-prompt">
            <div className="behind-prompt-message">
              ⚠️ Origin has {behindPrompt.behindCount} new commit
              {behindPrompt.behindCount > 1 ? 's' : ''}
            </div>
            <div className="behind-prompt-actions">
              <button className="btn btn-primary" onClick={handlePullThenCommit} disabled={isPulling || isCommitting}>
                {isPulling ? 'Pulling...' : 'Pull & Commit'}
              </button>
              <button className="btn btn-secondary" onClick={handleCommitAnyway} disabled={isPulling || isCommitting}>
                Commit Anyway
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setBehindPrompt(null)}
                disabled={isPulling || isCommitting}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!behindPrompt && (
          <button
            className="btn btn-primary commit-btn"
            onClick={() => handleCommit()}
            disabled={
              !commitMessage.trim() ||
              stagedFiles.length === 0 ||
              isCommitting ||
              (createNewBranch && !branchName.trim()) ||
              (createNewBranch && branchFolder === 'custom' && !customFolder.trim())
            }
          >
            {isCommitting
              ? createPR
                ? 'Creating PR...'
                : fullBranchName
                  ? 'Creating branch...'
                  : pushAfterCommit
                    ? 'Committing & Pushing...'
                    : 'Committing...'
              : fullBranchName
                ? pushAfterCommit
                  ? createPR
                    ? 'Branch → Commit → Push → PR'
                    : 'Create Branch & Commit & Push'
                  : 'Create Branch & Commit'
                : pushAfterCommit
                  ? createPR
                    ? 'Commit → Push → Create PR'
                    : `Commit & Push ${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''}`
                  : `Commit ${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </div>
  )
}

// ========================================
// PR Review Panel Component
// ========================================

interface PRReviewPanelProps {
  pr: PullRequest
  formatRelativeTime: (date: string) => string
  onCheckout?: (pr: PullRequest) => void
  onPRMerged?: () => void
  switching?: boolean
}

type PRTab = 'conversation' | 'files' | 'commits'

// Known AI/bot authors
const AI_AUTHORS = ['copilot', 'github-actions', 'dependabot', 'renovate', 'coderabbit', 'vercel', 'netlify', 'codecov']

function isAIAuthor(login: string): boolean {
  const lower = login.toLowerCase()
  return AI_AUTHORS.some((ai) => lower.includes(ai)) || lower.endsWith('[bot]') || lower.endsWith('-bot')
}

function PRReviewPanel({ pr, formatRelativeTime, onCheckout, onPRMerged, switching }: PRReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<PRTab>('conversation')
  const [prDetail, setPrDetail] = useState<PRDetail | null>(null)
  const [reviewComments, setReviewComments] = useState<PRReviewComment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState<string | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [showAIComments, setShowAIComments] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentStatus, setCommentStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [mergingPR, setMergingPR] = useState(false)

  // Load full PR details
  const loadPRDetail = async () => {
    setLoading(true)
    try {
      const [detail, comments] = await Promise.all([
        window.electronAPI.getPRDetail(pr.number),
        window.electronAPI.getPRReviewComments(pr.number),
      ])
      setPrDetail(detail)
      setReviewComments(comments)
    } catch (error) {
      console.error('Error loading PR detail:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPRDetail()
  }, [pr.number])

  // Submit a comment
  const handleSubmitComment = async () => {
    if (!commentText.trim() || submittingComment) return

    setSubmittingComment(true)
    setCommentStatus(null)

    try {
      const result = await window.electronAPI.commentOnPR(pr.number, commentText.trim())

      if (result.success) {
        setCommentText('')
        setCommentStatus({ type: 'success', message: 'Comment added!' })
        // Reload PR details to show the new comment
        await loadPRDetail()
        // Clear success message after a delay
        setTimeout(() => setCommentStatus(null), 3000)
      } else {
        setCommentStatus({ type: 'error', message: result.message })
      }
    } catch (error) {
      setCommentStatus({ type: 'error', message: (error as Error).message })
    } finally {
      setSubmittingComment(false)
    }
  }

  // Merge PR
  const handleMergePR = async () => {
    if (mergingPR) return

    setMergingPR(true)
    setCommentStatus(null)

    try {
      const result = await window.electronAPI.mergePR(pr.number, 'squash')

      if (result.success) {
        setCommentStatus({ type: 'success', message: 'PR merged!' })
        // Reload PR details to show updated status
        await loadPRDetail()
        // Notify parent to refresh PR list
        if (onPRMerged) onPRMerged()
        setTimeout(() => setCommentStatus(null), 3000)
      } else {
        setCommentStatus({ type: 'error', message: result.message })
      }
    } catch (error) {
      setCommentStatus({ type: 'error', message: (error as Error).message })
    } finally {
      setMergingPR(false)
    }
  }

  // Load file diff when selected
  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null)
      return
    }

    const loadDiff = async () => {
      setLoadingDiff(true)
      try {
        const diff = await window.electronAPI.getPRFileDiff(pr.number, selectedFile)
        setFileDiff(diff)
      } catch (_error) {
        setFileDiff(null)
      } finally {
        setLoadingDiff(false)
      }
    }

    loadDiff()
  }, [pr.number, selectedFile])

  // Filter comments by AI/human
  const filteredComments = useMemo(() => {
    if (!prDetail) return []
    if (showAIComments) return prDetail.comments
    return prDetail.comments.filter((c) => !isAIAuthor(c.author.login))
  }, [prDetail, showAIComments])

  const filteredReviews = useMemo(() => {
    if (!prDetail) return []
    if (showAIComments) return prDetail.reviews
    return prDetail.reviews.filter((r) => !isAIAuthor(r.author.login))
  }, [prDetail, showAIComments])

  // Count AI vs human comments
  const aiCommentCount = useMemo(() => {
    if (!prDetail) return 0
    return (
      prDetail.comments.filter((c) => isAIAuthor(c.author.login)).length +
      prDetail.reviews.filter((r) => isAIAuthor(r.author.login)).length
    )
  }, [prDetail])

  const humanCommentCount = useMemo(() => {
    if (!prDetail) return 0
    return (
      prDetail.comments.filter((c) => !isAIAuthor(c.author.login)).length +
      prDetail.reviews.filter((r) => !isAIAuthor(r.author.login)).length
    )
  }, [prDetail])

  // Get review comments for a specific file
  const getFileComments = (filePath: string) => {
    return reviewComments.filter((c) => c.path === filePath)
  }

  // Get review state badge
  const getReviewStateBadge = (state: string) => {
    switch (state) {
      case 'APPROVED':
        return <span className="pr-review-badge approved">Approved</span>
      case 'CHANGES_REQUESTED':
        return <span className="pr-review-badge changes">Changes Requested</span>
      case 'COMMENTED':
        return <span className="pr-review-badge commented">Commented</span>
      case 'DISMISSED':
        return <span className="pr-review-badge dismissed">Dismissed</span>
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="pr-review-panel">
        <div className="pr-review-loading">Loading PR details...</div>
      </div>
    )
  }

  if (!prDetail) {
    return (
      <div className="pr-review-panel">
        <div className="pr-review-error">Could not load PR details</div>
      </div>
    )
  }

  return (
    <div className="pr-review-panel">
      {/* Header */}
      <div className="pr-review-header">
        <div className="detail-type-badge">Pull Request</div>
        <div className="pr-review-title-row">
          <h3 className="pr-review-title">{prDetail.title}</h3>
          {prDetail.reviewDecision && getReviewStateBadge(prDetail.reviewDecision)}
        </div>
        <div className="pr-review-meta">
          <span className="pr-review-branch">
            <code>{prDetail.headRefName}</code>
            <span className="pr-arrow">→</span>
            <code>{prDetail.baseRefName}</code>
          </span>
          <span className="pr-review-author">@{prDetail.author.login}</span>
          <span className="pr-review-time">{formatRelativeTime(prDetail.updatedAt)}</span>
          <span className="pr-review-stats">
            <span className="diff-additions">+{prDetail.additions}</span>
            <span className="diff-deletions">-{prDetail.deletions}</span>
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="detail-actions">
        {onCheckout && (
          <button
            className="btn btn-primary"
            onClick={() => onCheckout(pr)}
            disabled={switching}
          >
            {switching ? 'Checking out...' : 'Checkout Branch'}
          </button>
        )}
        <button
          className="btn btn-secondary"
          onClick={() => window.electronAPI.openPullRequest(pr.url)}
        >
          View on GitHub
        </button>
        <button
          className="btn btn-primary"
          onClick={handleMergePR}
          disabled={mergingPR || prDetail.state === 'MERGED'}
        >
          {mergingPR ? 'Merging...' : prDetail.state === 'MERGED' ? '✓ Merged' : 'Merge PR'}
        </button>
      </div>

      {/* Tabs */}
      <div className="pr-review-tabs">
        <button
          className={`pr-tab ${activeTab === 'conversation' ? 'active' : ''}`}
          onClick={() => setActiveTab('conversation')}
        >
          Conversation
          <span className="pr-tab-count">{filteredComments.length + filteredReviews.length}</span>
        </button>
        <button className={`pr-tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
          Files
          <span className="pr-tab-count">{prDetail.files.length}</span>
        </button>
        <button className={`pr-tab ${activeTab === 'commits' ? 'active' : ''}`} onClick={() => setActiveTab('commits')}>
          Commits
          <span className="pr-tab-count">{prDetail.commits.length}</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="pr-review-content">
        {/* Conversation Tab */}
        {activeTab === 'conversation' && (
          <div className="pr-conversation">
            {/* AI Filter Toggle */}
            <div className="pr-filter-bar">
              <label className="pr-filter-toggle">
                <input type="checkbox" checked={showAIComments} onChange={(e) => setShowAIComments(e.target.checked)} />
                <span>Show AI comments</span>
              </label>
              <span className="pr-filter-counts">
                <span className="human-count">👤 {humanCommentCount}</span>
                <span className="ai-count">🤖 {aiCommentCount}</span>
              </span>
            </div>

            {/* PR Body */}
            {prDetail.body && (
              <div className="pr-comment pr-body">
                <div className="pr-comment-header">
                  <span className="pr-comment-author">@{prDetail.author.login}</span>
                  <span className="pr-comment-time">{formatRelativeTime(prDetail.createdAt)}</span>
                </div>
                <div className="pr-comment-body">{prDetail.body}</div>
              </div>
            )}

            {/* Reviews and Comments (chronological) */}
            {[...filteredReviews, ...filteredComments]
              .sort((a, b) => {
                const dateA = new Date('submittedAt' in a ? a.submittedAt : a.createdAt)
                const dateB = new Date('submittedAt' in b ? b.submittedAt : b.createdAt)
                return dateA.getTime() - dateB.getTime()
              })
              .map((item, idx) => {
                const isReview = 'state' in item
                const author = item.author.login
                const isAI = isAIAuthor(author)
                const date = isReview ? (item as any).submittedAt : (item as any).createdAt

                return (
                  <div key={idx} className={`pr-comment ${isAI ? 'ai-comment' : ''} ${isReview ? 'pr-review' : ''}`}>
                    <div className="pr-comment-header">
                      <span className="pr-comment-author">
                        {isAI && <span className="ai-badge">🤖</span>}@{author}
                      </span>
                      {isReview && getReviewStateBadge((item as any).state)}
                      <span className="pr-comment-time">{formatRelativeTime(date)}</span>
                    </div>
                    {item.body && <div className="pr-comment-body">{item.body}</div>}
                  </div>
                )
              })}

            {filteredComments.length === 0 && filteredReviews.length === 0 && !prDetail.body && (
              <div className="pr-empty">No comments yet</div>
            )}

            {/* Add Comment Form */}
            <div className="pr-comment-form">
              <textarea
                className="pr-comment-input"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmitComment()
                  }
                }}
              />
              <div className="pr-comment-form-footer">
                {commentStatus && (
                  <span className={`pr-comment-status ${commentStatus.type}`}>{commentStatus.message}</span>
                )}
                <span className="pr-comment-hint">⌘+Enter to submit</span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSubmitComment}
                  disabled={!commentText.trim() || submittingComment}
                >
                  {submittingComment ? 'Posting...' : 'Comment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Files Tab */}
        {activeTab === 'files' && (
          <div className="pr-files">
            <div className="pr-files-list">
              {prDetail.files.map((file) => {
                const fileComments = getFileComments(file.path)
                return (
                  <div
                    key={file.path}
                    className={`pr-file-item ${selectedFile === file.path ? 'selected' : ''}`}
                    onClick={() => setSelectedFile(file.path)}
                  >
                    <span className="pr-file-path">{file.path}</span>
                    <span className="pr-file-stats">
                      <span className="diff-additions">+{file.additions}</span>
                      <span className="diff-deletions">-{file.deletions}</span>
                      {fileComments.length > 0 && <span className="pr-file-comments">💬 {fileComments.length}</span>}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* File Diff Preview */}
            {selectedFile && (
              <div className="pr-file-diff">
                <div className="pr-file-diff-header">
                  <span>{selectedFile}</span>
                  <a
                    href={`${pr.url}/files#diff-${selectedFile.replace(/[^a-zA-Z0-9]/g, '')}`}
                    onClick={(e) => {
                      e.preventDefault()
                      window.electronAPI.openPullRequest(`${pr.url}/files`)
                    }}
                    className="pr-view-on-github"
                  >
                    View on GitHub
                  </a>
                </div>
                <div className="pr-file-diff-content">
                  {loadingDiff ? (
                    <div className="pr-diff-loading">Loading diff...</div>
                  ) : fileDiff ? (
                    <pre className="pr-diff-code">{fileDiff}</pre>
                  ) : (
                    <div className="pr-diff-empty">Could not load diff</div>
                  )}
                </div>

                {/* Inline Review Comments */}
                {getFileComments(selectedFile).length > 0 && (
                  <div className="pr-inline-comments">
                    <div className="pr-inline-comments-header">
                      💬 Review Comments ({getFileComments(selectedFile).length})
                    </div>
                    {getFileComments(selectedFile).map((comment) => (
                      <div
                        key={comment.id}
                        className={`pr-inline-comment ${isAIAuthor(comment.author.login) ? 'ai-comment' : ''}`}
                      >
                        <div className="pr-inline-comment-header">
                          <span className="pr-comment-author">
                            {isAIAuthor(comment.author.login) && <span className="ai-badge">🤖</span>}@
                            {comment.author.login}
                          </span>
                          {comment.line && <span className="pr-comment-line">Line {comment.line}</span>}
                          <span className="pr-comment-time">{formatRelativeTime(comment.createdAt)}</span>
                        </div>
                        <div className="pr-inline-comment-body">{comment.body}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Commits Tab */}
        {activeTab === 'commits' && (
          <div className="pr-commits">
            {prDetail.commits.map((commit) => (
              <div key={commit.oid} className="pr-commit-item">
                <code className="pr-commit-hash">{commit.oid.slice(0, 7)}</code>
                <span className="pr-commit-message">{commit.messageHeadline}</span>
                <span className="pr-commit-author">{commit.author.name}</span>
                <span className="pr-commit-time">{formatRelativeTime(commit.committedDate)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ========================================
// Worktree Detail Panel Component
// ========================================

interface WorktreeDetailPanelProps {
  worktree: Worktree
  currentBranch: string
  switching?: boolean
  onStatusChange?: (status: StatusMessage | null) => void
  onRefresh?: () => Promise<void>
  onClearFocus?: () => void
  onCheckoutWorktree?: (worktree: Worktree) => void
}

function WorktreeDetailPanel({
  worktree,
  currentBranch,
  switching,
  onStatusChange,
  onRefresh,
  onClearFocus,
  onCheckoutWorktree,
}: WorktreeDetailPanelProps) {
  const [actionInProgress, setActionInProgress] = useState(false)

  const isWorkingFolder = worktree.agent === 'working-folder'
  const isCurrent = worktree.branch === currentBranch
  const hasChanges = worktree.changedFileCount > 0 || worktree.additions > 0 || worktree.deletions > 0

  const handleApply = async () => {
    if (!hasChanges) {
      onStatusChange?.({ type: 'info', message: 'No changes to apply - worktree is clean' })
      return
    }

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Applying changes from ${worktree.displayName}...` })

    try {
      const result = await window.electronAPI.applyWorktreeChanges(worktree.path)
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        await onRefresh?.()
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setActionInProgress(false)
    }
  }

  const handleCreateBranch = async () => {
    if (!hasChanges) {
      onStatusChange?.({ type: 'info', message: 'No changes to convert - worktree is clean' })
      return
    }

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Creating branch from ${worktree.displayName}...` })

    try {
      const result = await window.electronAPI.convertWorktreeToBranch(worktree.path)
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        await onRefresh?.()
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setActionInProgress(false)
    }
  }

  const handleOpenInFinder = async () => {
    await window.electronAPI.openWorktree(worktree.path)
  }

  const handleRemove = async (force: boolean = false) => {
    const confirmMsg = force
      ? `Force remove worktree "${worktree.displayName}"? This will discard any uncommitted changes.`
      : `Remove worktree "${worktree.displayName}"?`
    if (!confirm(confirmMsg)) return

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Removing worktree...` })

    try {
      const result = await window.electronAPI.removeWorktree(worktree.path, force)
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        onClearFocus?.()
        await onRefresh?.()
      } else {
        // If it failed due to uncommitted changes, offer to force
        if (result.message.includes('uncommitted changes') && !force) {
          setActionInProgress(false)
          if (confirm(`${result.message}\n\nDo you want to force remove and discard changes?`)) {
            await handleRemove(true)
          }
        } else {
          onStatusChange?.({ type: 'error', message: result.message })
        }
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setActionInProgress(false)
    }
  }

  // Special rendering for Working Folder
  if (isWorkingFolder) {
    return (
      <div className="sidebar-detail-panel">
        <div className="detail-type-badge working-folder-badge">Working Folder</div>
        <h3 className="detail-title">{worktree.displayName}</h3>
        <div className="detail-meta-grid">
          <div className="detail-meta-item full-width">
            <span className="meta-label">Path</span>
            <code className="meta-value path">{worktree.path}</code>
          </div>
          {worktree.branch && (
            <div className="detail-meta-item">
              <span className="meta-label">Branch</span>
              <code className="meta-value">{worktree.branch}</code>
            </div>
          )}
          <div className="detail-meta-item">
            <span className="meta-label">Status</span>
            <span className="meta-value working-folder-status">Active</span>
          </div>
          <div className="detail-meta-item">
            <span className="meta-label">Changes</span>
            <span className="meta-value">
              {hasChanges ? (
                <>
                  {worktree.changedFileCount} {worktree.changedFileCount === 1 ? 'file' : 'files'}
                  {(worktree.additions > 0 || worktree.deletions > 0) && (
                    <>
                      {' · '}
                      <span className="diff-additions">+{worktree.additions}</span>{' '}
                      <span className="diff-deletions">-{worktree.deletions}</span>
                    </>
                  )}
                </>
              ) : (
                'Clean'
              )}
            </span>
          </div>
        </div>

        <div className="working-folder-explainer">
          <p>
            This is your main working directory. You're already using worktrees—each worktree is just another folder
            where you can work on a different branch simultaneously.
          </p>
        </div>

        <div className="detail-actions worktree-actions">
          <button className="btn btn-primary" onClick={handleOpenInFinder}>
            Open in Finder
          </button>
        </div>
      </div>
    )
  }

  // Detached HEAD = no branch, needs rescue
  const isDetached = !worktree.branch

  return (
    <div className="sidebar-detail-panel">
      <div className="detail-type-badge">{isDetached ? 'Detached Worktree' : 'Worktree'}</div>
      <h3 className="detail-title">{worktree.branch || worktree.displayName}</h3>
      {worktree.branch && (
        <div className="detail-subtitle">{worktree.displayName}</div>
      )}
      <div className="detail-meta-grid">
        {worktree.branch && (
          <div className="detail-meta-item full-width">
            <span className="meta-label">Branch</span>
            <code className="meta-value">{worktree.branch}</code>
          </div>
        )}
        <div className="detail-meta-item full-width">
          <span className="meta-label">Path</span>
          <code className="meta-value path">{worktree.path}</code>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Status</span>
          <span className="meta-value">{isCurrent ? 'Current' : isDetached ? 'Detached HEAD' : 'Not checked out'}</span>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Changes</span>
          <span className="meta-value">
            {hasChanges ? (
              <>
                {worktree.changedFileCount} {worktree.changedFileCount === 1 ? 'file' : 'files'}
                {(worktree.additions > 0 || worktree.deletions > 0) && (
                  <>
                    {' · '}
                    <span className="diff-additions">+{worktree.additions}</span>{' '}
                    <span className="diff-deletions">-{worktree.deletions}</span>
                  </>
                )}
              </>
            ) : (
              'Clean'
            )}
          </span>
        </div>
        {/* Activity status for agent worktrees */}
        {worktree.agent !== 'unknown' && worktree.agent !== 'working-folder' && (
          <div className="detail-meta-item">
            <span className="meta-label">Activity</span>
            <span className={`meta-value activity-status activity-${worktree.activityStatus}`}>
              {worktree.activityStatus === 'active' && '● Active now'}
              {worktree.activityStatus === 'recent' && '◐ Recent (< 1 hour)'}
              {worktree.activityStatus === 'stale' && '○ Stale (> 1 hour)'}
              {worktree.activityStatus === 'unknown' && '○ Inactive'}
            </span>
          </div>
        )}
      </div>

      {/* Show agent task hint for Cursor agents */}
      {worktree.agent === 'cursor' && worktree.agentTaskHint && (
        <div className="agent-task-callout">
          <div className="agent-task-header">
            <span className="agent-task-icon">🤖</span>
            <span className="agent-task-label">Agent Task</span>
          </div>
          <p className="agent-task-content">{worktree.agentTaskHint}</p>
        </div>
      )}

      {/* Show WIP callout for worktrees with a branch and uncommitted changes */}
      {worktree.branch && hasChanges && (
        <div className="worktree-wip-callout">
          <div className="wip-header">
            <span className="wip-icon">✎</span>
            <span className="wip-title">Uncommitted work on {worktree.branch}</span>
          </div>
          <p className="wip-description">
            This worktree has changes ready to commit. Checkout to continue working, or apply the changes to your current branch.
          </p>
        </div>
      )}

      {/* Show rescue callout for detached worktrees with changes */}
      {isDetached && hasChanges && (
        <div className="worktree-rescue-callout">
          <div className="rescue-header">
            <span className="rescue-icon">⚠</span>
            <span className="rescue-title">Orphaned changes (no branch)</span>
          </div>
          <p className="rescue-description">
            This worktree is on a detached HEAD. Use "Create Branch" to rescue these changes into a proper branch.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="detail-actions worktree-actions">
        {/* Checkout - only for worktrees with a branch, not current */}
        {!isCurrent && worktree.branch && onCheckoutWorktree && (
          <button
            className="btn btn-primary"
            onClick={() => onCheckoutWorktree(worktree)}
            disabled={actionInProgress || switching}
          >
            {switching ? 'Checking out...' : 'Checkout'}
          </button>
        )}

        {/* Create Branch - only for detached worktrees (rescue operation) */}
        {isDetached && (
          <button
            className="btn btn-primary"
            onClick={handleCreateBranch}
            disabled={actionInProgress || !hasChanges}
            title={hasChanges ? 'Rescue changes into a new branch' : 'No changes to rescue'}
          >
            Create Branch
          </button>
        )}

        {/* Apply - available for all worktrees with changes */}
        <button
          className="btn btn-secondary"
          onClick={handleApply}
          disabled={actionInProgress || !hasChanges}
          title={hasChanges ? 'Apply changes to main repo' : 'No changes to apply'}
        >
          Apply
        </button>

        <button className="btn btn-secondary" onClick={handleOpenInFinder} disabled={actionInProgress}>
          Open in Finder
        </button>

        {!isCurrent && (
          <button className="btn btn-secondary" onClick={() => handleRemove(false)} disabled={actionInProgress}>
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

// ========================================
// Stash Detail Panel Component
// ========================================

interface StashDetailPanelProps {
  stash: StashEntry
  formatRelativeTime: (date: string) => string
  onStatusChange?: (status: StatusMessage | null) => void
  onRefresh?: () => Promise<void>
  onClearFocus?: () => void
}

function StashDetailPanel({
  stash,
  formatRelativeTime,
  onStatusChange,
  onRefresh,
  onClearFocus,
}: StashDetailPanelProps) {
  const [files, setFiles] = useState<StashFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState<string | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [actionInProgress, setActionInProgress] = useState(false)
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [branchName, setBranchName] = useState('')

  // Handle Apply stash
  const handleApply = async () => {
    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Applying stash@{${stash.index}}...` })

    try {
      const result = await window.electronAPI.applyStash(stash.index)
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        await onRefresh?.()
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setActionInProgress(false)
    }
  }

  // Handle Drop stash
  const handleDrop = async () => {
    if (!confirm(`Drop stash@{${stash.index}}? This cannot be undone.`)) return

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Dropping stash@{${stash.index}}...` })

    try {
      const result = await window.electronAPI.dropStash(stash.index)
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        onClearFocus?.()
        await onRefresh?.()
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setActionInProgress(false)
    }
  }

  // Handle Create branch from stash
  const handleCreateBranch = async () => {
    if (!branchName.trim()) return

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Creating branch '${branchName}' from stash...` })

    try {
      const result = await window.electronAPI.stashToBranch(stash.index, branchName.trim())
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        setShowBranchModal(false)
        setBranchName('')
        onClearFocus?.()
        await onRefresh?.()
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setActionInProgress(false)
    }
  }

  // Load stash files
  useEffect(() => {
    const loadFiles = async () => {
      setLoading(true)
      try {
        const stashFiles = await window.electronAPI.getStashFiles(stash.index)
        setFiles(stashFiles)
      } catch (error) {
        console.error('Error loading stash files:', error)
        setFiles([])
      } finally {
        setLoading(false)
      }
    }

    loadFiles()
    setSelectedFile(null)
    setFileDiff(null)
  }, [stash.index])

  // Load file diff when selected
  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null)
      return
    }

    const loadDiff = async () => {
      setLoadingDiff(true)
      try {
        const diff = await window.electronAPI.getStashFileDiff(stash.index, selectedFile)
        setFileDiff(diff)
      } catch (_error) {
        setFileDiff(null)
      } finally {
        setLoadingDiff(false)
      }
    }

    loadDiff()
  }, [stash.index, selectedFile])

  const getStatusIcon = (status: StashFile['status']) => {
    switch (status) {
      case 'added':
        return 'A'
      case 'modified':
        return 'M'
      case 'deleted':
        return 'D'
      case 'renamed':
        return 'R'
      default:
        return '?'
    }
  }

  const getStatusClass = (status: StashFile['status']) => {
    switch (status) {
      case 'added':
        return 'status-added'
      case 'modified':
        return 'status-modified'
      case 'deleted':
        return 'status-deleted'
      case 'renamed':
        return 'status-renamed'
      default:
        return ''
    }
  }

  return (
    <div className="stash-detail-panel">
      {/* Header */}
      <div className="stash-header">
        <div className="detail-type-badge">Stash</div>
        <h3 className="stash-title">{stash.message || `Stash ${stash.index}`}</h3>
        <div className="stash-meta">
          {stash.branch && <code className="stash-branch">{stash.branch}</code>}
          <span className="stash-date">{formatRelativeTime(stash.date)}</span>
        </div>
      </div>

      {/* Files List */}
      <div className="stash-files">
        <div className="stash-files-header">
          Changed Files
          <span className="stash-files-count">{files.length}</span>
        </div>
        {loading ? (
          <div className="stash-loading">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="stash-empty">No files in stash</div>
        ) : (
          <ul className="stash-files-list">
            {files.map((file) => (
              <li
                key={file.path}
                className={`stash-file-item ${getStatusClass(file.status)} ${selectedFile === file.path ? 'selected' : ''}`}
                onClick={() => setSelectedFile(file.path)}
              >
                <span className={`stash-file-status ${getStatusClass(file.status)}`}>{getStatusIcon(file.status)}</span>
                <span className="stash-file-path" title={file.path}>
                  {file.path}
                </span>
                <span className="stash-file-stats">
                  <span className="diff-additions">+{file.additions}</span>
                  <span className="diff-deletions">-{file.deletions}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Diff Preview */}
      {selectedFile && (
        <div className="stash-diff">
          <div className="stash-diff-header">
            <span className="stash-diff-title">{selectedFile}</span>
          </div>
          <div className="stash-diff-content">
            {loadingDiff ? (
              <div className="stash-diff-loading">Loading diff...</div>
            ) : fileDiff ? (
              <pre className="stash-diff-code">{fileDiff}</pre>
            ) : (
              <div className="stash-diff-empty">Could not load diff</div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="stash-actions">
        <button className="btn btn-primary" onClick={handleApply} disabled={actionInProgress}>
          Apply
        </button>
        <button className="btn btn-secondary" onClick={() => setShowBranchModal(true)} disabled={actionInProgress}>
          Create Branch
        </button>
        <button className="btn btn-danger" onClick={handleDrop} disabled={actionInProgress}>
          Drop
        </button>
      </div>

      {/* Create Branch Modal */}
      {showBranchModal && (
        <div className="modal-overlay" onClick={() => setShowBranchModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Branch from Stash</h3>
              <button className="modal-close" onClick={() => setShowBranchModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <label className="modal-label">
                Branch Name
                <input
                  type="text"
                  className="modal-input"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="feature/my-branch"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && branchName.trim()) {
                      handleCreateBranch()
                    }
                  }}
                />
              </label>
              <p className="modal-hint">
                This will create a new branch from the commit where this stash was created, apply the stashed changes,
                and remove the stash.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowBranchModal(false)}
                disabled={actionInProgress}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateBranch}
                disabled={actionInProgress || !branchName.trim()}
              >
                Create Branch
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ========================================
// Create Worktree Panel Component
// ========================================

interface CreateWorktreePanelProps {
  branches: Branch[]
  repoPath: string
  onStatusChange?: (status: StatusMessage | null) => void
  onRefresh?: () => Promise<void>
  onClearFocus?: () => void
  onWorktreeCreated?: (worktreePath: string) => void
}

function CreateWorktreePanel({
  branches,
  repoPath,
  onStatusChange,
  onRefresh,
  onClearFocus,
  onWorktreeCreated,
}: CreateWorktreePanelProps) {
  const [branchMode, setBranchMode] = useState<'new' | 'existing'>('new')
  const [newBranchName, setNewBranchName] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [creating, setCreating] = useState(false)

  // Get repo name for default path suggestion
  const repoName = repoPath ? repoPath.split('/').pop() || 'repo' : 'repo'
  const repoParentDir = repoPath ? repoPath.split('/').slice(0, -1).join('/') : ''

  // Get local branches for dropdown
  const localBranches = branches.filter((b) => !b.isRemote)

  // Compute default folder path when branch name changes
  const branchName = branchMode === 'new' ? newBranchName : selectedBranch
  const sanitizedBranchName = branchName.replace(/\//g, '-').replace(/[^a-zA-Z0-9-_]/g, '')
  const defaultFolderPath = sanitizedBranchName ? `${repoParentDir}/${repoName}--${sanitizedBranchName}` : ''

  // Update folder path when branch changes (if user hasn't manually edited)
  const [folderManuallyEdited, setFolderManuallyEdited] = useState(false)
  
  useEffect(() => {
    if (!folderManuallyEdited && defaultFolderPath) {
      setFolderPath(defaultFolderPath)
    }
  }, [defaultFolderPath, folderManuallyEdited])

  const handleBrowse = async () => {
    const selected = await window.electronAPI.selectWorktreeFolder()
    if (selected) {
      setFolderPath(selected)
      setFolderManuallyEdited(true)
    }
  }

  const handleCreate = async () => {
    const targetBranch = branchMode === 'new' ? newBranchName.trim() : selectedBranch

    if (!targetBranch) {
      onStatusChange?.({ type: 'error', message: 'Please enter a branch name' })
      return
    }

    if (!folderPath.trim()) {
      onStatusChange?.({ type: 'error', message: 'Please select a folder location' })
      return
    }

    setCreating(true)
    onStatusChange?.({ type: 'info', message: `Creating worktree...` })

    try {
      const result = await window.electronAPI.createWorktree({
        branchName: targetBranch,
        isNewBranch: branchMode === 'new',
        folderPath: folderPath.trim(),
      })

      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        await onRefresh?.()
        // Switch to the newly created worktree in the detail panel
        if (result.path) {
          onWorktreeCreated?.(result.path)
        } else {
          onClearFocus?.()
        }
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setCreating(false)
    }
  }

  const handleCancel = () => {
    onClearFocus?.()
  }

  const canCreate =
    (branchMode === 'new' ? newBranchName.trim() : selectedBranch) && folderPath.trim()

  return (
    <div className="sidebar-detail-panel create-worktree-panel">
      <div className="detail-type-badge">New Worktree</div>
      <h3 className="detail-title">Create Worktree</h3>
      <p className="detail-description">Create a new worktree with its own working directory.</p>

      <div className="create-worktree-form">
        {/* Branch Mode Selection */}
        <div className="form-section">
          <label className="form-label">Branch</label>
          <div className="branch-mode-toggle">
            <label className="radio-option">
              <input
                type="radio"
                name="branchMode"
                value="new"
                checked={branchMode === 'new'}
                onChange={() => setBranchMode('new')}
              />
              <span>Create new branch</span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="branchMode"
                value="existing"
                checked={branchMode === 'existing'}
                onChange={() => setBranchMode('existing')}
              />
              <span>Use existing branch</span>
            </label>
          </div>

          {branchMode === 'new' ? (
            <input
              type="text"
              className="form-input"
              placeholder="feature/my-feature"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              autoFocus
            />
          ) : (
            <select
              className="form-select"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              <option value="">Select a branch...</option>
              {localBranches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Folder Location */}
        <div className="form-section">
          <label className="form-label">Folder Location</label>
          <div className="folder-input-row">
            <input
              type="text"
              className="form-input folder-input"
              placeholder="Select folder location..."
              value={folderPath}
              onChange={(e) => {
                setFolderPath(e.target.value)
                setFolderManuallyEdited(true)
              }}
            />
            <button className="btn btn-secondary browse-btn" onClick={handleBrowse}>
              Browse
            </button>
          </div>
          <p className="form-hint">Path will be created if it doesn't exist</p>
        </div>

        {/* Actions */}
        <div className="detail-actions create-worktree-actions">
          <button className="btn btn-secondary" onClick={handleCancel} disabled={creating}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={creating || !canCreate}
          >
            {creating ? 'Creating...' : 'Create Worktree'}
          </button>
        </div>
      </div>
    </div>
  )
}
