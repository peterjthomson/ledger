/**
 * Issue Service
 *
 * Pure functions for GitHub Issue operations.
 * All functions accept a RepositoryContext as the first parameter.
 *
 * SAFETY: These functions are pure - they don't access global state.
 * The caller is responsible for providing a valid, current context.
 *
 * NOTE: Issue operations require GitHub CLI (gh) to be installed and authenticated.
 */

import { RepositoryContext } from '@/lib/repositories'
import { safeExec } from '@/lib/utils/safe-exec'
import {
  Issue,
  IssueDetail,
  IssueComment,
  IssueLabel,
  IssueMilestone,
  IssueListResult,
  IssueOperationResult,
  ListIssuesOptions,
  CreateIssueOptions,
  EditIssueOptions,
  CloseIssueOptions,
  LinkedPR,
  DetectedPriority,
} from './issue-types'

/**
 * Map common gh CLI errors to user-friendly messages
 */
function mapGhError(stderr: string): string {
  if (stderr.includes('gh: command not found') || stderr.includes('not recognized')) {
    return 'GitHub CLI (gh) not installed. Install from https://cli.github.com'
  }
  if (stderr.includes('not logged in') || stderr.includes('authentication')) {
    return 'Not logged in to GitHub CLI. Run: gh auth login'
  }
  if (stderr.includes('not a git repository') || stderr.includes('no git remotes')) {
    return 'Not a GitHub repository'
  }
  if (stderr.includes('Could not resolve')) {
    return 'Issue not found'
  }
  return stderr || 'Unknown error'
}

/**
 * Detect priority from labels
 */
export function detectPriority(labels: IssueLabel[]): DetectedPriority {
  for (const label of labels) {
    const name = label.name.toLowerCase()

    // P-levels (P1, P2, P3, P4)
    if (/^p[1-4]$/i.test(label.name)) {
      const level = label.name.toUpperCase()
      return {
        level: level === 'P1' ? 'critical' : level === 'P2' ? 'high' : level === 'P3' ? 'medium' : 'low',
        label: label.name,
        system: 'p-levels',
      }
    }

    // Agile priority labels
    if (name.includes('critical') || name.includes('urgent')) {
      return { level: 'critical', label: label.name, system: 'agile' }
    }
    if (name === 'high' || name.includes('priority:high') || name.includes('priority-high')) {
      return { level: 'high', label: label.name, system: 'agile' }
    }
    if (name === 'medium' || name.includes('priority:medium') || name.includes('priority-medium')) {
      return { level: 'medium', label: label.name, system: 'agile' }
    }
    if (name === 'low' || name.includes('priority:low') || name.includes('priority-low')) {
      return { level: 'low', label: label.name, system: 'agile' }
    }

    // Simple priority (high/low)
    if (name === 'high-priority' || name === 'important') {
      return { level: 'high', label: label.name, system: 'simple' }
    }
    if (name === 'low-priority') {
      return { level: 'low', label: label.name, system: 'simple' }
    }
  }

  return { level: null, label: null, system: null }
}

/**
 * Fetch issues using GitHub CLI
 */
