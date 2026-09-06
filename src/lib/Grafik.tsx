import { useState } from 'react'
import { fmtTL } from './units'

/**
 * Rapor grafikleri — dış kütüphane YOK.
 *
 * Neden: uygulama APK olarak da dağıtılıyor, bir grafik kütüphanesi paket
 * boyutunu birkaç yüz kB şişirirdi. Çubuklar HTML/CSS (telefonda metin
 * bozulmadan esner), sadece çizgi grafiği SVG.
 *
 * Renkler CSS değişkenlerinden gelir (--seri-*), koyu modda kendiliğinden
 * değişir. Ödeme üçlüsü renk körlüğü için doğrulandı; ayrıca her dilim
 * lejantta yazıyla da etiketlenir — hiçbir bilgi yalnız renge bağlı değil.
 */

/** Grafik kutusu: başlık + isteğe bağlı okuma satırı + içerik. */
function Kutu({
  baslik,
  okuma,
  children,
}: {
  baslik: string
  okuma?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="card grafik-kart">
      <div className="grafik-ust">
        <strong>{baslik}</strong>
        {okuma && <span className="grafik-okuma">{okuma}</span>}
      </div>
      {children}
    </div>
  )
}

function Bos({ yazi }: { yazi: string }) {
  return <p className="hint grafik-bos">{yazi}</p>
}

/* ------------------------------------------------------------------ */
/* Saatlik yoğunluk                                                    */
/* ------------------------------------------------------------------ */

export interface SaatDilim {
  saat: number
  ciro: number
  fis: number
}

/**
 * Günün hangi saatinde ne kadar iş yapıldı. Çay ocağında sabah ve ikindi
 * pikini görmek için — ürün hazırlığı buna göre yapılır.
 */
export function SaatGrafik({ veri }: { veri: SaatDilim[] }) {
  const [sec, setSec] = useState<number | null>(null)
  const dolu = veri.filter((d) => d.ciro > 0)
  if (!dolu.length) return <Kutu baslik="Saatlik yoğunluk"><Bos yazi="Bu gün satış yok." /></Kutu>

  // Sadece satış olan saat aralığı gösterilir; boş gece saatleri yer kaplamasın.
  const ilk = Math.min(...dolu.map((d) => d.saat))
  const son = Math.max(...dolu.map((d) => d.saat))
  const dilimler = veri.filter((d) => d.saat >= ilk && d.saat <= son)
  const max = Math.max(...dilimler.map((d) => d.ciro))
  const zirve = dolu.reduce((a, b) => (b.ciro > a.ciro ? b : a))
  const secili = sec != null ? dilimler.find((d) => d.saat === sec) : undefined

  const okuma = secili ? (
    <>
      <b>{String(secili.saat).padStart(2, '0')}:00</b> · {secili.fis} fiş · {fmtTL(secili.ciro)}
    </>
  ) : (
    <>
      en yoğun <b>{String(zirve.saat).padStart(2, '0')}:00</b> · {fmtTL(zirve.ciro)}
    </>
  )

  return (
    <Kutu baslik="Saatlik yoğunluk" okuma={okuma}>
      <div className="sutunlar">
        {dilimler.map((d) => {
          const oran = max > 0 ? (d.ciro / max) * 100 : 0
          const on = sec === d.saat
          // Aralık uzunsa her saati yazmak telefonda üst üste biner: 2'de bir yaz.
          const etiketGoster = dilimler.length <= 8 || d.saat % 2 === 0
          return (
            <button
              key={d.saat}
              className={`sutun ${on ? 'on' : ''} ${d.saat === zirve.saat ? 'zirve' : ''}`}
              onClick={() => setSec(on ? null : d.saat)}
              title={`${String(d.saat).padStart(2, '0')}:00 — ${d.fis} fiş, ${fmtTL(d.ciro)}`}
            >
              <span className="sutun-cubuk" style={{ height: `${Math.max(oran, d.ciro > 0 ? 3 : 0)}%` }} />
              <span className="sutun-et">{etiketGoster ? String(d.saat).padStart(2, '0') : ''}</span>
            </button>
          )
        })}
      </div>
    </Kutu>
  )
}

/* ------------------------------------------------------------------ */
/* Ödeme dağılımı                                                      */
/* ------------------------------------------------------------------ */

/**
 * Ciro hangi ödeme tipinden geldi. Tek yığılı çubuk — telefonda pastadan
 * çok daha okunur; her dilim lejantta rakamıyla da yazar.
 */
export function OdemeGrafik({
  nakit,
  kart,
  veresiye,
}: {
  nakit: number
  kart: number
  veresiye: number
}) {
  const toplam = nakit + kart + veresiye
  if (toplam <= 0)
    return <Kutu baslik="Ödeme dağılımı"><Bos yazi="Bu gün tahsilat yok." /></Kutu>

  const parcalar = [
    { ad: 'Nakit', deger: nakit, sinif: 'nakit' },
    { ad: 'Kart', deger: kart, sinif: 'kart' },
    { ad: 'Veresiye', deger: veresiye, sinif: 'veresiye' },
  ].filter((p) => p.deger > 0)

  return (
    <Kutu baslik="Ödeme dağılımı" okuma={<>toplam <b>{fmtTL(toplam)}</b></>}>
      <div className="yigin">
        {parcalar.map((p) => (
          <span
            key={p.ad}
            className={`yigin-parca ${p.sinif}`}
            style={{ width: `${(p.deger / toplam) * 100}%` }}
            title={`${p.ad}: ${fmtTL(p.deger)}`}
          />
        ))}
      </div>
      <div className="lejant">
        {parcalar.map((p) => (
          <span key={p.ad} className="lejant-oge">
            <i className={`lejant-nokta ${p.sinif}`} />
            {p.ad} <b>%{Math.round((p.deger / toplam) * 100)}</b>
            <span className="lejant-tutar">{fmtTL(p.deger)}</span>
          </span>
        ))}
      </div>
    </Kutu>
  )
}

