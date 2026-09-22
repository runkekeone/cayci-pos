import { useState } from 'react'
import { useStore, aktifOturum } from '../store'
import { dayReport, totalVeresiye } from '../lib/report'
import { dayOf, fmtTL, round, today } from '../lib/units'
import { OdemeGrafik, SaatGrafik, UrunGrafik, type SaatDilim } from '../lib/Grafik'
import { Ikon } from '../lib/Ikon'

/** Rapor satırı: ad solda, tutar sağda. `nokta` ödeme türünün grafik rengini gösterir. */
function Satir({
  ad,
  tutar,
  ek,
  ton,
  nokta,
  isaret,
}: {
  ad: string
  tutar: number
  ek?: string
  ton?: 'good' | 'bad'
  nokta?: 'nakit' | 'kart' | 'veresiye'
  isaret?: '+' | '−'
}) {
  return (
    <div className="liste-satir">
      <span className="ls-ad">
        {nokta && <span className={`nokta ${nokta}`} />}
        {ad}
      </span>
      <span className={`ls-deger ${ton ? ton + '-txt' : ''}`}>
        {isaret}
        {fmtTL(tutar)}
        {ek && <small>{ek}</small>}
      </span>
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
  const gunSatislari = s.sales.filter((x) => (x.bizDay ?? dayOf(x.date)) === date)
  const fisSayisi = gunSatislari.length
  const karOran = r.ciro > 0 ? (r.brutKar / r.ciro) * 100 : 0

  // Saatlik yoğunluk: fişin saati satış tarihinden okunur (24 kova, boşlar grafikte kırpılır).
  const saatlik: SaatDilim[] = Array.from({ length: 24 }, (_, saat) => ({ saat, ciro: 0, fis: 0 }))
  for (const x of gunSatislari) {
    const h = new Date(x.date).getHours()
    if (h >= 0 && h < 24) {
      saatlik[h].ciro += x.total
      saatlik[h].fis += 1
    }
  }

  return (
    <>
      <h1>Günlük rapor</h1>
      <p className="sub">Gün eksiyle başlar (sabit gider payı), satış geldikçe artıya geçer.</p>

      <div className="rapor-ust">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Gün" />
        <span className="tag">{fisSayisi} satış</span>
      </div>

      {/* ---- sonuç: tek büyük rakam ---- */}
      <div className="card ozet-kart">
        <div className="ozet-etiket">Net kâr</div>
        <div className={`ozet-rakam ${r.netKar >= 0 ? 'good' : 'bad'}`}>{fmtTL(r.netKar)}</div>
        <div className="ozet-alt">
          <span>
            Ciro <b>{fmtTL(r.ciro)}</b>
          </span>
          <span>
            Brüt kâr <b>{fmtTL(r.brutKar)}</b>
            {r.ciro > 0 ? ` (%${String(round(karOran, 1)).replace('.', ',')})` : ''}
          </span>
        </div>
      </div>

      {/* ---- para nasıl geldi ---- */}
      <div className="card liste" style={{ marginTop: 12 }}>
        <Satir ad="Nakit" nokta="nakit" tutar={r.nakitSatis} />
        <Satir ad="Kart" nokta="kart" tutar={r.kartSatis} />
        <Satir ad="Veresiye" nokta="veresiye" tutar={r.veresiyeSatis} />
        <Satir ad="Kasada olması gereken" tutar={r.beklenenNakit} />
        {detay && (
          <>
            <Satir ad="Tahsil edilen borç" tutar={r.tahsilat} ton="good" />
            <Satir ad="Bugünkü alımlar" tutar={alimlar} />
            <Satir ad="Ürün maliyeti" tutar={r.satilanMalMaliyeti} />
          </>
        )}
      </div>
      <button className="btn acma-dugme" onClick={() => setDetay((d) => !d)}>
        {detay ? 'Daha az göster' : 'Tahsilat, alım ve maliyeti göster'}
        <Ikon ad={detay ? 'yukari' : 'asagi'} boy={18} />
      </button>

      <div className="grafik-izgara">
        <SaatGrafik key={date} veri={saatlik} />
        <OdemeGrafik nakit={r.nakitSatis} kart={r.kartSatis} veresiye={r.veresiyeSatis} />
        <UrunGrafik
          baslik="En çok satanlar"
          birim="adet"
          veri={r.topProducts.map((p) => ({ id: p.itemId, ad: p.name, deger: p.qty }))}
        />
        <UrunGrafik
          baslik="Ciroya katkı"
          birim="TL"
          veri={r.topProducts.map((p) => ({ id: p.itemId, ad: p.name, deger: p.ciro }))}
        />
      </div>

      <div className="rapor-iki">
        <div className="card liste">
          <p className="liste-baslik" style={{ marginTop: 10 }}>
            Günün hesabı
          </p>
          <Satir ad="Brüt kâr (satış − maliyet)" tutar={r.brutKar} isaret="+" ton="good" />
          <Satir ad="Sabit gider payı (aylık ÷ 30)" tutar={r.sabitGiderPayi} isaret="−" ton="bad" />
          <Satir ad="Günlük giderler" tutar={r.gunlukGider} isaret="−" ton="bad" />
          <Satir ad="Fire + ikram maliyeti" tutar={r.fireIkramMaliyeti} isaret="−" ton="bad" />
          <div className="liste-satir toplam">
            <span className="ls-ad">Net kâr</span>
            <span className={`ls-deger ${r.netKar >= 0 ? 'good-txt' : 'bad-txt'}`}>{fmtTL(r.netKar)}</span>
          </div>
        </div>

        <div className="card liste">
          <p className="liste-baslik" style={{ marginTop: 10 }}>
            Veresiye durumu
          </p>
          <Satir ad="Bugün yazılan" tutar={r.veresiyeSatis} />
          <Satir ad="Bugün tahsil edilen" tutar={r.tahsilat} />
          <div className="liste-satir toplam">
            <span className="ls-ad">Toplam açık veresiye</span>
            <span className="ls-deger">{fmtTL(totalVeresiye(s))}</span>
          </div>
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
              <tr key={p.itemId}>
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
