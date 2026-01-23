/**
 * ERD (Entity Relationship Diagram) Service Types
 *
 * Type definitions for ERD parsing and visualization.
 * Used by both the parser service and renderer components.
 */

/**
 * Supported frameworks for schema parsing
 */
export type ERDFramework = 'laravel' | 'rails' | 'generic'

/**
 * Constraint types for entity attributes
 */
export type ERDConstraint = 'PK' | 'FK' | 'UK' | 'nullable' | 'indexed'

/**
 * Cardinality for relationships (crow's foot notation)
 */
export type ERDCardinality = 'one' | 'zero-or-one' | 'many' | 'one-or-more'

/**
 * Relationship type (identifying vs non-identifying)
 */
export type ERDRelationshipType = 'identifying' | 'non-identifying'

/**
 * Foreign key reference information
 */
export interface ERDForeignKey {
  table: string
  column: string
}

/**
 * Single attribute/column in an entity
 */
export interface ERDAttribute {
  name: string
  type: string
  constraints: ERDConstraint[]
  foreignKey?: ERDForeignKey
  defaultValue?: string
  comment?: string
}

/**
 * Entity (table/model) in the ERD
 */
export interface ERDEntity {
  id: string
  name: string
  displayName: string
  attributes: ERDAttribute[]
  position?: { x: number; y: number }
}

/**
 * Endpoint of a relationship
 */
export interface ERDRelationshipEndpoint {
  entity: string
  attribute?: string
  cardinality: ERDCardinality
}

/**
 * Relationship between two entities
 */
export interface ERDRelationship {
  id: string
  from: ERDRelationshipEndpoint
  to: ERDRelationshipEndpoint
  label?: string
  type: ERDRelationshipType
}

/**
 * Complete ERD schema
 */
export interface ERDSchema {
  entities: ERDEntity[]
  relationships: ERDRelationship[]
  framework: ERDFramework
  source: string
  parsedAt: string
}

/**
 * Result of parsing operations
 */
export interface ERDParseResult {
  success: boolean
  data?: ERDSchema
  message?: string
}

/**
 * Result of framework detection
 */
export interface ERDFrameworkDetectResult {
  success: boolean
  data?: ERDFramework
  message?: string
}

/**
 * Position data for saving entity layout
 */
export interface ERDEntityPosition {
  entityId: string
  x: number
  y: number
}

/**
 * Saved layout for an ERD
 */
export interface ERDSavedLayout {
  repoPath: string
  positions: ERDEntityPosition[]
  savedAt: string
}
