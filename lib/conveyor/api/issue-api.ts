import { ConveyorApi } from '@/lib/preload/shared'

export interface ListIssuesOptions {
  state?: 'open' | 'closed' | 'all'
  assignee?: string
  labels?: string[]
  milestone?: string
  search?: string
  limit?: number
  sort?: 'updated' | 'created' | 'created-asc' | 'comments'
}

export interface CreateIssueOptions {
  title: string
  body?: string
  labels?: string[]
  assignees?: string[]
  milestone?: number
}

export interface EditIssueOptions {
  title?: string
  body?: string
  labels?: string[]
  assignees?: string[]
  milestone?: number | null
}

export interface CloseIssueOptions {
  reason?: 'completed' | 'not_planned'
  comment?: string
}

export class IssueApi extends ConveyorApi {
  getIssues = (options?: ListIssuesOptions) => this.invoke('get-issues', options)
  getIssueDetail = (issueNumber: number) => this.invoke('get-issue-detail', issueNumber)
  getIssueComments = (issueNumber: number) => this.invoke('get-issue-comments', issueNumber)
  openIssue = (issueNumber: number) => this.invoke('open-issue', issueNumber)
  createIssue = (options: CreateIssueOptions) => this.invoke('create-issue', options)
  editIssue = (issueNumber: number, options: EditIssueOptions) => this.invoke('edit-issue', issueNumber, options)
  closeIssue = (issueNumber: number, options?: CloseIssueOptions) => this.invoke('close-issue', issueNumber, options)
  reopenIssue = (issueNumber: number, comment?: string) => this.invoke('reopen-issue', issueNumber, comment)
  commentOnIssue = (issueNumber: number, body: string) => this.invoke('comment-on-issue', issueNumber, body)
  createIssueBranch = (issueNumber: number, branchName?: string) => this.invoke('create-issue-branch', issueNumber, branchName)
  getRepoLabels = () => this.invoke('get-repo-labels')
  getRepoMilestones = () => this.invoke('get-repo-milestones')
  getOpenIssueCount = () => this.invoke('get-open-issue-count')
}
