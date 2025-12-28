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

interface Settings {
  lastRepoPath?: string;
  viewMode?: ViewMode;
  themeMode?: ThemeMode;
  customTheme?: VSCodeTheme;
}

const settingsPath = path.join(app.getPath('userData'), 'ledger-settings.json');

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

export function saveThemeMode(mode: ThemeMode): void {
  const settings = loadSettings();
  settings.themeMode = mode;
  saveSettings(settings);
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

export function loadBuiltInTheme(themeFileName: string): VSCodeTheme | null {
  try {
    const themePath = path.join(app.getAppPath(), 'resources', 'themes', themeFileName);
    const data = fs.readFileSync(themePath, 'utf-8');
    const theme = JSON.parse(data) as VSCodeTheme;
    
    // Save the custom theme
    const settings = loadSettings();
    settings.customTheme = theme;
    settings.themeMode = 'custom';
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

