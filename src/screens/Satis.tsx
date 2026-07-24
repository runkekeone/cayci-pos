import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { availableQty, lowStock, unitCost, variantCost } from '../lib/cost'
import { urunGorsel } from '../lib/urunGorsel'
import { fmtTL, uid } from '../lib/units'
import { extract } from '../lib/ocr'
import type { Business, Item, Payment, PaymentPart, Sale, SaleLine, Variant } from '../types'

type Target = { kind: 'hizli' } | { kind: 'masa'; id: string }

/**
 * Adet kutusu. Doğrudan store'a yazan input, kutu boşaltılınca (5 sil → 12 yaz)
 * satırı anında siliyordu. Bu yüzden yarı kontrollü: boş/0/geçersizken store'a
 * dokunmaz, yeni rakamı bekler; kutudan çıkınca hâlâ boşsa eski adede döner.
 * Satır silme yalnız − ve ✕ düğmesiyle.
 */
function QtyInput({ qty, onQty }: { qty: number; onQty: (n: number) => void }) {
  const [val, setVal] = useState(String(qty))
  useEffect(() => setVal(String(qty)), [qty])
  return (
    <input
      className="qty"
      type="number"
      min={1}
      value={val}
      // Mobilde klavye açılınca kutuyu ortala — ödeme düğmeleri klavye altında kaybolmasın.
      onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
      onChange={(e) => {
        const v = e.target.value
        setVal(v)
        const n = Number(v)
        if (v !== '' && Number.isFinite(n) && n > 0) onQty(n)
      }}
      onBlur={() => {
        const n = Number(val)
        if (val === '' || !Number.isFinite(n) || n <= 0) setVal(String(qty))
      }}
    />
  )
}

