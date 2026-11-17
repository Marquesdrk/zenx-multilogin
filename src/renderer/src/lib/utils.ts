import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** "agora", "há 5 min", "há 3 h", "ontem, 14:20", "12 de mai. de 2026". */
export function formatRelative(timestamp: number | null, now = Date.now()): string {
  if (timestamp === null) return 'Nunca'
  const diff = Math.max(0, now - timestamp)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Agora'
  if (minutes < 60) return `Há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return `Ontem, ${timeFormat.format(timestamp)}`
  if (days < 7) return `Há ${days} dias`
  return dateFormat.format(timestamp)
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
