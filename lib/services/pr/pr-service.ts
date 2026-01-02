/**
 * PR Service
 *
 * Pure functions for Pull Request operations.
 * All functions accept a RepositoryContext as the first parameter.
 *
 * SAFETY: These functions are pure - they don't access global state.
 * The caller is responsible for providing a valid, current context.
 *
 * NOTE: PR operations require GitHub CLI (gh) to be installed and authenticated.
 */

import { RepositoryContext } from '@/lib/repositories'
import { stashChanges } from '@/lib/services/branch'
import { safeExec } from '@/lib/utils/safe-exec'
import {
  PullRequest,
  PRDetail,
  PRReviewComment,
  PRListResult,
  PROperationResult,
  CreatePROptions,
  MergePROptions,
  CheckoutResult,
} from './pr-types'

/**
 * Get the GitHub remote URL for the repository
 */
export async function getGitHubUrl(ctx: RepositoryContext): Promise<string | null> {
  try {
    const remotes = await ctx.git.getRemotes(true)
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

/**
 * Fetch open pull requests using GitHub CLI
 * Uses safeExec to prevent command injection
 */
export async function getPullRequests(ctx: RepositoryContext): Promise<PRListResult> {
  try {
    // Use gh CLI to list PRs in JSON format
    // Fetch all open PRs (filtering will happen in UI)
    const result = await safeExec(
      'gh',
      [
        'pr', 'list',
        '--state', 'open',
        '--json', 'number,title,author,headRefName,baseRefName,url,createdAt,updatedAt,additions,deletions,reviewDecision,labels,isDraft,comments'
      ],
      { cwd: ctx.path }
    )

    if (!result.success) {
      const errorMessage = result.stderr || 'Failed to fetch pull requests'

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

    const rawPRs = JSON.parse(result.stdout)

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

/**
 * Open a PR in the browser
 * Uses safeExec to prevent command injection
 */
export async function openPullRequest(url: string): Promise<PROperationResult> {
  try {
    const result = await safeExec('open', [url])
    if (!result.success) {
      return { success: false, message: result.stderr || 'Failed to open browser' }
    }
    return { success: true, message: 'Opened PR in browser' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Push a branch to origin (helper for createPullRequest)
 */
async function pushBranchForPR(
  ctx: RepositoryContext,
  branchName: string
): Promise<{ success: boolean; message: string }> {
  try {
    await ctx.git.push(['--set-upstream', 'origin', branchName])
    return { success: true, message: `Pushed ${branchName} to origin` }
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

/**
 * Create a new pull request
 * Uses safeExec to prevent command injection (title/body passed as separate arguments)
 */
export async function createPullRequest(
  ctx: RepositoryContext,
  options: CreatePROptions
): Promise<PROperationResult> {
  try {
    // First, push the branch to ensure it exists on remote
    const branchToPush = options.headBranch || (await ctx.git.revparse(['--abbrev-ref', 'HEAD']))
    const pushResult = await pushBranchForPR(ctx, branchToPush)
    if (!pushResult.success) {
      return { success: false, message: `Failed to push branch: ${pushResult.message}` }
    }

    // Build args array - no shell escaping needed with safeExec
    const args = ['pr', 'create', '--title', options.title]

    // Always provide body (required for non-interactive mode)
    args.push('--body', options.body || '')

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
      const result = await safeExec('gh', args, { cwd: ctx.path })
      if (!result.success) {
        return { success: false, message: result.stderr || 'Failed to open browser' }
      }
      return { success: true, message: 'Opened PR creation in browser' }
    }

    const result = await safeExec('gh', args, { cwd: ctx.path })

    if (!result.success) {
      const errorMessage = result.stderr || 'Failed to create PR'
      if (errorMessage.includes('already exists')) {
        return { success: false, message: 'A pull request already exists for this branch' }
      }
      if (errorMessage.includes('not logged')) {
        return { success: false, message: 'Not logged into GitHub CLI. Run `gh auth login` in terminal.' }
      }
      return { success: false, message: errorMessage }
    }

    const url = result.stdout.trim()

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

/**
 * Merge a pull request (full options)
 * Uses safeExec to prevent command injection
 */
export async function mergePullRequest(
  ctx: RepositoryContext,
  prNumber: number,
  options?: MergePROptions
): Promise<PROperationResult> {
  try {
    const args = ['pr', 'merge', prNumber.toString()]

    // Add merge method (providing this explicitly avoids interactive prompts)
    const method = options?.method || 'merge'
    args.push(`--${method}`)

    // Delete branch after merge (default: true)
    if (options?.deleteAfterMerge !== false) {
      args.push('--delete-branch')
    }

    const result = await safeExec('gh', args, { cwd: ctx.path })

    if (!result.success) {
      const errorMessage = result.stderr || 'Failed to merge PR'

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

    return {
      success: true,
      message: `Pull request #${prNumber} merged successfully`,
    }
  } catch (error) {
    const errorMessage = (error as Error).message
    return { success: false, message: errorMessage }
  }
}

/**
 * Get detailed PR information including comments, reviews, files
 * Uses safeExec to prevent command injection
 */
export async function getPRDetail(ctx: RepositoryContext, prNumber: number): Promise<PRDetail | null> {
  try {
    const result = await safeExec(
      'gh',
      [
        'pr', 'view', prNumber.toString(),
        '--json', 'number,title,body,author,state,reviewDecision,baseRefName,headRefName,additions,deletions,createdAt,updatedAt,url,comments,reviews,files,commits'
      ],
      { cwd: ctx.path }
    )

    if (!result.success) {
      console.error('Error fetching PR detail:', result.stderr)
      return null
    }

    const data = JSON.parse(result.stdout)

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

/**
 * Get line-specific review comments for a PR
 */
export async function getPRReviewComments(
  ctx: RepositoryContext,
  prNumber: number
): Promise<PRReviewComment[]> {
  try {
    // Get repo owner and name from GitHub URL
    const ghUrl = await getGitHubUrl(ctx)
    if (!ghUrl) return []

    // Extract owner/repo from URL (e.g., "https://github.com/owner/repo")
    const match = ghUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (!match) return []

    const [, owner, repo] = match

    // Use safeExec to prevent command injection
    const result = await safeExec(
      'gh',
      ['api', `/repos/${owner}/${repo}/pulls/${prNumber}/comments`],
      { cwd: ctx.path }
    )
    if (!result.success) {
      console.error('Error fetching PR review comments:', result.stderr)
      return []
    }

    const comments = JSON.parse(result.stdout)

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

/**
 * Get the diff for a specific file in a PR
 */
export async function getPRFileDiff(
  ctx: RepositoryContext,
  prNumber: number,
  filePath: string
): Promise<string | null> {
  try {
    // gh pr diff doesn't support file filtering, so get full diff and parse
    // Use safeExec to prevent command injection
    const result = await safeExec('gh', ['pr', 'diff', prNumber.toString()], {
      cwd: ctx.path,
      timeout: 60000, // 60s timeout for large diffs
    })
    if (!result.success) {
      console.error('Error fetching PR file diff:', result.stderr)
      return null
    }
    const fullDiff = result.stdout

    // Parse the unified diff to extract just the file we want
    const lines = fullDiff.split('\n')
    let inTargetFile = false
    const diffLines: string[] = []

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
        diffLines.push(line)
      }
    }

    return diffLines.length > 0 ? diffLines.join('\n') : null
  } catch (error) {
    console.error('Error fetching PR file diff:', error)
    return null
  }
}

/**
 * Add a comment to a PR
 * Uses safeExec to prevent command injection (body passed as separate argument)
 */
export async function commentOnPR(
  ctx: RepositoryContext,
  prNumber: number,
  body: string
): Promise<PROperationResult> {
  try {
    // Use safeExec with array args - no shell interpolation, body passed directly
    const result = await safeExec('gh', ['pr', 'comment', prNumber.toString(), '--body', body], {
      cwd: ctx.path,
    })

    if (!result.success) {
      const errorMessage = result.stderr || 'Failed to add comment'

      if (errorMessage.includes('not logged')) {
        return { success: false, message: 'Not logged into GitHub CLI. Run `gh auth login` in terminal.' }
      }

      return { success: false, message: errorMessage }
    }

    return { success: true, message: 'Comment added' }
  } catch (error) {
    const errorMessage = (error as Error).message

    if (errorMessage.includes('not logged')) {
      return { success: false, message: 'Not logged into GitHub CLI. Run `gh auth login` in terminal.' }
    }

    return { success: false, message: errorMessage }
  }
}

/**
 * Merge a PR (simplified interface)
 * Uses safeExec to prevent command injection
 */
export async function mergePR(
  ctx: RepositoryContext,
  prNumber: number,
  mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'
): Promise<PROperationResult> {
  try {
    const methodFlag = `--${mergeMethod}`
    const args = ['pr', 'merge', prNumber.toString(), methodFlag, '--delete-branch']

    const result = await safeExec('gh', args, { cwd: ctx.path })

    if (!result.success) {
      const errorMessage = result.stderr || 'Failed to merge PR'

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

    return { success: true, message: 'PR merged successfully' }
  } catch (error) {
    const errorMessage = (error as Error).message
    return { success: false, message: errorMessage }
  }
}

/**
 * Open a branch in GitHub
 * Uses safeExec to prevent command injection
 */
export async function openBranchInGitHub(
  ctx: RepositoryContext,
  branchName: string
): Promise<PROperationResult> {
  try {
    const baseUrl = await getGitHubUrl(ctx)
    if (!baseUrl) {
      return { success: false, message: 'Could not determine GitHub URL' }
    }

    // Clean up branch name (remove remotes/origin/ prefix if present)
    const cleanBranch = branchName.replace(/^remotes\/origin\//, '').replace(/^origin\//, '')
    const url = `${baseUrl}/tree/${cleanBranch}`

    const result = await safeExec('open', [url])
    if (!result.success) {
      return { success: false, message: result.stderr || 'Failed to open browser' }
    }
    return { success: true, message: `Opened ${cleanBranch} in browser` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Checkout a PR branch (by branch name)
 */
export async function checkoutPRBranch(
  ctx: RepositoryContext,
  branchName: string
): Promise<CheckoutResult> {
  try {
    // First fetch to ensure we have the latest
    await ctx.git.fetch('origin', branchName)

    // Stash any uncommitted changes
    const stashResult = await stashChanges(ctx)

    // Check if local branch exists
    const branches = await ctx.git.branchLocal()
    if (branches.all.includes(branchName)) {
      // Checkout (allow even if checked out in worktree) and pull
      await ctx.git.checkout(['--ignore-other-worktrees', branchName])
      await ctx.git.pull('origin', branchName)
    } else {
      // Create tracking branch (--ignore-other-worktrees for the checkout part)
      await ctx.git.checkout(['--ignore-other-worktrees', '-b', branchName, '--track', `origin/${branchName}`])
    }

    return {
      success: true,
      message: `Checked out '${branchName}'`,
      stashed: stashResult.stashed ? stashResult.message : undefined,
    }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}