export default function Satis() {
  const {
    s,
    addToTable,
    removeFromTable,
    setTableQty,
    renameTable,
    setTableCustomer,
    closeTable,
    quickSale,
    paySplit,
    cancelSale,
    editSale,
    restoreSale,
    saveCustomer,
  } = useStore()

  const [target, setTarget] = useState<Target>({ kind: 'hizli' })
  const [quick, setQuick] = useState<SaleLine[]>([])
  const [customerId, setCustomerId] = useState('')
  const [cat, setCat] = useState('Hepsi')
  const [ara, setAra] = useState('')
  const [detayli, setDetayli] = useState(false)
  // İkram/zayi modu: doluyken ürüne dokununca sepete gitmez, stoktan düşer.
  const [zayiMod, setZayiMod] = useState<'ikram' | 'fire' | null>(null)
  const [adlandir, setAdlandir] = useState<string | null>(null)
  const [cesitSec, setCesitSec] = useState<Item | null>(null)
  const [parcali, setParcali] = useState(false)
  // Yapılmış satışı incele/düzenle modalı.
  const [incele, setIncele] = useState<Sale | null>(null)
  // Mobilde sepet alttan açılan panel. Masaüstünde CSS bunu yok sayar.
  const [sepetAcik, setSepetAcik] = useState(false)
  // Satış bitince çıkan onay balonu — "oldu mu olmadı mı" belirsizliğini bitirir.
  const [onay, setOnay] = useState<{ tutar: number; payment: Payment } | null>(null)
  // Veresiyeye basıldı ama müşteri seçilmedi: seçiciyi öne çıkar.
  const [musteriSor, setMusteriSor] = useState(false)
  // Yeni müşteri adı modalı — WebView'de prompt() çalışmadığı için uygulama-içi.
  const [yeniAd, setYeniAd] = useState<((ad: string) => void) | null>(null)
  // İptal onayı — confirm() yerine uygulama-içi modal.
  const [iptalSale, setIptalSale] = useState<Sale | null>(null)
  // Son iptal — birkaç saniye geri alma imkânı (undo).
  const [undo, setUndo] = useState<Sale | null>(null)
  // Fiş görüntüle/paylaş.
  const [fisSale, setFisSale] = useState<Sale | null>(null)
  // Fotoğraftan masayı doldur (AI).
  const [fisOku, setFisOku] = useState(false)

  // AI'dan gelen (ürün, adet) çiftlerini aktif masaya/hızlıya işle.
  function fisDoldur(pairs: { itemId: string; qty: number }[]) {
    for (const p of pairs) {
      const item = s.items.find((i) => i.id === p.itemId)
      if (!item) continue
      for (let k = 0; k < p.qty; k++) ekle(item)
    }
    setFisOku(false)
  }

  // İptali uygula ama satışı sakla: undo balonu geri getirebilsin.
  function iptalEt(sale: Sale) {
    cancelSale(sale.id)
    setUndo(sale)
  }

  const sellable = s.items.filter((i) => i.sellable)
  // Kategori sırası sabit; kullanıcının eklediği yeni kategoriler sona düşer.
  const SIRA = ['Sıcak', 'Soğuk', 'Yiyecek', 'Atıştırmalık']
  const mevcut = [...new Set(sellable.map((i) => i.category))].sort((a, b) => {
    const ia = SIRA.indexOf(a)
    const ib = SIRA.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const cats = ['Hepsi', ...mevcut]
  const KAT_IKON: Record<string, string> = {
    Hepsi: '▦',
    Sıcak: '☕',
    Soğuk: '❄️',
    Yiyecek: '🍞',
    Atıştırmalık: '🍪',
  }
  const aranan = ara.trim().toLowerCase()
  const shown = (cat === 'Hepsi' ? sellable : sellable.filter((i) => i.category === cat))
    .filter((i) => !aranan || i.name.toLowerCase().includes(aranan))
    .slice()
    .sort((a, b) => mevcut.indexOf(a.category) - mevcut.indexOf(b.category))

  const table = target.kind === 'masa' ? s.tables.find((t) => t.id === target.id) : undefined
  const lines = target.kind === 'masa' ? (table?.lines ?? []) : quick
  const total = useMemo(() => lines.reduce((n, l) => n + l.qty * l.unitPrice, 0), [lines])

  const azalanlar = lowStock(s.items)
  const sonSatislar = [...s.sales].reverse().slice(0, 6)

  // Masaya müşteri atandıysa veresiyede o seçili gelir.
  const aktifMusteri = table?.customerId ?? customerId

  function ekle(item: Item, variant?: Variant, waste?: 'ikram' | 'fire') {
    if (target.kind === 'masa') {
      addToTable(target.id, item.id, 1, variant, waste)
      return
    }
    setQuick((cur) => {
      // İkram/zayi satırı normal satırla birleşmez — biri ücretli, biri 0₺.
      const idx = cur.findIndex(
        (l) => l.itemId === item.id && l.variantId === variant?.id && l.waste === waste,
      )
      if (idx >= 0) return cur.map((l, i) => (i === idx ? { ...l, qty: l.qty + 1 } : l))
      const etiket = waste === 'ikram' ? 'İkram' : waste === 'fire' ? 'Zayi' : undefined
      return [
        ...cur,
        {
          itemId: item.id,
          name: etiket
            ? `${item.name} (${etiket})`
            : variant
              ? `${item.name} (${variant.name})`
              : item.name,
          qty: 1,
          unitPrice: waste ? 0 : (item.price ?? 0) + (variant?.priceDelta ?? 0),
          unitCost: variantCost(item.id, s.items, variant),
          variantId: variant?.id,
          variantName: variant?.name,
          waste,
        },
      ]
    })
  }

  /** Detaylı moddaysa ve ürünün çeşidi varsa önce çeşit sorulur. */
  function tikla(item: Item) {
    // İkram/zayi modu açıksa: masaya 0₺ satır olarak yazılır, stok masa kapanınca düşer.
    if (zayiMod) {
      ekle(item, undefined, zayiMod)
      return
    }
    if (detayli && item.variants?.length) {
      setCesitSec(item)
      return
    }
    ekle(item)
  }

  function azalt(index: number) {
    if (target.kind === 'masa') {
      removeFromTable(target.id, index)
      return
    }
    setQuick((cur) =>
      cur.map((l, i) => (i === index ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0),
    )
  }

  function artir(index: number) {
    const l = lines[index]
    const item = s.items.find((i) => i.id === l.itemId)
    if (!item) return
    const v = item.variants?.find((x) => x.id === l.variantId)
    ekle(item, v, l.waste)
  }

  function setQty(index: number, qty: number) {
    if (target.kind === 'masa') {
      setTableQty(target.id, index, qty)
      return
    }
    setQuick((cur) => cur.map((l, i) => (i === index ? { ...l, qty } : l)).filter((l) => l.qty > 0))
  }

  function temizle() {
    if (target.kind === 'hizli') setQuick([])
    setCustomerId('')
  }

  function ode(payment: Payment) {
    if (payment === 'veresiye' && !aktifMusteri) {
      // Müşteri yoksa uyarıp bırakmak yerine seçiciyi aç — akış kesilmesin.
      setMusteriSor(true)
      return
    }
    const tutar = total
    if (target.kind === 'masa') {
      closeTable(target.id, payment, payment === 'veresiye' ? aktifMusteri : undefined)
    } else {
      quickSale(quick, payment, payment === 'veresiye' ? aktifMusteri : undefined)
      setQuick([])
    }
    setCustomerId('')
    setSepetAcik(false)
    setMusteriSor(false)
    // Satış olduğunu göster: eskiden ekran sessizce temizleniyordu.
    setOnay({ tutar, payment })
  }

  // Onay balonu 2,5 sn sonra kendi kapanır.
  useEffect(() => {
    if (!onay) return
    const t = setTimeout(() => setOnay(null), 2500)
    return () => clearTimeout(t)
  }, [onay])

  // Undo balonu 6 sn açık kalır — geri alma penceresi.
  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(t)
  }, [undo])

  // Alt çubuktaki (+) Hızlı Satış: ekranı hızlı tezgâha alır.
  useEffect(() => {
    const f = () => {
      setTarget({ kind: 'hizli' })
      setSepetAcik(false)
    }
    window.addEventListener('cayci-hizli', f)
    return () => window.removeEventListener('cayci-hizli', f)
  }, [])

  // Anasayfa "Adisyonu aç": sayfa Satış'a geçince bu ekran yeni mount olur.
  // Event mount'tan önce atıldığı için kaçardı; bunun yerine window'daki bekleyen
  // masa id'sini mount anında okuyup seçiyoruz.
  useEffect(() => {
    const w = window as unknown as { __cayMasaAc?: string }
    const id = w.__cayMasaAc
    w.__cayMasaAc = undefined
    if (id && s.tables.some((t) => t.id === id)) {
      setTarget({ kind: 'masa', id })
      setSepetAcik(true)
    }
    // yalnız mount'ta: bekleyen id'yi bir kez tüket
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function parcaliOde(parts: PaymentPart[]) {
    paySplit(lines, parts, target.kind === 'masa' ? target.id : undefined)
    if (target.kind === 'hizli') setQuick([])
    setCustomerId('')
    setParcali(false)
    setSepetAcik(false)
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Satış</h1>
          <p className="sub">
            {target.kind === 'hizli'
              ? 'Hızlı satış — ürüne dokun, ödemeyi al, bitti.'
              : `${table?.name} adisyonu açık.`}
          </p>
        </div>
        <button
          className={`btn ${detayli ? 'primary' : ''}`}
          onClick={() => {
            const on = !detayli
            setDetayli(on)
            if (!on) setZayiMod(null)
          }}
          title="Çeşit seçimi, masaya müşteri atama, ikram/zayi açılır"
        >
          {detayli ? '✓ Detaylı' : 'Detaylı'}
        </button>
      </div>

      {/* ---- masalar ----
           Kategori sırasıyla üst üste iki benzer pil şeridi oluşuyordu ve hangisinin
           ne olduğu anlaşılmıyordu. Artık her şerit ne seçtiğini söylüyor. */}
      <div className="serit-etiket">Masa seçin</div>
      <div className="tables">
        <button
          className={`table-btn ${target.kind === 'hizli' ? 'on' : ''}`}
          onClick={() => setTarget({ kind: 'hizli' })}
        >
          <div className="t-ic">⚡</div>
          <div className="nm">Hızlı</div>
          <div className="am">tezgâh</div>
        </button>

        {s.tables.map((t) => {
          const amt = t.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
          const dolu = amt > 0
          const on = target.kind === 'masa' && target.id === t.id
          const musteri = s.customers.find((c) => c.id === t.customerId)
          return (
            <button
              key={t.id}
              className={`table-btn ${dolu ? 'busy' : ''} ${on ? 'on' : ''}`}
              onClick={() => setTarget({ kind: 'masa', id: t.id })}
              onDoubleClick={() => setAdlandir(t.id)}
              title="Çift tıkla: isim ver"
            >
              <div className="t-ic">🪑</div>
              <div className="nm">{t.name}</div>
              <div className="am">{dolu ? fmtTL(amt) : 'boş'}</div>
              {musteri && <div className="t-count">{musteri.name}</div>}
            </button>
          )
        })}
      </div>

      {target.kind === 'masa' && (
        <div className="row" style={{ margin: '10px 0 0' }}>
          <button className="btn sm" onClick={() => setAdlandir(target.id)}>
            ✏️ Masaya isim ver
          </button>
          {detayli && (
            <>
              <span className="hint">Masadaki müşteri:</span>
              <select
                value={table?.customerId ?? ''}
                onChange={(e) => setTableCustomer(target.id, e.target.value || undefined)}
                style={{ minWidth: 180 }}
              >
                <option value="">— yok —</option>
                {s.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.balance > 0 ? ` (borç ${fmtTL(c.balance)})` : ''}
                  </option>
                ))}
              </select>
              <button
                className="btn sm"
                onClick={() =>
                  setYeniAd(() => (ad: string) => {
                    const id = uid()
                    saveCustomer({ id, name: ad, balance: 0 })
                    if (target.kind === 'masa') setTableCustomer(target.id, id)
                  })
                }
              >
                + Yeni müşteri
              </button>
            </>
          )}
        </div>
      )}

      {azalanlar.length > 0 && (
        <div
          className="card"
          style={{ margin: '16px 0 0', borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
        >
          <strong>⚠ Stok azaldı</strong>
          <p className="hint" style={{ marginTop: 6, color: 'var(--ink)' }}>
            {azalanlar.map((i) => i.name).join(' · ')} — satış devam eder, alım yapmayı unutma.
          </p>
        </div>
      )}

      {/* ---- ürünler + sepet ---- */}
      <div className="grid2" style={{ marginTop: 16 }}>
        <div>
          {detayli && (
            <div
              className="row"
              style={{ marginBottom: 14, alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
            >
              <span className="hint" style={{ marginRight: 4 }}>
                İkram / Zayi:
              </span>
              <button
                className={`btn sm ${zayiMod === 'ikram' ? 'primary' : ''}`}
                onClick={() => setZayiMod(zayiMod === 'ikram' ? null : 'ikram')}
              >
                🎁 İkram
              </button>
              <button
                className={`btn sm ${zayiMod === 'fire' ? 'primary' : ''}`}
                onClick={() => setZayiMod(zayiMod === 'fire' ? null : 'fire')}
              >
                🗑 Zayi
              </button>
              {zayiMod && (
                <span className="tag warn" style={{ marginLeft: 4 }}>
                  {zayiMod === 'ikram' ? 'İkram' : 'Zayi'} modu — ürüne dokun, masaya 0₺ yazılır
                </span>
              )}
            </div>
          )}
          <div className="ara-kutu">
            <span className="ara-ic">🔍</span>
            <input
              value={ara}
              onChange={(e) => setAra(e.target.value)}
              placeholder="Ürün ara..."
              aria-label="Ürün ara"
            />
            {ara && (
              <button className="ara-sil" onClick={() => setAra('')} aria-label="Aramayı temizle">
                ✕
              </button>
            )}
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn sm" onClick={() => setFisOku(true)}>
              📷 Fişten doldur
            </button>
          </div>
          <div className="row cat-row" style={{ marginBottom: 12 }}>
            {cats.map((c) => (
              <button
                key={c}
                className={`kat ${cat === c ? 'on' : ''}`}
                onClick={() => setCat(c)}
              >
                {KAT_IKON[c] && <span className="kat-ic">{KAT_IKON[c]}</span>}
                {c}
              </button>
            ))}
          </div>

          <div
            className="tiles"
            style={zayiMod ? { outline: '2px dashed var(--accent)', borderRadius: 12, padding: 8 } : undefined}
          >
            {shown.map((i) => {
              const kalan = availableQty(i.id, s.items)
              return (
                <button
                  key={i.id}
                  className="tile"
                  onClick={() => tikla(i)}
                  title={
                    zayiMod
                      ? `${zayiMod === 'ikram' ? 'İkram' : 'Zayi'} düş`
                      : `Maliyet ${fmtTL(unitCost(i.id, s.items))}`
                  }
                >
                  {kalan <= 0 && (
                    <span className="warn-dot" title="Stok bitti — satış yine de yapılabilir">
                      ⚠
                    </span>
                  )}
                  {detayli && i.variants?.length ? <span className="var-dot">çeşitli</span> : null}
                  {urunGorsel(i.id) ? (
                    <img className="ic-img" src={urunGorsel(i.id)!} alt="" />
                  ) : (
                    <span className="ic">{i.icon}</span>
                  )}
                  <span className="nm">{i.name}</span>
                  <span className="pr">{fmtTL(i.price ?? 0)}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className={`card cart ${sepetAcik ? 'open' : ''}`}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong className="row" style={{ gap: 8 }}>
              Adisyon
              <span className="tag warn">
                {target.kind === 'masa' ? `🪑 ${table?.name}` : '⚡ Hızlı satış'}
              </span>
            </strong>
            <button
              className="btn sm ghost only-mobile"
              onClick={() => setSepetAcik(false)}
              title="Kapat"
            >
              ▼
            </button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn sm"
              onClick={() => setMusteriSor((v) => !v)}
              title="Adisyona müşteri bağla (veresiye için gerekli)"
            >
              👤 {aktifMusteri ? (s.customers.find((c) => c.id === aktifMusteri)?.name ?? 'Müşteri') : 'Müşteri Seç'}
            </button>
            {lines.length > 0 && (
              <>
                <button
                  className="btn sm"
                  onClick={() => setParcali(true)}
                  title="Toplamı eşit böl, her parçayı ayrı öde"
                >
                  ⑃ Hesabı böl
                </button>
                <button className="btn sm ghost" onClick={temizle}>
                  Temizle
                </button>
              </>
            )}
          </div>

          <div className="cart-lines">
            {lines.length === 0 && <p className="hint">Ürüne dokun, buraya düşsün.</p>}
            {lines.map((l, idx) => (
              <div className="cline" key={`${l.itemId}-${l.variantId ?? ''}`}>
                {urunGorsel(l.itemId) && <img className="cl-img" src={urunGorsel(l.itemId)!} alt="" />}
                <button className="x" onClick={() => azalt(idx)} title="Bir azalt">
                  −
                </button>
                <QtyInput qty={l.qty} onQty={(n) => setQty(idx, n)} />
                <button className="x" onClick={() => artir(idx)} title="Bir artır">
                  +
                </button>
                <span className="nm">{l.name}</span>
                <span className="am">{fmtTL(l.qty * l.unitPrice)}</span>
              </div>
            ))}
          </div>

          <div className="total">
            <span>Toplam</span>
            <span className="v">{fmtTL(total)}</span>
          </div>

          {/* Müşteri seçici: nakit/kart satışta gereksiz. Sadece veresiyeye basılınca
              ya da zaten bir müşteri seçiliyken görünür. */}
          {(!table?.customerId || target.kind === 'hizli') && (musteriSor || customerId) && (
            <div className={`field ${musteriSor && !customerId ? 'sor' : ''}`}>
              <label>{musteriSor && !customerId ? 'Veresiye kime yazılsın?' : 'Müşteri'}</label>
              <div className="row">
                <select
                  style={{ flex: 1 }}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">— seçilmedi —</option>
                  {s.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.balance > 0 ? ` (borç ${fmtTL(c.balance)})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="btn sm"
                  onClick={() =>
                    setYeniAd(() => (ad: string) => {
                      const id = uid()
                      saveCustomer({ id, name: ad, balance: 0 })
                      if (target.kind === 'masa') setTableCustomer(target.id, id)
                      else setCustomerId(id)
                    })
                  }
                >
                  + Yeni müş
                </button>
              </div>
            </div>
          )}

          {/* Üçü de satışı bitirir. Mockup düzeni: Nakit (en sık) tam genişlik yeşil,
              altında Kart turuncu + Veresiye koyu. */}
          <div className="pays">
            <button className="pay nakit genis" disabled={!lines.length} onClick={() => ode('nakit')}>
              <b>💵 Nakit — Ödeme Al</b>
              <small>parayı aldım</small>
            </button>
            <button className="pay kart" disabled={!lines.length} onClick={() => ode('kart')}>
              <b>💳 Kart</b>
              <small>POS cihazı</small>
            </button>
            <button className="pay veresiye" disabled={!lines.length} onClick={() => ode('veresiye')}>
              <b>📒 Veresiye</b>
              <small>deftere yaz</small>
            </button>
          </div>
        </div>
      </div>

      {/* ---- satış onayı ---- */}
      {onay && (
        <div className="onay" role="status">
          ✓ Satış tamam · <b>{fmtTL(onay.tutar)}</b> ·{' '}
          {onay.payment === 'nakit' ? 'Nakit' : onay.payment === 'kart' ? 'Kart' : 'Veresiye'}
        </div>
      )}

      {/* ---- mobil: sepet çubuğu ve panel örtüsü ---- */}
      {sepetAcik && <div className="backdrop only-mobile" onClick={() => setSepetAcik(false)} />}

      {lines.length > 0 && !sepetAcik && (
        <div className="sepet-bar only-mobile" onClick={() => setSepetAcik(true)}>
          <span className="sb-adet">{lines.reduce((n, l) => n + l.qty, 0)}</span>
          <span className="sb-tut">{fmtTL(total)}</span>
          <button className="sb-btn">Ödeme al</button>
        </div>
      )}

      {/* ---- son satışlar ---- */}
      <div className="section-title">Son satışlar</div>
      <div className="card son-satis" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Saat</th>
              <th>Masa</th>
              <th>Ne satıldı</th>
              <th>Ödeme</th>
              <th className="num">Tutar</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sonSatislar.map((sale) => (
              <tr key={sale.id}>
                <td>
                  {new Date(sale.date).toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {sale.tableName ? (
                    <span className="tag" style={{ whiteSpace: 'nowrap' }}>
                      {sale.tableName}
                    </span>
                  ) : (
                    <span className="hint" style={{ whiteSpace: 'nowrap' }}>
                      Hızlı
                    </span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {sale.lines.map((l, i) => (
                      <span
                        key={i}
                        className={`tag ${l.waste ? 'warn' : ''}`}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {l.qty}× {l.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(sale.payments ?? [{ payment: sale.payment, amount: sale.total }]).map((p, i) => (
                      <span
                        key={i}
                        className={`tag ${p.payment === 'veresiye' ? 'bad' : ''}`}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {p.payment}
                        {sale.payments ? ` ${fmtTL(p.amount)}` : ''}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  {fmtTL(sale.total)}
                </td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      flexWrap: 'nowrap',
                      justifyContent: 'flex-end',
                      gap: 8,
                    }}
                  >
                    <button
                      className="btn sm"
                      title="Fiş göster / paylaş"
                      onClick={() => setFisSale(sale)}
                    >
                      🧾
                    </button>
                    <button
                      className="btn sm"
                      title="İncele / düzenle"
                      onClick={() => setIncele(sale)}
                    >
                      👁
                    </button>
                    <button
                      className="btn sm"
                      title="İptal et"
                      onClick={() => setIptalSale(sale)}
                    >
                      🗑
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sonSatislar.length === 0 && (
              <tr>
                <td colSpan={6} className="hint">
                  Henüz satış yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {cesitSec && (
        <CesitModal
          item={cesitSec}
          onClose={() => setCesitSec(null)}
          onPick={(v) => ekle(cesitSec, v)}
        />
      )}

      {parcali && (
        <ParcaliModal
          toplam={total}
          varsayilanMusteri={aktifMusteri}
          onClose={() => setParcali(false)}
          onOk={parcaliOde}
        />
      )}

      {adlandir && (
        <MasaAdi
          mevcut={s.tables.find((t) => t.id === adlandir)?.name ?? ''}
          sira={s.tables.findIndex((t) => t.id === adlandir) + 1}
          onClose={() => setAdlandir(null)}
          onSave={(ad) => {
            renameTable(adlandir, ad)
            setAdlandir(null)
          }}
        />
      )}

      {incele && (
        <SatisIncele
          sale={incele}
          onClose={() => setIncele(null)}
          onSave={(yeni) => {
            editSale(incele.id, yeni)
            setIncele(null)
          }}
          onIptal={() => {
            iptalEt(incele)
            setIncele(null)
          }}
        />
      )}

      {/* Yeni müşteri adı — WebView'de prompt() yerine. */}
      {yeniAd && (
        <AdModal
          baslik="Yeni müşteri"
          onClose={() => setYeniAd(null)}
          onOk={(ad) => {
            yeniAd(ad)
            setYeniAd(null)
          }}
        />
      )}

      {/* Satış iptal onayı — confirm() yerine. */}
      {iptalSale && (
        <OnayModal
          baslik="Satışı iptal et"
          mesaj={`${fmtTL(iptalSale.total)} tutarındaki satış iptal edilecek. Stok geri yüklenecek, veresiyeyse borç silinecek.`}
          onayYazi="İptal et"
          onClose={() => setIptalSale(null)}
          onOk={() => {
            iptalEt(iptalSale)
            setIptalSale(null)
          }}
        />
      )}

      {/* İptal sonrası geri alma balonu. */}
      {undo && (
        <div className="onay" role="status" style={{ background: 'var(--ink)' }}>
          Satış iptal edildi ·{' '}
          <button
            className="btn sm"
            style={{ marginLeft: 6 }}
            onClick={() => {
              restoreSale(undo)
              setUndo(null)
            }}
          >
            ↩ Geri al
          </button>
        </div>
      )}

      {fisSale && <FisModal sale={fisSale} business={s.business} onClose={() => setFisSale(null)} />}
      {fisOku && (
        <FisOkuModal
          items={s.items.filter((i) => i.sellable)}
          onClose={() => setFisOku(false)}
          onApply={fisDoldur}
        />
      )}
    </>
  )
}

/** Fotoğraftan masa adisyonu okuma: AI ürün+adet çıkarır, kullanıcı eşleştirip onaylar. */
function FisOkuModal({
  items,
  onClose,
  onApply,
}: {
  items: Item[]
  onClose: () => void
  onApply: (pairs: { itemId: string; qty: number }[]) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [rows, setRows] = useState<{ name: string; qty: number; itemId: string }[] | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setErr('')
    const data = await extract(
      'masa',
      file,
      items.map((i) => i.name),
    )
    setBusy(false)
    if (!data) {
      setErr('Okunamadı. İnternet ve kurulum gerekli; tekrar dene veya elle ekle.')
      return
    }
    setRows(
      data.lines.map((l) => ({
        name: l.name,
        qty: l.qty || 1,
        itemId: fisBestMatch(l.name, items),
      })),
    )
  }

  function upd(idx: number, patch: Partial<{ qty: number; itemId: string }>) {
    setRows((r) => r?.map((row, i) => (i === idx ? { ...row, ...patch } : row)) ?? r)
  }

  const gecerli = rows?.some((r) => r.itemId && r.qty > 0)

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>📷 Fişten masayı doldur</h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          Masanın fişini/adisyonunu çek. Yapay zeka ürünleri çıkarır; onaylayınca masaya eklenir.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={onFile}
        />

        {!rows && (
          <div className="row" style={{ justifyContent: 'center', margin: '18px 0' }}>
            <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Okunuyor…' : '📷 Fotoğraf çek / seç'}
            </button>
          </div>
        )}

        {err && (
          <p className="hint" style={{ color: 'var(--bad, #c0392b)' }}>
            {err}
          </p>
        )}

        {rows && (
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Fişteki</th>
                  <th>Ürün</th>
                  <th className="num">Adet</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} style={{ opacity: row.itemId ? 1 : 0.5 }}>
                    <td>{row.name}</td>
                    <td>
                      <select
                        value={row.itemId}
                        onChange={(e) => upd(idx, { itemId: e.target.value })}
                      >
                        <option value="">— atla —</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.icon} {i.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={1}
                        value={row.qty}
                        style={{ width: 60 }}
                        onChange={(e) => upd(idx, { qty: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          {rows && (
            <button
              className="btn primary"
              disabled={!gecerli}
              onClick={() =>
                onApply(
                  rows
                    .filter((r) => r.itemId && r.qty > 0)
                    .map((r) => ({ itemId: r.itemId, qty: r.qty })),
                )
              }
            >
              Onayla & Ekle
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Ad eşleştirme (fiş okuma için) — Türkçe sadeleştirme + içerme/token örtüşmesi. */
function fisNorm(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fisBestMatch(name: string, items: Item[]): string {
  const n = fisNorm(name)
  if (!n) return ''
  let best = ''
  let bestScore = 0
  for (const it of items) {
    const m = fisNorm(it.name)
    let score = 0
    if (m === n) score = 100
    else if (m.includes(n) || n.includes(m)) score = 60
    else {
      const nt = new Set(n.split(' '))
      score = m.split(' ').filter((t) => nt.has(t)).length * 20
    }
    if (score > bestScore) {
      bestScore = score
      best = it.id
    }
  }
  return bestScore >= 20 ? best : ''
}

/**
 * Yapılmış satışı incele ve düzenle.
 * Satır adedi değiştirilir veya satır çıkarılır. Kaydedince stok ve veresiye
 * bakiyesi yeniden hesaplanır. Tümü çıkarılırsa satış iptal edilir.
 */
function SatisIncele({
  sale,
  onClose,
  onSave,
  onIptal,
}: {
  sale: Sale
  onClose: () => void
  onSave: (lines: SaleLine[]) => void
  onIptal: () => void
}) {
  const { s } = useStore()
  const [lines, setLines] = useState<SaleLine[]>(() => sale.lines.map((l) => ({ ...l })))
  const [ekleAcik, setEkleAcik] = useState(false)
  const [ara, setAra] = useState('')

  const total = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
  const degisti =
    JSON.stringify(lines.map((l) => [l.itemId, l.variantId, l.qty])) !==
    JSON.stringify(sale.lines.map((l) => [l.itemId, l.variantId, l.qty]))

  const sellable = s.items.filter((i) => i.sellable)
  const bulunan = ara.trim()
    ? sellable.filter((i) => i.name.toLowerCase().includes(ara.trim().toLowerCase())).slice(0, 8)
    : sellable.slice(0, 8)

  function setQty(idx: number, qty: number) {
    setLines((cur) => cur.map((l, i) => (i === idx ? { ...l, qty: Math.max(0, qty) } : l)))
  }

  /** Yeni ürünü satışa ekle. Aynı ürün (çeşitsiz) varsa adedini artırır. */
  function urunEkle(item: Item) {
    setLines((cur) => {
      const idx = cur.findIndex((l) => l.itemId === item.id && !l.variantId && !l.waste)
      if (idx >= 0) return cur.map((l, i) => (i === idx ? { ...l, qty: l.qty + 1 } : l))
      return [
        ...cur,
        {
          itemId: item.id,
          name: item.name,
          qty: 1,
          unitPrice: item.price ?? 0,
          unitCost: unitCost(item.id, s.items),
        },
      ]
    })
    setAra('')
  }

  const saat = new Date(sale.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2>Satış — {saat}</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Adedi değiştir veya satırı çıkar. Kaydedince stok ve veresiye borcu yeniden hesaplanır.
        </p>

        {lines.map((l, idx) => (
          <div className="row" key={`${l.itemId}-${l.variantId ?? ''}-${l.waste ?? ''}`} style={{ marginBottom: 8 }}>
            <button className="x" onClick={() => setQty(idx, l.qty - 1)} title="Bir azalt">
              −
            </button>
            <QtyInput qty={l.qty} onQty={(n) => setQty(idx, n)} />
            <button className="x" onClick={() => setQty(idx, l.qty + 1)} title="Bir artır">
              +
            </button>
            <span style={{ flex: 1 }}>{l.name}</span>
            <span className="hint" style={{ width: 90, textAlign: 'right' }}>
              {fmtTL(l.qty * l.unitPrice)}
            </span>
            <button
              className="x"
              title="Satırı çıkar"
              onClick={() => setLines((cur) => cur.filter((_, i) => i !== idx))}
            >
              ✕
            </button>
          </div>
        ))}

        {lines.length === 0 && (
          <p className="hint" style={{ color: 'var(--bad)' }}>
            Satır kalmadı — kaydedersen satış iptal edilir.
          </p>
        )}

        {/* ---- ürün ekle ---- */}
        {!ekleAcik ? (
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setEkleAcik(true)}>
            + Ürün ekle
          </button>
        ) : (
          <div className="field" style={{ marginTop: 6 }}>
            <input
              autoFocus
              placeholder="Ürün ara..."
              value={ara}
              onChange={(e) => setAra(e.target.value)}
            />
            <div
              className="card"
              style={{ padding: 6, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}
            >
              {bulunan.map((i) => (
                <button
                  key={i.id}
                  className="btn sm ghost"
                  style={{ display: 'flex', width: '100%', justifyContent: 'space-between', marginBottom: 4 }}
                  onClick={() => urunEkle(i)}
                >
                  <span>
                    {i.icon} {i.name}
                  </span>
                  <span className="hint">{fmtTL(i.price ?? 0)}</span>
                </button>
              ))}
              {bulunan.length === 0 && <p className="hint">Ürün bulunamadı.</p>}
            </div>
            <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setEkleAcik(false)}>
              Kapat
            </button>
          </div>
        )}

        <div className="total" style={{ marginTop: 12 }}>
          <span>Yeni toplam</span>
          <span className="v">{fmtTL(total)}</span>
        </div>
        {sale.payments && degisti && (
          <p className="hint" style={{ marginTop: 6 }}>
            Bu satış parçalı ödenmişti — parça tutarları yeni toplama göre oranlanır.
          </p>
        )}

        <div className="row" style={{ marginTop: 20, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onIptal} style={{ color: 'var(--bad)' }}>
            Satışı iptal et
          </button>
          <div className="row">
            <button className="btn ghost" onClick={onClose}>
              Vazgeç
            </button>
            {lines.length === 0 ? (
              <button className="btn primary" onClick={onIptal}>
                İptal et
              </button>
            ) : (
              <button
                className="btn primary"
                disabled={!degisti || lines.some((l) => l.qty <= 0)}
                onClick={() => onSave(lines.filter((l) => l.qty > 0))}
              >
                Kaydet
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Çeşit seçimi: çay açık/koyu/duble, oralet kuşburnu/elma... */
function CesitModal({
  item,
  onClose,
  onPick,
}: {
  item: Item
  onClose: () => void
  onPick: (v: Variant) => void
}) {
  const { s } = useStore()
  // Bu oturumda kaç adet eklendi — modal açık kalır, sayacı gösterir.
  const [eklenen, setEklenen] = useState(0)

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          {item.icon} {item.name} — çeşit seç
        </h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          İstediğin kadar dokun, sepete eklenir. Bitince “Bitti”ye bas.
        </p>
        <div className="tiles">
          {item.variants!.map((v) => {
            const m = variantCost(item.id, s.items, v)
            const f = (item.price ?? 0) + (v.priceDelta ?? 0)
            return (
              <button
                key={v.id}
                className="tile"
                onClick={() => {
                  onPick(v)
                  setEklenen((n) => n + 1)
                }}
              >
                <span className="nm">{v.name}</span>
                <span className="pr">{fmtTL(f)}</span>
                <span className="st">maliyet {fmtTL(m)}</span>
              </button>
            )
          })}
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="hint">
            {eklenen > 0 ? `${eklenen} adet eklendi` : 'Henüz eklemedin'}
          </span>
          <button className="btn primary" onClick={onClose}>
            Bitti
          </button>
        </div>
      </div>
    </div>
  )
}

/** Parçalı ödeme: hesabı 2/3/4'e böl, her parçayı ayrı öde. */
function ParcaliModal({
  toplam,
  varsayilanMusteri,
  onClose,
  onOk,
}: {
  toplam: number
  varsayilanMusteri?: string
  onClose: () => void
  onOk: (parts: PaymentPart[]) => void
}) {
  const { s, saveCustomer } = useStore()
  const [n, setN] = useState(2)
  const [parts, setParts] = useState<PaymentPart[]>(() =>
    Array.from({ length: 2 }, () => ({ payment: 'nakit' as Payment, amount: toplam / 2 })),
  )
  // Yeni müşteri adı modalı — WebView'de prompt() yerine.
  const [yeniAd, setYeniAd] = useState<((ad: string) => void) | null>(null)

  function boluntu(adet: number) {
    setN(adet)
    setParts(
      Array.from({ length: adet }, (_, i) => ({
        payment: parts[i]?.payment ?? ('nakit' as Payment),
        customerId: parts[i]?.customerId,
        amount: Math.round((toplam / adet) * 100) / 100,
      })),
    )
  }

  const dagitilan = parts.reduce((a, p) => a + p.amount, 0)
  const fark = Math.round((toplam - dagitilan) * 100) / 100
  const eksikMusteri = parts.some((p) => p.payment === 'veresiye' && !p.customerId)
  // Negatif ya da geçersiz parça: toplam tutsa bile kabul edilmez (borç azaltma sömürüsü).
  const gecersizParca = parts.some((p) => !Number.isFinite(p.amount) || p.amount < 0)

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <h2>Hesabı böl</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Toplam <strong>{fmtTL(toplam)}</strong> eşit bölündü. Kaça bölüyorsun? Ödenmeyen parçalar
          veresiye olarak bir müşteriye yazılmak zorunda.
        </p>

        <div className="row" style={{ marginBottom: 16 }}>
          {[2, 3, 4, 5, 6].map((k) => (
            <button
              key={k}
              className={`btn sm ${n === k ? 'primary' : ''}`}
              onClick={() => boluntu(k)}
            >
              {k}'ye böl
            </button>
          ))}
        </div>

        {parts.map((p, i) => (
          <div className="card" key={i} style={{ marginBottom: 8, background: 'var(--bg)' }}>
            <div className="row">
              <strong style={{ width: 70 }}>{i + 1}. parça</strong>
              <input
                type="number"
                min={0}
                style={{ width: 100 }}
                value={p.amount}
                onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                onChange={(e) =>
                  setParts(
                    parts.map((x, j) =>
                      j === i ? { ...x, amount: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
              <span className="hint">₺</span>
              <select
                value={p.payment}
                onChange={(e) =>
                  setParts(
                    parts.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            payment: e.target.value as Payment,
                            customerId:
                              e.target.value === 'veresiye'
                                ? (x.customerId ?? varsayilanMusteri)
                                : undefined,
                          }
                        : x,
                    ),
                  )
                }
              >
                <option value="nakit">Nakit — ödendi</option>
                <option value="kart">Kart — ödendi</option>
                <option value="veresiye">Veresiye — bakiye</option>
              </select>

              {p.payment === 'veresiye' && (
                <>
                  <select
                    style={{ flex: 1, minWidth: 140 }}
                    value={p.customerId ?? ''}
                    onChange={(e) =>
                      setParts(
                        parts.map((x, j) =>
                          j === i ? { ...x, customerId: e.target.value || undefined } : x,
                        ),
                      )
                    }
                  >
                    <option value="">— müşteri seç —</option>
                    {s.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn sm"
                    onClick={() =>
                      setYeniAd(() => (ad: string) => {
                        const id = uid()
                        saveCustomer({ id, name: ad, balance: 0 })
                        setParts(parts.map((x, j) => (j === i ? { ...x, customerId: id } : x)))
                      })
                    }
                  >
                    + Yeni
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        <div className="total">
          <span>Dağıtılan / Toplam</span>
          <span className={`v ${Math.abs(fark) < 0.01 ? 'good' : 'bad'}`}>
            {fmtTL(dagitilan)} / {fmtTL(toplam)}
          </span>
        </div>

        {Math.abs(fark) >= 0.01 && (
          <p className="hint" style={{ color: 'var(--bad)' }}>
            {fark > 0 ? `${fmtTL(fark)} eksik dağıtıldı.` : `${fmtTL(-fark)} fazla dağıtıldı.`}
          </p>
        )}
        {eksikMusteri && (
          <p className="hint" style={{ color: 'var(--bad)' }}>
            Veresiye parçalarına müşteri seçmelisin.
          </p>
        )}
        {gecersizParca && (
          <p className="hint" style={{ color: 'var(--bad)' }}>
            Parça tutarı eksi olamaz.
          </p>
        )}

        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={Math.abs(fark) >= 0.01 || eksikMusteri || gecersizParca}
            onClick={() => onOk(parts)}
          >
            Ödemeyi tamamla
          </button>
        </div>
      </div>

      {yeniAd && (
        <AdModal
          baslik="Yeni müşteri"
          onClose={() => setYeniAd(null)}
          onOk={(ad) => {
            yeniAd(ad)
            setYeniAd(null)
          }}
        />
      )}
    </div>
  )
}

function MasaAdi({
  mevcut,
  sira,
  onClose,
  onSave,
}: {
  mevcut: string
  sira: number
  onClose: () => void
  onSave: (ad: string) => void
}) {
  const [ad, setAd] = useState(mevcut)

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <h2>Masaya isim ver</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Hesap kapanınca "Masa {sira}" adına geri döner.
        </p>
        <div className="field">
          <label>Masa adı</label>
          <input
            value={ad}
            autoFocus
            onChange={(e) => setAd(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSave(ad.trim() || `Masa ${sira}`)}
            placeholder={`Masa ${sira}`}
          />
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={() => onSave(`Masa ${sira}`)}>
            Varsayılana dön
          </button>
          <div className="row">
            <button className="btn ghost" onClick={onClose}>
              Vazgeç
            </button>
            <button className="btn primary" onClick={() => onSave(ad.trim() || `Masa ${sira}`)}>
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** İsim girişi — WebView'de prompt() çalışmadığı için uygulama-içi modal. */
function AdModal({
  baslik,
  onClose,
  onOk,
}: {
  baslik: string
  onClose: () => void
  onOk: (ad: string) => void
}) {
  const [ad, setAd] = useState('')
  const gecerli = ad.trim().length > 0
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <h2>{baslik}</h2>
        <div className="field">
          <label>İsim</label>
          <input
            autoFocus
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && gecerli) onOk(ad.trim())
            }}
            placeholder="Müşteri adı"
          />
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" disabled={!gecerli} onClick={() => onOk(ad.trim())}>
            Ekle
          </button>
        </div>
      </div>
    </div>
  )
}

/** Onay kutusu — confirm() yerine. */
function OnayModal({
  baslik,
  mesaj,
  onayYazi = 'Onayla',
  onClose,
  onOk,
}: {
  baslik: string
  mesaj: string
  onayYazi?: string
  onClose: () => void
  onOk: () => void
}) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h2>{baslik}</h2>
        <p className="hint" style={{ margin: '10px 0 18px', color: 'var(--ink)' }}>
          {mesaj}
        </p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" onClick={onOk}>
            {onayYazi}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Satışın müşteri fişi — düz metin (yazdır / paylaş / kopyala). */
function fisMetni(sale: Sale, business: Business): string {
  const tarih = new Date(sale.date).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const satirlar = sale.lines
    .map((l) => `${l.qty} x ${l.name}`.padEnd(24) + fmtTL(l.qty * l.unitPrice).padStart(12))
    .join('\n')
  const odeme = (sale.payments ?? [{ payment: sale.payment, amount: sale.total }])
    .map((p) => `  ${p.payment}: ${fmtTL(p.amount)}`)
    .join('\n')
  return [
    business.name || 'Çay Ocağı',
    business.address || '',
    tarih,
    sale.tableName ? `Masa: ${sale.tableName}` : 'Hızlı satış',
    '--------------------------------',
    satirlar,
    '--------------------------------',
    `TOPLAM: ${fmtTL(sale.total)}`,
    'Ödeme:',
    odeme,
    '--------------------------------',
    'Teşekkür ederiz, yine bekleriz.',
  ]
    .filter((x) => x !== '')
    .join('\n')
}

function FisModal({
  sale,
  business,
  onClose,
}: {
  sale: Sale
  business: Business
  onClose: () => void
}) {
  const metin = fisMetni(sale, business)

  async function paylas() {
    try {
      if (navigator.share) {
        await navigator.share({ text: metin })
        return
      }
      await navigator.clipboard.writeText(metin)
      alert('Fiş panoya kopyalandı.')
    } catch {
      // kullanıcı iptal etti veya izin yok — sessiz geç
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h2>Fiş</h2>
        <pre className="fis-yazdir">{metin}</pre>
        <div className="row no-print" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Kapat
          </button>
          <button className="btn" onClick={paylas}>
            📤 Paylaş
          </button>
          <button className="btn primary" onClick={() => window.print()}>
            🖨 Yazdır
          </button>
        </div>
      </div>
    </div>
  )
}
