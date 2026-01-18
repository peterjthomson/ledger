/**
 * PRReviewPanel - Full PR review interface with conversation, files, and commits tabs
 *
 * Shows PR details, allows commenting, merging, and viewing file diffs.
 */

import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import type {
  PullRequest,
  PRDetail,
  PRReviewComment,
  StagingFileDiff,
  PreviewProviderInfo,
} from '../../../types/electron'
import { DiffViewer } from '../../ui/DiffViewer'

export interface PRReviewPanelProps {
  pr: PullRequest
  repoPath: string | null
  formatRelativeTime: (date: string) => string
  onCheckout?: (pr: PullRequest) => void
  onPRMerged?: () => void
  onStatusChange?: (status: { type: 'info' | 'success' | 'error'; message: string } | null) => void
  onNavigateToBranch?: (branchName: string) => void
  switching?: boolean
}

type PRTab = 'conversation' | 'files' | 'commits'

// Known AI/bot authors
const AI_AUTHORS = ['copilot', 'github-actions', 'dependabot', 'renovate', 'coderabbit', 'vercel', 'netlify', 'codecov']

function isAIAuthor(login: string): boolean {
  const lower = login.toLowerCase()
  return AI_AUTHORS.some((ai) => lower.includes(ai)) || lower.endsWith('[bot]') || lower.endsWith('-bot')
}

