import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { cloudGet } from '../lib/cloud'
import { dayReport, totalVeresiye } from '../lib/report'
import { lowStock } from '../lib/cost'
import { fmtTL, today } from '../lib/units'
import { Ikon, type IkonAd } from '../lib/Ikon'
import type { Table } from '../types'

/**
 * Hızlı İşlemler — ilk 4'ü hep görünür, gerisi ⋯ ile açılır.
 * Alt çubuğa sığmayan tüm modüllerin tek erişim yolu burası.
 */
/** Ana ekranın üst bandındaki kısayollar. */
const HIZLI: { id: string; ad: string; ic: IkonAd }[] = [
  { id: 'musteriler', ad: 'Veresiye', ic: 'defter' },
  { id: 'siparis', ad: 'Sipariş', ic: 'kamyon' },
  { id: 'giderler', ad: 'Gider', ic: 'para' },
]

function git(id: string) {
  window.dispatchEvent(new CustomEvent('cayci-git', { detail: id }))
}

/**
 * ANASAYFA.
 * Bugünkü satış, işlemler, açık adisyonlar, son satışlar, günün durumu ve
 * (toptancı yayınladıysa) duyurular.
 * En altta büyük reklam barı (ileride reklam alanı).
 */
type Duyuru = { id?: string; tarih: string; metin: string }


