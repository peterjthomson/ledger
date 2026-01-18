/**
 * Editor Panels - Components for the Editor slot
 *
 * These panels show detail views, create forms, and special views
 * like staging. They render in the Editor slot which has global state.
 */

// Commit diff viewer (shows diff for a selected commit)
export { CommitDiffPanel, CommitDiffPanel as DiffPanel } from './CommitDiffPanel'
export type { CommitDiffPanelProps, CommitDiffPanelProps as DiffPanelProps } from './CommitDiffPanel'

// Staging area with commit form (StagingPanel emphasizes the staging workflow,
// CommitCreatePanel emphasizes the commit creation - same component, different contexts)
export { StagingPanel, StagingPanel as CommitCreatePanel } from './CommitCreatePanel'
export type { StagingPanelProps, StagingPanelProps as CommitCreatePanelProps } from './CommitCreatePanel'

export { BranchDetailPanel } from './BranchDetailPanel'
export type { BranchDetailPanelProps } from './BranchDetailPanel'

// PR review panel (PRReviewPanel emphasizes the review workflow,
// PRDetailPanel emphasizes viewing PR details - same component)
export { PRReviewPanel, PRReviewPanel as PRDetailPanel } from './PRDetailPanel'
export type { PRReviewPanelProps, PRReviewPanelProps as PRDetailPanelProps } from './PRDetailPanel'

export { WorktreeDetailPanel } from './WorktreeDetailPanel'
export type { WorktreeDetailPanelProps } from './WorktreeDetailPanel'

export { StashDetailPanel } from './StashDetailPanel'
export type { StashDetailPanelProps } from './StashDetailPanel'

export { WorktreeCreatePanel } from './WorktreeCreatePanel'
export type { WorktreeCreatePanelProps } from './WorktreeCreatePanel'

export { EditorRouter, EditorRouter as SidebarDetailPanel } from './EditorRouter'
export type { EditorRouterProps, EditorRouterProps as SidebarDetailPanelProps } from './EditorRouter'

// Author identity management via .mailmap
export { MailmapDetailPanel } from './MailmapDetailPanel'
export type { MailmapDetailPanelProps } from './MailmapDetailPanel'

export { RepoDetailPanel } from './RepoDetailPanel'
export type { RepoDetailPanelProps } from './RepoDetailPanel'
