import { useState } from 'react'
import { useStore } from '../store'
import { dayReport, totalVeresiye } from '../lib/report'
import { fmtTL, round, today } from '../lib/units'

export default function Rapor() {
  const { s } = useStore()
  const [date, setDate] = useState(today())
  const r = dayReport(s, date)

  return (
    <>
      <h1>Günlük Rapor</h1>
      <p className="sub">Gün eksiyle başlar (sabit gider payı), satış geldikçe artıya geçer.</p>

      <div className="row" style={{ marginBottom: 16 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="stats">
        <div className="stat">
          <div className="k">Ciro</div>
          <div className="v">{fmtTL(r.ciro)}</div>
        </div>
        <div className="stat">
          <div className="k">Satılan malın maliyeti</div>
          <div className="v bad">−{fmtTL(r.satilanMalMaliyeti)}</div>
        </div>
        <div className="stat">
          <div className="k">Brüt kâr</div>
          <div className="v good">{fmtTL(r.brutKar)}</div>
        </div>
        <div className="stat" style={{ borderColor: r.netKar >= 0 ? 'var(--good)' : 'var(--bad)' }}>
          <div className="k">NET KÂR</div>
          <div className={`v ${r.netKar >= 0 ? 'good' : 'bad'}`}>{fmtTL(r.netKar)}</div>
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div className="card" style={{ flex: 1, minWidth: 300 }}>
          <strong>Günün hesabı</strong>
          <table style={{ marginTop: 10 }}>
            <tbody>
              <tr>
                <td>Sabit gider payı (aylık ÷ 30)</td>
                <td className="num v bad" style={{ fontSize: 14 }}>
                  −{fmtTL(r.sabitGiderPayi)}
                </td>
              </tr>
              <tr>
                <td>Brüt kâr (satış − maliyet)</td>
                <td className="num v good" style={{ fontSize: 14 }}>
                  +{fmtTL(r.brutKar)}
                </td>
              </tr>
              <tr>
                <td>Günlük giderler</td>
                <td className="num v bad" style={{ fontSize: 14 }}>
                  −{fmtTL(r.gunlukGider)}
                </td>
              </tr>
              <tr>
                <td>Fire + ikram maliyeti</td>
                <td className="num v bad" style={{ fontSize: 14 }}>
                  −{fmtTL(r.fireIkramMaliyeti)}
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Net kâr</strong>
                </td>
                <td className="num">
                  <strong className={r.netKar >= 0 ? 'v good' : 'v bad'}>{fmtTL(r.netKar)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 300 }}>
          <strong>Ödeme kırılımı</strong>
          <table style={{ marginTop: 10 }}>
            <tbody>
              <tr>
                <td>Nakit</td>
                <td className="num">{fmtTL(r.nakitSatis)}</td>
              </tr>
              <tr>
                <td>Kart</td>
                <td className="num">{fmtTL(r.kartSatis)}</td>
              </tr>
              <tr>
                <td>Veresiye (bugün yazılan)</td>
                <td className="num">{fmtTL(r.veresiyeSatis)}</td>
              </tr>
              <tr>
                <td>Tahsil edilen borç</td>
                <td className="num">{fmtTL(r.tahsilat)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Toplam açık veresiye</strong>
                </td>
                <td className="num">
                  <strong>{fmtTL(totalVeresiye(s))}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-title">Ürün kırılımı</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Ürün</th>
              <th className="num">Adet</th>
              <th className="num">Ciro</th>
              <th className="num">Kâr</th>
              <th className="num">Kâr payı</th>
            </tr>
          </thead>
          <tbody>
            {r.topProducts.map((p) => (
              <tr key={p.name}>
                <td>
                  <strong>{p.name}</strong>
                </td>
                <td className="num">{p.qty}</td>
                <td className="num">{fmtTL(p.ciro)}</td>
                <td className="num">{fmtTL(p.kar)}</td>
                <td className="num">
                  {r.brutKar > 0 ? `%${round((p.kar / r.brutKar) * 100, 0)}` : '—'}
                </td>
              </tr>
            ))}
            {r.topProducts.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">
                  Bu gün satış yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
