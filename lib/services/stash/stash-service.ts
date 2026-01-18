/**
 * Stash Service
 *
 * Pure functions for Stash operations.
 * All functions accept a RepositoryContext as the first parameter.
 *
 * SAFETY: These functions are pure - they don't access global state.
 * The caller is responsible for providing a valid, current context.
 */

import * as fs from 'fs'
import * as path from 'path'
import simpleGit from 'simple-git'
import { RepositoryContext } from '@/lib/repositories'
import { StashEntry, StashFile, StashResult, ApplyStashToBranchResult } from './stash-types'
import { getWorktrees } from '@/lib/services/worktree'

/**
 * Get list of stashes
 */
export async function getStashes(ctx: RepositoryContext): Promise<StashEntry[]> {
  try {
    const output = await ctx.git.raw(['stash', 'list', '--format=%gd|%gs|%ci'])

    if (!output.trim()) {
      return []
    }

    const stashes: StashEntry[] = []
    const lines = output.trim().split('\n')

    for (const line of lines) {
      const [indexStr, message, date] = line.split('|')
      // Parse stash@{0} to get index
      const indexMatch = indexStr.match(/stash@\{(\d+)\}/)
      const index = indexMatch ? parseInt(indexMatch[1]) : 0

      // Extract branch from message if present (format: "WIP on branch: message" or "On branch: message")
      const branchMatch = message.match(/(?:WIP )?[Oo]n ([^:]+):/)
      const branch = branchMatch ? branchMatch[1] : ''

      stashes.push({
        index,
        message: message.replace(/^(?:WIP )?[Oo]n [^:]+: /, ''),
        branch,
        date,
      })
    }

    return stashes
  } catch {
    return []
  }
}

/**
 * Get files changed in a stash
 */
export async function getStashFiles(ctx: RepositoryContext, stashIndex: number): Promise<StashFile[]> {
  try {
    // Run numstat and name-status separately (combining them only returns name-status)
    const [numstatOutput, nameStatusOutput] = await Promise.all([
      ctx.git.raw(['stash', 'show', `stash@{${stashIndex}}`, '--numstat']),
      ctx.git.raw(['stash', 'show', `stash@{${stashIndex}}`, '--name-status']),
    ])

    if (!numstatOutput.trim() && !nameStatusOutput.trim()) {
      return []
    }

    const files: StashFile[] = []

    // Parse numstat output (additions deletions filename)
    const numstatLines: Map<string, { additions: number; deletions: number }> = new Map()
    for (const line of numstatOutput.trim().split('\n')) {
      const numstatMatch = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
      if (numstatMatch) {
        const [, adds, dels, path] = numstatMatch
        numstatLines.set(path, {
          additions: adds === '-' ? 0 : parseInt(adds),
          deletions: dels === '-' ? 0 : parseInt(dels),
        })
      }
    }

    // Parse name-status output (status filename)
    const statusLines: Map<string, string> = new Map()
    for (const line of nameStatusOutput.trim().split('\n')) {
      const statusMatch = line.match(/^([AMDRC])\t(.+)$/)
      if (statusMatch) {
        const [, status, path] = statusMatch
        statusLines.set(path, status)
      }
    }

    // Combine the information
    for (const [path, stats] of numstatLines) {
      const statusCode = statusLines.get(path) || 'M'
      let status: StashFile['status'] = 'modified'

      switch (statusCode) {
        case 'A':
          status = 'added'
          break
        case 'D':
          status = 'deleted'
          break
        case 'R':
          status = 'renamed'
          break
        default:
          status = 'modified'
      }

      files.push({
        path,
        status,
        additions: stats.additions,
        deletions: stats.deletions,
      })
    }

    return files
  } catch {
    return []
  }
}

/**
 * Get diff for a specific file in a stash
 * Note: git stash show doesn't support -- filepath syntax, so we use git diff instead
 */
export async function getStashFileDiff(
  ctx: RepositoryContext,
  stashIndex: number,
  filePath: string
): Promise<string | null> {
  try {
    // Compare the stash's parent commit with the stash itself for the specific file
    const stashRef = `stash@{${stashIndex}}`
    const output = await ctx.git.raw(['diff', `${stashRef}^`, stashRef, '--', filePath])
    return output || null
  } catch {
    return null
  }
}

/**
 * Get full diff for a stash
 */
export async function getStashDiff(ctx: RepositoryContext, stashIndex: number): Promise<string | null> {
  try {
    const output = await ctx.git.raw(['stash', 'show', '-p', `stash@{${stashIndex}}`])
    return output || null
  } catch {
    return null
  }
}

/**
 * Apply a stash (keeps stash in list)
 */
