/**
 * CanvasContext - Global state management for canvases and editor
 *
 * Provides:
 * - Active canvas state
 * - Canvas switching
 * - Global editor state with back/forward navigation
 * - Column resize/reorder operations
 */

import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react'
import type {
  Canvas,
  Column,
  CanvasState,
  EditorState,
  EditorPanelType,
  EditorHistoryEntry,
  PanelType,
} from '../../types/app-types'

// ========================================
// Built-in Canvas Presets
// ========================================

export const RADAR_CANVAS: Canvas = {
  id: 'radar',
  name: 'Radar',
  icon: '⊞',
  isPreset: true,
  columns: [
    { id: 'radar-prs', slotType: 'list', panel: 'pr-list', width: 'flex', minWidth: 150, label: 'Pull Requests', icon: '⊕', collapsible: true },
    { id: 'radar-worktrees', slotType: 'list', panel: 'worktree-list', width: 'flex', minWidth: 150, label: 'Worktrees', icon: '⊙', collapsible: true },
    { id: 'radar-commits', slotType: 'list', panel: 'commit-list', width: 'flex', minWidth: 150, label: 'Commits', icon: '◉', collapsible: true },
    { id: 'radar-branches', slotType: 'list', panel: 'branch-list', width: 'flex', minWidth: 150, label: 'Branches', icon: '⎇', collapsible: true },
    { id: 'radar-remotes', slotType: 'list', panel: 'remote-list', width: 'flex', minWidth: 150, label: 'Remotes', icon: '◈', collapsible: true },
    { id: 'radar-stashes', slotType: 'list', panel: 'stash-list', width: 'flex', minWidth: 150, label: 'Stashes', icon: '⊡', collapsible: true },
    { id: 'radar-editor', slotType: 'editor', panel: 'empty', width: 400, minWidth: 300, label: 'Editor', icon: '◇', collapsible: true, visible: false },
  ],
}

export const FOCUS_CANVAS: Canvas = {
  id: 'focus',
  name: 'Focus',
  icon: '☰',
  isPreset: true,
  columns: [
    { id: 'focus-sidebar', slotType: 'list', panel: 'sidebar', width: 220, minWidth: 180, label: 'All', icon: '☰', collapsible: true },
    { id: 'focus-viz', slotType: 'viz', panel: 'git-graph', width: 'flex', minWidth: 300, label: 'History', icon: '◉', collapsible: true },
    { id: 'focus-editor', slotType: 'editor', panel: 'empty', width: 400, minWidth: 300, label: 'Editor', icon: '◇', collapsible: true },
  ],
}

export const GRAPH_CANVAS: Canvas = {
  id: 'graph',
  name: 'Graph',
  icon: '◉',
  isPreset: true,
  columns: [
    { id: 'graph-viz', slotType: 'viz', panel: 'git-graph', width: 'flex', minWidth: 400, label: 'History', icon: '◉' },
  ],
}

export const PRESET_CANVASES = [RADAR_CANVAS, FOCUS_CANVAS, GRAPH_CANVAS]

// ========================================
// Initial State
// ========================================

const initialEditorState: EditorState = {
  history: [],
  historyIndex: -1,
}

const initialCanvasState: CanvasState = {
  canvases: [...PRESET_CANVASES],
  activeCanvasId: 'radar',
  editorState: initialEditorState,
}

// ========================================
// Actions
// ========================================

type CanvasAction =
  | { type: 'SET_ACTIVE_CANVAS'; canvasId: string }
  | { type: 'UPDATE_CANVAS'; canvasId: string; updates: Partial<Omit<Canvas, 'id' | 'columns'>> }
  | { type: 'UPDATE_COLUMN'; canvasId: string; columnId: string; updates: Partial<Column> }
  | { type: 'REORDER_COLUMNS'; canvasId: string; fromIndex: number; toIndex: number }
  | { type: 'ADD_COLUMN'; canvasId: string; column: Column; index?: number }
  | { type: 'REMOVE_COLUMN'; canvasId: string; columnId: string }
  | { type: 'RESIZE_COLUMN'; canvasId: string; columnId: string; width: number }
  | { type: 'TOGGLE_COLUMN_VISIBILITY'; canvasId: string; columnId: string }
  | { type: 'NAVIGATE_TO_EDITOR'; panel: EditorPanelType; data?: unknown }
  | { type: 'EDITOR_GO_BACK' }
  | { type: 'EDITOR_GO_FORWARD' }
  | { type: 'CLEAR_EDITOR' }
  | { type: 'ADD_CANVAS'; canvas: Canvas }
  | { type: 'REMOVE_CANVAS'; canvasId: string }
  | { type: 'LOAD_CANVASES'; canvases: Canvas[]; activeCanvasId?: string }

