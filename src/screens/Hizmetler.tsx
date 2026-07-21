import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { HIZMETLER } from '../defaults'
import { fmtTL } from '../lib/units'
import type { Hizmet } from '../types'

/**
 * ÖDÜLLER — işletmenin TOPTANCI (babu.co) puanıyla alınır.
 * Puan, toptancıya verilen siparişlerin ödemesi tamamlandıkça %1 birikir (1 puan = 1 ₺).
 * Ödül alınca puan buluttan (authoritative) düşülür.
 */
export default function Hizmetler() {
  const { s, odulAl } = useStore()
  const [onay, setOnay] = useState<string | null>(null)
  const [uyari, setUyari] = useState<string | null>(null)
  const puan = s.isletmePuan ?? 0

  useEffect(() => {
    if (!onay && !uyari) return
    const t = setTimeout(() => {
      setOnay(null)
      setUyari(null)
    }, 2800)
    return () => clearTimeout(t)
  }, [onay, uyari])

  function al(h: Hizmet) {
    if (puan < h.fiyat) {
      setUyari(`Yetersiz puan — ${h.ad} için ${h.fiyat} puan gerekli, ${puan} puanın var.`)
      return
    }
    if (!confirm(`${h.ikon} ${h.ad}\n${h.fiyat} puan harcanacak. Onaylıyor musun?`)) return
    if (odulAl(h)) setOnay(`${h.ad} alındı — ${h.fiyat} puan düşüldü`)
  }

  return (
    <>
      <h1>Ödüller</h1>
      <p className="sub">
        Toptancı (babu.co) puanınla ödül al. Puan, siparişlerin ödemesi tamamlandıkça <strong>%1</strong>{' '}
        birikir (1 puan = 1 ₺). Liste sabittir.
      </p>

      <div
        className="card"
        style={{
          background: 'var(--accent-soft)',
          borderColor: 'var(--accent)',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          <strong style={{ fontSize: 24 }}>{puan}</strong> <span className="hint">puan</span>
          <span className="hint" style={{ display: 'block' }}>
            {fmtTL(puan)} değerinde · Toptancı: babu.co
          </span>
        </span>
      </div>

      <div className="katalog-grid hizmetler-grid">
        {HIZMETLER.map((h) => {
          const yeter = puan >= h.fiyat
          return (
            <div className="kat-kart" key={h.id}>
              <div className="kk-ad">
                <strong>
                  {h.ikon} {h.ad}
                </strong>
                <span className="hint">{h.aciklama}</span>
              </div>
              <div className="kk-fiyat">
                <span>
                  <b>{h.fiyat}</b> puan
                </span>
                <span>
                  = <b>{fmtTL(h.fiyat)}</b>
                </span>
              </div>
              <div className="kk-butonlar">
                <button
                  className={`btn sm ${yeter ? 'primary' : 'ghost'}`}
                  disabled={!yeter}
                  onClick={() => al(h)}
                >
                  {yeter ? '🎁 Al' : 'Yetersiz puan'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {onay && (
        <div className="onay" role="status">
          ✓ {onay}
        </div>
      )}
      {uyari && (
        <div className="onay" role="status" style={{ background: 'var(--bad)' }}>
          {uyari}
        </div>
      )}
    </>
  )
}
