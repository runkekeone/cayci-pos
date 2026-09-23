import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { UZUN_MASA_DK, fmtSure, fmtTL, gecenDakika } from '../lib/units'
import { Ikon } from '../lib/Ikon'

function git(id: string) {
  window.dispatchEvent(new CustomEvent('cayci-git', { detail: id }))
}

/** Satış ekranına geç, verilen masayı (ya da tezgâhı) açık getir. */
function satisaGec(masaId?: string) {
  ;(window as unknown as { __cayMasaAc?: string }).__cayMasaAc = masaId ?? 'hizli'
  git('satis')
}

/**
 * MASALAR — masaların durumu renginden okunur: boş beyaz, dolu turuncu,
 * uzun süredir açık kırmızı. Kutuda masa adı, tutar ve kaç dakikadır açık
 * olduğu yazar. Altında dükkân servisleri (veresiyesi olan müşteriler).
 */
export default function Masalar() {
  const { s } = useStore()
  // süreler dakikada bir tazelensin
  const [, setTik] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTik((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const dolular = s.tables.filter((t) => t.lines.length > 0)
  const acikTutar = dolular.reduce((n, t) => n + t.lines.reduce((m, l) => m + l.qty * l.unitPrice, 0), 0)
  const borclular = s.customers
    .filter((c) => c.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 8)

  return (
    <>
      <div className="sayfa-ust">
        <h1>Masalar</h1>
        {dolular.length > 0 && (
          <span className="hint" style={{ marginTop: 8 }}>
            {dolular.length} dolu · {fmtTL(acikTutar)} açık
          </span>
        )}
      </div>

      <div className="masa-lejant">
        <span>
          <i className="bos" />
          Boş
        </span>
        <span>
          <i className="dolu" />
          Dolu
        </span>
        <span>
          <i className="uzun" />
          {UZUN_MASA_DK} dakikayı geçti
        </span>
      </div>

      <div className="masa-izgara">
        <button className="masa-kare tezgah" onClick={() => satisaGec()}>
          <b>Tezgâh</b>
          <small>hızlı satış</small>
        </button>
        {s.tables.map((t) => {
          const dolu = t.lines.length > 0
          const dk = dolu ? gecenDakika(t.openedAt) : 0
          const uzun = dolu && dk >= UZUN_MASA_DK
          const tutar = t.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
          return (
            <button
              key={t.id}
              className={`masa-kare ${dolu ? 'dolu' : ''} ${uzun ? 'uzun' : ''}`}
              onClick={() => satisaGec(t.id)}
            >
              {dolu && <span className="mk-sure">{fmtSure(dk)}</span>}
              <b>{t.name}</b>
              <small>{dolu ? fmtTL(tutar) : 'boş'}</small>
            </button>
          )
        })}
      </div>

      {borclular.length > 0 && (
        <>
          <div className="section-title">Dükkân servisleri (veresiye)</div>
          <div className="card liste">
            {borclular.map((c) => (
              <button key={c.id} className="ana-satir" onClick={() => git('musteriler')}>
                <span>{c.name}</span>
                <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  <strong className="v">{fmtTL(c.balance)}</strong>
                  <Ikon ad="sag" boy={18} />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
