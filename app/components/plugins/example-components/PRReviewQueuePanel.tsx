/**
 * PR Review Queue Panel Component
 *
 * Floating panel showing PRs needing review with urgency indicators.
 * Uses real PR data from the plugin context API.
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Clock,
  GitPullRequest,
  User,
  MessageSquare,
  ExternalLink,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import type { PluginPanelProps } from '@/lib/plugins/plugin-types'
import type { PullRequest } from '@/lib/types'
import './example-plugin-styles.css'

interface ReviewQueueItem {
  id: number
  title: string
  author: string
  branch: string
  baseBranch: string
  waitingHours: number
  urgency: 'low' | 'medium' | 'high' | 'critical'
  additions: number
  deletions: number
  comments: number
  reviewDecision: string | null
  isDraft: boolean
  url: string
}

function calculateUrgency(waitingHours: number): 'low' | 'medium' | 'high' | 'critical' {
  if (waitingHours >= 72) return 'critical'
  if (waitingHours >= 24) return 'high'
  if (waitingHours >= 8) return 'medium'
  return 'low'
}

function calculateWaitingHours(createdAt: string): number {
  const created = new Date(createdAt)
  const now = new Date()
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60))
}

export function PRReviewQueuePanel({ context, data, onClose }: PluginPanelProps) {
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'needs-review' | 'changes-requested' | 'approved'>('all')

  // Load PR data
  useEffect(() => {
    const loadPRs = async () => {
      setLoading(true)
      try {
        const prs = await context.api.getPullRequests()
        // Ensure we always set an array (API might return null/undefined on error)
        setPullRequests(Array.isArray(prs) ? prs : [])
      } catch (error) {
        console.error('Failed to load PRs:', error)
      } finally {
        setLoading(false)
      }
    }
    loadPRs()
  }, [context.api])

  // Convert to queue items with urgency
  const queue = useMemo((): ReviewQueueItem[] => {
    return pullRequests
      .filter((pr) => !pr.isDraft) // Exclude drafts from review queue
      .map((pr) => {
        const waitingHours = calculateWaitingHours(pr.createdAt)
        return {
          id: pr.number,
          title: pr.title,
          author: pr.author,
          branch: pr.branch,
          baseBranch: pr.baseBranch,
          waitingHours,
          urgency: calculateUrgency(waitingHours),
          additions: pr.additions,
          deletions: pr.deletions,
          comments: pr.comments,
          reviewDecision: pr.reviewDecision,
          isDraft: pr.isDraft,
          url: pr.url,
        }
      })
      .sort((a, b) => b.waitingHours - a.waitingHours) // Sort by longest waiting first
  }, [pullRequests])

  // Filter queue
  const filteredQueue = useMemo(() => {
    switch (filter) {
      case 'needs-review':
        return queue.filter(
          (pr) => !pr.reviewDecision || pr.reviewDecision === 'REVIEW_REQUIRED'
        )
      case 'changes-requested':
        return queue.filter((pr) => pr.reviewDecision === 'CHANGES_REQUESTED')
      case 'approved':
        return queue.filter((pr) => pr.reviewDecision === 'APPROVED')
      default:
        return queue
    }
  }, [queue, filter])

  // Calculate stats
  const stats = useMemo(() => {
    const urgentCount = queue.filter(
      (pr) => pr.urgency === 'critical' || pr.urgency === 'high'
    ).length

    const avgWait =
      queue.length > 0
        ? Math.round(queue.reduce((sum, pr) => sum + pr.waitingHours, 0) / queue.length)
        : 0

    const oldest = queue.length > 0 ? Math.max(...queue.map((pr) => pr.waitingHours)) : 0

    const needsReview = queue.filter(
      (pr) => !pr.reviewDecision || pr.reviewDecision === 'REVIEW_REQUIRED'
    ).length

    return { urgentCount, avgWait, oldest, needsReview }
  }, [queue])

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    setLoading(true)
    try {
      const prs = await (context.api.refreshPullRequests?.() || context.api.getPullRequests())
      // Ensure we always set an array (API might return null/undefined on error)
      setPullRequests(Array.isArray(prs) ? prs : [])
    } catch (error) {
      console.error('Failed to refresh PRs:', error)
    } finally {
      setLoading(false)
    }
  }, [context.api])

  if (loading && pullRequests.length === 0) {
    return (
      <div className="pr-queue-panel">
        <div className="pr-queue-header">
          <div className="pr-queue-count">Loading...</div>
        </div>
        <div className="pr-queue-loading">
          <RefreshCw size={24} className="spinning" />
          <span>Loading pull requests...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="pr-queue-panel">
      {/* Header */}
      <div className="pr-queue-header">
        <div className="pr-queue-count">
          {filteredQueue.length} PRs
          {stats.urgentCount > 0 && (
            <span className="pr-queue-urgent-count">({stats.urgentCount} urgent)</span>
          )}
        </div>
        <div className="pr-queue-actions">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="pr-queue-filter"
          >
            <option value="all">All PRs</option>
            <option value="needs-review">Needs Review</option>
            <option value="changes-requested">Changes Requested</option>
            <option value="approved">Approved</option>
          </select>
          <button
            className="pr-queue-refresh"
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {/* Queue List */}
      <div className="pr-queue-list">
        {filteredQueue.map((pr) => (
          <PRQueueItem key={pr.id} pr={pr} />
        ))}

        {filteredQueue.length === 0 && (
          <div className="pr-queue-empty">
            <GitPullRequest size={32} />
            <p>
              {queue.length === 0 ? 'No open pull requests' : 'No PRs match this filter'}
            </p>
          </div>
        )}
      </div>

      {/* Quick Stats Footer */}
      <div className="pr-queue-footer">
        <span>Avg wait: {formatWaitTime(stats.avgWait)}</span>
        <span>Oldest: {formatWaitTime(stats.oldest)}</span>
        <span>Need review: {stats.needsReview}</span>
      </div>
    </div>
  )
}

