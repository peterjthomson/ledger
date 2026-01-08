/**
 * Notion Viewer App Plugin
 *
 * Read-only Notion database viewer that allows browsing databases and cards.
 * This is Layer 1 of the Notion AI Card Triage feature.
 */

import type { AppPlugin, PluginContext } from '../plugin-types'

/**
 * Notion Viewer App
 *
 * A full-screen app plugin for browsing Notion databases and cards.
 * Provides database selection, card listing, and card detail views.
 */
export const notionViewerAppPlugin: AppPlugin = {
  id: 'ledger.notion-viewer',
  name: 'Notion Viewer',
  version: '1.0.0',
  type: 'app',
  description: 'Browse and view Notion databases and cards',
  author: 'Ledger Team',
  permissions: ['network'],

  // Sidebar configuration
  icon: 'BookOpen',
  iconTooltip: 'Notion Viewer',
  iconOrder: 60,

  // The React component to render
  component: 'NotionViewerApp',

  // Sub-navigation within the app
  navigation: [
    {
      id: 'databases',
      label: 'Databases',
      icon: 'Database',
    },
    {
      id: 'cards',
      label: 'Cards',
      icon: 'LayoutList',
    },
  ],

  // Plugin settings
  settings: [
    {
      key: 'defaultDatabaseId',
      label: 'Default Database',
      description: 'The database to open by default',
      type: 'string',
      default: '',
    },
    {
      key: 'pageSize',
      label: 'Cards per page',
      description: 'Number of cards to load at a time',
      type: 'number',
      default: 50,
      validation: {
        min: 10,
        max: 100,
      },
    },
    {
      key: 'showPropertyColumns',
      label: 'Properties to show',
      description: 'Comma-separated list of property names to display in card list',
      type: 'string',
      default: 'Status,Priority',
    },
  ],

  // Commands
  commands: [
    {
      id: 'ledger.notion-viewer.open',
      name: 'Open Notion Viewer',
      description: 'Open the Notion database viewer',
      handler: async () => {
        // Handled by plugin API
        console.log('[Notion Viewer] Opening app...')
      },
    },
    {
      id: 'ledger.notion-viewer.refresh',
      name: 'Refresh Notion Data',
      description: 'Refresh the current database view',
      handler: async () => {
        console.log('[Notion Viewer] Refreshing...')
      },
    },
  ],

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Notion Viewer App activated')

    // Check if Notion is configured
    try {
      const isConfigured = await window.conveyor?.notion?.isConfigured()
      if (!isConfigured) {
        context.api.showNotification(
          'Configure Notion API key in Settings to use Notion Viewer',
          'warning'
        )
      }
    } catch (error) {
      context.logger.warn('Could not check Notion configuration:', error)
    }

    context.subscriptions.onDispose(() => {
      context.logger.info('Notion Viewer App disposed')
    })
  },

  async deactivate(): Promise<void> {
    console.log('[Notion Viewer] App deactivated')
  },
}

export default notionViewerAppPlugin
