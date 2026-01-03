/**
 * Plugin Sidebar
 *
 * Left sidebar navigation for switching between Ledger and app plugins.
 * Shows icons for each active app plugin plus the base Ledger app.
 */

import {
  GitBranch,
  Settings,
  Puzzle,
  type LucideIcon,
  Bot,
  BarChart3,
  FileCode,
  Layers,
  Terminal,
  Wand2,
  Zap,
  Brain,
  Code2,
  Database,
  Globe,
  Lock,
  MessageSquare,
  Search,
  Shield,
  Sparkles,
} from 'lucide-react'
import { usePluginStore, selectAppPlugins } from '@/app/stores/plugin-store'
import type { AppPlugin } from '@/lib/plugins/plugin-types'

// Map of icon names to Lucide components
const iconMap: Record<string, LucideIcon> = {
  'git-branch': GitBranch,
  'bot': Bot,
  'bar-chart': BarChart3,
  'file-code': FileCode,
  'layers': Layers,
  'terminal': Terminal,
  'wand': Wand2,
  'zap': Zap,
  'brain': Brain,
  'code': Code2,
  'database': Database,
  'globe': Globe,
  'lock': Lock,
  'message': MessageSquare,
  'search': Search,
  'shield': Shield,
  'sparkles': Sparkles,
  'puzzle': Puzzle,
  'settings': Settings,
}

interface PluginSidebarProps {
  className?: string
}

export function PluginSidebar({ className = '' }: PluginSidebarProps) {
  const activeAppId = usePluginStore((s) => s.activeAppId)
  const setActiveApp = usePluginStore((s) => s.setActiveApp)
  const openSettings = usePluginStore((s) => s.openSettings)
  // selectAppPlugins returns a memoized, already-sorted array
  const sortedPlugins = usePluginStore(selectAppPlugins)

  const getIcon = (iconName: string): LucideIcon => {
    return iconMap[iconName.toLowerCase()] ?? Puzzle
  }

  return (
    <div className={`plugin-sidebar ${className}`}>
      {/* Ledger home icon */}
      <button
        className={`plugin-sidebar-icon ${activeAppId === null ? 'active' : ''}`}
        onClick={() => setActiveApp(null)}
        title="Ledger - Git Management"
      >
        <GitBranch size={20} />
      </button>

      {/* Divider */}
      {sortedPlugins.length > 0 && <div className="plugin-sidebar-divider" />}

      {/* App plugin icons */}
      {sortedPlugins.map((plugin) => {
        const Icon = getIcon(plugin.icon)
        return (
          <button
            key={plugin.id}
            className={`plugin-sidebar-icon ${activeAppId === plugin.id ? 'active' : ''}`}
            onClick={() => setActiveApp(plugin.id)}
            title={plugin.iconTooltip ?? plugin.name}
          >
            <Icon size={20} />
          </button>
        )
      })}

      {/* Spacer */}
      <div className="plugin-sidebar-spacer" />

      {/* Settings icon at bottom */}
      <button
        className="plugin-sidebar-icon plugin-sidebar-icon-settings"
        onClick={() => openSettings()}
        title="Plugin Settings"
      >
        <Settings size={20} />
      </button>
    </div>
  )
}

export default PluginSidebar
