/**
 * Branch Health Widget Plugin
 *
 * Inline widget showing branch health indicators:
 * - Merge status (behind/ahead of main)
 * - Conflict warnings
 * - Stale branch indicators
 * - CI/CD status (if available)
 */

import type { WidgetPlugin, PluginContext } from '../plugin-types'

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

export default branchHealthWidgetPlugin
