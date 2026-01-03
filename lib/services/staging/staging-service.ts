/**
 * Staging Service
 *
 * Pure functions for Staging operations.
 * All functions accept a RepositoryContext as the first parameter.
 *
 * SAFETY: These functions are pure - they don't access global state.
 * The caller is responsible for providing a valid, current context.
 */

import * as fs from 'fs'
import * as path from 'path'
import { RepositoryContext } from '@/lib/repositories'
import { StagingDiffHunk, StagingFileDiff, StagingResult } from './staging-types'

/**
 * Stage a single file
 */
export async function stageFile(ctx: RepositoryContext, filePath: string): Promise<StagingResult> {
  try {
    await ctx.git.add(filePath)
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
    await ctx.git.raw(['restore', '--staged', filePath])
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
    await ctx.git.add('-A')
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
    await ctx.git.raw(['restore', '--staged', '.'])
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
    await ctx.git.raw(['restore', filePath])
    return { success: true, message: `Discarded changes in ${filePath}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Parse unified diff format
 */
function parseDiff(diffOutput: string, filePath: string): StagingFileDiff {
  const lines = diffOutput.split('\n')
  const hunks: StagingDiffHunk[] = []
  let currentHunk: StagingDiffHunk | null = null
  let oldLineNum = 0
  let newLineNum = 0
  let additions = 0
  let deletions = 0
  let isBinary = false
  let status: StagingFileDiff['status'] = 'modified'
  let oldPath: string | undefined

  for (const line of lines) {
    // Check for binary file
    if (line.startsWith('Binary files')) {
      isBinary = true
      continue
    }

    // Check for new file
    if (line.startsWith('new file mode')) {
      status = 'added'
      continue
    }

    // Check for deleted file
    if (line.startsWith('deleted file mode')) {
      status = 'deleted'
      continue
    }

    // Check for rename
    if (line.startsWith('rename from ')) {
      oldPath = line.replace('rename from ', '')
      status = 'renamed'
      continue
    }

    // Parse hunk header
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/)
    if (hunkMatch) {
      if (currentHunk) {
        hunks.push(currentHunk)
      }

      oldLineNum = parseInt(hunkMatch[1])
      newLineNum = parseInt(hunkMatch[3])

      currentHunk = {
        header: line,
        oldStart: oldLineNum,
        oldLines: parseInt(hunkMatch[2] || '1'),
        newStart: newLineNum,
        newLines: parseInt(hunkMatch[4] || '1'),
        lines: [],
      }
      continue
    }

    // Parse diff lines
    if (currentHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++
        currentHunk.lines.push({
          type: 'add',
          content: line.slice(1),
          newLineNumber: newLineNum++,
        })
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++
        currentHunk.lines.push({
          type: 'delete',
          content: line.slice(1),
          oldLineNumber: oldLineNum++,
        })
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({
          type: 'context',
          content: line.slice(1),
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        })
      }
    }
  }

  // Don't forget the last hunk
  if (currentHunk) {
    hunks.push(currentHunk)
  }

  return {
    filePath,
    oldPath,
    status,
    hunks,
    isBinary,
    additions,
    deletions,
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
    const args = staged ? ['diff', '--staged', '--', filePath] : ['diff', '--', filePath]

    const diffOutput = await ctx.git.raw(args)

    // If no diff output, the file might be untracked
    if (!diffOutput.trim()) {
      // Check if it's an untracked file
      const status = await ctx.git.status()
      const isUntracked = status.not_added.includes(filePath)

      if (isUntracked) {
        // Read the file content for untracked files
        const fullPath = path.join(ctx.path, filePath)
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8')
          const lines = content.split('\n')

          return {
            filePath,
            status: 'untracked',
            isBinary: false,
            additions: lines.length,
            deletions: 0,
            hunks: [
              {
                header: `@@ -0,0 +1,${lines.length} @@`,
                oldStart: 0,
                oldLines: 0,
                newStart: 1,
                newLines: lines.length,
                lines: lines.map((line, idx) => ({
                  type: 'add' as const,
                  content: line,
                  newLineNumber: idx + 1,
                })),
              },
            ],
          }
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
