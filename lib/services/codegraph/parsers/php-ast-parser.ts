/**
 * PHP AST Parser
 *
 * Parses PHP files by shelling out to a PHP script that uses nikic/php-parser.
 * The PHP script must be run in an environment where php-parser is available.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs/promises'
import { app } from 'electron'
import type { CodeGraphSchema, CodeGraphParseOptions } from '../codegraph-types'

const execFileAsync = promisify(execFile)
const PARSER_VERSION = '1.0.0'

/**
 * Get the path to the PHP parser script.
 * In development: resources/scripts/ relative to app path
 * In production: process.resourcesPath/scripts/
 */
function getPhpParserScriptPath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return path.join(app.getAppPath(), 'resources', 'scripts', 'php-ast-parser.php')
  }
  return path.join(process.resourcesPath, 'scripts', 'php-ast-parser.php')
}

/**
 * Check if PHP is available on the system
 */
export async function isPhpAvailable(): Promise<boolean> {
  try {
    await execFileAsync('php', ['--version'])
    return true
  } catch {
    return false
  }
}

/**
 * Parse a PHP codebase by shelling out to the PHP parser script
 */
export async function parsePhpProject(
  repoPath: string,
  _options: CodeGraphParseOptions = {}
): Promise<CodeGraphSchema> {
  // Check if PHP is available
  const phpAvailable = await isPhpAvailable()
  if (!phpAvailable) {
    throw new Error('PHP is not available on this system. Please install PHP to parse PHP projects.')
  }

  const scriptPath = getPhpParserScriptPath()

  // Check if the parser script exists
  try {
    await fs.access(scriptPath)
  } catch {
    throw new Error(`PHP parser script not found at: ${scriptPath}`)
  }

  try {
    // Run the PHP parser script
    const { stdout, stderr } = await execFileAsync('php', [scriptPath, repoPath], {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large codebases
      timeout: 120000, // 2 minute timeout
    })

    if (stderr && !stdout) {
      throw new Error(`PHP parser error: ${stderr}`)
    }

    // Parse the JSON output
    const result = JSON.parse(stdout)

    if (!result.success) {
      throw new Error(result.message || 'PHP parser failed')
    }

    return {
      nodes: result.nodes || [],
      edges: result.edges || [],
      language: 'php',
      rootPath: repoPath,
      parsedAt: result.parsedAt || new Date().toISOString(),
      parserVersion: result.parserVersion || PARSER_VERSION,
    }
  } catch (error) {
    // execFile throws when the script exits with non-zero code
    // Try to extract the JSON error message from stdout
    if (error && typeof error === 'object' && 'stdout' in error) {
      const execError = error as { stdout?: string; stderr?: string; message?: string }
      if (execError.stdout) {
        try {
          const result = JSON.parse(execError.stdout)
          if (result.message) {
            throw new Error(result.message)
          }
        } catch {
          // Couldn't parse JSON, fall through
        }
      }
    }

    if (error instanceof SyntaxError) {
      throw new Error('Failed to parse PHP parser output as JSON')
    }
    throw error
  }
}

/**
 * Check if nikic/php-parser is installed in the target directory
 * (for Laravel/Composer projects that might have it)
 */
export async function hasPhpParser(repoPath: string): Promise<boolean> {
  const composerLock = path.join(repoPath, 'composer.lock')

  try {
    const content = await fs.readFile(composerLock, 'utf-8')
    return content.includes('nikic/php-parser')
  } catch {
    return false
  }
}
