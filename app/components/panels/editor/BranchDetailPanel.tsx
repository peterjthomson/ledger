/**
 * BranchDetailPanel - Shows branch details with diff preview and PR creation
 *
 * Displays branch metadata, allows PR creation, and shows diff against base branch.
 */

import { useState, useEffect } from 'react'
import type { Branch, BranchDiff, BranchDiffType } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'

export interface BranchDetailPanelProps {
  branch: Branch
  repoPath: string | null
  formatDate: (date?: string) => string
  onStatusChange?: (status: StatusMessage | null) => void
  onCheckoutBranch?: (branch: Branch) => void
  onDeleteBranch?: (branch: Branch) => void
  onOpenStaging?: () => void
  switching?: boolean
  deleting?: boolean
}

export function BranchDetailPanel({
  branch,
  repoPath,
  formatDate,
  onStatusChange,
  onCheckoutBranch,
  onDeleteBranch,
  onOpenStaging,
  switching,
  deleting,
}: BranchDetailPanelProps) {
  const [creatingPR, setCreatingPR] = useState(false)
  const [pushing, setPushing] = useState(false)
  // Herd preview state
  const [herdInstalled, setHerdInstalled] = useState<boolean | null>(null)
  const [isLaravel, setIsLaravel] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [branchDiff, setBranchDiff] = useState<BranchDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [diffType, setDiffType] = useState<BranchDiffType>('preview')

  // PR creation form state
  const [showPRForm, setShowPRForm] = useState(false)
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [prDraft, setPrDraft] = useState(false)

  const isMainOrMaster = branch.name === 'main' || branch.name === 'master'

  // Load branch diff when branch or diff type changes
  useEffect(() => {
    if (isMainOrMaster) {
      setBranchDiff(null)
      return
    }

    let cancelled = false
    setLoadingDiff(true)

    window.electronAPI.getBranchDiff(branch.name, diffType).then((diff) => {
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
  }, [branch.name, isMainOrMaster, diffType])

  // Check Herd availability when repoPath changes
  useEffect(() => {
    if (!repoPath) {
      setHerdInstalled(false)
      setIsLaravel(false)
      return
    }
    const checkHerd = async () => {
      try {
        const result = await window.electronAPI.checkHerdAvailable(repoPath)
        setHerdInstalled(result.herdInstalled)
        setIsLaravel(result.isLaravel)
      } catch {
        setHerdInstalled(false)
        setIsLaravel(false)
      }
    }
    checkHerd()
  }, [repoPath])

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
      const result = await window.electronAPI.createPullRequest({
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
      const result = await window.electronAPI.pushBranch(branch.name, true)

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

  const handlePreviewInBrowser = async () => {
    if (!repoPath) {
      onStatusChange?.({ type: 'error', message: 'No repository path available' })
      return
    }

    setPreviewLoading(true)
    onStatusChange?.({ type: 'info', message: `Creating preview for ${branch.name}...` })

    try {
      const result = await window.electronAPI.previewBranchInBrowser(branch.name, repoPath)
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

      {/* Latest Commit Message */}
      {branch.lastCommitMessage && (
        <div className="latest-commit-section">
          <div className="latest-commit-label">Latest Commit</div>
          <div className="latest-commit-message" title={branch.lastCommitMessage}>
            {branch.lastCommitMessage}
          </div>
        </div>
      )}

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
            <button className="btn btn-primary" onClick={() => onCheckoutBranch(branch)} disabled={switching || deleting}>
              {switching ? 'Checking out...' : 'Checkout'}
            </button>
          )}
          {branch.current && (
            <button className="btn btn-primary" onClick={handlePush} disabled={pushing || deleting}>
              {pushing ? 'Pushing...' : 'Push to Origin'}
            </button>
          )}
          {branch.current && onOpenStaging && (
            <button className="btn btn-secondary" onClick={onOpenStaging} disabled={deleting}>
              Open Staging
            </button>
          )}
          {!isMainOrMaster && (
            <button className="btn btn-secondary" onClick={handleStartPRCreation} disabled={deleting}>
              Create Pull Request
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => window.electronAPI.openBranchInGitHub(branch.name)} disabled={deleting}>
            View on GitHub
          </button>
          {herdInstalled && (
            <button
              className="btn btn-secondary"
              onClick={handlePreviewInBrowser}
              disabled={!isLaravel || previewLoading || deleting}
              title={!isLaravel ? 'Preview not available for this project type' : 'Open preview in browser'}
            >
              {previewLoading ? 'Opening...' : 'Preview'}
            </button>
          )}
          {!isMainOrMaster && !branch.current && onDeleteBranch && (
            <button className="btn btn-secondary btn-danger" onClick={() => onDeleteBranch(branch)} disabled={switching || deleting}>
              {deleting ? 'Deleting...' : 'Delete Branch'}
            </button>
          )}
        </div>
      )}

      {/* Branch Diff Section */}
      {!isMainOrMaster && (
        <div className="branch-diff-section">
          <div className="branch-diff-header">
            <div className="branch-diff-tabs">
              <button
                className={`branch-diff-tab ${diffType === 'preview' ? 'active' : ''}`}
                onClick={() => setDiffType('preview')}
                title="What this branch would contribute if merged (PR preview)"
              >
                PR Preview
              </button>
              <button
                className={`branch-diff-tab ${diffType === 'diff' ? 'active' : ''}`}
                onClick={() => setDiffType('diff')}
                title="Current difference between this branch and master"
              >
                Branch Diff
              </button>
              <button
                className={`branch-diff-tab ${diffType === 'changes' ? 'active' : ''}`}
                onClick={() => setDiffType('changes')}
                title="All changes made on this branch since it was forked"
              >
                Branch Changes
              </button>
            </div>
            {branchDiff && (
              <span className="branch-diff-stats">
                {branchDiff.hasConflicts && (
                  <span className="diff-stat-conflicts" title={`Conflicts in: ${branchDiff.conflictFiles?.join(', ')}`}>
                    ⚠️ {branchDiff.conflictFiles?.length || 0} conflicts
                  </span>
                )}
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
