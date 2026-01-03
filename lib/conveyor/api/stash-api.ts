import { ConveyorApi } from '@/lib/preload/shared'

export class StashApi extends ConveyorApi {
  getStashes = () => this.invoke('get-stashes')
  getStashFiles = (stashIndex: number) => this.invoke('get-stash-files', stashIndex)
  getStashFileDiff = (stashIndex: number, filePath: string) => this.invoke('get-stash-file-diff', stashIndex, filePath)
  getStashDiff = (stashIndex: number) => this.invoke('get-stash-diff', stashIndex)
  applyStash = (stashIndex: number) => this.invoke('apply-stash', stashIndex)
  popStash = (stashIndex: number) => this.invoke('pop-stash', stashIndex)
  dropStash = (stashIndex: number) => this.invoke('drop-stash', stashIndex)
  stashToBranch = (stashIndex: number, branchName: string) => this.invoke('stash-to-branch', stashIndex, branchName)
}