export async function applyStash(ctx: RepositoryContext, stashIndex: number): Promise<StashResult> {
  try {
    await ctx.git.raw(['stash', 'apply', `stash@{${stashIndex}}`])
    return { success: true, message: `Applied stash@{${stashIndex}}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Pop a stash (applies and removes from list)
 */
export async function popStash(ctx: RepositoryContext, stashIndex: number): Promise<StashResult> {
  try {
    await ctx.git.raw(['stash', 'pop', `stash@{${stashIndex}}`])
    return { success: true, message: `Applied and removed stash@{${stashIndex}}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Drop a stash (removes without applying)
 */
export async function dropStash(ctx: RepositoryContext, stashIndex: number): Promise<StashResult> {
  try {
    await ctx.git.raw(['stash', 'drop', `stash@{${stashIndex}}`])
    return { success: true, message: `Dropped stash@{${stashIndex}}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Create a branch from a stash
 * git stash branch <branchname> [<stash>]
 * Creates a new branch starting from the commit at which the stash was created,
 * applies the stash, and drops it if successful
 */
export async function stashToBranch(
  ctx: RepositoryContext,
  stashIndex: number,
  branchName: string
): Promise<StashResult> {
  try {
    await ctx.git.raw(['stash', 'branch', branchName, `stash@{${stashIndex}}`])
    return { success: true, message: `Created branch '${branchName}' from stash@{${stashIndex}}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Apply a stash to a different branch via worktree
 * Creates a worktree for the target branch (or uses existing one),
 * applies the stash, commits, and optionally cleans up.
 * This allows applying stashes to branches without switching your current context.
 */
export async function applyStashToBranch(
  ctx: RepositoryContext,
  stashIndex: number,
  targetBranch: string,
  stashMessage: string,
  keepWorktree: boolean = false
): Promise<ApplyStashToBranchResult> {
  const git = ctx.git
  if (!git) throw new Error('No repository selected')
  if (!ctx.path) throw new Error('No repository path set')

  try {
    // Get the stash ref
    const stashRef = `stash@{${stashIndex}}`

    // Check if target branch has an existing worktree
    const worktrees = await getWorktrees(ctx)
    const existingWorktree = worktrees.find((wt) => wt.branch === targetBranch)

    if (existingWorktree) {
      // Apply stash to existing worktree
      const worktreeGit = simpleGit(existingWorktree.path)
      await worktreeGit.raw(['stash', 'apply', stashRef])

      return {
        success: true,
        message: `Applied stash to existing worktree at ${existingWorktree.path}. Changes are uncommitted.`,
        usedExistingWorktree: true,
        worktreePath: existingWorktree.path,
      }
    }

    // No existing worktree - create one in .worktrees/ directory
    // Sanitize branch name for folder (replace / with -)
    const sanitizedBranch = targetBranch.replace(/\//g, '-').replace(/[^a-zA-Z0-9-_]/g, '')
    const worktreePath = path.join(ctx.path, '.worktrees', sanitizedBranch)

    try {
      // Create .worktrees directory if needed
      await fs.promises.mkdir(path.dirname(worktreePath), { recursive: true })

      // Create worktree for the target branch
      await git.raw(['worktree', 'add', worktreePath, targetBranch])

      // Apply stash in the worktree
      const worktreeGit = simpleGit(worktreePath)
      await worktreeGit.raw(['stash', 'apply', stashRef])

      // Stage all changes
      await worktreeGit.add('.')

      // Commit with a descriptive message
      const commitMessage = stashMessage
        ? `Apply stash: ${stashMessage}`
        : `Apply stash@{${stashIndex}}`
      await worktreeGit.commit(commitMessage)

      // Get the commit hash for the message
      const log = await worktreeGit.log(['-1', '--format=%h'])
      const commitHash = log.latest?.hash || 'unknown'

      if (keepWorktree) {
        // User wants to keep the worktree for further work
        return {
          success: true,
          message: `Applied stash to '${targetBranch}' (commit ${commitHash}). Worktree available at .worktrees/${sanitizedBranch}`,
          usedExistingWorktree: false,
          worktreePath,
        }
      }

      // Clean up: remove the worktree
      await git.raw(['worktree', 'remove', worktreePath])

      return {
        success: true,
        message: `Applied stash to '${targetBranch}' (commit ${commitHash}). Worktree cleaned up.`,
        usedExistingWorktree: false,
      }
    } catch (innerError) {
      // Try to clean up the worktree if something went wrong
      try {
        await git.raw(['worktree', 'remove', '--force', worktreePath])
      } catch {
        // Ignore cleanup errors
      }
      throw innerError
    }
  } catch (error) {
    return {
      success: false,
      message: (error as Error).message,
      usedExistingWorktree: false,
    }
  }
}
