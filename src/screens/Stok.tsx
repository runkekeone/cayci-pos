import { useState } from 'react'
import { useStore } from '../store'
import { lowStock, unitCost } from '../lib/cost'
import {
  ADET_ALIS_BIRIMLERI,
  alisToBase,
  fmtQty,
  fmtTL,
  fmtTLInce,
  packSizeGerekli,
  unitsFor,
} from '../lib/units'

export default function Stok() {
  const { s, addPurchase, addWaste } = useStore()
  const [alis, setAlis] = useState(false)
  const [fire, setFire] = useState(false)

  const azalan = lowStock(s.items)
  const stoklu = s.items.filter((i) => !i.recipe)

  return (
    <>
      <h1>Stok & Alış</h1>
      <p className="sub">Alış girdiğin an maliyet güncellenir — son alış fiyatı esas alınır.</p>

      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn primary" onClick={() => setAlis(true)}>
          + Alış gir
        </button>
        <button className="btn" onClick={() => setFire(true)}>
          Fire / İkram
        </button>
      </div>

      {azalan.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--accent)' }}>
          <strong>⚠ Azalan stok</strong>
          <p className="hint" style={{ marginTop: 6 }}>
            {azalan.map((i) => `${i.name} (${fmtQty(i.stock, i.unit, i.buyUnit)})`).join(' · ')}
          </p>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Kalem</th>
              <th className="num">Stok</th>
              <th className="num">Birim maliyet</th>
              <th className="num">Stok değeri</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {stoklu.map((i) => {
              const c = unitCost(i.id, s.items)
              const dusuk = i.minStock != null && i.stock <= i.minStock
              return (
                <tr key={i.id}>
                  <td>
                    {i.icon} <strong>{i.name}</strong>
                  </td>
                  <td className="num">{fmtQty(i.stock, i.unit, i.buyUnit)}</td>
                  <td className="num">
                    {fmtTLInce(c)} / {i.unit}
                  </td>
                  <td className="num">{fmtTL(c * i.stock)}</td>
                  <td>
                    {i.stock <= 0 ? (
                      <span className="tag bad">bitti</span>
                    ) : dusuk ? (
                      <span className="tag warn">azaldı</span>
                    ) : (
                      <span className="tag good">yeterli</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="section-title">Son alışlar</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Kalem</th>
              <th className="num">Miktar</th>
              <th className="num">Tutar</th>
              <th className="num">Birim</th>
            </tr>
          </thead>
          <tbody>
            {[...s.purchases]
              .reverse()
              .slice(0, 15)
              .map((p) => {
                const i = s.items.find((x) => x.id === p.itemId)
                return (
                  <tr key={p.id}>
                    <td>{new Date(p.date).toLocaleDateString('tr-TR')}</td>
                    <td>{i?.name ?? '—'}</td>
                    <td className="num">{i ? fmtQty(p.qty, i.unit, i.buyUnit) : p.qty}</td>
                    <td className="num">{fmtTL(p.total)}</td>
                    <td className="num">{fmtTLInce(p.total / p.qty)}</td>
                  </tr>
                )
              })}
            {s.purchases.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">
                  Henüz alış girilmedi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {alis && <AlisModal onClose={() => setAlis(false)} onSave={addPurchase} />}
      {fire && <FireModal onClose={() => setFire(false)} onSave={addWaste} />}
    </>
  )
}

function AlisModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (
    itemId: string,
    qty: number,
    total: number,
    supplier?: string,
    birim?: { buyUnit: string; packSize?: number },
    paidCash?: boolean,
  ) => void
}) {
  const { s } = useStore()
  const stoklu = s.items.filter((i) => !i.recipe)
  const [itemId, setItemId] = useState(stoklu[0]?.id ?? '')
  const [qty, setQty] = useState(1)
  const [unitLabel, setUnitLabel] = useState('')
  const [total, setTotal] = useState(0)
  const [supplier, setSupplier] = useState('')
  // Ödeme kaynağı: kasadan nakit çıktıysa beklenen kasadan düşülür.
  const [nakit, setNakit] = useState(true)

  const item = s.items.find((i) => i.id === itemId)
  // Adetle kullanılan kalem kiloyla/koliyle de alınabilir; o zaman "içinde kaç adet" sorulur.
  const units = item
    ? item.unit === 'adet'
      ? ADET_ALIS_BIRIMLERI
      : unitsFor(item.unit).map((u) => u.label)
    : []
  const label = unitLabel || item?.buyUnit || units[0] || ''
  const [packSize, setPackSize] = useState<number>(item?.packSize ?? 1)
  const packGerek = item ? packSizeGerekli(item.unit, label) : false
  const base = item ? alisToBase(qty, item.unit, label, packSize) : 0

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Alış gir</h2>

        <div className="field">
          <label>Kalem</label>
          <select
            value={itemId}
            onChange={(e) => {
              const next = s.items.find((i) => i.id === e.target.value)
              setItemId(e.target.value)
              setUnitLabel('')
              setPackSize(next?.packSize ?? 1)
            }}
          >
            {stoklu.map((i) => (
              <option key={i.id} value={i.id}>
                {i.icon} {i.name}
              </option>
            ))}
          </select>
        </div>

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Ne kadar aldın</label>
            <input type="number" min={0} value={qty} onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label>Birim</label>
            <select value={label} onChange={(e) => setUnitLabel(e.target.value)}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          {packGerek && (
            <div className="field" style={{ width: 130 }}>
              <label>İçinde kaç adet var</label>
              <input
                type="number"
                min={1}
                value={packSize}
                onChange={(e) => setPackSize(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          )}
          <div className="field" style={{ flex: 1 }}>
            <label>Kaç ₺ ödedin</label>
            <input type="number" min={0} value={total} onChange={(e) => setTotal(Math.max(0, Number(e.target.value) || 0))} />
          </div>
        </div>

        <div className="field">
          <label>Tedarikçi (isteğe bağlı)</label>
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </div>

        <div className="field">
          <label>Nasıl ödedin</label>
          <div className="row">
            <button
              type="button"
              className={`btn sm ${nakit ? 'primary' : 'ghost'}`}
              onClick={() => setNakit(true)}
            >
              💵 Kasadan nakit
            </button>
            <button
              type="button"
              className={`btn sm ${!nakit ? 'primary' : 'ghost'}`}
              onClick={() => setNakit(false)}
            >
              💳 Kart / havale
            </button>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            Nakit ödediysen çekmeceden çıkar — “Kasada olması gereken” bu tutar kadar azalır.
          </p>
        </div>

        {item && base > 0 && (
          <p className="hint">
            Stoğa <strong>{fmtQty(base, item.unit, item.buyUnit)}</strong> girecek. Yeni birim
            maliyet: <strong>{fmtTLInce(total / base)}</strong> / {item.unit} — bu kalemin geçtiği
            tüm tariflerin maliyeti anında güncellenir.
          </p>
        )}

        <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={!item || base <= 0 || total <= 0}
            onClick={() => {
              onSave(
                itemId,
                base,
                total,
                supplier || undefined,
                { buyUnit: label, packSize: packGerek ? packSize : undefined },
                nakit,
              )
              onClose()
            }}
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}

function FireModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (itemId: string, qty: number, reason: 'fire' | 'ikram') => void
}) {
  const { s } = useStore()
  const [itemId, setItemId] = useState(s.items[0]?.id ?? '')
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState<'fire' | 'ikram'>('ikram')

  const item = s.items.find((i) => i.id === itemId)

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Fire / İkram</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Stoktan düşer, gelir yazmaz. Maliyeti günlük net kârdan indirilir.
        </p>

        <div className="field">
          <label>Ne verildi / ne bozuldu</label>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {s.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.icon} {i.name}
              </option>
            ))}
          </select>
        </div>

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Miktar ({item?.unit})</label>
            <input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Sebep</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as 'fire' | 'ikram')}
            >
              <option value="ikram">İkram</option>
              <option value="fire">Fire (döküldü/bozuldu)</option>
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={qty <= 0}
            onClick={() => {
              onSave(itemId, qty, reason)
              onClose()
            }}
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}