export async function getIssues(
  ctx: RepositoryContext,
  options: ListIssuesOptions = {}
): Promise<IssueListResult> {
  const { state = 'open', assignee, labels, milestone, search, limit = 50, sort = 'updated' } = options

  try {
    const args = [
      'issue', 'list',
      '--state', state,
      '--limit', String(limit),
      '--json', 'number,title,state,stateReason,author,assignees,labels,milestone,comments,createdAt,updatedAt,closedAt,url,isPinned,locked'
    ]

    if (assignee) {
      args.push('--assignee', assignee)
    }

    if (labels && labels.length > 0) {
      for (const label of labels) {
        args.push('--label', label)
      }
    }

    if (milestone) {
      args.push('--milestone', milestone)
    }

    if (search) {
      args.push('--search', search)
    }

    const result = await safeExec('gh', args, { cwd: ctx.path })

    if (!result.success) {
      return { issues: [], error: mapGhError(result.stderr) }
    }

    const rawIssues = JSON.parse(result.stdout)

    const issues: Issue[] = rawIssues.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      stateReason: issue.stateReason || null,
      author: issue.author?.login || 'unknown',
      assignees: (issue.assignees || []).map((a: any) => a.login),
      labels: (issue.labels || []).map((l: any) => ({
        name: l.name,
        color: l.color || 'cccccc',
        description: l.description || null,
      })),
      milestone: issue.milestone?.title || null,
      milestoneNumber: issue.milestone?.number || null,
      comments: issue.comments || 0,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      closedAt: issue.closedAt || null,
      url: issue.url,
      isPinned: issue.isPinned || false,
      locked: issue.locked || false,
    }))

    // Sort issues
    if (sort === 'updated') {
      issues.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    } else if (sort === 'created') {
      issues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    } else if (sort === 'created-asc') {
      issues.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    } else if (sort === 'comments') {
      issues.sort((a, b) => b.comments - a.comments)
    }

    // Sort pinned to top
    issues.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      return 0
    })

    return { issues }
  } catch (error) {
    return { issues: [], error: mapGhError((error as Error).message) }
  }
}

/**
 * Get detailed issue information including body and comments
 */
export async function getIssueDetail(
  ctx: RepositoryContext,
  issueNumber: number
): Promise<IssueDetail | null> {
  try {
    const result = await safeExec(
      'gh',
      [
        'issue', 'view', String(issueNumber),
        '--json', 'number,title,body,state,stateReason,author,assignees,labels,milestone,comments,createdAt,updatedAt,closedAt,url,isPinned,locked'
      ],
      { cwd: ctx.path }
    )

    if (!result.success) {
      return null
    }

    const issue = JSON.parse(result.stdout)

    // Fetch comments separately
    const commentsData = await getIssueComments(ctx, issueNumber)

    // Try to get linked PRs (this may fail on some repos)
    const linkedPRs = await getLinkedPRs(ctx, issueNumber)

    return {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      stateReason: issue.stateReason || null,
      author: issue.author?.login || 'unknown',
      assignees: (issue.assignees || []).map((a: any) => a.login),
      labels: (issue.labels || []).map((l: any) => ({
        name: l.name,
        color: l.color || 'cccccc',
        description: l.description || null,
      })),
      milestone: issue.milestone?.title || null,
      milestoneNumber: issue.milestone?.number || null,
      comments: issue.comments || 0,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      closedAt: issue.closedAt || null,
      url: issue.url,
      isPinned: issue.isPinned || false,
      locked: issue.locked || false,
      body: issue.body || '',
      commentsData,
      linkedPRs,
      linkedBranches: [], // TODO: Could fetch from GitHub API
    }
  } catch (error) {
    return null
  }
}

/**
 * Get comments for an issue
 */
export async function getIssueComments(
  ctx: RepositoryContext,
  issueNumber: number
): Promise<IssueComment[]> {
  try {
    const result = await safeExec(
      'gh',
      [
        'issue', 'view', String(issueNumber),
        '--json', 'comments',
        '--jq', '.comments'
      ],
      { cwd: ctx.path }
    )

    if (!result.success) {
      return []
    }

    const comments = JSON.parse(result.stdout)

    return comments.map((c: any) => ({
      id: c.id || 0,
      author: c.author?.login || 'unknown',
      authorAssociation: c.authorAssociation || 'NONE',
      body: c.body || '',
      createdAt: c.createdAt,
      updatedAt: c.updatedAt || c.createdAt,
      isEdited: c.updatedAt && c.updatedAt !== c.createdAt,
      url: c.url || '',
    }))
  } catch {
    return []
  }
}

/**
 * Get linked PRs for an issue (via timeline API)
 */
