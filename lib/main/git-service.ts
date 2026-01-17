import { simpleGit, SimpleGit } from 'simple-git'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execAsync = promisify(exec)
const statAsync = promisify(fs.stat)

let git: SimpleGit | null = null
let repoPath: string | null = null

export function setRepoPath(path: string) {
  repoPath = path
  git = simpleGit(path)
}

export function getRepoPath(): string | null {
  return repoPath
}

/**
 * Initialize global state sync for repository manager.
 * Connects the RepositoryManager's active context to the module-level git/repoPath.
 */
export async function initializeGlobalStateSync(): Promise<void> {
  // Dynamic import to avoid circular dependency
  const { getRepositoryManager } = await import('@/lib/repositories')
  const manager = getRepositoryManager()
  manager.setGlobalStateSyncCallback((path: string | null) => {
    if (path) {
      repoPath = path
      git = simpleGit(path)
    } else {
      repoPath = null
      git = null
    }
  })
}

export interface BranchInfo {
  name: string
  current: boolean
  commit: string
  label: string
  isRemote: boolean
  // Extended metadata
  lastCommitDate?: string
  lastCommitMessage?: string
  firstCommitDate?: string
  commitCount?: number
  isLocalOnly?: boolean
  isMerged?: boolean
}

export async function getBranches() {
  if (!git) throw new Error('No repository selected')

  const result = await git.branch(['-a', '-v'])

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

export async function getBranchMetadata(branchName: string): Promise<{
  lastCommitDate: string
  lastCommitMessage: string
  firstCommitDate: string
  commitCount: number
}> {
  if (!git) throw new Error('No repository selected')

  // Get last commit date and message
  const lastCommit = await git.log([branchName, '-1', '--format=%ci'])
  const lastCommitDate = lastCommit.latest?.date || ''
  const lastCommitMessage = lastCommit.latest?.message || ''

  // Get first commit date (oldest commit on this branch)
  const firstCommitRaw = await git.raw(['log', branchName, '--reverse', '--format=%ci', '-1'])
  const firstCommitDate = firstCommitRaw.trim()

  // Get commit count
  const countRaw = await git.raw(['rev-list', '--count', branchName])
  const commitCount = parseInt(countRaw.trim(), 10) || 0

  return {
    lastCommitDate,
    lastCommitMessage,
    firstCommitDate,
    commitCount,
  }
}

export async function getUnmergedBranches(baseBranch: string = 'origin/master'): Promise<string[]> {
  if (!git) throw new Error('No repository selected')

  try {
    // Try origin/master first, fall back to origin/main
    let targetBranch = baseBranch
    try {
      await git.raw(['rev-parse', '--verify', baseBranch])
    } catch {
      targetBranch = 'origin/main'
      try {
        await git.raw(['rev-parse', '--verify', targetBranch])
      } catch {
        // Neither exists, return empty
        return []
      }
    }

    // Get branches not merged into the target
    const result = await git.raw(['branch', '-a', '--no-merged', targetBranch])
    return result
      .split('\n')
      .map((b) => b.trim().replace(/^[*+]\s*/, '')) // Strip * (current) or + (checked out in worktree) markers
      .filter((b) => b && !b.includes('HEAD'))
  } catch {
    return []
  }
}

// Fast branch loading - only gets basic info, no per-branch metadata
// This is much faster for large repos (single git command vs 3*N commands)
export async function getBranchesBasic() {
  if (!git) throw new Error('No repository selected')

  const { current, branches } = await getBranches()
  const unmergedBranches = await getUnmergedBranches()
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

// Full metadata loading - expensive, should be called in background after initial load
export async function getBranchesWithMetadata() {
  if (!git) throw new Error('No repository selected')

  const { current, branches } = await getBranches()
  const unmergedBranches = await getUnmergedBranches()
  const unmergedSet = new Set(unmergedBranches)

  // Get metadata for all branches in parallel (batched to avoid overwhelming git)
  const batchSize = 10
  const branchesWithMeta: BranchInfo[] = []

  for (let i = 0; i < branches.length; i += batchSize) {
    const batch = branches.slice(i, i + batchSize)
    const metadataPromises = batch.map(async (branch) => {
      try {
        const meta = await getBranchMetadata(branch.name)
        return {
          ...branch,
          lastCommitDate: meta.lastCommitDate,
          lastCommitMessage: meta.lastCommitMessage,
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

export async function getWorktrees() {
  if (!git) throw new Error('No repository selected')

  // git worktree list --porcelain gives machine-readable output
  const result = await git.raw(['worktree', 'list', '--porcelain'])

  const worktrees: Array<{
    path: string
    head: string
    branch: string | null
    bare: boolean
  }> = []

  let current: any = {}

  for (const line of result.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current)
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

  if (current.path) worktrees.push(current)

  return worktrees
}

// Agent workspace types
export type WorktreeAgent = 'cursor' | 'claude' | 'conductor' | 'gemini' | 'junie' | 'unknown' | 'working-folder'

export type WorktreeActivityStatus = 'active' | 'recent' | 'stale' | 'unknown'

export interface EnhancedWorktree {
  path: string
  head: string
  branch: string | null
  bare: boolean
  // Agent workspace metadata
  agent: WorktreeAgent
  agentIndex: number
  contextHint: string
  displayName: string
  // Diff stats
  changedFileCount: number
  additions: number
  deletions: number
  // Directory modification time (used for sorting worktrees by creation order)
  lastModified: string
  // Activity tracking - dual signals for more reliable detection
  activityStatus: WorktreeActivityStatus
  /** Most recent file modification time in worktree (filesystem level) */
  lastFileModified: string
  /** Last git activity: commit time or working directory change time */
  lastGitActivity: string
  /** Source of activity status: 'file' | 'git' | 'both' */
  activitySource: 'file' | 'git' | 'both'
  agentTaskHint: string | null // The agent's current task/prompt if available
}

// Detect which agent created this worktree based on its path
function detectAgent(worktreePath: string): WorktreeAgent {
  // Cursor stores worktrees in ~/.cursor/worktrees/
  if (worktreePath.includes('/.cursor/worktrees/')) {
    return 'cursor'
  }

  // Claude Code might use ~/.claude/worktrees/ or similar
  if (worktreePath.includes('/.claude/worktrees/') || worktreePath.includes('/claude-worktrees/')) {
    return 'claude'
  }

  // Gemini CLI (gemini-wt) uses ~/.gemini/worktrees/{project}/
  // Branches are typically named gemini-{timestamp} or custom names
  if (worktreePath.includes('/.gemini/worktrees/') || worktreePath.includes('/gemini-worktrees/')) {
    return 'gemini'
  }

  // Junie might use ~/.junie/worktrees/ or similar
  if (worktreePath.includes('/.junie/worktrees/') || worktreePath.includes('/junie-worktrees/')) {
    return 'junie'
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

// Get diff stats for a worktree
async function getWorktreeDiffStats(worktreePath: string): Promise<{
  changedFileCount: number
  additions: number
  deletions: number
  changedFiles: string[]
}> {
  try {
    // Get changed files count and names
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: worktreePath })
    const changedFiles = statusOutput
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3))

    // Get diff stats (additions/deletions)
    const { stdout: diffOutput } = await execAsync('git diff --shortstat', { cwd: worktreePath })

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

// Get the context hint (primary modified file or branch name)
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

// Get last commit message for a worktree
async function getWorktreeCommitMessage(worktreePath: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git log -1 --format=%s', { cwd: worktreePath })
    return stdout.trim()
  } catch {
    return ''
  }
}

// Get directory modification time (used for sorting worktrees by creation order)
async function getDirectoryMtime(dirPath: string): Promise<string> {
  try {
    const stat = await statAsync(dirPath)
    return stat.mtime.toISOString()
  } catch {
    return new Date().toISOString()
  }
}

/**
 * Get the most recent file modification time in a worktree
 * Scans files recursively, respecting .gitignore patterns
 * This detects activity even when agents make changes not yet tracked by git
 */
async function getLastFileModifiedTime(worktreePath: string): Promise<string> {
  try {
    // Use git ls-files to get tracked files, then check their mtimes
    // Also check untracked files that aren't ignored
    const { stdout: trackedOutput } = await execAsync('git ls-files', { cwd: worktreePath })
    const trackedFiles = trackedOutput.split('\n').filter(Boolean)

    // Get untracked files (respects .gitignore)
    const { stdout: untrackedOutput } = await execAsync(
      'git ls-files --others --exclude-standard',
      { cwd: worktreePath }
    )
    const untrackedFiles = untrackedOutput.split('\n').filter(Boolean)

    const allFiles = [...trackedFiles, ...untrackedFiles]

    let latestMtime = 0

    // Check file mtimes in batches for efficiency
    const batchSize = 50
    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize)
      const mtimePromises = batch.map(async (file) => {
        try {
          const fullPath = path.join(worktreePath, file)
          const stat = await statAsync(fullPath)
          return stat.mtime.getTime()
        } catch {
          return 0
        }
      })
      const mtimes = await Promise.all(mtimePromises)
      const maxInBatch = Math.max(...mtimes, 0)
      if (maxInBatch > latestMtime) {
        latestMtime = maxInBatch
      }
    }

    return latestMtime > 0 ? new Date(latestMtime).toISOString() : new Date().toISOString()
  } catch {
    // Fallback to directory mtime
    return getDirectoryMtime(worktreePath)
  }
}

/**
 * Get the last git activity time for a worktree
 * Returns the more recent of: last commit time, or last change to working directory
 */
async function getLastGitActivity(worktreePath: string): Promise<string> {
  try {
    // Get last commit time
    let lastCommitTime = 0
    try {
      const { stdout: commitTimeOutput } = await execAsync(
        'git log -1 --format=%ct',
        { cwd: worktreePath }
      )
      const timestamp = parseInt(commitTimeOutput.trim(), 10)
      if (!isNaN(timestamp)) {
        lastCommitTime = timestamp * 1000 // Convert to milliseconds
      }
    } catch {
      // No commits yet
    }

    // Check for uncommitted changes and their modification times
    let lastChangeTime = 0
    try {
      // Get modified files in working directory
      const { stdout: diffFiles } = await execAsync(
        'git diff --name-only',
        { cwd: worktreePath }
      )
      const { stdout: stagedFiles } = await execAsync(
        'git diff --staged --name-only',
        { cwd: worktreePath }
      )
      const { stdout: untrackedFiles } = await execAsync(
        'git ls-files --others --exclude-standard',
        { cwd: worktreePath }
      )

      const changedFiles = [
        ...diffFiles.split('\n').filter(Boolean),
        ...stagedFiles.split('\n').filter(Boolean),
        ...untrackedFiles.split('\n').filter(Boolean),
      ]

      // Get the most recent mtime of changed files
      for (const file of changedFiles.slice(0, 20)) { // Limit to 20 files for perf
        try {
          const fullPath = path.join(worktreePath, file)
          const stat = await statAsync(fullPath)
          if (stat.mtime.getTime() > lastChangeTime) {
            lastChangeTime = stat.mtime.getTime()
          }
        } catch {
          // File might have been deleted
        }
      }
    } catch {
      // No changes
    }

    // Return the more recent of commit time or change time
    const latestActivity = Math.max(lastCommitTime, lastChangeTime)
    return latestActivity > 0 ? new Date(latestActivity).toISOString() : new Date().toISOString()
  } catch {
    return new Date().toISOString()
  }
}

/**
 * Calculate activity status based on both file and git activity
 * Uses the more recent of the two signals
 */
function calculateActivityStatus(
  lastFileModified: string,
  lastGitActivity: string
): { status: WorktreeActivityStatus; source: 'file' | 'git' | 'both' } {
  const now = Date.now()
  const fileModified = new Date(lastFileModified).getTime()
  const gitActivity = new Date(lastGitActivity).getTime()

  // Use the more recent activity
  const moreRecent = Math.max(fileModified, gitActivity)
  const diffMinutes = (now - moreRecent) / (1000 * 60)

  // Determine which source is more recent
  let source: 'file' | 'git' | 'both' = 'both'
  const timeDiff = Math.abs(fileModified - gitActivity)
  const significantDiff = 60 * 1000 // 1 minute threshold
  
  if (timeDiff > significantDiff) {
    source = fileModified > gitActivity ? 'file' : 'git'
  }

  let status: WorktreeActivityStatus
  if (diffMinutes < 5) {
    status = 'active' // Modified in last 5 minutes
  } else if (diffMinutes < 60) {
    status = 'recent' // Modified in last hour
  } else if (diffMinutes < 24 * 60) {
    status = 'stale' // Modified in last 24 hours
  } else {
    status = 'unknown' // Older than 24 hours
  }

  return { status, source }
}

// Get agent task hint from Cursor transcript files
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
      const files = fs.readdirSync(transcriptsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(transcriptsDir, f),
          mtime: fs.statSync(path.join(transcriptsDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime)

      // Check the most recent transcripts for references to this worktree
      for (const file of files.slice(0, 5)) { // Only check 5 most recent
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

// Get agent task hint from Claude Code session files
// Claude Code stores sessions in ~/.claude/projects/{encoded-path}/*.jsonl
async function getClaudeCodeAgentTaskHint(worktreePath: string): Promise<string | null> {
  try {
    const homeDir = process.env.HOME || ''
    const projectsDir = path.join(homeDir, '.claude', 'projects')

    // Check if the projects directory exists
    if (!fs.existsSync(projectsDir)) return null

    // Claude Code encodes paths by replacing / with - (e.g., /Users/foo/bar -> -Users-foo-bar)
    const encodedPath = worktreePath.replace(/\//g, '-')
    const projectFolder = path.join(projectsDir, encodedPath)

    // Check if this worktree has a Claude Code project folder
    if (!fs.existsSync(projectFolder)) return null

    // Get session files sorted by modification time (newest first)
    // Session files are UUIDs.jsonl, skip agent-*.jsonl files
    const files = fs.readdirSync(projectFolder)
      .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
      .map(f => ({
        name: f,
        path: path.join(projectFolder, f),
        mtime: fs.statSync(path.join(projectFolder, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime)

    // Check the most recent session file
    for (const file of files.slice(0, 3)) { // Only check 3 most recent sessions
      try {
        const content = fs.readFileSync(file.path, 'utf-8')
        const lines = content.split('\n').filter(Boolean)

        // Find the first user message in the session
        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            
            // Look for user messages
            if (entry.type === 'user' && entry.message?.content) {
              let userContent = entry.message.content
              
              // Strip system instruction tags if present
              userContent = userContent.replace(/<system[_-]?instruction>[\s\S]*?<\/system[_-]?instruction>/gi, '')
              
              // Get the actual user query, trimming whitespace
              const trimmed = userContent.trim()
              if (!trimmed) continue
              
              // Get first meaningful line
              const firstLine = trimmed.split('\n')[0].trim()
              if (!firstLine) continue
              
              return firstLine.slice(0, 60) + (firstLine.length > 60 ? '…' : '')
            }
          } catch {
            // Skip malformed lines
            continue
          }
        }
      } catch {
        // Skip unreadable files
        continue
      }
    }

    return null
  } catch {
    return null
  }
}

// Get enhanced worktrees with agent detection and metadata
export async function getEnhancedWorktrees(): Promise<EnhancedWorktree[]> {
  if (!git) throw new Error('No repository selected')

  // Get basic worktree list
  const basicWorktrees = await getWorktrees()

  // Enhance each worktree with metadata (in parallel)
  const enhancedPromises = basicWorktrees.map(async (wt) => {
    const agent = detectAgent(wt.path)

    // Gather all metadata in parallel
    const [diffStats, commitMessage, lastModified, lastFileModified, lastGitActivity, agentTaskHint] = await Promise.all([
      getWorktreeDiffStats(wt.path),
      getWorktreeCommitMessage(wt.path),
      getDirectoryMtime(wt.path),
      getLastFileModifiedTime(wt.path),
      getLastGitActivity(wt.path),
      agent === 'cursor' ? getCursorAgentTaskHint(wt.path) :
      agent === 'claude' ? getClaudeCodeAgentTaskHint(wt.path) :
      Promise.resolve(null),
    ])

    const contextHint = getContextHint(wt.branch, diffStats.changedFiles, commitMessage)
    const { status: activityStatus, source: activitySource } = calculateActivityStatus(lastFileModified, lastGitActivity)

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
      lastFileModified,
      lastGitActivity,
      activitySource,
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

// Check if there are uncommitted changes (including untracked files)
export async function hasUncommittedChanges(): Promise<boolean> {
  if (!git) throw new Error('No repository selected')

  const status = await git.status()
  // isClean() only checks tracked file changes, not untracked files
  // We also need to check not_added (untracked files) to preserve them during checkout
  return !status.isClean() || status.not_added.length > 0
}

// Stash uncommitted changes
export async function stashChanges(): Promise<{ stashed: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  const hasChanges = await hasUncommittedChanges()
  if (!hasChanges) {
    return { stashed: false, message: 'No changes to stash' }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const stashMessage = `Ledger auto-stash ${timestamp}`

  await git.stash(['push', '-m', stashMessage, '--include-untracked'])
  return { stashed: true, message: stashMessage }
}

// Switch to a local branch
export async function checkoutBranch(
  branchName: string
): Promise<{ success: boolean; message: string; stashed?: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    // Stash any uncommitted changes first
    const stashResult = await stashChanges()

    // Checkout the branch with --ignore-other-worktrees to allow checking out
    // branches that are already checked out in other worktrees
    await git.checkout(['--ignore-other-worktrees', branchName])

    // If we stashed changes, try to pop them onto the new branch
    if (stashResult.stashed) {
      try {
        await git.raw(['stash', 'pop'])
        return {
          success: true,
          message: `Switched to branch '${branchName}' with uncommitted changes`,
        }
      } catch (_popError) {
        // Pop failed (likely conflicts) - leave changes in stash
        return {
          success: true,
          message: `Switched to '${branchName}'. Uncommitted changes moved to stash (conflicts detected).`,
          stashed: stashResult.message,
        }
      }
    }

    return {
      success: true,
      message: `Switched to branch '${branchName}'`,
    }
  } catch (error) {
    return {
      success: false,
      message: (error as Error).message,
    }
  }
}

// Checkout a specific commit (creates detached HEAD state unless on a branch tip)
export async function checkoutCommit(
  commitHash: string,
  branchName?: string
): Promise<{ success: boolean; message: string; stashed?: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    // Stash any uncommitted changes first
    const stashResult = await stashChanges()

    // If a branch name is provided and the commit is the tip of that branch, checkout the branch instead
    if (branchName) {
      const branches = await git.branchLocal()
      if (branches.all.includes(branchName)) {
        // Check if the branch tip matches the commit
        const branchCommit = await git.revparse([branchName])
        if (branchCommit.trim() === commitHash || branchCommit.trim().startsWith(commitHash)) {
          // Checkout the branch (avoids detached HEAD)
          await git.checkout(['--ignore-other-worktrees', branchName])
          
          if (stashResult.stashed) {
            try {
              await git.raw(['stash', 'pop'])
              return {
                success: true,
                message: `Switched to branch '${branchName}' with uncommitted changes`,
              }
            } catch (_popError) {
              return {
                success: true,
                message: `Switched to '${branchName}'. Uncommitted changes moved to stash (conflicts detected).`,
                stashed: stashResult.message,
              }
            }
          }
          
          return {
            success: true,
            message: `Switched to branch '${branchName}'`,
          }
        }
      }
    }

    // Checkout the commit directly (detached HEAD)
    await git.checkout(commitHash)

    if (stashResult.stashed) {
      try {
        await git.raw(['stash', 'pop'])
        return {
          success: true,
          message: `Checked out commit ${commitHash.slice(0, 7)} (detached HEAD) with uncommitted changes`,
        }
      } catch (_popError) {
        return {
          success: true,
          message: `Checked out commit ${commitHash.slice(0, 7)} (detached HEAD). Uncommitted changes moved to stash.`,
          stashed: stashResult.message,
        }
      }
    }

    return {
      success: true,
      message: `Checked out commit ${commitHash.slice(0, 7)} (detached HEAD)`,
    }
  } catch (error) {
    return {
      success: false,
      message: (error as Error).message,
    }
  }
}

// Push a branch to origin
export async function pushBranch(
  branchName?: string,
  setUpstream: boolean = true
): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    // Get current branch if not specified
    const branch = branchName || (await git.branchLocal()).current

    if (setUpstream) {
      // Use --set-upstream to establish tracking
      await git.push(['--set-upstream', 'origin', branch])
    } else {
      await git.push('origin', branch)
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

// Create a new branch
export async function createBranch(
  branchName: string,
  checkout: boolean = true
): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

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
    const branches = await git.branchLocal()
    if (branches.all.includes(trimmedName)) {
      return { success: false, message: `Branch '${trimmedName}' already exists` }
    }

    if (checkout) {
      // Create and checkout in one step
      await git.checkoutLocalBranch(trimmedName)
      return { success: true, message: `Created and switched to branch '${trimmedName}'` }
    } else {
      // Just create the branch without switching
      await git.branch([trimmedName])
      return { success: true, message: `Created branch '${trimmedName}'` }
    }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Delete a branch
export async function deleteBranch(
  branchName: string,
  force: boolean = false
): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    const trimmedName = branchName.trim()
    if (!trimmedName) {
      return { success: false, message: 'Branch name cannot be empty' }
    }

    // Don't allow deleting main/master
    if (trimmedName === 'main' || trimmedName === 'master') {
      return { success: false, message: 'Cannot delete main or master branch' }
    }

    // Check if currently on this branch
    const status = await git.status()
    if (status.current === trimmedName) {
      return { success: false, message: 'Cannot delete the currently checked out branch' }
    }

    // Delete the branch
    const deleteFlag = force ? '-D' : '-d'
    await git.branch([deleteFlag, trimmedName])
    return { success: true, message: `Deleted branch '${trimmedName}'` }
  } catch (error) {
    const errorMessage = (error as Error).message
    // If branch not fully merged, suggest force delete
    if (errorMessage.includes('not fully merged')) {
      return {
        success: false,
        message: `Branch '${branchName}' is not fully merged. Use force delete to remove it anyway.`,
      }
    }
    return { success: false, message: errorMessage }
  }
}

// Rename a branch
export async function renameBranch(
  oldName: string,
  newName: string
): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    const trimmedOldName = oldName.trim()
    const trimmedNewName = newName.trim()

    if (!trimmedOldName || !trimmedNewName) {
      return { success: false, message: 'Branch names cannot be empty' }
    }

    // Don't allow renaming main/master
    if (trimmedOldName === 'main' || trimmedOldName === 'master') {
      return { success: false, message: 'Cannot rename main or master branch' }
    }

    // Don't allow renaming to main/master
    if (trimmedNewName === 'main' || trimmedNewName === 'master') {
      return { success: false, message: 'Cannot rename to main or master' }
    }

    // Validate new branch name format (no spaces, special chars at start)
    if (!/^[a-zA-Z0-9]/.test(trimmedNewName)) {
      return { success: false, message: 'Branch name must start with a letter or number' }
    }

    if (/\s/.test(trimmedNewName)) {
      return { success: false, message: 'Branch name cannot contain spaces' }
    }

    // Check if new name already exists
    const branches = await git.branchLocal()
    if (branches.all.includes(trimmedNewName)) {
      return { success: false, message: `Branch '${trimmedNewName}' already exists` }
    }

    // Rename the branch using -m flag
    await git.branch(['-m', trimmedOldName, trimmedNewName])
    return { success: true, message: `Renamed branch '${trimmedOldName}' to '${trimmedNewName}'` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Delete a remote branch (git push origin --delete branchname)
export async function deleteRemoteBranch(
  branchName: string
): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    // Clean up the branch name (remove remotes/origin/ prefix if present)
    let cleanName = branchName.trim()
    cleanName = cleanName.replace(/^remotes\//, '').replace(/^origin\//, '')
    
    if (!cleanName) {
      return { success: false, message: 'Branch name cannot be empty' }
    }

    // Don't allow deleting main/master
    if (cleanName === 'main' || cleanName === 'master') {
      return { success: false, message: 'Cannot delete main or master branch' }
    }

    // Delete the remote branch
    await git.raw(['push', 'origin', '--delete', cleanName])
    return { success: true, message: `Deleted remote branch 'origin/${cleanName}'` }
  } catch (error) {
    const errorMessage = (error as Error).message
    if (errorMessage.includes('remote ref does not exist')) {
      return { success: false, message: `Remote branch '${branchName}' does not exist` }
    }
    return { success: false, message: errorMessage }
  }
}

// Checkout a remote branch (creates local tracking branch)
export async function checkoutRemoteBranch(
  remoteBranch: string
): Promise<{ success: boolean; message: string; stashed?: string }> {
  if (!git) throw new Error('No repository selected')

  // Helper to pop stash and return appropriate result
  const popStashAndReturn = async (stashResult: { stashed: boolean; message: string }, successMessage: string) => {
    if (stashResult.stashed) {
      try {
        await git!.raw(['stash', 'pop'])
        return {
          success: true,
          message: `${successMessage} with uncommitted changes`,
        }
      } catch (_popError) {
        return {
          success: true,
          message: `${successMessage}. Uncommitted changes moved to stash (conflicts detected).`,
          stashed: stashResult.message,
        }
      }
    }
    return { success: true, message: successMessage }
  }

  try {
    // Stash any uncommitted changes first
    const stashResult = await stashChanges()

    // Extract the local branch name from remote (e.g., "remotes/origin/feature" -> "feature")
    const parts = remoteBranch.replace('remotes/', '').split('/')
    parts.shift() // remove "origin" or other remote name
    const localBranchName = parts.join('/')

    // Check if local branch already exists
    const branches = await git.branchLocal()
    if (branches.all.includes(localBranchName)) {
      // Just checkout existing local branch (allow even if checked out in worktree)
      await git.checkout(['--ignore-other-worktrees', localBranchName])
      return popStashAndReturn(stashResult, `Switched to existing branch '${localBranchName}'`)
    }

    // Create and checkout tracking branch (--ignore-other-worktrees for the checkout part)
    await git.checkout([
      '--ignore-other-worktrees',
      '-b',
      localBranchName,
      '--track',
      remoteBranch.replace('remotes/', ''),
    ])

    return popStashAndReturn(stashResult, `Created and switched to branch '${localBranchName}' tracking '${remoteBranch}'`)
  } catch (error) {
    return {
      success: false,
      message: (error as Error).message,
    }
  }
}

// Get the path of a worktree to open
export function getWorktreePath(worktreePath: string): string {
  return worktreePath
}

// Pull Request types
export interface PullRequest {
  number: number
  title: string
  author: string
  branch: string
  baseBranch: string
  url: string
  createdAt: string
  updatedAt: string
  additions: number
  deletions: number
  reviewDecision: string | null
  labels: string[]
  isDraft: boolean
  comments: number
}

// Fetch open, non-draft pull requests using GitHub CLI
export async function getPullRequests(): Promise<{ prs: PullRequest[]; error?: string }> {
  if (!repoPath) {
    return { prs: [], error: 'No repository selected' }
  }

  try {
    // Use gh CLI to list PRs in JSON format
    // Fetch all open PRs (filtering will happen in UI)
    const { stdout } = await execAsync(
      `gh pr list --state open --json number,title,author,headRefName,baseRefName,url,createdAt,updatedAt,additions,deletions,reviewDecision,labels,isDraft,comments`,
      { cwd: repoPath }
    )

    const rawPRs = JSON.parse(stdout)

    // Map to our interface (include all, filtering done in UI)
    const prs: PullRequest[] = rawPRs.map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      author: pr.author?.login || 'unknown',
      branch: pr.headRefName,
      baseBranch: pr.baseRefName,
      url: pr.url,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      additions: pr.additions || 0,
      deletions: pr.deletions || 0,
      reviewDecision: pr.reviewDecision,
      labels: (pr.labels || []).map((l: any) => l.name),
      isDraft: pr.isDraft || false,
      comments: pr.comments?.totalCount || 0,
    }))

    return { prs }
  } catch (error) {
    const errorMessage = (error as Error).message

    // Check for common errors
    if (errorMessage.includes('gh: command not found') || errorMessage.includes('not recognized')) {
      return { prs: [], error: 'GitHub CLI (gh) not installed. Install from https://cli.github.com' }
    }
    if (errorMessage.includes('not logged in') || errorMessage.includes('authentication')) {
      return { prs: [], error: 'Not logged in to GitHub CLI. Run: gh auth login' }
    }
    if (errorMessage.includes('not a git repository') || errorMessage.includes('no git remotes')) {
      return { prs: [], error: 'Not a GitHub repository' }
    }

    return { prs: [], error: errorMessage }
  }
}

// Open a PR in the browser
export async function openPullRequest(url: string): Promise<{ success: boolean; message: string }> {
  try {
    await execAsync(`open "${url}"`)
    return { success: true, message: 'Opened PR in browser' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Create a new pull request
export async function createPullRequest(options: {
  title: string
  body?: string
  headBranch?: string
  baseBranch?: string
  draft?: boolean
  web?: boolean
}): Promise<{ success: boolean; message: string; url?: string }> {
  if (!repoPath || !git) {
    return { success: false, message: 'No repository selected' }
  }

  try {
    // First, push the branch to ensure it exists on remote
    const branchToPush = options.headBranch || (await git.revparse(['--abbrev-ref', 'HEAD']))
    const pushResult = await pushBranch(branchToPush, true)
    if (!pushResult.success) {
      return { success: false, message: `Failed to push branch: ${pushResult.message}` }
    }

    const args = ['pr', 'create']

    // Escape single quotes in title and body for shell
    const escapeForShell = (str: string) => str.replace(/'/g, "'\\''")

    args.push('--title', `'${escapeForShell(options.title)}'`)

    // Always provide body (required for non-interactive mode)
    const body = options.body || ''
    args.push('--body', `'${escapeForShell(body)}'`)

    if (options.headBranch) {
      args.push('--head', options.headBranch)
    }

    if (options.baseBranch) {
      args.push('--base', options.baseBranch)
    }

    if (options.draft) {
      args.push('--draft')
    }

    if (options.web) {
      // Open in browser for full editing
      args.push('--web')
      await execAsync(`gh ${args.join(' ')}`, { cwd: repoPath })
      return { success: true, message: 'Opened PR creation in browser' }
    }

    const { stdout } = await execAsync(`gh ${args.join(' ')}`, { cwd: repoPath })
    const url = stdout.trim()

    return {
      success: true,
      message: 'Pull request created',
      url,
    }
  } catch (error) {
    const errorMessage = (error as Error).message
    // Check for common errors
    if (errorMessage.includes('already exists')) {
      return { success: false, message: 'A pull request already exists for this branch' }
    }
    if (errorMessage.includes('not logged')) {
      return { success: false, message: 'Not logged into GitHub CLI. Run `gh auth login` in terminal.' }
    }
    return { success: false, message: errorMessage }
  }
}

// Merge a pull request
export type MergeMethod = 'merge' | 'squash' | 'rebase'

export async function mergePullRequest(
  prNumber: number,
  options?: {
    method?: MergeMethod
    deleteAfterMerge?: boolean
  }
): Promise<{ success: boolean; message: string; stashed?: boolean }> {
  if (!repoPath || !git) {
    return { success: false, message: 'No repository selected' }
  }

  const args = ['pr', 'merge', prNumber.toString()]

  // Add merge method (providing this explicitly avoids interactive prompts)
  const method = options?.method || 'merge'
  args.push(`--${method}`)

  // Delete branch after merge (default: true)
  if (options?.deleteAfterMerge !== false) {
    args.push('--delete-branch')
  }

  const runMerge = async () => {
    await execAsync(`gh ${args.join(' ')}`, { cwd: repoPath! })
  }

  try {
    // First attempt - try without stashing
    await runMerge()
    return {
      success: true,
      message: `Pull request #${prNumber} merged successfully`,
    }
  } catch (error) {
    const errorMessage = (error as Error).message

    // If checkout conflict due to uncommitted changes, auto-stash and retry
    if (errorMessage.includes('would be overwritten by checkout') || errorMessage.includes('commit your changes or stash them')) {
      const hasChanges = await hasUncommittedChanges()
      if (hasChanges) {
        try {
          await git.raw(['stash', 'push', '--include-untracked', '-m', 'ledger-auto-stash-for-merge'])
          
          // Retry the merge
          await runMerge()
          
          // Restore stashed changes
          try {
            await git.raw(['stash', 'pop'])
            return {
              success: true,
              message: `Pull request #${prNumber} merged successfully`,
              stashed: true,
            }
          } catch (_stashErr) {
            return {
              success: true,
              message: `PR #${prNumber} merged! Your stashed changes may have conflicts - run 'git stash pop' manually.`,
              stashed: true,
            }
          }
        } catch (retryError) {
          // Restore stash on retry failure
          try {
            await git.raw(['stash', 'pop'])
          } catch {
            // Ignore
          }
          return { success: false, message: (retryError as Error).message }
        }
      }
    }

    // Check if merge succeeded but branch deletion failed (e.g., branch in use by worktree)
    if (errorMessage.includes('was already merged') && errorMessage.includes('Cannot delete branch')) {
      return {
        success: true,
        message: `PR #${prNumber} merged! Branch not deleted (in use by a worktree).`,
      }
    }

    // Check for common errors
    if (errorMessage.includes('not mergeable')) {
      return { success: false, message: 'Pull request is not mergeable. Check for conflicts or required checks.' }
    }
    if (errorMessage.includes('not logged')) {
      return { success: false, message: 'Not logged into GitHub CLI. Run `gh auth login` in terminal.' }
    }
    if (errorMessage.includes('MERGED')) {
      return { success: false, message: 'Pull request has already been merged.' }
    }
    if (errorMessage.includes('CLOSED')) {
      return { success: false, message: 'Pull request is closed.' }
    }

    return { success: false, message: errorMessage }
  }
}

// ========================================
// PR Review Types and Functions
// ========================================

export interface PRComment {
  id: string
  author: { login: string }
  authorAssociation: string
  body: string
  createdAt: string
  url: string
  isMinimized: boolean
}

export interface PRReview {
  id: string
  author: { login: string }
  authorAssociation: string
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED'
  body: string
  submittedAt: string
}

export interface PRFile {
  path: string
  additions: number
  deletions: number
}

export interface PRCommit {
  oid: string
  messageHeadline: string
  author: { name: string; email: string }
  committedDate: string
}

export interface PRReviewComment {
  id: number
  author: { login: string }
  authorAssociation: string
  body: string
  path: string
  line: number | null
  startLine: number | null
  side: 'LEFT' | 'RIGHT'
  diffHunk: string
  createdAt: string
  inReplyToId: number | null
  url: string
}

export interface PRDetail {
  number: number
  title: string
  body: string
  author: { login: string }
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  baseRefName: string
  headRefName: string
  additions: number
  deletions: number
  createdAt: string
  updatedAt: string
  url: string
  comments: PRComment[]
  reviews: PRReview[]
  files: PRFile[]
  commits: PRCommit[]
  // Line-specific review comments (fetched separately)
  reviewComments?: PRReviewComment[]
}

// Get detailed PR information including comments, reviews, files
export async function getPRDetail(prNumber: number): Promise<PRDetail | null> {
  if (!repoPath) return null

  try {
    const { stdout } = await execAsync(
      `gh pr view ${prNumber} --json number,title,body,author,state,reviewDecision,baseRefName,headRefName,additions,deletions,createdAt,updatedAt,url,comments,reviews,files,commits`,
      { cwd: repoPath }
    )

    const data = JSON.parse(stdout)

    return {
      number: data.number,
      title: data.title,
      body: data.body || '',
      author: { login: data.author?.login || 'unknown' },
      state: data.state,
      reviewDecision: data.reviewDecision,
      baseRefName: data.baseRefName,
      headRefName: data.headRefName,
      additions: data.additions || 0,
      deletions: data.deletions || 0,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      url: data.url,
      comments: (data.comments || []).map((c: any) => ({
        id: c.id,
        author: { login: c.author?.login || 'unknown' },
        authorAssociation: c.authorAssociation || 'NONE',
        body: c.body || '',
        createdAt: c.createdAt,
        url: c.url,
        isMinimized: c.isMinimized || false,
      })),
      reviews: (data.reviews || []).map((r: any) => ({
        id: r.id,
        author: { login: r.author?.login || 'unknown' },
        authorAssociation: r.authorAssociation || 'NONE',
        state: r.state,
        body: r.body || '',
        submittedAt: r.submittedAt,
      })),
      files: (data.files || []).map((f: any) => ({
        path: f.path,
        additions: f.additions || 0,
        deletions: f.deletions || 0,
      })),
      commits: (data.commits || []).map((c: any) => ({
        oid: c.oid,
        messageHeadline: c.messageHeadline,
        author: { name: c.authors?.[0]?.name || 'unknown', email: c.authors?.[0]?.email || '' },
        committedDate: c.committedDate,
      })),
    }
  } catch (error) {
    console.error('Error fetching PR detail:', error)
    return null
  }
}

// Get line-specific review comments for a PR
export async function getPRReviewComments(prNumber: number): Promise<PRReviewComment[]> {
  if (!repoPath) return []

  try {
    // Get repo owner and name from GitHub URL
    const ghUrl = await getGitHubUrl()
    if (!ghUrl) return []

    // Extract owner/repo from URL (e.g., "https://github.com/owner/repo")
    const match = ghUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (!match) return []

    const [, owner, repo] = match

    const { stdout } = await execAsync(`gh api /repos/${owner}/${repo}/pulls/${prNumber}/comments`, { cwd: repoPath })

    const comments = JSON.parse(stdout)

    return comments.map((c: any) => ({
      id: c.id,
      author: { login: c.user?.login || 'unknown' },
      authorAssociation: c.author_association || 'NONE',
      body: c.body || '',
      path: c.path,
      line: c.line,
      startLine: c.start_line,
      side: c.side || 'RIGHT',
      diffHunk: c.diff_hunk || '',
      createdAt: c.created_at,
      inReplyToId: c.in_reply_to_id,
      url: c.html_url,
    }))
  } catch (error) {
    console.error('Error fetching PR review comments:', error)
    return []
  }
}

// Get the diff for a specific file in a PR (raw text)
export async function getPRFileDiff(prNumber: number, filePath: string): Promise<string | null> {
  if (!repoPath) return null

  try {
    // gh pr diff doesn't support file filtering, so get full diff and parse
    const { stdout: fullDiff } = await execAsync(
      `gh pr diff ${prNumber}`,
      { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large diffs
    )

    // Parse the unified diff to extract just the file we want
    const lines = fullDiff.split('\n')
    let inTargetFile = false
    const result: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for diff header for a new file
      if (line.startsWith('diff --git ')) {
        // Check if this is the file we want
        // Format: diff --git a/path/to/file b/path/to/file
        const aPath = line.match(/a\/(.+?) b\//)?.[1]
        const bPath = line.match(/ b\/(.+)$/)?.[1]
        inTargetFile = aPath === filePath || bPath === filePath
      }

      if (inTargetFile) {
        result.push(line)
      }
    }

    return result.length > 0 ? result.join('\n') : null
  } catch (error) {
    console.error('Error fetching PR file diff:', error)
    return null
  }
}

// Get parsed diff for a specific file in a PR (with hunks and line-by-line info)
export async function getPRFileDiffParsed(prNumber: number, filePath: string): Promise<StagingFileDiff | null> {
  if (!repoPath) return null

  try {
    // Get the raw diff first
    const rawDiff = await getPRFileDiff(prNumber, filePath)
    if (!rawDiff) return null

    // Parse the diff using the same parser as staging
    return parseDiff(rawDiff, filePath)
  } catch (error) {
    console.error('Error fetching parsed PR file diff:', error)
    return null
  }
}

// Add a comment to a PR
export async function commentOnPR(prNumber: number, body: string): Promise<{ success: boolean; message: string }> {
  if (!repoPath) {
    return { success: false, message: 'No repository selected' }
  }

  try {
    // Escape the body for shell
    const escapedBody = body.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$')

    await execAsync(`gh pr comment ${prNumber} --body "${escapedBody}"`, { cwd: repoPath })

    return { success: true, message: 'Comment added' }
  } catch (error) {
    const errorMessage = (error as Error).message

    if (errorMessage.includes('not logged')) {
      return { success: false, message: 'Not logged into GitHub CLI. Run `gh auth login` in terminal.' }
    }

    return { success: false, message: errorMessage }
  }
}

// Merge a PR (delegates to mergePullRequest with auto-stash support)
export async function mergePR(prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<{ success: boolean; message: string }> {
  return mergePullRequest(prNumber, { method: mergeMethod, deleteAfterMerge: true })
}

// Get the GitHub remote URL for the repository
export async function getGitHubUrl(): Promise<string | null> {
  if (!git) return null

  try {
    const remotes = await git.getRemotes(true)
    const origin = remotes.find((r) => r.name === 'origin')
    if (!origin?.refs?.fetch) return null

    let url = origin.refs.fetch
    // Convert SSH URL to HTTPS
    if (url.startsWith('git@github.com:')) {
      url = url.replace('git@github.com:', 'https://github.com/').replace(/\.git$/, '')
    } else if (url.startsWith('https://github.com/')) {
      url = url.replace(/\.git$/, '')
    } else {
      return null
    }

    return url
  } catch {
    return null
  }
}

// Open a branch in GitHub
export async function openBranchInGitHub(branchName: string): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl = await getGitHubUrl()
    if (!baseUrl) {
      return { success: false, message: 'Could not determine GitHub URL' }
    }

    // Clean up branch name (remove remotes/origin/ prefix if present)
    const cleanBranch = branchName.replace(/^remotes\/origin\//, '').replace(/^origin\//, '')
    const url = `${baseUrl}/tree/${cleanBranch}`

    await execAsync(`open "${url}"`)
    return { success: true, message: `Opened ${cleanBranch} in browser` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Pull/fetch a remote branch
export async function pullBranch(remoteBranch: string): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    // Extract remote and branch name
    const cleanBranch = remoteBranch.replace(/^remotes\//, '')
    const parts = cleanBranch.split('/')
    const remote = parts[0] // e.g., "origin"
    const branch = parts.slice(1).join('/') // e.g., "feature/something"

    // Fetch the specific branch
    await git.fetch(remote, branch)

    return { success: true, message: `Fetched ${branch} from ${remote}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Commit info for timeline
export interface CommitInfo {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  isMerge: boolean
  filesChanged?: number
  additions?: number
  deletions?: number
}

// Get recent commit history for the current branch
export async function getCommitHistory(limit: number = 20): Promise<CommitInfo[]> {
  if (!git) throw new Error('No repository selected')

  try {
    // Get basic log info
    const log = await git.log(['-n', limit.toString()])

    // Get stat info for each commit
    const commits: CommitInfo[] = []
    for (const commit of log.all) {
      // Get file stats for this commit
      let filesChanged = 0
      let additions = 0
      let deletions = 0

      try {
        const statOutput = await git.raw(['show', '--stat', '--format=', commit.hash])
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

// Get list of uncommitted files (staged + unstaged + untracked)
export interface UncommittedFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
}

export async function getUncommittedFiles(): Promise<UncommittedFile[]> {
  if (!git) throw new Error('No repository selected')

  try {
    const status = await git.status()
    const files: UncommittedFile[] = []
    const addedPaths = new Set<string>()

    // Process the files array which has detailed info about each file
    // status.files is an array of FileStatusResult with index, working_dir, path
    for (const file of status.files) {
      const path = file.path

      // Skip if we've already processed this file
      if (addedPaths.has(path)) continue

      // Index status (staged area): ' ' = unmodified, M = modified, A = added, D = deleted, R = renamed, ? = untracked
      // Working dir status: same meanings for unstaged changes
      const indexStatus = file.index
      const workingStatus = file.working_dir

      // Determine file status and staged state
      // A file can have both staged and unstaged changes

      // Staged changes (index !== ' ' and index !== '?')
      if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
        let status: UncommittedFile['status'] = 'modified'
        if (indexStatus === 'A') status = 'added'
        else if (indexStatus === 'D') status = 'deleted'
        else if (indexStatus === 'R') status = 'renamed'
        else if (indexStatus === 'M') status = 'modified'

        files.push({ path, status, staged: true })
        addedPaths.add(path + ':staged')
      }

      // Unstaged changes (working_dir !== ' ' and working_dir !== '?')
      if (workingStatus && workingStatus !== ' ') {
        let status: UncommittedFile['status'] = 'modified'
        if (workingStatus === '?') status = 'untracked'
        else if (workingStatus === 'A') status = 'added'
        else if (workingStatus === 'D') status = 'deleted'
        else if (workingStatus === 'M') status = 'modified'

        files.push({ path, status, staged: false })
        addedPaths.add(path + ':unstaged')
      }

      addedPaths.add(path)
    }

    return files
  } catch (error) {
    console.error('Error getting uncommitted files:', error)
    return []
  }
}

// Get working directory status summary
export interface WorkingStatus {
  hasChanges: boolean
  files: UncommittedFile[]
  stagedCount: number
  unstagedCount: number
  additions: number
  deletions: number
}

export async function getWorkingStatus(): Promise<WorkingStatus> {
  if (!git) throw new Error('No repository selected')

  const files = await getUncommittedFiles()
  const stagedCount = files.filter((f) => f.staged).length
  const unstagedCount = files.filter((f) => !f.staged).length

  // Get line change stats (both staged and unstaged)
  let additions = 0
  let deletions = 0
  try {
    // Get unstaged changes
    const unstagedDiff = await git.diff(['--stat'])
    if (unstagedDiff.trim()) {
      const lines = unstagedDiff.trim().split('\n')
      const summaryLine = lines[lines.length - 1]
      const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/)
      const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/)
      additions += addMatch ? parseInt(addMatch[1]) : 0
      deletions += delMatch ? parseInt(delMatch[1]) : 0
    }

    // Get staged changes
    const stagedDiff = await git.diff(['--cached', '--stat'])
    if (stagedDiff.trim()) {
      const lines = stagedDiff.trim().split('\n')
      const summaryLine = lines[lines.length - 1]
      const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/)
      const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/)
      additions += addMatch ? parseInt(addMatch[1]) : 0
      deletions += delMatch ? parseInt(delMatch[1]) : 0
    }
  } catch {
    // Ignore diff errors
  }

  return {
    hasChanges: files.length > 0,
    files,
    stagedCount,
    unstagedCount,
    additions,
    deletions,
  }
}

/**
 * Get how many commits the current branch is behind main/master
 * Returns null if cannot be determined (e.g. no main branch, on main already)
 */
export async function getBehindMainCount(): Promise<{
  behind: number
  baseBranch: string
} | null> {
  if (!git) throw new Error('No repository selected')

  try {
    const status = await git.status()
    const currentBranch = status.current

    if (!currentBranch) return null

    // Don't show indicator if we're on main/master
    if (currentBranch === 'main' || currentBranch === 'master') {
      return null
    }

    // Find the base branch (origin/main, origin/master, or local main/master)
    let baseBranch: string | null = null
    const candidates = ['origin/main', 'origin/master', 'main', 'master']

    for (const candidate of candidates) {
      try {
        await git.raw(['rev-parse', '--verify', candidate])
        baseBranch = candidate
        break
      } catch {
        // Try next candidate
      }
    }

    if (!baseBranch) return null

    // Count commits the current branch is behind main
    // baseBranch..HEAD = commits in HEAD not in baseBranch (ahead)
    // HEAD..baseBranch = commits in baseBranch not in HEAD (behind)
    const behindOutput = await git.raw(['rev-list', '--count', `HEAD..${baseBranch}`])
    const behind = parseInt(behindOutput.trim()) || 0

    return { behind, baseBranch }
  } catch {
    return null
  }
}

// Reset to a specific commit
export async function resetToCommit(
  commitHash: string,
  mode: 'soft' | 'mixed' | 'hard' = 'hard'
): Promise<{ success: boolean; message: string; stashed?: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    // Stash any uncommitted changes first (only for hard reset)
    let stashResult = { stashed: false, message: '' }
    if (mode === 'hard') {
      stashResult = await stashChanges()
    }

    // Perform the reset
    await git.reset([`--${mode}`, commitHash])

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

// Get detailed information about a specific commit
export interface CommitFileChange {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'
  additions: number
  deletions: number
  oldPath?: string // For renames
}

export interface CommitDetails {
  hash: string
  shortHash: string
  message: string
  body: string
  author: string
  authorEmail: string
  date: string
  parentHashes: string[]
  files: CommitFileChange[]
  totalAdditions: number
  totalDeletions: number
}

export async function getCommitDetails(commitHash: string): Promise<CommitDetails | null> {
  if (!git) throw new Error('No repository selected')

  try {
    // Get commit info
    const log = await git.log(['-1', commitHash])
    const commit = log.latest
    if (!commit) return null

    // Get parent hashes
    const parentRaw = await git.raw(['rev-parse', `${commitHash}^@`]).catch(() => '')
    const parentHashes = parentRaw.trim().split('\n').filter(Boolean)

    // Parse numstat for additions/deletions
    const numstatOutput = await git.raw(['diff-tree', '--no-commit-id', '-r', '--numstat', commitHash])
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
    const nameStatusOutput = await git.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', commitHash])
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
    const fullMessage = await git.raw(['log', '-1', '--format=%B', commitHash])
    const messageLines = fullMessage.trim().split('\n')
    const subject = messageLines[0] || ''
    const body = messageLines.slice(1).join('\n').trim()

    // Get author email
    const authorEmail = await git.raw(['log', '-1', '--format=%ae', commitHash])

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

// Get commit history for a specific branch/ref
export async function getCommitHistoryForRef(ref: string, limit: number = 50): Promise<CommitInfo[]> {
  if (!git) throw new Error('No repository selected')

  try {
    const log = await git.log([ref, '-n', limit.toString()])

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

// Convert a worktree to a branch
// Takes changes from a worktree, creates a new branch from master/main with the folder name, and applies the changes
export async function convertWorktreeToBranch(
  worktreePath: string
): Promise<{ success: boolean; message: string; branchName?: string }> {
  if (!git) throw new Error('No repository selected')

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
    const branches = await git.branchLocal()
    if (branches.all.includes(branchName)) {
      return { success: false, message: `Branch '${branchName}' already exists` }
    }

    // Find the base branch (master or main)
    let baseBranch = 'master'
    try {
      await git.raw(['rev-parse', '--verify', 'origin/master'])
    } catch {
      try {
        await git.raw(['rev-parse', '--verify', 'origin/main'])
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

    // Get the diff from the worktree as a patch
    const { stdout: patchOutput } = await execAsync('git diff HEAD', { cwd: worktreePath })

    // Also get untracked files
    const { stdout: untrackedOutput } = await execAsync('git ls-files --others --exclude-standard', {
      cwd: worktreePath,
    })
    const untrackedFiles = untrackedOutput.split('\n').filter(Boolean)

    // Check if there are any changes
    if (!patchOutput.trim() && untrackedFiles.length === 0) {
      return { success: false, message: 'No changes to convert - worktree is clean' }
    }

    // Stash any changes in the main repo first
    const stashResult = await stashChanges()

    // Create a new branch from the base branch
    const baseRef = branches.all.includes(baseBranch) ? baseBranch : `origin/${baseBranch}`
    await git.checkout(['-b', branchName, baseRef])

    // Apply the patch if there are tracked file changes
    if (patchOutput.trim()) {
      // Write patch to a temp file
      const tempPatchFile = path.join(repoPath!, '.ledger-temp-patch')
      try {
        await fs.promises.writeFile(tempPatchFile, patchOutput)
        await execAsync(`git apply --3way "${tempPatchFile}"`, { cwd: repoPath! })
      } catch (applyError) {
        // If apply fails, try to apply with less strict options
        try {
          await execAsync(`git apply --reject --whitespace=fix "${tempPatchFile}"`, { cwd: repoPath! })
        } catch {
          // Clean up and revert to the base branch
          try {
            await fs.promises.unlink(tempPatchFile)
          } catch {
            /* ignore */
          }
          await git.checkout(stashResult.stashed ? '-' : baseBranch)
          await git.branch(['-D', branchName])
          if (stashResult.stashed) {
            await git.stash(['pop'])
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
      const destPath = path.join(repoPath!, file)

      // Ensure destination directory exists
      const destDir = path.dirname(destPath)
      await fs.promises.mkdir(destDir, { recursive: true })

      // Copy the file
      await fs.promises.copyFile(srcPath, destPath)
    }

    // Stage all changes
    await git.add(['-A'])

    // Commit the changes
    const commitMessage = `Changes from worktree: ${folderName}`
    await git.commit(commitMessage)

    return {
      success: true,
      message: `Created branch '${branchName}' with changes from worktree`,
      branchName,
    }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Apply changes from a worktree to the main repo
export async function applyWorktreeChanges(worktreePath: string): Promise<{ success: boolean; message: string }> {
  if (!git || !repoPath) throw new Error('No repository selected')

  try {
    // Check if this is the current worktree (main repo)
    if (worktreePath === repoPath) {
      return { success: false, message: 'Cannot apply from the main repository to itself' }
    }

    // Get the diff from the worktree as a patch
    const { stdout: patchOutput } = await execAsync('git diff HEAD', { cwd: worktreePath })

    // Also get list of untracked files
    const { stdout: untrackedOutput } = await execAsync('git ls-files --others --exclude-standard', {
      cwd: worktreePath,
    })
    const untrackedFiles = untrackedOutput.split('\n').filter(Boolean)

    // Check if there are any changes
    if (!patchOutput.trim() && untrackedFiles.length === 0) {
      return { success: false, message: 'No changes to apply - worktree is clean' }
    }

    // Apply the patch if there are tracked file changes
    if (patchOutput.trim()) {
      // Write patch to a temp file
      const tempPatchFile = path.join(repoPath, '.ledger-temp-patch')
      try {
        await fs.promises.writeFile(tempPatchFile, patchOutput)
        await execAsync(`git apply --3way "${tempPatchFile}"`, { cwd: repoPath })
        await fs.promises.unlink(tempPatchFile)
      } catch (_applyError) {
        // If apply fails, try with less strict options
        try {
          await execAsync(`git apply --reject --whitespace=fix "${tempPatchFile}"`, { cwd: repoPath })
          await fs.promises.unlink(tempPatchFile)
        } catch {
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
      const destPath = path.join(repoPath, file)

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

// Remove a worktree
export async function removeWorktree(
  worktreePath: string,
  force: boolean = false
): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    // Check if this is the current worktree (main repo)
    if (worktreePath === repoPath) {
      return { success: false, message: 'Cannot remove the main repository worktree' }
    }

    // Get worktree info to check for uncommitted changes
    const worktrees = await getWorktrees()
    const worktree = worktrees.find((wt) => wt.path === worktreePath)

    if (!worktree) {
      return { success: false, message: 'Worktree not found' }
    }

    // Check for uncommitted changes if not forcing
    if (!force) {
      try {
        const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: worktreePath })
        if (statusOutput.trim()) {
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

    await git.raw(args)

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

// Create a new worktree
export interface CreateWorktreeOptions {
  branchName: string
  isNewBranch: boolean
  folderPath: string
}

export async function createWorktree(
  options: CreateWorktreeOptions
): Promise<{ success: boolean; message: string; path?: string }> {
  if (!git) throw new Error('No repository selected')

  const { branchName, isNewBranch, folderPath } = options

  try {
    // Validate branch name
    if (!branchName || !branchName.trim()) {
      return { success: false, message: 'Branch name is required' }
    }

    // Validate folder path
    if (!folderPath || !folderPath.trim()) {
      return { success: false, message: 'Folder path is required' }
    }

    // Check if folder already exists
    if (fs.existsSync(folderPath)) {
      return { success: false, message: `Folder already exists: ${folderPath}` }
    }

    // Check if branch already exists (for new branches)
    const branches = await git.branchLocal()
    const branchExists = branches.all.includes(branchName)

    if (isNewBranch && branchExists) {
      return { success: false, message: `Branch '${branchName}' already exists` }
    }

    if (!isNewBranch && !branchExists) {
      // Check if it's a remote branch we can track
      const remoteBranches = await git.branch(['-r'])
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
      await git.raw(['worktree', 'add', '-b', branchName, folderPath])
    } else {
      // Create worktree with existing branch: git worktree add <path> <branch>
      await git.raw(['worktree', 'add', folderPath, branchName])
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

// Checkout a PR branch (by PR number)
// Uses `gh pr checkout` which handles fork PRs automatically by:
// - Adding the fork as a remote if needed
// - Fetching from the correct fork
// - Creating a local tracking branch
export async function checkoutPRBranch(
  prNumber: number
): Promise<{ success: boolean; message: string; stashed?: string }> {
  if (!git || !repoPath) throw new Error('No repository selected')

  try {
    // Stash any uncommitted changes first
    const stashResult = await stashChanges()

    // Use gh pr checkout which handles fork PRs automatically
    // This is the key insight: gh knows how to fetch from the contributor's fork
    await execAsync(`gh pr checkout ${prNumber}`, { cwd: repoPath })

    return {
      success: true,
      message: `Checked out PR #${prNumber}`,
      stashed: stashResult.stashed ? stashResult.message : undefined,
    }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// ========================================
// Focus Mode APIs
// ========================================

// Commit with graph data (parent hashes for graph rendering)
export interface GraphCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  parents: string[] // Parent commit hashes
  refs: string[] // Branch/tag refs pointing to this commit
  isMerge: boolean
  filesChanged?: number
  additions?: number
  deletions?: number
}

// Get commit history with parent info for git graph
// skipStats=true makes this much faster for initial load (100x fewer git commands)
// showCheckpoints=false hides Conductor checkpoint commits (checkpoint:... messages)
export async function getCommitGraphHistory(
  limit: number = 100,
  skipStats: boolean = false,
  showCheckpoints: boolean = false
): Promise<GraphCommit[]> {
  if (!git) throw new Error('No repository selected')

  try {
    // Use raw git log with custom format to get parent hashes
    const format = '%H|%h|%s|%an|%ci|%P|%D'
    const output = await git.raw([
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
          const statOutput = await git.raw(['show', '--stat', '--format=', hash])
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

      commits.push({
        hash,
        shortHash,
        message,
        author,
        date,
        parents,
        refs,
        isMerge: parents.length > 1,
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

// Contributor statistics for ridgeline chart
export interface ContributorTimeSeries {
  author: string
  email: string
  totalCommits: number
  // Array of commit counts per time bucket
  timeSeries: { date: string; count: number }[]
}

export interface ContributorStats {
  contributors: ContributorTimeSeries[]
  startDate: string
  endDate: string
  bucketSize: 'day' | 'week' | 'month'
}

// ========================================
// Mailmap Management - Opinionated Git
// ========================================

export interface AuthorIdentity {
  name: string
  email: string
  commitCount: number
}

export interface MailmapSuggestion {
  canonicalName: string
  canonicalEmail: string
  aliases: AuthorIdentity[]
  confidence: 'high' | 'medium' | 'low'
}

export interface MailmapEntry {
  canonicalName: string
  canonicalEmail: string
  aliasName?: string
  aliasEmail: string
}

// Read current .mailmap file
export async function getMailmap(): Promise<MailmapEntry[]> {
  if (!repoPath) return []
  
  const mailmapPath = path.join(repoPath, '.mailmap')
  try {
    const content = await fs.promises.readFile(mailmapPath, 'utf-8')
    const entries: MailmapEntry[] = []
    
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      
      // Parse .mailmap format:
      // Canonical Name <canonical@email> Alias Name <alias@email>
      // Canonical Name <canonical@email> <alias@email>
      const match = trimmed.match(/^(.+?)\s*<([^>]+)>\s+(?:(.+?)\s+)?<([^>]+)>$/)
      if (match) {
        entries.push({
          canonicalName: match[1].trim(),
          canonicalEmail: match[2].trim(),
          aliasName: match[3]?.trim(),
          aliasEmail: match[4].trim(),
        })
      }
    }
    
    return entries
  } catch {
    return [] // No .mailmap file
  }
}

// Get all unique author identities from the repo
export async function getAuthorIdentities(): Promise<AuthorIdentity[]> {
  if (!git) throw new Error('No repository selected')
  
  try {
    // Get raw identities (without mailmap) to see what needs mapping
    const output = await git.raw([
      'shortlog', '-sne', '--all'
    ])
    
    const identities: AuthorIdentity[] = []
    for (const line of output.trim().split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(.+?)\s+<([^>]+)>$/)
      if (match) {
        identities.push({
          name: match[2].trim(),
          email: match[3].trim(),
          commitCount: parseInt(match[1], 10),
        })
      }
    }
    
    return identities.sort((a, b) => b.commitCount - a.commitCount)
  } catch {
    return []
  }
}

// Suggest mailmap entries by detecting potential duplicates
export async function suggestMailmapEntries(): Promise<MailmapSuggestion[]> {
  const identities = await getAuthorIdentities()
  const suggestions: MailmapSuggestion[] = []
  const used = new Set<string>()
  
  // Helper to normalize for comparison
  const normalize = (s: string) => s.toLowerCase().replace(/[._-]/g, '').replace(/\s+/g, '')
  
  for (let i = 0; i < identities.length; i++) {
    const primary = identities[i]
    if (used.has(primary.email)) continue
    
    const aliases: AuthorIdentity[] = []
    let confidence: 'high' | 'medium' | 'low' = 'low'
    
    for (let j = i + 1; j < identities.length; j++) {
      const candidate = identities[j]
      if (used.has(candidate.email)) continue
      
      const nameMatch = normalize(primary.name) === normalize(candidate.name)
      const emailPrefixMatch = normalize(primary.email.split('@')[0]) === normalize(candidate.email.split('@')[0])
      const partialNameMatch = normalize(primary.name).includes(normalize(candidate.name)) ||
                               normalize(candidate.name).includes(normalize(primary.name))
      
      // Exact name match = high confidence
      if (nameMatch) {
        aliases.push(candidate)
        used.add(candidate.email)
        confidence = 'high'
      }
      // Email prefix matches = high confidence  
      else if (emailPrefixMatch && primary.email.split('@')[0].length >= 3) {
        aliases.push(candidate)
        used.add(candidate.email)
        confidence = confidence === 'low' ? 'medium' : confidence
      }
      // Partial name overlap = medium confidence
      else if (partialNameMatch && normalize(candidate.name).length >= 3) {
        aliases.push(candidate)
        used.add(candidate.email)
        confidence = confidence === 'low' ? 'medium' : confidence
      }
    }
    
    if (aliases.length > 0) {
      suggestions.push({
        canonicalName: primary.name,
        canonicalEmail: primary.email,
        aliases,
        confidence,
      })
    }
    
    used.add(primary.email)
  }
  
  return suggestions.sort((a, b) => {
    // Sort by confidence, then by total commits
    const confOrder = { high: 0, medium: 1, low: 2 }
    if (confOrder[a.confidence] !== confOrder[b.confidence]) {
      return confOrder[a.confidence] - confOrder[b.confidence]
    }
    const aTotal = a.aliases.reduce((sum, x) => sum + x.commitCount, 0)
    const bTotal = b.aliases.reduce((sum, x) => sum + x.commitCount, 0)
    return bTotal - aTotal
  })
}

// Add entries to .mailmap file
export async function addMailmapEntries(entries: MailmapEntry[]): Promise<{ success: boolean; message: string }> {
  if (!repoPath) return { success: false, message: 'No repository selected' }
  
  const mailmapPath = path.join(repoPath, '.mailmap')
  
  try {
    // Read existing content
    let content = ''
    try {
      content = await fs.promises.readFile(mailmapPath, 'utf-8')
      if (!content.endsWith('\n')) content += '\n'
    } catch {
      // File doesn't exist, start fresh with header
      content = '# .mailmap - Author identity mapping\n# Format: Canonical Name <canonical@email> Alias Name <alias@email>\n\n'
    }
    
    // Add new entries
    for (const entry of entries) {
      const line = entry.aliasName
        ? `${entry.canonicalName} <${entry.canonicalEmail}> ${entry.aliasName} <${entry.aliasEmail}>`
        : `${entry.canonicalName} <${entry.canonicalEmail}> <${entry.aliasEmail}>`
      content += line + '\n'
    }
    
    await fs.promises.writeFile(mailmapPath, content, 'utf-8')
    return { success: true, message: `Added ${entries.length} entries to .mailmap` }
  } catch (error) {
    return { success: false, message: `Failed to update .mailmap: ${error}` }
  }
}

// Remove a specific entry from .mailmap
export async function removeMailmapEntry(entry: MailmapEntry): Promise<{ success: boolean; message: string }> {
  if (!repoPath) return { success: false, message: 'No repository selected' }
  
  const mailmapPath = path.join(repoPath, '.mailmap')
  
  try {
    const content = await fs.promises.readFile(mailmapPath, 'utf-8')
    const lines = content.split('\n')
    
    // Build the line pattern to remove
    const targetLine = entry.aliasName
      ? `${entry.canonicalName} <${entry.canonicalEmail}> ${entry.aliasName} <${entry.aliasEmail}>`
      : `${entry.canonicalName} <${entry.canonicalEmail}> <${entry.aliasEmail}>`
    
    // Filter out the matching line (case-sensitive match)
    const newLines = lines.filter(line => line.trim() !== targetLine.trim())
    
    if (newLines.length === lines.length) {
      return { success: false, message: 'Entry not found in .mailmap' }
    }
    
    await fs.promises.writeFile(mailmapPath, newLines.join('\n'), 'utf-8')
    return { success: true, message: 'Removed entry from .mailmap' }
  } catch (error) {
    return { success: false, message: `Failed to update .mailmap: ${error}` }
  }
}

// Normalize and cluster author identities
// Groups commits by the same person using email domain, name similarity, and common patterns
function clusterAuthors(
  commits: { author: string; email: string; date: Date }[]
): Map<string, { canonicalName: string; canonicalEmail: string; dates: Date[] }> {
  // First pass: group by normalized email (ignoring + suffixes and case)
  const emailGroups = new Map<string, { names: Map<string, number>; emails: Set<string>; dates: Date[] }>()
  
  for (const { author, email, date } of commits) {
    // Normalize email: lowercase, remove + suffix (user+tag@domain -> user@domain)
    const normalizedEmail = email.toLowerCase().replace(/\+[^@]*@/, '@')
    
    // Extract email prefix for matching (before @)
    const emailPrefix = normalizedEmail.split('@')[0].replace(/[._-]/g, '').toLowerCase()
    
    // Try to find existing group by email or email prefix
    let groupKey: string | null = null
    
    // Check exact email match first
    if (emailGroups.has(normalizedEmail)) {
      groupKey = normalizedEmail
    } else {
      // Check if email prefix matches an existing group's prefix
      for (const [key, _group] of emailGroups) {
        const existingPrefix = key.split('@')[0].replace(/[._-]/g, '').toLowerCase()
        if (emailPrefix === existingPrefix && emailPrefix.length >= 3) {
          groupKey = key
          break
        }
      }
    }
    
    if (!groupKey) {
      groupKey = normalizedEmail
      emailGroups.set(groupKey, { names: new Map(), emails: new Set(), dates: [] })
    }
    
    const group = emailGroups.get(groupKey)!
    group.emails.add(email)
    group.dates.push(date)
    group.names.set(author, (group.names.get(author) || 0) + 1)
  }
  
  // Second pass: merge groups with similar names (handles different emails, same person)
  const mergedGroups = new Map<string, typeof emailGroups extends Map<string, infer V> ? V : never>()
  
  const normalizeNameForComparison = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[._-]/g, ' ')  // jp-guiang -> jp guiang
      .replace(/\s+/g, ' ')    // normalize spaces
      .trim()
  }
  
  for (const [key, group] of emailGroups) {
    // Get most common name from this group
    let mostCommonName = ''
    let maxCount = 0
    for (const [name, count] of group.names) {
      if (count > maxCount) {
        maxCount = count
        mostCommonName = name
      }
    }
    
    const normalizedName = normalizeNameForComparison(mostCommonName)
    
    // Check if this name matches an existing merged group
    let merged = false
    for (const [_mergedKey, mergedGroup] of mergedGroups) {
      let mergedMostCommonName = ''
      let mergedMaxCount = 0
      for (const [name, count] of mergedGroup.names) {
        if (count > mergedMaxCount) {
          mergedMaxCount = count
          mergedMostCommonName = name
        }
      }
      
      const mergedNormalizedName = normalizeNameForComparison(mergedMostCommonName)
      
      // Check name similarity
      if (normalizedName === mergedNormalizedName || 
          normalizedName.includes(mergedNormalizedName) ||
          mergedNormalizedName.includes(normalizedName)) {
        // Merge into existing group
        for (const [name, count] of group.names) {
          mergedGroup.names.set(name, (mergedGroup.names.get(name) || 0) + count)
        }
        for (const email of group.emails) {
          mergedGroup.emails.add(email)
        }
        mergedGroup.dates.push(...group.dates)
        merged = true
        break
      }
    }
    
    if (!merged) {
      mergedGroups.set(key, group)
    }
  }
  
  // Final pass: create canonical result
  const result = new Map<string, { canonicalName: string; canonicalEmail: string; dates: Date[] }>()
  
  for (const [key, group] of mergedGroups) {
    // Pick canonical name: prefer title case, most common
    let canonicalName = ''
    let maxCount = 0
    for (const [name, count] of group.names) {
      // Prefer proper cased names over all-lowercase
      const isProperCase = name !== name.toLowerCase()
      const effectiveCount = isProperCase ? count * 1.5 : count
      if (effectiveCount > maxCount) {
        maxCount = effectiveCount
        canonicalName = name
      }
    }
    
    // Pick canonical email: prefer non-noreply, most common domain
    const emails = Array.from(group.emails)
    const canonicalEmail = emails.find(e => !e.includes('noreply')) || emails[0]
    
    result.set(key, {
      canonicalName,
      canonicalEmail,
      dates: group.dates,
    })
  }
  
  return result
}

// Get commit statistics by contributor over time for ridgeline chart
export async function getContributorStats(
  topN: number = 10,
  bucketSize: 'day' | 'week' | 'month' = 'week'
): Promise<ContributorStats> {
  if (!git) throw new Error('No repository selected')

  try {
    // Get all commits with author and date info
    // Use --use-mailmap to respect .mailmap file for identity normalization
    const format = '%aN|%aE|%ci'  // %aN/%aE = mailmap-aware name/email
    const output = await git.raw([
      'log',
      '--use-mailmap',
      `--format=${format}`,
      '--all',
    ])

    const lines = output.trim().split('\n').filter(Boolean)
    
    // Parse commits
    const rawCommits: { author: string; email: string; date: Date }[] = []
    let minDate = new Date()
    let maxDate = new Date(0)

    for (const line of lines) {
      const [author, email, dateStr] = line.split('|')
      const date = new Date(dateStr)
      
      if (date < minDate) minDate = date
      if (date > maxDate) maxDate = date
      
      rawCommits.push({ author, email, date })
    }
    
    // Cluster authors to deduplicate identities
    const authorCommits = clusterAuthors(rawCommits)

    // Sort authors by total commits and take top N
    const sortedAuthors = Array.from(authorCommits.entries())
      .map(([_key, data]) => ({
        author: data.canonicalName,
        email: data.canonicalEmail,
        totalCommits: data.dates.length,
        dates: data.dates,
      }))
      .sort((a, b) => b.totalCommits - a.totalCommits)
      .slice(0, topN)

    // Create time buckets
    const buckets: Date[] = []
    const current = new Date(minDate)
    
    // Align to bucket boundaries
    if (bucketSize === 'week') {
      current.setDate(current.getDate() - current.getDay()) // Start of week
    } else if (bucketSize === 'month') {
      current.setDate(1) // Start of month
    }
    current.setHours(0, 0, 0, 0)

    while (current <= maxDate) {
      buckets.push(new Date(current))
      if (bucketSize === 'day') {
        current.setDate(current.getDate() + 1)
      } else if (bucketSize === 'week') {
        current.setDate(current.getDate() + 7)
      } else {
        current.setMonth(current.getMonth() + 1)
      }
    }

    // Helper to find bucket for a date
    const getBucketIndex = (date: Date): number => {
      for (let i = buckets.length - 1; i >= 0; i--) {
        if (date >= buckets[i]) return i
      }
      return 0
    }

    // Build time series for each contributor
    const contributors: ContributorTimeSeries[] = sortedAuthors.map(({ author, email, totalCommits, dates }) => {
      // Count commits per bucket
      const bucketCounts = new Array(buckets.length).fill(0)
      for (const date of dates) {
        const idx = getBucketIndex(date)
        bucketCounts[idx]++
      }

      return {
        author, // Already canonical from clustering
        email,
        totalCommits,
        timeSeries: buckets.map((bucket, i) => ({
          date: bucket.toISOString().split('T')[0],
          count: bucketCounts[i],
        })),
      }
    })

    return {
      contributors,
      startDate: minDate.toISOString().split('T')[0],
      endDate: maxDate.toISOString().split('T')[0],
      bucketSize,
    }
  } catch (error) {
    console.error('Error getting contributor stats:', error)
    return {
      contributors: [],
      startDate: '',
      endDate: '',
      bucketSize,
    }
  }
}

// ========================================
// Tech Tree - Merged Branch Visualization
// ========================================

export type TechTreeSizeTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type TechTreeBranchType = 'feature' | 'fix' | 'chore' | 'refactor' | 'docs' | 'test' | 'release' | 'unknown'

export interface TechTreeNodeStats {
  linesAdded: number
  linesRemoved: number
  filesChanged: number
  filesAdded: number
  filesRemoved: number
  commitCount: number
  daysSinceMerge: number
}

export interface TechTreeNode {
  id: string
  branchName: string
  commitHash: string
  mergeCommitHash: string
  author: string
  mergeDate: string
  message: string
  prNumber?: number
  stats: TechTreeNodeStats
  sizeTier: TechTreeSizeTier
  branchType: TechTreeBranchType
  badges: {
    massive: boolean
    destructive: boolean
    additive: boolean
    multiFile: boolean
    surgical: boolean
    ancient: boolean
    fresh: boolean
  }
}

export interface TechTreeData {
  masterBranch: string
  nodes: TechTreeNode[]
  stats: {
    minLoc: number
    maxLoc: number
    minFiles: number
    maxFiles: number
    minAge: number
    maxAge: number
  }
}

// Determine branch type from branch name prefix
function getBranchType(branchName: string): TechTreeBranchType {
  const lower = branchName.toLowerCase()
  if (lower.startsWith('feature/') || lower.startsWith('feat/')) return 'feature'
  if (lower.startsWith('fix/') || lower.startsWith('bugfix/') || lower.startsWith('hotfix/')) return 'fix'
  if (lower.startsWith('chore/') || lower.startsWith('deps/') || lower.startsWith('build/')) return 'chore'
  if (lower.startsWith('refactor/')) return 'refactor'
  if (lower.startsWith('docs/') || lower.startsWith('doc/')) return 'docs'
  if (lower.startsWith('test/') || lower.startsWith('tests/')) return 'test'
  if (lower.startsWith('release/') || lower.startsWith('v')) return 'release'
  return 'unknown'
}

// Extract branch name and PR number from merge commit message
function parseMergeCommitMessage(message: string): { branchName: string; prNumber?: number } {
  // GitHub PR merge: "Merge pull request #123 from owner/branch-name"
  const prMatch = message.match(/Merge pull request #(\d+) from [^/]+\/(.+)/)
  if (prMatch) {
    return { branchName: prMatch[2], prNumber: parseInt(prMatch[1], 10) }
  }

  // Standard git merge: "Merge branch 'branch-name'"
  const branchMatch = message.match(/Merge branch '([^']+)'/)
  if (branchMatch) {
    return { branchName: branchMatch[1] }
  }

  // Alternative format: "Merge branch-name into master"
  const intoMatch = message.match(/Merge (\S+) into/)
  if (intoMatch) {
    return { branchName: intoMatch[1] }
  }

  // Fallback: use first line of message
  return { branchName: message.split('\n')[0].slice(0, 50) }
}

// Assign size tiers based on percentiles
function assignSizeTiers(nodes: TechTreeNode[]): void {
  if (nodes.length === 0) return

  // Sort by total LOC
  const sorted = [...nodes].sort((a, b) => {
    const aLoc = a.stats.linesAdded + a.stats.linesRemoved
    const bLoc = b.stats.linesAdded + b.stats.linesRemoved
    return aLoc - bLoc
  })

  const n = sorted.length
  sorted.forEach((node, index) => {
    const percentile = index / n
    let tier: TechTreeSizeTier
    if (percentile < 0.10) tier = 'xs'
    else if (percentile < 0.30) tier = 'sm'
    else if (percentile < 0.60) tier = 'md'
    else if (percentile < 0.85) tier = 'lg'
    else tier = 'xl'

    // Find the original node and update its tier
    const originalNode = nodes.find(n => n.id === node.id)
    if (originalNode) {
      originalNode.sizeTier = tier
    }
  })
}

// Assign badges based on percentiles
function assignBadges(nodes: TechTreeNode[]): void {
  if (nodes.length === 0) return

  // Sort nodes by different metrics to find percentiles
  const byLoc = [...nodes].sort((a, b) =>
    (a.stats.linesAdded + a.stats.linesRemoved) - (b.stats.linesAdded + b.stats.linesRemoved)
  )
  const byAdded = [...nodes].sort((a, b) => a.stats.linesAdded - b.stats.linesAdded)
  const byRemoved = [...nodes].sort((a, b) => a.stats.linesRemoved - b.stats.linesRemoved)
  const byFiles = [...nodes].sort((a, b) => a.stats.filesChanged - b.stats.filesChanged)
  const byAge = [...nodes].sort((a, b) => a.stats.daysSinceMerge - b.stats.daysSinceMerge)

  const n = nodes.length

  // Helper to check if node is in top X%
  const isInTopPercentile = (sorted: TechTreeNode[], node: TechTreeNode, topPercent: number): boolean => {
    const idx = sorted.findIndex(n => n.id === node.id)
    return idx >= n * (1 - topPercent)
  }

  // Helper to check if node is in bottom X%
  const isInBottomPercentile = (sorted: TechTreeNode[], node: TechTreeNode, bottomPercent: number): boolean => {
    const idx = sorted.findIndex(n => n.id === node.id)
    return idx < n * bottomPercent
  }

  for (const node of nodes) {
    node.badges = {
      massive: isInTopPercentile(byLoc, node, 0.10),        // Top 10% by total LOC
      destructive: isInTopPercentile(byRemoved, node, 0.15), // Top 15% by lines removed
      additive: isInTopPercentile(byAdded, node, 0.15),     // Top 15% by lines added
      multiFile: isInTopPercentile(byFiles, node, 0.20),    // Top 20% by files changed
      surgical: isInBottomPercentile(byLoc, node, 0.10),    // Bottom 10% by LOC
      ancient: isInTopPercentile(byAge, node, 0.15),        // Top 15% oldest (highest daysSinceMerge)
      fresh: isInBottomPercentile(byAge, node, 0.15),       // Bottom 15% newest (lowest daysSinceMerge)
    }
  }
}

// Get merged branch tree for tech tree visualization
export async function getMergedBranchTree(limit: number = 50): Promise<TechTreeData> {
  if (!git) throw new Error('No repository selected')

  // Detect master branch name
  let masterBranch = 'main'
  try {
    const branches = await git.branch()
    if (branches.all.includes('master')) masterBranch = 'master'
    else if (branches.all.includes('main')) masterBranch = 'main'
  } catch {
    // Default to main
  }

  try {
    // Get merge commits on the main branch
    // Format: hash|author_date|author_name|subject
    const format = '%H|%ai|%an|%s'
    const output = await git.raw([
      'log',
      masterBranch,
      '--first-parent',
      '--merges',
      `--format=${format}`,
      '-n',
      limit.toString(),
    ])

    const lines = output.trim().split('\n').filter(Boolean)
    const nodes: TechTreeNode[] = []
    const now = Date.now()

    for (const line of lines) {
      const [mergeCommitHash, dateStr, author, message] = line.split('|')
      if (!mergeCommitHash || !message) continue

      const { branchName, prNumber } = parseMergeCommitMessage(message)

      // Get diff stats for this merge commit
      let linesAdded = 0
      let linesRemoved = 0
      let filesChanged = 0
      let filesAdded = 0
      let filesRemoved = 0
      const commitCount = 1

      try {
        // Get stat info for the merge commit
        const statOutput = await git.raw([
          'show',
          '--stat',
          '--format=',
          mergeCommitHash,
        ])
        const statLines = statOutput.trim().split('\n')
        const summaryLine = statLines[statLines.length - 1]

        // Parse: "3 files changed, 10 insertions(+), 5 deletions(-)"
        const filesMatch = summaryLine.match(/(\d+) files? changed/)
        const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/)
        const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/)

        filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0
        linesAdded = addMatch ? parseInt(addMatch[1]) : 0
        linesRemoved = delMatch ? parseInt(delMatch[1]) : 0

        // Count new/deleted files from the stat output
        for (const sl of statLines) {
          if (sl.includes('(new)') || sl.includes('create mode')) filesAdded++
          if (sl.includes('(gone)') || sl.includes('delete mode')) filesRemoved++
        }
      } catch {
        // Ignore stat errors
      }

      // Calculate days since merge
      const mergeDate = new Date(dateStr)
      const daysSinceMerge = Math.floor((now - mergeDate.getTime()) / (1000 * 60 * 60 * 24))

      nodes.push({
        id: mergeCommitHash.slice(0, 8),
        branchName,
        commitHash: mergeCommitHash,
        mergeCommitHash,
        author,
        mergeDate: dateStr,
        message,
        prNumber,
        stats: {
          linesAdded,
          linesRemoved,
          filesChanged,
          filesAdded,
          filesRemoved,
          commitCount,
          daysSinceMerge,
        },
        sizeTier: 'md', // Will be assigned by assignSizeTiers
        branchType: getBranchType(branchName),
        badges: {
          massive: false,
          destructive: false,
          additive: false,
          multiFile: false,
          surgical: false,
          ancient: false,
          fresh: false,
        },
      })
    }

    // Compute percentile-based tiers and badges
    assignSizeTiers(nodes)
    assignBadges(nodes)

    // Calculate global stats
    const allLoc = nodes.map(n => n.stats.linesAdded + n.stats.linesRemoved)
    const allFiles = nodes.map(n => n.stats.filesChanged)
    const allAge = nodes.map(n => n.stats.daysSinceMerge)

    return {
      masterBranch,
      nodes,
      stats: {
        minLoc: Math.min(...allLoc, 0),
        maxLoc: Math.max(...allLoc, 1),
        minFiles: Math.min(...allFiles, 0),
        maxFiles: Math.max(...allFiles, 1),
        minAge: Math.min(...allAge, 0),
        maxAge: Math.max(...allAge, 1),
      },
    }
  } catch {
    return {
      masterBranch,
      nodes: [],
      stats: { minLoc: 0, maxLoc: 1, minFiles: 0, maxFiles: 1, minAge: 0, maxAge: 1 },
    }
  }
}

// Diff file info
export interface DiffFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  oldPath?: string // For renames
}

// Diff hunk (a section of changes)
export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

// A single line in a diff
export interface DiffLine {
  type: 'context' | 'add' | 'delete' | 'header'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

// Full diff for a file
export interface FileDiff {
  file: DiffFile
  hunks: DiffHunk[]
  isBinary: boolean
}

// Commit diff result
export interface CommitDiff {
  hash: string
  message: string
  author: string
  date: string
  files: FileDiff[]
  totalAdditions: number
  totalDeletions: number
}

// Get diff for a specific commit
export async function getCommitDiff(commitHash: string): Promise<CommitDiff | null> {
  if (!git) throw new Error('No repository selected')

  try {
    // Get commit info
    const logOutput = await git.raw(['show', '--format=%H|%s|%an|%ci', '-s', commitHash])
    const [hash, message, author, date] = logOutput.trim().split('|')

    // Get diff with file stats
    const diffOutput = await git.raw(['show', '--format=', '--patch', '--stat', commitHash])

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
      let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified'
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
              hunkLines.push({ type: 'add', content: line.slice(1), newLineNumber: newLine })
              newLine++
              fileAdditions++
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              hunkLines.push({ type: 'delete', content: line.slice(1), oldLineNumber: oldLine })
              oldLine++
              fileDeletions++
            } else if (line.startsWith(' ')) {
              hunkLines.push({
                type: 'context',
                content: line.slice(1),
                oldLineNumber: oldLine,
                newLineNumber: newLine,
              })
              oldLine++
              newLine++
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
  } catch {
    return null
  }
}

// Branch diff interface - shows diff between a branch and master/main
export interface BranchDiff {
  branchName: string
  baseBranch: string
  files: FileDiff[]
  totalAdditions: number
  totalDeletions: number
  commitCount: number
  // For PR Preview mode - conflict information
  hasConflicts?: boolean
  conflictFiles?: string[]
}

// Get diff for a branch compared to master/main
// diffType: 'diff' = two-dot (current state vs master), 'changes' = three-dot (all branch changes since fork)
// 'preview' = simulated merge result (what a PR would contribute)
export type BranchDiffType = 'diff' | 'changes' | 'preview'

export async function getBranchDiff(branchName: string, diffType: BranchDiffType = 'changes'): Promise<BranchDiff | null> {
  if (!git) throw new Error('No repository selected')

  try {
    // Find the base branch (master or main)
    let baseBranch = 'origin/master'
    try {
      await git.raw(['rev-parse', '--verify', 'origin/master'])
    } catch {
      try {
        await git.raw(['rev-parse', '--verify', 'origin/main'])
        baseBranch = 'origin/main'
      } catch {
        // Try local master/main
        const branches = await git.branchLocal()
        if (branches.all.includes('main')) {
          baseBranch = 'main'
        } else if (branches.all.includes('master')) {
          baseBranch = 'master'
        } else {
          return null // No base branch found
        }
      }
    }

    // Count commits between base and branch
    let commitCount = 0
    try {
      const countOutput = await git.raw(['rev-list', '--count', `${baseBranch}..${branchName}`])
      commitCount = parseInt(countOutput.trim()) || 0
    } catch {
      // Ignore count errors
    }

    // For 'preview' mode, use git merge-tree to simulate the merge result
    if (diffType === 'preview') {
      return await getBranchMergePreview(branchName, baseBranch, commitCount)
    }

    // Get diff between base and branch
    // Two-dot (..) = actual current diff between master HEAD and branch HEAD
    // Three-dot (...) = changes on branch since it diverged from master (branch changes)
    const diffSyntax = diffType === 'diff' 
      ? `${baseBranch}..${branchName}`   // Two-dot: what's different right now
      : `${baseBranch}...${branchName}`  // Three-dot: what was developed on branch
    const diffOutput = await git.raw(['diff', diffSyntax, '--patch', '--stat'])

    if (!diffOutput.trim()) {
      return {
        branchName,
        baseBranch: baseBranch.replace('origin/', ''),
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        commitCount,
      }
    }

    // Parse the diff output (same logic as getCommitDiff)
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
      let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified'
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
              hunkLines.push({ type: 'add', content: line.slice(1), newLineNumber: newLine })
              newLine++
              fileAdditions++
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              hunkLines.push({ type: 'delete', content: line.slice(1), oldLineNumber: oldLine })
              oldLine++
              fileDeletions++
            } else if (line.startsWith(' ')) {
              hunkLines.push({
                type: 'context',
                content: line.slice(1),
                oldLineNumber: oldLine,
                newLineNumber: newLine,
              })
              oldLine++
              newLine++
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
      branchName,
      baseBranch: baseBranch.replace('origin/', ''),
      files,
      totalAdditions,
      totalDeletions,
      commitCount,
    }
  } catch (error) {
    console.error('Error getting branch diff:', error)
    return null
  }
}

// Helper function to get merge preview using git merge-tree
// This simulates what a PR would look like - the unique contribution of the branch
async function getBranchMergePreview(branchName: string, baseBranch: string, commitCount: number): Promise<BranchDiff | null> {
  if (!git) throw new Error('No repository selected')

  try {
    // Use git merge-tree to simulate the merge (Git 2.38+)
    // This computes what the merge result would be without actually merging
    let mergeTreeOutput: string
    let hasConflicts = false
    const conflictFiles: string[] = []

    try {
      // Try the modern merge-tree command (Git 2.38+)
      mergeTreeOutput = await git.raw(['merge-tree', '--write-tree', baseBranch, branchName])
      
      // Check for conflicts in the output
      // Format: <tree-sha>\n followed by optional conflict info
      const lines = mergeTreeOutput.trim().split('\n')
      
      // If there are CONFLICT lines, extract them
      for (const line of lines) {
        if (line.startsWith('CONFLICT')) {
          hasConflicts = true
          // Extract filename from various conflict formats
          // e.g., "CONFLICT (content): Merge conflict in file.txt"
          const fileMatch = line.match(/(?:in|for) (.+?)(?:\s*$|\s+\()/)
          if (fileMatch) {
            conflictFiles.push(fileMatch[1])
          }
        }
      }
    } catch {
      // Fallback: If merge-tree fails (older Git or other issues),
      // just return the three-dot diff as a fallback
      console.warn('merge-tree failed, falling back to three-dot diff')
      const diffOutput = await git.raw(['diff', `${baseBranch}...${branchName}`, '--patch', '--stat'])
      return parseDiffOutput(diffOutput, branchName, baseBranch, commitCount)
    }

    // Get the tree SHA from the first line
    const treeLines = mergeTreeOutput.trim().split('\n')
    const treeSha = treeLines[0].trim()

    // Now diff the base branch against the merge result tree
    // This shows exactly what changes the branch would contribute
    let diffOutput: string
    try {
      diffOutput = await git.raw(['diff', baseBranch, treeSha, '--patch', '--stat'])
    } catch {
      // If we can't diff against the tree (shouldn't happen), fall back
      diffOutput = await git.raw(['diff', `${baseBranch}...${branchName}`, '--patch', '--stat'])
    }

    const result = parseDiffOutput(diffOutput, branchName, baseBranch, commitCount)
    if (result) {
      result.hasConflicts = hasConflicts
      result.conflictFiles = conflictFiles
    }
    return result
  } catch (error) {
    console.error('Error getting merge preview:', error)
    return null
  }
}

// Helper to parse diff output into BranchDiff structure
function parseDiffOutput(diffOutput: string, branchName: string, baseBranch: string, commitCount: number): BranchDiff | null {
  if (!diffOutput.trim()) {
    return {
      branchName,
      baseBranch: baseBranch.replace('origin/', ''),
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      commitCount,
    }
  }

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
    let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified'
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
            hunkLines.push({ type: 'add', content: line.slice(1), newLineNumber: newLine })
            newLine++
            fileAdditions++
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            hunkLines.push({ type: 'delete', content: line.slice(1), oldLineNumber: oldLine })
            oldLine++
            fileDeletions++
          } else if (line.startsWith(' ')) {
            hunkLines.push({
              type: 'context',
              content: line.slice(1),
              oldLineNumber: oldLine,
              newLineNumber: newLine,
            })
            oldLine++
            newLine++
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
    branchName,
    baseBranch: baseBranch.replace('origin/', ''),
    files,
    totalAdditions,
    totalDeletions,
    commitCount,
  }
}

// Stash entry
export interface StashEntry {
  index: number
  message: string
  branch: string
  date: string
  /** True if stash changes already exist on the original branch */
  redundant?: boolean
}

/**
 * Check if a stash is redundant (its changes already exist on the original branch)
 * 
 * Compares each file in the stash against the current state of that file on
 * the branch the stash was created from. If all files match, the stash is redundant.
 */
async function isStashRedundant(stashIndex: number, branch: string): Promise<boolean> {
  if (!git || !branch) return false

  try {
    // Get list of files changed in the stash
    const filesOutput = await git.raw(['stash', 'show', '--name-only', `stash@{${stashIndex}}`])
    if (!filesOutput.trim()) return true // Empty stash = superseded

    const files = filesOutput.trim().split('\n')

    // Compare each file's content between stash and current branch
    for (const file of files) {
      try {
        // Get file content from stash
        const stashContent = await git.raw(['show', `stash@{${stashIndex}}:${file}`])
        
        // Get file content from branch (try local first, then remote)
        let branchContent: string
        try {
          branchContent = await git.raw(['show', `${branch}:${file}`])
        } catch {
          // Branch might not exist locally, try origin
          try {
            branchContent = await git.raw(['show', `origin/${branch}:${file}`])
          } catch {
            // File doesn't exist on branch = stash has changes
            return false
          }
        }

        if (stashContent !== branchContent) {
          return false // File differs, stash has changes
        }
      } catch {
        // File in stash doesn't exist or can't be read = stash has changes
        return false
      }
    }

    return true // All files match, stash is superseded
  } catch {
    return false // On error, assume stash has changes
  }
}

// Get list of stashes
export async function getStashes(): Promise<StashEntry[]> {
  if (!git) throw new Error('No repository selected')

  try {
    const output = await git.raw(['stash', 'list', '--format=%gd|%gs|%ci'])

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

    // Check redundant status for each stash (in parallel for speed)
    await Promise.all(
      stashes.map(async (stash) => {
        stash.redundant = await isStashRedundant(stash.index, stash.branch)
      })
    )

    return stashes
  } catch {
    return []
  }
}

// Get files changed in a stash
export interface StashFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
}

export async function getStashFiles(stashIndex: number): Promise<StashFile[]> {
  if (!git) throw new Error('No repository selected')

  try {
    // Run numstat and name-status separately (combining them only returns name-status)
    const [numstatOutput, nameStatusOutput] = await Promise.all([
      git.raw(['stash', 'show', `stash@{${stashIndex}}`, '--numstat']),
      git.raw(['stash', 'show', `stash@{${stashIndex}}`, '--name-status']),
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

// Get diff for a specific file in a stash (raw text)
// Note: git stash show doesn't support -- filepath syntax, so we use git diff instead
export async function getStashFileDiff(stashIndex: number, filePath: string): Promise<string | null> {
  if (!git) throw new Error('No repository selected')

  try {
    // Compare the stash's parent commit with the stash itself for the specific file
    const stashRef = `stash@{${stashIndex}}`
    const output = await git.raw(['diff', `${stashRef}^`, stashRef, '--', filePath])
    return output || null
  } catch {
    return null
  }
}

// Get parsed diff for a specific file in a stash (with hunks)
export async function getStashFileDiffParsed(stashIndex: number, filePath: string): Promise<StagingFileDiff | null> {
  if (!git) throw new Error('No repository selected')

  try {
    const stashRef = `stash@{${stashIndex}}`
    const diffOutput = await git.raw(['diff', `${stashRef}^`, stashRef, '--', filePath])
    
    if (!diffOutput.trim()) {
      return null
    }
    
    return parseDiff(diffOutput, filePath)
  } catch {
    return null
  }
}

// Get full diff for a stash
export async function getStashDiff(stashIndex: number): Promise<string | null> {
  if (!git) throw new Error('No repository selected')

  try {
    const output = await git.raw(['stash', 'show', '-p', `stash@{${stashIndex}}`])
    return output || null
  } catch {
    return null
  }
}

// Apply a stash (keeps stash in list)
export async function applyStash(stashIndex: number): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    await git.raw(['stash', 'apply', `stash@{${stashIndex}}`])
    return { success: true, message: `Applied stash@{${stashIndex}}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Pop a stash (applies and removes from list)
export async function popStash(stashIndex: number): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    await git.raw(['stash', 'pop', `stash@{${stashIndex}}`])
    return { success: true, message: `Applied and removed stash@{${stashIndex}}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Drop a stash (removes without applying)
export async function dropStash(stashIndex: number): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    await git.raw(['stash', 'drop', `stash@{${stashIndex}}`])
    return { success: true, message: `Dropped stash@{${stashIndex}}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Create a branch from a stash
export async function stashToBranch(
  stashIndex: number,
  branchName: string
): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    // git stash branch <branchname> [<stash>]
    // Creates a new branch starting from the commit at which the stash was created,
    // applies the stash, and drops it if successful
    await git.raw(['stash', 'branch', branchName, `stash@{${stashIndex}}`])
    return { success: true, message: `Created branch '${branchName}' from stash@{${stashIndex}}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Apply a stash to a different branch using worktrees (Ledger's "leapfrog" feature)
 * 
 * This is a Ledger-specific feature that enables parallel git operations:
 * - If the target branch has an existing worktree, applies the stash there
 * - If not, creates a new worktree in .worktrees/, applies the stash, auto-commits, and cleans up
 *   (User may be offered option to keep the worktree in the future)
 * 
 * This allows applying stashes to branches without switching your current context.
 */
export async function applyStashToBranch(
  stashIndex: number,
  targetBranch: string,
  stashMessage: string,
  keepWorktree: boolean = false
): Promise<{ success: boolean; message: string; usedExistingWorktree: boolean; worktreePath?: string }> {
  if (!git) throw new Error('No repository selected')
  if (!repoPath) throw new Error('No repository path set')

  try {
    // Get the stash ref
    const stashRef = `stash@{${stashIndex}}`
    
    // Check if target branch has an existing worktree
    const worktrees = await getWorktrees()
    const existingWorktree = worktrees.find(wt => wt.branch === targetBranch)
    
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
    const worktreePath = path.join(repoPath, '.worktrees', sanitizedBranch)
    
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

// ========================================
// Staging & Commit Functions
// ========================================

// Stage a single file
export async function stageFile(filePath: string): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    await git.add(filePath)
    return { success: true, message: `Staged ${filePath}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Unstage a single file
export async function unstageFile(filePath: string): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    await git.raw(['restore', '--staged', filePath])
    return { success: true, message: `Unstaged ${filePath}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Stage all changes
export async function stageAll(): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    await git.add('-A')
    return { success: true, message: 'Staged all changes' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Unstage all changes
export async function unstageAll(): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    await git.raw(['restore', '--staged', '.'])
    return { success: true, message: 'Unstaged all changes' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Discard changes in a file (revert to last commit, or delete if untracked)
export async function discardFileChanges(filePath: string): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    // Check if the file is untracked
    const status = await git.status()
    const isUntracked = status.not_added.includes(filePath)

    if (isUntracked) {
      // For untracked files, delete the file
      const fullPath = path.join(repoPath!, filePath)
      await fs.promises.unlink(fullPath)
      return { success: true, message: `Deleted untracked file ${filePath}` }
    }

    // For tracked files, restore to last commit
    await git.raw(['restore', filePath])
    return { success: true, message: `Discarded changes in ${filePath}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Discard all changes (both staged and unstaged)
export async function discardAllChanges(): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    const status = await git.status()
    
    // First unstage everything
    if (status.staged.length > 0) {
      await git.raw(['restore', '--staged', '.'])
    }
    
    // Restore tracked files to last commit
    const trackedModified = [...status.modified, ...status.deleted]
    if (trackedModified.length > 0) {
      await git.raw(['restore', '.'])
    }
    
    // Remove untracked files
    if (status.not_added.length > 0) {
      await git.raw(['clean', '-fd'])
    }
    
    const totalChanges = status.files.length
    return { success: true, message: `Discarded all ${totalChanges} changes` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Apply a patch using git apply with stdin via child_process
 */
async function applyPatch(
  targetPath: string,
  patch: string,
  args: string[]
): Promise<void> {
  const { spawn } = await import('child_process')

  return new Promise((resolve, reject) => {
    const gitProcess = spawn('git', ['apply', ...args], {
      cwd: targetPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderr = ''

    gitProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    gitProcess.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(stderr || `git apply failed with code ${code}`))
      }
    })

    gitProcess.on('error', (err) => {
      reject(err)
    })

    // Write the patch to stdin
    gitProcess.stdin.write(patch)
    gitProcess.stdin.end()
  })
}

// Stage a single hunk
export async function stageHunk(
  filePath: string,
  hunkIndex: number
): Promise<{ success: boolean; message: string }> {
  if (!git || !repoPath) throw new Error('No repository selected')

  try {
    // Get the current diff to extract the hunk
    const diff = await getFileDiff(filePath, false)
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

// Unstage a single hunk
export async function unstageHunk(
  filePath: string,
  hunkIndex: number
): Promise<{ success: boolean; message: string }> {
  if (!git || !repoPath) throw new Error('No repository selected')

  try {
    // Get the staged diff to extract the hunk
    const diff = await getFileDiff(filePath, true)
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

// Discard a single hunk
export async function discardHunk(
  filePath: string,
  hunkIndex: number
): Promise<{ success: boolean; message: string }> {
  if (!git || !repoPath) throw new Error('No repository selected')

  try {
    // Get the current diff to extract the hunk
    const diff = await getFileDiff(filePath, false)
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
 * Build a partial patch from a hunk with only selected lines.
 *
 * For staging (applying to index from unstaged diff):
 * - Selected add lines: include as '+' (add to index)
 * - Non-selected add lines: OMIT entirely (they don't exist in index, can't be context)
 * - Selected delete lines: include as '-' (remove from index)
 * - Non-selected delete lines: include as context ' ' (keep in index)
 * - Context lines: include as context ' '
 */
function buildPartialPatch(
  filePath: string,
  hunk: StagingDiffHunk,
  selectedLineIndices: number[]
): string {
  const selectedSet = new Set(selectedLineIndices)

  const patchLines: string[] = []
  let oldCount = 0
  let newCount = 0

  for (const line of hunk.lines) {
    const isSelected = selectedSet.has(line.lineIndex)

    if (line.type === 'context') {
      // Context lines are always included
      patchLines.push(' ' + line.content)
      oldCount++
      newCount++
    } else if (line.type === 'add') {
      if (isSelected) {
        // Selected add line - include as addition
        patchLines.push('+' + line.content)
        newCount++
      }
      // Non-selected add lines are OMITTED entirely.
      // They exist in the working tree but NOT in the index,
      // so they can't be used as context for git apply --cached.
    } else if (line.type === 'delete') {
      if (isSelected) {
        // Selected delete line - include as deletion
        patchLines.push('-' + line.content)
        oldCount++
      } else {
        // Non-selected delete line - keep as context (line stays in index)
        patchLines.push(' ' + line.content)
        oldCount++
        newCount++
      }
    }
  }

  const newHeader = `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`

  return (
    `diff --git a/${filePath} b/${filePath}\n` +
    `--- a/${filePath}\n` +
    `+++ b/${filePath}\n` +
    newHeader +
    '\n' +
    patchLines.join('\n') +
    '\n'
  )
}

/**
 * Build a partial patch for reversed application (unstage/discard).
 *
 * For unstaging (applying -R to index) or discarding (applying -R to working tree):
 * - Selected add lines: include as '+' (will be removed by -R)
 * - Non-selected add lines: include as context ' ' (they exist in the target and must match)
 * - Selected delete lines: include as '-' (will be restored by -R)
 * - Non-selected delete lines: include as context ' ' (keep in target)
 * - Context lines: include as context ' '
 *
 * The key difference: when applying with -R, ALL lines (selected and non-selected)
 * must exist in the target for proper context matching.
 */
function buildReversedPartialPatch(
  filePath: string,
  hunk: StagingDiffHunk,
  selectedLineIndices: number[]
): string {
  const selectedSet = new Set(selectedLineIndices)

  const patchLines: string[] = []
  let oldCount = 0
  let newCount = 0

  for (const line of hunk.lines) {
    const isSelected = selectedSet.has(line.lineIndex)

    if (line.type === 'context') {
      // Context lines are always included
      patchLines.push(' ' + line.content)
      oldCount++
      newCount++
    } else if (line.type === 'add') {
      if (isSelected) {
        // Selected add line - include as addition (will be removed by -R)
        patchLines.push('+' + line.content)
        newCount++
      } else {
        // Non-selected add line - include as context (exists in target, must match)
        patchLines.push(' ' + line.content)
        oldCount++
        newCount++
      }
    } else if (line.type === 'delete') {
      if (isSelected) {
        // Selected delete line - include as deletion (will be restored by -R)
        patchLines.push('-' + line.content)
        oldCount++
      } else {
        // Non-selected delete line - keep as context
        patchLines.push(' ' + line.content)
        oldCount++
        newCount++
      }
    }
  }

  const newHeader = `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`

  return (
    `diff --git a/${filePath} b/${filePath}\n` +
    `--- a/${filePath}\n` +
    `+++ b/${filePath}\n` +
    newHeader +
    '\n' +
    patchLines.join('\n') +
    '\n'
  )
}

// Stage specific lines within a hunk
export async function stageLines(
  filePath: string,
  hunkIndex: number,
  lineIndices: number[]
): Promise<{ success: boolean; message: string }> {
  if (!git || !repoPath) throw new Error('No repository selected')

  try {
    if (lineIndices.length === 0) {
      return { success: false, message: 'No lines selected' }
    }

    const diff = await getFileDiff(filePath, false)
    if (!diff) {
      return { success: false, message: 'Could not get file diff' }
    }

    if (hunkIndex < 0 || hunkIndex >= diff.hunks.length) {
      return { success: false, message: `Invalid hunk index: ${hunkIndex}` }
    }

    const hunk = diff.hunks[hunkIndex]
    const partialPatch = buildPartialPatch(filePath, hunk, lineIndices)

    await applyPatch(repoPath, partialPatch, ['--cached'])
    return { success: true, message: `Staged ${lineIndices.length} line(s)` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Unstage specific lines within a hunk
export async function unstageLines(
  filePath: string,
  hunkIndex: number,
  lineIndices: number[]
): Promise<{ success: boolean; message: string }> {
  if (!git || !repoPath) throw new Error('No repository selected')

  try {
    if (lineIndices.length === 0) {
      return { success: false, message: 'No lines selected' }
    }

    const diff = await getFileDiff(filePath, true)
    if (!diff) {
      return { success: false, message: 'Could not get staged file diff' }
    }

    if (hunkIndex < 0 || hunkIndex >= diff.hunks.length) {
      return { success: false, message: `Invalid hunk index: ${hunkIndex}` }
    }

    const hunk = diff.hunks[hunkIndex]
    const partialPatch = buildReversedPartialPatch(filePath, hunk, lineIndices)

    await applyPatch(repoPath, partialPatch, ['--cached', '-R'])
    return { success: true, message: `Unstaged ${lineIndices.length} line(s)` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Discard specific lines within a hunk
export async function discardLines(
  filePath: string,
  hunkIndex: number,
  lineIndices: number[]
): Promise<{ success: boolean; message: string }> {
  if (!git || !repoPath) throw new Error('No repository selected')

  try {
    if (lineIndices.length === 0) {
      return { success: false, message: 'No lines selected' }
    }

    const diff = await getFileDiff(filePath, false)
    if (!diff) {
      return { success: false, message: 'Could not get file diff' }
    }

    if (hunkIndex < 0 || hunkIndex >= diff.hunks.length) {
      return { success: false, message: `Invalid hunk index: ${hunkIndex}` }
    }

    const hunk = diff.hunks[hunkIndex]
    const partialPatch = buildReversedPartialPatch(filePath, hunk, lineIndices)

    await applyPatch(repoPath, partialPatch, ['-R'])
    return { success: true, message: `Discarded ${lineIndices.length} line(s)` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Get the full content of a file for editing
export async function getFileContent(filePath: string): Promise<string | null> {
  if (!repoPath) return null

  try {
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

// Save content to a file (for inline editing)
export async function saveFileContent(
  filePath: string,
  content: string
): Promise<{ success: boolean; message: string }> {
  if (!repoPath) return { success: false, message: 'No repository selected' }

  try {
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

// Staging file diff types (for working directory changes)
export interface StagingDiffHunk {
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: StagingDiffLine[]
  /** Raw patch text for this hunk (used for git apply) */
  rawPatch: string
}

export interface StagingDiffLine {
  type: 'context' | 'add' | 'delete'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
  /** Index of this line within the hunk (0-based, for selection) */
  lineIndex: number
}

export interface StagingFileDiff {
  filePath: string
  oldPath?: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'
  hunks: StagingDiffHunk[]
  isBinary: boolean
  additions: number
  deletions: number
}

// Get diff for a specific file
export async function getFileDiff(filePath: string, staged: boolean): Promise<StagingFileDiff | null> {
  if (!git) throw new Error('No repository selected')

  try {
    const args = staged ? ['diff', '--staged', '--', filePath] : ['diff', '--', filePath]

    const diffOutput = await git.raw(args)

    // If no diff output, the file might be untracked
    if (!diffOutput.trim()) {
      // Check if it's an untracked file
      const status = await git.status()
      const isUntracked = status.not_added.includes(filePath)

      if (isUntracked) {
        // Read the file content for untracked files
        const fullPath = path.join(repoPath!, filePath)
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8')
          const fileLines = content.split('\n')

          // Build raw patch for untracked file
          const header = `@@ -0,0 +1,${fileLines.length} @@`
          const patchLines = fileLines.map((l) => '+' + l)
          const rawPatch =
            `diff --git a/${filePath} b/${filePath}\n` +
            `new file mode 100644\n` +
            `--- /dev/null\n` +
            `+++ b/${filePath}\n` +
            header +
            '\n' +
            patchLines.join('\n') +
            '\n'

          return {
            filePath,
            status: 'untracked',
            isBinary: false,
            additions: fileLines.length,
            deletions: 0,
            hunks: [
              {
                header,
                oldStart: 0,
                oldLines: 0,
                newStart: 1,
                newLines: fileLines.length,
                rawPatch,
                lines: fileLines.map((line, idx) => ({
                  type: 'add' as const,
                  content: line,
                  newLineNumber: idx + 1,
                  lineIndex: idx,
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

// Parse unified diff format
function parseDiff(diffOutput: string, filePath: string): StagingFileDiff {
  const lines = diffOutput.split('\n')
  const hunks: StagingDiffHunk[] = []
  let currentHunk: StagingDiffHunk | null = null
  let currentHunkRawLines: string[] = []
  let oldLineNum = 0
  let newLineNum = 0
  let additions = 0
  let deletions = 0
  let isBinary = false
  let status: StagingFileDiff['status'] = 'modified'
  let oldPath: string | undefined

  // Extract file header lines for building rawPatch
  let fileHeader = ''
  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++')) {
      fileHeader += line + '\n'
    }
    if (line.startsWith('+++')) break
  }

  let lineIndex = 0

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
      // Finalize previous hunk
      if (currentHunk) {
        currentHunk.rawPatch = fileHeader + currentHunkRawLines.join('\n') + '\n'
        hunks.push(currentHunk)
      }

      oldLineNum = parseInt(hunkMatch[1])
      newLineNum = parseInt(hunkMatch[3])
      lineIndex = 0
      currentHunkRawLines = [line]

      currentHunk = {
        header: line,
        oldStart: oldLineNum,
        oldLines: parseInt(hunkMatch[2] || '1'),
        newStart: newLineNum,
        newLines: parseInt(hunkMatch[4] || '1'),
        lines: [],
        rawPatch: '', // Will be set when hunk is finalized
      }
      continue
    }

    // Parse diff lines
    if (currentHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunkRawLines.push(line)
        additions++
        currentHunk.lines.push({
          type: 'add',
          content: line.slice(1),
          newLineNumber: newLineNum++,
          lineIndex: lineIndex++,
        })
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunkRawLines.push(line)
        deletions++
        currentHunk.lines.push({
          type: 'delete',
          content: line.slice(1),
          oldLineNumber: oldLineNum++,
          lineIndex: lineIndex++,
        })
      } else if (line.startsWith(' ')) {
        currentHunkRawLines.push(line)
        currentHunk.lines.push({
          type: 'context',
          content: line.slice(1),
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
          lineIndex: lineIndex++,
        })
      }
    }
  }

  // Don't forget the last hunk
  if (currentHunk) {
    currentHunk.rawPatch = fileHeader + currentHunkRawLines.join('\n') + '\n'
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

// ========================================
// Worktree-Specific Staging & Commit Functions
// ========================================

// Get working status for a specific worktree
export async function getWorktreeWorkingStatus(worktreePath: string): Promise<WorkingStatus> {
  try {
    const worktreeGit = simpleGit(worktreePath)
    const status = await worktreeGit.status()

    const files: UncommittedFile[] = []
    const addedPaths = new Set<string>()

    for (const file of status.files) {
      const filePath = file.path

      if (addedPaths.has(filePath)) continue

      const indexStatus = file.index
      const workingStatus = file.working_dir

      // Staged changes
      if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
        let fileStatus: UncommittedFile['status'] = 'modified'
        if (indexStatus === 'A') fileStatus = 'added'
        else if (indexStatus === 'D') fileStatus = 'deleted'
        else if (indexStatus === 'R') fileStatus = 'renamed'
        else if (indexStatus === 'M') fileStatus = 'modified'

        files.push({ path: filePath, status: fileStatus, staged: true })
        addedPaths.add(filePath + ':staged')
      }

      // Unstaged changes
      if (workingStatus && workingStatus !== ' ') {
        let fileStatus: UncommittedFile['status'] = 'modified'
        if (workingStatus === '?') fileStatus = 'untracked'
        else if (workingStatus === 'A') fileStatus = 'added'
        else if (workingStatus === 'D') fileStatus = 'deleted'
        else if (workingStatus === 'M') fileStatus = 'modified'

        files.push({ path: filePath, status: fileStatus, staged: false })
        addedPaths.add(filePath + ':unstaged')
      }

      addedPaths.add(filePath)
    }

    // Get line change stats
    let additions = 0
    let deletions = 0
    try {
      const unstagedDiff = await worktreeGit.diff(['--stat'])
      if (unstagedDiff.trim()) {
        const lines = unstagedDiff.trim().split('\n')
        const summaryLine = lines[lines.length - 1]
        const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/)
        const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/)
        additions += addMatch ? parseInt(addMatch[1]) : 0
        deletions += delMatch ? parseInt(delMatch[1]) : 0
      }

      const stagedDiff = await worktreeGit.diff(['--cached', '--stat'])
      if (stagedDiff.trim()) {
        const lines = stagedDiff.trim().split('\n')
        const summaryLine = lines[lines.length - 1]
        const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/)
        const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/)
        additions += addMatch ? parseInt(addMatch[1]) : 0
        deletions += delMatch ? parseInt(delMatch[1]) : 0
      }
    } catch {
      // Ignore diff errors
    }

    return {
      hasChanges: files.length > 0,
      files,
      stagedCount: files.filter((f) => f.staged).length,
      unstagedCount: files.filter((f) => !f.staged).length,
      additions,
      deletions,
    }
  } catch (error) {
    console.error('Error getting worktree working status:', error)
    return { hasChanges: false, files: [], stagedCount: 0, unstagedCount: 0, additions: 0, deletions: 0 }
  }
}

// Stage a file in a worktree
export async function stageFileInWorktree(
  worktreePath: string,
  filePath: string
): Promise<{ success: boolean; message: string }> {
  try {
    const worktreeGit = simpleGit(worktreePath)
    await worktreeGit.add(filePath)
    return { success: true, message: `Staged ${filePath}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Unstage a file in a worktree
export async function unstageFileInWorktree(
  worktreePath: string,
  filePath: string
): Promise<{ success: boolean; message: string }> {
  try {
    const worktreeGit = simpleGit(worktreePath)
    await worktreeGit.raw(['restore', '--staged', filePath])
    return { success: true, message: `Unstaged ${filePath}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Stage all changes in a worktree
export async function stageAllInWorktree(worktreePath: string): Promise<{ success: boolean; message: string }> {
  try {
    const worktreeGit = simpleGit(worktreePath)
    await worktreeGit.add('-A')
    return { success: true, message: 'Staged all changes' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Unstage all changes in a worktree
export async function unstageAllInWorktree(worktreePath: string): Promise<{ success: boolean; message: string }> {
  try {
    const worktreeGit = simpleGit(worktreePath)
    await worktreeGit.raw(['restore', '--staged', '.'])
    return { success: true, message: 'Unstaged all changes' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Get file diff in a worktree
export async function getFileDiffInWorktree(
  worktreePath: string,
  filePath: string,
  staged: boolean
): Promise<StagingFileDiff | null> {
  try {
    const worktreeGit = simpleGit(worktreePath)
    const args = staged ? ['diff', '--staged', '--', filePath] : ['diff', '--', filePath]
    const diffOutput = await worktreeGit.raw(args)

    if (!diffOutput.trim()) {
      // Check if it's an untracked file
      const status = await worktreeGit.status()
      const isUntracked = status.not_added.includes(filePath)

      if (isUntracked) {
        const fullPath = path.join(worktreePath, filePath)
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8')
          const fileLines = content.split('\n')

          // Build raw patch for untracked file
          const header = `@@ -0,0 +1,${fileLines.length} @@`
          const patchLines = fileLines.map((l) => '+' + l)
          const rawPatch =
            `diff --git a/${filePath} b/${filePath}\n` +
            `new file mode 100644\n` +
            `--- /dev/null\n` +
            `+++ b/${filePath}\n` +
            header +
            '\n' +
            patchLines.join('\n') +
            '\n'

          return {
            filePath,
            status: 'untracked',
            isBinary: false,
            additions: fileLines.length,
            deletions: 0,
            hunks: [
              {
                header,
                oldStart: 0,
                oldLines: 0,
                newStart: 1,
                newLines: fileLines.length,
                rawPatch,
                lines: fileLines.map((line, idx) => ({
                  type: 'add' as const,
                  content: line,
                  newLineNumber: idx + 1,
                  lineIndex: idx,
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

    return parseDiff(diffOutput, filePath)
  } catch (error) {
    console.error('Error getting worktree file diff:', error)
    return null
  }
}

// Commit changes in a worktree
export async function commitInWorktree(
  worktreePath: string,
  message: string,
  description?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const worktreeGit = simpleGit(worktreePath)

    // Check if there are staged changes
    const status = await worktreeGit.status()
    if (status.staged.length === 0) {
      return { success: false, message: 'No staged changes to commit' }
    }

    // Build commit message
    const fullMessage = description ? `${message}\n\n${description}` : message
    await worktreeGit.commit(fullMessage)

    return { success: true, message: `Committed: ${message}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Push the worktree's branch to origin
export async function pushWorktreeBranch(worktreePath: string): Promise<{ success: boolean; message: string }> {
  try {
    const worktreeGit = simpleGit(worktreePath)
    const branchInfo = await worktreeGit.branchLocal()
    const currentBranch = branchInfo.current

    if (!currentBranch) {
      return { success: false, message: 'Worktree is in detached HEAD state - cannot push' }
    }

    await worktreeGit.push(['--set-upstream', 'origin', currentBranch])
    return { success: true, message: `Pushed ${currentBranch} to origin` }
  } catch (error) {
    const errorMessage = (error as Error).message
    if (errorMessage.includes('rejected')) {
      return { success: false, message: 'Push rejected. Pull changes first or force push.' }
    }
    if (errorMessage.includes('Permission denied') || errorMessage.includes('authentication')) {
      return { success: false, message: 'Authentication failed. Check your Git credentials.' }
    }
    return { success: false, message: errorMessage }
  }
}

// Pull current branch from origin (with rebase to avoid merge commits)
// Pull current branch from origin (with rebase to avoid merge commits)
// Ledger Opinion: Auto-stashes uncommitted changes, pulls, then restores them
// Git is overly cautious - it refuses to pull with ANY uncommitted changes.
// We're smarter: stash, pull, unstash. Only fail on real conflicts.
export async function pullCurrentBranch(): Promise<{
  success: boolean
  message: string
  hadConflicts?: boolean
  autoStashed?: boolean
}> {
  if (!git) throw new Error('No repository selected')

  let didStash = false

  try {
    const currentBranch = (await git.branchLocal()).current
    if (!currentBranch) {
      return { success: false, message: 'Not on a branch (detached HEAD state)' }
    }

    // Fetch first to get the latest refs
    await git.fetch('origin', currentBranch)

    // Check if there are remote changes to pull
    const statusBefore = await git.status()
    if (statusBefore.behind === 0) {
      return { success: true, message: 'Already up to date' }
    }

    // Check if we have uncommitted changes
    const hasUncommittedChanges =
      statusBefore.modified.length > 0 ||
      statusBefore.not_added.length > 0 ||
      statusBefore.created.length > 0 ||
      statusBefore.deleted.length > 0 ||
      statusBefore.staged.length > 0

    // Auto-stash if we have uncommitted changes
    if (hasUncommittedChanges) {
      await git.raw(['stash', 'push', '--include-untracked', '-m', 'ledger-auto-stash-for-pull'])
      didStash = true
    }

    // Pull with rebase
    await git.pull('origin', currentBranch, ['--rebase'])

    // Restore stashed changes
    if (didStash) {
      try {
        await git.raw(['stash', 'pop'])
        return {
          success: true,
          message: `Pulled ${statusBefore.behind} commit${statusBefore.behind > 1 ? 's' : ''} and restored your uncommitted changes`,
          autoStashed: true,
        }
      } catch (stashError) {
        const stashMsg = (stashError as Error).message
        if (stashMsg.includes('conflict') || stashMsg.includes('CONFLICT')) {
          return {
            success: true,
            message: 'Pulled successfully, but restoring your changes caused conflicts. Please resolve them.',
            hadConflicts: true,
            autoStashed: true,
          }
        }
        // Stash pop failed for other reason - leave it in stash list
        return {
          success: true,
          message: 'Pulled successfully. Your changes are in the stash (run git stash pop to restore).',
          autoStashed: true,
        }
      }
    }

    return {
      success: true,
      message: `Pulled ${statusBefore.behind} commit${statusBefore.behind > 1 ? 's' : ''} from origin`,
    }
  } catch (error) {
    const errorMessage = (error as Error).message

    // If we stashed but pull failed, try to restore
    if (didStash) {
      try {
        await git.raw(['stash', 'pop'])
      } catch {
        // Stash restore failed - it's still in stash list, user can recover
      }
    }

    // Check for merge/rebase conflicts
    if (
      errorMessage.includes('conflict') ||
      errorMessage.includes('CONFLICT') ||
      errorMessage.includes('Merge conflict') ||
      errorMessage.includes('could not apply')
    ) {
      try {
        await git.rebase(['--abort'])
      } catch {
        /* ignore */
      }
      return {
        success: false,
        message: 'Pull failed due to conflicts with incoming changes. Please resolve manually.',
        hadConflicts: true,
      }
    }

    // No tracking branch - this is fine for new branches
    if (errorMessage.includes('no tracking') || errorMessage.includes("doesn't track")) {
      return { success: true, message: 'No remote tracking branch (will be created on push)' }
    }

    return { success: false, message: errorMessage }
  }
}

// Commit staged changes
// Ledger Opinion: Check if origin has moved ahead before committing.
// If behind, return behindCount so UI can prompt user to pull first or commit ahead.
export async function commitChanges(
  message: string,
  description?: string,
  force: boolean = false
): Promise<{ success: boolean; message: string; behindCount?: number; hash?: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    // Check if there are staged changes
    const status = await git.status()
    if (status.staged.length === 0) {
      return { success: false, message: 'No staged changes to commit' }
    }

    // Check if we're behind origin (unless forcing)
    if (!force && status.current) {
      try {
        await git.fetch('origin', status.current)
        const freshStatus = await git.status()
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

    await git.commit(fullMessage)
    let hash: string | undefined
    try {
      hash = (await git.revparse(['HEAD'])).trim()
    } catch {
      // Best-effort: commit succeeded but we couldn't resolve HEAD
    }
    return { success: true, message: `Committed: ${message}`, ...(hash && { hash }) }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// Repo info for sibling repos list
export interface RepoInfo {
  path: string
  name: string
  isCurrent: boolean
}

/**
 * Get sibling repositories from the parent directory of the current repo.
 * Filters out worktrees (which have a .git file instead of directory).
 */
export async function getSiblingRepos(): Promise<RepoInfo[]> {
  if (!repoPath) return []

  const parentDir = path.dirname(repoPath)
  const repos: RepoInfo[] = []

  try {
    const entries = await fs.promises.readdir(parentDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const entryPath = path.join(parentDir, entry.name)
      const gitPath = path.join(entryPath, '.git')

      try {
        const gitStat = await fs.promises.stat(gitPath)
        // Only include if .git is a directory (real repo, not a worktree)
        if (gitStat.isDirectory()) {
          repos.push({
            path: entryPath,
            name: entry.name,
            isCurrent: entryPath === repoPath,
          })
        }
      } catch {
        // No .git or can't access - skip
      }
    }

    // Sort alphabetically by name
    repos.sort((a, b) => a.name.localeCompare(b.name))

    return repos
  } catch (error) {
    console.error('Error scanning sibling repos:', error)
    return []
  }
}
