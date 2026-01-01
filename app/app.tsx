import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type {
  Branch,
  Worktree,
  CheckoutResult,
  PullRequest,
  Commit,
  WorkingStatus,
  UncommittedFile,
  GraphCommit,
  CommitDiff,
  StashEntry,
  StagingFileDiff,
  PRDetail,
  PRReviewComment,
  StashFile,
  BranchDiff,
} from './types/electron'
import type {
  ContextMenuType,
  ContextMenu,
  MenuItem,
  SidebarFocusType,
} from './types/app-types'
import './styles/app.css'
import { useWindowContext } from './components/window'
import { SettingsPanel } from './components/SettingsPanel'
import { GitGraph } from './components/panels/viz'
import {
  DiffPanel,
  StagingPanel,
  BranchDetailPanel,
  PRReviewPanel,
  WorktreeDetailPanel,
  StashDetailPanel,
  CreateWorktreePanel,
  SidebarDetailPanel,
} from './components/panels/editor'
import { initializeTheme, setThemeMode as applyThemeMode, getCurrentThemeMode, loadVSCodeTheme, type ThemeMode } from './theme'
import { useRepositoryStore } from './stores/repository-store'
import { useUIStore } from './stores/ui-store'
import { usePluginStore } from './stores/plugin-store'
import {
  PluginSidebar,
  PluginSettingsPanel,
  PluginAppContainer,
  PluginPanelContainer,
  PluginComponentProvider,
  PluginWidgetSlot,
  pluginComponentRegistry,
} from './components/plugins'
import { RepoSwitcher } from './components/RepoSwitcher'
import { useRepoSwitched, useGitCheckout, useGitCommit, useGitPush, useGitPull, useGitStash } from './hooks/use-ledger-events'
import { registerExampleComponents } from './components/plugins/example-components'
import {
  pluginManager,
  pluginLoader,
  examplePlugins,
  beforeCheckout,
  afterCheckout,
  beforePush,
  afterPush,
  beforePull,
  afterPull,
  repoOpened,
  repoClosed,
  repoRefreshed,
} from '@/lib/plugins'
import type { AppPlugin } from '@/lib/plugins/plugin-types'

