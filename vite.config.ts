import { cpSync, createReadStream, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const pdfjs = dirname(require.resolve('pdfjs-dist/package.json'))
const assets = ['cmaps', 'standard_fonts', 'wasm', 'iccs']

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), {
    name: 'local-pdfjs-assets',
    // Serve assets through Vite in development and bundle them for static hosting.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/pdf-assets\/(cmaps|standard_fonts|wasm|iccs)\/([\w.-]+)$/)
        if (match && match[2] !== '.' && match[2] !== '..') {
          const path = resolve(pdfjs, match[1], match[2])
          if (existsSync(path)) {
            res.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
            createReadStream(path).pipe(res)
            return
          }
        }
        next()
      })
    },
    writeBundle(options) {
      for (const asset of assets) {
        if (existsSync(resolve(pdfjs, asset))) cpSync(resolve(pdfjs, asset), resolve(options.dir!, 'pdf-assets', asset), { recursive: true })
      }
    },
  }],
})
