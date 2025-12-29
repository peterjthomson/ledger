/**
 * BranchDetailPanel - Shows branch details with diff preview and PR creation
 *
 * Displays branch metadata, allows PR creation, and shows diff against base branch.
 */

import { useState, useEffect } from 'react'
import type { Branch, BranchDiff } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'

export interface BranchDetailPanelProps {
  branch: Branch
  formatDate: (date?: string) => string
  onStatusChange?: (status: StatusMessage | null) => void
  onCheckoutBranch?: (branch: Branch) => void
  switching?: boolean
}

export function BranchDetailPanel({
  branch,
  formatDate,
  onStatusChange,
  onCheckoutBranch,
  switching,
}: BranchDetailPanelProps) {
  const [creatingPR, setCreatingPR] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [branchDiff, setBranchDiff] = useState<BranchDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  // PR creation form state
  const [showPRForm, setShowPRForm] = useState(false)
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [prDraft, setPrDraft] = useState(false)

  const isMainOrMaster = branch.name === 'main' || branch.name === 'master'

  // Load branch diff when branch changes
  useEffect(() => {
    if (isMainOrMaster) {
      setBranchDiff(null)
      return
    }

    let cancelled = false
    setLoadingDiff(true)

    window.conveyor.commit.getBranchDiff(branch.name).then((diff) => {
      if (!cancelled) {
        setBranchDiff(diff)
        // Expand first 3 files by default
        if (diff?.files) {
          setExpandedFiles(new Set(diff.files.slice(0, 3).map((f) => f.file.path)))
        }
        setLoadingDiff(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [branch.name, isMainOrMaster])

  const handleStartPRCreation = () => {
    // Auto-generate title from branch name
    const generatedTitle = branch.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    setPrTitle(generatedTitle)
    setPrBody('')
    setPrDraft(false)
    setShowPRForm(true)
  }

  const handleCancelPRCreation = () => {
    setShowPRForm(false)
    setPrTitle('')
    setPrBody('')
    setPrDraft(false)
  }

  const handleSubmitPR = async () => {
    if (!prTitle.trim()) return

    setCreatingPR(true)
    onStatusChange?.({ type: 'info', message: `Creating pull request for ${branch.name}...` })

    try {
      const result = await window.conveyor.pr.createPullRequest({
        title: prTitle.trim(),
        body: prBody.trim() || undefined,
        headBranch: branch.name,
        draft: prDraft,
        web: false,
      })

      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        setShowPRForm(false)
        setPrTitle('')
        setPrBody('')
        setPrDraft(false)
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setCreatingPR(false)
    }
  }

  const handlePush = async () => {
    setPushing(true)
    onStatusChange?.({ type: 'info', message: `Pushing ${branch.name} to origin...` })

    try {
      const result = await window.conveyor.branch.pushBranch(branch.name, true)

      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setPushing(false)
    }
  }

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  return (
    <div className="sidebar-detail-panel">
      <div className="detail-type-badge">Local Branch</div>
      <h3 className="detail-title">{branch.name}</h3>
      <div className="detail-meta-grid">
        <div className="detail-meta-item">
          <span className="meta-label">Commit</span>
          <code className="meta-value">{branch.commit?.slice(0, 7) || '—'}</code>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Status</span>
          <span className="meta-value">
            {branch.current ? 'Current' : 'Not checked out'}
            {branch.isLocalOnly && ' · Local only'}
          </span>
        </div>
        {branch.lastCommitDate && (
          <div className="detail-meta-item">
            <span className="meta-label">Last Commit</span>
            <span className="meta-value">{formatDate(branch.lastCommitDate)}</span>
          </div>
        )}
        {branch.firstCommitDate && (
          <div className="detail-meta-item">
            <span className="meta-label">First Commit</span>
            <span className="meta-value">{formatDate(branch.firstCommitDate)}</span>
          </div>
        )}
        {branch.commitCount !== undefined && (
          <div className="detail-meta-item">
            <span className="meta-label">Commits</span>
            <span className="meta-value">{branch.commitCount}</span>
          </div>
        )}
        <div className="detail-meta-item">
          <span className="meta-label">Merged</span>
          <span className="meta-value">{branch.isMerged ? 'Yes' : 'No'}</span>
        </div>
      </div>

      {/* PR Creation Form */}
      {showPRForm && !isMainOrMaster && (
        <div className="pr-create-form">
          <div className="pr-form-header">
            <span className="pr-form-title">Create Pull Request</span>
            <button className="pr-form-close" onClick={handleCancelPRCreation} title="Cancel">
              ×
            </button>
          </div>
          <div className="pr-form-field">
            <label className="pr-form-label">Title</label>
            <input
              type="text"
              className="pr-form-input"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              placeholder="Pull request title"
              autoFocus
            />
          </div>
          <div className="pr-form-field">
            <label className="pr-form-label">Description</label>
            <textarea
              className="pr-form-textarea"
              value={prBody}
              onChange={(e) => setPrBody(e.target.value)}
              placeholder="Describe your changes (optional)"
              rows={4}
            />
          </div>
          <div className="pr-form-checkbox">
            <label>
              <input type="checkbox" checked={prDraft} onChange={(e) => setPrDraft(e.target.checked)} />
              <span>Create as draft</span>
            </label>
          </div>
          <div className="pr-form-actions">
            <button className="btn btn-secondary" onClick={handleCancelPRCreation} disabled={creatingPR}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSubmitPR} disabled={creatingPR || !prTitle.trim()}>
              {creatingPR ? 'Creating...' : 'Create PR'}
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!showPRForm && (
        <div className="detail-actions">
          {!branch.current && onCheckoutBranch && (
            <button className="btn btn-primary" onClick={() => onCheckoutBranch(branch)} disabled={switching}>
              {switching ? 'Checking out...' : 'Checkout'}
            </button>
          )}
          {branch.current && (
            <button className="btn btn-primary" onClick={handlePush} disabled={pushing}>
              {pushing ? 'Pushing...' : 'Push to Origin'}
            </button>
          )}
          {!isMainOrMaster && (
            <button className="btn btn-secondary" onClick={handleStartPRCreation}>
              Create Pull Request
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => window.conveyor.pr.openBranchInGitHub(branch.name)}>
            View on GitHub
          </button>
        </div>
      )}

      {/* Branch Diff Section */}
      {!isMainOrMaster && (
        <div className="branch-diff-section">
          <div className="branch-diff-header">
            <span className="branch-diff-title">Changes vs {branchDiff?.baseBranch || 'master'}</span>
            {branchDiff && (
              <span className="branch-diff-stats">
                <span className="diff-stat-files">
                  {branchDiff.files.length} {branchDiff.files.length === 1 ? 'file' : 'files'}
                </span>
                <span className="diff-additions">+{branchDiff.totalAdditions}</span>
                <span className="diff-deletions">-{branchDiff.totalDeletions}</span>
              </span>
            )}
          </div>

          {loadingDiff ? (
            <div className="branch-diff-loading">Loading diff...</div>
          ) : !branchDiff ? (
            <div className="branch-diff-empty">Could not load diff</div>
          ) : branchDiff.files.length === 0 ? (
            <div className="branch-diff-empty">No changes from {branchDiff.baseBranch}</div>
          ) : (
            <div className="branch-diff-files">
              {branchDiff.files.map((fileDiff) => (
                <div key={fileDiff.file.path} className="branch-diff-file">
                  <div className="branch-diff-file-header" onClick={() => toggleFile(fileDiff.file.path)}>
                    <span className={`diff-file-chevron ${expandedFiles.has(fileDiff.file.path) ? 'open' : ''}`}>
                      ▸
                    </span>
                    <span className={`diff-file-status diff-status-${fileDiff.file.status}`}>
                      {fileDiff.file.status === 'added'
                        ? 'A'
                        : fileDiff.file.status === 'deleted'
                          ? 'D'
                          : fileDiff.file.status === 'renamed'
                            ? 'R'
                            : 'M'}
                    </span>
                    <span className="diff-file-path">
                      {fileDiff.file.oldPath ? `${fileDiff.file.oldPath} → ` : ''}
                      {fileDiff.file.path}
                    </span>
                    <span className="diff-file-stats">
                      {fileDiff.file.additions > 0 && (
                        <span className="diff-additions">+{fileDiff.file.additions}</span>
                      )}
                      {fileDiff.file.deletions > 0 && (
                        <span className="diff-deletions">-{fileDiff.file.deletions}</span>
                      )}
                    </span>
                  </div>

                  {expandedFiles.has(fileDiff.file.path) && (
                    <div className="diff-file-content">
                      {fileDiff.isBinary ? (
                        <div className="diff-binary">Binary file</div>
                      ) : fileDiff.hunks.length === 0 ? (
                        <div className="diff-empty">No changes</div>
                      ) : (
                        fileDiff.hunks.map((hunk, hunkIdx) => (
                          <div key={hunkIdx} className="diff-hunk">
                            <div className="diff-hunk-header">
                              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                            </div>
                            <div className="diff-hunk-lines">
                              {hunk.lines.map((line, lineIdx) => (
                                <div key={lineIdx} className={`diff-line diff-line-${line.type}`}>
                                  <span className="diff-line-number old">{line.oldLineNumber || ''}</span>
                                  <span className="diff-line-number new">{line.newLineNumber || ''}</span>
                                  <span className="diff-line-prefix">
                                    {line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}
                                  </span>
                                  <span className="diff-line-content">{line.content}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
