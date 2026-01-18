import { handle } from '@/lib/main/shared'
import {
  getPullRequests,
  openPullRequest,
  createPullRequest,
  checkoutPRBranch,
  getGitHubUrl,
  openBranchInGitHub,
  getPRDetail,
  getPRReviewComments,
  getPRFileDiff,
  getPRFileDiffParsed,
  commentOnPR,
  mergePR,
} from '@/lib/main/git-service'
import { serializeError, logHandlerError } from '@/lib/utils/error-helpers'

export const registerPRHandlers = () => {
  handle('get-pull-requests', async () => {
    try {
      return await getPullRequests()
    } catch (error) {
      // Return empty result for remote repos or on error
      logHandlerError('get-pull-requests', error)
      return { prs: [], error: serializeError(error) }
    }
  })

  handle('open-pull-request', async (url: string) => {
    try {
      return await openPullRequest(url)
    } catch (error) {
      logHandlerError('open-pull-request', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle(
    'create-pull-request',
    async (options: {
      title: string
      body?: string
      baseBranch?: string
      draft?: boolean
      web?: boolean
    }) => {
      try {
        return await createPullRequest(options)
      } catch (error) {
        logHandlerError('create-pull-request', error)
        return { success: false, message: serializeError(error) }
      }
    }
  )

  handle('checkout-pr-branch', async (branchName: string) => {
    try {
      return await checkoutPRBranch(branchName)
    } catch (error) {
      logHandlerError('checkout-pr-branch', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('get-github-url', async () => {
    try {
      return await getGitHubUrl()
    } catch (error) {
      logHandlerError('get-github-url', error)
      return null // URL not found is valid - keep null
    }
  })

  handle('open-branch-in-github', async (branchName: string) => {
    try {
      return await openBranchInGitHub(branchName)
    } catch (error) {
      logHandlerError('open-branch-in-github', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('get-pr-detail', async (prNumber: number) => {
    try {
      return await getPRDetail(prNumber)
    } catch (error) {
      logHandlerError('get-pr-detail', error)
      return { error: serializeError(error), data: null }
    }
  })

  handle('get-pr-review-comments', async (prNumber: number) => {
    try {
      return await getPRReviewComments(prNumber)
    } catch (error) {
      logHandlerError('get-pr-review-comments', error)
      return { error: serializeError(error), comments: [] }
    }
  })

  handle('get-pr-file-diff', async (prNumber: number, filePath: string) => {
    try {
      return await getPRFileDiff(prNumber, filePath)
    } catch (error) {
      logHandlerError('get-pr-file-diff', error)
      return { error: serializeError(error), diff: null }
    }
  })

  handle('get-pr-file-diff-parsed', async (prNumber: number, filePath: string) => {
    try {
      return await getPRFileDiffParsed(prNumber, filePath)
    } catch (error) {
      logHandlerError('get-pr-file-diff-parsed', error)
      return null
    }
  })

  handle('comment-on-pr', async (prNumber: number, body: string) => {
    try {
      return await commentOnPR(prNumber, body)
    } catch (error) {
      logHandlerError('comment-on-pr', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('merge-pr', async (prNumber: number, mergeMethod?: 'merge' | 'squash' | 'rebase') => {
    try {
      return await mergePR(prNumber, mergeMethod ?? 'merge')
    } catch (error) {
      logHandlerError('merge-pr', error)
      return { success: false, message: serializeError(error) }
    }
  })
}