export function PRReviewPanel({ pr, repoPath, formatRelativeTime, onCheckout, onPRMerged, onStatusChange, onNavigateToBranch, switching }: PRReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<PRTab>('conversation')
  const [prDetail, setPrDetail] = useState<PRDetail | null>(null)
  const [reviewComments, setReviewComments] = useState<PRReviewComment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState<StagingFileDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [showAIComments, setShowAIComments] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentStatus, setCommentStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [mergingPR, setMergingPR] = useState(false)
  // Preview provider state
  const [previewProviders, setPreviewProviders] = useState<PreviewProviderInfo[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  // Ref to track status timeout for cleanup
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Ref for the diff container to scroll into view
  const diffContainerRef = useRef<HTMLDivElement>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current)
      }
    }
  }, [])

  // Load full PR details
  const loadPRDetail = useCallback(async () => {
    setLoading(true)
    try {
      const [detail, comments] = await Promise.all([
        window.conveyor.pr.getPRDetail(pr.number),
        window.conveyor.pr.getPRReviewComments(pr.number),
      ])
      setPrDetail(detail)
      setReviewComments(comments)
    } catch (error) {
      console.error('Error loading PR detail:', error)
    } finally {
      setLoading(false)
    }
  }, [pr.number])

  useEffect(() => {
    loadPRDetail()
  }, [loadPRDetail])

  const bestProvider = useMemo(
    () => previewProviders.find((provider) => provider.compatible) || null,
    [previewProviders]
  )

  // Check preview providers when repoPath changes
  useEffect(() => {
    if (!repoPath) {
      setPreviewProviders([])
      return
    }
    const loadProviders = async () => {
      try {
        const providers = await window.conveyor.preview.getProviders(repoPath)
        setPreviewProviders(providers)
      } catch {
        setPreviewProviders([])
      }
    }
    loadProviders()
  }, [repoPath])

  // Submit a comment
  const handleSubmitComment = async () => {
    if (!commentText.trim() || submittingComment) return

    setSubmittingComment(true)
    setCommentStatus(null)

    try {
      const result = await window.conveyor.pr.commentOnPR(pr.number, commentText.trim())

      if (result.success) {
        setCommentText('')
        setCommentStatus({ type: 'success', message: 'Comment added!' })
        // Reload PR details to show the new comment
        await loadPRDetail()
        // Clear success message after a delay (with cleanup tracking)
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

  // Merge PR
  const handleMergePR = async () => {
    if (mergingPR) return

    setMergingPR(true)
    setCommentStatus(null)

    try {
      const result = await window.conveyor.pr.mergePR(pr.number, 'squash')

      if (result.success) {
        setCommentStatus({ type: 'success', message: 'PR merged!' })
        // Reload PR details to show updated status
        await loadPRDetail()
        // Notify parent to refresh PR list
        if (onPRMerged) onPRMerged()
        // Clear success message after a delay (with cleanup tracking)
        if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
        statusTimeoutRef.current = setTimeout(() => setCommentStatus(null), 3000)
      } else {
        setCommentStatus({ type: 'error', message: result.message })
      }
    } catch (error) {
      setCommentStatus({ type: 'error', message: (error as Error).message })
    } finally {
      setMergingPR(false)
    }
  }

  // Preview PR in browser
  const handlePreviewInBrowser = async () => {
    if (!repoPath || !prDetail) {
      onStatusChange?.({ type: 'error', message: 'No repository path available' })
      return
    }

    setPreviewLoading(true)
    onStatusChange?.({ type: 'info', message: `Creating preview for PR #${pr.number}...` })

    try {
      const result = await window.conveyor.preview.autoPreviewPR(pr.number, prDetail.headRefName, repoPath)
      if (result.success) {
        const warningMsg = result.warnings?.length ? ` (${result.warnings.join(', ')})` : ''
        onStatusChange?.({ type: 'success', message: `Opened ${result.url}${warningMsg}` })
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setPreviewLoading(false)
    }
  }

  // Load file diff when selected (using parsed format with hunks)
  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null)
      return
    }

    let cancelled = false

    const loadDiff = async () => {
      setLoadingDiff(true)
      try {
        const diff = await window.conveyor.pr.getPRFileDiffParsed(pr.number, selectedFile)
        if (!cancelled) {
          setFileDiff(diff)
        }
      } catch (_error) {
        if (!cancelled) {
          setFileDiff(null)
        }
      } finally {
        if (!cancelled) {
          setLoadingDiff(false)
        }
      }
    }

    loadDiff()

    return () => {
      cancelled = true
    }
  }, [pr.number, selectedFile])

  // Scroll diff into view when a file is selected
  useLayoutEffect(() => {
    if (selectedFile && diffContainerRef.current) {
      // Small delay to ensure the DOM has updated
      requestAnimationFrame(() => {
        diffContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
  }, [selectedFile])

  // Filter comments by AI/human
  const filteredComments = useMemo(() => {
    if (!prDetail) return []
    if (showAIComments) return prDetail.comments
    return prDetail.comments.filter((c) => !isAIAuthor(c.author.login))
  }, [prDetail, showAIComments])

  const filteredReviews = useMemo(() => {
    if (!prDetail) return []
    if (showAIComments) return prDetail.reviews
    return prDetail.reviews.filter((r) => !isAIAuthor(r.author.login))
  }, [prDetail, showAIComments])

  // Count AI vs human comments
  const aiCommentCount = useMemo(() => {
    if (!prDetail) return 0
    return (
      prDetail.comments.filter((c) => isAIAuthor(c.author.login)).length +
      prDetail.reviews.filter((r) => isAIAuthor(r.author.login)).length
    )
  }, [prDetail])

  const humanCommentCount = useMemo(() => {
    if (!prDetail) return 0
    return (
      prDetail.comments.filter((c) => !isAIAuthor(c.author.login)).length +
      prDetail.reviews.filter((r) => !isAIAuthor(r.author.login)).length
    )
  }, [prDetail])

  // Get review comments for a specific file
  const getFileComments = (filePath: string) => {
    return reviewComments.filter((c) => c.path === filePath)
  }

  // Get review state badge
  const getReviewStateBadge = (state: string) => {
    switch (state) {
      case 'APPROVED':
        return <span className="pr-review-badge approved">Approved</span>
      case 'CHANGES_REQUESTED':
        return <span className="pr-review-badge changes">Changes Requested</span>
      case 'COMMENTED':
        return <span className="pr-review-badge commented">Commented</span>
      case 'DISMISSED':
        return <span className="pr-review-badge dismissed">Dismissed</span>
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="pr-review-panel">
        <div className="pr-review-loading">
          <div className="editor-loading-spinner" />
        </div>
      </div>
    )
  }

  if (!prDetail) {
    return (
      <div className="pr-review-panel">
        <div className="pr-review-error">Could not load PR details</div>
      </div>
    )
  }

  return (
    <div className="pr-review-panel">
      {/* Header */}
      <div className="pr-review-header">
        <div className="detail-type-badge">Pull Request</div>
        <div className="pr-review-title-row">
          <h3 className="pr-review-title">{prDetail.title}</h3>
          {prDetail.reviewDecision && getReviewStateBadge(prDetail.reviewDecision)}
        </div>
        <div className="pr-review-meta">
          <span className="pr-review-branch">
            {onNavigateToBranch ? (
              <button
                className="branch-link"
                onClick={() => onNavigateToBranch(prDetail.headRefName)}
                title={`View branch: ${prDetail.headRefName}`}
              >
                <code>{prDetail.headRefName}</code>
              </button>
            ) : (
              <code>{prDetail.headRefName}</code>
            )}
            <span className="pr-arrow">→</span>
            {onNavigateToBranch ? (
              <button
                className="branch-link"
                onClick={() => onNavigateToBranch(prDetail.baseRefName)}
                title={`View branch: ${prDetail.baseRefName}`}
              >
                <code>{prDetail.baseRefName}</code>
              </button>
            ) : (
              <code>{prDetail.baseRefName}</code>
            )}
          </span>
          <span className="pr-review-author">@{prDetail.author.login}</span>
          <span className="pr-review-time">{formatRelativeTime(prDetail.updatedAt)}</span>
          <span className="pr-review-stats">
            <span className="diff-additions">+{prDetail.additions}</span>
            <span className="diff-deletions">-{prDetail.deletions}</span>
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="detail-actions">
        {onCheckout && (
          <button
            className="btn btn-primary"
            onClick={() => onCheckout(pr)}
            disabled={switching}
          >
            {switching ? 'Checking out...' : 'Checkout Branch'}
          </button>
        )}
        <button
          className="btn btn-secondary"
          onClick={() => window.conveyor.pr.openPullRequest(pr.url)}
        >
          View on GitHub
        </button>
        {bestProvider && (
          <button
            className="btn btn-secondary"
            onClick={handlePreviewInBrowser}
            disabled={!bestProvider.available || previewLoading}
            title={
              !bestProvider.available
                ? bestProvider.reason || 'Preview provider unavailable'
                : `Open preview with ${bestProvider.name}`
            }
          >
            {previewLoading ? 'Opening...' : 'Preview'}
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={handleMergePR}
          disabled={mergingPR || prDetail.state === 'MERGED'}
        >
          {mergingPR ? 'Merging...' : prDetail.state === 'MERGED' ? '✓ Merged' : 'Merge PR'}
        </button>
      </div>

      {/* Tabs */}
      <div className="pr-review-tabs">
        <button
          className={`pr-tab ${activeTab === 'conversation' ? 'active' : ''}`}
          onClick={() => setActiveTab('conversation')}
        >
          Conversation
          <span className="pr-tab-count">{filteredComments.length + filteredReviews.length}</span>
        </button>
        <button className={`pr-tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
          Files
          <span className="pr-tab-count">{prDetail.files.length}</span>
        </button>
        <button className={`pr-tab ${activeTab === 'commits' ? 'active' : ''}`} onClick={() => setActiveTab('commits')}>
          Commits
          <span className="pr-tab-count">{prDetail.commits.length}</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="pr-review-content">
        {/* Conversation Tab */}
        {activeTab === 'conversation' && (
          <div className="pr-conversation">
            {/* AI Filter Toggle */}
            <div className="pr-filter-bar">
              <label className="pr-filter-toggle">
                <input type="checkbox" checked={showAIComments} onChange={(e) => setShowAIComments(e.target.checked)} />
                <span>Show AI comments</span>
              </label>
              <span className="pr-filter-counts">
                <span className="human-count">👤 {humanCommentCount}</span>
                <span className="ai-count">🤖 {aiCommentCount}</span>
              </span>
            </div>

            {/* PR Body */}
            {prDetail.body && (
              <div className="pr-comment pr-body">
                <div className="pr-comment-header">
                  <span className="pr-comment-author">@{prDetail.author.login}</span>
                  <span className="pr-comment-time">{formatRelativeTime(prDetail.createdAt)}</span>
                </div>
                <div className="pr-comment-body">{prDetail.body}</div>
              </div>
            )}

            {/* Reviews and Comments (chronological) */}
            {[...filteredReviews, ...filteredComments]
              .sort((a, b) => {
                const dateA = new Date('submittedAt' in a ? a.submittedAt : a.createdAt)
                const dateB = new Date('submittedAt' in b ? b.submittedAt : b.createdAt)
                return dateA.getTime() - dateB.getTime()
              })
              .map((item, idx) => {
                const isReview = 'state' in item
                const author = item.author.login
                const isAI = isAIAuthor(author)
                const date = isReview ? (item as any).submittedAt : (item as any).createdAt

                return (
                  <div key={idx} className={`pr-comment ${isAI ? 'ai-comment' : ''} ${isReview ? 'pr-review' : ''}`}>
                    <div className="pr-comment-header">
                      <span className="pr-comment-author">
                        {isAI && <span className="ai-badge">🤖</span>}@{author}
                      </span>
                      {isReview && getReviewStateBadge((item as any).state)}
                      <span className="pr-comment-time">{formatRelativeTime(date)}</span>
                    </div>
                    {item.body && <div className="pr-comment-body">{item.body}</div>}
                  </div>
                )
              })}

            {filteredComments.length === 0 && filteredReviews.length === 0 && !prDetail.body && (
              <div className="pr-empty">No comments yet</div>
            )}

            {/* Add Comment Form */}
            <div className="pr-comment-form">
              <textarea
                className="pr-comment-input"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmitComment()
                  }
                }}
              />
              <div className="pr-comment-form-footer">
                {commentStatus && (
                  <span className={`pr-comment-status ${commentStatus.type}`}>{commentStatus.message}</span>
                )}
                <span className="pr-comment-hint">⌘+Enter to submit</span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSubmitComment}
                  disabled={!commentText.trim() || submittingComment}
                >
                  {submittingComment ? 'Posting...' : 'Comment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Files Tab */}
        {activeTab === 'files' && (
          <div className="pr-files">
            <div className="pr-files-list">
              {prDetail.files.map((file) => {
                const fileComments = getFileComments(file.path)
                return (
                  <div
                    key={file.path}
                    className={`pr-file-item ${selectedFile === file.path ? 'selected' : ''}`}
                    onClick={() => setSelectedFile(file.path)}
                  >
                    <span className="pr-file-path">{file.path}</span>
                    <span className="pr-file-stats">
                      <span className="diff-additions">+{file.additions}</span>
                      <span className="diff-deletions">-{file.deletions}</span>
                      {fileComments.length > 0 && <span className="pr-file-comments">💬 {fileComments.length}</span>}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* File Diff Preview */}
            {selectedFile && (
              <div className="pr-file-diff" ref={diffContainerRef}>
                <div className="pr-file-diff-header">
                  <span>{selectedFile}</span>
                  <a
                    href={`${pr.url}/files#diff-${selectedFile.replace(/[^a-zA-Z0-9]/g, '')}`}
                    onClick={(e) => {
                      e.preventDefault()
                      window.conveyor.pr.openPullRequest(`${pr.url}/files`)
                    }}
                    className="pr-view-on-github"
                  >
                    View on GitHub
                  </a>
                </div>
                <div className="pr-file-diff-content">
                  <DiffViewer
                    diff={fileDiff}
                    filePath={selectedFile}
                    loading={loadingDiff}
                    emptyMessage="Could not load diff"
                    className="pr-diff-viewer"
                  />
                </div>

                {/* Inline Review Comments */}
                {getFileComments(selectedFile).length > 0 && (
                  <div className="pr-inline-comments">
                    <div className="pr-inline-comments-header">
                      💬 Review Comments ({getFileComments(selectedFile).length})
                    </div>
                    {getFileComments(selectedFile).map((comment) => (
                      <div
                        key={comment.id}
                        className={`pr-inline-comment ${isAIAuthor(comment.author.login) ? 'ai-comment' : ''}`}
                      >
                        <div className="pr-inline-comment-header">
                          <span className="pr-comment-author">
                            {isAIAuthor(comment.author.login) && <span className="ai-badge">🤖</span>}@
                            {comment.author.login}
                          </span>
                          {comment.line && <span className="pr-comment-line">Line {comment.line}</span>}
                          <span className="pr-comment-time">{formatRelativeTime(comment.createdAt)}</span>
                        </div>
                        <div className="pr-inline-comment-body">{comment.body}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Commits Tab */}
        {activeTab === 'commits' && (
          <div className="pr-commits">
            {prDetail.commits.map((commit) => (
              <div key={commit.oid} className="pr-commit-item">
                <code className="pr-commit-hash">{commit.oid.slice(0, 7)}</code>
                <span className="pr-commit-message">{commit.messageHeadline}</span>
                <span className="pr-commit-author">{commit.author.name}</span>
                <span className="pr-commit-time">{formatRelativeTime(commit.committedDate)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
