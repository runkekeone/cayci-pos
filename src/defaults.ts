import type { Item, Unit } from './types'
import { toBase, uid } from './lib/units'

/**
 * HAZIR TARİF KÜTÜPHANESİ.
 *
 * İşletme kendi tarifini vermek zorunda değil — kurulumda "önerilen ayarlar"ı
 * seçerse buradaki ürünler, tarifler ve giderler olduğu gibi kurulur.
 * Sonradan Ürünler ekranından her şey düzeltilebilir.
 *
 * Maliyet daima SON ALIŞ fiyatından hesaplanır. Buradaki fiyatlar sadece
 * başlangıç değeri; kullanıcı 5 kg çayı 1700 ₺'ye aldığını girdiği anda
 * tarifteki gramaja göre bardak maliyeti kendiliğinden güncellenir.
 */

export interface HamTanim {
  id: string
  name: string
  icon: string
  unit: Unit
  /** Kullanıcının aldığı birim. */
  buyUnit: string
  /** Varsayılan alış: kaç buyUnit için kaç ₺. */
  buyQty: number
  buyTotal: number
}

export const HAMMADDELER: HamTanim[] = [
  { id: 'cay', name: 'Çay (dökme)', icon: '🌿', unit: 'g', buyUnit: 'kg', buyQty: 5, buyTotal: 1700 },
  { id: 'seker', name: 'Şeker (küp)', icon: '🍬', unit: 'adet', buyUnit: 'adet', buyQty: 500, buyTotal: 90 },
  { id: 'tup', name: 'Tüp gaz', icon: '🔥', unit: 'g', buyUnit: 'kg', buyQty: 12, buyTotal: 900 },
  { id: 'bardak', name: 'İnce belli bardak', icon: '🥃', unit: 'adet', buyUnit: 'adet', buyQty: 200, buyTotal: 600 },
  { id: 'kahve-toz', name: 'Türk kahvesi (toz)', icon: '🫘', unit: 'g', buyUnit: 'kg', buyQty: 1, buyTotal: 320 },
  { id: 'nescafe-toz', name: 'Nescafe (toz)', icon: '🥄', unit: 'g', buyUnit: 'g', buyQty: 200, buyTotal: 180 },
  { id: 'sut-tozu', name: 'Süt tozu / krema', icon: '🥛', unit: 'g', buyUnit: 'g', buyQty: 500, buyTotal: 150 },
  { id: 'sut', name: 'Süt', icon: '🐄', unit: 'ml', buyUnit: 'lt', buyQty: 1, buyTotal: 40 },
  { id: 'salep-toz', name: 'Salep tozu', icon: '🌰', unit: 'g', buyUnit: 'g', buyQty: 500, buyTotal: 220 },
  { id: 'ekmek-tost', name: 'Tost ekmeği', icon: '🍞', unit: 'adet', buyUnit: 'adet', buyQty: 20, buyTotal: 120 },
  { id: 'kasar', name: 'Kaşar peyniri', icon: '🧀', unit: 'g', buyUnit: 'kg', buyQty: 2, buyTotal: 500 },
  { id: 'sucuk', name: 'Sucuk', icon: '🌭', unit: 'g', buyUnit: 'kg', buyQty: 1, buyTotal: 450 },
]

export interface TarifSatiri {
  itemId: string
  /** Temel birimde, BİR PARTİ için. */
  qty: number
}

export interface UrunTanim {
  id: string
  name: string
  icon: string
  category: string
  price: number
  /** Tarifli ürün: partiden kaç adet çıkar + parti tarifi. */
  recipe?: { yield: number; lines: TarifSatiri[] }
  /** Al-sat ürün: aldığın gibi satarsın. */
  alsat?: { buyUnit: string; buyQty: number; buyTotal: number }
  /** Bu ürün seçilirse gereken hammaddeler. */
  needs?: string[]
}