export default function Anasayfa() {
  const { s } = useStore()
  const [onizle, setOnizle] = useState<Table | null>(null) // bekleyen adisyon önizleme
  const [duyurular, setDuyurular] = useState<Duyuru[]>([]) // toptancı buluttan yayınlar; yoksa bölüm hiç görünmez

  // Mount'ta toptancının yayınladığı duyuruları buluttan oku (kv anahtar: "duyurular").
  useEffect(() => {
    let iptal = false
    cloudGet('duyurular').then((r) => {
      const v = r?.value as Duyuru[] | undefined
      if (!iptal && Array.isArray(v) && v.length) setDuyurular(v)
    })
    return () => {
      iptal = true
    }
  }, [])
  const gun = today()
  const r = dayReport(s, gun)
  const kritik = lowStock(s.items).length
  const alacak = totalVeresiye(s)
  const satisAdet = s.sales.filter((x) => (x.bizDay ?? x.date.slice(0, 10)) === gun).length
  const doluMasalar = s.tables.filter((t) => t.lines.length > 0)
  const sonSatislar = [...s.sales].reverse().slice(0, 4)
  const tarihYazi = new Date(gun + 'T12:00:00').toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  })

  // Son 7 günün cirosu (bugün dahil) — SumUp tarzı çubuk grafik.
  const GUN_KISA = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct']
  const yediGun = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(gun + 'T12:00:00')
    d.setDate(d.getDate() - (6 - i))
    const tarih = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { etiket: GUN_KISA[d.getDay()], ciro: dayReport(s, tarih).ciro, bugun: i === 6 }
  })
  const enYuksek = Math.max(...yediGun.map((g) => g.ciro), 1)
  const cayAdet = s.sales
    .filter((x) => (x.bizDay ?? x.date.slice(0, 10)) === gun)
    .reduce((n, x) => n + x.lines.filter((l) => l.itemId === 'cay-bardak').reduce((m, l) => m + l.qty, 0), 0)

  return (
    <>
      {/* ---- siyah üst bant + hızlı işlemler ---- */}
      <div className="ana-bant">
        <div className="ana-bant-ust">
          <span className="anasayfa-baslik">
            {s.business.logo && <img className="baslik-logo" src={s.business.logo} alt="" />}
            {s.business.name || 'Çay Ocağı'}
          </span>
          <span className="ana-tarih">{tarihYazi}</span>
        </div>
        <div className="ana-hizli">
          {HIZLI.map((h) => (
            <button key={h.id} onClick={() => git(h.id)}>
              <Ikon ad={h.ic} boy={22} />
              <span>{h.ad}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---- bugünün özeti ---- */}
      <div className="ana-panel">
        <div>
          <div className="ana-net-etiket">Bugünkü satış</div>
          <div className="ana-net-rakam">{fmtTL(r.ciro)}</div>
          <div className="hint">
            {cayAdet > 0 ? `${cayAdet} çay · ` : ''}
            {satisAdet} satış
          </div>
        </div>

        <div>
          <div className="ana-net-etiket" style={{ marginBottom: 6 }}>
            Son 7 gün
          </div>
          <div className="yedi-gun" role="img" aria-label="Son 7 günün cirosu">
            {yediGun.map((g, i) => (
              <span key={i} className={`yg-sutun ${g.bugun ? 'bugun' : ''}`}>
                <i style={{ height: `${Math.max((g.ciro / enYuksek) * 100, g.ciro > 0 ? 4 : 1)}%` }} />
                <em>{g.etiket}</em>
              </span>
            ))}
          </div>
        </div>

        <div>
          <Satir ad="Nakit" deger={fmtTL(r.nakitSatis)} />
          <Satir ad="Kart" deger={fmtTL(r.kartSatis)} />
          <Satir ad="Veresiye" deger={fmtTL(r.veresiyeSatis)} />
          {alacak > 0 && <Satir ad="Toplam alacak" deger={fmtTL(alacak)} />}
          {kritik > 0 && <Satir ad="Azalan stok" deger={`${kritik} ürün`} iyi={false} />}
        </div>
      </div>

      <div className="grid2">
        <div>
          <div className="section-title">
            Açık adisyonlar
            {doluMasalar.length > 0 && <span className="tag warn">{doluMasalar.length}</span>}
          </div>
          <div className="card liste">
            {doluMasalar.length === 0 && (
              <div className="ana-satir">
                <span className="hint">Açık adisyon yok.</span>
              </div>
            )}
            {doluMasalar.map((t) => {
              const tutar = t.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
              const musteri = s.customers.find((c) => c.id === t.customerId)
              return (
                <button key={t.id} className="ana-satir" onClick={() => setOnizle(t)}>
                  <span>
                    <b>{t.name}</b>
                    {musteri && <span className="hint"> · {musteri.name}</span>}
                  </span>
                  <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <strong className="v">{fmtTL(tutar)}</strong>
                    <Ikon ad="sag" boy={18} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <div className="section-title">Son satışlar</div>
          <div className="card liste">
            {sonSatislar.length === 0 && (
              <div className="ana-satir">
                <span className="hint">Henüz satış yok.</span>
              </div>
            )}
            {sonSatislar.map((x) => {
              const ilk = x.lines[0]
              const saat = new Date(x.date).toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit',
              })
              return (
                <div key={x.id} className="ana-satir">
                  <span>
                    <span className="hint v">{saat}</span> <b>{ilk?.name ?? 'Satış'}</b>
                    {x.lines.length > 1 && <span className="hint"> +{x.lines.length - 1}</span>}
                  </span>
                  <strong className="v">{fmtTL(x.total)}</strong>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {duyurular.length > 0 && (
        <>
          <div className="section-title">Toptancıdan duyurular</div>
          <div className="card liste">
            {duyurular.map((d, i) => (
              <div className="duyuru-satir" key={d.id ?? i}>
                <span className="duyuru-tarih">{d.tarih}</span>
                <span className="duyuru-metin">{d.metin}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bekleyen adisyon önizleme: içeriği hızlıca gör, istersen "Aç" ile satışa geç. */}
      {onizle && (
        <div className="modal-bg" onClick={() => setOnizle(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h2>{onizle.name}</h2>
            {(() => {
              const m = s.customers.find((c) => c.id === onizle.customerId)
              return m ? <p className="hint">Müşteri: {m.name}</p> : null
            })()}
            <div className="cart-lines" style={{ maxHeight: '50vh' }}>
              {onizle.lines.length === 0 && <p className="hint">Bu adisyon boş.</p>}
              {onizle.lines.map((l, i) => (
                <div className="cline" key={i}>
                  <span className="nm">{l.name}</span>
                  <span className="q">{l.qty}×</span>
                  <span className="am">{fmtTL(l.qty * l.unitPrice)}</span>
                </div>
              ))}
            </div>
            <div className="total" style={{ marginTop: 10 }}>
              <span>Toplam</span>
              <span className="v">
                {fmtTL(onizle.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0))}
              </span>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => setOnizle(null)}>
                Kapat
              </button>
              <button
                className="btn primary"
                style={{ flex: 1 }}
                onClick={() => {
                  // Satış ekranı mount olunca okuması için bekleyen masa id'sini bırak.
                  ;(window as unknown as { __cayMasaAc?: string }).__cayMasaAc = onizle.id
                  setOnizle(null)
                  git('satis')
                }}
              >
                Adisyonu aç
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Satir({ ad, deger, iyi }: { ad: string; deger: string; iyi?: boolean }) {
  return (
    <div className="liste-satir">
      <span className="ls-ad">{ad}</span>
      <span className={`ls-deger ${iyi === undefined ? '' : iyi ? 'good-txt' : 'bad-txt'}`}>{deger}</span>
    </div>
  )
}