// ========================================
// Reducer
// ========================================

function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case 'SET_ACTIVE_CANVAS': {
      if (state.activeCanvasId === action.canvasId) return state
      const canvas = state.canvases.find((c) => c.id === action.canvasId)
      if (!canvas) return state
      return { ...state, activeCanvasId: action.canvasId }
    }

    case 'UPDATE_CANVAS': {
      return {
        ...state,
        canvases: state.canvases.map((canvas) =>
          canvas.id === action.canvasId
            ? { ...canvas, ...action.updates }
            : canvas
        ),
      }
    }

    case 'UPDATE_COLUMN': {
      return {
        ...state,
        canvases: state.canvases.map((canvas) =>
          canvas.id === action.canvasId
            ? {
                ...canvas,
                columns: canvas.columns.map((col) =>
                  col.id === action.columnId ? { ...col, ...action.updates } : col
                ),
              }
            : canvas
        ),
      }
    }

    case 'REORDER_COLUMNS': {
      return {
        ...state,
        canvases: state.canvases.map((canvas) => {
          if (canvas.id !== action.canvasId) return canvas
          const columns = [...canvas.columns]
          const [removed] = columns.splice(action.fromIndex, 1)
          columns.splice(action.toIndex, 0, removed)
          return { ...canvas, columns }
        }),
      }
    }

    case 'ADD_COLUMN': {
      return {
        ...state,
        canvases: state.canvases.map((canvas) => {
          if (canvas.id !== action.canvasId) return canvas
          const columns = [...canvas.columns]
          const index = action.index ?? columns.length
          columns.splice(index, 0, action.column)
          return { ...canvas, columns }
        }),
      }
    }

    case 'REMOVE_COLUMN': {
      return {
        ...state,
        canvases: state.canvases.map((canvas) =>
          canvas.id === action.canvasId
            ? { ...canvas, columns: canvas.columns.filter((col) => col.id !== action.columnId) }
            : canvas
        ),
      }
    }

    case 'RESIZE_COLUMN': {
      return {
        ...state,
        canvases: state.canvases.map((canvas) =>
          canvas.id === action.canvasId
            ? {
                ...canvas,
                columns: canvas.columns.map((col) =>
                  col.id === action.columnId ? { ...col, width: action.width } : col
                ),
              }
            : canvas
        ),
      }
    }

    case 'TOGGLE_COLUMN_VISIBILITY': {
      return {
        ...state,
        canvases: state.canvases.map((canvas) =>
          canvas.id === action.canvasId
            ? {
                ...canvas,
                columns: canvas.columns.map((col) =>
                  col.id === action.columnId
                    ? { ...col, visible: col.visible === false }
                    : col
                ),
              }
            : canvas
        ),
      }
    }

    case 'NAVIGATE_TO_EDITOR': {
      const entry: EditorHistoryEntry = {
        panel: action.panel,
        data: action.data,
        timestamp: Date.now(),
      }
      // If we're not at the end of history, truncate forward history
      const history =
        state.editorState.historyIndex < state.editorState.history.length - 1
          ? state.editorState.history.slice(0, state.editorState.historyIndex + 1)
          : [...state.editorState.history]
      history.push(entry)
      // Limit history to 50 entries (using splice for robustness)
      if (history.length > 50) history.splice(0, history.length - 50)
      return {
        ...state,
        editorState: {
          history,
          historyIndex: history.length - 1,
        },
      }
    }

    case 'EDITOR_GO_BACK': {
      if (state.editorState.historyIndex <= 0) return state
      return {
        ...state,
        editorState: {
          ...state.editorState,
          historyIndex: state.editorState.historyIndex - 1,
        },
      }
    }

    case 'EDITOR_GO_FORWARD': {
      if (state.editorState.historyIndex >= state.editorState.history.length - 1) return state
      return {
        ...state,
        editorState: {
          ...state.editorState,
          historyIndex: state.editorState.historyIndex + 1,
        },
      }
    }

    case 'CLEAR_EDITOR': {
      return {
        ...state,
        editorState: initialEditorState,
      }
    }

    case 'ADD_CANVAS': {
      // Don't add if ID already exists
      if (state.canvases.some((c) => c.id === action.canvas.id)) return state
      return {
        ...state,
        canvases: [...state.canvases, action.canvas],
      }
    }

    case 'REMOVE_CANVAS': {
      // Can't remove preset canvases
      const canvas = state.canvases.find((c) => c.id === action.canvasId)
      if (!canvas || canvas.isPreset) return state
      const newCanvases = state.canvases.filter((c) => c.id !== action.canvasId)
      // If we removed the active canvas, switch to focus
      const activeCanvasId =
        state.activeCanvasId === action.canvasId ? 'focus' : state.activeCanvasId
      return { ...state, canvases: newCanvases, activeCanvasId }
    }

    case 'LOAD_CANVASES': {
      // Merge saved canvases with code-defined presets
      // For presets: preserve user's column modifications (width, visible, order)
      // but pick up any new columns added in code
      const mergedCanvases = PRESET_CANVASES.map((preset) => {
        const savedPreset = action.canvases.find((c) => c.id === preset.id)
        if (!savedPreset) return preset

        // Create a map of saved column state keyed by column ID
        const savedColumnMap = new Map(
          savedPreset.columns.map((col) => [col.id, col])
        )

        // Merge columns: preserve saved width/visible, but use code-defined structure
        const mergedColumns = preset.columns.map((codeCol) => {
          const savedCol = savedColumnMap.get(codeCol.id)
          if (!savedCol) return codeCol // New column in code, use as-is

          // Preserve user modifications (width, visible) from saved state
          return {
            ...codeCol, // Use code-defined structure (slotType, panel, label, icon, etc.)
            width: savedCol.width, // User's width preference
            visible: savedCol.visible, // User's visibility preference
          }
        })

        // Check for saved columns that were reordered
        // If user reordered columns, use their order (but only for columns that exist in code)
        const savedOrder = savedPreset.columns
          .map((sc) => sc.id)
          .filter((id) => mergedColumns.some((mc) => mc.id === id))

        // Sort mergedColumns according to saved order, with new columns at the end
        const orderedColumns = [
          ...savedOrder.map((id) => mergedColumns.find((c) => c.id === id)!),
          ...mergedColumns.filter((c) => !savedOrder.includes(c.id)),
        ]

        return {
          ...preset,
          columns: orderedColumns,
        }
      })

      // Add custom (non-preset) canvases from saved state
      const customCanvases = action.canvases.filter(
        (c) => !PRESET_CANVASES.some((p) => p.id === c.id)
      )

      return {
        ...state,
        canvases: [...mergedCanvases, ...customCanvases],
        activeCanvasId: action.activeCanvasId || state.activeCanvasId,
      }
    }

    default:
      return state
  }
}

