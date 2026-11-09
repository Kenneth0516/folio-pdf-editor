export interface Source {
  id: string
  file: File
  pageCount: number
  color: number
}

export interface Page {
  id: string
  sourceId: string
  index: number
  rotation: number
}

export interface Workspace {
  sources: Source[]
  pages: Page[]
}

export interface History {
  past: Workspace[]
  present: Workspace
  future: Workspace[]
}

export type HistoryAction =
  | { type: 'edit'; apply: (workspace: Workspace) => Workspace }
  | { type: 'undo' | 'redo' }

export const initialHistory: History = { past: [], present: { sources: [], pages: [] }, future: [] }

export function historyReducer(state: History, action: HistoryAction): History {
  const { past, present, future } = state
  switch (action.type) {
    case 'edit': {
      const next = action.apply(present)
      return next === present ? state : { past: [...past.slice(-59), present], present: next, future: [] }
    }
    case 'undo':
      return past.length ? { past: past.slice(0, -1), present: past.at(-1)!, future: [present, ...future] } : state
    case 'redo':
      return future.length ? { past: [...past, present], present: future[0], future: future.slice(1) } : state
  }
}

export function normalizeRotation(angle: number) {
  return ((angle % 360) + 360) % 360
}

export function duplicatePages(pages: Page[], selected: ReadonlySet<string>, ids: ReadonlyMap<string, string>) {
  return pages.flatMap(page => selected.has(page.id) ? [page, { ...page, id: ids.get(page.id)! }] : [page])
}

/** Position is the one-based position of the first selected page in the result. */
export function movePages(pages: Page[], selected: ReadonlySet<string>, position: number) {
  const group = pages.filter(page => selected.has(page.id))
  if (!group.length || !Number.isFinite(position)) return pages
  const rest = pages.filter(page => !selected.has(page.id))
  const offset = Math.max(0, Math.min(rest.length, Math.trunc(position) - 1))
  const result = [...rest.slice(0, offset), ...group, ...rest.slice(offset)]
  return result.every((page, index) => page === pages[index]) ? pages : result
}

export function dropPages(pages: Page[], selected: ReadonlySet<string>, targetId: string, after: boolean) {
  if (selected.has(targetId)) return pages
  const position = pages.filter(page => !selected.has(page.id)).findIndex(page => page.id === targetId)
  return position < 0 ? pages : movePages(pages, selected, position + (after ? 2 : 1))
}

export function pageRange(pages: Page[], fromId: string | null, toId: string) {
  const end = pages.findIndex(page => page.id === toId)
  if (end < 0) return []
  const start = pages.findIndex(page => page.id === fromId)
  return start < 0 ? [toId] : pages.slice(Math.min(start, end), Math.max(start, end) + 1).map(page => page.id)
}
