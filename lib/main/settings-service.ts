import { app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

type ViewMode = 'radar' | 'focus';
type ThemeMode = 'light' | 'dark' | 'custom';

// VSCode theme color mappings to Ledger CSS variables
export interface VSCodeThemeColors {
  // Editor colors
  'editor.background'?: string;
  'editor.foreground'?: string;
  'editorLineNumber.foreground'?: string;
  'editorLineNumber.activeForeground'?: string;
  // Activity bar / sidebar
  'activityBar.background'?: string;
  'activityBar.foreground'?: string;
  'sideBar.background'?: string;
  'sideBar.foreground'?: string;
  'sideBarTitle.foreground'?: string;
  // Title bar
  'titleBar.activeBackground'?: string;
  'titleBar.activeForeground'?: string;
  'titleBar.inactiveBackground'?: string;
  'titleBar.inactiveForeground'?: string;
  // Lists
  'list.activeSelectionBackground'?: string;
  'list.activeSelectionForeground'?: string;
  'list.hoverBackground'?: string;
  'list.inactiveSelectionBackground'?: string;
  // Input
  'input.background'?: string;
  'input.foreground'?: string;
  'input.border'?: string;
  'input.placeholderForeground'?: string;
  // Buttons
  'button.background'?: string;
  'button.foreground'?: string;
  'button.hoverBackground'?: string;
  // Status bar
  'statusBar.background'?: string;
  'statusBar.foreground'?: string;
  // Scrollbar
  'scrollbarSlider.background'?: string;
  'scrollbarSlider.hoverBackground'?: string;
  'scrollbarSlider.activeBackground'?: string;
  // Panel
  'panel.background'?: string;
  'panel.border'?: string;
  // Focus colors
  'focusBorder'?: string;
  // General
  'foreground'?: string;
  'descriptionForeground'?: string;
  'errorForeground'?: string;
  // Git colors
  'gitDecoration.addedResourceForeground'?: string;
  'gitDecoration.modifiedResourceForeground'?: string;
  'gitDecoration.deletedResourceForeground'?: string;
  'gitDecoration.untrackedResourceForeground'?: string;
  // Any other colors
  [key: string]: string | undefined;
}

export interface VSCodeTheme {
  name: string;
  type: 'light' | 'dark';
  colors: VSCodeThemeColors;
}

export interface CustomTheme {
  name: string;
  path: string;
  type: 'light' | 'dark';
  colors: VSCodeThemeColors;
}

interface Settings {
  lastRepoPath?: string;
  viewMode?: ViewMode;
  themeMode?: ThemeMode;
  customTheme?: CustomTheme;
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
  return settings.viewMode || 'radar';
}

export function saveViewMode(viewMode: ViewMode): void {
  const settings = loadSettings();
  settings.viewMode = viewMode;
  saveSettings(settings);
}

// Theme functions
export function getThemeMode(): ThemeMode {
  const settings = loadSettings();
  return settings.themeMode || 'light';
}

export function saveThemeMode(themeMode: ThemeMode): void {
  const settings = loadSettings();
  settings.themeMode = themeMode;
  saveSettings(settings);
}

export function getCustomTheme(): CustomTheme | null {
  const settings = loadSettings();
  return settings.customTheme || null;
}

export function saveCustomTheme(theme: CustomTheme): void {
  const settings = loadSettings();
  settings.customTheme = theme;
  settings.themeMode = 'custom';
  saveSettings(settings);
}

export function clearCustomTheme(): void {
  const settings = loadSettings();
  delete settings.customTheme;
  if (settings.themeMode === 'custom') {
    settings.themeMode = 'dark';
  }
  saveSettings(settings);
}

// Load a built-in theme from resources/themes
export function loadBuiltInTheme(themeFileName: string): CustomTheme | null {
  // Determine the resources path based on whether we're in dev or production
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  let themePath: string;
  
  if (isDev) {
    themePath = path.join(process.cwd(), 'resources', 'themes', themeFileName);
  } else {
    themePath = path.join(process.resourcesPath, 'themes', themeFileName);
  }

  try {
    const content = fs.readFileSync(themePath, 'utf-8');
    const themeData = JSON.parse(content);

    const colors: VSCodeThemeColors = themeData.colors || {};
    const themeType: 'light' | 'dark' = themeData.type === 'light' ? 'light' : 'dark';
    const themeName = themeData.name || path.basename(themePath, '.json');

    const customTheme: CustomTheme = {
      name: themeName,
      path: themePath,
      type: themeType,
      colors
    };

    // Save the theme as the current custom theme
    saveCustomTheme(customTheme);

    return customTheme;
  } catch (error) {
    console.error('Failed to load built-in theme:', error);
    return null;
  }
}

// Parse and load a VSCode theme file (user-selected)
export async function loadVSCodeThemeFile(): Promise<CustomTheme | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Select VSCode Theme File',
    filters: [
      { name: 'VSCode Theme', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const themePath = result.filePaths[0];

  try {
    const content = fs.readFileSync(themePath, 'utf-8');
    const themeData = JSON.parse(content);

    // VSCode themes can have different structures
    // They might have colors directly or nested under tokenColors
    const colors: VSCodeThemeColors = themeData.colors || {};

    // Determine theme type from the file or guess from colors
    let themeType: 'light' | 'dark' = 'dark';
    if (themeData.type) {
      themeType = themeData.type === 'light' ? 'light' : 'dark';
    } else if (colors['editor.background']) {
      // Guess based on background luminance
      const bg = colors['editor.background'];
      const luminance = getColorLuminance(bg);
      themeType = luminance > 0.5 ? 'light' : 'dark';
    }

    const themeName = themeData.name || path.basename(themePath, '.json');

    const customTheme: CustomTheme = {
      name: themeName,
      path: themePath,
      type: themeType,
      colors
    };

    // Save the theme
    saveCustomTheme(customTheme);

    return customTheme;
  } catch (error) {
    console.error('Failed to load VSCode theme:', error);
    return null;
  }
}

// Helper to calculate color luminance (for auto-detecting light/dark)
function getColorLuminance(color: string): number {
  // Remove # if present
  const hex = color.replace('#', '');

  // Handle different hex formats
  let r: number, g: number, b: number;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length >= 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else {
    return 0.5; // Unknown format, assume middle
  }

  // Calculate relative luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Map VSCode theme colors to Ledger CSS variables
export function mapVSCodeThemeToCSS(theme: CustomTheme): Record<string, string> {
  const colors = theme.colors;
  const cssVars: Record<string, string> = {};

  // App CSS variables mapping
  // Background colors
  if (colors['editor.background']) {
    cssVars['--bg-primary'] = colors['editor.background'];
  }
  if (colors['sideBar.background']) {
    cssVars['--bg-secondary'] = colors['sideBar.background'];
  }
  if (colors['activityBar.background'] || colors['sideBar.background']) {
    cssVars['--bg-tertiary'] = colors['activityBar.background'] || colors['sideBar.background'] || '';
  }
  if (colors['list.hoverBackground']) {
    cssVars['--bg-hover'] = colors['list.hoverBackground'];
  }

  // Text colors
  if (colors['editor.foreground'] || colors['foreground']) {
    cssVars['--text-primary'] = colors['editor.foreground'] || colors['foreground'] || '';
  }
  if (colors['descriptionForeground'] || colors['sideBar.foreground']) {
    cssVars['--text-secondary'] = colors['descriptionForeground'] || colors['sideBar.foreground'] || '';
  }
  if (colors['editorLineNumber.foreground']) {
    cssVars['--text-muted'] = colors['editorLineNumber.foreground'];
  }

  // Accent colors
  if (colors['button.background'] || colors['focusBorder']) {
    cssVars['--accent'] = colors['button.background'] || colors['focusBorder'] || '';
    // Create a slightly dimmed version for hover
    const accent = colors['button.background'] || colors['focusBorder'] || '';
    if (accent) {
      cssVars['--accent-dim'] = colors['button.hoverBackground'] || accent;
    }
  }

  // Status colors
  if (colors['gitDecoration.addedResourceForeground']) {
    cssVars['--success'] = colors['gitDecoration.addedResourceForeground'];
  }
  if (colors['errorForeground'] || colors['gitDecoration.deletedResourceForeground']) {
    cssVars['--error'] = colors['errorForeground'] || colors['gitDecoration.deletedResourceForeground'] || '';
  }

  // Border colors
  if (colors['panel.border'] || colors['input.border']) {
    cssVars['--border'] = colors['panel.border'] || colors['input.border'] || '';
    cssVars['--border-subtle'] = colors['panel.border'] || colors['input.border'] || '';
  }

  // Window CSS variables mapping
  if (colors['editor.background']) {
    cssVars['--window-c-background'] = colors['editor.background'];
  }
  if (colors['titleBar.activeBackground']) {
    cssVars['--window-c-titlebar-background'] = colors['titleBar.activeBackground'];
  }
  if (colors['titleBar.activeForeground']) {
    cssVars['--window-c-text'] = colors['titleBar.activeForeground'];
  }
  if (colors['list.hoverBackground']) {
    cssVars['--window-c-hover'] = colors['list.hoverBackground'];
  }
  if (colors['sideBar.background'] || colors['input.background']) {
    cssVars['--window-c-popup-background'] = colors['sideBar.background'] || colors['input.background'] || '';
  }
  if (colors['panel.border']) {
    cssVars['--window-c-popup-border'] = colors['panel.border'];
  }
  if (colors['scrollbarSlider.background']) {
    cssVars['--window-c-scrollbar-thumb'] = colors['scrollbarSlider.background'];
  }
  if (colors['scrollbarSlider.hoverBackground']) {
    cssVars['--window-c-scrollbar-thumb-hover'] = colors['scrollbarSlider.hoverBackground'];
  }

  return cssVars;
}

