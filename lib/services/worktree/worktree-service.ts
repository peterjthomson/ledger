/**
 * Worktree Service
 *
 * Pure functions for Worktree operations.
 * All functions accept a RepositoryContext as the first parameter.
 *
 * SAFETY: These functions are pure - they don't access global state.
 * The caller is responsible for providing a valid, current context.
 */

import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import { RepositoryContext } from '@/lib/repositories'
import { stashChanges } from '@/lib/services/branch'
import { safeExec } from '@/lib/utils/safe-exec'
import {
  WorktreeAgent,
  WorktreeActivityStatus,
  BasicWorktree,
  EnhancedWorktree,
  WorktreeDiffStats,
  CreateWorktreeOptions,
  WorktreeResult,
} from './worktree-types'

const statAsync = promisify(fs.stat)

/**
 * Get basic worktree list
 */
export async function getWorktrees(ctx: RepositoryContext): Promise<BasicWorktree[]> {
  // git worktree list --porcelain gives machine-readable output
  const result = await ctx.git.raw(['worktree', 'list', '--porcelain'])

  const worktrees: BasicWorktree[] = []
  let current: Partial<BasicWorktree> = {}

  for (const line of result.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current as BasicWorktree)
      current = { path: line.replace('worktree ', ''), bare: false }
    } else if (line.startsWith('HEAD ')) {
      current.head = line.replace('HEAD ', '')
    } else if (line.startsWith('branch ')) {
      current.branch = line.replace('branch ', '').replace('refs/heads/', '')
    } else if (line === 'bare') {
      current.bare = true
    } else if (line === 'detached') {
      current.branch = null
    }
  }

  if (current.path) worktrees.push(current as BasicWorktree)

  return worktrees
}

/**
 * Detect which agent created this worktree based on its path
 */
function detectAgent(worktreePath: string): WorktreeAgent {
  // Cursor stores worktrees in ~/.cursor/worktrees/
  if (worktreePath.includes('/.cursor/worktrees/')) {
    return 'cursor'
  }

  // Claude Code might use ~/.claude/worktrees/ or similar
  if (worktreePath.includes('/.claude/worktrees/') || worktreePath.includes('/claude-worktrees/')) {
    return 'claude'
  }

  // Conductor - runs multiple Claude Code agents in parallel
  // Uses ~/conductor/workspaces/{repo-name}/{task-name}/ pattern
  if (worktreePath.includes('/conductor/workspaces/')) {
    return 'conductor'
  }

  // Add other agent patterns as we discover them
  // For now, if it's not in a known agent path, mark as unknown
  return 'unknown'
}

/**
 * Get diff stats for a worktree
 * Uses safeExec to prevent command injection
 */
async function getWorktreeDiffStats(worktreePath: string): Promise<WorktreeDiffStats & { changedFiles: string[] }> {
  try {
    // Get changed files count and names
    const statusResult = await safeExec('git', ['status', '--porcelain'], { cwd: worktreePath })
    const statusOutput = statusResult.success ? statusResult.stdout : ''
    const changedFiles = statusOutput
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3))

    // Get diff stats (additions/deletions)
    const diffResult = await safeExec('git', ['diff', '--shortstat'], { cwd: worktreePath })
    const diffOutput = diffResult.success ? diffResult.stdout : ''

    let additions = 0
    let deletions = 0

    // Parse "2 files changed, 6 insertions(+), 1 deletion(-)"
    const insertMatch = diffOutput.match(/(\d+) insertion/)
    const deleteMatch = diffOutput.match(/(\d+) deletion/)

    if (insertMatch) additions = parseInt(insertMatch[1], 10)
    if (deleteMatch) deletions = parseInt(deleteMatch[1], 10)

    return {
      changedFileCount: changedFiles.length,
      additions,
      deletions,
      changedFiles,
    }
  } catch {
    return { changedFileCount: 0, additions: 0, deletions: 0, changedFiles: [] }
  }
}

/**
 * Get the context hint (primary modified file or branch name)
 */
