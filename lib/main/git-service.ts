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

export interface BranchInfo {
  name: string
  current: boolean
  commit: string
  label: string
  isRemote: boolean
  // Extended metadata
  lastCommitDate?: string
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
  firstCommitDate: string
  commitCount: number
}> {
  if (!git) throw new Error('No repository selected')

  // Get last commit date
  const lastCommit = await git.log([branchName, '-1', '--format=%ci'])
  const lastCommitDate = lastCommit.latest?.date || ''

  // Get first commit date (oldest commit on this branch)
  const firstCommitRaw = await git.raw(['log', branchName, '--reverse', '--format=%ci', '-1'])
  const firstCommitDate = firstCommitRaw.trim()

  // Get commit count
  const countRaw = await git.raw(['rev-list', '--count', branchName])
  const commitCount = parseInt(countRaw.trim(), 10) || 0

  return {
    lastCommitDate,
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
  // For ordering
  lastModified: string
  // Activity tracking
  activityStatus: WorktreeActivityStatus
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

// Get directory modification time
async function getDirectoryMtime(dirPath: string): Promise<string> {
  try {
    const stat = await statAsync(dirPath)
    return stat.mtime.toISOString()
  } catch {
    return new Date().toISOString()
  }
}

// Calculate activity status based on last modified time
function calculateActivityStatus(lastModified: string): WorktreeActivityStatus {
  const now = Date.now()
  const modified = new Date(lastModified).getTime()
  const diffMinutes = (now - modified) / (1000 * 60)

  if (diffMinutes < 5) return 'active' // Modified in last 5 minutes
  if (diffMinutes < 60) return 'recent' // Modified in last hour
  if (diffMinutes < 24 * 60) return 'stale' // Modified in last 24 hours
  return 'unknown' // Older than 24 hours
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

// Get enhanced worktrees with agent detection and metadata
export async function getEnhancedWorktrees(): Promise<EnhancedWorktree[]> {
  if (!git) throw new Error('No repository selected')

  // Get basic worktree list
  const basicWorktrees = await getWorktrees()

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

// Checkout a remote branch (creates local tracking branch)
export async function checkoutRemoteBranch(
  remoteBranch: string
): Promise<{ success: boolean; message: string; stashed?: string }> {
  if (!git) throw new Error('No repository selected')

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
      return {
        success: true,
        message: `Switched to existing branch '${localBranchName}'`,
        stashed: stashResult.stashed ? stashResult.message : undefined,
      }
    }

    // Create and checkout tracking branch (--ignore-other-worktrees for the checkout part)
    await git.checkout([
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
): Promise<{ success: boolean; message: string }> {
  if (!repoPath) {
    return { success: false, message: 'No repository selected' }
  }

  try {
    const args = ['pr', 'merge', prNumber.toString()]

    // Add merge method (providing this explicitly avoids interactive prompts)
    const method = options?.method || 'merge'
    args.push(`--${method}`)

    // Delete branch after merge (default: true)
    if (options?.deleteAfterMerge !== false) {
      args.push('--delete-branch')
    }

    await execAsync(`gh ${args.join(' ')}`, { cwd: repoPath })

    return {
      success: true,
      message: `Pull request #${prNumber} merged successfully`,
    }
  } catch (error) {
    const errorMessage = (error as Error).message

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

// Get the diff for a specific file in a PR
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

// Merge a PR
export async function mergePR(prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<{ success: boolean; message: string }> {
  if (!repoPath) {
    return { success: false, message: 'No repository selected' }
  }

  try {
    const methodFlag = mergeMethod === 'merge' ? '--merge' : mergeMethod === 'squash' ? '--squash' : '--rebase'
    const cmd = `gh pr merge ${prNumber} ${methodFlag} --delete-branch`

    await execAsync(cmd, { cwd: repoPath })

    return { success: true, message: 'PR merged successfully' }
  } catch (error) {
    const errorMessage = (error as Error).message

    if (errorMessage.includes('not logged')) {
      return { success: false, message: 'Not logged into GitHub CLI. Run `gh auth login` in terminal.' }
    }

    if (errorMessage.includes('already been merged')) {
      return { success: false, message: 'This PR has already been merged' }
    }

    if (errorMessage.includes('not mergeable')) {
      return { success: false, message: 'PR is not mergeable. Check for conflicts or required checks.' }
    }

    return { success: false, message: errorMessage }
  }
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
}

// Get diff for a branch compared to master/main
export async function getBranchDiff(branchName: string): Promise<BranchDiff | null> {
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

    // Get diff between base and branch (three-dot syntax shows changes since branches diverged)
    const diffOutput = await git.raw(['diff', `${baseBranch}...${branchName}`, '--patch', '--stat'])

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

// Stash entry
export interface StashEntry {
  index: number
  message: string
  branch: string
  date: string
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

// Get diff for a specific file in a stash
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

// Discard changes in a file (revert to last commit)
export async function discardFileChanges(filePath: string): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected')

  try {
    await git.raw(['restore', filePath])
    return { success: true, message: `Discarded changes in ${filePath}` }
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
}

export interface StagingDiffLine {
  type: 'context' | 'add' | 'delete'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
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

// Parse unified diff format
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
): Promise<{ success: boolean; message: string; behindCount?: number }> {
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
    return { success: true, message: `Committed: ${message}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}
