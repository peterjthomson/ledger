/**
 * Agent Hint Utilities
 *
 * Functions to extract task hints from AI agent session files.
 * Used by worktree services to display context about what agents are working on.
 */

import * as fs from 'fs'
import * as path from 'path'

/**
 * Get agent task hint from Cursor transcript files
 *
 * Cursor stores transcripts in ~/.cursor/projects/{folder}/agent-transcripts/*.json
 */
export async function getCursorAgentTaskHint(worktreePath: string): Promise<string | null> {
  try {
    const homeDir = process.env.HOME || ''
    const projectsDir = path.join(homeDir, '.cursor', 'projects')

    // Check if the projects directory exists
    if (!fs.existsSync(projectsDir)) return null

    // Get all project folders
    const projectFolders = fs.readdirSync(projectsDir)

    // Look for agent-transcripts in each project folder
    for (const folder of projectFolders) {
      const transcriptsDir = path.join(projectsDir, folder, 'agent-transcripts')
      if (!fs.existsSync(transcriptsDir)) continue

      // Get transcript files sorted by modification time (newest first)
      const files = fs
        .readdirSync(transcriptsDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({
          name: f,
          path: path.join(transcriptsDir, f),
          mtime: fs.statSync(path.join(transcriptsDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime)

      // Check the most recent transcripts for references to this worktree
      for (const file of files.slice(0, 5)) {
        // Only check 5 most recent
        try {
          const content = fs.readFileSync(file.path, 'utf-8')

          // Quick check if this transcript mentions the worktree path
          if (!content.includes(worktreePath)) continue

          // Parse and extract the first user query
          const transcript = JSON.parse(content)
          if (!Array.isArray(transcript)) continue

          for (const message of transcript) {
            if (message.role === 'user' && message.text) {
              // Extract content from <user_query> tags if present
              const match = message.text.match(/<user_query>([\s\S]*?)<\/user_query>/)
              if (match) {
                // Get first line and truncate
                const firstLine = match[1].trim().split('\n')[0]
                return firstLine.slice(0, 60) + (firstLine.length > 60 ? '…' : '')
              }
              // Fallback: just use first line of text
              const firstLine = message.text.trim().split('\n')[0]
              return firstLine.slice(0, 60) + (firstLine.length > 60 ? '…' : '')
            }
          }
        } catch {
          // Skip malformed transcript files
          continue
        }
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Get agent task hint from Claude Code session files
 *
 * Claude Code stores sessions in ~/.claude/projects/{encoded-path}/*.jsonl
 * where encoded-path replaces / with - (e.g., /Users/foo/bar -> -Users-foo-bar)
 */
export async function getClaudeCodeAgentTaskHint(worktreePath: string): Promise<string | null> {
  try {
    const homeDir = process.env.HOME || ''
    const projectsDir = path.join(homeDir, '.claude', 'projects')

    // Check if the projects directory exists
    if (!fs.existsSync(projectsDir)) return null

    // Claude Code encodes paths by replacing / with - (e.g., /Users/foo/bar -> -Users-foo-bar)
    const encodedPath = worktreePath.replace(/\//g, '-')
    const projectFolder = path.join(projectsDir, encodedPath)

    // Check if this worktree has a Claude Code project folder
    if (!fs.existsSync(projectFolder)) return null

    // Get session files sorted by modification time (newest first)
    // Session files are UUIDs.jsonl, skip agent-*.jsonl files
    const files = fs
      .readdirSync(projectFolder)
      .filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))
      .map((f) => ({
        name: f,
        path: path.join(projectFolder, f),
        mtime: fs.statSync(path.join(projectFolder, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime)

    // Check the most recent session file
    for (const file of files.slice(0, 3)) {
      // Only check 3 most recent sessions
      try {
        const content = fs.readFileSync(file.path, 'utf-8')
        const lines = content.split('\n').filter(Boolean)

        // Find the first user message in the session
        for (const line of lines) {
          try {
            const entry = JSON.parse(line)

            // Look for user messages
            if (entry.type === 'user' && entry.message?.content) {
              let userContent = entry.message.content

              // Strip system instruction tags if present
              userContent = userContent.replace(
                /<system[_-]?instruction>[\s\S]*?<\/system[_-]?instruction>/gi,
                ''
              )

              // Get the actual user query, trimming whitespace
              const trimmed = userContent.trim()
              if (!trimmed) continue

              // Get first meaningful line
              const firstLine = trimmed.split('\n')[0].trim()
              if (!firstLine) continue

              return firstLine.slice(0, 60) + (firstLine.length > 60 ? '…' : '')
            }
          } catch {
            // Skip malformed lines
            continue
          }
        }
      } catch {
        // Skip unreadable files
        continue
      }
    }

    return null
  } catch {
    return null
  }
}
