/**
 * Quick Capture Types
 *
 * Types for the menu bar quick issue creation feature.
 */

/**
 * Quick issue data from the capture popover
 */
export interface QuickIssue {
  /** User input - first line becomes title, rest becomes body */
  description: string
  /** Base64 encoded screenshot data */
  screenshot?: string
  /** Optional labels to apply */
  labels?: string[]
  /** Optional priority label */
  priority?: string
  /** Target repository path */
  repoPath: string
}

/**
 * Result of quick issue creation
 */
export interface QuickIssueResult {
  success: boolean
  /** Issue number if created */
  number?: number
  /** Issue URL if created */
  url?: string
  /** Error message if failed */
  message: string
}

/**
 * Quick capture settings
 */
export interface QuickCaptureSettings {
  /** Show menu bar icon */
  enabled: boolean
  /** Auto-capture screenshot when popover opens */
  autoScreenshot: boolean
  /** Delay before screenshot (ms) - for dismissing windows */
  screenshotDelay: number
  /** Pre-selected labels for new issues */
  defaultLabels: string[]
  /** Last used repository */
  defaultRepo: string
  /** Global keyboard shortcut (e.g., "CommandOrControl+Shift+I") */
  globalShortcut?: string
}

/**
 * Screenshot capture result
 */
export interface ScreenshotResult {
  success: boolean
  /** Base64 encoded PNG data */
  data?: string
  /** Error message if failed */
  message?: string
}

/**
 * Recent repository for quick capture dropdown
 */
export interface QuickCaptureRepo {
  /** Repository path */
  path: string
  /** Repository name (folder name) */
  name: string
  /** Owner/org name from GitHub remote */
  owner?: string
}

/**
 * Default settings
 */
export const DEFAULT_QUICK_CAPTURE_SETTINGS: QuickCaptureSettings = {
  enabled: true,
  autoScreenshot: true,
  screenshotDelay: 0,
  defaultLabels: [],
  defaultRepo: '',
  globalShortcut: undefined,
}
