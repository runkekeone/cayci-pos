import { useRef, useState } from 'react'
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
import { extract } from '../lib/ocr'
import type { Item } from '../types'

/** Basit ad eşleştirme: küçük harf + Türkçe sadeleştirme, içerme / token örtüşmesi. */
function normalize(s: string): string {
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

function bestMatch(name: string, items: Item[]): string {
  const n = normalize(name)
  if (!n) return ''
  let best = ''
  let bestScore = 0
  for (const it of items) {
    const m = normalize(it.name)
    let score = 0
    if (m === n) score = 100
    else if (m.includes(n) || n.includes(m)) score = 60
    else {
      const nt = new Set(n.split(' '))
      const mt = m.split(' ')
      score = mt.filter((t) => nt.has(t)).length * 20
    }
    if (score > bestScore) {
      bestScore = score
      best = it.id
    }
  }
  return bestScore >= 20 ? best : ''
}

export default function Stok() {
  const { s, addPurchase, addWaste } = useStore()
  const [alis, setAlis] = useState(false)
  const [fire, setFire] = useState(false)
  const [fis, setFis] = useState(false)

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
        <button className="btn" onClick={() => setFis(true)}>
          📷 Fişten oku
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
      {fis && <FisModal onClose={() => setFis(false)} onSave={addPurchase} />}
      {fire && <FireModal onClose={() => setFire(false)} onSave={addWaste} />}
    </>
  )
}

/** Fotoğraftan alış fişi okuma: AI kalemleri çıkarır, kullanıcı eşleştirip onaylar. */
function FisModal({
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
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [supplier, setSupplier] = useState('')
  const [nakit, setNakit] = useState(true)
  // Her satır: AI'dan gelen ad + kullanıcının düzenlediği miktar/tutar/eşleşen kalem.
  const [rows, setRows] = useState<
    { name: string; qty: number; total: number; itemId: string }[] | null
  >(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setErr('')
    const data = await extract(
      'alis',
      file,
      stoklu.map((i) => i.name),
    )
    setBusy(false)
    if (!data) {
      setErr('Okunamadı. İnternet ve kurulum gerekli; tekrar dene veya elle gir.')
      return
    }
    if (data.supplier) setSupplier(data.supplier)
    setRows(
      data.items.map((it) => ({
        name: it.name,
        qty: it.qty || 0,
        total: it.total || 0,
        itemId: bestMatch(it.name, stoklu),
      })),
    )
  }

  function upd(idx: number, patch: Partial<{ qty: number; total: number; itemId: string }>) {
    setRows((r) => r?.map((row, i) => (i === idx ? { ...row, ...patch } : row)) ?? r)
  }

  function kaydet() {
    if (!rows) return
    for (const row of rows) {
      if (!row.itemId || row.qty <= 0 || row.total <= 0) continue
      const item = s.items.find((i) => i.id === row.itemId)
      if (!item) continue
      // AI miktarını kalemin kendi alış birimine göre temel birime çevir.
      const base = alisToBase(row.qty, item.unit, item.buyUnit, item.packSize ?? 1)
      onSave(
        row.itemId,
        base > 0 ? base : row.qty,
        row.total,
        supplier || undefined,
        { buyUnit: item.buyUnit, packSize: item.packSize },
        nakit,
      )
    }
    onClose()
  }

  const gecerli = rows?.some((r) => r.itemId && r.qty > 0 && r.total > 0)

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>📷 Fişten alış oku</h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          Alış fişinin/faturasının fotoğrafını çek. Yapay zeka kalemleri çıkarır; sen kontrol edip
          onaylarsın.
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
          <>
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Fişteki</th>
                    <th>Kalem</th>
                    <th className="num">Miktar</th>
                    <th className="num">Tutar ₺</th>
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
                          {stoklu.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.icon} {i.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min={0}
                          value={row.qty}
                          style={{ width: 70 }}
                          onChange={(e) => upd(idx, { qty: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min={0}
                          value={row.total}
                          style={{ width: 80 }}
                          onChange={(e) =>
                            upd(idx, { total: Math.max(0, Number(e.target.value) || 0) })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            </div>
            <p className="hint">
              Miktar, kalemin normal alış birimine göre stoğa girer. Eşleşmeyen satırlar atlanır.
            </p>
          </>
        )}

        <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          {rows && (
            <button className="btn primary" disabled={!gecerli} onClick={kaydet}>
              Onayla & Kaydet
            </button>
          )}
        </div>
      </div>
    </div>
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
