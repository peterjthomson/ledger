/**
 * JsonRenderer - ERD visualization as expandable JSON tree
 *
 * Displays the raw ERDSchema data in a collapsible tree view.
 * Useful for debugging, inspection, and data export.
 */

import { useCallback, useMemo } from 'react'
import { JsonView, darkStyles, defaultStyles } from 'react-json-view-lite'
import 'react-json-view-lite/dist/index.css'
import type { ERDSchema, ERDEntity, ERDRelationship } from '@/lib/services/erd/erd-types'

interface JsonRendererProps {
  schema: ERDSchema | null
}

/**
 * Custom styles that blend with our app theme
 */
const customDarkStyles = {
  ...darkStyles,
  container: 'erd-json-container erd-json-dark',
}

const customLightStyles = {
  ...defaultStyles,
  container: 'erd-json-container erd-json-light',
}

/**
 * Transform schema data to show names in collapsed previews
 * by restructuring as an object keyed by name/id
 */
function transformForDisplay(schema: ERDSchema): object {
  // Transform entities array to object keyed by name
  const entitiesByName: Record<string, ERDEntity> = {}
  for (const entity of schema.entities) {
    entitiesByName[entity.name] = entity
  }

  // Transform relationships to show from->to in key
  const relationshipsByKey: Record<string, ERDRelationship> = {}
  for (const rel of schema.relationships) {
    const key = `${rel.from.entity} → ${rel.to.entity}`
    relationshipsByKey[key] = rel
  }

  return {
    framework: schema.framework,
    source: schema.source,
    parsedAt: schema.parsedAt,
    entities: entitiesByName,
    relationships: relationshipsByKey,
  }
}

export function JsonRenderer({ schema }: JsonRendererProps) {
  // Detect dark mode from media query
  const isDarkMode = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }, [])

  // Transform schema for better display
  const displayData = useMemo(() => {
    if (!schema) return null
    return transformForDisplay(schema)
  }, [schema])

  // Control which nodes are expanded by default
  const shouldExpandNode = useCallback((level: number, _value: unknown, _field?: string) => {
    // Only expand top level by default
    return level < 1
  }, [])

  // Copy schema to clipboard
  const handleCopy = useCallback(() => {
    if (schema) {
      navigator.clipboard.writeText(JSON.stringify(schema, null, 2))
    }
  }, [schema])

  if (!schema || !displayData) {
    return (
      <div className="erd-renderer erd-json-renderer erd-empty">
        <p>No schema data to display</p>
      </div>
    )
  }

  return (
    <div className="erd-renderer erd-json-renderer">
      <div className="erd-json-header">
        <span className="erd-json-stats">
          {schema.entities.length} entities, {schema.relationships.length} relationships
        </span>
        <button className="erd-json-copy-btn" onClick={handleCopy} title="Copy JSON to clipboard">
          📋 Copy
        </button>
      </div>
      <div className="erd-json-content">
        <JsonView
          data={displayData}
          shouldExpandNode={shouldExpandNode}
          style={isDarkMode ? customDarkStyles : customLightStyles}
        />
      </div>
    </div>
  )
}

export default JsonRenderer
