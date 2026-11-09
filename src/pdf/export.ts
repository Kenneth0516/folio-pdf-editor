import { degrees, PDFDocument, rgb, type PDFEmbeddedPage, type PDFPage } from 'pdf-lib'
import { normalizeRotation, type Page } from '../model'

export type Orientation = 'auto' | 'portrait' | 'landscape'
export interface ExportSettings { paper: 'a4' | 'original'; orientation: Orientation }

export const A4 = { width: 210 * 72 / 25.4, height: 297 * 72 / 25.4 }

export function visibleBox(page: PDFPage) {
  const media = page.getMediaBox()
  const crop = page.getCropBox()
  const left = Math.max(media.x, crop.x)
  const bottom = Math.max(media.y, crop.y)
  const right = Math.min(media.x + media.width, crop.x + crop.width)
  const top = Math.min(media.y + media.height, crop.y + crop.height)
  if (right > left && top > bottom) return { left, bottom, right, top }
  return { left: media.x, bottom: media.y, right: media.x + media.width, top: media.y + media.height }
}

export function fitA4(width: number, height: number, angle: number, orientation: Orientation) {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) {
    throw new Error('A page has invalid dimensions.')
  }
  const rotation = normalizeRotation(angle)
  const sideways = rotation === 90 || rotation === 270
  const visibleWidth = sideways ? height : width
  const visibleHeight = sideways ? width : height
  const landscape = orientation === 'landscape' || (orientation === 'auto' && visibleWidth > visibleHeight)
  const paperWidth = landscape ? A4.height : A4.width
  const paperHeight = landscape ? A4.width : A4.height
  const scale = Math.min(paperWidth / visibleWidth, paperHeight / visibleHeight)
  // drawPage rotates around the lower-left corner, so compensate for its new position.
  const x = (paperWidth - visibleWidth * scale) / 2 + (rotation === 180 ? width * scale : rotation === 270 ? height * scale : 0)
  const y = (paperHeight - visibleHeight * scale) / 2 + (rotation === 90 ? width * scale : rotation === 180 ? height * scale : 0)
  return { paperWidth, paperHeight, x, y, scale, angle: -rotation }
}

export async function createPdf(
  pages: Page[],
  loadSource: (id: string) => Promise<ArrayBuffer | Uint8Array>,
  settings: ExportSettings,
  progress: (done: number, total: number) => void = () => {},
) {
  if (!pages.length) throw new Error('Add at least one page before exporting.')
  const output = await PDFDocument.create()
  const sources = new Map<string, number[]>()
  const results = new Map<number, () => void>()
  pages.forEach(({ sourceId }, index) => {
    const positions = sources.get(sourceId) ?? []
    positions.push(index)
    sources.set(sourceId, positions)
  })
  let done = 0

  for (const [sourceId, positions] of sources) {
    const input = await PDFDocument.load(await loadSource(sourceId), { updateMetadata: false, throwOnInvalidObject: true })
    const indices = positions.map(position => pages[position].index)
    if (settings.paper === 'original') {
      const copies = await output.copyPages(input, indices)
      positions.forEach((position, index) => {
        const copy = copies[index]
        copy.setRotation(degrees(normalizeRotation(copy.getRotation().angle + pages[position].rotation)))
        results.set(position, () => { output.addPage(copy) })
        progress(++done, pages.length)
      })
      continue
    }

    // Embed each distinct original page once, including when a page is duplicated.
    const unique = [...new Set(indices)]
    const originals = unique.map(index => input.getPage(index))
    const boxes = originals.map(visibleBox)
    const embedded = new Map<number, PDFEmbeddedPage>()
    const contentOffsets = originals.flatMap((page, index) => page.node.Contents() ? [index] : [])
    const forms = await output.embedPages(contentOffsets.map(index => originals[index]), contentOffsets.map(index => boxes[index]))
    contentOffsets.forEach((offset, index) => embedded.set(offset, forms[index]))
    const lookup = new Map(unique.map((index, offset) => [index, offset]))
    for (const position of positions) {
      const { index, rotation } = pages[position]
      const offset = lookup.get(index)!
      const page = embedded.get(offset)
      const box = boxes[offset]
      const angle = originals[offset].getRotation().angle + rotation
      const fit = fitA4(box.right - box.left, box.top - box.bottom, angle, settings.orientation)
      results.set(position, () => {
        const copy = output.addPage([fit.paperWidth, fit.paperHeight])
        copy.drawRectangle({ x: 0, y: 0, width: fit.paperWidth, height: fit.paperHeight, color: rgb(1, 1, 1) })
        if (page) copy.drawPage(page, { x: fit.x, y: fit.y, xScale: fit.scale, yScale: fit.scale, rotate: degrees(fit.angle) })
      })
      progress(++done, pages.length)
    }
  }

  for (let index = 0; index < pages.length; index++) results.get(index)!()
  return output.save()
}
