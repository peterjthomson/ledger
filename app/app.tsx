import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { Branch, Worktree, BranchFilter, BranchSort, CheckoutResult, PullRequest, Commit, WorkingStatus, UncommittedFile, PRFilter, PRSort, GraphCommit, CommitDiff, StashEntry, StagingFileDiff, PRDetail, PRReviewComment, StashFile } from './types/electron'
import './styles/app.css'
import { useWindowContext } from './components/window'

type ViewMode = 'radar' | 'focus'

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

type SidebarFocusType = 'pr' | 'branch' | 'remote' | 'worktree' | 'stash' | 'uncommitted';

interface SidebarFocus {
  type: SidebarFocusType;
  data: PullRequest | Branch | Worktree | StashEntry | WorkingStatus;
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
  const { setTitle } = useWindowContext()
  
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('radar')
  
  // Work mode state
  const [graphCommits, setGraphCommits] = useState<GraphCommit[]>([])
  const [selectedCommit, setSelectedCommit] = useState<GraphCommit | null>(null)
  const [commitDiff, setCommitDiff] = useState<CommitDiff | null>(null)
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [sidebarFocus, setSidebarFocus] = useState<SidebarFocus | null>(null)
  
  // Sidebar collapsed state
  const [sidebarSections, setSidebarSections] = useState({
    branches: true,
    remotes: false,
    worktrees: true,
    stashes: false,
    prs: true,
  })
  
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

  // Focus view panel state (resizable + collapsible)
  const [sidebarWidth, setSidebarWidth] = useState(220)
  const [detailWidth, setDetailWidth] = useState(400)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [detailVisible, setDetailVisible] = useState(true)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [isResizingDetail, setIsResizingDetail] = useState(false)
  
  // Radar view column order (drag-and-drop)
  const [radarColumnOrder, setRadarColumnOrder] = useState<string[]>(['prs', 'worktrees', 'commits', 'branches', 'remotes'])
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

