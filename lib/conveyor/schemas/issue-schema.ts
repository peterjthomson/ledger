import { z } from 'zod'
import {
  IssueListResultSchema,
  IssueDetailSchema,
  IssueOperationResultSchema,
  ListIssuesOptionsSchema,
  CreateIssueOptionsSchema,
  EditIssueOptionsSchema,
  CloseIssueOptionsSchema,
  IssueLabelSchema,
  IssueMilestoneSchema,
  CreateIssueBranchResultSchema,
  SuccessResultSchema,
} from './shared-types'

export const issueIpcSchema = {
  'get-issues': {
    args: z.tuple([ListIssuesOptionsSchema.optional()]),
    return: IssueListResultSchema,
  },
  'get-issue-detail': {
    args: z.tuple([z.number()]),
    return: IssueDetailSchema.nullable(),
  },
  'get-issue-comments': {
    args: z.tuple([z.number()]),
    return: z.array(z.object({
      id: z.number(),
      author: z.string(),
      authorAssociation: z.string(),
      body: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      isEdited: z.boolean(),
      url: z.string(),
    })),
  },
  'open-issue': {
    args: z.tuple([z.number()]),
    return: SuccessResultSchema,
  },
  'create-issue': {
    args: z.tuple([CreateIssueOptionsSchema]),
    return: IssueOperationResultSchema,
  },
  'edit-issue': {
    args: z.tuple([z.number(), EditIssueOptionsSchema]),
    return: IssueOperationResultSchema,
  },
  'close-issue': {
    args: z.tuple([z.number(), CloseIssueOptionsSchema.optional()]),
    return: IssueOperationResultSchema,
  },
  'reopen-issue': {
    args: z.tuple([z.number(), z.string().optional()]),
    return: IssueOperationResultSchema,
  },
  'comment-on-issue': {
    args: z.tuple([z.number(), z.string()]),
    return: IssueOperationResultSchema,
  },
  'create-issue-branch': {
    args: z.tuple([z.number(), z.string().optional()]),
    return: CreateIssueBranchResultSchema,
  },
  'get-repo-labels': {
    args: z.tuple([]),
    return: z.array(IssueLabelSchema),
  },
  'get-repo-milestones': {
    args: z.tuple([]),
    return: z.array(IssueMilestoneSchema),
  },
  'get-open-issue-count': {
    args: z.tuple([]),
    return: z.number(),
  },
}
