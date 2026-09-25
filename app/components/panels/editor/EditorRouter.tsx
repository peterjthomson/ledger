/**
 * EditorRouter - Routes to the appropriate editor panel based on focus type
 *
 * This is the main router for the Editor slot. It takes a SidebarFocus object
 * and renders the appropriate detail panel based on the focus type.
 *
 * Previously called SidebarDetailPanel, renamed to better reflect its role
 * in the Canvas architecture.
 */

import { useEffect, useState } from 'react'
import type { Branch, Worktree, StashEntry, RepoInfo, PullRequest } from '../../../types/electron'
import type { StatusMessage, SidebarFocus } from '../../../types/app-types'
import { remoteBranchDisplayName } from '../list/list-filters'
import { BranchDetailPanel } from './BranchDetailPanel'
import { WorktreeDetailPanel } from './WorktreeDetailPanel'
import { StashDetailPanel } from './StashDetailPanel'
import { WorktreeCreatePanel } from './WorktreeCreatePanel'
import { MailmapDetailPanel } from './MailmapDetailPanel'
import { RepoDetailPanel } from './RepoDetailPanel'

export interface EditorRouterProps {
  focus: SidebarFocus
  formatRelativeTime: (date: string) => string
  formatDate: (date?: string) => string
  currentBranch: string
  switching?: boolean
  deleting?: boolean
  renaming?: boolean
  onStatusChange?: (status: StatusMessage | null) => void
  onRefresh?: () => Promise<void>
  onClearFocus?: () => void
  onCheckoutBranch?: (branch: Branch) => void
  onCheckoutRemoteBranch?: (branch: Branch) => void
  onCheckoutWorktree?: (worktree: Worktree) => void
  onDeleteBranch?: (branch: Branch) => void
  onRenameBranch?: (branch: Branch, newName: string) => void
  onDeleteRemoteBranch?: (branch: Branch) => void
  onOpenStaging?: () => void
  branches?: Branch[]
  repoPath?: string | null
  worktrees?: Worktree[]
  prs?: PullRequest[]
  onFocusWorktree?: (worktree: Worktree) => void
  onNavigateToPR?: (pr: PullRequest) => void
  onOpenRepo?: (repo: RepoInfo) => void
  onOpenMailmap?: () => void
  onBranchClick?: (branchName: string) => void
}

interface RemoteBranchDetailProps {
  branch: Branch
  formatDate: (date?: string) => string
  switching?: boolean
  deleting?: boolean
  renaming?: boolean
  onCheckoutRemoteBranch?: (branch: Branch) => void
  onRenameBranch?: (branch: Branch, newName: string) => void
  onDeleteRemoteBranch?: (branch: Branch) => void
}

