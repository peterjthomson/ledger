/**
 * Example Plugins Index
 *
 * These example plugins demonstrate best practices for each plugin type:
 * - App: Full-screen applications with sidebar navigation
 * - Panel: Floating modals for focused tasks
 * - Widget: Inline UI embedded in existing views
 * - Service: Headless background services
 *
 * @see docs/PLUGIN_STANDARD.md for the full plugin specification
 */

// ============================================================================
// App Plugins
// ============================================================================

/** AI Review App - Code review with AI analysis */
export { aiReviewAppPlugin } from './ai-review-app'

/** Team Dashboard - Manager oversight and analytics */
export { teamDashboardPlugin } from './team-dashboard-app'

/** Agent Events Inbox - Real-time agent event monitoring */
export { agentEventsInboxPlugin } from './agent-events-inbox-app'

// ============================================================================
// Panel Plugins
// ============================================================================

/** AI Chat Panel - Chat assistant */
export { aiChatPanelPlugin } from './ai-chat-panel'

/** PR Review Queue - Manage review backlog */
export { prReviewQueuePlugin } from './pr-review-queue-panel'

/** Standup Notes - Daily standup capture */
export { standupNotesPlugin } from './standup-notes-panel'

/** Repository Manager - Multi-repo management panel */
export { repositoryManagerPlugin } from './repository-manager-panel'

// ============================================================================
// Widget Plugins
// ============================================================================

/** Commit Suggester - AI commit message suggestions */
export { commitSuggesterWidgetPlugin } from './commit-suggester-widget'

/** Branch Health - Inline branch status indicators */
export { branchHealthWidgetPlugin } from './branch-health-widget'

// ============================================================================
// Service Plugins
// ============================================================================

/** Auto Fetch - Automatic git fetch */
export { autoFetchServicePlugin } from './auto-fetch-service'

/** Slack Notifications - Git events to Slack */
export { slackNotificationsPlugin } from './slack-notifications-service'

/** Commit Analyzer - Analysis and suggestions for commits */
export { commitAnalyzerPlugin } from './commit-analyzer-plugin'

// ============================================================================
// Plugin Collections
// ============================================================================

import { aiReviewAppPlugin } from './ai-review-app'
import { teamDashboardPlugin } from './team-dashboard-app'
import { agentEventsInboxPlugin } from './agent-events-inbox-app'
import { aiChatPanelPlugin } from './ai-chat-panel'
import { prReviewQueuePlugin } from './pr-review-queue-panel'
import { standupNotesPlugin } from './standup-notes-panel'
import { repositoryManagerPlugin } from './repository-manager-panel'
import { commitSuggesterWidgetPlugin } from './commit-suggester-widget'
import { branchHealthWidgetPlugin } from './branch-health-widget'
import { autoFetchServicePlugin } from './auto-fetch-service'
import { slackNotificationsPlugin } from './slack-notifications-service'

/**
 * All example plugins for easy registration
 */
export const examplePlugins = [
  // Apps
  aiReviewAppPlugin,
  teamDashboardPlugin,
  agentEventsInboxPlugin,
  // Panels
  aiChatPanelPlugin,
  prReviewQueuePlugin,
  standupNotesPlugin,
  repositoryManagerPlugin,
  // Widgets
  commitSuggesterWidgetPlugin,
  branchHealthWidgetPlugin,
  // Services
  autoFetchServicePlugin,
  slackNotificationsPlugin,
]

/**
 * Example plugins by type
 */
export const examplePluginsByType = {
  app: [aiReviewAppPlugin, teamDashboardPlugin, agentEventsInboxPlugin],
  panel: [aiChatPanelPlugin, prReviewQueuePlugin, standupNotesPlugin, repositoryManagerPlugin],
  widget: [commitSuggesterWidgetPlugin, branchHealthWidgetPlugin],
  service: [autoFetchServicePlugin, slackNotificationsPlugin],
}
