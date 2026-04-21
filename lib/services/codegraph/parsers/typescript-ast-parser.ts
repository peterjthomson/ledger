/**
 * TypeScript AST Parser
 *
 * Parses TypeScript/JavaScript files using ts-morph to extract
 * code dependencies: imports, classes, interfaces, functions.
 */

import { Project, SourceFile } from 'ts-morph'
import * as path from 'path'
import * as fs from 'fs/promises'
import type { CodeNode, CodeEdge, CodeGraphSchema, CodeGraphParseOptions } from '../codegraph-types'

const PARSER_VERSION = '1.0.0'

// Default file patterns to exclude
const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
  '**/*.d.ts',
]

// Test file patterns
const TEST_PATTERNS = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
]

/**
 * Parse a TypeScript/JavaScript codebase into a CodeGraphSchema
 */
export async function parseTypeScriptProject(
  repoPath: string,
  options: CodeGraphParseOptions = {}
): Promise<CodeGraphSchema> {
  const {
    includeNodeModules = false,
    includeTests = false,
    includeTypeImports = false,
    excludePatterns = [],
  } = options

  // Build exclude patterns
  const allExcludePatterns = [...DEFAULT_EXCLUDE_PATTERNS, ...excludePatterns]
  if (!includeTests) {
    allExcludePatterns.push(...TEST_PATTERNS)
  }

  // Try to find tsconfig.json
  const tsconfigPath = await findTsConfig(repoPath)

  // Create ts-morph project
  const project = tsconfigPath
    ? new Project({ tsConfigFilePath: tsconfigPath })
    : new Project({
        compilerOptions: {
          allowJs: true,
          checkJs: false,
          noEmit: true,
          skipLibCheck: true,
          esModuleInterop: true,
          moduleResolution: 2, // NodeJs
          target: 99, // ESNext
          module: 99, // ESNext
        },
      })

  // If no tsconfig, manually add source files
  if (!tsconfigPath) {
    const sourceGlobs = [
      path.join(repoPath, '**/*.ts'),
      path.join(repoPath, '**/*.tsx'),
      path.join(repoPath, '**/*.js'),
      path.join(repoPath, '**/*.jsx'),
    ]

    for (const glob of sourceGlobs) {
      project.addSourceFilesAtPaths(glob)
    }
  }

  // Get all source files, filtering by exclude patterns
  const sourceFiles = project.getSourceFiles().filter((sf) => {
    const filePath = sf.getFilePath()

    // Check if in node_modules
    if (!includeNodeModules && filePath.includes('node_modules')) {
      return false
    }

    // Check exclude patterns (simple check)
    for (const pattern of allExcludePatterns) {
      if (matchesPattern(filePath, pattern)) {
        return false
      }
    }

    // Ensure file is within repoPath
    return filePath.startsWith(repoPath)
  })

  const nodes: CodeNode[] = []
  const edges: CodeEdge[] = []
  const nodeIds = new Set<string>()

  // Process each source file
  for (const sourceFile of sourceFiles) {
    const relativePath = path.relative(repoPath, sourceFile.getFilePath())
    const language = getLanguageFromPath(relativePath)

    // Create file node
    const fileNodeId = relativePath
    if (!nodeIds.has(fileNodeId)) {
      nodes.push({
        id: fileNodeId,
        kind: 'file',
        name: path.basename(relativePath),
        displayName: path.basename(relativePath),
        filePath: relativePath,
        language,
        line: 1,
      })
      nodeIds.add(fileNodeId)
    }

    // Extract imports
    const imports = sourceFile.getImportDeclarations()
    for (const importDecl of imports) {
      // Skip type-only imports if not requested
      if (!includeTypeImports && importDecl.isTypeOnly()) {
        continue
      }

      const moduleSpecifier = importDecl.getModuleSpecifierValue()
      const resolvedSourceFile = importDecl.getModuleSpecifierSourceFile()

      let targetId: string
      let resolved = false

      if (resolvedSourceFile) {
        const resolvedPath = resolvedSourceFile.getFilePath()
        if (resolvedPath.startsWith(repoPath) && !resolvedPath.includes('node_modules')) {
          targetId = path.relative(repoPath, resolvedPath)
          resolved = true

          // Ensure target file node exists
          if (!nodeIds.has(targetId)) {
            nodes.push({
              id: targetId,
              kind: 'file',
              name: path.basename(targetId),
              displayName: path.basename(targetId),
              filePath: targetId,
              language: getLanguageFromPath(targetId),
              line: 1,
            })
            nodeIds.add(targetId)
          }
        } else {
          // External module
          targetId = `external:${moduleSpecifier}`
          resolved = false
        }
      } else {
        // Unresolved import
        targetId = `unresolved:${moduleSpecifier}`
        resolved = false
      }

      const edgeId = `${fileNodeId}--imports--${targetId}`
      edges.push({
        id: edgeId,
        kind: 'imports',
        source: fileNodeId,
        target: targetId,
        resolved,
        line: importDecl.getStartLineNumber(),
        specifier: moduleSpecifier,
      })
    }

    // Extract classes
    const classes = sourceFile.getClasses()
    for (const classDecl of classes) {
      const className = classDecl.getName()
      if (!className) continue

      const classNodeId = `${relativePath}#${className}`
      const isExported = classDecl.isExported()

      nodes.push({
        id: classNodeId,
        kind: 'class',
        name: className,
        displayName: className,
        filePath: relativePath,
        language,
        line: classDecl.getStartLineNumber(),
        endLine: classDecl.getEndLineNumber(),
        exported: isExported,
      })
      nodeIds.add(classNodeId)

      // Check for extends
      const extendsExpr = classDecl.getExtends()
      if (extendsExpr) {
        const parentName = extendsExpr.getText()
        // Try to resolve the parent class
        const parentNodeId = findClassNodeId(sourceFiles, repoPath, sourceFile, parentName, nodeIds)

        edges.push({
          id: `${classNodeId}--extends--${parentNodeId}`,
          kind: 'extends',
          source: classNodeId,
          target: parentNodeId,
          resolved: !parentNodeId.startsWith('unresolved:'),
          line: extendsExpr.getStartLineNumber(),
        })
      }

      // Check for implements
      const implementsExprs = classDecl.getImplements()
      for (const impl of implementsExprs) {
        const interfaceName = impl.getText()
        const interfaceNodeId = findInterfaceNodeId(sourceFiles, repoPath, sourceFile, interfaceName, nodeIds)

        edges.push({
          id: `${classNodeId}--implements--${interfaceNodeId}`,
          kind: 'implements',
          source: classNodeId,
          target: interfaceNodeId,
          resolved: !interfaceNodeId.startsWith('unresolved:'),
          line: impl.getStartLineNumber(),
        })
      }
    }

    // Extract interfaces
    const interfaces = sourceFile.getInterfaces()
    for (const interfaceDecl of interfaces) {
      const interfaceName = interfaceDecl.getName()
      const interfaceNodeId = `${relativePath}#${interfaceName}`
      const isExported = interfaceDecl.isExported()

      if (!nodeIds.has(interfaceNodeId)) {
        nodes.push({
          id: interfaceNodeId,
          kind: 'interface',
          name: interfaceName,
          displayName: interfaceName,
          filePath: relativePath,
          language,
          line: interfaceDecl.getStartLineNumber(),
          endLine: interfaceDecl.getEndLineNumber(),
          exported: isExported,
        })
        nodeIds.add(interfaceNodeId)
      }

      // Check for interface extends
      const extendsExprs = interfaceDecl.getExtends()
      for (const ext of extendsExprs) {
        const parentName = ext.getText()
        const parentNodeId = findInterfaceNodeId(sourceFiles, repoPath, sourceFile, parentName, nodeIds)

        edges.push({
          id: `${interfaceNodeId}--extends--${parentNodeId}`,
          kind: 'extends',
          source: interfaceNodeId,
          target: parentNodeId,
          resolved: !parentNodeId.startsWith('unresolved:'),
          line: ext.getStartLineNumber(),
        })
      }
    }

    // Extract standalone functions (exported)
    const functions = sourceFile.getFunctions()
    for (const funcDecl of functions) {
      const funcName = funcDecl.getName()
      if (!funcName) continue

      const isExported = funcDecl.isExported()
      // Only include exported functions to reduce noise
      if (!isExported) continue

      const funcNodeId = `${relativePath}#${funcName}`
      if (!nodeIds.has(funcNodeId)) {
        nodes.push({
          id: funcNodeId,
          kind: 'function',
          name: funcName,
          displayName: funcName,
          filePath: relativePath,
          language,
          line: funcDecl.getStartLineNumber(),
          endLine: funcDecl.getEndLineNumber(),
          exported: isExported,
        })
        nodeIds.add(funcNodeId)
      }
    }

    // Extract enums
    const enums = sourceFile.getEnums()
    for (const enumDecl of enums) {
      const enumName = enumDecl.getName()
      const enumNodeId = `${relativePath}#${enumName}`
      const isExported = enumDecl.isExported()

      if (!nodeIds.has(enumNodeId)) {
        nodes.push({
          id: enumNodeId,
          kind: 'enum',
          name: enumName,
          displayName: enumName,
          filePath: relativePath,
          language,
          line: enumDecl.getStartLineNumber(),
          endLine: enumDecl.getEndLineNumber(),
          exported: isExported,
        })
        nodeIds.add(enumNodeId)
      }
    }

    // Extract re-exports (export ... from ...)
    const exportDeclarations = sourceFile.getExportDeclarations()
    for (const exportDecl of exportDeclarations) {
      const moduleSpecifier = exportDecl.getModuleSpecifierValue()
      if (!moduleSpecifier) continue

      const resolvedSourceFile = exportDecl.getModuleSpecifierSourceFile()
      let targetId: string
      let resolved = false

      if (resolvedSourceFile) {
        const resolvedPath = resolvedSourceFile.getFilePath()
        if (resolvedPath.startsWith(repoPath) && !resolvedPath.includes('node_modules')) {
          targetId = path.relative(repoPath, resolvedPath)
          resolved = true
        } else {
          targetId = `external:${moduleSpecifier}`
        }
      } else {
        targetId = `unresolved:${moduleSpecifier}`
      }

      edges.push({
        id: `${fileNodeId}--exports--${targetId}`,
        kind: 'exports',
        source: fileNodeId,
        target: targetId,
        resolved,
        line: exportDecl.getStartLineNumber(),
        specifier: moduleSpecifier,
      })
    }
  }

  return {
    nodes,
    edges: deduplicateEdges(edges),
    language: 'typescript',
    rootPath: repoPath,
    parsedAt: new Date().toISOString(),
    parserVersion: PARSER_VERSION,
  }
}

