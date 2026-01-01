import { ConveyorApi } from '@/lib/preload/shared'

export interface RemoteInfo {
  owner: string
  repo: string
  fullName: string
}

export interface RepositorySummary {
  id: string
  name: string
  path: string | null
  isActive: boolean
  provider: string
  type: 'local' | 'remote'
  remote: RemoteInfo | null
}

export class RepoApi extends ConveyorApi {
  selectRepo = () => this.invoke('select-repo')
  getRepoPath = () => this.invoke('get-repo-path')
  getSavedRepoPath = () => this.invoke('get-saved-repo-path')
  loadSavedRepo = () => this.invoke('load-saved-repo')

  // Multi-repository management
  listRepositories = () => this.invoke<RepositorySummary[]>('list-repositories')
  switchRepository = (id: string) => this.invoke<{ success: boolean; path?: string; error?: string }>('switch-repository', id)
  closeRepository = (id: string) => this.invoke<{ success: boolean; error?: string }>('close-repository', id)
  openRepository = (path: string) => this.invoke<{ success: boolean; id?: string; error?: string }>('open-repository', path)

  // Recent repositories
  getRecentRepositories = () => this.invoke<string[]>('get-recent-repositories')
  addRecentRepository = (path: string) => this.invoke<void>('add-recent-repository', path)
  removeRecentRepository = (path: string) => this.invoke<void>('remove-recent-repository', path)

  // Clone remote repository
  cloneRepository = (gitUrl: string) => this.invoke<{ success: boolean; path?: string; error?: string }>('clone-repository', gitUrl)

  // Connect to remote repository (API-only, no clone)
  connectRemoteRepository = (repoInput: string) => this.invoke<{
    success: boolean
    id?: string
    name?: string
    fullName?: string
    error?: string
  }>('connect-remote-repository', repoInput)
}
