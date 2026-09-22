import { useState } from 'react'
import { useStore } from '../store'
import { unitCost } from '../lib/cost'
import { fmtTL, round, uid } from '../lib/units'
import { URUNLER, basitUrunleriKur } from '../defaults'
import { Ikon } from '../lib/Ikon'
import type { Item } from '../types'

/**
 * ÜRÜNLER — satış ekranında görünen ürünler: ad, fiyat, maliyet, kâr.
 *
 * Tarif (gram) ve hammadde düzenleme kaldırıldı; maliyet tek bir sayı. Eski
 * kurulumlardaki tarifli ürünlerin maliyeti tariften hesaplanmaya devam eder,
 * elle maliyet yazılırsa onun önüne geçer.
 */
const SIRA = ['Sıcak', 'Soğuk', 'Yiyecek', 'Atıştırmalık']

function bosUrun(kategori: string): Item {
  return {
    id: uid(),
    name: '',
    unit: 'adet',
    buyUnit: 'adet',
    category: kategori,
    icon: '',
    sellable: true,
    price: 0,
    stock: 0,
  }
}

export default function Urunler() {
  const { s, saveItem, deleteItem } = useStore()
  const [edit, setEdit] = useState<Item | null>(null)
  const [katalog, setKatalog] = useState(false)
  const [zam, setZam] = useState(false)

  const satilan = s.items.filter((i) => i.sellable)
  const kategoriler = [...new Set(satilan.map((i) => i.category))].sort((a, b) => {
    const ia = SIRA.indexOf(a)
    const ib = SIRA.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const eksikler = URUNLER.filter((u) => !s.items.some((i) => i.id === u.id))

  return (
    <>
      <h1>Ürünler</h1>
      <p className="sub">Satış ekranındaki ürünler. Ürüne dokun, fiyatını ya da maliyetini değiştir.</p>

      <div className="row" style={{ marginBottom: 6 }}>
        <button className="btn primary" onClick={() => setEdit(bosUrun(kategoriler[0] ?? 'Sıcak'))}>
          + Ürün ekle
        </button>
        <button className="btn" onClick={() => setZam(true)} disabled={satilan.length === 0}>
          Toplu zam
        </button>
        {eksikler.length > 0 && (
          <button className="btn ghost" onClick={() => setKatalog(true)}>
            Hazır listeden ekle ({eksikler.length})
          </button>
        )}
      </div>

      {kategoriler.map((kat) => (
        <div key={kat}>
          <div className="section-title">{kat}</div>
          <div className="card liste">
            {satilan
              .filter((i) => i.category === kat)
              .map((i) => {
                const fiyat = i.price ?? 0
                const m = unitCost(i.id, s.items)
                const maliyetVar = m > 0
                const kar = fiyat - m
                return (
                  <button key={i.id} className="urun-satir" onClick={() => setEdit(i)}>
                    <span className="us-ad">{i.name}</span>
                    <span className="us-rakam">
                      <b>{fmtTL(fiyat)}</b>
                      <small className={maliyetVar ? (kar >= 0 ? 'good-txt' : 'bad-txt') : ''}>
                        {maliyetVar ? `kâr ${fmtTL(kar)}` : 'maliyet yok'}
                      </small>
                    </span>
                    <Ikon ad="sag" boy={18} />
                  </button>
                )
              })}
          </div>
        </div>
      ))}
      {satilan.length === 0 && <p className="hint">Henüz ürün yok.</p>}

      {edit && (
        <UrunKarti
          item={edit}
          kategoriler={kategoriler.length ? kategoriler : SIRA}
          yeni={!s.items.some((i) => i.id === edit.id)}
          onClose={() => setEdit(null)}
          onSave={(it) => {
            saveItem(it)
            setEdit(null)
          }}
          onDelete={() => {
            deleteItem(edit.id)
            setEdit(null)
          }}
        />
      )}

      {katalog && (
        <KatalogModal
          eksikIdler={eksikler.map((u) => u.id)}
          onClose={() => setKatalog(false)}
          onEkle={(secilen) => {
            for (const it of basitUrunleriKur(secilen)) saveItem(it)
            setKatalog(false)
          }}
        />
      )}

      {zam && (
        <ZamModal
          urunler={satilan}
          onClose={() => setZam(false)}
          onUygula={(yeniler) => {
            for (const it of yeniler) saveItem(it)
            setZam(false)
          }}
        />
      )}
    </>
  )
}

/** Ürün kartı: ad, kategori, satış fiyatı, maliyet. */
function UrunKarti({
  item,
  kategoriler,
  yeni,
  onClose,
  onSave,
  onDelete,
}: {
  item: Item
  kategoriler: string[]
  yeni: boolean
  onClose: () => void
  onSave: (i: Item) => void
  onDelete: () => void
}) {
  const { s } = useStore()
  const hesaplanan = unitCost(item.id, s.items)
  const [ad, setAd] = useState(item.name)
  const [kategori, setKategori] = useState(item.category)
  const [fiyat, setFiyat] = useState(String(item.price ?? ''))
  const [maliyet, setMaliyet] = useState(hesaplanan > 0 ? String(round(hesaplanan, 2)) : '')
  const [silOnay, setSilOnay] = useState(false)

  const f = Number(fiyat) || 0
  const m = maliyet === '' ? null : Number(maliyet)
  const tarifli = !!item.recipe?.lines.length && item.cost == null

  function kaydet() {
    const yeniMaliyet = m == null || !Number.isFinite(m) ? undefined : m
    // Maliyete dokunulmadıysa kaynağı (tarif / son alış) aynen kalsın.
    const onceki = hesaplanan > 0 ? round(hesaplanan, 2) : undefined
    onSave({
      ...item,
      name: ad.trim(),
      category: kategori,
      price: f,
      cost: yeniMaliyet === onceki ? item.cost : yeniMaliyet,
    })
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2>{yeni ? 'Yeni ürün' : item.name}</h2>
        <div className="field">
          <label htmlFor="u-ad">Ürün adı</label>
          <input id="u-ad" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Örn. Ihlamur" />
        </div>
        <div className="field">
          <label htmlFor="u-kat">Bölüm</label>
          <select id="u-kat" value={kategori} onChange={(e) => setKategori(e.target.value)}>
            {[...new Set([...kategoriler, ...SIRA])].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="u-fiyat">Satış fiyatı (₺)</label>
            <input
              id="u-fiyat"
              type="number"
              inputMode="decimal"
              value={fiyat}
              onChange={(e) => setFiyat(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="u-maliyet">Maliyeti (₺)</label>
            <input
              id="u-maliyet"
              type="number"
              inputMode="decimal"
              value={maliyet}
              placeholder="bilmiyorum"
              onChange={(e) => setMaliyet(e.target.value)}
            />
          </div>
        </div>
        <p className="hint" style={{ marginTop: -4 }}>
          {m != null && f > 0
            ? `Tanesinde ${fmtTL(f - m)} kâr (%${round(((f - m) / f) * 100, 0)}).`
            : 'Maliyeti yazarsan raporda kârın doğru çıkar. Bilmiyorsan boş bırak.'}
          {tarifli && ' Şu anki rakam eski tariften hesaplandı.'}
        </p>

        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          {!yeni ? (
            silOnay ? (
              <button className="btn tehlike" onClick={onDelete}>
                Evet, sil
              </button>
            ) : (
              <button className="btn ghost" onClick={() => setSilOnay(true)}>
                Sil
              </button>
            )
          ) : (
            <span />
          )}
          <div className="row">
            <button className="btn ghost" onClick={onClose}>
              Vazgeç
            </button>
            <button className="btn primary" disabled={!ad.trim()} onClick={kaydet}>
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Toplu zam: bütün fiyatlara aynı tutarı ya da yüzdeyi ekle, önce önizle. */
function ZamModal({
  urunler,
  onClose,
  onUygula,
}: {
  urunler: Item[]
  onClose: () => void
  onUygula: (yeniler: Item[]) => void
}) {
  const [tur, setTur] = useState<'tl' | 'yuzde'>('tl')
  const [miktar, setMiktar] = useState('')
  const [secili, setSecili] = useState<string[]>(urunler.map((u) => u.id))

  const n = Number(miktar) || 0
  const yeniFiyat = (p: number) => {
    const x = tur === 'tl' ? p + n : p * (1 + n / 100)
    return Math.max(0, Math.round(x * 2) / 2) // 0,50 ₺'ye yuvarla
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2>Toplu zam</h2>
        <div className="row" style={{ flexWrap: 'nowrap', marginBottom: 12 }}>
          <input
            type="number"
            inputMode="decimal"
            value={miktar}
            onChange={(e) => setMiktar(e.target.value)}
            placeholder="Örn. 5"
            aria-label="Zam miktarı"
            style={{ flex: 1 }}
          />
          <button className={`btn ${tur === 'tl' ? 'primary' : ''}`} onClick={() => setTur('tl')}>
            ₺ ekle
          </button>
          <button className={`btn ${tur === 'yuzde' ? 'primary' : ''}`} onClick={() => setTur('yuzde')}>
            % ekle
          </button>
        </div>
        <div className="cart-lines" style={{ maxHeight: '45vh' }}>
          {urunler.map((u) => {
            const on = secili.includes(u.id)
            const p = u.price ?? 0
            return (
              <label key={u.id} className="liste-satir" style={{ cursor: 'pointer' }}>
                <span className="ls-ad">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setSecili((c) => (c.includes(u.id) ? c.filter((x) => x !== u.id) : [...c, u.id]))
                    }
                  />
                  {u.name}
                </span>
                <span className="ls-deger">
                  {on && n ? (
                    <>
                      <small style={{ textDecoration: 'line-through', marginRight: 6 }}>{fmtTL(p)}</small>
                      {fmtTL(yeniFiyat(p))}
                    </>
                  ) : (
                    fmtTL(p)
                  )}
                </span>
              </label>
            )
          })}
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={!n || secili.length === 0}
            onClick={() =>
              onUygula(
                urunler
                  .filter((u) => secili.includes(u.id))
                  .map((u) => ({ ...u, price: yeniFiyat(u.price ?? 0) })),
              )
            }
          >
            {secili.length} ürüne uygula
          </button>
        </div>
      </div>
    </div>
  )
}

/** Hazır listede olup işletmede olmayan ürünleri ekler. */
function KatalogModal({
  eksikIdler,
  onClose,
  onEkle,
}: {
  eksikIdler: string[]
  onClose: () => void
  onEkle: (ids: string[]) => void
}) {
  const eksikler = URUNLER.filter((u) => eksikIdler.includes(u.id))
  const [secili, setSecili] = useState<string[]>([])

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2>Hazır listeden ekle</h2>
        <div className="cart-lines" style={{ maxHeight: '55vh' }}>
          {eksikler.map((u) => (
            <label key={u.id} className="liste-satir" style={{ cursor: 'pointer' }}>
              <span className="ls-ad">
                <input
                  type="checkbox"
                  checked={secili.includes(u.id)}
                  onChange={() =>
                    setSecili((c) => (c.includes(u.id) ? c.filter((x) => x !== u.id) : [...c, u.id]))
                  }
                />
                {u.name}
              </span>
              <span className="ls-deger">{fmtTL(u.price)}</span>
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" disabled={secili.length === 0} onClick={() => onEkle(secili)}>
            {secili.length} ürünü ekle
          </button>
        </div>
      </div>
    </div>
  )
}
