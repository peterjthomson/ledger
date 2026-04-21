import { handle } from '@/lib/main/shared'
import { getRepositoryManager } from '@/lib/repositories'
import {
  getContributorStats,
  getMergedBranchTree,
  getSiblingRepos,
  getFileGraph,
} from '@/lib/services/analytics'

export const registerAnalyticsHandlers = () => {
  handle('get-contributor-stats', async (topN?: number, bucketSize?: 'day' | 'week' | 'month') => {
    try {
      const ctx = getRepositoryManager().requireActive()
      return await getContributorStats(ctx, topN, bucketSize)
    } catch (_error) {
      return {
        contributors: [],
        startDate: '',
        endDate: '',
        bucketSize: bucketSize || 'week',
      }
    }
  })

  handle('get-merged-branch-tree', async (limit?: number) => {
    try {
      const ctx = getRepositoryManager().requireActive()
      return await getMergedBranchTree(ctx, limit)
    } catch (_error) {
      return {
        masterBranch: 'main',
        nodes: [],
        stats: { minLoc: 0, maxLoc: 1, minFiles: 0, maxFiles: 1, minAge: 0, maxAge: 1 },
      }
    }
  })

  handle('get-sibling-repos', async () => {
    try {
      const ctx = getRepositoryManager().requireActive()
      return await getSiblingRepos(ctx)
    } catch (_error) {
      return []
    }
  })

  handle('get-file-graph', async () => {
    try {
      const ctx = getRepositoryManager().requireActive()
      return await getFileGraph(ctx)
    } catch (_error) {
      return {
        root: { name: '', path: '', lines: 0, language: null, isDirectory: true, children: [] },
        totalLines: 0,
        languages: [],
      }
    }
  })
}
