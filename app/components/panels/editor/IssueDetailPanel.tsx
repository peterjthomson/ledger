/**
 * IssueDetailPanel - Full issue detail interface with description, comments tabs
 *
 * Shows issue details, allows commenting, closing/reopening, and creating branches.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Issue, IssueDetail, IssueLabel } from '../../../types/electron'

export interface IssueDetailPanelProps {
  issue: Issue
  formatRelativeTime: (date: string) => string
  onCreateBranch?: (issue: Issue) => void
  onClose?: (issue: Issue, reason?: 'completed' | 'not_planned') => void
  onReopen?: (issue: Issue) => void
  onIssueUpdated?: () => void
  switching?: boolean
}

type IssueTab = 'description' | 'comments' | 'linked'

/**
 * Label badge component
 */
function LabelBadge({ label }: { label: IssueLabel }) {
  const bgColor = `#${label.color}20`
  const textColor = `#${label.color}`

  return (
    <span
      className="issue-label-badge"
      style={{
        backgroundColor: bgColor,
        color: textColor,
        borderColor: `#${label.color}40`,
      }}
      title={label.description || label.name}
    >
      {label.name}
    </span>
  )
}

/**
 * Simple markdown renderer for issue body/comments
 */
function renderMarkdown(text: string): JSX.Element {
  // Very basic markdown - convert to HTML elements
  const lines = text.split('\n')
  const elements: JSX.Element[] = []

  let inCodeBlock = false
  let codeBlockLines: string[] = []

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="issue-code-block">
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        )
        codeBlockLines = []
      }
      inCodeBlock = !inCodeBlock
      return
    }

    if (inCodeBlock) {
      codeBlockLines.push(line)
      return
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i}>{line.slice(4)}</h4>)
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i}>{line.slice(3)}</h3>)
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i}>{line.slice(2)}</h2>)
    } else if (line.trim() === '') {
      elements.push(<br key={i} />)
    } else {
      // Inline code
      const processed = line.replace(/`([^`]+)`/g, '<code>$1</code>')
      elements.push(<p key={i} dangerouslySetInnerHTML={{ __html: processed }} />)
    }
  })

  return <div className="issue-markdown">{elements}</div>
}

export function IssueDetailPanel({
  issue,
  formatRelativeTime,
  onCreateBranch,
  onClose,
  onReopen,
  onIssueUpdated,
  switching,
}: IssueDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<IssueTab>('description')
  const [issueDetail, setIssueDetail] = useState<IssueDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentStatus, setCommentStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [showCloseMenu, setShowCloseMenu] = useState(false)

  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current)
      }
    }
  }, [])

  // Load full issue details
  const loadIssueDetail = useCallback(async () => {
    setLoading(true)
    try {
      const detail = await window.conveyor.issue.getIssueDetail(issue.number)
      setIssueDetail(detail)
    } catch (error) {
      console.error('Error loading issue detail:', error)
    } finally {
      setLoading(false)
    }
  }, [issue.number])

  useEffect(() => {
    loadIssueDetail()
  }, [loadIssueDetail])

  // Submit a comment
  const handleSubmitComment = async () => {
    if (!commentText.trim() || submittingComment) return

    setSubmittingComment(true)
    setCommentStatus(null)

    try {
      const result = await window.conveyor.issue.commentOnIssue(issue.number, commentText.trim())

      if (result.success) {
        setCommentText('')
        setCommentStatus({ type: 'success', message: 'Comment added!' })
        await loadIssueDetail()
        if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
        statusTimeoutRef.current = setTimeout(() => setCommentStatus(null), 3000)
      } else {
        setCommentStatus({ type: 'error', message: result.message })
      }
    } catch (error) {
      setCommentStatus({ type: 'error', message: (error as Error).message })
    } finally {
      setSubmittingComment(false)
    }
  }

  // Handle close issue
  const handleClose = async (reason: 'completed' | 'not_planned') => {
    setShowCloseMenu(false)
    if (onClose) {
      onClose(issue, reason)
    }
  }

  // Handle reopen
  const handleReopen = () => {
    if (onReopen) {
      onReopen(issue)
    }
  }

  // Open in GitHub
  const handleOpenInGitHub = async () => {
    await window.conveyor.issue.openIssue(issue.number)
  }

  // Create branch
  const handleCreateBranch = () => {
    if (onCreateBranch) {
      onCreateBranch(issue)
    }
  }

  const isClosed = issue.state === 'CLOSED'
  const commentCount = issueDetail?.commentsData?.length || issue.comments

  return (
    <div className="issue-detail-panel">
      {/* Header */}
      <div className="issue-detail-header">
        <div className="issue-detail-type">[Issue]</div>
        <div className="issue-detail-actions">
          {!isClosed && (
            <button
              className="issue-action-btn"
              onClick={handleCreateBranch}
              title="Create branch from issue"
            >
              Create Branch
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="issue-detail-title">
        {issue.isPinned && <span className="issue-pinned">📌</span>}
        {issue.title}
      </div>

      {/* Metadata grid */}
      <div className="issue-detail-meta-grid">
        <div className="meta-item">
          <div className="meta-label">NUMBER</div>
          <div className="meta-value">#{issue.number}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">AUTHOR</div>
          <div className="meta-value">@{issue.author}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">STATE</div>
          <div className={`meta-value issue-state-${issue.state.toLowerCase()}`}>
            {isClosed ? (
              <>
                {issue.stateReason === 'not_planned' ? '⊘ Not planned' : '✓ Completed'}
              </>
            ) : (
              '○ Open'
            )}
          </div>
        </div>
        <div className="meta-item">
          <div className="meta-label">CREATED</div>
          <div className="meta-value">{formatRelativeTime(issue.createdAt)}</div>
        </div>
      </div>

      {/* Labels */}
      {issue.labels.length > 0 && (
        <div className="issue-detail-labels">
          <div className="meta-label">LABELS</div>
          <div className="issue-labels-row">
            {issue.labels.map((label) => (
              <LabelBadge key={label.name} label={label} />
            ))}
          </div>
        </div>
      )}

      {/* Assignees & Milestone */}
      <div className="issue-detail-meta-grid">
        <div className="meta-item">
          <div className="meta-label">MILESTONE</div>
          <div className="meta-value">{issue.milestone || 'None'}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">ASSIGNEES</div>
          <div className="meta-value">
            {issue.assignees.length > 0 ? issue.assignees.map((a) => `@${a}`).join(', ') : 'None'}
          </div>
        </div>
        <div className="meta-item">
          <div className="meta-label">UPDATED</div>
          <div className="meta-value">{formatRelativeTime(issue.updatedAt)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="issue-detail-tabs">
        <button
          className={`issue-tab ${activeTab === 'description' ? 'active' : ''}`}
          onClick={() => setActiveTab('description')}
        >
          Description
        </button>
        <button
          className={`issue-tab ${activeTab === 'comments' ? 'active' : ''}`}
          onClick={() => setActiveTab('comments')}
        >
          Comments ({commentCount})
        </button>
        {issueDetail?.linkedPRs && issueDetail.linkedPRs.length > 0 && (
          <button
            className={`issue-tab ${activeTab === 'linked' ? 'active' : ''}`}
            onClick={() => setActiveTab('linked')}
          >
            Linked PRs ({issueDetail.linkedPRs.length})
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="issue-detail-content">
        {switching || loading ? (
          <div className="issue-loading">Loading...</div>
        ) : activeTab === 'description' ? (
          <div className="issue-description">
            {issueDetail?.body ? (
              renderMarkdown(issueDetail.body)
            ) : (
              <p className="issue-no-description">No description provided.</p>
            )}
          </div>
        ) : activeTab === 'comments' ? (
          <div className="issue-comments">
            {issueDetail?.commentsData && issueDetail.commentsData.length > 0 ? (
              <ul className="issue-comment-list">
                {issueDetail.commentsData.map((comment) => (
                  <li key={comment.id} className="issue-comment">
                    <div className="issue-comment-header">
                      <span className="issue-comment-author">@{comment.author}</span>
                      <span className="issue-comment-time">
                        {formatRelativeTime(comment.createdAt)}
                        {comment.isEdited && ' (edited)'}
                      </span>
                    </div>
                    <div className="issue-comment-body">{renderMarkdown(comment.body)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="issue-no-comments">No comments yet.</p>
            )}

            {/* Comment input */}
            {!isClosed && (
              <div className="issue-comment-input">
                <textarea
                  placeholder="Add a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) {
                      handleSubmitComment()
                    }
                  }}
                />
                <div className="issue-comment-actions">
                  {commentStatus && (
                    <span className={`comment-status ${commentStatus.type}`}>
                      {commentStatus.message}
                    </span>
                  )}
                  <button
                    className="issue-comment-submit"
                    onClick={handleSubmitComment}
                    disabled={!commentText.trim() || submittingComment}
                  >
                    {submittingComment ? 'Posting...' : 'Comment ⌘↵'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'linked' ? (
          <div className="issue-linked-prs">
            {issueDetail?.linkedPRs && issueDetail.linkedPRs.length > 0 ? (
              <ul className="issue-linked-list">
                {issueDetail.linkedPRs.map((pr) => (
                  <li key={pr.number} className="issue-linked-item">
                    <span className={`issue-linked-state ${pr.state.toLowerCase()}`}>
                      {pr.state === 'MERGED' ? '🟣' : pr.state === 'OPEN' ? '🟢' : '⚪'}
                    </span>
                    <span className="issue-linked-title">
                      #{pr.number} {pr.title}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="issue-no-linked">No linked pull requests.</p>
            )}
          </div>
        ) : null}
      </div>

      {/* Footer actions */}
      <div className="issue-detail-footer">
        {isClosed ? (
          <button className="issue-action-btn" onClick={handleReopen}>
            Reopen Issue
          </button>
        ) : (
          <div className="issue-close-dropdown">
            <button
              className="issue-action-btn issue-close-btn"
              onClick={() => setShowCloseMenu(!showCloseMenu)}
            >
              Close Issue ▾
            </button>
            {showCloseMenu && (
              <div className="issue-close-menu">
                <button onClick={() => handleClose('completed')}>
                  ✓ Close as completed
                </button>
                <button onClick={() => handleClose('not_planned')}>
                  ⊘ Close as not planned
                </button>
              </div>
            )}
          </div>
        )}
        <button className="issue-action-btn" onClick={handleOpenInGitHub}>
          View on GitHub
        </button>
      </div>
    </div>
  )
}
