import { useState } from 'react'
import { useStore } from '../store'
import { unitCost } from '../lib/cost'
import {
  UNITS,
  alisToBase,
  baseToAlis,
  fmtQty,
  fmtTL,
  fmtTLInce,
  packSizeGerekli,
  round,
  uid,
  unitDef,
} from '../lib/units'
import { URUNLER, urunleriKur } from '../defaults'
import type { Item } from '../types'

function bosUrun(sellable: boolean): Item {
  return {
    id: uid(),
    name: '',
    unit: sellable ? 'adet' : 'g',
    buyUnit: sellable ? 'adet' : 'kg',
    category: sellable ? 'Sıcak' : 'Hammadde',
    icon: sellable ? '🍵' : '📦',
    sellable,
    price: sellable ? 0 : undefined,
    stock: 0,
  }
}

export default function Urunler() {
  const { s, saveItem, deleteItem } = useStore()
  const [edit, setEdit] = useState<Item | null>(null)
  const [katalog, setKatalog] = useState(false)

  const satilan = s.items.filter((i) => i.sellable)
  const hammadde = s.items.filter((i) => !i.sellable)

  // Hazır katalogda olup bu işletmede olmayan ürünler.
  const eksikler = URUNLER.filter((u) => !s.items.some((i) => i.id === u.id))

  return (
    <>
      <h1>Ürünler & Tarifler</h1>
      <p className="sub">
        Maliyet son alış fiyatından hesaplanır. Alış fiyatını değiştirdiğin an tarifteki gramaja
        göre ürün maliyeti kendiliğinden güncellenir — ortalama alınmaz.
      </p>

      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn primary" onClick={() => setEdit(bosUrun(true))}>
          + Satış ürünü
        </button>
        <button className="btn" onClick={() => setEdit(bosUrun(false))}>
          + Hammadde
        </button>
        {eksikler.length > 0 && (
          <button className="btn" onClick={() => setKatalog(true)}>
            📚 Hazır katalogdan ekle
            <span className="tag warn" style={{ marginLeft: 6 }}>
              {eksikler.length}
            </span>
          </button>
        )}
      </div>

      <div className="section-title">Satış ürünleri</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Ürün</th>
              <th>Tarif</th>
              <th className="num">Maliyet</th>
              <th className="num">Satış</th>
              <th className="num">Kâr</th>
              <th className="num">Kâr %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {satilan.map((i) => {
              const c = unitCost(i.id, s.items)
              const p = i.price ?? 0
              const kar = p - c
              return (
                <tr key={i.id}>
                  <td>
                    {i.icon} <strong>{i.name}</strong>
                  </td>
                  <td>
                    {i.recipe?.lines.length ? (
                      <span className="hint">
                        {i.recipe.lines
                          .map((l) => {
                            const it = s.items.find((x) => x.id === l.itemId)
                            if (!it) return '?'
                            const perUnit = l.qty / (i.recipe!.yield || 1)
                            return `${round(perUnit, 2)} ${it.unit} ${it.name}`
                          })
                          .join(' + ')}
                      </span>
                    ) : (
                      <span className="tag">tarifsiz (al-sat)</span>
                    )}
                  </td>
                  <td className="num">{fmtTLInce(c)}</td>
                  <td className="num">{fmtTL(p)}</td>
                  <td className="num">
                    <span className={kar >= 0 ? 'v good' : 'v bad'} style={{ fontSize: 14 }}>
                      {fmtTL(kar)}
                    </span>
                  </td>
                  <td className="num">{p > 0 ? `%${round((kar / p) * 100, 0)}` : '—'}</td>
                  <td className="num">
                    <button className="btn sm" onClick={() => setEdit(i)}>
                      Aç
                    </button>
                  </td>
                </tr>
              )
            })}
            {satilan.length === 0 && (
              <tr>
                <td colSpan={7} className="hint">
                  Henüz satış ürünü yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="section-title">Hammaddeler</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Hammadde</th>
              <th className="num">Stok</th>
              <th className="num">Son alış</th>
              <th className="num">Birim maliyet</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {hammadde.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.icon} <strong>{i.name}</strong>
                </td>
                <td className="num">{fmtQty(i.stock, i.unit, i.buyUnit)}</td>
                <td className="num">
                  {i.lastCost
                    ? `${fmtTL(i.lastCost.total)} / ${round(
                        baseToAlis(i.lastCost.qty, i.unit, i.buyUnit, i.packSize),
                        2,
                      )} ${i.buyUnit}`
                    : '—'}
                </td>
                <td className="num">
                  {fmtTLInce(unitCost(i.id, s.items))} / {i.unit}
                </td>
                <td className="num">
                  <button className="btn sm" onClick={() => setEdit(i)}>
                    Aç
                  </button>
                </td>
              </tr>
            ))}
            {hammadde.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">
                  Henüz hammadde yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <UrunKarti
          item={edit}
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
            // Seçilen ürünler ve eksik hammaddeleri hazır tarifleriyle kurulur.
            const yeniler = urunleriKur(secilen)
            for (const it of yeniler) {
              if (!s.items.some((i) => i.id === it.id)) saveItem(it)
            }
            setKatalog(false)
          }}
        />
      )}
    </>
  )
}

