/**
 * AI Code Review App Component
 *
 * Full-screen app for AI-powered code review and analysis.
 * Uses real data from context.api for commits and PRs.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Sparkles,
  GitCommit,
  GitPullRequest,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Info,
  Code,
  FileText,
  Clock,
  TrendingUp,
  Users,
  AlertCircle,
  ChevronRight,
  Copy,
  ExternalLink,
} from 'lucide-react'
import type { PluginAppProps, CommitAnalysis } from '@/lib/plugins/plugin-types'
import type { Commit, PullRequest } from '@/app/types/electron'
import './example-plugin-styles.css'

// Types for analyzed data
interface AnalyzedCommit extends Commit {
  analysis: CommitAnalysis
}

interface PRWithAnalysis extends PullRequest {
  suggestions: string[]
  riskLevel: 'low' | 'medium' | 'high'
}

interface InsightMetrics {
  totalCommits: number
  avgCommitsPerDay: number
  topContributors: { name: string; count: number }[]
  commitsByCategory: Record<string, number>
  avgPRReviewTime: number
  openPRs: number
  mergedPRs: number
}

export function AIReviewApp({ context, repoPath, activeNavItem, onNavigate }: PluginAppProps) {
  const [commits, setCommits] = useState<Commit[]>([])
  const [prs, setPRs] = useState<PullRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<AnalyzedCommit | null>(null)

  // Load data on mount and when repo changes
  useEffect(() => {
    if (!repoPath) return
    loadData()
  }, [repoPath])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [commitsData, prsData] = await Promise.all([
        context.api.getCommits(50),
        context.api.getPullRequests(),
      ])
      // Ensure we always set arrays (API might return null/undefined on error)
      setCommits(Array.isArray(commitsData) ? commitsData : [])
      setPRs(Array.isArray(prsData) ? prsData : [])
    } catch (error) {
      context.logger.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadData()
    setIsRefreshing(false)
  }

  // Analyze commits with AI heuristics
  const analyzedCommits = useMemo((): AnalyzedCommit[] => {
    return commits.map((commit) => ({
      ...commit,
      analysis: analyzeCommit(commit),
    }))
  }, [commits])

  // Analyze PRs
  const analyzedPRs = useMemo((): PRWithAnalysis[] => {
    return prs.map((pr) => ({
      ...pr,
      suggestions: analyzePR(pr),
      riskLevel: getPRRiskLevel(pr),
    }))
  }, [prs])

  // Calculate insights
  const insights = useMemo((): InsightMetrics => {
    const contributorCounts = new Map<string, number>()
    const categoryCounts: Record<string, number> = {}

    analyzedCommits.forEach((c) => {
      // Count by contributor
      contributorCounts.set(c.author, (contributorCounts.get(c.author) || 0) + 1)
      // Count by category
      const cat = c.analysis.category
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    })

    const topContributors = Array.from(contributorCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Calculate avg commits per day (based on first and last commit dates)
    let avgCommitsPerDay = 0
    if (commits.length > 1) {
      const firstDate = new Date(commits[commits.length - 1].date)
      const lastDate = new Date(commits[0].date)
      const days = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
      avgCommitsPerDay = Math.round((commits.length / days) * 10) / 10
    }

    // Calculate PR metrics
    const openPRs = prs.filter((p) => !p.isDraft).length
    const mergedPRs = prs.filter((p) => p.reviewDecision === 'APPROVED').length

    // Avg review time (mock calculation based on PR age)
    const avgPRReviewTime = prs.length > 0
      ? Math.round(prs.reduce((sum, pr) => {
          const age = (Date.now() - new Date(pr.createdAt).getTime()) / (1000 * 60 * 60)
          return sum + age
        }, 0) / prs.length)
      : 0

    return {
      totalCommits: commits.length,
      avgCommitsPerDay,
      topContributors,
      commitsByCategory: categoryCounts,
      avgPRReviewTime,
      openPRs,
      mergedPRs,
    }
  }, [analyzedCommits, commits, prs])

  // Render content based on active nav
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="ai-review-loading">
          <RefreshCw className="spinning" size={24} />
          <span>Loading repository data...</span>
        </div>
      )
    }

    if (!repoPath) {
      return (
        <div className="ai-review-empty">
          <Sparkles size={48} />
          <h3>No Repository Selected</h3>
          <p>Open a repository to start analyzing code with AI</p>
        </div>
      )
    }

    switch (activeNavItem) {
      case 'prs':
        return <PRsView prs={analyzedPRs} />
      case 'insights':
        return <InsightsView insights={insights} />
      default:
        return (
          <CommitsView
            commits={analyzedCommits}
            selectedCommit={selectedCommit}
            onSelectCommit={setSelectedCommit}
          />
        )
    }
  }

  return (
    <div className="ai-review-app">
      {/* Header */}
      <div className="ai-review-header">
        <div className="ai-review-header-left">
          <Sparkles size={24} className="ai-review-icon" />
          <h1 className="ai-review-title">AI Code Review</h1>
        </div>
        <button
          className="ai-review-refresh-btn"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw size={16} className={isRefreshing ? 'spinning' : ''} />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div className="ai-review-content">{renderContent()}</div>
    </div>
  )
}

