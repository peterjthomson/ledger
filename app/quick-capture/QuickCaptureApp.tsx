/**
 * QuickCaptureApp - Main component for the Quick Capture popover
 *
 * A minimal, fast interface for creating GitHub issues from the menu bar.
 * Features:
 * - Auto-screenshot capture on open
 * - Single text field (first line = title, rest = body)
 * - Quick label/priority selection
 * - Repository selector
 * - Keyboard shortcuts (Cmd+Enter to submit)
 */

import { useState, useEffect, useCallback, useRef } from 'react'

interface RepoInfo {
  path: string
  name: string
  owner?: string
}

export function QuickCaptureApp() {
  // Form state
  const [description, setDescription] = useState('')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null)
  const [selectedRepo, setSelectedRepo] = useState<RepoInfo | null>(null)

  // Data state
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [labels, setLabels] = useState<string[]>([])
  const [priorities, setPriorities] = useState<string[]>([])

  // UI state
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ number: number; url: string } | null>(null)
  const [showRepoDropdown, setShowRepoDropdown] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Initialize on mount
  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        // Get current repo and recent repos
        const [currentRepo, recentRepos, settings] = await Promise.all([
          window.quickCapture.getCurrentRepo(),
          window.quickCapture.getRecentRepos(),
          window.quickCapture.getSettings(),
        ])

        setRepos(recentRepos)

        // Select current repo or first recent
        const repoToUse = currentRepo
          ? recentRepos.find((r) => r.path === currentRepo) || { path: currentRepo, name: currentRepo.split('/').pop() || '' }
          : recentRepos[0]

        if (repoToUse) {
          setSelectedRepo(repoToUse)

          // Load labels for selected repo
          const [repoLabels, repoPriorities] = await Promise.all([
            window.quickCapture.getQuickLabels(repoToUse.path),
            window.quickCapture.getPriorityLabels(repoToUse.path),
          ])
          setLabels(repoLabels)
          setPriorities(repoPriorities)
        }

        // Auto-capture screenshot if enabled
        if (settings.autoScreenshot) {
          const screenshotResult = await window.quickCapture.captureScreenshot()
          if (screenshotResult.success && screenshotResult.data) {
            setScreenshot(screenshotResult.data)
          }
        }
      } catch (err) {
        setError('Failed to initialize')
        console.error('[QuickCapture] Init error:', err)
      } finally {
        setLoading(false)
        // Focus textarea
        textareaRef.current?.focus()
      }
    }

    init()
  }, [])

  // Handle repo change
  const handleRepoChange = useCallback(async (repo: RepoInfo) => {
    setSelectedRepo(repo)
    setShowRepoDropdown(false)

    // Load labels for new repo
    try {
      const [repoLabels, repoPriorities] = await Promise.all([
        window.quickCapture.getQuickLabels(repo.path),
        window.quickCapture.getPriorityLabels(repo.path),
      ])
      setLabels(repoLabels)
      setPriorities(repoPriorities)
    } catch {
      // Keep existing labels on error
    }
  }, [])

  // Toggle label selection
  const toggleLabel = useCallback((label: string) => {
    setSelectedLabels((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]))
  }, [])

  // Retake screenshot
  const retakeScreenshot = useCallback(async () => {
    const result = await window.quickCapture.captureScreenshot()
    if (result.success && result.data) {
      setScreenshot(result.data)
    }
  }, [])

  // Remove screenshot
  const removeScreenshot = useCallback(() => {
    setScreenshot(null)
  }, [])

  // Submit issue
  const handleSubmit = useCallback(async () => {
    if (!description.trim() || !selectedRepo || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const result = await window.quickCapture.createQuickIssue({
        description,
        screenshot: screenshot || undefined,
        labels: selectedLabels,
        priority: selectedPriority || undefined,
        repoPath: selectedRepo.path,
      })

      if (result.success && result.number && result.url) {
        setSuccess({ number: result.number, url: result.url })

        // Auto-hide after brief success message
        setTimeout(() => {
          window.quickCapture.hide()
        }, 1500)
      } else {
        setError(result.message || 'Failed to create issue')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create issue')
    } finally {
      setSubmitting(false)
    }
  }, [description, screenshot, selectedLabels, selectedPriority, selectedRepo, submitting])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Enter or Ctrl+Enter to submit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
      // Escape to close
      if (e.key === 'Escape') {
        window.quickCapture.hide()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSubmit])

  // Loading state
  if (loading) {
    return (
      <div className="quick-capture">
        <div className="quick-capture-loading">
          <div className="spinner" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="quick-capture">
        <div className="quick-capture-success">
          <div className="success-icon">✓</div>
          <div className="success-text">Issue #{success.number} created</div>
        </div>
      </div>
    )
  }

  return (
    <div className="quick-capture">
      {/* Header */}
      <div className="quick-capture-header">
        <div className="header-title">
          <span className="header-icon">🎫</span>
          <span>New Issue</span>
        </div>

        {/* Repo selector */}
        <div className="repo-selector">
          <button className="repo-button" onClick={() => setShowRepoDropdown(!showRepoDropdown)}>
            {selectedRepo ? (
              <>
                {selectedRepo.owner && <span className="repo-owner">{selectedRepo.owner}/</span>}
                <span className="repo-name">{selectedRepo.name}</span>
              </>
            ) : (
              'Select repo'
            )}
            <span className="dropdown-arrow">▾</span>
          </button>

          {showRepoDropdown && repos.length > 0 && (
            <div className="repo-dropdown">
              {repos.map((repo) => (
                <button
                  key={repo.path}
                  className={`repo-option ${repo.path === selectedRepo?.path ? 'selected' : ''}`}
                  onClick={() => handleRepoChange(repo)}
                >
                  {repo.owner && <span className="repo-owner">{repo.owner}/</span>}
                  <span className="repo-name">{repo.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Screenshot preview */}
      {screenshot && (
        <div className="screenshot-preview">
          <img src={screenshot} alt="Screenshot" />
          <div className="screenshot-actions">
            <button className="screenshot-action" onClick={retakeScreenshot} title="Retake">
              📷
            </button>
            <button className="screenshot-action" onClick={removeScreenshot} title="Remove">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* No screenshot - option to capture */}
      {!screenshot && (
        <button className="capture-screenshot-btn" onClick={retakeScreenshot}>
          📷 Capture Screenshot
        </button>
      )}

      {/* Description textarea */}
      <div className="description-container">
        <textarea
          ref={textareaRef}
          className="description-input"
          placeholder="Describe the issue...&#10;First line becomes the title"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
      </div>

      {/* Labels */}
      {labels.length > 0 && (
        <div className="quick-labels">
          {labels.slice(0, 5).map((label) => (
            <button
              key={label}
              className={`label-chip ${selectedLabels.includes(label) ? 'selected' : ''}`}
              onClick={() => toggleLabel(label)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="quick-capture-footer">
        {/* Priority selector */}
        {priorities.length > 0 && (
          <select
            className="priority-select"
            value={selectedPriority || ''}
            onChange={(e) => setSelectedPriority(e.target.value || null)}
          >
            <option value="">Priority</option>
            {priorities.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}

        <div className="footer-spacer" />

        {/* Error message */}
        {error && <div className="error-message">{error}</div>}

        {/* Action buttons */}
        <button className="cancel-btn" onClick={() => window.quickCapture.hide()}>
          Cancel
        </button>
        <button
          className="submit-btn"
          onClick={handleSubmit}
          disabled={!description.trim() || !selectedRepo || submitting}
        >
          {submitting ? 'Creating...' : '⌘↵'}
        </button>
      </div>
    </div>
  )
}
