/**
 * Editor Panels - Components for the Editor slot
 *
 * These panels show detail views, create forms, and special views
 * like staging. They render in the Editor slot which has global state.
 */

export { DiffPanel } from './DiffPanel'
export type { DiffPanelProps } from './DiffPanel'

export { StagingPanel } from './CommitCreatePanel'
export type { StagingPanelProps } from './CommitCreatePanel'
// Alias
export { StagingPanel as CommitCreatePanel } from './CommitCreatePanel'
export type { StagingPanelProps as CommitCreatePanelProps } from './CommitCreatePanel'

export { BranchDetailPanel } from './BranchDetailPanel'
export type { BranchDetailPanelProps } from './BranchDetailPanel'

export { PRReviewPanel } from './PRDetailPanel'
export type { PRReviewPanelProps } from './PRDetailPanel'
// Alias
export { PRReviewPanel as PRDetailPanel } from './PRDetailPanel'
export type { PRReviewPanelProps as PRDetailPanelProps } from './PRDetailPanel'

export { WorktreeDetailPanel } from './WorktreeDetailPanel'
export type { WorktreeDetailPanelProps } from './WorktreeDetailPanel'

export { StashDetailPanel } from './StashDetailPanel'
export type { StashDetailPanelProps } from './StashDetailPanel'

export { WorktreeCreatePanel } from './WorktreeCreatePanel'
export type { WorktreeCreatePanelProps } from './WorktreeCreatePanel'

export { EditorRouter, SidebarDetailPanel } from './EditorRouter'
export type { EditorRouterProps, SidebarDetailPanelProps } from './EditorRouter'

export { MailmapDetailsPanel } from './MailmapDetailsPanel'
export type { MailmapDetailsPanelProps } from './MailmapDetailsPanel'

export { RepoDetailPanel } from './RepoDetailPanel'
export type { RepoDetailPanelProps } from './RepoDetailPanel'
