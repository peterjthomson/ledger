/**
 * Code Graph Parser Service
 *
 * Main entry point for parsing codebases into CodeGraphSchema.
 * Auto-detects language and delegates to the appropriate parser.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type {
  CodeGraphSchema,
  CodeGraphLanguage,
  CodeGraphParseOptions,
  CodeGraphParseResult,
  CodeGraphLanguageResult,
} from './codegraph-types'
import { parseTypeScriptProject } from './parsers/typescript-ast-parser'
import { parsePhpProject, isPhpAvailable } from './parsers/php-ast-parser'
import { parseRubyProject, isRubyAvailable } from './parsers/ruby-ast-parser'

/**
 * Detect the primary language of a repository
 */
export async function detectLanguage(repoPath: string): Promise<CodeGraphLanguage> {
  const checks = await Promise.all([
    fileExists(path.join(repoPath, 'tsconfig.json')),
    fileExists(path.join(repoPath, 'package.json')),
    fileExists(path.join(repoPath, 'composer.json')),
    fileExists(path.join(repoPath, 'artisan')), // Laravel
    fileExists(path.join(repoPath, 'Gemfile')),
    fileExists(path.join(repoPath, 'config', 'application.rb')), // Rails
  ])

  const [hasTsConfig, hasPackageJson, hasComposerJson, hasArtisan, hasGemfile, hasRailsConfig] = checks

  // Check for TypeScript/JavaScript first
  if (hasTsConfig) {
    return 'typescript'
  }

  // Check for PHP/Laravel
  if (hasComposerJson || hasArtisan) {
    return 'php'
  }

  // Check for Ruby/Rails
  if (hasGemfile || hasRailsConfig) {
    return 'ruby'
  }

  // Fall back to JavaScript if package.json exists
  if (hasPackageJson) {
    return 'javascript'
  }

  // Count files to determine dominant language
  const counts = await countFilesByExtension(repoPath)

  if (counts.ts + counts.tsx > counts.php && counts.ts + counts.tsx > counts.rb) {
    return 'typescript'
  }
  if (counts.js + counts.jsx > counts.php && counts.js + counts.jsx > counts.rb) {
    return 'javascript'
  }
  if (counts.php > counts.rb) {
    return 'php'
  }
  if (counts.rb > 0) {
    return 'ruby'
  }

  // Default to TypeScript (most common in modern projects)
  return 'typescript'
}

/**
 * Parse a codebase into a CodeGraphSchema
 */
export async function parseCodeGraph(
  repoPath: string,
  options: CodeGraphParseOptions = {}
): Promise<CodeGraphSchema> {
  const language = await detectLanguage(repoPath)

  switch (language) {
    case 'typescript':
    case 'javascript':
      return parseTypeScriptProject(repoPath, options)

    case 'php': {
      const phpAvailable = await isPhpAvailable()
      if (!phpAvailable) {
        throw new Error(
          'PHP is not available on this system. Please install PHP to parse this project, or the project may be a different language.'
        )
      }
      return parsePhpProject(repoPath, options)
    }

    case 'ruby': {
      const rubyAvailable = await isRubyAvailable()
      if (!rubyAvailable) {
        throw new Error(
          'Ruby is not available on this system. Please install Ruby to parse this project, or the project may be a different language.'
        )
      }
      return parseRubyProject(repoPath, options)
    }

    default:
      throw new Error(`Unsupported language: ${language}`)
  }
}

/**
 * Wrapper that returns a result object instead of throwing
 */
export async function parseCodeGraphSafe(
  repoPath: string,
  options: CodeGraphParseOptions = {}
): Promise<CodeGraphParseResult> {
  try {
    const data = await parseCodeGraph(repoPath, options)
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error parsing code graph',
    }
  }
}

/**
 * Wrapper for language detection that returns a result object
 */
export async function detectLanguageSafe(repoPath: string): Promise<CodeGraphLanguageResult> {
  try {
    const data = await detectLanguage(repoPath)
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error detecting language',
    }
  }
}

// Utility functions

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function countFilesByExtension(
  repoPath: string,
  maxDepth = 3
): Promise<{ ts: number; tsx: number; js: number; jsx: number; php: number; rb: number }> {
  const counts = { ts: 0, tsx: 0, js: 0, jsx: 0, php: 0, rb: 0 }

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        // Skip common non-source directories
        if (
          entry.isDirectory() &&
          !['node_modules', 'vendor', '.git', 'dist', 'build', 'coverage'].includes(entry.name)
        ) {
          await walk(path.join(dir, entry.name), depth + 1)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase().slice(1)
          if (ext in counts) {
            counts[ext as keyof typeof counts]++
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  await walk(repoPath, 0)
  return counts
}
