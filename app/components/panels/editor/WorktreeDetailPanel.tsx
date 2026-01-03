/**
 * WorktreeDetailPanel - Shows worktree details with actions
 *
 * Displays worktree info, status, and actions like apply, create branch, remove.
 * Also supports reviewing and committing changes directly to the worktree's branch.
 */

import { useState, useEffect, useRef } from 'react'
import type { Worktree, UncommittedFile, StagingFileDiff, WorkingStatus } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'

export interface WorktreeDetailPanelProps {
  worktree: Worktree
  currentBranch: string
  repoPath: string | null
  switching?: boolean
  onStatusChange?: (status: StatusMessage | null) => void
  onRefresh?: () => Promise<void>
  onClearFocus?: () => void
  onCheckoutWorktree?: (worktree: Worktree) => void
  onOpenStaging?: () => void
}

export function WorktreeDetailPanel({
  worktree,
  currentBranch,
  repoPath,
  switching,
  onStatusChange,
  onRefresh,
  onClearFocus,
  onCheckoutWorktree,
  onOpenStaging,
}: WorktreeDetailPanelProps) {
  const [actionInProgress, setActionInProgress] = useState(false)
  // Herd preview state
  const [herdInstalled, setHerdInstalled] = useState<boolean | null>(null)
  const [isLaravel, setIsLaravel] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  // Staging/commit state
  const [showCommitUI, setShowCommitUI] = useState(false)
  const [workingStatus, setWorkingStatus] = useState<WorkingStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [selectedFile, setSelectedFile] = useState<UncommittedFile | null>(null)
  const [fileDiff, setFileDiff] = useState<StagingFileDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [commitDescription, setCommitDescription] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [pushAfterCommit, setPushAfterCommit] = useState(true)
  const [fileContextMenu, setFileContextMenu] = useState<{ x: number; y: number; file: UncommittedFile } | null>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)

  const isWorkingFolder = worktree.agent === 'working-folder'
  const isCurrent = worktree.branch === currentBranch
  const hasChanges = worktree.changedFileCount > 0 || worktree.additions > 0 || worktree.deletions > 0

  // Load working status when commit UI is opened
  useEffect(() => {
    if (showCommitUI && !workingStatus && !loadingStatus) {
      loadWorkingStatus()
    }
  }, [showCommitUI])

  // Load diff when file is selected
  useEffect(() => {
    if (!selectedFile || !showCommitUI) {
      setFileDiff(null)
      return
    }

    const loadDiff = async () => {
      setLoadingDiff(true)
      try {
        const diff = await window.electronAPI.getFileDiffInWorktree(worktree.path, selectedFile.path, selectedFile.staged)
        setFileDiff(diff)
      } catch (_error) {
        setFileDiff(null)
      } finally {
        setLoadingDiff(false)
      }
    }

    loadDiff()
  }, [selectedFile, worktree.path, showCommitUI])

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

  // Check Herd availability when worktree changes
  useEffect(() => {
    const checkHerd = async () => {
      try {
        const result = await window.electronAPI.checkHerdAvailable(worktree.path)
        setHerdInstalled(result.herdInstalled)
        setIsLaravel(result.isLaravel)
      } catch {
        setHerdInstalled(false)
        setIsLaravel(false)
      }
    }
    checkHerd()
  }, [worktree.path])

  const loadWorkingStatus = async () => {
    setLoadingStatus(true)
    try {
      const status = await window.electronAPI.getWorktreeWorkingStatus(worktree.path)
      setWorkingStatus(status)
    } catch (_error) {
      setWorkingStatus(null)
    } finally {
      setLoadingStatus(false)
    }
  }

  // Stage a file
  const handleStageFile = async (file: UncommittedFile) => {
    const result = await window.electronAPI.stageFileInWorktree(worktree.path, file.path)
    if (result.success) {
      await loadWorkingStatus()
    } else {
      onStatusChange?.({ type: 'error', message: result.message })
    }
  }

  // Unstage a file
  const handleUnstageFile = async (file: UncommittedFile) => {
    const result = await window.electronAPI.unstageFileInWorktree(worktree.path, file.path)
    if (result.success) {
      await loadWorkingStatus()
    } else {
      onStatusChange?.({ type: 'error', message: result.message })
    }
  }

  // Stage all files
  const handleStageAll = async () => {
    const result = await window.electronAPI.stageAllInWorktree(worktree.path)
    if (result.success) {
      await loadWorkingStatus()
    } else {
      onStatusChange?.({ type: 'error', message: result.message })
    }
  }

  // Unstage all files
  const handleUnstageAll = async () => {
    const result = await window.electronAPI.unstageAllInWorktree(worktree.path)
    if (result.success) {
      await loadWorkingStatus()
    } else {
      onStatusChange?.({ type: 'error', message: result.message })
    }
  }

  // Commit changes
  const handleCommit = async () => {
    if (!commitMessage.trim() || !workingStatus || workingStatus.stagedCount === 0) return

    setIsCommitting(true)
    onStatusChange?.({ type: 'info', message: `Committing to ${worktree.branch}...` })

    try {
      const result = await window.electronAPI.commitInWorktree(
        worktree.path,
        commitMessage.trim(),
        commitDescription.trim() || undefined
      )

      if (result.success) {
        let finalMessage = `Committed to ${worktree.branch}`

        // Push if enabled
        if (pushAfterCommit && worktree.branch) {
          onStatusChange?.({ type: 'info', message: 'Pushing to remote...' })
          const pushResult = await window.electronAPI.pushWorktreeBranch(worktree.path)
          if (pushResult.success) {
            finalMessage = `Committed and pushed to ${worktree.branch}`
          } else {
            onStatusChange?.({ type: 'error', message: `Committed, but push failed: ${pushResult.message}` })
            setCommitMessage('')
            setCommitDescription('')
            await loadWorkingStatus()
            await onRefresh?.()
            return
          }
        }

        onStatusChange?.({ type: 'success', message: finalMessage })
        setCommitMessage('')
        setCommitDescription('')
        setShowCommitUI(false)
        setWorkingStatus(null)
        await onRefresh?.()
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setIsCommitting(false)
    }
  }

  // File status helpers
  const getFileStatusIcon = (status: UncommittedFile['status']) => {
    switch (status) {
      case 'added':
        return '+'
      case 'deleted':
        return '−'
      case 'modified':
        return '●'
      case 'renamed':
        return '→'
      case 'untracked':
        return '?'
      default:
        return '?'
    }
  }

  const getFileStatusClass = (status: UncommittedFile['status']) => {
    switch (status) {
      case 'added':
        return 'file-added'
      case 'deleted':
        return 'file-deleted'
      case 'modified':
        return 'file-modified'
      case 'renamed':
        return 'file-renamed'
      case 'untracked':
        return 'file-untracked'
      default:
        return ''
    }
  }

  const stagedFiles = workingStatus?.files.filter((f) => f.staged) || []
  const unstagedFiles = workingStatus?.files.filter((f) => !f.staged) || []

  const handleApply = async () => {
    if (!hasChanges) {
      onStatusChange?.({ type: 'info', message: 'No changes to apply - worktree is clean' })
      return
    }

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Applying changes from ${worktree.displayName}...` })

    try {
      const result = await window.electronAPI.applyWorktreeChanges(worktree.path)
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

  const handleCreateBranch = async () => {
    if (!hasChanges) {
      onStatusChange?.({ type: 'info', message: 'No changes to convert - worktree is clean' })
      return
    }

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Creating branch from ${worktree.displayName}...` })

    try {
      const result = await window.electronAPI.convertWorktreeToBranch(worktree.path)
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

  const handleOpenInFinder = async () => {
    await window.electronAPI.openWorktree(worktree.path)
  }

  const handlePreviewInBrowser = async () => {
    if (!repoPath) {
      onStatusChange?.({ type: 'error', message: 'No repository path available' })
      return
    }

    setPreviewLoading(true)
    onStatusChange?.({ type: 'info', message: 'Setting up preview...' })

    try {
      const result = await window.electronAPI.openWorktreeInBrowser(worktree.path, repoPath)
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

  const handleRemove = async (force: boolean = false) => {
    const confirmMsg = force
      ? `Force remove worktree "${worktree.displayName}"? This will discard any uncommitted changes.`
      : `Remove worktree "${worktree.displayName}"?`
    if (!confirm(confirmMsg)) return

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Removing worktree...` })

    try {
      const result = await window.electronAPI.removeWorktree(worktree.path, force)
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        onClearFocus?.()
        await onRefresh?.()
      } else {
        // If it failed due to uncommitted changes, offer to force
        if (result.message.includes('uncommitted changes') && !force) {
          setActionInProgress(false)
          if (confirm(`${result.message}\n\nDo you want to force remove and discard changes?`)) {
            await handleRemove(true)
          }
        } else {
          onStatusChange?.({ type: 'error', message: result.message })
        }
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setActionInProgress(false)
    }
  }

  // Special rendering for Working Folder
  if (isWorkingFolder) {
    return (
      <div className="sidebar-detail-panel">
        <div className="detail-type-badge working-folder-badge">Working Folder</div>
        <h3 className="detail-title">{worktree.displayName}</h3>
        <div className="detail-meta-grid">
          <div className="detail-meta-item full-width">
            <span className="meta-label">Path</span>
            <code className="meta-value path">{worktree.path}</code>
          </div>
          {worktree.branch && (
            <div className="detail-meta-item">
              <span className="meta-label">Branch</span>
              <code className="meta-value">{worktree.branch}</code>
            </div>
          )}
          <div className="detail-meta-item">
            <span className="meta-label">Status</span>
            <span className="meta-value working-folder-status">Active</span>
          </div>
          <div className="detail-meta-item">
            <span className="meta-label">Changes</span>
            <span className="meta-value">
              {hasChanges ? (
                <>
                  {worktree.changedFileCount} {worktree.changedFileCount === 1 ? 'file' : 'files'}
                  {(worktree.additions > 0 || worktree.deletions > 0) && (
                    <>
                      {' · '}
                      <span className="diff-additions">+{worktree.additions}</span>{' '}
                      <span className="diff-deletions">-{worktree.deletions}</span>
                    </>
                  )}
                </>
              ) : (
                'Clean'
              )}
            </span>
          </div>
        </div>

        <div className="working-folder-explainer">
          <p>
            This is your main working directory. You're already using worktrees—each worktree is just another folder
            where you can work on a different branch simultaneously.
          </p>
        </div>

        <div className="detail-actions worktree-actions">
          <button className="btn btn-primary" onClick={handleOpenInFinder}>
            Open in Finder
          </button>
          {onOpenStaging && (
            <button className="btn btn-secondary" onClick={onOpenStaging}>
              Open Staging
            </button>
          )}
          {herdInstalled && (
            <button
              className="btn btn-secondary"
              onClick={handlePreviewInBrowser}
              disabled={!isLaravel || previewLoading}
              title={!isLaravel ? 'Preview not available for this project type' : 'Open preview in browser'}
            >
              {previewLoading ? 'Opening...' : 'Preview'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // Detached HEAD = no branch, needs rescue
  const isDetached = !worktree.branch

  return (
    <div className="sidebar-detail-panel">
      <div className="detail-type-badge">{isDetached ? 'Detached Worktree' : 'Worktree'}</div>
      <h3 className="detail-title">{worktree.branch || worktree.displayName}</h3>
      {worktree.branch && (
        <div className="detail-subtitle">{worktree.displayName}</div>
      )}
      <div className="detail-meta-grid">
        {worktree.branch && (
          <div className="detail-meta-item full-width">
            <span className="meta-label">Branch</span>
            <code className="meta-value">{worktree.branch}</code>
          </div>
        )}
        <div className="detail-meta-item full-width">
          <span className="meta-label">Path</span>
          <code className="meta-value path">{worktree.path}</code>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Status</span>
          <span className="meta-value">{isCurrent ? 'Current' : isDetached ? 'Detached HEAD' : 'Not checked out'}</span>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Changes</span>
          <span className="meta-value">
            {hasChanges ? (
              <>
                {worktree.changedFileCount} {worktree.changedFileCount === 1 ? 'file' : 'files'}
                {(worktree.additions > 0 || worktree.deletions > 0) && (
                  <>
                    {' · '}
                    <span className="diff-additions">+{worktree.additions}</span>{' '}
                    <span className="diff-deletions">-{worktree.deletions}</span>
                  </>
                )}
              </>
            ) : (
              'Clean'
            )}
          </span>
        </div>
        {/* Activity status for agent worktrees */}
        {worktree.agent !== 'unknown' && worktree.agent !== 'working-folder' && (
          <div className="detail-meta-item">
            <span className="meta-label">Activity</span>
            <span className={`meta-value activity-status activity-${worktree.activityStatus}`}>
              {worktree.activityStatus === 'active' && '● Active now'}
              {worktree.activityStatus === 'recent' && '◐ Recent (< 1 hour)'}
              {worktree.activityStatus === 'stale' && '○ Stale (> 1 hour)'}
              {worktree.activityStatus === 'unknown' && '○ Inactive'}
            </span>
          </div>
        )}
      </div>

      {/* Show agent task hint for Cursor agents */}
      {worktree.agent === 'cursor' && worktree.agentTaskHint && (
        <div className="agent-task-callout">
          <div className="agent-task-header">
            <span className="agent-task-icon">🤖</span>
            <span className="agent-task-label">Agent Task</span>
          </div>
          <p className="agent-task-content">{worktree.agentTaskHint}</p>
        </div>
      )}

      {/* Show WIP callout for worktrees with a branch and uncommitted changes */}
      {worktree.branch && hasChanges && (
        <div className="worktree-wip-callout">
          <div className="wip-header">
            <span className="wip-icon">✎</span>
            <span className="wip-title">Uncommitted work on {worktree.branch}</span>
          </div>
          {!showCommitUI ? (
            <p className="wip-description">
              This worktree has changes ready to commit. Review and commit directly, checkout to continue working, or apply the changes to your current branch.
            </p>
          ) : null}
          
          {/* Review & Commit button or inline UI */}
          {!showCommitUI ? (
            <button
              className="btn btn-primary wip-commit-btn"
              onClick={() => setShowCommitUI(true)}
              disabled={actionInProgress}
            >
              Review & Commit
            </button>
          ) : (
            <div className="worktree-staging-panel">
              {/* Loading state */}
              {loadingStatus && (
                <div className="staging-loading">Loading changes...</div>
              )}

              {/* File Lists */}
              {workingStatus && !loadingStatus && (
                <>
                  <div className="staging-files">
                    {/* Staged Section */}
                    <div className="staging-section">
                      <div className="staging-section-header">
                        <span className="staging-section-title">Staged</span>
                        <span className="staging-section-count">{stagedFiles.length}</span>
                        {stagedFiles.length > 0 && (
                          <button className="staging-action-btn" onClick={handleUnstageAll} title="Unstage all">
                            Unstage All ↓
                          </button>
                        )}
                      </div>
                      {stagedFiles.length > 0 ? (
                        <ul className="staging-file-list">
                          {stagedFiles.map((file) => (
                            <li
                              key={file.path}
                              className={`staging-file-item ${getFileStatusClass(file.status)} ${selectedFile?.path === file.path && selectedFile.staged ? 'selected' : ''}`}
                              onClick={() => setSelectedFile(file)}
                            >
                              <span className="file-status-icon">{getFileStatusIcon(file.status)}</span>
                              <span className="file-path" title={file.path}>
                                {file.path}
                              </span>
                              <button
                                className="file-action-btn unstage"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleUnstageFile(file)
                                }}
                                title="Unstage file"
                              >
                                −
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="staging-empty">No staged changes</div>
                      )}
                    </div>

                    {/* Unstaged Section */}
                    <div className="staging-section">
                      <div className="staging-section-header">
                        <span className="staging-section-title">Unstaged</span>
                        <span className="staging-section-count">{unstagedFiles.length}</span>
                        {unstagedFiles.length > 0 && (
                          <button className="staging-action-btn" onClick={handleStageAll} title="Stage all">
                            Stage All ↑
                          </button>
                        )}
                      </div>
                      {unstagedFiles.length > 0 ? (
                        <ul className="staging-file-list">
                          {unstagedFiles.map((file) => (
                            <li
                              key={file.path}
                              className={`staging-file-item ${getFileStatusClass(file.status)} ${selectedFile?.path === file.path && !selectedFile.staged ? 'selected' : ''}`}
                              onClick={() => setSelectedFile(file)}
                            >
                              <span className="file-status-icon">{getFileStatusIcon(file.status)}</span>
                              <span className="file-path" title={file.path}>
                                {file.path}
                              </span>
                              <button
                                className="file-action-btn stage"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleStageFile(file)
                                }}
                                title="Stage file"
                              >
                                ✓
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="staging-empty">No unstaged changes</div>
                      )}
                    </div>
                  </div>

                  {/* File Context Menu */}
                  {fileContextMenu && (
                    <div ref={fileMenuRef} className="context-menu" style={{ left: fileContextMenu.x, top: fileContextMenu.y }}>
                      <button
                        className="context-menu-item"
                        onClick={() => {
                          handleStageFile(fileContextMenu.file)
                          setFileContextMenu(null)
                        }}
                      >
                        Stage
                      </button>
                    </div>
                  )}

                  {/* Diff Preview */}
                  {selectedFile && (
                    <div className="staging-diff worktree-staging-diff">
                      <div className="staging-diff-header">
                        <span className="staging-diff-title">{selectedFile.path}</span>
                        {fileDiff && (
                          <span className="staging-diff-stats">
                            <span className="diff-additions">+{fileDiff.additions}</span>
                            <span className="diff-deletions">-{fileDiff.deletions}</span>
                          </span>
                        )}
                      </div>
                      <div className="staging-diff-content">
                        {loadingDiff ? (
                          <div className="staging-diff-loading">Loading diff...</div>
                        ) : fileDiff?.isBinary ? (
                          <div className="staging-diff-binary">Binary file</div>
                        ) : fileDiff?.hunks.length === 0 ? (
                          <div className="staging-diff-empty">No changes to display</div>
                        ) : fileDiff ? (
                          fileDiff.hunks.map((hunk, hunkIdx) => (
                            <div key={hunkIdx} className="staging-hunk">
                              <div className="staging-hunk-header">{hunk.header}</div>
                              <div className="staging-hunk-lines">
                                {hunk.lines.map((line, lineIdx) => (
                                  <div key={lineIdx} className={`staging-diff-line diff-line-${line.type}`}>
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
                        ) : (
                          <div className="staging-diff-empty">Select a file to view diff</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Commit Form */}
                  <div className="staging-commit worktree-staging-commit">
                    <input
                      type="text"
                      className="commit-summary-input"
                      placeholder="Commit message (required)"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      maxLength={72}
                    />
                    <textarea
                      className="commit-description-input"
                      placeholder="Description (optional)"
                      value={commitDescription}
                      onChange={(e) => setCommitDescription(e.target.value)}
                      rows={2}
                    />
                    <div className="commit-options">
                      <label className="commit-option-checkbox">
                        <input type="checkbox" checked={pushAfterCommit} onChange={(e) => setPushAfterCommit(e.target.checked)} />
                        <span>
                          Push to <code>{worktree.branch}</code> after commit
                        </span>
                      </label>
                    </div>
                    <div className="worktree-commit-actions">
                      <button
                        className="btn btn-primary commit-btn"
                        onClick={handleCommit}
                        disabled={
                          !commitMessage.trim() ||
                          stagedFiles.length === 0 ||
                          isCommitting
                        }
                      >
                        {isCommitting
                          ? pushAfterCommit
                            ? 'Committing & Pushing...'
                            : 'Committing...'
                          : pushAfterCommit
                            ? `Commit & Push ${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''}`
                            : `Commit ${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''}`}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setShowCommitUI(false)
                          setSelectedFile(null)
                          setFileDiff(null)
                        }}
                        disabled={isCommitting}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Show rescue callout for detached worktrees with changes */}
      {isDetached && hasChanges && (
        <div className="worktree-rescue-callout">
          <div className="rescue-header">
            <span className="rescue-icon">⚠</span>
            <span className="rescue-title">Orphaned changes (no branch)</span>
          </div>
          <p className="rescue-description">
            This worktree is on a detached HEAD. Use "Create Branch" to rescue these changes into a proper branch.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="detail-actions worktree-actions">
        {/* Checkout - only for worktrees with a branch, not current */}
        {!isCurrent && worktree.branch && onCheckoutWorktree && (
          <button
            className="btn btn-primary"
            onClick={() => onCheckoutWorktree(worktree)}
            disabled={actionInProgress || switching}
          >
            {switching ? 'Checking out...' : 'Checkout'}
          </button>
        )}

        {/* Create Branch - only for detached worktrees (rescue operation) */}
        {isDetached && (
          <button
            className="btn btn-primary"
            onClick={handleCreateBranch}
            disabled={actionInProgress || !hasChanges}
            title={hasChanges ? 'Rescue changes into a new branch' : 'No changes to rescue'}
          >
            Create Branch
          </button>
        )}

        {/* Apply - available for all worktrees with changes */}
        <button
          className="btn btn-secondary"
          onClick={handleApply}
          disabled={actionInProgress || !hasChanges}
          title={hasChanges ? 'Apply changes to main repo' : 'No changes to apply'}
        >
          Apply
        </button>

        <button className="btn btn-secondary" onClick={handleOpenInFinder} disabled={actionInProgress}>
          Open in Finder
        </button>

        {herdInstalled && (
          <button
            className="btn btn-secondary"
            onClick={handlePreviewInBrowser}
            disabled={!isLaravel || previewLoading || actionInProgress}
            title={!isLaravel ? 'Preview not available for this project type' : 'Open preview in browser'}
          >
            {previewLoading ? 'Opening...' : 'Preview'}
          </button>
        )}

        {isCurrent && onOpenStaging && (
          <button className="btn btn-secondary" onClick={onOpenStaging} disabled={actionInProgress}>
            Open Staging
          </button>
        )}

        {!isCurrent && (
          <button className="btn btn-secondary btn-danger" onClick={() => handleRemove(false)} disabled={actionInProgress}>
            Remove Worktree
          </button>
        )}
      </div>
    </div>
  )
}
