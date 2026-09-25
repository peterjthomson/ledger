import type { StagingDiffHunk, StagingFileDiff } from './staging-types'

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
