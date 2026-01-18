/**
 * Mailmap Service
 *
 * Pure functions for .mailmap author identity mapping operations.
 * All functions accept a RepositoryContext as the first parameter.
 */

import * as fs from 'fs'
import * as path from 'path'
import { RepositoryContext } from '@/lib/repositories'
import {
  AuthorIdentity,
  MailmapEntry,
  MailmapSuggestion,
  MailmapResult,
} from './mailmap-types'

/**
 * Read current .mailmap file entries
 */
export async function getMailmap(ctx: RepositoryContext): Promise<MailmapEntry[]> {
  if (!ctx.path) return []

  const mailmapPath = path.join(ctx.path, '.mailmap')
  try {
    const content = await fs.promises.readFile(mailmapPath, 'utf-8')
    const entries: MailmapEntry[] = []

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      // Parse .mailmap format:
      // Canonical Name <canonical@email> Alias Name <alias@email>
      // Canonical Name <canonical@email> <alias@email>
      const match = trimmed.match(/^(.+?)\s*<([^>]+)>\s+(?:(.+?)\s+)?<([^>]+)>$/)
      if (match) {
        entries.push({
          canonicalName: match[1].trim(),
          canonicalEmail: match[2].trim(),
          aliasName: match[3]?.trim(),
          aliasEmail: match[4].trim(),
        })
      }
    }

    return entries
  } catch {
    return [] // No .mailmap file
  }
}

/**
 * Get all unique author identities from the repo
 */
export async function getAuthorIdentities(ctx: RepositoryContext): Promise<AuthorIdentity[]> {
  if (!ctx.git) throw new Error('No repository selected')

  try {
    // Get raw identities (without mailmap) to see what needs mapping
    const output = await ctx.git.raw(['shortlog', '-sne', '--all'])

    const identities: AuthorIdentity[] = []
    for (const line of output.trim().split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(.+?)\s+<([^>]+)>$/)
      if (match) {
        identities.push({
          name: match[2].trim(),
          email: match[3].trim(),
          commitCount: parseInt(match[1], 10),
        })
      }
    }

    return identities.sort((a, b) => b.commitCount - a.commitCount)
  } catch {
    return []
  }
}

/**
 * Suggest mailmap entries by detecting potential duplicates
 */
export async function suggestMailmapEntries(ctx: RepositoryContext): Promise<MailmapSuggestion[]> {
  const identities = await getAuthorIdentities(ctx)
  const suggestions: MailmapSuggestion[] = []
  const used = new Set<string>()

  // Helper to normalize for comparison
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[._-]/g, '')
      .replace(/\s+/g, '')

  for (let i = 0; i < identities.length; i++) {
    const primary = identities[i]
    if (used.has(primary.email)) continue

    const aliases: AuthorIdentity[] = []
    let confidence: 'high' | 'medium' | 'low' = 'low'

    for (let j = i + 1; j < identities.length; j++) {
      const candidate = identities[j]
      if (used.has(candidate.email)) continue

      const nameMatch = normalize(primary.name) === normalize(candidate.name)
      const emailPrefixMatch =
        normalize(primary.email.split('@')[0]) === normalize(candidate.email.split('@')[0])
      const partialNameMatch =
        normalize(primary.name).includes(normalize(candidate.name)) ||
        normalize(candidate.name).includes(normalize(primary.name))

      // Exact name match = high confidence
      if (nameMatch) {
        aliases.push(candidate)
        used.add(candidate.email)
        confidence = 'high'
      }
      // Email prefix matches = high confidence
      else if (emailPrefixMatch && primary.email.split('@')[0].length >= 3) {
        aliases.push(candidate)
        used.add(candidate.email)
        confidence = confidence === 'low' ? 'medium' : confidence
      }
      // Partial name overlap = medium confidence
      else if (partialNameMatch && normalize(candidate.name).length >= 3) {
        aliases.push(candidate)
        used.add(candidate.email)
        confidence = confidence === 'low' ? 'medium' : confidence
      }
    }

    if (aliases.length > 0) {
      suggestions.push({
        canonicalName: primary.name,
        canonicalEmail: primary.email,
        aliases,
        confidence,
      })
    }

    used.add(primary.email)
  }

  return suggestions.sort((a, b) => {
    // Sort by confidence, then by total commits
    const confOrder = { high: 0, medium: 1, low: 2 }
    if (confOrder[a.confidence] !== confOrder[b.confidence]) {
      return confOrder[a.confidence] - confOrder[b.confidence]
    }
    const aTotal = a.aliases.reduce((sum, x) => sum + x.commitCount, 0)
    const bTotal = b.aliases.reduce((sum, x) => sum + x.commitCount, 0)
    return bTotal - aTotal
  })
}

/**
 * Add entries to .mailmap file
 */
export async function addMailmapEntries(
  ctx: RepositoryContext,
  entries: MailmapEntry[]
): Promise<MailmapResult> {
  if (!ctx.path) return { success: false, message: 'No repository selected' }

  const mailmapPath = path.join(ctx.path, '.mailmap')

  try {
    // Read existing content
    let content = ''
    try {
      content = await fs.promises.readFile(mailmapPath, 'utf-8')
      if (!content.endsWith('\n')) content += '\n'
    } catch {
      // File doesn't exist, start fresh with header
      content =
        '# .mailmap - Author identity mapping\n# Format: Canonical Name <canonical@email> Alias Name <alias@email>\n\n'
    }

    // Add new entries
    for (const entry of entries) {
      const line = entry.aliasName
        ? `${entry.canonicalName} <${entry.canonicalEmail}> ${entry.aliasName} <${entry.aliasEmail}>`
        : `${entry.canonicalName} <${entry.canonicalEmail}> <${entry.aliasEmail}>`
      content += line + '\n'
    }

    await fs.promises.writeFile(mailmapPath, content, 'utf-8')
    return { success: true, message: `Added ${entries.length} entries to .mailmap` }
  } catch (error) {
    return { success: false, message: `Failed to update .mailmap: ${error}` }
  }
}

/**
 * Remove a specific entry from .mailmap
 */
export async function removeMailmapEntry(
  ctx: RepositoryContext,
  entry: MailmapEntry
): Promise<MailmapResult> {
  if (!ctx.path) return { success: false, message: 'No repository selected' }

  const mailmapPath = path.join(ctx.path, '.mailmap')

  try {
    const content = await fs.promises.readFile(mailmapPath, 'utf-8')
    const lines = content.split('\n')

    // Build the line pattern to remove
    const targetLine = entry.aliasName
      ? `${entry.canonicalName} <${entry.canonicalEmail}> ${entry.aliasName} <${entry.aliasEmail}>`
      : `${entry.canonicalName} <${entry.canonicalEmail}> <${entry.aliasEmail}>`

    // Filter out the matching line (case-sensitive match)
    const newLines = lines.filter((line) => line.trim() !== targetLine.trim())

    if (newLines.length === lines.length) {
      return { success: false, message: 'Entry not found in .mailmap' }
    }

    await fs.promises.writeFile(mailmapPath, newLines.join('\n'), 'utf-8')
    return { success: true, message: 'Removed entry from .mailmap' }
  } catch (error) {
    return { success: false, message: `Failed to update .mailmap: ${error}` }
  }
}
