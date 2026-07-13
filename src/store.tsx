import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  Customer,
  Expense,
  Item,
  Payment,
  SaleLine,
  State,
} from './types'
import { applyStock, unitCost } from './lib/cost'
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
  addPurchase: (itemId: string, qty: number, total: number, supplier?: string) => void
  addWaste: (itemId: string, qty: number, reason: 'fire' | 'ikram') => void

  // satış
  addToTable: (tableId: string, itemId: string, qty?: number) => void
  removeFromTable: (tableId: string, index: number) => void
  setTableQty: (tableId: string, index: number, qty: number) => void
  closeTable: (tableId: string, payment: Payment, customerId?: string) => void
  quickSale: (lines: SaleLine[], payment: Payment, customerId?: string) => void

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

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [s, setS] = useState<State>(() => load(userId))

  useEffect(() => {
    localStorage.setItem(dataKey(userId), JSON.stringify(s))
  }, [s, userId])

  const store = useMemo<Store>(() => {
    const set = (fn: (s: State) => State) => setS(fn)

    /** Satış satırı kur: fiyat ve o anki maliyet satırın içine donar. */
    const mkLine = (items: Item[], itemId: string, qty: number): SaleLine | null => {
      const item = items.find((i) => i.id === itemId)
      if (!item) return null
      return {
        itemId,
        name: item.name,
        qty,
        unitPrice: item.price ?? 0,
        unitCost: unitCost(itemId, items),
      }
    }

    const commitSale = (
      st: State,
      lines: SaleLine[],
      payment: Payment,
      customerId?: string,
      tableId?: string,
    ): State => {
      if (lines.length === 0) return st
      let items = st.items
      for (const l of lines) items = applyStock(items, l.itemId, l.qty)

      const total = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
      const cost = lines.reduce((n, l) => n + l.qty * l.unitCost, 0)

      const customers =
        payment === 'veresiye' && customerId
          ? st.customers.map((c) =>
              c.id === customerId ? { ...c, balance: c.balance + total } : c,
            )
          : st.customers

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
            payment,
            customerId,
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

      addPurchase: (itemId, qty, total, supplier) =>
        set((st) => ({
          ...st,
          // Son alış maliyeti = bu alış. Ortalama yok.
          items: st.items.map((i) =>
            i.id === itemId ? { ...i, stock: i.stock + qty, lastCost: { total, qty } } : i,
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

      addToTable: (tableId, itemId, qty = 1) =>
        set((st) => ({
          ...st,
          tables: st.tables.map((t) => {
            if (t.id !== tableId) return t
            const line = mkLine(st.items, itemId, qty)
            if (!line) return t
            const idx = t.lines.findIndex((l) => l.itemId === itemId)
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

      closeTable: (tableId, payment, customerId) =>
        set((st) => {
          const table = st.tables.find((t) => t.id === tableId)
          if (!table || table.lines.length === 0) return st
          const next = commitSale(st, table.lines, payment, customerId, tableId)
          return {
            ...next,
            tables: next.tables.map((t) =>
              t.id === tableId ? { ...t, lines: [], openedAt: undefined } : t,
            ),
          }
        }),

      quickSale: (lines, payment, customerId) =>
        set((st) => commitSale(st, lines, payment, customerId)),

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
