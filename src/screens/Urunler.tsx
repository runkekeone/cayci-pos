import { useState } from 'react'
import { useStore } from '../store'
import { unitCost } from '../lib/cost'
import { fmtQty, fmtTL, round, uid } from '../lib/units'
import type { Item, Unit } from '../types'

const BOS: Item = {
  id: '',
  name: '',
  unit: 'adet',
  category: 'Sıcak',
  icon: '🍵',
  sellable: true,
  price: 0,
  stock: 0,
}

export default function Urunler() {
  const { s, saveItem, deleteItem } = useStore()
  const [edit, setEdit] = useState<Item | null>(null)

  const satilan = s.items.filter((i) => i.sellable)
  const hammadde = s.items.filter((i) => !i.sellable)

  return (
    <>
      <h1>Ürünler & Tarifler</h1>
      <p className="sub">
        Tarife hammadde de, başka ürün de eklenebilir. Maliyet son alış fiyatından hesaplanır.
      </p>

      <div className="row" style={{ marginBottom: 16 }}>
        <button
          className="btn primary"
          onClick={() => setEdit({ ...BOS, id: uid(), sellable: true })}
        >
          + Satış ürünü
        </button>
        <button
          className="btn"
          onClick={() =>
            setEdit({
              ...BOS,
              id: uid(),
              sellable: false,
              category: 'Hammadde',
              icon: '📦',
              unit: 'g',
              price: undefined,
            })
          }
        >
          + Hammadde
        </button>
      </div>

      <div className="section-title">Satış ürünleri</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Ürün</th>
              <th>Tarif</th>
              <th className="num">Maliyet</th>
              <th className="num">Fiyat</th>
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
              const oran = p > 0 ? (kar / p) * 100 : 0
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
                            return `${fmtQty(round(l.qty / (i.recipe!.yield || 1), 2), it.unit)} ${it.name}`
                          })
                          .join(' + ')}
                      </span>
                    ) : (
                      <span className="tag">tarifsiz (al-sat)</span>
                    )}
                  </td>
                  <td className="num">{fmtTL(c)}</td>
                  <td className="num">{fmtTL(p)}</td>
                  <td className="num">
                    <span className={kar >= 0 ? 'v good' : 'v bad'} style={{ fontSize: 14 }}>
                      {fmtTL(kar)}
                    </span>
                  </td>
                  <td className="num">%{round(oran, 0)}</td>
                  <td className="num">
                    <button className="btn sm" onClick={() => setEdit(i)}>
                      Düzenle
                    </button>
                  </td>
                </tr>
              )
            })}
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
                <td className="num">{fmtQty(i.stock, i.unit)}</td>
                <td className="num">
                  {i.lastCost ? `${fmtTL(i.lastCost.total)} / ${fmtQty(i.lastCost.qty, i.unit)}` : '—'}
                </td>
                <td className="num">
                  {fmtTL(unitCost(i.id, s.items))} / {i.unit}
                </td>
                <td className="num">
                  <button className="btn sm" onClick={() => setEdit(i)}>
                    Düzenle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <ItemModal
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
    </>
  )
}

function ItemModal({
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

  const yieldN = d.recipe?.yield || 1
  // Kaydedilmemiş halin maliyetini görebilmek için listeye geçici olarak koy.
  const preview = s.items.some((i) => i.id === d.id)
    ? s.items.map((i) => (i.id === d.id ? d : i))
    : [...s.items, d]
  const maliyet = unitCost(d.id, preview)

  function addLine() {
    const first = s.items.find((i) => i.id !== d.id)
    if (!first) return
    setD({
      ...d,
      recipe: {
        yield: d.recipe?.yield ?? 1,
        lines: [...(d.recipe?.lines ?? []), { itemId: first.id, qty: 1 }],
      },
    })
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{d.sellable ? 'Satış ürünü' : 'Hammadde'}</h2>

        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Ad</label>
            <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </div>
          <div className="field" style={{ width: 70 }}>
            <label>İkon</label>
            <input value={d.icon} onChange={(e) => setD({ ...d, icon: e.target.value })} />
          </div>
        </div>

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Kategori</label>
            <input
              value={d.category}
              onChange={(e) => setD({ ...d, category: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label>Birim</label>
            <select
              value={d.unit}
              onChange={(e) => setD({ ...d, unit: e.target.value as Unit })}
            >
              <option value="adet">adet</option>
              <option value="g">gram</option>
              <option value="ml">mililitre</option>
            </select>
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

        {!d.sellable && (
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>Kritik stok (alt limit, {d.unit})</label>
              <input
                type="number"
                value={d.minStock ?? 0}
                onChange={(e) => setD({ ...d, minStock: Number(e.target.value) })}
              />
            </div>
          </div>
        )}

        <div className="section-title" style={{ marginTop: 16 }}>
          Tarif
        </div>
        <p className="hint" style={{ marginBottom: 10 }}>
          Boş bırakırsan ürün "al-sat" sayılır, stoğu doğrudan tutulur. Tarif girersen satışta
          içindekiler stoktan düşer. <strong>Çıkan adet</strong> demlik mantığıdır: 119 g çay
          yazıp 25 adet dersen bardak başına 4,76 g düşer.
        </p>

        {(d.recipe?.lines ?? []).map((line, idx) => {
          const li = s.items.find((i) => i.id === line.itemId)
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
                style={{ width: 100 }}
                value={line.qty}
                onChange={(e) => {
                  const lines = [...d.recipe!.lines]
                  lines[idx] = { ...line, qty: Number(e.target.value) }
                  setD({ ...d, recipe: { ...d.recipe!, lines } })
                }}
              />
              <span className="hint" style={{ width: 40 }}>
                {li?.unit}
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
          <button className="btn sm" onClick={addLine}>
            + Tarife satır ekle
          </button>
          {d.recipe && (
            <>
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
            </>
          )}
        </div>

        <div className="card" style={{ marginTop: 16, background: 'var(--bg)' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="hint">Birim maliyet</span>
            <strong>{fmtTL(maliyet)}</strong>
          </div>
          {d.sellable && (
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <span className="hint">Kâr</span>
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
            <button className="btn primary" onClick={() => onSave(d)}>
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