export const URUNLER: UrunTanim[] = [
  {
    id: 'cay-bardak',
    name: 'Çay',
    icon: '🍵',
    category: 'Sıcak',
    price: 15,
    // Demlik: 119 g çay + 150 g gaz -> 25 bardak. Bardak başı 2 küp şeker.
    recipe: {
      yield: 25,
      lines: [
        { itemId: 'cay', qty: 119 },
        { itemId: 'tup', qty: 150 },
        { itemId: 'seker', qty: 50 },
      ],
    },
    needs: ['cay', 'tup', 'seker'],
  },
  {
    id: 'turk-kahvesi',
    name: 'Türk Kahvesi',
    icon: '☕',
    category: 'Sıcak',
    price: 40,
    recipe: {
      yield: 1,
      lines: [
        { itemId: 'kahve-toz', qty: 7 },
        { itemId: 'tup', qty: 8 },
        { itemId: 'seker', qty: 1 },
      ],
    },
    needs: ['kahve-toz', 'tup', 'seker'],
  },
  {
    id: 'nescafe',
    name: 'Nescafe',
    icon: '🍶',
    category: 'Sıcak',
    price: 35,
    recipe: {
      yield: 1,
      lines: [
        { itemId: 'nescafe-toz', qty: 3 },
        { itemId: 'sut-tozu', qty: 8 },
        { itemId: 'tup', qty: 5 },
      ],
    },
    needs: ['nescafe-toz', 'sut-tozu', 'tup'],
  },
  {
    id: 'salep',
    name: 'Salep',
    icon: '🥛',
    category: 'Sıcak',
    price: 45,
    recipe: {
      yield: 1,
      lines: [
        { itemId: 'salep-toz', qty: 15 },
        { itemId: 'sut', qty: 200 },
        { itemId: 'tup', qty: 8 },
      ],
    },
    needs: ['salep-toz', 'sut', 'tup'],
  },
  {
    id: 'tost',
    name: 'Kaşarlı Tost',
    icon: '🥪',
    category: 'Yiyecek',
    price: 60,
    recipe: {
      yield: 1,
      lines: [
        { itemId: 'ekmek-tost', qty: 1 },
        { itemId: 'kasar', qty: 60 },
        { itemId: 'tup', qty: 10 },
      ],
    },
    needs: ['ekmek-tost', 'kasar', 'tup'],
  },
  {
    id: 'sucuklu-tost',
    name: 'Sucuklu Tost',
    icon: '🥙',
    category: 'Yiyecek',
    price: 80,
    recipe: {
      yield: 1,
      lines: [
        { itemId: 'ekmek-tost', qty: 1 },
        { itemId: 'kasar', qty: 40 },
        { itemId: 'sucuk', qty: 40 },
        { itemId: 'tup', qty: 10 },
      ],
    },
    needs: ['ekmek-tost', 'kasar', 'sucuk', 'tup'],
  },

  // --- al-sat ---
  { id: 'kola', name: 'Kola', icon: '🥤', category: 'Soğuk', price: 35, alsat: { buyUnit: 'adet', buyQty: 24, buyTotal: 480 } },
  { id: 'soda', name: 'Soda', icon: '🫧', category: 'Soğuk', price: 20, alsat: { buyUnit: 'adet', buyQty: 24, buyTotal: 240 } },
  { id: 'ayran', name: 'Ayran', icon: '🥛', category: 'Soğuk', price: 25, alsat: { buyUnit: 'adet', buyQty: 24, buyTotal: 288 } },
  { id: 'su-sise', name: 'Su (şişe)', icon: '💧', category: 'Soğuk', price: 10, alsat: { buyUnit: 'adet', buyQty: 48, buyTotal: 240 } },
  { id: 'gazoz', name: 'Gazoz', icon: '🍾', category: 'Soğuk', price: 25, alsat: { buyUnit: 'adet', buyQty: 24, buyTotal: 336 } },
  { id: 'meyve-suyu', name: 'Meyve suyu', icon: '🧃', category: 'Soğuk', price: 35, alsat: { buyUnit: 'adet', buyQty: 24, buyTotal: 480 } },
  { id: 'cikolata', name: 'Çikolata', icon: '🍫', category: 'Atıştırmalık', price: 25, alsat: { buyUnit: 'adet', buyQty: 24, buyTotal: 360 } },
  { id: 'cips', name: 'Cips', icon: '🥔', category: 'Atıştırmalık', price: 40, alsat: { buyUnit: 'adet', buyQty: 12, buyTotal: 300 } },
]

