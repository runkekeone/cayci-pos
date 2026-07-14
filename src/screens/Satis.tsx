import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { availableQty, unitCost } from '../lib/cost'
import { dayReport } from '../lib/report'
import { fmtTL, today } from '../lib/units'
import type { Payment, SaleLine } from '../types'

type Target = { kind: 'hizli' } | { kind: 'masa'; id: string }

export default function Satis() {
  const { s, addToTable, removeFromTable, setTableQty, renameTable, closeTable, quickSale } =
    useStore()
  const [target, setTarget] = useState<Target>({ kind: 'hizli' })
  const [quick, setQuick] = useState<SaleLine[]>([])
  const [customerId, setCustomerId] = useState('')
  const [cat, setCat] = useState('Hepsi')
  const [adlandir, setAdlandir] = useState<string | null>(null)

  const sellable = s.items.filter((i) => i.sellable)
  const cats = ['Hepsi', ...new Set(sellable.map((i) => i.category))]
  const shown = cat === 'Hepsi' ? sellable : sellable.filter((i) => i.category === cat)

  const table = target.kind === 'masa' ? s.tables.find((t) => t.id === target.id) : undefined
  const lines = target.kind === 'masa' ? (table?.lines ?? []) : quick
  const total = useMemo(() => lines.reduce((n, l) => n + l.qty * l.unitPrice, 0), [lines])

  const r = dayReport(s, today())

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

  /** Adedi elle yaz: "12 çay" için 12 kez dokunmaya gerek yok. */
  function setQty(index: number, qty: number) {
    if (target.kind === 'masa') {
      setTableQty(target.id, index, qty)
      return
    }
    setQuick((cur) => cur.map((l, i) => (i === index ? { ...l, qty } : l)).filter((l) => l.qty > 0))
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

      {/* ---- masalar ---- */}
      <div className="tables">
        <button
          className={`table-btn ${target.kind === 'hizli' ? 'on' : ''}`}
          onClick={() => setTarget({ kind: 'hizli' })}
        >
          <div className="t-ic">⚡</div>
          <div className="nm">Hızlı satış</div>
          <div className="am">tezgâh</div>
        </button>

        {s.tables.map((t) => {
          const amt = t.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
          const dolu = amt > 0
          const on = target.kind === 'masa' && target.id === t.id
          return (
            <button
              key={t.id}
              className={`table-btn ${dolu ? 'busy' : ''} ${on ? 'on' : ''}`}
              onClick={() => setTarget({ kind: 'masa', id: t.id })}
              onDoubleClick={() => setAdlandir(t.id)}
              title="Çift tıkla: isim ver"
            >
              <div className="t-ic">{dolu ? '🪑' : '🪑'}</div>
              <div className="nm">{t.name}</div>
              <div className="am">{dolu ? fmtTL(amt) : 'boş'}</div>
              {dolu && <div className="t-count">{t.lines.reduce((n, l) => n + l.qty, 0)} ürün</div>}
            </button>
          )
        })}
      </div>

      {target.kind === 'masa' && (
        <div className="row" style={{ margin: '10px 0 0' }}>
          <button className="btn sm" onClick={() => setAdlandir(target.id)}>
            ✏️ Masaya isim ver
          </button>
          <span className="hint">Masa kutusuna çift tıklayarak da isim verebilirsin.</span>
        </div>
      )}

      {/* ---- günlük rapor kutuları ---- */}
      <div className="section-title">Bugün</div>
      <div className="stats">
        <div className="stat">
          <div className="k">Satış (fiş)</div>
          <div className="v">{s.sales.filter((x) => x.date.slice(0, 10) === today()).length}</div>
        </div>
        <div className="stat">
          <div className="k">Ciro</div>
          <div className="v">{fmtTL(r.ciro)}</div>
        </div>
        <div className="stat">
          <div className="k">Nakit</div>
          <div className="v good">{fmtTL(r.nakitSatis)}</div>
        </div>
        <div className="stat">
          <div className="k">POS / Kart</div>
          <div className="v">{fmtTL(r.kartSatis)}</div>
        </div>
        <div className="stat">
          <div className="k">Veresiye</div>
          <div className="v bad">{fmtTL(r.veresiyeSatis)}</div>
        </div>
        <div className="stat">
          <div className="k">Ürün maliyeti</div>
          <div className="v bad">{fmtTL(r.satilanMalMaliyeti)}</div>
        </div>
        <div className="stat">
          <div className="k">Günlük gider</div>
          <div className="v bad">{fmtTL(r.gunlukGider + r.sabitGiderPayi)}</div>
        </div>
        <div className="stat">
          <div className="k">Brüt kâr</div>
          <div className="v good">
            {fmtTL(r.brutKar)}
            {r.ciro > 0 && (
              <span className="hint"> (%{Math.round((r.brutKar / r.ciro) * 100)})</span>
            )}
          </div>
        </div>
        <div className="stat" style={{ borderColor: r.netKar >= 0 ? 'var(--good)' : 'var(--bad)' }}>
          <div className="k">NET KÂR</div>
          <div className={`v ${r.netKar >= 0 ? 'good' : 'bad'}`}>{fmtTL(r.netKar)}</div>
        </div>
      </div>

      {/* ---- ürünler + sepet ---- */}
      <div className="grid2">
        <div>
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
                <button className="x" onClick={() => remove(idx)} title="Bir azalt">
                  −
                </button>
                <input
                  className="qty"
                  type="number"
                  min={0}
                  value={l.qty}
                  onChange={(e) => setQty(idx, Number(e.target.value))}
                  title="Adedi elle yaz"
                />
                <button className="x" onClick={() => add(l.itemId)} title="Bir artır">
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
    </>
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
          Boş bırakırsan "Masa {sira}" olarak kalır. Pencere kenarı, bahçe, okey masası gibi
          isimler verebilirsin.
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
