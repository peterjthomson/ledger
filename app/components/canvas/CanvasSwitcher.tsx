/**
 * CanvasSwitcher - UI for switching between canvases
 *
 * Shows tabs for each canvas and allows switching between them.
 * Presets (Radar, Focus) are always shown; custom canvases appear after.
 */

import { useCanvas, PRESET_CANVASES } from './CanvasContext'

export interface CanvasSwitcherProps {
  /** Optional class name */
  className?: string
  /** Show as compact tabs */
  compact?: boolean
}

export function CanvasSwitcher({ className = '', compact = false }: CanvasSwitcherProps) {
  const { state, activeCanvas, setActiveCanvas } = useCanvas()

  // Split canvases into presets and custom
  const presets = PRESET_CANVASES
  const customCanvases = state.canvases.filter(
    (c) => !PRESET_CANVASES.some((p) => p.id === c.id)
  )

  return (
    <div className={`canvas-switcher ${compact ? 'compact' : ''} ${className}`}>
      {/* Preset canvases */}
      <div className="canvas-switcher-presets">
        {presets.map((canvas) => (
          <button
            key={canvas.id}
            className={`canvas-tab ${activeCanvas?.id === canvas.id ? 'active' : ''}`}
            onClick={() => setActiveCanvas(canvas.id)}
            title={canvas.name}
          >
            {canvas.id === 'radar' && <span className="canvas-tab-icon">📡</span>}
            {canvas.id === 'focus' && <span className="canvas-tab-icon">🎯</span>}
            {!compact && <span className="canvas-tab-name">{canvas.name}</span>}
          </button>
        ))}
      </div>

      {/* Custom canvases */}
      {customCanvases.length > 0 && (
        <>
          <div className="canvas-switcher-divider" />
          <div className="canvas-switcher-custom">
            {customCanvases.map((canvas) => (
              <button
                key={canvas.id}
                className={`canvas-tab ${activeCanvas?.id === canvas.id ? 'active' : ''}`}
                onClick={() => setActiveCanvas(canvas.id)}
                title={canvas.name}
              >
                <span className="canvas-tab-icon">📋</span>
                {!compact && <span className="canvas-tab-name">{canvas.name}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
