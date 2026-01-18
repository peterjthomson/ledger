/**
 * Analytics Service
 *
 * Pure functions for repository analytics and visualization data.
 * All functions accept a RepositoryContext as the first parameter.
 */

import * as fs from 'fs'
import * as path from 'path'
import { RepositoryContext } from '@/lib/repositories'
import {
  ContributorStats,
  ContributorTimeSeries,
  TechTreeData,
  TechTreeNode,
  TechTreeSizeTier,
  TechTreeBranchType,
  BehindMainResult,
  RepoInfo,
} from './analytics-types'

// ========================================
// Helper Functions
// ========================================

/**
 * Normalize and cluster author identities.
 * Groups commits by the same person using email domain, name similarity, and common patterns.
 */
function clusterAuthors(
  commits: { author: string; email: string; date: Date }[]
): Map<string, { canonicalName: string; canonicalEmail: string; dates: Date[] }> {
  // First pass: group by normalized email (ignoring + suffixes and case)
  const emailGroups = new Map<
    string,
    { names: Map<string, number>; emails: Set<string>; dates: Date[] }
  >()

  for (const { author, email, date } of commits) {
    // Normalize email: lowercase, remove + suffix (user+tag@domain -> user@domain)
    const normalizedEmail = email.toLowerCase().replace(/\+[^@]*@/, '@')

    // Extract email prefix for matching (before @)
    const emailPrefix = normalizedEmail
      .split('@')[0]
      .replace(/[._-]/g, '')
      .toLowerCase()

    // Try to find existing group by email or email prefix
    let groupKey: string | null = null

    // Check exact email match first
    if (emailGroups.has(normalizedEmail)) {
      groupKey = normalizedEmail
    } else {
      // Check if email prefix matches an existing group's prefix
      for (const [key] of emailGroups) {
        const existingPrefix = key
          .split('@')[0]
          .replace(/[._-]/g, '')
          .toLowerCase()
        if (emailPrefix === existingPrefix && emailPrefix.length >= 3) {
          groupKey = key
          break
        }
      }
    }

    if (!groupKey) {
      groupKey = normalizedEmail
      emailGroups.set(groupKey, { names: new Map(), emails: new Set(), dates: [] })
    }

    const group = emailGroups.get(groupKey)!
    group.emails.add(email)
    group.dates.push(date)
    group.names.set(author, (group.names.get(author) || 0) + 1)
  }

  // Second pass: merge groups with similar names (handles different emails, same person)
  const mergedGroups = new Map<
    string,
    { names: Map<string, number>; emails: Set<string>; dates: Date[] }
  >()

  const normalizeNameForComparison = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[._-]/g, ' ') // jp-guiang -> jp guiang
      .replace(/\s+/g, ' ') // normalize spaces
      .trim()
  }

  for (const [key, group] of emailGroups) {
    // Get most common name from this group
    let mostCommonName = ''
    let maxCount = 0
    for (const [name, count] of group.names) {
      if (count > maxCount) {
        maxCount = count
        mostCommonName = name
      }
    }

    const normalizedName = normalizeNameForComparison(mostCommonName)

    // Check if this name matches an existing merged group
    let merged = false
    for (const [, mergedGroup] of mergedGroups) {
      let mergedMostCommonName = ''
      let mergedMaxCount = 0
      for (const [name, count] of mergedGroup.names) {
        if (count > mergedMaxCount) {
          mergedMaxCount = count
          mergedMostCommonName = name
        }
      }

      const mergedNormalizedName = normalizeNameForComparison(mergedMostCommonName)

      // Check name similarity
      if (
        normalizedName === mergedNormalizedName ||
        normalizedName.includes(mergedNormalizedName) ||
        mergedNormalizedName.includes(normalizedName)
      ) {
        // Merge into existing group
        for (const [name, count] of group.names) {
          mergedGroup.names.set(name, (mergedGroup.names.get(name) || 0) + count)
        }
        for (const email of group.emails) {
          mergedGroup.emails.add(email)
        }
        mergedGroup.dates.push(...group.dates)
        merged = true
        break
      }
    }

    if (!merged) {
      mergedGroups.set(key, group)
    }
  }

  // Final pass: create canonical result
  const result = new Map<string, { canonicalName: string; canonicalEmail: string; dates: Date[] }>()

  for (const [key, group] of mergedGroups) {
    // Pick canonical name: prefer title case, most common
    let canonicalName = ''
    let maxCount = 0
    for (const [name, count] of group.names) {
      // Prefer proper cased names over all-lowercase
      const isProperCase = name !== name.toLowerCase()
      const effectiveCount = isProperCase ? count * 1.5 : count
      if (effectiveCount > maxCount) {
        maxCount = effectiveCount
        canonicalName = name
      }
    }

    // Pick canonical email: prefer non-noreply, most common domain
    const emails = Array.from(group.emails)
    const canonicalEmail = emails.find((e) => !e.includes('noreply')) || emails[0]

    result.set(key, {
      canonicalName,
      canonicalEmail,
      dates: group.dates,
    })
  }

  return result
}

