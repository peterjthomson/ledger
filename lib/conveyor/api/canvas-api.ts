import { ConveyorApi } from '@/lib/preload/shared'

// Canvas type definition for API
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

export class CanvasApi extends ConveyorApi {
  getCanvases = () => this.invoke('get-canvases')
  saveCanvases = (canvases: CanvasConfig[]) => this.invoke('save-canvases', canvases)
  getActiveCanvasId = () => this.invoke('get-active-canvas-id')
  saveActiveCanvasId = (canvasId: string) => this.invoke('save-active-canvas-id', canvasId)
  addCanvas = (canvas: CanvasConfig) => this.invoke('add-canvas', canvas)
  removeCanvas = (canvasId: string) => this.invoke('remove-canvas', canvasId)
  updateCanvas = (canvasId: string, updates: Partial<CanvasConfig>) =>
    this.invoke('update-canvas', canvasId, updates)
}
