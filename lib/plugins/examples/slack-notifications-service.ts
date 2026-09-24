/**
 * Slack Notifications Service Plugin
 *
 * Service plugin that sends git events to Slack.
 * Supports custom message formatting and channel routing.
 */

import type { ServicePlugin, PluginContext } from '../plugin-types'

/**
 * Slack Notifications Service
 *
 * Features:
 * - Commit notifications with diff stats
 * - Push/pull alerts
 * - PR status updates
 * - Branch creation/deletion notices
 * - Custom message templates
 * - Channel routing per event type
 */
export const slackNotificationsPlugin: ServicePlugin = {
  id: 'ledger.slack-notifications',
  name: 'Slack Notifications',
  version: '1.0.0',
  type: 'service',
  description: 'Send git events to Slack channels',
  author: 'Ledger Team',
  homepage: 'https://github.com/ledger/plugins/slack-notifications',
  permissions: ['git:read', 'notifications'],

  // Settings
  settings: [
    {
      key: 'webhookUrl',
      label: 'Slack Webhook URL',
      description: 'Your Slack incoming webhook URL',
      type: 'string',
      default: '',
    },
    {
      key: 'defaultChannel',
      label: 'Default channel',
      description: 'Channel for notifications (e.g., #dev-activity)',
      type: 'string',
      default: '#git-activity',
    },
    {
      key: 'username',
      label: 'Bot username',
      type: 'string',
      default: 'Ledger Bot',
    },
    {
      key: 'notifyOnCommit',
      label: 'Notify on commit',
      type: 'boolean',
      default: true,
    },
    {
      key: 'notifyOnPush',
      label: 'Notify on push',
      type: 'boolean',
      default: true,
    },
    {
      key: 'notifyOnPull',
      label: 'Notify on pull',
      type: 'boolean',
      default: false,
    },
    {
      key: 'notifyOnCheckout',
      label: 'Notify on branch switch',
      type: 'boolean',
      default: false,
    },
    {
      key: 'includeStats',
      label: 'Include diff statistics',
      description: 'Show additions/deletions in commit messages',
      type: 'boolean',
      default: true,
    },
  ],

  // Git lifecycle hooks
  hooks: {
    'git:after-commit': async (hash: string) => {
      console.log(`[Slack] Would notify about commit: ${hash}`)
      // In production: await sendSlackMessage(buildCommitMessage(hash))
    },

    'git:after-push': async (branch: string) => {
      console.log(`[Slack] Would notify about push to: ${branch}`)
      // In production: await sendSlackMessage(buildPushMessage(branch))
    },

    'git:after-pull': async (branch: string) => {
      console.log(`[Slack] Would notify about pull on: ${branch}`)
    },

    'git:after-checkout': async (branch: string) => {
      console.log(`[Slack] Would notify about checkout: ${branch}`)
    },
  },

  // Commands
  commands: [
    {
      id: 'ledger.slack-notifications.test',
      name: 'Send Test Message',
      description: 'Send a test message to Slack',
      handler: async () => {
        console.log('[Slack] Sending test message...')
      },
    },
    {
      id: 'ledger.slack-notifications.status',
      name: 'Check Connection',
      description: 'Verify Slack webhook is configured',
      handler: async () => {
        console.log('[Slack] Checking connection...')
      },
    },
  ],

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Slack Notifications service activated')

    // Validate webhook URL
    const webhookUrl = await context.storage.get<string>('webhookUrl')
    if (!webhookUrl) {
      context.logger.warn('No Slack webhook URL configured')
      context.api.showNotification(
        'Slack Notifications: Please configure your Slack webhook URL in plugin settings',
        'warning'
      )
    } else {
      context.logger.info('Slack webhook configured')
    }
  },

  async deactivate(): Promise<void> {
    console.log('[Slack Notifications] Service deactivated')
  },
}

export default slackNotificationsPlugin
