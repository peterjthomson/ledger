/**
 * ERD Service Module
 *
 * Exports all ERD-related types and functions for parsing
 * Laravel and Rails schemas into Entity Relationship Diagrams.
 *
 * Usage:
 * ```typescript
 * import { parseSchema, detectFramework, ERDSchema } from '@/lib/services/erd'
 *
 * const schema = await parseSchema('/path/to/repo')
 * ```
 */

// Types
export type {
  ERDFramework,
  ERDConstraint,
  ERDCardinality,
  ERDRelationshipType,
  ERDForeignKey,
  ERDAttribute,
  ERDEntity,
  ERDRelationshipEndpoint,
  ERDRelationship,
  ERDSchema,
  ERDParseResult,
  ERDFrameworkDetectResult,
  ERDEntityPosition,
  ERDSavedLayout,
} from './erd-types'

// Service functions
export { parseSchema, detectFramework, parseMermaidERD } from './erd-parser-service'
