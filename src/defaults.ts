import type { Item, Unit } from './types'
import { alisToBase, uid } from './lib/units'

/**
 * HAZIR KATALOG — gerçek bir kıraathanenin sattığı kalemler ve tarifleri.
 *
 * Tarifler ve fiyatlar sahadan alındı. Kurulumda "önerilen ayarlar" seçilirse
 * bunlar olduğu gibi kurulur; kullanıcı sonradan hepsini değiştirebilir.
 *
 * Maliyet daima SON ALIŞ fiyatından hesaplanır — ortalama alınmaz.
 * Tüp gaz bilerek dışarıda: kullanıcı istemedi.
 */

export interface HamTanim {
  id: string
  name: string
  icon: string
  unit: Unit
  buyUnit: string
  /** Alış birimi adet değilse: içinde kaç adet var. 1 kg şeker = 405 küp. */
  packSize?: number
  buyQty: number
  buyTotal: number
}

export const HAMMADDELER: HamTanim[] = [
  { id: 'cay', name: 'Çay (dökme)', icon: '🌿', unit: 'g', buyUnit: 'kg', buyQty: 5, buyTotal: 1500 },
  {
    id: 'seker',
    name: 'Küp şeker',
    icon: '🍬',
    unit: 'adet',
    buyUnit: 'kg',
    packSize: 405, // 1 kg = 405 küp
    buyQty: 1,
    buyTotal: 60,
  },
  { id: 'kahve-toz', name: 'Türk kahvesi (toz)', icon: '🫘', unit: 'g', buyUnit: 'kg', buyQty: 1, buyTotal: 320 },
  { id: 'nescafe-toz', name: 'Nescafe (toz)', icon: '🥄', unit: 'g', buyUnit: 'g', buyQty: 200, buyTotal: 180 },
  { id: 'sut-tozu', name: 'Süt tozu / krema', icon: '🥛', unit: 'g', buyUnit: 'g', buyQty: 500, buyTotal: 150 },
  { id: 'oralet-toz', name: 'Oralet (toz)', icon: '🍋', unit: 'g', buyUnit: 'kg', buyQty: 1, buyTotal: 250 },
  {
    id: 'uclubir-poset',
    name: "3'ü 1 arada poşeti",
    icon: '📦',
    unit: 'adet',
    buyUnit: 'paket',
    packSize: 48,
    buyQty: 1,
    buyTotal: 240,
  },
  { id: 'ekmek', name: 'Ekmek', icon: '🍞', unit: 'adet', buyUnit: 'adet', buyQty: 20, buyTotal: 100 },
  { id: 'kasar', name: 'Kaşar peyniri', icon: '🧀', unit: 'g', buyUnit: 'kg', buyQty: 2, buyTotal: 500 },
]

export interface UrunTanim {
  id: string
  name: string
  icon: string
  category: string
  price: number
  /** Tarifli ürün. Miktarlar BİR PARTİ içindir, temel birimde. */
  recipe?: { yield: number; lines: { itemId: string; qty: number }[] }
  /** Al-sat ürün: aldığın gibi satarsın. */
  alsat?: { buyUnit: string; packSize?: number; buyQty: number; buyTotal: number }
  /** Bu ürün seçilirse gereken kalemler — hammadde veya başka ürün olabilir. */
  needs?: string[]
}

