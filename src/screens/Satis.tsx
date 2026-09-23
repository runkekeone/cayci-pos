import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useStore } from '../store'
import { availableQty, lowStock, stokTakipli, unitCost, variantCost } from '../lib/cost'
import { Ikon } from '../lib/Ikon'
import { KATEGORI_SIRA, katRenk } from '../lib/kategori'
import { fmtSure, fmtTL, gecenDakika, uid } from '../lib/units'
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

/**
 * Masa süreleri canlı kalsın diye dakikada bir yeniden çizdirir.
 * Tek sayaç, 60 sn — telefonda pil dostu.
 */
function useDakikaTiki() {
  const [, setTik] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTik((x) => x + 1), 60_000)
    return () => clearInterval(t)
  }, [])
}

export default function Satis() {
  const {
    s,
    addToTable,
    removeFromTable,
    setTableQty,
    setTableLinePrice,
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

  useDakikaTiki()
  // Ödeme düğmesine art arda basılmasını engelleyen kilit (çift satış koruması).
  const odemeKilit = useRef(false)
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
  const [sepetDuzenle, setSepetDuzenle] = useState<number | null>(null)
  const [parcali, setParcali] = useState(false)
  // Telefonda sepet alttan açılan sayfa; masaüstünde hep yanda durur.
  const [sepetAcik, setSepetAcik] = useState(false)
  const [odemeAcik, setOdemeAcik] = useState(false)
  // Yapılmış satışı incele/düzenle modalı.
  const [incele, setIncele] = useState<Sale | null>(null)
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

  // İptali uygula ama satışı sakla: undo balonu geri getirebilsin.
  function iptalEt(sale: Sale) {
    cancelSale(sale.id)
    setUndo(sale)
  }

  const sellable = s.items.filter((i) => i.sellable)
  // Kategori sırası sabit; kullanıcının eklediği yeni kategoriler sona düşer.
  const SIRA = KATEGORI_SIRA
  const mevcut = [...new Set(sellable.map((i) => i.category))].sort((a, b) => {
    const ia = SIRA.indexOf(a)
    const ib = SIRA.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
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

  function setPrice(index: number, unitPrice: number) {
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return
    if (target.kind === 'masa') {
      setTableLinePrice(target.id, index, unitPrice)
      return
    }
    setQuick((cur) => cur.map((l, i) => (i === index ? { ...l, unitPrice } : l)))
  }

  function temizle() {
    if (target.kind === 'hizli') setQuick([])
    setCustomerId('')
    setSepetAcik(false)
  }

  function ode(payment: Payment) {
    // Android'de yavaş render sırasında ikinci dokunuş hâlâ eski sepeti görüyor
    // ve aynı adisyon iki kez kaydediliyordu (stok da iki kez düşüyordu).
    if (odemeKilit.current) return
    if (payment === 'veresiye' && !aktifMusteri) {
      // Müşteri yoksa uyarıp bırakmak yerine seçiciyi aç — akış kesilmesin.
      setMusteriSor(true)
      return
    }
    const tutar = total
    odemeKilit.current = true
    setTimeout(() => (odemeKilit.current = false), 1200)
    if (target.kind === 'masa') {
      closeTable(target.id, payment, payment === 'veresiye' ? aktifMusteri : undefined)
    } else {
      quickSale(quick, payment, payment === 'veresiye' ? aktifMusteri : undefined)
      setQuick([])
    }
    setCustomerId('')
    setMusteriSor(false)
    setSepetAcik(false)
    setOdemeAcik(false)
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
    }
    // yalnız mount'ta: bekleyen id'yi bir kez tüket
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function parcaliOde(parts: PaymentPart[]) {
    if (odemeKilit.current) return
    odemeKilit.current = true
    setTimeout(() => (odemeKilit.current = false), 1200)
    paySplit(lines, parts, target.kind === 'masa' ? target.id : undefined)
    if (target.kind === 'hizli') setQuick([])
    setCustomerId('')
    setParcali(false)
    setSepetAcik(false)
  }


  // Sepetteki adet, ürün kartının köşesinde görünür — "ekledim mi?" sorusu biter.
  const adetMap = new Map<string, number>()
  for (const l of lines) adetMap.set(l.itemId, (adetMap.get(l.itemId) ?? 0) + l.qty)
  const toplamAdet = lines.reduce((n, l) => n + l.qty, 0)
  const hedefAd = target.kind === 'masa' ? (table?.name ?? 'Masa') : 'Tezgâh'
  const musteriAd = aktifMusteri ? s.customers.find((c) => c.id === aktifMusteri)?.name : undefined
  const masaDk = table && table.lines.length > 0 ? gecenDakika(table.openedAt) : 0

  // Müşteri seçici: sadece veresiyeye basılınca ya da müşteri seçiliyken görünür.
  const musteriSecici =
    (!table?.customerId || target.kind === 'hizli') && (musteriSor || customerId) ? (
      <div className={`field ${musteriSor && !customerId ? 'sor' : ''}`}>
        <label>{musteriSor && !customerId ? 'Veresiye kime yazılsın?' : 'Müşteri'}</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <select style={{ flex: 1 }} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Seçilmedi</option>
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
            + Yeni
          </button>
        </div>
      </div>
    ) : null

  function masalaraGit() {
    window.dispatchEvent(new CustomEvent('cayci-git', { detail: 'masalar' }))
  }

  // Sepet ve ödeme içeriği — masaüstünde yan panel, telefonda alttan açılan sayfa.
  const sepetIcerik = (
    <>
      <div className="cart-bas">
        <div>
          <strong>Sepet</strong>
          <div className="cart-hedef">
            {hedefAd}
            {masaDk > 0 ? ` · ${fmtSure(masaDk)}dır açık` : ''}
            {musteriAd ? ` · ${musteriAd}` : ''}
          </div>
        </div>
        <button className="x cart-kapat" onClick={() => setSepetAcik(false)} aria-label="Sepeti kapat">
          <Ikon ad="kapat" />
        </button>
      </div>

      <div className="cart-lines">
        {lines.length === 0 && <p className="hint">Ürüne dokun, buraya düşsün.</p>}
        {lines.map((l, idx) => (
          <div className="cline" key={`${l.itemId}-${l.variantId ?? ''}-${l.waste ?? ''}`}>
            <div className="adet-kutu">
              <button onClick={() => azalt(idx)} aria-label="Bir azalt">
                −
              </button>
              <QtyInput qty={l.qty} onQty={(n) => setQty(idx, n)} />
              <button onClick={() => artir(idx)} aria-label="Bir artır">
                +
              </button>
            </div>
            <span
              className="nm sepet-duzenlenebilir"
              onClick={() => setSepetDuzenle(idx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSepetDuzenle(idx)}
              title="Adet veya fiyatı düzenle"
            >
              {l.name}
              <small>{l.waste ? 'ikram · 0 ₺' : fmtTL(l.unitPrice)}</small>
            </span>
            <span className="am">{fmtTL(l.qty * l.unitPrice)}</span>
          </div>
        ))}
      </div>

      <div className="cart-araclar">
        <button className="btn sm" onClick={() => setMusteriSor((v) => !v)}>
          <Ikon ad="kisi" boy={16} />
          {musteriAd ?? 'Müşteri seç'}
        </button>
        {lines.length > 0 && (
          <button className="btn sm" onClick={() => setParcali(true)}>
            Hesabı böl
          </button>
        )}
        <button
          className={`btn sm ${zayiMod === 'ikram' ? 'primary' : ''}`}
          onClick={() => {
            setZayiMod(zayiMod === 'ikram' ? null : 'ikram')
            setSepetAcik(false)
          }}
        >
          İkram
        </button>
        {lines.length > 0 && (
          <button className="btn sm ghost" onClick={temizle}>
            Temizle
          </button>
        )}
      </div>

      {musteriSecici}

      <div className="total">
        <span>Toplam</span>
        <span className="v">{fmtTL(total)}</span>
      </div>
      <button
        className="btn primary ode-dugme"
        disabled={!lines.length}
        onClick={() => {
          setSepetAcik(false)
          setOdemeAcik(true)
        }}
      >
        Öde · {fmtTL(total)}
      </button>
    </>
  )

  return (
    <>
      <div className="satis-ust">
        <button className="hedef-dugme" onClick={masalaraGit} title="Masa değiştir">
          <b>{hedefAd}</b>
          <span>
            {target.kind === 'masa'
              ? table && table.lines.length > 0
                ? masaDk > 0
                  ? `${fmtSure(masaDk)}dır açık`
                  : 'yeni açıldı'
                : 'boş masa'
              : 'hızlı satış'}
            <Ikon ad="asagi" boy={16} />
          </span>
        </button>
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          {target.kind === 'masa' && (
            <button className="btn sm" onClick={() => setAdlandir(target.id)} aria-label="Masaya isim ver">
              <Ikon ad="kalem" boy={16} />
            </button>
          )}
          <button
            className={`btn sm ${detayli ? 'primary' : ''}`}
            onClick={() => {
              const on = !detayli
              setDetayli(on)
              if (!on) setZayiMod(null)
            }}
            title="Çeşit seçimi (duble, şekersiz...), zayi"
          >
            Çeşitli
          </button>
        </div>
      </div>

      {zayiMod && (
        <div className="uyari-band" style={{ marginBottom: 12, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <strong>{zayiMod === 'ikram' ? 'İkram' : 'Zayi'} modu</strong>
            Ürüne dokun, 0 ₺ olarak yazılır.
          </div>
          <button className="btn sm" onClick={() => setZayiMod(null)}>
            Bitir
          </button>
        </div>
      )}

      {azalanlar.length > 0 && (
        <div className="uyari-band" style={{ marginBottom: 12 }}>
          <Ikon ad="dikkat" />
          <div>
            <strong>Stok azaldı</strong>
            {azalanlar.map((i) => i.name).join(' · ')}
          </div>
        </div>
      )}

      <div className="grid2 satis-grid">
        <div>
          {/* bölümler: her birinin kendi rengi var, ürün kartının kenarı da o renkte */}
          <div className="kat-bloklar">
            {mevcut.map((c) => (
              <button
                key={c}
                className={`kat-blok ${cat === c ? 'on' : ''}`}
                style={{ '--k': katRenk(c, mevcut) } as CSSProperties}
                onClick={() => setCat(cat === c ? 'Hepsi' : c)}
              >
                <b>{c}</b>
                <small>{sellable.filter((i) => i.category === c).length} ürün</small>
              </button>
            ))}
          </div>

          {detayli && (
            <div className="row" style={{ marginBottom: 10, gap: 8 }}>
              <button
                className={`btn sm ${zayiMod === 'fire' ? 'primary' : ''}`}
                onClick={() => setZayiMod(zayiMod === 'fire' ? null : 'fire')}
              >
                Zayi düş
              </button>
              <span className="hint">Çeşidi olan üründe çeşit sorulur.</span>
            </div>
          )}

          <div className="ara-kutu">
            <Ikon ad="ara" boy={18} />
            <input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Ürün ara" aria-label="Ürün ara" />
            {ara && (
              <button className="ara-sil" onClick={() => setAra('')} aria-label="Aramayı temizle">
                <Ikon ad="kapat" boy={16} />
              </button>
            )}
            {cat !== 'Hepsi' && !ara && (
              <button className="ara-sil kat-temizle" onClick={() => setCat('Hepsi')}>
                {cat} ✕
              </button>
            )}
          </div>

          <div className={`tiles ${zayiMod ? 'zayi-acik' : ''}`}>
            {shown.map((i) => {
              const kalan = availableQty(i.id, s.items)
              const adet = adetMap.get(i.id) ?? 0
              return (
                <button
                  key={i.id}
                  className={`tile ${stokTakipli(i) && kalan <= 0 ? 'out' : ''} ${adet > 0 ? 'secili' : ''}`}
                  style={{ '--k': katRenk(i.category, mevcut) } as CSSProperties}
                  onClick={() => tikla(i)}
                  title={
                    zayiMod
                      ? `${zayiMod === 'ikram' ? 'İkram' : 'Zayi'} düş`
                      : `Maliyet ${fmtTL(unitCost(i.id, s.items))}`
                  }
                >
                  {adet > 0 && <span className="adet-rozet">{adet}</span>}
                  <span className="nm">{i.name}</span>
                  {detayli && i.variants?.length ? <span className="var-dot">çeşitli</span> : null}
                  <span className="pr">{fmtTL(i.price ?? 0)}</span>
                </button>
              )
            })}
            {shown.length === 0 && <p className="hint">Ürün bulunamadı.</p>}
          </div>
        </div>

        {sepetAcik && <div className="backdrop" onClick={() => setSepetAcik(false)} />}
        <div className={`card cart ${sepetAcik ? 'acik' : ''}`}>
          <div className="tutamak" />
          {sepetIcerik}
        </div>
      </div>

      {/* telefonda altta: sepet + büyük siyah Öde */}
      {!sepetAcik && (
        <div className="odebar">
          <button className="ob-sepet" onClick={() => setSepetAcik(true)} aria-label="Sepeti aç">
            <Ikon ad="sepet" boy={24} />
            {toplamAdet > 0 && <i>{toplamAdet}</i>}
          </button>
          <button className="ob-ode" disabled={!lines.length} onClick={() => setOdemeAcik(true)}>
            {lines.length ? `Öde · ${fmtTL(total)}` : 'Ürüne dokun'}
          </button>
        </div>
      )}

      {/* ---- ödeme ---- */}
      {odemeAcik && lines.length > 0 && (
        <div className="modal-bg" onClick={() => setOdemeAcik(false)}>
          <div className="modal odeme-sayfa" onClick={(e) => e.stopPropagation()}>
            <div className="cart-bas">
              <strong>{hedefAd} · Ödeme</strong>
              <button className="x" onClick={() => setOdemeAcik(false)} aria-label="Kapat">
                <Ikon ad="kapat" />
              </button>
            </div>
            <div className="odeme-tutar">
              <div className="v">{fmtTL(total)}</div>
              <span className="hint">
                {toplamAdet} ürün{masaDk > 0 ? ` · ${fmtSure(masaDk)}dır açık` : ''}
              </span>
            </div>
            <div className="odeme-kalemler">
              {lines.map((l, i) => (
                <div className="liste-satir" key={i}>
                  <span className="ls-ad">
                    {l.qty} × {l.name}
                  </span>
                  <span className="ls-deger">{fmtTL(l.qty * l.unitPrice)}</span>
                </div>
              ))}
            </div>

            {musteriSecici}

            <div className="odeme-yontem">
              <button className="pay nakit" onClick={() => ode('nakit')}>
                <b>Nakit</b>
                <small>parayı aldım</small>
              </button>
              <button className="pay kart" onClick={() => ode('kart')}>
                <b>Kart</b>
                <small>POS cihazı</small>
              </button>
              <button className="pay veresiye" onClick={() => ode('veresiye')}>
                <b>Veresiye</b>
                <small>{musteriAd ? `${musteriAd} deftere` : 'deftere yaz'}</small>
              </button>
            </div>
            <div className="odeme-alt">
              <button
                className="btn ghost sm"
                onClick={() => {
                  setOdemeAcik(false)
                  setParcali(true)
                }}
              >
                Hesabı böl
              </button>
              <button className="btn ghost sm" onClick={() => setMusteriSor((v) => !v)}>
                Müşteri seç
              </button>
            </div>
          </div>
        </div>
      )}

      {sepetDuzenle != null && lines[sepetDuzenle] && (
        <div className="modal-bg" onClick={() => setSepetDuzenle(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <h2>{lines[sepetDuzenle].name}</h2>
            <div className="field">
              <label>Adet</label>
              <input
                type="number"
                min={1}
                value={lines[sepetDuzenle].qty}
                onChange={(e) => setQty(sepetDuzenle, Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Birim fiyat (TL)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={lines[sepetDuzenle].unitPrice}
                onChange={(e) => setPrice(sepetDuzenle, Number(e.target.value))}
              />
            </div>
            <button className="btn primary" style={{ width: '100%', marginTop: 14 }} onClick={() => setSepetDuzenle(null)}>
              Tamam
            </button>
          </div>
        </div>
      )}

      {/* ---- satış onayı ---- */}
      {onay && (
        <div className="onay" role="status">
          <Ikon ad="tik" boy={18} kalinlik={2.4} />
          Satış tamam · <b>{fmtTL(onay.tutar)}</b> ·{' '}
          {onay.payment === 'nakit' ? 'Nakit' : onay.payment === 'kart' ? 'Kart' : 'Veresiye'}
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
            {sonSatislar.map((sale) => {
              const icerik = sale.lines.map((l) => `${l.qty}× ${l.name}`).join(' · ')
              return (
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
                  <span className="son-satis-icerik" title={icerik}>{icerik}</span>
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
                  <div className="son-satis-aksiyonlar">
                    <button
                      className="btn sm son-satis-fis"
                      title="Fiş göster / paylaş"
                      onClick={() => setFisSale(sale)}
                    >
                      <Ikon ad="fis" boy={18} />
                    </button>
                    <button
                      className="btn sm son-satis-incele"
                      title="İncele / düzenle"
                      onClick={() => setIncele(sale)}
                    >
                      <Ikon ad="goz" boy={18} />
                    </button>
                    <button
                      className="btn sm son-satis-iptal"
                      title="İptal et"
                      onClick={() => setIptalSale(sale)}
                    >
                      <Ikon ad="cop" boy={18} />
                    </button>
                  </div>
                </td>
              </tr>
              )
            })}
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
        <div className="onay koyu" role="status">
          Satış iptal edildi ·{' '}
          <button
            className="btn sm"
            style={{ marginLeft: 6 }}
            onClick={() => {
              restoreSale(undo)
              setUndo(null)
            }}
          >
            <Ikon ad="geri" boy={16} />
            Geri al
          </button>
        </div>
      )}

      {fisSale && <FisModal sale={fisSale} business={s.business} onClose={() => setFisSale(null)} />}
    </>
  )
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
                    {i.name}
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
          {item.name} — çeşit seç
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
    // Her parçayı ayrı ayrı yuvarlamak artık kuruşu düşürüyordu: 10,00 ₺ üçe
    // bölününce 3,33 × 3 = 9,99 kalıyor, "0,01 ₺ eksik dağıtıldı" deyip ödeme
    // düğmesi kilitleniyordu. Kuruş üzerinden bölüp artığı ilk parçalara dağıtıyoruz.
    const toplamKurus = Math.round(toplam * 100)
    const taban = Math.floor(toplamKurus / adet)
    const artik = toplamKurus - taban * adet
    setParts(
      Array.from({ length: adet }, (_, i) => ({
        payment: parts[i]?.payment ?? ('nakit' as Payment),
        customerId: parts[i]?.customerId,
        amount: (taban + (i < artik ? 1 : 0)) / 100,
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
            <Ikon ad="paylas" boy={18} />
            Paylaş
          </button>
          <button className="btn primary" onClick={() => window.print()}>
            <Ikon ad="yazici" boy={18} />
            Yazdır
          </button>
        </div>
      </div>
    </div>
  )
}
