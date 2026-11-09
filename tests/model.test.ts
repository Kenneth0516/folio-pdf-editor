import { deepEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'
import { dropPages, duplicatePages, historyReducer, initialHistory, movePages, pageRange, type Page } from '../src/model'

const pages: Page[] = ['a1', 'a2', 'b1', 'a3', 'b2'].map((id, index) => ({ id, sourceId: id[0], index, rotation: 0 }))
const ids = (list: Page[]) => list.map(page => page.id)

test('dragging and moving interleaved pages preserve the selected group order', () => {
  const group = new Set(['b1', 'a1'])
  deepEqual(ids(dropPages(pages, group, 'b2', true)), ['a2', 'a3', 'b2', 'a1', 'b1'])
  deepEqual(ids(dropPages(pages, group, 'a3', false)), ['a2', 'a1', 'b1', 'a3', 'b2'])
  equal(dropPages(pages, group, 'b1', false), pages)
  deepEqual(ids(movePages(pages, group, 2)), ['a2', 'a1', 'b1', 'a3', 'b2'])
  deepEqual(ids(movePages(pages, group, 99)), ['a2', 'a3', 'b2', 'a1', 'b1'])
})

test('reverse range selection and duplication use page instance IDs', () => {
  deepEqual(pageRange(pages, 'a3', 'a2'), ['a2', 'b1', 'a3'])
  deepEqual(pageRange(pages, 'removed', 'b2'), ['b2'])
  const copies = duplicatePages(pages, new Set(['a2', 'b2']), new Map([['a2', 'copy-a'], ['b2', 'copy-b']]))
  deepEqual(ids(copies), ['a1', 'a2', 'copy-a', 'b1', 'a3', 'b2', 'copy-b'])
  deepEqual(copies[2], { ...pages[1], id: 'copy-a' })
})

test('multiple undo/redo steps restore snapshots and a new edit clears redo', () => {
  const start = historyReducer(initialHistory, { type: 'edit', apply: state => ({ ...state, pages }) })
  const reversed = historyReducer(start, { type: 'edit', apply: state => ({ ...state, pages: [...pages].reverse() }) })
  const deleted = historyReducer(reversed, { type: 'edit', apply: state => ({ ...state, pages: [] }) })
  const once = historyReducer(deleted, { type: 'undo' })
  const twice = historyReducer(once, { type: 'undo' })
  equal(once.present, reversed.present)
  equal(twice.present, start.present)
  equal(historyReducer(twice, { type: 'redo' }).present, reversed.present)
  const edited = historyReducer(twice, { type: 'edit', apply: state => ({ ...state, pages: pages.slice(1) }) })
  equal(edited.future.length, 0)
  equal(edited.present.sources, start.present.sources)
})
