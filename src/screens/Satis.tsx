import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { availableQty, unitCost } from '../lib/cost'
import { fmtTL } from '../lib/units'
import type { Payment, SaleLine } from '../types'

type Target = { kind: 'hizli' } | { kind: 'masa'; id: string }

export default function Satis() {
  const { s, addToTable, removeFromTable, closeTable, quickSale } = useStore()
  const [target, setTarget] = useState<Target>({ kind: 'hizli' })
  const [quick, setQuick] = useState<SaleLine[]>([])
  const [customerId, setCustomerId] = useState('')
  const [cat, setCat] = useState('Hepsi')

  const sellable = s.items.filter((i) => i.sellable)
  const cats = ['Hepsi', ...new Set(sellable.map((i) => i.category))]
  const shown = cat === 'Hepsi' ? sellable : sellable.filter((i) => i.category === cat)

  const table = target.kind === 'masa' ? s.tables.find((t) => t.id === target.id) : undefined
  const lines = target.kind === 'masa' ? (table?.lines ?? []) : quick
  const total = useMemo(() => lines.reduce((n, l) => n + l.qty * l.unitPrice, 0), [lines])

  function add(itemId: string) {
    if (target.kind === 'masa') {
      addToTable(target.id, itemId)
      return
    }
    const item = s.items.find((i) => i.id === itemId)
    if (!item) return
    setQuick((cur) => {
      const idx = cur.findIndex((l) => l.itemId === itemId)
      if (idx >= 0) return cur.map((l, i) => (i === idx ? { ...l, qty: l.qty + 1 } : l))
      return [
        ...cur,
        {
          itemId,
          name: item.name,
          qty: 1,
          unitPrice: item.price ?? 0,
          unitCost: unitCost(itemId, s.items),
        },
      ]
    })
  }

  function remove(index: number) {
    if (target.kind === 'masa') {
      removeFromTable(target.id, index)
      return
    }
    setQuick((cur) =>
      cur.map((l, i) => (i === index ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0),
    )
  }

  function pay(payment: Payment) {
    if (payment === 'veresiye' && !customerId) {
      alert('Veresiye için müşteri seç. Masaya veresiye yazılmaz, kişiye yazılır.')
      return
    }
    if (target.kind === 'masa') {
      closeTable(target.id, payment, payment === 'veresiye' ? customerId : undefined)
    } else {
      quickSale(quick, payment, payment === 'veresiye' ? customerId : undefined)
      setQuick([])
    }
    setCustomerId('')
  }

  return (
    <>
      <h1>Satış</h1>
      <p className="sub">
        {target.kind === 'hizli'
          ? 'Hızlı satış — ürüne dokun, ödemeyi al, bitti.'
          : `${table?.name} adisyonu açık.`}
      </p>

      <div className="grid2">
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button
              className={`btn sm ${target.kind === 'hizli' ? 'primary' : ''}`}
              onClick={() => setTarget({ kind: 'hizli' })}
            >
              ⚡ Hızlı satış
            </button>
            {s.tables.map((t) => {
              const amt = t.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
              const on = target.kind === 'masa' && target.id === t.id
              return (
                <button
                  key={t.id}
                  className={`btn sm ${on ? 'primary' : ''}`}
                  style={
                    !on && amt > 0
                      ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                      : undefined
                  }
                  onClick={() => setTarget({ kind: 'masa', id: t.id })}
                >
                  {t.name}
                  {amt > 0 ? ` · ${fmtTL(amt)}` : ''}
                </button>
              )
            })}
          </div>

          <div className="row" style={{ marginBottom: 12 }}>
            {cats.map((c) => (
              <button
                key={c}
                className={`btn sm ${cat === c ? 'primary' : 'ghost'}`}
                onClick={() => setCat(c)}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="tiles">
            {shown.map((i) => {
              const kalan = availableQty(i.id, s.items)
              const out = kalan <= 0
              const kar = (i.price ?? 0) - unitCost(i.id, s.items)
              return (
                <button
                  key={i.id}
                  className={`tile ${out ? 'out' : ''}`}
                  onClick={() => add(i.id)}
                  title={`Maliyet ${fmtTL(unitCost(i.id, s.items))} · Kâr ${fmtTL(kar)}`}
                >
                  <span className="ic">{i.icon}</span>
                  <span className="nm">{i.name}</span>
                  <span className="pr">{fmtTL(i.price ?? 0)}</span>
                  <span className="st">{out ? 'stok yok' : `${kalan} adetlik`}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card cart">
          <strong>{target.kind === 'masa' ? table?.name : 'Hızlı satış'}</strong>

          <div className="cart-lines">
            {lines.length === 0 && <p className="hint">Ürüne dokun, buraya düşsün.</p>}
            {lines.map((l, idx) => (
              <div className="cline" key={l.itemId}>
                <span className="q">{l.qty}×</span>
                <span className="nm">{l.name}</span>
                <span className="am">{fmtTL(l.qty * l.unitPrice)}</span>
                <button className="x" onClick={() => remove(idx)} title="Bir azalt">
                  −
                </button>
              </div>
            ))}
          </div>

          <div className="total">
            <span>Toplam</span>
            <span className="v">{fmtTL(total)}</span>
          </div>

          <div className="field">
            <label>Müşteri (veresiye için zorunlu)</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— seçilmedi —</option>
              {s.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.balance > 0 ? ` (borç ${fmtTL(c.balance)})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="pays">
            <button className="btn primary" disabled={!lines.length} onClick={() => pay('nakit')}>
              Nakit
            </button>
            <button className="btn" disabled={!lines.length} onClick={() => pay('kart')}>
              Kart
            </button>
            <button className="btn" disabled={!lines.length} onClick={() => pay('veresiye')}>
              Veresiye
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
