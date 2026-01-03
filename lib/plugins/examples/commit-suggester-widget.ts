/**
 * Commit Message Suggester Widget Plugin
 *
 * Example Widget plugin that suggests commit messages.
 * Demonstrates how to create embedded widget plugins.
 */

import type { WidgetPlugin, PluginContext, CommitContext } from '../plugin-types'

/**
 * Commit Message Suggester Widget
 *
 * This widget embeds in the staging panel footer and provides
 * AI-powered commit message suggestions based on staged changes.
 */
export const commitSuggesterWidgetPlugin: WidgetPlugin = {
  id: 'ledger.commit-suggester',
  name: 'Commit Suggester',
  version: '1.0.0',
  type: 'widget',
  description: 'AI-powered commit message suggestions',
  author: 'Ledger Team',
  permissions: ['git:read'],

  // Component to render
  component: 'CommitSuggesterWidget',

  // Where this widget can appear
  slots: ['staging-panel-footer', 'commit-panel-header'],

  // Settings
  settings: [
    {
      key: 'style',
      label: 'Message style',
      type: 'select',
      default: 'conventional',
      options: [
        { label: 'Conventional Commits', value: 'conventional' },
        { label: 'Gitmoji', value: 'gitmoji' },
        { label: 'Simple', value: 'simple' },
      ],
    },
    {
      key: 'maxLength',
      label: 'Max message length',
      type: 'number',
      default: 72,
      validation: { min: 50, max: 200 },
    },
  ],

  // Hooks
  hooks: {
    'ai:suggest-commit-message': async (
      diff: string,
      context?: CommitContext
    ): Promise<string> => {
      // Analyze the diff to generate a message
      const lines = diff.split('\n')
      const addedLines = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      const removedLines = lines.filter((l) => l.startsWith('-') && !l.startsWith('---'))

      // Simple heuristics for demo
      if (addedLines.length > removedLines.length * 2) {
        if (diff.includes('test') || diff.includes('spec')) {
          return 'test: add test coverage'
        }
        if (diff.includes('README') || diff.includes('.md')) {
          return 'docs: update documentation'
        }
        return 'feat: add new functionality'
      }

      if (removedLines.length > addedLines.length * 2) {
        return 'refactor: remove unused code'
      }

      if (diff.includes('fix') || diff.includes('bug')) {
        return 'fix: resolve issue'
      }

      return 'chore: update code'
    },
  },

  // Commands
  commands: [
    {
      id: 'ledger.commit-suggester.suggest',
      name: 'Suggest Commit Message',
      description: 'Generate a commit message based on staged changes',
      shortcut: 'Cmd+Shift+M',
      handler: async () => {
        console.log('Generating commit message suggestion...')
      },
    },
  ],

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Commit Suggester Widget activated')

    const style = await context.storage.get<string>('style')
    context.logger.debug('Using message style:', style ?? 'conventional')
  },

  async deactivate(): Promise<void> {
    console.log('[Commit Suggester] Widget deactivated')
  },
}

export default commitSuggesterWidgetPlugin
