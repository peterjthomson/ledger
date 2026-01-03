/**
 * Repository Manager Panel Plugin
 *
 * Panel for managing multiple repositories - switch, add, remove.
 * Provides a richer interface than the header chip switcher.
 */

import type { PanelPlugin, PluginContext } from '../plugin-types'

/**
 * Repository Manager Panel
 *
 * Features:
 * - List all open repositories
 * - Switch between repositories
 * - Open new repositories
 * - Access recent repositories
 * - Close repositories
 * - Provider icons (GitHub, GitLab, etc.)
 */
export const repositoryManagerPlugin: PanelPlugin = {
  id: 'ledger.repository-manager',
  name: 'Repository Manager',
  version: '1.0.0',
  type: 'panel',
  description: 'Manage multiple repositories - switch, add, and remove',
  author: 'Ledger Team',
  permissions: ['git:read'],

  // Panel configuration
  title: 'Repositories',
  component: 'RepositoryManagerPanel',
  size: 'medium',
  position: 'center',
  closable: true,

  // Commands
  commands: [
    {
      id: 'ledger.repository-manager.open',
      name: 'Open Repository Manager',
      description: 'Show the repository manager panel',
      shortcut: 'Cmd+Shift+R',
      handler: async () => {
        console.log('[Repository Manager] Opening panel...')
      },
    },
  ],

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Repository Manager activated')
  },

  async deactivate(): Promise<void> {
    console.log('[Repository Manager] Panel deactivated')
  },
}

export default repositoryManagerPlugin
