import { useState } from 'react'
import { useStore } from '../store'
import { dayReport, totalVeresiye } from '../lib/report'
import { fmtTL, uid } from '../lib/units'

/**
 * GÜN SONU ÖZETİ (kilitten önceki aşama).
 * Gün hâlâ açık: burada son dakika gelir/gider eklenebilir, açık hesaplar görülür.
 * "Günü Kapat ve Onayla" → oturum kapanır, kapı geri döner.
 * Gelir, negatif tutarlı günlük gider olarak yazılır (net kâr + beklenen kasa tutarlı kalır).
 */
export default function GunSonu({ gun, onKapat }: { gun: string; onKapat: () => void }) {
  const { s, saveExpense, endDay } = useStore()
  const r = dayReport(s, gun)

  const [ad, setAd] = useState('')
  const [tutar, setTutar] = useState('')
  const [nakit, setNakit] = useState<boolean>(true)
  const [sayilan, setSayilan] = useState('')

  const acikHesaplar = s.customers.filter((c) => c.balance > 0)

  function ekle(gelir: boolean) {
    const t = Number(tutar)
    if (!ad.trim() || !t) return
    saveExpense({
      id: uid(),
      kind: 'gunluk',
      date: gun,
      name: gelir ? `Gelir: ${ad.trim()}` : ad.trim(),
      amount: gelir ? -Math.abs(t) : Math.abs(t),
      paidCash: nakit,
    })
    setAd('')
    setTutar('')
  }

  function kapat() {
    if (
      !confirm(
        'Gün kapatılacak. Yeni satışlar için tekrar "Günü Başlat" gerekir.\n\nDevam edilsin mi?',
      )
    )
      return
    endDay(sayilan ? Number(sayilan) : undefined)
    onKapat()
  }

  const Satir = ({ ad, deger, iyi }: { ad: string; deger: string; iyi?: boolean }) => (
    <div className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
      <span className="hint">{ad}</span>
      <strong className={iyi === undefined ? '' : iyi ? 'v good' : 'v bad'}>{deger}</strong>
    </div>
  )

  const gun_tr = new Date(gun + 'T00:00:00').toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="modal-bg" onClick={onKapat}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 620, width: '100%' }}
      >
        <h2>🌙 Gün Sonu — {gun_tr}</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Günün özeti. Eksik gelir/gider varsa şimdi ekle. Onaylayınca gün kapanır.
        </p>

        {/* ---- özet ---- */}
        <div className="card" style={{ background: 'var(--bg)', marginBottom: 14 }}>
          <Satir ad="Ciro (toplam satış)" deger={fmtTL(r.ciro)} />
          <Satir ad="Nakit satış" deger={fmtTL(r.nakitSatis)} />
          <Satir ad="Kart satış" deger={fmtTL(r.kartSatis)} />
          <Satir ad="Veresiye satış" deger={fmtTL(r.veresiyeSatis)} />
          <Satir ad="Tahsil edilen borç" deger={fmtTL(r.tahsilat)} />
          <Satir ad="Günlük gider" deger={fmtTL(r.gunlukGider)} />
          <Satir ad="Fire + ikram maliyeti" deger={fmtTL(r.fireIkramMaliyeti)} />
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <Satir ad="Brüt kâr" deger={fmtTL(r.brutKar)} iyi={r.brutKar >= 0} />
          <Satir ad="NET KÂR" deger={fmtTL(r.netKar)} iyi={r.netKar >= 0} />
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <Satir ad="Açılış nakdi" deger={fmtTL(r.acilisNakit)} />
          <Satir ad="Kasada olması gereken" deger={fmtTL(r.beklenenNakit)} />
        </div>

        {/* ---- açık hesaplar ---- */}
        {acikHesaplar.length > 0 && (
          <div
            className="card"
            style={{ marginBottom: 14, borderColor: 'var(--bad)', background: 'var(--bg)' }}
          >
            <strong>⚠ Açık hesaplar — {fmtTL(totalVeresiye(s))}</strong>
            <p className="hint" style={{ marginTop: 6 }}>
              Kapatmadan tahsil etmek istersen Müşteriler'den topla.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {acikHesaplar.map((c) => (
                <span key={c.id} className="tag bad">
                  {c.name}: {fmtTL(c.balance)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ---- son dakika gelir/gider ---- */}
        <div className="section-title">Son dakika gelir / gider</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 2, minWidth: 140 }}>
            <label>Açıklama</label>
            <input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Ekmek parası, bahşiş..." />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label>Tutar ₺</label>
            <input type="number" value={tutar} onChange={(e) => setTutar(e.target.value)} />
          </div>
          <label className="row" style={{ cursor: 'pointer', gap: 6, marginBottom: 10 }}>
            <input type="checkbox" checked={nakit} onChange={(e) => setNakit(e.target.checked)} />
            <span className="hint">Nakit</span>
          </label>
        </div>
        <div className="row" style={{ gap: 8, marginBottom: 16 }}>
          <button className="btn sm" disabled={!ad.trim() || !Number(tutar)} onClick={() => ekle(false)}>
            − Gider ekle
          </button>
          <button
            className="btn sm"
            disabled={!ad.trim() || !Number(tutar)}
            onClick={() => ekle(true)}
          >
            + Gelir ekle
          </button>
        </div>

        {/* ---- sayılan nakit ---- */}
        <div className="field" style={{ width: 220 }}>
          <label>Sayılan nakit (opsiyonel)</label>
          <input
            type="number"
            value={sayilan}
            onChange={(e) => setSayilan(e.target.value)}
            placeholder={fmtTL(r.beklenenNakit)}
          />
          {sayilan !== '' && (
            <span className="hint">
              Fark:{' '}
              <strong className={Number(sayilan) - r.beklenenNakit >= 0 ? 'v good' : 'v bad'}>
                {fmtTL(Number(sayilan) - r.beklenenNakit)}
              </strong>
            </span>
          )}
        </div>

        <div className="row" style={{ marginTop: 20, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onKapat}>
            Geri dön (gün açık kalsın)
          </button>
          <button className="btn primary" onClick={kapat} style={{ background: 'var(--bad)' }}>
            Günü Kapat ve Onayla
          </button>
        </div>
      </div>
    </div>
  )
}
