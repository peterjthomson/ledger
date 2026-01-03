/**
 * Commit Service
 *
 * Pure functions for commit operations.
 * All functions accept a RepositoryContext as the first parameter.
 *
 * SAFETY: These functions are pure - they don't access global state.
 * The caller is responsible for providing a valid, current context.
 */

import { RepositoryContext } from '@/lib/repositories'
import { stashChanges } from '@/lib/services/branch'
import {
  CommitInfo,
  GraphCommit,
  UncommittedFile,
  CommitDetails,
  CommitFileChange,
  CommitDiff,
  FileDiff,
  DiffHunk,
  DiffLine,
  DiffFile,
  CommitResult,
  ResetResult,
} from './commit-types'

/**
 * Get recent commit history for the current branch
 */
export async function getCommitHistory(
  ctx: RepositoryContext,
  limit: number = 20
): Promise<CommitInfo[]> {
  try {
    // Get basic log info
    const log = await ctx.git.log(['-n', limit.toString()])

    // Get stat info for each commit
    const commits: CommitInfo[] = []
    for (const commit of log.all) {
      // Get file stats for this commit
      let filesChanged = 0
      let additions = 0
      let deletions = 0

      try {
        const statOutput = await ctx.git.raw(['show', '--stat', '--format=', commit.hash])
        const lines = statOutput.trim().split('\n')
        const summaryLine = lines[lines.length - 1]
        // Parse: "3 files changed, 10 insertions(+), 5 deletions(-)"
        const filesMatch = summaryLine.match(/(\d+) files? changed/)
        const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/)
        const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/)
        filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0
        additions = addMatch ? parseInt(addMatch[1]) : 0
        deletions = delMatch ? parseInt(delMatch[1]) : 0
      } catch {
        // Ignore stat errors
      }

      // Check if it's a merge commit
      const isMerge = commit.body?.includes('Merge') || (commit.refs || '').includes('Merge')

      commits.push({
        hash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
        isMerge,
        filesChanged,
        additions,
        deletions,
      })
    }

    return commits
  } catch {
    return []
  }
}

/**
 * Get commit history for a specific branch/ref
 */
export async function getCommitHistoryForRef(
  ctx: RepositoryContext,
  ref: string,
  limit: number = 50
): Promise<CommitInfo[]> {
  try {
    const log = await ctx.git.log([ref, '-n', limit.toString()])

    const commits: CommitInfo[] = []
    for (const commit of log.all) {
      // Check if it's a merge commit
      const isMerge = commit.body?.includes('Merge') || (commit.refs || '').includes('Merge')

      commits.push({
        hash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
        isMerge,
      })
    }

    return commits
  } catch {
    return []
  }
}

/**
 * Get commit history with parent info for git graph
 * skipStats=true makes this much faster for initial load (100x fewer git commands)
 * showCheckpoints=false hides Conductor checkpoint commits (checkpoint:... messages)
 */
export async function getCommitGraphHistory(
  ctx: RepositoryContext,
  limit: number = 100,
  skipStats: boolean = false,
  showCheckpoints: boolean = false
): Promise<GraphCommit[]> {
  try {
    // Use raw git log with custom format to get parent hashes
    const format = '%H|%h|%s|%an|%ci|%P|%D'
    const output = await ctx.git.raw([
      'log',
      `--format=${format}`,
      '-n',
      limit.toString(),
      '--all', // Include all branches
    ])

    const lines = output.trim().split('\n').filter(Boolean)
    const commits: GraphCommit[] = []

    for (const line of lines) {
      const [hash, shortHash, message, author, date, parentStr, refsStr] = line.split('|')

      // Filter out checkpoint commits if showCheckpoints is false
      if (!showCheckpoints && message.startsWith('checkpoint:')) {
        continue
      }

      const parents = parentStr ? parentStr.split(' ').filter(Boolean) : []
      const refs = refsStr
        ? refsStr
            .split(', ')
            .filter(Boolean)
            .map((r) => r.trim())
        : []

      // Skip expensive per-commit stats unless explicitly requested
      let filesChanged = 0
      let additions = 0
      let deletions = 0

      if (!skipStats) {
        try {
          const statOutput = await ctx.git.raw(['show', '--stat', '--format=', hash])
          const statLines = statOutput.trim().split('\n')
          const summaryLine = statLines[statLines.length - 1]
          const filesMatch = summaryLine.match(/(\d+) files? changed/)
          const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/)
          const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/)
          filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0
          additions = addMatch ? parseInt(addMatch[1]) : 0
          deletions = delMatch ? parseInt(delMatch[1]) : 0
        } catch {
          // Ignore stat errors
        }
      }

      const isMerge = parents.length > 1

      commits.push({
        hash,
        shortHash,
        message,
        author,
        date,
        parents,
        refs,
        isMerge,
        filesChanged,
        additions,
        deletions,
      })
    }

    return commits
  } catch {
    return []
  }
}

/**
 * Get list of uncommitted files (staged + unstaged + untracked)
 */
