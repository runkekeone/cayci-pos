import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { TOPTANCI_AD, cloudGet } from '../lib/cloud'
import { dayReport, totalVeresiye } from '../lib/report'
import { lowStock } from '../lib/cost'
import { UZUN_MASA_DK, fmtSure, fmtTL, gecenDakika, today } from '../lib/units'
import { Ikon, type IkonAd } from '../lib/Ikon'

/** Ana ekranın üst bandındaki kısayollar. */
const HIZLI: { id: string; ad: string; ic: IkonAd }[] = [
  { id: 'musteriler', ad: 'Veresiye', ic: 'defter' },
  { id: 'siparis', ad: 'Sipariş', ic: 'kamyon' },
  { id: 'giderler', ad: 'Gider', ic: 'para' },
]

/** Satış ekranına geç, masayı açık getir. */
function masayaGit(masaId: string) {
  ;(window as unknown as { __cayMasaAc?: string }).__cayMasaAc = masaId
  git('satis')
}

function git(id: string) {
  window.dispatchEvent(new CustomEvent('cayci-git', { detail: id }))
}

/**
 * ANASAYFA.
 * Bugünkü satış, işlemler, açık adisyonlar, son satışlar, günün durumu ve
 * (toptancı yayınladıysa) duyurular.
 * En altta büyük reklam barı (ileride reklam alanı).
 */
type Duyuru = { id?: string; tarih: string; metin: string }


