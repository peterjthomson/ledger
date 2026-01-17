import { handle } from '@/lib/main/shared'
import {
  getCanvases,
  saveCanvases,
  getActiveCanvasId,
  saveActiveCanvasId,
  addCanvas,
  removeCanvas,
  updateCanvas,
} from '@/lib/main/settings-service'
import { serializeError } from '@/lib/utils/error-helpers'

// Canvas type definition for handler
interface CanvasColumn {
  id: string
  slotType: 'list' | 'editor' | 'viz'
  panel: string
  width: number | 'flex'
  minWidth?: number
  config?: Record<string, unknown>
  label?: string
  icon?: string
  visible?: boolean
  collapsible?: boolean
}

interface CanvasConfig {
  id: string
  name: string
  icon?: string
  columns: CanvasColumn[]
  isPreset?: boolean
}

export const registerCanvasHandlers = () => {
  handle('get-canvases', () => {
    try {
      return getCanvases()
    } catch (_error) {
      return []
    }
  })

  handle('save-canvases', (canvases: CanvasConfig[]) => {
    try {
      saveCanvases(canvases)
      return { success: true, message: 'Canvases saved' }
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('get-active-canvas-id', () => {
    try {
      return getActiveCanvasId()
    } catch (_error) {
      return 'radar'
    }
  })

  handle('save-active-canvas-id', (canvasId: string) => {
    try {
      saveActiveCanvasId(canvasId)
      return { success: true, message: 'Active canvas saved' }
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('add-canvas', (canvas: CanvasConfig) => {
    try {
      addCanvas(canvas)
      return { success: true, message: 'Canvas added' }
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('remove-canvas', (canvasId: string) => {
    try {
      removeCanvas(canvasId)
      return { success: true, message: 'Canvas removed' }
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('update-canvas', (canvasId: string, updates: Partial<CanvasConfig>) => {
    try {
      updateCanvas(canvasId, updates)
      return { success: true, message: 'Canvas updated' }
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })
}
