import { z } from 'zod'
import {
  CommitSchema,
  GraphCommitSchema,
  CommitDiffSchema,
  BranchDiffSchema,
  WorkingStatusSchema,
  CheckoutResultSchema,
  CommitResultSchema,
  PullResultSchema,
  ResetModeSchema,
} from './shared-types'

export const commitIpcSchema = {
  'get-commit-history': {
    args: z.tuple([z.number().optional()]),
    return: z.array(CommitSchema),
  },
  'get-commit-history-for-ref': {
    args: z.tuple([z.string(), z.number().optional()]),
    return: z.array(CommitSchema),
  },
  'get-commit-details': {
    args: z.tuple([z.string()]),
    return: z
      .object({
        hash: z.string(),
        shortHash: z.string(),
        message: z.string(),
        body: z.string(),
        author: z.string(),
        authorEmail: z.string(),
        date: z.string(),
        parentHashes: z.array(z.string()),
        files: z.array(
          z.object({
            path: z.string(),
            status: z.string(),
            additions: z.number(),
            deletions: z.number(),
            oldPath: z.string().optional(),
          })
        ),
        totalAdditions: z.number(),
        totalDeletions: z.number(),
      })
      .nullable(),
  },
  'get-working-status': {
    args: z.tuple([]),
    return: WorkingStatusSchema,
  },
  'reset-to-commit': {
    args: z.tuple([z.string(), ResetModeSchema]),
    return: CheckoutResultSchema,
  },
  'get-commit-graph-history': {
    args: z.tuple([z.number().optional(), z.boolean().optional(), z.boolean().optional()]),
    return: z.array(GraphCommitSchema),
  },
  'get-commit-diff': {
    args: z.tuple([z.string()]),
    return: CommitDiffSchema.nullable(),
  },
  'get-branch-diff': {
    args: z.tuple([z.string()]),
    return: BranchDiffSchema.nullable(),
  },
  'commit-changes': {
    args: z.tuple([z.string(), z.string().optional(), z.boolean().optional()]),
    return: CommitResultSchema,
  },
  'pull-current-branch': {
    args: z.tuple([]),
    return: PullResultSchema,
  },
}