// ========================================
// Context
// ========================================

interface CanvasContextValue {
  // State
  state: CanvasState
  activeCanvas: Canvas | undefined
  currentEditorEntry: EditorHistoryEntry | undefined
  canGoBack: boolean
  canGoForward: boolean

  // Canvas operations
  setActiveCanvas: (canvasId: string) => void
  addCanvas: (canvas: Canvas) => void
  updateCanvas: (canvasId: string, updates: Partial<Omit<Canvas, 'id' | 'columns'>>) => void
  removeCanvas: (canvasId: string) => void
  loadCanvases: (canvases: Canvas[], activeCanvasId?: string) => void

  // Column operations
  updateColumn: (canvasId: string, columnId: string, updates: Partial<Column>) => void
  reorderColumns: (canvasId: string, fromIndex: number, toIndex: number) => void
  addColumn: (canvasId: string, column: Column, index?: number) => void
  removeColumn: (canvasId: string, columnId: string) => void
  resizeColumn: (canvasId: string, columnId: string, width: number) => void
  setColumnPanel: (canvasId: string, columnId: string, panel: PanelType) => void

  // Editor navigation
  navigateToEditor: (panel: EditorPanelType, data?: unknown) => void
  goBack: () => void
  goForward: () => void
  clearEditor: () => void

  // Column visibility
  toggleColumnVisibility: (canvasId: string, columnId: string) => void
  isColumnVisible: (canvasId: string, columnId: string) => boolean
  getVisibleColumns: (canvasId?: string) => Column[]

  // Helpers
  hasEditorSlot: (canvasId?: string) => boolean
  findCanvasWithEditor: () => Canvas | undefined
}

const CanvasContext = createContext<CanvasContextValue | null>(null)

// ========================================
// Provider
// ========================================

interface CanvasProviderProps {
  children: ReactNode
}

