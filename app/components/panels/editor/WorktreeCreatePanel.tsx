/**
 * WorktreeCreatePanel - Form for creating new worktrees
 *
 * Allows creating worktrees with new or existing branches.
 * Offers location presets: .worktrees/ (Ledger convention), sibling folder, or custom.
 */

import { useState, useEffect, useMemo } from 'react'
import type { Branch } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'

export interface WorktreeCreatePanelProps {
  branches: Branch[]
  repoPath: string
  onStatusChange?: (status: StatusMessage | null) => void
  onRefresh?: () => Promise<void>
  onClearFocus?: () => void
  onWorktreeCreated?: (worktreePath: string) => void
}

type LocationPreset = 'ledger' | 'sibling' | 'custom'

export function WorktreeCreatePanel({
  branches,
  repoPath,
  onStatusChange,
  onRefresh,
  onClearFocus,
  onWorktreeCreated,
}: WorktreeCreatePanelProps) {
  const [branchMode, setBranchMode] = useState<'new' | 'existing'>('new')
  const [newBranchName, setNewBranchName] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [locationPreset, setLocationPreset] = useState<LocationPreset>('ledger')
  const [customPath, setCustomPath] = useState('')
  const [creating, setCreating] = useState(false)

  // Get repo name for default path suggestion
  const repoName = repoPath ? repoPath.split('/').pop() || 'repo' : 'repo'
  const repoParentDir = repoPath ? repoPath.split('/').slice(0, -1).join('/') : ''

  // Get local branches for dropdown
  const localBranches = branches.filter((b) => !b.isRemote)

  // Compute branch name and sanitized version
  const branchName = branchMode === 'new' ? newBranchName : selectedBranch
  const sanitizedBranchName = branchName.replace(/\//g, '-').replace(/[^a-zA-Z0-9-_]/g, '')

  // Compute paths for each preset
  const presetPaths = useMemo(() => {
    if (!sanitizedBranchName) {
      return {
        ledger: repoPath ? `${repoPath}/.worktrees/` : '.worktrees/',
        sibling: repoParentDir ? `${repoParentDir}/${repoName}--` : '',
      }
    }
    return {
      ledger: `${repoPath}/.worktrees/${sanitizedBranchName}`,
      sibling: `${repoParentDir}/${repoName}--${sanitizedBranchName}`,
    }
  }, [repoPath, repoParentDir, repoName, sanitizedBranchName])

  // Get the effective folder path based on preset
  const folderPath = useMemo(() => {
    switch (locationPreset) {
      case 'ledger':
        return presetPaths.ledger
      case 'sibling':
        return presetPaths.sibling
      case 'custom':
        return customPath
    }
  }, [locationPreset, presetPaths, customPath])

  // Initialize custom path when switching to custom
  useEffect(() => {
    if (locationPreset === 'custom' && !customPath && sanitizedBranchName) {
      setCustomPath(presetPaths.ledger)
    }
  }, [locationPreset, customPath, presetPaths.ledger, sanitizedBranchName])

  const handleBrowse = async () => {
    const selected = await window.electronAPI.selectWorktreeFolder()
    if (selected) {
      setCustomPath(selected)
      setLocationPreset('custom')
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
      const result = await window.electronAPI.createWorktree({
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

        {/* Location Preset Selection */}
        <div className="form-section">
          <label className="form-label">Location</label>
          <div className="location-presets">
            <label 
              className={`location-preset ${locationPreset === 'ledger' ? 'selected' : ''}`}
              title={presetPaths.ledger}
            >
              <input
                type="radio"
                name="locationPreset"
                value="ledger"
                checked={locationPreset === 'ledger'}
                onChange={() => setLocationPreset('ledger')}
              />
              <div className="preset-content">
                <span className="preset-name">.worktrees/</span>
                <span className="preset-description">Inside repo (Ledger convention)</span>
              </div>
            </label>
            <label 
              className={`location-preset ${locationPreset === 'sibling' ? 'selected' : ''}`}
              title={presetPaths.sibling}
            >
              <input
                type="radio"
                name="locationPreset"
                value="sibling"
                checked={locationPreset === 'sibling'}
                onChange={() => setLocationPreset('sibling')}
              />
              <div className="preset-content">
                <span className="preset-name">Sibling folder</span>
                <span className="preset-description">{repoName}--branch alongside repo</span>
              </div>
            </label>
            <label 
              className={`location-preset ${locationPreset === 'custom' ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="locationPreset"
                value="custom"
                checked={locationPreset === 'custom'}
                onChange={() => setLocationPreset('custom')}
              />
              <div className="preset-content">
                <span className="preset-name">Custom location</span>
                <span className="preset-description">Choose your own path</span>
              </div>
            </label>
          </div>

          {/* Show path preview / custom input */}
          <div className="location-path-row">
            {locationPreset === 'custom' ? (
              <input
                type="text"
                className="form-input folder-input"
                placeholder="Enter path or browse..."
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
              />
            ) : (
              <div className="path-preview" title={folderPath}>
                {folderPath || 'Enter branch name to see path'}
              </div>
            )}
            <button className="btn btn-secondary browse-btn" onClick={handleBrowse}>
              Browse
            </button>
          </div>
          <p className="form-hint">
            {locationPreset === 'ledger' 
              ? 'Worktrees in .worktrees/ are auto-detected as nested repos by git'
              : locationPreset === 'sibling'
              ? 'Creates folder alongside your main repo'
              : 'Path will be created if it doesn\'t exist'}
          </p>
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
