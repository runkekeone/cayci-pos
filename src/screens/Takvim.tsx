import { useState } from 'react'
import { useStore } from '../store'
import { dayReport } from '../lib/report'
import { fmtTL, today } from '../lib/units'

const AYLAR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
]
const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

export default function Takvim() {
  const { s } = useStore()
  const now = new Date()
  const [yil, setYil] = useState(now.getFullYear())
  const [ay, setAy] = useState(now.getMonth())
  const [secili, setSecili] = useState<string | null>(null)

  const ilk = new Date(yil, ay, 1)
  const gunSayisi = new Date(yil, ay + 1, 0).getDate()
  // Pazartesi = 0 olacak şekilde kaydır.
  const bosluk = (ilk.getDay() + 6) % 7

  const gunler = Array.from({ length: gunSayisi }, (_, i) => {
    const d = `${yil}-${String(ay + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    return { gun: i + 1, tarih: d, r: dayReport(s, d) }
  })

  // Satışı olmayan günleri "kapalı" say — sabit gider eksisini aya yaymamak için.
  const acikGunler = gunler.filter((g) => g.r.ciro > 0)
  const ayCiro = acikGunler.reduce((n, g) => n + g.r.ciro, 0)
  const ayNet = acikGunler.reduce((n, g) => n + g.r.netKar, 0)

  const secR = secili ? dayReport(s, secili) : null

  function kaydir(n: number) {
    const d = new Date(yil, ay + n, 1)
    setYil(d.getFullYear())
    setAy(d.getMonth())
  }

  return (
    <>
      <h1>Takvim</h1>
      <p className="sub">Güne dokun, o günün özetini gör. Renk: yeşil kâr, kırmızı zarar.</p>

      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn sm" onClick={() => kaydir(-1)}>
          ←
        </button>
        <strong style={{ minWidth: 140, textAlign: 'center' }}>
          {AYLAR[ay]} {yil}
        </strong>
        <button className="btn sm" onClick={() => kaydir(1)}>
          →
        </button>
        <span className="tag">Ay cirosu {fmtTL(ayCiro)}</span>
        <span className={`tag ${ayNet >= 0 ? 'good' : 'bad'}`}>Ay neti {fmtTL(ayNet)}</span>
        <span className="hint">{acikGunler.length} gün açık</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 6,
          marginBottom: 20,
        }}
      >
        {GUNLER.map((g) => (
          <div key={g} className="hint" style={{ textAlign: 'center', fontWeight: 600 }}>
            {g}
          </div>
        ))}

        {Array.from({ length: bosluk }, (_, i) => (
          <div key={`b${i}`} />
        ))}

        {gunler.map((g) => {
          const bugun = g.tarih === today()
          const satisVar = g.r.ciro > 0
          const kar = g.r.netKar >= 0
          return (
            <button
              key={g.tarih}
              onClick={() => setSecili(g.tarih)}
              className="card"
              style={{
                padding: '8px 6px',
                minHeight: 74,
                textAlign: 'left',
                cursor: 'pointer',
                borderColor: bugun ? 'var(--accent)' : undefined,
                borderWidth: bugun ? 2 : 1,
                background: satisVar ? (kar ? '#f2f9f5' : '#fdf2f2') : 'var(--panel)',
                opacity: satisVar ? 1 : 0.6,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{g.gun}</div>
              {satisVar ? (
                <>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtTL(g.r.ciro)}</div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: kar ? 'var(--good)' : 'var(--bad)',
                    }}
                  >
                    {fmtTL(g.r.netKar)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>—</div>
              )}
            </button>
          )
        })}
      </div>

      {secR && (
        <div className="modal-bg" onClick={() => setSecili(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{new Date(secR.date).toLocaleDateString('tr-TR', { dateStyle: 'long' })}</h2>

            <div className="stats" style={{ marginBottom: 12 }}>
              <div className="stat">
                <div className="k">Ciro</div>
                <div className="v">{fmtTL(secR.ciro)}</div>
              </div>
              <div className="stat">
                <div className="k">Net kâr</div>
                <div className={`v ${secR.netKar >= 0 ? 'good' : 'bad'}`}>{fmtTL(secR.netKar)}</div>
              </div>
            </div>

            <table>
              <tbody>
                <tr>
                  <td>Nakit / Kart / Veresiye</td>
                  <td className="num">
                    {fmtTL(secR.nakitSatis)} · {fmtTL(secR.kartSatis)} · {fmtTL(secR.veresiyeSatis)}
                  </td>
                </tr>
                <tr>
                  <td>Satılan malın maliyeti</td>
                  <td className="num">−{fmtTL(secR.satilanMalMaliyeti)}</td>
                </tr>
                <tr>
                  <td>Brüt kâr</td>
                  <td className="num">{fmtTL(secR.brutKar)}</td>
                </tr>
                <tr>
                  <td>Sabit gider payı</td>
                  <td className="num">−{fmtTL(secR.sabitGiderPayi)}</td>
                </tr>
                <tr>
                  <td>Günlük giderler</td>
                  <td className="num">−{fmtTL(secR.gunlukGider)}</td>
                </tr>
                <tr>
                  <td>Fire + ikram</td>
                  <td className="num">−{fmtTL(secR.fireIkramMaliyeti)}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Net kâr</strong>
                  </td>
                  <td className="num">
                    <strong className={secR.netKar >= 0 ? 'v good' : 'v bad'}>
                      {fmtTL(secR.netKar)}
                    </strong>
                  </td>
                </tr>
              </tbody>
            </table>

            {secR.topProducts.length > 0 && (
              <>
                <div className="section-title">Satılanlar</div>
                <table>
                  <tbody>
                    {secR.topProducts.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td className="num">{p.qty} adet</td>
                        <td className="num">{fmtTL(p.ciro)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setSecili(null)}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
