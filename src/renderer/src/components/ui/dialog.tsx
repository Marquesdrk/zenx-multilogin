import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const overlayClass =
  'fixed inset-0 z-40 bg-black/60 backdrop-blur-[3px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out'

interface BaseProps {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

function Header({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <DialogPrimitive.Title className="text-[16px] font-semibold tracking-[-0.01em]">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 text-[13px] leading-relaxed text-muted">
            {description}
          </DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
      </div>
      <DialogPrimitive.Close
        aria-label="Fechar"
        className="no-drag -mr-1.5 -mt-1 grid size-8 shrink-0 place-items-center rounded-[10px] text-muted transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </div>
  )
}

/** Modal centralizado. */
export function Dialog({ open, onOpenChange, title, description, children, footer, className }: BaseProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClass} />
        <DialogPrimitive.Content
          className={cn(
            'glass-strong fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 rounded-[18px] p-6 focus:outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
            className
          )}
        >
          <Header title={title} description={description} />
          {children && <div className="mt-5">{children}</div>}
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Drawer lateral direito. */
export function Sheet({ open, onOpenChange, title, description, children, footer, className }: BaseProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClass} />
        <DialogPrimitive.Content
          className={cn(
            'glass-strong fixed inset-y-0 right-0 z-50 flex w-[460px] max-w-[calc(100vw-80px)] flex-col border-y-0 border-r-0 focus:outline-none data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out',
            className
          )}
        >
          <div className="border-b border-white/8 px-6 pb-5 pt-6">
            <Header title={title} description={description} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-white/8 px-6 py-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
