/**
 * AI Code Review App Plugin
 *
 * Example App plugin that provides AI-powered code review.
 * Demonstrates how to create a full-screen app plugin with sidebar navigation
 * AND how to use the core AI service (window.conveyor.ai).
 */

import type { AppPlugin, PluginContext, CommitAnalysis, PRReviewSuggestion } from '../plugin-types'
import type { Commit, PullRequest } from '@/app/types/electron'

// System prompts for AI analysis
const COMMIT_ANALYSIS_PROMPT = `You are a code review assistant. Analyze the given commit and provide a structured analysis.
Return a JSON object with these exact fields:
- summary: A brief one-sentence summary of the changes
- category: One of "feature", "bugfix", "refactor", "docs", "test", "chore", "breaking", "other"
- complexity: One of "low", "medium", "high" based on scope and risk
- suggestedTests: Array of suggested test cases (empty if none needed)
- potentialBugs: Array of potential issues spotted (empty if none)
- relatedFiles: Array of files that might need updates (empty if none)
- breakingChanges: Array of breaking changes if any (empty if none)

Be concise and focus on actionable insights.`

const PR_REVIEW_PROMPT = `You are a thorough code reviewer. Analyze the given PR diff and identify issues, suggestions, and good patterns.
Return a JSON array of review comments, each with:
- file: The filename (or "general" for overall comments)
- line: Line number if applicable (null if general)
- type: One of "issue", "suggestion", "praise", "question"
- message: Clear, actionable feedback
- severity: One of "low", "medium", "high", "critical" (for issues only)

Focus on:
- Code quality and best practices
- Potential bugs or edge cases
- Security concerns
- Performance implications
- Readability and maintainability

Be constructive and specific.`

