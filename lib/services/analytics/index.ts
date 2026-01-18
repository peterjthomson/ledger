/**
 * Analytics Service Module
 *
 * Exports all analytics-related types and functions.
 *
 * Usage:
 * ```typescript
 * import { getContributorStats, getMergedBranchTree, ContributorStats } from '@/lib/services/analytics'
 *
 * const ctx = getRepositoryManager().requireActive()
 * const stats = await getContributorStats(ctx)
 * ```
 */

// Types
export type {
  ContributorTimeSeries,
  ContributorStats,
  TechTreeSizeTier,
  TechTreeBranchType,
  TechTreeNodeStats,
  TechTreeNode,
  TechTreeData,
  BehindMainResult,
  RepoInfo,
} from './analytics-types'

// Service functions
export {
  getBehindMainCount,
  getContributorStats,
  getMergedBranchTree,
  getSiblingRepos,
} from './analytics-service'
