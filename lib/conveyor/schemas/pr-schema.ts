import { z } from 'zod'
import {
  PullRequestsResultSchema,
  CreatePROptionsSchema,
  CreatePRResultSchema,
  CheckoutResultSchema,
  SuccessResultSchema,
  PRDetailSchema,
  PRReviewCommentSchema,
  MergeMethodSchema,
} from './shared-types'

export const prIpcSchema = {
  'get-pull-requests': {
    args: z.tuple([]),
    return: PullRequestsResultSchema,
  },
  'open-pull-request': {
    args: z.tuple([z.string()]),
    return: SuccessResultSchema,
  },
  'create-pull-request': {
    args: z.tuple([CreatePROptionsSchema]),
    return: CreatePRResultSchema,
  },
  'checkout-pr-branch': {
    args: z.tuple([z.string()]),
    return: CheckoutResultSchema,
  },
  'get-github-url': {
    args: z.tuple([]),
    return: z.string().nullable(),
  },
  'open-branch-in-github': {
    args: z.tuple([z.string()]),
    return: SuccessResultSchema,
  },
  'get-pr-detail': {
    args: z.tuple([z.number()]),
    return: PRDetailSchema.nullable(),
  },
  'get-pr-review-comments': {
    args: z.tuple([z.number()]),
    return: z.array(PRReviewCommentSchema),
  },
  'get-pr-file-diff': {
    args: z.tuple([z.number(), z.string()]),
    return: z.string().nullable(),
  },
  'comment-on-pr': {
    args: z.tuple([z.number(), z.string()]),
    return: SuccessResultSchema,
  },
  'merge-pr': {
    args: z.tuple([z.number(), MergeMethodSchema.optional()]),
    return: SuccessResultSchema,
  },
}