// ============================================================================
// Commits View
// ============================================================================

interface CommitsViewProps {
  commits: AnalyzedCommit[]
  selectedCommit: AnalyzedCommit | null
  onSelectCommit: (commit: AnalyzedCommit | null) => void
}

function CommitsView({ commits, selectedCommit, onSelectCommit }: CommitsViewProps) {
  return (
    <div className="ai-review-commits">
      <div className="ai-review-commits-list">
        <div className="ai-review-section-header">
          <GitCommit size={18} />
          <span>Recent Commits ({commits.length})</span>
        </div>

        {commits.map((commit) => (
          <div
            key={commit.hash}
            className={`ai-review-commit-item ${selectedCommit?.hash === commit.hash ? 'selected' : ''}`}
            onClick={() => onSelectCommit(commit)}
          >
            <div className="ai-review-commit-header">
              <span className="ai-review-commit-hash">{commit.shortHash}</span>
              <span className={`ai-review-category ${commit.analysis.category}`}>
                {commit.analysis.category}
              </span>
              <span className={`ai-review-complexity ${commit.analysis.complexity}`}>
                {commit.analysis.complexity}
              </span>
            </div>
            <div className="ai-review-commit-message">{commit.message.split('\n')[0]}</div>
            <div className="ai-review-commit-meta">
              <span className="ai-review-commit-author">{commit.author}</span>
              <span className="ai-review-commit-date">
                {new Date(commit.date).toLocaleDateString()}
              </span>
              {commit.additions !== undefined && (
                <span className="ai-review-commit-stats">
                  <span className="additions">+{commit.additions}</span>
                  <span className="deletions">-{commit.deletions}</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Detail Panel */}
      {selectedCommit && (
        <div className="ai-review-commit-detail">
          <div className="ai-review-detail-header">
            <h3>Commit Analysis</h3>
            <button onClick={() => onSelectCommit(null)}>×</button>
          </div>

          <div className="ai-review-detail-content">
            <div className="ai-review-detail-section">
              <h4>Summary</h4>
              <p>{selectedCommit.analysis.summary}</p>
            </div>

            <div className="ai-review-detail-grid">
              <div className="ai-review-detail-item">
                <span className="label">Category</span>
                <span className={`value category ${selectedCommit.analysis.category}`}>
                  {selectedCommit.analysis.category}
                </span>
              </div>
              <div className="ai-review-detail-item">
                <span className="label">Complexity</span>
                <span className={`value complexity ${selectedCommit.analysis.complexity}`}>
                  {selectedCommit.analysis.complexity}
                </span>
              </div>
            </div>

            {selectedCommit.analysis.suggestedTests && selectedCommit.analysis.suggestedTests.length > 0 && (
              <div className="ai-review-detail-section">
                <h4>Suggested Tests</h4>
                <ul>
                  {selectedCommit.analysis.suggestedTests.map((test, i) => (
                    <li key={i}>{test}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedCommit.analysis.potentialBugs && selectedCommit.analysis.potentialBugs.length > 0 && (
              <div className="ai-review-detail-section warning">
                <h4><AlertTriangle size={16} /> Potential Issues</h4>
                <ul>
                  {selectedCommit.analysis.potentialBugs.map((bug, i) => (
                    <li key={i}>{bug}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// PRs View
// ============================================================================

interface PRsViewProps {
  prs: PRWithAnalysis[]
}

function PRsView({ prs }: PRsViewProps) {
  if (prs.length === 0) {
    return (
      <div className="ai-review-empty">
        <GitPullRequest size={48} />
        <h3>No Pull Requests</h3>
        <p>No open pull requests found in this repository</p>
      </div>
    )
  }

  return (
    <div className="ai-review-prs">
      <div className="ai-review-section-header">
        <GitPullRequest size={18} />
        <span>Pull Requests ({prs.length})</span>
      </div>

      <div className="ai-review-prs-list">
        {prs.map((pr) => (
          <div key={pr.number} className={`ai-review-pr-item risk-${pr.riskLevel}`}>
            <div className="ai-review-pr-header">
              <span className="ai-review-pr-number">#{pr.number}</span>
              <span className={`ai-review-pr-risk ${pr.riskLevel}`}>
                {pr.riskLevel} risk
              </span>
              {pr.isDraft && <span className="ai-review-pr-draft">Draft</span>}
            </div>

            <h4 className="ai-review-pr-title">{pr.title}</h4>

            <div className="ai-review-pr-meta">
              <span className="author">{pr.author}</span>
              <span className="branch">{pr.branch} → {pr.baseBranch}</span>
              <span className="stats">
                <span className="additions">+{pr.additions}</span>
                <span className="deletions">-{pr.deletions}</span>
              </span>
            </div>

            {pr.suggestions.length > 0 && (
              <div className="ai-review-pr-suggestions">
                <h5>AI Suggestions:</h5>
                <ul>
                  {pr.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="ai-review-pr-status">
              {pr.reviewDecision === 'APPROVED' && (
                <span className="approved"><CheckCircle size={14} /> Approved</span>
              )}
              {pr.reviewDecision === 'CHANGES_REQUESTED' && (
                <span className="changes"><AlertTriangle size={14} /> Changes Requested</span>
              )}
              {pr.reviewDecision === 'REVIEW_REQUIRED' && (
                <span className="pending"><Clock size={14} /> Review Required</span>
              )}
              {pr.comments > 0 && (
                <span className="comments">{pr.comments} comments</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Insights View
// ============================================================================

interface InsightsViewProps {
  insights: InsightMetrics
}

function InsightsView({ insights }: InsightsViewProps) {
  const categoryColors: Record<string, string> = {
    feature: 'var(--color-green)',
    bugfix: 'var(--color-red)',
    refactor: 'var(--color-blue)',
    docs: 'var(--color-purple)',
    test: 'var(--color-yellow)',
    chore: 'var(--color-gray)',
    other: 'var(--color-gray)',
  }

  return (
    <div className="ai-review-insights">
      <div className="ai-review-section-header">
        <BarChart3 size={18} />
        <span>Repository Insights</span>
      </div>

      {/* Metrics Cards */}
      <div className="ai-review-metrics-grid">
        <div className="ai-review-metric-card">
          <div className="metric-icon"><GitCommit size={20} /></div>
          <div className="metric-value">{insights.totalCommits}</div>
          <div className="metric-label">Total Commits</div>
        </div>
        <div className="ai-review-metric-card">
          <div className="metric-icon"><TrendingUp size={20} /></div>
          <div className="metric-value">{insights.avgCommitsPerDay}</div>
          <div className="metric-label">Commits/Day</div>
        </div>
        <div className="ai-review-metric-card">
          <div className="metric-icon"><GitPullRequest size={20} /></div>
          <div className="metric-value">{insights.openPRs}</div>
          <div className="metric-label">Open PRs</div>
        </div>
        <div className="ai-review-metric-card">
          <div className="metric-icon"><Clock size={20} /></div>
          <div className="metric-value">{insights.avgPRReviewTime}h</div>
          <div className="metric-label">Avg Review Time</div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="ai-review-insights-columns">
        {/* Top Contributors */}
        <div className="ai-review-insights-section">
          <h4><Users size={16} /> Top Contributors</h4>
          <div className="ai-review-contributors-list">
            {insights.topContributors.map((c, i) => (
              <div key={c.name} className="ai-review-contributor">
                <span className="rank">#{i + 1}</span>
                <span className="name">{c.name}</span>
                <span className="count">{c.count} commits</span>
              </div>
            ))}
          </div>
        </div>

        {/* Commits by Category */}
        <div className="ai-review-insights-section">
          <h4><Code size={16} /> Commits by Category</h4>
          <div className="ai-review-categories">
            {Object.entries(insights.commitsByCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([category, count]) => (
                <div key={category} className="ai-review-category-bar">
                  <span className="category-name">{category}</span>
                  <div className="category-bar-wrapper">
                    <div
                      className="category-bar-fill"
                      style={{
                        width: `${(count / insights.totalCommits) * 100}%`,
                        backgroundColor: categoryColors[category] || 'var(--color-gray)',
                      }}
                    />
                  </div>
                  <span className="category-count">{count}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

function analyzeCommit(commit: Commit): CommitAnalysis {
  const message = commit.message.toLowerCase()
  const changes = (commit.additions ?? 0) + (commit.deletions ?? 0)

  // Detect category from conventional commits
  let category: CommitAnalysis['category'] = 'other'
  if (message.startsWith('feat')) category = 'feature'
  else if (message.startsWith('fix')) category = 'bugfix'
  else if (message.startsWith('refactor')) category = 'refactor'
  else if (message.startsWith('docs')) category = 'docs'
  else if (message.startsWith('test')) category = 'test'
  else if (message.startsWith('chore')) category = 'chore'
  else if (message.includes('breaking')) category = 'breaking'

  // Detect complexity
  let complexity: CommitAnalysis['complexity'] = 'low'
  if (changes > 500) complexity = 'high'
  else if (changes > 100) complexity = 'medium'

  // Generate suggestions
  const suggestedTests: string[] = []
  const potentialBugs: string[] = []

  if (complexity === 'high') {
    suggestedTests.push('Add integration tests for large changes')
  }
  if (category === 'feature') {
    suggestedTests.push('Add unit tests for new functionality')
  }
  if (message.includes('todo') || message.includes('fixme')) {
    potentialBugs.push('Contains TODO/FIXME comments')
  }
  if (message.includes('hack') || message.includes('workaround')) {
    potentialBugs.push('Contains temporary workaround')
  }

  return {
    summary: `${category.charAt(0).toUpperCase() + category.slice(1)} commit: ${commit.message.split('\n')[0]}`,
    category,
    complexity,
    suggestedTests,
    potentialBugs,
  }
}

function analyzePR(pr: PullRequest): string[] {
  const suggestions: string[] = []
  const changes = pr.additions + pr.deletions

  if (changes > 1000) {
    suggestions.push('Large PR - consider splitting into smaller changes')
  }
  if (pr.additions > 500 && pr.deletions < 50) {
    suggestions.push('Mostly additions - ensure proper test coverage')
  }
  if (pr.title.length < 10) {
    suggestions.push('Consider adding a more descriptive title')
  }
  if (!pr.labels.length) {
    suggestions.push('Add labels to categorize this PR')
  }
  if (pr.isDraft) {
    suggestions.push('Remember to mark as ready for review when complete')
  }

  return suggestions
}

function getPRRiskLevel(pr: PullRequest): 'low' | 'medium' | 'high' {
  const changes = pr.additions + pr.deletions

  if (changes > 1000 || pr.reviewDecision === 'CHANGES_REQUESTED') {
    return 'high'
  }
  if (changes > 300 || pr.comments > 10) {
    return 'medium'
  }
  return 'low'
}

export default AIReviewApp
