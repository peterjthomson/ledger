export type TextRange = { start: number; end: number }
type Line = { type: string; content: string }

/** Character ranges which differ, with a bounded LCS for long/minified lines. */
export function changedRanges(oldText: string, newText: string): [TextRange[], TextRange[]] {
  const a = Array.from(oldText)
  const b = Array.from(newText)
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  let suffix = 0
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix++
  const left = a.slice(prefix, a.length - suffix)
  const right = b.slice(prefix, b.length - suffix)
  const leftChanged = left.map(() => true)
  const rightChanged = right.map(() => true)
  if (left.length * right.length <= 250000) {
    const width = right.length + 1
    const table = new Uint32Array((left.length + 1) * width)
    for (let i = left.length - 1; i >= 0; i--) {
      for (let j = right.length - 1; j >= 0; j--) {
        table[i * width + j] =
          left[i] === right[j]
            ? 1 + table[(i + 1) * width + j + 1]
            : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) {
        leftChanged[i++] = false
        rightChanged[j++] = false
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++
      else j++
    }
  }
  const ranges = (chars: string[], flags: boolean[]): TextRange[] => {
    let offset = chars.slice(0, prefix).join('').length
    const result: TextRange[] = []
    flags.forEach((changed, index) => {
      const end = offset + chars[prefix + index].length
      if (changed) {
        if (result.at(-1)?.end === offset) result[result.length - 1].end = end
        else result.push({ start: offset, end })
      }
      offset = end
    })
    return result
  }
  return [ranges(a, leftChanged), ranges(b, rightChanged)]
}

/** Pair removed/added lines within each contiguous change block. */
export function inlineChanges(lines: Line[]): Map<number, TextRange[]> {
  const result = new Map<number, TextRange[]>()
  for (let i = 0; i < lines.length;) {
    if (lines[i].type !== 'delete' && lines[i].type !== 'add') {
      i++
      continue
    }
    const removed: number[] = []
    const added: number[] = []
    while (i < lines.length && (lines[i].type === 'delete' || lines[i].type === 'add')) {
      ;(lines[i].type === 'delete' ? removed : added).push(i++)
    }
    for (let j = 0; j < Math.min(removed.length, added.length); j++) {
      const [oldRanges, newRanges] = changedRanges(lines[removed[j]].content, lines[added[j]].content)
      result.set(removed[j], oldRanges)
      result.set(added[j], newRanges)
    }
  }
  return result
}
