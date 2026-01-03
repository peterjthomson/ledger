/**
 * UI Store
 *
 * Manages UI preferences, layout, filters, and view settings.
 * Persisted to localStorage so preferences survive app restart.
 */

import type { BranchFilter, BranchSort, PRFilter, PRSort } from '../types/electron'
import type { ViewMode, MainPanelView, SidebarFocus } from '../types/app-types'
import type { ThemeMode } from '../theme'
import { createAppStore } from './create-store'

// Sidebar section collapse states
export interface SidebarSections {
  branches: boolean
  remotes: boolean
  worktrees: boolean
  stashes: boolean
  prs: boolean
}

// Sidebar filter panel open states
export interface SidebarFiltersOpen {
  prs: boolean
  branches: boolean
  remotes: boolean
  worktrees: boolean
}

export interface UIState {
  // Theme
  themeMode: ThemeMode

  // View modes
  viewMode: ViewMode
  mainPanelView: MainPanelView

  // Layout sizes
  sidebarWidth: number
  detailWidth: number
  sidebarVisible: boolean
  mainVisible: boolean
  detailVisible: boolean

  // Sidebar state (Focus mode)
  sidebarFocus: SidebarFocus | null
  sidebarSections: SidebarSections
  sidebarFiltersOpen: SidebarFiltersOpen

  // Filter panels
  historyFilterOpen: boolean
  radarCommitsFilterOpen: boolean

  // Display options
  showCheckpoints: boolean
  showGraphLines: boolean
  onlyBranchHeads: boolean
  onlyUnmergedBranches: boolean

  // Filters
  localFilter: BranchFilter
  localSort: BranchSort
  remoteFilter: BranchFilter
  remoteSort: BranchSort
  prFilter: PRFilter
  prSort: PRSort
  worktreeParentFilter: string

  // Search
  prSearch: string
  localBranchSearch: string
  remoteBranchSearch: string
  worktreeSearch: string

  // Control panels (expanded states)
  prControlsOpen: boolean
  localControlsOpen: boolean
  remoteControlsOpen: boolean
  worktreeControlsOpen: boolean

  // Radar column order
  radarColumnOrder: string[]
}

export interface UIActions {
  // Theme
  setThemeMode: (mode: ThemeMode) => void

  // View modes
  setViewMode: (mode: ViewMode) => void
  setMainPanelView: (view: MainPanelView) => void

  // Layout
  setSidebarWidth: (width: number) => void
  setDetailWidth: (width: number) => void
  setSidebarVisible: (visible: boolean) => void
  setMainVisible: (visible: boolean) => void
  setDetailVisible: (visible: boolean) => void
  toggleSidebar: () => void
  toggleDetail: () => void

  // Sidebar focus
  setSidebarFocus: (focus: SidebarFocus | null) => void
  setSidebarSections: (sections: SidebarSections) => void
  toggleSidebarSection: (key: keyof SidebarSections) => void
  setSidebarFiltersOpen: (filters: SidebarFiltersOpen) => void
  toggleSidebarFilter: (key: keyof SidebarFiltersOpen) => void

  // Filter panels
  setHistoryFilterOpen: (open: boolean) => void
  setRadarCommitsFilterOpen: (open: boolean) => void

  // Display options
  setShowCheckpoints: (show: boolean) => void
  setShowGraphLines: (show: boolean) => void
  setOnlyBranchHeads: (only: boolean) => void
  setOnlyUnmergedBranches: (only: boolean) => void

  // Filters
  setLocalFilter: (filter: BranchFilter) => void
  setLocalSort: (sort: BranchSort) => void
  setRemoteFilter: (filter: BranchFilter) => void
  setRemoteSort: (sort: BranchSort) => void
  setPrFilter: (filter: PRFilter) => void
  setPrSort: (sort: PRSort) => void
  setWorktreeParentFilter: (filter: string) => void

  // Search
  setPrSearch: (search: string) => void
  setLocalBranchSearch: (search: string) => void
  setRemoteBranchSearch: (search: string) => void
  setWorktreeSearch: (search: string) => void

  // Control panels
  setPrControlsOpen: (open: boolean) => void
  setLocalControlsOpen: (open: boolean) => void
  setRemoteControlsOpen: (open: boolean) => void
  setWorktreeControlsOpen: (open: boolean) => void

  // Radar columns
  setRadarColumnOrder: (order: string[]) => void
}

const defaultSidebarSections: SidebarSections = {
  branches: true,
  remotes: false,
  worktrees: true,
  stashes: false,
  prs: true,
}

const defaultSidebarFiltersOpen: SidebarFiltersOpen = {
  prs: false,
  branches: false,
  remotes: false,
  worktrees: false,
}

const defaultRadarColumnOrder = ['prs', 'worktrees', 'commits', 'branches', 'remotes']

