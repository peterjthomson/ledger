/**
 * PR Review Queue Panel Plugin
 *
 * Floating panel for managing pull request reviews.
 * Shows PRs needing review with aging indicators and quick actions.
 */

import type { PanelPlugin, PluginContext, PullRequest } from '../plugin-types'

/**
 * Extended PR info with review metadata
 */
interface ReviewQueueItem {
  pr: PullRequest
  waitingHours: number
  urgency: 'low' | 'medium' | 'high' | 'critical'
  reviewers: string[]
  yourReview: 'pending' | 'approved' | 'changes_requested' | 'none'
}

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
  warningHours: number,
  criticalHours: number
): Promise<void> {
  // In production, would fetch actual PR data
  // For demo, just log
  context.logger.debug('Checking for overdue PRs...')
}

/**
 * Calculate urgency based on waiting time
 */
function calculateUrgency(
  waitingHours: number,
  warningThreshold: number,
  criticalThreshold: number
): ReviewQueueItem['urgency'] {
  if (waitingHours >= criticalThreshold) return 'critical'
  if (waitingHours >= warningThreshold * 2) return 'high'
  if (waitingHours >= warningThreshold) return 'medium'
  return 'low'
}

/**
 * Build review queue from PRs
 */
function buildReviewQueue(
  prs: PullRequest[],
  warningThreshold: number,
  criticalThreshold: number,
  currentUser?: string
): ReviewQueueItem[] {
  const now = new Date()

  return prs
    .filter((pr) => !pr.isDraft)
    .map((pr) => {
      const created = new Date(pr.createdAt)
      const waitingHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60)

      return {
        pr,
        waitingHours: Math.floor(waitingHours),
        urgency: calculateUrgency(waitingHours, warningThreshold, criticalThreshold),
        reviewers: [], // Would come from GitHub API
        yourReview: 'none' as const,
      }
    })
    .sort((a, b) => b.waitingHours - a.waitingHours)
}

/**
 * Format waiting time for display
 */
function formatWaitingTime(hours: number): string {
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

/**
 * Get color for urgency level
 */
function getUrgencyColor(urgency: ReviewQueueItem['urgency']): string {
  switch (urgency) {
    case 'critical':
      return 'var(--error)'
    case 'high':
      return 'var(--warning)'
    case 'medium':
      return 'var(--info)'
    case 'low':
      return 'var(--success)'
  }
}

export default prReviewQueuePlugin
