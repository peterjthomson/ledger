import { z } from 'zod'
import { StagingFileDiffSchema, SuccessResultSchema } from './shared-types'

const UncommittedFileSchema = z.object({
  path: z.string(),
  status: z.enum(['modified', 'added', 'deleted', 'renamed', 'untracked']),
  staged: z.boolean(),
})

const WorkingStatusSchema = z.object({
  hasChanges: z.boolean(),
  files: z.array(UncommittedFileSchema),
  stagedCount: z.number(),
  unstagedCount: z.number(),
  additions: z.number(),
  deletions: z.number(),
})

export const stagingIpcSchema = {
  'get-staging-status': {
    args: z.tuple([]),
    return: WorkingStatusSchema.nullable(),
  },
  'stage-file': {
    args: z.tuple([z.string()]),
    return: SuccessResultSchema,
  },
  'unstage-file': {
    args: z.tuple([z.string()]),
    return: SuccessResultSchema,
  },
  'stage-all': {
    args: z.tuple([]),
    return: SuccessResultSchema,
  },
  'unstage-all': {
    args: z.tuple([]),
    return: SuccessResultSchema,
  },
  'discard-file-changes': {
    args: z.tuple([z.string()]),
    return: SuccessResultSchema,
  },
  'get-file-diff': {
    args: z.tuple([z.string(), z.boolean()]),
    return: StagingFileDiffSchema.nullable(),
  },
  'get-behind-main-count': {
    args: z.tuple([]),
    return: z.object({
      behind: z.number(),
      baseBranch: z.string(),
    }).nullable(),
  },
  // Hunk-level operations
  'stage-hunk': {
    args: z.tuple([z.string(), z.number()]),
    return: SuccessResultSchema,
  },
  'unstage-hunk': {
    args: z.tuple([z.string(), z.number()]),
    return: SuccessResultSchema,
  },
  'discard-hunk': {
    args: z.tuple([z.string(), z.number()]),
    return: SuccessResultSchema,
  },
  // Line-level operations
  'stage-lines': {
    args: z.tuple([z.string(), z.number(), z.array(z.number())]),
    return: SuccessResultSchema,
  },
  'unstage-lines': {
    args: z.tuple([z.string(), z.number(), z.array(z.number())]),
    return: SuccessResultSchema,
  },
  'discard-lines': {
    args: z.tuple([z.string(), z.number(), z.array(z.number())]),
    return: SuccessResultSchema,
  },
  // File content operations (for inline editing)
  'get-file-content': {
    args: z.tuple([z.string()]),
    return: z.string().nullable(),
  },
  'save-file-content': {
    args: z.tuple([z.string(), z.string()]),
    return: SuccessResultSchema,
  },
}
