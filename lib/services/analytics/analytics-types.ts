/**
 * Analytics Types
 *
 * Types for repository analytics and visualization data.
 */

// Contributor statistics for ridgeline chart
export interface ContributorTimeSeries {
  author: string
  email: string
  totalCommits: number
  // Array of commit counts per time bucket
  timeSeries: { date: string; count: number }[]
}

export interface ContributorStats {
  contributors: ContributorTimeSeries[]
  startDate: string
  endDate: string
  bucketSize: 'day' | 'week' | 'month'
}

// Tech Tree types
export type TechTreeSizeTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type TechTreeBranchType =
  | 'feature'
  | 'fix'
  | 'chore'
  | 'refactor'
  | 'docs'
  | 'test'
  | 'release'
  | 'unknown'

export interface TechTreeNodeStats {
  linesAdded: number
  linesRemoved: number
  filesChanged: number
  filesAdded: number
  filesRemoved: number
  commitCount: number
  daysSinceMerge: number
}

export interface TechTreeNode {
  id: string
  branchName: string
  commitHash: string
  mergeCommitHash: string
  author: string
  mergeDate: string
  message: string
  prNumber?: number
  stats: TechTreeNodeStats
  sizeTier: TechTreeSizeTier
  branchType: TechTreeBranchType
  badges: {
    massive: boolean
    destructive: boolean
    additive: boolean
    multiFile: boolean
    surgical: boolean
    ancient: boolean
    fresh: boolean
  }
}

export interface TechTreeData {
  masterBranch: string
  nodes: TechTreeNode[]
  stats: {
    minLoc: number
    maxLoc: number
    minFiles: number
    maxFiles: number
    minAge: number
    maxAge: number
  }
}

// Behind main count result
export interface BehindMainResult {
  behind: number
  baseBranch: string
}

// Repo info for sibling repos list
export interface RepoInfo {
  path: string
  name: string
  isCurrent: boolean
}
