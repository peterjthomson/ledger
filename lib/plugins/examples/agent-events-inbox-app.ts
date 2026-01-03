/**
 * Agent Events Inbox App Plugin
 *
 * App plugin that provides a real-time inbox view of agent events.
 * Shows lifecycle events, activity updates, and work events from AI agents.
 */

import type { AppPlugin, PluginContext } from '../plugin-types'
import type { AgentEvent } from '../agent-events'

/**
 * Type guard to safely extract AgentEvent from unknown event
 */
function getAgentEventData(event: unknown): AgentEvent | null {
  if (!event || typeof event !== 'object') return null
  const e = event as Record<string, unknown>
  if (
    typeof e.type === 'string' &&
    e.type.startsWith('agent:') &&
    typeof e.agentType === 'string' &&
    typeof e.worktreePath === 'string'
  ) {
    return event as AgentEvent
  }
  return null
}

/**
 * Agent Events Inbox App
 *
 * This plugin adds an app that displays agent events in an inbox-style view.
 * It provides:
 * - Real-time event feed from agent worktrees
 * - Filtering by event type and agent
 * - Event details and history
 * - Future: trigger responses to events
 */
export const agentEventsInboxPlugin: AppPlugin = {
  id: 'ledger.agent-events-inbox',
  name: 'Agent Events',
  version: '1.0.0',
  type: 'app',
  description: 'Real-time inbox for AI agent events and activity monitoring',
  author: 'Ledger Team',
  homepage: 'https://github.com/ledger/plugins/agent-events',
  permissions: ['git:read', 'notifications'],

  // Sidebar configuration
  icon: 'inbox',
  iconTooltip: 'Agent Events Inbox',
  iconOrder: 15,

  // Component to render
  component: 'AgentEventsInboxApp',

  // Sub-navigation within the app
  navigation: [
    { id: 'inbox', label: 'Inbox', icon: 'inbox' },
    { id: 'agents', label: 'Agents', icon: 'bot' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ],

  // Settings
  settings: [
    {
      key: 'maxEvents',
      label: 'Max events to display',
      description: 'Maximum number of events to keep in the inbox',
      type: 'number',
      default: 100,
    },
    {
      key: 'notifyOnCommit',
      label: 'Notify on agent commit',
      description: 'Show notification when an agent makes a commit',
      type: 'boolean',
      default: true,
    },
    {
      key: 'notifyOnPR',
      label: 'Notify on PR created',
      description: 'Show notification when an agent creates a PR',
      type: 'boolean',
      default: true,
    },
    {
      key: 'notifyOnConflict',
      label: 'Notify on conflicts',
      description: 'Show notification when an agent has merge conflicts',
      type: 'boolean',
      default: true,
    },
    {
      key: 'soundEnabled',
      label: 'Enable sounds',
      description: 'Play sound for important events',
      type: 'boolean',
      default: false,
    },
  ],

  // Commands
  commands: [
    {
      id: 'ledger.agent-events-inbox.clear',
      name: 'Clear Event History',
      description: 'Clear all events from the inbox',
      handler: async () => {
        console.log('Clearing event history...')
      },
    },
    {
      id: 'ledger.agent-events-inbox.refresh',
      name: 'Refresh Agent Status',
      description: 'Refresh status of all agents',
      shortcut: 'Cmd+Shift+R',
      handler: async () => {
        console.log('Refreshing agent status...')
      },
    },
  ],

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Agent Events Inbox activated')

    // Subscribe to agent events with proper type validation
    context.events.on('agent:detected', (event) => {
      const agentEvent = getAgentEventData(event)
      if (agentEvent) {
        context.logger.debug('Agent detected:', agentEvent.agentType, agentEvent.worktreePath)
      }
    })

    context.events.on('agent:commit', async (event) => {
      const agentEvent = getAgentEventData(event)
      if (!agentEvent) return

      const notifyOnCommit = await context.storage.get<boolean>('notifyOnCommit')
      if (notifyOnCommit !== false) {
        const message = agentEvent.data?.commitMessage || 'New commit'
        context.api.showNotification(`Agent committed: ${message}`, 'info')
      }
    })

    context.events.on('agent:conflict', async (event) => {
      const agentEvent = getAgentEventData(event)
      if (!agentEvent) return

      const notifyOnConflict = await context.storage.get<boolean>('notifyOnConflict')
      if (notifyOnConflict !== false) {
        context.api.showNotification('Agent has merge conflicts!', 'warning')
      }
    })

    // Register cleanup
    context.subscriptions.onDispose(() => {
      context.logger.debug('Cleaning up Agent Events Inbox')
    })
  },

  async deactivate(): Promise<void> {
    console.log('[Agent Events Inbox] App deactivated')
  },
}

export default agentEventsInboxPlugin
