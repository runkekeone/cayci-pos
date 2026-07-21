import { useEffect, useState } from 'react'
import { useStore, aktifOturum } from '../store'
import { cloudGet } from '../lib/cloud'
import { dayReport, totalVeresiye } from '../lib/report'
import { lowStock } from '../lib/cost'
import { fmtTL, today } from '../lib/units'
import { urunGorsel } from '../lib/urunGorsel'
import type { Table } from '../types'

/**
 * Hızlı İşlemler — ilk 4'ü hep görünür, gerisi ⋯ ile açılır.
 * Alt çubuğa sığmayan tüm modüllerin tek erişim yolu burası.
 */
const ISLEMLER = [
  { id: 'satis', ad: 'Satış', ic: '🧾' },
  { id: 'rapor', ad: 'Raporlar', ic: '📊' },
  { id: 'giderler', ad: 'Giderler', ic: '💸' },
  { id: 'takvim', ad: 'Takvim', ic: '🗓️' },
  { id: 'urunler', ad: 'Ürünler', ic: '🍵' },
  { id: 'stok', ad: 'Stok', ic: '📦' },
  { id: 'siparis', ad: 'Sipariş', ic: '🚚' },
  { id: 'musteriler', ad: 'Müşteriler', ic: '👥' },
  { id: 'kasa', ad: 'Kasa', ic: '💵' },
  { id: 'profil', ad: 'Profil', ic: '👤' },
]

function git(id: string) {
  window.dispatchEvent(new CustomEvent('cayci-git', { detail: id }))
}

/**
 * ANASAYFA.
 * Sol: duyurular (+ Kampanya 1). Sağ: güncel durum raporu (+ Kampanya 2).
 * En altta büyük reklam barı (ileride reklam alanı).
 */
type Duyuru = { id?: string; tarih: string; metin: string }

// Bulut boş/erişilemezse gösterilecek FALLBACK duyurular.
const DUYURULAR: Duyuru[] = [
  { tarih: '15 Tem', metin: 'Toptancı fiyat listesi güncellendi — Sipariş ekranından yeni fiyatlara bak.' },
  { tarih: '14 Tem', metin: 'Yeni: kritik stoğa düşen ürünler Sipariş ekranında otomatik önerilir.' },
  { tarih: '12 Tem', metin: 'Gün Sonu ekranı eklendi. Günü kapatırken açık hesapları toplamayı unutma.' },
]

