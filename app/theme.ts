// Theme management utility for the renderer process

export type ThemeMode = 'light' | 'dark' | 'custom';

export interface CustomTheme {
  name: string;
  path: string;
  type: 'light' | 'dark';
  colors: Record<string, string>;
}

export interface ThemeData {
  theme: CustomTheme;
  cssVars: Record<string, string>;
}

// Apply CSS variables to the document root
function applyCSSVariables(cssVars: Record<string, string>): void {
  const root = document.documentElement;
  for (const [varName, value] of Object.entries(cssVars)) {
    if (value) {
      root.style.setProperty(varName, value);
    }
  }
}

// Clear custom CSS variables
function clearCustomCSSVariables(): void {
  const root = document.documentElement;
  // Remove all inline style properties (custom theme vars)
  root.removeAttribute('style');
}

// Set theme mode class on document
function setThemeClass(mode: 'light' | 'dark'): void {
  if (mode === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// Initialize theme on app startup
export async function initializeTheme(): Promise<void> {
  try {
    const mode = await window.electronAPI.getThemeMode() as ThemeMode;

    if (mode === 'custom') {
      const themeData = await window.electronAPI.getCustomTheme() as ThemeData | null;
      if (themeData) {
        // Apply the base mode (light/dark) from the custom theme
        setThemeClass(themeData.theme.type);
        // Apply custom CSS variables
        applyCSSVariables(themeData.cssVars);
      } else {
        // Fall back to dark if custom theme not found
        setThemeClass('dark');
      }
    } else {
      setThemeClass(mode);
    }
  } catch (error) {
    console.error('Failed to initialize theme:', error);
    // Default to light mode on error
    setThemeClass('light');
  }
}

// Toggle between light and dark mode
export async function toggleTheme(): Promise<void> {
  const currentMode = await window.electronAPI.getThemeMode() as ThemeMode;

  // Clear any custom theme variables first
  clearCustomCSSVariables();

  // Toggle between light and dark
  const newMode: ThemeMode = currentMode === 'dark' ? 'light' : 'dark';

  setThemeClass(newMode);
  await window.electronAPI.setThemeMode(newMode);
}

// Set specific theme mode
export async function setThemeMode(mode: ThemeMode): Promise<void> {
  if (mode === 'custom') {
    // For custom, we need to load the custom theme
    const themeData = await window.electronAPI.getCustomTheme() as ThemeData | null;
    if (themeData) {
      setThemeClass(themeData.theme.type);
      applyCSSVariables(themeData.cssVars);
      await window.electronAPI.setThemeMode('custom');
    }
  } else {
    clearCustomCSSVariables();
    setThemeClass(mode);
    await window.electronAPI.setThemeMode(mode);
  }
}

// Load a VSCode theme file (user-selected)
export async function loadVSCodeTheme(): Promise<CustomTheme | null> {
  try {
    const result = await window.electronAPI.loadVSCodeTheme() as ThemeData | null;

    if (result) {
      // Apply the theme
      setThemeClass(result.theme.type);
      applyCSSVariables(result.cssVars);
      return result.theme;
    }

    return null;
  } catch (error) {
    console.error('Failed to load VSCode theme:', error);
    return null;
  }
}

// Load a built-in theme from resources/themes
export async function loadBuiltInTheme(themeFileName: string): Promise<CustomTheme | null> {
  try {
    const result = await window.electronAPI.loadBuiltInTheme(themeFileName) as ThemeData | null;

    if (result) {
      // Apply the theme
      setThemeClass(result.theme.type);
      applyCSSVariables(result.cssVars);
      return result.theme;
    }

    return null;
  } catch (error) {
    console.error('Failed to load built-in theme:', error);
    return null;
  }
}

// Clear custom theme and revert to dark mode
export async function clearCustomTheme(): Promise<void> {
  clearCustomCSSVariables();
  await window.electronAPI.clearCustomTheme();
  setThemeClass('dark');
}

// Get current theme mode
export async function getCurrentThemeMode(): Promise<ThemeMode> {
  return await window.electronAPI.getThemeMode() as ThemeMode;
}

// Check if dark mode is currently active
export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}
