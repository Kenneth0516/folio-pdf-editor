import { deepEqual, equal, ok, rejects } from 'node:assert/strict'
import { test } from 'node:test'
import { degrees, PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib'
import { A4, createPdf, fitA4, visibleBox } from '../src/pdf/export'
import type { Page } from '../src/model'

const near = (actual: number, expected: number) => ok(Math.abs(actual - expected) < 0.00001, `${actual} ≠ ${expected}`)
const instance = (sourceId: string, index: number, rotation = 0): Page => ({ id: `${sourceId}-${index}-${rotation}`, sourceId, index, rotation })

test('Fit centers every corner within A4 for quarter turns and forced orientations', () => {
  for (const angle of [0, 90, 180, 270]) {
    for (const orientation of ['auto', 'portrait', 'landscape'] as const) {
      const { x, y, scale, angle: draw, paperWidth, paperHeight } = fitA4(720, 310, angle, orientation)
      const radians = draw * Math.PI / 180
      const corners = [[0, 0], [0, 310], [720, 0], [720, 310]].map(([left, bottom]) => [
        x + scale * (left * Math.cos(radians) - bottom * Math.sin(radians)),
        y + scale * (left * Math.sin(radians) + bottom * Math.cos(radians)),
      ])
      const xs = corners.map(([left]) => left)
      const ys = corners.map(([, bottom]) => bottom)
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
      near(minX, paperWidth - maxX)
      near(minY, paperHeight - maxY)
      ok(minX >= -1e-8 && minY >= -1e-8)
      ok(Math.abs(minX) < 1e-8 || Math.abs(minY) < 1e-8)
      equal(paperWidth > paperHeight, orientation === 'landscape' || (orientation === 'auto' && angle % 180 === 0))
    }
  }
})

test('A4 export interleaves sources, uses rotated crop geometry, embeds vectors, and handles blank pages', async () => {
  const a = await PDFDocument.create()
  const font = await a.embedFont(StandardFonts.Helvetica)
  const first = a.addPage([560, 420])
  first.setMediaBox(-20, -40, 560, 420)
  first.setCropBox(60, 80, 420, 220)
  first.setRotation(degrees(90))
  first.drawText('Source A', { x: 80, y: 120, font })
  a.addPage([500, 300])
  const b = await PDFDocument.create()
  b.addPage([300, 500]).drawText('Source B')
  deepEqual(visibleBox(first), { left: 60, bottom: 80, right: 480, top: 300 })
  const input = { a: await a.save(), b: await b.save() }
  const read: string[] = []
  const positions = [instance('a', 0), instance('b', 0, 90), instance('a', 1), instance('a', 0, 90)]
  const output = await PDFDocument.load(await createPdf(positions, async id => {
    read.push(id)
    return input[id as keyof typeof input]
  }, { paper: 'a4', orientation: 'auto' }))
  deepEqual(read, ['a', 'b'])
  equal(output.getPageCount(), 4)
  for (const [index, page] of output.getPages().entries()) {
    near(page.getWidth(), index === 0 ? A4.width : A4.height)
    near(page.getHeight(), index === 0 ? A4.height : A4.width)
    equal(page.getRotation().angle, 0)
  }
  const forms = output.context.enumerateIndirectObjects().map(([, object]) => object).filter((object): object is PDFRawStream =>
    object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Form'))
  equal(forms.length, 2)
  ok(forms.some(form => String(form.dict.get(PDFName.of('BBox'))) === '[ 60 80 480 300 ]'))
  ok(forms.some(form => String(form.dict.get(PDFName.of('Matrix'))) === '[ 1 0 0 1 -60 -80 ]'))
})

test('original-size export keeps boxes and independently rotates each duplicate', async () => {
  const a = await PDFDocument.create()
  const source = a.addPage([800, 600])
  source.setCropBox(40, 50, 700, 480)
  source.setRotation(degrees(270))
  const input = await a.save()
  const output = await PDFDocument.load(await createPdf([instance('a', 0, 180), instance('a', 0), instance('a', 0, 90)], async () => input,
    { paper: 'original', orientation: 'portrait' }))
  deepEqual(output.getPages().map(page => page.getRotation().angle), [90, 270, 0])
  for (const page of output.getPages()) {
    deepEqual(page.getSize(), { width: 800, height: 600 })
    deepEqual(page.getCropBox(), { x: 40, y: 50, width: 700, height: 480 })
  }
})

test('exports 120 pages and rejects empty exports', async () => {
  const source = await PDFDocument.create()
  for (let index = 0; index < 120; index++) source.addPage([300 + index, 450]).drawText(`Page ${index + 1}`)
  const bytes = await source.save()
  const load = async () => bytes
  const settings = { paper: 'a4', orientation: 'auto' } as const
  const progress: number[] = []
  const pages = Array.from({ length: 120 }, (_, index) => instance('a', 119 - index))
  const output = await PDFDocument.load(await createPdf(pages, load, settings, count => progress.push(count)))
  equal(output.getPageCount(), 120)
  equal(progress.at(-1), 120)
  await rejects(createPdf([], load, settings), /at least one page/)
})
