/**
 * Canvas Components
 *
 * The Canvas architecture provides a flexible, customizable layout system:
 * - Canvas: A named layout with an ordered array of columns
 * - Column: A slot that renders a panel (list, editor, or viz)
 * - EditorSlot: Special column that renders global editor state
 *
 * Built-in presets:
 * - Radar: 5 list columns for dashboard view
 * - Focus: list + viz + editor for working view
 */

// Context and state management
export { CanvasProvider, useCanvas, RADAR_CANVAS, FOCUS_CANVAS, PRESET_CANVASES } from './CanvasContext'

// Components
export { Canvas } from './Canvas'
export type { CanvasProps } from './Canvas'

export { Column } from './Column'
export type { ColumnProps } from './Column'

export { ResizeHandle } from './ResizeHandle'
export type { ResizeHandleProps } from './ResizeHandle'

export { EditorSlot } from './EditorSlot'
export type { EditorSlotProps } from './EditorSlot'

export { CanvasSwitcher } from './CanvasSwitcher'
export type { CanvasSwitcherProps } from './CanvasSwitcher'

// Navigation hook
export { useCanvasNavigation } from './useCanvasNavigation'
export type { UseCanvasNavigationOptions, CanvasNavigationResult } from './useCanvasNavigation'

// Persistence hook
export { useCanvasPersistence } from './useCanvasPersistence'
export type { UseCanvasPersistenceOptions } from './useCanvasPersistence'
