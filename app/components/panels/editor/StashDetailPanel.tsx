/**
 * StashDetailPanel - Shows stash details with file list and diff preview
 *
 * Displays stash info, file changes, and actions like apply, drop, create branch.
 */

import { useState, useEffect } from 'react'
import type { StashEntry, StashFile, StagingFileDiff } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'

export interface StashDetailPanelProps {
  stash: StashEntry
  currentBranch: string | null
  formatRelativeTime: (date: string) => string
  onStatusChange?: (status: StatusMessage | null) => void
  onRefresh?: () => Promise<void>
  onClearFocus?: () => void
}

export function StashDetailPanel({
  stash,
  currentBranch,
  formatRelativeTime,
  onStatusChange,
  onRefresh,
  onClearFocus,
}: StashDetailPanelProps) {
  const [files, setFiles] = useState<StashFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState<StagingFileDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [actionInProgress, setActionInProgress] = useState(false)
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  const isOnOriginalBranch = stash.branch === currentBranch

  // Calculate totals from files
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0)
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

  // Handle Apply stash to current branch
  const handleApply = async () => {
    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Applying stash@{${stash.index}} to ${currentBranch}...` })

    try {
      const result = await window.electronAPI.applyStash(stash.index)
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        await onRefresh?.()
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setActionInProgress(false)
    }
  }

  // Handle Drop stash
  const handleDrop = async () => {
    if (!confirm(`Drop stash@{${stash.index}}? This cannot be undone.`)) return

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Dropping stash@{${stash.index}}...` })

    try {
      const result = await window.electronAPI.dropStash(stash.index)
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        onClearFocus?.()
        await onRefresh?.()
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setActionInProgress(false)
    }
  }

  // Handle Apply stash to original branch (Ledger's "leapfrog" feature)
  // This uses worktrees to apply the stash without switching branches
  const handleApplyToOriginalBranch = async () => {
    if (!stash.branch) return

    setActionInProgress(true)
    onStatusChange?.({ 
      type: 'info', 
      message: `Applying stash to '${stash.branch}' via worktree...` 
    })

    try {
      const result = await window.electronAPI.applyStashToBranch(
        stash.index, 
        stash.branch, 
        stash.message
      )
      if (result.success) {
        const extraInfo = result.usedExistingWorktree 
          ? ' (changes are uncommitted in the worktree)'
          : ''
        onStatusChange?.({ type: 'success', message: result.message + extraInfo })
        await onRefresh?.()
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setActionInProgress(false)
    }
  }

  // Handle Create branch from stash
  const handleCreateBranch = async () => {
    if (!branchName.trim()) return

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Creating branch '${branchName}' from stash...` })

    try {
      const result = await window.electronAPI.stashToBranch(stash.index, branchName.trim())
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        setShowBranchModal(false)
        setBranchName('')
        onClearFocus?.()
        await onRefresh?.()
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setActionInProgress(false)
    }
  }

  // Load stash files
  useEffect(() => {
    const loadFiles = async () => {
      setLoading(true)
      try {
        const stashFiles = await window.electronAPI.getStashFiles(stash.index)
        setFiles(stashFiles)
        // Auto-expand first 3 files
        if (stashFiles.length > 0) {
          setExpandedFiles(new Set(stashFiles.slice(0, 3).map(f => f.path)))
        }
      } catch (error) {
        console.error('Error loading stash files:', error)
        setFiles([])
      } finally {
        setLoading(false)
      }
    }

    loadFiles()
    setSelectedFile(null)
    setFileDiff(null)
  }, [stash.index])

  // Load file diff when selected
  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null)
      return
    }

    const loadDiff = async () => {
      setLoadingDiff(true)
      try {
        const diff = await window.electronAPI.getStashFileDiffParsed(stash.index, selectedFile)
        setFileDiff(diff)
      } catch (_error) {
        setFileDiff(null)
      } finally {
        setLoadingDiff(false)
      }
    }

    loadDiff()
  }, [stash.index, selectedFile])

  const getStatusIcon = (status: StashFile['status']) => {
    switch (status) {
      case 'added':
        return 'A'
      case 'modified':
        return 'M'
      case 'deleted':
        return 'D'
      case 'renamed':
        return 'R'
      default:
        return '?'
    }
  }

  const getStatusClass = (status: StashFile['status']) => {
    switch (status) {
      case 'added':
        return 'status-added'
      case 'modified':
        return 'status-modified'
      case 'deleted':
        return 'status-deleted'
      case 'renamed':
        return 'status-renamed'
      default:
        return ''
    }
  }

  const toggleFileExpanded = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
    setSelectedFile(path)
  }

  return (
    <div className="sidebar-detail-panel stash-detail-panel">
      {/* Header */}
      <div className="detail-type-badge">Stash</div>
      <h3 className="detail-title">{stash.message || `Stash ${stash.index}`}</h3>
      
      {/* Metadata Grid */}
      <div className="detail-meta-grid">
        <div className="detail-meta-item">
          <span className="meta-label">Stashed From</span>
          <code className="meta-value">{stash.branch || 'unknown'}</code>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Current Branch</span>
          <code className="meta-value">{currentBranch || 'detached'}</code>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">When</span>
          <span className="meta-value">{formatRelativeTime(stash.date)}</span>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Status</span>
          <span className="meta-value">
            {isOnOriginalBranch ? (
              <span className="stash-status-match">✓ On original branch</span>
            ) : (
              <span className="stash-status-different">Different branch</span>
            )}
          </span>
        </div>
      </div>

      {/* Changed Files Section */}
      <div className="stash-changed-files">
        <div className="stash-files-header">
          <span>Changed Files</span>
          <span className="stash-files-stats">
            <span className="stash-files-count">{files.length}</span>
            <span className="diff-additions">+{totalAdditions}</span>
            <span className="diff-deletions">-{totalDeletions}</span>
          </span>
        </div>

        {loading ? (
          <div className="stash-loading">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="stash-empty">No files in stash</div>
        ) : (
          <div className="stash-files-list">
            {files.map((file) => (
              <div key={file.path} className="stash-file-item-container">
                <div
                  className={`stash-file-item ${expandedFiles.has(file.path) ? 'expanded' : ''}`}
                  onClick={() => toggleFileExpanded(file.path)}
                >
                  <span className={`stash-file-chevron ${expandedFiles.has(file.path) ? 'open' : ''}`}>▸</span>
                  <span className={`stash-file-status ${getStatusClass(file.status)}`}>
                    {getStatusIcon(file.status)}
                  </span>
                  <span className="stash-file-path" title={file.path}>
                    {file.path}
                  </span>
                  <span className="stash-file-stats">
                    <span className="diff-additions">+{file.additions}</span>
                    <span className="diff-deletions">-{file.deletions}</span>
                  </span>
                </div>

                {/* Inline Diff */}
                {expandedFiles.has(file.path) && selectedFile === file.path && (
                  <div className="stash-file-diff">
                    {loadingDiff ? (
                      <div className="stash-diff-loading">Loading diff...</div>
                    ) : fileDiff ? (
                      <div className="stash-diff-hunks">
                        {fileDiff.isBinary ? (
                          <div className="stash-diff-binary">Binary file</div>
                        ) : fileDiff.hunks.length === 0 ? (
                          <div className="stash-diff-empty">No changes</div>
                        ) : (
                          fileDiff.hunks.map((hunk, hunkIdx) => (
                            <div key={hunkIdx} className="stash-diff-hunk">
                              <div className="stash-diff-hunk-header">
                                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                              </div>
                              <div className="stash-diff-lines">
                                {hunk.lines.map((line, lineIdx) => (
                                  <div key={lineIdx} className={`stash-diff-line stash-diff-line-${line.type}`}>
                                    <span className="stash-diff-line-number old">{line.oldLineNumber || ''}</span>
                                    <span className="stash-diff-line-number new">{line.newLineNumber || ''}</span>
                                    <span className="stash-diff-line-prefix">
                                      {line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}
                                    </span>
                                    <span className="stash-diff-line-content">{line.content}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="stash-diff-empty">Could not load diff</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="detail-actions stash-actions">
        <button className="btn btn-primary" onClick={handleApply} disabled={actionInProgress}>
          Apply to {currentBranch || 'Current Branch'}
        </button>
        {!isOnOriginalBranch && stash.branch && (
          <button
            className="btn btn-secondary btn-leapfrog"
            onClick={handleApplyToOriginalBranch}
            disabled={actionInProgress}
            title={`Apply to '${stash.branch}' using worktrees (no branch switch needed)`}
          >
            Apply to {stash.branch}
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => setShowBranchModal(true)} disabled={actionInProgress}>
          Create Branch
        </button>
        <button className="btn btn-secondary btn-danger" onClick={handleDrop} disabled={actionInProgress}>
          Drop Stash
        </button>
      </div>

      {/* Create Branch Modal */}
      {showBranchModal && (
        <div className="modal-overlay" onClick={() => setShowBranchModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Branch from Stash</h3>
              <button className="modal-close" onClick={() => setShowBranchModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <label className="modal-label">
                Branch Name
                <input
                  type="text"
                  className="modal-input"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="feature/my-branch"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && branchName.trim()) {
                      handleCreateBranch()
                    }
                  }}
                />
              </label>
              <p className="modal-hint">
                This will create a new branch from the commit where this stash was created, apply the stashed changes,
                and remove the stash.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowBranchModal(false)}
                disabled={actionInProgress}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateBranch}
                disabled={actionInProgress || !branchName.trim()}
              >
                Create Branch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
