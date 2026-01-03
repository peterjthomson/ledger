/**
 * Stash Service
 *
 * Pure functions for Stash operations.
 * All functions accept a RepositoryContext as the first parameter.
 *
 * SAFETY: These functions are pure - they don't access global state.
 * The caller is responsible for providing a valid, current context.
 */

import { RepositoryContext } from '@/lib/repositories'
import { StashEntry, StashFile, StashResult } from './stash-types'

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
