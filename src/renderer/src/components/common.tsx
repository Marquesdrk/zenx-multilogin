import { Globe } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { PLATFORM_META, type BrowserStatus, type GroupDTO, type Platform, type TagDTO } from '@shared/types'
import { cn } from '@/lib/utils'
import { useApp, type ToastKind } from '@/store'

/* ---------- Ícones de plataforma (glifos monocromáticos próprios) ---------- */

const glyphs: Record<Exclude<Platform, 'other'>, ReactNode> = {
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
    </>
  ),
  tiktok: <path d="M14 3v11.2a3.8 3.8 0 1 1-3.8-3.8M14 3c.3 2.7 2.2 4.6 5 4.9" />,
  facebook: <path d="M14.5 21v-7.5h2.6l.5-3.2h-3.1V8.4c0-1 .4-1.7 1.8-1.7h1.5V3.9c-.6-.1-1.5-.2-2.4-.2-2.5 0-4.1 1.5-4.1 4.2v2.4H8.6v3.2h2.7V21" />,
  x: <path d="M4.5 4.5l15 15M19.5 4.5l-15 15" />,
  youtube: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10.2 9.3v5.4l4.6-2.7z" fill="currentColor" stroke="none" />
    </>
  )
}

export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  if (platform === 'other') return <Globe className={cn('size-4', className)} strokeWidth={1.8} />
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-4', className)}
      aria-hidden
    >
      {glyphs[platform]}
    </svg>
  )
}

export const platformLabels = (platforms: readonly Platform[]): string =>
  platforms.map((p) => PLATFORM_META[p].label).join(', ')

/** Ícones das plataformas do perfil, sobrepostos (máx. 3 visíveis). */
export function PlatformStack({ platforms }: { platforms: readonly Platform[] }) {
  const visible = platforms.slice(0, 3)
  const rest = platforms.length - visible.length
  return (
    <span title={platformLabels(platforms)} className="flex shrink-0 items-center">
      {visible.map((platform, index) => (
        <span
          key={platform}
          style={{ zIndex: index }}
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-[9px] border border-white/10 bg-surface-2 text-white/85 [&_svg]:size-[15px]',
            index > 0 && '-ml-1'
          )}
        >
          <PlatformIcon platform={platform} />
        </span>
      ))}
      {rest > 0 && <span className="ml-1 text-[11.5px] text-muted">+{rest}</span>}
    </span>
  )
}

/* ---------- Status ---------- */

const statusMeta: Record<BrowserStatus, { label: string; dot: string; text: string; pulse?: boolean }> = {
  closed: { label: 'Fechado', dot: 'bg-white/30', text: 'text-muted' },
  starting: { label: 'Iniciando', dot: 'bg-brand-soft', text: 'text-brand-soft', pulse: true },
  open: { label: 'Aberto', dot: 'bg-success shadow-[0_0_8px_rgb(52_211_153/0.7)]', text: 'text-success' },
  closing: { label: 'Encerrando', dot: 'bg-white/45', text: 'text-white/70', pulse: true },
  error: { label: 'Erro', dot: 'bg-danger', text: 'text-danger' }
}

export const STATUS_LABEL: Record<BrowserStatus, string> = {
  closed: 'Fechado',
  starting: 'Iniciando',
  open: 'Aberto',
  closing: 'Encerrando',
  error: 'Erro'
}

export function StatusBadge({ status, title }: { status: BrowserStatus; title?: string }) {
  const meta = statusMeta[status]
  return (
    <span title={title} className={cn('inline-flex items-center gap-2 text-[12.5px] font-medium', meta.text)}>
      <span className={cn('size-1.5 rounded-full', meta.dot, meta.pulse && 'animate-pulse-soft')} />
      {meta.label}
    </span>
  )
}

/* ---------- Grupo / tags ---------- */

export function GroupChip({ group }: { group: GroupDTO | undefined }) {
  if (!group) return <span className="text-muted/60">—</span>
  return (
    <span className="inline-flex max-w-full items-center gap-2 text-[12.5px] text-white/85">
      <span className="size-2 shrink-0 rounded-full" style={{ background: group.color }} />
      <span className="truncate">{group.name}</span>
    </span>
  )
}

export function TagList({ tags, max = 2 }: { tags: TagDTO[]; max?: number }) {
  if (tags.length === 0) return <span className="text-muted/60">—</span>
  const rest = tags.length - max
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {tags.slice(0, max).map((tag) => (
        <span
          key={tag.id}
          className="max-w-28 truncate rounded-md border border-white/8 bg-white/[0.05] px-1.5 py-0.5 text-[11.5px] text-white/75"
        >
          {tag.name}
        </span>
      ))}
      {rest > 0 && (
        <span title={tags.slice(max).map((t) => t.name).join(', ')} className="text-[11.5px] text-muted">
          +{rest}
        </span>
      )}
    </span>
  )
}

/* ---------- Estruturas de página ---------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-5 grid size-14 place-items-center rounded-2xl border border-brand-soft/25 bg-brand/15 text-brand-soft shadow-[0_0_40px_-8px_rgb(4_62_230/0.7)] [&_svg]:size-6">
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/* ---------- Toasts ---------- */

const toastIcon: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="text-success" />,
  error: <XCircle className="text-danger" />,
  warning: <AlertTriangle className="text-warning" />,
  info: <Info className="text-brand-soft" />
}

export function Toaster() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[360px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            role={toast.kind === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong pointer-events-auto flex items-start gap-3 rounded-[14px] py-3 pl-3.5 pr-2.5 [&_svg]:size-[18px]"
          >
            <span className="mt-px shrink-0">{toastIcon[toast.kind]}</span>
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/90">{toast.message}</p>
            <button
              type="button"
              aria-label="Dispensar"
              onClick={() => dismiss(toast.id)}
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="!size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
