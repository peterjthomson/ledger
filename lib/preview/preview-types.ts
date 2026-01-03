/**
 * Preview Provider Types
 *
 * Common types for the extensible preview system.
 */

/**
 * Preview provider type - determines workflow
 */
export type PreviewType = 'local' | 'cloud'

/**
 * Result of checking provider availability
 */
export interface ProviderAvailability {
  /** Provider tool is installed/configured */
  available: boolean
  /** Project is compatible with this provider */
  compatible: boolean
  /** Why not available/compatible (for tooltips) */
  reason?: string
}

/**
 * Result of creating a preview
 */
export interface PreviewResult {
  success: boolean
  message: string
  /** Preview URL (opened in browser) */
  url?: string
  /** For cloud providers: deployment ID */
  deploymentId?: string
  /** Non-fatal issues during setup */
  warnings?: string[]
}

/**
 * Worktree creation function signature
 * (passed in from git-service to avoid circular deps)
 */
export type CreateWorktreeFn = (options: {
  branchName?: string
  commitHash?: string
  folderPath: string
  isNewBranch: boolean
}) => Promise<{ success: boolean; message: string; path?: string }>

/**
 * Preview Provider Interface
 *
 * Each provider implements this interface to integrate with Ledger's
 * preview system. Providers can be built-in or added via plugins.
 */
export interface PreviewProvider {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Short description */
  description: string
  /** Icon (Lucide icon name) */
  icon: string
  /** Local or cloud-based */
  type: PreviewType

  /**
   * Check if this provider is available and compatible with the project.
   * Called when detail panels render to determine button visibility.
   *
   * @param repoPath - Main repository path
   * @param targetPath - Worktree/branch path to preview (may be same as repoPath)
   */
  checkAvailability(repoPath: string, targetPath?: string): Promise<ProviderAvailability>

  /**
   * Preview an existing worktree in the browser.
   *
   * @param worktreePath - Path to the worktree
   * @param mainRepoPath - Path to main repo (for symlinks, env copying)
   * @param createWorktree - Function to create worktrees (from git-service)
   */
  previewWorktree(
    worktreePath: string,
    mainRepoPath: string,
    createWorktree: CreateWorktreeFn
  ): Promise<PreviewResult>

  /**
   * Preview a branch (creates ephemeral worktree if needed).
   *
   * @param branchName - Branch to preview
   * @param mainRepoPath - Path to main repo
   * @param createWorktree - Function to create worktrees (from git-service)
   */
  previewBranch(
    branchName: string,
    mainRepoPath: string,
    createWorktree: CreateWorktreeFn
  ): Promise<PreviewResult>

  /**
   * Preview a PR (creates ephemeral worktree if needed).
   *
   * @param prNumber - PR number
   * @param prBranchName - PR's head branch
   * @param mainRepoPath - Path to main repo
   * @param createWorktree - Function to create worktrees (from git-service)
   */
  previewPR(
    prNumber: number,
    prBranchName: string,
    mainRepoPath: string,
    createWorktree: CreateWorktreeFn
  ): Promise<PreviewResult>

  /**
   * Optional: Stop a running preview
   */
  stop?(worktreePath: string): void

  /**
   * Optional: Stop all previews from this provider
   */
  stopAll?(): void

  /**
   * Optional: Check if preview is running for a path
   */
  isRunning?(worktreePath: string): boolean

  /**
   * Optional: Get URL of running preview
   */
  getUrl?(worktreePath: string): string | null
}
