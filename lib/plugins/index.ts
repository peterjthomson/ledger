/**
 * Ledger Plugin System
 *
 * Extensible plugin architecture supporting four plugin types:
 *
 * - **App Plugins**: Full-screen applications with sidebar navigation
 * - **Panel Plugins**: Floating panels/modals that overlay the view
 * - **Widget Plugins**: Embedded UI components in specific slots
 * - **Service Plugins**: Headless background services
 *
 * @example
 * ```typescript
 * import { pluginManager, type AppPlugin } from '@/lib/plugins'
 *
 * // Create a plugin
 * const myPlugin: AppPlugin = {
 *   id: 'my-org.my-plugin',
 *   name: 'My Plugin',
 *   version: '1.0.0',
 *   type: 'app',
 *   icon: 'sparkles',
 *   component: 'MyPluginApp',
 * }
 *
 * // Register and activate
 * pluginManager.register(myPlugin)
 * await pluginManager.activate(myPlugin.id)
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Plugin types
  Plugin,
  PluginType,
  PluginBase,
  AppPlugin,
  PanelPlugin,
  WidgetPlugin,
  ServicePlugin,

  // Props for plugin components
  PluginAppProps,
  PluginPanelProps,
  PluginWidgetProps,
  AppNavItem,
  WidgetSlot,
  BackgroundTask,

  // Context and services
  PluginContext,
  PluginEvents,
  PluginStorage,
  PluginLogger,
  PluginSubscriptions,
  PluginAPI,

  // Hooks
  PluginHooks,
  CommitAnalysis,
  CommitContext,
  BranchAnalysis,
  PRReviewSuggestion,
  UIBadge,
  MenuItem,
  ToolbarItem,
  ContextMenuTarget,

  // Commands and settings
  PluginCommand,
  PluginSetting,

  // Registry
  PluginRegistration,
  PluginEvent,
  PluginEventType,

  // Manifest (for external plugins)
  PluginManifest,
  PluginPermission,
} from './plugin-types'

// ============================================================================
// Manager & Loader
// ============================================================================

export { pluginManager } from './plugin-manager'
export { pluginLoader, pluginRegistry, type InstalledPlugin, type PluginSource } from './plugin-loader'
export {
  createPluginContext,
  createPluginStorage,
  createPersistentPluginStorage,
  type PluginContextDependencies,
} from './plugin-context'
export {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  grantPermissions,
  revokePermissions,
  getPermissions,
  requirePermission,
  describePermission,
} from './plugin-permissions'

export { pluginSettingsStore } from './plugin-settings-store'

export {
  agentEvents,
  notifyAgentCommit,
  notifyAgentPush,
  notifyAgentPRCreated,
  notifyAgentConflict,
  type AgentEvent,
  type AgentEventType,
  type AgentEventData,
  type AgentState,
} from './agent-events'

// ============================================================================
// Hook Helpers
// ============================================================================

export {
  // Git lifecycle
  beforeCheckout,
  afterCheckout,
  beforeCommit,
  afterCommit,
  beforePush,
  afterPush,
  beforePull,
  afterPull,
  // Repository lifecycle
  repoOpened,
  repoClosed,
  repoRefreshed,
  // AI analysis
  analyzeCommit,
  analyzeBranch,
  reviewPR,
  suggestCommitMessage,
  summarizeChanges,
  // UI extension
  getCommitBadge,
  getBranchBadge,
  getPRBadge,
  getContextMenuItems,
  // Availability checks
  hasAIAnalysis,
  hasCommitMessageSuggestion,
  hasPRReview,
} from './plugin-hooks'

// ============================================================================
// Example Plugins
// ============================================================================

export {
  aiReviewAppPlugin,
  aiChatPanelPlugin,
  commitSuggesterWidgetPlugin,
  autoFetchServicePlugin,
  examplePlugins,
} from './examples'
