import { ConveyorApi } from '@/lib/preload/shared'
import type { ResetMode } from '@/lib/conveyor/schemas/shared-types'

export class CommitApi extends ConveyorApi {
  getCommitHistory = (limit?: number) => this.invoke('get-commit-history', limit)
  getWorkingStatus = () => this.invoke('get-working-status')
  resetToCommit = (commitHash: string, mode: ResetMode) => this.invoke('reset-to-commit', commitHash, mode)
  getCommitGraphHistory = (limit?: number, skipStats?: boolean, showCheckpoints?: boolean) =>
    this.invoke('get-commit-graph-history', limit, skipStats, showCheckpoints)
  getCommitDiff = (commitHash: string) => this.invoke('get-commit-diff', commitHash)
  getBranchDiff = (branchName: string) => this.invoke('get-branch-diff', branchName)
  commitChanges = (message: string, description?: string, force?: boolean) =>
    this.invoke('commit-changes', message, description, force)
  pullCurrentBranch = () => this.invoke('pull-current-branch')
}
