/**
 * Team Dashboard App Component
 *
 * Full-screen app for team oversight and analytics.
 * Uses real git data from the plugin context API.
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Users,
  GitPullRequest,
  GitBranch,
  GitCommit,
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Calendar,
  FileText,
  Trash2,
} from 'lucide-react'
import type { PluginAppProps } from '@/lib/plugins/plugin-types'
import type { Commit, PullRequest, Branch } from '@/lib/types'
import { formatRelativeTime } from '@/app/utils/time'
import './example-plugin-styles.css'

interface ContributorStats {
  name: string
  commits: number
  additions: number
  deletions: number
  prsOpen: number
  prsMerged: number
  lastActive: string
  lastActiveDate: Date
}

interface TeamMetrics {
  totalCommits: number
  totalPRs: number
  openPRs: number
  mergedPRs: number
  avgReviewTime: number
  staleBranches: number
  activeContributors: number
  agingPRs: number
}

export function TeamDashboardApp({ context, activeNavItem }: PluginAppProps) {
  const [commits, setCommits] = useState<Commit[]>([])
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('week')

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [commitsData, prsData, branchesData] = await Promise.all([
          context.api.getCommits(),
          context.api.getPullRequests(),
          context.api.getBranches(),
        ])
        // Ensure we always set arrays (API might return null/undefined on error)
        setCommits(Array.isArray(commitsData) ? commitsData : [])
        setPullRequests(Array.isArray(prsData) ? prsData : [])
        setBranches(Array.isArray(branchesData) ? branchesData : [])
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [context.api])

  // Filter commits by time range
  const filteredCommits = useMemo(() => {
    const now = new Date()
    const cutoff = new Date()

    switch (timeRange) {
      case 'week':
        cutoff.setDate(now.getDate() - 7)
        break
      case 'month':
        cutoff.setMonth(now.getMonth() - 1)
        break
      case 'quarter':
        cutoff.setMonth(now.getMonth() - 3)
        break
    }

    return commits.filter((c) => new Date(c.date) >= cutoff)
  }, [commits, timeRange])

  // Calculate contributor stats from real data
  const contributors = useMemo((): ContributorStats[] => {
    const authorMap = new Map<string, ContributorStats>()

    filteredCommits.forEach((commit) => {
      const existing = authorMap.get(commit.author) || {
        name: commit.author,
        commits: 0,
        additions: 0,
        deletions: 0,
        prsOpen: 0,
        prsMerged: 0,
        lastActive: '',
        lastActiveDate: new Date(0),
      }

      existing.commits += 1
      existing.additions += commit.additions || 0
      existing.deletions += commit.deletions || 0

      const commitDate = new Date(commit.date)
      if (commitDate > existing.lastActiveDate) {
        existing.lastActiveDate = commitDate
        existing.lastActive = formatRelativeTime(commitDate)
      }

      authorMap.set(commit.author, existing)
    })

    // Add PR stats
    pullRequests.forEach((pr) => {
      const existing = authorMap.get(pr.author)
      if (existing) {
        if (pr.isDraft === false) {
          existing.prsOpen += 1
        }
      }
    })

    return Array.from(authorMap.values())
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 10)
  }, [filteredCommits, pullRequests])

  // Calculate team metrics from real data
  const metrics = useMemo((): TeamMetrics => {
    const openPRs = pullRequests.filter((pr) => !pr.isDraft).length
    const now = new Date()

    // Calculate stale branches (no commits in 30 days)
    const staleBranches = branches.filter((b) => {
      if (b.isRemote || b.current) return false
      if (!b.lastCommitDate) return true
      const lastCommit = new Date(b.lastCommitDate)
      const daysSinceCommit = (now.getTime() - lastCommit.getTime()) / (1000 * 60 * 60 * 24)
      return daysSinceCommit > 30
    }).length

    // Calculate aging PRs (waiting > 24 hours)
    const agingPRs = pullRequests.filter((pr) => {
      const created = new Date(pr.createdAt)
      const hoursWaiting = (now.getTime() - created.getTime()) / (1000 * 60 * 60)
      return hoursWaiting > 24 && !pr.isDraft
    }).length

    // Calculate average review time (estimate based on PR age)
    let avgReviewTime = 0
    if (pullRequests.length > 0) {
      const totalHours = pullRequests.reduce((sum, pr) => {
        const created = new Date(pr.createdAt)
        return sum + (now.getTime() - created.getTime()) / (1000 * 60 * 60)
      }, 0)
      avgReviewTime = Math.round((totalHours / pullRequests.length) * 10) / 10
    }

    return {
      totalCommits: filteredCommits.length,
      totalPRs: pullRequests.length,
      openPRs,
      mergedPRs: pullRequests.length - openPRs,
      avgReviewTime,
      staleBranches,
      activeContributors: contributors.length,
      agingPRs,
    }
  }, [filteredCommits, pullRequests, branches, contributors])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const [commitsData, prsData, branchesData] = await Promise.all([
        context.api.refreshCommits?.() || context.api.getCommits(),
        context.api.refreshPullRequests?.() || context.api.getPullRequests(),
        context.api.refreshBranches?.() || context.api.getBranches(),
      ])
      // Ensure we always set arrays (API might return null/undefined on error)
      setCommits(Array.isArray(commitsData) ? commitsData : [])
      setPullRequests(Array.isArray(prsData) ? prsData : [])
      setBranches(Array.isArray(branchesData) ? branchesData : [])
    } catch (error) {
      console.error('Failed to refresh:', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [context.api])

  // Render based on active nav item
  const renderContent = () => {
    if (loading) {
      return (
        <div className="dashboard-loading">
          <RefreshCw size={32} className="spinning" />
          <span>Loading dashboard data...</span>
        </div>
      )
    }

    switch (activeNavItem) {
      case 'activity':
        return <ActivityView commits={filteredCommits} />
      case 'reviews':
        return <ReviewsView pullRequests={pullRequests} />
      case 'contributors':
        return <ContributorsView contributors={contributors} />
      case 'branches':
        return <BranchesView branches={branches} />
      default:
        return <OverviewView metrics={metrics} contributors={contributors} />
    }
  }

  return (
    <div className="team-dashboard">
      {/* Header */}
      <div className="team-dashboard-header">
        <div className="team-dashboard-header-left">
          <h1 className="team-dashboard-title">Team Dashboard</h1>
          <div className="team-dashboard-time-range">
            {(['week', 'month', 'quarter'] as const).map((range) => (
              <button
                key={range}
                className={`time-range-button ${timeRange === range ? 'active' : ''}`}
                onClick={() => setTimeRange(range)}
              >
                {range === 'week' ? 'This Week' : range === 'month' ? 'This Month' : 'This Quarter'}
              </button>
            ))}
          </div>
        </div>
        <button
          className="team-dashboard-refresh"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw size={16} className={isRefreshing ? 'spinning' : ''} />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div className="team-dashboard-content">{renderContent()}</div>
    </div>
  )
}