/**
 * Determine branch type from branch name prefix
 */
function getBranchType(branchName: string): TechTreeBranchType {
  const lower = branchName.toLowerCase()
  if (lower.startsWith('feature/') || lower.startsWith('feat/')) return 'feature'
  if (lower.startsWith('fix/') || lower.startsWith('bugfix/') || lower.startsWith('hotfix/'))
    return 'fix'
  if (lower.startsWith('chore/') || lower.startsWith('deps/') || lower.startsWith('build/'))
    return 'chore'
  if (lower.startsWith('refactor/')) return 'refactor'
  if (lower.startsWith('docs/') || lower.startsWith('doc/')) return 'docs'
  if (lower.startsWith('test/') || lower.startsWith('tests/')) return 'test'
  if (lower.startsWith('release/') || lower.startsWith('v')) return 'release'
  return 'unknown'
}

/**
 * Extract branch name and PR number from merge commit message
 */
function parseMergeCommitMessage(message: string): { branchName: string; prNumber?: number } {
  // GitHub PR merge: "Merge pull request #123 from owner/branch-name"
  const prMatch = message.match(/Merge pull request #(\d+) from [^/]+\/(.+)/)
  if (prMatch) {
    return { branchName: prMatch[2], prNumber: parseInt(prMatch[1], 10) }
  }

  // Standard git merge: "Merge branch 'branch-name'"
  const branchMatch = message.match(/Merge branch '([^']+)'/)
  if (branchMatch) {
    return { branchName: branchMatch[1] }
  }

  // Alternative format: "Merge branch-name into master"
  const intoMatch = message.match(/Merge (\S+) into/)
  if (intoMatch) {
    return { branchName: intoMatch[1] }
  }

  // Fallback: use first line of message
  return { branchName: message.split('\n')[0].slice(0, 50) }
}

/**
 * Assign size tiers based on percentiles
 */
function assignSizeTiers(nodes: TechTreeNode[]): void {
  if (nodes.length === 0) return

  // Sort by total LOC
  const sorted = [...nodes].sort((a, b) => {
    const aLoc = a.stats.linesAdded + a.stats.linesRemoved
    const bLoc = b.stats.linesAdded + b.stats.linesRemoved
    return aLoc - bLoc
  })

  const n = sorted.length
  sorted.forEach((node, index) => {
    const percentile = index / n
    let tier: TechTreeSizeTier
    if (percentile < 0.1) tier = 'xs'
    else if (percentile < 0.3) tier = 'sm'
    else if (percentile < 0.6) tier = 'md'
    else if (percentile < 0.85) tier = 'lg'
    else tier = 'xl'

    // Find the original node and update its tier
    const originalNode = nodes.find((n) => n.id === node.id)
    if (originalNode) {
      originalNode.sizeTier = tier
    }
  })
}

/**
 * Assign badges based on percentiles
 */