async function getLinkedPRs(
  ctx: RepositoryContext,
  issueNumber: number
): Promise<LinkedPR[]> {
  try {
    // Use gh api to get timeline events
    const result = await safeExec(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/issues/${issueNumber}/timeline`,
        '--jq', '[.[] | select(.event == "cross-referenced" and .source.issue.pull_request) | {number: .source.issue.number, title: .source.issue.title, state: .source.issue.state, url: .source.issue.html_url}]'
      ],
      { cwd: ctx.path }
    )

    if (!result.success || !result.stdout.trim()) {
      return []
    }

    const prs = JSON.parse(result.stdout)
    return prs.map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state?.toUpperCase() || 'OPEN',
      url: pr.url,
    }))
  } catch {
    return []
  }
}

/**
 * Open an issue in the browser
 */
export async function openIssue(
  ctx: RepositoryContext,
  issueNumber: number
): Promise<IssueOperationResult> {
  try {
    const result = await safeExec(
      'gh',
      ['issue', 'view', String(issueNumber), '--web'],
      { cwd: ctx.path }
    )

    if (!result.success) {
      return { success: false, message: mapGhError(result.stderr) }
    }

    return { success: true, message: 'Opened issue in browser' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Create a new issue
 */
export async function createIssue(
  ctx: RepositoryContext,
  options: CreateIssueOptions
): Promise<IssueOperationResult> {
  try {
    const args = ['issue', 'create', '--title', options.title]

    if (options.body) {
      args.push('--body', options.body)
    }

    if (options.labels && options.labels.length > 0) {
      for (const label of options.labels) {
        args.push('--label', label)
      }
    }

    if (options.assignees && options.assignees.length > 0) {
      for (const assignee of options.assignees) {
        args.push('--assignee', assignee)
      }
    }

    if (options.milestone) {
      args.push('--milestone', String(options.milestone))
    }

    const result = await safeExec('gh', args, { cwd: ctx.path })

    if (!result.success) {
      return { success: false, message: mapGhError(result.stderr) }
    }

    // Parse URL from stdout to extract issue number
    const url = result.stdout.trim()
    const match = url.match(/\/issues\/(\d+)/)
    const number = match ? parseInt(match[1]) : undefined

    return {
      success: true,
      message: 'Issue created',
      number,
      url,
    }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Edit an existing issue
 */
export async function editIssue(
  ctx: RepositoryContext,
  issueNumber: number,
  options: EditIssueOptions
): Promise<IssueOperationResult> {
  try {
    const args = ['issue', 'edit', String(issueNumber)]

    if (options.title) {
      args.push('--title', options.title)
    }

    if (options.body !== undefined) {
      args.push('--body', options.body)
    }

    if (options.labels !== undefined) {
      // Clear existing and set new labels
      args.push('--remove-label', '')
      for (const label of options.labels) {
        args.push('--add-label', label)
      }
    }

    if (options.assignees !== undefined) {
      // Clear existing and set new assignees
      args.push('--remove-assignee', '')
      for (const assignee of options.assignees) {
        args.push('--add-assignee', assignee)
      }
    }

    if (options.milestone !== undefined) {
      if (options.milestone === null) {
        args.push('--milestone', '')
      } else {
        args.push('--milestone', String(options.milestone))
      }
    }

    const result = await safeExec('gh', args, { cwd: ctx.path })

    if (!result.success) {
      return { success: false, message: mapGhError(result.stderr) }
    }

    return { success: true, message: 'Issue updated', number: issueNumber }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Close an issue
 */
export async function closeIssue(
  ctx: RepositoryContext,
  issueNumber: number,
  options: CloseIssueOptions = {}
): Promise<IssueOperationResult> {
  try {
    const args = ['issue', 'close', String(issueNumber)]

    if (options.reason) {
      args.push('--reason', options.reason)
    }

    if (options.comment) {
      args.push('--comment', options.comment)
    }

    const result = await safeExec('gh', args, { cwd: ctx.path })

    if (!result.success) {
      return { success: false, message: mapGhError(result.stderr) }
    }

    return { success: true, message: 'Issue closed', number: issueNumber }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Reopen a closed issue
 */
export async function reopenIssue(
  ctx: RepositoryContext,
  issueNumber: number,
  comment?: string
): Promise<IssueOperationResult> {
  try {
    const args = ['issue', 'reopen', String(issueNumber)]

    if (comment) {
      args.push('--comment', comment)
    }

    const result = await safeExec('gh', args, { cwd: ctx.path })

    if (!result.success) {
      return { success: false, message: mapGhError(result.stderr) }
    }

    return { success: true, message: 'Issue reopened', number: issueNumber }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Add a comment to an issue
 */
export async function commentOnIssue(
  ctx: RepositoryContext,
  issueNumber: number,
  body: string
): Promise<IssueOperationResult> {
  try {
    const result = await safeExec(
      'gh',
      ['issue', 'comment', String(issueNumber), '--body', body],
      { cwd: ctx.path }
    )

    if (!result.success) {
      return { success: false, message: mapGhError(result.stderr) }
    }

    return { success: true, message: 'Comment added', number: issueNumber }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Create a branch linked to an issue
 */
export async function createIssueBranch(
  ctx: RepositoryContext,
  issueNumber: number,
  branchName?: string
): Promise<{ success: boolean; message: string; branchName?: string }> {
  try {
    const args = ['issue', 'develop', String(issueNumber), '--checkout']

    if (branchName) {
      args.push('--name', branchName)
    }

    const result = await safeExec('gh', args, { cwd: ctx.path })

    if (!result.success) {
      return { success: false, message: mapGhError(result.stderr) }
    }

    // Try to extract branch name from output
    const match = result.stdout.match(/branch '([^']+)'/) || result.stderr.match(/branch '([^']+)'/)
    const createdBranchName = match?.[1] || branchName

    return {
      success: true,
      message: 'Branch created and checked out',
      branchName: createdBranchName,
    }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/**
 * Get repository labels
 */
export async function getRepoLabels(ctx: RepositoryContext): Promise<IssueLabel[]> {
  try {
    const result = await safeExec(
      'gh',
      ['label', 'list', '--json', 'name,color,description', '--limit', '100'],
      { cwd: ctx.path }
    )

    if (!result.success) {
      return []
    }

    const labels = JSON.parse(result.stdout)
    return labels.map((l: any) => ({
      name: l.name,
      color: l.color || 'cccccc',
      description: l.description || null,
    }))
  } catch {
    return []
  }
}

/**
 * Get repository milestones
 */
export async function getRepoMilestones(ctx: RepositoryContext): Promise<IssueMilestone[]> {
  try {
    const result = await safeExec(
      'gh',
      ['api', 'repos/{owner}/{repo}/milestones', '--jq', '[.[] | {number: .number, title: .title, state: .state, dueOn: .due_on}]'],
      { cwd: ctx.path }
    )

    if (!result.success) {
      return []
    }

    const milestones = JSON.parse(result.stdout)
    return milestones.map((m: any) => ({
      number: m.number,
      title: m.title,
      state: m.state?.toUpperCase() || 'OPEN',
      dueOn: m.dueOn || null,
    }))
  } catch {
    return []
  }
}

/**
 * Get open issue count for the repository
 */
export async function getOpenIssueCount(ctx: RepositoryContext): Promise<number> {
  try {
    const result = await safeExec(
      'gh',
      ['issue', 'list', '--state', 'open', '--json', 'number', '--jq', 'length'],
      { cwd: ctx.path }
    )

    if (!result.success) {
      return 0
    }

    return parseInt(result.stdout.trim()) || 0
  } catch {
    return 0
  }
}