function PRQueueItem({ pr }: { pr: ReviewQueueItem }) {
  const handleOpenPR = useCallback(() => {
    if (pr.url) {
      window.open(pr.url, '_blank')
    }
  }, [pr.url])

  return (
    <div className="pr-queue-item">
      <div className={`pr-queue-urgency ${pr.urgency}`} />
      <div className="pr-queue-content">
        <h4 className="pr-queue-title">
          #{pr.id} {pr.title}
        </h4>
        <div className="pr-queue-meta">
          <span className="pr-queue-author">
            <User size={10} />
            {pr.author}
          </span>
          <span className="pr-queue-branch">{pr.branch} → {pr.baseBranch}</span>
          <span
            className={`pr-queue-waiting ${pr.urgency === 'critical' ? 'critical' : pr.urgency === 'high' ? 'warning' : ''}`}
          >
            <Clock size={10} />
            {formatWaitTime(pr.waitingHours)}
          </span>
        </div>
        <div className="pr-queue-stats">
          <span className="pr-queue-diff">
            <span className="diff-add">+{pr.additions}</span>
            {' / '}
            <span className="diff-del">-{pr.deletions}</span>
          </span>
          {pr.comments > 0 && (
            <span className="pr-queue-comments">
              <MessageSquare size={10} />
              {pr.comments}
            </span>
          )}
          {pr.reviewDecision && (
            <span className={`pr-queue-review-status ${pr.reviewDecision.toLowerCase().replace('_', '-')}`}>
              {pr.reviewDecision === 'APPROVED' && 'Approved'}
              {pr.reviewDecision === 'CHANGES_REQUESTED' && 'Changes Requested'}
              {pr.reviewDecision === 'REVIEW_REQUIRED' && 'Review Required'}
            </span>
          )}
        </div>
      </div>
      <div className="pr-queue-actions-col">
        <button
          className="pr-queue-open-button"
          onClick={handleOpenPR}
          title="Open in browser"
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  )
}

function formatWaitTime(hours: number): string {
  if (hours < 1) return '<1h'
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

export default PRReviewQueuePanel
