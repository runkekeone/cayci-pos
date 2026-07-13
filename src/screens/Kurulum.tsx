import { useState } from 'react'
import { useStore } from '../store'
import { fmtTL, uid } from '../lib/units'
import { AL_SAT_KATALOG, AYLIK_GIDER_ONERI, TARIFLI_KATALOG } from '../seed'
import type { Business, Expense, Item } from '../types'

/**
 * Zorunlu kurulum. Üyelik açıldıktan sonra bu bitmeden uygulamaya girilemez.
 * Çıktısı: items[] + expenses[] + business.
 */
export default function Kurulum({ businessName }: { businessName: string }) {
  const { finishSetup } = useStore()
  const [adim, setAdim] = useState(0)

  // 1 — işletme
  const [biz, setBiz] = useState<Business>({
    name: businessName,
    address: '',
    phone: '',
    owner: '',
    openTime: '07:00',
    closeTime: '23:00',
  })

  // 2 — çay (zorunlu)
  const [cay, setCay] = useState({
    cayKg: 5,
    cayTL: 0,
    sekerAdet: 500,
    sekerTL: 0,
    tupKg: 12,
    tupTL: 0,
    demlikGram: 119,
    demlikBardak: 25,
    demlikGazGram: 150,
    bardakBasiSeker: 2,
    satisFiyati: 15,
  })

  // 3 — tarifli opsiyonlar
  const [tarifli, setTarifli] = useState<Record<string, boolean>>({})
  const [tarifliFiyat, setTarifliFiyat] = useState<Record<string, number>>(
    Object.fromEntries(TARIFLI_KATALOG.map((t) => [t.id, t.price])),
  )
  const [rawAlis, setRawAlis] = useState<Record<string, { qty: number; total: number }>>(
    Object.fromEntries(
      TARIFLI_KATALOG.flatMap((t) =>
        t.needs.map((n) => [n.rawId, { qty: n.buyQty, total: n.buyTotal }]),
      ),
    ),
  )

  // 4 — al-sat
  const [alSat, setAlSat] = useState<Record<string, boolean>>(
    Object.fromEntries(AL_SAT_KATALOG.map((k) => [k.id, true])),
  )
  const [alSatVeri, setAlSatVeri] = useState(
    Object.fromEntries(
      AL_SAT_KATALOG.map((k) => [k.id, { qty: k.buyQty, total: k.buyTotal, price: k.price }]),
    ),
  )

  // 5 — aylık sabit gider
  const [aylik, setAylik] = useState(AYLIK_GIDER_ONERI.map((g) => ({ ...g })))

  // 6 — günlük zorunlu gider
  const [gunluk, setGunluk] = useState([{ name: 'Eleman yevmiyesi', amount: 0 }])

  const cayMaliyet = hesaplaCayMaliyet(cay)

  function bitir() {
    const items: Item[] = []

    // --- çay bloğu (zorunlu) ---
    items.push(
      {
        id: 'cay',
        name: 'Çay (dökme)',
        unit: 'g',
        category: 'Hammadde',
        icon: '🌿',
        sellable: false,
        stock: cay.cayKg * 1000,
        minStock: 1000,
        lastCost: { total: cay.cayTL, qty: cay.cayKg * 1000 },
      },
      {
        id: 'tup',
        name: 'Tüp gaz',
        unit: 'g',
        category: 'Hammadde',
        icon: '🔥',
        sellable: false,
        stock: cay.tupKg * 1000,
        minStock: 2000,
        lastCost: { total: cay.tupTL, qty: cay.tupKg * 1000 },
      },
    )

    const cayLines = [
      { itemId: 'cay', qty: cay.demlikGram },
      { itemId: 'tup', qty: cay.demlikGazGram },
    ]

    if (cay.bardakBasiSeker > 0) {
      items.push({
        id: 'seker',
        name: 'Şeker (küp)',
        unit: 'adet',
        category: 'Hammadde',
        icon: '🍬',
        sellable: false,
        stock: cay.sekerAdet,
        minStock: 100,
        lastCost: { total: cay.sekerTL, qty: cay.sekerAdet },
      })
      // Tarif satırları BİR PARTİ içindir: bardak başı şeker × partiden çıkan bardak.
      cayLines.push({ itemId: 'seker', qty: cay.bardakBasiSeker * cay.demlikBardak })
    }

    items.push({
      id: 'cay-bardak',
      name: 'Çay',
      unit: 'adet',
      category: 'Sıcak',
      icon: '🍵',
      sellable: true,
      price: cay.satisFiyati,
      stock: 0,
      recipe: { yield: cay.demlikBardak, lines: cayLines },
    })

    // --- tarifli opsiyonlar ---
    for (const t of TARIFLI_KATALOG) {
      if (!tarifli[t.id]) continue
      for (const n of t.needs) {
        if (items.some((i) => i.id === n.rawId)) continue
        const alis = rawAlis[n.rawId]
        items.push({
          id: n.rawId,
          name: n.rawName,
          unit: n.unit,
          category: 'Hammadde',
          icon: n.rawIcon,
          sellable: false,
          stock: alis.qty,
          minStock: Math.round(alis.qty * 0.2),
          lastCost: { total: alis.total, qty: alis.qty },
        })
      }
      items.push({
        id: t.id,
        name: t.name,
        unit: 'adet',
        category: t.id === 'tost' ? 'Yiyecek' : 'Sıcak',
        icon: t.icon,
        sellable: true,
        price: tarifliFiyat[t.id],
        stock: 0,
        recipe: { yield: 1, lines: t.needs.map((n) => ({ itemId: n.rawId, qty: n.qty })) },
      })
    }

    // --- al-sat ---
    for (const k of AL_SAT_KATALOG) {
      if (!alSat[k.id]) continue
      const v = alSatVeri[k.id]
      items.push({
        id: k.id,
        name: k.name,
        unit: 'adet',
        category: 'Soğuk',
        icon: k.icon,
        sellable: true,
        price: v.price,
        stock: v.qty,
        minStock: Math.max(1, Math.round(v.qty * 0.25)),
        lastCost: { total: v.total, qty: v.qty },
      })
    }

    // --- giderler ---
    const expenses: Expense[] = [
      ...aylik
        .filter((g) => g.amount > 0)
        .map((g) => ({
          id: uid(),
          date: '',
          name: g.name,
          amount: g.amount,
          kind: 'aylik' as const,
          paidCash: false,
        })),
      ...gunluk
        .filter((g) => g.amount > 0)
        .map((g) => ({
          id: uid(),
          date: '',
          name: g.name,
          amount: g.amount,
          kind: 'gunluk-sabit' as const,
          paidCash: true,
        })),
    ]

    finishSetup({ items, expenses, business: biz })
  }

  const adimlar = ['İşletme', 'Çay', 'Tarifli ürünler', 'Al-sat ürünler', 'Aylık gider', 'Günlük gider']

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 60px' }}>
      <h1>Kurulum</h1>
      <p className="sub">
        Bu adımlar bitmeden satış yapılamaz. Çay maliyeti zorunlu — programın tüm kâr hesabı
        buradan çıkıyor.
      </p>

      <div className="row" style={{ marginBottom: 20 }}>
        {adimlar.map((a, i) => (
          <span key={a} className={`tag ${i === adim ? 'warn' : i < adim ? 'good' : ''}`}>
            {i + 1}. {a}
          </span>
        ))}
      </div>

      <div className="card">
        {adim === 0 && (
          <>
            <h2 style={{ marginTop: 0 }}>İşletme bilgileri</h2>
            <div className="field">
              <label>İşletme adı</label>
              <input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Sahibi</label>
              <input value={biz.owner} onChange={(e) => setBiz({ ...biz, owner: e.target.value })} />
            </div>
            <div className="field">
              <label>Açık adres</label>
              <input
                value={biz.address}
                onChange={(e) => setBiz({ ...biz, address: e.target.value })}
              />
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>Telefon</label>
                <input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} />
              </div>
              <div className="field" style={{ width: 120 }}>
                <label>Açılış</label>
                <input
                  type="time"
                  value={biz.openTime}
                  onChange={(e) => setBiz({ ...biz, openTime: e.target.value })}
                />
              </div>
              <div className="field" style={{ width: 120 }}>
                <label>Kapanış</label>
                <input
                  type="time"
                  value={biz.closeTime}
                  onChange={(e) => setBiz({ ...biz, closeTime: e.target.value })}
                />
              </div>
            </div>
          </>
        )}

        {adim === 1 && (
          <>
            <h2 style={{ marginTop: 0 }}>Çay maliyeti (zorunlu)</h2>
            <p className="hint" style={{ marginBottom: 16 }}>
              Aldığın fiyatları yaz. Demlik bilgisi bardak başına düşen çayı hesaplar — programda
              demlik açıp kapatmayacaksın, sadece "çay sat" diyeceksin.
            </p>

            <div className="section-title">Alış fiyatların</div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>Çay (kg)</label>
                <input
                  type="number"
                  value={cay.cayKg}
                  onChange={(e) => setCay({ ...cay, cayKg: Number(e.target.value) })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Ödediğin ₺</label>
                <input
                  type="number"
                  value={cay.cayTL}
                  onChange={(e) => setCay({ ...cay, cayTL: Number(e.target.value) })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Tüp (kg)</label>
                <input
                  type="number"
                  value={cay.tupKg}
                  onChange={(e) => setCay({ ...cay, tupKg: Number(e.target.value) })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Tüp ₺</label>
                <input
                  type="number"
                  value={cay.tupTL}
                  onChange={(e) => setCay({ ...cay, tupTL: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>Şeker (kaç küp)</label>
                <input
                  type="number"
                  value={cay.sekerAdet}
                  onChange={(e) => setCay({ ...cay, sekerAdet: Number(e.target.value) })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Şeker ₺</label>
                <input
                  type="number"
                  value={cay.sekerTL}
                  onChange={(e) => setCay({ ...cay, sekerTL: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="section-title">Demlik</div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>Bir demliğe kaç g çay</label>
                <input
                  type="number"
                  value={cay.demlikGram}
                  onChange={(e) => setCay({ ...cay, demlikGram: Number(e.target.value) })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Kaç bardak çıkar</label>
                <input
                  type="number"
                  value={cay.demlikBardak}
                  onChange={(e) => setCay({ ...cay, demlikBardak: Number(e.target.value) })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Demlik başı gaz (g)</label>
                <input
                  type="number"
                  value={cay.demlikGazGram}
                  onChange={(e) => setCay({ ...cay, demlikGazGram: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>Bardak başı şeker (küp, 0 = koyma)</label>
                <input
                  type="number"
                  value={cay.bardakBasiSeker}
                  onChange={(e) => setCay({ ...cay, bardakBasiSeker: Number(e.target.value) })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Çay satış fiyatı ₺</label>
                <input
                  type="number"
                  value={cay.satisFiyati}
                  onChange={(e) => setCay({ ...cay, satisFiyati: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>Bir bardak çayın maliyeti</span>
                <strong>{fmtTL(cayMaliyet)}</strong>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <span>Bardak başı kâr</span>
                <strong className={cay.satisFiyati - cayMaliyet >= 0 ? 'v good' : 'v bad'}>
                  {fmtTL(cay.satisFiyati - cayMaliyet)}
                </strong>
              </div>
            </div>
          </>
        )}

        {adim === 2 && (
          <>
            <h2 style={{ marginTop: 0 }}>Tarifli ürünler</h2>
            <p className="hint" style={{ marginBottom: 16 }}>
              Satmıyorsan işaretleme — ürün kartına hiç eklenmez.
            </p>
            {TARIFLI_KATALOG.map((t) => (
              <div key={t.id} className="card" style={{ marginBottom: 10, background: 'var(--bg)' }}>
                <label className="row" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!tarifli[t.id]}
                    onChange={(e) => setTarifli({ ...tarifli, [t.id]: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <strong style={{ flex: 1 }}>
                    {t.icon} {t.name}
                  </strong>
                  <span className="hint">Satış ₺</span>
                  <input
                    type="number"
                    style={{ width: 90 }}
                    value={tarifliFiyat[t.id]}
                    disabled={!tarifli[t.id]}
                    onChange={(e) =>
                      setTarifliFiyat({ ...tarifliFiyat, [t.id]: Number(e.target.value) })
                    }
                  />
                </label>

                {tarifli[t.id] && (
                  <div style={{ marginTop: 12, paddingLeft: 28 }}>
                    {t.needs.map((n) => (
                      <div className="row" key={n.rawId} style={{ marginBottom: 6 }}>
                        <span style={{ flex: 1, fontSize: 14 }}>
                          {n.rawIcon} {n.rawName} — porsiyon başı {n.qty} {n.unit}
                        </span>
                        <span className="hint">aldığın</span>
                        <input
                          type="number"
                          style={{ width: 80 }}
                          value={rawAlis[n.rawId].qty}
                          onChange={(e) =>
                            setRawAlis({
                              ...rawAlis,
                              [n.rawId]: { ...rawAlis[n.rawId], qty: Number(e.target.value) },
                            })
                          }
                        />
                        <span className="hint">{n.unit} için</span>
                        <input
                          type="number"
                          style={{ width: 90 }}
                          value={rawAlis[n.rawId].total}
                          onChange={(e) =>
                            setRawAlis({
                              ...rawAlis,
                              [n.rawId]: { ...rawAlis[n.rawId], total: Number(e.target.value) },
                            })
                          }
                        />
                        <span className="hint">₺</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {adim === 3 && (
          <>
            <h2 style={{ marginTop: 0 }}>Al-sat ürünler</h2>
            <p className="hint" style={{ marginBottom: 16 }}>
              Tarifi yok — aldığın gibi satarsın. Satmadığını işaretten çıkar.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Satıyorum</th>
                  <th>Ürün</th>
                  <th className="num">Kaç adet aldın</th>
                  <th className="num">Ödediğin ₺</th>
                  <th className="num">Satış ₺</th>
                  <th className="num">Kâr</th>
                </tr>
              </thead>
              <tbody>
                {AL_SAT_KATALOG.map((k) => {
                  const v = alSatVeri[k.id]
                  const birim = v.qty > 0 ? v.total / v.qty : 0
                  return (
                    <tr key={k.id} style={{ opacity: alSat[k.id] ? 1 : 0.45 }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!alSat[k.id]}
                          onChange={(e) => setAlSat({ ...alSat, [k.id]: e.target.checked })}
                          style={{ width: 18, height: 18 }}
                        />
                      </td>
                      <td>
                        {k.icon} <strong>{k.name}</strong>
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          style={{ width: 70 }}
                          disabled={!alSat[k.id]}
                          value={v.qty}
                          onChange={(e) =>
                            setAlSatVeri({
                              ...alSatVeri,
                              [k.id]: { ...v, qty: Number(e.target.value) },
                            })
                          }
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          style={{ width: 90 }}
                          disabled={!alSat[k.id]}
                          value={v.total}
                          onChange={(e) =>
                            setAlSatVeri({
                              ...alSatVeri,
                              [k.id]: { ...v, total: Number(e.target.value) },
                            })
                          }
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          style={{ width: 80 }}
                          disabled={!alSat[k.id]}
                          value={v.price}
                          onChange={(e) =>
                            setAlSatVeri({
                              ...alSatVeri,
                              [k.id]: { ...v, price: Number(e.target.value) },
                            })
                          }
                        />
                      </td>
                      <td className="num">{fmtTL(v.price - birim)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}

        {adim === 4 && (
          <>
            <h2 style={{ marginTop: 0 }}>Aylık sabit giderler</h2>
            <p className="hint" style={{ marginBottom: 16 }}>
              30'a bölünüp her günün kârından düşülür. Gün bu tutarın eksisiyle başlar.
            </p>
            {aylik.map((g, i) => (
              <div className="row" key={i} style={{ marginBottom: 8 }}>
                <input
                  style={{ flex: 1 }}
                  value={g.name}
                  onChange={(e) =>
                    setAylik(aylik.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                />
                <input
                  type="number"
                  style={{ width: 120 }}
                  value={g.amount}
                  onChange={(e) =>
                    setAylik(
                      aylik.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)),
                    )
                  }
                />
                <span className="hint">₺/ay</span>
                <button className="x" onClick={() => setAylik(aylik.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            <button className="btn sm" onClick={() => setAylik([...aylik, { name: '', amount: 0 }])}>
              + Gider ekle
            </button>
            <div className="total" style={{ marginTop: 20 }}>
              <span>Günlük payı</span>
              <span className="v bad">
                −{fmtTL(aylik.reduce((n, g) => n + g.amount, 0) / 30)}
              </span>
            </div>
          </>
        )}

        {adim === 5 && (
          <>
            <h2 style={{ marginTop: 0 }}>Günlük zorunlu giderler</h2>
            <p className="hint" style={{ marginBottom: 16 }}>
              Her gün tekrar eden giderler — eleman yevmiyesi gibi. Her günün kârından aynen
              düşülür, kasadan nakit çıktığı varsayılır.
            </p>
            {gunluk.map((g, i) => (
              <div className="row" key={i} style={{ marginBottom: 8 }}>
                <input
                  style={{ flex: 1 }}
                  value={g.name}
                  onChange={(e) =>
                    setGunluk(gunluk.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                />
                <input
                  type="number"
                  style={{ width: 120 }}
                  value={g.amount}
                  onChange={(e) =>
                    setGunluk(
                      gunluk.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)),
                    )
                  }
                />
                <span className="hint">₺/gün</span>
                <button className="x" onClick={() => setGunluk(gunluk.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            <button
              className="btn sm"
              onClick={() => setGunluk([...gunluk, { name: '', amount: 0 }])}
            >
              + Gider ekle
            </button>

            <div
              className="card"
              style={{ marginTop: 20, background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}
            >
              <strong>Gün kaç ₺ eksiyle başlıyor</strong>
              <div className="total" style={{ marginTop: 10 }}>
                <span className="hint">
                  aylık payı {fmtTL(aylik.reduce((n, g) => n + g.amount, 0) / 30)} + günlük{' '}
                  {fmtTL(gunluk.reduce((n, g) => n + g.amount, 0))}
                </span>
                <span className="v bad">
                  −
                  {fmtTL(
                    aylik.reduce((n, g) => n + g.amount, 0) / 30 +
                      gunluk.reduce((n, g) => n + g.amount, 0),
                  )}
                </span>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                Bunu çıkarmak için günde{' '}
                <strong>
                  {cay.satisFiyati - cayMaliyet > 0
                    ? Math.ceil(
                        (aylik.reduce((n, g) => n + g.amount, 0) / 30 +
                          gunluk.reduce((n, g) => n + g.amount, 0)) /
                          (cay.satisFiyati - cayMaliyet),
                      )
                    : '—'}
                </strong>{' '}
                bardak çay satman gerekiyor.
              </p>
            </div>
          </>
        )}

        <div className="row" style={{ marginTop: 24, justifyContent: 'space-between' }}>
          <button className="btn ghost" disabled={adim === 0} onClick={() => setAdim(adim - 1)}>
            ← Geri
          </button>
          {adim < 5 ? (
            <button
              className="btn primary"
              disabled={adim === 1 && (cay.cayTL <= 0 || cay.demlikBardak <= 0)}
              onClick={() => setAdim(adim + 1)}
            >
              İleri →
            </button>
          ) : (
            <button className="btn primary" onClick={bitir}>
              Kurulumu bitir ✓
            </button>
          )}
        </div>

        {adim === 1 && cay.cayTL <= 0 && (
          <p className="hint" style={{ color: 'var(--bad)', marginTop: 10 }}>
            Çayın alış tutarını girmeden devam edilemez — kâr hesabının temeli bu.
          </p>
        )}
      </div>
    </div>
  )
}

function hesaplaCayMaliyet(c: {
  cayKg: number
  cayTL: number
  sekerAdet: number
  sekerTL: number
  tupKg: number
  tupTL: number
  demlikGram: number
  demlikBardak: number
  demlikGazGram: number
  bardakBasiSeker: number
}): number {
  const cayBirim = c.cayKg > 0 ? c.cayTL / (c.cayKg * 1000) : 0
  const tupBirim = c.tupKg > 0 ? c.tupTL / (c.tupKg * 1000) : 0
  const sekerBirim = c.sekerAdet > 0 ? c.sekerTL / c.sekerAdet : 0
  const bardak = c.demlikBardak > 0 ? c.demlikBardak : 1
  const demlik = c.demlikGram * cayBirim + c.demlikGazGram * tupBirim
  return demlik / bardak + c.bardakBasiSeker * sekerBirim
}
