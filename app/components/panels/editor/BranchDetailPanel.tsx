/**
 * BranchDetailPanel - Shows branch details with diff preview and PR creation
 *
 * Displays branch metadata, allows PR creation, and shows diff against base branch.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import type { Branch, BranchDiff, BranchDiffType, PullRequest, PreviewProviderInfo } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'
import { DiffViewer } from '../../ui/DiffViewer'

export interface BranchDetailPanelProps {
  branch: Branch
  repoPath: string | null
  formatDate: (date?: string) => string
  onStatusChange?: (status: StatusMessage | null) => void
  onCheckoutBranch?: (branch: Branch) => void
  onDeleteBranch?: (branch: Branch) => void
  onRenameBranch?: (branch: Branch, newName: string) => void
  onOpenStaging?: () => void
  onNavigateToPR?: (pr: PullRequest) => void
  prs?: PullRequest[]
  switching?: boolean
  deleting?: boolean
  renaming?: boolean
}

export function BranchDetailPanel({
  branch,
  repoPath,
  formatDate,
  onStatusChange,
  onCheckoutBranch,
  onDeleteBranch,
  onRenameBranch,
  onOpenStaging,
  onNavigateToPR,
  prs,
  switching,
  deleting,
  renaming,
}: BranchDetailPanelProps) {
  const [creatingPR, setCreatingPR] = useState(false)
  const [pushing, setPushing] = useState(false)
  // Preview provider state
  const [previewProviders, setPreviewProviders] = useState<PreviewProviderInfo[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [branchDiff, setBranchDiff] = useState<BranchDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [diffType, setDiffType] = useState<BranchDiffType>('preview')
  const [fileContextMenu, setFileContextMenu] = useState<{ x: number; y: number } | null>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)

  // PR creation form state
  const [showPRForm, setShowPRForm] = useState(false)
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [prDraft, setPrDraft] = useState(false)

  // Branch rename form state
  const [showRenameForm, setShowRenameForm] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')

  const isMainOrMaster = branch.name === 'main' || branch.name === 'master'

  // Find PR for this branch
  const branchPR = useMemo(() => {
    if (!prs) return null
    return prs.find((pr) => pr.branch === branch.name) || null
  }, [prs, branch.name])

  // Reset form states when branch changes
  useEffect(() => {
    setShowRenameForm(false)
    setNewBranchName('')
    setShowPRForm(false)
    setPrTitle('')
    setPrBody('')
    setPrDraft(false)
  }, [branch.name])

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

  const handleStartRename = () => {
    setNewBranchName(branch.name)
    setShowRenameForm(true)
  }

  const handleCancelRename = () => {
    setShowRenameForm(false)
    setNewBranchName('')
  }

  const handleSubmitRename = () => {
    if (!newBranchName.trim() || newBranchName === branch.name) return
    onRenameBranch?.(branch, newBranchName.trim())
    setShowRenameForm(false)
    setNewBranchName('')
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
      const result = await window.conveyor.preview.autoPreviewBranch(branch.name, repoPath)
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

  const expandAll = () => {
    if (branchDiff) {
      setExpandedFiles(new Set(branchDiff.files.map((f) => f.file.path)))
    }
    setFileContextMenu(null)
  }

  const collapseAll = () => {
    setExpandedFiles(new Set())
    setFileContextMenu(null)
  }

  const handleFileContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setFileContextMenu({ x: e.clientX, y: e.clientY })
  }

  // Close file context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileContextMenu(null)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFileContextMenu(null)
      }
    }

    if (fileContextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [fileContextMenu])

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
        {branchPR && (
          <div className="detail-meta-item">
            <span className="meta-label">Pull Request</span>
            {onNavigateToPR ? (
              <button
                className="pr-link-badge"
                onClick={() => onNavigateToPR(branchPR)}
                title={branchPR.title}
              >
                #{branchPR.number}
                {branchPR.isDraft && <span className="pr-draft-indicator">Draft</span>}
              </button>
            ) : (
              <span className="meta-value">#{branchPR.number}</span>
            )}
          </div>
        )}
      </div>

      {/* Conflict Warning Banner */}
      {branchDiff?.hasConflicts && branchDiff.conflictFiles && branchDiff.conflictFiles.length > 0 && (
        <div className="conflict-warning-banner">
          <div className="conflict-warning-header">
            <span className="conflict-warning-icon">⚠️</span>
            <span className="conflict-warning-title">
              {branchDiff.conflictFiles.length} Merge {branchDiff.conflictFiles.length === 1 ? 'Conflict' : 'Conflicts'} with {branchDiff.baseBranch}
            </span>
          </div>
          <div className="conflict-warning-description">
            This branch has conflicts that must be resolved before merging.
          </div>
          <div className="conflict-files-list">
            {branchDiff.conflictFiles.map((file) => (
              <div key={file} className="conflict-file-item">
                <span className="conflict-file-icon">⊘</span>
                <span className="conflict-file-path">{file}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Branch Rename Form */}
      {showRenameForm && !isMainOrMaster && (
        <div className="pr-create-form">
          <div className="pr-form-header">
            <span className="pr-form-title">Rename Branch</span>
            <button className="pr-form-close" onClick={handleCancelRename} title="Cancel">
              ×
            </button>
          </div>
          <div className="pr-form-field">
            <label className="pr-form-label">New Branch Name</label>
            <input
              type="text"
              className="pr-form-input"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="new-branch-name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newBranchName.trim() && newBranchName !== branch.name) {
                  handleSubmitRename()
                } else if (e.key === 'Escape') {
                  handleCancelRename()
                }
              }}
            />
          </div>
          <div className="pr-form-actions">
            <button className="btn btn-secondary" onClick={handleCancelRename} disabled={renaming}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmitRename}
              disabled={renaming || !newBranchName.trim() || newBranchName === branch.name}
            >
              {renaming ? 'Renaming...' : 'Rename'}
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!showPRForm && !showRenameForm && (
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
          <button className="btn btn-secondary" onClick={() => window.electronAPI.openBranchInGitHub(branch.name)} disabled={deleting || renaming}>
            View on GitHub
          </button>
          {bestProvider && (
            <button
              className="btn btn-secondary"
              onClick={handlePreviewInBrowser}
              disabled={!bestProvider.available || previewLoading || deleting}
              title={
                !bestProvider.available
                  ? bestProvider.reason || 'Preview provider unavailable'
                  : `Open preview with ${bestProvider.name}`
              }
            >
              {previewLoading ? 'Opening...' : 'Preview'}
            </button>
          )}
          {!isMainOrMaster && onRenameBranch && (
            <button className="btn btn-secondary" onClick={handleStartRename} disabled={switching || deleting || renaming}>
              Rename Branch
            </button>
          )}
          {!isMainOrMaster && !branch.current && onDeleteBranch && (
            <button className="btn btn-secondary btn-danger" onClick={() => onDeleteBranch(branch)} disabled={switching || deleting || renaming}>
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
              {branchDiff.files.map((fileDiff) => {
                const hasConflict = branchDiff.conflictFiles?.includes(fileDiff.file.path)
                return (
                <div key={fileDiff.file.path} className={`branch-diff-file ${hasConflict ? 'has-conflict' : ''}`}>
                  <div className="branch-diff-file-header" onClick={() => toggleFile(fileDiff.file.path)} onContextMenu={handleFileContextMenu}>
                    <span className={`diff-file-chevron ${expandedFiles.has(fileDiff.file.path) ? 'open' : ''}`}>
                      ▸
                    </span>
                    {hasConflict && (
                      <span className="diff-file-conflict-badge" title="This file has merge conflicts">⊘</span>
                    )}
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
                      {hasConflict && (
                        <span className="diff-conflict-indicator">Conflict</span>
                      )}
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
                      <DiffViewer
                        diff={fileDiff}
                        filePath={fileDiff.file.path}
                        emptyMessage="No changes"
                      />
                    </div>
                  )}
                </div>
              )})}
            </div>
          )}
        </div>
      )}

      {/* File Context Menu */}
      {fileContextMenu && (
        <div ref={fileMenuRef} className="context-menu" style={{ left: fileContextMenu.x, top: fileContextMenu.y }}>
          <button className="context-menu-item" onClick={expandAll}>
            Expand All
          </button>
          <button className="context-menu-item" onClick={collapseAll}>
            Collapse All
          </button>
        </div>
      )}
    </div>
  )
}
