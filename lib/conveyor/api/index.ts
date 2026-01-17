import { electronAPI } from '@electron-toolkit/preload'
import { AppApi } from './app-api'
import { WindowApi } from './window-api'
import { RepoApi } from './repo-api'
import { BranchApi } from './branch-api'
import { WorktreeApi } from './worktree-api'
import { PRApi } from './pr-api'
import { CommitApi } from './commit-api'
import { StashApi } from './stash-api'
import { StagingApi } from './staging-api'
import { ThemeApi } from './theme-api'
import { PluginApi } from './plugin-api'
import { AIApi } from './ai-api'
import { MailmapApi } from './mailmap-api'
import { AnalyticsApi } from './analytics-api'
import { CanvasApi } from './canvas-api'

export const conveyor = {
  app: new AppApi(electronAPI),
  window: new WindowApi(electronAPI),
  repo: new RepoApi(electronAPI),
  branch: new BranchApi(electronAPI),
  worktree: new WorktreeApi(electronAPI),
  pr: new PRApi(electronAPI),
  commit: new CommitApi(electronAPI),
  stash: new StashApi(electronAPI),
  staging: new StagingApi(electronAPI),
  theme: new ThemeApi(electronAPI),
  plugin: new PluginApi(electronAPI),
  ai: new AIApi(electronAPI),
  mailmap: new MailmapApi(electronAPI),
  analytics: new AnalyticsApi(electronAPI),
  canvas: new CanvasApi(electronAPI),
}

export type ConveyorApi = typeof conveyor

declare global {
  interface Window {
    conveyor: ConveyorApi
  }
}
