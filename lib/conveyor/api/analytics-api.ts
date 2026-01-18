import { ConveyorApi } from '@/lib/preload/shared'

export class AnalyticsApi extends ConveyorApi {
  getContributorStats = (topN?: number, bucketSize?: 'day' | 'week' | 'month') =>
    this.invoke('get-contributor-stats', topN, bucketSize)
  getMergedBranchTree = (limit?: number) => this.invoke('get-merged-branch-tree', limit)
  getSiblingRepos = () => this.invoke('get-sibling-repos')
}
