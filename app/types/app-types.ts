/**
 * App-level types for the Ledger UI
 * These are internal types used by the React components
 */

import type {
  Branch,
  Worktree,
  PullRequest,
  Commit,
  WorkingStatus,
  StashEntry,
  RepoInfo,
} from './electron'

// Canvas identifiers (matches canvas IDs in CanvasContext)
export type ViewMode = 'radar' | 'focus' | 'graph'
export type MainPanelView = 'history' | 'settings'

// Status messages shown as toasts
export interface StatusMessage {
  type: 'success' | 'error' | 'info'
  message: string
  stashed?: string
}

// Context menu types
export type ContextMenuType = 'pr' | 'worktree' | 'local-branch' | 'remote-branch' | 'commit' | 'uncommitted'

export interface ContextMenu {
  type: ContextMenuType
  x: number
  y: number
  data: PullRequest | Worktree | Branch | Commit | WorkingStatus
}

export interface MenuItem {
  label: string
  action: () => void
  disabled?: boolean
}

// Sidebar focus state (what's selected in Focus mode)
export type SidebarFocusType = 'pr' | 'branch' | 'remote' | 'worktree' | 'stash' | 'uncommitted' | 'create-worktree' | 'mailmap' | 'repo'

export interface SidebarFocus {
  type: SidebarFocusType
  data: PullRequest | Branch | Worktree | StashEntry | WorkingStatus | RepoInfo | null
}

// ========================================
// Canvas Architecture Types
// ========================================

/**
 * Slot types define what panels naturally fit in each column
 */
export type SlotType = 'list' | 'editor' | 'viz'

/**
 * Panel types grouped by their natural slot
 */
export type ListPanelType =
  | 'pr-list'
  | 'branch-list'
  | 'remote-list'
  | 'worktree-list'
  | 'stash-list'
  | 'commit-list'
  | 'repo-list'
  | 'sidebar'

export type EditorPanelType =
  | 'pr-detail'
  | 'branch-detail'
  | 'remote-detail'
  | 'worktree-detail'
  | 'commit-detail'
  | 'stash-detail'
  | 'repo-detail'
  | 'create-branch'
  | 'create-worktree'
  | 'staging'
  | 'settings'
  | 'mailmap-detail'
  | 'empty'

export type VizPanelType = 'git-graph' | 'timeline' | 'tech-tree' | 'erd-canvas' | 'file-graph'

export type PanelType = ListPanelType | EditorPanelType | VizPanelType

/**
 * Column definition within a canvas
 * 
 * All columns support:
 * - Drag reorder (via header drag handle)
 * - Resize (via edge drag, respects minWidth)
 * - Visibility toggle (if collapsible: true)
 */
export interface Column {
  id: string
  slotType: SlotType           // Natural fit (list, editor, viz)
  panel: PanelType             // Current panel (loose - can override slot type)
  width: number | 'flex'       // Width in pixels or flex grow
  minWidth?: number            // Minimum width for resizing
  config?: Record<string, unknown>  // Panel-specific config
  
  // Display
  label?: string               // Header label (e.g., "Pull Requests")
  icon?: string                // Header icon (e.g., "⊕")
  
  // Visibility
  visible?: boolean            // Is column shown? (default: true)
  collapsible?: boolean        // Can user toggle visibility? (default: false)
}

/**
 * Canvas definition - a named layout with columns
 * 
 * All canvases share the same behaviors:
 * - Column drag reorder
 * - Column resize
 * - Column visibility toggle
 * - Editor back/forward navigation (if has editor slot)
 */
export interface Canvas {
  id: string
  name: string
  icon?: string                // Tab icon (e.g., "📡")
  columns: Column[]
  isPreset?: boolean           // Built-in canvases that can't be deleted
}

/**
 * Editor history entry for back/forward navigation
 */
export interface EditorHistoryEntry {
  panel: EditorPanelType
  data?: unknown               // Panel-specific data (PR, Branch, etc.)
  timestamp: number
}

/**
 * Global editor state - shared across all canvases
 * Canvas controls WHERE editor appears, this controls WHAT it shows
 */
export interface EditorState {
  history: EditorHistoryEntry[]
  historyIndex: number         // Current position in history (-1 = nothing selected)
}

/**
 * Canvas state for the entire app
 */
export interface CanvasState {
  canvases: Canvas[]
  activeCanvasId: string
  editorState: EditorState
}
