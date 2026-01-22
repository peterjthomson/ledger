/**
 * Issue Service Types
 *
 * Type definitions for GitHub Issue operations.
 * These types are used by both the service and handlers.
 */

/**
 * Issue label with color
 */
export interface IssueLabel {
  name: string
  color: string // hex without #
  description: string | null
}

/**
 * Issue milestone
 */
export interface IssueMilestone {
  number: number
  title: string
  state: 'OPEN' | 'CLOSED'
  dueOn: string | null
}

/**
 * Issue author/assignee info
 */
export interface IssueUser {
  login: string
  id?: number
  name?: string
  avatarUrl?: string
}

/**
 * Basic issue information for list display
 */
export interface Issue {
  number: number
  title: string
  state: 'OPEN' | 'CLOSED'
  stateReason: 'completed' | 'not_planned' | 'reopened' | null
  author: string
  assignees: string[]
  labels: IssueLabel[]
  milestone: string | null
  milestoneNumber: number | null
  comments: number
  createdAt: string
  updatedAt: string
  closedAt: string | null
  url: string
  isPinned: boolean
  locked: boolean
}

/**
 * Issue comment
 */
export interface IssueComment {
  id: number
  author: string
  authorAssociation: string
  body: string
  createdAt: string
  updatedAt: string
  isEdited: boolean
  url: string
}

/**
 * Linked PR info for issue detail
 */
export interface LinkedPR {
  number: number
  title: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  url: string
}

/**
 * Detailed issue information including body and comments
 */
export interface IssueDetail extends Issue {
  body: string
  commentsData: IssueComment[]
  linkedPRs: LinkedPR[]
  linkedBranches: string[]
}

/**
 * Result of issue list operations
 */
export interface IssueListResult {
  issues: Issue[]
  error?: string
}

/**
 * Result of issue operations
 */
export interface IssueOperationResult {
  success: boolean
  message: string
  number?: number
  url?: string
}

/**
 * Filter options for listing issues
 */
export type IssueState = 'open' | 'closed' | 'all'
export type IssueAssigneeFilter = 'all' | '@me' | 'unassigned'
export type IssueSort = 'updated' | 'created' | 'created-asc' | 'comments'
export type IssueGroupBy = 'none' | 'milestone' | 'label' | 'assignee'

/**
 * Options for listing issues
 */
export interface ListIssuesOptions {
  state?: IssueState
  assignee?: string
  labels?: string[]
  milestone?: string
  search?: string
  limit?: number
  sort?: IssueSort
}

/**
 * Options for creating an issue
 */
export interface CreateIssueOptions {
  title: string
  body?: string
  labels?: string[]
  assignees?: string[]
  milestone?: number
}

/**
 * Options for editing an issue
 */
export interface EditIssueOptions {
  title?: string
  body?: string
  labels?: string[]
  assignees?: string[]
  milestone?: number | null
}

/**
 * Close reason for issues
 */
export type CloseReason = 'completed' | 'not_planned'

/**
 * Options for closing an issue
 */
export interface CloseIssueOptions {
  reason?: CloseReason
  comment?: string
}

/**
 * Priority detection result
 */
export interface DetectedPriority {
  level: 'critical' | 'high' | 'medium' | 'low' | null
  label: string | null // The actual label name that matched
  system: 'agile' | 'simple' | 'p-levels' | null
}

/**
 * Grouped issues for display
 */
export interface IssueGroup {
  key: string
  label: string
  issues: Issue[]
  collapsed?: boolean
}
