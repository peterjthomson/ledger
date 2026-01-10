import { z } from 'zod'

const RemoteInfoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  fullName: z.string(),
})

const RepositorySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string().nullable(),
  isActive: z.boolean(),
  provider: z.string(),
  type: z.enum(['local', 'remote']),
  remote: RemoteInfoSchema.nullable(),
})

export const repoIpcSchema = {
  'select-repo': {
    args: z.tuple([]),
    return: z.string().nullable(),
  },
  'get-repo-path': {
    args: z.tuple([]),
    return: z.string().nullable(),
  },
  'get-saved-repo-path': {
    args: z.tuple([]),
    return: z.string().nullable(),
  },
  'load-saved-repo': {
    args: z.tuple([]),
    return: z.string().nullable(),
  },

  // Multi-repository management
  'list-repositories': {
    args: z.tuple([]),
    return: z.array(RepositorySummarySchema),
  },
  'switch-repository': {
    args: z.tuple([z.string()]),
    return: z.object({
      success: z.boolean(),
      path: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  'close-repository': {
    args: z.tuple([z.string()]),
    return: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
  },
  'open-repository': {
    args: z.tuple([z.string()]),
    return: z.object({
      success: z.boolean(),
      id: z.string().optional(),
      error: z.string().optional(),
    }),
  },

  // Recent repositories
  'get-recent-repositories': {
    args: z.tuple([]),
    return: z.array(z.string()),
  },
  'add-recent-repository': {
    args: z.tuple([z.string()]),
    return: z.void(),
  },
  'remove-recent-repository': {
    args: z.tuple([z.string()]),
    return: z.void(),
  },

  // Clone remote repository
  'clone-repository': {
    args: z.tuple([z.string()]), // gitUrl
    return: z.object({
      success: z.boolean(),
      path: z.string().optional(),
      error: z.string().optional(),
    }),
  },

  // Connect to remote repository (API-only, no clone)
  'connect-remote-repository': {
    args: z.tuple([z.string()]), // repoInput (owner/repo or URL)
    return: z.object({
      success: z.boolean(),
      id: z.string().optional(),
      name: z.string().optional(),
      fullName: z.string().optional(),
      error: z.string().optional(),
    }),
  },
}

// Type exports
export type RemoteInfo = z.infer<typeof RemoteInfoSchema>
export type RepositorySummary = z.infer<typeof RepositorySummarySchema>
