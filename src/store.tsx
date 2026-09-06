import {
  createContext,
  useCallback,
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
import { applyStock, applyStockRaw, unitCost, variantCost, variantExplode } from './lib/cost'
import { round, today, uid } from './lib/units'
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

// NOT: Burada bir zamanlar `sarfGideriTemizle` vardı — adı sabit bir listeyle
// eşleşen aylık giderleri (Peçete, Çöp poşeti, ...) sormadan ve haber vermeden
// siliyordu. Kullanıcının KENDİ girdiği gider de bu adlardan biriyse siliniyor,
// sabit gider payı düşüyor ve geçmiş dahil bütün günlerin net kârı sessizce
// yükseliyordu. Göç zaten tüm kurulumlarda bir kez çalıştı; kaldırıldı.
// `settings.sarfTemizlendi` alanı eski kayıtlarda duruyor, okunmuyor.

/**
 * Ham State'i (yerel, buluttan ya da yedek dosyasından) güncel şemaya normalize et.
 * Yedek geri yükleme de bunu kullanmak zorunda: eski bir yedekte `settings` gibi
 * alanlar hiç olmayabiliyor ve uygulama açılışta patlıyordu.
 */
export function normalize(raw: State): State {
  const st = { ...bosState, ...raw }
  return { ...st, items: cesitleriTamamla(st.items) }
}

/**
 * Son `load()` çağrısında yerel kayıt okunamadı mı.
 *
 * Bozuk bir kayıtta boş state'e düşülüyor, sonra o boş state "yerel daha yeni"
 * sayılıp buluta itiliyor ve buluttaki gerçek veri de siliniyordu. Bu bayrak
 * açıkken hydrate yereli kaynak kabul etmez, bulutu benimser.
 */
let yerelKayitBozuk = false

function load(userId: string): State {
  yerelKayitBozuk = false
  const raw = localStorage.getItem(dataKey(userId))
  if (!raw) return bosState
  try {
    return normalize(JSON.parse(raw) as State)
  } catch (err) {
    console.error('Yerel kayıt bozuk, buluttan kurtarılmaya çalışılacak:', err)
    yerelKayitBozuk = true
    return bosState
  }
}

/** İşletmenin toptancı puanını buluttan (bayi_puan:<tel>) authoritative olarak düş — ödül alırken. */
async function bayiPuanHarca(tel: string, tutar: number): Promise<void> {
  const rec = await cloudGet('bayi_puan:' + tel)
  const cur = (rec?.value as { puan?: number } | undefined)?.puan ?? 0
  const yeni = Math.max(0, cur - tutar)
  const ts = new Date().toISOString()
  await cloudSet('bayi_puan:' + tel, { puan: yeni, updatedAt: ts }, ts)
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
  closeTable: (tableId: string, payment: Payment, customerId?: string) => void
  quickSale: (lines: SaleLine[], payment: Payment, customerId?: string) => void
  /** Parçalı ödeme: hesap bölünür, her parça ayrı ödenir. Veresiye parçası müşteriye yazılır. */
  paySplit: (lines: SaleLine[], parts: PaymentPart[], tableId?: string) => void
  cancelSale: (saleId: string) => void
  /** Yapılmış satışın satırlarını düzenle: stok ve veresiye bakiyesi yeniden hesaplanır. */
  editSale: (saleId: string, newLines: SaleLine[]) => void
  /** İptal edilen satışı geri getir (undo): stok yeniden düşer, veresiye borcu geri yazılır. */
  restoreSale: (sale: Sale) => void

  /** Müşteri sadakat ödülü/hizmeti al: puan (1 puan = 1 TL) + para karışık ödenir. */
  /** Ödül (Hizmet) al: işletmenin toptancı puanıyla. Yeterli değilse false. */
  odulAl: (hizmet: Hizmet) => boolean

  // iş günü oturumu
  /** Günü başlat: açık oturum aç, açılış nakdini yaz. */
  startDay: (openingCash: number) => void
  /** Günü bitir: aktif oturumu kapat (kilitlemez, sadece kapatır). */
  endDay: (counted?: number) => void

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
  // Son state'e her yerden erişim (bekleyen yazmayı boşaltmak ve hydrate sırasında
  // "kullanıcı bu arada işlem yaptı mı" kontrolü için).
  const sRef = useRef(s)
  sRef.current = s
  const userIdRef = useRef(userId)
  userIdRef.current = userId
  const bekleyen = useRef(false)
  const kotaUyarildi = useRef(false)

  /** Bekleyen değişikliği hemen buluta it. Debounce'u beklemez. */
  const itHemen = useCallback(() => {
    if (!hydrated.current || !bekleyen.current) return
    bekleyen.current = false
    const k = dataKey(userIdRef.current)
    const ts = new Date().toISOString()
    try {
      localStorage.setItem(k + ':ts', ts)
    } catch {
      // kota dolu — aşağıdaki yazma zaten uyarıyor
    }
    void cloudSet(k, sRef.current, ts)
  }, [])

  // Her değişimde yerele yaz (kaynak). hydrate sonrası buluta da it (debounce).
  useEffect(() => {
    const k = dataKey(userId)
    try {
      localStorage.setItem(k, JSON.stringify(s))
    } catch (err) {
      // Kota dolduğunda (büyük logo + uzun satış geçmişi) bu satır patlıyor ve
      // uygulama beyaz ekrana düşüyordu. Artık ayakta kalıyor ve bir kez uyarıyor.
      console.error('Yerel kayıt yazılamadı:', err)
      if (!kotaUyarildi.current) {
        kotaUyarildi.current = true
        alert(
          'Telefonun deposu doldu — son değişiklikler bu cihaza KAYDEDİLEMEDİ. ' +
            'Profil > Yedekleme bölümünden yedek al, sonra eski verini temizle ' +
            '(çok büyük bir işletme logosu yüklediysen onu kaldırmayı dene).',
        )
      }
    }
    if (!hydrated.current) return
    bekleyen.current = true
    const t = setTimeout(itHemen, 800)
    return () => clearTimeout(t)
  }, [s, userId, itHemen])

  // Sayfa/uygulama kapanırken ya da arka plana geçerken bekleyen yazmayı boşalt.
  // Eskiden son satışı yapıp hemen çıkan kullanıcının işlemi buluta hiç gitmiyor,
  // sonra diğer cihazın "daha yeni" sürümü tarafından siliniyordu.
  useEffect(() => {
    const f = () => itHemen()
    window.addEventListener('pagehide', f)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') itHemen()
    })
    return () => {
      window.removeEventListener('pagehide', f)
      itHemen() // kullanıcı değişimi / çıkış: unmount olurken de boşalt
    }
  }, [itHemen])

  // Açılış: buluttan çek. Bulut daha yeniyse benimse; yerel daha yeni ya da
  // bulut boşsa yereli buluta it. Çevrimdışıysa sessizce yerelle devam.
  useEffect(() => {
    let alive = true
    const k = dataKey(userId)
    // Bulut cevabı beklenirken kullanıcı satış yapabiliyor. Cevap gelince state'i
    // koşulsuz ezmek o satışları siliyordu (yerel :ts damgası hydrate bitene kadar
    // ilerlemediği için "bulut daha yeni" görünüyordu). Referansı kıyaslıyoruz.
    const acilisState = sRef.current
    void (async () => {
      // Yerel kayıt bozuksa yereli "yeni" saymayız — bulut ne diyorsa o.
      const localTs = yerelKayitBozuk ? '' : (localStorage.getItem(k + ':ts') ?? '')
      const cloud = await cloudGet(k)
      if (!alive) return
      const kullaniciDegistirdi = sRef.current !== acilisState
      if (kullaniciDegistirdi) {
        // Yereli kaynak kabul et ve buluta it; bulutu uygulama.
        const ts = new Date().toISOString()
        try {
          localStorage.setItem(k + ':ts', ts)
        } catch {
          /* kota — yazma effect'i zaten uyardı */
        }
        void cloudSet(k, sRef.current, ts)
        hydrated.current = true
        return
      }
      if (cloud && cloud.value && (!localTs || cloud.updatedAt > localTs)) {
        localStorage.setItem(k, JSON.stringify(cloud.value))
        localStorage.setItem(k + ':ts', cloud.updatedAt)
        setS(normalize(cloud.value as State))
      } else if (!yerelKayitBozuk && (!cloud || (localTs && localTs > cloud.updatedAt))) {
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

  // İşletmenin toptancı (babu.co) puanını buluttan çek — telefonla, 15 sn'de bir tazele.
  const isletmeTel = (s.business.phone ?? '').replace(/\D/g, '')
  useEffect(() => {
    if (!isletmeTel) return
    let alive = true
    const cek = async () => {
      const rec = await cloudGet('bayi_puan:' + isletmeTel)
      if (!alive) return
      const p = (rec?.value as { puan?: number } | undefined)?.puan
      if (typeof p !== 'number') return
      setS((st) => (st.isletmePuan === p ? st : { ...st, isletmePuan: p }))
    }
    void cek()
    const t = setInterval(cek, 15000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [isletmeTel])

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

    /** Satırların hangi ham maddeden ne kadar götürdüğü — satış anındaki tarifle. */
    const hamDusum = (items: Item[], lines: SaleLine[]): { itemId: string; qty: number }[] => {
      const harita = new Map<string, number>()
      for (const l of lines) {
        const v = l.variantId
          ? items.find((i) => i.id === l.itemId)?.variants?.find((x) => x.id === l.variantId)
          : undefined
        for (const [id, q] of variantExplode(l.itemId, l.qty, items, v)) {
          harita.set(id, (harita.get(id) ?? 0) + q)
        }
      }
      return [...harita].map(([itemId, qty]) => ({ itemId, qty }))
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
      tableName?: string,
    ): State => {
      if (lines.length === 0 || parts.length === 0) return st

      // Stok düşerken NE kadar düştüğünü de kaydediyoruz; iptal/düzenlemede
      // tarif değişmiş olsa bile birebir aynı miktar geri yüklensin.
      let items = st.items
      const stokDusum = hamDusum(st.items, lines)
      for (const l of lines) items = applyStock(items, l.itemId, l.qty, variantOf(st.items, l))

      const total = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
      const cost = lines.reduce((n, l) => n + l.qty * l.unitCost, 0)

      // Veresiye parçalarının tutarı ilgili müşterinin borcuna yazılır.
      let customers = st.customers
      for (const p of parts) {
        if (p.payment !== 'veresiye' || !p.customerId) continue
        customers = customers.map((c) =>
          c.id === p.customerId ? { ...c, balance: round(c.balance + p.amount) } : c,
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
            tableName,
            bizDay: aktifOturum(st)?.date ?? today(),
            stokDusum,
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
            table.name,
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

          // Kayıtlı düşüm varsa onunla geri yükle (tarif değişmiş olabilir);
          // eski satışlarda kayıt yok, tarife düşülür.
          let items = st.items
          if (sale.stokDusum?.length) {
            items = applyStockRaw(items, sale.stokDusum.map((d) => ({ ...d, qty: -d.qty })))
          } else {
            for (const l of sale.lines) {
              const v = l.variantId
                ? st.items.find((i) => i.id === l.itemId)?.variants?.find((x) => x.id === l.variantId)
                : undefined
              items = applyStock(items, l.itemId, -l.qty, v)
            }
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

      /** Satış düzenle: eski stok/borç geri alınır, yeni satırlar uygulanır. */
      editSale: (saleId, newLines) =>
        set((st) => {
          const sale = st.sales.find((x) => x.id === saleId)
          if (!sale) return st

          // 1) Eski satırların stoğunu geri yükle — mümkünse satış anındaki kayıtla.
          let items = st.items
          if (sale.stokDusum?.length) {
            items = applyStockRaw(items, sale.stokDusum.map((d) => ({ ...d, qty: -d.qty })))
          } else {
            for (const l of sale.lines) {
              const v = l.variantId
                ? st.items.find((i) => i.id === l.itemId)?.variants?.find((x) => x.id === l.variantId)
                : undefined
              items = applyStock(items, l.itemId, -l.qty, v)
            }
          }
          // 2) Yeni satırların stoğunu düş ve ne düştüğünü kaydet.
          const yeniDusum = hamDusum(items, newLines)
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

          // 4) Yeni parçalar.
          //
          // Eskiden bütün parçalar aynı oranla ölçekleniyordu; bu, müşterinin
          // FİİLEN ödediği nakdi geriye dönük değiştiriyordu: 100 ₺ nakit +
          // 100 ₺ veresiye bir hesaptan 50 ₺'lik satır çıkarılınca 75 + 75
          // oluyordu. Oysa nakit 100 ₺ verilmişti; doğrusu 100 nakit + 50 veresiye.
          // Kural: ödenmiş parçalar (nakit/kart) korunur, fark veresiyeye yazılır.
          let newParts: PaymentPart[]
          if (oldTotal <= 0) {
            newParts = [{ payment: sale.payment, amount: newTotal, customerId: sale.customerId }]
          } else {
            const odenen = oldParts.filter((p) => p.payment !== 'veresiye')
            const veresiye = oldParts.filter((p) => p.payment === 'veresiye')
            const odenenToplam = round(odenen.reduce((a, p) => a + p.amount, 0))

            if (veresiye.length && newTotal >= odenenToplam) {
              const kalan = round(newTotal - odenenToplam)
              const eskiVeresiye = round(veresiye.reduce((a, p) => a + p.amount, 0))
              newParts = [
                ...odenen,
                ...veresiye.map((p) => ({
                  ...p,
                  amount: eskiVeresiye > 0 ? round((p.amount / eskiVeresiye) * kalan) : kalan,
                })),
              ]
            } else {
              // Veresiye yok ya da yeni toplam ödenenin de altına düştü: oransal
              // ölçekle (fazla alınan para elden iade ediliyor demektir).
              const k = newTotal / oldTotal
              newParts = oldParts.map((p) => ({ ...p, amount: round(p.amount * k) }))
            }
            // Kuruş sapması ilk parçaya yazılır.
            const drift = round(newTotal - newParts.reduce((a, p) => a + p.amount, 0))
            if (newParts.length && drift !== 0) {
              newParts[0] = { ...newParts[0], amount: round(newParts[0].amount + drift) }
            }
          }

          // 5) Yeni veresiye borçlarını uygula.
          for (const p of newParts) {
            if (p.payment !== 'veresiye' || !p.customerId) continue
            customers = customers.map((c) =>
              c.id === p.customerId ? { ...c, balance: round(c.balance + p.amount) } : c,
            )
          }

          const veresiyeParca = newParts.find((p) => p.payment === 'veresiye')
          const updated = {
            ...sale,
            lines: newLines,
            total: newTotal,
            cost: newCost,
            payment: newParts[0].payment,
            payments: newParts.length > 1 ? newParts : undefined,
            customerId: veresiyeParca?.customerId,
            stokDusum: yeniDusum,
          }

          return { ...st, items, customers, sales: st.sales.map((x) => (x.id === saleId ? updated : x)) }
        }),

      /** İptali geri al: stok yeniden düşülür, veresiye borcu geri yazılır, satış listeye döner. */
      restoreSale: (sale) =>
        set((st) => {
          if (st.sales.some((x) => x.id === sale.id)) return st

          // Geri getirirken de aynı miktar düşsün — iptalde geri yüklenenle simetrik.
          let items = st.items
          if (sale.stokDusum?.length) {
            items = applyStockRaw(items, sale.stokDusum)
          } else {
            for (const l of sale.lines) {
              items = applyStock(items, l.itemId, l.qty, variantOf(st.items, l))
            }
          }

          const parts = sale.payments ?? [
            { payment: sale.payment, amount: sale.total, customerId: sale.customerId },
          ]
          let customers = st.customers
          for (const p of parts) {
            if (p.payment !== 'veresiye' || !p.customerId) continue
            customers = customers.map((c) =>
              c.id === p.customerId ? { ...c, balance: round(c.balance + p.amount) } : c,
            )
          }

          return { ...st, items, customers, sales: [...st.sales, sale] }
        }),

      /** Ödül (Hizmet) al: işletmenin TOPTANCI puanıyla. Puan yeterli değilse false döner.
       *  Puan authoritative olarak buluttan (bayi_puan:<tel>) düşülür; yerel ayna hemen güncellenir. */
      odulAl: (hizmet) => {
        let ok = false
        set((st) => {
          const puan = st.isletmePuan ?? 0
          if (puan < hizmet.fiyat) return st
          ok = true
          return {
            ...st,
            isletmePuan: puan - hizmet.fiyat,
            oduller: [
              { id: uid(), date: new Date().toISOString(), hizmetId: hizmet.id, ad: hizmet.ad, puan: hizmet.fiyat },
              ...(st.oduller ?? []),
            ],
          }
        })
        if (!ok) return false
        const tel = (s.business.phone ?? '').replace(/\D/g, '')
        if (tel) void bayiPuanHarca(tel, hizmet.fiyat)
        return true
      },

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
          // round: kuruşun altındaki artık, bakiyeyi 0,004 gibi bir değerde
          // bırakıp müşteriyi sonsuza dek "açık hesap" listesinde tutuyordu.
          customers: st.customers.map((c) =>
            c.id === customerId ? { ...c, balance: round(c.balance - amount) } : c,
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
                    ? {
                        ...c,
                        // Gün zaten bir kez açılmışsa GERÇEK açılış nakdi ilk
                        // girilendir; ikinci açılışta üstüne yazmak kasayı şişiriyordu.
                        opening: c.openedAt ? c.opening : openingCash,
                        openedAt: c.openedAt ?? now,
                        closedAt: undefined,
                        // Gün yeniden açıldıysa eski kapanış sayımı artık geçersiz.
                        counted: undefined,
                      }
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
            // Sayım yalnız kapatılan güne yazılır; ama açıkta kalmış BAŞKA oturum
            // varsa (bulut birleşmesi / çift startDay) o da kapatılır — eskiden
            // yalnız ilki kapandığı için "Günü Başlat" ekranı bir daha hiç çıkmıyordu.
            cashDays: st.cashDays.map((c) =>
              c.date === acik.date
                ? { ...c, closedAt: now, counted: counted ?? c.counted }
                : c.openedAt && !c.closedAt
                  ? { ...c, closedAt: now }
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
