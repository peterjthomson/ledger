/**
 * PR Review Queue Panel Plugin
 *
 * Floating panel for managing pull request reviews.
 * Shows PRs needing review with aging indicators and quick actions.
 */

import type { PanelPlugin, PluginContext } from '../plugin-types'

/**
 * PR Review Queue Panel
 *
 * Features:
 * - PRs sorted by waiting time
 * - Color-coded urgency indicators
 * - Quick approve/request changes
 * - Filter by author/reviewer
 * - Daily review summary
 */
export const prReviewQueuePlugin: PanelPlugin = {
  id: 'ledger.pr-review-queue',
  name: 'PR Review Queue',
  version: '1.0.0',
  type: 'panel',
  description: 'Manage your pull request review queue with aging alerts',
  author: 'Ledger Team',
  permissions: ['git:read', 'notifications'],

  // Panel configuration
  title: 'Review Queue',
  component: 'PRReviewQueuePanel',
  size: 'medium',
  position: 'right',
  closable: true,
  shortcut: 'Cmd+Shift+P',

  // Settings
  settings: [
    {
      key: 'warningThreshold',
      label: 'Warning threshold (hours)',
      description: 'Mark PRs as needing attention after this time',
      type: 'number',
      default: 4,
      validation: { min: 1, max: 48 },
    },
    {
      key: 'criticalThreshold',
      label: 'Critical threshold (hours)',
      description: 'Mark PRs as critical after this time',
      type: 'number',
      default: 24,
      validation: { min: 4, max: 168 },
    },
    {
      key: 'showOnlyMine',
      label: 'Show only assigned to me',
      type: 'boolean',
      default: false,
    },
    {
      key: 'excludeDrafts',
      label: 'Exclude draft PRs',
      type: 'boolean',
      default: true,
    },
    {
      key: 'sortBy',
      label: 'Sort by',
      type: 'select',
      default: 'waiting',
      options: [
        { label: 'Waiting Time', value: 'waiting' },
        { label: 'Created Date', value: 'created' },
        { label: 'Size (LOC)', value: 'size' },
        { label: 'Author', value: 'author' },
      ],
    },
  ],

  // Commands
  commands: [
    {
      id: 'ledger.pr-review-queue.open',
      name: 'Open Review Queue',
      description: 'Show the PR review queue panel',
      shortcut: 'Cmd+Shift+P',
      handler: async () => {
        console.log('[PR Review Queue] Opening panel...')
      },
    },
    {
      id: 'ledger.pr-review-queue.next',
      name: 'Review Next PR',
      description: 'Open the next PR in your review queue',
      shortcut: 'Cmd+Shift+N',
      handler: async () => {
        console.log('[PR Review Queue] Opening next PR...')
      },
    },
  ],

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('PR Review Queue activated')

    // Load thresholds
    const warning = await context.storage.get<number>('warningThreshold') ?? 4
    const critical = await context.storage.get<number>('criticalThreshold') ?? 24

    context.logger.debug(`Thresholds: warning=${warning}h, critical=${critical}h`)

    // Check for overdue PRs on activation
    await checkOverduePRs(context, warning, critical)
  },

  async deactivate(): Promise<void> {
    console.log('[PR Review Queue] Panel deactivated')
  },
}

/**
 * Check for overdue PRs and notify
 */
async function checkOverduePRs(
  context: PluginContext,
  _warningHours: number,
  _criticalHours: number
): Promise<void> {
  // In production, would fetch actual PR data
  // For demo, just log
  context.logger.debug('Checking for overdue PRs...')
}

export default prReviewQueuePlugin
