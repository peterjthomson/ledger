import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TextRange } from '../../utils/inline-diff'

const SearchContext = createContext('')

/** Search is scoped to the focused diff panel, including old and new content. */
export function DiffSearch({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [count, setCount] = useState(0)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') return
      const focusedPanel = document.activeElement?.closest('[data-diff-search]')
      const firstVisible = Array.from(document.querySelectorAll<HTMLElement>('[data-diff-search]')).find(
        (el) => el.offsetHeight > 0
      )
      if ((focusedPanel || firstVisible) !== root.current) return
      event.preventDefault()
      setOpen(true)
      requestAnimationFrame(() => {
        input.current?.focus()
        input.current?.select()
      })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const updateMatches = () => {
      const groups = new Map<string, HTMLElement[]>()
      root.current?.querySelectorAll<HTMLElement>('.diff-search-match').forEach((match) => {
        const key = match.dataset.searchMatchId!
        groups.set(key, [...(groups.get(key) || []), match])
      })
      const matches = [...groups.values()]
      setCount(matches.length)
      const index = matches.length ? active % matches.length : 0
      matches.forEach((parts, i) => parts.forEach((part) => part.classList.toggle('active', i === index)))
      matches[index]?.[0].scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    updateMatches()
    const observer = new MutationObserver(updateMatches)
    if (root.current) observer.observe(root.current, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [query, active, open])

  const close = () => {
    setOpen(false)
    setQuery('')
    root.current?.focus()
  }
  const move = (step: number) => setActive((current) => (count ? (current + step + count) % count : 0))
  return (
    <SearchContext.Provider value={open ? query : ''}>
      <div
        ref={root}
        className={className}
        data-diff-search
        tabIndex={-1}
        onMouseDownCapture={(event) => {
          if (!(event.target as HTMLElement).closest('input, button, textarea, select, a'))
            root.current?.focus({ preventScroll: true })
        }}
      >
        {open && (
          <div
            className="diff-search-bar"
            role="search"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                close()
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                move(event.shiftKey ? -1 : 1)
              }
            }}
          >
            <input
              ref={input}
              aria-label="Find in diff"
              placeholder="Find in diff…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
            />
            <span aria-live="polite">{count ? `${(active % count) + 1} of ${count}` : 'No matches'}</span>
            <button type="button" aria-label="Previous match" disabled={!count} onClick={() => move(-1)}>
              ↑
            </button>
            <button type="button" aria-label="Next match" disabled={!count} onClick={() => move(1)}>
              ↓
            </button>
            <button type="button" aria-label="Close find" onClick={close}>
              ×
            </button>
          </div>
        )}
        {children}
      </div>
    </SearchContext.Provider>
  )
}

/** Decorate text nodes, retaining syntax colors and treating code as text. */
export function DiffLineContent({
  content,
  html,
  changes = [],
}: {
  content: string
  html?: string | null
  changes?: TextRange[]
}) {
  const query = useContext(SearchContext)
  const lineId = useId()
  const decorated = useMemo(() => {
    if (!changes.length && !query && html) return html
    const container = document.createElement('span')
    if (html) container.innerHTML = html
    else container.textContent = content
    const matches: TextRange[] = []
    if (query) {
      const text = content.toLowerCase()
      const needle = query.toLowerCase()
      for (let start = text.indexOf(needle); start !== -1; start = text.indexOf(needle, start + needle.length)) {
        matches.push({ start, end: start + needle.length })
      }
    }
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    let offset = 0
    for (const node of nodes) {
      const text = node.textContent || ''
      const end = offset + text.length
      const boundaries = [
        ...new Set([
          offset,
          end,
          ...[...changes, ...matches].flatMap((r) => [r.start, r.end]).filter((n) => n > offset && n < end),
        ]),
      ].sort((a, b) => a - b)
      const fragment = document.createDocumentFragment()
      for (let i = 0; i < boundaries.length - 1; i++) {
        const start = boundaries[i]
        const changed = changes.some((r) => r.start <= start && start < r.end)
        const match = matches.find((r) => r.start <= start && start < r.end)
        const part = document.createElement(match ? 'mark' : 'span')
        part.className = [changed ? 'diff-inline-change' : '', match ? 'diff-search-match' : '']
          .filter(Boolean)
          .join(' ')
        if (match) part.dataset.searchMatchId = `${lineId}-${match.start}`
        part.textContent = text.slice(start - offset, boundaries[i + 1] - offset)
        fragment.append(part)
      }
      node.replaceWith(fragment)
      offset = end
    }
    return container.innerHTML
  }, [content, html, changes, query, lineId])
  return (
    <span
      className={`diff-line-content${html ? ' highlighted' : ''}`}
      dangerouslySetInnerHTML={{ __html: decorated }}
    />
  )
}