export const URUNLER: UrunTanim[] = [
  // ---------- SICAK (tarifli) ----------
  {
    id: 'cay-bardak',
    name: 'Çay',
    icon: '🍵',
    category: 'Sıcak',
    price: 20,
    // Demlik: 125 g çay -> 25 bardak. Bardak başı 2 küp şeker (25 x 2 = 50).
    recipe: {
      yield: 25,
      lines: [
        { itemId: 'cay', qty: 125 },
        { itemId: 'seker', qty: 50 },
      ],
    },
    needs: ['cay', 'seker'],
  },
  {
    id: 'turk-kahvesi',
    name: 'Türk Kahvesi',
    icon: '☕',
    category: 'Sıcak',
    price: 60,
    // Yanında verilen bardak su, sattığımız ürünün kendisi — tarifin içinde ürün var.
    recipe: {
      yield: 1,
      lines: [
        { itemId: 'kahve-toz', qty: 7 },
        { itemId: 'seker', qty: 1 },
        { itemId: 'bardak-su', qty: 1 },
      ],
    },
    needs: ['kahve-toz', 'seker', 'bardak-su'],
  },
  {
    id: 'nescafe',
    name: 'Nescafe',
    icon: '🍶',
    category: 'Sıcak',
    price: 60,
    recipe: {
      yield: 1,
      lines: [
        { itemId: 'nescafe-toz', qty: 2 },
        { itemId: 'sut-tozu', qty: 8 },
      ],
    },
    needs: ['nescafe-toz', 'sut-tozu'],
  },
  {
    id: 'uclubir',
    name: "3'ü 1 Arada",
    icon: '🥤',
    category: 'Sıcak',
    price: 20,
    recipe: { yield: 1, lines: [{ itemId: 'uclubir-poset', qty: 1 }] },
    needs: ['uclubir-poset'],
  },
  {
    id: 'oralet',
    name: 'Oralet',
    icon: '🍋',
    category: 'Sıcak',
    price: 20,
    recipe: { yield: 1, lines: [{ itemId: 'oralet-toz', qty: 15 }] },
    needs: ['oralet-toz'],
  },

  // ---------- YİYECEK (tarifli) ----------
  {
    id: 'tost',
    name: 'Kaşarlı Tost',
    icon: '🥪',
    category: 'Yiyecek',
    price: 100,
    // 1 tost = yarım ekmek + 60 g kaşar
    recipe: {
      yield: 1,
      lines: [
        { itemId: 'ekmek', qty: 0.5 },
        { itemId: 'kasar', qty: 60 },
      ],
    },
    needs: ['ekmek', 'kasar'],
  },

  // ---------- SOĞUK (al-sat) ----------
  {
    id: 'bardak-su',
    name: 'Bardak Su',
    icon: '🥛',
    category: 'Soğuk',
    price: 20,
    alsat: { buyUnit: 'koli', packSize: 40, buyQty: 1, buyTotal: 120 },
  },
  {
    id: 'pet-su',
    name: 'Pet Su',
    icon: '💧',
    category: 'Soğuk',
    price: 20,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 140 },
  },
  {
    id: 'sade-soda',
    name: 'Sade Soda',
    icon: '🫧',
    category: 'Soğuk',
    price: 20,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 260 },
  },
  {
    id: 'meyveli-soda',
    name: 'Meyveli Soda',
    icon: '🍊',
    category: 'Soğuk',
    price: 40,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 320 },
  },
  {
    id: 'gazoz',
    name: 'Gazoz',
    icon: '🍾',
    category: 'Soğuk',
    price: 60,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 375 },
  },
  {
    id: 'kola',
    name: 'Kola',
    icon: '🥤',
    category: 'Soğuk',
    price: 60,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 625 },
  },
  {
    id: 'fanta',
    name: 'Fanta',
    icon: '🍹',
    category: 'Soğuk',
    price: 60,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 625 },
  },
  {
    id: 'ayran',
    name: 'Ayran',
    icon: '🥛',
    category: 'Soğuk',
    price: 40,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 380 },
  },
  {
    id: 'meyve-suyu',
    name: 'Meyve Suyu',
    icon: '🧃',
    category: 'Soğuk',
    price: 60,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 600 },
  },
  {
    id: 'enerji',
    name: 'Enerji İçeceği',
    icon: '⚡',
    category: 'Soğuk',
    price: 100,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 900 },
  },
  {
    id: 'bardak-limonata',
    name: 'Bardak Limonata',
    icon: '🍋',
    category: 'Soğuk',
    price: 20,
    alsat: { buyUnit: 'koli', packSize: 40, buyQty: 1, buyTotal: 280 },
  },
]