/** Hazır katalogda olup listende olmayan ürünleri getirir. */
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
  const [secili, setSecili] = useState<string[]>(eksikIdler)

  const kategoriler = [...new Set(eksikler.map((u) => u.category))]

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <h2>Hazır katalogdan ürün ekle</h2>
        <p className="hint" style={{ marginBottom: 16 }}>
          Bunlar katalogda var ama senin listende yok. Eklediklerin hazır tarifleri ve varsayılan
          alış fiyatlarıyla gelir — sonra kendi rakamlarınla düzeltirsin.
        </p>

        {kategoriler.map((kat) => (
          <div key={kat}>
            <div className="section-title">{kat}</div>
            <div className="tiles">
              {eksikler
                .filter((u) => u.category === kat)
                .map((u) => {
                  const on = secili.includes(u.id)
                  return (
                    <button
                      key={u.id}
                      className="tile"
                      style={{ opacity: on ? 1 : 0.45, borderColor: on ? 'var(--accent)' : undefined }}
                      onClick={() =>
                        setSecili((c) =>
                          c.includes(u.id) ? c.filter((x) => x !== u.id) : [...c, u.id],
                        )
                      }
                    >
                      <span className="ic">{u.icon}</span>
                      <span className="nm">{u.name}</span>
                      <span className="pr">{fmtTL(u.price)}</span>
                    </button>
                  )
                })}
            </div>
          </div>
        ))}

        <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={secili.length === 0}
            onClick={() => onEkle(secili)}
          >
            {secili.length} ürünü ekle
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * ÜRÜN KARTI.
 * Ad · Ürün tipi (kg/lt/cc/adet...) · Alış fiyatı · Satış fiyatı · [ ] Tarif ekle
 * Alış "kaç birim için kaç ₺" olarak girilir; birim maliyet buradan çıkar.
 */
