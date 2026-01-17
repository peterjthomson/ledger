import { z } from 'zod'

// Analytics-specific schemas
export const ContributorTimeSeriesSchema = z.object({
  author: z.string(),
  email: z.string(),
  totalCommits: z.number(),
  timeSeries: z.array(
    z.object({
      date: z.string(),
      count: z.number(),
    })
  ),
})

export const ContributorStatsSchema = z.object({
  contributors: z.array(ContributorTimeSeriesSchema),
  startDate: z.string(),
  endDate: z.string(),
  bucketSize: z.enum(['day', 'week', 'month']),
})

export const TechTreeNodeStatsSchema = z.object({
  linesAdded: z.number(),
  linesRemoved: z.number(),
  filesChanged: z.number(),
  filesAdded: z.number(),
  filesRemoved: z.number(),
  commitCount: z.number(),
  daysSinceMerge: z.number(),
})

export const TechTreeNodeSchema = z.object({
  id: z.string(),
  branchName: z.string(),
  commitHash: z.string(),
  mergeCommitHash: z.string(),
  author: z.string(),
  mergeDate: z.string(),
  message: z.string(),
  prNumber: z.number().optional(),
  stats: TechTreeNodeStatsSchema,
  sizeTier: z.enum(['xs', 'sm', 'md', 'lg', 'xl']),
  branchType: z.enum(['feature', 'fix', 'chore', 'refactor', 'docs', 'test', 'release', 'unknown']),
  badges: z.object({
    massive: z.boolean(),
    destructive: z.boolean(),
    additive: z.boolean(),
    multiFile: z.boolean(),
    surgical: z.boolean(),
    ancient: z.boolean(),
    fresh: z.boolean(),
  }),
})

export const TechTreeDataSchema = z.object({
  masterBranch: z.string(),
  nodes: z.array(TechTreeNodeSchema),
  stats: z.object({
    minLoc: z.number(),
    maxLoc: z.number(),
    minFiles: z.number(),
    maxFiles: z.number(),
    minAge: z.number(),
    maxAge: z.number(),
  }),
})

export const RepoInfoSchema = z.object({
  path: z.string(),
  name: z.string(),
  isCurrent: z.boolean(),
})

export const analyticsIpcSchema = {
  'get-contributor-stats': {
    args: z.tuple([z.number().optional(), z.enum(['day', 'week', 'month']).optional()]),
    return: ContributorStatsSchema,
  },
  'get-merged-branch-tree': {
    args: z.tuple([z.number().optional()]),
    return: TechTreeDataSchema,
  },
  'get-sibling-repos': {
    args: z.tuple([]),
    return: z.array(RepoInfoSchema),
  },
}
