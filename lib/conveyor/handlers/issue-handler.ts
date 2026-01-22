import { handle } from '@/lib/main/shared'
import {
  getIssues,
  getIssueDetail,
  getIssueComments,
  openIssue,
  createIssue,
  editIssue,
  closeIssue,
  reopenIssue,
  commentOnIssue,
  createIssueBranch,
  getRepoLabels,
  getRepoMilestones,
  getOpenIssueCount,
} from '@/lib/main/git-service'
import { serializeError, logHandlerError } from '@/lib/utils/error-helpers'
import type {
  ListIssuesOptions,
  CreateIssueOptions,
  EditIssueOptions,
  CloseIssueOptions,
} from '@/lib/main/git-service'

export const registerIssueHandlers = () => {
  handle('get-issues', async (options?: ListIssuesOptions) => {
    try {
      return await getIssues(options || {})
    } catch (error) {
      logHandlerError('get-issues', error)
      return { issues: [], error: serializeError(error) }
    }
  })

  handle('get-issue-detail', async (issueNumber: number) => {
    try {
      return await getIssueDetail(issueNumber)
    } catch (error) {
      logHandlerError('get-issue-detail', error)
      return null
    }
  })

  handle('get-issue-comments', async (issueNumber: number) => {
    try {
      return await getIssueComments(issueNumber)
    } catch (error) {
      logHandlerError('get-issue-comments', error)
      return []
    }
  })

  handle('open-issue', async (issueNumber: number) => {
    try {
      return await openIssue(issueNumber)
    } catch (error) {
      logHandlerError('open-issue', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('create-issue', async (options: CreateIssueOptions) => {
    try {
      return await createIssue(options)
    } catch (error) {
      logHandlerError('create-issue', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('edit-issue', async (issueNumber: number, options: EditIssueOptions) => {
    try {
      return await editIssue(issueNumber, options)
    } catch (error) {
      logHandlerError('edit-issue', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('close-issue', async (issueNumber: number, options?: CloseIssueOptions) => {
    try {
      return await closeIssue(issueNumber, options || {})
    } catch (error) {
      logHandlerError('close-issue', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('reopen-issue', async (issueNumber: number, comment?: string) => {
    try {
      return await reopenIssue(issueNumber, comment)
    } catch (error) {
      logHandlerError('reopen-issue', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('comment-on-issue', async (issueNumber: number, body: string) => {
    try {
      return await commentOnIssue(issueNumber, body)
    } catch (error) {
      logHandlerError('comment-on-issue', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('create-issue-branch', async (issueNumber: number, branchName?: string) => {
    try {
      return await createIssueBranch(issueNumber, branchName)
    } catch (error) {
      logHandlerError('create-issue-branch', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('get-repo-labels', async () => {
    try {
      return await getRepoLabels()
    } catch (error) {
      logHandlerError('get-repo-labels', error)
      return []
    }
  })

  handle('get-repo-milestones', async () => {
    try {
      return await getRepoMilestones()
    } catch (error) {
      logHandlerError('get-repo-milestones', error)
      return []
    }
  })

  handle('get-open-issue-count', async () => {
    try {
      return await getOpenIssueCount()
    } catch (error) {
      logHandlerError('get-open-issue-count', error)
      return 0
    }
  })
}
