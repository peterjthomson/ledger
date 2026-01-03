/**
 * Plugin System Types
 *
 * Ledger's extensible plugin architecture supports multiple plugin types:
 *
 * - **App Plugins**: Full-screen applications with sidebar navigation icons
 * - **Panel Plugins**: Floating panels/modals that overlay the current view
 * - **Widget Plugins**: Small UI components embedded in existing panels
 * - **Service Plugins**: Headless plugins providing hooks and background services
 */

import type { Commit, PullRequest, Branch, Worktree, StashEntry } from '@/app/types/electron'

// ============================================================================
// Plugin Types
// ============================================================================

/**
 * The type of plugin determines how it integrates with Ledger
 */
export type PluginType = 'app' | 'panel' | 'widget' | 'service'

/**
 * Base plugin metadata shared by all plugin types
 */
export interface PluginBase {
  /** Unique identifier (e.g., 'my-org.plugin-name') */
  id: string
  /** Display name */
  name: string
  /** Semantic version */
  version: string
  /** Plugin type */
  type: PluginType
  /** Short description */
  description?: string
  /** Plugin author or organization */
  author?: string
  /** Plugin homepage/repository URL */
  homepage?: string
  /** Minimum Ledger version required */
  minLedgerVersion?: string
  /** Required permissions */
  permissions?: PluginPermission[]

  /** Hook implementations */
  hooks?: Partial<PluginHooks>
  /** Commands the plugin provides */
  commands?: PluginCommand[]
  /** Settings schema */
  settings?: PluginSetting[]

  /** Called when plugin is activated */
  activate?: (context: PluginContext) => Promise<void>
  /** Called when plugin is deactivated */
  deactivate?: () => Promise<void>
}

// ============================================================================
// App Plugin - Full Application View
// ============================================================================

/**
 * App plugins provide full-screen experiences accessible via sidebar icons.
 * They can integrate deeply with Ledger's git operations or provide
 * entirely new functionality.
 *
 * @example
 * - AI Code Review app
 * - Git Visualization app
 * - Project Management app
 */
export interface AppPlugin extends PluginBase {
  type: 'app'

  /** Icon for the sidebar (Lucide icon name or custom SVG) */
  icon: string
  /** Icon tooltip */
  iconTooltip?: string
  /** Order in sidebar (lower = higher position) */
  iconOrder?: number

  /**
   * The React component ID to render for this app.
   * The component will receive PluginAppProps.
   */
  component: string

  /** Optional: Sub-navigation items within the app */
  navigation?: AppNavItem[]
}

export interface AppNavItem {
  id: string
  label: string
  icon?: string
}

export interface PluginAppProps {
  /** Plugin context with storage, logger, etc. */
  context: PluginContext
  /** Current repository path (if any) */
  repoPath: string | null
  /** Active sub-navigation item */
  activeNavItem?: string
  /** Callback to change sub-navigation */
  onNavigate?: (itemId: string) => void
}

// ============================================================================
// Panel Plugin - Floating Panels/Modals
// ============================================================================

/**
 * Panel plugins provide floating UI that overlays the current view.
 * They can be triggered by commands, context menus, or keyboard shortcuts.
 *
 * @example
 * - Quick commit message generator
 * - AI chat assistant
 * - Diff comparison panel
 */
export interface PanelPlugin extends PluginBase {
  type: 'panel'

  /** Panel title */
  title: string
  /** The React component ID to render */
  component: string

  /** Panel size */
  size?: 'small' | 'medium' | 'large' | 'fullscreen'
  /** Panel position */
  position?: 'center' | 'right' | 'bottom'
  /** Allow multiple instances */
  allowMultiple?: boolean
  /** Show close button */
  closable?: boolean
  /** Keyboard shortcut to open (e.g., 'Cmd+Shift+A') */
  shortcut?: string
}

export interface PluginPanelProps {
  context: PluginContext
  repoPath: string | null
  /** Data passed when opening the panel */
  data?: unknown
  /** Close the panel */
  onClose: () => void
}

// ============================================================================
// Widget Plugin - Embedded UI Components
// ============================================================================

/**
 * Widget plugins provide small UI components that can be embedded
 * in specific locations within Ledger's interface.
 *
 * @example
 * - Commit message AI suggestions (in staging panel)
 * - Branch health indicators (in branch list)
 * - PR review status badges
 */
export interface WidgetPlugin extends PluginBase {
  type: 'widget'

  /** The React component ID to render */
  component: string

  /** Where the widget can be placed */
  slots: WidgetSlot[]
}

export type WidgetSlot =
  | 'commit-panel-header'
  | 'commit-panel-footer'
  | 'staging-panel-header'
  | 'staging-panel-footer'
  | 'branch-list-item'
  | 'pr-list-item'
  | 'worktree-list-item'
  | 'commit-list-item'
  | 'detail-panel-header'
  | 'detail-panel-footer'
  | 'sidebar-header'
  | 'sidebar-footer'
  | 'toolbar'

