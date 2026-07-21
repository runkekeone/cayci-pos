import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { HIZMETLER } from '../defaults'
import { fmtTL } from '../lib/units'
import type { Hizmet } from '../types'

export default function Hizmetler() {
  const { hizmetAl } = useStore()
  const [secili, setSecili] = useState<Hizmet | null>(null)
  const [onay, setOnay] = useState<string | null>(null)

  // Onay balonu 2,5 sn sonra kapanır.
  useEffect(() => {
    if (!onay) return
    const t = setTimeout(() => setOnay(null), 2500)
    return () => clearTimeout(t)
  }, [onay])

  return (
    <>
      <h1>Hizmetler & Ödüller</h1>
      <p className="sub">
        Uygulamanın verdiği sadakat ödülleri. Müşteri biriken puanıyla (1 puan = 1 ₺), parayla veya
        kısmi puanla alır. Liste sabittir, düzenlenemez.
      </p>

      <div className="katalog-grid">
        {HIZMETLER.map((h) => (
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
                veya <b>{fmtTL(h.fiyat)}</b>
              </span>
            </div>
            <div className="kk-butonlar">
              <button className="btn sm primary" onClick={() => setSecili(h)}>
                🎁 Al
              </button>
            </div>
          </div>
        ))}
      </div>

      {onay && (
        <div className="onay" role="status">
          ✓ {onay}
        </div>
      )}

      {secili && (
        <AlModal
          hizmet={secili}
          onClose={() => setSecili(null)}
          onOk={(customerId, puan, para) => {
            hizmetAl(customerId, secili, puan, para)
            setSecili(null)
            setOnay(`${secili.ad} verildi`)
          }}
        />
      )}
    </>
  )
}

/** Ödül alma: müşteri seç, puan/para dağıt, onayla. */
function AlModal({
  hizmet,
  onClose,
  onOk,
}: {
  hizmet: Hizmet
  onClose: () => void
  onOk: (customerId: string, puan: number, para: 'nakit' | 'kart') => void
}) {
  const { s } = useStore()
  const [customerId, setCustomerId] = useState('')
  const [puanStr, setPuanStr] = useState('')
  const [para, setPara] = useState<'nakit' | 'kart'>('nakit')

  const musteri = s.customers.find((c) => c.id === customerId)
  const mevcutPuan = musteri?.puan ?? 0
  // Kullanılabilecek en fazla puan: müşteri bakiyesi ile hizmet fiyatı arasında küçük olan.
  const maxPuan = Math.min(mevcutPuan, hizmet.fiyat)

  // Müşteri seçilince varsayılan olarak en fazla puanı kullan.
  useEffect(() => {
    setPuanStr(customerId ? String(maxPuan) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  const puan = Math.max(0, Math.min(Number(puanStr) || 0, maxPuan))
  const paraTutar = Math.round((hizmet.fiyat - puan) * 100) / 100

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2>
          {hizmet.ikon} {hizmet.ad}
        </h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Fiyat: <strong>{hizmet.fiyat} puan</strong> ({fmtTL(hizmet.fiyat)}). Puan ve kalan para ile
          ödenir.
        </p>

        <div className="field">
          <label>Müşteri</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— müşteri seç —</option>
            {s.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.puan ?? 0} puan)
              </option>
            ))}
          </select>
        </div>

        {customerId && (
          <>
            <div className="field" style={{ marginTop: 10 }}>
              <label>
                Kullanılacak puan (en fazla {maxPuan} — müşteride {mevcutPuan} puan var)
              </label>
              <input
                type="number"
                min={0}
                max={maxPuan}
                value={puanStr}
                onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                onChange={(e) => setPuanStr(e.target.value)}
              />
            </div>

            {paraTutar > 0 && (
              <div className="field" style={{ marginTop: 10 }}>
                <label>Kalan {fmtTL(paraTutar)} nasıl ödensin</label>
                <div className="row">
                  <button
                    type="button"
                    className={`btn sm ${para === 'nakit' ? 'primary' : 'ghost'}`}
                    onClick={() => setPara('nakit')}
                  >
                    💵 Nakit
                  </button>
                  <button
                    type="button"
                    className={`btn sm ${para === 'kart' ? 'primary' : 'ghost'}`}
                    onClick={() => setPara('kart')}
                  >
                    💳 Kart
                  </button>
                </div>
              </div>
            )}

            <div className="total" style={{ marginTop: 14 }}>
              <span>
                {puan} puan
                {paraTutar > 0 ? ` + ${fmtTL(paraTutar)} ${para}` : ''}
              </span>
              <span className="v">{fmtTL(hizmet.fiyat)}</span>
            </div>
          </>
        )}

        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={!customerId}
            onClick={() => onOk(customerId, puan, para)}
          >
            Ödülü ver
          </button>
        </div>
      </div>
    </div>
  )
}
