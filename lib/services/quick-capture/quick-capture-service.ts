/**
 * Quick Capture Service
 *
 * Handles screenshot capture and quick issue creation from the menu bar widget.
 */

import { desktopCapturer, screen } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import type {
  QuickIssue,
  QuickIssueResult,
  ScreenshotResult,
  QuickCaptureSettings,
  QuickCaptureRepo,
} from './quick-capture-types'
import { DEFAULT_QUICK_CAPTURE_SETTINGS } from './quick-capture-types'

const execAsync = promisify(exec)

// Settings storage (in-memory, persisted via settings service)
let settings: QuickCaptureSettings = { ...DEFAULT_QUICK_CAPTURE_SETTINGS }

/**
 * Capture a screenshot of the primary display
 */
export async function captureScreenshot(): Promise<ScreenshotResult> {
  try {
    // Get primary display size
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    // Capture all screens
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    })

    if (sources.length === 0) {
      return { success: false, message: 'No screens available to capture' }
    }

    // Use first source (primary display)
    const primarySource = sources[0]
    const thumbnail = primarySource.thumbnail

    // Convert to base64 PNG
    const pngBuffer = thumbnail.toPNG()
    const base64 = pngBuffer.toString('base64')

    return {
      success: true,
      data: `data:image/png;base64,${base64}`,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Screenshot capture failed',
    }
  }
}

/**
 * Upload screenshot to a temporary location and return URL
 * For GitHub issues, we save to temp and let gh CLI handle the upload
 */
async function saveScreenshotToTemp(base64Data: string): Promise<string> {
  // Create temp directory for screenshots
  const tempDir = join(tmpdir(), 'ledger-screenshots')
  await mkdir(tempDir, { recursive: true })

  // Generate unique filename
  const filename = `screenshot-${Date.now()}.png`
  const filepath = join(tempDir, filename)

  // Remove data URL prefix if present
  const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '')

  // Write file
  await writeFile(filepath, Buffer.from(base64Clean, 'base64'))

  return filepath
}

/**
 * Create an issue using the Quick Capture data
 */
export async function createQuickIssue(issue: QuickIssue): Promise<QuickIssueResult> {
  try {
    // Parse description into title and body
    const lines = issue.description.trim().split('\n')
    const title = lines[0].slice(0, 100).trim() // First line as title (max 100 chars)

    if (!title) {
      return { success: false, message: 'Issue title is required' }
    }

    let body = lines.slice(1).join('\n').trim()

    // Handle screenshot
    let screenshotPath: string | null = null
    if (issue.screenshot) {
      try {
        screenshotPath = await saveScreenshotToTemp(issue.screenshot)
        // Add screenshot reference to body - gh CLI will upload it
        body += `\n\n### Screenshot\n![Screenshot](${screenshotPath})`
      } catch {
        // Continue without screenshot if upload fails
        console.warn('[QuickCapture] Screenshot save failed, continuing without it')
      }
    }

    // Add footer
    body += `\n\n---\n_Created via Ledger Quick Capture_`

    // Build gh command
    const args: string[] = ['issue', 'create', '--title', title, '--body', body]

    // Add labels
    if (issue.labels?.length) {
      issue.labels.forEach((label) => {
        args.push('--label', label)
      })
    }

    // Add priority as label if specified
    if (issue.priority) {
      args.push('--label', issue.priority)
    }

    // Execute gh CLI
    const { stdout } = await execAsync(`gh ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`, {
      cwd: issue.repoPath,
    })

    // Parse the URL from stdout (gh outputs the issue URL)
    const url = stdout.trim()
    const numberMatch = url.match(/\/issues\/(\d+)/)
    const number = numberMatch ? parseInt(numberMatch[1], 10) : undefined

    // Clean up temp screenshot
    if (screenshotPath) {
      try {
        await unlink(screenshotPath)
      } catch {
        // Ignore cleanup errors
      }
    }

    return {
      success: true,
      number,
      url,
      message: `Issue #${number} created`,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create issue',
    }
  }
}

/**
 * Get quick capture settings
 */
export function getQuickCaptureSettings(): QuickCaptureSettings {
  return { ...settings }
}

/**
 * Update quick capture settings
 */
export function setQuickCaptureSettings(newSettings: Partial<QuickCaptureSettings>): void {
  settings = { ...settings, ...newSettings }
}

/**
 * Get recent repositories for the quick capture dropdown
 */
export async function getRecentRepos(): Promise<QuickCaptureRepo[]> {
  // This would typically come from the repository manager
  // For now, return an empty array - will be wired up when integrated
  return []
}

/**
 * Get repository labels for quick selection
 */
export async function getQuickLabels(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('gh label list --json name --limit 20', {
      cwd: repoPath,
    })

    const labels = JSON.parse(stdout) as Array<{ name: string }>

    // Return common labels that might be useful for quick capture
    const commonLabels = ['bug', 'enhancement', 'question', 'documentation', 'help wanted']
    const repoLabels = labels.map((l) => l.name)

    // Prioritize common labels that exist in the repo
    return [...commonLabels.filter((l) => repoLabels.includes(l)), ...repoLabels.filter((l) => !commonLabels.includes(l))].slice(
      0,
      10
    )
  } catch {
    return ['bug', 'enhancement', 'question']
  }
}

/**
 * Get priority labels available in the repo
 */
export async function getPriorityLabels(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('gh label list --json name --limit 50', {
      cwd: repoPath,
    })

    const labels = JSON.parse(stdout) as Array<{ name: string }>
    const labelNames = labels.map((l) => l.name.toLowerCase())

    // Look for priority patterns
    const priorities: string[] = []

    // P1-P4 style
    for (let i = 1; i <= 4; i++) {
      const p = `P${i}`
      if (labelNames.includes(p.toLowerCase())) {
        priorities.push(labels.find((l) => l.name.toLowerCase() === p.toLowerCase())?.name || p)
      }
    }

    // Priority: style
    const priorityLabels = labels.filter((l) => l.name.toLowerCase().startsWith('priority'))
    priorities.push(...priorityLabels.map((l) => l.name))

    // Urgent/high/medium/low
    const urgencyLabels = ['urgent', 'critical', 'high', 'medium', 'low']
    for (const u of urgencyLabels) {
      const match = labels.find((l) => l.name.toLowerCase() === u)
      if (match) {
        priorities.push(match.name)
      }
    }

    return priorities.slice(0, 5)
  } catch {
    return []
  }
}
