import { z } from 'zod'
import { StashEntrySchema, StashFileSchema, SuccessResultSchema } from './shared-types'

export const stashIpcSchema = {
  'get-stashes': {
    args: z.tuple([]),
    return: z.array(StashEntrySchema),
  },
  'get-stash-files': {
    args: z.tuple([z.number()]),
    return: z.array(StashFileSchema),
  },
  'get-stash-file-diff': {
    args: z.tuple([z.number(), z.string()]),
    return: z.string().nullable(),
  },
  'get-stash-diff': {
    args: z.tuple([z.number()]),
    return: z.string().nullable(),
  },
  'apply-stash': {
    args: z.tuple([z.number()]),
    return: SuccessResultSchema,
  },
  'pop-stash': {
    args: z.tuple([z.number()]),
    return: SuccessResultSchema,
  },
  'drop-stash': {
    args: z.tuple([z.number()]),
    return: SuccessResultSchema,
  },
  'stash-to-branch': {
    args: z.tuple([z.number(), z.string()]),
    return: SuccessResultSchema,
  },
}
