import { ConveyorApi } from '@/lib/preload/shared'
import type { RepositorySummary } from '@/lib/conveyor/schemas/repo-schema'

export class RepoApi extends ConveyorApi {
  selectRepo = () => this.invoke('select-repo')
  getRepoPath = () => this.invoke('get-repo-path')
  getSavedRepoPath = () => this.invoke('get-saved-repo-path')
  loadSavedRepo = () => this.invoke('load-saved-repo')

  // Multi-repository management
  listRepositories = (): Promise<RepositorySummary[]> => this.invoke('list-repositories')
  switchRepository = (id: string) => this.invoke('switch-repository', id)
  closeRepository = (id: string) => this.invoke('close-repository', id)
  openRepository = (path: string) => this.invoke('open-repository', path)

  // Recent repositories
  getRecentRepositories = () => this.invoke('get-recent-repositories')
  addRecentRepository = (path: string) => this.invoke('add-recent-repository', path)
  removeRecentRepository = (path: string) => this.invoke('remove-recent-repository', path)

  // Clone remote repository
  cloneRepository = (gitUrl: string) => this.invoke('clone-repository', gitUrl)

  // Connect to remote repository (API-only, no clone)
  connectRemoteRepository = (repoInput: string) => this.invoke('connect-remote-repository', repoInput)
}
