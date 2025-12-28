import { useState, useEffect } from 'react'
import { loadBuiltInTheme, loadVSCodeTheme, type ThemeMode } from '../theme'

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

export const SettingsPanel = ({ themeMode, onThemeChange, onBack }: SettingsPanelProps) => {
  const [selectedTheme, setSelectedTheme] = useState<string>(themeMode)
  const [isSaving, setIsSaving] = useState(false)

  // Sync selectedTheme with themeMode when it changes externally
  useEffect(() => {
    setSelectedTheme(themeMode)
  }, [themeMode])

  const handleThemeSelect = async (themeId: string) => {
    if (isSaving) return

    const theme = BUILT_IN_THEMES.find((t) => t.id === themeId)
    if (!theme) return

    try {
      setIsSaving(true)
      setSelectedTheme(themeId)

      if (theme.path) {
        // Load built-in theme file
        await loadBuiltInTheme(theme.path)
      } else {
        // Use base light/dark theme
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
        <div className="settings-section">
          <h4 className="settings-section-title">Theme</h4>

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

        <div className="settings-section">
          <p className="settings-hint">Select a theme to apply it instantly</p>
        </div>
      </div>
    </div>
  )
}
