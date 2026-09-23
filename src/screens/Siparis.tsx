import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useStore } from '../store'
import { stokTakipli } from '../lib/cost'
import { katRenk } from '../lib/kategori'
import { fmtTL, uid } from '../lib/units'
import { encodeOrder, orderToQr, whatsappLink } from '../lib/siparisTransport'
import { babucoKatalogGetir, siparisGonderBulut, siparisDurumGetir } from '../lib/cloud'
import type { CatalogItem, Order, OrderLine, OrderPaymentPart } from '../types'
import { Ikon } from '../lib/Ikon'

/** Toptancı-tarafı durum kodu → çay ocağının göreceği etiket. */
const DURUM_ETIKET: Record<string, string> = {
  yeni: 'Gönderildi',
  onay: 'Onaylandı',
  dagitim: 'Hazırlanıyor',
  teslim: 'Teslim edildi',
}

type Sepet = Record<string, OrderLine> // key: catalogItemId|birim

const BOS_KATALOG: CatalogItem[] = []

/**
 * Toptancı bazı ürün adlarına koli içeriğini parantezle yazıyor:
 * "Eti Cin Tek Lokmalık (Koli içi 18 adet · birim fiyatı ₺21,38)".
 * Başlıkta sadece ürünün adı kalsın, parantez içi küçük yazıyla altına insin.
 * Siparişe giden satırın adı DEĞİŞMEZ — toptancı tarafındaki eşleşme bozulmasın.
 */
function adAyir(ad: string): { baslik: string; icerik?: string } {
  const m = ad.match(/^(.*?)\s*\(([^()]*)\)\s*$/)
  if (!m || !m[1].trim()) return { baslik: ad }
  const icerik = m[2].replace(/birim fiyatı\s*₺\s*/i, 'tanesi ').replace(/\s+/g, ' ').trim()
  return { baslik: m[1].trim(), icerik: icerik ? icerik.replace(/tanesi ([\d.,]+)/, 'tanesi $1 ₺') : undefined }
}
const BABUQO2 = 'babuqo2'
const BABUQO2_BAKIYE_LIMITI = 10_000

