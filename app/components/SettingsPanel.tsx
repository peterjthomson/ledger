import { useState, useEffect, useCallback } from 'react'
import { loadBuiltInTheme, loadVSCodeTheme, getSelectedThemeId, type ThemeMode } from '../theme'
import { useCanvas } from './canvas/CanvasContext'
import { AISettingsSection } from './AISettingsSection'
import type { SlotType, PanelType, Column } from '../types/app-types'

// Panel options grouped by slot type
const PANEL_OPTIONS: Record<SlotType, { value: PanelType; label: string }[]> = {
  list: [
    { value: 'pr-list', label: 'Pull Requests' },
    { value: 'branch-list', label: 'Branches' },
    { value: 'remote-list', label: 'Remotes' },
    { value: 'worktree-list', label: 'Worktrees' },
    { value: 'stash-list', label: 'Stashes' },
    { value: 'commit-list', label: 'Commits' },
    { value: 'repo-list', label: 'Repositories' },
    { value: 'sidebar', label: 'Sidebar (All)' },
  ],
  editor: [
    // Editor content is determined by global navigation state, not column config
    { value: 'empty', label: 'Editor' },
  ],
  viz: [
    { value: 'git-graph', label: 'Git Graph' },
    { value: 'timeline', label: 'Timeline' },
    { value: 'tech-tree', label: 'Tech Tree' },
    { value: 'erd-canvas', label: 'ERD' },
    { value: 'codegraph', label: 'Code Graph' },
    { value: 'file-graph', label: 'Code Map' },
  ],
}

// Default panels for new columns
const DEFAULT_PANELS: Record<SlotType, PanelType> = {
  list: 'branch-list',
  editor: 'empty',
  viz: 'git-graph',
}

// Icons for slot types
const SLOT_ICONS: Record<SlotType, string> = {
  list: '☰',
  editor: '◇',
  viz: '◉',
}

// Available canvas icons
const CANVAS_ICONS = ['◻', '◼', '○', '●', '◇', '◆', '△', '▲', '□', '■', '☰', '⊞', '⊕', '⊙', '◉', '⎔', '⬡', '⬢']