export async function getUncommittedFiles(ctx: RepositoryContext): Promise<UncommittedFile[]> {
  try {
    const status = await ctx.git.status()
    const files: UncommittedFile[] = []
    const addedPaths = new Set<string>()

    // Process the files array which has detailed info about each file
    for (const file of status.files) {
      const path = file.path

      // Skip if we've already processed this file
      if (addedPaths.has(path)) continue

      const indexStatus = file.index
      const workingStatus = file.working_dir

      // Staged changes (index !== ' ' and index !== '?')
      if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
        let fileStatus: UncommittedFile['status'] = 'modified'
        if (indexStatus === 'A') fileStatus = 'added'
        else if (indexStatus === 'D') fileStatus = 'deleted'
        else if (indexStatus === 'R') fileStatus = 'renamed'
        else if (indexStatus === 'M') fileStatus = 'modified'

        files.push({ path, status: fileStatus, staged: true })
        addedPaths.add(path + ':staged')
      }

      // Unstaged changes (working_dir !== ' ')
      if (workingStatus && workingStatus !== ' ') {
        let fileStatus: UncommittedFile['status'] = 'modified'
        if (workingStatus === '?') fileStatus = 'untracked'
        else if (workingStatus === 'A') fileStatus = 'added'
        else if (workingStatus === 'D') fileStatus = 'deleted'
        else if (workingStatus === 'M') fileStatus = 'modified'

        files.push({ path, status: fileStatus, staged: false })
        addedPaths.add(path + ':unstaged')
      }
    }

    return files
  } catch {
    return []
  }
}

/**
 * Get detailed information about a specific commit
 */
export async function getCommitDetails(
  ctx: RepositoryContext,
  commitHash: string
): Promise<CommitDetails | null> {
  try {
    // Get commit info
    const log = await ctx.git.log(['-1', commitHash])
    const commit = log.latest
    if (!commit) return null

    // Get parent hashes
    const parentRaw = await ctx.git.raw(['rev-parse', `${commitHash}^@`]).catch(() => '')
    const parentHashes = parentRaw.trim().split('\n').filter(Boolean)

    // Parse numstat for additions/deletions
    const numstatOutput = await ctx.git.raw(['diff-tree', '--no-commit-id', '-r', '--numstat', commitHash])
    const numstatLines = numstatOutput.trim().split('\n').filter(Boolean)
    const statMap = new Map<string, { additions: number; deletions: number }>()

    for (const line of numstatLines) {
      const parts = line.split('\t')
      if (parts.length >= 3) {
        const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0
        const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0
        const filePath = parts[parts.length - 1] // Last part is file path (handles renames)
        statMap.set(filePath, { additions, deletions })
      }
    }

    // Parse name-status for file status
    const nameStatusOutput = await ctx.git.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', commitHash])
    const statusLines = nameStatusOutput.trim().split('\n').filter(Boolean)

    const files: CommitFileChange[] = []
    let totalAdditions = 0
    let totalDeletions = 0

    for (const line of statusLines) {
      const parts = line.split('\t')
      if (parts.length < 2) continue

      const statusChar = parts[0][0]
      let status: CommitFileChange['status'] = 'modified'
      let filePath = parts[1]
      let oldPath: string | undefined

      switch (statusChar) {
        case 'A':
          status = 'added'
          break
        case 'D':
          status = 'deleted'
          break
        case 'M':
          status = 'modified'
          break
        case 'R':
          status = 'renamed'
          oldPath = parts[1]
          filePath = parts[2] || parts[1]
          break
        case 'C':
          status = 'copied'
          oldPath = parts[1]
          filePath = parts[2] || parts[1]
          break
      }

      const stats = statMap.get(filePath) || { additions: 0, deletions: 0 }
      totalAdditions += stats.additions
      totalDeletions += stats.deletions

      files.push({
        path: filePath,
        status,
        additions: stats.additions,
        deletions: stats.deletions,
        oldPath,
      })
    }

    // Get full commit message (subject + body)
    const fullMessage = await ctx.git.raw(['log', '-1', '--format=%B', commitHash])
    const messageLines = fullMessage.trim().split('\n')
    const subject = messageLines[0] || ''
    const body = messageLines.slice(1).join('\n').trim()

    // Get author email
    const authorEmail = await ctx.git.raw(['log', '-1', '--format=%ae', commitHash])

    return {
      hash: commit.hash,
      shortHash: commit.hash.slice(0, 7),
      message: subject,
      body,
      author: commit.author_name,
      authorEmail: authorEmail.trim(),
      date: commit.date,
      parentHashes,
      files,
      totalAdditions,
      totalDeletions,
    }
  } catch (error) {
    console.error('Error getting commit details:', error)
    return null
  }
}

/**
 * Get diff for a specific commit
 */
