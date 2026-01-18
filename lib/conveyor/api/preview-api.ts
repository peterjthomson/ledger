/**
 * Preview API - Renderer-side API for the preview system
 *
 * Provides typed methods for previewing branches, PRs, worktrees, and commits.
 */

import { ConveyorApi } from '@/lib/preload/shared'

export class PreviewApi extends ConveyorApi {
  /**
   * Check if preview is available for a path (legacy Herd check)
   */
  checkAvailable = (worktreePath: string) => 
    this.invoke('preview:check-available', worktreePath)

  /**
   * Get available preview providers for a project
   */
  getProviders = (repoPath: string, targetPath?: string) =>
    this.invoke('preview:get-providers', repoPath, targetPath)

  /**
   * Preview a worktree with a specific provider
   */
  previewWorktree = (providerId: string, worktreePath: string, mainRepoPath: string) =>
    this.invoke('preview:worktree', providerId, worktreePath, mainRepoPath)

  /**
   * Preview a branch with a specific provider
   */
  previewBranch = (providerId: string, branchName: string, mainRepoPath: string) =>
    this.invoke('preview:branch', providerId, branchName, mainRepoPath)

  /**
   * Preview a PR with a specific provider
   */
  previewPR = (providerId: string, prNumber: number, prBranchName: string, mainRepoPath: string) =>
    this.invoke('preview:pr', providerId, prNumber, prBranchName, mainRepoPath)

  /**
   * Preview a commit with a specific provider
   */
  previewCommit = (providerId: string, commitHash: string, mainRepoPath: string) =>
    this.invoke('preview:commit', providerId, commitHash, mainRepoPath)

  /**
   * Auto-preview a worktree (picks best available provider)
   */
  autoPreviewWorktree = (worktreePath: string, mainRepoPath: string) =>
    this.invoke('preview:auto-worktree', worktreePath, mainRepoPath)

  /**
   * Auto-preview a branch (picks best available provider)
   */
  autoPreviewBranch = (branchName: string, mainRepoPath: string) =>
    this.invoke('preview:auto-branch', branchName, mainRepoPath)

  /**
   * Auto-preview a PR (picks best available provider)
   */
  autoPreviewPR = (prNumber: number, prBranchName: string, mainRepoPath: string) =>
    this.invoke('preview:auto-pr', prNumber, prBranchName, mainRepoPath)

  /**
   * Stop a preview
   */
  stop = (providerId: string, worktreePath: string) =>
    this.invoke('preview:stop', providerId, worktreePath)

  /**
   * Stop all previews
   */
  stopAll = () => this.invoke('preview:stop-all')

  /**
   * Check if a preview is running
   */
  isRunning = (providerId: string, worktreePath: string) =>
    this.invoke('preview:is-running', providerId, worktreePath)

  /**
   * Get URL of a running preview
   */
  getUrl = (providerId: string, worktreePath: string) =>
    this.invoke('preview:get-url', providerId, worktreePath)
}
