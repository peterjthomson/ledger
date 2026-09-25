import type { StagingDiffHunk } from './staging-types'

/** Build a patch against the index (forward) or changed content (reverse).
 * Pair adjacent replacement lines so retained lines keep their original order.
 */
export function buildPartialPatch(
  filePath: string,
  hunk: StagingDiffHunk,
  selectedLineIndices: number[],
  reverse = false
): string {
  const selected = new Set(selectedLineIndices)
  const output: string[] = []
  let oldCount = 0
  let newCount = 0
  const emit = (prefix: string, line: StagingDiffHunk['lines'][number]) => {
    output.push(prefix + line.content)
    if (line.noNewline) output.push('\\ No newline at end of file')
    if (prefix !== '+') oldCount++
    if (prefix !== '-') newCount++
  }
  const emitChange = (line: StagingDiffHunk['lines'][number] | undefined) => {
    if (!line) return
    if (selected.has(line.lineIndex)) {
      emit(line.type === 'add' ? '+' : '-', line)
    } else if (line.type === (reverse ? 'add' : 'delete')) {
      emit(' ', line)
    }
    // Other unselected lines do not exist on the side to which we apply.
  }
  for (let i = 0; i < hunk.lines.length;) {
    const line = hunk.lines[i]
    if (line.type === 'context') {
      emit(' ', line)
      i++
      continue
    }
    const removed: typeof hunk.lines = []
    const added: typeof hunk.lines = []
    while (i < hunk.lines.length && hunk.lines[i].type !== 'context') {
      const change = hunk.lines[i++]
      if (change.type === 'delete') removed.push(change)
      else if (change.type === 'add') added.push(change)
    }
    for (let j = 0; j < Math.max(removed.length, added.length); j++) {
      emitChange(removed[j])
      emitChange(added[j])
    }
  }
  const start = reverse ? hunk.newStart : hunk.oldStart
  const oldStart = oldCount === 0 ? Math.max(0, start - 1) : Math.max(1, start)
  const newStart = newCount === 0 ? Math.max(0, start - 1) : Math.max(1, start)
  return (
    `diff --git ${JSON.stringify(`a/${filePath}`)} ${JSON.stringify(`b/${filePath}`)}\n` +
    `--- ${JSON.stringify(`a/${filePath}`)}\n+++ ${JSON.stringify(`b/${filePath}`)}\n` +
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n${output.join('\n')}\n`
  )
}