/**
 * Find tsconfig.json in the repository
 */
async function findTsConfig(repoPath: string): Promise<string | undefined> {
  const possiblePaths = [
    path.join(repoPath, 'tsconfig.json'),
    path.join(repoPath, 'tsconfig.app.json'),
    path.join(repoPath, 'tsconfig.build.json'),
  ]

  for (const configPath of possiblePaths) {
    try {
      await fs.access(configPath)
      return configPath
    } catch {
      // File doesn't exist
    }
  }

  return undefined
}

/**
 * Simple glob pattern matching
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  // Convert glob to regex (simplified)
  const regexPattern = pattern
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*')
    .replace(/\?/g, '.')

  const regex = new RegExp(regexPattern)
  return regex.test(filePath)
}

/**
 * Get language from file extension
 */
function getLanguageFromPath(filePath: string): 'typescript' | 'javascript' {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.ts' || ext === '.tsx') {
    return 'typescript'
  }
  return 'javascript'
}

/**
 * Try to find a class node ID by name
 */
function findClassNodeId(
  sourceFiles: SourceFile[],
  repoPath: string,
  currentFile: SourceFile,
  className: string,
  existingNodes: Set<string>
): string {
  // First check if it's already in our nodes
  for (const nodeId of existingNodes) {
    if (nodeId.endsWith(`#${className}`)) {
      return nodeId
    }
  }

  // Try to find in imports
  const imports = currentFile.getImportDeclarations()
  for (const importDecl of imports) {
    const namedImports = importDecl.getNamedImports()
    for (const namedImport of namedImports) {
      if (namedImport.getName() === className) {
        const resolvedFile = importDecl.getModuleSpecifierSourceFile()
        if (resolvedFile) {
          const resolvedPath = resolvedFile.getFilePath()
          if (resolvedPath.startsWith(repoPath)) {
            return `${path.relative(repoPath, resolvedPath)}#${className}`
          }
        }
      }
    }
  }

  return `unresolved:${className}`
}

