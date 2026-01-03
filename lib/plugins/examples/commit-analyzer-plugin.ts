/**
 * Commit Analyzer Plugin
 *
 * Example plugin demonstrating the plugin system.
 * Provides basic commit analysis and categorization.
 *
 * In a real implementation, this would call an LLM API.
 */

import type { Plugin, CommitAnalysis, PluginContext } from '../plugin-types'
import type { Commit } from '@/app/types/electron'

/**
 * Categorize a commit based on its message
 */
function categorizeCommit(message: string): CommitAnalysis['category'] {
  const lowerMessage = message.toLowerCase()

  if (lowerMessage.startsWith('feat') || lowerMessage.includes('add ') || lowerMessage.includes('implement')) {
    return 'feature'
  }
  if (lowerMessage.startsWith('fix') || lowerMessage.includes('bug') || lowerMessage.includes('issue')) {
    return 'bugfix'
  }
  if (lowerMessage.startsWith('refactor') || lowerMessage.includes('refactor') || lowerMessage.includes('restructure')) {
    return 'refactor'
  }
  if (lowerMessage.startsWith('doc') || lowerMessage.includes('readme') || lowerMessage.includes('comment')) {
    return 'docs'
  }
  if (lowerMessage.startsWith('test') || lowerMessage.includes('test') || lowerMessage.includes('spec')) {
    return 'test'
  }
  if (lowerMessage.startsWith('chore') || lowerMessage.includes('update dep') || lowerMessage.includes('bump')) {
    return 'chore'
  }

  return 'other'
}

/**
 * Estimate commit complexity based on stats
 */
function estimateComplexity(commit: Commit): CommitAnalysis['complexity'] {
  const changes = (commit.additions ?? 0) + (commit.deletions ?? 0)
  const files = commit.filesChanged ?? 0

  if (changes > 500 || files > 20) return 'high'
  if (changes > 100 || files > 5) return 'medium'
  return 'low'
}

/**
 * Generate a summary of the commit
 */
function generateSummary(commit: Commit, category: CommitAnalysis['category']): string {
  const categoryLabels: Record<CommitAnalysis['category'], string> = {
    feature: 'New feature',
    bugfix: 'Bug fix',
    refactor: 'Code refactoring',
    docs: 'Documentation update',
    test: 'Test changes',
    chore: 'Maintenance',
    other: 'Changes',
  }

  const stats = []
  if (commit.filesChanged) stats.push(`${commit.filesChanged} file(s)`)
  if (commit.additions) stats.push(`+${commit.additions}`)
  if (commit.deletions) stats.push(`-${commit.deletions}`)

  const statsStr = stats.length > 0 ? ` (${stats.join(', ')})` : ''

  return `${categoryLabels[category]}${statsStr}: ${commit.message.split('\n')[0]}`
}

export const commitAnalyzerPlugin: Plugin = {
  id: 'commit-analyzer',
  name: 'Commit Analyzer',
  version: '0.1.0',
  type: 'service',
  description: 'Analyzes commits to categorize and summarize changes',
  author: 'Ledger Team',

  hooks: {
    /**
     * Analyze a commit
     */
    'ai:analyze-commit': async (commit: Commit): Promise<CommitAnalysis> => {
      const category = categorizeCommit(commit.message)
      const complexity = estimateComplexity(commit)
      const summary = generateSummary(commit, category)

      // In a real implementation, this would call an LLM for deeper analysis
      return {
        summary,
        category,
        complexity,
        suggestedTests: complexity === 'high' ? ['Integration tests recommended'] : [],
        potentialBugs: [],
        relatedFiles: [],
      }
    },

    /**
     * Log after each commit
     */
    'git:after-commit': async (hash: string): Promise<void> => {
      console.log(`[CommitAnalyzer] New commit created: ${hash.slice(0, 7)}`)
    },

    /**
     * Suggest commit message based on diff
     */
    'ai:suggest-commit-message': async (diff: string): Promise<string> => {
      // Simple heuristic - in production this would use an LLM
      const lines = diff.split('\n')
      const additions = lines.filter((l) => l.startsWith('+')).length
      const deletions = lines.filter((l) => l.startsWith('-')).length

      if (additions > deletions * 2) {
        return 'feat: add new functionality'
      }
      if (deletions > additions * 2) {
        return 'refactor: remove unused code'
      }
      if (additions > 0 && deletions > 0) {
        return 'fix: update implementation'
      }

      return 'chore: update files'
    },
  },

  settings: [
    {
      key: 'autoAnalyze',
      label: 'Auto-analyze commits',
      description: 'Automatically analyze new commits when viewing history',
      type: 'boolean',
      default: true,
    },
    {
      key: 'showBadges',
      label: 'Show commit badges',
      description: 'Display category badges on commits in the list',
      type: 'boolean',
      default: true,
    },
  ],

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Commit Analyzer plugin activated')

    // Load settings
    const autoAnalyze = await context.storage.get<boolean>('autoAnalyze')
    context.logger.debug('Auto-analyze setting:', autoAnalyze ?? true)
  },

  async deactivate(): Promise<void> {
    console.log('[CommitAnalyzer] Plugin deactivated')
  },
}

export default commitAnalyzerPlugin
