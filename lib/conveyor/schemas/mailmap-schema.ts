import { z } from 'zod'
import { SuccessResultSchema } from './shared-types'

// Mailmap-specific schemas
export const AuthorIdentitySchema = z.object({
  name: z.string(),
  email: z.string(),
  commitCount: z.number(),
})

export const MailmapEntrySchema = z.object({
  canonicalName: z.string(),
  canonicalEmail: z.string(),
  aliasName: z.string().optional(),
  aliasEmail: z.string(),
})

export const MailmapSuggestionSchema = z.object({
  canonicalName: z.string(),
  canonicalEmail: z.string(),
  aliases: z.array(AuthorIdentitySchema),
  confidence: z.enum(['high', 'medium', 'low']),
})

export const mailmapIpcSchema = {
  'get-mailmap': {
    args: z.tuple([]),
    return: z.array(MailmapEntrySchema),
  },
  'get-author-identities': {
    args: z.tuple([]),
    return: z.array(AuthorIdentitySchema),
  },
  'suggest-mailmap-entries': {
    args: z.tuple([]),
    return: z.array(MailmapSuggestionSchema),
  },
  'add-mailmap-entries': {
    args: z.tuple([z.array(MailmapEntrySchema)]),
    return: SuccessResultSchema,
  },
  'remove-mailmap-entry': {
    args: z.tuple([MailmapEntrySchema]),
    return: SuccessResultSchema,
  },
}