export default function Anasayfa() {
  const { s } = useStore()
  const [hepsi, setHepsi] = useState(false)
  const [onizle, setOnizle] = useState<Table | null>(null) // bekleyen adisyon önizleme
  const [duyurular, setDuyurular] = useState<Duyuru[]>(DUYURULAR) // toptancı buluttan yayınlar; yoksa fallback

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
  const gun = aktifOturum(s)?.date ?? today()
  const r = dayReport(s, gun)
  const kritik = lowStock(s.items).length
  const alacak = totalVeresiye(s)
  const satisAdet = s.sales.filter((x) => (x.bizDay ?? x.date.slice(0, 10)) === gun).length
  const doluMasalar = s.tables.filter((t) => t.lines.length > 0)
  const sonSatislar = [...s.sales].reverse().slice(0, 4)
  const tarihYazi = new Date().toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  })

  return (
    <>
      <h1>{s.business.name || 'Çay Ocağı'}</h1>
      <p className="sub">Günlük özet, duyurular ve kampanyalar.</p>

      {/* ---- Bugün net kartı (mockup üst blok) ---- */}
      <div className="card ana-net">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span className="hint">Bugün net</span>
            <div className={`ana-net-rakam ${r.netKar >= 0 ? 'good' : 'bad'}`}>{fmtTL(r.netKar)}</div>
            <span className="hint">{tarihYazi}</span>
          </div>
          <button className="btn sm" onClick={() => git('rapor')} title="Raporlara git">
            📊
          </button>
        </div>
        <div className="ana-uclu">
          <div>
            <b>{fmtTL(r.ciro)}</b>
            <span>Toplam Ciro</span>
          </div>
          <div>
            <b>{satisAdet}</b>
            <span>Satış</span>
          </div>
          <div>
            <b>{s.customers.length}</b>
            <span>Müşteri</span>
          </div>
        </div>
      </div>

      {/* ---- Hızlı İşlemler: 4 + ⋯ ---- */}
      <div className="section-title">Hızlı İşlemler</div>
      <div className="ana-grid">
        {(hepsi ? ISLEMLER : ISLEMLER.slice(0, 4)).map((p) => (
          <button key={p.id} className="ana-islem" onClick={() => git(p.id)}>
            <span className="ic">{p.ic}</span>
            <span>{p.ad}</span>
          </button>
        ))}
        {hepsi && (
          <button
            className="ana-islem"
            onClick={() => window.dispatchEvent(new CustomEvent('cayci-gunsonu'))}
          >
            <span className="ic">🌙</span>
            <span>Gün Sonu</span>
          </button>
        )}
        <button className="ana-islem" onClick={() => setHepsi((v) => !v)}>
          <span className="ic">{hepsi ? '˄' : '⋯'}</span>
          <span>{hepsi ? 'Daha az' : 'Tümü'}</span>
        </button>
      </div>

      {/* ---- Bekleyen adisyonlar + son satışlar ---- */}
      <div className="grid2" style={{ marginTop: 16 }}>
        <div>
          <div className="section-title">
            Bekleyen Adisyonlar{' '}
            {doluMasalar.length > 0 && <span className="tag warn">{doluMasalar.length}</span>}
          </div>
          <div className="card">
            {doluMasalar.length === 0 && <p className="hint">Açık adisyon yok.</p>}
            {doluMasalar.map((t) => {
              const tutar = t.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
              const musteri = s.customers.find((c) => c.id === t.customerId)
              return (
                <button
                  key={t.id}
                  className="ana-satir"
                  onClick={() => setOnizle(t)}
                  title="İçeriği gör"
                >
                  <span>
                    <b>{t.name}</b>
                    {musteri && <span className="hint"> · {musteri.name}</span>}
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    <strong className="v">{fmtTL(tutar)}</strong>
                    <span aria-hidden>👁</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <div className="section-title">Son Satışlar</div>
          <div className="card">
            {sonSatislar.length === 0 && <p className="hint">Henüz satış yok.</p>}
            {sonSatislar.map((x) => {
              const ilk = x.lines[0]
              const saat = new Date(x.date).toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit',
              })
              return (
                <div key={x.id} className="ana-satir">
                  <span className="row" style={{ gap: 8 }}>
                    {ilk && urunGorsel(ilk.itemId) && (
                      <img src={urunGorsel(ilk.itemId)!} alt="" style={{ width: 24, height: 24 }} />
                    )}
                    <span>
                      <b>{ilk?.name ?? 'Satış'}</b>
                      {x.lines.length > 1 && <span className="hint"> +{x.lines.length - 1}</span>}
                      <span className="hint"> · {saat}</span>
                    </span>
                  </span>
                  <strong className="v">{fmtTL(x.total)}</strong>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        {/* ---- SOL: Duyurular ---- */}
        <div>
          <div className="section-title">📢 Duyurular</div>
          <div className="card">
            {duyurular.map((d, i) => (
              <div
                key={d.id ?? i}
                style={{
                  padding: '10px 0',
                  borderBottom: i < duyurular.length - 1 ? '1px solid var(--line)' : 'none',
                }}
              >
                <span className="tag" style={{ marginRight: 8 }}>
                  {d.tarih}
                </span>
                {d.metin}
              </div>
            ))}
          </div>
        </div>

        {/* ---- SAĞ: Güncel durum raporu ---- */}
        <div>
          <div className="section-title">📊 Güncel durum</div>
          <div className="card">
            <Satir ad="Bugünkü ciro" deger={fmtTL(r.ciro)} />
            <Satir ad="Nakit" deger={fmtTL(r.nakitSatis)} />
            <Satir ad="Kart" deger={fmtTL(r.kartSatis)} />
            <Satir ad="Veresiye (bugün)" deger={fmtTL(r.veresiyeSatis)} />
            <Satir ad="Net kâr" deger={fmtTL(r.netKar)} iyi={r.netKar >= 0} />
            <Satir ad="Kasada olması gereken" deger={fmtTL(r.beklenenNakit)} />
            <Satir ad="Toplam alacak (açık hesap)" deger={fmtTL(alacak)} iyi={alacak <= 0} />
            <Satir ad="Kritik stok" deger={kritik > 0 ? `${kritik} ürün ⚠` : 'yok'} iyi={kritik === 0} />
          </div>
        </div>
      </div>

      {/* ---- EN ALT: kampanya 1 + 2 (yan yana) + reklam (altta), yapışık tek blok ---- */}
      <div
        style={{
          marginTop: 20,
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          <div
            style={{
              flex: '1 1 240px',
              padding: '22px 20px',
              background: 'linear-gradient(90deg, var(--accent), #f0a35e)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            🎯 Kampanya 1 — buraya kampanya metni gelecek
          </div>
          <div
            style={{
              flex: '1 1 240px',
              padding: '22px 20px',
              background: 'linear-gradient(90deg, #4f7cc4, #6aa0e0)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            🎁 Kampanya 2 — buraya kampanya metni gelecek
          </div>
        </div>
        <div
          style={{
            minHeight: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1f2430',
            color: '#c8cdd6',
            fontSize: 15,
          }}
        >
          📣 Reklam alanı — ileride buraya reklam alınabilir
        </div>
      </div>

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
    <div className="row" style={{ justifyContent: 'space-between', padding: '7px 0' }}>
      <span className="hint">{ad}</span>
      <strong className={iyi === undefined ? '' : iyi ? 'v good' : 'v bad'}>{deger}</strong>
    </div>
  )
}