function assignBadges(nodes: TechTreeNode[]): void {
  if (nodes.length === 0) return

  // Sort nodes by different metrics to find percentiles
  const byLoc = [...nodes].sort(
    (a, b) => a.stats.linesAdded + a.stats.linesRemoved - (b.stats.linesAdded + b.stats.linesRemoved)
  )
  const byAdded = [...nodes].sort((a, b) => a.stats.linesAdded - b.stats.linesAdded)
  const byRemoved = [...nodes].sort((a, b) => a.stats.linesRemoved - b.stats.linesRemoved)
  const byFiles = [...nodes].sort((a, b) => a.stats.filesChanged - b.stats.filesChanged)
  const byAge = [...nodes].sort((a, b) => a.stats.daysSinceMerge - b.stats.daysSinceMerge)

  const n = nodes.length

  // Helper to check if node is in top X%
  const isInTopPercentile = (
    sorted: TechTreeNode[],
    node: TechTreeNode,
    topPercent: number
  ): boolean => {
    const idx = sorted.findIndex((n) => n.id === node.id)
    return idx >= n * (1 - topPercent)
  }

  // Helper to check if node is in bottom X%
  const isInBottomPercentile = (
    sorted: TechTreeNode[],
    node: TechTreeNode,
    bottomPercent: number
  ): boolean => {
    const idx = sorted.findIndex((n) => n.id === node.id)
    return idx < n * bottomPercent
  }

  for (const node of nodes) {
    node.badges = {
      massive: isInTopPercentile(byLoc, node, 0.1), // Top 10% by total LOC
      destructive: isInTopPercentile(byRemoved, node, 0.15), // Top 15% by lines removed
      additive: isInTopPercentile(byAdded, node, 0.15), // Top 15% by lines added
      multiFile: isInTopPercentile(byFiles, node, 0.2), // Top 20% by files changed
      surgical: isInBottomPercentile(byLoc, node, 0.1), // Bottom 10% by LOC
      ancient: isInTopPercentile(byAge, node, 0.15), // Top 15% oldest (highest daysSinceMerge)
      fresh: isInBottomPercentile(byAge, node, 0.15), // Bottom 15% newest (lowest daysSinceMerge)
    }
  }
}

// ========================================
// Public Functions
// ========================================

/**
 * Get how many commits the current branch is behind main/master.
 * Returns null if cannot be determined (e.g. no main branch, on main already).
 */
export async function getBehindMainCount(ctx: RepositoryContext): Promise<BehindMainResult | null> {
  if (!ctx.git) throw new Error('No repository selected')

  try {
    const status = await ctx.git.status()
    const currentBranch = status.current

    if (!currentBranch) return null

    // Don't show indicator if we're on main/master
    if (currentBranch === 'main' || currentBranch === 'master') {
      return null
    }

    // Find the base branch (origin/main, origin/master, or local main/master)
    let baseBranch: string | null = null
    const candidates = ['origin/main', 'origin/master', 'main', 'master']

    for (const candidate of candidates) {
      try {
        await ctx.git.raw(['rev-parse', '--verify', candidate])
        baseBranch = candidate
        break
      } catch {
        // Try next candidate
      }
    }

    if (!baseBranch) return null

    // Count commits the current branch is behind main
    // baseBranch..HEAD = commits in HEAD not in baseBranch (ahead)
    // HEAD..baseBranch = commits in baseBranch not in HEAD (behind)
    const behindOutput = await ctx.git.raw(['rev-list', '--count', `HEAD..${baseBranch}`])
    const behind = parseInt(behindOutput.trim()) || 0

    return { behind, baseBranch }
  } catch {
    return null
  }
}

/**
 * Get commit statistics by contributor over time for ridgeline chart.
 */