function UrunKarti({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: Item
  onClose: () => void
  onSave: (i: Item) => void
  onDelete: () => void
}) {
  const { s } = useStore()
  const [d, setD] = useState<Item>(item)

  // Alış kutuları kullanıcının birimiyle çalışır, kayıtta temel birime çevrilir.
  const [alisMiktar, setAlisMiktar] = useState(
    item.lastCost ? round(baseToAlis(item.lastCost.qty, item.unit, item.buyUnit, item.packSize), 3) : 1,
  )
  const [alisTutar, setAlisTutar] = useState(item.lastCost?.total ?? 0)
  const [tarifli, setTarifli] = useState(!!item.recipe)

  const yieldN = d.recipe?.yield || 1
  const packGerek = packSizeGerekli(d.unit, d.buyUnit)
  const alisBase = alisToBase(alisMiktar, d.unit, d.buyUnit, d.packSize)

  // Kaydedilmemiş hali de dahil ederek maliyeti canlı göster.
  const kayitli = { ...d, lastCost: { total: alisTutar, qty: alisBase } }
  const preview = s.items.some((i) => i.id === d.id)
    ? s.items.map((i) => (i.id === d.id ? kayitli : i))
    : [...s.items, kayitli]
  const maliyet = unitCost(d.id, preview)

  /** Hazır tarif: kütüphaneden aynı isimli/id'li ürünün tarifini getirir. */
  const hazir = URUNLER.find(
    (u) => u.id === d.id || u.name.toLowerCase() === d.name.trim().toLowerCase(),
  )
  const hazirVar = !!hazir?.recipe

  function hazirTarifiKullan() {
    if (!hazir?.recipe) return
    const eksik = hazir.recipe.lines.filter((l) => !s.items.some((i) => i.id === l.itemId))
    if (eksik.length > 0) {
      alert(
        'Bu hazır tarifin bazı hammaddeleri ürün listende yok: ' +
          eksik.map((l) => l.itemId).join(', ') +
          '\nÖnce onları hammadde olarak ekle.',
      )
      return
    }
    setTarifli(true)
    setD({
      ...d,
      recipe: { yield: hazir.recipe.yield, lines: hazir.recipe.lines.map((l) => ({ ...l })) },
    })
  }

  function kaydet() {
    const next: Item = {
      ...d,
      recipe: tarifli ? d.recipe : undefined,
      // Tarifli üründe kendi alış maliyeti tutulmaz — maliyet içindekilerden gelir.
      lastCost:
        tarifli || alisTutar <= 0 || alisBase <= 0 ? d.lastCost : { total: alisTutar, qty: alisBase },
    }
    if (tarifli) next.lastCost = undefined
    onSave(next)
  }

  const birimSecenek = UNITS

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <h2>{d.sellable ? 'Ürün kartı' : 'Hammadde kartı'}</h2>

        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Ürün adı</label>
            <input
              value={d.name}
              onChange={(e) => setD({ ...d, name: e.target.value })}
              placeholder="Çay, Kaşarlı tost, Kola..."
            />
          </div>
          <div className="field" style={{ width: 70 }}>
            <label>İkon</label>
            <input value={d.icon} onChange={(e) => setD({ ...d, icon: e.target.value })} />
          </div>
        </div>

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Ürün tipi (birim)</label>
            <select
              value={d.buyUnit}
              onChange={(e) => {
                const def = unitDef(e.target.value)
                setD({ ...d, buyUnit: def.label, unit: def.base })
              }}
            >
              {['Ağırlık', 'Hacim', 'Sayı'].map((g) => (
                <optgroup key={g} label={g}>
                  {birimSecenek
                    .filter((u) => u.group === g)
                    .map((u) => (
                      <option key={u.label} value={u.label}>
                        {u.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Kategori</label>
            <input value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} />
          </div>
          {d.sellable && (
            <div className="field" style={{ width: 120 }}>
              <label>Satış fiyatı ₺</label>
              <input
                type="number"
                value={d.price ?? 0}
                onChange={(e) => setD({ ...d, price: Number(e.target.value) })}
              />
            </div>
          )}
        </div>

        {!tarifli && (
          <>
            <div className="section-title">Alış fiyatı</div>
            <div className="row">
              <input
                type="number"
                style={{ width: 80 }}
                value={alisMiktar}
                onChange={(e) => setAlisMiktar(Number(e.target.value))}
              />
              <span className="hint">{d.buyUnit} aldım,</span>
              {packGerek && (
                <>
                  <span className="hint">içinde</span>
                  <input
                    type="number"
                    style={{ width: 70 }}
                    value={d.packSize ?? 1}
                    onChange={(e) => setD({ ...d, packSize: Number(e.target.value) })}
                  />
                  <span className="hint">adet var,</span>
                </>
              )}
              <input
                type="number"
                style={{ width: 100 }}
                value={alisTutar}
                onChange={(e) => setAlisTutar(Number(e.target.value))}
              />
              <span className="hint">₺ ödedim</span>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Birim maliyet: <strong>{fmtTLInce(maliyet)}</strong> / {d.unit}
              {alisBase > 0 && d.buyUnit !== d.unit && (
                <>
                  {' '}
                  (stoğa {round(alisBase, 0)} {d.unit} girer)
                </>
              )}
            </p>

            {!d.sellable && (
              <div className="field" style={{ marginTop: 12, width: 200 }}>
                <label>Kritik stok ({d.unit})</label>
                <input
                  type="number"
                  value={d.minStock ?? 0}
                  onChange={(e) => setD({ ...d, minStock: Number(e.target.value) })}
                />
              </div>
            )}
          </>
        )}

        {d.sellable && (
          <>
            <div className="section-title">Tarif</div>
            <label className="row" style={{ cursor: 'pointer', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={tarifli}
                onChange={(e) => {
                  const on = e.target.checked
                  setTarifli(on)
                  if (on && !d.recipe) setD({ ...d, recipe: { yield: 1, lines: [] } })
                }}
                style={{ width: 18, height: 18 }}
              />
              <strong>Tarif ekle</strong>
              <span className="hint">
                işaretlersen satışta içindekiler stoktan düşer, maliyet tariften hesaplanır
              </span>
            </label>

            {tarifli && (
              <>
                {hazirVar && (
                  <button
                    className="btn sm"
                    onClick={hazirTarifiKullan}
                    style={{ marginBottom: 12 }}
                  >
                    ⚡ Otomatik tarif kullan ({hazir!.name})
                  </button>
                )}

                {(d.recipe?.lines ?? []).map((line, idx) => {
                  const li = s.items.find((i) => i.id === line.itemId)
                  const perUnit = line.qty / yieldN
                  const satirMaliyet = perUnit * unitCost(line.itemId, s.items)
                  return (
                    <div className="row" key={idx} style={{ marginBottom: 8 }}>
                      <select
                        style={{ flex: 1 }}
                        value={line.itemId}
                        onChange={(e) => {
                          const lines = [...d.recipe!.lines]
                          lines[idx] = { ...line, itemId: e.target.value }
                          setD({ ...d, recipe: { ...d.recipe!, lines } })
                        }}
                      >
                        {s.items
                          .filter((i) => i.id !== d.id)
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.icon} {i.name}
                            </option>
                          ))}
                      </select>
                      <input
                        type="number"
                        style={{ width: 90 }}
                        value={line.qty}
                        onChange={(e) => {
                          const lines = [...d.recipe!.lines]
                          lines[idx] = { ...line, qty: Number(e.target.value) }
                          setD({ ...d, recipe: { ...d.recipe!, lines } })
                        }}
                      />
                      <span className="hint" style={{ width: 34 }}>
                        {li?.unit}
                      </span>
                      <span className="hint" style={{ width: 110 }}>
                        = {fmtTLInce(satirMaliyet)}/adet
                      </span>
                      <button
                        className="x"
                        onClick={() =>
                          setD({
                            ...d,
                            recipe: {
                              ...d.recipe!,
                              lines: d.recipe!.lines.filter((_, i) => i !== idx),
                            },
                          })
                        }
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}

                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btn sm"
                    onClick={() => {
                      const first = s.items.find((i) => i.id !== d.id)
                      if (!first) return
                      setD({
                        ...d,
                        recipe: {
                          yield: d.recipe?.yield ?? 1,
                          lines: [...(d.recipe?.lines ?? []), { itemId: first.id, qty: 1 }],
                        },
                      })
                    }}
                  >
                    + Malzeme ekle
                  </button>
                  <span className="hint">Bu tariften çıkan adet:</span>
                  <input
                    type="number"
                    style={{ width: 80 }}
                    value={yieldN}
                    onChange={(e) =>
                      setD({
                        ...d,
                        recipe: { ...d.recipe!, yield: Math.max(1, Number(e.target.value)) },
                      })
                    }
                  />
                </div>
                <p className="hint" style={{ marginTop: 8 }}>
                  Miktarlar <strong>bir parti</strong> içindir. Demlik örneği: 119 g çay yaz, çıkan
                  adet 25 de — bardak başına 4,76 g düşer.
                </p>
              </>
            )}
          </>
        )}

        <div
          className="card"
          style={{ marginTop: 16, background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}
        >
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Birim maliyet</span>
            <strong>{fmtTLInce(maliyet)}</strong>
          </div>
          {d.sellable && (
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <span>Kâr</span>
              <strong className={(d.price ?? 0) - maliyet >= 0 ? 'v good' : 'v bad'}>
                {fmtTL((d.price ?? 0) - maliyet)}
              </strong>
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 20, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onDelete} style={{ color: 'var(--bad)' }}>
            Sil
          </button>
          <div className="row">
            <button className="btn ghost" onClick={onClose}>
              Vazgeç
            </button>
            <button className="btn primary" disabled={!d.name.trim()} onClick={kaydet}>
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