  // Column drag and drop handlers for Radar view
  const handleColumnDragStart = useCallback((e: React.DragEvent, columnId: string) => {
    setDraggingColumn(columnId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', columnId)
  }, [])

  const handleColumnDragOver = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    if (draggingColumn && draggingColumn !== columnId) {
      setDragOverColumn(columnId)
    }
  }, [draggingColumn])

  const handleColumnDragLeave = useCallback(() => {
    setDragOverColumn(null)
  }, [])

  const handleColumnDrop = useCallback((e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault()
    if (!draggingColumn || draggingColumn === targetColumnId) return

    setRadarColumnOrder(prev => {
      const newOrder = [...prev]
      const dragIndex = newOrder.indexOf(draggingColumn)
      const targetIndex = newOrder.indexOf(targetColumnId)
      newOrder.splice(dragIndex, 1)
      newOrder.splice(targetIndex, 0, draggingColumn)
      return newOrder
    })
    setDraggingColumn(null)
    setDragOverColumn(null)
  }, [draggingColumn])

  const handleColumnDragEnd = useCallback(() => {
    setDraggingColumn(null)
    setDragOverColumn(null)
  }, [])

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
      const [branchResult, worktreeResult, prResult, commitResult, statusResult, ghUrl, graphResult, stashResult] = await Promise.all([
        window.electronAPI.getBranchesWithMetadata(),
        window.electronAPI.getWorktrees(),
        window.electronAPI.getPullRequests(),
        window.electronAPI.getCommitHistory(15),
        window.electronAPI.getWorkingStatus(),
        window.electronAPI.getGitHubUrl(),
        window.electronAPI.getCommitGraphHistory(100),
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
    } catch (err) {
      setCommitDiff(null)
    } finally {
      setLoadingDiff(false)
    }
  }, [])

  // Handle sidebar item focus (single click)
  const handleSidebarFocus = useCallback((type: SidebarFocusType, data: PullRequest | Branch | Worktree | StashEntry | WorkingStatus) => {
    setSelectedCommit(null) // Clear commit selection when focusing sidebar item
    setCommitDiff(null)
    setSidebarFocus({ type, data })
  }, [])

  // Toggle sidebar section
  const toggleSidebarSection = useCallback((section: keyof typeof sidebarSections) => {
    setSidebarSections(prev => ({ ...prev, [section]: !prev[section] }))
  }, [])

  // Radar card double-click handlers - switch to Focus mode with item selected
  const handleRadarPRClick = useCallback((pr: PullRequest) => {
    setViewMode('focus')
    setSidebarSections(prev => ({ ...prev, prs: true }))
    handleSidebarFocus('pr', pr)
  }, [handleSidebarFocus])

  const handleRadarWorktreeClick = useCallback((wt: Worktree) => {
    setViewMode('focus')
    setSidebarSections(prev => ({ ...prev, worktrees: true }))
    handleSidebarFocus('worktree', wt)
  }, [handleSidebarFocus])

  const handleRadarBranchClick = useCallback((branch: Branch) => {
    setViewMode('focus')
    setSidebarSections(prev => ({ ...prev, branches: true }))
    handleSidebarFocus('branch', branch)
  }, [handleSidebarFocus])

  const handleRadarRemoteBranchClick = useCallback((branch: Branch) => {
    setViewMode('focus')
    setSidebarSections(prev => ({ ...prev, remotes: true }))
    handleSidebarFocus('remote', branch)
  }, [handleSidebarFocus])

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
        const hasChanges = wt.changedFileCount > 0 || wt.additions > 0 || wt.deletions > 0
        return [
          { label: 'Check Out Worktree', action: () => handleWorktreeDoubleClick(wt), disabled: !wt.branch || wt.branch === currentBranch || switching },
          { label: 'Convert to Branch', action: () => handleWorktreeConvertToBranch(wt), disabled: !hasChanges || switching },
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
          { label: 'Check Out', action: () => handleRemoteBranchDoubleClick(branch), disabled: switching },
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

  // Filter worktrees by parent
  const filteredWorktrees = useMemo(() => {
    if (worktreeParentFilter === 'all') {
      return worktrees
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

      {/* New Branch Modal */}
      {showNewBranchModal && (
        <div className="modal-overlay" onClick={() => setShowNewBranchModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create New Branch</h3>
              <button 
                className="modal-close"
                onClick={() => setShowNewBranchModal(false)}
              >
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
              <p className="modal-hint">
                Branch will be created from current HEAD and checked out
              </p>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowNewBranchModal(false)}
              >
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
            <div className="column-drag-handle" title="Drag to reorder">⋮⋮</div>
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
                      onDoubleClick={() => handleRadarPRClick(pr)}
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
            <div className="column-drag-handle" title="Drag to reorder">⋮⋮</div>
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
                  <label>Parent</label>
                  <select 
                    value={worktreeParentFilter} 
                    onChange={(e) => setWorktreeParentFilter(e.target.value)}
                    className="control-select"
                  >
                    <option value="all">All</option>
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
                      onDoubleClick={() => handleRadarWorktreeClick(wt)}
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
            <div className="column-drag-handle" title="Drag to reorder">⋮⋮</div>
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
            <div className="column-drag-handle" title="Drag to reorder">⋮⋮</div>
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
            <div className="column-drag-handle" title="Drag to reorder">⋮⋮</div>
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
                      onDoubleClick={() => handleRadarRemoteBranchClick(branch)}
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

      {/* Focus Mode Layout */}
      {repoPath && !error && viewMode === 'focus' && (
        <main className="work-mode-layout">
          {/* Panel Toggle for Sidebar */}
          {!sidebarVisible && (
            <button 
              className="panel-toggle panel-toggle-left"
              onClick={() => setSidebarVisible(true)}
              title="Show sidebar"
            >
              <span className="panel-toggle-icon">▸</span>
            </button>
          )}
          
          {/* Sidebar */}
          {sidebarVisible && (
          <aside className="work-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
            {/* PRs Section */}
            <div className="sidebar-section">
              <div className="sidebar-section-header">
                <div 
                  className="sidebar-section-toggle"
                  onClick={() => toggleSidebarSection('prs')}
                >
                  <span className={`sidebar-chevron ${sidebarSections.prs ? 'open' : ''}`}>▸</span>
                  <span className="sidebar-section-title">Pull Requests</span>
                  <span className="sidebar-count">{filteredPRs.length}</span>
                </div>
              </div>
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
                        <span className="sidebar-item-name">
                          <span className="sidebar-pr-number">#{pr.number}</span>
                          {pr.title}
                        </span>
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
                <div 
                  className="sidebar-section-toggle"
                  onClick={() => toggleSidebarSection('branches')}
                >
                  <span className={`sidebar-chevron ${sidebarSections.branches ? 'open' : ''}`}>▸</span>
                  <span className="sidebar-section-title">Branches</span>
                  <span className="sidebar-count">{localBranches.length}</span>
                </div>
                <button 
                  className="sidebar-section-action"
                  onClick={(e) => { e.stopPropagation(); setShowNewBranchModal(true); }}
                  title="Create new branch"
                >
                  +
                </button>
              </div>
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
                <div 
                  className="sidebar-section-toggle"
                  onClick={() => toggleSidebarSection('remotes')}
                >
                  <span className={`sidebar-chevron ${sidebarSections.remotes ? 'open' : ''}`}>▸</span>
                  <span className="sidebar-section-title">Remotes</span>
                  <span className="sidebar-count">{remoteBranches.length}</span>
                </div>
              </div>
              {sidebarSections.remotes && (
                <ul className="sidebar-list">
                  {remoteBranches.map((branch) => (
                    <li
                      key={branch.name}
                      className={`sidebar-item ${switching ? 'disabled' : ''} ${sidebarFocus?.type === 'remote' && (sidebarFocus.data as Branch).name === branch.name ? 'selected' : ''}`}
                      onClick={() => handleSidebarFocus('remote', branch)}
                      onDoubleClick={() => handleRemoteBranchDoubleClick(branch)}
                    >
                      <span className="sidebar-item-name">{branch.name.replace('remotes/', '').replace(/^origin\//, '')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Worktrees Section */}
            <div className="sidebar-section">
              <div className="sidebar-section-header">
                <div 
                  className="sidebar-section-toggle"
                  onClick={() => toggleSidebarSection('worktrees')}
                >
                  <span className={`sidebar-chevron ${sidebarSections.worktrees ? 'open' : ''}`}>▸</span>
                  <span className="sidebar-section-title">Worktrees</span>
                  <span className="sidebar-count">{worktrees.length}</span>
                </div>
              </div>
              {sidebarSections.worktrees && (
                <ul className="sidebar-list">
                  {worktrees.map((wt) => (
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
                <div 
                  className="sidebar-section-toggle"
                  onClick={() => toggleSidebarSection('stashes')}
                >
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
                        <span className="sidebar-item-name" title={stash.message}>
                          stash@{`{${stash.index}}`}: {stash.message}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            {/* Sidebar toggle button */}
            <button 
              className="panel-collapse-btn"
              onClick={() => setSidebarVisible(false)}
              title="Hide sidebar"
            >
              <span className="panel-collapse-icon">◀</span>
            </button>
          </aside>
          )}
          
          {/* Sidebar Resize Handle */}
          {sidebarVisible && (
            <div 
              className={`resize-handle resize-handle-sidebar ${isResizingSidebar ? 'active' : ''}`}
              onMouseDown={() => setIsResizingSidebar(true)}
            />
          )}

          {/* Main Content: Git Graph + Commit List */}
          <div className="work-main">
            <div className="work-main-header">
              <h2>
                <span className="column-icon">◉</span>
                History
                {currentBranch && <code className="commit-hash branch-badge">{currentBranch}</code>}
              </h2>
            </div>
            <div className="git-graph-container">
              <GitGraph 
                commits={graphCommits} 
                selectedCommit={selectedCommit}
                onSelectCommit={handleSelectCommit}
                formatRelativeTime={formatRelativeTime}
              />
            </div>
          </div>

          {/* Detail Panel Resize Handle */}
          {detailVisible && (
            <div 
              className={`resize-handle resize-handle-detail ${isResizingDetail ? 'active' : ''}`}
              onMouseDown={() => setIsResizingDetail(true)}
            />
          )}

          {/* Detail Panel */}
          {detailVisible && (
          <aside className="work-detail" style={{ width: detailWidth, minWidth: detailWidth }}>
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
                onStatusChange={setStatus}
                onRefresh={refresh}
                onClearFocus={() => setSidebarFocus(null)}
              />
            ) : sidebarFocus ? (
              <SidebarDetailPanel 
                focus={sidebarFocus} 
                formatRelativeTime={formatRelativeTime}
                formatDate={formatDate}
                currentBranch={currentBranch}
                onStatusChange={setStatus}
                onRefresh={refresh}
                onClearFocus={() => setSidebarFocus(null)}
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
            {/* Detail panel collapse button */}
            <button 
              className="panel-collapse-btn panel-collapse-btn-right"
              onClick={() => setDetailVisible(false)}
              title="Hide detail panel"
            >
              <span className="panel-collapse-icon">▶</span>
            </button>
          </aside>
          )}
          
          {/* Panel Toggle for Detail */}
          {!detailVisible && (
            <button 
              className="panel-toggle panel-toggle-right"
              onClick={() => setDetailVisible(true)}
              title="Show detail panel"
            >
              <span className="panel-toggle-icon">◂</span>
            </button>
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
  commits: GraphCommit[];
  selectedCommit: GraphCommit | null;
  onSelectCommit: (commit: GraphCommit) => void;
  formatRelativeTime: (date: string) => string;
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
];

function GitGraph({ commits, selectedCommit, onSelectCommit, formatRelativeTime }: GitGraphProps) {
  // Calculate lane assignments for the graph
  const { lanes, maxLane } = useMemo(() => {
    const laneMap = new Map<string, number>();
    const activeLanes = new Set<number>();
    let maxLaneUsed = 0;

    // Process commits in order (newest first)
    for (const commit of commits) {
      // Find or assign a lane for this commit
      let lane = laneMap.get(commit.hash);
      
      if (lane === undefined) {
        // Find first available lane
        lane = 0;
        while (activeLanes.has(lane)) lane++;
        laneMap.set(commit.hash, lane);
      }
      
      activeLanes.add(lane);
      maxLaneUsed = Math.max(maxLaneUsed, lane);

      // Assign lanes to parents
      commit.parents.forEach((parentHash, idx) => {
        if (!laneMap.has(parentHash)) {
          if (idx === 0) {
            // First parent stays in same lane
            laneMap.set(parentHash, lane!);
          } else {
            // Other parents get new lanes
            let parentLane = 0;
            while (activeLanes.has(parentLane) || parentLane === lane) parentLane++;
            laneMap.set(parentHash, parentLane);
            activeLanes.add(parentLane);
            maxLaneUsed = Math.max(maxLaneUsed, parentLane);
          }
        }
      });

      // If commit has no parents, release the lane
      if (commit.parents.length === 0) {
        activeLanes.delete(lane);
      }
    }

    return { lanes: laneMap, maxLane: maxLaneUsed };
  }, [commits]);

  const LANE_WIDTH = 16;
  const ROW_HEIGHT = 36;
  const NODE_RADIUS = 4;
  const graphWidth = (maxLane + 1) * LANE_WIDTH + 20;

  // Build a map of commit hash to index for drawing lines
  const commitIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    commits.forEach((c, i) => map.set(c.hash, i));
    return map;
  }, [commits]);

  return (
    <div className="git-graph">
      <svg 
        className="git-graph-svg" 
        width={graphWidth} 
        height={commits.length * ROW_HEIGHT}
        style={{ minWidth: graphWidth }}
      >
        {/* Draw connecting lines */}
        {commits.map((commit, idx) => {
          const lane = lanes.get(commit.hash) || 0;
          const x = 10 + lane * LANE_WIDTH;
          const y = idx * ROW_HEIGHT + ROW_HEIGHT / 2;
          const color = LANE_COLORS[lane % LANE_COLORS.length];

          return commit.parents.map((parentHash, pIdx) => {
            const parentIdx = commitIndexMap.get(parentHash);
            if (parentIdx === undefined) return null;
            
            const parentLane = lanes.get(parentHash) || 0;
            const px = 10 + parentLane * LANE_WIDTH;
            const py = parentIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
            const parentColor = LANE_COLORS[parentLane % LANE_COLORS.length];

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
              );
            } else {
              // Curved line for merges/branches
              const midY = (y + py) / 2;
              return (
                <path
                  key={`${commit.hash}-${parentHash}-${pIdx}`}
                  d={`M ${x} ${y} C ${x} ${midY}, ${px} ${midY}, ${px} ${py}`}
                  stroke={pIdx === 0 ? color : parentColor}
                  strokeWidth={2}
                  fill="none"
                />
              );
            }
          });
        })}

        {/* Draw commit nodes */}
        {commits.map((commit, idx) => {
          const lane = lanes.get(commit.hash) || 0;
          const x = 10 + lane * LANE_WIDTH;
          const y = idx * ROW_HEIGHT + ROW_HEIGHT / 2;
          const color = LANE_COLORS[lane % LANE_COLORS.length];
          const isSelected = selectedCommit?.hash === commit.hash;

          return (
            <g key={commit.hash}>
              {/* Selection ring */}
              {isSelected && (
                <circle
                  cx={x}
                  cy={y}
                  r={NODE_RADIUS + 3}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  opacity={0.5}
                />
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
          );
        })}
      </svg>

      {/* Commit list */}
      <div className="git-graph-list" style={{ marginLeft: graphWidth }}>
        {commits.map((commit, idx) => (
          <div
            key={commit.hash}
            className={`graph-commit-row ${selectedCommit?.hash === commit.hash ? 'selected' : ''}`}
            style={{ height: ROW_HEIGHT }}
            onClick={() => onSelectCommit(commit)}
          >
            <div className="graph-commit-refs">
              {commit.refs.map((ref, i) => {
                const isHead = ref.includes('HEAD');
                const isBranch = ref.includes('origin/') || !ref.includes('/');
                const cleanRef = ref.replace('HEAD -> ', '').replace('origin/', '');
                return (
                  <span 
                    key={i} 
                    className={`graph-ref ${isHead ? 'head' : ''} ${isBranch ? 'branch' : 'tag'}`}
                  >
                    {cleanRef}
                  </span>
                );
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
  );
}

// ========================================
// Diff Panel Component
// ========================================

interface DiffPanelProps {
  diff: CommitDiff;
  formatRelativeTime: (date: string) => string;
}

function DiffPanel({ diff, formatRelativeTime }: DiffPanelProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Expand all files by default on mount or diff change
  useEffect(() => {
    setExpandedFiles(new Set(diff.files.map(f => f.file.path)));
  }, [diff]);

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
          <span className="diff-stat-files">{diff.files.length} {diff.files.length === 1 ? 'file' : 'files'}</span>
          <span className="diff-stat-additions">+{diff.totalAdditions}</span>
          <span className="diff-stat-deletions">-{diff.totalDeletions}</span>
        </div>
      </div>

      {/* File list with diffs */}
      <div className="diff-files">
        {diff.files.map((fileDiff) => (
          <div key={fileDiff.file.path} className="diff-file">
            <div 
              className="diff-file-header"
              onClick={() => toggleFile(fileDiff.file.path)}
            >
              <span className={`diff-file-chevron ${expandedFiles.has(fileDiff.file.path) ? 'open' : ''}`}>▸</span>
              <span className={`diff-file-status diff-status-${fileDiff.file.status}`}>
                {fileDiff.file.status === 'added' ? 'A' : 
                 fileDiff.file.status === 'deleted' ? 'D' : 
                 fileDiff.file.status === 'renamed' ? 'R' : 'M'}
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
                          <div 
                            key={lineIdx} 
                            className={`diff-line diff-line-${line.type}`}
                          >
                            <span className="diff-line-number old">
                              {line.oldLineNumber || ''}
                            </span>
                            <span className="diff-line-number new">
                              {line.newLineNumber || ''}
                            </span>
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
  );
}

// ========================================
// Sidebar Detail Panel Component
// ========================================

interface SidebarDetailPanelProps {
  focus: SidebarFocus;
  formatRelativeTime: (date: string) => string;
  formatDate: (date?: string) => string;
  currentBranch: string;
  onStatusChange?: (status: StatusMessage | null) => void;
  onRefresh?: () => Promise<void>;
  onClearFocus?: () => void;
}

function SidebarDetailPanel({ focus, formatRelativeTime, formatDate, currentBranch, onStatusChange, onRefresh, onClearFocus }: SidebarDetailPanelProps) {
  const [creatingPR, setCreatingPR] = useState(false);
  const [pushing, setPushing] = useState(false);

  const handleCreatePR = async (branchName: string) => {
    setCreatingPR(true);
    onStatusChange?.({ type: 'info', message: 'Opening PR creation in browser...' });
    
    try {
      // Use --web flag to open GitHub's PR creation page
      const result = await window.electronAPI.createPullRequest({
        title: branchName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        web: true,
      });
      
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message });
      } else {
        onStatusChange?.({ type: 'error', message: result.message });
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message });
    } finally {
      setCreatingPR(false);
    }
  };

  const handlePush = async (branchName: string) => {
    setPushing(true);
    onStatusChange?.({ type: 'info', message: `Pushing ${branchName} to origin...` });
    
    try {
      const result = await window.electronAPI.pushBranch(branchName, true);
      
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message });
      } else {
        onStatusChange?.({ type: 'error', message: result.message });
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message });
    } finally {
      setPushing(false);
    }
  };

  switch (focus.type) {
    case 'pr': {
      // Handled by PRReviewPanel
      return null;
    }
    
    case 'branch': {
      const branch = focus.data as Branch;
      const isMainOrMaster = branch.name === 'main' || branch.name === 'master';
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
          
          {/* Actions */}
          <div className="detail-actions">
            {branch.current && (
              <button 
                className="btn btn-primary"
                onClick={() => handlePush(branch.name)}
                disabled={pushing}
              >
                {pushing ? 'Pushing...' : 'Push to Origin'}
              </button>
            )}
            {branch.current && !isMainOrMaster && (
              <button 
                className="btn btn-secondary"
                onClick={() => handleCreatePR(branch.name)}
                disabled={creatingPR}
              >
                {creatingPR ? 'Opening...' : 'Create Pull Request'}
              </button>
            )}
            <button 
              className="btn btn-secondary"
              onClick={() => window.electronAPI.openBranchInGitHub(branch.name)}
            >
              View on GitHub
            </button>
          </div>
          
          {!branch.current && (
            <div className="detail-actions-hint">
              Double-click to switch to this branch
            </div>
          )}
        </div>
      );
    }
    
    case 'remote': {
      const branch = focus.data as Branch;
      const displayName = branch.name.replace('remotes/', '').replace(/^origin\//, '');
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
          <div className="detail-actions-hint">
            Double-click to checkout this branch
          </div>
        </div>
      );
    }
    
    case 'worktree': {
      const wt = focus.data as Worktree;
      const isCurrent = wt.branch === currentBranch;
      return (
        <div className="sidebar-detail-panel">
          <div className="detail-type-badge">Worktree</div>
          <h3 className="detail-title">{wt.displayName}</h3>
          <div className="detail-meta-grid">
            <div className="detail-meta-item full-width">
              <span className="meta-label">Path</span>
              <code className="meta-value path">{wt.path}</code>
            </div>
            {wt.branch && (
              <div className="detail-meta-item">
                <span className="meta-label">Branch</span>
                <code className="meta-value">{wt.branch}</code>
              </div>
            )}
            <div className="detail-meta-item">
              <span className="meta-label">Status</span>
              <span className="meta-value">
                {isCurrent ? 'Current' : 'Not checked out'}
              </span>
            </div>
            <div className="detail-meta-item">
              <span className="meta-label">Changes</span>
              <span className="meta-value">
                {wt.changedFileCount > 0 ? (
                  <>
                    {wt.changedFileCount} {wt.changedFileCount === 1 ? 'file' : 'files'}
                    {(wt.additions > 0 || wt.deletions > 0) && (
                      <>
                        {' · '}
                        <span className="diff-additions">+{wt.additions}</span>
                        {' '}
                        <span className="diff-deletions">-{wt.deletions}</span>
                      </>
                    )}
                  </>
                ) : (
                  'Clean'
                )}
              </span>
            </div>
          </div>
          {!isCurrent && wt.branch && (
            <div className="detail-actions-hint">
              Double-click to checkout this worktree
            </div>
          )}
        </div>
      );
    }
    
    case 'stash': {
      const stash = focus.data as StashEntry;
      return (
        <StashDetailPanel 
          stash={stash} 
          formatRelativeTime={formatRelativeTime}
          onStatusChange={onStatusChange}
          onRefresh={onRefresh}
          onClearFocus={onClearFocus}
        />
      );
    }
    
    case 'uncommitted': {
      // Render the full staging panel
      return null; // Handled by parent component
    }
    
    default:
      return null;
  }
}

// ========================================
// Staging Panel Component
// ========================================

interface StagingPanelProps {
  workingStatus: WorkingStatus;
  currentBranch: string;
  onRefresh: () => Promise<void>;
  onStatusChange: (status: StatusMessage | null) => void;
}

function StagingPanel({ workingStatus, currentBranch, onRefresh, onStatusChange }: StagingPanelProps) {
  const [selectedFile, setSelectedFile] = useState<UncommittedFile | null>(null);
  const [fileDiff, setFileDiff] = useState<StagingFileDiff | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [pushAfterCommit, setPushAfterCommit] = useState(true);

  const stagedFiles = workingStatus.files.filter(f => f.staged);
  const unstagedFiles = workingStatus.files.filter(f => !f.staged);

  // Load diff when file is selected
  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null);
      return;
    }

    const loadDiff = async () => {
      setLoadingDiff(true);
      try {
        const diff = await window.electronAPI.getFileDiff(selectedFile.path, selectedFile.staged);
        setFileDiff(diff);
      } catch (error) {
        setFileDiff(null);
      } finally {
        setLoadingDiff(false);
      }
    };

    loadDiff();
  }, [selectedFile]);

  // Stage a file
  const handleStageFile = async (file: UncommittedFile) => {
    const result = await window.electronAPI.stageFile(file.path);
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message });
      await onRefresh();
    } else {
      onStatusChange({ type: 'error', message: result.message });
    }
  };

  // Unstage a file
  const handleUnstageFile = async (file: UncommittedFile) => {
    const result = await window.electronAPI.unstageFile(file.path);
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message });
      await onRefresh();
    } else {
      onStatusChange({ type: 'error', message: result.message });
    }
  };

  // Stage all files
  const handleStageAll = async () => {
    const result = await window.electronAPI.stageAll();
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message });
      await onRefresh();
    } else {
      onStatusChange({ type: 'error', message: result.message });
    }
  };

  // Unstage all files
  const handleUnstageAll = async () => {
    const result = await window.electronAPI.unstageAll();
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message });
      await onRefresh();
    } else {
      onStatusChange({ type: 'error', message: result.message });
    }
  };

  // Commit changes (and optionally push)
  const handleCommit = async () => {
    if (!commitMessage.trim() || stagedFiles.length === 0) return;

    setIsCommitting(true);
    try {
      const commitResult = await window.electronAPI.commitChanges(
        commitMessage.trim(),
        commitDescription.trim() || undefined
      );
      
      if (commitResult.success) {
        // If push after commit is enabled, push the branch
        if (pushAfterCommit && currentBranch) {
          onStatusChange({ type: 'info', message: 'Pushing to remote...' });
          const pushResult = await window.electronAPI.pushBranch(currentBranch, true);
          if (pushResult.success) {
            onStatusChange({ type: 'success', message: `Committed and pushed to ${currentBranch}` });
          } else {
            // Commit succeeded but push failed
            onStatusChange({ type: 'error', message: `Committed, but push failed: ${pushResult.message}` });
          }
        } else {
          onStatusChange({ type: 'success', message: commitResult.message });
        }
        setCommitMessage('');
        setCommitDescription('');
        await onRefresh();
      } else {
        onStatusChange({ type: 'error', message: commitResult.message });
      }
    } catch (error) {
      onStatusChange({ type: 'error', message: (error as Error).message });
    } finally {
      setIsCommitting(false);
    }
  };

  // File status helpers
  const getFileStatusIcon = (status: UncommittedFile['status']) => {
    switch (status) {
      case 'added': return '+';
      case 'deleted': return '−';
      case 'modified': return '●';
      case 'renamed': return '→';
      case 'untracked': return '?';
      default: return '?';
    }
  };

  const getFileStatusClass = (status: UncommittedFile['status']) => {
    switch (status) {
      case 'added': return 'file-added';
      case 'deleted': return 'file-deleted';
      case 'modified': return 'file-modified';
      case 'renamed': return 'file-renamed';
      case 'untracked': return 'file-untracked';
      default: return '';
    }
  };

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
        {currentBranch && (
          <div className="staging-branch-indicator">
            <span className="staging-branch-label">Committing to</span>
            <code className="staging-branch-name">{currentBranch}</code>
          </div>
        )}
      </div>

      {/* File Lists */}
      <div className="staging-files">
        {/* Unstaged Section */}
        <div className="staging-section">
          <div className="staging-section-header">
            <span className="staging-section-title">Unstaged</span>
            <span className="staging-section-count">{unstagedFiles.length}</span>
            {unstagedFiles.length > 0 && (
              <button 
                className="staging-action-btn"
                onClick={handleStageAll}
                title="Stage all"
              >
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
                >
                  <span className="file-status-icon">{getFileStatusIcon(file.status)}</span>
                  <span className="file-path" title={file.path}>{file.path}</span>
                  <button 
                    className="file-action-btn stage"
                    onClick={(e) => { e.stopPropagation(); handleStageFile(file); }}
                    title="Stage file"
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="staging-empty">No unstaged changes</div>
          )}
        </div>

        {/* Staged Section */}
        <div className="staging-section">
          <div className="staging-section-header">
            <span className="staging-section-title">Staged</span>
            <span className="staging-section-count">{stagedFiles.length}</span>
            {stagedFiles.length > 0 && (
              <button 
                className="staging-action-btn"
                onClick={handleUnstageAll}
                title="Unstage all"
              >
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
                  <span className="file-path" title={file.path}>{file.path}</span>
                  <button 
                    className="file-action-btn unstage"
                    onClick={(e) => { e.stopPropagation(); handleUnstageFile(file); }}
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
      </div>

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
        <div className="commit-options">
          <label className="commit-option-checkbox">
            <input
              type="checkbox"
              checked={pushAfterCommit}
              onChange={(e) => setPushAfterCommit(e.target.checked)}
            />
            <span>Push to <code>{currentBranch || 'remote'}</code> after commit</span>
          </label>
        </div>
        <button
          className="btn btn-primary commit-btn"
          onClick={handleCommit}
          disabled={!commitMessage.trim() || stagedFiles.length === 0 || isCommitting}
        >
          {isCommitting 
            ? (pushAfterCommit ? 'Committing & Pushing...' : 'Committing...') 
            : (pushAfterCommit 
                ? `Commit & Push ${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''}` 
                : `Commit ${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''}`
              )
          }
        </button>
      </div>
    </div>
  );
}

// ========================================
// PR Review Panel Component
// ========================================

interface PRReviewPanelProps {
  pr: PullRequest;
  formatRelativeTime: (date: string) => string;
  onStatusChange?: (status: StatusMessage | null) => void;
  onRefresh?: () => Promise<void>;
  onClearFocus?: () => void;
}

type PRTab = 'conversation' | 'files' | 'commits';

// Known AI/bot authors
const AI_AUTHORS = ['copilot', 'github-actions', 'dependabot', 'renovate', 'coderabbit', 'vercel', 'netlify', 'codecov'];

function isAIAuthor(login: string): boolean {
  const lower = login.toLowerCase();
  return AI_AUTHORS.some(ai => lower.includes(ai)) || lower.endsWith('[bot]') || lower.endsWith('-bot');
}

function PRReviewPanel({ pr, formatRelativeTime, onStatusChange, onRefresh, onClearFocus }: PRReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<PRTab>('conversation');
  const [prDetail, setPrDetail] = useState<PRDetail | null>(null);
  const [reviewComments, setReviewComments] = useState<PRReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [showAIComments, setShowAIComments] = useState(true);
  const [merging, setMerging] = useState(false);
  const [showMergeOptions, setShowMergeOptions] = useState(false);

  // Load full PR details
  useEffect(() => {
    const loadPRDetail = async () => {
      setLoading(true);
      try {
        const [detail, comments] = await Promise.all([
          window.electronAPI.getPRDetail(pr.number),
          window.electronAPI.getPRReviewComments(pr.number),
        ]);
        setPrDetail(detail);
        setReviewComments(comments);
      } catch (error) {
        console.error('Error loading PR detail:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPRDetail();
  }, [pr.number]);

  // Load file diff when selected
  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null);
      return;
    }

    const loadDiff = async () => {
      setLoadingDiff(true);
      try {
        const diff = await window.electronAPI.getPRFileDiff(pr.number, selectedFile);
        setFileDiff(diff);
      } catch (error) {
        setFileDiff(null);
      } finally {
        setLoadingDiff(false);
      }
    };

    loadDiff();
  }, [pr.number, selectedFile]);

  // Filter comments by AI/human
  const filteredComments = useMemo(() => {
    if (!prDetail) return [];
    if (showAIComments) return prDetail.comments;
    return prDetail.comments.filter(c => !isAIAuthor(c.author.login));
  }, [prDetail, showAIComments]);

  const filteredReviews = useMemo(() => {
    if (!prDetail) return [];
    if (showAIComments) return prDetail.reviews;
    return prDetail.reviews.filter(r => !isAIAuthor(r.author.login));
  }, [prDetail, showAIComments]);

  // Count AI vs human comments
  const aiCommentCount = useMemo(() => {
    if (!prDetail) return 0;
    return prDetail.comments.filter(c => isAIAuthor(c.author.login)).length +
           prDetail.reviews.filter(r => isAIAuthor(r.author.login)).length;
  }, [prDetail]);

  const humanCommentCount = useMemo(() => {
    if (!prDetail) return 0;
    return prDetail.comments.filter(c => !isAIAuthor(c.author.login)).length +
           prDetail.reviews.filter(r => !isAIAuthor(r.author.login)).length;
  }, [prDetail]);

  // Get review comments for a specific file
  const getFileComments = (filePath: string) => {
    return reviewComments.filter(c => c.path === filePath);
  };

  // Handle PR merge
  const handleMerge = async (method: 'merge' | 'squash' | 'rebase') => {
    setMerging(true);
    setShowMergeOptions(false);
    onStatusChange?.({ type: 'info', message: `Merging PR #${pr.number}...` });

    try {
      const result = await window.electronAPI.mergePullRequest(pr.number, { method });
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message });
        // Refresh the PR list and clear focus since PR is now merged
        await onRefresh?.();
        onClearFocus?.();
      } else {
        onStatusChange?.({ type: 'error', message: result.message });
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message });
    } finally {
      setMerging(false);
    }
  };

  // Check if PR can be merged
  const canMerge = prDetail?.state === 'OPEN';

  // Get review state badge
  const getReviewStateBadge = (state: string) => {
    switch (state) {
      case 'APPROVED':
        return <span className="pr-review-badge approved">Approved</span>;
      case 'CHANGES_REQUESTED':
        return <span className="pr-review-badge changes">Changes Requested</span>;
      case 'COMMENTED':
        return <span className="pr-review-badge commented">Commented</span>;
      case 'DISMISSED':
        return <span className="pr-review-badge dismissed">Dismissed</span>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="pr-review-panel">
        <div className="pr-review-loading">Loading PR details...</div>
      </div>
    );
  }

  if (!prDetail) {
    return (
      <div className="pr-review-panel">
        <div className="pr-review-error">Could not load PR details</div>
      </div>
    );
  }

  return (
    <div className="pr-review-panel">
      {/* Header */}
      <div className="pr-review-header">
        <div className="pr-review-title-row">
          <h3 className="pr-review-title">#{pr.number} {prDetail.title}</h3>
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

      {/* Tabs */}
      <div className="pr-review-tabs">
        <button 
          className={`pr-tab ${activeTab === 'conversation' ? 'active' : ''}`}
          onClick={() => setActiveTab('conversation')}
        >
          Conversation
          <span className="pr-tab-count">{filteredComments.length + filteredReviews.length}</span>
        </button>
        <button 
          className={`pr-tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          Files
          <span className="pr-tab-count">{prDetail.files.length}</span>
        </button>
        <button 
          className={`pr-tab ${activeTab === 'commits' ? 'active' : ''}`}
          onClick={() => setActiveTab('commits')}
        >
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
                <input 
                  type="checkbox" 
                  checked={showAIComments} 
                  onChange={(e) => setShowAIComments(e.target.checked)}
                />
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
                const dateA = new Date('submittedAt' in a ? a.submittedAt : a.createdAt);
                const dateB = new Date('submittedAt' in b ? b.submittedAt : b.createdAt);
                return dateA.getTime() - dateB.getTime();
              })
              .map((item, idx) => {
                const isReview = 'state' in item;
                const author = item.author.login;
                const isAI = isAIAuthor(author);
                const date = isReview ? (item as any).submittedAt : (item as any).createdAt;

                return (
                  <div key={idx} className={`pr-comment ${isAI ? 'ai-comment' : ''} ${isReview ? 'pr-review' : ''}`}>
                    <div className="pr-comment-header">
                      <span className="pr-comment-author">
                        {isAI && <span className="ai-badge">🤖</span>}
                        @{author}
                      </span>
                      {isReview && getReviewStateBadge((item as any).state)}
                      <span className="pr-comment-time">{formatRelativeTime(date)}</span>
                    </div>
                    {item.body && <div className="pr-comment-body">{item.body}</div>}
                  </div>
                );
              })}

            {filteredComments.length === 0 && filteredReviews.length === 0 && !prDetail.body && (
              <div className="pr-empty">No comments yet</div>
            )}
          </div>
        )}

        {/* Files Tab */}
        {activeTab === 'files' && (
          <div className="pr-files">
            <div className="pr-files-list">
              {prDetail.files.map((file) => {
                const fileComments = getFileComments(file.path);
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
                      {fileComments.length > 0 && (
                        <span className="pr-file-comments">💬 {fileComments.length}</span>
                      )}
                    </span>
                  </div>
                );
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
                      e.preventDefault();
                      window.electronAPI.openPullRequest(`${pr.url}/files`);
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
                      <div key={comment.id} className={`pr-inline-comment ${isAIAuthor(comment.author.login) ? 'ai-comment' : ''}`}>
                        <div className="pr-inline-comment-header">
                          <span className="pr-comment-author">
                            {isAIAuthor(comment.author.login) && <span className="ai-badge">🤖</span>}
                            @{comment.author.login}
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

      {/* Footer with GitHub link and Merge button */}
      <div className="pr-review-footer">
        <button
          className="btn btn-secondary"
          onClick={() => window.electronAPI.openPullRequest(pr.url)}
        >
          Open on GitHub
        </button>

        {canMerge && (
          <div className="pr-merge-container">
            <button
              className="btn btn-primary"
              onClick={() => setShowMergeOptions(!showMergeOptions)}
              disabled={merging}
            >
              {merging ? 'Merging...' : 'Merge'}
            </button>

            {showMergeOptions && (
              <div className="pr-merge-dropdown">
                <button
                  className="pr-merge-option"
                  onClick={() => handleMerge('merge')}
                >
                  <span className="pr-merge-option-title">Create a merge commit</span>
                  <span className="pr-merge-option-desc">All commits will be added to the base branch via a merge commit.</span>
                </button>
                <button
                  className="pr-merge-option"
                  onClick={() => handleMerge('squash')}
                >
                  <span className="pr-merge-option-title">Squash and merge</span>
                  <span className="pr-merge-option-desc">All commits will be combined into one commit in the base branch.</span>
                </button>
                <button
                  className="pr-merge-option"
                  onClick={() => handleMerge('rebase')}
                >
                  <span className="pr-merge-option-title">Rebase and merge</span>
                  <span className="pr-merge-option-desc">All commits will be rebased and added to the base branch.</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// Stash Detail Panel Component
// ========================================

interface StashDetailPanelProps {
  stash: StashEntry;
  formatRelativeTime: (date: string) => string;
  onStatusChange?: (status: StatusMessage | null) => void;
  onRefresh?: () => Promise<void>;
  onClearFocus?: () => void;
}

function StashDetailPanel({ stash, formatRelativeTime, onStatusChange, onRefresh, onClearFocus }: StashDetailPanelProps) {
  const [files, setFiles] = useState<StashFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [branchName, setBranchName] = useState('');

  // Handle Apply stash
  const handleApply = async () => {
    setActionInProgress(true);
    onStatusChange?.({ type: 'info', message: `Applying stash@{${stash.index}}...` });
    
    try {
      const result = await window.electronAPI.applyStash(stash.index);
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message });
        await onRefresh?.();
      } else {
        onStatusChange?.({ type: 'error', message: result.message });
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message });
    } finally {
      setActionInProgress(false);
    }
  };

  // Handle Drop stash
  const handleDrop = async () => {
    if (!confirm(`Drop stash@{${stash.index}}? This cannot be undone.`)) return;
    
    setActionInProgress(true);
    onStatusChange?.({ type: 'info', message: `Dropping stash@{${stash.index}}...` });
    
    try {
      const result = await window.electronAPI.dropStash(stash.index);
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message });
        onClearFocus?.();
        await onRefresh?.();
      } else {
        onStatusChange?.({ type: 'error', message: result.message });
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message });
    } finally {
      setActionInProgress(false);
    }
  };

  // Handle Create branch from stash
  const handleCreateBranch = async () => {
    if (!branchName.trim()) return;
    
    setActionInProgress(true);
    onStatusChange?.({ type: 'info', message: `Creating branch '${branchName}' from stash...` });
    
    try {
      const result = await window.electronAPI.stashToBranch(stash.index, branchName.trim());
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message });
        setShowBranchModal(false);
        setBranchName('');
        onClearFocus?.();
        await onRefresh?.();
      } else {
        onStatusChange?.({ type: 'error', message: result.message });
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message });
    } finally {
      setActionInProgress(false);
    }
  };

  // Load stash files
  useEffect(() => {
    const loadFiles = async () => {
      setLoading(true);
      try {
        const stashFiles = await window.electronAPI.getStashFiles(stash.index);
        setFiles(stashFiles);
      } catch (error) {
        console.error('Error loading stash files:', error);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    };

    loadFiles();
    setSelectedFile(null);
    setFileDiff(null);
  }, [stash.index]);

  // Load file diff when selected
  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null);
      return;
    }

    const loadDiff = async () => {
      setLoadingDiff(true);
      try {
        const diff = await window.electronAPI.getStashFileDiff(stash.index, selectedFile);
        setFileDiff(diff);
      } catch (error) {
        setFileDiff(null);
      } finally {
        setLoadingDiff(false);
      }
    };

    loadDiff();
  }, [stash.index, selectedFile]);

  const getStatusIcon = (status: StashFile['status']) => {
    switch (status) {
      case 'added': return 'A';
      case 'modified': return 'M';
      case 'deleted': return 'D';
      case 'renamed': return 'R';
      default: return '?';
    }
  };

  const getStatusClass = (status: StashFile['status']) => {
    switch (status) {
      case 'added': return 'status-added';
      case 'modified': return 'status-modified';
      case 'deleted': return 'status-deleted';
      case 'renamed': return 'status-renamed';
      default: return '';
    }
  };

  return (
    <div className="stash-detail-panel">
      {/* Header */}
      <div className="stash-header">
        <div className="detail-type-badge">Stash</div>
        <h3 className="stash-title">stash@{`{${stash.index}}`}</h3>
        <p className="stash-message">{stash.message}</p>
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
                <span className={`stash-file-status ${getStatusClass(file.status)}`}>
                  {getStatusIcon(file.status)}
                </span>
                <span className="stash-file-path" title={file.path}>{file.path}</span>
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
        <button 
          className="btn btn-primary"
          onClick={handleApply}
          disabled={actionInProgress}
        >
          Apply
        </button>
        <button 
          className="btn btn-secondary"
          onClick={() => setShowBranchModal(true)}
          disabled={actionInProgress}
        >
          Create Branch
        </button>
        <button 
          className="btn btn-danger"
          onClick={handleDrop}
          disabled={actionInProgress}
        >
          Drop
        </button>
      </div>

      {/* Create Branch Modal */}
      {showBranchModal && (
        <div className="modal-overlay" onClick={() => setShowBranchModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Branch from Stash</h3>
              <button className="modal-close" onClick={() => setShowBranchModal(false)}>×</button>
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
                      handleCreateBranch();
                    }
                  }}
                />
              </label>
              <p className="modal-hint">
                This will create a new branch from the commit where this stash was created, apply the stashed changes, and remove the stash.
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
  );
}
