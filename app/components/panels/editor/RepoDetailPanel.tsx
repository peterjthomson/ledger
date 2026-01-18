/**
 * RepoDetailPanel - Repository detail editor panel
 *
 * Shows details about a selected repository with actions:
 * - Open Folder (always)
 * - Open in Ledger (if not current repo)
 * - Manage Contributors (if current repo)
 * - Open on GitHub (if current repo)
 */

import { useState, useEffect } from 'react'
import type { RepoInfo } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'

export interface RepoDetailPanelProps {
  repo: RepoInfo
  onStatusChange?: (status: StatusMessage | null) => void
  onOpenRepo?: (repo: RepoInfo) => void
  onOpenMailmap?: () => void
}

export function RepoDetailPanel({
  repo,
  onStatusChange,
  onOpenRepo,
  onOpenMailmap,
}: RepoDetailPanelProps) {
  const [githubUrl, setGithubUrl] = useState<string | null>(null)

  // Fetch GitHub URL when repo changes (only for current repo)
  useEffect(() => {
    if (repo.isCurrent) {
      window.electronAPI
        .getGitHubUrl()
        .then(setGithubUrl)
        .catch(() => setGithubUrl(null))
    } else {
      setGithubUrl(null)
    }
  }, [repo.path, repo.isCurrent])

  const handleOpenFolder = async () => {
    try {
      await window.electronAPI.openWorktree(repo.path)
    } catch (error) {
      onStatusChange?.({ type: 'error', message: `Failed to open folder: ${(error as Error).message}` })
    }
  }

  const handleOpenInLedger = () => {
    if (repo.isCurrent) return
    onOpenRepo?.(repo)
  }

  const handleOpenGitHub = () => {
    if (githubUrl) {
      window.open(githubUrl, '_blank')
    }
  }

  return (
    <div className="sidebar-detail-panel">
      <div className="detail-type-badge">Repository</div>
      <h3 className="detail-title">{repo.name}</h3>

      <div className="detail-meta-grid">
        <div className="detail-meta-item">
          <span className="meta-label">Path</span>
          <code className="meta-value" title={repo.path}>
            {repo.path}
          </code>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Status</span>
          <span className="meta-value">{repo.isCurrent ? 'Currently open in Ledger' : 'Not open'}</span>
        </div>
        {githubUrl && (
          <div className="detail-meta-item">
            <span className="meta-label">GitHub</span>
            <a 
              className="meta-value meta-link" 
              href={githubUrl} 
              onClick={(e) => {
                e.preventDefault()
                handleOpenGitHub()
              }}
              title={githubUrl}
            >
              {githubUrl.replace('https://github.com/', '')}
            </a>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="detail-actions">
        <button className="btn btn-secondary" onClick={handleOpenFolder}>
          Open Folder
        </button>

        {!repo.isCurrent && onOpenRepo && (
          <button className="btn btn-primary" onClick={handleOpenInLedger}>
            Open in Ledger
          </button>
        )}

        {repo.isCurrent && onOpenMailmap && (
          <button className="btn btn-primary" onClick={onOpenMailmap}>
            Manage Contributors
          </button>
        )}

        {repo.isCurrent && githubUrl && (
          <button className="btn btn-secondary" onClick={handleOpenGitHub}>
            Open on GitHub
          </button>
        )}
      </div>

    </div>
  )
}

