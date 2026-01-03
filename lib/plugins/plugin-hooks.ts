/**
 * Plugin Hooks Integration
 *
 * Helper functions for calling plugin hooks at the right points
 * in the application lifecycle.
 */

import { pluginManager } from './plugin-manager'
import type { Commit, PullRequest, Branch } from '@/app/types/electron'
import type {
  CommitAnalysis,
  BranchAnalysis,
  PRReviewSuggestion,
  UIBadge,
  MenuItem,
  ContextMenuTarget,
} from './plugin-types'

// ============================================================================
// Git Lifecycle Hooks
// ============================================================================

/**
 * Call before checkout - returns false if any plugin cancels
 */
export async function beforeCheckout(branch: string): Promise<boolean> {
  const result = await pluginManager.callHook('git:before-checkout', branch)
  return result !== false
}

/**
 * Call after checkout
 */
export async function afterCheckout(branch: string): Promise<void> {
  await pluginManager.callHook('git:after-checkout', branch)
}

/**
 * Call before commit - may transform the message
 */
export async function beforeCommit(message: string): Promise<string> {
  const result = await pluginManager.callHook('git:before-commit', message)
  return typeof result === 'string' ? result : message
}

/**
 * Call after commit
 */
export async function afterCommit(hash: string): Promise<void> {
  await pluginManager.callHook('git:after-commit', hash)
}

/**
 * Call before push - returns false if any plugin cancels
 */
export async function beforePush(branch: string): Promise<boolean> {
  const result = await pluginManager.callHook('git:before-push', branch)
  return result !== false
}

/**
 * Call after push
 */
export async function afterPush(branch: string): Promise<void> {
  await pluginManager.callHook('git:after-push', branch)
}

/**
 * Call before pull - returns false if any plugin cancels
 */
export async function beforePull(branch: string): Promise<boolean> {
  const result = await pluginManager.callHook('git:before-pull', branch)
  return result !== false
}

/**
 * Call after pull
 */
export async function afterPull(branch: string): Promise<void> {
  await pluginManager.callHook('git:after-pull', branch)
}

// ============================================================================
// Repository Lifecycle Hooks
// ============================================================================

/**
 * Call when a repository is opened
 */
export async function repoOpened(path: string): Promise<void> {
  await pluginManager.callHook('repo:opened', path)
}

/**
 * Call when a repository is closed (before switching to another)
 */
export async function repoClosed(path: string): Promise<void> {
  await pluginManager.callHook('repo:closed', path)
}

/**
 * Call after repository data is refreshed
 */
export async function repoRefreshed(): Promise<void> {
  await pluginManager.callHook('repo:refreshed')
}

// ============================================================================
// AI Analysis Hooks
// ============================================================================

/**
 * Analyze a commit using AI plugins
 */
export async function analyzeCommit(commit: Commit): Promise<CommitAnalysis | null> {
  return pluginManager.callHook('ai:analyze-commit', commit)
}

/**
 * Analyze a branch using AI plugins
 */
export async function analyzeBranch(
  branch: Branch,
  commits: Commit[]
): Promise<BranchAnalysis | null> {
  return pluginManager.callHook('ai:analyze-branch', branch, commits)
}

/**
 * Get PR review suggestions from AI plugins
 */
export async function reviewPR(
  pr: PullRequest,
  diff: string
): Promise<PRReviewSuggestion[]> {
  const results = await pluginManager.callHookAll('ai:review-pr', pr, diff)
  return results.flat()
}

/**
 * Get commit message suggestion from AI plugins
 */
export async function suggestCommitMessage(diff: string): Promise<string | null> {
  return pluginManager.callHook('ai:suggest-commit-message', diff)
}

/**
 * Summarize changes from AI plugins
 */
export async function summarizeChanges(commits: Commit[]): Promise<string | null> {
  return pluginManager.callHook('ai:summarize-changes', commits)
}

// ============================================================================
// UI Extension Hooks
// ============================================================================

/**
 * Get badge for a commit from plugins
 */
export async function getCommitBadge(commit: Commit): Promise<UIBadge | null> {
  return pluginManager.callHook('ui:commit-badge', commit)
}

/**
 * Get badge for a branch from plugins
 */
export async function getBranchBadge(branch: Branch): Promise<UIBadge | null> {
  return pluginManager.callHook('ui:branch-badge', branch)
}

/**
 * Get badge for a PR from plugins
 */
export async function getPRBadge(pr: PullRequest): Promise<UIBadge | null> {
  return pluginManager.callHook('ui:pr-badge', pr)
}

/**
 * Get context menu items from all plugins
 */
export async function getContextMenuItems(target: ContextMenuTarget): Promise<MenuItem[]> {
  const results = await pluginManager.callHookAll('ui:context-menu-items', target)
  return results.flat()
}

// ============================================================================
// Hook Availability Checks
// ============================================================================

/**
 * Check if any AI analysis plugins are available
 */
export function hasAIAnalysis(): boolean {
  return (
    pluginManager.hasHook('ai:analyze-commit') ||
    pluginManager.hasHook('ai:review-pr') ||
    pluginManager.hasHook('ai:suggest-commit-message')
  )
}

/**
 * Check if commit message suggestion is available
 */
export function hasCommitMessageSuggestion(): boolean {
  return pluginManager.hasHook('ai:suggest-commit-message')
}

/**
 * Check if PR review is available
 */
export function hasPRReview(): boolean {
  return pluginManager.hasHook('ai:review-pr')
}