export async function getContributorStats(
  ctx: RepositoryContext,
  topN: number = 10,
  bucketSize: 'day' | 'week' | 'month' = 'week'
): Promise<ContributorStats> {
  if (!ctx.git) throw new Error('No repository selected')

  try {
    // Get all commits with author and date info
    // Use --use-mailmap to respect .mailmap file for identity normalization
    const format = '%aN|%aE|%ci' // %aN/%aE = mailmap-aware name/email
    const output = await ctx.git.raw(['log', '--use-mailmap', `--format=${format}`, '--all'])

    const lines = output.trim().split('\n').filter(Boolean)

    // Parse commits
    const rawCommits: { author: string; email: string; date: Date }[] = []
    let minDate = new Date()
    let maxDate = new Date(0)

    for (const line of lines) {
      const [author, email, dateStr] = line.split('|')
      const date = new Date(dateStr)

      if (date < minDate) minDate = date
      if (date > maxDate) maxDate = date

      rawCommits.push({ author, email, date })
    }

    // Cluster authors to deduplicate identities
    const authorCommits = clusterAuthors(rawCommits)

    // Sort authors by total commits and take top N
    const sortedAuthors = Array.from(authorCommits.entries())
      .map(([, data]) => ({
        author: data.canonicalName,
        email: data.canonicalEmail,
        totalCommits: data.dates.length,
        dates: data.dates,
      }))
      .sort((a, b) => b.totalCommits - a.totalCommits)
      .slice(0, topN)

    // Create time buckets
    const buckets: Date[] = []
    const current = new Date(minDate)

    // Align to bucket boundaries
    if (bucketSize === 'week') {
      current.setDate(current.getDate() - current.getDay()) // Start of week
    } else if (bucketSize === 'month') {
      current.setDate(1) // Start of month
    }
    current.setHours(0, 0, 0, 0)

    while (current <= maxDate) {
      buckets.push(new Date(current))
      if (bucketSize === 'day') {
        current.setDate(current.getDate() + 1)
      } else if (bucketSize === 'week') {
        current.setDate(current.getDate() + 7)
      } else {
        current.setMonth(current.getMonth() + 1)
      }
    }

    // Helper to find bucket for a date
    const getBucketIndex = (date: Date): number => {
      for (let i = buckets.length - 1; i >= 0; i--) {
        if (date >= buckets[i]) return i
      }
      return 0
    }

    // Build time series for each contributor
    const contributors: ContributorTimeSeries[] = sortedAuthors.map(
      ({ author, email, totalCommits, dates }) => {
        // Count commits per bucket
        const bucketCounts = new Array(buckets.length).fill(0)
        for (const date of dates) {
          const idx = getBucketIndex(date)
          bucketCounts[idx]++
        }

        return {
          author, // Already canonical from clustering
          email,
          totalCommits,
          timeSeries: buckets.map((bucket, i) => ({
            date: bucket.toISOString().split('T')[0],
            count: bucketCounts[i],
          })),
        }
      }
    )

    return {
      contributors,
      startDate: minDate.toISOString().split('T')[0],
      endDate: maxDate.toISOString().split('T')[0],
      bucketSize,
    }
  } catch (error) {
    console.error('Error getting contributor stats:', error)
    return {
      contributors: [],
      startDate: '',
      endDate: '',
      bucketSize,
    }
  }
}

/**
 * Get merged branch tree for tech tree visualization.
 */