export default function Anasayfa() {
  const { s } = useStore()
  const [duyurular, setDuyurular] = useState<Duyuru[]>([]) // toptancı buluttan yayınlar; yoksa bölüm hiç görünmez

  // Mount'ta toptancının yayınladığı duyuruları buluttan oku (kv anahtar: "duyurular").
  useEffect(() => {
    let iptal = false
    cloudGet('duyurular').then((r) => {
      const v = r?.value as Duyuru[] | undefined
      if (!iptal && Array.isArray(v) && v.length) setDuyurular(v)
    })
    return () => {
      iptal = true
    }
  }, [])
  const gun = today()
  const r = dayReport(s, gun)
  const kritik = lowStock(s.items).length
  const alacak = totalVeresiye(s)
  const satisAdet = s.sales.filter((x) => (x.bizDay ?? x.date.slice(0, 10)) === gun).length
  const doluMasalar = s.tables.filter((t) => t.lines.length > 0)
  const acikToplam = doluMasalar.reduce((n, t) => n + t.lines.reduce((m, l) => m + l.qty * l.unitPrice, 0), 0)
  const tarihYazi = new Date(gun + 'T12:00:00').toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  })

  // Son 7 günün cirosu (bugün dahil) — SumUp tarzı çubuk grafik.
  const GUN_KISA = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct']
  const yediGun = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(gun + 'T12:00:00')
    d.setDate(d.getDate() - (6 - i))
    const tarih = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { etiket: GUN_KISA[d.getDay()], ciro: dayReport(s, tarih).ciro, bugun: i === 6 }
  })
  const enYuksek = Math.max(...yediGun.map((g) => g.ciro), 1)
  const cayAdet = s.sales
    .filter((x) => (x.bizDay ?? x.date.slice(0, 10)) === gun)
    .reduce((n, x) => n + x.lines.filter((l) => l.itemId === 'cay-bardak').reduce((m, l) => m + l.qty, 0), 0)

  return (
    <>
      {/* ---- siyah üst bant + hızlı işlemler ---- */}
      <div className="ana-bant">
        <div className="ana-bant-ust">
          <span className="anasayfa-baslik">
            {s.business.logo && <img className="baslik-logo" src={s.business.logo} alt="" />}
            {s.business.name || 'Çay Ocağı'}
          </span>
          <span className="ana-tarih">{tarihYazi}</span>
        </div>
        <div className="ana-hizli">
          {HIZLI.map((h) => (
            <button key={h.id} onClick={() => git(h.id)}>
              <Ikon ad={h.ic} boy={22} />
              <span>{h.ad}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---- bugünün özeti ---- */}
      <div className="ana-panel">
        <div>
          <div className="ana-net-etiket">Bugünkü satış</div>
          <div className="ana-net-rakam">{fmtTL(r.ciro)}</div>
          <div className="hint">
            {cayAdet > 0 ? `${cayAdet} çay · ` : ''}
            {satisAdet} satış
          </div>
        </div>

        <div>
          <div className="ana-net-etiket" style={{ marginBottom: 6 }}>
            Son 7 gün
          </div>
          <div className="yedi-gun" role="img" aria-label="Son 7 günün cirosu">
            {yediGun.map((g, i) => (
              <span key={i} className={`yg-sutun ${g.bugun ? 'bugun' : ''}`}>
                <i style={{ height: `${Math.max((g.ciro / enYuksek) * 100, g.ciro > 0 ? 4 : 1)}%` }} />
                <em>{g.etiket}</em>
              </span>
            ))}
          </div>
        </div>

        <div>
          <Satir ad="Nakit" deger={fmtTL(r.nakitSatis)} />
          <Satir ad="Kart" deger={fmtTL(r.kartSatis)} />
          <Satir ad="Veresiye" deger={fmtTL(r.veresiyeSatis)} />
          {alacak > 0 && <Satir ad="Toplam alacak" deger={fmtTL(alacak)} />}
          {kritik > 0 && <Satir ad="Azalan stok" deger={`${kritik} ürün`} iyi={false} />}
        </div>
      </div>

      {/* ---- açık adisyonlar: her masa bir kart ---- */}
      <div className="ana-bolum-bas">
        <h2>Açık adisyonlar</h2>
        {doluMasalar.length > 0 && (
          <span className="ana-bolum-ek">
            {doluMasalar.length} masa · {fmtTL(acikToplam)}
          </span>
        )}
      </div>
      {doluMasalar.length === 0 ? (
        <div className="adisyon-bos">
          <Ikon ad="izgara" boy={22} />
          <span>Açık adisyon yok. Masaya ürün yazınca burada görünür.</span>
        </div>
      ) : (
        <div className="adisyon-kartlar">
          {doluMasalar.map((t) => {
            const tutar = t.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
            const adet = t.lines.reduce((n, l) => n + l.qty, 0)
            const dk = gecenDakika(t.openedAt)
            const uzun = dk >= UZUN_MASA_DK
            const musteri = s.customers.find((c) => c.id === t.customerId)
            // Aynı ürün birden çok satırda olabilir (çeşit, ikram): ada göre topla.
            const kalemler = new Map<string, number>()
            for (const l of t.lines) {
              const ad = s.items.find((i) => i.id === l.itemId)?.name ?? l.name
              kalemler.set(ad, (kalemler.get(ad) ?? 0) + l.qty)
            }
            // Adet ile ad ayrı satıra düşmesin: aralarında bölünmez boşluk.
            const icerik = [...kalemler].map(([ad, q]) => `${q} ${ad}`).join(' · ')
            return (
              <button key={t.id} className={`adisyon-kart ${uzun ? 'uzun' : ''}`} onClick={() => masayaGit(t.id)}>
                <span className="ak-ust">
                  <b>{t.name}</b>
                  <span className="ak-sure">{dk > 0 ? fmtSure(dk) : 'az önce'}</span>
                </span>
                <span className="ak-tutar">{fmtTL(tutar)}</span>
                <span className="ak-icerik">{icerik}</span>
                <span className="ak-alt">
                  {adet} ürün{musteri ? ` · ${musteri.name}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ---- toptancıdan duyurular ---- */}
      {duyurular.length > 0 && (
        <div className="duyuru-kutu">
          <div className="dk-bas">
            <span className="dk-ikon">
              <Ikon ad="duyuru" boy={22} />
            </span>
            <span className="dk-baslik">
              <b>{TOPTANCI_AD}</b>
              <small>Toptancından duyurular</small>
            </span>
          </div>
          <div className="dk-liste">
            {duyurular.slice(0, 4).map((d, i) => (
              <div className={`dk-madde ${i === 0 ? 'ilk' : ''}`} key={d.id ?? i}>
                <span className="dk-tarih">
                  {d.tarih}
                  {i === 0 && <em>yeni</em>}
                </span>
                <p>{d.metin}</p>
              </div>
            ))}
          </div>
          <button className="dk-dugme" onClick={() => git('siparis')}>
            Sipariş ver
            <Ikon ad="sag" boy={18} />
          </button>
        </div>
      )}
    </>
  )
}

function Satir({ ad, deger, iyi }: { ad: string; deger: string; iyi?: boolean }) {
  return (
    <div className="liste-satir">
      <span className="ls-ad">{ad}</span>
      <span className={`ls-deger ${iyi === undefined ? '' : iyi ? 'good-txt' : 'bad-txt'}`}>{deger}</span>
    </div>
  )
}
