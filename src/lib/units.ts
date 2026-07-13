import type { Unit } from '../types'

/** Girişte kullanılabilecek birimler ve temel birime çevrim katsayıları. */
export const INPUT_UNITS: Record<Unit, { label: string; factor: number }[]> = {
  g: [
    { label: 'g', factor: 1 },
    { label: 'kg', factor: 1000 },
  ],
  ml: [
    { label: 'ml', factor: 1 },
    { label: 'lt', factor: 1000 },
  ],
  adet: [
    { label: 'adet', factor: 1 },
    { label: 'paket (10)', factor: 10 },
    { label: 'koli (100)', factor: 100 },
  ],
}

export function toBase(qty: number, unit: Unit, label: string): number {
  const f = INPUT_UNITS[unit].find((u) => u.label === label)?.factor ?? 1
  return qty * f
}

/** Stok/miktar gösterimi: 5000 g -> "5 kg", 450 g -> "450 g". */
export function fmtQty(qty: number, unit: Unit): string {
  if (unit === 'adet') return `${round(qty, 1)} adet`
  if (qty >= 1000) return `${round(qty / 1000, 2)} ${unit === 'g' ? 'kg' : 'lt'}`
  return `${round(qty, 1)} ${unit}`
}

export function fmtTL(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'
}

export function round(n: number, d = 2): number {
  const p = Math.pow(10, d)
  return Math.round(n * p) / p
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dayOf(iso: string): string {
  return iso.slice(0, 10)
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}