function getContextHint(branch: string | null, changedFiles: string[], commitMessage: string): string {
  // Priority 1: Primary modified file (if any changes)
  if (changedFiles.length > 0) {
    const primaryFile = changedFiles[0]
    const basename = path.basename(primaryFile)
    // Remove extension for cleaner display
    const name = basename.replace(/\.[^.]+$/, '')
    return name
  }

  // Priority 2: Branch name (if not detached)
  if (branch) {
    // Clean up branch name - take last segment if it's a path
    const segments = branch.split('/')
    return segments[segments.length - 1]
  }

  // Priority 3: Commit message (truncated)
  if (commitMessage) {
    return commitMessage.slice(0, 20) + (commitMessage.length > 20 ? '…' : '')
  }

  return 'workspace'
}

/**
 * Get last commit message for a worktree
 * Uses safeExec to prevent command injection
 */
async function getWorktreeCommitMessage(worktreePath: string): Promise<string> {
  try {
    const result = await safeExec('git', ['log', '-1', '--format=%s'], { cwd: worktreePath })
    return result.success ? result.stdout.trim() : ''
  } catch {
    return ''
  }
}

/**
 * Get directory modification time
 */
async function getDirectoryMtime(dirPath: string): Promise<string> {
  try {
    const stat = await statAsync(dirPath)
    return stat.mtime.toISOString()
  } catch {
    return new Date().toISOString()
  }
}

/**
 * Calculate activity status based on last modified time
 */
function calculateActivityStatus(lastModified: string): WorktreeActivityStatus {
  const now = Date.now()
  const modified = new Date(lastModified).getTime()
  const diffMinutes = (now - modified) / (1000 * 60)

  if (diffMinutes < 5) return 'active' // Modified in last 5 minutes
  if (diffMinutes < 60) return 'recent' // Modified in last hour
  if (diffMinutes < 24 * 60) return 'stale' // Modified in last 24 hours
  return 'unknown' // Older than 24 hours
}

/**
 * Get agent task hint from Cursor transcript files
 */