export interface PluginWidgetProps {
  context: PluginContext
  repoPath: string | null
  /** Slot where widget is rendered */
  slot: WidgetSlot
  /** Context data (e.g., the branch/commit/PR being displayed) */
  data?: unknown
}

// ============================================================================
// Service Plugin - Headless Background Services
// ============================================================================

/**
 * Service plugins run in the background without UI.
 * They can provide hooks, background tasks, and data processing.
 *
 * @example
 * - Auto-sync with remote
 * - Commit signing service
 * - Analytics/telemetry
 */
export interface ServicePlugin extends PluginBase {
  type: 'service'

  /** Background tasks to run */
  backgroundTasks?: BackgroundTask[]
}

export interface BackgroundTask {
  id: string
  /** Interval in milliseconds (0 = run once on activation) */
  interval: number
  /** Task handler */
  handler: (context: PluginContext) => Promise<void>
}

// ============================================================================
// Union Type for All Plugins
// ============================================================================

export type Plugin = AppPlugin | PanelPlugin | WidgetPlugin | ServicePlugin

// ============================================================================
// Plugin Hooks
// ============================================================================

export interface PluginHooks {
  // Git lifecycle hooks
  'git:before-checkout': (branch: string) => Promise<void | boolean>
  'git:after-checkout': (branch: string) => Promise<void>
  'git:before-commit': (message: string) => Promise<string | void>
  'git:after-commit': (hash: string) => Promise<void>
  'git:before-push': (branch: string) => Promise<void | boolean>
  'git:after-push': (branch: string) => Promise<void>
  'git:before-pull': (branch: string) => Promise<void | boolean>
  'git:after-pull': (branch: string) => Promise<void>
  'git:before-stash': () => Promise<void | boolean>
  'git:after-stash': (stashId: string) => Promise<void>

  // Repository hooks
  'repo:opened': (path: string) => Promise<void>
  'repo:closed': (path: string) => Promise<void>
  'repo:refreshed': () => Promise<void>

  // AI integration hooks
  'ai:analyze-commit': (commit: Commit) => Promise<CommitAnalysis>
  'ai:analyze-branch': (branch: Branch, commits: Commit[]) => Promise<BranchAnalysis>
  'ai:review-pr': (pr: PullRequest, diff: string) => Promise<PRReviewSuggestion[]>
  'ai:suggest-commit-message': (diff: string, context?: CommitContext) => Promise<string>
  'ai:summarize-changes': (commits: Commit[]) => Promise<string>
  'ai:explain-diff': (diff: string) => Promise<string>

  // UI extension hooks
  'ui:commit-badge': (commit: Commit) => Promise<UIBadge | null>
  'ui:branch-badge': (branch: Branch) => Promise<UIBadge | null>
  'ui:pr-badge': (pr: PullRequest) => Promise<UIBadge | null>
  'ui:worktree-badge': (worktree: Worktree) => Promise<UIBadge | null>
  'ui:context-menu-items': (target: ContextMenuTarget) => Promise<MenuItem[]>
  'ui:toolbar-items': () => Promise<ToolbarItem[]>

  // Data transformation hooks
  'data:filter-commits': (commits: Commit[]) => Promise<Commit[]>
  'data:filter-branches': (branches: Branch[]) => Promise<Branch[]>
  'data:enrich-commit': (commit: Commit) => Promise<Commit & Record<string, unknown>>
}

// ============================================================================
// Hook Return Types
// ============================================================================

export interface CommitAnalysis {
  summary: string
  category: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test' | 'chore' | 'breaking' | 'other'
  complexity: 'low' | 'medium' | 'high'
  suggestedTests?: string[]
  potentialBugs?: string[]
  relatedFiles?: string[]
  breakingChanges?: string[]
}

export interface CommitContext {
  recentCommits?: Commit[]
  branch?: string
  stagedFiles?: string[]
}

export interface BranchAnalysis {
  summary: string
  mainChanges: string[]
  riskLevel: 'low' | 'medium' | 'high'
  estimatedReviewTime?: string
  suggestedReviewers?: string[]
  conflictRisk?: 'low' | 'medium' | 'high'
}

export interface PRReviewSuggestion {
  file: string
  line?: number
  endLine?: number
  type: 'issue' | 'suggestion' | 'praise' | 'question'
  message: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  code?: string
}

export interface UIBadge {
  label: string
  color: 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'gray'
  tooltip?: string
  icon?: string
}

export interface MenuItem {
  id: string
  label: string
  action: string
  icon?: string
  disabled?: boolean
  shortcut?: string
  submenu?: MenuItem[]
}

