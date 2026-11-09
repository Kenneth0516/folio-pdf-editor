import {
  ArrowDownToLine, ArrowRight, CircleAlert, FilePlus2, Files, LayoutGrid, LoaderCircle, LockKeyhole, Moon, PanelLeftOpen,
  PanelRightOpen, Plus, Redo2, RotateCw, Scan, SquareDashed, Sun, Trash2, Undo2, X,
} from 'lucide-react'
import { useEffect, useMemo, useReducer, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { Action, Dialog } from './components/controls'
import { PageGrid } from './components/page-grid'
import { pageActions, SettingsPanel, SourcesPanel, type PageCommand } from './components/panels'
import { Preview } from './components/preview'
import { dropPages, duplicatePages, historyReducer, initialHistory, movePages, normalizeRotation, pageRange, type Page, type Source } from './model'
import type { ExportRequest, ExportResponse } from './pdf/export-worker'
import type { ExportSettings } from './pdf/export'
import { closeSource, importPdf } from './pdf/previews'

const rotations = { clockwise: 90, counterclockwise: -90, flip: 180 }
const narrow = () => matchMedia('(max-width: 850px)').matches

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, initialHistory)
  const { sources, pages } = history.present
  const sourceById = useMemo(() => new Map(sources.map(source => [source.id, source])), [sources])
  const [selection, setSelection] = useState<string[]>([])
  const selected = useMemo(() => {
    const wanted = new Set(selection)
    return new Set(pages.filter(page => wanted.has(page.id)).map(page => page.id))
  }, [pages, selection])
  const anchor = useRef<string>(null)
  const [settings, setSettings] = useState<ExportSettings>({ paper: 'a4', orientation: 'auto' })
  const [showSources, setShowSources] = useState(() => !narrow())
  const [showSettings, setShowSettings] = useState(() => !narrow())
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const [zoom, setZoom] = useState(174)
  const [view, setView] = useState<'grid' | 'preview'>('grid')
  const [activePage, setActivePage] = useState<string>()
  const [dialog, setDialog] = useState<'move' | 'export' | 'preview'>()
  const [menu, setMenu] = useState<{ x: number; y: number }>()
  const [errors, setErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const importLock = useRef(false)
  const [isDropping, setDropping] = useState(false)
  const dragDepth = useRef(0)
  const [filename, setFilename] = useState('merged.pdf')
  const [movePosition, setMovePosition] = useState('1')
  const [jump, setJump] = useState('')
  const [progress, setProgress] = useState<string>()
  const [status, setStatus] = useState('')
  const workerRef = useRef<Worker>(null)
  const input = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const sourceCounter = useRef(0)
  const previouslyOpen = useRef(new Set<string>())
  const previewIndex = Math.max(0, pages.findIndex(page => page.id === activePage))

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light' }, [dark])
  useEffect(() => {
    const current = new Set(sources.map(source => source.id))
    for (const id of previouslyOpen.current) if (!current.has(id)) closeSource(id)
    previouslyOpen.current = current
  }, [sources])
  useEffect(() => () => {
    for (const id of previouslyOpen.current) closeSource(id)
    workerRef.current?.terminate()
  }, [])
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(undefined)
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close() } }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('resize', close)
    }
  }, [menu])

  function editPages(transform: (pages: Page[]) => Page[]) {
    dispatch({ type: 'edit', apply: workspace => {
      const next = transform(workspace.pages)
      return next === workspace.pages ? workspace : { ...workspace, pages: next }
    } })
  }

  async function addFiles(files: File[]) {
    if (importLock.current || !files.length) return
    importLock.current = true
    setImporting(true)
    setStatus('')
    const added: Awaited<ReturnType<typeof importPdf>>[] = []
    const failures: string[] = []
    for (const file of files) {
      try { added.push(await importPdf(file, sourceCounter.current++ % 6)) }
      catch (error) { failures.push(`${file.name}: ${error instanceof Error ? error.message : 'Unable to read this PDF.'}`) }
    }
    if (added.length) {
      dispatch({ type: 'edit', apply: workspace => ({
        sources: [...workspace.sources, ...added.map(item => item.source)],
        pages: [...workspace.pages, ...added.flatMap(item => item.pages)],
      }) })
      setStatus(`${added.length} ${added.length === 1 ? 'PDF' : 'PDFs'} added`)
      scroller.current?.focus()
    }
    setErrors(failures)
    importLock.current = false
    setImporting(false)
  }

  function removeSource(source: Source) {
    dispatch({ type: 'edit', apply: workspace => ({
      sources: workspace.sources.filter(item => item.id !== source.id),
      pages: workspace.pages.filter(page => page.sourceId !== source.id),
    }) })
    setSelection(selection.filter(id => pages.some(page => page.id === id && page.sourceId !== source.id)))
    setStatus(`${source.file.name} removed. Use Undo to restore it.`)
  }

  function select(id: string, event: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) {
    const toggle = event.ctrlKey || event.metaKey
    if (event.shiftKey) {
      const range = pageRange(pages, anchor.current, id)
      setSelection(toggle ? [...new Set([...selected, ...range])] : range)
    } else {
      setSelection(toggle ? selected.has(id) ? [...selected].filter(item => item !== id) : [...selected, id] : [id])
      anchor.current = id
    }
    setActivePage(id)
  }

  function command(action: PageCommand) {
    setMenu(undefined)
    if (action === 'all') { setSelection(pages.map(page => page.id)); return }
    if (action === 'clear') { setSelection([]); anchor.current = null; return }
    if (!selected.size) return
    if (action === 'move') { setMovePosition('1'); setDialog('move'); return }
    if (action === 'delete') {
      editPages(list => list.filter(page => !selected.has(page.id)))
      setSelection([])
      setStatus(`${selected.size} ${selected.size === 1 ? 'page' : 'pages'} deleted`)
    } else if (action === 'duplicate') {
      const ids = new Map([...selected].map(id => [id, crypto.randomUUID()]))
      editPages(list => duplicatePages(list, selected, ids))
      setSelection([...ids.values()])
    } else {
      editPages(list => list.map(page => selected.has(page.id) ? { ...page, rotation: normalizeRotation(page.rotation + rotations[action]) } : page))
    }
  }

  function historyStep(type: 'undo' | 'redo') {
    dispatch({ type })
    setMenu(undefined)
    setStatus('')
  }

  function shortcuts(event: KeyboardEvent) {
    if (dialog || event.defaultPrevented || (event.target as HTMLElement).closest('input,select,textarea,[contenteditable]')) return
    const key = event.key.toLowerCase()
    const ctrl = event.ctrlKey || event.metaKey
    if (ctrl && key === 'a' && pages.length) { event.preventDefault(); command('all') }
    if (ctrl && (key === 'z' || key === 'y') && (history.past.length || history.future.length)) {
      event.preventDefault()
      historyStep(key === 'y' || event.shiftKey ? 'redo' : 'undo')
    }
    if (key === 'delete' && selected.size) { event.preventDefault(); command('delete') }
    if (key === 'escape') command('clear')
  }

  function fileDrag(event: DragEvent, direction: 1 | -1) {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current + direction)
    setDropping(dragDepth.current > 0)
  }

  function goToPage(position: number) {
    const page = pages[position - 1]
    if (!page) return
    setActivePage(page.id)
    if (view === 'grid') {
      select(page.id, {})
      scroller.current?.querySelector(`[data-page-id="${page.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      scroller.current?.focus({ preventScroll: true })
    }
    setJump('')
  }

  function finishExport() {
    workerRef.current?.terminate()
    workerRef.current = null
    setProgress(undefined)
  }

  function download() {
    if (!pages.length || workerRef.current) return
    const name = filename.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'merged.pdf'
    const outputName = /\.pdf$/i.test(name) ? name : `${name}.pdf`
    setErrors([])
    setProgress('Preparing pages…')
    setStatus('')
    try {
      const worker = new Worker(new URL('./pdf/export-worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      const fail = (message: string) => {
        if (workerRef.current !== worker) return
        finishExport()
        setErrors([`Export failed. ${message}`])
        setDialog(undefined)
      }
      worker.onmessage = ({ data }: MessageEvent<ExportResponse>) => {
        if (workerRef.current !== worker) return
        if (data.type === 'progress') {
          setProgress(data.done === data.total ? 'Writing PDF…' : `Processing ${data.done} / ${data.total} pages…`)
        } else if (data.type === 'error') {
          fail(data.message)
        } else {
          const url = URL.createObjectURL(new Blob([data.bytes], { type: 'application/pdf' }))
          const link = document.createElement('a')
          link.href = url
          link.download = outputName
          document.body.append(link)
          link.click()
          link.remove()
          window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
          finishExport()
          setDialog(undefined)
          setStatus(`Download started for ${outputName}`)
        }
      }
      worker.onerror = () => fail('The browser stopped the export worker. Try closing unused tabs or exporting a smaller document.')
      worker.onmessageerror = () => fail('The browser could not read the export result. Try again.')
      worker.postMessage({ pages, sources, settings } satisfies ExportRequest)
    } catch {
      finishExport()
      setDialog(undefined)
      setErrors(['Export failed. The browser could not start PDF processing.'])
    }
  }

  const add = () => input.current?.click()
  const showExport = () => setDialog('export')
  const closeDialog = () => { if (workerRef.current) finishExport(); setDialog(undefined) }
  const maxPosition = Math.max(1, pages.length - selected.size + 1)
  const showPreview = (id: string) => { setActivePage(id); setDialog('preview') }

  return <div className="app" onKeyDown={shortcuts} onDragEnter={event => fileDrag(event, 1)} onDragLeave={event => fileDrag(event, -1)}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }}
    onDrop={event => { if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault(); dragDepth.current = 0; setDropping(false); void addFiles([...event.dataTransfer.files])
    } }}>
    <input type="file" ref={input} hidden multiple accept="application/pdf,.pdf" aria-label="Choose PDF files" onChange={event => {
      void addFiles([...event.target.files ?? []]); event.target.value = ''
    }} />
    <header className="topbar">
      <div className="brand"><span className="logo"><Files size={21} strokeWidth={2.1} /></span><div><strong>Folio</strong><small>PDF WORKSPACE</small></div></div>
      <div className="toolbar" role="group" aria-label="Document toolbar">
        <Action label="Add PDF" icon={Plus} tone="secondary" disabled={importing} onClick={add} />
        <span className="divider" />
        <Action label="Undo" icon={Undo2} iconOnly disabled={!history.past.length} onClick={() => historyStep('undo')} />
        <Action label="Redo" icon={Redo2} iconOnly disabled={!history.future.length} onClick={() => historyStep('redo')} />
        <span className="divider" />
        <Action label="Select all pages" icon={SquareDashed} iconOnly disabled={!pages.length} onClick={() => command('all')} />
        <Action label="Rotate selected pages" icon={RotateCw} iconOnly disabled={!selected.size} onClick={() => command('clockwise')} />
        <Action label="Delete selected pages" icon={Trash2} iconOnly disabled={!selected.size} onClick={() => command('delete')} />
      </div>
      <div className="top-right">
        <Action icon={dark ? Sun : Moon} label={dark ? 'Use light theme' : 'Use dark theme'} iconOnly onClick={() => setDark(!dark)} />
        <Action label="Download PDF" icon={ArrowDownToLine} tone="primary" disabled={!pages.length} onClick={showExport} />
      </div>
    </header>

    {errors.length > 0 && <div className="error-banner" role="alert"><CircleAlert size={18} /><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
      <Action label="Dismiss errors" icon={X} iconOnly onClick={() => setErrors([])} /></div>}

    <div className="layout" data-left={showSources} data-right={showSettings}>
      {showSources && <SourcesPanel sources={sources} add={add} remove={removeSource} close={() => setShowSources(false)} busy={importing} />}
      <main className="workspace">
        <header className="workspace-head">
          <div className="workspace-title">
            {!showSources && <Action icon={PanelLeftOpen} label="Show source files" iconOnly onClick={() => { setShowSources(true); if (narrow()) setShowSettings(false) }} />}
            <div><h1>Pages</h1><p>{pages.length} {pages.length === 1 ? 'page' : 'pages'} <span>·</span> {selected.size} selected</p></div>
          </div>
          <div className="workspace-tools">
            <div className="view-toggle" role="group" aria-label="Workspace view">
              <Action icon={LayoutGrid} label="Grid" aria-pressed={view === 'grid'} onClick={() => setView('grid')} />
              <Action icon={Scan} label="Preview" aria-pressed={view === 'preview'} disabled={!pages.length} onClick={() => setView('preview')} />
            </div>
            {!showSettings && <Action icon={PanelRightOpen} label="Show settings" iconOnly onClick={() => { setShowSettings(true); if (narrow()) setShowSources(false) }} />}
          </div>
        </header>
        {pages.length > 0 && <div className="workspace-options">
          <p>{view === 'grid' ? 'Drag a handle to reorder. Double-click a page to preview.' : 'Browse pages in export order.'}</p>
          <div className="inline-group">
            {view === 'grid' && <label className="zoom-field">Thumbnail size<input type="range" min={142} max={288} step={2} value={zoom} onChange={event => setZoom(+event.target.value)} /></label>}
            <form className="jump-form" onSubmit={event => { event.preventDefault(); goToPage(+jump) }}>
              <input type="number" min={1} max={pages.length} aria-label="Go to page number" placeholder="Page #" value={jump} onChange={event => setJump(event.target.value)} required />
              <Action icon={ArrowRight} label="Go to page" iconOnly type="submit" />
            </form>
          </div>
        </div>}
        <div className="workspace-scroll" ref={scroller} tabIndex={0} aria-label="Page workspace">
          {!pages.length ? <div className="empty-wrap"><div className="empty">
            <div className="empty-art"><div /><div /><span><FilePlus2 size={33} strokeWidth={1.45} /></span></div>
            <span className="empty-kicker">YOUR PDF WORKBENCH</span>
            <h2>{sources.length ? 'No pages in the workspace' : 'Make the pages yours.'}</h2>
            <p>{sources.length ? 'Add more PDFs or undo a deletion to bring pages back.' : 'Merge PDFs, arrange their pages, and export one polished document.'}</p>
            <Action label={importing ? 'Opening PDFs…' : 'Choose PDF files'} icon={importing ? LoaderCircle : Plus} tone="primary" disabled={importing} onClick={add} />
            <small>or drag and drop PDFs here</small>
          </div></div> : view === 'grid' ? <PageGrid pages={pages} sources={sourceById} selected={selected} zoom={zoom} select={select}
            replaceSelection={setSelection} move={(ids, target, after) => editPages(list => dropPages(list, ids, target, after))} preview={showPreview}
            menu={(id, x, y) => {
              if (!selected.has(id)) select(id, {})
              setMenu({ x: Math.max(4, Math.min(x, innerWidth - 210)), y: Math.max(4, Math.min(y, innerHeight - 245)) })
            }} /> : <Preview pages={pages} sources={sourceById} index={previewIndex} change={index => setActivePage(pages[index].id)} />}
        </div>
        <footer className="statusbar"><div><LockKeyhole size={13} /> <span>Local processing</span></div>
          <span role="status" className="truncate">{importing ? 'Opening PDFs…' : status || (settings.paper === 'a4' ? 'A4 · Fit · ' + settings.orientation : 'Original page size')}</span>
        </footer>
      </main>
      {showSettings && <SettingsPanel settings={settings} change={setSettings} selected={selected.size} count={pages.length} command={command}
        close={() => setShowSettings(false)} download={showExport} />}
    </div>

    {isDropping && <div className="drop-overlay" aria-hidden="true"><FilePlus2 size={46} /><strong>Drop PDFs to add them</strong></div>}
    {menu && <div className="context-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={event => event.stopPropagation()} aria-label="Page actions">
      {pageActions.map(({ command: action, label, icon }) => <Action key={action} icon={icon} label={label} tone={action === 'delete' ? 'danger' : 'ghost'} onClick={() => command(action)} />)}
    </div>}

    {dialog === 'preview' && pages.length > 0 && <Dialog title="Page preview" close={closeDialog} wide>
      <Preview pages={pages} sources={sourceById} index={previewIndex} change={index => setActivePage(pages[index].id)} />
    </Dialog>}
    {dialog === 'move' && <Dialog title="Move to page" close={closeDialog}>
      <form className="dialog-form" onSubmit={event => {
        event.preventDefault(); editPages(list => movePages(list, selected, +movePosition)); closeDialog()
      }}>
        <p>Move {selected.size} selected {selected.size === 1 ? 'page' : 'pages'} together. Enter the first position they should occupy.</p>
        <label className="field">Position (1–{maxPosition})<input autoFocus type="number" min={1} max={maxPosition} value={movePosition} onChange={event => setMovePosition(event.target.value)} required /></label>
        <div className="dialog-actions"><Action label="Cancel" onClick={closeDialog} /><Action label="Move pages" type="submit" tone="primary" /></div>
      </form>
    </Dialog>}
    {dialog === 'export' && <Dialog title="Download PDF" close={closeDialog}>
      <form className="dialog-form" onSubmit={event => { event.preventDefault(); download() }}>
        <p>{pages.length} {pages.length === 1 ? 'page' : 'pages'} · {settings.paper === 'a4' ? `A4 · Fit · ${settings.orientation}` : 'Original dimensions'}</p>
        <label className="field">Filename<input autoFocus value={filename} onChange={event => setFilename(event.target.value)} maxLength={180} disabled={!!progress} /></label>
        {progress && <p className="inline-group" role="status"><LoaderCircle size={17} className="animate-spin" /> {progress}</p>}
        <div className="dialog-actions"><Action label="Cancel" onClick={closeDialog} /><Action label="Download" icon={ArrowDownToLine} type="submit" tone="primary" disabled={!!progress || !pages.length} /></div>
      </form>
    </Dialog>}
  </div>
}
