// Temel birimler. Alışlar kg/lt/paket ile girilse de her şey burada saklanır.
export type Unit = 'g' | 'ml' | 'adet'

export interface RecipeLine {
  itemId: string
  /** Tarifin tamamı (bir parti) için gereken miktar, temel birimde. */
  qty: number
}

export interface Recipe {
  lines: RecipeLine[]
  /** Bir partiden kaç porsiyon/adet çıkar. Demlik: 119 g çay -> 25 bardak. */
  yield: number
}

export interface Item {
  id: string
  name: string
  unit: Unit
  category: string
  icon: string
  /** Satış ekranında çıkar mı. */
  sellable: boolean
  price?: number
  /** Tarifli ürünün kendi stoğu tutulmaz; satışta içindekiler düşer. */
  recipe?: Recipe
  stock: number
  minStock?: number
  /** Son alış: maliyet bundan hesaplanır (ortalama yok). */
  lastCost?: { total: number; qty: number }
}

export interface Purchase {
  id: string
  date: string
  itemId: string
  qty: number
  total: number
  supplier?: string
}

export interface SaleLine {
  itemId: string
  name: string
  qty: number
  unitPrice: number
  unitCost: number
}

export type Payment = 'nakit' | 'kart' | 'veresiye'

export interface Sale {
  id: string
  date: string
  lines: SaleLine[]
  total: number
  cost: number
  payment: Payment
  customerId?: string
  tableId?: string
}

export interface Table {
  id: string
  name: string
  lines: SaleLine[]
  openedAt?: string
}

export interface Customer {
  id: string
  name: string
  phone?: string
  /** Pozitif = bize borçlu. */
  balance: number
}

export interface CustomerPayment {
  id: string
  date: string
  customerId: string
  amount: number
  method: 'nakit' | 'kart'
}

export interface Expense {
  id: string
  date: string
  name: string
  amount: number
  /** aylik = sabit gider, güne bölünür. gunluk = o gün elden çıkan para. */
  kind: 'gunluk' | 'aylik'
  paidCash: boolean
}

export interface Waste {
  id: string
  date: string
  itemId: string
  name: string
  qty: number
  reason: 'fire' | 'ikram'
  cost: number
}

export interface CashDay {
  /** YYYY-MM-DD */
  date: string
  /** Gün başı fiziki nakit (para üstü). */
  opening: number
  /** Gün sonu sayılan nakit. */
  counted?: number
}

export interface State {
  items: Item[]
  purchases: Purchase[]
  sales: Sale[]
  tables: Table[]
  customers: Customer[]
  payments: CustomerPayment[]
  expenses: Expense[]
  wastes: Waste[]
  cashDays: CashDay[]
  settings: { businessName: string; showImages: boolean }
}
