import type { Page, Source } from '../model'
import { createPdf, type ExportSettings } from './export'

export interface ExportRequest { pages: Page[]; sources: Source[]; settings: ExportSettings }
export type ExportResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'success'; bytes: ArrayBuffer }
  | { type: 'error'; message: string }

// The worker receives File handles, then reads each source once in source order.
const scope = self as unknown as {
  onmessage: (event: MessageEvent<ExportRequest>) => void
  postMessage: (message: ExportResponse, transfer?: Transferable[]) => void
}

scope.onmessage = async ({ data }) => {
  const { pages, sources, settings } = data
  const files = new Map(sources.map(source => [source.id, source.file]))
  try {
    const bytes = await createPdf(pages, id => files.get(id)!.arrayBuffer(), settings, (done, total) => {
      if (done % 5 === 0 || done === total) scope.postMessage({ type: 'progress', done, total })
    })
    const buffer = bytes.buffer as ArrayBuffer
    scope.postMessage({ type: 'success', bytes: buffer }, [buffer])
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to write the PDF.' })
  }
}
