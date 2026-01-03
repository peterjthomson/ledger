/**
 * Standup Notes Panel
 *
 * Auto-generates standup notes from real git data.
 * Shows commits and PRs from the selected time period.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Calendar,
  GitCommit,
  GitPullRequest,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileText,
} from 'lucide-react'
import type { PluginPanelProps } from '@/lib/plugins/plugin-types'
import type { Commit, PullRequest } from '@/lib/types'

export function StandupNotesPanel({ context, repoPath, onClose }: PluginPanelProps) {
  const [commits, setCommits] = useState<Commit[]>([])
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // Ref for copy timeout cleanup
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [commitsData, prsData] = await Promise.all([
          context.api.getCommits(),
          context.api.getPullRequests(),
        ])
        // Ensure we always set arrays (API might return null/undefined on error)
        setCommits(Array.isArray(commitsData) ? commitsData : [])
        setPullRequests(Array.isArray(prsData) ? prsData : [])
      } catch (error) {
        console.error('Failed to load standup data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [context.api])

  // Filter commits for selected date
  const filteredCommits = useMemo(() => {
    const startOfDay = new Date(selectedDate)
    startOfDay.setHours(0, 0, 0, 0)

    const endOfDay = new Date(selectedDate)
    endOfDay.setHours(23, 59, 59, 999)

    return commits.filter((commit) => {
      const commitDate = new Date(commit.date)
      return commitDate >= startOfDay && commitDate <= endOfDay
    })
  }, [commits, selectedDate])

  // Get open PRs (not filtered by date - always show current open PRs)
  const openPRs = useMemo(() => {
    return pullRequests.filter((pr) => !pr.isDraft)
  }, [pullRequests])

  // Generate standup notes
  const standupNotes = useMemo(() => {
    const dateStr = selectedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    const isToday = selectedDate.toDateString() === new Date().toDateString()
    const dateLabel = isToday ? 'Today' : dateStr

    let notes = `## Standup Notes - ${dateLabel}\n\n`

    // Yesterday/What I did
    notes += `### ${isToday ? 'Yesterday' : 'Work Done'}\n\n`
    if (filteredCommits.length > 0) {
      const uniqueMessages = [...new Set(filteredCommits.map((c) => c.message))]
      uniqueMessages.forEach((msg) => {
        // Clean up commit message
        const cleanMsg = msg.split('\n')[0].trim()
        notes += `- ${cleanMsg}\n`
      })
    } else {
      notes += `- No commits found for this day\n`
    }

    // Open PRs
    notes += `\n### Open Pull Requests\n\n`
    if (openPRs.length > 0) {
      openPRs.forEach((pr) => {
        const status = pr.reviewDecision === 'APPROVED' ? '(Approved)' : pr.reviewDecision === 'CHANGES_REQUESTED' ? '(Changes Requested)' : '(Pending Review)'
        notes += `- #${pr.number}: ${pr.title} ${status}\n`
      })
    } else {
      notes += `- No open pull requests\n`
    }

    // Today (placeholder)
    notes += `\n### Today's Plan\n\n`
    notes += `- [Add your tasks for today]\n`

    // Blockers (placeholder)
    notes += `\n### Blockers\n\n`
    notes += `- None\n`

    return notes
  }, [filteredCommits, openPRs, selectedDate])

  // Date navigation
  const goToPreviousDay = useCallback(() => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() - 1)
    setSelectedDate(newDate)
  }, [selectedDate])

  const goToNextDay = useCallback(() => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + 1)
    if (newDate <= new Date()) {
      setSelectedDate(newDate)
    }
  }, [selectedDate])

  const goToToday = useCallback(() => {
    setSelectedDate(new Date())
  }, [])

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(standupNotes)
      setCopied(true)
      // Clear any pending timeout and set new one (with cleanup tracking)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }, [standupNotes])

  // Refresh data
  const handleRefresh = useCallback(async () => {
    setLoading(true)
    try {
      const [commitsData, prsData] = await Promise.all([
        context.api.refreshCommits?.() || context.api.getCommits(),
        context.api.refreshPullRequests?.() || context.api.getPullRequests(),
      ])
      // Ensure we always set arrays (API might return null/undefined on error)
      setCommits(Array.isArray(commitsData) ? commitsData : [])
      setPullRequests(Array.isArray(prsData) ? prsData : [])
    } catch (error) {
      console.error('Failed to refresh:', error)
    } finally {
      setLoading(false)
    }
  }, [context.api])

  const isToday = selectedDate.toDateString() === new Date().toDateString()
  const canGoForward = !isToday

  return (
    <div className="standup-panel">
      {/* Header with date navigation */}
      <div className="standup-header">
        <div className="standup-date-nav">
          <button
            className="standup-nav-button"
            onClick={goToPreviousDay}
            title="Previous day"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="standup-date-display">
            <Calendar size={14} />
            <span>
              {selectedDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            {isToday && <span className="standup-today-badge">Today</span>}
          </div>

          <button
            className="standup-nav-button"
            onClick={goToNextDay}
            disabled={!canGoForward}
            title="Next day"
          >
            <ChevronRight size={16} />
          </button>

          {!isToday && (
            <button
              className="standup-today-button"
              onClick={goToToday}
              title="Go to today"
            >
              Today
            </button>
          )}
        </div>

        <div className="standup-actions">
          <button
            className="standup-action-button"
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh data"
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
          <button
            className="standup-action-button standup-copy-button"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="standup-stats">
        <div className="standup-stat">
          <GitCommit size={14} />
          <span>{filteredCommits.length} commits</span>
        </div>
        <div className="standup-stat">
          <GitPullRequest size={14} />
          <span>{openPRs.length} open PRs</span>
        </div>
      </div>

      {/* Notes preview */}
      <div className="standup-content">
        {loading ? (
          <div className="standup-loading">
            <RefreshCw size={24} className="spinning" />
            <span>Loading git data...</span>
          </div>
        ) : (
          <div className="standup-notes">
            <div className="standup-notes-header">
              <FileText size={14} />
              <span>Generated Notes</span>
            </div>
            <pre className="standup-notes-content">{standupNotes}</pre>
          </div>
        )}
      </div>

      {/* Commit list */}
      {!loading && filteredCommits.length > 0 && (
        <div className="standup-commits">
          <h4 className="standup-section-title">Commits on this day</h4>
          <div className="standup-commit-list">
            {filteredCommits.map((commit) => (
              <div key={commit.hash} className="standup-commit-item">
                <span className="standup-commit-hash">{commit.shortHash}</span>
                <span className="standup-commit-message">
                  {commit.message.split('\n')[0]}
                </span>
                <span className="standup-commit-time">
                  {new Date(commit.date).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default StandupNotesPanel