export default function Siparis() {
  const { s, saveOrder } = useStore()
  const [cat, setCat] = useState('Hepsi')
  const [ara, setAra] = useState('')
  const [sepet, setSepet] = useState<Sepet>({})
  const [not, setNot] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  // Telefonda sipariş sepeti alttan açılan sayfa.
  const [sepetAcik, setSepetAcik] = useState(false)
  // Gönderilen bir siparişin ayrıntısı (ve "tekrarla").
  const [acikSiparis, setAcikSiparis] = useState<Order | null>(null)
  const [gonderildi, setGonderildi] = useState<Order | null>(null)
  const [paymentType, setPaymentType] = useState<'nakit' | 'kart' | 'bakiye' | 'parcali'>('nakit')
  const [parcaliNakit, setParcaliNakit] = useState('0')
  const [parcaliKart, setParcaliKart] = useState('0')
  const [limitUyari, setLimitUyari] = useState<string | null>(null)
  const [durumlar, setDurumlar] = useState<Record<string, string>>({}) // sipariş id → toptancı durumu
  const [bulutKatalog, setBulutKatalog] = useState<CatalogItem[] | null>(null) // toptancının kendi panelinden çekilen güncel ürünler
  const [katalogYukleniyor, setKatalogYukleniyor] = useState(true)

  // Katalog SADECE toptancının (babuco) buluta yedeklediği gerçek ürün listesinden gelir —
  // uydurma/deneme bir yedek liste yok: toptancı panelinde görünmeyen hiçbir şey burada da görünmez.
  useEffect(() => {
    let alive = true
    const cek = async () => {
      const u = await babucoKatalogGetir()
      if (!alive) return
      if (u) setBulutKatalog(u)
      setKatalogYukleniyor(false)
    }
    void cek()
    const t = setInterval(() => void cek(), 60000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const katalog = bulutKatalog ?? BOS_KATALOG
  const kategoriler = ['Hepsi', ...new Set(katalog.map((k) => k.category))]
  const katAdlari = [...new Set(katalog.map((k) => k.category))]
  const shown = katalog.filter(
    (k) =>
      (cat === 'Hepsi' || k.category === cat) &&
      (!ara.trim() || `${k.name} ${k.brand ?? ''}`.toLowerCase().includes(ara.trim().toLowerCase())),
  )

  const gruplar: [string, CatalogItem[]][] = katAdlari
    .map((g): [string, CatalogItem[]] => [g, shown.filter((k) => k.category === g)])
    .filter(([, u]) => u.length > 0)

  // Kritik stok önerisi: azalan kalemleri isimle katalogla eşleştir.
  const oneriler = useMemo(() => {
    const azalan = s.items.filter(
      (i) => stokTakipli(i) && (i.minStock != null ? i.stock <= i.minStock : i.stock <= 0),
    )
    return azalan
      .map((it) => {
        const eslesme = katalog.find(
          (k) =>
            k.name.toLowerCase().includes(it.name.toLowerCase()) ||
            it.name.toLowerCase().includes(k.name.toLowerCase()),
        )
        return eslesme ? { it, k: eslesme } : null
      })
      .filter(Boolean) as { it: (typeof s.items)[number]; k: CatalogItem }[]
  }, [s.items, katalog])

  const lines = Object.values(sepet)
  const toplam = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
  const denemeHesabi = s.business.name.trim().toLocaleLowerCase('tr-TR') === BABUQO2
  const bakiyeLimiti = denemeHesabi ? BABUQO2_BAKIYE_LIMITI : 0
  const bakiyeBorcu = (s.orders ?? []).reduce((n, o) => {
    if (o.paymentParts?.length) return n + o.paymentParts.filter((p) => p.payment === 'bakiye').reduce((a, p) => a + p.amount, 0)
    if (o.paymentType !== 'bakiye') return n
    return n + o.lines.reduce((satir, l) => satir + l.qty * l.unitPrice, 0)
  }, 0)
  const kalanBakiye = Math.max(0, bakiyeLimiti - bakiyeBorcu)
  const parcaliNakitTutar = Math.max(0, Number(parcaliNakit.replace(',', '.')) || 0)
  const parcaliKartTutar = Math.max(0, Number(parcaliKart.replace(',', '.')) || 0)
  const parcaliPesin = parcaliNakitTutar + parcaliKartTutar
  const parcaliBakiye = Math.max(0, toplam - parcaliPesin)

  function odemeParcalari(): OrderPaymentPart[] {
    if (paymentType !== 'parcali') return [{ payment: paymentType, amount: toplam }]
    return [
      ...(parcaliNakitTutar > 0 ? [{ payment: 'nakit' as const, amount: parcaliNakitTutar }] : []),
      ...(parcaliKartTutar > 0 ? [{ payment: 'kart' as const, amount: parcaliKartTutar }] : []),
      ...(parcaliBakiye > 0 ? [{ payment: 'bakiye' as const, amount: parcaliBakiye }] : []),
    ]
  }

  /** Siparişin durumu: bulutla gidenlerde toptancının işaretlediği aşama, diğerlerinde gönderim yolu. */
  function durumBilgi(o: Order): { ad: string; renk: 'yeni' | 'onay' | 'yolda' | 'teslim' | 'diger' } {
    if (o.gonderim !== 'bulut') {
      return { ad: o.gonderim === 'whatsapp' ? 'WhatsApp' : o.gonderim === 'qr' ? 'QR' : 'Dosya', renk: 'diger' }
    }
    const d = durumlar[o.id] ?? o.durum ?? 'yeni'
    const renk = d === 'onay' ? 'onay' : d === 'dagitim' ? 'yolda' : d === 'teslim' ? 'teslim' : 'yeni'
    return { ad: DURUM_ETIKET[d] ?? 'Gönderildi', renk }
  }

  // Buluttan gönderilmiş siparişlerin toptancı-tarafı durumunu periyodik çek.
  const gonderilenler = [...(s.orders ?? [])].reverse()
  useEffect(() => {
    const bulutIds = (s.orders ?? []).filter((o) => o.gonderim === 'bulut').map((o) => o.id)
    if (bulutIds.length === 0) return
    let alive = true
    const cek = async () => {
      const d = await siparisDurumGetir(bulutIds)
      if (alive) setDurumlar((prev) => ({ ...prev, ...d }))
    }
    void cek()
    const t = setInterval(() => void cek(), 15000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [s.orders])

  function ekle(k: CatalogItem, birim: string, unitPrice: number) {
    const key = `${k.id}|${birim}`
    setSepet((cur) => {
      const mevcut = cur[key]
      return {
        ...cur,
        [key]: {
          catalogItemId: k.id,
          name: k.name,
          birim,
          qty: (mevcut?.qty ?? 0) + 1,
          unitPrice,
        },
      }
    })
  }

  /** Bir katalog kaleminin sipariş edilebilir birim(ler)i. Koli/adet ayrı fiyatlıysa ikisi de, değilse tek birim. */
  function secenekler(k: CatalogItem): { birim: string; label: string; price: number }[] {
    if (k.packSize > 1 && k.koliPrice !== k.adetPrice) {
      return [
        { birim: 'koli', label: 'Koli', price: k.koliPrice },
        { birim: 'adet', label: 'Adet', price: k.adetPrice },
      ]
    }
    return [{ birim: k.buyUnit || 'Adet', label: k.buyUnit || 'Adet', price: k.adetPrice }]
  }

  function setQty(key: string, qty: number) {
    setSepet((cur) => {
      if (qty <= 0) {
        const { [key]: _sil, ...kalan } = cur
        return kalan
      }
      return { ...cur, [key]: { ...cur[key], qty } }
    })
  }

  function siparisOlustur(): Order {
    const paymentParts = odemeParcalari()
    const bakiyeVar = paymentParts.some((p) => p.payment === 'bakiye')
    return {
      id: uid(),
      date: new Date().toISOString(),
      status: 'gonderildi',
      lines,
      paymentType: bakiyeVar ? 'bakiye' : paymentParts[0]?.payment ?? 'nakit',
      paymentParts,
      note: not.trim() || undefined,
      from: { name: s.business.name, phone: s.business.phone || undefined },
    }
  }

  function bakiyeLimitiniKontrolEt(): boolean {
    if (paymentType === 'parcali' && parcaliPesin > toplam) {
      setLimitUyari(`Peşin tutar toplam siparişten büyük olamaz. Sipariş toplamı ${fmtTL(toplam)}.`)
      return false
    }
    const bakiyeTutar = odemeParcalari().filter((p) => p.payment === 'bakiye').reduce((n, p) => n + p.amount, 0)
    if (bakiyeTutar <= kalanBakiye) return true
    setLimitUyari(
      `Bakiye limiti aşıldı. Mevcut borç ${fmtTL(bakiyeBorcu)}, kullanılabilir limit ${fmtTL(kalanBakiye)}; bakiye payı ${fmtTL(bakiyeTutar)}.`,
    )
    return false
  }

  function whatsappGonder() {
    if (!bakiyeLimitiniKontrolEt()) return
    const order = { ...siparisOlustur(), gonderim: 'whatsapp' as const }
    saveOrder(order)
    setGonderildi(order)
    window.open(whatsappLink(order), '_blank')
  }

  /** İnternetten gönder: toptancı (babuco) siparişi Supabase'den otomatik alır. */
  async function internetGonder() {
    if (!bakiyeLimitiniKontrolEt()) return
    setLimitUyari(null)
    const order = { ...siparisOlustur(), gonderim: 'bulut' as const }
    saveOrder(order)
    setGonderildi(order)
    const ok = await siparisGonderBulut(order)
    if (!ok) {
      alert('İnternete gönderilemedi (bağlantı yok). WhatsApp / QR / Dosya ile de gönderebilirsin.')
      return
    }
    setDurumlar((d) => ({ ...d, [order.id]: 'yeni' }))
    // Gönderildi: sepet boşalsın ki aynı sipariş yanlışlıkla ikinci kez gitmesin.
    setSepet({})
    setNot('')
  }

  async function qrGoster() {
    if (!bakiyeLimitiniKontrolEt()) return
    const order = { ...siparisOlustur(), gonderim: 'qr' as const }
    saveOrder(order)
    setGonderildi(order)
    setQr(await orderToQr(order))
  }

  function dosyaIndir() {
    if (!bakiyeLimitiniKontrolEt()) return
    const order = { ...siparisOlustur(), gonderim: 'dosya' as const }
    saveOrder(order)
    setGonderildi(order)
    const blob = new Blob([encodeOrder(order)], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `siparis-${order.id}.caysip.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function temizle() {
    setSepet({})
    setNot('')
    setGonderildi(null)
    setQr(null)
    setPaymentType('nakit')
    setLimitUyari(null)
  }

  return (
    <>
      <h1>Toptancıdan sipariş</h1>
      <p className="sub">Eksik ürünleri toptancından iste. Ürüne dokun, sepete düşsün.</p>
      {katalogYukleniyor && (
        <p className="hint" style={{ marginTop: -8, marginBottom: 8 }}>
          Toptancının ürün listesi yükleniyor…
        </p>
      )}
      {!katalogYukleniyor && !bulutKatalog && (
        <p className="hint" style={{ marginTop: -8, marginBottom: 8 }}>
          Toptancının ürün listesine ulaşılamadı (internet yok). Bağlantı gelince liste otomatik yüklenir.
        </p>
      )}
      {!katalogYukleniyor && bulutKatalog && bulutKatalog.length === 0 && (
        <p className="hint" style={{ marginTop: -8, marginBottom: 8 }}>
          Toptancı panelinde şu an satışta görünen ürün yok.
        </p>
      )}

      {oneriler.length > 0 && (
        <div className="eksik-kutu">
          <div className="eksik-bas">
            <Ikon ad="dikkat" boy={22} />
            <span>
              <b>Eksik ürünler</b>
              <small>Stoğun bitti ya da azaldı — sipariş etmelisin</small>
            </span>
          </div>
          {oneriler.map(({ it, k }) => {
            const opt = secenekler(k)[0]
            const sepette = sepet[`${k.id}|${opt.birim}`]?.qty ?? 0
            return (
              <div className="eksik-satir" key={it.id}>
                <span className="es-ad">
                  <b>{adAyir(k.name).baslik}</b>
                  <small>{it.stock <= 0 ? 'Stok bitti' : `Kalan ${Math.round(it.stock)}`}</small>
                </span>
                <span className="es-fiyat">{fmtTL(opt.price)}</span>
                <button className={`es-ekle ${sepette ? 'var' : ''}`} onClick={() => ekle(k, opt.birim, opt.price)}>
                  {sepette ? `${sepette} ${opt.label}` : `+ ${opt.label}`}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid2 siparis-grid" style={{ marginTop: 8 }}>
        {/* ---- katalog: bölüm bölüm, her bölüm kendi renginde ---- */}
        <div>
          <div className="ara-kutu">
            <Ikon ad="ara" boy={18} />
            <input placeholder="Ürün ara" value={ara} onChange={(e) => setAra(e.target.value)} aria-label="Ürün ara" />
            {ara && (
              <button className="ara-sil" onClick={() => setAra('')} aria-label="Aramayı temizle">
                <Ikon ad="kapat" boy={16} />
              </button>
            )}
          </div>
          <div className="row cat-row" style={{ marginBottom: 14 }}>
            {kategoriler.map((c) => (
              <button
                key={c}
                className={`kat renkli ${cat === c ? 'on' : ''}`}
                style={c === 'Hepsi' ? undefined : ({ '--k': katRenk(c, katAdlari) } as CSSProperties)}
                onClick={() => setCat(c)}
              >
                {c !== 'Hepsi' && <i className="kat-nokta" />}
                {c}
              </button>
            ))}
          </div>

          {gruplar.map(([grup, urunler]) => (
            <section className="sip-bolum" key={grup} style={{ '--k': katRenk(grup, katAdlari) } as CSSProperties}>
              <div className="sip-bolum-bas">
                <i className="kat-nokta" />
                <b>{grup}</b>
                <span>{urunler.length} ürün</span>
              </div>
              <div className="sip-liste">
                {urunler.map((k) => {
                  const opts = secenekler(k)
                  const { baslik, icerik } = adAyir(k.name)
                  return (
                    <div className="sip-satir" key={k.id}>
                      <span className="sip-serit" aria-hidden="true" />
                      <span className="as-ad">
                        <b>{baslik}</b>
                        <small>
                          {k.brand ? `${k.brand} · ` : ''}
                          {opts.length > 1 ? `${k.packSize} ${k.unit}/${k.buyUnit}` : k.buyUnit}
                          {icerik ? ` · ${icerik}` : ''}
                        </small>
                      </span>
                      <span className="sip-dugmeler">
                        {opts.map((o) => {
                          const adet = sepet[`${k.id}|${o.birim}`]?.qty ?? 0
                          return (
                            <button
                              key={o.birim}
                              className={`sip-ekle ${adet ? 'var' : ''}`}
                              onClick={() => ekle(k, o.birim, o.price)}
                              aria-label={`${k.name} ${o.label} ekle`}
                            >
                              <b>{fmtTL(o.price)}</b>
                              <small>{adet ? `${adet} ${o.label} ✓` : `+ ${o.label}`}</small>
                            </button>
                          )
                        })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          {shown.length === 0 && <p className="hint">Ürün bulunamadı.</p>}
        </div>

        {/* ---- sepet ---- */}
        {sepetAcik && <div className="backdrop" onClick={() => setSepetAcik(false)} />}
        <div className={`card cart siparis-sepet ${sepetAcik ? 'acik' : ''}`}>
          <div className="cart-bas">
            <strong>Sipariş sepeti</strong>
            <button className="x cart-kapat" onClick={() => setSepetAcik(false)} aria-label="Sepeti kapat">
              <Ikon ad="kapat" />
            </button>
          </div>
          <div className="cart-lines">
            {lines.length === 0 && <p className="hint">Katalogdan ekle.</p>}
            {lines.map((l) => {
              const key = `${l.catalogItemId}|${l.birim}`
              return (
                <div className="cline" key={key}>
                  <button className="x" onClick={() => setQty(key, l.qty - 1)}>−</button>
                  <input className="qty" type="number" min={0} value={l.qty} onChange={(e) => setQty(key, Number(e.target.value))} />
                  <button className="x" onClick={() => setQty(key, l.qty + 1)}>+</button>
                  <span className="nm">
                    {adAyir(l.name).baslik}
                    <small>{l.birim}</small>
                  </span>
                  <span className="am">{fmtTL(l.qty * l.unitPrice)}</span>
                </div>
              )
            })}
          </div>

          <div className="total" style={{ marginTop: 10 }}>
            <span>Toplam</span>
            <span className="v">{fmtTL(toplam)}</span>
          </div>

          <div className="siparis-odeme" aria-label="Ödeme tipi">
            {(['nakit', 'kart', 'bakiye', 'parcali'] as const).map((tip) => (
              <button
                key={tip}
                type="button"
                className={`btn sm ${paymentType === tip ? 'primary' : 'ghost'}`}
                onClick={() => {
                  setPaymentType(tip)
                  setLimitUyari(null)
                }}
              >
                {tip === 'nakit' ? 'Nakit' : tip === 'kart' ? 'Kart' : tip === 'bakiye' ? 'Bakiye' : 'Parçalı'}
              </button>
            ))}
          </div>
          {paymentType === 'parcali' && (
            <div className="parcali-odeme">
              <label>
                Nakit
                <input inputMode="decimal" value={parcaliNakit} onChange={(e) => setParcaliNakit(e.target.value)} />
              </label>
              <label>
                Kart
                <input inputMode="decimal" value={parcaliKart} onChange={(e) => setParcaliKart(e.target.value)} />
              </label>
              <p className={`bakiye-bilgi ${parcaliBakiye > kalanBakiye ? 'asildi' : ''}`}>
                Bakiye payı: <b>{fmtTL(parcaliBakiye)}</b> · Kullanılabilir limit: <b>{fmtTL(kalanBakiye)}</b>
              </p>
            </div>
          )}
          {paymentType === 'bakiye' && (
            <p className={`bakiye-bilgi ${toplam > kalanBakiye ? 'asildi' : ''}`}>
              {denemeHesabi
                ? `babuqo2 limiti: ${fmtTL(bakiyeLimiti)} · Kullanılabilir: ${fmtTL(kalanBakiye)}`
                : 'Bu hesap için bakiye limiti tanımlı değil.'}
            </p>
          )}
          {limitUyari && <p className="bakiye-uyari" role="alert">{limitUyari}</p>}

          <div className="field" style={{ marginTop: 8 }}>
            <label>Not (isteğe bağlı)</label>
            <input value={not} onChange={(e) => setNot(e.target.value)} placeholder="Sabah teslim..." />
          </div>

          <button
            className="btn primary"
            disabled={!lines.length}
            onClick={internetGonder}
            style={{ width: '100%', marginTop: 8 }}
          >
            Siparişi gönder
          </button>
          <div className="hint" style={{ marginTop: 6, textAlign: 'center' }}>
            internet yoksa yedek:
          </div>
          <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button className="btn ghost" disabled={!lines.length} onClick={whatsappGonder} style={{ flex: 1 }}>
              WhatsApp
            </button>
            <button className="btn ghost" disabled={!lines.length} onClick={qrGoster} style={{ flex: 1 }}>
              QR
            </button>
            <button className="btn ghost" disabled={!lines.length} onClick={dosyaIndir} style={{ flex: 1 }}>
              Dosya
            </button>
          </div>
          {gonderildi && (
            <p className="hint v good" style={{ marginTop: 8 }}>
              {gonderildi.gonderim === 'bulut'
                ? 'Gönderildi — toptancıya düştü.'
                : 'Sipariş oluşturuldu ve gönderildi.'}{' '}
              <button className="btn ghost sm" onClick={temizle}>
                Yeni sipariş
              </button>
            </p>
          )}
        </div>
      </div>

      {gonderilenler.length > 0 && (
        <>
          <div className="ana-bolum-bas">
            <h2>Gönderilen siparişler</h2>
            <span className="ana-bolum-ek">{gonderilenler.length} sipariş</span>
          </div>
          <div className="adisyon-satirlar">
            {gonderilenler.slice(0, 10).map((o) => {
              const tut = o.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
              const d = durumBilgi(o)
              const tarih = new Date(o.date).toLocaleString('tr-TR', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
              const icerik = o.lines.map((l) => `${l.qty} ${adAyir(l.name).baslik}`).join(', ')
              return (
                <button key={o.id} className={`gs-satir d-${d.renk}`} onClick={() => setAcikSiparis(o)}>
                  <span className="as-serit" aria-hidden="true" />
                  <span className="as-ad">
                    <b>{tarih}</b>
                    <small>{icerik}</small>
                  </span>
                  <span className="gs-durum">{d.ad}</span>
                  <span className="as-tutar">{fmtTL(tut)}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {acikSiparis && (
        <div className="modal-bg" onClick={() => setAcikSiparis(null)}>
          <div className="modal duzenle-sayfa" onClick={(e) => e.stopPropagation()}>
            <div className="cart-bas">
              <div>
                <strong>
                  {new Date(acikSiparis.date).toLocaleString('tr-TR', {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </strong>
                <div className="cart-hedef">{durumBilgi(acikSiparis).ad}</div>
              </div>
              <button className="x" onClick={() => setAcikSiparis(null)} aria-label="Kapat">
                <Ikon ad="kapat" />
              </button>
            </div>
            <div className="odeme-kalemler" style={{ marginTop: 12 }}>
              {acikSiparis.lines.map((l, i) => (
                <div className="liste-satir" key={i}>
                  <span className="ls-ad">
                    {l.qty} {l.birim} · {adAyir(l.name).baslik}
                  </span>
                  <span className="ls-deger">{fmtTL(l.qty * l.unitPrice)}</span>
                </div>
              ))}
              <div className="liste-satir toplam">
                <span className="ls-ad">Toplam</span>
                <span className="ls-deger">
                  {fmtTL(acikSiparis.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0))}
                </span>
              </div>
            </div>
            {acikSiparis.note && <p className="hint">Not: {acikSiparis.note}</p>}
            <button
              className="btn primary ode-dugme"
              onClick={() => {
                setSepet(Object.fromEntries(acikSiparis.lines.map((l) => [`${l.catalogItemId}|${l.birim}`, { ...l }])))
                setAcikSiparis(null)
                setSepetAcik(true)
              }}
            >
              Aynısını tekrar sepete koy
            </button>
          </div>
        </div>
      )}

      {/* telefonda: sepet özeti altta durur, dokununca sepet açılır */}
      {lines.length > 0 && !sepetAcik && (
        <button className="sepet-bar" onClick={() => setSepetAcik(true)}>
          <span className="sb-adet">{lines.length}</span>
          <span className="sb-orta">
            <span className="sb-hedef">Sipariş sepeti</span>
            <span className="sb-tut">{fmtTL(toplam)}</span>
          </span>
          <span className="sb-btn">
            Gönder
            <Ikon ad="sag" boy={18} kalinlik={2.2} />
          </span>
        </button>
      )}
      {qr && (
        <div className="modal-bg" onClick={() => setQr(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
            <h2>Sipariş QR'ı</h2>
            <p className="hint">Toptancı bunu "Sipariş Al" ekranından okutsun.</p>
            <img src={qr} alt="Sipariş QR" style={{ width: '100%', maxWidth: 320, margin: '0 auto' }} />
            <button className="btn primary" onClick={() => setQr(null)} style={{ marginTop: 12 }}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </>
  )
}
