/**
 * AI Code Review App Plugin
 *
 * Example App plugin that provides AI-powered code review.
 * Demonstrates how to create a full-screen app plugin with sidebar navigation.
 */

import type { AppPlugin, PluginContext, CommitAnalysis, PRReviewSuggestion } from '../plugin-types'
import type { Commit, PullRequest } from '@/app/types/electron'

/**
 * AI Code Review App
 *
 * This plugin adds a new app accessible via the plugin sidebar.
 * It provides:
 * - Commit analysis with AI
 * - PR review suggestions
 * - Code quality insights
 */
export const aiReviewAppPlugin: AppPlugin = {
  id: 'ledger.ai-review',
  name: 'AI Code Review',
  version: '1.0.0',
  type: 'app',
  description: 'AI-powered code review and analysis for your commits and PRs',
  author: 'Ledger Team',
  homepage: 'https://github.com/ledger/plugins/ai-review',
  permissions: ['git:read', 'notifications'],

  // Sidebar configuration
  icon: 'sparkles',
  iconTooltip: 'AI Code Review',
  iconOrder: 10,

  // Component to render (would be registered in React)
  component: 'AIReviewApp',

  // Sub-navigation within the app
  navigation: [
    { id: 'commits', label: 'Commit Analysis', icon: 'git-commit' },
    { id: 'prs', label: 'PR Review', icon: 'git-pull-request' },
    { id: 'insights', label: 'Insights', icon: 'bar-chart' },
  ],

  // Settings
  settings: [
    {
      key: 'autoAnalyze',
      label: 'Auto-analyze new commits',
      description: 'Automatically analyze commits when viewing history',
      type: 'boolean',
      default: true,
    },
    {
      key: 'reviewDepth',
      label: 'Review depth',
      description: 'How thorough should the AI review be',
      type: 'select',
      default: 'standard',
      options: [
        { label: 'Quick', value: 'quick' },
        { label: 'Standard', value: 'standard' },
        { label: 'Deep', value: 'deep' },
      ],
    },
    {
      key: 'apiKey',
      label: 'API Key',
      description: 'Your AI provider API key',
      type: 'string',
      default: '',
    },
  ],

  // Hooks this plugin implements
  hooks: {
    'ai:analyze-commit': async (commit: Commit): Promise<CommitAnalysis> => {
      // In production, this would call an LLM API
      const category = detectCategory(commit.message)
      const complexity = detectComplexity(commit)

      return {
        summary: `Analysis of ${commit.shortHash}: ${commit.message.split('\n')[0]}`,
        category,
        complexity,
        suggestedTests: complexity === 'high' ? ['Add integration tests'] : [],
        potentialBugs: [],
        relatedFiles: [],
      }
    },

    'ai:review-pr': async (pr: PullRequest, diff: string): Promise<PRReviewSuggestion[]> => {
      // In production, this would analyze the diff with an LLM
      const suggestions: PRReviewSuggestion[] = []

      // Simple heuristic suggestions
      if (diff.includes('TODO')) {
        suggestions.push({
          file: 'unknown',
          type: 'issue',
          message: 'TODO comment found in changes',
          severity: 'low',
        })
      }

      if (diff.includes('console.log')) {
        suggestions.push({
          file: 'unknown',
          type: 'suggestion',
          message: 'Consider removing console.log statements before merging',
          severity: 'low',
        })
      }

      return suggestions
    },
  },

  // Commands
  commands: [
    {
      id: 'ledger.ai-review.analyze-current',
      name: 'Analyze Current Commit',
      description: 'Run AI analysis on the currently selected commit',
      shortcut: 'Cmd+Shift+A',
      handler: async () => {
        console.log('Analyzing current commit...')
      },
    },
    {
      id: 'ledger.ai-review.review-pr',
      name: 'Review Current PR',
      description: 'Run AI review on the currently selected PR',
      handler: async () => {
        console.log('Reviewing current PR...')
      },
    },
  ],

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('AI Review App activated')

    const apiKey = await context.storage.get<string>('apiKey')
    if (!apiKey) {
      context.logger.warn('No API key configured. Some features may not work.')
    }
  },

  async deactivate(): Promise<void> {
    console.log('[AI Review] App deactivated')
  },
}

// Helper functions
function detectCategory(message: string): CommitAnalysis['category'] {
  const lower = message.toLowerCase()
  if (lower.startsWith('feat')) return 'feature'
  if (lower.startsWith('fix')) return 'bugfix'
  if (lower.startsWith('refactor')) return 'refactor'
  if (lower.startsWith('docs')) return 'docs'
  if (lower.startsWith('test')) return 'test'
  if (lower.startsWith('chore')) return 'chore'
  if (lower.includes('breaking')) return 'breaking'
  return 'other'
}

function detectComplexity(commit: Commit): CommitAnalysis['complexity'] {
  const changes = (commit.additions ?? 0) + (commit.deletions ?? 0)
  if (changes > 500) return 'high'
  if (changes > 100) return 'medium'
  return 'low'
}

export default aiReviewAppPlugin
