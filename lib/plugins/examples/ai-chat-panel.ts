/**
 * AI Chat Panel Plugin
 *
 * Example Panel plugin that provides an AI chat assistant.
 * Demonstrates how to create floating panel plugins AND
 * how to use the core AI service for conversations.
 */

import type { PanelPlugin, PluginContext } from '../plugin-types'

// System prompt for the chat assistant
const CHAT_SYSTEM_PROMPT = `You are a helpful AI assistant integrated into Ledger, a Git client application.
You help users with:
- Understanding git concepts and commands
- Explaining code changes and diffs
- Reviewing commits and branches
- Git workflow best practices
- Troubleshooting git issues

Be concise, helpful, and technically accurate. When explaining git commands, include examples.
If asked about code, focus on clarity and best practices.`

const DIFF_EXPLANATION_PROMPT = `You are a code analyst. Explain the given diff in clear, plain language.
Focus on:
- What was changed (new features, bug fixes, refactoring)
- Why it might have been changed
- Any potential concerns or improvements
- Impact on the codebase

Be concise but thorough. Use bullet points for multiple changes.`

/**
 * AI Chat Assistant Panel
 *
 * This plugin provides a floating chat panel that can be opened
 * via keyboard shortcut or command palette. It demonstrates:
 * - Using the core AI service for conversations
 * - Explaining diffs with AI
 * - Context-aware assistance
 */
export const aiChatPanelPlugin: PanelPlugin = {
  id: 'ledger.ai-chat',
  name: 'AI Assistant',
  version: '1.0.0',
  type: 'panel',
  description: 'Chat with AI about your code, get help with git commands, and more',
  author: 'Ledger Team',
  permissions: ['git:read', 'notifications', 'network'],

  // Panel configuration
  title: 'AI Assistant',
  component: 'AIChatPanel',
  size: 'medium',
  position: 'right',
  closable: true,
  shortcut: 'Cmd+Shift+C',

  // Settings - model selection uses tiers (speed/quality trade-off)
  settings: [
    {
      key: 'responseSpeed',
      label: 'Response Speed',
      description: 'Trade-off between speed and quality',
      type: 'select',
      default: 'balanced',
      options: [
        { label: 'Quick (faster, simpler responses)', value: 'quick' },
        { label: 'Balanced (recommended)', value: 'balanced' },
        { label: 'Thorough (slower, detailed responses)', value: 'powerful' },
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
      handler: async () => {
        console.log('[AI Chat] Opening panel...')
        // The actual panel opening is handled by the plugin system
      },
    },
    {
      id: 'ledger.ai-chat.explain-diff',
      name: 'Explain Current Diff',
      description: 'Ask AI to explain the current diff',
      handler: async () => {
        console.log('[AI Chat] Explain diff command triggered')
        // In a full implementation, this would get the current diff
        // and call the ai:explain-diff hook
      },
    },
    {
      id: 'ledger.ai-chat.quick-question',
      name: 'Quick Git Question',
      description: 'Ask a quick question about Git',
      handler: async () => {
        try {
          // Uses configured provider, or free OpenRouter if none configured
          const response = await window.conveyor.ai.quick(
            [{ role: 'user', content: 'What does git rebase do in one sentence?' }],
            { systemPrompt: CHAT_SYSTEM_PROMPT, maxTokens: 100 }
          )
          console.log('[AI Chat] Response:', response.content)
        } catch (error) {
          console.error('[AI Chat] Quick question failed:', error)
        }
      },
    },
  ],

  // Hooks - using core AI service
  hooks: {
    'ai:explain-diff': async (diff: string): Promise<string> => {
      // Uses configured provider, or free OpenRouter if none configured
      try {
        // Truncate diff if too long
        const maxLength = 10000
        const truncatedDiff =
          diff.length > maxLength
            ? diff.substring(0, maxLength) + '\n\n... (diff truncated for analysis)'
            : diff

        const response = await window.conveyor.ai.balanced(
          [{ role: 'user', content: `Explain this diff:\n\n${truncatedDiff}` }],
          {
            systemPrompt: DIFF_EXPLANATION_PROMPT,
            maxTokens: 800,
          }
        )

        return response.content
      } catch (error) {
        console.error('[AI Chat] Diff explanation failed:', error)
        return fallbackDiffExplanation(diff)
      }
    },

    'ai:summarize-changes': async (commits): Promise<string> => {
      // Uses configured provider, or free OpenRouter if none configured
      try {
        const commitList = commits
          .slice(0, 20) // Limit to recent commits
          .map((c) => `- ${c.shortHash}: ${c.message.split('\n')[0]}`)
          .join('\n')

        const response = await window.conveyor.ai.quick(
          [{ role: 'user', content: `Summarize these commits:\n\n${commitList}` }],
          {
            systemPrompt:
              'Provide a brief summary of the overall changes in these commits. Be concise (2-3 sentences max).',
            maxTokens: 200,
          }
        )

        return response.content
      } catch (error) {
        console.error('[AI Chat] Changes summary failed:', error)
        return `${commits.length} commits with various changes.`
      }
    },
  },

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('AI Chat Panel activated')

    // Log available AI providers (free OpenRouter available if none configured)
    try {
      const providers = await window.conveyor.ai.getConfiguredProviders()
      if (providers.length > 0) {
        context.logger.info(`AI Chat ready with providers: ${providers.join(', ')}`)
      } else {
        context.logger.info('AI Chat ready with free OpenRouter models')
      }
    } catch (error) {
      context.logger.error('Failed to check AI providers:', error)
    }

    // Register cleanup
    context.subscriptions.onDispose(() => {
      context.logger.info('AI Chat Panel disposed')
    })
  },

  async deactivate(): Promise<void> {
    console.log('[AI Chat] Panel deactivated')
  },
}

// Fallback function when AI is not available
function fallbackDiffExplanation(diff: string): string {
  const lines = diff.split('\n')
  const additions = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length
  const deletions = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length

  const fileMatches = diff.match(/^diff --git.+$/gm) || []
  const fileCount = fileMatches.length

  let explanation = `This diff modifies ${fileCount} file${fileCount !== 1 ? 's' : ''} with `
  explanation += `${additions} addition${additions !== 1 ? 's' : ''} and `
  explanation += `${deletions} deletion${deletions !== 1 ? 's' : ''}.`

  if (additions > deletions * 2) {
    explanation += ' The changes are primarily adding new code.'
  } else if (deletions > additions * 2) {
    explanation += ' The changes are primarily removing code.'
  } else if (additions > 0 && deletions > 0) {
    explanation += ' The changes appear to be refactoring or modifying existing code.'
  }

  return explanation
}

export default aiChatPanelPlugin
