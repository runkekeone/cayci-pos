import type { State } from './types'

/**
 * Uygulama BOŞ başlar. Ürün, tarif ve giderler kurulum sihirbazında oluşur —
 * ya hazır tariflerden ("önerilen ayarlar"), ya kullanıcının kendi rakamlarıyla.
 */
export const bosState: State = {
  items: [],
  purchases: [],
  sales: [],
  tables: Array.from({ length: 12 }, (_, i) => ({
    id: `masa-${i + 1}`,
    name: `Masa ${i + 1}`,
    lines: [],
  })),
  customers: [],
  payments: [],
  expenses: [],
  wastes: [],
  cashDays: [],
  business: { name: '', address: '', phone: '', owner: '', openTime: '07:00', closeTime: '23:00' },
  setupDone: false,
  settings: { showImages: false },
  isletmePuan: 0,
  oduller: [],
}
