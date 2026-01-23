/**
 * Ruby AST Parser
 *
 * Parses Ruby files by shelling out to a Ruby script that uses the parser gem.
 * The Ruby script requires the 'parser' gem to be installed.
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
 * Get the path to the Ruby parser script.
 * In development: resources/scripts/ relative to app path
 * In production: process.resourcesPath/scripts/
 */
function getRubyParserScriptPath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return path.join(app.getAppPath(), 'resources', 'scripts', 'ruby-ast-parser.rb')
  }
  return path.join(process.resourcesPath, 'scripts', 'ruby-ast-parser.rb')
}

/**
 * Check if Ruby is available on the system
 */
export async function isRubyAvailable(): Promise<boolean> {
  try {
    await execFileAsync('ruby', ['--version'])
    return true
  } catch {
    return false
  }
}

/**
 * Check if the parser gem is installed (not required for regex-based parsing)
 * @deprecated The Ruby parser now uses regex-based parsing, no gems required
 */
export async function hasParserGem(): Promise<boolean> {
  return true // Always return true since we use regex-based parsing now
}

/**
 * Parse a Ruby codebase by shelling out to the Ruby parser script
 */
export async function parseRubyProject(
  repoPath: string,
  _options: CodeGraphParseOptions = {}
): Promise<CodeGraphSchema> {
  // Check if Ruby is available
  const rubyAvailable = await isRubyAvailable()
  if (!rubyAvailable) {
    throw new Error('Ruby is not available on this system. Please install Ruby to parse Ruby projects.')
  }

  const scriptPath = getRubyParserScriptPath()

  // Check if the parser script exists
  try {
    await fs.access(scriptPath)
  } catch {
    throw new Error(`Ruby parser script not found at: ${scriptPath}`)
  }

  try {
    // Run the Ruby parser script
    const { stdout, stderr } = await execFileAsync('ruby', [scriptPath, repoPath], {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large codebases
      timeout: 120000, // 2 minute timeout
    })

    if (stderr && !stdout) {
      throw new Error(`Ruby parser error: ${stderr}`)
    }

    // Parse the JSON output
    const result = JSON.parse(stdout)

    if (!result.success) {
      throw new Error(result.message || 'Ruby parser failed')
    }

    return {
      nodes: result.nodes || [],
      edges: result.edges || [],
      language: 'ruby',
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
      throw new Error('Failed to parse Ruby parser output as JSON')
    }
    throw error
  }
}
