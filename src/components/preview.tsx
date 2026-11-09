import { AlertTriangle, ChevronLeft, ChevronRight, Maximize, Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Page, Source } from '../model'
import { renderPage } from '../pdf/previews'
import { Action } from './controls'

export function PageImage({ source, page, size, lazy = false }: { source: Source; page: Page; size: number; lazy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!lazy)
  const [result, setResult] = useState<{ key: string; url: string | null }>()
  const [retry, setRetry] = useState(0)
  const key = `${page.id}/${page.rotation}/${size}/${retry}`

  useEffect(() => {
    if (!lazy) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '280px' })
    observer.observe(ref.current!)
    return () => observer.disconnect()
  }, [lazy])

  useEffect(() => {
    if (!visible) { setResult(undefined); return }
    const controller = new AbortController()
    let url: string | undefined
    renderPage(source, page, size, lazy, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      url = URL.createObjectURL(blob)
      setResult({ key, url })
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, url: null })
    })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [key, lazy, page, size, source, visible])

  const current = visible && result?.key === key ? result : undefined
  return <div className="page-image" ref={ref}>
    {current?.url ? <img src={current.url} alt={`Page ${page.index + 1} of ${source.file.name}`} draggable={false} />
      : current ? <button className="render-error" type="button" onClick={event => { event.stopPropagation(); setRetry(retry + 1) }}><AlertTriangle size={17} /> Retry preview</button>
        : <span className="paper-skeleton" aria-hidden="true" />}
  </div>
}

export function Preview({ pages, sources, index, change }: {
  pages: Page[]; sources: Map<string, Source>; index: number; change: (index: number) => void
}) {
  const [zoom, setZoom] = useState(100)
  const page = pages[index]
  const source = page && sources.get(page.sourceId)
  const viewport = useRef<HTMLDivElement>(null)
  useEffect(() => {
    viewport.current?.scrollTo(0, 0)
  }, [index, zoom])
  if (!page || !source) return null
  return <div className="preview" onKeyDown={event => {
    if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); change(index - 1) }
    if (event.key === 'ArrowRight' && index + 1 < pages.length) { event.preventDefault(); change(index + 1) }
  }}>
    <div className="preview-bar">
      <div className="inline-group"><Action label="Previous page" icon={ChevronLeft} iconOnly disabled={!index} onClick={() => change(index - 1)} />
        <span className="tabular-nums">{index + 1} / {pages.length}</span>
        <Action label="Next page" icon={ChevronRight} iconOnly disabled={index === pages.length - 1} onClick={() => change(index + 1)} /></div>
      <div className="inline-group"><Action label="Zoom out" icon={Minus} iconOnly disabled={zoom <= 50} onClick={() => setZoom(zoom - 25)} />
        <span className="tabular-nums">{zoom}%</span>
        <Action label="Zoom in" icon={Plus} iconOnly disabled={zoom >= 250} onClick={() => setZoom(zoom + 25)} />
        <Action label="Fit to viewport" icon={Maximize} iconOnly onClick={() => setZoom(100)} /></div>
    </div>
    <div className="preview-viewport" ref={viewport} tabIndex={0} aria-label="Page preview">
      <div className="preview-paper" style={{ width: `${zoom}%`, height: `${zoom}%` }}>
        <PageImage source={source} page={page} size={Math.min(2300, Math.round(1300 * zoom / 100))} />
      </div>
    </div>
    <p className="preview-caption truncate">{source.file.name} · Original page {page.index + 1}</p>
  </div>
}