export async function getMergedBranchTree(
  ctx: RepositoryContext,
  limit: number = 50
): Promise<TechTreeData> {
  if (!ctx.git) throw new Error('No repository selected')

  // Detect master branch name
  let masterBranch = 'main'
  try {
    const branches = await ctx.git.branch()
    if (branches.all.includes('master')) masterBranch = 'master'
    else if (branches.all.includes('main')) masterBranch = 'main'
  } catch {
    // Default to main
  }

  try {
    // Get merge commits on the main branch
    // Format: hash|author_date|author_name|subject
    const format = '%H|%ai|%an|%s'
    const output = await ctx.git.raw([
      'log',
      masterBranch,
      '--first-parent',
      '--merges',
      `--format=${format}`,
      '-n',
      limit.toString(),
    ])

    const lines = output.trim().split('\n').filter(Boolean)
    const nodes: TechTreeNode[] = []
    const now = Date.now()

    for (const line of lines) {
      const [mergeCommitHash, dateStr, author, message] = line.split('|')
      if (!mergeCommitHash || !message) continue

      const { branchName, prNumber } = parseMergeCommitMessage(message)

      // Get diff stats for this merge commit
      let linesAdded = 0
      let linesRemoved = 0
      let filesChanged = 0
      let filesAdded = 0
      let filesRemoved = 0
      const commitCount = 1

      try {
        // Get stat info for the merge commit
        const statOutput = await ctx.git.raw(['show', '--stat', '--format=', mergeCommitHash])
        const statLines = statOutput.trim().split('\n')
        const summaryLine = statLines[statLines.length - 1]

        // Parse: "3 files changed, 10 insertions(+), 5 deletions(-)"
        const filesMatch = summaryLine.match(/(\d+) files? changed/)
        const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/)
        const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/)

        filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0
        linesAdded = addMatch ? parseInt(addMatch[1]) : 0
        linesRemoved = delMatch ? parseInt(delMatch[1]) : 0

        // Count new/deleted files from the stat output
        for (const sl of statLines) {
          if (sl.includes('(new)') || sl.includes('create mode')) filesAdded++
          if (sl.includes('(gone)') || sl.includes('delete mode')) filesRemoved++
        }
      } catch {
        // Ignore stat errors
      }

      // Calculate days since merge
      const mergeDate = new Date(dateStr)
      const daysSinceMerge = Math.floor((now - mergeDate.getTime()) / (1000 * 60 * 60 * 24))

      nodes.push({
        id: mergeCommitHash.slice(0, 8),
        branchName,
        commitHash: mergeCommitHash,
        mergeCommitHash,
        author,
        mergeDate: dateStr,
        message,
        prNumber,
        stats: {
          linesAdded,
          linesRemoved,
          filesChanged,
          filesAdded,
          filesRemoved,
          commitCount,
          daysSinceMerge,
        },
        sizeTier: 'md', // Will be assigned by assignSizeTiers
        branchType: getBranchType(branchName),
        badges: {
          massive: false,
          destructive: false,
          additive: false,
          multiFile: false,
          surgical: false,
          ancient: false,
          fresh: false,
        },
      })
    }

    // Compute percentile-based tiers and badges
    assignSizeTiers(nodes)
    assignBadges(nodes)

    // Calculate global stats
    const allLoc = nodes.map((n) => n.stats.linesAdded + n.stats.linesRemoved)
    const allFiles = nodes.map((n) => n.stats.filesChanged)
    const allAge = nodes.map((n) => n.stats.daysSinceMerge)

    return {
      masterBranch,
      nodes,
      stats: {
        minLoc: Math.min(...allLoc, 0),
        maxLoc: Math.max(...allLoc, 1),
        minFiles: Math.min(...allFiles, 0),
        maxFiles: Math.max(...allFiles, 1),
        minAge: Math.min(...allAge, 0),
        maxAge: Math.max(...allAge, 1),
      },
    }
  } catch {
    return {
      masterBranch,
      nodes: [],
      stats: { minLoc: 0, maxLoc: 1, minFiles: 0, maxFiles: 1, minAge: 0, maxAge: 1 },
    }
  }
}

/**
 * Get sibling repositories from the parent directory of the current repo.
 * Filters out worktrees (which have a .git file instead of directory).
 */
export async function getSiblingRepos(ctx: RepositoryContext): Promise<RepoInfo[]> {
  if (!ctx.path) return []

  const parentDir = path.dirname(ctx.path)
  const repos: RepoInfo[] = []

  try {
    const entries = await fs.promises.readdir(parentDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const entryPath = path.join(parentDir, entry.name)
      const gitPath = path.join(entryPath, '.git')

      try {
        const gitStat = await fs.promises.stat(gitPath)
        // Only include if .git is a directory (real repo, not a worktree)
        if (gitStat.isDirectory()) {
          repos.push({
            path: entryPath,
            name: entry.name,
            isCurrent: entryPath === ctx.path,
          })
        }
      } catch {
        // No .git or can't access - skip
      }
    }

    // Sort alphabetically by name
    repos.sort((a, b) => a.name.localeCompare(b.name))

    return repos
  } catch (error) {
    console.error('Error scanning sibling repos:', error)
    return []
  }
}
