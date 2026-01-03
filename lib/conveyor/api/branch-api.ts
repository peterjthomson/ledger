import { ConveyorApi } from '@/lib/preload/shared'

export class BranchApi extends ConveyorApi {
  getBranches = () => this.invoke('get-branches')
  getBranchesBasic = () => this.invoke('get-branches-basic')
  getBranchesWithMetadata = () => this.invoke('get-branches-with-metadata')
  checkoutBranch = (branchName: string) => this.invoke('checkout-branch', branchName)
  createBranch = (branchName: string, checkout?: boolean) => this.invoke('create-branch', branchName, checkout)
  pushBranch = (branchName?: string, setUpstream?: boolean) => this.invoke('push-branch', branchName, setUpstream)
  checkoutRemoteBranch = (remoteBranch: string) => this.invoke('checkout-remote-branch', remoteBranch)
  pullBranch = (remoteBranch: string) => this.invoke('pull-branch', remoteBranch)
}
