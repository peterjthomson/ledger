/**
 * Editor Panels - Components for the Editor slot
 *
 * These panels show detail views, create forms, and special views
 * like staging. They render in the Editor slot which has global state.
 */

export { DiffPanel } from './DiffPanel'
export type { DiffPanelProps } from './DiffPanel'

export { StagingPanel } from './StagingPanel'
export type { StagingPanelProps } from './StagingPanel'

export { BranchDetailPanel } from './BranchDetailPanel'
export type { BranchDetailPanelProps } from './BranchDetailPanel'

export { PRReviewPanel } from './PRReviewPanel'
export type { PRReviewPanelProps } from './PRReviewPanel'

export { WorktreeDetailPanel } from './WorktreeDetailPanel'
export type { WorktreeDetailPanelProps } from './WorktreeDetailPanel'

export { StashDetailPanel } from './StashDetailPanel'
export type { StashDetailPanelProps } from './StashDetailPanel'

export { CreateWorktreePanel } from './CreateWorktreePanel'
export type { CreateWorktreePanelProps } from './CreateWorktreePanel'

export { EditorRouter, SidebarDetailPanel } from './EditorRouter'
export type { EditorRouterProps, SidebarDetailPanelProps } from './EditorRouter'
