import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  CashDay,
  Customer,
  Expense,
  Hizmet,
  Item,
  Order,
  Payment,
  PaymentPart,
  Sale,
  SaleLine,
  State,
  Table,
  Variant,
} from './types'
import { applyStock, unitCost, variantCost } from './lib/cost'
import { today, uid } from './lib/units'
import { bosState } from './seed'
import { dataKey } from './auth'
import { URUNLER } from './defaults'
import { cloudGet, cloudSet } from './lib/cloud'

/** Açık iş günü oturumu (başlatıldı, kapatılmadı). Yoksa gün kapalıdır. */
export function aktifOturum(s: State): CashDay | undefined {
  return s.cashDays.find((c) => c.openedAt && !c.closedAt)
}

/** Katalogda çeşidi olup kullanıcının kaydında henüz çeşidi olmayan ürünlere ekle. */
function cesitleriTamamla(items: Item[]): Item[] {
  return items.map((it) => {
    if (it.variants?.length) return it
    const kat = URUNLER.find((u) => u.id === it.id)
    return kat?.variants?.length ? { ...it, variants: kat.variants } : it
  })
}

// Ürün olarak girilmesi gereken sarf malzemeleri — aylık sabit giderden tek sefer temizlenir.
const SARF_GIDERLER = [
  'Peçete',
  'Temizlik / deterjan',
  'Çöp poşeti',
  'Kırılan bardak / fincan',
  'Kayıp şişe (depozito kesintisi)',
]

/** Eski kayıtta aylık sabit gidere düşmüş sarf malzemelerini tek sefer temizle. */
function sarfGideriTemizle(st: State): State {
  if (st.settings?.sarfTemizlendi) return st
  return {
    ...st,
    expenses: st.expenses.filter((e) => !(e.kind === 'aylik' && SARF_GIDERLER.includes(e.name))),
    settings: { ...st.settings, sarfTemizlendi: true },
  }
}

/** Ham State'i (yerel ya da buluttan) güncel şemaya normalize et. */
function normalize(raw: State): State {
  const st = { ...bosState, ...raw }
  // Eski müşteri kayıtlarında puan/bakiye olmayabilir — varsayılan 0.
  const customers = st.customers.map((c) => ({ puan: 0, bakiye: 0, ...c }))
  return sarfGideriTemizle({ ...st, customers, items: cesitleriTamamla(st.items) })
}

function load(userId: string): State {
  try {
    const raw = localStorage.getItem(dataKey(userId))
    if (raw) return normalize(JSON.parse(raw) as State)
  } catch {
    // bozuk kayıt: boş başla
  }
  return bosState
}

/** Satışa bağlı sadakat bilgisi: puan harcama + bakiye bırakma. */
export type Loyalty = { customerId: string; puanKullan: number; bakiyeBirak: number }

interface Store {
  s: State
  set: (fn: (s: State) => State) => void

  // ürün / stok
  saveItem: (item: Item) => void
  deleteItem: (id: string) => void
  addPurchase: (
    itemId: string,
    qty: number,
    total: number,
    supplier?: string,
    /** Alış birimi değiştiyse kalemin kartına da yansısın (koli -> adet gibi). */
    birim?: { buyUnit: string; packSize?: number },
    /** Kasadan nakit mi ödendi — beklenen kasadan düşülür. */
    paidCash?: boolean,
  ) => void
  addWaste: (itemId: string, qty: number, reason: 'fire' | 'ikram') => void

