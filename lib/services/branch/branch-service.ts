/**
 * Branch Service
 *
 * Pure functions for branch operations.
 * All functions accept a RepositoryContext as the first parameter.
 *
 * SAFETY: These functions are pure - they don't access global state.
 * The caller is responsible for providing a valid, current context.
 */

import { RepositoryContext } from '@/lib/repositories'
import {
  BranchInfo,
  BranchesResult,
  BranchMetadata,
  CheckoutResult,
  PushResult,
  CreateBranchResult,
} from './branch-types'

/**
 * Get all branches with basic info
 */
export async function getBranches(ctx: RepositoryContext): Promise<BranchesResult> {
  const result = await ctx.git.branch(['-a', '-v'])

  // Get list of remote branch names for local-only detection
  const remoteBranches = new Set<string>()
  Object.keys(result.branches).forEach((name) => {
    if (name.startsWith('remotes/')) {
      // Extract branch name without remote prefix (e.g., "remotes/origin/main" -> "main")
      const parts = name.replace('remotes/', '').split('/')
      parts.shift() // remove origin or other remote name
      remoteBranches.add(parts.join('/'))
    }
  })

  const branches: BranchInfo[] = Object.entries(result.branches).map(([name, data]) => ({
    name,
    current: data.current,
    commit: data.commit,
    label: data.label,
    isRemote: name.startsWith('remotes/'),
    isLocalOnly: !name.startsWith('remotes/') && !remoteBranches.has(name),
  }))

  return {
    current: result.current,
    branches,
  }
}

/**
 * Get metadata for a single branch (expensive operation)
 */
export async function getBranchMetadata(
  ctx: RepositoryContext,
  branchName: string
): Promise<BranchMetadata> {
  // Get last commit date
  const lastCommit = await ctx.git.log([branchName, '-1', '--format=%ci'])
  const lastCommitDate = lastCommit.latest?.date || ''

  // Get first commit date (oldest commit on this branch)
  const firstCommitRaw = await ctx.git.raw(['log', branchName, '--reverse', '--format=%ci', '-1'])
  const firstCommitDate = firstCommitRaw.trim()

  // Get commit count
  const countRaw = await ctx.git.raw(['rev-list', '--count', branchName])
  const commitCount = parseInt(countRaw.trim(), 10) || 0

  return {
    lastCommitDate,
    firstCommitDate,
    commitCount,
  }
}

/**
 * Get branches that are not merged into the base branch
 */
export async function getUnmergedBranches(
  ctx: RepositoryContext,
  baseBranch: string = 'origin/master'
): Promise<string[]> {
  try {
    // Try origin/master first, fall back to origin/main
    let targetBranch = baseBranch
    try {
      await ctx.git.raw(['rev-parse', '--verify', baseBranch])
    } catch {
      targetBranch = 'origin/main'
      try {
        await ctx.git.raw(['rev-parse', '--verify', targetBranch])
      } catch {
        // Neither exists, return empty
        return []
      }
    }

    // Get branches not merged into the target
    const result = await ctx.git.raw(['branch', '-a', '--no-merged', targetBranch])
    return result
      .split('\n')
      .map((b) => b.trim().replace(/^\* /, ''))
      .filter((b) => b && !b.includes('HEAD'))
  } catch {
    return []
  }
}

/**
 * Get branches with basic info and merged status (fast)
 */
export async function getBranchesBasic(ctx: RepositoryContext): Promise<BranchesResult> {
  const { current, branches } = await getBranches(ctx)
  const unmergedBranches = await getUnmergedBranches(ctx)
  const unmergedSet = new Set(unmergedBranches)

  // Just add isMerged status - no expensive per-branch metadata
  const branchesWithMergedStatus = branches.map((branch) => ({
    ...branch,
    isMerged: !unmergedSet.has(branch.name),
  }))

  return {
    current,
    branches: branchesWithMergedStatus,
  }
}

