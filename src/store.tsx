import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  Customer,
  Expense,
  Item,
  Payment,
  PaymentPart,
  SaleLine,
  State,
  Table,
  Variant,
} from './types'
import { applyStock, unitCost, variantCost } from './lib/cost'
import { today, uid } from './lib/units'
import { bosState } from './seed'
import { dataKey } from './auth'

function load(userId: string): State {
  try {
    const raw = localStorage.getItem(dataKey(userId))
    if (raw) return { ...bosState, ...(JSON.parse(raw) as State) }
  } catch {
    // bozuk kayıt: boş başla
  }
  return bosState
}

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
  ) => void
  addWaste: (itemId: string, qty: number, reason: 'fire' | 'ikram') => void

  // satış
  addToTable: (tableId: string, itemId: string, qty?: number, variant?: Variant) => void
  removeFromTable: (tableId: string, index: number) => void
  setTableQty: (tableId: string, index: number, qty: number) => void
  renameTable: (tableId: string, name: string) => void
  setTableCustomer: (tableId: string, customerId?: string) => void
  closeTable: (tableId: string, payment: Payment, customerId?: string) => void
  quickSale: (lines: SaleLine[], payment: Payment, customerId?: string) => void
  /** Parçalı ödeme: hesap bölünür, her parça ayrı ödenir. Veresiye parçası müşteriye yazılır. */
  paySplit: (lines: SaleLine[], parts: PaymentPart[], tableId?: string) => void
  cancelSale: (saleId: string) => void

  // müşteri
  saveCustomer: (c: Customer) => void
  collect: (customerId: string, amount: number, method: 'nakit' | 'kart') => void

  // gider / kasa
  saveExpense: (e: Expense) => void
  deleteExpense: (id: string) => void
  setOpeningCash: (amount: number) => void
  setCountedCash: (amount: number) => void

  // kurulum
  finishSetup: (patch: Pick<State, 'items' | 'expenses' | 'business'>) => void
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

  useEffect(() => {
    localStorage.setItem(dataKey(userId), JSON.stringify(s))
  }, [s, userId])

  const store = useMemo<Store>(() => {
    const set = (fn: (s: State) => State) => setS(fn)

    /** Satış satırı kur: fiyat ve o anki maliyet satırın içine donar. */
    const mkLine = (
      items: Item[],
      itemId: string,
      qty: number,
      variant?: Variant,
    ): SaleLine | null => {
      const item = items.find((i) => i.id === itemId)
      if (!item) return null
      return {
        itemId,
        name: variant ? `${item.name} (${variant.name})` : item.name,
        qty,
        unitPrice: (item.price ?? 0) + (variant?.priceDelta ?? 0),
        unitCost: variantCost(itemId, items, variant),
        variantId: variant?.id,
        variantName: variant?.name,
      }
    }

    /** Satırın çeşidini ürün kartından bul — stok düşerken lazım. */
    const variantOf = (items: Item[], l: SaleLine): Variant | undefined =>
      l.variantId
        ? items.find((i) => i.id === l.itemId)?.variants?.find((v) => v.id === l.variantId)
        : undefined

    /** Ortak satış kaydı. parts verilirse hesap parçalı ödenmiştir. */
    const commitSale = (
      st: State,
      lines: SaleLine[],
      parts: PaymentPart[],
      tableId?: string,
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
            payments: parts.length > 1 ? parts : undefined,
            customerId: veresiyeParca?.customerId,
            tableId,
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

      addPurchase: (itemId, qty, total, supplier, birim) =>
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
            { id: uid(), date: new Date().toISOString(), itemId, qty, total, supplier },
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
              },
            ],
          }
        }),

      addToTable: (tableId, itemId, qty = 1, variant) =>
        set((st) => ({
          ...st,
          tables: st.tables.map((t) => {
            if (t.id !== tableId) return t
            const line = mkLine(st.items, itemId, qty, variant)
            if (!line) return t
            // Aynı ürünün farklı çeşidi ayrı satır olur — duble çay ile açık çay karışmasın.
            const idx = t.lines.findIndex(
              (l) => l.itemId === itemId && l.variantId === variant?.id,
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

      closeTable: (tableId, payment, customerId) =>
        set((st) => {
          const table = st.tables.find((t) => t.id === tableId)
          if (!table || table.lines.length === 0) return st
          const total = table.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
          const next = commitSale(
            st,
            table.lines,
            [{ payment, amount: total, customerId }],
            tableId,
          )
          return { ...next, tables: next.tables.map((t, i) => bosalt(t, tableId, i)) }
        }),

      quickSale: (lines, payment, customerId) =>
        set((st) => {
          const total = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
          return commitSale(st, lines, [{ payment, amount: total, customerId }])
        }),

      paySplit: (lines, parts, tableId) =>
        set((st) => {
          const next = commitSale(st, lines, parts, tableId)
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

          return {
            ...st,
            items,
            customers,
            sales: st.sales.filter((x) => x.id !== saleId),
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
            { id: uid(), date: new Date().toISOString(), customerId, amount, method },
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
          const d = today()
          return {
            ...st,
            cashDays: st.cashDays.some((c) => c.date === d)
              ? st.cashDays.map((c) => (c.date === d ? { ...c, opening: amount } : c))
              : [...st.cashDays, { date: d, opening: amount }],
          }
        }),

      setCountedCash: (amount) =>
        set((st) => {
          const d = today()
          return {
            ...st,
            cashDays: st.cashDays.some((c) => c.date === d)
              ? st.cashDays.map((c) => (c.date === d ? { ...c, counted: amount } : c))
              : [...st.cashDays, { date: d, opening: 0, counted: amount }],
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
    }
  }, [s])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const c = useContext(Ctx)
  if (!c) throw new Error('StoreProvider yok')
  return c
}
