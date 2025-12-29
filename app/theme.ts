// Theme management utility for the renderer process

export type ThemeMode = 'light' | 'dark' | 'system' | 'custom';

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

// Get the effective theme (resolves 'system' to actual light/dark)
async function getEffectiveTheme(mode: ThemeMode): Promise<'light' | 'dark'> {
  if (mode === 'system') {
    return await window.conveyor.theme.getSystemTheme();
  }
  return mode === 'custom' ? 'dark' : mode;
}

// Listen for system theme changes
function setupSystemThemeListener(): void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  mediaQuery.addEventListener('change', async () => {
    const currentMode = await window.conveyor.theme.getThemeMode() as ThemeMode;
    if (currentMode === 'system') {
      const systemTheme = mediaQuery.matches ? 'dark' : 'light';
      setThemeClass(systemTheme);
    }
  });
}

// Initialize theme on app startup
export async function initializeTheme(): Promise<void> {
  try {
    const mode = await window.conveyor.theme.getThemeMode() as ThemeMode;

    if (mode === 'custom') {
      const themeData = await window.conveyor.theme.getCustomTheme() as ThemeData | null;
      if (themeData) {
        // Apply the base mode (light/dark) from the custom theme
        setThemeClass(themeData.theme.type);
        // Apply custom CSS variables
        applyCSSVariables(themeData.cssVars);
      } else {
        // Fall back to dark if custom theme not found
        setThemeClass('dark');
      }
    } else if (mode === 'system') {
      const effectiveTheme = await getEffectiveTheme(mode);
      setThemeClass(effectiveTheme);
    } else {
      setThemeClass(mode);
    }
    
    // Set up listener for system theme changes
    setupSystemThemeListener();
  } catch (error) {
    console.error('Failed to initialize theme:', error);
    // Default to light mode on error
    setThemeClass('light');
  }
}

// Toggle between light and dark mode
export async function toggleTheme(): Promise<void> {
  const currentMode = await window.conveyor.theme.getThemeMode() as ThemeMode;

  // Clear any custom theme variables first
  clearCustomCSSVariables();

  // Toggle between light and dark
  const newMode: ThemeMode = currentMode === 'dark' ? 'light' : 'dark';

  setThemeClass(newMode);
  await window.conveyor.theme.setThemeMode(newMode);
}

// Set specific theme mode
export async function setThemeMode(mode: ThemeMode): Promise<void> {
  if (mode === 'custom') {
    // For custom, we need to load the custom theme
    const themeData = await window.conveyor.theme.getCustomTheme() as ThemeData | null;
    if (themeData) {
      setThemeClass(themeData.theme.type);
      applyCSSVariables(themeData.cssVars);
      await window.conveyor.theme.setThemeMode('custom');
    }
  } else if (mode === 'system') {
    clearCustomCSSVariables();
    const effectiveTheme = await getEffectiveTheme(mode);
    setThemeClass(effectiveTheme);
    await window.conveyor.theme.setThemeMode('system');
  } else {
    clearCustomCSSVariables();
    setThemeClass(mode);
    await window.conveyor.theme.setThemeMode(mode);
  }
}

// Load a VSCode theme file (user-selected)
export async function loadVSCodeTheme(): Promise<CustomTheme | null> {
  try {
    const result = await window.conveyor.theme.loadVSCodeTheme() as ThemeData | null;

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
    const result = await window.conveyor.theme.loadBuiltInTheme(themeFileName) as ThemeData | null;

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
  await window.conveyor.theme.clearCustomTheme();
  setThemeClass('dark');
}

// Get current theme mode
export async function getCurrentThemeMode(): Promise<ThemeMode> {
  return await window.conveyor.theme.getThemeMode() as ThemeMode;
}

// Check if dark mode is currently active
export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}
