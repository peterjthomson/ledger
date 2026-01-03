import { ConveyorApi } from '@/lib/preload/shared'
import type { CreateWorktreeOptions } from '@/lib/conveyor/schemas/shared-types'

export class WorktreeApi extends ConveyorApi {
  getWorktrees = () => this.invoke('get-worktrees')
  openWorktree = (worktreePath: string) => this.invoke('open-worktree', worktreePath)
  convertWorktreeToBranch = (worktreePath: string) => this.invoke('convert-worktree-to-branch', worktreePath)
  applyWorktreeChanges = (worktreePath: string) => this.invoke('apply-worktree-changes', worktreePath)
  removeWorktree = (worktreePath: string, force: boolean) => this.invoke('remove-worktree', worktreePath, force)
  createWorktree = (options: CreateWorktreeOptions) => this.invoke('create-worktree', options)
  selectWorktreeFolder = () => this.invoke('select-worktree-folder')
}
