import { useState } from 'react'
import { useStore, aktifOturum } from '../store'
import { dayReport, totalVeresiye } from '../lib/report'
import { dayOf, fmtTL, round, today } from '../lib/units'

/** Kutucuk: solda ikon, sağda başlık ve tutar. */
function Kutu({
  ikon,
  renk,
  baslik,
  tutar,
  ek,
  ton,
}: {
  ikon: string
  renk: string
  baslik: string
  tutar: number
  ek?: string
  ton?: 'good' | 'bad'
}) {
  return (
    <div className="rbox">
      <span className="rbox-ic" style={{ background: renk }}>
        {ikon}
      </span>
      <div className="rbox-txt">
        <div className="rbox-k">{baslik}</div>
        <div className={`rbox-v ${ton ?? ''}`}>
          {fmtTL(tutar)}
          {ek && <span className="rbox-ek">{ek}</span>}
        </div>
      </div>
    </div>
  )
}

export default function Rapor() {
  const { s } = useStore()
  const [date, setDate] = useState(aktifOturum(s)?.date ?? today())
  const [detay, setDetay] = useState(false)
  const r = dayReport(s, date)

  // Kutulara girecek, günlük rapordan türeyen ek rakamlar
  const alimlar = s.purchases
    .filter((p) => (p.bizDay ?? dayOf(p.date)) === date)
    .reduce((n, p) => n + p.total, 0)
  const fisSayisi = s.sales.filter((x) => (x.bizDay ?? dayOf(x.date)) === date).length
  const karOran = r.ciro > 0 ? (r.brutKar / r.ciro) * 100 : 0

  return (
    <>
      <h1>Rapor</h1>
      <p className="sub">Gün eksiyle başlar (sabit gider payı), satış geldikçe artıya geçer.</p>

      <div className="row" style={{ marginBottom: 16 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <span className="tag">{fisSayisi} fiş</span>
      </div>

      <div className="rgrid">
        {/* Her zaman görünen 4 kutu: para nereden geldi */}
        <Kutu ikon="💵" renk="#e6f4ec" baslik="Nakit" tutar={r.nakitSatis} ton="good" />
        <Kutu ikon="💳" renk="#e9ecf7" baslik="POS / Kart" tutar={r.kartSatis} />
        <Kutu ikon="📒" renk="#fbeaea" baslik="Veresiye" tutar={r.veresiyeSatis} ton="bad" />
        <Kutu ikon="🧾" renk="#e9f0fb" baslik="Toplam Ciro" tutar={r.ciro} />

        {detay && (
          <>
            {/* --- para nereye gitti --- */}
            <Kutu ikon="🤝" renk="#e6f4ec" baslik="Tahsil edilen borç" tutar={r.tahsilat} ton="good" />
            <Kutu ikon="🚚" renk="#f4eee6" baslik="Bugünkü alımlar" tutar={alimlar} />
            <Kutu
              ikon="💸"
              renk="#fbeaea"
              baslik="Giderler"
              tutar={r.gunlukGider + r.sabitGiderPayi}
              ton="bad"
            />
            <Kutu ikon="🗑️" renk="#fbeaea" baslik="Fire + İkram" tutar={r.fireIkramMaliyeti} ton="bad" />

            {/* --- sonuç --- */}
            <Kutu ikon="🏦" renk="#e9f0fb" baslik="Kasada olması gereken" tutar={r.beklenenNakit} />
            <Kutu
              ikon="📈"
              renk="#e6f4ec"
              baslik="Brüt kâr"
              tutar={r.brutKar}
              ek={r.ciro > 0 ? `(%${round(karOran, 1)})` : undefined}
              ton="good"
            />
            <Kutu ikon="📦" renk="#f4eee6" baslik="Ürün maliyeti" tutar={r.satilanMalMaliyeti} />
            <Kutu
              ikon="🎯"
              renk={r.netKar >= 0 ? '#e6f4ec' : '#fbeaea'}
              baslik="NET KÂR"
              tutar={r.netKar}
              ton={r.netKar >= 0 ? 'good' : 'bad'}
            />
          </>
        )}
      </div>

      <button className="btn" style={{ marginTop: 12 }} onClick={() => setDetay((d) => !d)}>
        {detay ? '▴ Detayı gizle' : '▾ Detaylı'}
      </button>

      <div className="row" style={{ alignItems: 'flex-start', gap: 16, marginTop: 20 }}>
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
          <strong>Veresiye durumu</strong>
          <table style={{ marginTop: 10 }}>
            <tbody>
              <tr>
                <td>Bugün yazılan veresiye</td>
                <td className="num">{fmtTL(r.veresiyeSatis)}</td>
              </tr>
              <tr>
                <td>Bugün tahsil edilen</td>
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
