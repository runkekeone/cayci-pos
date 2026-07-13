import type { State } from './types'

/**
 * Uygulama BOŞ başlar. Ürün ve tarifler kurulum sihirbazında,
 * kullanıcının kendi alış fiyatlarıyla oluşturulur.
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
}

/** Kurulumda kullanıcıya sunulan hazır ürünler. Çay zorunlu, gerisi seçmeli. */
export interface CatalogEntry {
  id: string
  name: string
  icon: string
  /** Alış: kaç adet için ne kadar ödendi (kullanıcı düzenler). */
  buyQty: number
  buyTotal: number
  price: number
}

export const AL_SAT_KATALOG: CatalogEntry[] = [
  { id: 'kola', name: 'Kola', icon: '🥤', buyQty: 24, buyTotal: 480, price: 35 },
  { id: 'soda', name: 'Soda', icon: '🫧', buyQty: 24, buyTotal: 240, price: 20 },
  { id: 'ayran', name: 'Ayran', icon: '🥛', buyQty: 24, buyTotal: 288, price: 25 },
  { id: 'su-sise', name: 'Su (şişe)', icon: '💧', buyQty: 48, buyTotal: 240, price: 10 },
  { id: 'meyve-suyu', name: 'Meyve suyu', icon: '🧃', buyQty: 24, buyTotal: 480, price: 35 },
  { id: 'gazoz', name: 'Gazoz', icon: '🍾', buyQty: 24, buyTotal: 336, price: 25 },
  { id: 'cikolata', name: 'Çikolata', icon: '🍫', buyQty: 24, buyTotal: 360, price: 25 },
  { id: 'cips', name: 'Cips', icon: '🥔', buyQty: 12, buyTotal: 300, price: 40 },
]

/** Tarifli opsiyonel ürünler. Seçilirse hammaddeleri de eklenir. */
export interface TarifliKatalog {
  id: string
  name: string
  icon: string
  price: number
  /** Bu üründen 1 adet için gereken hammaddeler. */
  needs: { rawId: string; rawName: string; rawIcon: string; unit: 'g' | 'ml' | 'adet'; qty: number; buyQty: number; buyTotal: number }[]
}

export const TARIFLI_KATALOG: TarifliKatalog[] = [
  {
    id: 'turk-kahvesi',
    name: 'Türk Kahvesi',
    icon: '☕',
    price: 40,
    needs: [
      {
        rawId: 'kahve-toz',
        rawName: 'Türk kahvesi (toz)',
        rawIcon: '🫘',
        unit: 'g',
        qty: 7,
        buyQty: 1000,
        buyTotal: 320,
      },
    ],
  },
  {
    id: 'nescafe',
    name: 'Nescafe',
    icon: '🍶',
    price: 35,
    needs: [
      {
        rawId: 'nescafe-toz',
        rawName: 'Nescafe (toz)',
        rawIcon: '🥄',
        unit: 'g',
        qty: 3,
        buyQty: 200,
        buyTotal: 180,
      },
      {
        rawId: 'sut-tozu',
        rawName: 'Süt tozu / krema',
        rawIcon: '🥛',
        unit: 'g',
        qty: 8,
        buyQty: 500,
        buyTotal: 150,
      },
    ],
  },
  {
    id: 'tost',
    name: 'Kaşarlı Tost',
    icon: '🥪',
    price: 60,
    needs: [
      {
        rawId: 'ekmek-tost',
        rawName: 'Tost ekmeği',
        rawIcon: '🍞',
        unit: 'adet',
        qty: 1,
        buyQty: 20,
        buyTotal: 120,
      },
      {
        rawId: 'kasar',
        rawName: 'Kaşar peyniri',
        rawIcon: '🧀',
        unit: 'g',
        qty: 60,
        buyQty: 2000,
        buyTotal: 500,
      },
    ],
  },
]

/** Kurulumda önerilen aylık sabit giderler. */
export const AYLIK_GIDER_ONERI = [
  { name: 'Kira', amount: 0 },
  { name: 'Elektrik', amount: 0 },
  { name: 'Su', amount: 0 },
  { name: 'Doğalgaz', amount: 0 },
  { name: 'İnternet', amount: 0 },
  { name: 'Vergi / muhasebe', amount: 0 },
]