  // satış
  addToTable: (
    tableId: string,
    itemId: string,
    qty?: number,
    variant?: Variant,
    waste?: 'ikram' | 'fire',
  ) => void
  removeFromTable: (tableId: string, index: number) => void
  setTableQty: (tableId: string, index: number, qty: number) => void
  renameTable: (tableId: string, name: string) => void
  setTableCustomer: (tableId: string, customerId?: string) => void
  closeTable: (tableId: string, payment: Payment, customerId?: string, loyalty?: Loyalty) => void
  quickSale: (lines: SaleLine[], payment: Payment, customerId?: string, loyalty?: Loyalty) => void
  /** Parçalı ödeme: hesap bölünür, her parça ayrı ödenir. Veresiye parçası müşteriye yazılır. */
  paySplit: (lines: SaleLine[], parts: PaymentPart[], tableId?: string) => void
  cancelSale: (saleId: string) => void
  /** Yapılmış satışın satırlarını düzenle: stok ve veresiye bakiyesi yeniden hesaplanır. */
  editSale: (saleId: string, newLines: SaleLine[]) => void
  /** İptal edilen satışı geri getir (undo): stok yeniden düşer, veresiye borcu geri yazılır. */
  restoreSale: (sale: Sale) => void

  /** Müşteri sadakat ödülü/hizmeti al: puan (1 puan = 1 TL) + para karışık ödenir. */
  hizmetAl: (customerId: string, hizmet: Hizmet, puanKullan: number, paraPayment: 'nakit' | 'kart') => void

  // iş günü oturumu
  /** Günü başlat: açık oturum aç, açılış nakdini yaz. */
  startDay: (openingCash: number) => void
  /** Günü bitir: aktif oturumu kapat (kilitlemez, sadece kapatır). */
  endDay: (counted?: number) => void

  // müşteri
  saveCustomer: (c: Customer) => void
  collect: (customerId: string, amount: number, method: 'nakit' | 'kart') => void
  /** Bakiye tahsilatı (puanla ödenemez, yalnız nakit/kart). */
  collectBakiye: (customerId: string, amount: number, method: 'nakit' | 'kart') => void

  // gider / kasa
  saveExpense: (e: Expense) => void
  deleteExpense: (id: string) => void
  setOpeningCash: (amount: number) => void
  setCountedCash: (amount: number) => void

  // kurulum
  finishSetup: (patch: Pick<State, 'items' | 'expenses' | 'business'>) => void

  // --- sipariş (kıraathane → toptancı) ---
  /** Kıraathane: toptancıya gönderilen siparişi geçmişe kaydet. */
  saveOrder: (order: Order) => void
}

