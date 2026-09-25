import type { StagingDiffHunk, StagingFileDiff } from './staging-types'

/** Build a staging diff for an untracked file, matching what `git diff --no-index` would report. */
export function buildUntrackedFileDiff(filePath: string, content: string): StagingFileDiff {
  const endsWithNewline = content.endsWith('\n')
  const fileLines = content.length === 0 ? [] : (endsWithNewline ? content.slice(0, -1) : content).split('\n')
  const header = `@@ -0,0 +1,${fileLines.length} @@`
  const lines = fileLines.map((line, idx) => ({
    type: 'add' as const,
    content: line,
    newLineNumber: idx + 1,
    lineIndex: idx,
    ...(idx === fileLines.length - 1 && !endsWithNewline ? { noNewline: true } : {}),
  }))
  const patchLines = fileLines.map((l) => '+' + l)
  if (fileLines.length > 0 && !endsWithNewline) patchLines.push('\\ No newline at end of file')
  const rawPatch =
    `diff --git a/${filePath} b/${filePath}\n` +
    `new file mode 100644\n` +
    `--- /dev/null\n` +
    `+++ b/${filePath}\n` +
    header +
    '\n' +
    patchLines.map((l) => l + '\n').join('')

  return {
    filePath,
    status: 'untracked',
    isBinary: false,
    additions: fileLines.length,
    deletions: 0,
    hunks:
      fileLines.length === 0
        ? []
        : [{ header, oldStart: 0, oldLines: 0, newStart: 1, newLines: fileLines.length, rawPatch, lines }],
  }
}

/** Parse staging diffs without losing patch metadata needed by line and hunk actions. */
export function parseDiff(diffOutput: string, filePath: string): StagingFileDiff {
  const lines = diffOutput.split('\n')
  const hunks: StagingDiffHunk[] = []
  let currentHunk: StagingDiffHunk | null = null
  let currentHunkRawLines: string[] = []
  let oldLineNum = 0
  let newLineNum = 0
  let additions = 0
  let deletions = 0
  let isBinary = false
  let status: StagingFileDiff['status'] = 'modified'
  let oldPath: string | undefined

  // Extract file header lines for building rawPatch
  let fileHeader = ''
  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++')) {
      fileHeader += line + '\n'
    }
    if (line.startsWith('+++')) break
  }

  let lineIndex = 0

  for (const line of lines) {
    // Check for binary file
    if (line.startsWith('Binary files')) {
      isBinary = true
      continue
    }

    // Check for new file
    if (line.startsWith('new file mode')) {
      status = 'added'
      continue
    }

    // Check for deleted file
    if (line.startsWith('deleted file mode')) {
      status = 'deleted'
      continue
    }

    // Check for rename
    if (line.startsWith('rename from ')) {
      oldPath = line.replace('rename from ', '')
      status = 'renamed'
      continue
    }

    // Parse hunk header
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/)
    if (hunkMatch) {
      // Finalize previous hunk
      if (currentHunk) {
        currentHunk.rawPatch = fileHeader + currentHunkRawLines.join('\n') + '\n'
        hunks.push(currentHunk)
      }

      oldLineNum = parseInt(hunkMatch[1])
      newLineNum = parseInt(hunkMatch[3])
      lineIndex = 0
      currentHunkRawLines = [line]

      currentHunk = {
        header: line,
        oldStart: oldLineNum,
        oldLines: parseInt(hunkMatch[2] || '1'),
        newStart: newLineNum,
        newLines: parseInt(hunkMatch[4] || '1'),
        lines: [],
        rawPatch: '', // Will be set when hunk is finalized
      }
      continue
    }

    // Parse diff lines
    if (currentHunk) {
      if (line === '\\ No newline at end of file') {
        currentHunkRawLines.push(line)
        const previous = currentHunk.lines.at(-1)
        if (previous) previous.noNewline = true
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunkRawLines.push(line)
        additions++
        currentHunk.lines.push({
          type: 'add',
          content: line.slice(1),
          newLineNumber: newLineNum++,
          lineIndex: lineIndex++,
        })
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunkRawLines.push(line)
        deletions++
        currentHunk.lines.push({
          type: 'delete',
          content: line.slice(1),
          oldLineNumber: oldLineNum++,
          lineIndex: lineIndex++,
        })
      } else if (line.startsWith(' ')) {
        currentHunkRawLines.push(line)
        currentHunk.lines.push({
          type: 'context',
          content: line.slice(1),
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
          lineIndex: lineIndex++,
        })
      }
    }
  }

  // Don't forget the last hunk
  if (currentHunk) {
    currentHunk.rawPatch = fileHeader + currentHunkRawLines.join('\n') + '\n'
    hunks.push(currentHunk)
  }

  return {
    filePath,
    oldPath,
    status,
    hunks,
    isBinary,
    additions,
    deletions,
  }
}
