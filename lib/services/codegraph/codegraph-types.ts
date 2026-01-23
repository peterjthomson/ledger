/**
 * Code Graph Service Types
 *
 * Type definitions for AST-based code dependency parsing and visualization.
 * Used by both the parser service and renderer components.
 */

/**
 * Supported languages for code graph parsing
 */
export type CodeGraphLanguage = 'typescript' | 'javascript' | 'php' | 'ruby' | 'mixed'

/**
 * Node kinds map directly to AST constructs
 */
export type CodeNodeKind =
  | 'file' // Source file (always present)
  | 'class' // Class declaration
  | 'interface' // Interface/protocol
  | 'function' // Standalone function
  | 'module' // Ruby module / TS namespace
  | 'trait' // PHP trait
  | 'enum' // Enum declaration

/**
 * Edge kinds map to AST relationships
 */
export type CodeEdgeKind =
  | 'imports' // import/require/use statement
  | 'extends' // Class inheritance
  | 'implements' // Interface implementation
  | 'includes' // Ruby include / PHP trait use
  | 'exports' // Re-export from another module

/**
 * Git change status for a node
 */
export type CodeNodeChangeStatus = 'added' | 'modified' | 'deleted' | undefined

/**
 * A node in the code graph (file, class, function, etc.)
 */
export interface CodeNode {
  /** Unique identifier: filePath#symbolName or just filePath for file nodes */
  id: string
  /** Type of AST construct */
  kind: CodeNodeKind
  /** Symbol name (e.g., "UserService") or filename */
  name: string
  /** Human-readable display name */
  displayName: string
  /** File path relative to repo root */
  filePath: string
  /** Start line in file (1-indexed) */
  line?: number
  /** End line in file */
  endLine?: number
  /** Source language */
  language: CodeGraphLanguage
  /** PHP namespace / Ruby module path / TS module */
  namespace?: string
  /** Is this symbol exported? */
  exported?: boolean
  /** Position for layout (set by renderer) */
  position?: { x: number; y: number }
  /** Git change status (set when diff overlay is enabled) */
  changeStatus?: CodeNodeChangeStatus
}

/**
 * An edge in the code graph (import, extends, etc.)
 */
export interface CodeEdge {
  /** Unique identifier */
  id: string
  /** Type of relationship */
  kind: CodeEdgeKind
  /** Source node ID (the file/class that depends) */
  source: string
  /** Target node ID (the file/class being depended on) */
  target: string
  /** Was the target resolved to an actual file in the codebase? */
  resolved: boolean
  /** Line where the relationship is declared */
  line?: number
  /** The original import specifier (e.g., "./utils" or "lodash") */
  specifier?: string
}

/**
 * Complete code graph schema
 */
export interface CodeGraphSchema {
  /** All nodes (files, classes, functions, etc.) */
  nodes: CodeNode[]
  /** All edges (imports, extends, implements, etc.) */
  edges: CodeEdge[]
  /** Primary language of the codebase */
  language: CodeGraphLanguage
  /** Root path of the parsed codebase */
  rootPath: string
  /** ISO timestamp when parsing completed */
  parsedAt: string
  /** Parser version for cache invalidation */
  parserVersion: string
}

/**
 * Result of parsing operations
 */
export interface CodeGraphParseResult {
  success: boolean
  data?: CodeGraphSchema
  message?: string
}

/**
 * Result of language detection
 */
export interface CodeGraphLanguageResult {
  success: boolean
  data?: CodeGraphLanguage
  message?: string
}

/**
 * Options for parsing a codebase
 */
export interface CodeGraphParseOptions {
  /** Include files in node_modules (default: false) */
  includeNodeModules?: boolean
  /** Include test files (default: false) */
  includeTests?: boolean
  /** Include type-only imports (default: false) */
  includeTypeImports?: boolean
  /** Maximum directory depth to traverse (default: 10) */
  maxDepth?: number
  /** File patterns to exclude (glob patterns) */
  excludePatterns?: string[]
}

/**
 * Statistics about a parsed code graph
 */
export interface CodeGraphStats {
  totalFiles: number
  totalNodes: number
  totalEdges: number
  nodesByKind: Record<CodeNodeKind, number>
  edgesByKind: Record<CodeEdgeKind, number>
  unresolvedImports: number
}
