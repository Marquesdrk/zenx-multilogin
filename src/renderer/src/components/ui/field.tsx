import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const controlClass =
  'no-drag w-full rounded-control border border-white/10 bg-white/[0.04] px-3 text-[13px] text-white placeholder:text-muted/60 transition-[border-color,background-color,box-shadow] duration-150 hover:border-white/16 focus:border-brand-soft focus:bg-white/[0.06] focus:outline-none focus:ring-[3px] focus:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger/60'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(controlClass, 'h-9', className)} {...props} />
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(controlClass, 'min-h-20 resize-none py-2', className)} {...props} />
  )
)
Textarea.displayName = 'Textarea'

export function Field({
  label,
  htmlFor,
  error,
  optional,
  hint,
  children
}: {
  label: string
  htmlFor?: string
  error?: string
  optional?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-[12.5px] font-medium text-white/90">
        {label}
        {optional && <span className="font-normal text-muted/70">opcional</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-[12px] text-muted/80">{hint}</p>
      )}
    </div>
  )
}
