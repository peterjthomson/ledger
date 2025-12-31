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
  EditorPanelType,
} from './types/app-types'
import './styles/app.css'
import { useWindowContext } from './components/window'
import { useCanvas, useCanvasNavigation, CanvasRenderer, type CanvasData, type CanvasSelection, type CanvasHandlers, type CanvasUIState } from './components/canvas'
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
  const [deleting, setDeleting] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [showNewBranchModal, setShowNewBranchModal] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [githubUrl, setGithubUrl] = useState<string | null>(null)
  const [themeMode, setThemeMode] = useState<ThemeMode>('light')
  const { setTitle, setTitlebarActions } = useWindowContext()

  // Canvas navigation for global editor state
  const { 
    navigateToEditor, 
    setActiveCanvas, 
    hasEditorSlot,
    state: canvasState,
    currentEditorEntry,
    addColumn,
    removeColumn,
    activeCanvas,
  } = useCanvas()
  const { 
    goBack, 
    goForward, 
    canGoBack, 
    canGoForward 
  } = useCanvasNavigation()

  // Check if Radar canvas has an editor column
  const radarCanvas = canvasState.canvases.find(c => c.id === 'radar')
  const radarHasEditor = radarCanvas?.columns.some(col => col.slotType === 'editor') ?? false

  // Toggle editor column in Radar canvas
  const toggleRadarEditor = useCallback(() => {
    if (radarHasEditor) {
      // Remove editor column from radar
      const editorCol = radarCanvas?.columns.find(col => col.slotType === 'editor')
      if (editorCol) {
        removeColumn('radar', editorCol.id)
      }
    } else {
      // Add editor column to radar
      addColumn('radar', {
        id: 'radar-editor',
        slotType: 'editor',
        panel: 'empty',
        width: 400,
        minWidth: 300,
      })
    }
  }, [radarHasEditor, radarCanvas, removeColumn, addColumn])

  // View mode - derived from active canvas (legacy compat for header toggle)
  const viewMode = canvasState.activeCanvasId as ViewMode
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

  // Filter and sort state (legacy - list panels now manage their own state)
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
  const [stashSearch, setStashSearch] = useState('')

  // Worktree filter state
  const [worktreeParentFilter, setWorktreeParentFilter] = useState<string>('all')

  // Focus view panel state (resizable + collapsible)
  const [sidebarWidth, setSidebarWidth] = useState(220)
  const [detailWidth, setDetailWidth] = useState(400)
  const [graphWidth, setGraphWidth] = useState<number | null>(null) // null = auto-size
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [mainVisible, setMainVisible] = useState(true)
  const [detailVisible, setDetailVisible] = useState(true)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [isResizingDetail, setIsResizingDetail] = useState(false)
  const [isResizingGraph, setIsResizingGraph] = useState(false)
  
  // Sidebar keyboard navigation
  const [sidebarFocusedIndex, setSidebarFocusedIndex] = useState(-1)
  const sidebarRef = useRef<HTMLElement>(null)

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
  const graphResizeStartX = useRef(0)
  const graphResizeStartWidth = useRef(0)
  
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
      if (isResizingGraph) {
        const delta = e.clientX - graphResizeStartX.current
        const newWidth = Math.max(60, graphResizeStartWidth.current + delta)
        setGraphWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizingSidebar(false)
      setIsResizingDetail(false)
      setIsResizingGraph(false)
    }

    if (isResizingSidebar || isResizingDetail || isResizingGraph) {
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
  }, [isResizingSidebar, isResizingDetail, isResizingGraph])

  // Titlebar actions for panel toggles and settings button
  useEffect(() => {
    const actions: JSX.Element[] = []

    // Add Radar mode editor toggle
    if (repoPath && viewMode === 'radar') {
      actions.push(
        <button
          key="editor-toggle"
          className="panel-toggle-btn"
          onClick={toggleRadarEditor}
          title={radarHasEditor ? 'Hide Detail Panel' : 'Show Detail Panel'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor" strokeWidth="1" />
            <rect x="5" y="1" width="6" height="14" fill={radarHasEditor ? 'currentColor' : 'none'} />
          </svg>
        </button>
      )
    }

    // Add Focus mode panel toggles if in focus mode with a repo
    if (repoPath && viewMode === 'focus') {
      actions.push(
        <button
          key="sidebar-toggle"
          className="panel-toggle-btn"
          onClick={() => setSidebarVisible(!sidebarVisible)}
          title={sidebarVisible ? 'Hide Sidebar Panel' : 'Show Sidebar Panel'}
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
          title={mainVisible ? 'Hide Graph Panel' : 'Show Graph Panel'}
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
          title={detailVisible ? 'Hide Detail Panel' : 'Show Detail Panel'}
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
            setActiveCanvas('focus')
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
  }, [repoPath, viewMode, mainPanelView, sidebarVisible, mainVisible, detailVisible, radarHasEditor, toggleRadarEditor, setTitlebarActions])

  const selectRepo = async () => {
    if (switching) return

    setSwitching(true)
    setStatus({ type: 'info', message: 'Opening repository selector...' })

    try {
      const path = await window.electronAPI.selectRepo()
      if (path) {
        // Clear state before switching to prevent stale data mixing with new repo
        setWorktrees([])
        setBranches([])
        setCommits([])
        setPullRequests([])
        setWorkingStatus(null)
        setRepoPath(path)
        setStatus({ type: 'info', message: 'Loading repository...' })
        await refresh()
        setStatus({ type: 'success', message: 'Repository loaded' })
      } else {
        // User cancelled dialog - clear status
        setStatus(null)
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
    } finally {
      setSwitching(false)
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
    // Also track in canvas navigation history
    navigateToEditor('commit-detail', commit)
    try {
      const diff = await window.electronAPI.getCommitDiff(commit.hash)
      setCommitDiff(diff)
    } catch (_err) {
      setCommitDiff(null)
    } finally {
      setLoadingDiff(false)
    }
  }, [navigateToEditor])

  // Map sidebar focus type to editor panel type for canvas navigation
  const sidebarToEditorPanel = useCallback((type: SidebarFocusType): EditorPanelType => {
    switch (type) {
      case 'pr': return 'pr-detail'
      case 'branch': return 'branch-detail'
      case 'remote': return 'remote-detail'
      case 'worktree': return 'worktree-detail'
      case 'stash': return 'stash-detail'
      case 'uncommitted': return 'staging'
      case 'create-worktree': return 'create-worktree'
      default: return 'empty'
    }
  }, [])

  // Handle sidebar item focus (single click)
  const handleSidebarFocus = useCallback(
    (type: SidebarFocusType, data: PullRequest | Branch | Worktree | StashEntry | WorkingStatus) => {
      setSelectedCommit(null) // Clear commit selection when focusing sidebar item
      setCommitDiff(null)
      setSidebarFocus({ type, data })
      // Also track in canvas navigation history
      navigateToEditor(sidebarToEditorPanel(type), data)
    },
    [navigateToEditor, sidebarToEditorPanel]
  )

  // Radar single-click handlers - soft select item (always works, drives editor when visible)
  const handleRadarItemClick = useCallback(
    (type: SidebarFocusType, data: PullRequest | Branch | Worktree | StashEntry | WorkingStatus) => {
      // Always select the item - makes UI feel interactive and coherent
      // When editor is visible, this also shows the item in the editor
      handleSidebarFocus(type, data)
    },
    [handleSidebarFocus]
  )

  // Radar card double-click handlers - switch to Focus mode with item selected
  const handleRadarPRClick = useCallback(
    (pr: PullRequest) => {
      setActiveCanvas('focus')
      setSidebarSections((prev) => ({ ...prev, prs: true }))
      handleSidebarFocus('pr', pr)
    },
    [setActiveCanvas, handleSidebarFocus]
  )

  const handleRadarWorktreeClick = useCallback(
    (wt: Worktree) => {
      setActiveCanvas('focus')
      setSidebarSections((prev) => ({ ...prev, worktrees: true }))
      handleSidebarFocus('worktree', wt)
    },
    [setActiveCanvas, handleSidebarFocus]
  )

  const handleRadarBranchClick = useCallback(
    (branch: Branch) => {
      setActiveCanvas('focus')
      setSidebarSections((prev) => ({ ...prev, branches: true }))
      handleSidebarFocus('branch', branch)
    },
    [setActiveCanvas, handleSidebarFocus]
  )

  const handleRadarRemoteBranchClick = useCallback(
    (branch: Branch) => {
      setActiveCanvas('focus')
      setSidebarSections((prev) => ({ ...prev, remotes: true }))
      handleSidebarFocus('remote', branch)
    },
    [setActiveCanvas, handleSidebarFocus]
  )

  const handleRadarCommitClick = useCallback(
    (commit: Commit) => {
      setActiveCanvas('focus')
      // Find the matching GraphCommit by hash and select it
      const graphCommit = graphCommits.find((gc) => gc.hash === commit.hash)
      if (graphCommit) {
        handleSelectCommit(graphCommit)
      }
    },
    [setActiveCanvas, graphCommits, handleSelectCommit]
  )

  const handleRadarUncommittedClick = useCallback(() => {
    if (!workingStatus) return
    setActiveCanvas('focus')
    setSidebarSections((prev) => ({ ...prev, branches: true }))
    handleSidebarFocus('uncommitted', workingStatus)
  }, [setActiveCanvas, workingStatus, handleSidebarFocus])

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
    if (switching) return

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
    if (switching) return

    setSwitching(true)
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
    } finally {
      setSwitching(false)
    }
  }

  // Pull local branch from remote
  const handleLocalBranchPull = async (branch: Branch) => {
    closeContextMenu()
    if (switching) return

    setSwitching(true)
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
    } finally {
      setSwitching(false)
    }
  }

  // Remote branch context menu actions
  const handleRemoteBranchPull = async (branch: Branch) => {
    closeContextMenu()
    if (switching) return

    setSwitching(true)
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
    } finally {
      setSwitching(false)
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

  // Delete a branch
  const handleDeleteBranch = useCallback(
    async (branch: Branch) => {
      if (branch.current || deleting) return

      const isMainOrMaster = branch.name === 'main' || branch.name === 'master'
      if (isMainOrMaster) {
        setStatus({ type: 'error', message: 'Cannot delete main or master branch' })
        return
      }

      setDeleting(true)
      setStatus({ type: 'info', message: `Deleting branch '${branch.name}'...` })

      try {
        const result = await window.electronAPI.deleteBranch(branch.name)
        if (result.success) {
          setStatus({ type: 'success', message: result.message })
          setSidebarFocus(null)
          await refresh()
        } else {
          setStatus({ type: 'error', message: result.message })
        }
      } catch (error) {
        setStatus({ type: 'error', message: (error as Error).message })
      } finally {
        setDeleting(false)
      }
    },
    [deleting, refresh]
  )

  // Delete a remote branch
  const handleDeleteRemoteBranch = useCallback(
    async (branch: Branch) => {
      if (deleting) return

      const displayName = branch.name.replace('remotes/', '').replace(/^origin\//, '')
      const isMainOrMaster = displayName === 'main' || displayName === 'master'
      if (isMainOrMaster) {
        setStatus({ type: 'error', message: 'Cannot delete main or master branch' })
        return
      }

      if (!confirm(`Delete remote branch '${displayName}'? This will remove it from the remote repository.`)) return

      setDeleting(true)
      setStatus({ type: 'info', message: `Deleting remote branch '${displayName}'...` })

      try {
        const result = await window.electronAPI.deleteRemoteBranch(branch.name)
        if (result.success) {
          setStatus({ type: 'success', message: result.message })
          setSidebarFocus(null)
          await refresh()
        } else {
          setStatus({ type: 'error', message: result.message })
        }
      } catch (error) {
        setStatus({ type: 'error', message: (error as Error).message })
      } finally {
        setDeleting(false)
      }
    },
    [deleting, refresh]
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

    const loadInitialRepo = async () => {
      try {
        const path = await window.electronAPI.loadSavedRepo()
        if (path) {
          setRepoPath(path)
          await refresh()
        }
      } catch (err) {
        console.error('Failed to load saved repository:', err)
        setStatus({ type: 'error', message: 'Failed to load saved repository' })
      }
    }

    loadInitialRepo()
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

  // Filter stashes
  const filteredStashes = useMemo(() => {
    if (!stashSearch.trim()) return stashes

    const search = stashSearch.toLowerCase().trim()
    return stashes.filter(
      (stash) =>
        stash.message.toLowerCase().includes(search) ||
        (stash.branch && stash.branch.toLowerCase().includes(search))
    )
  }, [stashes, stashSearch])

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

  // Build flat list of sidebar items for keyboard navigation
  const sidebarItems = useMemo(() => {
    const items: Array<{ type: SidebarFocusType; data: PullRequest | Branch | Worktree | StashEntry | WorkingStatus; action?: () => void }> = []
    
    // PRs
    if (sidebarSections.prs && !prError) {
      filteredPRs.forEach((pr) => items.push({ type: 'pr', data: pr, action: () => handlePRDoubleClick(pr) }))
    }
    
    // Uncommitted changes
    if (sidebarSections.branches && workingStatus?.hasChanges) {
      items.push({ type: 'uncommitted', data: workingStatus })
    }
    
    // Branches
    if (sidebarSections.branches) {
      localBranches.forEach((branch) => items.push({ type: 'branch', data: branch, action: () => handleBranchDoubleClick(branch) }))
    }
    
    // Remotes
    if (sidebarSections.remotes) {
      remoteBranches.forEach((branch) => items.push({ type: 'remote', data: branch, action: () => handleRemoteBranchDoubleClick(branch) }))
    }
    
    // Worktrees (including working folder pseudo-worktree)
    if (sidebarSections.worktrees) {
      // Working folder first
      const workingFolder = filteredWorktrees.find((wt) => wt.agent === 'working-folder')
      if (workingFolder) {
        items.push({ type: 'worktree', data: workingFolder })
      }
      // Then other worktrees
      filteredWorktrees
        .filter((wt) => wt.agent !== 'working-folder' && wt.path !== repoPath)
        .forEach((wt) => items.push({ type: 'worktree', data: wt, action: () => handleWorktreeDoubleClick(wt) }))
    }
    
    // Stashes
    if (sidebarSections.stashes) {
      stashes.forEach((stash) => items.push({ type: 'stash', data: stash }))
    }
    
    return items
  }, [sidebarSections, filteredPRs, prError, workingStatus, localBranches, remoteBranches, filteredWorktrees, repoPath, stashes])

  // Sidebar keyboard navigation handler
  const handleSidebarKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (sidebarItems.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSidebarFocusedIndex((prev) => {
          const next = prev + 1
          if (next >= sidebarItems.length) return sidebarItems.length - 1
          const item = sidebarItems[next]
          handleSidebarFocus(item.type, item.data)
          return next
        })
        break
      case 'ArrowUp':
        e.preventDefault()
        setSidebarFocusedIndex((prev) => {
          const next = prev - 1
          if (next < 0) return 0
          const item = sidebarItems[next]
          handleSidebarFocus(item.type, item.data)
          return next
        })
        break
      case 'Enter':
        e.preventDefault()
        if (sidebarFocusedIndex >= 0 && sidebarFocusedIndex < sidebarItems.length) {
          const item = sidebarItems[sidebarFocusedIndex]
          if (item.action) {
            item.action()
          }
        }
        break
      case 'Home':
        e.preventDefault()
        if (sidebarItems.length > 0) {
          setSidebarFocusedIndex(0)
          handleSidebarFocus(sidebarItems[0].type, sidebarItems[0].data)
        }
        break
      case 'End':
        e.preventDefault()
        if (sidebarItems.length > 0) {
          const lastIdx = sidebarItems.length - 1
          setSidebarFocusedIndex(lastIdx)
          handleSidebarFocus(sidebarItems[lastIdx].type, sidebarItems[lastIdx].data)
        }
        break
    }
  }, [sidebarItems, sidebarFocusedIndex, handleSidebarFocus])

  // Sync sidebar focused index with sidebar focus state
  useEffect(() => {
    if (!sidebarFocus) {
      setSidebarFocusedIndex(-1)
      return
    }
    const idx = sidebarItems.findIndex((item) => {
      if (item.type !== sidebarFocus.type) return false
      if (item.type === 'pr') return (item.data as PullRequest).number === (sidebarFocus.data as PullRequest).number
      if (item.type === 'branch' || item.type === 'remote') return (item.data as Branch).name === (sidebarFocus.data as Branch).name
      if (item.type === 'worktree') return (item.data as Worktree).path === (sidebarFocus.data as Worktree).path
      if (item.type === 'stash') return (item.data as StashEntry).index === (sidebarFocus.data as StashEntry).index
      if (item.type === 'uncommitted') return true
      return false
    })
    if (idx !== -1) setSidebarFocusedIndex(idx)
  }, [sidebarFocus, sidebarItems])

  // Sync local state with canvas editor state (for back/forward navigation)
  // This runs when currentEditorEntry changes (via goBack/goForward)
  useEffect(() => {
    if (!currentEditorEntry) {
      // No editor entry - clear selection
      setSidebarFocus(null)
      setSelectedCommit(null)
      setCommitDiff(null)
      return
    }
    
    const { panel, data } = currentEditorEntry
    
    // Map editor panel type back to sidebar focus type
    const panelToSidebarType: Record<string, SidebarFocusType | 'commit'> = {
      'pr-detail': 'pr',
      'branch-detail': 'branch',
      'remote-detail': 'remote',
      'worktree-detail': 'worktree',
      'stash-detail': 'stash',
      'staging': 'uncommitted',
      'create-worktree': 'create-worktree',
      'commit-detail': 'commit',
    }
    
    const focusType = panelToSidebarType[panel]
    
    if (focusType === 'commit') {
      // Commit selection - set selectedCommit and load diff
      const commit = data as GraphCommit
      if (!selectedCommit || selectedCommit.hash !== commit.hash) {
        setSidebarFocus(null)
        setSelectedCommit(commit)
        setLoadingDiff(true)
        window.electronAPI.getCommitDiff(commit.hash)
          .then(setCommitDiff)
          .catch(() => setCommitDiff(null))
          .finally(() => setLoadingDiff(false))
      }
    } else if (focusType && data) {
      // Sidebar focus - set sidebarFocus
      const newFocus = { type: focusType, data: data as SidebarFocus['data'] }
      setSelectedCommit(null)
      setCommitDiff(null)
      setSidebarFocus(newFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasState.editorState.historyIndex])

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

  // ========================================
  // Canvas Data & Props
  // ========================================

  const canvasData: CanvasData = useMemo(() => ({
    repoPath,
    prs: pullRequests,
    prError,
    branches,
    currentBranch,
    worktrees,
    stashes,
    commits: graphCommits,
    workingStatus,
    commitDiff,
    loadingDiff,
  }), [repoPath, pullRequests, prError, branches, currentBranch, worktrees, stashes, graphCommits, workingStatus, commitDiff, loadingDiff])

  const canvasSelection: CanvasSelection = useMemo(() => ({
    selectedPR: sidebarFocus?.type === 'pr' ? (sidebarFocus.data as PullRequest) : null,
    selectedBranch: sidebarFocus?.type === 'branch' || sidebarFocus?.type === 'remote' ? (sidebarFocus.data as Branch) : null,
    selectedWorktree: sidebarFocus?.type === 'worktree' ? (sidebarFocus.data as Worktree) : null,
    selectedStash: sidebarFocus?.type === 'stash' ? (sidebarFocus.data as StashEntry) : null,
    selectedCommit,
  }), [sidebarFocus, selectedCommit])

  // Render editor panel content based on current selection
  const renderEditorContent = useCallback(() => {
    // Staging panel for uncommitted changes
    if (sidebarFocus?.type === 'uncommitted' && workingStatus) {
      return (
        <StagingPanel
          workingStatus={workingStatus}
          currentBranch={currentBranch}
          onRefresh={refresh}
          onStatusChange={setStatus}
        />
      )
    }
    
    // PR Review panel
    if (sidebarFocus?.type === 'pr') {
      return (
        <PRReviewPanel
          pr={sidebarFocus.data as PullRequest}
          formatRelativeTime={formatRelativeTime}
          onCheckout={handlePRCheckout}
          onPRMerged={refresh}
          switching={switching}
        />
      )
    }
    
    // Sidebar detail panel for branches, worktrees, stashes
    if (sidebarFocus) {
      return (
        <SidebarDetailPanel
          focus={sidebarFocus}
          formatRelativeTime={formatRelativeTime}
          formatDate={formatDate}
          currentBranch={currentBranch}
          switching={switching}
          deleting={deleting}
          onStatusChange={setStatus}
          onRefresh={refresh}
          onClearFocus={() => setSidebarFocus(null)}
          onCheckoutBranch={handleBranchDoubleClick}
          onCheckoutRemoteBranch={handleRemoteBranchDoubleClick}
          onCheckoutWorktree={handleWorktreeDoubleClick}
          onDeleteBranch={handleDeleteBranch}
          onDeleteRemoteBranch={handleDeleteRemoteBranch}
          branches={branches}
          repoPath={repoPath}
          worktrees={worktrees}
          onFocusWorktree={(wt) => setSidebarFocus({ type: 'worktree', data: wt })}
        />
      )
    }
    
    // Diff panel for selected commit
    if (selectedCommit) {
      if (loadingDiff) {
        return <div className="detail-loading">Loading diff...</div>
      }
      if (commitDiff) {
        return (
          <DiffPanel
            diff={commitDiff}
            selectedCommit={selectedCommit}
            formatRelativeTime={formatRelativeTime}
            branches={branches}
            onBranchClick={(branchName) => {
              const branch = branches.find((b) => b.name === branchName)
              if (branch) {
                handleSidebarFocus(branch.isRemote ? 'remote' : 'branch', branch)
              }
            }}
          />
        )
      }
      return <div className="detail-error">Could not load diff</div>
    }
    
    // Empty state
    return null
  }, [
    sidebarFocus, workingStatus, currentBranch, refresh, switching, deleting,
    formatRelativeTime, formatDate, handlePRCheckout, handleBranchDoubleClick,
    handleRemoteBranchDoubleClick, handleWorktreeDoubleClick, handleDeleteBranch,
    handleDeleteRemoteBranch, branches, repoPath, worktrees, handleSidebarFocus,
    selectedCommit, loadingDiff, commitDiff
  ])

  const canvasHandlers: CanvasHandlers = useMemo(() => ({
    formatRelativeTime,
    formatDate,
    // PR handlers
    onSelectPR: (pr) => handleRadarItemClick('pr', pr),
    onDoubleClickPR: handleRadarPRClick,
    onContextMenuPR: (e, pr) => handleContextMenu(e, 'pr', pr),
    // Branch handlers
    onSelectBranch: (branch) => handleRadarItemClick(branch.isRemote ? 'remote' : 'branch', branch),
    onDoubleClickBranch: handleRadarBranchClick,
    onContextMenuLocalBranch: (e, branch) => handleContextMenu(e, 'branch', branch),
    onContextMenuRemoteBranch: (e, branch) => handleContextMenu(e, 'remote', branch),
    onCreateBranch: () => setShowNewBranchModal(true),
    // Worktree handlers
    onSelectWorktree: (wt) => handleRadarItemClick('worktree', wt),
    onDoubleClickWorktree: handleRadarWorktreeClick,
    onContextMenuWorktree: (e, wt) => handleContextMenu(e, 'worktree', wt),
    onCreateWorktree: () => navigateToEditor('create-worktree'),
    // Stash handlers
    onSelectStash: (stash) => handleSidebarFocus('stash', stash),
    onDoubleClickStash: (stash) => handleSidebarFocus('stash', stash),
    onContextMenuStash: (e, stash) => handleContextMenu(e, 'stash', stash as unknown as Worktree),
    // Commit handlers
    onSelectCommit: handleSelectCommit,
    onDoubleClickCommit: (commit) => {
      // Switch to Focus (editor home) and select commit
      setActiveCanvas('focus')
      handleSelectCommit(commit)
    },
    // Editor content - renders actual panels
    renderEditorContent,
  }), [
    formatRelativeTime, formatDate, handleRadarItemClick, handleRadarPRClick, handleRadarBranchClick,
    handleRadarWorktreeClick, handleContextMenu, handleSidebarFocus, handleSelectCommit, navigateToEditor,
    renderEditorContent, setActiveCanvas
  ])

  const canvasUIState: CanvasUIState = useMemo(() => ({
    switching,
    deleting,
  }), [switching, deleting])

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
                onClick={() => setActiveCanvas('radar')}
                title="Radar Mode"
              >
                <span className="view-icon">⊞</span>
                <span className="view-label">Radar</span>
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'focus' ? 'active' : ''}`}
                onClick={() => setActiveCanvas('focus')}
                title="Focus Mode"
              >
                <span className="view-icon">☰</span>
                <span className="view-label">Focus</span>
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'graph' ? 'active' : ''}`}
                onClick={() => setActiveCanvas('graph')}
                title="Graph View"
              >
                <span className="view-icon">◉</span>
                <span className="view-label">Graph</span>
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

      {/* Main Content - Canvas Renderer for ALL canvases */}
      {repoPath && !error && (
        <main className="ledger-content canvas-mode">
          <CanvasRenderer
            data={canvasData}
            selection={canvasSelection}
            handlers={canvasHandlers}
            uiState={canvasUIState}
          />
        </main>
      )}

    </div>
  )
}
