/**
 * Commit Suggester Widget
 *
 * Widget that analyzes staged files and suggests commit messages.
 * Uses real staging status data from the context API.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  FileText,
  Plus,
  Minus,
  FileCode,
  AlertCircle,
} from 'lucide-react'
import type { PluginWidgetProps } from '@/lib/plugins/plugin-types'
import type { StagingStatus } from '@/lib/types'

interface CommitSuggestion {
  type: 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'test' | 'chore'
  scope?: string
  message: string
  fullMessage: string
}

const TYPE_LABELS: Record<CommitSuggestion['type'], { label: string; color: string }> = {
  feat: { label: 'Feature', color: 'var(--color-green)' },
  fix: { label: 'Fix', color: 'var(--color-red)' },
  docs: { label: 'Docs', color: 'var(--color-blue)' },
  style: { label: 'Style', color: 'var(--color-purple)' },
  refactor: { label: 'Refactor', color: 'var(--color-orange)' },
  test: { label: 'Test', color: 'var(--color-yellow)' },
  chore: { label: 'Chore', color: 'var(--text-tertiary)' },
}

export function CommitSuggesterWidget({ context, repoPath, slot }: PluginWidgetProps) {
  const [stagingStatus, setStagingStatus] = useState<StagingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // Ref for copy timeout cleanup
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  // Load staging status
  useEffect(() => {
    const loadStatus = async () => {
      setLoading(true)
      try {
        const status = await context.api.getStagingStatus()
        setStagingStatus(status)
      } catch (error) {
        console.error('Failed to load staging status:', error)
      } finally {
        setLoading(false)
      }
    }
    loadStatus()

    // Refresh periodically
    const interval = setInterval(loadStatus, 5000)
    return () => clearInterval(interval)
  }, [context.api])

  // Generate commit suggestions based on staged files
  const suggestions = useMemo((): CommitSuggestion[] => {
    if (!stagingStatus?.staged || stagingStatus.staged.length === 0) {
      return []
    }

    const staged = stagingStatus.staged
    const suggestions: CommitSuggestion[] = []

    // Analyze file types and patterns
    const filePatterns = {
      docs: staged.filter((f) => /\.(md|txt|rst|doc)$/i.test(f.path) || f.path.toLowerCase().includes('readme')),
      tests: staged.filter((f) => /\.(test|spec)\.(ts|tsx|js|jsx)$/i.test(f.path) || f.path.includes('__tests__')),
      styles: staged.filter((f) => /\.(css|scss|sass|less|styl)$/i.test(f.path)),
      components: staged.filter((f) => /\.(tsx|jsx)$/i.test(f.path) && f.path.toLowerCase().includes('component')),
      config: staged.filter((f) => /\.(json|yaml|yml|toml|ini)$/i.test(f.path) || f.path.includes('config')),
    }

    // Count operations
    const added = staged.filter((f) => f.status === 'added' || f.status === 'untracked').length
    const modified = staged.filter((f) => f.status === 'modified').length
    const deleted = staged.filter((f) => f.status === 'deleted').length

    // Determine scope from common paths
    const paths = staged.map((f) => f.path)
    const commonScope = findCommonScope(paths)

    // Generate suggestions based on patterns
    if (filePatterns.docs.length > 0 && filePatterns.docs.length === staged.length) {
      suggestions.push({
        type: 'docs',
        scope: commonScope,
        message: 'update documentation',
        fullMessage: `docs${commonScope ? `(${commonScope})` : ''}: update documentation`,
      })
    }

    if (filePatterns.tests.length > 0 && filePatterns.tests.length === staged.length) {
      suggestions.push({
        type: 'test',
        scope: commonScope,
        message: added > modified ? 'add tests' : 'update tests',
        fullMessage: `test${commonScope ? `(${commonScope})` : ''}: ${added > modified ? 'add' : 'update'} tests`,
      })
    }

    if (filePatterns.styles.length > 0 && filePatterns.styles.length === staged.length) {
      suggestions.push({
        type: 'style',
        scope: commonScope,
        message: 'update styles',
        fullMessage: `style${commonScope ? `(${commonScope})` : ''}: update styles`,
      })
    }

    // Feature suggestion for new files
    if (added > 0 && added >= modified) {
      const addedFiles = staged.filter((f) => f.status === 'added' || f.status === 'untracked')
      const componentName = extractComponentName(addedFiles.map((f) => f.path))

      suggestions.push({
        type: 'feat',
        scope: componentName || commonScope,
        message: componentName ? `add ${componentName}` : 'add new functionality',
        fullMessage: `feat${componentName || commonScope ? `(${componentName || commonScope})` : ''}: add ${componentName || 'new functionality'}`,
      })
    }

    // Fix suggestion
    if (modified > 0 && deleted === 0) {
      suggestions.push({
        type: 'fix',
        scope: commonScope,
        message: 'fix issues',
        fullMessage: `fix${commonScope ? `(${commonScope})` : ''}: resolve issues in ${staged.length} file${staged.length > 1 ? 's' : ''}`,
      })
    }

    // Refactor suggestion
    if (modified > 2 || (modified > 0 && deleted > 0)) {
      suggestions.push({
        type: 'refactor',
        scope: commonScope,
        message: 'refactor code',
        fullMessage: `refactor${commonScope ? `(${commonScope})` : ''}: improve code structure`,
      })
    }

    // Chore suggestion for config files
    if (filePatterns.config.length > 0 && filePatterns.config.length === staged.length) {
      suggestions.push({
        type: 'chore',
        scope: commonScope,
        message: 'update configuration',
        fullMessage: `chore${commonScope ? `(${commonScope})` : ''}: update configuration`,
      })
    }

    // Default generic suggestion
    if (suggestions.length === 0) {
      suggestions.push({
        type: 'chore',
        scope: commonScope,
        message: `update ${staged.length} file${staged.length > 1 ? 's' : ''}`,
        fullMessage: `chore${commonScope ? `(${commonScope})` : ''}: update ${staged.length} file${staged.length > 1 ? 's' : ''}`,
      })
    }

    return suggestions.slice(0, 3)
  }, [stagingStatus])

  // Copy suggestion to clipboard
  const handleCopy = useCallback(async (index: number, message: string) => {
    try {
      await navigator.clipboard.writeText(message)
      setCopiedIndex(index)
      // Clear any pending timeout and set new one (with cleanup tracking)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopiedIndex(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }, [])

  // Refresh staging status
  const handleRefresh = useCallback(async () => {
    setLoading(true)
    try {
      const status = await (context.api.refreshStagingStatus?.() || context.api.getStagingStatus())
      setStagingStatus(status)
    } catch (error) {
      console.error('Failed to refresh:', error)
    } finally {
      setLoading(false)
    }
  }, [context.api])

  const stagedCount = stagingStatus?.staged?.length || 0
  const totalAdditions = stagingStatus?.staged?.reduce((sum, f) => sum + (f.additions || 0), 0) || 0
  const totalDeletions = stagingStatus?.staged?.reduce((sum, f) => sum + (f.deletions || 0), 0) || 0

  if (loading && !stagingStatus) {
    return (
      <div className="commit-suggester">
        <div className="commit-suggester-header">
          <Sparkles size={14} />
          <span>Commit Suggester</span>
        </div>
        <div className="commit-suggester-loading">
          <RefreshCw size={16} className="spinning" />
          <span>Analyzing staged files...</span>
        </div>
      </div>
    )
  }

  if (stagedCount === 0) {
    return (
      <div className="commit-suggester">
        <div className="commit-suggester-header">
          <Sparkles size={14} />
          <span>Commit Suggester</span>
        </div>
        <div className="commit-suggester-empty">
          <AlertCircle size={20} />
          <span>No files staged</span>
          <span className="commit-suggester-hint">Stage some files to get commit message suggestions</span>
        </div>
      </div>
    )
  }

  return (
    <div className="commit-suggester">
      <div className="commit-suggester-header">
        <div className="commit-suggester-title">
          <Sparkles size={14} />
          <span>Commit Suggester</span>
        </div>
        <button
          className="commit-suggester-refresh"
          onClick={handleRefresh}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={12} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      <div className="commit-suggester-stats">
        <div className="commit-suggester-stat">
          <FileText size={12} />
          <span>{stagedCount} staged</span>
        </div>
        {totalAdditions > 0 && (
          <div className="commit-suggester-stat additions">
            <Plus size={12} />
            <span>{totalAdditions}</span>
          </div>
        )}
        {totalDeletions > 0 && (
          <div className="commit-suggester-stat deletions">
            <Minus size={12} />
            <span>{totalDeletions}</span>
          </div>
        )}
      </div>

      <div className="commit-suggester-list">
        {suggestions.map((suggestion, index) => (
          <div key={index} className="commit-suggester-item">
            <div className="commit-suggester-type">
              <span
                className="commit-suggester-type-badge"
                style={{ background: TYPE_LABELS[suggestion.type].color }}
              >
                {suggestion.type}
              </span>
              {suggestion.scope && (
                <span className="commit-suggester-scope">({suggestion.scope})</span>
              )}
            </div>
            <div className="commit-suggester-message">{suggestion.message}</div>
            <button
              className="commit-suggester-copy"
              onClick={() => handleCopy(index, suggestion.fullMessage)}
              title="Copy full message"
            >
              {copiedIndex === index ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// Helper: Find common scope from file paths
function findCommonScope(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined

  // Extract directory components
  const dirs = paths.map((p) => {
    const parts = p.split('/')
    // Try to find meaningful directory names
    for (let i = parts.length - 2; i >= 0; i--) {
      const dir = parts[i]
      if (dir && !['src', 'lib', 'app', 'components', 'utils', 'services'].includes(dir.toLowerCase())) {
        return dir
      }
    }
    return parts[parts.length - 2] || ''
  })

  // Find most common directory
  const counts: Record<string, number> = {}
  dirs.forEach((d) => {
    if (d) counts[d] = (counts[d] || 0) + 1
  })

  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a)
  if (sorted.length > 0 && sorted[0][1] >= paths.length * 0.5) {
    return sorted[0][0].toLowerCase()
  }

  return undefined
}

// Helper: Extract component name from file paths
function extractComponentName(paths: string[]): string | undefined {
  for (const path of paths) {
    const parts = path.split('/')
    const filename = parts[parts.length - 1]

    // Look for component patterns
    const match = filename.match(/^([A-Z][a-zA-Z0-9]+)(?:\.(tsx?|jsx?))?$/)
    if (match) {
      return match[1]
    }
  }
  return undefined
}

export default CommitSuggesterWidget
