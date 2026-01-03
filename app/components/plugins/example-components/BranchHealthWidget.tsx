/**
 * Branch Health Widget Component
 *
 * Inline widget showing branch health status.
 * Appears in branch and worktree list items.
 */

import { useMemo } from 'react'
import {
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Clock,
  GitBranch,
} from 'lucide-react'
import type { PluginWidgetProps, Branch, Worktree } from '@/lib/plugins/plugin-types'
import './example-plugin-styles.css'

type HealthStatus = 'healthy' | 'warning' | 'critical' | 'stale'

interface BranchHealth {
  status: HealthStatus
  message: string
  behindMain?: number
  daysSinceActivity?: number
}

// Configuration (would come from plugin settings)
const STALE_DAYS = 14
const WARNING_BEHIND = 10
const CRITICAL_BEHIND = 50

export function BranchHealthWidget({ context, slot, data }: PluginWidgetProps) {
  // Handle both branch and worktree data
  const branchData = useMemo(() => {
    if (slot === 'branch-list-item') {
      const branch = data as Branch
      return {
        name: branch.name,
        lastCommitDate: branch.lastCommitDate,
        isMerged: branch.isMerged,
        isRemote: branch.isRemote,
      }
    } else if (slot === 'worktree-list-item') {
      const worktree = data as Worktree
      return {
        name: worktree.branch || 'detached',
        lastCommitDate: worktree.lastModified,
        isMerged: false,
        isRemote: false,
      }
    }
    return null
  }, [slot, data])

  const health = useMemo(() => {
    if (!branchData) return null
    return assessHealth(branchData)
  }, [branchData])

  if (!health) return null

  // Don't show for remote branches or main/master
  if (branchData?.isRemote) return null
  if (['main', 'master', 'develop'].includes(branchData?.name || '')) return null

  const Icon = getHealthIcon(health.status)

  return (
    <div
      className={`branch-health-widget ${health.status}`}
      title={health.message}
    >
      <Icon size={10} />
      <span>{getHealthLabel(health.status)}</span>
    </div>
  )
}

/**
 * Assess branch health based on activity and divergence
 */
function assessHealth(branch: {
  name: string
  lastCommitDate?: string
  isMerged?: boolean
}): BranchHealth {
  // If already merged, it's healthy (should be deleted)
  if (branch.isMerged) {
    return {
      status: 'healthy',
      message: 'Merged - can be deleted',
    }
  }

  // Check staleness
  if (branch.lastCommitDate) {
    const lastActivity = new Date(branch.lastCommitDate)
    const now = new Date()
    const daysSince = Math.floor(
      (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysSince > STALE_DAYS * 2) {
      return {
        status: 'stale',
        message: `No activity for ${daysSince} days`,
        daysSinceActivity: daysSince,
      }
    }

    if (daysSince > STALE_DAYS) {
      return {
        status: 'warning',
        message: `${daysSince} days since last commit`,
        daysSinceActivity: daysSince,
      }
    }
  }

  // Mock: In production, would calculate actual divergence from main
  const behindMain = mockBehindMain(branch.name)

  if (behindMain >= CRITICAL_BEHIND) {
    return {
      status: 'critical',
      message: `${behindMain} commits behind main`,
      behindMain,
    }
  }

  if (behindMain >= WARNING_BEHIND) {
    return {
      status: 'warning',
      message: `${behindMain} commits behind main`,
      behindMain,
    }
  }

  return {
    status: 'healthy',
    message: 'Up to date',
    behindMain,
  }
}

/**
 * Get icon for health status
 */
function getHealthIcon(status: HealthStatus) {
  switch (status) {
    case 'healthy':
      return CheckCircle
    case 'warning':
      return AlertTriangle
    case 'critical':
      return AlertCircle
    case 'stale':
      return Clock
  }
}

/**
 * Get label for health status
 */
function getHealthLabel(status: HealthStatus): string {
  switch (status) {
    case 'healthy':
      return 'OK'
    case 'warning':
      return 'Behind'
    case 'critical':
      return 'Stale'
    case 'stale':
      return 'Inactive'
  }
}

/**
 * Mock function to simulate behind-main calculation
 */
function mockBehindMain(branchName: string): number {
  // Deterministic mock based on branch name
  const hash = branchName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return hash % 100
}

export default BranchHealthWidget
