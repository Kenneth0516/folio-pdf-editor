# Folio PDF Workspace

Folio is a browser-based editor for merging, rearranging, and resizing PDF pages. It processes documents in memory in the current tab. Its production build is a static site with no accounts, upload endpoint, or external runtime services.

## Run locally

Use Node.js 22.13+ and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. Build and serve the production bundle with the following commands.

```sh
pnpm test
pnpm build
pnpm preview
```

Deploy the contents of `dist/` to any static HTTP(S) host. The bundle includes its workers, character maps, standard fonts, and decoders.

## Edit a PDF

1. Drop PDFs anywhere in the workspace or choose **Add PDF**. Pages enter the grid in file and page order.
2. Click a tile to select it, Ctrl/Command-click to toggle it, or Shift-click to select a range. Drag a rectangle from an empty area of the grid to select multiple pages. Use the checkbox on each tile for touch selection.
3. Drag a tile's handle to move the selection as a group. The insertion line shows where the group will land. Use **Move to page** for distant destinations. Right-click a tile or use its actions button for rotation, duplication, deletion, and movement.
4. Open **Preview** for full-page navigation, or double-click a tile for the preview dialog.
5. Choose **Download PDF**, set the filename, then download. The default is A4 with proportional fit and automatic orientation. Choose **Original size** to retain page boxes and dimensions.

| Shortcut | Action |
| --- | --- |
| Ctrl/Command + A | Select all pages |
| Ctrl/Command + Z | Undo |
| Ctrl/Command + Y or Shift + Z | Redo |
| Delete | Delete selected pages |
| Escape | Clear selection or close the current dialog |
| Space and arrow keys on a drag handle | Pick up, move, and drop a page with the keyboard |

## Architecture

- `src/model.ts` holds the page sequence and history. Each page instance has its own ID. History retains file references and page metadata, with up to 60 undo steps.
- `src/pdf/previews.ts` opens PDF.js documents in workers. Visible thumbnails render at reduced resolution with bounded concurrency and caching. Removing a source destroys its preview worker and drops its cached thumbnails. Undo can reopen the original file while its history entry exists.
- `src/components/` holds the grid, dnd-kit interactions, preview, and editing controls.
- `src/pdf/export-worker.ts` runs pdf-lib export off the UI thread. `src/pdf/export.ts` groups work by source, writes the edited sequence in output order, and fits vector page content onto A4 using the visible crop box and combined rotation.
- `tests/` covers page order, group moves, selection, history, A4 geometry, crop boxes, rotations, blanks, duplicate pages, and 120-page export.

## Browser and PDF limits

Use a current Chromium, Firefox, or Safari browser over HTTPS or localhost. Each source file can be up to 300 MB. Available tab memory and PDF complexity determine practical limits, particularly for image-heavy scans. Unlock encrypted files before importing. A4 export preserves page content as vector PDF where present. Interactive forms, annotations, outlines, attachments, and signatures may be lost or invalidated when assembling a new PDF. The preview shows the edited source page orientation. A4 margins and forced paper orientation are applied at export.
