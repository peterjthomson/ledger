/**
 * Syntax Highlighter Utility
 *
 * Wraps Shiki to provide syntax highlighting for diff views.
 * Uses the same VS Code theme JSON files that Ledger uses for app theming.
 */

import { createHighlighter, type Highlighter, type BundledLanguage } from 'shiki'

// Singleton highlighter instance
let highlighterInstance: Highlighter | null = null
let currentThemeId: string | null = null

// Map of file extensions to Shiki language identifiers
const EXTENSION_TO_LANGUAGE: Record<string, BundledLanguage> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  md: 'markdown',
  mdx: 'mdx',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  svg: 'xml',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
}

// Common languages to preload for faster highlighting
const PRELOAD_LANGUAGES: BundledLanguage[] = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'html',
  'css',
  'markdown',
  'python',
  'bash',
  'yaml',
]

/**
 * Get the Shiki language for a file path based on extension
 */
export function getLanguageFromPath(filePath: string): BundledLanguage | null {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext) return null
  return EXTENSION_TO_LANGUAGE[ext] || null
}

/**
 * Initialize the highlighter with a theme
 * @param themeId - Theme identifier (for cache invalidation)
 * @param themeJson - VS Code theme JSON object
 */
export async function initializeHighlighter(
  themeId: string,
  themeJson?: object
): Promise<Highlighter> {
  // Return existing if theme hasn't changed
  if (highlighterInstance && currentThemeId === themeId) {
    return highlighterInstance
  }

  // Dispose the old instance to prevent memory leaks
  // Shiki uses WebAssembly which won't be garbage collected automatically
  if (highlighterInstance) {
    highlighterInstance.dispose()
    highlighterInstance = null
  }

  // Use bundled themes if no custom theme provided
  const themes = themeJson
    ? [{ name: 'ledger-theme', ...themeJson }]
    : ['github-dark', 'github-light']

  highlighterInstance = await createHighlighter({
    themes: themes as Parameters<typeof createHighlighter>[0]['themes'],
    langs: PRELOAD_LANGUAGES,
  })

  currentThemeId = themeId
  return highlighterInstance
}

/**
 * Get the current highlighter instance, initializing if needed
 */
export async function getHighlighter(): Promise<Highlighter | null> {
  if (highlighterInstance) {
    return highlighterInstance
  }

  // Initialize with default theme
  return initializeHighlighter('github-dark')
}

/**
 * Highlight a single line of code
 * @param code - The code to highlight (single line, no prefix)
 * @param language - The language to use
 * @param themeName - The theme to use (defaults to 'ledger-theme' or 'github-dark')
 * @returns HTML string with syntax highlighting, or escaped text if highlighting fails
 */
export async function highlightLine(
  code: string,
  language: BundledLanguage | null,
  themeName?: string
): Promise<string> {
  if (!language) {
    // Return escaped plain text if no language
    return escapeHtml(code)
  }

  try {
    const highlighter = await getHighlighter()
    if (!highlighter) {
      return escapeHtml(code)
    }

    // Ensure the language is loaded
    const loadedLangs = highlighter.getLoadedLanguages()
    if (!loadedLangs.includes(language)) {
      await highlighter.loadLanguage(language)
    }

    // Get available themes
    const loadedThemes = highlighter.getLoadedThemes()
    const theme = themeName && loadedThemes.includes(themeName)
      ? themeName
      : loadedThemes.includes('ledger-theme')
        ? 'ledger-theme'
        : loadedThemes[0] || 'github-dark'

    // Highlight the code
    const html = highlighter.codeToHtml(code, {
      lang: language,
      theme,
    })

    // Extract just the inner content (remove pre/code wrappers)
    const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)
    if (match) {
      // Remove the outer <span class="line"> wrapper if present
      const inner = match[1].replace(/^<span class="line">([\s\S]*)<\/span>$/, '$1')
      return inner
    }

    return escapeHtml(code)
  } catch (error) {
    console.warn('[SyntaxHighlighter] Failed to highlight:', error)
    return escapeHtml(code)
  }
}

/**
 * Highlight multiple lines at once (more efficient for bulk operations)
 * @param lines - Array of { code, lineIndex } objects
 * @param language - The language to use
 * @param themeName - The theme to use
 * @returns Map of lineIndex to highlighted HTML
 */
export async function highlightLines(
  lines: Array<{ code: string; lineIndex: number }>,
  language: BundledLanguage | null,
  themeName?: string
): Promise<Map<number, string>> {
  const result = new Map<number, string>()

  if (!language || lines.length === 0) {
    for (const line of lines) {
      result.set(line.lineIndex, escapeHtml(line.code))
    }
    return result
  }

  try {
    const highlighter = await getHighlighter()
    if (!highlighter) {
      for (const line of lines) {
        result.set(line.lineIndex, escapeHtml(line.code))
      }
      return result
    }

    // Ensure language is loaded
    const loadedLangs = highlighter.getLoadedLanguages()
    if (!loadedLangs.includes(language)) {
      await highlighter.loadLanguage(language)
    }

    // Get theme
    const loadedThemes = highlighter.getLoadedThemes()
    const theme = themeName && loadedThemes.includes(themeName)
      ? themeName
      : loadedThemes.includes('ledger-theme')
        ? 'ledger-theme'
        : loadedThemes[0] || 'github-dark'

    // Highlight each line individually
    // Note: We could batch these into a single codeToHtml call and split,
    // but that can cause issues with multiline constructs
    for (const line of lines) {
      try {
        const html = highlighter.codeToHtml(line.code, {
          lang: language,
          theme,
        })
        const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)
        if (match) {
          const inner = match[1].replace(/^<span class="line">([\s\S]*)<\/span>$/, '$1')
          result.set(line.lineIndex, inner)
        } else {
          result.set(line.lineIndex, escapeHtml(line.code))
        }
      } catch {
        result.set(line.lineIndex, escapeHtml(line.code))
      }
    }

    return result
  } catch (error) {
    console.warn('[SyntaxHighlighter] Failed to highlight lines:', error)
    for (const line of lines) {
      result.set(line.lineIndex, escapeHtml(line.code))
    }
    return result
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Dispose the highlighter instance (for cleanup)
 */
export function disposeHighlighter(): void {
  if (highlighterInstance) {
    highlighterInstance.dispose()
    highlighterInstance = null
    currentThemeId = null
  }
}


