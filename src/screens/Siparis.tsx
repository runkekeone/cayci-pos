import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { lowStock } from '../lib/cost'
import { fmtTL, uid } from '../lib/units'
import { TOPTANCI_KATALOG } from '../defaults'
import { encodeOrder, orderToQr, whatsappLink } from '../lib/siparisTransport'
import type { CatalogItem, Item, Order, OrderLine } from '../types'

type Sepet = Record<string, OrderLine> // key: catalogItemId|birim

/** Toptancı katalog kategorisini çay ocağı satış kategorisine eşle. */
function katEsle(cat: string): string {
  const c = cat.toLowerCase()
  if (/sicak|çay|cay|tatland|ocag/.test(c)) return 'Sıcak'
  if (/mesrubat|meşrubat|sogut|soğut|soda|su|ayran|kola/.test(c)) return 'Soğuk'
  if (/atist|atıst/.test(c)) return 'Atıştırmalık'
  if (/mutfak|yiyecek|tost/.test(c)) return 'Yiyecek'
  return cat
}

export default function Siparis() {
  const { s, saveOrder, saveItem } = useStore()
  const [cat, setCat] = useState('Hepsi')
  const [ara, setAra] = useState('')
  const [sepet, setSepet] = useState<Sepet>({})
  const [not, setNot] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [gonderildi, setGonderildi] = useState<Order | null>(null)

  const katalog = TOPTANCI_KATALOG.filter((k) => k.active)
  const kategoriler = ['Hepsi', ...new Set(katalog.map((k) => k.category))]
  const shown = katalog.filter(
    (k) =>
      (cat === 'Hepsi' || k.category === cat) &&
      (!ara.trim() || `${k.name} ${k.brand ?? ''}`.toLowerCase().includes(ara.trim().toLowerCase())),
  )

  // Kritik stok önerisi: azalan kalemleri isimle katalogla eşleştir.
  const oneriler = useMemo(() => {
    const azalan = lowStock(s.items)
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

  function ekle(k: CatalogItem, birim: 'koli' | 'adet') {
    const key = `${k.id}|${birim}`
    setSepet((cur) => {
      const mevcut = cur[key]
      const unitPrice = birim === 'koli' ? k.koliPrice : k.adetPrice
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
    return {
      id: uid(),
      date: new Date().toISOString(),
      status: 'gonderildi',
      lines,
      note: not.trim() || undefined,
      from: { name: s.business.name, phone: s.business.phone || undefined },
    }
  }

  function whatsappGonder() {
    const order = { ...siparisOlustur(), gonderim: 'whatsapp' as const }
    saveOrder(order)
    setGonderildi(order)
    window.open(whatsappLink(order), '_blank')
  }

  async function qrGoster() {
    const order = { ...siparisOlustur(), gonderim: 'qr' as const }
    saveOrder(order)
    setGonderildi(order)
    setQr(await orderToQr(order))
  }

  function dosyaIndir() {
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
  }

  /** Katalog ürününü kendi satış listesine çek: fiyat sor, sellable Item olarak ekle. */
  function urunumeEkle(k: CatalogItem) {
    const varMi = s.items.find((i) => i.sellable && i.name.trim().toLowerCase() === k.name.trim().toLowerCase())
    if (varMi && !confirm(`"${k.name}" zaten ürün listende var. Yine de ekle?`)) return
    const oneri = Math.max(k.adetPrice, Math.round(k.adetPrice * 1.5)) // %50 kâr önerisi
    const cevap = prompt(
      `"${k.name}" kendi ürünlerine eklenecek.\nAlış (adet): ${k.adetPrice} ₺\nKaç TL'ye satacaksın?`,
      String(oneri),
    )
    if (cevap == null) return
    const fiyat = Number(cevap.replace(',', '.'))
    if (!isFinite(fiyat) || fiyat <= 0) {
      alert('Geçerli bir fiyat gir.')
      return
    }
    const item: Item = {
      id: uid(),
      name: k.name,
      unit: 'adet',
      buyUnit: k.buyUnit || 'adet',
      packSize: k.packSize > 1 ? k.packSize : undefined,
      category: katEsle(k.category),
      icon: '🛒',
      sellable: true,
      price: fiyat,
      stock: 0,
      // Maliyet = toptancıdan adet alış fiyatı → kâr = satış − bu.
      lastCost: { total: k.adetPrice, qty: 1 },
    }
    saveItem(item)
    alert(`✓ "${k.name}" ürünlerine eklendi (${fiyat} ₺). Stok girmek için Stok & Alış'ı kullan.`)
  }

  return (
    <>
      <h1>Toptancıdan Sipariş</h1>
      <p className="sub">Eksik/kritik ürünleri toptancından iste. Sipariş QR, WhatsApp veya dosya ile gider.</p>

      {oneriler.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)', marginBottom: 16 }}>
          <strong>⚠ Şunları sipariş etmelisin (stok azaldı)</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {oneriler.map(({ it, k }) => (
              <button key={it.id} className="btn sm" onClick={() => ekle(k, 'koli')}>
                + {k.name} (koli)
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid2" style={{ marginTop: 8 }}>
        {/* ---- katalog ---- */}
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input placeholder="Ürün ara..." value={ara} onChange={(e) => setAra(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          </div>
          <div className="row cat-row" style={{ marginBottom: 12 }}>
            {kategoriler.map((c) => (
              <button key={c} className={`btn sm ${cat === c ? 'primary' : 'ghost'}`} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>

          <div className="card katalog-tablo" style={{ padding: 0, overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th className="num">Koli</th>
                  <th className="num">Adet</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((k) => (
                  <tr key={k.id}>
                    <td>
                      <strong>{k.name}</strong>
                      <span className="hint" style={{ display: 'block' }}>
                        {k.brand} · {k.packSize} {k.unit}/{k.buyUnit}
                      </span>
                    </td>
                    <td className="num fiyat" data-label="Koli">{fmtTL(k.koliPrice)}</td>
                    <td className="num fiyat" data-label="Adet">{fmtTL(k.adetPrice)}</td>
                    <td className="num aksiyon">
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn sm" onClick={() => ekle(k, 'koli')}>
                          + Koli
                        </button>
                        <button className="btn sm ghost" onClick={() => ekle(k, 'adet')}>
                          + Adet
                        </button>
                        <button
                          className="btn sm"
                          title="Kendi satış listene ekle"
                          onClick={() => urunumeEkle(k)}
                        >
                          🛒 Ürünüme
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- sepet ---- */}
        <div className="card">
          <strong>Sipariş sepeti</strong>
          <div style={{ marginTop: 10 }}>
            {lines.length === 0 && <p className="hint">Katalogdan ekle.</p>}
            {lines.map((l) => {
              const key = `${l.catalogItemId}|${l.birim}`
              return (
                <div className="cline" key={key}>
                  <button className="x" onClick={() => setQty(key, l.qty - 1)}>−</button>
                  <input className="qty" type="number" min={0} value={l.qty} onChange={(e) => setQty(key, Number(e.target.value))} />
                  <button className="x" onClick={() => setQty(key, l.qty + 1)}>+</button>
                  <span className="nm">
                    {l.name} <span className="hint">({l.birim})</span>
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

          <div className="field" style={{ marginTop: 8 }}>
            <label>Not (isteğe bağlı)</label>
            <input value={not} onChange={(e) => setNot(e.target.value)} placeholder="Sabah teslim..." />
          </div>

          <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" disabled={!lines.length} onClick={whatsappGonder} style={{ flex: 1 }}>
              WhatsApp
            </button>
            <button className="btn" disabled={!lines.length} onClick={qrGoster} style={{ flex: 1 }}>
              QR göster
            </button>
            <button className="btn" disabled={!lines.length} onClick={dosyaIndir} style={{ flex: 1 }}>
              Dosya
            </button>
          </div>
          {gonderildi && (
            <p className="hint v good" style={{ marginTop: 8 }}>
              ✓ Sipariş oluşturuldu ve gönderildi.{' '}
              <button className="btn ghost sm" onClick={temizle}>
                Yeni sipariş
              </button>
            </p>
          )}
        </div>
      </div>

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
