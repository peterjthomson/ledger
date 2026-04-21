/**
 * Code Graph Service Module
 *
 * Exports all code graph-related types and functions for parsing
 * TypeScript, PHP, and Ruby codebases into dependency graphs.
 *
 * Usage:
 * ```typescript
 * import { parseCodeGraph, detectLanguage, CodeGraphSchema } from '@/lib/services/codegraph'
 *
 * const schema = await parseCodeGraph('/path/to/repo')
 * ```
 */

// Types
export type {
  CodeGraphLanguage,
  CodeNodeKind,
  CodeEdgeKind,
  CodeNode,
  CodeEdge,
  CodeGraphSchema,
  CodeGraphParseResult,
  CodeGraphLanguageResult,
  CodeGraphParseOptions,
  CodeGraphStats,
} from './codegraph-types'

// Main parser service
export {
  parseCodeGraph,
  parseCodeGraphSafe,
  detectLanguage,
  detectLanguageSafe,
} from './codegraph-parser-service'

// TypeScript parser
export { parseTypeScriptProject } from './parsers/typescript-ast-parser'

// PHP parser
export { parsePhpProject, isPhpAvailable, hasPhpParser } from './parsers/php-ast-parser'

// Ruby parser
export { parseRubyProject, isRubyAvailable, hasParserGem } from './parsers/ruby-ast-parser'
