import { Check, ChevronDown } from 'lucide-react'
import { Checkbox as CheckboxPrimitive, DropdownMenu, Select as SelectPrimitive, Switch as SwitchPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { controlClass } from './field'

const popoverClass =
  'glass-strong z-50 min-w-44 overflow-hidden rounded-[14px] p-1.5 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out'
const itemClass =
  'relative flex h-8 cursor-default select-none items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] text-white/90 outline-none transition-colors duration-100 data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-muted'

/* ---------- Dropdown ---------- */

export function Menu({ trigger, children, align = 'end' }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} className={popoverClass}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function MenuItem({
  children,
  onSelect,
  danger,
  disabled
}: {
  children: ReactNode
  onSelect(): void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(itemClass, danger && 'text-danger data-[highlighted]:bg-danger/12 data-[highlighted]:text-danger [&_svg]:text-danger')}
    >
      {children}
    </DropdownMenu.Item>
  )
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-white/8" />
}

/* ---------- Select ---------- */

export interface SelectOption {
  value: string
  label: string
  icon?: ReactNode
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  id,
  className,
  ariaLabel
}: {
  value: string
  onChange(value: string): void
  options: SelectOption[]
  placeholder?: string
  id?: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(controlClass, 'flex h-9 items-center justify-between gap-2 text-left data-[placeholder]:text-muted/60', className)}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(popoverClass, 'max-h-72 w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]')}
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item key={option.value} value={option.value} className={cn(itemClass, 'pr-8')}>
                <SelectPrimitive.ItemText>
                  <span className="flex items-center gap-2">
                    {option.icon}
                    {option.label}
                  </span>
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2.5">
                  <Check className="!text-brand-soft" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

/* ---------- Checkbox / Switch ---------- */

export function Checkbox({
  checked,
  onChange,
  ariaLabel
}: {
  checked: boolean | 'indeterminate'
  onChange(checked: boolean): void
  ariaLabel: string
}) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={(value) => onChange(value === true)}
      aria-label={ariaLabel}
      className="no-drag grid size-[18px] shrink-0 place-items-center rounded-[6px] border border-white/20 bg-white/[0.04] transition-colors duration-150 hover:border-white/35 data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand"
    >
      <CheckboxPrimitive.Indicator>
        {checked === 'indeterminate' ? (
          <span className="block h-0.5 w-2 rounded bg-white" />
        ) : (
          <Check className="size-3 text-white" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export function Switch({
  checked,
  onChange,
  ariaLabel,
  disabled
}: {
  checked: boolean
  onChange(checked: boolean): void
  ariaLabel: string
  disabled?: boolean
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className="no-drag relative h-[22px] w-[38px] shrink-0 rounded-full border border-white/10 bg-white/[0.08] transition-colors duration-200 disabled:opacity-50 data-[state=checked]:border-brand data-[state=checked]:bg-brand"
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-[2px] rounded-full bg-white shadow transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  )
}
