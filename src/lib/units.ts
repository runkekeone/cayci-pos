import type { Unit } from '../types'

/**
 * Kullanıcı kg / lt / cc / paket gibi birimlerle çalışır.
 * Program içeride sadece 3 temel birim tutar: g, ml, adet.
 * Her görünen birim bir temel birime ve katsayıya bağlanır.
 */
export interface UnitDef {
  label: string
  base: Unit
  factor: number
  group: 'Ağırlık' | 'Hacim' | 'Sayı'
}

export const UNITS: UnitDef[] = [
  { label: 'g', base: 'g', factor: 1, group: 'Ağırlık' },
  { label: 'kg', base: 'g', factor: 1000, group: 'Ağırlık' },
  { label: 'ton', base: 'g', factor: 1_000_000, group: 'Ağırlık' },

  { label: 'ml', base: 'ml', factor: 1, group: 'Hacim' },
  { label: 'cc', base: 'ml', factor: 1, group: 'Hacim' },
  { label: 'cl', base: 'ml', factor: 10, group: 'Hacim' },
  { label: 'lt', base: 'ml', factor: 1000, group: 'Hacim' },

  { label: 'adet', base: 'adet', factor: 1, group: 'Sayı' },
  { label: 'porsiyon', base: 'adet', factor: 1, group: 'Sayı' },
  { label: 'dilim', base: 'adet', factor: 1, group: 'Sayı' },
  { label: 'koli', base: 'adet', factor: 1, group: 'Sayı' },
  { label: 'paket', base: 'adet', factor: 1, group: 'Sayı' },
  { label: 'kutu', base: 'adet', factor: 1, group: 'Sayı' },
]

/**
 * Adetle kullanılan bir kalem, adet olmayan bir kapla alınabiliyor mu?
 * Şeker kiloyla alınır, küple kullanılır. Soda koliyle alınır, adetle satılır.
 * Bu durumda "içinde kaç adet var" (packSize) kullanıcıdan sorulur.
 */
export const ADET_ALIS_BIRIMLERI = ['adet', 'koli', 'paket', 'kutu', 'kg', 'lt']

/** packSize gerekiyor mu — yani alış birimi tek tek saymaya uygun değil mi. */
export function packSizeGerekli(unit: Unit, buyUnit: string): boolean {
  return unit === 'adet' && buyUnit !== 'adet'
}

/**
 * Alıştaki miktarı temel birime çevirir.
 * - Ağırlık/hacim: sabit katsayı (5 kg -> 5000 g)
 * - Adet: alış birimi 'adet' değilse packSize ile çarpılır (1 koli x 24 -> 24 adet)
 */
export function alisToBase(qty: number, unit: Unit, buyUnit: string, packSize?: number): number {
  if (unit === 'adet') {
    if (buyUnit === 'adet') return qty
    return qty * (packSize && packSize > 0 ? packSize : 1)
  }
  return qty * unitDef(buyUnit).factor
}

/** Temel birimdeki miktarı alış birimine geri çevirir (gösterim için). */
export function baseToAlis(qty: number, unit: Unit, buyUnit: string, packSize?: number): number {
  if (unit === 'adet') {
    if (buyUnit === 'adet') return qty
    return packSize && packSize > 0 ? qty / packSize : qty
  }
  return qty / unitDef(buyUnit).factor
}

export function unitDef(label: string): UnitDef {
  return UNITS.find((u) => u.label === label) ?? UNITS[0]
}

/** Görünen birimdeki miktarı temel birime çevirir. 5 kg -> 5000 g */
export function toBase(qty: number, unitLabel: string): number {
  return qty * unitDef(unitLabel).factor
}

/** Temel birimdeki miktarı görünen birime çevirir. 5000 g -> 5 kg */
export function fromBase(qty: number, unitLabel: string): number {
  return qty / unitDef(unitLabel).factor
}

/** Bir temel birim için kullanılabilecek görünen birimler. */
export function unitsFor(base: Unit): UnitDef[] {
  return UNITS.filter((u) => u.base === base)
}

/** Stok gösterimi. Kalemin kendi alış birimi varsa onunla, yoksa akıllı seçimle. */
export function fmtQty(qty: number, base: Unit, buyUnit?: string): string {
  if (buyUnit) {
    const d = unitDef(buyUnit)
    if (d.base === base && d.factor > 1) return `${round(qty / d.factor, 2)} ${d.label}`
  }
  if (base === 'adet') return `${round(qty, 1)} adet`
  if (qty >= 1000) return `${round(qty / 1000, 2)} ${base === 'g' ? 'kg' : 'lt'}`
  return `${round(qty, 1)} ${base}`
}

export function fmtTL(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'
}

/** Kuruşun altındaki maliyetler için: 0,0453 ₺ gibi. */
export function fmtTLInce(n: number): string {
  const d = n > 0 && n < 1 ? 4 : 2
  return n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' ₺'
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
