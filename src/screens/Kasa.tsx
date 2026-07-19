import { useState } from 'react'
import { useStore, aktifOturum } from '../store'
import { dayReport } from '../lib/report'
import { fmtTL, today } from '../lib/units'

export default function Kasa() {
  const { s, setOpeningCash, setCountedCash } = useStore()
  // Açık oturum varsa onun gününü göster, yoksa takvim bugünü.
  const d = aktifOturum(s)?.date ?? today()
  const r = dayReport(s, d)
  const [sayim, setSayim] = useState('')

  return (
    <>
      <h1>Kasa</h1>
      <p className="sub">
        Bu ekran <strong>çekmecedeki parayı</strong> takip eder. Kâr değil, para. Kart ve veresiye
        buraya girmez.
      </p>

      <div className="stats">
        <div className="stat">
          <div className="k">Açılış nakit</div>
          <div className="v">{fmtTL(r.acilisNakit)}</div>
        </div>
        <div className="stat">
          <div className="k">Nakit satış</div>
          <div className="v good">+{fmtTL(r.nakitSatis)}</div>
        </div>
        <div className="stat">
          <div className="k">Nakit tahsilat</div>
          <div className="v good">+{fmtTL(r.nakitTahsilat)}</div>
        </div>
        <div className="stat">
          <div className="k">Nakit gider</div>
          <div className="v bad">−{fmtTL(r.nakitGider)}</div>
        </div>
        <div className="stat">
          <div className="k">Nakit alış (stok)</div>
          <div className="v bad">−{fmtTL(r.nakitAlis)}</div>
        </div>
        <div className="stat" style={{ borderColor: 'var(--accent)' }}>
          <div className="k">Kasada olması gereken</div>
          <div className="v">{fmtTL(r.beklenenNakit)}</div>
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div className="card" style={{ flex: 1, minWidth: 260 }}>
          <strong>Gün başı</strong>
          <p className="hint" style={{ margin: '6px 0 12px' }}>
            Para üstü için çekmeceye koyduğun nakit.
          </p>
          <div className="row">
            <input
              type="number"
              defaultValue={r.acilisNakit}
              onBlur={(e) => setOpeningCash(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span className="hint">₺</span>
          </div>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 260 }}>
          <strong>Gün sonu sayım</strong>
          <p className="hint" style={{ margin: '6px 0 12px' }}>
            Çekmeceyi say, yaz. Fark varsa aşağıda çıkar.
          </p>
          <div className="row">
            <input
              type="number"
              placeholder="Sayılan nakit"
              value={sayim}
              onChange={(e) => setSayim(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn primary"
              disabled={!sayim}
              onClick={() => setCountedCash(Number(sayim))}
            >
              Kaydet
            </button>
          </div>

          {r.sayilanNakit != null && (
            <div className="total" style={{ marginTop: 16 }}>
              <span>Fark</span>
              <span className={`v ${(r.kasaFarki ?? 0) < 0 ? 'bad' : 'good'}`}>
                {(r.kasaFarki ?? 0) >= 0 ? '+' : ''}
                {fmtTL(r.kasaFarki ?? 0)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}>
        <strong>Kasa ≠ Kâr</strong>
        <p className="hint" style={{ marginTop: 6, color: 'var(--ink)' }}>
          Çekmecede {fmtTL(r.beklenenNakit)} olması bugün bu kadar kazandın demek değil. Kart
          satışın {fmtTL(r.kartSatis)}, veresiyen {fmtTL(r.veresiyeSatis)}. Gerçek kazancı{' '}
          <strong>Rapor</strong> ekranından gör.
        </p>
      </div>
    </>
  )
}
