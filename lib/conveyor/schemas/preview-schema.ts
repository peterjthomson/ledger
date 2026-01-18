import { z } from 'zod'

// Preview type (local server or cloud deployment)
export const PreviewTypeSchema = z.enum(['local', 'cloud'])

// Provider availability result
export const ProviderAvailabilitySchema = z.object({
  available: z.boolean(),
  compatible: z.boolean(),
  reason: z.string().optional(),
})

// Preview result (returned from preview operations)
export const PreviewResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  url: z.string().optional(),
  deploymentId: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  worktreePath: z.string().optional(),
  provider: z.string().optional(),
})

// Provider info (serializable version for renderer)
export const PreviewProviderInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  type: PreviewTypeSchema,
  available: z.boolean(),
  compatible: z.boolean(),
  reason: z.string().optional(),
})

// Check availability result (legacy Herd check)
export const PreviewAvailabilitySchema = z.object({
  herdInstalled: z.boolean(),
  isLaravel: z.boolean(),
})

// IPC schema definitions
export const previewIpcSchema = {
  // Check if preview is available for a path (legacy - for Herd)
  'preview:check-available': {
    args: z.tuple([z.string()]), // worktreePath
    return: PreviewAvailabilitySchema,
  },

  // Get available providers for a project
  'preview:get-providers': {
    args: z.tuple([z.string(), z.string().optional()]), // repoPath, targetPath?
    return: z.array(PreviewProviderInfoSchema),
  },

  // Preview a worktree with specific provider
  'preview:worktree': {
    args: z.tuple([z.string(), z.string(), z.string()]), // providerId, worktreePath, mainRepoPath
    return: PreviewResultSchema,
  },

  // Preview a branch with specific provider
  'preview:branch': {
    args: z.tuple([z.string(), z.string(), z.string()]), // providerId, branchName, mainRepoPath
    return: PreviewResultSchema,
  },

  // Preview a PR with specific provider
  'preview:pr': {
    args: z.tuple([z.string(), z.number(), z.string(), z.string()]), // providerId, prNumber, prBranchName, mainRepoPath
    return: PreviewResultSchema,
  },

  // Preview a commit with specific provider
  'preview:commit': {
    args: z.tuple([z.string(), z.string(), z.string()]), // providerId, commitHash, mainRepoPath
    return: PreviewResultSchema,
  },

  // Auto-preview worktree (pick best provider)
  'preview:auto-worktree': {
    args: z.tuple([z.string(), z.string()]), // worktreePath, mainRepoPath
    return: PreviewResultSchema,
  },

  // Auto-preview branch (pick best provider)
  'preview:auto-branch': {
    args: z.tuple([z.string(), z.string()]), // branchName, mainRepoPath
    return: PreviewResultSchema,
  },

  // Auto-preview PR (pick best provider)
  'preview:auto-pr': {
    args: z.tuple([z.number(), z.string(), z.string()]), // prNumber, prBranchName, mainRepoPath
    return: PreviewResultSchema,
  },

  // Stop a preview
  'preview:stop': {
    args: z.tuple([z.string(), z.string()]), // providerId, worktreePath
    return: z.object({ success: z.boolean(), message: z.string() }),
  },

  // Stop all previews
  'preview:stop-all': {
    args: z.tuple([]),
    return: z.object({ success: z.boolean(), message: z.string() }),
  },

  // Check if preview is running
  'preview:is-running': {
    args: z.tuple([z.string(), z.string()]), // providerId, worktreePath
    return: z.boolean(),
  },

  // Get URL of running preview
  'preview:get-url': {
    args: z.tuple([z.string(), z.string()]), // providerId, worktreePath
    return: z.string().nullable(),
  },
}

// Type exports
export type PreviewType = z.infer<typeof PreviewTypeSchema>
export type ProviderAvailability = z.infer<typeof ProviderAvailabilitySchema>
export type PreviewResult = z.infer<typeof PreviewResultSchema>
export type PreviewProviderInfo = z.infer<typeof PreviewProviderInfoSchema>
export type PreviewAvailability = z.infer<typeof PreviewAvailabilitySchema>