/** Hesap kapandı: masa boşalır, özel ismi ve müşterisi düşer, varsayılan adına döner. */
function bosalt(t: Table, tableId: string, index: number): Table {
  if (t.id !== tableId) return t
  return {
    ...t,
    lines: [],
    openedAt: undefined,
    customerId: undefined,
    name: `Masa ${index + 1}`,
  }
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [s, setS] = useState<State>(() => load(userId))
  // Bulut çekilene kadar buluta YAZMA — yoksa yeni cihazda boş state buluttaki
  // gerçek veriyi ezer. hydrate bitince true olur.
  const hydrated = useRef(false)

  // Her değişimde yerele yaz (kaynak). hydrate sonrası buluta da it (debounce).
  useEffect(() => {
    const k = dataKey(userId)
    localStorage.setItem(k, JSON.stringify(s))
    if (!hydrated.current) return
    const t = setTimeout(() => {
      const ts = new Date().toISOString()
      localStorage.setItem(k + ':ts', ts)
      void cloudSet(k, s, ts)
    }, 800)
    return () => clearTimeout(t)
  }, [s, userId])

  // Açılış: buluttan çek. Bulut daha yeniyse benimse; yerel daha yeni ya da
  // bulut boşsa yereli buluta it. Çevrimdışıysa sessizce yerelle devam.
  useEffect(() => {
    let alive = true
    const k = dataKey(userId)
    void (async () => {
      const localTs = localStorage.getItem(k + ':ts') ?? ''
      const cloud = await cloudGet(k)
      if (!alive) return
      if (cloud && cloud.value && (!localTs || cloud.updatedAt > localTs)) {
        localStorage.setItem(k, JSON.stringify(cloud.value))
        localStorage.setItem(k + ':ts', cloud.updatedAt)
        setS(normalize(cloud.value as State))
      } else if (!cloud || (localTs && localTs > cloud.updatedAt)) {
        const ts = localTs || new Date().toISOString()
        localStorage.setItem(k + ':ts', ts)
        const raw = localStorage.getItem(k)
        if (raw) void cloudSet(k, JSON.parse(raw), ts)
      }
      hydrated.current = true
    })()
    return () => {
      alive = false
    }
  }, [userId])

  // Ekrana geri dönünce buluttan tazele — veri hep güncel kalsın (başka cihaz yazmışsa al).
  useEffect(() => {
    const k = dataKey(userId)
    const yenile = async () => {
      if (document.visibilityState !== 'visible' || !hydrated.current) return
      const localTs = localStorage.getItem(k + ':ts') ?? ''
      const cloud = await cloudGet(k)
      if (cloud && cloud.value && (!localTs || cloud.updatedAt > localTs)) {
        localStorage.setItem(k, JSON.stringify(cloud.value))
        localStorage.setItem(k + ':ts', cloud.updatedAt)
        setS(normalize(cloud.value as State))
      }
    }
    document.addEventListener('visibilitychange', yenile)
    return () => document.removeEventListener('visibilitychange', yenile)
  }, [userId])

  const store = useMemo<Store>(() => {
    const set = (fn: (s: State) => State) => setS(fn)

    /** Satış satırı kur: fiyat ve o anki maliyet satırın içine donar. */
    const mkLine = (
      items: Item[],
      itemId: string,
      qty: number,
      variant?: Variant,
      waste?: 'ikram' | 'fire',
    ): SaleLine | null => {
      const item = items.find((i) => i.id === itemId)
      if (!item) return null
      const etiket = waste === 'ikram' ? 'İkram' : waste === 'fire' ? 'Zayi' : undefined
      return {
        itemId,
        name: etiket
          ? `${item.name} (${etiket})`
          : variant
            ? `${item.name} (${variant.name})`
            : item.name,
        qty,
        // İkram/zayi bedava: fiyat 0, gelir oluşmaz. Maliyet yine düşülür.
        unitPrice: waste ? 0 : (item.price ?? 0) + (variant?.priceDelta ?? 0),
        unitCost: variantCost(itemId, items, variant),
        variantId: variant?.id,
        variantName: variant?.name,
        waste,
      }
    }

    /** Satırın çeşidini ürün kartından bul — stok düşerken lazım. */
    const variantOf = (items: Item[], l: SaleLine): Variant | undefined =>
      l.variantId
        ? items.find((i) => i.id === l.itemId)?.variants?.find((v) => v.id === l.variantId)
        : undefined

    /** Loyalty sonrası fiilen tahsil edilecek net tutar (commitSale ile aynı clamp). */
    const netTutar = (
      st: State,
      total: number,
      loyalty?: { customerId: string; puanKullan: number; bakiyeBirak: number },
    ): number => {
      if (!loyalty) return total
      const c = st.customers.find((x) => x.id === loyalty.customerId)
      const puanKullan = Math.max(0, Math.min(loyalty.puanKullan, c?.puan ?? 0, total))
      const bakiyeBirak = Math.max(0, Math.min(loyalty.bakiyeBirak, Math.floor(total * 0.1)))
      return Math.max(0, total - puanKullan - bakiyeBirak)
    }

    /** Ortak satış kaydı. parts verilirse hesap parçalı ödenmiştir. */
    const commitSale = (
      st: State,
      lines: SaleLine[],
      parts: PaymentPart[],
      tableId?: string,
      tableName?: string,
      loyalty?: { customerId: string; puanKullan: number; bakiyeBirak: number },
    ): State => {
      if (lines.length === 0 || parts.length === 0) return st

      let items = st.items
      for (const l of lines) items = applyStock(items, l.itemId, l.qty, variantOf(st.items, l))

      const total = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
      const cost = lines.reduce((n, l) => n + l.qty * l.unitCost, 0)

      // Veresiye parçalarının tutarı ilgili müşterinin borcuna yazılır.
      let customers = st.customers
      for (const p of parts) {
        if (p.payment !== 'veresiye' || !p.customerId) continue
        customers = customers.map((c) =>
          c.id === p.customerId ? { ...c, balance: c.balance + p.amount } : c,
        )
      }

      const veresiyeParca = parts.find((p) => p.payment === 'veresiye')

      // --- Sadakat puanı + bakiye ---
      // Puan/bakiye müşterisi: açık loyalty > veresiye müşterisi.
      const puanCid = loyalty?.customerId ?? veresiyeParca?.customerId
      const puanKazan = Math.round(total * 0.01) // %1, 1 puan = 1 TL
      let puanKullanilan = 0
      let bakiyeBirakilan = 0
      if (puanCid) {
        const c = customers.find((x) => x.id === puanCid)
        const mevcutPuan = c?.puan ?? 0
        // Savunmacı clamp: UI zaten sınırlar ama yine de doğrula.
        puanKullanilan = Math.max(0, Math.min(loyalty?.puanKullan ?? 0, mevcutPuan, total))
        bakiyeBirakilan = Math.max(0, Math.min(loyalty?.bakiyeBirak ?? 0, Math.floor(total * 0.1)))
        customers = customers.map((x) =>
          x.id === puanCid
            ? {
                ...x,
                puan: Math.max(0, (x.puan ?? 0) + puanKazan - puanKullanilan),
                bakiye: (x.bakiye ?? 0) + bakiyeBirakilan,
              }
            : x,
        )
      }

      return {
        ...st,
        items,
        customers,
        sales: [
          ...st.sales,
          {
            id: uid(),
            date: new Date().toISOString(),
            lines,
            total,
            cost,
            payment: parts[0].payment,
            // Loyalty kullanıldıysa payments'ı her zaman yaz: hareket sentezi net'i şişirmesin.
            payments: parts.length > 1 || puanCid ? parts : undefined,
            customerId: veresiyeParca?.customerId,
            puanKazanilan: puanCid ? puanKazan : undefined,
            puanKullanilan: puanKullanilan || undefined,
            bakiyeBirakilan: bakiyeBirakilan || undefined,
            puanMusteriId: puanCid,
            tableId,
            tableName,
            bizDay: aktifOturum(st)?.date ?? today(),
          },
        ],
      }
    }

    return {
      s,
      set,

      saveItem: (item) =>
        set((st) => ({
          ...st,
          items: st.items.some((i) => i.id === item.id)
            ? st.items.map((i) => (i.id === item.id ? item : i))
            : [...st.items, item],
        })),

      deleteItem: (id) =>
        set((st) => ({
          ...st,
          items: st.items.filter((i) => i.id !== id),
        })),

      addPurchase: (itemId, qty, total, supplier, birim, paidCash) =>
        set((st) => ({
          ...st,
          // Son alış maliyeti = bu alış. Ortalama yok.
          items: st.items.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  stock: i.stock + qty,
                  lastCost: { total, qty },
                  buyUnit: birim?.buyUnit ?? i.buyUnit,
                  packSize: birim?.packSize ?? i.packSize,
                }
              : i,
          ),
          purchases: [
            ...st.purchases,
            {
              id: uid(),
              date: new Date().toISOString(),
              itemId,
              qty,
              total,
              supplier,
              paidCash: paidCash ?? false,
              bizDay: aktifOturum(st)?.date ?? today(),
            },
          ],
        })),

      addWaste: (itemId, qty, reason) =>
        set((st) => {
          const item = st.items.find((i) => i.id === itemId)
          if (!item) return st
          const cost = unitCost(itemId, st.items) * qty
          return {
            ...st,
            items: applyStock(st.items, itemId, qty),
            wastes: [
              ...st.wastes,
              {
                id: uid(),
                date: new Date().toISOString(),
                itemId,
                name: item.name,
                qty,
                reason,
                cost,
                bizDay: aktifOturum(st)?.date ?? today(),
              },
            ],
          }
        }),

      addToTable: (tableId, itemId, qty = 1, variant, waste) =>
        set((st) => ({
          ...st,
          tables: st.tables.map((t) => {
            if (t.id !== tableId) return t
            const line = mkLine(st.items, itemId, qty, variant, waste)
            if (!line) return t
            // Aynı ürünün farklı çeşidi ayrı satır olur — duble çay ile açık çay karışmasın.
            // İkram/zayi satırı da ücretli satırla birleşmez.
            const idx = t.lines.findIndex(
              (l) => l.itemId === itemId && l.variantId === variant?.id && l.waste === waste,
            )
            const lines =
              idx >= 0
                ? t.lines.map((l, i) => (i === idx ? { ...l, qty: l.qty + qty } : l))
                : [...t.lines, line]
            return { ...t, lines, openedAt: t.openedAt ?? new Date().toISOString() }
          }),
        })),

      removeFromTable: (tableId, index) =>
        set((st) => ({
          ...st,
          tables: st.tables.map((t) => {
            if (t.id !== tableId) return t
            const lines = t.lines
              .map((l, i) => (i === index ? { ...l, qty: l.qty - 1 } : l))
              .filter((l) => l.qty > 0)
            return { ...t, lines, openedAt: lines.length ? t.openedAt : undefined }
          }),
        })),

      setTableQty: (tableId, index, qty) =>
        set((st) => ({
          ...st,
          tables: st.tables.map((t) => {
            if (t.id !== tableId) return t
            const lines = t.lines
              .map((l, i) => (i === index ? { ...l, qty } : l))
              .filter((l) => l.qty > 0)
            return { ...t, lines, openedAt: lines.length ? t.openedAt : undefined }
          }),
        })),

      renameTable: (tableId, name) =>
        set((st) => ({
          ...st,
          tables: st.tables.map((t) => (t.id === tableId ? { ...t, name } : t)),
        })),

      setTableCustomer: (tableId, customerId) =>
        set((st) => ({
          ...st,
          tables: st.tables.map((t) => (t.id === tableId ? { ...t, customerId } : t)),
        })),

      closeTable: (tableId, payment, customerId, loyalty) =>
        set((st) => {
          const table = st.tables.find((t) => t.id === tableId)
          if (!table || table.lines.length === 0) return st
          const total = table.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
          const net = netTutar(st, total, loyalty)
          const next = commitSale(
            st,
            table.lines,
            [{ payment, amount: net, customerId }],
            tableId,
            table.name,
            loyalty,
          )
          return { ...next, tables: next.tables.map((t, i) => bosalt(t, tableId, i)) }
        }),

      quickSale: (lines, payment, customerId, loyalty) =>
        set((st) => {
          const total = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
          const net = netTutar(st, total, loyalty)
          return commitSale(st, lines, [{ payment, amount: net, customerId }], undefined, undefined, loyalty)
        }),

      paySplit: (lines, parts, tableId) =>
        set((st) => {
          const tableName = tableId ? st.tables.find((t) => t.id === tableId)?.name : undefined
          const next = commitSale(st, lines, parts, tableId, tableName)
          if (!tableId) return next
          return { ...next, tables: next.tables.map((t, i) => bosalt(t, tableId, i)) }
        }),

      /** Yanlış satışı geri al: stok geri döner, veresiyeyse borç silinir. */
      cancelSale: (saleId) =>
        set((st) => {
          const sale = st.sales.find((x) => x.id === saleId)
          if (!sale) return st

          let items = st.items
          for (const l of sale.lines) {
            const v = l.variantId
              ? st.items.find((i) => i.id === l.itemId)?.variants?.find((x) => x.id === l.variantId)
              : undefined
            items = applyStock(items, l.itemId, -l.qty, v)
          }

          // Parçalı ödemede her veresiye parçası ayrı müşteriden düşer.
          const parts = sale.payments ?? [
            { payment: sale.payment, amount: sale.total, customerId: sale.customerId },
          ]
          let customers = st.customers
          for (const p of parts) {
            if (p.payment !== 'veresiye' || !p.customerId) continue
            customers = customers.map((c) =>
              c.id === p.customerId ? { ...c, balance: c.balance - p.amount } : c,
            )
          }

          // Puan/bakiye geri al: kazandırılan puan silinir, harcanan puan iade, bakiye düşer.
          if (sale.puanMusteriId) {
            customers = customers.map((c) =>
              c.id === sale.puanMusteriId
                ? {
                    ...c,
                    puan: Math.max(0, (c.puan ?? 0) - (sale.puanKazanilan ?? 0) + (sale.puanKullanilan ?? 0)),
                    bakiye: Math.max(0, (c.bakiye ?? 0) - (sale.bakiyeBirakilan ?? 0)),
                  }
                : c,
            )
          }

          return {
            ...st,
            items,
            customers,
            sales: st.sales.filter((x) => x.id !== saleId),
          }
        }),

      /** Satış düzenle: eski stok/borç geri alınır, yeni satırlar uygulanır. */
      editSale: (saleId, newLines) =>
        set((st) => {
          const sale = st.sales.find((x) => x.id === saleId)
          if (!sale) return st

          // 1) Eski satırların stoğunu geri yükle.
          let items = st.items
          for (const l of sale.lines) {
            const v = l.variantId
              ? st.items.find((i) => i.id === l.itemId)?.variants?.find((x) => x.id === l.variantId)
              : undefined
            items = applyStock(items, l.itemId, -l.qty, v)
          }
          // 2) Yeni satırların stoğunu düş.
          for (const l of newLines) {
            const v = l.variantId
              ? items.find((i) => i.id === l.itemId)?.variants?.find((x) => x.id === l.variantId)
              : undefined
            items = applyStock(items, l.itemId, l.qty, v)
          }

          const oldTotal = sale.total
          const newTotal = newLines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
          const newCost = newLines.reduce((n, l) => n + l.qty * l.unitCost, 0)

          const oldParts = sale.payments ?? [
            { payment: sale.payment, amount: sale.total, customerId: sale.customerId },
          ]

          // 3) Eski veresiye borçlarını geri al.
          let customers = st.customers
          for (const p of oldParts) {
            if (p.payment !== 'veresiye' || !p.customerId) continue
            customers = customers.map((c) =>
              c.id === p.customerId ? { ...c, balance: c.balance - p.amount } : c,
            )
          }

          // 4) Yeni parçalar: eski oranlar korunur, tutarlar yeni toplama göre ölçeklenir.
          let newParts: PaymentPart[]
          if (oldTotal > 0) {
            const k = newTotal / oldTotal
            newParts = oldParts.map((p) => ({ ...p, amount: Math.round(p.amount * k * 100) / 100 }))
            // Yuvarlama sapması ilk parçaya yazılır.
            const drift = Math.round((newTotal - newParts.reduce((a, p) => a + p.amount, 0)) * 100) / 100
            if (newParts.length) {
              newParts[0] = { ...newParts[0], amount: Math.round((newParts[0].amount + drift) * 100) / 100 }
            }
          } else {
            newParts = [{ payment: sale.payment, amount: newTotal, customerId: sale.customerId }]
          }

          // 5) Yeni veresiye borçlarını uygula.
          for (const p of newParts) {
            if (p.payment !== 'veresiye' || !p.customerId) continue
            customers = customers.map((c) =>
              c.id === p.customerId ? { ...c, balance: c.balance + p.amount } : c,
            )
          }

          // 6) Kazanılan puanı yeni toplama göre güncelle (harcanan puan/bakiye kullanıcı seçimi, aynı kalır).
          const yeniPuanKazan = Math.round(newTotal * 0.01)
          if (sale.puanMusteriId) {
            customers = customers.map((c) =>
              c.id === sale.puanMusteriId
                ? { ...c, puan: Math.max(0, (c.puan ?? 0) - (sale.puanKazanilan ?? 0) + yeniPuanKazan) }
                : c,
            )
          }

          const veresiyeParca = newParts.find((p) => p.payment === 'veresiye')
          const updated = {
            ...sale,
            lines: newLines,
            total: newTotal,
            cost: newCost,
            payment: newParts[0].payment,
            payments: newParts.length > 1 || sale.puanMusteriId ? newParts : undefined,
            customerId: veresiyeParca?.customerId,
            puanKazanilan: sale.puanMusteriId ? yeniPuanKazan : undefined,
          }

          return { ...st, items, customers, sales: st.sales.map((x) => (x.id === saleId ? updated : x)) }
        }),

      /** İptali geri al: stok yeniden düşülür, veresiye borcu geri yazılır, satış listeye döner. */
      restoreSale: (sale) =>
        set((st) => {
          if (st.sales.some((x) => x.id === sale.id)) return st

          let items = st.items
          for (const l of sale.lines) items = applyStock(items, l.itemId, l.qty, variantOf(st.items, l))

          const parts = sale.payments ?? [
            { payment: sale.payment, amount: sale.total, customerId: sale.customerId },
          ]
          let customers = st.customers
          for (const p of parts) {
            if (p.payment !== 'veresiye' || !p.customerId) continue
            customers = customers.map((c) =>
              c.id === p.customerId ? { ...c, balance: c.balance + p.amount } : c,
            )
          }

          // Puan/bakiye yeniden uygula (iptalin tersi).
          if (sale.puanMusteriId) {
            customers = customers.map((c) =>
              c.id === sale.puanMusteriId
                ? {
                    ...c,
                    puan: Math.max(0, (c.puan ?? 0) + (sale.puanKazanilan ?? 0) - (sale.puanKullanilan ?? 0)),
                    bakiye: (c.bakiye ?? 0) + (sale.bakiyeBirakilan ?? 0),
                  }
                : c,
            )
          }

          return { ...st, items, customers, sales: [...st.sales, sale] }
        }),

      /** Müşteri ödülü/hizmeti al: puan (1p=1TL) + kalan para. Puan indirim, para ciroya girer. */
      hizmetAl: (customerId, hizmet, puanKullan, paraPayment) =>
        set((st) => {
          const c = st.customers.find((x) => x.id === customerId)
          if (!c) return st
          // Kullanılabilecek puan: istenen, müşterinin bakiyesi ve hizmet fiyatıyla sınırlı.
          const puan = Math.max(0, Math.min(puanKullan, c.puan ?? 0, hizmet.fiyat))
          const paraTutar = Math.round((hizmet.fiyat - puan) * 100) / 100

          const customers = st.customers.map((x) =>
            x.id === customerId ? { ...x, puan: Math.max(0, (x.puan ?? 0) - puan) } : x,
          )

          return {
            ...st,
            customers,
            sales: [
              ...st.sales,
              {
                id: uid(),
                date: new Date().toISOString(),
                lines: [
                  { itemId: 'hizmet', name: hizmet.ad, qty: 1, unitPrice: paraTutar, unitCost: 0 },
                ],
                total: paraTutar,
                cost: 0,
                payment: paraPayment,
                // Puan kısmı bu satışta harcandı — çift kazanım olmasın diye commitSale'den geçmez.
                puanKullanilan: puan || undefined,
                puanMusteriId: customerId,
                bizDay: aktifOturum(st)?.date ?? today(),
              },
            ],
          }
        }),

      saveCustomer: (c) =>
        set((st) => ({
          ...st,
          customers: st.customers.some((x) => x.id === c.id)
            ? st.customers.map((x) => (x.id === c.id ? c : x))
            : [...st.customers, c],
        })),

      collect: (customerId, amount, method) =>
        set((st) => ({
          ...st,
          customers: st.customers.map((c) =>
            c.id === customerId ? { ...c, balance: c.balance - amount } : c,
          ),
          payments: [
            ...st.payments,
            {
              id: uid(),
              date: new Date().toISOString(),
              customerId,
              amount,
              method,
              bizDay: aktifOturum(st)?.date ?? today(),
            },
          ],
        })),

      // Bakiye tahsilatı: puanla ödenemez, yalnız nakit/kart. Ayrı bakiye alanını düşürür.
      collectBakiye: (customerId, amount, method) =>
        set((st) => ({
          ...st,
          customers: st.customers.map((c) =>
            c.id === customerId ? { ...c, bakiye: Math.max(0, (c.bakiye ?? 0) - amount) } : c,
          ),
          payments: [
            ...st.payments,
            {
              id: uid(),
              date: new Date().toISOString(),
              customerId,
              amount,
              method,
              bizDay: aktifOturum(st)?.date ?? today(),
            },
          ],
        })),

      saveExpense: (e) =>
        set((st) => ({
          ...st,
          expenses: st.expenses.some((x) => x.id === e.id)
            ? st.expenses.map((x) => (x.id === e.id ? e : x))
            : [...st.expenses, e],
        })),

      deleteExpense: (id) =>
        set((st) => ({ ...st, expenses: st.expenses.filter((e) => e.id !== id) })),

      setOpeningCash: (amount) =>
        set((st) => {
          // Açık oturum varsa onun gününe yaz — rapor/Kasa da o günü okur (gece yarısı sapması önlenir).
          const d = aktifOturum(st)?.date ?? today()
          return {
            ...st,
            cashDays: st.cashDays.some((c) => c.date === d)
              ? st.cashDays.map((c) => (c.date === d ? { ...c, opening: amount } : c))
              : [...st.cashDays, { date: d, opening: amount }],
          }
        }),

      setCountedCash: (amount) =>
        set((st) => {
          const d = aktifOturum(st)?.date ?? today()
          return {
            ...st,
            cashDays: st.cashDays.some((c) => c.date === d)
              ? st.cashDays.map((c) => (c.date === d ? { ...c, counted: amount } : c))
              : [...st.cashDays, { date: d, opening: 0, counted: amount }],
          }
        }),

      startDay: (openingCash) =>
        set((st) => {
          const d = today()
          const now = new Date().toISOString()
          const varMi = st.cashDays.some((c) => c.date === d)
          return {
            ...st,
            cashDays: varMi
              ? st.cashDays.map((c) =>
                  c.date === d
                    ? { ...c, opening: openingCash, openedAt: now, closedAt: undefined }
                    : c,
                )
              : [...st.cashDays, { date: d, opening: openingCash, openedAt: now }],
          }
        }),

      endDay: (counted) =>
        set((st) => {
          const acik = aktifOturum(st)
          if (!acik) return st
          const now = new Date().toISOString()
          return {
            ...st,
            cashDays: st.cashDays.map((c) =>
              c.date === acik.date
                ? { ...c, closedAt: now, counted: counted ?? c.counted }
                : c,
            ),
          }
        }),

      finishSetup: (patch) =>
        set((st) => ({
          ...st,
          items: patch.items,
          expenses: patch.expenses,
          business: patch.business,
          setupDone: true,
        })),

      // --- sipariş (kıraathane → toptancı) ---
      saveOrder: (order) =>
        set((st) => ({
          ...st,
          orders: (st.orders ?? []).some((o) => o.id === order.id)
            ? (st.orders ?? []).map((o) => (o.id === order.id ? order : o))
            : [...(st.orders ?? []), order],
        })),
    }
  }, [s])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const c = useContext(Ctx)
  if (!c) throw new Error('StoreProvider yok')
  return c
}
