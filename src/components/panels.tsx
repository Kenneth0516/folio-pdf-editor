import {
  ArrowDownToLine, ArrowUpDown, Check, Copy, FileText, Files, LockKeyhole, PanelLeftClose, PanelRightClose, Plus,
  RotateCcw, RotateCw, Scan, Settings2, SquareDashed, Trash2, X,
} from 'lucide-react'
import type { Source } from '../model'
import type { ExportSettings, Orientation } from '../pdf/export'
import { Action } from './controls'

export type PageCommand = 'clockwise' | 'counterclockwise' | 'flip' | 'duplicate' | 'move' | 'delete' | 'all' | 'clear'

export const pageActions = [
  { command: 'clockwise', label: 'Rotate right 90°', icon: RotateCw },
  { command: 'counterclockwise', label: 'Rotate left 90°', icon: RotateCcw },
  { command: 'flip', label: 'Rotate 180°', icon: RotateCw },
  { command: 'duplicate', label: 'Duplicate', icon: Copy },
  { command: 'move', label: 'Move to page', icon: ArrowUpDown },
  { command: 'delete', label: 'Delete pages', icon: Trash2 },
] as const

export function SourcesPanel({ sources, add, remove, close, busy }: {
  sources: Source[]; add: () => void; remove: (source: Source) => void; close: () => void; busy: boolean
}) {
  return <aside className="panel sources-panel" aria-label="Source files">
    <div className="panel-heading"><Files size={17} /><h2>Source files</h2><Action icon={PanelLeftClose} label="Hide source files" iconOnly onClick={close} /></div>
    <div className="panel-body">
      <p className="panel-kicker">DOCUMENTS <span>{sources.length}</span></p>
      {sources.length ? <ul className="file-list">{sources.map(source => <li key={source.id}>
        <span className="file-icon" data-color={source.color}><FileText size={17} /></span>
        <div className="min-w-0 flex-1"><p className="truncate" title={source.file.name}>{source.file.name}</p>
          <small>{source.pageCount} {source.pageCount === 1 ? 'page' : 'pages'}</small></div>
        <Action label={`Remove ${source.file.name}`} icon={X} iconOnly onClick={() => remove(source)} />
      </li>)}</ul> : <p className="panel-muted">Added PDFs appear here.</p>}
      <Action label="Add PDF files" icon={Plus} tone="secondary" className="w-full" disabled={busy} onClick={add} />
    </div>
    <div className="privacy"><LockKeyhole size={15} /><div><strong>Local workspace</strong><p>Your PDFs stay in this browser.</p></div></div>
  </aside>
}

export function SettingsPanel({ settings, change, selected, count, command, close, download }: {
  settings: ExportSettings; change: (settings: ExportSettings) => void; selected: number; count: number
  command: (command: PageCommand) => void; close: () => void; download: () => void
}) {
  const original = settings.paper === 'original'
  return <aside className="panel settings-panel" aria-label="Editing settings">
    <div className="panel-heading"><Settings2 size={17} /><h2>Settings</h2><Action label="Hide settings" icon={PanelRightClose} iconOnly onClick={close} /></div>
    <div className="panel-scroll">
      <section className="panel-body settings-section">
        <p className="panel-kicker">EXPORT FORMAT</p>
        <label className="field"><span>Paper size</span><select value={settings.paper} onChange={event => change({ ...settings, paper: event.target.value === 'a4' ? 'a4' : 'original' })}>
          <option value="a4">A4 · 210 × 297 mm</option><option value="original">Original size</option>
        </select></label>
        <div className="field"><span>Scaling</span><div className="static-field">{original ? 'Original dimensions' : 'Fit to page'}</div></div>
        <label className="field"><span>Orientation</span><select disabled={original} value={settings.orientation}
          onChange={event => change({ ...settings, orientation: event.target.value as Orientation })}>
          <option value="auto">Auto</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option>
        </select></label>
        <div className="setting-note"><Scan size={16} /><p>{original ? 'Keeps the original page dimensions and applies your rotations.' : 'Fits and centers each page, preserving its proportions.'}</p></div>
      </section>
      <section className="panel-body settings-section selection-section">
        <p className="panel-kicker">PAGE ACTIONS <span>{selected} selected</span></p>
        <div className="action-list">
          {pageActions.map(({ command: action, icon, label }) => <Action key={action} label={label} icon={icon} disabled={!selected}
            tone={action === 'delete' ? 'danger' : 'ghost'} onClick={() => command(action)} />)}
          <Action label="Select all" icon={SquareDashed} disabled={!count || selected === count} onClick={() => command('all')} />
          <Action label="Clear selection" icon={Check} disabled={!selected} onClick={() => command('clear')} />
        </div>
      </section>
    </div>
    <div className="panel-footer"><Action label="Export options" icon={ArrowDownToLine} tone="secondary" className="w-full" disabled={!count} onClick={download} /></div>
  </aside>
}
