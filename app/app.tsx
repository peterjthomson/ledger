import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import type {
  Branch,
  Worktree,
  CheckoutResult,
  PullRequest,
  Commit,
  WorkingStatus,
  GraphCommit,
  CommitDiff,
  StashEntry,
  RepoInfo,
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
import { useCanvas, useCanvasNavigation, useCanvasPersistence, CanvasRenderer, type CanvasData, type CanvasSelection, type CanvasHandlers, type CanvasUIState } from './components/canvas'
import {
  DiffPanel,
  CommitCreatePanel,
  PRDetailPanel,
  SidebarDetailPanel,
} from './components/panels/editor'
import { SettingsPanel } from './components/SettingsPanel'
import { initializeTheme, setThemeMode as applyThemeMode, getCurrentThemeMode, type ThemeMode } from './theme'
import { RepoSwitcher } from './components/RepoSwitcher'
import { usePluginStore } from './stores/plugin-store'
import { useRepositoryStore } from './stores/repository-store'
import {
  PluginSidebar,
  PluginSettingsPanel,
  PluginAppContainer,
  PluginPanelContainer,
  PluginComponentProvider,
  pluginComponentRegistry,
} from './components/plugins'
import { PermissionDialog } from './components/plugins/PermissionDialog'
import { registerExampleComponents } from './components/plugins/example-components'
import {
  useRepoSwitched,
  useGitCheckout,
  useGitCommit,
  useGitPush,
  useGitPull,
  useGitStash,
} from './hooks/use-ledger-events'
import { pluginManager, pluginLoader, examplePlugins, type AppPlugin } from '@/lib/plugins'

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
  const [activePluginNavItem, setActivePluginNavItem] = useState<string | undefined>(undefined)
  const { setTitle, setTitlebarActions } = useWindowContext()

  // Plugin state
  const activeAppId = usePluginStore((s) => s.activeAppId)
  const openPanels = usePluginStore((s) => s.openPanels)
  const closePanel = usePluginStore((s) => s.closePanel)
  const pendingPermissionRequest = usePluginStore((s) => s.pendingPermissionRequest)
  const respondToPermissionRequest = usePluginStore((s) => s.respondToPermissionRequest)

  // Canvas navigation for global editor state
  const { 
    navigateToEditor, 
    setActiveCanvas, 
    state: canvasState,
    currentEditorEntry,
    toggleColumnVisibility,
    isColumnVisible,
  } = useCanvas()
  
  // Initialize keyboard shortcuts for editor navigation
  const { openStaging } = useCanvasNavigation()
  
  // Initialize canvas persistence (auto-save custom canvases and active canvas)
  useCanvasPersistence()

  // Check if Radar canvas has a VISIBLE editor column
  const radarCanvas = canvasState.canvases.find(c => c.id === 'radar')
  const radarEditorColumn = radarCanvas?.columns.find(col => col.slotType === 'editor')
  const radarEditorVisible = radarEditorColumn?.visible !== false

  // Toggle editor column visibility in Radar canvas
  const toggleRadarEditor = useCallback(() => {
    if (radarEditorColumn) {
      // Toggle visibility of existing editor column
      toggleColumnVisibility('radar', radarEditorColumn.id)
    }
  }, [radarEditorColumn, toggleColumnVisibility])

  // Theme change handler for Settings panel
  const handleThemeChange = useCallback(async (mode: ThemeMode) => {
    setThemeMode(mode)
    await applyThemeMode(mode)
  }, [])

  // Current canvas mode for titlebar button styling
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
  // Graph display options
  const [showCheckpoints] = useState(false) // Hide Conductor checkpoints by default



  // Panel visibility is now handled by the canvas system via toggleColumnVisibility
  
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

  // Titlebar actions for panel toggles and settings button
  useEffect(() => {
    const actions: ReactNode[] = []

    // Add Radar mode editor toggle
    if (repoPath && viewMode === 'radar') {
      actions.push(
        <button
          key="editor-toggle"
          className="panel-toggle-btn"
          onClick={toggleRadarEditor}
          title={radarEditorVisible ? 'Hide Detail Panel' : 'Show Detail Panel'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor" strokeWidth="1" />
            <rect x="5" y="1" width="6" height="14" fill={radarEditorVisible ? 'currentColor' : 'none'} />
          </svg>
        </button>
      )
    }

    // Add Focus mode panel toggles if in focus mode with a repo
    if (repoPath && viewMode === 'focus') {
      const sidebarVisible = isColumnVisible('focus', 'focus-sidebar')
      const graphVisible = isColumnVisible('focus', 'focus-viz')
      const editorVisible = isColumnVisible('focus', 'focus-editor')
      
      actions.push(
        <button
          key="sidebar-toggle"
          className="panel-toggle-btn"
          onClick={() => toggleColumnVisibility('focus', 'focus-sidebar')}
          title={sidebarVisible ? 'Hide Sidebar Panel' : 'Show Sidebar Panel'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor" strokeWidth="1" />
            <rect x="1" y="1" width="4" height="14" fill={sidebarVisible ? 'currentColor' : 'none'} />
          </svg>
        </button>,
        <button
          key="graph-toggle"
          className="panel-toggle-btn"
          onClick={() => toggleColumnVisibility('focus', 'focus-viz')}
          title={graphVisible ? 'Hide Graph Panel' : 'Show Graph Panel'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor" strokeWidth="1" />
            <rect x="5" y="1" width="6" height="14" fill={graphVisible ? 'currentColor' : 'none'} />
          </svg>
        </button>,
        <button
          key="editor-toggle"
          className="panel-toggle-btn"
          onClick={() => toggleColumnVisibility('focus', 'focus-editor')}
          title={editorVisible ? 'Hide Detail Panel' : 'Show Detail Panel'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor" strokeWidth="1" />
            <rect x="11" y="1" width="4" height="14" fill={editorVisible ? 'currentColor' : 'none'} />
          </svg>
        </button>
      )
    }

    // Always add settings button - works from ANY canvas
    // Settings is active if mainPanelView is 'settings', regardless of current canvas
    const isSettingsActive = mainPanelView === 'settings'
    actions.push(
      <button
        key="settings"
        className={`panel-toggle-btn ${isSettingsActive ? 'active' : ''}`}
        onClick={() => {
          if (isSettingsActive) {
            // Already showing settings in Focus - toggle back to history
            setMainPanelView('history')
          } else {
            // From any canvas: go to Focus (home) and show Settings
            setActiveCanvas('focus')
            setMainPanelView('settings')
            // Ensure editor column is visible to show settings
            if (!isColumnVisible('focus', 'focus-editor')) {
              toggleColumnVisibility('focus', 'focus-editor')
            }
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
  }, [repoPath, viewMode, mainPanelView, canvasState, radarEditorVisible, toggleRadarEditor, setTitlebarActions, setActiveCanvas, isColumnVisible, toggleColumnVisibility])

  // Initialize plugin system (restores the merged POC wiring that was later removed)
  useEffect(() => {
    // Configure permission request handler for plugin installation
    pluginLoader.setPermissionRequestHandler((pluginId, pluginName, permissions) => {
      return usePluginStore.getState().requestPermissions(pluginId, pluginName, permissions)
    })

    // Register example plugin React components
    registerExampleComponents(pluginComponentRegistry)

    // Register and activate example plugins
    const initPlugins = async () => {
      for (const plugin of examplePlugins) {
        if (!pluginManager.get(plugin.id)) {
          pluginManager.register(plugin)
        }
      }

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

  // Reset plugin nav item when switching apps, set to first nav item
  useEffect(() => {
    if (activeAppPlugin?.navigation?.length) {
      setActivePluginNavItem(activeAppPlugin.navigation[0].id)
    } else {
      setActivePluginNavItem(undefined)
    }
  }, [activeAppPlugin])

  // Handler for plugin navigation
  const handlePluginNavigate = useCallback((itemId: string) => {
    setActivePluginNavItem(itemId)
  }, [])

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
        await refresh(path)
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

  const refresh = useCallback(async (repoPathForTitle: string | null = repoPath) => {
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
      if (repoPathForTitle && typeof repoPathForTitle === 'string') {
        const repoName = repoPathForTitle.split('/').pop() || 'Ledger'
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
  }, [repoPath, setTitle, showCheckpoints])

  // Keep the repository store in sync so plugin apps/panels can rely on it.
  // (This avoids a full migration of App state back to Zustand while restoring the plugin UI.)
  useEffect(() => {
    useRepositoryStore.getState().setRepositoryData({
      repoPath,
      githubUrl,
      currentBranch,
      branches,
      worktrees,
      pullRequests,
      commits: _commits,
      graphCommits,
      stashes,
      workingStatus,
      selectedCommit,
      commitDiff,
      loading,
      switching,
      loadingDiff,
      error,
      prError,
      status,
    })
  }, [
    repoPath,
    githubUrl,
    currentBranch,
    branches,
    worktrees,
    pullRequests,
    _commits,
    graphCommits,
    stashes,
    workingStatus,
    selectedCommit,
    commitDiff,
    loading,
    switching,
    loadingDiff,
    error,
    prError,
    status,
  ])

  // ============================================================================
  // Event Subscriptions (auto-refresh)
  // ============================================================================

  // Auto-refresh when repo is switched (from another window or component)
  useRepoSwitched(
    (_fromPath, toPath, _name) => {
      if (toPath !== repoPath) {
        setRepoPath(toPath)
        refresh(toPath)
      }
    },
    [repoPath, refresh]
  )

  // Auto-refresh when git checkout happens
  useGitCheckout(
    (path, _branch) => {
      if (path === repoPath) {
        refresh(repoPath)
      }
    },
    [repoPath, refresh]
  )

  // Auto-refresh when git commit happens
  useGitCommit(
    (path, _hash, _message) => {
      if (path === repoPath) {
        refresh(repoPath)
      }
    },
    [repoPath, refresh]
  )

  // Auto-refresh when git push happens
  useGitPush(
    (path, _branch) => {
      if (path === repoPath) {
        refresh(repoPath)
      }
    },
    [repoPath, refresh]
  )

  // Auto-refresh when git pull happens
  useGitPull(
    (path, _branch) => {
      if (path === repoPath) {
        refresh(repoPath)
      }
    },
    [repoPath, refresh]
  )

  // Auto-refresh when stash operations happen
  useGitStash(
    (path, _action) => {
      if (path === repoPath) {
        refresh(repoPath)
      }
    },
    [repoPath, refresh]
  )

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
      case 'mailmap': return 'mailmap-detail'
      default: return 'empty'
    }
  }, [])

  // Handle sidebar item focus (single click)
  const handleSidebarFocus = useCallback(
    (type: SidebarFocusType, data: PullRequest | Branch | Worktree | StashEntry | WorkingStatus | RepoInfo) => {
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
    (type: SidebarFocusType, data: PullRequest | Branch | Worktree | StashEntry | WorkingStatus | RepoInfo) => {
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
      handleSidebarFocus('pr', pr)
    },
    [setActiveCanvas, handleSidebarFocus]
  )

  const handleRadarWorktreeClick = useCallback(
    (wt: Worktree) => {
      setActiveCanvas('focus')
      handleSidebarFocus('worktree', wt)
    },
    [setActiveCanvas, handleSidebarFocus]
  )

  const handleRadarBranchClick = useCallback(
    (branch: Branch) => {
      setActiveCanvas('focus')
      handleSidebarFocus('branch', branch)
    },
    [setActiveCanvas, handleSidebarFocus]
  )

  const handleRadarRemoteBranchClick = useCallback(
    (branch: Branch) => {
      setActiveCanvas('focus')
      handleSidebarFocus('remote', branch)
    },
    [setActiveCanvas, handleSidebarFocus]
  )

  const handleRadarCommitClick = useCallback(
    (commit: Commit) => {
      setActiveCanvas('focus')
      const graphCommit = graphCommits.find((gc) => gc.hash === commit.hash)
      if (graphCommit) {
        handleSelectCommit(graphCommit)
      }
    },
    [setActiveCanvas, graphCommits, handleSelectCommit]
  )

  const handleRadarStashClick = useCallback(
    (stash: StashEntry) => {
      setActiveCanvas('focus')
      handleSidebarFocus('stash', stash)
    },
    [setActiveCanvas, handleSidebarFocus]
  )

  const handleRadarUncommittedClick = useCallback(() => {
    if (!workingStatus) return
    setActiveCanvas('focus')
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
          await refresh(path)
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
      'mailmap-detail': 'mailmap',
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
     
  }, [canvasState.editorState.historyIndex])

  // Filter graph commits based on history panel filters
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
    selectedRepo: sidebarFocus?.type === 'repo' ? (sidebarFocus.data as RepoInfo) : null,
    selectedCommit,
    uncommittedSelected: sidebarFocus?.type === 'uncommitted',
  }), [sidebarFocus, selectedCommit])

  // Render editor panel content based on current selection
  const renderEditorContent = useCallback(() => {
    // Settings panel takes priority when active
    if (mainPanelView === 'settings') {
      return (
        <SettingsPanel
          themeMode={themeMode}
          onThemeChange={handleThemeChange}
          onBack={() => setMainPanelView('history')}
        />
      )
    }

    // Staging panel for uncommitted changes
    if (sidebarFocus?.type === 'uncommitted' && workingStatus) {
      return (
        <CommitCreatePanel
          workingStatus={workingStatus}
          currentBranch={currentBranch}
          onRefresh={refresh}
          onStatusChange={setStatus}
        />
      )
    }
    
    // PR Detail panel
    if (sidebarFocus?.type === 'pr') {
      return (
        <PRDetailPanel
          pr={sidebarFocus.data as PullRequest}
          repoPath={repoPath}
          formatRelativeTime={formatRelativeTime}
          onCheckout={handlePRCheckout}
          onPRMerged={refresh}
          onStatusChange={setStatus}
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
          onOpenStaging={openStaging}
          branches={branches}
          repoPath={repoPath}
          worktrees={worktrees}
          onFocusWorktree={(wt) => setSidebarFocus({ type: 'worktree', data: wt })}
          onOpenRepo={async (repo) => {
            if (repo.isCurrent) return
            setStatus({ type: 'info', message: `Opening ${repo.name}...` })
            try {
              setRepoPath(repo.path)
              await refresh(repo.path)
              setStatus({ type: 'success', message: `Opened ${repo.name}` })
            } catch (err) {
              setStatus({ type: 'error', message: (err as Error).message })
            }
          }}
          onOpenMailmap={() => {
            setSidebarFocus({ type: 'mailmap', data: null })
          }}
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
    mainPanelView, themeMode, handleThemeChange,
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
    onContextMenuLocalBranch: (e, branch) => handleContextMenu(e, 'local-branch', branch),
    onContextMenuRemoteBranch: (e, branch) => handleContextMenu(e, 'remote-branch', branch),
    onCreateBranch: () => setShowNewBranchModal(true),
    // Worktree handlers
    onSelectWorktree: (wt) => handleRadarItemClick('worktree', wt),
    onDoubleClickWorktree: handleRadarWorktreeClick,
    onContextMenuWorktree: (e, wt) => handleContextMenu(e, 'worktree', wt),
    onCreateWorktree: () => navigateToEditor('create-worktree'),
    // Stash handlers
    onSelectStash: (stash) => handleRadarItemClick('stash', stash),
    onDoubleClickStash: handleRadarStashClick,
    // Stash context menus aren't wired yet (avoid coupling tests/types to an unimplemented menu)
    onContextMenuStash: undefined,
    // Repo handlers
    onSelectRepo: (repo) => handleRadarItemClick('repo', repo),
    onDoubleClickRepo: async (repo) => {
      if (repo.isCurrent) return
      // Switch to this repo
      setStatus({ type: 'info', message: `Opening ${repo.name}...` })
      try {
        setRepoPath(repo.path)
        await refresh(repo.path)
        setStatus({ type: 'success', message: `Opened ${repo.name}` })
      } catch (err) {
        setStatus({ type: 'error', message: (err as Error).message })
      }
    },
    // Commit handlers
    onSelectCommit: handleSelectCommit,
    onDoubleClickCommit: (commit) => {
      // Switch to Focus (editor home) and select commit
      setActiveCanvas('focus')
      handleSelectCommit(commit)
    },
    onContextMenuCommit: (e, commit) => handleContextMenu(e, 'commit', commit),
    // Uncommitted changes handlers
    onSelectUncommitted: () => {
      if (workingStatus) {
        handleRadarItemClick('uncommitted', workingStatus)
      }
    },
    onDoubleClickUncommitted: handleRadarUncommittedClick,
    onContextMenuUncommitted: (e, status) => handleContextMenu(e, 'uncommitted', status),
    // Tech tree handlers - navigate to branch detail
    onSelectTechTreeNode: (branchName: string) => {
      // Find the branch by name (strip prefix if needed for merged branches)
      const branch = branches.find(b => 
        b.name === branchName || 
        b.name.endsWith(`/${branchName}`) ||
        branchName.endsWith(b.name)
      )
      if (branch) {
        // Switch to Focus canvas and show branch detail
        setActiveCanvas('focus')
        handleSidebarFocus('branch', branch)
      }
    },
    // Editor content - renders actual panels
    renderEditorContent,
    // Special panel triggers
    onOpenMailmap: () => {
      setActiveCanvas('focus')
      setSidebarFocus({ type: 'mailmap', data: null })
      navigateToEditor('mailmap-detail', null)
    },
  }), [
    formatRelativeTime, formatDate, handleRadarItemClick, handleRadarPRClick, handleRadarBranchClick,
    handleRadarWorktreeClick, handleRadarStashClick, handleContextMenu, handleSelectCommit, navigateToEditor,
    renderEditorContent, setActiveCanvas, workingStatus, handleRadarUncommittedClick, setStatus, refresh, branches, handleSidebarFocus
  ])

  const canvasUIState: CanvasUIState = useMemo(() => ({
    switching,
    deleting,
  }), [switching, deleting])

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
      <header className="ledger-header" data-testid="app-header">
        <div className="header-left">
          {repoPath && (
            <RepoSwitcher
              currentPath={repoPath}
              onRepoChange={(path) => {
                if (path === repoPath) return
                // Clear state before switching to prevent stale data mixing with new repo
                setWorktrees([])
                setBranches([])
                setCommits([])
                setPullRequests([])
                setGraphCommits([])
                setStashes([])
                setWorkingStatus(null)
                setSelectedCommit(null)
                setCommitDiff(null)
                setSidebarFocus(null)
                setError(null)
                setPrError(null)
                setRepoPath(path)
                setStatus({ type: 'info', message: 'Switching repository...' })
                refresh(path)
              }}
            />
          )}
          {repoPath && (
            <span
              className="repo-path clickable"
              data-testid="repo-path"
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
              {canvasState.canvases.map((canvas) => (
                <button
                  key={canvas.id}
                  className={`view-toggle-btn ${viewMode === canvas.id ? 'active' : ''}`}
                  onClick={() => setActiveCanvas(canvas.id)}
                  title={canvas.name}
                  data-testid={`view-toggle-${canvas.id}`}
                >
                  <span className="view-icon">{canvas.icon || '◻'}</span>
                  <span className="view-label">{canvas.name}</span>
                </button>
              ))}
            </div>
          )}
          {!repoPath ? (
            <button onClick={selectRepo} className="btn btn-secondary" data-testid="select-repo-header">
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
              <button
                onClick={selectRepo}
                className="view-toggle-btn"
                title="Change Repository"
                data-testid="change-repo-button"
              >
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
                onClick={() => refresh()}
                disabled={loading || switching}
                className="view-toggle-btn active"
                title="Refresh"
                data-testid="refresh-button"
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
        <div className="empty-state" data-testid="empty-state">
          <div className="empty-icon" data-testid="empty-icon">◈</div>
          <h2>Welcome to Ledger</h2>
          <p>Select a git repository to view your branches, worktrees and pull requests</p>
          <button onClick={selectRepo} className="btn btn-large btn-primary" data-testid="select-repo-empty">
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
        <main className="ledger-content canvas-mode" data-testid="main-content">
          {activeAppPlugin ? (
            <PluginAppContainer
              plugin={activeAppPlugin}
              activeNavItem={activePluginNavItem}
              onNavigate={handlePluginNavigate}
            />
          ) : (
            <CanvasRenderer
              data={canvasData}
              selection={canvasSelection}
              handlers={canvasHandlers}
              uiState={canvasUIState}
            />
          )}
        </main>
      )}

          {/* Plugin Settings Panel - manages its own visibility via store */}
          <PluginSettingsPanel />

          {/* Plugin Permission Dialog */}
          {pendingPermissionRequest && (
            <PermissionDialog
              pluginId={pendingPermissionRequest.pluginId}
              pluginName={pendingPermissionRequest.pluginName}
              permissions={pendingPermissionRequest.permissions}
              onApprove={(approved) => respondToPermissionRequest(true, approved)}
              onDeny={() => respondToPermissionRequest(false)}
            />
          )}

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
