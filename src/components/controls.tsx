import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface ActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon
  label: string
  iconOnly?: boolean
  tone?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

export function Action({ icon: Icon, label, iconOnly, tone = 'ghost', className = '', ...props }: ActionProps) {
  return <button type="button" className={`action ${tone} ${iconOnly ? 'icon-only' : ''} ${className}`} aria-label={label} title={label} {...props}>
    {Icon && <Icon size={17} strokeWidth={1.85} aria-hidden="true" />}
    {!iconOnly && <span>{label}</span>}
  </button>
}

export function Dialog({ title, children, close, wide }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} aria-label={title} className={wide ? 'dialog wide' : 'dialog'} onCancel={event => { event.preventDefault(); close() }}
    onClick={event => { if (event.target === event.currentTarget) close() }}>
    <div className="dialog-content">
      <header className="dialog-header"><h2>{title}</h2><Action label="Close" icon={X} iconOnly onClick={close} /></header>
      {children}
    </div>
  </dialog>
}