// Built-in theme definitions with preview colors
const BUILT_IN_THEMES = [
  // Base themes
  {
    id: 'system',
    name: 'Auto',
    category: 'Base',
    type: 'system' as const,
    colors: { bg: 'linear-gradient(135deg, #ffffff 50%, #1e1e1e 50%)', sidebar: 'linear-gradient(135deg, #f3f3f3 50%, #252526 50%)', accent: '#007aff', text: '#666666' },
    isGradient: true,
  },
  {
    id: 'light',
    name: 'Light',
    category: 'Base',
    type: 'light' as const,
    colors: { bg: '#ffffff', sidebar: '#f3f3f3', accent: '#007aff', text: '#1d1d1f' },
  },
  {
    id: 'dark',
    name: 'Dark',
    category: 'Base',
    type: 'dark' as const,
    colors: { bg: '#1e1e1e', sidebar: '#252526', accent: '#0a84ff', text: '#cccccc' },
  },
  // AI App themes
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    category: 'Applications',
    type: 'light' as const,
    path: 'claude-desktop.json',
    colors: { bg: '#f9f5f1', sidebar: '#ede7e1', accent: '#dc8850', text: '#1a1612' },
  },
  {
    id: 'claude-desktop-dark',
    name: 'Claude Desktop Dark',
    category: 'Applications',
    type: 'dark' as const,
    path: 'claude-desktop-dark.json',
    colors: { bg: '#2b2724', sidebar: '#1f1d1a', accent: '#dc8850', text: '#f2ebe4' },
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    category: 'Applications',
    type: 'light' as const,
    path: 'chatgpt.json',
    colors: { bg: '#ffffff', sidebar: '#ffffff', accent: '#0d0d0d', text: '#0d0d0d' },
  },
  {
    id: 'conductor',
    name: 'Conductor',
    category: 'Applications',
    type: 'light' as const,
    path: 'conductor.json',
    colors: { bg: '#fcfcfb', sidebar: '#f5f5f3', accent: '#70706a', text: '#1a1a1a' },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    category: 'Applications',
    type: 'light' as const,
    path: 'opencode.json',
    colors: { bg: '#fafafa', sidebar: '#f5f5f5', accent: '#3d4550', text: '#1a1a1a' },
  },
  {
    id: 'cursor-default',
    name: 'Cursor',
    category: 'Applications',
    type: 'dark' as const,
    path: 'cursor-default.json',
    colors: { bg: '#1e1e1e', sidebar: '#181818', accent: '#6366f1', text: '#d4d4d4' },
  },
  // VS Code themes
  {
    id: 'dark-plus',
    name: 'Dark+ (Default)',
    category: 'VS Code',
    type: 'dark' as const,
    path: 'dark-plus.json',
    colors: { bg: '#1e1e1e', sidebar: '#252526', accent: '#0e639c', text: '#d4d4d4' },
  },
  {
    id: 'light-plus',
    name: 'Light+ (Default)',
    category: 'VS Code',
    type: 'light' as const,
    path: 'light-plus.json',
    colors: { bg: '#ffffff', sidebar: '#f3f3f3', accent: '#007acc', text: '#616161' },
  },
  {
    id: 'one-dark-pro',
    name: 'One Dark Pro',
    category: 'VS Code',
    type: 'dark' as const,
    path: 'one-dark-pro.json',
    colors: { bg: '#282c34', sidebar: '#21252b', accent: '#61afef', text: '#abb2bf' },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    category: 'VS Code',
    type: 'dark' as const,
    path: 'dracula.json',
    colors: { bg: '#282a36', sidebar: '#21222c', accent: '#bd93f9', text: '#f8f8f2' },
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    category: 'VS Code',
    type: 'dark' as const,
    path: 'github-dark.json',
    colors: { bg: '#0d1117', sidebar: '#161b22', accent: '#238636', text: '#c9d1d9' },
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    category: 'VS Code',
    type: 'dark' as const,
    path: 'night-owl.json',
    colors: { bg: '#011627', sidebar: '#011627', accent: '#7e57c2', text: '#d6deeb' },
  },
  {
    id: 'monokai-pro',
    name: 'Monokai Pro',
    category: 'VS Code',
    type: 'dark' as const,
    path: 'monokai-pro.json',
    colors: { bg: '#2d2a2e', sidebar: '#221f22', accent: '#ffd866', text: '#fcfcfa' },
  },
]

interface SettingsPanelProps {
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode) => Promise<void>
  onBack: () => void
}

