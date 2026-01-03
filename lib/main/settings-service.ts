import { app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

type ViewMode = 'columns' | 'work';
type ThemeMode = 'light' | 'dark' | 'system' | 'custom';

interface VSCodeTheme {
  name: string;
  type: 'light' | 'dark';
  colors: Record<string, string>;
}

// Canvas types (mirrored from app/types/app-types.ts for main process)
type SlotType = 'list' | 'editor' | 'viz';
type PanelType = string; // Simplified for settings

interface CanvasColumn {
  id: string;
  slotType: SlotType;
  panel: PanelType;
  width: number | 'flex';
  minWidth?: number;
  config?: Record<string, unknown>;
  // Display
  label?: string;
  icon?: string;
  // Visibility
  visible?: boolean;
  collapsible?: boolean;
}

interface CanvasConfig {
  id: string;
  name: string;
  columns: CanvasColumn[];
  isPreset?: boolean;
}

interface Settings {
  lastRepoPath?: string;
  viewMode?: ViewMode;
  themeMode?: ThemeMode;
  selectedThemeId?: string;  // e.g., 'dracula', 'claude-desktop', 'light'
  customTheme?: VSCodeTheme;
  // Canvas settings
  canvases?: CanvasConfig[];
  activeCanvasId?: string;
}

// Allow tests (and power users) to override the settings location to avoid coupling to
// the real user profile / machine-specific paths.
const settingsPath = process.env.LEDGER_SETTINGS_PATH || path.join(app.getPath('userData'), 'ledger-settings.json');

function loadSettings(): Settings {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return {};
}

function saveSettings(settings: Settings): void {
  try {
    // Ensure parent directory exists (important when LEDGER_SETTINGS_PATH points to a temp location)
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

export function getLastRepoPath(): string | null {
  const settings = loadSettings();
  // Verify the path still exists
  if (settings.lastRepoPath && fs.existsSync(settings.lastRepoPath)) {
    return settings.lastRepoPath;
  }
  return null;
}

export function saveLastRepoPath(repoPath: string): void {
  const settings = loadSettings();
  settings.lastRepoPath = repoPath;
  saveSettings(settings);
}

export function clearLastRepoPath(): void {
  const settings = loadSettings();
  delete settings.lastRepoPath;
  saveSettings(settings);
}

export function getViewMode(): ViewMode {
  const settings = loadSettings();
  return settings.viewMode || 'columns';
}

export function saveViewMode(viewMode: ViewMode): void {
  const settings = loadSettings();
  settings.viewMode = viewMode;
  saveSettings(settings);
}

// Theme functions
export function getThemeMode(): ThemeMode {
  const settings = loadSettings();
  return settings.themeMode || 'system';
}

export function saveThemeMode(mode: ThemeMode, themeId?: string): void {
  const settings = loadSettings();
  settings.themeMode = mode;
  settings.selectedThemeId = themeId || mode;  // Default to mode for base themes
  saveSettings(settings);
}

export function getSelectedThemeId(): string {
  const settings = loadSettings();
  return settings.selectedThemeId || settings.themeMode || 'system';
}

export function getCustomTheme(): VSCodeTheme | null {
  const settings = loadSettings();
  return settings.customTheme || null;
}

export async function loadVSCodeThemeFile(): Promise<VSCodeTheme | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
    title: 'Select VS Code Theme File',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  try {
    const data = fs.readFileSync(result.filePaths[0], 'utf-8');
    const theme = JSON.parse(data) as VSCodeTheme;
    
    // Save the custom theme
    const settings = loadSettings();
    settings.customTheme = theme;
    settings.themeMode = 'custom';
    saveSettings(settings);
    
    return theme;
  } catch (error) {
    console.error('Failed to load theme file:', error);
    return null;
  }
}

export function loadBuiltInTheme(themeFileName: string, themeId?: string): VSCodeTheme | null {
  try {
    const themePath = path.join(app.getAppPath(), 'resources', 'themes', themeFileName);
    const data = fs.readFileSync(themePath, 'utf-8');
    const theme = JSON.parse(data) as VSCodeTheme;

    // Save the custom theme and track which theme was selected
    const settings = loadSettings();
    settings.customTheme = theme;
    settings.themeMode = 'custom';
    settings.selectedThemeId = themeId || themeFileName.replace('.json', '');
    saveSettings(settings);

    return theme;
  } catch (error) {
    console.error('Failed to load built-in theme:', error);
    return null;
  }
}

export function clearCustomTheme(): void {
  const settings = loadSettings();
  delete settings.customTheme;
  if (settings.themeMode === 'custom') {
    settings.themeMode = 'system';
  }
  saveSettings(settings);
}

export function mapVSCodeThemeToCSS(theme: VSCodeTheme): Record<string, string> {
  const colors = theme.colors;
  
  return {
    '--bg-primary': colors['editor.background'] || (theme.type === 'dark' ? '#1e1e1e' : '#ffffff'),
    '--bg-secondary': colors['sideBar.background'] || colors['activityBar.background'] || (theme.type === 'dark' ? '#252526' : '#f3f3f3'),
    '--bg-tertiary': colors['panel.background'] || colors['sideBar.background'] || (theme.type === 'dark' ? '#2d2d30' : '#e8e8e8'),
    '--text-primary': colors['editor.foreground'] || colors['foreground'] || (theme.type === 'dark' ? '#cccccc' : '#000000'),
    '--text-secondary': colors['descriptionForeground'] || colors['sideBar.foreground'] || (theme.type === 'dark' ? '#858585' : '#717171'),
    '--text-muted': colors['editorLineNumber.foreground'] || (theme.type === 'dark' ? '#5a5a5a' : '#237893'),
    '--accent': colors['button.background'] || colors['focusBorder'] || '#007acc',
    '--accent-hover': colors['button.hoverBackground'] || '#0062a3',
    '--border': colors['panel.border'] || colors['input.border'] || (theme.type === 'dark' ? '#3c3c3c' : '#cecece'),
    '--selection': colors['list.activeSelectionBackground'] || '#0060c0',
    '--selection-text': colors['list.activeSelectionForeground'] || '#ffffff',
    '--hover': colors['list.hoverBackground'] || (theme.type === 'dark' ? '#2a2d2e' : '#e8e8e8'),
    '--input-bg': colors['input.background'] || (theme.type === 'dark' ? '#3c3c3c' : '#ffffff'),
    '--input-border': colors['input.border'] || (theme.type === 'dark' ? '#3c3c3c' : '#cecece'),
    '--success': colors['gitDecoration.addedResourceForeground'] || '#4caf50',
    '--warning': colors['gitDecoration.modifiedResourceForeground'] || '#ff9800',
    '--error': colors['errorForeground'] || colors['gitDecoration.deletedResourceForeground'] || '#f44336',
    '--scrollbar': colors['scrollbarSlider.background'] || '#64646466',
    '--scrollbar-hover': colors['scrollbarSlider.hoverBackground'] || '#646464b3',
  };
}

// Canvas persistence functions
export function getCanvases(): CanvasConfig[] {
  const settings = loadSettings();
  return settings.canvases || [];
}

export function saveCanvases(canvases: CanvasConfig[]): void {
  const settings = loadSettings();
  // Save all canvases - presets included to preserve user modifications
  // (column widths, visibility, order). On load, preset columns will be
  // merged with code definitions to pick up any new columns.
  settings.canvases = canvases;
  saveSettings(settings);
}

export function getActiveCanvasId(): string {
  const settings = loadSettings();
  return settings.activeCanvasId || 'radar';
}

export function saveActiveCanvasId(canvasId: string): void {
  const settings = loadSettings();
  settings.activeCanvasId = canvasId;
  saveSettings(settings);
}

export function addCanvas(canvas: CanvasConfig): void {
  const settings = loadSettings();
  const canvases = settings.canvases || [];
  // Don't add if already exists
  if (canvases.some(c => c.id === canvas.id)) return;
  canvases.push(canvas);
  settings.canvases = canvases;
  saveSettings(settings);
}

export function removeCanvas(canvasId: string): void {
  const settings = loadSettings();
  settings.canvases = (settings.canvases || []).filter(c => c.id !== canvasId);
  // If we removed the active canvas, reset to radar
  if (settings.activeCanvasId === canvasId) {
    settings.activeCanvasId = 'radar';
  }
  saveSettings(settings);
}

export function updateCanvas(canvasId: string, updates: Partial<CanvasConfig>): void {
  const settings = loadSettings();
  settings.canvases = (settings.canvases || []).map(c => 
    c.id === canvasId ? { ...c, ...updates } : c
  );
  saveSettings(settings);
}

// Recent repos management
const MAX_RECENT_REPOS = 10;

export function getRecentRepos(): string[] {
  const settings = loadSettings() as Settings & { recentRepos?: string[] };
  // Filter out paths that no longer exist
  return (settings.recentRepos || []).filter((repoPath) => fs.existsSync(repoPath));
}

export function addRecentRepo(repoPath: string): void {
  const settings = loadSettings() as Settings & { recentRepos?: string[] };
  let recent = settings.recentRepos || [];

  // Remove if already exists (will re-add at front)
  recent = recent.filter((p) => p !== repoPath);

  // Add to front
  recent.unshift(repoPath);

  // Keep max recent
  recent = recent.slice(0, MAX_RECENT_REPOS);

  (settings as Settings & { recentRepos: string[] }).recentRepos = recent;
  saveSettings(settings);
}

export function removeRecentRepo(repoPath: string): void {
  const settings = loadSettings() as Settings & { recentRepos?: string[] };
  (settings as Settings & { recentRepos: string[] }).recentRepos = (settings.recentRepos || []).filter((p) => p !== repoPath);
  saveSettings(settings);
}

