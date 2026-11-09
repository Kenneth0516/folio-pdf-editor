import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { normalizeRotation, type Page, type Source } from '../model'

GlobalWorkerOptions.workerSrc = workerUrl
const assets = new URL('pdf-assets/', document.baseURI).href
const cache = new Map<string, Blob>()
const opened = new Map<string, { task: PDFDocumentLoadingTask; url: string }>()

export function openSource(id: string, file: File): Promise<PDFDocumentProxy> {
  const existing = opened.get(id)
  if (existing) return existing.task.promise
  const url = URL.createObjectURL(file)
  const task = getDocument({
    url,
    cMapUrl: `${assets}cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`, iccUrl: `${assets}iccs/`,
    enableXfa: false,
  })
  opened.set(id, { task, url })
  return task.promise
}

export function closeSource(id: string) {
  const entry = opened.get(id)
  if (entry) {
    opened.delete(id)
    void entry.task.destroy().catch(() => {}).finally(() => URL.revokeObjectURL(entry.url))
  }
  for (const key of cache.keys()) if (key.startsWith(`${id}/`)) cache.delete(key)
}

interface RenderJob { run: () => Promise<void>; signal: AbortSignal }
const queue: RenderJob[] = []
let active = 0

function pump() {
  while (active < 3 && queue.length) {
    const job = queue.shift()!
    if (job.signal.aborted) continue
    active++
    void job.run().finally(() => { active--; pump() })
  }
}

export function renderPage(source: Source, page: Page, size: number, thumbnail: boolean, signal: AbortSignal) {
  const key = `${source.id}/${page.index}/${page.rotation}/${size}`
  const cached = thumbnail ? cache.get(key) : undefined
  if (cached) {
    cache.delete(key)
    cache.set(key, cached)
    return Promise.resolve(cached)
  }
  return new Promise<Blob>((resolve, reject) => {
    const job = { signal, run }
    const onAbort = () => {
      const index = queue.indexOf(job)
      if (index !== -1) queue.splice(index, 1)
      reject(signal.reason)
    }

    async function run() {
      const canvas = document.createElement('canvas')
      try {
        const doc = await openSource(source.id, source.file)
        const pdfPage = await doc.getPage(page.index + 1)
        signal.throwIfAborted()
        const rotation = normalizeRotation(pdfPage.rotate + page.rotation)
        const base = pdfPage.getViewport({ scale: 1, rotation })
        const viewport = pdfPage.getViewport({ scale: size / Math.max(base.width, base.height), rotation })
        canvas.width = Math.max(1, Math.ceil(viewport.width))
        canvas.height = Math.max(1, Math.ceil(viewport.height))
        const task = pdfPage.render({ canvas, viewport, background: '#fff' })
        const cancel = () => task.cancel()
        signal.addEventListener('abort', cancel, { once: true })
        try {
          await task.promise
        } finally {
          signal.removeEventListener('abort', cancel)
          pdfPage.cleanup()
        }
        signal.throwIfAborted()
        const blob = await new Promise<Blob>((done, fail) => canvas.toBlob(value => value ? done(value) : fail(new Error('Could not render this page.'))))
        signal.throwIfAborted()
        if (thumbnail) {
          cache.set(key, blob)
          if (cache.size > 160) cache.delete(cache.keys().next().value!)
        }
        resolve(blob)
      } catch (error) {
        reject(error)
      } finally {
        canvas.width = canvas.height = 0
        signal.removeEventListener('abort', onAbort)
      }
    }

    if (signal.aborted) { reject(signal.reason); return }
    signal.addEventListener('abort', onAbort, { once: true })
    if (thumbnail) queue.push(job)
    else queue.unshift(job)
    pump()
  })
}

export async function importPdf(file: File, color: number): Promise<{ source: Source; pages: Page[] }> {
  const id = crypto.randomUUID()
  try {
    if (!file.size) throw new Error('This file is empty.')
    if (file.size > 300 * 1024 ** 2) throw new Error('This file exceeds the 300 MB per-file limit.')
    const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer())
    if (!header.includes('%PDF-')) throw new Error('This file does not appear to be a PDF.')
    const doc = await openSource(id, file)
    if (!doc.numPages) throw new Error('This document has no pages.')
    if (await doc.getPermissions() !== null) throw new Error('Remove PDF encryption before adding this file.')
    return {
      source: { id, file, pageCount: doc.numPages, color },
      pages: Array.from({ length: doc.numPages }, (_, index) => ({ id: crypto.randomUUID(), sourceId: id, index, rotation: 0 })),
    }
  } catch (error) {
    closeSource(id)
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('Unlock this password-protected PDF before adding it.')
    if (error instanceof Error && error.name === 'InvalidPDFException') throw new Error('This PDF is damaged or unsupported.')
    throw error
  }
}
