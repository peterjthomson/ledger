/**
 * StashDetailPanel - Shows stash details with file list and diff preview
 *
 * Displays stash info, file changes, and actions like apply, drop, create branch.
 */

import { useState, useEffect } from 'react'
import type { StashEntry, StashFile } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'

export interface StashDetailPanelProps {
  stash: StashEntry
  formatRelativeTime: (date: string) => string
  onStatusChange?: (status: StatusMessage | null) => void
  onRefresh?: () => Promise<void>
  onClearFocus?: () => void
}

export function StashDetailPanel({
  stash,
  formatRelativeTime,
  onStatusChange,
  onRefresh,
  onClearFocus,
}: StashDetailPanelProps) {
  const [files, setFiles] = useState<StashFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState<string | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [actionInProgress, setActionInProgress] = useState(false)
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [branchName, setBranchName] = useState('')

  // Handle Apply stash (keeps stash in list)
  const handleApply = async () => {
    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Applying stash@{${stash.index}}...` })

    try {
      const result = await window.conveyor.stash.applyStash(stash.index)
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

  // Handle Pop stash (applies and removes from list)
  const handlePop = async () => {
    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Popping stash@{${stash.index}}...` })

    try {
      const result = await window.conveyor.stash.popStash(stash.index)
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

  // Handle Drop stash
  const handleDrop = async () => {
    if (!confirm(`Drop stash@{${stash.index}}? This cannot be undone.`)) return

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Dropping stash@{${stash.index}}...` })

    try {
      const result = await window.conveyor.stash.dropStash(stash.index)
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

  // Handle Create branch from stash
  const handleCreateBranch = async () => {
    if (!branchName.trim()) return

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Creating branch '${branchName}' from stash...` })

    try {
      const result = await window.conveyor.stash.stashToBranch(stash.index, branchName.trim())
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
    let cancelled = false

    const loadFiles = async () => {
      setLoading(true)
      try {
        const stashFiles = await window.conveyor.stash.getStashFiles(stash.index)
        if (!cancelled) {
          setFiles(stashFiles)
        }
      } catch (error) {
        console.error('Error loading stash files:', error)
        if (!cancelled) {
          setFiles([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadFiles()
    setSelectedFile(null)
    setFileDiff(null)

    return () => {
      cancelled = true
    }
  }, [stash.index])

  // Load file diff when selected
  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null)
      return
    }

    let cancelled = false

    const loadDiff = async () => {
      setLoadingDiff(true)
      try {
        const diff = await window.conveyor.stash.getStashFileDiff(stash.index, selectedFile)
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

  return (
    <div className="stash-detail-panel">
      {/* Header */}
      <div className="stash-header">
        <div className="detail-type-badge">Stash</div>
        <h3 className="stash-title">{stash.message || `Stash ${stash.index}`}</h3>
        <div className="stash-meta">
          {stash.branch && <code className="stash-branch">{stash.branch}</code>}
          <span className="stash-date">{formatRelativeTime(stash.date)}</span>
        </div>
      </div>

      {/* Files List */}
      <div className="stash-files">
        <div className="stash-files-header">
          Changed Files
          <span className="stash-files-count">{files.length}</span>
        </div>
        {loading ? (
          <div className="stash-loading">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="stash-empty">No files in stash</div>
        ) : (
          <ul className="stash-files-list">
            {files.map((file) => (
              <li
                key={file.path}
                className={`stash-file-item ${getStatusClass(file.status)} ${selectedFile === file.path ? 'selected' : ''}`}
                onClick={() => setSelectedFile(file.path)}
              >
                <span className={`stash-file-status ${getStatusClass(file.status)}`}>{getStatusIcon(file.status)}</span>
                <span className="stash-file-path" title={file.path}>
                  {file.path}
                </span>
                <span className="stash-file-stats">
                  <span className="diff-additions">+{file.additions}</span>
                  <span className="diff-deletions">-{file.deletions}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Diff Preview */}
      {selectedFile && (
        <div className="stash-diff">
          <div className="stash-diff-header">
            <span className="stash-diff-title">{selectedFile}</span>
          </div>
          <div className="stash-diff-content">
            {loadingDiff ? (
              <div className="stash-diff-loading">Loading diff...</div>
            ) : fileDiff ? (
              <pre className="stash-diff-code">{fileDiff}</pre>
            ) : (
              <div className="stash-diff-empty">Could not load diff</div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="stash-actions">
        <button className="btn btn-primary" onClick={handlePop} disabled={actionInProgress} title="Apply and remove stash">
          Pop
        </button>
        <button className="btn btn-secondary" onClick={handleApply} disabled={actionInProgress} title="Apply but keep stash">
          Apply
        </button>
        <button className="btn btn-secondary" onClick={() => setShowBranchModal(true)} disabled={actionInProgress}>
          Create Branch
        </button>
        <button className="btn btn-danger" onClick={handleDrop} disabled={actionInProgress} title="Remove without applying">
          Drop
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