/** Kurulumda varsayılan seçili gelenler: hepsi. Liste zaten dar. */
export const VARSAYILAN_SECILI = URUNLER.map((u) => u.id)

export const VARSAYILAN_AYLIK_GIDER = [
  { name: 'Kira', amount: 15000 },
  { name: 'Elektrik', amount: 3000 },
  { name: 'Su', amount: 600 },
  { name: 'Doğalgaz', amount: 1500 },
  { name: 'İnternet', amount: 500 },
  { name: 'Vergi / muhasebe', amount: 2000 },
  // Tarife girmeyen ama tükenen sarf malzemeleri — unutulursa kâr yüksek görünür.
  { name: 'Peçete', amount: 800 },
  { name: 'Temizlik / deterjan', amount: 600 },
  { name: 'Çöp poşeti', amount: 200 },
  { name: 'Kırılan bardak / fincan', amount: 500 },
  { name: 'Kayıp şişe (depozito kesintisi)', amount: 300 },
]

export const VARSAYILAN_GUNLUK_GIDER = [{ name: 'Eleman yevmiyesi', amount: 1000 }]

/**
 * Seçilen ürün id'lerinden Item listesi kurar.
 * Tarifin gerektirdiği hammaddeyi de, başka ürünü de (kahvenin yanındaki su gibi)
 * kendiliğinden ekler — eksik hammaddeyle ürün kurulamaz.
 */
export function urunleriKur(
  secili: string[],
  hamAlis: Record<string, { qty: number; total: number; packSize?: number }> = {},
  urunFiyat: Record<string, number> = {},
  alsatAlis: Record<string, { qty: number; total: number; packSize?: number }> = {},
): Item[] {
  // Tarifi olan ürün başka bir ürünü gerektiriyorsa (kahve -> bardak su) onu da seçime kat.
  const tamSecim = new Set(secili)
  for (const id of secili) {
    const u = URUNLER.find((x) => x.id === id)
    for (const n of u?.needs ?? []) {
      if (URUNLER.some((x) => x.id === n)) tamSecim.add(n)
    }
  }

  const gerekenHam = new Set<string>()
  for (const id of tamSecim) {
    const u = URUNLER.find((x) => x.id === id)
    for (const n of u?.needs ?? []) {
      if (HAMMADDELER.some((h) => h.id === n)) gerekenHam.add(n)
    }
  }

  const items: Item[] = []

  for (const hamId of gerekenHam) {
    const h = HAMMADDELER.find((x) => x.id === hamId)!
    const alis = hamAlis[hamId] ?? { qty: h.buyQty, total: h.buyTotal, packSize: h.packSize }
    const packSize = alis.packSize ?? h.packSize
    const base = alisToBase(alis.qty, h.unit, h.buyUnit, packSize)
    items.push({
      id: h.id,
      name: h.name,
      unit: h.unit,
      buyUnit: h.buyUnit,
      packSize,
      category: 'Hammadde',
      icon: h.icon,
      sellable: false,
      stock: base,
      minStock: Math.round(base * 0.2),
      lastCost: { total: alis.total, qty: base },
    })
  }

  for (const id of tamSecim) {
    const u = URUNLER.find((x) => x.id === id)
    if (!u) continue

    if (u.alsat) {
      const alis = alsatAlis[id] ?? {
        qty: u.alsat.buyQty,
        total: u.alsat.buyTotal,
        packSize: u.alsat.packSize,
      }
      const packSize = alis.packSize ?? u.alsat.packSize
      const base = alisToBase(alis.qty, 'adet', u.alsat.buyUnit, packSize)
      items.push({
        id: u.id,
        name: u.name,
        unit: 'adet',
        buyUnit: u.alsat.buyUnit,
        packSize,
        category: u.category,
        icon: u.icon,
        sellable: true,
        price: urunFiyat[id] ?? u.price,
        stock: base,
        minStock: Math.max(1, Math.round(base * 0.25)),
        lastCost: { total: alis.total, qty: base },
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
