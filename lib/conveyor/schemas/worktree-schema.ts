import { z } from 'zod'
import {
  WorktreeSchema,
  CreateWorktreeOptionsSchema,
  CreateWorktreeResultSchema,
  ConvertWorktreeResultSchema,
  SuccessResultSchema,
} from './shared-types'

export const worktreeIpcSchema = {
  'get-worktrees': {
    args: z.tuple([]),
    return: z.array(WorktreeSchema).or(z.object({ error: z.string() })),
  },
  'open-worktree': {
    args: z.tuple([z.string()]),
    return: SuccessResultSchema,
  },
  'convert-worktree-to-branch': {
    args: z.tuple([z.string()]),
    return: ConvertWorktreeResultSchema.nullable(),
  },
  'apply-worktree-changes': {
    args: z.tuple([z.string()]),
    return: SuccessResultSchema,
  },
  'remove-worktree': {
    args: z.tuple([z.string(), z.boolean()]),
    return: SuccessResultSchema,
  },
  'create-worktree': {
    args: z.tuple([CreateWorktreeOptionsSchema]),
    return: CreateWorktreeResultSchema,
  },
  'select-worktree-folder': {
    args: z.tuple([]),
    return: z.string().nullable(),
  },
}