/** Kurulumda varsayılan seçili gelenler. Çay zorunlu. */
export const VARSAYILAN_SECILI = [
  'cay-bardak',
  'turk-kahvesi',
  'tost',
  'kola',
  'soda',
  'ayran',
  'su-sise',
]

export const VARSAYILAN_AYLIK_GIDER = [
  { name: 'Kira', amount: 15000 },
  { name: 'Elektrik', amount: 3000 },
  { name: 'Su', amount: 600 },
  { name: 'Doğalgaz', amount: 1500 },
  { name: 'İnternet', amount: 500 },
  { name: 'Vergi / muhasebe', amount: 2000 },
]

export const VARSAYILAN_GUNLUK_GIDER = [{ name: 'Eleman yevmiyesi', amount: 1000 }]

/**
 * Seçilen ürün id'lerinden Item listesi kurar.
 * Gereken hammaddeleri kendiliğinden ekler — tarifi olan ürün seçilip
 * hammaddesi eksik kalamaz.
 */
export function urunleriKur(
  secili: string[],
  hamAlis: Record<string, { qty: number; total: number }> = {},
  urunFiyat: Record<string, number> = {},
  alsatAlis: Record<string, { qty: number; total: number }> = {},
): Item[] {
  const items: Item[] = []
  const gerekenHam = new Set<string>()

  for (const id of secili) {
    const u = URUNLER.find((x) => x.id === id)
    if (!u) continue
    for (const h of u.needs ?? []) gerekenHam.add(h)
  }

  for (const hamId of gerekenHam) {
    const h = HAMMADDELER.find((x) => x.id === hamId)
    if (!h) continue
    const alis = hamAlis[hamId] ?? { qty: h.buyQty, total: h.buyTotal }
    const base = toBase(alis.qty, h.buyUnit)
    items.push({
      id: h.id,
      name: h.name,
      unit: h.unit,
      buyUnit: h.buyUnit,
      category: 'Hammadde',
      icon: h.icon,
      sellable: false,
      stock: base,
      minStock: Math.round(base * 0.2),
      lastCost: { total: alis.total, qty: base },
    })
  }

  for (const id of secili) {
    const u = URUNLER.find((x) => x.id === id)
    if (!u) continue

    if (u.alsat) {
      const alis = alsatAlis[id] ?? { qty: u.alsat.buyQty, total: u.alsat.buyTotal }
      items.push({
        id: u.id,
        name: u.name,
        unit: 'adet',
        buyUnit: u.alsat.buyUnit,
        category: u.category,
        icon: u.icon,
        sellable: true,
        price: urunFiyat[id] ?? u.price,
        stock: alis.qty,
        minStock: Math.max(1, Math.round(alis.qty * 0.25)),
        lastCost: { total: alis.total, qty: alis.qty },
      })
      continue
    }

    items.push({
      id: u.id,
      name: u.name,
      unit: 'adet',
      buyUnit: 'adet',
      category: u.category,
      icon: u.icon,
      sellable: true,
      price: urunFiyat[id] ?? u.price,
      stock: 0,
      recipe: u.recipe ? { yield: u.recipe.yield, lines: u.recipe.lines.map((l) => ({ ...l })) } : undefined,
    })
  }

  return items
}

export function varsayilanGiderler() {
  return [
    ...VARSAYILAN_AYLIK_GIDER.map((g) => ({
      id: uid(),
      date: '',
      name: g.name,
      amount: g.amount,
      kind: 'aylik' as const,
      paidCash: false,
    })),
    ...VARSAYILAN_GUNLUK_GIDER.map((g) => ({
      id: uid(),
      date: '',
      name: g.name,
      amount: g.amount,
      kind: 'gunluk-sabit' as const,
      paidCash: true,
    })),
  ]
}