async function getCursorAgentTaskHint(worktreePath: string): Promise<string | null> {
  try {
    const homeDir = process.env.HOME || ''
    const projectsDir = path.join(homeDir, '.cursor', 'projects')

    // Check if the projects directory exists
    if (!fs.existsSync(projectsDir)) return null

    // Get all project folders
    const projectFolders = fs.readdirSync(projectsDir)

    // Look for agent-transcripts in each project folder
    for (const folder of projectFolders) {
      const transcriptsDir = path.join(projectsDir, folder, 'agent-transcripts')
      if (!fs.existsSync(transcriptsDir)) continue

      // Get transcript files sorted by modification time (newest first)
      const files = fs
        .readdirSync(transcriptsDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({
          name: f,
          path: path.join(transcriptsDir, f),
          mtime: fs.statSync(path.join(transcriptsDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime)

      // Check the most recent transcripts for references to this worktree
      for (const file of files.slice(0, 5)) {
        // Only check 5 most recent
        try {
          const content = fs.readFileSync(file.path, 'utf-8')

          // Quick check if this transcript mentions the worktree path
          if (!content.includes(worktreePath)) continue

          // Parse and extract the first user query
          const transcript = JSON.parse(content)
          if (!Array.isArray(transcript)) continue

          for (const message of transcript) {
            if (message.role === 'user' && message.text) {
              // Extract content from <user_query> tags if present
              const match = message.text.match(/<user_query>([\s\S]*?)<\/user_query>/)
              if (match) {
                // Get first line and truncate
                const firstLine = match[1].trim().split('\n')[0]
                return firstLine.slice(0, 60) + (firstLine.length > 60 ? '…' : '')
              }
              // Fallback: just use first line of text
              const firstLine = message.text.trim().split('\n')[0]
              return firstLine.slice(0, 60) + (firstLine.length > 60 ? '…' : '')
            }
          }
        } catch {
          // Skip malformed transcript files
          continue
        }
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Get enhanced worktrees with agent detection and metadata
 */
export async function getEnhancedWorktrees(ctx: RepositoryContext): Promise<EnhancedWorktree[]> {
  // Get basic worktree list
  const basicWorktrees = await getWorktrees(ctx)

  // Enhance each worktree with metadata (in parallel)
  const enhancedPromises = basicWorktrees.map(async (wt) => {
    const agent = detectAgent(wt.path)

    // Gather all metadata in parallel
    const [diffStats, commitMessage, lastModified, agentTaskHint] = await Promise.all([
      getWorktreeDiffStats(wt.path),
      getWorktreeCommitMessage(wt.path),
      getDirectoryMtime(wt.path),
      agent === 'cursor' ? getCursorAgentTaskHint(wt.path) : Promise.resolve(null),
    ])

    const contextHint = getContextHint(wt.branch, diffStats.changedFiles, commitMessage)
    const activityStatus = calculateActivityStatus(lastModified)

    return {
      ...wt,
      agent,
      agentIndex: 0, // Will be assigned after sorting
      contextHint,
      displayName: '', // Will be set after agentIndex is assigned
      changedFileCount: diffStats.changedFileCount,
      additions: diffStats.additions,
      deletions: diffStats.deletions,
      lastModified,
      activityStatus,
      agentTaskHint,
    }
  })

  const enhanced = await Promise.all(enhancedPromises)

  // Sort by lastModified to assign agent indices in creation order
  enhanced.sort((a, b) => new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime())

  // Assign agent indices per agent type
  const agentCounters: Record<WorktreeAgent, number> = {
    cursor: 0,
    claude: 0,
    conductor: 0,
    gemini: 0,
    junie: 0,
    unknown: 0,
    'working-folder': 0, // Not used here (created client-side) but needed for type safety
  }

  for (const wt of enhanced) {
    agentCounters[wt.agent]++
    wt.agentIndex = agentCounters[wt.agent]

    // Format displayName as "Agent N: contextHint"
    const agentName = wt.agent.charAt(0).toUpperCase() + wt.agent.slice(1)
    wt.displayName = `${agentName} ${wt.agentIndex}: ${wt.contextHint}`
  }

  return enhanced
}

/**
 * Convert a worktree to a branch
 * Takes changes from a worktree, creates a new branch from master/main with the folder name, and applies the changes
 */
export async function convertWorktreeToBranch(
  ctx: RepositoryContext,
  worktreePath: string
): Promise<{ success: boolean; message: string; branchName?: string }> {
  try {
    // Get the folder name from the worktree path to use as branch name
    const folderName = path.basename(worktreePath)

    // Sanitize folder name for use as branch name (replace spaces and special chars)
    const branchName = folderName
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '')

    if (!branchName) {
      return { success: false, message: 'Could not derive a valid branch name from the folder' }
    }

    // Check if branch already exists
    const branches = await ctx.git.branchLocal()
    if (branches.all.includes(branchName)) {
      return { success: false, message: `Branch '${branchName}' already exists` }
    }

    // Find the base branch (master or main)
    let baseBranch = 'master'
    try {
      await ctx.git.raw(['rev-parse', '--verify', 'origin/master'])
    } catch {
      try {
        await ctx.git.raw(['rev-parse', '--verify', 'origin/main'])
        baseBranch = 'main'
      } catch {
        // Try local master/main
        if (branches.all.includes('main')) {
          baseBranch = 'main'
        } else if (!branches.all.includes('master')) {
          return { success: false, message: 'Could not find master or main branch' }
        }
      }
    }

    // Get the diff from the worktree as a patch (uses safeExec to prevent injection)
    const patchResult = await safeExec('git', ['diff', 'HEAD'], { cwd: worktreePath })
    const patchOutput = patchResult.success ? patchResult.stdout : ''

    // Also get untracked files (uses safeExec to prevent injection)
    const untrackedResult = await safeExec('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: worktreePath,
    })
    const untrackedOutput = untrackedResult.success ? untrackedResult.stdout : ''
    const untrackedFiles = untrackedOutput.split('\n').filter(Boolean)

    // Check if there are any changes
    if (!patchOutput.trim() && untrackedFiles.length === 0) {
      return { success: false, message: 'No changes to convert - worktree is clean' }
    }

    // Stash any changes in the main repo first
    const stashResult = await stashChanges(ctx)

    // Create a new branch from the base branch
    const baseRef = branches.all.includes(baseBranch) ? baseBranch : `origin/${baseBranch}`
    await ctx.git.checkout(['-b', branchName, baseRef])

    // Apply the patch if there are tracked file changes
    if (patchOutput.trim()) {
      // Write patch to a temp file
      const tempPatchFile = path.join(ctx.path, '.ledger-temp-patch')
      try {
        await fs.promises.writeFile(tempPatchFile, patchOutput)
        // Use safeExec to prevent command injection (file path as separate arg)
        const applyResult = await safeExec('git', ['apply', '--3way', tempPatchFile], { cwd: ctx.path })
        if (!applyResult.success) {
          throw new Error(applyResult.stderr || 'git apply failed')
        }
      } catch (applyError) {
        // If apply fails, try to apply with less strict options
        const fallbackResult = await safeExec(
          'git',
          ['apply', '--reject', '--whitespace=fix', tempPatchFile],
          { cwd: ctx.path }
        )
        if (!fallbackResult.success) {
          // Clean up and revert to the base branch
          try {
            await fs.promises.unlink(tempPatchFile)
          } catch {
            /* ignore */
          }
          await ctx.git.checkout(stashResult.stashed ? '-' : baseBranch)
          await ctx.git.branch(['-D', branchName])
          if (stashResult.stashed) {
            await ctx.git.stash(['pop'])
          }
          return { success: false, message: `Failed to apply changes: ${(applyError as Error).message}` }
        }
      } finally {
        // Clean up temp file
        try {
          await fs.promises.unlink(tempPatchFile)
        } catch {
          /* ignore */
        }
      }
    }

    // Copy untracked files from worktree to main repo
    for (const file of untrackedFiles) {
      const srcPath = path.join(worktreePath, file)
      const destPath = path.join(ctx.path, file)

      // Ensure destination directory exists
      const destDir = path.dirname(destPath)
      await fs.promises.mkdir(destDir, { recursive: true })

      // Copy the file
      await fs.promises.copyFile(srcPath, destPath)
    }

    // Stage all changes
    await ctx.git.add(['-A'])

    // Commit the changes
    const commitMessage = `Changes from worktree: ${folderName}`
    await ctx.git.commit(commitMessage)

    return {
      success: true,
      message: `Created branch '${branchName}' with changes from worktree`,
      branchName,
    }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Apply changes from a worktree to the main repo
 */
export async function applyWorktreeChanges(
  ctx: RepositoryContext,
  worktreePath: string
): Promise<WorktreeResult> {
  try {
    // Check if this is the current worktree (main repo)
    if (worktreePath === ctx.path) {
      return { success: false, message: 'Cannot apply from the main repository to itself' }
    }

    // Get the diff from the worktree as a patch (uses safeExec to prevent injection)
    const patchResult = await safeExec('git', ['diff', 'HEAD'], { cwd: worktreePath })
    const patchOutput = patchResult.success ? patchResult.stdout : ''

    // Also get list of untracked files (uses safeExec to prevent injection)
    const untrackedResult = await safeExec('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: worktreePath,
    })
    const untrackedOutput = untrackedResult.success ? untrackedResult.stdout : ''
    const untrackedFiles = untrackedOutput.split('\n').filter(Boolean)

    // Check if there are any changes
    if (!patchOutput.trim() && untrackedFiles.length === 0) {
      return { success: false, message: 'No changes to apply - worktree is clean' }
    }

    // Apply the patch if there are tracked file changes
    if (patchOutput.trim()) {
      // Write patch to a temp file
      const tempPatchFile = path.join(ctx.path, '.ledger-temp-patch')
      try {
        await fs.promises.writeFile(tempPatchFile, patchOutput)
        // Use safeExec to prevent command injection (file path as separate arg)
        const applyResult = await safeExec('git', ['apply', '--3way', tempPatchFile], { cwd: ctx.path })
        if (!applyResult.success) {
          throw new Error(applyResult.stderr || 'git apply failed')
        }
        await fs.promises.unlink(tempPatchFile)
      } catch (_applyError) {
        // If apply fails, try with less strict options
        const fallbackResult = await safeExec(
          'git',
          ['apply', '--reject', '--whitespace=fix', tempPatchFile],
          { cwd: ctx.path }
        )
        if (fallbackResult.success) {
          await fs.promises.unlink(tempPatchFile)
        } else {
          try {
            await fs.promises.unlink(tempPatchFile)
          } catch {
            /* ignore */
          }
          return { success: false, message: 'Failed to apply changes - patch may have conflicts' }
        }
      }
    }

    // Copy untracked files
    for (const file of untrackedFiles) {
      const srcPath = path.join(worktreePath, file)
      const destPath = path.join(ctx.path, file)

      // Ensure destination directory exists
      const destDir = path.dirname(destPath)
      await fs.promises.mkdir(destDir, { recursive: true })

      // Copy the file
      await fs.promises.copyFile(srcPath, destPath)
    }

    const folderName = path.basename(worktreePath)
    return {
      success: true,
      message: `Applied changes from worktree: ${folderName}`,
    }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Remove a worktree
 */
export async function removeWorktree(
  ctx: RepositoryContext,
  worktreePath: string,
  force: boolean = false
): Promise<WorktreeResult> {
  try {
    // Check if this is the current worktree (main repo)
    if (worktreePath === ctx.path) {
      return { success: false, message: 'Cannot remove the main repository worktree' }
    }

    // Get worktree info to check for uncommitted changes
    const worktrees = await getWorktrees(ctx)
    const worktree = worktrees.find((wt) => wt.path === worktreePath)

    if (!worktree) {
      return { success: false, message: 'Worktree not found' }
    }

    // Check for uncommitted changes if not forcing (uses safeExec to prevent injection)
    if (!force) {
      try {
        const statusResult = await safeExec('git', ['status', '--porcelain'], { cwd: worktreePath })
        if (statusResult.success && statusResult.stdout.trim()) {
          return { success: false, message: 'Worktree has uncommitted changes. Use force to remove anyway.' }
        }
      } catch {
        // If we can't check status, proceed with caution
      }
    }

    // Remove the worktree
    const args = ['worktree', 'remove']
    if (force) {
      args.push('--force')
    }
    args.push(worktreePath)

    await ctx.git.raw(args)

    return {
      success: true,
      message: `Removed worktree: ${path.basename(worktreePath)}`,
    }
  } catch (error) {
    const errorMsg = (error as Error).message
    if (errorMsg.includes('contains modified or untracked files')) {
      return { success: false, message: 'Worktree has uncommitted changes. Use force to remove anyway.' }
    }
    return { success: false, message: errorMsg }
  }
}

/**
 * Create a new worktree
 */
export async function createWorktree(
  ctx: RepositoryContext,
  options: CreateWorktreeOptions
): Promise<WorktreeResult> {
  const { branchName, folderPath, isNewBranch } = options

  try {
    // Validate branch name
    if (!branchName || !branchName.trim()) {
      return { success: false, message: 'Branch name is required' }
    }

    // Validate folder path
    if (!folderPath || !folderPath.trim()) {
      return { success: false, message: 'Folder path is required' }
    }

    // Security: Validate path doesn't contain traversal attempts
    const resolvedPath = path.resolve(folderPath)
    if (folderPath.includes('..') || resolvedPath !== path.normalize(folderPath)) {
      return { success: false, message: 'Invalid folder path: path traversal not allowed' }
    }

    // Security: Ensure path is absolute to prevent relative path attacks
    if (!path.isAbsolute(folderPath)) {
      return { success: false, message: 'Folder path must be absolute' }
    }

    // Check if folder already exists
    if (fs.existsSync(folderPath)) {
      return { success: false, message: `Folder already exists: ${folderPath}` }
    }

    // Check if branch already exists (for new branches)
    const branches = await ctx.git.branchLocal()
    const branchExists = branches.all.includes(branchName)

    if (isNewBranch && branchExists) {
      return { success: false, message: `Branch '${branchName}' already exists` }
    }

    if (!isNewBranch && !branchExists) {
      // Check if it's a remote branch we can track
      const remoteBranches = await ctx.git.branch(['-r'])
      const remoteBranchName = `origin/${branchName}`
      if (!remoteBranches.all.includes(remoteBranchName)) {
        return { success: false, message: `Branch '${branchName}' does not exist` }
      }
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(folderPath)
    if (!fs.existsSync(parentDir)) {
      await fs.promises.mkdir(parentDir, { recursive: true })
    }

    // Create the worktree
    if (isNewBranch) {
      // Create worktree with new branch: git worktree add -b <branch> <path>
      await ctx.git.raw(['worktree', 'add', '-b', branchName, folderPath])
    } else {
      // Create worktree with existing branch: git worktree add <path> <branch>
      await ctx.git.raw(['worktree', 'add', folderPath, branchName])
    }

    return {
      success: true,
      message: `Created worktree at ${path.basename(folderPath)} on branch ${branchName}`,
      path: folderPath,
    }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Get the path of a worktree (identity function for compatibility)
 */
export function getWorktreePath(worktreePath: string): string {
  return worktreePath
}