export function CanvasProvider({ children }: CanvasProviderProps) {
  const [state, dispatch] = useReducer(canvasReducer, initialCanvasState)

  const activeCanvas = state.canvases.find((c) => c.id === state.activeCanvasId)
  const currentEditorEntry =
    state.editorState.historyIndex >= 0
      ? state.editorState.history[state.editorState.historyIndex]
      : undefined
  const canGoBack = state.editorState.historyIndex > 0
  const canGoForward = state.editorState.historyIndex < state.editorState.history.length - 1

  // Canvas operations
  const setActiveCanvas = useCallback((canvasId: string) => {
    dispatch({ type: 'SET_ACTIVE_CANVAS', canvasId })
  }, [])

  const addCanvas = useCallback((canvas: Canvas) => {
    dispatch({ type: 'ADD_CANVAS', canvas })
  }, [])

  const updateCanvas = useCallback((canvasId: string, updates: Partial<Omit<Canvas, 'id' | 'columns'>>) => {
    dispatch({ type: 'UPDATE_CANVAS', canvasId, updates })
  }, [])

  const removeCanvas = useCallback((canvasId: string) => {
    dispatch({ type: 'REMOVE_CANVAS', canvasId })
  }, [])

  const loadCanvases = useCallback((canvases: Canvas[], activeCanvasId?: string) => {
    dispatch({ type: 'LOAD_CANVASES', canvases, activeCanvasId })
  }, [])

  // Column operations
  const updateColumn = useCallback((canvasId: string, columnId: string, updates: Partial<Column>) => {
    dispatch({ type: 'UPDATE_COLUMN', canvasId, columnId, updates })
  }, [])

  const reorderColumns = useCallback((canvasId: string, fromIndex: number, toIndex: number) => {
    dispatch({ type: 'REORDER_COLUMNS', canvasId, fromIndex, toIndex })
  }, [])

  const addColumn = useCallback((canvasId: string, column: Column, index?: number) => {
    dispatch({ type: 'ADD_COLUMN', canvasId, column, index })
  }, [])

  const removeColumn = useCallback((canvasId: string, columnId: string) => {
    dispatch({ type: 'REMOVE_COLUMN', canvasId, columnId })
  }, [])

  const resizeColumn = useCallback((canvasId: string, columnId: string, width: number) => {
    dispatch({ type: 'RESIZE_COLUMN', canvasId, columnId, width })
  }, [])

  const setColumnPanel = useCallback((canvasId: string, columnId: string, panel: PanelType) => {
    dispatch({ type: 'UPDATE_COLUMN', canvasId, columnId, updates: { panel } })
  }, [])

  // Column visibility
  const toggleColumnVisibility = useCallback((canvasId: string, columnId: string) => {
    dispatch({ type: 'TOGGLE_COLUMN_VISIBILITY', canvasId, columnId })
  }, [])

  const isColumnVisible = useCallback(
    (canvasId: string, columnId: string) => {
      const canvas = state.canvases.find((c) => c.id === canvasId)
      const column = canvas?.columns.find((col) => col.id === columnId)
      // Default to visible if not explicitly set to false
      return column?.visible !== false
    },
    [state.canvases]
  )

  const getVisibleColumns = useCallback(
    (canvasId?: string) => {
      const canvas = canvasId
        ? state.canvases.find((c) => c.id === canvasId)
        : activeCanvas
      if (!canvas) return []
      return canvas.columns.filter((col) => col.visible !== false)
    },
    [state.canvases, activeCanvas]
  )

  // Editor navigation
  const navigateToEditor = useCallback((panel: EditorPanelType, data?: unknown) => {
    dispatch({ type: 'NAVIGATE_TO_EDITOR', panel, data })
  }, [])

  const goBack = useCallback(() => {
    dispatch({ type: 'EDITOR_GO_BACK' })
  }, [])

  const goForward = useCallback(() => {
    dispatch({ type: 'EDITOR_GO_FORWARD' })
  }, [])

  const clearEditor = useCallback(() => {
    dispatch({ type: 'CLEAR_EDITOR' })
  }, [])

  // Helpers
  const hasEditorSlot = useCallback(
    (canvasId?: string) => {
      const canvas = canvasId
        ? state.canvases.find((c) => c.id === canvasId)
        : activeCanvas
      return canvas?.columns.some((col) => col.slotType === 'editor') ?? false
    },
    [state.canvases, activeCanvas]
  )

  const findCanvasWithEditor = useCallback(() => {
    return state.canvases.find((c) => c.columns.some((col) => col.slotType === 'editor'))
  }, [state.canvases])

  const value: CanvasContextValue = {
    state,
    activeCanvas,
    currentEditorEntry,
    canGoBack,
    canGoForward,
    setActiveCanvas,
    addCanvas,
    updateCanvas,
    removeCanvas,
    loadCanvases,
    updateColumn,
    reorderColumns,
    addColumn,
    removeColumn,
    resizeColumn,
    setColumnPanel,
    toggleColumnVisibility,
    isColumnVisible,
    getVisibleColumns,
    navigateToEditor,
    goBack,
    goForward,
    clearEditor,
    hasEditorSlot,
    findCanvasWithEditor,
  }

  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>
}

// ========================================
// Hook
// ========================================

export function useCanvas() {
  const context = useContext(CanvasContext)
  if (!context) {
    throw new Error('useCanvas must be used within a CanvasProvider')
  }
  return context
}