export default function App() {
  // Repository state from store
  const {
    repoPath, setRepoPath,
    branches, setBranches,
    currentBranch, setCurrentBranch,
    worktrees, setWorktrees,
    pullRequests, setPullRequests,
    prError, setPrError,
    commits, setCommits,
    workingStatus, setWorkingStatus,
    error, setError,
    loading, setLoading,
    status, setStatus,
    switching, setSwitching,
    githubUrl, setGithubUrl,
    graphCommits, setGraphCommits,
    selectedCommit, setSelectedCommit,
    commitDiff, setCommitDiff,
    stashes, setStashes,
    loadingDiff, setLoadingDiff,
  } = useRepositoryStore()

  // UI state from store
  const {
    themeMode, setThemeMode,
    viewMode, setViewMode,
    mainPanelView, setMainPanelView,
    sidebarFocus, setSidebarFocus,
    historyFilterOpen, setHistoryFilterOpen,
    radarCommitsFilterOpen, setRadarCommitsFilterOpen,
    showCheckpoints, setShowCheckpoints,
    showGraphLines, setShowGraphLines,
    onlyBranchHeads, setOnlyBranchHeads,
    onlyUnmergedBranches, setOnlyUnmergedBranches,
    sidebarSections, setSidebarSections,
    sidebarFiltersOpen, setSidebarFiltersOpen,
    localFilter, setLocalFilter,
    localSort, setLocalSort,
    remoteFilter, setRemoteFilter,
    remoteSort, setRemoteSort,
    prFilter, setPrFilter,
    prSort, setPrSort,
    prSearch, setPrSearch,
    localBranchSearch, setLocalBranchSearch,
    remoteBranchSearch, setRemoteBranchSearch,
    worktreeSearch, setWorktreeSearch,
    prControlsOpen, setPrControlsOpen,
    localControlsOpen, setLocalControlsOpen,
    remoteControlsOpen, setRemoteControlsOpen,
    worktreeControlsOpen, setWorktreeControlsOpen,
    worktreeParentFilter, setWorktreeParentFilter,
    sidebarWidth, setSidebarWidth,
    detailWidth, setDetailWidth,
    sidebarVisible, setSidebarVisible,
    mainVisible, setMainVisible,
    detailVisible, setDetailVisible,
    radarColumnOrder, setRadarColumnOrder,
  } = useUIStore()

  // Plugin state from store
  const activeAppId = usePluginStore((s) => s.activeAppId)
  const openPanels = usePluginStore((s) => s.openPanels)
  const closePanel = usePluginStore((s) => s.closePanel)

  // Local state (modals, transient UI)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [showNewBranchModal, setShowNewBranchModal] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [isResizingDetail, setIsResizingDetail] = useState(false)
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  const { setTitle, setTitlebarActions } = useWindowContext()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath, viewMode, mainPanelView, sidebarVisible, mainVisible, detailVisible])

  // Initialize plugin system
  useEffect(() => {
    // Register example plugin React components
    registerExampleComponents(pluginComponentRegistry)

    // Register and activate example plugins
    const initPlugins = async () => {
      for (const plugin of examplePlugins) {
        if (!pluginManager.get(plugin.id)) {
          pluginManager.register(plugin)
        }
      }

      // Activate all registered example plugins
      for (const plugin of examplePlugins) {
        try {
          await pluginManager.activate(plugin.id)
        } catch (err) {
          console.error(`[Plugin] Failed to activate ${plugin.id}:`, err)
        }
      }
    }

    initPlugins()

    // Load installed plugins from registry
    pluginLoader.loadInstalled().catch((err) => {
      console.error('Failed to load installed plugins:', err)
    })
  }, [])

  // Get the active app plugin if one is selected
  const activeAppPlugin = useMemo(() => {
    if (!activeAppId) return null
    const plugin = pluginManager.get(activeAppId)
    return plugin?.type === 'app' ? (plugin as AppPlugin) : null
  }, [activeAppId])

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
    if (switching) return

    setSwitching(true)
    setStatus({ type: 'info', message: 'Opening repository selector...' })

    try {
      const path = await window.conveyor.repo.selectRepo()
      if (path) {
        // Notify plugins that current repo is closing (if one was open)
        if (repoPath) {
          repoClosed(repoPath).catch((err) => console.error('[Plugin Hook] repoClosed error:', err))
        }

        // Clear state before switching to prevent stale data mixing with new repo
        setWorktrees([])
        setBranches([])
        setCommits([])
        setPullRequests([])
        setWorkingStatus(null)
        setRepoPath(path)
        setStatus({ type: 'info', message: 'Loading repository...' })
        await refresh()

        // Notify plugins that new repo is opened
        repoOpened(path).catch((err) => console.error('[Plugin Hook] repoOpened error:', err))

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

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPrError(null)

    try {
      // Phase 1: Fast initial load - basic data without expensive per-item metadata
      // Uses getBranchesBasic() instead of getBranchesWithMetadata() (saves 600+ git commands)
      // Uses getCommitGraphHistory with skipStats=true (saves 100 git commands)
      const [branchResult, worktreeResult, prResult, commitResult, statusResult, ghUrl, graphResult, stashResult] =
        await Promise.all([
          window.conveyor.branch.getBranchesBasic(),
          window.conveyor.worktree.getWorktrees(),
          window.conveyor.pr.getPullRequests(),
          window.conveyor.commit.getCommitHistory(15),
          window.conveyor.commit.getWorkingStatus(),
          window.conveyor.pr.getGitHubUrl(),
          window.conveyor.commit.getCommitGraphHistory(100, true, showCheckpoints), // skipStats for fast load
          window.conveyor.stash.getStashes(),
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

      // Notify plugins that repository data has been refreshed
      repoRefreshed().catch((err) => console.error('[Plugin Hook] repoRefreshed error:', err))

      // Phase 2: Deferred metadata loading in background
      // This loads detailed branch metadata (commit counts, dates) after initial render
      window.conveyor.branch
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
    // Note: State setters from useState/stores are stable and don't need to be in deps
    // Only showCheckpoints affects the actual API call behavior
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCheckpoints, repoPath])

  // ============================================================================
  // Event Subscriptions
  // ============================================================================

  // Auto-refresh when repo is switched (from another window or component)
  useRepoSwitched(
    (_fromPath, toPath, _name) => {
      if (toPath !== repoPath) {
        setRepoPath(toPath)
        refresh()
      }
    },
    [repoPath, refresh]
  )

  // Auto-refresh when git checkout happens
  useGitCheckout(
    (path, _branch) => {
      if (path === repoPath) {
        refresh()
      }
    },
    [repoPath, refresh]
  )

  // Auto-refresh when git commit happens
  useGitCommit(
    (path, _hash, _message) => {
      if (path === repoPath) {
        refresh()
      }
    },
    [repoPath, refresh]
  )

  // Auto-refresh when git push happens
  useGitPush(
    (path, _branch) => {
      if (path === repoPath) {
        refresh()
      }
    },
    [repoPath, refresh]
  )

  // Auto-refresh when git pull happens
  useGitPull(
    (path, _branch) => {
      if (path === repoPath) {
        refresh()
      }
    },
    [repoPath, refresh]
  )

  // Auto-refresh when stash operations happen
  useGitStash(
    (path, _action) => {
      if (path === repoPath) {
        refresh()
      }
    },
    [repoPath, refresh]
  )

  // Fetch diff when a commit is selected
  const handleSelectCommit = useCallback(async (commit: GraphCommit) => {
    setSidebarFocus(null) // Clear sidebar focus when selecting a commit
    setSelectedCommit(commit)
    setLoadingDiff(true)
    try {
      const diff = await window.conveyor.commit.getCommitDiff(commit.hash)
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
      const result = await window.conveyor.pr.checkoutPRBranch(pr.branch)
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
      const result = await window.conveyor.pr.openPullRequest(pr.url)
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
      const result = await window.conveyor.worktree.openWorktree(wt.path)
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
      const result = await window.conveyor.worktree.convertWorktreeToBranch(wt.path)
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

    // Plugin hook: allow plugins to cancel checkout
    const canProceed = await beforeCheckout(branch.name)
    if (!canProceed) {
      setStatus({ type: 'info', message: 'Checkout cancelled by plugin' })
      return
    }

    setSwitching(true)
    setStatus({ type: 'info', message: `Switching to ${branch.name}...` })

    try {
      const result: CheckoutResult = await window.conveyor.branch.checkoutBranch(branch.name)
      if (result.success) {
        setStatus({ type: 'success', message: result.message, stashed: result.stashed })
        await afterCheckout(branch.name)
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

    // Plugin hook: allow plugins to cancel push
    const canProceed = await beforePush(branch.name)
    if (!canProceed) {
      setStatus({ type: 'info', message: 'Push cancelled by plugin' })
      return
    }

    setSwitching(true)
    setStatus({ type: 'info', message: `Pushing ${branch.name} to remote...` })

    try {
      const result = await window.conveyor.branch.pushBranch(branch.name, true)
      if (result.success) {
        setStatus({ type: 'success', message: result.message })
        await afterPush(branch.name)
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

    // Plugin hook: allow plugins to cancel pull
    const canProceed = await beforePull(branch.name)
    if (!canProceed) {
      setStatus({ type: 'info', message: 'Pull cancelled by plugin' })
      return
    }

    setSwitching(true)
    setStatus({ type: 'info', message: `Pulling ${branch.name} from remote...` })

    try {
      // Construct the remote branch path (assumes origin as default remote)
      const remoteBranch = `origin/${branch.name}`
      const result = await window.conveyor.branch.pullBranch(remoteBranch)
      if (result.success) {
        setStatus({ type: 'success', message: result.message })
        await afterPull(branch.name)
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

    // Plugin hook: allow plugins to cancel pull
    const canProceed = await beforePull(branch.name)
    if (!canProceed) {
      setStatus({ type: 'info', message: 'Pull cancelled by plugin' })
      return
    }

    setSwitching(true)
    setStatus({ type: 'info', message: `Fetching ${branch.name.replace('remotes/', '')}...` })

    try {
      const result = await window.conveyor.branch.pullBranch(branch.name)
      if (result.success) {
        setStatus({ type: 'success', message: result.message })
        await afterPull(branch.name)
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
      const result = await window.conveyor.pr.openBranchInGitHub(branch.name)
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
      const result = await window.conveyor.commit.resetToCommit(commit.hash, 'hard')
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
      const result = await window.conveyor.branch.createBranch(newBranchName.trim(), true)
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

      // Plugin hook: allow plugins to cancel checkout
      const canProceed = await beforeCheckout(branch.name)
      if (!canProceed) {
        setStatus({ type: 'info', message: 'Checkout cancelled by plugin' })
        return
      }

      setSwitching(true)
      const displayName = branch.name.replace('remotes/', '')
      setStatus({ type: 'info', message: `Checking out ${displayName}...` })

      try {
        const result: CheckoutResult = await window.conveyor.branch.checkoutRemoteBranch(branch.name)
        if (result.success) {
          setStatus({ type: 'success', message: result.message, stashed: result.stashed })
          await afterCheckout(branch.name)
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

      // Plugin hook: allow plugins to cancel checkout
      const canProceed = await beforeCheckout(worktree.branch)
      if (!canProceed) {
        setStatus({ type: 'info', message: 'Checkout cancelled by plugin' })
        return
      }

      setSwitching(true)
      setStatus({ type: 'info', message: `Checking out worktree ${worktree.displayName}...` })

      try {
        const result: CheckoutResult = await window.conveyor.branch.checkoutBranch(worktree.branch)
        if (result.success) {
          setStatus({ type: 'success', message: result.message, stashed: result.stashed })
          await afterCheckout(worktree.branch)
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

      // Plugin hook: allow plugins to cancel checkout
      const canProceed = await beforeCheckout(commit.hash)
      if (!canProceed) {
        setStatus({ type: 'info', message: 'Checkout cancelled by plugin' })
        return
      }

      setSwitching(true)
      setStatus({ type: 'info', message: `Checking out ${commit.shortHash}...` })

      try {
        const result: CheckoutResult = await window.conveyor.branch.checkoutBranch(commit.hash)
        if (result.success) {
          setStatus({ type: 'success', message: `Checked out commit ${commit.shortHash}`, stashed: result.stashed })
          await afterCheckout(commit.hash)
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
    if (!window.conveyor) return

    const loadInitialRepo = async () => {
      try {
        const path = await window.conveyor.repo.loadSavedRepo()
        if (path) {
          setRepoPath(path)
          await refresh()
          // Notify plugins that repo is opened
          repoOpened(path).catch((err) => console.error('[Plugin Hook] repoOpened error:', err))
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
    if (!window.conveyor) return
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
    <PluginComponentProvider>
      <div className="ledger-app-wrapper">
        {/* Plugin Sidebar - only show when repo is loaded */}
        {repoPath && <PluginSidebar />}

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
          <RepoSwitcher
            currentPath={repoPath}
            onRepoChange={(path) => {
              setRepoPath(path)
              refresh()
            }}
          />
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
          {repoPath && (
            <button
              onClick={refresh}
              disabled={loading || switching}
              className="view-toggle-btn active"
              title="Refresh"
            >
              <span className={`view-icon ${loading || switching ? 'spinning' : ''}`}>↻</span>
              <span className="view-label">{loading ? 'Loading' : switching ? 'Switching' : 'Refresh'}</span>
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

      {/* Plugin App Content - shown when a plugin app is active */}
      {repoPath && activeAppPlugin && (
        <main className="ledger-content plugin-app-view">
          <PluginAppContainer plugin={activeAppPlugin} />
        </main>
      )}

      {/* Main Content - Radar View */}
      {repoPath && !error && !activeAppPlugin && viewMode === 'radar' && (
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
                      <PluginWidgetSlot slot="pr-list-item" data={pr} />
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
                        <PluginWidgetSlot slot="worktree-list-item" data={wt} />
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
                      try {
                        const graphResult = await window.conveyor.commit.getCommitGraphHistory(100, true, newValue)
                        setGraphCommits(graphResult)
                      } catch (err) {
                        console.error('Failed to update commit graph:', err)
                        setShowCheckpoints(!newValue)
                      }
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
                    <PluginWidgetSlot slot="commit-list-item" data={commit} />
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
                      <PluginWidgetSlot slot="branch-list-item" data={branch} />
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
      {repoPath && !error && !activeAppPlugin && viewMode === 'focus' && (
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
                            try {
                              // Reload commits with new filter
                              const graphResult = await window.conveyor.commit.getCommitGraphHistory(100, true, newValue)
                              setGraphCommits(graphResult)
                            } catch (err) {
                              console.error('Failed to update commit graph:', err)
                              setShowCheckpoints(!newValue)
                            }
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

          {/* Plugin Settings Panel - manages its own visibility via store */}
          <PluginSettingsPanel />

          {/* Open Plugin Panels */}
          {openPanels.map((panel) => (
            <PluginPanelContainer
              key={panel.instanceId}
              pluginId={panel.pluginId}
              instanceId={panel.instanceId}
              data={panel.data}
              onClose={() => closePanel(panel.instanceId)}
            />
          ))}
        </div>
      </div>
    </PluginComponentProvider>
  )
}
