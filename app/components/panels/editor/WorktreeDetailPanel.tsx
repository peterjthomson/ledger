/**
 * WorktreeDetailPanel - Shows worktree details with actions
 *
 * Displays worktree info, status, and actions like apply, create branch, remove.
 */

import { useState } from 'react'
import type { Worktree } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'

export interface WorktreeDetailPanelProps {
  worktree: Worktree
  currentBranch: string
  switching?: boolean
  onStatusChange?: (status: StatusMessage | null) => void
  onRefresh?: () => Promise<void>
  onClearFocus?: () => void
  onCheckoutWorktree?: (worktree: Worktree) => void
}

export function WorktreeDetailPanel({
  worktree,
  currentBranch,
  switching,
  onStatusChange,
  onRefresh,
  onClearFocus,
  onCheckoutWorktree,
}: WorktreeDetailPanelProps) {
  const [actionInProgress, setActionInProgress] = useState(false)

  const isWorkingFolder = worktree.agent === 'working-folder'
  const isCurrent = worktree.branch === currentBranch
  const hasChanges = worktree.changedFileCount > 0 || worktree.additions > 0 || worktree.deletions > 0

  const handleApply = async () => {
    if (!hasChanges) {
      onStatusChange?.({ type: 'info', message: 'No changes to apply - worktree is clean' })
      return
    }

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Applying changes from ${worktree.displayName}...` })

    try {
      const result = await window.conveyor.worktree.applyWorktreeChanges(worktree.path)
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
      const result = await window.conveyor.worktree.convertWorktreeToBranch(worktree.path)
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
    await window.conveyor.worktree.openWorktree(worktree.path)
  }

  const handleRemove = async (force: boolean = false) => {
    const confirmMsg = force
      ? `Force remove worktree "${worktree.displayName}"? This will discard any uncommitted changes.`
      : `Remove worktree "${worktree.displayName}"?`
    if (!confirm(confirmMsg)) return

    setActionInProgress(true)
    onStatusChange?.({ type: 'info', message: `Removing worktree...` })

    try {
      const result = await window.conveyor.worktree.removeWorktree(worktree.path, force)
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
          <p className="wip-description">
            This worktree has changes ready to commit. Checkout to continue working, or apply the changes to your current branch.
          </p>
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

        {!isCurrent && (
          <button className="btn btn-secondary" onClick={() => handleRemove(false)} disabled={actionInProgress}>
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
