/**
 * useCanvasPersistence - Hook for loading and saving canvas state
 *
 * Connects the CanvasContext to electron's settings service for persistence.
 * Call this once at the app level to enable auto-save.
 */

import { useEffect, useRef } from 'react'
import { useCanvas } from './CanvasContext'
import type { Canvas } from '../../types/app-types'

export interface UseCanvasPersistenceOptions {
  /** Enable auto-save when canvas state changes */
  autoSave?: boolean
  /** Debounce delay for auto-save (ms) */
  saveDelay?: number
}

export function useCanvasPersistence(options: UseCanvasPersistenceOptions = {}) {
  const { autoSave = true, saveDelay = 500 } = options
  const { state, loadCanvases, setActiveCanvas } = useCanvas()
  const isInitialized = useRef(false)
  const saveTimeout = useRef<NodeJS.Timeout | null>(null)

  // Load saved canvases on mount
  useEffect(() => {
    async function loadSavedCanvases() {
      try {
        const [savedCanvases, savedActiveId] = await Promise.all([
          window.electronAPI.getCanvases(),
          window.electronAPI.getActiveCanvasId(),
        ])

        // Convert CanvasConfig to Canvas type
        const canvases: Canvas[] = savedCanvases.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          columns: c.columns.map((col) => ({
            id: col.id,
            slotType: col.slotType,
            panel: col.panel as Canvas['columns'][0]['panel'],
            width: col.width,
            minWidth: col.minWidth,
            config: col.config,
            label: col.label,
            icon: col.icon,
            visible: col.visible,
            collapsible: col.collapsible,
          })),
          isPreset: c.isPreset,
        }))

        // Load canvases (merges with presets)
        if (canvases.length > 0) {
          loadCanvases(canvases, savedActiveId)
        } else if (savedActiveId) {
          setActiveCanvas(savedActiveId)
        }

        isInitialized.current = true
      } catch (error) {
        console.error('Failed to load saved canvases:', error)
        isInitialized.current = true
      }
    }

    loadSavedCanvases()
  }, [loadCanvases, setActiveCanvas])

  // Auto-save canvases when state changes
  useEffect(() => {
    if (!autoSave || !isInitialized.current) return

    // Clear previous timeout
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current)
    }

    // Debounce save
    saveTimeout.current = setTimeout(async () => {
      try {
        // Save ALL canvases including presets to preserve user modifications
        // (column widths, visibility, order). On load, preset columns will be
        // merged with code definitions to pick up any new columns.
        const canvasConfigs = state.canvases.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          columns: c.columns.map((col) => ({
            id: col.id,
            slotType: col.slotType,
            panel: col.panel,
            width: col.width,
            minWidth: col.minWidth,
            config: col.config,
            label: col.label,
            icon: col.icon,
            visible: col.visible,
            collapsible: col.collapsible,
          })),
          isPreset: c.isPreset,
        }))

        await window.electronAPI.saveCanvases(canvasConfigs)
        await window.electronAPI.saveActiveCanvasId(state.activeCanvasId)
      } catch (error) {
        console.error('Failed to save canvases:', error)
      }
    }, saveDelay)

    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current)
      }
    }
  }, [autoSave, saveDelay, state.canvases, state.activeCanvasId])

  return {
    isInitialized: isInitialized.current,
  }
}