export async function getCommitDiff(
  ctx: RepositoryContext,
  commitHash: string
): Promise<CommitDiff | null> {
  try {
    // Get commit info
    const logOutput = await ctx.git.raw(['show', '--format=%H|%s|%an|%ci', '-s', commitHash])
    const [hash, message, author, date] = logOutput.trim().split('|')

    // Get diff with file stats
    const diffOutput = await ctx.git.raw(['show', '--format=', '--patch', '--stat', commitHash])

    // Parse the diff output
    const files: FileDiff[] = []
    let totalAdditions = 0
    let totalDeletions = 0

    // Split by file diffs
    const diffParts = diffOutput.split(/^diff --git /m).filter(Boolean)

    for (const part of diffParts) {
      const lines = part.split('\n')

      // Parse file header
      const headerMatch = lines[0].match(/a\/(.+) b\/(.+)/)
      if (!headerMatch) continue

      const oldPath = headerMatch[1]
      const newPath = headerMatch[2]

      // Determine status
      let status: DiffFile['status'] = 'modified'
      if (part.includes('new file mode')) status = 'added'
      else if (part.includes('deleted file mode')) status = 'deleted'
      else if (oldPath !== newPath) status = 'renamed'

      // Check for binary
      const isBinary = part.includes('Binary files')

      // Parse hunks
      const hunks: DiffHunk[] = []
      let fileAdditions = 0
      let fileDeletions = 0

      if (!isBinary) {
        const hunkMatches = part.matchAll(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/g)

        for (const match of hunkMatches) {
          const oldStart = parseInt(match[1])
          const oldLinesCount = match[2] ? parseInt(match[2]) : 1
          const newStart = parseInt(match[3])
          const newLinesCount = match[4] ? parseInt(match[4]) : 1

          // Find the lines after this hunk header
          const hunkStartIndex = part.indexOf(match[0])
          const hunkContent = part.slice(hunkStartIndex + match[0].length)
          const hunkLines: DiffLine[] = []

          let oldLine = oldStart
          let newLine = newStart

          for (const line of hunkContent.split('\n')) {
            if (line.startsWith('@@') || line.startsWith('diff --git')) break

            if (line.startsWith('+') && !line.startsWith('+++')) {
              hunkLines.push({
                type: 'add',
                content: line.slice(1),
                newLineNumber: newLine++,
              })
              fileAdditions++
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              hunkLines.push({
                type: 'delete',
                content: line.slice(1),
                oldLineNumber: oldLine++,
              })
              fileDeletions++
            } else if (line.startsWith(' ')) {
              hunkLines.push({
                type: 'context',
                content: line.slice(1),
                oldLineNumber: oldLine++,
                newLineNumber: newLine++,
              })
            }
          }

          hunks.push({
            oldStart,
            oldLines: oldLinesCount,
            newStart,
            newLines: newLinesCount,
            lines: hunkLines,
          })
        }
      }

      totalAdditions += fileAdditions
      totalDeletions += fileDeletions

      files.push({
        file: {
          path: newPath,
          status,
          additions: fileAdditions,
          deletions: fileDeletions,
          oldPath: status === 'renamed' ? oldPath : undefined,
        },
        hunks,
        isBinary,
      })
    }

    return {
      hash,
      message,
      author,
      date,
      files,
      totalAdditions,
      totalDeletions,
    }
  } catch (error) {
    console.error('Error getting commit diff:', error)
    return null
  }
}

/**
 * Reset to a specific commit
 */
export async function resetToCommit(
  ctx: RepositoryContext,
  commitHash: string,
  mode: 'soft' | 'mixed' | 'hard' = 'hard'
): Promise<ResetResult> {
  try {
    // Stash any uncommitted changes first (only for hard reset)
    let stashResult = { stashed: false, message: '' }
    if (mode === 'hard') {
      stashResult = await stashChanges(ctx)
    }

    // Perform the reset
    await ctx.git.reset([`--${mode}`, commitHash])

    const shortHash = commitHash.slice(0, 7)
    return {
      success: true,
      message: `Reset to ${shortHash} (${mode})`,
      stashed: stashResult.stashed ? stashResult.message : undefined,
    }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Commit staged changes
 * Ledger Opinion: Check if origin has moved ahead before committing.
 * If behind, return behindCount so UI can prompt user to pull first or commit ahead.
 */
export async function commitChanges(
  ctx: RepositoryContext,
  message: string,
  description?: string,
  force: boolean = false
): Promise<CommitResult> {
  try {
    // Check if there are staged changes
    const status = await ctx.git.status()
    if (status.staged.length === 0) {
      return { success: false, message: 'No staged changes to commit' }
    }

    // Check if we're behind origin (unless forcing)
    if (!force && status.current) {
      try {
        await ctx.git.fetch('origin', status.current)
        const freshStatus = await ctx.git.status()
        if (freshStatus.behind > 0) {
          return {
            success: false,
            message: `Origin has ${freshStatus.behind} new commit${freshStatus.behind > 1 ? 's' : ''}`,
            behindCount: freshStatus.behind,
          }
        }
      } catch {
        // If fetch fails (no remote, no tracking branch), continue with commit
      }
    }

    // Build commit message (summary + optional description)
    const fullMessage = description ? `${message}\n\n${description}` : message

    await ctx.git.commit(fullMessage)
    return { success: true, message: `Committed: ${message}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}
