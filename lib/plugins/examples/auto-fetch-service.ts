/**
 * Auto Fetch Service Plugin
 *
 * Example Service plugin that automatically fetches from remote.
 * Demonstrates how to create headless background service plugins.
 */

import type { ServicePlugin, PluginContext } from '../plugin-types'

/**
 * Auto Fetch Service
 *
 * This service runs in the background and periodically fetches
 * from the remote repository to keep the local state up to date.
 */
export const autoFetchServicePlugin: ServicePlugin = {
  id: 'ledger.auto-fetch',
  name: 'Auto Fetch',
  version: '1.0.0',
  type: 'service',
  description: 'Automatically fetch from remote to stay up to date',
  author: 'Ledger Team',
  permissions: ['git:read', 'notifications'],

  // Settings
  settings: [
    {
      key: 'interval',
      label: 'Fetch interval (minutes)',
      type: 'number',
      default: 5,
      validation: { min: 1, max: 60 },
    },
    {
      key: 'notifyOnNew',
      label: 'Notify on new commits',
      description: 'Show notification when new commits are available',
      type: 'boolean',
      default: true,
    },
    {
      key: 'fetchPrune',
      label: 'Prune deleted branches',
      description: 'Remove local references to deleted remote branches',
      type: 'boolean',
      default: false,
    },
  ],

  // Background tasks
  backgroundTasks: [
    {
      id: 'fetch',
      interval: 5 * 60 * 1000, // 5 minutes (overridden by settings)
      handler: async (context: PluginContext) => {
        try {
          const repoPath = context.api.getRepoPath()
          if (!repoPath) {
            context.logger.debug('No repository open, skipping fetch')
            return
          }

          const prune = await context.storage.get<boolean>('fetchPrune')
          const args = prune ? ['fetch', '--prune'] : ['fetch']

          context.logger.debug('Fetching from remote...')
          await context.api.git(args)
          context.logger.debug('Fetch complete')

          // Check for new commits
          const notifyOnNew = await context.storage.get<boolean>('notifyOnNew')
          if (notifyOnNew) {
            // In production, would compare before/after and notify
          }
        } catch (error) {
          context.logger.error('Auto-fetch failed:', error)
        }
      },
    },
  ],

  // Hooks
  hooks: {
    'repo:opened': async (path: string) => {
      console.log(`[Auto Fetch] Repository opened: ${path}`)
      // Could trigger an immediate fetch
    },

    'git:after-checkout': async (branch: string) => {
      console.log(`[Auto Fetch] Checked out ${branch}, fetching...`)
      // Could trigger a fetch after checkout
    },
  },

  // Commands
  commands: [
    {
      id: 'ledger.auto-fetch.fetch-now',
      name: 'Fetch Now',
      description: 'Immediately fetch from remote',
      handler: async () => {
        console.log('Fetching from remote...')
      },
    },
    {
      id: 'ledger.auto-fetch.toggle',
      name: 'Toggle Auto Fetch',
      description: 'Enable or disable automatic fetching',
      handler: async () => {
        console.log('Toggling auto-fetch...')
      },
    },
  ],

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Auto Fetch Service activated')

    // Load custom interval
    const interval = await context.storage.get<number>('interval')
    if (interval) {
      context.logger.info(`Fetch interval: ${interval} minutes`)
    }
  },

  async deactivate(): Promise<void> {
    console.log('[Auto Fetch] Service deactivated')
  },
}

export default autoFetchServicePlugin