/**
 * Overview section with key metrics
 */
function OverviewView({
  metrics,
  contributors,
}: {
  metrics: TeamMetrics
  contributors: ContributorStats[]
}) {
  return (
    <div className="dashboard-overview">
      {/* Metric Cards */}
      <div className="metrics-grid">
        <MetricCard
          icon={<Activity size={20} />}
          label="Commits"
          value={metrics.totalCommits}
          trend={metrics.totalCommits > 0 ? Math.round(metrics.totalCommits / 7) : 0}
          color="blue"
        />
        <MetricCard
          icon={<GitPullRequest size={20} />}
          label="Open PRs"
          value={metrics.openPRs}
          trend={0}
          color="purple"
        />
        <MetricCard
          icon={<Clock size={20} />}
          label="Avg PR Age"
          value={metrics.avgReviewTime > 0 ? `${Math.round(metrics.avgReviewTime)}h` : 'N/A'}
          trend={0}
          color="green"
        />
        <MetricCard
          icon={<Users size={20} />}
          label="Contributors"
          value={metrics.activeContributors}
          trend={0}
          color="orange"
        />
      </div>

      {/* Two Column Layout */}
      <div className="dashboard-columns">
        {/* Top Contributors */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3>Top Contributors</h3>
            <span className="dashboard-card-subtitle">By commits this period</span>
          </div>
          {contributors.length === 0 ? (
            <div className="dashboard-empty">
              <Users size={24} />
              <span>No contributors found</span>
            </div>
          ) : (
            <div className="contributor-list">
              {contributors.slice(0, 5).map((contributor, index) => (
                <div key={contributor.name} className="contributor-row">
                  <span className="contributor-rank">#{index + 1}</span>
                  <div className="contributor-avatar">{contributor.name.charAt(0)}</div>
                  <div className="contributor-info">
                    <span className="contributor-name">{contributor.name}</span>
                    <span className="contributor-activity">{contributor.lastActive}</span>
                  </div>
                  <div className="contributor-stats">
                    <span className="stat-commits">{contributor.commits} commits</span>
                    <span className="stat-diff">
                      <span className="diff-add">+{contributor.additions}</span>
                      <span className="diff-del">-{contributor.deletions}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PR Status */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3>Pull Request Status</h3>
            <span className="dashboard-card-subtitle">Current state</span>
          </div>

          {metrics.totalPRs === 0 ? (
            <div className="dashboard-empty">
              <GitPullRequest size={24} />
              <span>No pull requests found</span>
            </div>
          ) : (
            <>
              <div className="pr-status-chart">
                <div className="pr-status-bar">
                  <div
                    className="pr-bar-segment merged"
                    style={{ width: `${(metrics.mergedPRs / metrics.totalPRs) * 100}%` }}
                  />
                  <div
                    className="pr-bar-segment open"
                    style={{ width: `${(metrics.openPRs / metrics.totalPRs) * 100}%` }}
                  />
                </div>
                <div className="pr-status-legend">
                  <div className="legend-item">
                    <span className="legend-dot merged" />
                    <span>Merged ({metrics.mergedPRs})</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot open" />
                    <span>Open ({metrics.openPRs})</span>
                  </div>
                </div>
              </div>

              {/* Attention Items */}
              <div className="attention-section">
                <h4>Needs Attention</h4>
                {metrics.staleBranches > 0 && (
                  <div className="attention-item warning">
                    <AlertCircle size={14} />
                    <span>{metrics.staleBranches} stale branches need cleanup</span>
                  </div>
                )}
                {metrics.agingPRs > 0 && (
                  <div className="attention-item info">
                    <Clock size={14} />
                    <span>{metrics.agingPRs} PRs waiting &gt; 24 hours for review</span>
                  </div>
                )}
                {metrics.staleBranches === 0 && metrics.agingPRs === 0 && (
                  <div className="attention-item success">
                    <CheckCircle size={14} />
                    <span>Everything looks good!</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Metric card component
 */
function MetricCard({
  icon,
  label,
  value,
  trend,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  trend: number
  color: 'blue' | 'purple' | 'green' | 'orange'
}) {
  const isPositiveTrend = trend > 0
  const colorVar = `var(--color-${color})`

  return (
    <div className="metric-card">
      <div className="metric-icon" style={{ color: colorVar }}>
        {icon}
      </div>
      <div className="metric-content">
        <span className="metric-value">{value}</span>
        <span className="metric-label">{label}</span>
      </div>
      {trend !== 0 && (
        <div className={`metric-trend ${isPositiveTrend ? 'up' : 'down'}`}>
          {isPositiveTrend ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          <span>{Math.abs(trend)}/day</span>
        </div>
      )}
    </div>
  )
}

/**
 * Activity view with commit timeline
 */
function ActivityView({ commits }: { commits: Commit[] }) {
  // Group commits by day
  const groupedCommits = useMemo(() => {
    const groups = new Map<string, Commit[]>()

    commits.forEach((commit) => {
      const date = new Date(commit.date).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
      const existing = groups.get(date) || []
      existing.push(commit)
      groups.set(date, existing)
    })

    return Array.from(groups.entries()).slice(0, 7) // Last 7 days with activity
  }, [commits])

  if (commits.length === 0) {
    return (
      <div className="dashboard-section">
        <h2>Recent Activity</h2>
        <div className="dashboard-empty-large">
          <Activity size={48} />
          <h3>No recent activity</h3>
          <p>Commits will appear here as they're made</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-section">
      <h2>Recent Activity</h2>
      <p className="section-subtitle">{commits.length} commits in this period</p>

      <div className="activity-timeline">
        {groupedCommits.map(([date, dayCommits]) => (
          <div key={date} className="activity-day-group">
            <div className="activity-day-header">
              <Calendar size={14} />
              <span>{date}</span>
              <span className="activity-day-count">{dayCommits.length} commits</span>
            </div>
            <div className="activity-day-commits">
              {dayCommits.slice(0, 10).map((commit) => (
                <div key={commit.hash} className="activity-commit-item">
                  <div className="activity-avatar">{commit.author.charAt(0)}</div>
                  <div className="activity-content">
                    <div className="activity-commit-header">
                      <span className="activity-commit-hash">{commit.shortHash}</span>
                      <strong>{commit.author}</strong>
                    </div>
                    <span className="activity-commit-message">
                      {commit.message.split('\n')[0]}
                    </span>
                    {(commit.filesChanged || 0) > 0 && (
                      <span className="activity-commit-stats">
                        <FileText size={12} />
                        {commit.filesChanged} files
                        {commit.additions ? ` +${commit.additions}` : ''}
                        {commit.deletions ? ` -${commit.deletions}` : ''}
                      </span>
                    )}
                  </div>
                  <span className="activity-time">
                    {new Date(commit.date).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
              {dayCommits.length > 10 && (
                <div className="activity-more">+{dayCommits.length - 10} more commits</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Reviews view with PR list grouped by status
 */
function ReviewsView({ pullRequests }: { pullRequests: PullRequest[] }) {
  const groupedPRs = useMemo(() => {
    const needsReview = pullRequests.filter(
      (pr) => !pr.isDraft && pr.reviewDecision !== 'APPROVED' && pr.reviewDecision !== 'CHANGES_REQUESTED'
    )
    const changesRequested = pullRequests.filter((pr) => pr.reviewDecision === 'CHANGES_REQUESTED')
    const approved = pullRequests.filter((pr) => pr.reviewDecision === 'APPROVED')
    const drafts = pullRequests.filter((pr) => pr.isDraft)

    return { needsReview, changesRequested, approved, drafts }
  }, [pullRequests])

  if (pullRequests.length === 0) {
    return (
      <div className="dashboard-section">
        <h2>Review Queue</h2>
        <div className="dashboard-empty-large">
          <GitPullRequest size={48} />
          <h3>No pull requests</h3>
          <p>Pull requests will appear here when they're created</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-section">
      <h2>Review Queue</h2>
      <p className="section-subtitle">{pullRequests.length} total pull requests</p>

      <div className="reviews-groups">
        {groupedPRs.needsReview.length > 0 && (
          <PRGroup title="Needs Review" prs={groupedPRs.needsReview} color="yellow" />
        )}
        {groupedPRs.changesRequested.length > 0 && (
          <PRGroup title="Changes Requested" prs={groupedPRs.changesRequested} color="red" />
        )}
        {groupedPRs.approved.length > 0 && (
          <PRGroup title="Approved" prs={groupedPRs.approved} color="green" />
        )}
        {groupedPRs.drafts.length > 0 && (
          <PRGroup title="Drafts" prs={groupedPRs.drafts} color="gray" />
        )}
      </div>
    </div>
  )
}

function PRGroup({
  title,
  prs,
  color,
}: {
  title: string
  prs: PullRequest[]
  color: string
}) {
  return (
    <div className="reviews-group">
      <div className="reviews-group-header">
        <span className="reviews-group-dot" style={{ background: `var(--color-${color})` }} />
        <h3>{title}</h3>
        <span className="reviews-group-count">{prs.length}</span>
      </div>
      <div className="reviews-list">
        {prs.map((pr) => {
          const waitTime = getWaitTime(pr.createdAt)
          return (
            <div key={pr.number} className="review-item">
              <div className="review-item-header">
                <span className="review-item-number">#{pr.number}</span>
                <span className="review-item-title">{pr.title}</span>
              </div>
              <div className="review-item-meta">
                <span className="review-item-author">{pr.author}</span>
                <span className="review-item-branch">{pr.branch}</span>
                <span className="review-item-wait">
                  <Clock size={12} />
                  {waitTime}
                </span>
              </div>
              <div className="review-item-stats">
                <span className="diff-add">+{pr.additions}</span>
                <span className="diff-del">-{pr.deletions}</span>
                {pr.comments > 0 && <span className="review-comments">{pr.comments} comments</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Contributors view with full stats table
 */
function ContributorsView({ contributors }: { contributors: ContributorStats[] }) {
  if (contributors.length === 0) {
    return (
      <div className="dashboard-section">
        <h2>Contributors</h2>
        <div className="dashboard-empty-large">
          <Users size={48} />
          <h3>No contributors found</h3>
          <p>Contributors will appear as commits are made</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-section">
      <h2>Contributors</h2>
      <p className="section-subtitle">{contributors.length} contributors this period</p>

      <div className="contributors-table">
        <div className="contributors-header">
          <span>Contributor</span>
          <span>Commits</span>
          <span>Lines Added</span>
          <span>Lines Deleted</span>
          <span>Last Active</span>
        </div>
        {contributors.map((contributor, index) => (
          <div key={contributor.name} className="contributors-row">
            <div className="contributor-cell-name">
              <span className="contributor-rank">#{index + 1}</span>
              <div className="contributor-avatar">{contributor.name.charAt(0)}</div>
              <span>{contributor.name}</span>
            </div>
            <span className="contributor-cell">{contributor.commits}</span>
            <span className="contributor-cell diff-add">+{contributor.additions}</span>
            <span className="contributor-cell diff-del">-{contributor.deletions}</span>
            <span className="contributor-cell contributor-activity">{contributor.lastActive}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Branches view with health indicators
 */
function BranchesView({ branches }: { branches: Branch[] }) {
  const sortedBranches = useMemo(() => {
    const now = new Date()

    return branches
      .filter((b) => !b.isRemote)
      .map((branch) => {
        const lastCommit = branch.lastCommitDate ? new Date(branch.lastCommitDate) : null
        const daysSinceCommit = lastCommit
          ? (now.getTime() - lastCommit.getTime()) / (1000 * 60 * 60 * 24)
          : Infinity

        let status: 'active' | 'recent' | 'stale' = 'stale'
        if (daysSinceCommit < 7) status = 'active'
        else if (daysSinceCommit < 30) status = 'recent'

        return { ...branch, daysSinceCommit, status }
      })
      .sort((a, b) => a.daysSinceCommit - b.daysSinceCommit)
  }, [branches])

  const staleBranches = sortedBranches.filter((b) => b.status === 'stale')

  if (branches.length === 0) {
    return (
      <div className="dashboard-section">
        <h2>Branch Health</h2>
        <div className="dashboard-empty-large">
          <GitBranch size={48} />
          <h3>No branches found</h3>
          <p>Branches will appear here as they're created</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-section">
      <h2>Branch Health</h2>
      <p className="section-subtitle">
        {sortedBranches.length} local branches • {staleBranches.length} stale
      </p>

      <div className="branches-list">
        {sortedBranches.map((branch) => (
          <div key={branch.name} className={`branch-item branch-${branch.status}`}>
            <div className="branch-item-header">
              <GitBranch size={14} />
              <span className="branch-name">{branch.name}</span>
              {branch.current && <span className="branch-current-badge">current</span>}
              <span className={`branch-status-badge ${branch.status}`}>
                {branch.status}
              </span>
            </div>
            <div className="branch-item-meta">
              <span className="branch-commit">{branch.commit?.substring(0, 7)}</span>
              {branch.commitCount && (
                <span className="branch-commits">
                  <GitCommit size={12} />
                  {branch.commitCount} commits
                </span>
              )}
              {branch.lastCommitDate && (
                <span className="branch-last-commit">
                  <Clock size={12} />
                  {formatRelativeTime(branch.lastCommitDate)}
                </span>
              )}
            </div>
            {branch.status === 'stale' && !branch.current && (
              <div className="branch-stale-warning">
                <AlertCircle size={12} />
                <span>No activity for {Math.round(branch.daysSinceCommit)} days</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function getWaitTime(createdAt: string): string {
  const created = new Date(createdAt)
  const now = new Date()
  const hours = Math.floor((now.getTime() - created.getTime()) / 3600000)

  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export default TeamDashboardApp
