/**
 * Example Plugin Components
 *
 * These components demonstrate proper plugin UI implementation.
 * They use Ledger's design tokens and follow the Plugin Standard.
 *
 * To use these as reference:
 * 1. Copy the component you need
 * 2. Modify for your plugin's requirements
 * 3. Register with the PluginComponentRegistry
 *
 * @example
 * ```tsx
 * import { pluginComponentRegistry } from '@/app/components/plugins'
 * import { TeamDashboardApp } from './example-components'
 *
 * pluginComponentRegistry.register('TeamDashboardApp', 'app', TeamDashboardApp)
 * ```
 */

// Import styles
import './example-plugin-styles.css'

// App Components
export { TeamDashboardApp } from './TeamDashboardApp'
export { AIReviewApp } from './AIReviewApp'
export { AgentEventsInboxApp } from './AgentEventsInboxApp'

// Panel Components
export { PRReviewQueuePanel } from './PRReviewQueuePanel'
export { AIChatPanel } from './AIChatPanel'
export { StandupNotesPanel } from './StandupNotesPanel'
export { RepositoryManagerPanel } from './RepositoryManagerPanel'

// Widget Components
export { BranchHealthWidget } from './BranchHealthWidget'
export { CommitSuggesterWidget } from './CommitSuggesterWidget'

/**
 * Register all example components with the plugin system.
 * Call this function during app initialization to enable the example plugins.
 */
export function registerExampleComponents(
  registry: {
    register: (id: string, type: 'app' | 'panel' | 'widget', component: React.ComponentType<any>) => void
  }
): void {
  // Dynamically import to avoid circular dependencies
  import('./TeamDashboardApp').then(({ TeamDashboardApp }) => {
    registry.register('TeamDashboardApp', 'app', TeamDashboardApp)
  })

  import('./AIReviewApp').then(({ AIReviewApp }) => {
    registry.register('AIReviewApp', 'app', AIReviewApp)
  })

  import('./AgentEventsInboxApp').then(({ AgentEventsInboxApp }) => {
    registry.register('AgentEventsInboxApp', 'app', AgentEventsInboxApp)
  })

  import('./PRReviewQueuePanel').then(({ PRReviewQueuePanel }) => {
    registry.register('PRReviewQueuePanel', 'panel', PRReviewQueuePanel)
  })

  import('./BranchHealthWidget').then(({ BranchHealthWidget }) => {
    registry.register('BranchHealthWidget', 'widget', BranchHealthWidget)
  })

  import('./AIChatPanel').then(({ AIChatPanel }) => {
    registry.register('AIChatPanel', 'panel', AIChatPanel)
  })

  import('./StandupNotesPanel').then(({ StandupNotesPanel }) => {
    registry.register('StandupNotesPanel', 'panel', StandupNotesPanel)
  })

  import('./RepositoryManagerPanel').then(({ RepositoryManagerPanel }) => {
    registry.register('RepositoryManagerPanel', 'panel', RepositoryManagerPanel)
  })

  import('./CommitSuggesterWidget').then(({ CommitSuggesterWidget }) => {
    registry.register('CommitSuggesterWidget', 'widget', CommitSuggesterWidget)
  })
}
