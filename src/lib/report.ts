import type { State } from '../types'
import { dayOf } from './units'

/**
 * İki ayrı çizgi tutulur, karıştırılmaz:
 *
 * 1) FİZİKİ KASA  — çekmecedeki para.
 *    açılış nakit + nakit satış + nakit tahsilat − nakitle ödenen gider
 *    (kart ve veresiye kasaya girmez)
 *
 * 2) GÜNLÜK NET   — gerçekten kazandın mı.
 *    başlangıç: −(aylık sabit giderlerin günlük payı)
 *    + brüt kâr (satış − satılan malın maliyeti; veresiye dahil, satış satıştır)
 *    − o gün girilen günlük giderler
 *    − fire ve ikramın maliyeti
 */
/**
 * Aylık sabit giderlerin bir güne düşen payı.
 *
 * `date` verilirse yalnız o tarihte YÜRÜRLÜKTE olan giderler sayılır: giderin
 * `date` alanı başlangıç tarihidir. Eskiden tarih hiç bakılmıyordu, bu yüzden
 * bugün girilen bir kira üç ay önceki günün net kârını da değiştiriyordu.
 * Tarihi olmayan eski kayıtlar (date: '') her zaman geçerli sayılır — geriye
 * dönük uyumluluk.
 */
export function dailyFixedShare(s: State, date?: string): number {
  const monthly = s.expenses
    .filter((e) => e.kind === 'aylik' && yururlukte(e, date))
    .reduce((n, e) => n + e.amount, 0)
  return monthly / 30
}

/** Gider o gün yürürlükte mi — başlangıç tarihi yoksa (eski kayıt) hep evet. */
function yururlukte(e: { date: string }, date?: string): boolean {
  if (!e.date) return true
  if (!date) return true
  return e.date <= date
}

export interface DayReport {
  date: string
  ciro: number
  nakitSatis: number
  kartSatis: number
  veresiyeSatis: number
  satilanMalMaliyeti: number
  brutKar: number
  gunlukGider: number
  nakitGider: number
  nakitAlis: number
  sabitGiderPayi: number
  fireIkramMaliyeti: number
  netKar: number
  tahsilat: number
  nakitTahsilat: number
  acilisNakit: number
  beklenenNakit: number
  sayilanNakit?: number
  kasaFarki?: number
  topProducts: { itemId: string; name: string; qty: number; ciro: number; kar: number }[]
}

export function dayReport(s: State, date: string): DayReport {
  // İş günü oturumu: işlem bizDay ile etiketliyse ona, değilse takvim gününe bakılır.
  const sales = s.sales.filter((x) => (x.bizDay ?? dayOf(x.date)) === date)
  // O güne yazılan giderler + her gün tekrar eden sabit günlük giderler (yevmiye gibi).
  // 'gunluk' o güne özeldir; 'gunluk-sabit' (yevmiye gibi) her gün tekrar eder ama
  // ancak girildiği günden İTİBAREN — eskiden tarih bakılmadığı için bugün eklenen
  // yevmiye geçmiş bütün günlerin kârından da düşülüyordu.
  const expenses = s.expenses.filter(
    (e) =>
      (e.kind === 'gunluk' && e.date === date) ||
      (e.kind === 'gunluk-sabit' && yururlukte(e, date)),
  )
  const payments = s.payments.filter((p) => (p.bizDay ?? dayOf(p.date)) === date)
  const wastes = s.wastes.filter((w) => (w.bizDay ?? dayOf(w.date)) === date)
  const purchases = s.purchases.filter((p) => (p.bizDay ?? dayOf(p.date)) === date)
  const cashDay = s.cashDays.find((c) => c.date === date)

  // Hesap parçalı ödendiyse her parça kendi ödeme tipine yazılır.
  const by = (p: string) =>
    sales.reduce((n, x) => {
      const parts = x.payments ?? [{ payment: x.payment, amount: x.total }]
      return n + parts.filter((q) => q.payment === p).reduce((m, q) => m + q.amount, 0)
    }, 0)

  const ciro = sales.reduce((n, x) => n + x.total, 0)
  const satilanMalMaliyeti = sales.reduce((n, x) => n + x.cost, 0)
  const brutKar = ciro - satilanMalMaliyeti

  const gunlukGider = expenses.reduce((n, e) => n + e.amount, 0)
  const nakitGider = expenses.filter((e) => e.paidCash).reduce((n, e) => n + e.amount, 0)
  // Kasadan nakit ödenen stok alışları da çekmeceden çıkar.
  const nakitAlis = purchases.filter((p) => p.paidCash).reduce((n, p) => n + p.total, 0)
  const sabitGiderPayi = dailyFixedShare(s, date)
  const fireIkramMaliyeti = wastes.reduce((n, w) => n + w.cost, 0)

  const netKar = brutKar - gunlukGider - sabitGiderPayi - fireIkramMaliyeti

  const tahsilat = payments.reduce((n, p) => n + p.amount, 0)
  const nakitTahsilat = payments.filter((p) => p.method === 'nakit').reduce((n, p) => n + p.amount, 0)

  const acilisNakit = cashDay?.opening ?? 0
  const beklenenNakit = acilisNakit + by('nakit') + nakitTahsilat - nakitGider - nakitAlis

  // Ürün kırılımı. Satırlar itemId ile birleşiyor ama ad, satırın kendi adından
  // (çeşit/ikram etiketi taşıyor: "Çay (İkram)") DEĞİL üründen okunuyor — yoksa
  // günün ilk çayı ikramsa o günün bütün çayları "Çay (İkram)" görünüyordu.
  const map = new Map<string, { itemId: string; name: string; qty: number; ciro: number; kar: number }>()
  for (const sale of sales) {
    for (const l of sale.lines) {
      const urunAdi = s.items.find((i) => i.id === l.itemId)?.name ?? l.name
      const cur = map.get(l.itemId) ?? { itemId: l.itemId, name: urunAdi, qty: 0, ciro: 0, kar: 0 }
      cur.qty += l.qty
      cur.ciro += l.qty * l.unitPrice
      cur.kar += l.qty * (l.unitPrice - l.unitCost)
      map.set(l.itemId, cur)
    }
  }

  return {
    date,
    ciro,
    nakitSatis: by('nakit'),
    kartSatis: by('kart'),
    veresiyeSatis: by('veresiye'),
    satilanMalMaliyeti,
    brutKar,
    gunlukGider,
    nakitGider,
    nakitAlis,
    sabitGiderPayi,
    fireIkramMaliyeti,
    netKar,
    tahsilat,
    nakitTahsilat,
    acilisNakit,
    beklenenNakit,
    sayilanNakit: cashDay?.counted,
    kasaFarki: cashDay?.counted != null ? cashDay.counted - beklenenNakit : undefined,
    topProducts: [...map.values()].sort((a, b) => b.qty - a.qty),
  }
}

export function totalVeresiye(s: State): number {
  return s.customers.reduce((n, c) => n + Math.max(0, c.balance), 0)
}