const initialState: UIState = {
  // Theme
  themeMode: 'light',

  // View modes
  viewMode: 'radar',
  mainPanelView: 'history',

  // Layout
  sidebarWidth: 220,
  detailWidth: 400,
  sidebarVisible: true,
  mainVisible: true,
  detailVisible: true,

  // Sidebar
  sidebarFocus: null,
  sidebarSections: defaultSidebarSections,
  sidebarFiltersOpen: defaultSidebarFiltersOpen,

  // Filter panels
  historyFilterOpen: false,
  radarCommitsFilterOpen: false,

  // Display options
  showCheckpoints: false,
  showGraphLines: true,
  onlyBranchHeads: false,
  onlyUnmergedBranches: false,

  // Filters
  localFilter: 'all',
  localSort: 'name',
  remoteFilter: 'all',
  remoteSort: 'name',
  prFilter: 'open-not-draft',
  prSort: 'updated',
  worktreeParentFilter: 'all',

  // Search
  prSearch: '',
  localBranchSearch: '',
  remoteBranchSearch: '',
  worktreeSearch: '',

  // Control panels
  prControlsOpen: false,
  localControlsOpen: false,
  remoteControlsOpen: false,
  worktreeControlsOpen: false,

  // Radar columns
  radarColumnOrder: defaultRadarColumnOrder,
}

export const useUIStore = createAppStore<UIState & UIActions>(
  'ui',
  (set) => ({
    ...initialState,

    // Theme
    setThemeMode: (mode) => set({ themeMode: mode }),

    // View modes
    setViewMode: (mode) => set({ viewMode: mode }),
    setMainPanelView: (view) => set({ mainPanelView: view }),

    // Layout
    setSidebarWidth: (width) => set({ sidebarWidth: width }),
    setDetailWidth: (width) => set({ detailWidth: width }),
    setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
    setMainVisible: (visible) => set({ mainVisible: visible }),
    setDetailVisible: (visible) => set({ detailVisible: visible }),
    toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
    toggleDetail: () => set((s) => ({ detailVisible: !s.detailVisible })),

    // Sidebar focus
    setSidebarFocus: (focus) => set({ sidebarFocus: focus }),
    setSidebarSections: (sections) => set({ sidebarSections: sections }),
    toggleSidebarSection: (key) =>
      set((s) => ({
        sidebarSections: { ...s.sidebarSections, [key]: !s.sidebarSections[key] },
      })),
    setSidebarFiltersOpen: (filters) => set({ sidebarFiltersOpen: filters }),
    toggleSidebarFilter: (key) =>
      set((s) => ({
        sidebarFiltersOpen: { ...s.sidebarFiltersOpen, [key]: !s.sidebarFiltersOpen[key] },
      })),

    // Filter panels
    setHistoryFilterOpen: (open) => set({ historyFilterOpen: open }),
    setRadarCommitsFilterOpen: (open) => set({ radarCommitsFilterOpen: open }),

    // Display options
    setShowCheckpoints: (show) => set({ showCheckpoints: show }),
    setShowGraphLines: (show) => set({ showGraphLines: show }),
    setOnlyBranchHeads: (only) => set({ onlyBranchHeads: only }),
    setOnlyUnmergedBranches: (only) => set({ onlyUnmergedBranches: only }),

    // Filters
    setLocalFilter: (filter) => set({ localFilter: filter }),
    setLocalSort: (sort) => set({ localSort: sort }),
    setRemoteFilter: (filter) => set({ remoteFilter: filter }),
    setRemoteSort: (sort) => set({ remoteSort: sort }),
    setPrFilter: (filter) => set({ prFilter: filter }),
    setPrSort: (sort) => set({ prSort: sort }),
    setWorktreeParentFilter: (filter) => set({ worktreeParentFilter: filter }),

    // Search
    setPrSearch: (search) => set({ prSearch: search }),
    setLocalBranchSearch: (search) => set({ localBranchSearch: search }),
    setRemoteBranchSearch: (search) => set({ remoteBranchSearch: search }),
    setWorktreeSearch: (search) => set({ worktreeSearch: search }),

    // Control panels
    setPrControlsOpen: (open) => set({ prControlsOpen: open }),
    setLocalControlsOpen: (open) => set({ localControlsOpen: open }),
    setRemoteControlsOpen: (open) => set({ remoteControlsOpen: open }),
    setWorktreeControlsOpen: (open) => set({ worktreeControlsOpen: open }),

    // Radar columns
    setRadarColumnOrder: (order) => set({ radarColumnOrder: order }),
  }),
  {
    persist: true,
    partialize: (state) => ({
      // Only persist preferences, not ephemeral state
      themeMode: state.themeMode,
      viewMode: state.viewMode,
      sidebarWidth: state.sidebarWidth,
      detailWidth: state.detailWidth,
      sidebarVisible: state.sidebarVisible,
      detailVisible: state.detailVisible,
      showCheckpoints: state.showCheckpoints,
      showGraphLines: state.showGraphLines,
      localFilter: state.localFilter,
      localSort: state.localSort,
      remoteFilter: state.remoteFilter,
      remoteSort: state.remoteSort,
      prFilter: state.prFilter,
      prSort: state.prSort,
      radarColumnOrder: state.radarColumnOrder,
    }),
  }
)

// Selector helpers
export const selectFilters = (state: UIState) => ({
  localFilter: state.localFilter,
  localSort: state.localSort,
  remoteFilter: state.remoteFilter,
  remoteSort: state.remoteSort,
  prFilter: state.prFilter,
  prSort: state.prSort,
})

export const selectSearch = (state: UIState) => ({
  prSearch: state.prSearch,
  localBranchSearch: state.localBranchSearch,
  remoteBranchSearch: state.remoteBranchSearch,
  worktreeSearch: state.worktreeSearch,
})
