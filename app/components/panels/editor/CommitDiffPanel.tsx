/**
 * CommitDiffPanel - Displays commit diffs with expandable file sections
 *
 * Shows commit metadata in a standardized panel format, then file-by-file diffs
 * with syntax highlighting for additions/deletions.
 */

import { useState, useEffect } from 'react'
import type { CommitDiff, GraphCommit, Branch } from '../../../types/electron'

export interface CommitDiffPanelProps {
  diff: CommitDiff
  selectedCommit?: GraphCommit | null
  formatRelativeTime: (date: string) => string
  onBranchClick?: (branchName: string) => void
  branches?: Branch[]
}

export function CommitDiffPanel({ diff, selectedCommit, formatRelativeTime, onBranchClick, branches }: CommitDiffPanelProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

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

  // Expand all files by default on mount or diff change
  useEffect(() => {
    setExpandedFiles(new Set(diff.files.map((f) => f.file.path)))
  }, [diff])

  // Extract branch refs from selectedCommit (filter out tags and standalone HEAD)
  // Handle formats like: "HEAD -> feature/branch", "origin/main", "tag: v1.0"
  const branchRefs = selectedCommit?.refs
    .filter((ref) => !ref.startsWith('tag:') && ref !== 'HEAD')
    .map((ref) => {
      // Handle "HEAD -> branchname" format (current branch)
      if (ref.startsWith('HEAD -> ')) {
        return ref.replace('HEAD -> ', '')
      }
      // Remove origin/ prefix for remote tracking refs
      return ref.replace(/^origin\//, '')
    })
    .filter((ref) => ref && ref !== 'HEAD') || []

  // Find the primary branch (first local branch, or first ref)
  const primaryBranch = branchRefs.find((ref) => 
    branches?.some((b) => b.name === ref && !b.isRemote)
  ) || branchRefs[0] || null

  // Handle branch click - find the actual branch object
  const handleBranchClick = (branchName: string) => {
    if (onBranchClick) {
      onBranchClick(branchName)
    }
  }

  return (
    <div className="diff-panel sidebar-detail-panel">
      {/* Meta panel header */}
      <div className="detail-type-badge">Commit</div>
      <h3 className="detail-title commit-title">{diff.message}</h3>
      
      {/* Branch reference - below title, label on own line */}
      {primaryBranch && (
        <div className="commit-branch-section">
          <span className="commit-branch-label">Branch</span>
          <button
            className="commit-branch-link"
            onClick={() => handleBranchClick(primaryBranch)}
            title={`Go to branch: ${primaryBranch}`}
          >
            <span className="branch-icon">⎇</span>
            {primaryBranch}
            {branchRefs.length > 1 && (
              <span className="branch-count">+{branchRefs.length - 1}</span>
            )}
          </button>
        </div>
      )}

      {/* Standardized meta grid */}
      <div className="detail-meta-grid">
        <div className="detail-meta-item">
          <span className="meta-label">Hash</span>
          <code className="meta-value">{diff.hash.slice(0, 7)}</code>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Author</span>
          <span className="meta-value">{diff.author}</span>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Date</span>
          <span className="meta-value">{formatRelativeTime(diff.date)}</span>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Changes</span>
          <span className="meta-value diff-stats-inline">
            <span className="diff-stat-files">
              {diff.files.length} {diff.files.length === 1 ? 'file' : 'files'}
            </span>
            <span className="diff-stat-additions">+{diff.totalAdditions}</span>
            <span className="diff-stat-deletions">-{diff.totalDeletions}</span>
          </span>
        </div>
      </div>

      {/* File list with diffs */}
      <div className="diff-files">
        {diff.files.map((fileDiff) => (
          <div key={fileDiff.file.path} className="diff-file">
            <div className="diff-file-header" onClick={() => toggleFile(fileDiff.file.path)}>
              <span className={`diff-file-chevron ${expandedFiles.has(fileDiff.file.path) ? 'open' : ''}`}>▸</span>
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
                {fileDiff.file.additions > 0 && <span className="diff-additions">+{fileDiff.file.additions}</span>}
                {fileDiff.file.deletions > 0 && <span className="diff-deletions">-{fileDiff.file.deletions}</span>}
              </span>
            </div>

            {expandedFiles.has(fileDiff.file.path) && (
              <div className="diff-file-content">
                {fileDiff.isBinary ? (
                  <div className="diff-binary">Binary file</div>
                ) : fileDiff.hunks.length === 0 ? (
                  <div className="diff-empty">No changes</div>
                ) : (
                  fileDiff.hunks.map((hunk, hunkIdx) => (
                    <div key={hunkIdx} className="diff-hunk">
                      <div className="diff-hunk-header">
                        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                      </div>
                      <div className="diff-hunk-lines">
                        {hunk.lines.map((line, lineIdx) => (
                          <div key={lineIdx} className={`diff-line diff-line-${line.type}`}>
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
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