/**
 * Try to find an interface node ID by name
 */
function findInterfaceNodeId(
  sourceFiles: SourceFile[],
  repoPath: string,
  currentFile: SourceFile,
  interfaceName: string,
  existingNodes: Set<string>
): string {
  // Remove generic parameters if present
  const baseName = interfaceName.replace(/<.*>/, '')

  // First check if it's already in our nodes
  for (const nodeId of existingNodes) {
    if (nodeId.endsWith(`#${baseName}`)) {
      return nodeId
    }
  }

  // Try to find in imports
  const imports = currentFile.getImportDeclarations()
  for (const importDecl of imports) {
    const namedImports = importDecl.getNamedImports()
    for (const namedImport of namedImports) {
      if (namedImport.getName() === baseName) {
        const resolvedFile = importDecl.getModuleSpecifierSourceFile()
        if (resolvedFile) {
          const resolvedPath = resolvedFile.getFilePath()
          if (resolvedPath.startsWith(repoPath)) {
            return `${path.relative(repoPath, resolvedPath)}#${baseName}`
          }
        }
      }
    }
  }

  return `unresolved:${baseName}`
}

/**
 * Remove duplicate edges
 */
function deduplicateEdges(edges: CodeEdge[]): CodeEdge[] {
  const seen = new Set<string>()
  return edges.filter((edge) => {
    const key = `${edge.source}--${edge.kind}--${edge.target}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
