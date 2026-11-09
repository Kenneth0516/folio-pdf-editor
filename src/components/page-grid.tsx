import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, useSensor, useSensors,
  type CollisionDetection,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { Check, GripVertical, Layers2, Maximize2, MoreHorizontal } from 'lucide-react'
import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import type { Page, Source } from '../model'
import { Action } from './controls'
import { PageImage } from './preview'

interface GridProps {
  pages: Page[]
  sources: Map<string, Source>
  selected: ReadonlySet<string>
  zoom: number
  select: (id: string, event: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => void
  replaceSelection: (ids: string[]) => void
  move: (group: ReadonlySet<string>, target: string, after: boolean) => void
  preview: (id: string) => void
  menu: (id: string, x: number, y: number) => void
}

function Tile({ page, index, source, selected, indicator, zoom, select, preview, menu }: {
  page: Page; index: number; source: Source; selected: boolean; indicator?: 'before' | 'after'; zoom: number
  select: GridProps['select']; preview: GridProps['preview']; menu: GridProps['menu']
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useSortable({ id: page.id })
  const openMenu = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    menu(page.id, event.clientX, event.clientY)
  }
  return <article ref={setNodeRef} data-page-id={page.id} data-drop={indicator} data-selected={selected} data-dragging={isDragging}
    className="tile" aria-label={`Output page ${index + 1}, ${source.file.name}, original page ${page.index + 1}`}
    onClick={event => select(page.id, event)} onDoubleClick={() => preview(page.id)} onContextMenu={openMenu}>
    <div className="tile-top">
      <button ref={setActivatorNodeRef} type="button" className="drag-handle" {...attributes} {...listeners}
        aria-label={`Drag page ${index + 1}`} title="Drag to reorder" onClick={event => event.stopPropagation()}>
        <GripVertical size={16} />
      </button>
      <span className="output-index">{index + 1}</span>
      <button type="button" className="page-check" aria-label={`Select page ${index + 1}`} aria-pressed={selected}
        onClick={event => { event.stopPropagation(); select(page.id, { ctrlKey: true, shiftKey: event.shiftKey }) }}>
        {selected && <Check size={13} strokeWidth={3} />}
      </button>
    </div>
    <PageImage source={source} page={page} size={zoom * 2} lazy />
    <div className="tile-meta">
      <span className="source-dot" data-color={source.color} />
      <div className="min-w-0 flex-1"><div className="truncate" title={source.file.name}>{source.file.name}</div><small>Original {page.index + 1}</small></div>
      <Action label={`Preview page ${index + 1}`} icon={Maximize2} iconOnly onClick={event => { event.stopPropagation(); preview(page.id) }} />
      <Action label={`Actions for page ${index + 1}`} icon={MoreHorizontal} iconOnly onClick={event => {
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        menu(page.id, rect.left, rect.bottom)
      }} />
    </div>
  </article>
}

interface Box { left: number; top: number; width: number; height: number }

export function PageGrid(props: GridProps) {
  const { pages, sources, selected, zoom, select, replaceSelection, move, preview, menu } = props
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const group = useRef<ReadonlySet<string>>(new Set())
  const [dragging, setDragging] = useState(0)
  const [drop, setDrop] = useState<{ id: string; after: boolean }>()
  const dropIntent = useRef<{ id: string; after: boolean }>(null)
  const grid = useRef<HTMLDivElement>(null)
  const sweep = useRef<{ x: number; y: number; initial: string[]; pointer: number }>(null)
  const [box, setBox] = useState<Box>()
  const collision: CollisionDetection = args => {
    const candidates = args.droppableContainers.filter(container => !group.current.has(String(container.id)))
    const scoped = { ...args, droppableContainers: candidates }
    const hits = pointerWithin(scoped)
    const pointer = args.pointerCoordinates
    const bounds = grid.current?.parentElement?.getBoundingClientRect()
    if (pointer && bounds && (pointer.x < bounds.left || pointer.x > bounds.right || pointer.y < bounds.top || pointer.y > bounds.bottom)) {
      dropIntent.current = null
      return []
    }
    const result = hits.length ? hits : closestCenter(scoped)
    const target = result[0]
    const rect = target && args.droppableRects.get(target.id)
    if (rect) {
      const id = String(target.id)
      const after = pointer ? pointer.x > rect.left + rect.width / 2
        : pages.findIndex(page => page.id === id) > pages.findIndex(page => page.id === String(args.active.id))
      dropIntent.current = { id, after }
    } else dropIntent.current = null
    return result
  }
  function localPoint(event: PointerEvent<HTMLDivElement>) {
    const rect = grid.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function startSweep(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.pointerType !== 'mouse' || (event.target as HTMLElement).closest('[data-page-id]')) return
    sweep.current = { ...localPoint(event), initial: event.ctrlKey || event.metaKey || event.shiftKey ? [...selected] : [], pointer: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
    replaceSelection(sweep.current.initial)
  }

  function updateSweep(event: PointerEvent<HTMLDivElement>) {
    const start = sweep.current
    if (!start || start.pointer !== event.pointerId) return
    const { x, y } = localPoint(event)
    const next = { left: Math.min(x, start.x), top: Math.min(y, start.y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) }
    if (next.width < 4 && next.height < 4) return
    setBox(next)
    const parent = grid.current!.getBoundingClientRect()
    const ids = [...grid.current!.querySelectorAll<HTMLElement>('[data-page-id]')].filter(tile => {
      const rect = tile.getBoundingClientRect()
      return rect.right > next.left + parent.left && rect.left < next.left + next.width + parent.left
        && rect.bottom > next.top + parent.top && rect.top < next.top + next.height + parent.top
    }).map(tile => tile.dataset.pageId!)
    replaceSelection([...start.initial, ...ids])
  }

  return <DndContext sensors={sensors} collisionDetection={collision} onDragStart={({ active }) => {
    const id = String(active.id)
    group.current = selected.has(id) ? new Set(selected) : new Set([id])
    if (!selected.has(id)) replaceSelection([id])
    setDragging(group.current.size)
  }} onDragMove={() => {
    setDrop(dropIntent.current ?? undefined)
  }} onDragOver={() => {
    setDrop(dropIntent.current ?? undefined)
  }} onDragEnd={() => {
    const intent = dropIntent.current
    if (intent) move(group.current, intent.id, intent.after)
    group.current = new Set()
    setDragging(0)
    setDrop(undefined)
  }} onDragCancel={() => { group.current = new Set(); setDragging(0); setDrop(undefined) }}>
    <SortableContext items={pages.map(page => page.id)} strategy={rectSortingStrategy}>
      <div className="page-grid" ref={grid} style={{ '--tile-size': `${zoom}px` } as CSSProperties}
        onPointerDown={startSweep} onPointerMove={updateSweep} onLostPointerCapture={() => { sweep.current = null; setBox(undefined) }}>
        {pages.map((page, index) => <Tile key={page.id} page={page} source={sources.get(page.sourceId)!} index={index}
          zoom={zoom} selected={selected.has(page.id)} indicator={drop?.id === page.id ? drop.after ? 'after' : 'before' : undefined}
          select={select} preview={preview} menu={menu} />)}
        {box && <div className="sweep" style={box} aria-hidden="true" />}
      </div>
    </SortableContext>
    <DragOverlay dropAnimation={null}>{dragging > 0 && <div className="drag-badge"><Layers2 size={18} /> {dragging} {dragging === 1 ? 'page' : 'pages'}</div>}</DragOverlay>
  </DndContext>
}