export interface ToolbarItem {
  id: string
  label: string
  icon: string
  action: string
  tooltip?: string
  disabled?: boolean
}

export interface ContextMenuTarget {
  type: 'commit' | 'branch' | 'pr' | 'worktree' | 'stash' | 'file'
  data: Commit | Branch | PullRequest | Worktree | StashEntry | string
}

// ============================================================================
// Plugin Commands
// ============================================================================

export interface PluginCommand {
  /** Command identifier (plugin-id.command-name) */
  id: string
  /** Display name */
  name: string
  /** Description for command palette */
  description?: string
  /** Keyboard shortcut */
  shortcut?: string
  /** Handler function */
  handler: (args?: Record<string, unknown>) => Promise<void>
}

// ============================================================================
// Plugin Settings
// ============================================================================

export interface PluginSetting {
  key: string
  label: string
  description?: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect' | 'color' | 'file'
  default: unknown
  required?: boolean
  options?: { label: string; value: unknown }[]
  validation?: {
    min?: number
    max?: number
    pattern?: string
    message?: string
  }
}

// ============================================================================
// Plugin Context & Services
// ============================================================================

export interface PluginContext {
  /** Plugin's persistent storage */
  storage: PluginStorage
  /** Logger scoped to this plugin */
  logger: PluginLogger
  /** Subscribe to lifecycle events */
  subscriptions: PluginSubscriptions
  /** Access to Ledger APIs */
  api: PluginAPI
  /** Subscribe to events from Ledger and agent systems */
  events: PluginEvents
}

export interface PluginEvents {
  /**
   * Subscribe to events. Supports both LedgerEvents (repo:*, git:*) and AgentEvents (agent:*).
   * @param type Event type or '*' for all events
   * @param callback Handler function
   * @returns Unsubscribe function
   */
  on(type: string, callback: (event: unknown) => void): () => void

  /**
   * Subscribe to an event once. Automatically unsubscribes after first event.
   */
  once(type: string, callback: (event: unknown) => void): () => void
}

export interface PluginStorage {
  /** Get a value by key */
  get<T>(key: string): Promise<T | null>
  /** Set a value by key */
  set<T>(key: string, value: T): Promise<void>
  /** Delete a value by key */
  delete(key: string): Promise<void>
  /** Clear all values for this plugin */
  clear(): Promise<void>
  /** Get all keys for this plugin */
  keys(): Promise<string[]>
  /** Check if a key exists */
  has(key: string): Promise<boolean>
}

export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export interface PluginSubscriptions {
  onDispose(callback: () => void): void
}

export interface PluginAPI {
  /** Get current repository path */
  getRepoPath(): string | null
  /** Get current branch */
  getCurrentBranch(): Promise<string>
  /** Get branches */
  getBranches(): Promise<Branch[]>
  /** Get worktrees (including agent detection) */
  getWorktrees(): Promise<Worktree[]>
  /** Get pull requests */
  getPullRequests(): Promise<PullRequest[]>
  /** Get commits */
  getCommits(limit?: number): Promise<Commit[]>
  /** Get working status (alias for getStagingStatus for backwards compatibility) */
  getWorkingStatus(): Promise<unknown>
  /** Get staging status (fetches fresh data via IPC when available) */
  getStagingStatus(): Promise<unknown>
  /** Execute a git command */
  git(args: string[]): Promise<string>
  /** Show a notification */
  showNotification(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void
  /** Open a panel plugin */
  openPanel(pluginId: string, data?: unknown): void
  /** Close all panels opened by this plugin */
  closePanel(): void
  /** Navigate to an app plugin */
  navigateToApp(pluginId: string): void
  /** Refresh repository data */
  refresh(): Promise<void>
}

// ============================================================================
// Plugin Registry Types
// ============================================================================

export interface PluginRegistration {
  plugin: Plugin
  enabled: boolean
  activatedAt?: Date
  error?: string
}

export type PluginEventType =
  | 'registered'
  | 'unregistered'
  | 'activated'
  | 'deactivated'
  | 'error'
  | 'settings-changed'

export interface PluginEvent {
  type: PluginEventType
  pluginId: string
  timestamp: Date
  data?: unknown
}

// ============================================================================
// Plugin Manifest (for external plugins)
// ============================================================================

export interface PluginManifest {
  id: string
  name: string
  version: string
  type: PluginType
  description?: string
  author?: string
  homepage?: string
  main: string // Entry point file
  icon?: string
  minLedgerVersion?: string
  dependencies?: Record<string, string>
  permissions?: PluginPermission[]
}

export type PluginPermission =
  | 'git:read'
  | 'git:write'
  | 'fs:read'
  | 'fs:write'
  | 'network'
  | 'shell'
  | 'clipboard'
  | 'notifications'
