import { useState } from 'react'
import { useStore } from '../store'
import { dayReport, totalVeresiye } from '../lib/report'
import { dayOf, fmtTL, round, today } from '../lib/units'
import { CizgiGrafik, OdemeGrafik, SaatGrafik, UrunGrafik, type SaatDilim } from '../lib/Grafik'
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
        {tutar !== 0 && isaret}
        {fmtTL(tutar)}
        {ek && <small>{ek}</small>}
      </span>
    </div>
  )
}

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

/** YYYY-AA-GG gününü n gün kaydır. */
function kaydir(d: string, n: number): string {
  const x = new Date(d + 'T12:00:00')
  x.setDate(x.getDate() + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/**
 * RAPOR — eskiden dört ayrı ekrandı (Günlük rapor, Takvim, Kasa, Gün sonu).
 * Hepsi aynı günün parasını farklı açıdan gösteriyordu; artık tek ekran:
 * üstte gün seçici, altında o günün kârı, ödemeleri, kasası ve ayın gidişatı.
 */
export default function Rapor() {
  const { s, setOpeningCash, setCountedCash } = useStore()
  const bugun = today()
  const [date, setDate] = useState(bugun)
  const [detay, setDetay] = useState(false)
  const [sayim, setSayim] = useState('')
  const r = dayReport(s, date)

  // Ayın gidişatı: yalnız satış olan günler (kapalı günler sabit gider eksisiyle ayı bozmasın).
  const [yil, ay] = date.split('-').map(Number)
  const ayGunSayisi = new Date(yil, ay, 0).getDate()
  const ayGunleri = Array.from({ length: ayGunSayisi }, (_, i) => {
    const d = `${yil}-${String(ay).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    return { gun: i + 1, r: dayReport(s, d) }
  }).filter((g) => g.r.ciro > 0)
  const ayCiro = ayGunleri.reduce((n, g) => n + g.r.ciro, 0)
  const ayNet = ayGunleri.reduce((n, g) => n + g.r.netKar, 0)

  const gunYazi = new Date(date + 'T12:00:00').toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

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
      <h1>Rapor</h1>

      <div className="gun-secici">
        <button className="btn" onClick={() => setDate(kaydir(date, -1))} aria-label="Önceki gün">
          <Ikon ad="sol" />
        </button>
        <label className="gs-orta">
          <b>{date === bugun ? 'Bugün' : gunYazi}</b>
          <small>
            {date === bugun ? gunYazi : `${fisSayisi} satış`}
            {date === bugun ? ` · ${fisSayisi} satış` : ''}
          </small>
          <input type="date" value={date} max={bugun} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Gün seç" />
        </label>
        <button
          className="btn"
          onClick={() => setDate(kaydir(date, 1))}
          disabled={date >= bugun}
          aria-label="Sonraki gün"
        >
          <Ikon ad="sag" />
        </button>
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

      {/* ---- kasa: çekmecedeki para (kâr değil) ---- */}
      <div className="card liste" style={{ marginTop: 12 }}>
        <p className="liste-baslik" style={{ marginTop: 10 }}>
          Kasa
        </p>
        <div className="liste-satir">
          <span className="ls-ad">Sabah konan para üstü</span>
          <input
            key={`acilis-${date}`}
            className="kasa-kutu"
            type="number"
            inputMode="decimal"
            defaultValue={r.acilisNakit || ''}
            placeholder="0"
            onBlur={(e) => setOpeningCash(Number(e.target.value) || 0, date)}
            aria-label="Açılış nakdi"
          />
        </div>
        <Satir ad="Nakit satış" tutar={r.nakitSatis} isaret="+" />
        {r.nakitTahsilat > 0 && <Satir ad="Nakit tahsilat" tutar={r.nakitTahsilat} isaret="+" />}
        {r.nakitGider > 0 && <Satir ad="Kasadan gider" tutar={r.nakitGider} isaret="−" />}
        {r.nakitAlis > 0 && <Satir ad="Kasadan mal alışı" tutar={r.nakitAlis} isaret="−" />}
        <div className="liste-satir toplam">
          <span className="ls-ad">Kasada olması gereken</span>
          <span className="ls-deger">{fmtTL(r.beklenenNakit)}</span>
        </div>
        <div className="liste-satir">
          <span className="ls-ad">Saydığın para</span>
          <span className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
            <input
              key={`sayim-${date}`}
              className="kasa-kutu"
              type="number"
              inputMode="decimal"
              value={sayim}
              placeholder={r.sayilanNakit != null ? String(r.sayilanNakit) : 'say, yaz'}
              onChange={(e) => setSayim(e.target.value)}
              aria-label="Sayılan nakit"
            />
            <button
              className="btn sm primary"
              disabled={sayim === ''}
              onClick={() => {
                setCountedCash(Number(sayim) || 0, date)
                setSayim('')
              }}
            >
              Kaydet
            </button>
          </span>
        </div>
        {r.kasaFarki != null && (
          <Satir
            ad={r.kasaFarki < 0 ? 'Eksik' : r.kasaFarki > 0 ? 'Fazla' : 'Kasa tuttu'}
            tutar={Math.abs(r.kasaFarki)}
            ton={r.kasaFarki < 0 ? 'bad' : 'good'}
          />
        )}
      </div>

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

      {/* ---- ayın gidişatı (eski Takvim ekranı) ---- */}
      <div className="section-title">
        {AYLAR[ay - 1]} {yil}
      </div>
      <div className="card ozet-kart">
        <div className="ozet-alt" style={{ fontSize: 15 }}>
          <span>
            Ciro <b>{fmtTL(ayCiro)}</b>
          </span>
          <span>
            Net <b className={ayNet >= 0 ? 'good-txt' : 'bad-txt'}>{fmtTL(ayNet)}</b>
          </span>
          <span>
            <b>{ayGunleri.length}</b> gün satış
          </span>
        </div>
      </div>
      {ayGunleri.length >= 2 && (
        <div className="grafik-izgara">
          <CizgiGrafik
            key={`ay-${yil}-${ay}`}
            baslik="Günlük ciro"
            veri={ayGunleri.map((g) => ({ etiket: `${g.gun} ${AYLAR[ay - 1]}`, deger: g.r.ciro }))}
          />
        </div>
      )}

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
