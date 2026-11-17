import { cva, type VariantProps } from 'class-variance-authority'
import { LoaderCircle } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'no-drag inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-white shadow-[0_8px_24px_-10px_rgb(4_62_230/0.9),inset_0_1px_0_rgb(255_255_255/0.18)] hover:bg-brand-hover',
        secondary: 'border border-white/10 bg-white/[0.06] text-white hover:border-white/16 hover:bg-white/[0.1]',
        ghost: 'text-muted hover:bg-white/[0.07] hover:text-white',
        danger: 'border border-danger/30 bg-danger/12 text-danger hover:bg-danger/20',
        success: 'border border-success/25 bg-success/10 text-success hover:bg-success/18'
      },
      size: {
        sm: 'h-8 rounded-[10px] px-3 text-[12.5px]',
        md: 'h-9 rounded-control px-4 text-[13px]',
        icon: 'size-8 rounded-[10px]'
      }
    },
    defaultVariants: { variant: 'secondary', size: 'md' }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle className="animate-spin" />}
      {children}
    </button>
  )
)
Button.displayName = 'Button'
