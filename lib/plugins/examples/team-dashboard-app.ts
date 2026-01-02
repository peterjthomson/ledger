/**
 * Team Dashboard App Plugin
 *
 * Full-screen app for managers to monitor team activity,
 * PR review status, contributor statistics, and branch health.
 */

import type { AppPlugin, PluginContext, Branch, Commit, PullRequest } from '../plugin-types'

/**
 * Contributor statistics
 */
interface ContributorStats {
  name: string
  email: string
  commits: number
  additions: number
  deletions: number
  activeBranches: number
  openPRs: number
  lastActive: string
}

/**
 * Team activity summary
 */
interface TeamSummary {
  totalCommits: number
  totalPRs: number
  openPRs: number
  mergedPRs: number
  staleBranches: number
  activeContributors: number
  reviewsNeeded: number
}

/**
 * Team Dashboard App
 *
 * Provides managers with:
 * - Real-time team activity overview
 * - PR review queue with aging
 * - Contributor leaderboard
 * - Branch health monitoring
 * - Weekly/monthly reports
 */
export const teamDashboardPlugin: AppPlugin = {
  id: 'ledger.team-dashboard',
  name: 'Team Dashboard',
  version: '1.0.0',
  type: 'app',
  description: 'Monitor team activity, PR status, and contributor statistics',
  author: 'Ledger Team',
  homepage: 'https://github.com/ledger/plugins/team-dashboard',
  permissions: ['git:read', 'notifications', 'storage'],

  // Sidebar configuration
  icon: 'users',
  iconTooltip: 'Team Dashboard',
  iconOrder: 5,

  // Component to render
  component: 'TeamDashboardApp',

  // Sub-navigation
  navigation: [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { id: 'activity', label: 'Activity', icon: 'activity' },
    { id: 'reviews', label: 'Reviews', icon: 'git-pull-request' },
    { id: 'contributors', label: 'Contributors', icon: 'users' },
    { id: 'branches', label: 'Branches', icon: 'git-branch' },
  ],

  // Settings
  settings: [
    {
      key: 'staleBranchDays',
      label: 'Stale branch threshold (days)',
      description: 'Mark branches as stale after this many days of inactivity',
      type: 'number',
      default: 14,
      validation: { min: 1, max: 90 },
    },
    {
      key: 'prAgingWarning',
      label: 'PR aging warning (hours)',
      description: 'Highlight PRs waiting for review longer than this',
      type: 'number',
      default: 24,
      validation: { min: 1, max: 168 },
    },
    {
      key: 'excludeBots',
      label: 'Exclude bots from stats',
      description: 'Filter out bot accounts from contributor statistics',
      type: 'boolean',
      default: true,
    },
    {
      key: 'weekStartDay',
      label: 'Week starts on',
      type: 'select',
      default: 'monday',
      options: [
        { label: 'Sunday', value: 'sunday' },
        { label: 'Monday', value: 'monday' },
      ],
    },
  ],

  // Commands
  commands: [
    {
      id: 'ledger.team-dashboard.refresh',
      name: 'Refresh Dashboard',
      description: 'Reload all team statistics',
      shortcut: 'Cmd+Shift+D',
      handler: async () => {
        console.log('[Team Dashboard] Refreshing data...')
      },
    },
    {
      id: 'ledger.team-dashboard.export',
      name: 'Export Report',
      description: 'Export team statistics as CSV',
      handler: async () => {
        console.log('[Team Dashboard] Exporting report...')
      },
    },
  ],

  // Hooks
  hooks: {
    'git:after-commit': async (hash: string) => {
      console.log(`[Team Dashboard] New commit: ${hash}`)
      // Could update real-time activity feed
    },
  },

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Team Dashboard activated')

    // Load saved preferences
    const staleDays = await context.storage.get<number>('staleBranchDays')
    context.logger.debug('Stale branch threshold:', staleDays ?? 14, 'days')

    // Initialize dashboard data
    await initializeDashboard(context)
  },

  async deactivate(): Promise<void> {
    console.log('[Team Dashboard] Deactivated')
  },
}

/**
 * Initialize dashboard with current repo data
 */
async function initializeDashboard(context: PluginContext): Promise<void> {
  const repoPath = context.api.getRepoPath()
  if (!repoPath) {
    context.logger.warn('No repository open')
    return
  }

  // Cache initial data - fetch fresh data from backend
  const [branches, commits] = await Promise.all([
    context.api.getBranches(),
    context.api.getCommits(100),
  ])

  context.logger.info(`Loaded ${branches.length} branches, ${commits.length} commits`)

  // Calculate initial stats
  const stats = calculateTeamStats(branches, commits)
  await context.storage.set('cachedStats', stats)
}

/**
 * Calculate team statistics from branches and commits
 */
function calculateTeamStats(branches: Branch[], commits: Commit[]): TeamSummary {
  const now = new Date()
  const staleDays = 14

  // Count stale branches (no activity in staleDays)
  const staleBranches = branches.filter((b) => {
    if (!b.lastCommitDate) return false
    const lastCommit = new Date(b.lastCommitDate)
    const daysSince = (now.getTime() - lastCommit.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince > staleDays
  }).length

  // Count unique contributors
  const contributors = new Set(commits.map((c) => c.author))

  return {
    totalCommits: commits.length,
    totalPRs: 0, // Would need PR data
    openPRs: 0,
    mergedPRs: 0,
    staleBranches,
    activeContributors: contributors.size,
    reviewsNeeded: 0,
  }
}

/**
 * Calculate contributor statistics
 */
function calculateContributorStats(commits: Commit[]): ContributorStats[] {
  const statsMap = new Map<string, ContributorStats>()

  for (const commit of commits) {
    const existing = statsMap.get(commit.author) || {
      name: commit.author,
      email: '',
      commits: 0,
      additions: commit.additions ?? 0,
      deletions: commit.deletions ?? 0,
      activeBranches: 0,
      openPRs: 0,
      lastActive: commit.date,
    }

    existing.commits++
    existing.additions += commit.additions ?? 0
    existing.deletions += commit.deletions ?? 0

    if (new Date(commit.date) > new Date(existing.lastActive)) {
      existing.lastActive = commit.date
    }

    statsMap.set(commit.author, existing)
  }

  return Array.from(statsMap.values()).sort((a, b) => b.commits - a.commits)
}

export default teamDashboardPlugin
