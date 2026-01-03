import { ConveyorApi } from '@/lib/preload/shared'

export class StagingApi extends ConveyorApi {
  getStagingStatus = () => this.invoke('get-staging-status')
  stageFile = (filePath: string) => this.invoke('stage-file', filePath)
  unstageFile = (filePath: string) => this.invoke('unstage-file', filePath)
  stageAll = () => this.invoke('stage-all')
  unstageAll = () => this.invoke('unstage-all')
  discardFileChanges = (filePath: string) => this.invoke('discard-file-changes', filePath)
  getFileDiff = (filePath: string, staged: boolean) => this.invoke('get-file-diff', filePath, staged)
}
