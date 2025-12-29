/**
 * CreateWorktreePanel - Form for creating new worktrees
 *
 * Allows creating worktrees with new or existing branches.
 */

import { useState, useEffect } from 'react'
import type { Branch } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'

export interface CreateWorktreePanelProps {
  branches: Branch[]
  repoPath: string
  onStatusChange?: (status: StatusMessage | null) => void
  onRefresh?: () => Promise<void>
  onClearFocus?: () => void
  onWorktreeCreated?: (worktreePath: string) => void
}

export function CreateWorktreePanel({
  branches,
  repoPath,
  onStatusChange,
  onRefresh,
  onClearFocus,
  onWorktreeCreated,
}: CreateWorktreePanelProps) {
  const [branchMode, setBranchMode] = useState<'new' | 'existing'>('new')
  const [newBranchName, setNewBranchName] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [creating, setCreating] = useState(false)

  // Get repo name for default path suggestion
  const repoName = repoPath ? repoPath.split('/').pop() || 'repo' : 'repo'
  const repoParentDir = repoPath ? repoPath.split('/').slice(0, -1).join('/') : ''

  // Get local branches for dropdown
  const localBranches = branches.filter((b) => !b.isRemote)

  // Compute default folder path when branch name changes
  const branchName = branchMode === 'new' ? newBranchName : selectedBranch
  const sanitizedBranchName = branchName.replace(/\//g, '-').replace(/[^a-zA-Z0-9-_]/g, '')
  const defaultFolderPath = sanitizedBranchName ? `${repoParentDir}/${repoName}--${sanitizedBranchName}` : ''

  // Update folder path when branch changes (if user hasn't manually edited)
  const [folderManuallyEdited, setFolderManuallyEdited] = useState(false)
  
  useEffect(() => {
    if (!folderManuallyEdited && defaultFolderPath) {
      setFolderPath(defaultFolderPath)
    }
  }, [defaultFolderPath, folderManuallyEdited])

  const handleBrowse = async () => {
    const selected = await window.conveyor.worktree.selectWorktreeFolder()
    if (selected) {
      setFolderPath(selected)
      setFolderManuallyEdited(true)
    }
  }

  const handleCreate = async () => {
    const targetBranch = branchMode === 'new' ? newBranchName.trim() : selectedBranch

    if (!targetBranch) {
      onStatusChange?.({ type: 'error', message: 'Please enter a branch name' })
      return
    }

    if (!folderPath.trim()) {
      onStatusChange?.({ type: 'error', message: 'Please select a folder location' })
      return
    }

    setCreating(true)
    onStatusChange?.({ type: 'info', message: `Creating worktree...` })

    try {
      const result = await window.conveyor.worktree.createWorktree({
        branchName: targetBranch,
        isNewBranch: branchMode === 'new',
        folderPath: folderPath.trim(),
      })

      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        await onRefresh?.()
        // Switch to the newly created worktree in the detail panel
        if (result.path) {
          onWorktreeCreated?.(result.path)
        } else {
          onClearFocus?.()
        }
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setCreating(false)
    }
  }

  const handleCancel = () => {
    onClearFocus?.()
  }

  const canCreate =
    (branchMode === 'new' ? newBranchName.trim() : selectedBranch) && folderPath.trim()

  return (
    <div className="sidebar-detail-panel create-worktree-panel">
      <div className="detail-type-badge">New Worktree</div>
      <h3 className="detail-title">Create Worktree</h3>
      <p className="detail-description">Create a new worktree with its own working directory.</p>

      <div className="create-worktree-form">
        {/* Branch Mode Selection */}
        <div className="form-section">
          <label className="form-label">Branch</label>
          <div className="branch-mode-toggle">
            <label className="radio-option">
              <input
                type="radio"
                name="branchMode"
                value="new"
                checked={branchMode === 'new'}
                onChange={() => setBranchMode('new')}
              />
              <span>Create new branch</span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="branchMode"
                value="existing"
                checked={branchMode === 'existing'}
                onChange={() => setBranchMode('existing')}
              />
              <span>Use existing branch</span>
            </label>
          </div>

          {branchMode === 'new' ? (
            <input
              type="text"
              className="form-input"
              placeholder="feature/my-feature"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              autoFocus
            />
          ) : (
            <select
              className="form-select"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              <option value="">Select a branch...</option>
              {localBranches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Folder Location */}
        <div className="form-section">
          <label className="form-label">Folder Location</label>
          <div className="folder-input-row">
            <input
              type="text"
              className="form-input folder-input"
              placeholder="Select folder location..."
              value={folderPath}
              onChange={(e) => {
                setFolderPath(e.target.value)
                setFolderManuallyEdited(true)
              }}
            />
            <button className="btn btn-secondary browse-btn" onClick={handleBrowse}>
              Browse
            </button>
          </div>
          <p className="form-hint">Path will be created if it doesn't exist</p>
        </div>

        {/* Actions */}
        <div className="detail-actions create-worktree-actions">
          <button className="btn btn-secondary" onClick={handleCancel} disabled={creating}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={creating || !canCreate}
          >
            {creating ? 'Creating...' : 'Create Worktree'}
          </button>
        </div>
      </div>
    </div>
  )
}
