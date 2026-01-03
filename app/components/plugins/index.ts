/**
 * Plugin UI Components
 *
 * Complete plugin system UI including:
 * - Sidebar navigation
 * - Settings panel
 * - Component registry
 * - App/Panel/Widget containers
 */

// Navigation
export { PluginSidebar } from './PluginSidebar'

// Settings
export { PluginSettingsPanel } from './PluginSettingsPanel'
export { PluginConfigEditor } from './PluginConfigEditor'

// Component Registry
export {
  PluginComponentProvider,
  usePluginComponents,
  useRegisterPluginComponent,
  pluginComponentRegistry,
} from './PluginComponentRegistry'

// Containers
export {
  PluginAppContainer,
  PluginPanelContainer,
  PluginWidgetSlot,
} from './PluginAppContainer'

// Import styles
import './plugin-styles.css'
