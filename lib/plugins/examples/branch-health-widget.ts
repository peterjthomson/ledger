/**
 * Branch Health Widget Plugin
 *
 * Inline widget showing branch health indicators:
 * - Merge status (behind/ahead of main)
 * - Conflict warnings
 * - Stale branch indicators
 * - CI/CD status (if available)
 */

import type { WidgetPlugin, PluginContext, Branch } from '../plugin-types'

/**
 * Branch health assessment
 */
interface BranchHealth {
  status: 'healthy' | 'warning' | 'critical' | 'stale'
  behindMain: number
  aheadOfMain: number
  hasConflicts: boolean
  daysSinceActivity: number
  ciStatus?: 'passing' | 'failing' | 'pending' | 'unknown'
  message: string
}

/**
 * Branch Health Widget
 *
 * Displays inline health indicators for branches:
 * - Green checkmark: Up to date with main
 * - Yellow warning: Behind main or stale
 * - Red alert: Has conflicts or far behind
 * - Gray clock: No recent activity
 */
export const branchHealthWidgetPlugin: WidgetPlugin = {
  id: 'ledger.branch-health',
  name: 'Branch Health',
  version: '1.0.0',
  type: 'widget',
  description: 'Show branch health indicators inline',
  author: 'Ledger Team',
  permissions: ['git:read'],

  // Component to render
  component: 'BranchHealthWidget',

  // Where this widget appears
  slots: ['branch-list-item', 'worktree-list-item'],

  // Settings
  settings: [
    {
      key: 'staleDays',
      label: 'Stale threshold (days)',
      description: 'Mark branches as stale after this many days',
      type: 'number',
      default: 14,
      validation: { min: 1, max: 90 },
    },
    {
      key: 'warningBehind',
      label: 'Warning threshold (commits behind)',
      description: 'Show warning when branch is this far behind main',
      type: 'number',
      default: 10,
      validation: { min: 1, max: 100 },
    },
    {
      key: 'criticalBehind',
      label: 'Critical threshold (commits behind)',
      description: 'Show critical warning when branch is this far behind',
      type: 'number',
      default: 50,
      validation: { min: 10, max: 500 },
    },
    {
      key: 'showCIStatus',
      label: 'Show CI status',
      description: 'Display CI/CD status when available',
      type: 'boolean',
      default: true,
    },
  ],

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Branch Health Widget activated')

    // Load settings
    const staleDays = await context.storage.get<number>('staleDays') ?? 14
    context.logger.debug(`Stale threshold: ${staleDays} days`)
  },

  async deactivate(): Promise<void> {
    console.log('[Branch Health] Widget deactivated')
  },
}

/**
 * Assess branch health
 */
function assessBranchHealth(
  branch: Branch,
  mainBranch: string,
  staleDays: number,
  warningBehind: number,
  criticalBehind: number
): BranchHealth {
  const now = new Date()
  const lastActivity = branch.lastCommitDate ? new Date(branch.lastCommitDate) : now
  const daysSinceActivity = Math.floor(
    (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
  )

  // Default values (would be calculated from git in production)
  const behindMain = 0
  const aheadOfMain = branch.commitCount ?? 0
  const hasConflicts = false

  // Determine status
  let status: BranchHealth['status'] = 'healthy'
  let message = 'Up to date'

  if (daysSinceActivity > staleDays) {
    status = 'stale'
    message = `No activity for ${daysSinceActivity} days`
  } else if (hasConflicts) {
    status = 'critical'
    message = 'Has merge conflicts'
  } else if (behindMain >= criticalBehind) {
    status = 'critical'
    message = `${behindMain} commits behind ${mainBranch}`
  } else if (behindMain >= warningBehind) {
    status = 'warning'
    message = `${behindMain} commits behind ${mainBranch}`
  } else if (behindMain > 0) {
    status = 'healthy'
    message = `${behindMain} behind, ${aheadOfMain} ahead`
  }

  return {
    status,
    behindMain,
    aheadOfMain,
    hasConflicts,
    daysSinceActivity,
    ciStatus: 'unknown',
    message,
  }
}

/**
 * Get icon for health status
 */
function getHealthIcon(status: BranchHealth['status']): string {
  switch (status) {
    case 'healthy':
      return 'check-circle'
    case 'warning':
      return 'alert-triangle'
    case 'critical':
      return 'alert-circle'
    case 'stale':
      return 'clock'
  }
}

/**
 * Get color for health status
 */
function getHealthColor(status: BranchHealth['status']): string {
  switch (status) {
    case 'healthy':
      return 'var(--success)'
    case 'warning':
      return 'var(--warning)'
    case 'critical':
      return 'var(--error)'
    case 'stale':
      return 'var(--text-muted)'
  }
}

/**
 * Get CI status icon
 */
function getCIStatusIcon(status: BranchHealth['ciStatus']): string {
  switch (status) {
    case 'passing':
      return 'check'
    case 'failing':
      return 'x'
    case 'pending':
      return 'loader'
    default:
      return 'help-circle'
  }
}

export default branchHealthWidgetPlugin
