/**
 * Zustand Stores
 *
 * Centralized state management for Ledger.
 *
 * Usage:
 * ```ts
 * import { useRepositoryStore, useUIStore } from '@/app/stores'
 *
 * function MyComponent() {
 *   const branches = useRepositoryStore((s) => s.branches)
 *   const sidebarWidth = useUIStore((s) => s.sidebarWidth)
 * }
 * ```
 */

export { createAppStore, createSimpleStore } from './create-store'
export { useRepositoryStore } from './repository-store'
export { useUIStore } from './ui-store'
export { useListControlsStore, useListControl } from './list-controls-store'
export { usePluginStore, selectActiveApp, selectAppPlugins, selectOpenPanels } from './plugin-store'
