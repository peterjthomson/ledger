/**
 * StagingPanel - Git staging area with commit functionality
 *
 * Shows staged/unstaged files, diff preview, and commit form with options
 * for creating new branches and PRs.
 */

import { useState, useEffect, useRef } from 'react'
import type { WorkingStatus, UncommittedFile, StagingFileDiff } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'
import { beforeCommit, afterCommit } from '@/lib/plugins'

export interface StagingPanelProps {
  workingStatus: WorkingStatus
  currentBranch: string
  onRefresh: () => Promise<void>
  onStatusChange: (status: StatusMessage | null) => void
}

export function StagingPanel({ workingStatus, currentBranch, onRefresh, onStatusChange }: StagingPanelProps) {
  const [selectedFile, setSelectedFile] = useState<UncommittedFile | null>(null)
  const [fileDiff, setFileDiff] = useState<StagingFileDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [commitDescription, setCommitDescription] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [behindPrompt, setBehindPrompt] = useState<{ behindCount: number } | null>(null)
  const [isPulling, setIsPulling] = useState(false)
  const [pushAfterCommit, setPushAfterCommit] = useState(true)
  const [fileContextMenu, setFileContextMenu] = useState<{ x: number; y: number; file: UncommittedFile } | null>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)
  // New branch creation
  const [createNewBranch, setCreateNewBranch] = useState(false)
  const [branchFolder, setBranchFolder] = useState<string>('feature')
  const [customFolder, setCustomFolder] = useState('')
  const [branchName, setBranchName] = useState('')
  // PR creation option (inline with commit flow)
  const [createPR, setCreatePR] = useState(false)
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [prDraft, setPrDraft] = useState(false)

  const stagedFiles = workingStatus.files.filter((f) => f.staged)
  const unstagedFiles = workingStatus.files.filter((f) => !f.staged)


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

  // Load diff when file is selected
  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null)
      return
    }

    let cancelled = false

    const loadDiff = async () => {
      setLoadingDiff(true)
      try {
        const diff = await window.conveyor.staging.getFileDiff(selectedFile.path, selectedFile.staged)
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
  }, [selectedFile])

  // Stage a file
  const handleStageFile = async (file: UncommittedFile) => {
    const result = await window.conveyor.staging.stageFile(file.path)
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Unstage a file
  const handleUnstageFile = async (file: UncommittedFile) => {
    const result = await window.conveyor.staging.unstageFile(file.path)
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Stage all files
  const handleStageAll = async () => {
    const result = await window.conveyor.staging.stageAll()
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Unstage all files
  const handleUnstageAll = async () => {
    const result = await window.conveyor.staging.unstageAll()
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Discard changes in a file
  const handleDiscardFile = async (file: UncommittedFile) => {
    setFileContextMenu(null)
    const result = await window.conveyor.staging.discardFileChanges(file.path)
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      if (selectedFile?.path === file.path) {
        setSelectedFile(null)
      }
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Handle right-click on unstaged file
  const handleFileContextMenu = (e: React.MouseEvent, file: UncommittedFile) => {
    e.preventDefault()
    setFileContextMenu({ x: e.clientX, y: e.clientY, file })
  }

  // Get the effective folder name (custom or preset)
  const effectiveFolder = branchFolder === 'custom' ? customFolder.trim() : branchFolder
  const fullBranchName = createNewBranch && branchName.trim() ? `${effectiveFolder}/${branchName.trim()}` : null

  // Commit with optional force to skip behind-check
  const handleCommit = async (force: boolean = false) => {
    if (!commitMessage.trim() || stagedFiles.length === 0) return

    setIsCommitting(true)
    try {
      // Plugin hook: allow plugins to transform commit message
      const finalCommitMessage = await beforeCommit(commitMessage.trim())

      // If creating a new branch, do that first
      if (fullBranchName) {
        onStatusChange({ type: 'info', message: `Creating branch ${fullBranchName}...` })
        const branchResult = await window.conveyor.branch.createBranch(fullBranchName, true)
        if (!branchResult.success) {
          onStatusChange({ type: 'error', message: `Failed to create branch: ${branchResult.message}` })
          setIsCommitting(false)
          return
        }
      }

      const result = await window.conveyor.commit.commitChanges(
        finalCommitMessage,
        commitDescription.trim() || undefined,
        force
      )
      if (result.success) {
        // Plugin hook: notify plugins of successful commit
        await afterCommit(result.hash || 'HEAD')

        const targetBranch = fullBranchName || currentBranch
        let finalMessage = fullBranchName ? `Created ${fullBranchName} and committed` : result.message

        // If push after commit is enabled, push the branch
        if (pushAfterCommit && targetBranch) {
          onStatusChange({ type: 'info', message: 'Pushing to remote...' })
          const pushResult = await window.conveyor.branch.pushBranch(targetBranch, true)
          if (pushResult.success) {
            finalMessage = `Committed and pushed to ${targetBranch}`

            // If create PR is enabled, create the PR
            if (createPR) {
              onStatusChange({ type: 'info', message: 'Creating pull request...' })
              const prTitleToUse = prTitle.trim() || generatePRTitle(targetBranch)
              const prResult = await window.conveyor.pr.createPullRequest({
                title: prTitleToUse,
                body: prBody.trim() || undefined,
                headBranch: targetBranch,
                draft: prDraft,
                web: false,
              })
              if (prResult.success) {
                finalMessage = `Committed, pushed, and created PR for ${targetBranch}`
              } else {
                // PR creation failed but commit+push succeeded
                onStatusChange({
                  type: 'error',
                  message: `Committed and pushed, but PR creation failed: ${prResult.message}`,
                })
                // Reset form state anyway since commit+push worked
                setCommitMessage('')
                setCommitDescription('')
                setBehindPrompt(null)
                if (fullBranchName) {
                  setCreateNewBranch(false)
                  setBranchName('')
                }
                setCreatePR(false)
                setPrTitle('')
                setPrBody('')
                setPrDraft(false)
                await onRefresh()
                return
              }
            }
          } else {
            // Commit succeeded but push failed
            onStatusChange({ type: 'error', message: `Committed, but push failed: ${pushResult.message}` })
            setCommitMessage('')
            setCommitDescription('')
            setBehindPrompt(null)
            if (fullBranchName) {
              setCreateNewBranch(false)
              setBranchName('')
            }
            await onRefresh()
            return
          }
        }

        onStatusChange({ type: 'success', message: finalMessage })
        setCommitMessage('')
        setCommitDescription('')
        setBehindPrompt(null)
        // Reset branch creation fields
        if (fullBranchName) {
          setCreateNewBranch(false)
          setBranchName('')
        }
        // Reset PR creation fields
        if (createPR) {
          setCreatePR(false)
          setPrTitle('')
          setPrBody('')
          setPrDraft(false)
        }
        await onRefresh()
      } else if (result.behindCount && result.behindCount > 0) {
        // Origin has moved ahead - prompt user
        setBehindPrompt({ behindCount: result.behindCount })
      } else {
        onStatusChange({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange({ type: 'error', message: (error as Error).message })
    } finally {
      setIsCommitting(false)
    }
  }

  // Pull then commit (aborts if conflicts arise)
  const handlePullThenCommit = async () => {
    setIsPulling(true)
    onStatusChange({ type: 'info', message: 'Pulling latest changes...' })

    try {
      const pullResult = await window.conveyor.commit.pullCurrentBranch()
      if (pullResult.success && !pullResult.hadConflicts) {
        onStatusChange({ type: 'success', message: pullResult.message })
        setBehindPrompt(null)
        await onRefresh()
        // Now commit with force (we just pulled)
        await handleCommit(true)
      } else if (pullResult.hadConflicts) {
        // Pull succeeded but restoring local changes caused conflicts - don't commit!
        onStatusChange({
          type: 'error',
          message: 'Pull & Commit aborted: conflicts detected. Please resolve them before committing.',
        })
        setBehindPrompt(null)
        await onRefresh()
      } else {
        onStatusChange({ type: 'error', message: pullResult.message })
        setBehindPrompt(null)
      }
    } catch (error) {
      onStatusChange({ type: 'error', message: (error as Error).message })
      setBehindPrompt(null)
    } finally {
      setIsPulling(false)
    }
  }

  // Commit anyway even though behind
  const handleCommitAnyway = async () => {
    setBehindPrompt(null)
    await handleCommit(true)
  }

  // Auto-generate PR title from branch name
  const generatePRTitle = (branch: string) => {
    return branch
      .replace(/^(feature|bugfix|hotfix)\//, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
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

  return (
    <div className="staging-panel">
      {/* Header */}
      <div className="staging-header">
        <div className="staging-title">
          <span className="detail-type-badge uncommitted">Changes</span>
          <span className="staging-stats">
            <span className="diff-additions">+{workingStatus.additions}</span>
            <span className="diff-deletions">-{workingStatus.deletions}</span>
          </span>
        </div>
      </div>

      {/* File Lists */}
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
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
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
          <button className="context-menu-item" onClick={() => handleDiscardFile(fileContextMenu.file)}>
            Discard Changes
          </button>
        </div>
      )}

      {/* Diff Preview */}
      {selectedFile && (
        <div className="staging-diff">
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
      <div className="staging-commit">
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
          rows={3}
        />
        {/* New Branch Option */}
        <div className="commit-options">
          <label className="commit-option-checkbox">
            <input
              type="checkbox"
              checked={createNewBranch}
              onChange={(e) => setCreateNewBranch(e.target.checked)}
            />
            <span>Create new branch</span>
          </label>
        </div>
        {createNewBranch && (
          <div className="new-branch-fields">
            <div className="branch-folder-row">
              <select
                className="branch-folder-select"
                value={branchFolder}
                onChange={(e) => setBranchFolder(e.target.value)}
              >
                <option value="feature">feature/</option>
                <option value="bugfix">bugfix/</option>
                <option value="hotfix">hotfix/</option>
                <option value="custom">custom...</option>
              </select>
              {branchFolder === 'custom' && (
                <input
                  type="text"
                  className="branch-custom-folder"
                  placeholder="folder"
                  value={customFolder}
                  onChange={(e) => setCustomFolder(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
                />
              )}
              <span className="branch-separator">/</span>
              <input
                type="text"
                className="branch-name-input"
                placeholder="branch-name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
              />
            </div>
            {fullBranchName && (
              <div className="branch-preview">
                → <code>{fullBranchName}</code>
              </div>
            )}
          </div>
        )}
        <div className="commit-options">
          <label className="commit-option-checkbox">
            <input type="checkbox" checked={pushAfterCommit} onChange={(e) => setPushAfterCommit(e.target.checked)} />
            <span>
              Push to <code>{fullBranchName || currentBranch || 'remote'}</code> after commit
            </span>
          </label>
        </div>

        {/* Create PR Option - only show when pushing and not on main/master */}
        {pushAfterCommit && !['main', 'master'].includes(fullBranchName || currentBranch) && (
          <>
            <div className="commit-options">
              <label className="commit-option-checkbox">
                <input type="checkbox" checked={createPR} onChange={(e) => setCreatePR(e.target.checked)} />
                <span>Create Pull Request after push</span>
              </label>
            </div>
            {createPR && (
              <div className="pr-inline-fields">
                <input
                  type="text"
                  className="pr-inline-title"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  placeholder={`PR title (default: ${generatePRTitle(fullBranchName || currentBranch)})`}
                />
                <textarea
                  className="pr-inline-body"
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                />
                <label className="commit-option-checkbox pr-draft-checkbox">
                  <input type="checkbox" checked={prDraft} onChange={(e) => setPrDraft(e.target.checked)} />
                  <span>Create as draft</span>
                </label>
              </div>
            )}
          </>
        )}

        {/* Behind Origin Prompt */}
        {behindPrompt && (
          <div className="behind-prompt">
            <div className="behind-prompt-message">
              ⚠️ Origin has {behindPrompt.behindCount} new commit
              {behindPrompt.behindCount > 1 ? 's' : ''}
            </div>
            <div className="behind-prompt-actions">
              <button className="btn btn-primary" onClick={handlePullThenCommit} disabled={isPulling || isCommitting}>
                {isPulling ? 'Pulling...' : 'Pull & Commit'}
              </button>
              <button className="btn btn-secondary" onClick={handleCommitAnyway} disabled={isPulling || isCommitting}>
                Commit Anyway
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setBehindPrompt(null)}
                disabled={isPulling || isCommitting}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!behindPrompt && (
          <button
            className="btn btn-primary commit-btn"
            onClick={() => handleCommit()}
            disabled={
              !commitMessage.trim() ||
              stagedFiles.length === 0 ||
              isCommitting ||
              (createNewBranch && !branchName.trim()) ||
              (createNewBranch && branchFolder === 'custom' && !customFolder.trim())
            }
          >
            {isCommitting
              ? createPR
                ? 'Creating PR...'
                : fullBranchName
                  ? 'Creating branch...'
                  : pushAfterCommit
                    ? 'Committing & Pushing...'
                    : 'Committing...'
              : fullBranchName
                ? pushAfterCommit
                  ? createPR
                    ? 'Branch → Commit → Push → PR'
                    : 'Create Branch & Commit & Push'
                  : 'Create Branch & Commit'
                : pushAfterCommit
                  ? createPR
                    ? 'Commit → Push → Create PR'
                    : `Commit & Push ${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''}`
                  : `Commit ${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </div>
  )
}