function RemoteBranchDetail({
  branch,
  formatDate,
  switching,
  deleting,
  renaming,
  onCheckoutRemoteBranch,
  onRenameBranch,
  onDeleteRemoteBranch,
}: RemoteBranchDetailProps) {
  const displayName = remoteBranchDisplayName(branch.name)
  const isMainOrMaster = displayName === 'main' || displayName === 'master'
  // New name while the rename form is open (null when closed)
  const [renameDraft, setRenameDraft] = useState<string | null>(null)

  useEffect(() => setRenameDraft(null), [branch.name])

  const canSubmitRename = !!renameDraft?.trim() && renameDraft.trim() !== displayName && !renaming
  const submitRename = () => {
    if (!canSubmitRename || !renameDraft) return
    onRenameBranch?.(branch, renameDraft.trim())
    setRenameDraft(null)
  }

  return (
    <div className="sidebar-detail-panel">
      <div className="detail-type-badge">Remote Branch</div>
      <h3 className="detail-title">{displayName}</h3>
      <div className="detail-meta-grid">
        <div className="detail-meta-item">
          <span className="meta-label">Full Name</span>
          <code className="meta-value">{branch.name}</code>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Commit</span>
          <code className="meta-value">{branch.commit?.slice(0, 7) || '—'}</code>
        </div>
        {branch.lastCommitDate && (
          <div className="detail-meta-item">
            <span className="meta-label">Last Commit</span>
            <span className="meta-value">{formatDate(branch.lastCommitDate)}</span>
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

      {/* Rename Form */}
      {renameDraft !== null && !isMainOrMaster && (
        <div className="pr-create-form">
          <div className="pr-form-header">
            <span className="pr-form-title">Rename Remote Branch</span>
            <button className="pr-form-close" onClick={() => setRenameDraft(null)} title="Cancel">
              ×
            </button>
          </div>
          <div className="pr-form-field">
            <label className="pr-form-label">New Branch Name</label>
            <input
              type="text"
              className="pr-form-input"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              placeholder="new-branch-name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename()
                else if (e.key === 'Escape') setRenameDraft(null)
              }}
            />
          </div>
          <div className="pr-form-actions">
            <button className="btn btn-secondary" onClick={() => setRenameDraft(null)} disabled={renaming}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={submitRename} disabled={!canSubmitRename}>
              {renaming ? 'Renaming...' : 'Rename'}
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {renameDraft === null && (
        <div className="detail-actions">
          {onCheckoutRemoteBranch && (
            <button className="btn btn-primary" onClick={() => onCheckoutRemoteBranch(branch)} disabled={switching || deleting}>
              {switching ? 'Checking out...' : 'Checkout'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => window.electronAPI.openBranchInGitHub(branch.name)} disabled={deleting}>
            View on GitHub
          </button>
          {!isMainOrMaster && onRenameBranch && (
            <button className="btn btn-secondary" onClick={() => setRenameDraft(displayName)} disabled={switching || deleting || renaming}>
              {renaming ? 'Renaming...' : 'Rename Branch'}
            </button>
          )}
          {!isMainOrMaster && onDeleteRemoteBranch && (
            <button className="btn btn-secondary btn-danger" onClick={() => onDeleteRemoteBranch(branch)} disabled={switching || deleting}>
              {deleting ? 'Deleting...' : 'Delete Remote Branch'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function EditorRouter({
  focus,
  formatRelativeTime,
  formatDate,
  currentBranch,
  switching,
  deleting,
  renaming,
  onStatusChange,
  onRefresh,
  onClearFocus,
  onCheckoutBranch,
  onCheckoutRemoteBranch,
  onCheckoutWorktree,
  onDeleteBranch,
  onRenameBranch,
  onDeleteRemoteBranch,
  onOpenStaging,
  branches,
  repoPath,
  prs,
  worktrees,
  onFocusWorktree,
  onNavigateToPR,
  onOpenRepo,
  onOpenMailmap,
  onBranchClick,
}: EditorRouterProps) {
  switch (focus.type) {
    case 'pr': {
      // Handled by PRDetailPanel in parent - PR needs special handling
      // because it's shown inline in the radar view
      return null
    }

    case 'branch': {
      const branch = focus.data as Branch
      return (
        <BranchDetailPanel
          branch={branch}
          repoPath={repoPath ?? null}
          formatDate={formatDate}
          onStatusChange={onStatusChange}
          onCheckoutBranch={onCheckoutBranch}
          onDeleteBranch={onDeleteBranch}
          onRenameBranch={onRenameBranch}
          onOpenStaging={onOpenStaging}
          onNavigateToPR={onNavigateToPR}
          prs={prs}
          worktrees={worktrees}
          onFocusWorktree={onFocusWorktree}
          switching={switching}
          deleting={deleting}
          renaming={renaming}
        />
      )
    }

    case 'remote': {
      return (
        <RemoteBranchDetail
          branch={focus.data as Branch}
          formatDate={formatDate}
          switching={switching}
          deleting={deleting}
          renaming={renaming}
          onCheckoutRemoteBranch={onCheckoutRemoteBranch}
          onRenameBranch={onRenameBranch}
          onDeleteRemoteBranch={onDeleteRemoteBranch}
        />
      )
    }

    case 'worktree': {
      const wt = focus.data as Worktree
      return (
        <WorktreeDetailPanel
          worktree={wt}
          currentBranch={currentBranch}
          repoPath={repoPath ?? null}
          switching={switching}
          onStatusChange={onStatusChange}
          onRefresh={onRefresh}
          onClearFocus={onClearFocus}
          onCheckoutWorktree={onCheckoutWorktree}
          onOpenStaging={onOpenStaging}
          onBranchClick={onBranchClick}
        />
      )
    }

    case 'create-worktree': {
      return (
        <WorktreeCreatePanel
          branches={branches || []}
          repoPath={repoPath || ''}
          onStatusChange={onStatusChange}
          onRefresh={onRefresh}
          onClearFocus={onClearFocus}
          onWorktreeCreated={onFocusWorktree ? (path) => {
            // Fetch fresh worktrees and find the new one
            window.electronAPI.getWorktrees().then((result) => {
              if (!('error' in result)) {
                const newWorktree = result.find((wt) => wt.path === path)
                if (newWorktree) {
                  onFocusWorktree(newWorktree)
                } else {
                  onClearFocus?.()
                }
              } else {
                onClearFocus?.()
              }
            })
          } : undefined}
        />
      )
    }

    case 'stash': {
      const stash = focus.data as StashEntry
      return (
        <StashDetailPanel
          stash={stash}
          formatRelativeTime={formatRelativeTime}
          onStatusChange={onStatusChange}
          onRefresh={onRefresh}
          onClearFocus={onClearFocus}
        />
      )
    }

    case 'uncommitted': {
      // Render the full staging panel
      // This is handled by parent component which renders CommitCreatePanel directly
      return null
    }

    case 'mailmap': {
      return (
        <MailmapDetailPanel
          onStatusChange={onStatusChange}
        />
      )
    }

    case 'repo': {
      const repo = focus.data as RepoInfo
      return (
        <RepoDetailPanel
          repo={repo}
          onStatusChange={onStatusChange}
          onOpenRepo={onOpenRepo}
          onOpenMailmap={onOpenMailmap}
        />
      )
    }

    default:
      return null
  }
}