/* ------------------------------------------------------------------ */
/* Ürün payı                                                           */
/* ------------------------------------------------------------------ */

/** Ne çok satıyor. Tablo zaten altta duruyor; bu ilk bakışta sıralamayı verir. */
export function UrunGrafik({
  veri,
  baslik = 'En çok satanlar',
  birim = 'adet',
}: {
  /** `id` benzersiz olmalı — aynı adlı iki ürün React anahtarını çakıştırıyordu. */
  veri: { id: string; ad: string; deger: number }[]
  baslik?: string
  birim?: string
}) {
  const ilkler = [...veri].sort((a, b) => b.deger - a.deger).slice(0, 6)
  if (!ilkler.length || ilkler[0].deger <= 0)
    return <Kutu baslik={baslik}><Bos yazi="Bu gün satış yok." /></Kutu>

  const max = ilkler[0].deger
  return (
    <Kutu baslik={baslik}>
      <div className="satirlar">
        {ilkler.map((u) => (
          <div className="satir" key={u.id}>
            <span className="satir-ad" title={u.ad}>
              {u.ad}
            </span>
            <span className="satir-yol">
              <span className="satir-cubuk" style={{ width: `${(u.deger / max) * 100}%` }} />
            </span>
            <span className="satir-deger">
              {birim === 'TL' ? fmtTL(u.deger) : `${u.deger} ${birim}`}
            </span>
          </div>
        ))}
      </div>
    </Kutu>
  )
}

/* ------------------------------------------------------------------ */
/* Tarihsel ciro çizgisi                                               */
/* ------------------------------------------------------------------ */

/**
 * Gün gün ciro. Çizgi ve alan SVG; noktalar ve dokunma hedefleri HTML.
 *
 * Neden ikisi karışık: SVG telefonda tam genişliğe esnesin diye
 * preserveAspectRatio="none" kullanılıyor, bu da daireleri yamultur.
 * Çizgi kalınlığı non-scaling-stroke ile korunur, noktalar ise üstte
 * yüzdeyle konumlanan HTML öğeleri — hiçbiri deforme olmaz.
 */
export function CizgiGrafik({
  veri,
  baslik = 'Ciro seyri',
}: {
  veri: { etiket: string; deger: number }[]
  baslik?: string
}) {
  const [sec, setSec] = useState<number | null>(null)
  if (veri.length < 2)
    return (
      <Kutu baslik={baslik}>
        <Bos yazi="Çizgi için en az iki günlük veri gerekli." />
      </Kutu>
    )

  const W = 300
  const H = 90
  // Net kâr eksiye düşebildiği için ölçek 0'ı hep içerir; sıfır çizgisi ayrıca çizilir.
  const max = Math.max(...veri.map((d) => d.deger), 0)
  const min = Math.min(...veri.map((d) => d.deger), 0)
  const aralik = max - min || 1
  const px = (i: number) => (i / (veri.length - 1)) * W
  const py = (v: number) => H - 5 - ((v - min) / aralik) * (H - 10)
  const sifir = py(0)

  const cizgi = veri
    .map((d, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(d.deger).toFixed(1)}`)
    .join(' ')
  const alan = `${cizgi} L${W},${sifir.toFixed(1)} L0,${sifir.toFixed(1)} Z`
  const secili = sec != null ? veri[sec] : undefined
  const ort = veri.reduce((n, d) => n + d.deger, 0) / veri.length

  return (
    <Kutu
      baslik={baslik}
      okuma={
        secili ? (
          <>
            <b>{secili.etiket}</b> · {fmtTL(secili.deger)}
          </>
        ) : (
          <>
            günlük ortalama <b>{fmtTL(ort)}</b>
          </>
        )
      }
    >
      <div className="cizgi-sarma">
        <svg className="cizgi" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <path className="cizgi-alan" d={alan} />
          {min < 0 && (
            <line
              className="cizgi-sifir"
              x1={0}
              x2={W}
              y1={sifir}
              y2={sifir}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path className="cizgi-yol" d={cizgi} vectorEffect="non-scaling-stroke" />
        </svg>
        {veri.map((d, i) => (
          <span
            key={`n-${d.etiket}`}
            className={`cizgi-nokta ${sec === i ? 'on' : ''}`}
            style={{ left: `${(px(i) / W) * 100}%`, top: `${(py(d.deger) / H) * 100}%` }}
          />
        ))}
        {veri.map((d, i) => (
          <button
            key={`h-${d.etiket}`}
            className="cizgi-hedef"
            style={{
              left: `calc(${(px(i) / W) * 100}% - ${50 / veri.length}%)`,
              width: `${100 / veri.length}%`,
            }}
            onClick={() => setSec(sec === i ? null : i)}
            title={`${d.etiket} — ${fmtTL(d.deger)}`}
            aria-label={`${d.etiket}: ${fmtTL(d.deger)}`}
          />
        ))}
      </div>
      <div className="cizgi-eksen">
        <span>{veri[0].etiket}</span>
        <span>{veri[veri.length - 1].etiket}</span>
      </div>
    </Kutu>
  )
}
