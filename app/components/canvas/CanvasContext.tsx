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
  isPreset: true,
  columns: [
    { id: 'radar-prs', slotType: 'list', panel: 'pr-list', width: 'flex', minWidth: 200 },
    { id: 'radar-worktrees', slotType: 'list', panel: 'worktree-list', width: 'flex', minWidth: 200 },
    { id: 'radar-commits', slotType: 'list', panel: 'commit-list', width: 'flex', minWidth: 200 },
    { id: 'radar-branches', slotType: 'list', panel: 'branch-list', width: 'flex', minWidth: 200 },
    { id: 'radar-remotes', slotType: 'list', panel: 'remote-list', width: 'flex', minWidth: 200 },
  ],
}

export const FOCUS_CANVAS: Canvas = {
  id: 'focus',
  name: 'Focus',
  isPreset: true,
  columns: [
    { id: 'focus-list', slotType: 'list', panel: 'unified-list', width: 220, minWidth: 180 },
    { id: 'focus-viz', slotType: 'viz', panel: 'git-graph', width: 'flex', minWidth: 300 },
    { id: 'focus-editor', slotType: 'editor', panel: 'empty', width: 400, minWidth: 300 },
  ],
}

export const PRESET_CANVASES = [RADAR_CANVAS, FOCUS_CANVAS]

// ========================================
// Initial State
// ========================================

const initialEditorState: EditorState = {
  history: [],
  historyIndex: -1,
}

const initialCanvasState: CanvasState = {
  canvases: [...PRESET_CANVASES],
  activeCanvasId: 'focus',
  editorState: initialEditorState,
}

// ========================================
// Actions
// ========================================

type CanvasAction =
  | { type: 'SET_ACTIVE_CANVAS'; canvasId: string }
  | { type: 'UPDATE_COLUMN'; canvasId: string; columnId: string; updates: Partial<Column> }
  | { type: 'REORDER_COLUMNS'; canvasId: string; fromIndex: number; toIndex: number }
  | { type: 'ADD_COLUMN'; canvasId: string; column: Column; index?: number }
  | { type: 'REMOVE_COLUMN'; canvasId: string; columnId: string }
  | { type: 'RESIZE_COLUMN'; canvasId: string; columnId: string; width: number }
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
      // Limit history to 50 entries
      if (history.length > 50) history.shift()
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
      // Merge with presets (presets always win)
      const userCanvases = action.canvases.filter((c) => !PRESET_CANVASES.some((p) => p.id === c.id))
      return {
        ...state,
        canvases: [...PRESET_CANVASES, ...userCanvases],
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
    removeCanvas,
    loadCanvases,
    updateColumn,
    reorderColumns,
    addColumn,
    removeColumn,
    resizeColumn,
    setColumnPanel,
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
