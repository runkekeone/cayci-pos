import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { availableQty, lowStock, unitCost, variantCost } from '../lib/cost'
import { fmtTL, uid } from '../lib/units'
import type { Item, Payment, PaymentPart, SaleLine, Variant } from '../types'

type Target = { kind: 'hizli' } | { kind: 'masa'; id: string }

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
    saveCustomer,
  } = useStore()

  const [target, setTarget] = useState<Target>({ kind: 'hizli' })
  const [quick, setQuick] = useState<SaleLine[]>([])
  const [customerId, setCustomerId] = useState('')
  const [cat, setCat] = useState('Hepsi')
  const [detayli, setDetayli] = useState(false)
  const [adlandir, setAdlandir] = useState<string | null>(null)
  const [cesitSec, setCesitSec] = useState<Item | null>(null)
  const [parcali, setParcali] = useState(false)

  const sellable = s.items.filter((i) => i.sellable)
  // Kategori sırası sabit; kullanıcının eklediği yeni kategoriler sona düşer.
  const SIRA = ['Sıcak', 'Soğuk', 'Yiyecek', 'Atıştırmalık']
  const mevcut = [...new Set(sellable.map((i) => i.category))].sort((a, b) => {
    const ia = SIRA.indexOf(a)
    const ib = SIRA.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const cats = ['Hepsi', ...mevcut]
  const shown = (cat === 'Hepsi' ? sellable : sellable.filter((i) => i.category === cat))
    .slice()
    .sort((a, b) => mevcut.indexOf(a.category) - mevcut.indexOf(b.category))

  const table = target.kind === 'masa' ? s.tables.find((t) => t.id === target.id) : undefined
  const lines = target.kind === 'masa' ? (table?.lines ?? []) : quick
  const total = useMemo(() => lines.reduce((n, l) => n + l.qty * l.unitPrice, 0), [lines])

  const azalanlar = lowStock(s.items)
  const sonSatislar = [...s.sales].reverse().slice(0, 6)

  // Masaya müşteri atandıysa veresiyede o seçili gelir.
  const aktifMusteri = table?.customerId ?? customerId

  function ekle(item: Item, variant?: Variant) {
    if (target.kind === 'masa') {
      addToTable(target.id, item.id, 1, variant)
      return
    }
    setQuick((cur) => {
      const idx = cur.findIndex((l) => l.itemId === item.id && l.variantId === variant?.id)
      if (idx >= 0) return cur.map((l, i) => (i === idx ? { ...l, qty: l.qty + 1 } : l))
      return [
        ...cur,
        {
          itemId: item.id,
          name: variant ? `${item.name} (${variant.name})` : item.name,
          qty: 1,
          unitPrice: (item.price ?? 0) + (variant?.priceDelta ?? 0),
          unitCost: variantCost(item.id, s.items, variant),
          variantId: variant?.id,
          variantName: variant?.name,
        },
      ]
    })
  }

  /** Detaylı moddaysa ve ürünün çeşidi varsa önce çeşit sorulur. */
  function tikla(item: Item) {
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
    ekle(item, v)
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
      alert('Veresiye kişiye yazılır. Önce müşteri seç.')
      return
    }
    if (target.kind === 'masa') {
      closeTable(target.id, payment, payment === 'veresiye' ? aktifMusteri : undefined)
    } else {
      quickSale(quick, payment, payment === 'veresiye' ? aktifMusteri : undefined)
      setQuick([])
    }
    setCustomerId('')
  }

  function parcaliOde(parts: PaymentPart[]) {
    paySplit(lines, parts, target.kind === 'masa' ? target.id : undefined)
    if (target.kind === 'hizli') setQuick([])
    setCustomerId('')
    setParcali(false)
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
          onClick={() => setDetayli(!detayli)}
          title="Çeşit seçimi ve masaya müşteri atama açılır"
        >
          {detayli ? '✓ Detaylı' : 'Detaylı'}
        </button>
      </div>

      {/* ---- masalar ---- */}
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
                onClick={() => {
                  const ad = prompt('Yeni müşteri adı:')
                  if (!ad?.trim()) return
                  const id = uid()
                  saveCustomer({ id, name: ad.trim(), balance: 0 })
                  setTableCustomer(target.id, id)
                }}
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
              return (
                <button
                  key={i.id}
                  className="tile"
                  onClick={() => tikla(i)}
                  title={`Maliyet ${fmtTL(unitCost(i.id, s.items))}`}
                >
                  {kalan <= 0 && (
                    <span className="warn-dot" title="Stok bitti — satış yine de yapılabilir">
                      ⚠
                    </span>
                  )}
                  {detayli && i.variants?.length ? <span className="var-dot">çeşitli</span> : null}
                  <span className="ic">{i.icon}</span>
                  <span className="nm">{i.name}</span>
                  <span className="pr">{fmtTL(i.price ?? 0)}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card cart">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{target.kind === 'masa' ? table?.name : 'Hızlı satış'}</strong>
            {lines.length > 0 && (
              <button className="btn sm ghost" onClick={temizle}>
                Temizle
              </button>
            )}
          </div>

          <div className="cart-lines">
            {lines.length === 0 && <p className="hint">Ürüne dokun, buraya düşsün.</p>}
            {lines.map((l, idx) => (
              <div className="cline" key={`${l.itemId}-${l.variantId ?? ''}`}>
                <button className="x" onClick={() => azalt(idx)} title="Bir azalt">
                  −
                </button>
                <input
                  className="qty"
                  type="number"
                  min={0}
                  value={l.qty}
                  onChange={(e) => setQty(idx, Number(e.target.value))}
                />
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

          {(!table?.customerId || target.kind === 'hizli') && (
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
          )}

          <div className="pays">
            <button className="btn primary" disabled={!lines.length} onClick={() => ode('nakit')}>
              Nakit
            </button>
            <button className="btn" disabled={!lines.length} onClick={() => ode('kart')}>
              Kart
            </button>
            <button className="btn" disabled={!lines.length} onClick={() => ode('veresiye')}>
              Veresiye
            </button>
          </div>

          <button
            className="btn"
            style={{ width: '100%', marginTop: 8 }}
            disabled={!lines.length}
            onClick={() => setParcali(true)}
          >
            ⑃ Parçalı ödeme (hesabı böl)
          </button>
        </div>
      </div>

      {/* ---- son satışlar ---- */}
      <div className="section-title">Son satışlar</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Saat</th>
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
                <td>
                  <span className="hint">
                    {sale.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}
                  </span>
                </td>
                <td>
                  {(sale.payments ?? [{ payment: sale.payment, amount: sale.total }]).map((p, i) => (
                    <span
                      key={i}
                      className={`tag ${p.payment === 'veresiye' ? 'bad' : ''}`}
                      style={{ marginRight: 4 }}
                    >
                      {p.payment}
                      {sale.payments ? ` ${fmtTL(p.amount)}` : ''}
                    </span>
                  ))}
                </td>
                <td className="num">{fmtTL(sale.total)}</td>
                <td className="num">
                  <button
                    className="btn sm"
                    onClick={() => {
                      if (
                        confirm(
                          `${fmtTL(sale.total)} tutarındaki satış iptal edilecek.\nStok geri yüklenecek, veresiyeyse borç silinecek.\n\nOnaylıyor musun?`,
                        )
                      ) {
                        cancelSale(sale.id)
                      }
                    }}
                  >
                    İptal et
                  </button>
                </td>
              </tr>
            ))}
            {sonSatislar.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">
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
          onPick={(v) => {
            ekle(cesitSec, v)
            setCesitSec(null)
          }}
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
    </>
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

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          {item.icon} {item.name} — çeşit seç
        </h2>
        <div className="tiles">
          {item.variants!.map((v) => {
            const m = variantCost(item.id, s.items, v)
            const f = (item.price ?? 0) + (v.priceDelta ?? 0)
            return (
              <button key={v.id} className="tile" onClick={() => onPick(v)}>
                <span className="nm">{v.name}</span>
                <span className="pr">{fmtTL(f)}</span>
                <span className="st">maliyet {fmtTL(m)}</span>
              </button>
            )
          })}
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
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

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <h2>Parçalı ödeme</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Toplam <strong>{fmtTL(toplam)}</strong>. Hesabı kaça bölüyorsun? Ödenmeyen parçalar
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
                style={{ width: 100 }}
                value={p.amount}
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
                    onClick={() => {
                      const ad = prompt('Yeni müşteri adı:')
                      if (!ad?.trim()) return
                      const id = uid()
                      saveCustomer({ id, name: ad.trim(), balance: 0 })
                      setParts(parts.map((x, j) => (j === i ? { ...x, customerId: id } : x)))
                    }}
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

        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={Math.abs(fark) >= 0.01 || eksikMusteri}
            onClick={() => onOk(parts)}
          >
            Ödemeyi tamamla
          </button>
        </div>
      </div>
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
