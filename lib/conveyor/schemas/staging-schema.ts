import { z } from 'zod'
import { StagingFileDiffSchema, SuccessResultSchema } from './shared-types'

export const stagingIpcSchema = {
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
}
