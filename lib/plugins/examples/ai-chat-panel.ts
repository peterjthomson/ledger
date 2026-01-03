/**
 * AI Chat Panel Plugin
 *
 * Example Panel plugin that provides an AI chat assistant.
 * Demonstrates how to create floating panel plugins.
 */

import type { PanelPlugin, PluginContext } from '../plugin-types'

/**
 * AI Chat Assistant Panel
 *
 * This plugin provides a floating chat panel that can be opened
 * via keyboard shortcut or command palette.
 */
export const aiChatPanelPlugin: PanelPlugin = {
  id: 'ledger.ai-chat',
  name: 'AI Assistant',
  version: '1.0.0',
  type: 'panel',
  description: 'Chat with AI about your code, get help with git commands, and more',
  author: 'Ledger Team',
  permissions: ['git:read', 'notifications'],

  // Panel configuration
  title: 'AI Assistant',
  component: 'AIChatPanel',
  size: 'medium',
  position: 'right',
  closable: true,
  shortcut: 'Cmd+Shift+C',

  // Settings
  settings: [
    {
      key: 'model',
      label: 'AI Model',
      type: 'select',
      default: 'gpt-4',
      options: [
        { label: 'GPT-4', value: 'gpt-4' },
        { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
        { label: 'Claude', value: 'claude-3' },
      ],
    },
    {
      key: 'contextAware',
      label: 'Include repo context',
      description: 'Include current branch and recent commits in AI context',
      type: 'boolean',
      default: true,
    },
  ],

  // Commands
  commands: [
    {
      id: 'ledger.ai-chat.open',
      name: 'Open AI Chat',
      description: 'Open the AI assistant panel',
      shortcut: 'Cmd+Shift+C',
      handler: async (args) => {
        // This would be handled by the plugin API
        console.log('Opening AI chat panel...')
      },
    },
    {
      id: 'ledger.ai-chat.explain-diff',
      name: 'Explain Current Diff',
      description: 'Ask AI to explain the current diff',
      handler: async () => {
        console.log('Explaining diff...')
      },
    },
  ],

  // Hooks
  hooks: {
    'ai:explain-diff': async (diff: string): Promise<string> => {
      // In production, this would call an LLM
      const lines = diff.split('\n')
      const additions = lines.filter((l) => l.startsWith('+')).length
      const deletions = lines.filter((l) => l.startsWith('-')).length

      return `This diff contains ${additions} additions and ${deletions} deletions. The changes appear to modify the code structure.`
    },
  },

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('AI Chat Panel activated')

    // Register keyboard shortcut handler
    context.subscriptions.onDispose(() => {
      context.logger.info('AI Chat Panel disposed')
    })
  },

  async deactivate(): Promise<void> {
    console.log('[AI Chat] Panel deactivated')
  },
}

export default aiChatPanelPlugin