/**
 * Get branches with full metadata (expensive - use for background loading)
 */
export async function getBranchesWithMetadata(ctx: RepositoryContext): Promise<BranchesResult> {
  const { current, branches } = await getBranches(ctx)
  const unmergedBranches = await getUnmergedBranches(ctx)
  const unmergedSet = new Set(unmergedBranches)

  // Get metadata for all branches in parallel (batched to avoid overwhelming git)
  const batchSize = 10
  const branchesWithMeta: BranchInfo[] = []

  for (let i = 0; i < branches.length; i += batchSize) {
    const batch = branches.slice(i, i + batchSize)
    const metadataPromises = batch.map(async (branch) => {
      try {
        const meta = await getBranchMetadata(ctx, branch.name)
        return {
          ...branch,
          lastCommitDate: meta.lastCommitDate,
          firstCommitDate: meta.firstCommitDate,
          commitCount: meta.commitCount,
          isMerged: !unmergedSet.has(branch.name),
        }
      } catch {
        return {
          ...branch,
          isMerged: !unmergedSet.has(branch.name),
        }
      }
    })

    const results = await Promise.all(metadataPromises)
    branchesWithMeta.push(...results)
  }

  return {
    current,
    branches: branchesWithMeta,
  }
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(ctx: RepositoryContext): Promise<boolean> {
  const status = await ctx.git.status()
  return !status.isClean() || status.not_added.length > 0
}

/**
 * Stash uncommitted changes
 */
export async function stashChanges(
  ctx: RepositoryContext
): Promise<{ stashed: boolean; message: string }> {
  const hasChanges = await hasUncommittedChanges(ctx)
  if (!hasChanges) {
    return { stashed: false, message: 'No changes to stash' }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const stashMessage = `Ledger auto-stash ${timestamp}`

  await ctx.git.stash(['push', '-m', stashMessage, '--include-untracked'])
  return { stashed: true, message: stashMessage }
}

/**
 * Checkout a local branch
 */
export async function checkoutBranch(
  ctx: RepositoryContext,
  branchName: string
): Promise<CheckoutResult> {
  try {
    // Stash any uncommitted changes first
    const stashResult = await stashChanges(ctx)

    // Checkout the branch with --ignore-other-worktrees to allow checking out
    // branches that are already checked out in other worktrees
    await ctx.git.checkout(['--ignore-other-worktrees', branchName])

    return {
      success: true,
      message: `Switched to branch '${branchName}'`,
      stashed: stashResult.stashed ? stashResult.message : undefined,
    }
  } catch (error) {
    return {
      success: false,
      message: (error as Error).message,
    }
  }
}

/**
 * Push a branch to origin
 */
export async function pushBranch(
  ctx: RepositoryContext,
  branchName?: string,
  setUpstream: boolean = true
): Promise<PushResult> {
  try {
    // Get current branch if not specified
    const branch = branchName || (await ctx.git.branchLocal()).current

    if (setUpstream) {
      await ctx.git.push(['--set-upstream', 'origin', branch])
    } else {
      await ctx.git.push('origin', branch)
    }

    return { success: true, message: `Pushed ${branch} to origin` }
  } catch (error) {
    const errorMessage = (error as Error).message

    // Handle common errors
    if (errorMessage.includes('no upstream')) {
      return { success: false, message: 'No upstream branch set. Try pushing with set-upstream.' }
    }
    if (errorMessage.includes('rejected')) {
      return { success: false, message: 'Push rejected. Pull changes first or force push.' }
    }
    if (errorMessage.includes('Permission denied') || errorMessage.includes('authentication')) {
      return { success: false, message: 'Authentication failed. Check your Git credentials.' }
    }

    return { success: false, message: errorMessage }
  }
}

/**
 * Create a new branch
 */
export async function createBranch(
  ctx: RepositoryContext,
  branchName: string,
  checkout: boolean = true
): Promise<CreateBranchResult> {
  try {
    // Validate branch name
    const trimmedName = branchName.trim()
    if (!trimmedName) {
      return { success: false, message: 'Branch name cannot be empty' }
    }

    // Check for invalid characters
    if (
      /[\s~^:?*[\]\\]/.test(trimmedName) ||
      trimmedName.startsWith('-') ||
      trimmedName.endsWith('.') ||
      trimmedName.includes('..')
    ) {
      return { success: false, message: 'Invalid branch name. Avoid spaces and special characters.' }
    }

    // Check if branch already exists
    const branches = await ctx.git.branchLocal()
    if (branches.all.includes(trimmedName)) {
      return { success: false, message: `Branch '${trimmedName}' already exists` }
    }

    if (checkout) {
      await ctx.git.checkoutLocalBranch(trimmedName)
      return { success: true, message: `Created and switched to branch '${trimmedName}'` }
    } else {
      await ctx.git.branch([trimmedName])
      return { success: true, message: `Created branch '${trimmedName}'` }
    }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Checkout a remote branch (creates local tracking branch)
 */
export async function checkoutRemoteBranch(
  ctx: RepositoryContext,
  remoteBranch: string
): Promise<CheckoutResult> {
  try {
    // Stash any uncommitted changes first
    const stashResult = await stashChanges(ctx)

    // Extract the local branch name from remote (e.g., "remotes/origin/feature" -> "feature")
    const parts = remoteBranch.replace('remotes/', '').split('/')
    parts.shift() // remove "origin" or other remote name
    const localBranchName = parts.join('/')

    // Check if local branch already exists
    const branches = await ctx.git.branchLocal()
    if (branches.all.includes(localBranchName)) {
      await ctx.git.checkout(['--ignore-other-worktrees', localBranchName])
      return {
        success: true,
        message: `Switched to existing branch '${localBranchName}'`,
        stashed: stashResult.stashed ? stashResult.message : undefined,
      }
    }

    // Create and checkout tracking branch
    await ctx.git.checkout([
      '--ignore-other-worktrees',
      '-b',
      localBranchName,
      '--track',
      remoteBranch.replace('remotes/', ''),
    ])

    return {
      success: true,
      message: `Created and switched to branch '${localBranchName}' tracking '${remoteBranch}'`,
      stashed: stashResult.stashed ? stashResult.message : undefined,
    }
  } catch (error) {
    return {
      success: false,
      message: (error as Error).message,
    }
  }
}

/**
 * Pull a remote branch
 */
export async function pullBranch(
  ctx: RepositoryContext,
  remoteBranch: string
): Promise<CheckoutResult> {
  try {
    // Stash any uncommitted changes first
    const stashResult = await stashChanges(ctx)

    // Extract remote and branch name
    const parts = remoteBranch.replace('remotes/', '').split('/')
    const remote = parts[0]
    const branch = parts.slice(1).join('/')

    await ctx.git.pull(remote, branch)

    return {
      success: true,
      message: `Pulled ${branch} from ${remote}`,
      stashed: stashResult.stashed ? stashResult.message : undefined,
    }
  } catch (error) {
    return {
      success: false,
      message: (error as Error).message,
    }
  }
}

/**
 * Delete a local branch
 */
export async function deleteBranch(
  ctx: RepositoryContext,
  branchName: string,
  force: boolean = false
): Promise<{ success: boolean; message: string }> {
  try {
    const args = force ? ['-D', branchName] : ['-d', branchName]
    await ctx.git.branch(args)
    return { success: true, message: `Deleted branch '${branchName}'` }
  } catch (error) {
    const errorMessage = (error as Error).message
    if (errorMessage.includes('not fully merged')) {
      return {
        success: false,
        message: `Branch '${branchName}' is not fully merged. Use force delete if you're sure.`,
      }
    }
    return { success: false, message: errorMessage }
  }
}