/**
 * AI Code Review App
 *
 * This plugin adds a new app accessible via the plugin sidebar.
 * It demonstrates using the core AI service for:
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
  permissions: ['git:read', 'notifications', 'network'],

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

  // Settings - no API key needed, uses core AI service
  settings: [
    {
      key: 'autoAnalyze',
      label: 'Auto-analyze new commits',
      description: 'Automatically analyze commits when viewing history',
      type: 'boolean',
      default: false,
    },
    {
      key: 'reviewDepth',
      label: 'Review depth',
      description: 'How thorough should the AI review be',
      type: 'select',
      default: 'standard',
      options: [
        { label: 'Quick (uses fast model)', value: 'quick' },
        { label: 'Standard (balanced)', value: 'standard' },
        { label: 'Deep (uses powerful model)', value: 'deep' },
      ],
    },
  ],

  // Hooks this plugin implements - using core AI service
  hooks: {
    'ai:analyze-commit': async (commit: Commit): Promise<CommitAnalysis> => {
      // AI service has built-in fallback to free OpenRouter models
      try {
        // Build context about the commit
        const commitContext = `
Commit: ${commit.shortHash}
Author: ${commit.author}
Date: ${commit.date}
Message: ${commit.message}
Files changed: ${commit.changedFiles || 'unknown'}
Additions: ${commit.additions ?? 0}
Deletions: ${commit.deletions ?? 0}
`
        // Use the quick model for commit analysis (fast, cheap)
        const response = await window.conveyor.ai.quick(
          [{ role: 'user', content: `Analyze this commit:\n\n${commitContext}` }],
          {
            systemPrompt: COMMIT_ANALYSIS_PROMPT,
            jsonMode: true,
            maxTokens: 500,
          }
        )

        // Parse the JSON response
        const analysis = JSON.parse(response.content) as CommitAnalysis
        return analysis
      } catch (error) {
        console.error('[AI Review] Commit analysis failed:', error)
        // Fallback to heuristic analysis
        return fallbackCommitAnalysis(commit)
      }
    },

    'ai:review-pr': async (pr: PullRequest, diff: string): Promise<PRReviewSuggestion[]> => {
      // AI service has built-in fallback to free OpenRouter models
      try {
        // Truncate diff if too long (avoid token limits)
        const maxDiffLength = 15000
        const truncatedDiff =
          diff.length > maxDiffLength
            ? diff.substring(0, maxDiffLength) + '\n\n... (diff truncated)'
            : diff

        // Use balanced model for PR review (more thorough)
        const response = await window.conveyor.ai.balanced(
          [
            {
              role: 'user',
              content: `Review this PR:\n\nTitle: ${pr.title}\nAuthor: ${pr.author}\n\nDiff:\n${truncatedDiff}`,
            },
          ],
          {
            systemPrompt: PR_REVIEW_PROMPT,
            jsonMode: true,
            maxTokens: 1500,
          }
        )

        // Parse the JSON response
        const suggestions = JSON.parse(response.content) as PRReviewSuggestion[]
        return suggestions
      } catch (error) {
        console.error('[AI Review] PR review failed:', error)
        // Fallback to heuristic review
        return fallbackPRReview(diff)
      }
    },

    'ai:suggest-commit-message': async (diff: string): Promise<string> => {
      // AI service has built-in fallback to free OpenRouter models
      try {
        const response = await window.conveyor.ai.quick(
          [
            {
              role: 'user',
              content: `Generate a conventional commit message for this diff:\n\n${diff.substring(0, 5000)}`,
            },
          ],
          {
            systemPrompt:
              'Generate a single-line conventional commit message (feat/fix/chore/docs/refactor/test). Be concise and specific. Return ONLY the commit message, no explanation.',
            maxTokens: 100,
          }
        )
        return response.content.trim()
      } catch (error) {
        console.error('[AI Review] Commit message suggestion failed:', error)
        return 'chore: update files'
      }
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
        console.log('[AI Review] Analyzing current commit...')
        // In a real implementation, this would get the selected commit
        // and call the ai:analyze-commit hook
      },
    },
    {
      id: 'ledger.ai-review.review-pr',
      name: 'Review Current PR',
      description: 'Run AI review on the currently selected PR',
      handler: async () => {
        console.log('[AI Review] Reviewing current PR...')
        // In a real implementation, this would get the selected PR
        // and call the ai:review-pr hook
      },
    },
    {
      id: 'ledger.ai-review.test-connection',
      name: 'Test AI Connection',
      description: 'Test the AI service connection',
      handler: async () => {
        try {
          // AI service always has free fallback via OpenRouter
          const response = await window.conveyor.ai.quick(
            [{ role: 'user', content: 'Say "AI Review plugin connected!" in exactly those words.' }],
            { maxTokens: 20 }
          )
          console.log('[AI Review] Connection test:', response.content)
          console.log('[AI Review] Using model:', response.model, 'via', response.provider)
        } catch (error) {
          console.error('[AI Review] Connection test failed:', error)
        }
      },
    },
  ],

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('AI Review App activated')

    // Log available AI providers (free fallback always available)
    try {
      const providers = await window.conveyor.ai.getConfiguredProviders()
      if (providers.length > 0) {
        context.logger.info(`AI providers configured: ${providers.join(', ')}`)
      } else {
        context.logger.info('Using free AI models via OpenRouter')
      }
    } catch (error) {
      context.logger.error('Failed to check AI providers:', error)
    }
  },

  async deactivate(): Promise<void> {
    console.log('[AI Review] App deactivated')
  },
}

// Fallback functions when AI is not available
function fallbackCommitAnalysis(commit: Commit): CommitAnalysis {
  const category = detectCategory(commit.message)
  const complexity = detectComplexity(commit)

  return {
    summary: `${commit.message.split('\n')[0]}`,
    category,
    complexity,
    suggestedTests: complexity === 'high' ? ['Consider adding tests for these changes'] : [],
    potentialBugs: [],
    relatedFiles: [],
  }
}

function fallbackPRReview(diff: string): PRReviewSuggestion[] {
  const suggestions: PRReviewSuggestion[] = []

  if (diff.includes('TODO')) {
    suggestions.push({
      file: 'general',
      type: 'issue',
      message: 'TODO comment found in changes - consider addressing before merge',
      severity: 'low',
    })
  }

  if (diff.includes('console.log')) {
    suggestions.push({
      file: 'general',
      type: 'suggestion',
      message: 'console.log statements found - consider removing before merge',
      severity: 'low',
    })
  }

  if (diff.includes('debugger')) {
    suggestions.push({
      file: 'general',
      type: 'issue',
      message: 'debugger statement found - must be removed before merge',
      severity: 'high',
    })
  }

  return suggestions
}

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