export const SettingsPanel = ({ themeMode: _themeMode, onThemeChange, onBack }: SettingsPanelProps) => {
  const [selectedTheme, setSelectedTheme] = useState<string>('system')
  const [isSaving, setIsSaving] = useState(false)
  
  // Canvas state and actions
  const { 
    state: canvasState, 
    addCanvas, 
    updateCanvas,
    removeCanvas, 
    reorderColumns,
    addColumn,
    removeColumn,
    setColumnPanel,
  } = useCanvas()
  const [newCanvasName, setNewCanvasName] = useState('')
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null)
  const [addingColumnToCanvas, setAddingColumnToCanvas] = useState<string | null>(null)
  const [newColumnSlotType, setNewColumnSlotType] = useState<SlotType>('list')
  const [iconPickerCanvasId, setIconPickerCanvasId] = useState<string | null>(null)
  const [renamingCanvasId, setRenamingCanvasId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  
  // Drag-drop state for column reordering
  const [draggingColumn, setDraggingColumn] = useState<{ canvasId: string; index: number } | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Load the selected theme ID on mount
  useEffect(() => {
    getSelectedThemeId().then(setSelectedTheme)
  }, [])

  const handleThemeSelect = async (themeId: string) => {
    if (isSaving) return

    const theme = BUILT_IN_THEMES.find((t) => t.id === themeId)
    if (!theme) return

    try {
      setIsSaving(true)
      setSelectedTheme(themeId)

      if (theme.path) {
        // Load built-in theme file, passing the theme ID for persistence
        await loadBuiltInTheme(theme.path, themeId)
      } else {
        // Use base light/dark/system theme
        await onThemeChange(themeId as ThemeMode)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleLoadCustomTheme = async () => {
    if (isSaving) return

    try {
      setIsSaving(true)
      const result = await loadVSCodeTheme()
      if (result) {
        setSelectedTheme('custom')
      }
    } finally {
      setIsSaving(false)
    }
  }

  // Group themes by category
  const categories = [...new Set(BUILT_IN_THEMES.map((t) => t.category))]

  // Canvas handlers
  const handleCreateCanvas = () => {
    if (!newCanvasName.trim()) return
    
    const id = newCanvasName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    addCanvas({
      id: `custom-${id}-${Date.now()}`,
      name: newCanvasName.trim(),
      icon: '◻',
      columns: [
        { id: `${id}-col-1`, slotType: 'list', panel: 'branch-list', width: 'flex', minWidth: 200, label: 'Branches', icon: '⎇' },
      ],
    })
    setNewCanvasName('')
  }

  const handleDeleteCanvas = (canvasId: string) => {
    removeCanvas(canvasId)
    if (selectedCanvasId === canvasId) {
      setSelectedCanvasId(null)
    }
  }

  const handleSelectCanvas = (canvasId: string) => {
    setSelectedCanvasId(selectedCanvasId === canvasId ? null : canvasId)
  }

  const handleIconClick = (e: React.MouseEvent, canvasId: string) => {
    e.stopPropagation()
    setIconPickerCanvasId(iconPickerCanvasId === canvasId ? null : canvasId)
  }

  const handleIconSelect = (canvasId: string, icon: string) => {
    updateCanvas(canvasId, { icon })
    setIconPickerCanvasId(null)
  }

  const handleStartRename = (e: React.MouseEvent, canvas: typeof canvasState.canvases[0]) => {
    e.stopPropagation()
    if (canvas.isPreset) return
    setRenamingCanvasId(canvas.id)
    setRenameValue(canvas.name)
  }

  const handleFinishRename = (canvasId: string) => {
    if (renameValue.trim()) {
      updateCanvas(canvasId, { name: renameValue.trim() })
    }
    setRenamingCanvasId(null)
    setRenameValue('')
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent, canvasId: string) => {
    if (e.key === 'Enter') {
      handleFinishRename(canvasId)
    } else if (e.key === 'Escape') {
      setRenamingCanvasId(null)
      setRenameValue('')
    }
  }

  // Column handlers
  const handleAddColumn = (canvasId: string) => {
    const canvas = canvasState.canvases.find(c => c.id === canvasId)
    if (!canvas) return
    
    const slotType = newColumnSlotType
    const panel = DEFAULT_PANELS[slotType]
    const panelLabel = PANEL_OPTIONS[slotType].find(p => p.value === panel)?.label || panel
    
    addColumn(canvasId, {
      id: `col-${Date.now()}`,
      slotType,
      panel,
      width: 'flex',
      minWidth: 200,
      label: panelLabel,
      icon: SLOT_ICONS[slotType],
    })
    setAddingColumnToCanvas(null)
    setNewColumnSlotType('list')
  }

  const handleRemoveColumn = (canvasId: string, columnId: string) => {
    removeColumn(canvasId, columnId)
  }

  const handleChangePanel = (canvasId: string, columnId: string, panel: PanelType) => {
    setColumnPanel(canvasId, columnId, panel)
  }

  // Drag-drop handlers for column reordering
  const handleDragStart = useCallback((canvasId: string, index: number) => {
    setDraggingColumn({ canvasId, index })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }, [])

  const handleDragEnd = useCallback(() => {
    if (draggingColumn && dragOverIndex !== null && draggingColumn.index !== dragOverIndex) {
      reorderColumns(draggingColumn.canvasId, draggingColumn.index, dragOverIndex)
    }
    setDraggingColumn(null)
    setDragOverIndex(null)
  }, [draggingColumn, dragOverIndex, reorderColumns])

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  // Canvas preview component - shows mini layout diagram
  const renderCanvasPreview = (columns: Column[]) => {
    const visibleColumns = columns.filter(c => c.visible !== false)
    return (
      <div className="canvas-preview">
        {visibleColumns.map((col) => (
          <div 
            key={col.id} 
            className={`canvas-preview-column canvas-preview-${col.slotType}`}
            title={col.label || col.panel}
          >
            <span className="canvas-preview-icon">{col.icon || SLOT_ICONS[col.slotType]}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <button className="settings-back-btn" onClick={onBack} title="Back to History">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M10 12L6 8L10 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="column-title">
          <h2>
            <span className="column-icon">⚙</span>
            Settings
          </h2>
        </div>
      </div>

      <div className="settings-panel-content">
        {/* Canvas Management Section */}
        <div className="settings-section settings-section-canvases">
          <h4 className="settings-section-title">Canvases</h4>
          <p className="settings-hint">Manage your workspace layouts</p>
          
          <div className="canvas-list">
            {canvasState.canvases.map((canvas) => {
              const isSelected = selectedCanvasId === canvas.id
              
              return (
                <div 
                  key={canvas.id} 
                  className={`canvas-list-item ${isSelected ? 'selected' : ''}`}
                >
                  <div 
                    className="canvas-list-item-header"
                    onClick={() => handleSelectCanvas(canvas.id)}
                  >
                    <span className="canvas-list-item-expand">{isSelected ? '▼' : '▶'}</span>
                    <div className="canvas-list-item-icon-wrapper">
                      <button
                        className="canvas-list-item-icon"
                        onClick={(e) => handleIconClick(e, canvas.id)}
                        title="Change icon"
                      >
                        {canvas.icon || '◻'}
                      </button>
                      {iconPickerCanvasId === canvas.id && (
                        <div className="canvas-icon-picker">
                          {CANVAS_ICONS.map((icon) => (
                            <button
                              key={icon}
                              className={`canvas-icon-option ${canvas.icon === icon ? 'active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); handleIconSelect(canvas.id, icon); }}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {renamingCanvasId === canvas.id ? (
                      <input
                        type="text"
                        className="canvas-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleFinishRename(canvas.id)}
                        onKeyDown={(e) => handleRenameKeyDown(e, canvas.id)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span 
                        className={`canvas-list-item-name ${!canvas.isPreset ? 'editable' : ''}`}
                        onClick={(e) => handleStartRename(e, canvas)}
                        title={!canvas.isPreset ? 'Click to rename' : undefined}
                      >
                        {canvas.name}
                      </span>
                    )}
                    {renderCanvasPreview(canvas.columns)}
                    {canvas.isPreset && <span className="canvas-list-item-badge">Preset</span>}
                    <div className="canvas-list-item-actions">
                      {!canvas.isPreset && (
                        <button 
                          className="canvas-action-btn canvas-delete-btn"
                          onClick={(e) => { e.stopPropagation(); handleDeleteCanvas(canvas.id); }}
                          title="Delete canvas"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="canvas-list-item-columns">
                      {canvas.columns.map((column, index) => {
                        const isDragging = draggingColumn?.canvasId === canvas.id && draggingColumn?.index === index
                        const isDragOver = draggingColumn?.canvasId === canvas.id && dragOverIndex === index
                        
                        return (
                          <div 
                            key={column.id} 
                            className={`canvas-column-item ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                            draggable
                            onDragStart={() => handleDragStart(canvas.id, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            onDragLeave={handleDragLeave}
                          >
                            {/* Drag handle */}
                            <div className="canvas-column-drag-handle" title="Drag to reorder">
                              <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                                <circle cx="3" cy="2" r="1.5" />
                                <circle cx="7" cy="2" r="1.5" />
                                <circle cx="3" cy="7" r="1.5" />
                                <circle cx="7" cy="7" r="1.5" />
                                <circle cx="3" cy="12" r="1.5" />
                                <circle cx="7" cy="12" r="1.5" />
                              </svg>
                            </div>
                            
                            <span className="canvas-column-icon">{column.icon || SLOT_ICONS[column.slotType]}</span>
                            <span className="canvas-column-label">{column.label || column.id}</span>
                            
                            {/* Panel dropdown */}
                            <select
                              className="canvas-column-select"
                              value={column.panel}
                              onChange={(e) => handleChangePanel(canvas.id, column.id, e.target.value as PanelType)}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {PANEL_OPTIONS[column.slotType].map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            
                            {column.visible === false && <span className="canvas-column-hidden">Hidden</span>}
                            
                            {/* Remove button */}
                            <button
                              className="canvas-column-remove"
                              onClick={(e) => { e.stopPropagation(); handleRemoveColumn(canvas.id, column.id); }}
                              title="Remove column"
                            >
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        )
                      })}
                      
                      {/* Add Column UI */}
                      {addingColumnToCanvas === canvas.id ? (
                        <div className="canvas-add-column-form">
                          <select
                            className="canvas-column-select"
                            value={newColumnSlotType}
                            onChange={(e) => setNewColumnSlotType(e.target.value as SlotType)}
                          >
                            <option value="list">List</option>
                            <option value="editor">Editor</option>
                            <option value="viz">Visualization</option>
                          </select>
                          <button 
                            className="canvas-add-column-confirm"
                            onClick={() => handleAddColumn(canvas.id)}
                          >
                            Add
                          </button>
                          <button 
                            className="canvas-add-column-cancel"
                            onClick={() => setAddingColumnToCanvas(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="canvas-add-column-btn"
                          onClick={() => setAddingColumnToCanvas(canvas.id)}
                        >
                          + Add Column
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          
          {/* Create Canvas Form - at bottom of list */}
          <div className="canvas-create-form">
            <input
              type="text"
              className="canvas-create-input"
              placeholder="New canvas name..."
              value={newCanvasName}
              onChange={(e) => setNewCanvasName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCanvas()}
            />
            <button 
              className="canvas-create-btn"
              onClick={handleCreateCanvas}
              disabled={!newCanvasName.trim()}
            >
              Add Canvas
            </button>
          </div>
        </div>

        {/* Divider between sections */}
        <div className="settings-divider" />

        {/* AI Settings Section */}
        <AISettingsSection />

        {/* Divider between sections */}
        <div className="settings-divider" />

        {/* Theme Section */}
        <div className="settings-section">
          <h4 className="settings-section-title">Theme</h4>
          <p className="settings-hint">Select a theme to apply it instantly</p>

          {categories.map((category) => (
            <div key={category} className="theme-category">
              <div className="theme-category-label">{category}</div>
              <div className="theme-grid">
                {BUILT_IN_THEMES.filter((t) => t.category === category).map((theme) => (
                  <button
                    key={theme.id}
                    className={`theme-card ${selectedTheme === theme.id ? 'active' : ''}`}
                    onClick={() => handleThemeSelect(theme.id)}
                    disabled={isSaving}
                    title={theme.name}
                  >
                    <div
                      className={`theme-preview ${theme.id === 'system' ? 'theme-preview-system' : ''}`}
                      style={{
                        background: theme.colors.bg,
                      }}
                    >
                      <div
                        className="theme-preview-sidebar"
                        style={{ background: theme.colors.sidebar }}
                      />
                      <div className="theme-preview-content">
                        <div
                          className="theme-preview-accent"
                          style={{ background: theme.colors.accent }}
                        />
                        <div
                          className="theme-preview-text"
                          style={{ background: theme.colors.text, opacity: 0.3 }}
                        />
                        <div
                          className="theme-preview-text"
                          style={{ background: theme.colors.text, opacity: 0.2, width: '60%' }}
                        />
                      </div>
                    </div>
                    <span className="theme-name">{theme.name}</span>
                    {selectedTheme === theme.id && <span className="theme-check">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="theme-category">
            <div className="theme-category-label">Custom</div>
            <button
              className={`theme-card theme-card-custom ${selectedTheme === 'custom' ? 'active' : ''}`}
              onClick={handleLoadCustomTheme}
              disabled={isSaving}
            >
              <div className="theme-preview theme-preview-custom">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </div>
              <span className="theme-name">Load VSCode Theme...</span>
            </button>
          </div>
        </div>

        {/* Bottom padding for scroll focus */}
        <div className="settings-bottom-spacer" />
      </div>
    </div>
  )
}
