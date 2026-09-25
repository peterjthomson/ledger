/**
 * Staging Service
 *
 * Pure functions for Staging operations.
 * All functions accept a RepositoryContext as the first parameter.
 *
 * SAFETY: These functions are pure - they don't access global state.
 * The caller is responsible for providing a valid, current context.
 */

import { buildPartialPatch } from './partial-patch'
import { parseDiff, buildUntrackedFileDiff } from './diff-parser'
import * as fs from 'fs'
import * as path from 'path'
import { RepositoryContext } from '@/lib/repositories'
import { StagingFileDiff, StagingResult } from './staging-types'
import type { SimpleGit } from 'simple-git'

/**
 * Validate that a context is a local repository with git and path.
 * Returns the validated git and path, or throws if invalid.
 */
function requireLocalRepo(ctx: RepositoryContext): { git: SimpleGit; repoPath: string } {
  if (!ctx.git) {
    throw new Error('No git instance available (remote repository?)')
  }
  if (!ctx.path) {
    throw new Error('No repository path available (remote repository?)')
  }
  return { git: ctx.git, repoPath: ctx.path }
}

/**
 * Stage a single file
 */
export async function stageFile(ctx: RepositoryContext, filePath: string): Promise<StagingResult> {
  try {
    const { git } = requireLocalRepo(ctx)
    await git.add(filePath)
    return { success: true, message: `Staged ${filePath}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Unstage a single file
 */
export async function unstageFile(ctx: RepositoryContext, filePath: string): Promise<StagingResult> {
  try {
    const { git } = requireLocalRepo(ctx)
    await git.raw(['restore', '--staged', filePath])
    return { success: true, message: `Unstaged ${filePath}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Stage all changes
 */
export async function stageAll(ctx: RepositoryContext): Promise<StagingResult> {
  try {
    const { git } = requireLocalRepo(ctx)
    await git.add('-A')
    return { success: true, message: 'Staged all changes' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Unstage all changes
 */
export async function unstageAll(ctx: RepositoryContext): Promise<StagingResult> {
  try {
    const { git } = requireLocalRepo(ctx)
    await git.raw(['restore', '--staged', '.'])
    return { success: true, message: 'Unstaged all changes' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Discard changes in a file (revert to last commit)
 */
export async function discardFileChanges(ctx: RepositoryContext, filePath: string): Promise<StagingResult> {
  try {
    const { git } = requireLocalRepo(ctx)
    await git.raw(['restore', filePath])
    return { success: true, message: `Discarded changes in ${filePath}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Discard all changes (both staged and unstaged)
 */
export async function discardAllChanges(ctx: RepositoryContext): Promise<StagingResult> {
  try {
    const { git } = requireLocalRepo(ctx)

    const statusBefore = await git.status()
    const totalChanges = statusBefore.files.length

    if (totalChanges === 0) {
      return { success: true, message: 'No changes to discard' }
    }

    // 1) Unstage everything.
    // Important: staged-only changes (including newly added files) become unstaged after this.
    if (statusBefore.staged.length > 0) {
      await git.raw(['restore', '--staged', '.'])
    }

    // 2) Restore tracked files to last commit (covers both previously-unstaged and previously-staged changes)
    await git.raw(['restore', '.'])

    // 3) Remove untracked files (covers initially-untracked and "unstaged new files" created by step 1)
    const statusAfter = await git.status()
    if (statusAfter.not_added.length > 0) {
      await git.raw(['clean', '-fd'])
    }

    return { success: true, message: `Discarded all ${totalChanges} changes` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Apply a patch using git apply with stdin via child_process
 */
async function applyPatch(
  repoPath: string,
  patch: string,
  args: string[]
): Promise<void> {
  const { spawn } = await import('child_process')

  return new Promise((resolve, reject) => {
    const git = spawn('git', ['apply', ...args], {
      cwd: repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderr = ''

    git.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    git.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(stderr || `git apply failed with code ${code}`))
      }
    })

    git.on('error', (err) => {
      reject(err)
    })

    // Write the patch to stdin
    git.stdin.write(patch)
    git.stdin.end()
  })
}

/**
 * Stage a single hunk using git apply --cached
 */
export async function stageHunk(
  ctx: RepositoryContext,
  filePath: string,
  hunkIndex: number
): Promise<StagingResult> {
  try {
    const { repoPath } = requireLocalRepo(ctx)

    // Get the current diff to extract the hunk
    const diff = await getFileDiff(ctx, filePath, false)
    if (!diff) {
      return { success: false, message: 'Could not get file diff' }
    }

    if (hunkIndex < 0 || hunkIndex >= diff.hunks.length) {
      return { success: false, message: `Invalid hunk index: ${hunkIndex}` }
    }

    const hunk = diff.hunks[hunkIndex]
    if (!hunk.rawPatch) {
      return { success: false, message: 'Hunk has no raw patch data' }
    }

    // Apply the patch to the index
    await applyPatch(repoPath, hunk.rawPatch, ['--cached'])
    return { success: true, message: `Staged hunk ${hunkIndex + 1}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Unstage a single hunk using git apply --cached -R
 */
export async function unstageHunk(
  ctx: RepositoryContext,
  filePath: string,
  hunkIndex: number
): Promise<StagingResult> {
  try {
    const { repoPath } = requireLocalRepo(ctx)

    // Get the staged diff to extract the hunk
    const diff = await getFileDiff(ctx, filePath, true)
    if (!diff) {
      return { success: false, message: 'Could not get staged file diff' }
    }

    if (hunkIndex < 0 || hunkIndex >= diff.hunks.length) {
      return { success: false, message: `Invalid hunk index: ${hunkIndex}` }
    }

    const hunk = diff.hunks[hunkIndex]
    if (!hunk.rawPatch) {
      return { success: false, message: 'Hunk has no raw patch data' }
    }

    // Reverse apply the patch from the index
    await applyPatch(repoPath, hunk.rawPatch, ['--cached', '-R'])
    return { success: true, message: `Unstaged hunk ${hunkIndex + 1}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Discard a single hunk using git apply -R (working tree only)
 */
export async function discardHunk(
  ctx: RepositoryContext,
  filePath: string,
  hunkIndex: number
): Promise<StagingResult> {
  try {
    const { repoPath } = requireLocalRepo(ctx)

    // Get the current diff to extract the hunk
    const diff = await getFileDiff(ctx, filePath, false)
    if (!diff) {
      return { success: false, message: 'Could not get file diff' }
    }

    if (hunkIndex < 0 || hunkIndex >= diff.hunks.length) {
      return { success: false, message: `Invalid hunk index: ${hunkIndex}` }
    }

    const hunk = diff.hunks[hunkIndex]
    if (!hunk.rawPatch) {
      return { success: false, message: 'Hunk has no raw patch data' }
    }

    // Reverse apply the patch to the working tree
    await applyPatch(repoPath, hunk.rawPatch, ['-R'])
    return { success: true, message: `Discarded hunk ${hunkIndex + 1}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Stage specific lines within a hunk
 */
export async function stageLines(
  ctx: RepositoryContext,
  filePath: string,
  hunkIndex: number,
  lineIndices: number[]
): Promise<StagingResult> {
  try {
    const { repoPath } = requireLocalRepo(ctx)

    if (lineIndices.length === 0) {
      return { success: false, message: 'No lines selected' }
    }

    // Get the current diff to extract the hunk
    const diff = await getFileDiff(ctx, filePath, false)
    if (!diff) {
      return { success: false, message: 'Could not get file diff' }
    }

    if (hunkIndex < 0 || hunkIndex >= diff.hunks.length) {
      return { success: false, message: `Invalid hunk index: ${hunkIndex}` }
    }

    const hunk = diff.hunks[hunkIndex]

    // Build a partial patch with only the selected lines
    const partialPatch = buildPartialPatch(filePath, hunk, lineIndices, false, diff.status === 'untracked')

    // Apply the partial patch to the index
    await applyPatch(repoPath, partialPatch, ['--cached'])
    return { success: true, message: `Staged ${lineIndices.length} line(s)` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Unstage specific lines within a hunk (from staged diff)
 */
export async function unstageLines(
  ctx: RepositoryContext,
  filePath: string,
  hunkIndex: number,
  lineIndices: number[]
): Promise<StagingResult> {
  try {
    const { repoPath } = requireLocalRepo(ctx)

    if (lineIndices.length === 0) {
      return { success: false, message: 'No lines selected' }
    }

    // Get the staged diff to extract the hunk
    const diff = await getFileDiff(ctx, filePath, true)
    if (!diff) {
      return { success: false, message: 'Could not get staged file diff' }
    }

    if (hunkIndex < 0 || hunkIndex >= diff.hunks.length) {
      return { success: false, message: `Invalid hunk index: ${hunkIndex}` }
    }

    const hunk = diff.hunks[hunkIndex]

    // Build a partial patch with only the selected lines
    const partialPatch = buildPartialPatch(filePath, hunk, lineIndices, true)

    // Reverse apply the partial patch from the index
    await applyPatch(repoPath, partialPatch, ['--cached', '-R'])
    return { success: true, message: `Unstaged ${lineIndices.length} line(s)` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Discard specific lines within a hunk (from working tree)
 */
export async function discardLines(
  ctx: RepositoryContext,
  filePath: string,
  hunkIndex: number,
  lineIndices: number[]
): Promise<StagingResult> {
  try {
    const { repoPath } = requireLocalRepo(ctx)

    if (lineIndices.length === 0) {
      return { success: false, message: 'No lines selected' }
    }

    // Get the current diff to extract the hunk
    const diff = await getFileDiff(ctx, filePath, false)
    if (!diff) {
      return { success: false, message: 'Could not get file diff' }
    }

    if (hunkIndex < 0 || hunkIndex >= diff.hunks.length) {
      return { success: false, message: `Invalid hunk index: ${hunkIndex}` }
    }

    const hunk = diff.hunks[hunkIndex]

    // Build a partial patch with only the selected lines
    const partialPatch = buildPartialPatch(filePath, hunk, lineIndices, true)

    // Reverse apply the partial patch to the working tree
    await applyPatch(repoPath, partialPatch, ['-R'])
    return { success: true, message: `Discarded ${lineIndices.length} line(s)` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Get diff for a specific file
 */
export async function getFileDiff(
  ctx: RepositoryContext,
  filePath: string,
  staged: boolean
): Promise<StagingFileDiff | null> {
  try {
    const { git, repoPath } = requireLocalRepo(ctx)

    const args = staged ? ['diff', '--staged', '--', filePath] : ['diff', '--', filePath]

    const diffOutput = await git.raw(args)

    // If no diff output, the file might be untracked
    if (!diffOutput.trim()) {
      // Check if it's an untracked file
      const status = await git.status()
      const isUntracked = status.not_added.includes(filePath)

      if (isUntracked) {
        // Read the file content for untracked files
        const fullPath = path.join(repoPath, filePath)
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8')
          return buildUntrackedFileDiff(filePath, content)
        } catch {
          return null
        }
      }

      return null
    }

    // Parse the diff output
    return parseDiff(diffOutput, filePath)
  } catch (error) {
    console.error('Error getting file diff:', error)
    return null
  }
}

/**
 * Get the full content of a file for editing
 */
export async function getFileContent(ctx: RepositoryContext, filePath: string): Promise<string | null> {
  try {
    const { repoPath } = requireLocalRepo(ctx)
    const fullPath = path.join(repoPath, filePath)

    // Security: ensure the file is within the repo
    const resolvedPath = path.resolve(fullPath)
    const resolvedRepo = path.resolve(repoPath)
    if (!resolvedPath.startsWith(resolvedRepo + path.sep)) {
      console.error('Security: attempted to read file outside repository')
      return null
    }

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return null
    }

    const content = await fs.promises.readFile(fullPath, 'utf-8')
    return content
  } catch (error) {
    console.error('Error reading file content:', error)
    return null
  }
}

/**
 * Save content to a file (for inline editing)
 */
export async function saveFileContent(
  ctx: RepositoryContext,
  filePath: string,
  content: string
): Promise<StagingResult> {
  try {
    const { repoPath } = requireLocalRepo(ctx)
    const fullPath = path.join(repoPath, filePath)

    // Security: ensure the file is within the repo
    const resolvedPath = path.resolve(fullPath)
    const resolvedRepo = path.resolve(repoPath)
    if (!resolvedPath.startsWith(resolvedRepo + path.sep)) {
      return { success: false, message: 'Cannot write to files outside repository' }
    }

    // Ensure parent directory exists (for new files)
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true })
    }

    await fs.promises.writeFile(fullPath, content, 'utf-8')
    return { success: true, message: `Saved ${filePath}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}
