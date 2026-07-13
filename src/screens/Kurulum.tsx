import { useState } from 'react'
import { useStore } from '../store'
import { unitCost } from '../lib/cost'
import { fmtTL, fmtTLInce, toBase, uid } from '../lib/units'
import {
  HAMMADDELER,
  URUNLER,
  VARSAYILAN_AYLIK_GIDER,
  VARSAYILAN_GUNLUK_GIDER,
  VARSAYILAN_SECILI,
  urunleriKur,
  varsayilanGiderler,
} from '../defaults'
import type { Business, Expense } from '../types'

const ZORUNLU = 'cay-bardak'

/**
 * Kurulum. İki yol var:
 *   1) Önerilen ayarlar — hazır ürünler, hazır tarifler, hazır giderler. Tek tık.
 *   2) Kendim ayarlayayım — ürünleri seç, alış fiyatlarını kendi rakamınla gir.
 * Her iki yolda da her şey sonradan Ürünler/Giderler ekranından düzeltilebilir.
 */
export default function Kurulum({ businessName }: { businessName: string }) {
  const { finishSetup } = useStore()
  const [adim, setAdim] = useState(0)

  const [biz, setBiz] = useState<Business>({
    name: businessName,
    address: '',
    phone: '',
    owner: '',
    openTime: '07:00',
    closeTime: '23:00',
  })

  // Çay zorunlu, hep seçili.
  const [secili, setSecili] = useState<string[]>(VARSAYILAN_SECILI)

  const [hamAlis, setHamAlis] = useState<Record<string, { qty: number; total: number }>>(
    Object.fromEntries(HAMMADDELER.map((h) => [h.id, { qty: h.buyQty, total: h.buyTotal }])),
  )
  const [alsatAlis, setAlsatAlis] = useState<Record<string, { qty: number; total: number }>>(
    Object.fromEntries(
      URUNLER.filter((u) => u.alsat).map((u) => [
        u.id,
        { qty: u.alsat!.buyQty, total: u.alsat!.buyTotal },
      ]),
    ),
  )
  const [fiyat, setFiyat] = useState<Record<string, number>>(
    Object.fromEntries(URUNLER.map((u) => [u.id, u.price])),
  )

  const [aylik, setAylik] = useState(VARSAYILAN_AYLIK_GIDER.map((g) => ({ ...g })))
  const [gunluk, setGunluk] = useState(VARSAYILAN_GUNLUK_GIDER.map((g) => ({ ...g })))

  // Seçilen ürünlerden canlı Item listesi — maliyetleri anında göstermek için.
  const onizleme = urunleriKur(secili, hamAlis, fiyat, alsatAlis)

  function toggle(id: string) {
    if (id === ZORUNLU) return
    setSecili((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  /** Yol 1: hazır her şey. */
  function onerilenIleKur() {
    finishSetup({
      items: urunleriKur(VARSAYILAN_SECILI),
      expenses: varsayilanGiderler(),
      business: biz,
    })
  }

  /** Yol 2: kullanıcının girdiği rakamlarla. */
  function bitir() {
    const expenses: Expense[] = [
      ...aylik
        .filter((g) => g.amount > 0 && g.name.trim())
        .map((g) => ({
          id: uid(),
          date: '',
          name: g.name,
          amount: g.amount,
          kind: 'aylik' as const,
          paidCash: false,
        })),
      ...gunluk
        .filter((g) => g.amount > 0 && g.name.trim())
        .map((g) => ({
          id: uid(),
          date: '',
          name: g.name,
          amount: g.amount,
          kind: 'gunluk-sabit' as const,
          paidCash: true,
        })),
    ]
    finishSetup({ items: onizleme, expenses, business: biz })
  }

  const cayMaliyet = unitCost(ZORUNLU, onizleme)
  const cayFiyat = fiyat[ZORUNLU] ?? 0
  const gunlukEksi = aylik.reduce((n, g) => n + g.amount, 0) / 30 + gunluk.reduce((n, g) => n + g.amount, 0)
  const basaBasBardak = cayFiyat - cayMaliyet > 0 ? Math.ceil(gunlukEksi / (cayFiyat - cayMaliyet)) : 0

  const adimlar = ['İşletme', 'Ürünler & tarifler', 'Giderler']

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px 60px' }}>
      <h1>Kurulum</h1>
      <p className="sub">Bu adımlar bitmeden satış yapılamaz. Her şey sonradan değiştirilebilir.</p>

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

            <div
              className="card"
              style={{ marginTop: 20, background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}
            >
              <strong>Hızlı kurulum</strong>
              <p className="hint" style={{ margin: '6px 0 12px', color: 'var(--ink)' }}>
                Hazır tarifler, ürünler ve tipik kıraathane giderleriyle kurar. Uğraşmadan başlar,
                rakamları sonra kendi alışlarına göre düzeltirsin.
              </p>
              <button className="btn primary" disabled={!biz.name.trim()} onClick={onerilenIleKur}>
                ⚡ Önerilen ayarlarla kur
              </button>
            </div>
          </>
        )}

        {adim === 1 && (
          <>
            <h2 style={{ marginTop: 0 }}>Ürünler ve tarifler</h2>
            <p className="hint" style={{ marginBottom: 16 }}>
              Tarifler hazır geliyor. Satmadığın ürünü işaretten çıkar — ürün kartına hiç eklenmez.
              Alış rakamlarını kendi faturana göre düzelt; maliyetler anında güncellenir.
            </p>

            <div className="section-title">Sattığın ürünler</div>
            <div className="tiles" style={{ marginBottom: 20 }}>
              {URUNLER.map((u) => {
                const on = secili.includes(u.id)
                const zorunlu = u.id === ZORUNLU
                const m = on ? unitCost(u.id, onizleme) : 0
                return (
                  <button
                    key={u.id}
                    className="tile"
                    onClick={() => toggle(u.id)}
                    style={{
                      opacity: on ? 1 : 0.45,
                      borderColor: on ? 'var(--accent)' : undefined,
                      cursor: zorunlu ? 'default' : 'pointer',
                    }}
                  >
                    <span className="ic">{u.icon}</span>
                    <span className="nm">{u.name}</span>
                    {on ? (
                      <span className="st">maliyet {fmtTLInce(m)}</span>
                    ) : (
                      <span className="st">satmıyorum</span>
                    )}
                    {zorunlu && <span className="tag warn">zorunlu</span>}
                  </button>
                )
              })}
            </div>

            <div className="section-title">Alış fiyatların (hammadde)</div>
            <table style={{ marginBottom: 20 }}>
              <thead>
                <tr>
                  <th>Hammadde</th>
                  <th className="num">Ne kadar aldın</th>
                  <th className="num">Kaç ₺ ödedin</th>
                  <th className="num">Birim maliyet</th>
                </tr>
              </thead>
              <tbody>
                {HAMMADDELER.filter((h) =>
                  onizleme.some((i) => i.id === h.id),
                ).map((h) => {
                  const v = hamAlis[h.id]
                  const base = toBase(v.qty, h.buyUnit)
                  return (
                    <tr key={h.id}>
                      <td>
                        {h.icon} <strong>{h.name}</strong>
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          style={{ width: 80 }}
                          value={v.qty}
                          onChange={(e) =>
                            setHamAlis({
                              ...hamAlis,
                              [h.id]: { ...v, qty: Number(e.target.value) },
                            })
                          }
                        />{' '}
                        <span className="hint">{h.buyUnit}</span>
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          style={{ width: 100 }}
                          value={v.total}
                          onChange={(e) =>
                            setHamAlis({
                              ...hamAlis,
                              [h.id]: { ...v, total: Number(e.target.value) },
                            })
                          }
                        />
                      </td>
                      <td className="num">
                        {fmtTLInce(base > 0 ? v.total / base : 0)} / {h.unit}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="section-title">Satış fiyatların</div>
            <table>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th className="num">Al-sat alışı</th>
                  <th className="num">Maliyet</th>
                  <th className="num">Satış ₺</th>
                  <th className="num">Kâr</th>
                </tr>
              </thead>
              <tbody>
                {URUNLER.filter((u) => secili.includes(u.id)).map((u) => {
                  const m = unitCost(u.id, onizleme)
                  const av = alsatAlis[u.id]
                  return (
                    <tr key={u.id}>
                      <td>
                        {u.icon} <strong>{u.name}</strong>
                      </td>
                      <td className="num">
                        {u.alsat ? (
                          <>
                            <input
                              type="number"
                              style={{ width: 60 }}
                              value={av.qty}
                              onChange={(e) =>
                                setAlsatAlis({
                                  ...alsatAlis,
                                  [u.id]: { ...av, qty: Number(e.target.value) },
                                })
                              }
                            />{' '}
                            <span className="hint">adet /</span>{' '}
                            <input
                              type="number"
                              style={{ width: 80 }}
                              value={av.total}
                              onChange={(e) =>
                                setAlsatAlis({
                                  ...alsatAlis,
                                  [u.id]: { ...av, total: Number(e.target.value) },
                                })
                              }
                            />{' '}
                            <span className="hint">₺</span>
                          </>
                        ) : (
                          <span className="tag">tarifli</span>
                        )}
                      </td>
                      <td className="num">{fmtTLInce(m)}</td>
                      <td className="num">
                        <input
                          type="number"
                          style={{ width: 80 }}
                          value={fiyat[u.id]}
                          onChange={(e) => setFiyat({ ...fiyat, [u.id]: Number(e.target.value) })}
                        />
                      </td>
                      <td className="num">
                        <span className={fiyat[u.id] - m >= 0 ? 'v good' : 'v bad'} style={{ fontSize: 14 }}>
                          {fmtTL(fiyat[u.id] - m)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}

        {adim === 2 && (
          <>
            <h2 style={{ marginTop: 0 }}>Giderler</h2>

            <div className="section-title">Aylık sabit giderler (30'a bölünür)</div>
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
              + Ekle
            </button>

            <div className="section-title">Her gün tekrar eden giderler</div>
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
              + Ekle
            </button>

            <div
              className="card"
              style={{ marginTop: 20, background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}
            >
              <div className="total" style={{ marginBottom: 8 }}>
                <span>Gün kaç ₺ eksiyle başlıyor</span>
                <span className="v bad">−{fmtTL(gunlukEksi)}</span>
              </div>
              <p className="hint" style={{ color: 'var(--ink)' }}>
                Bir bardak çayın maliyeti <strong>{fmtTLInce(cayMaliyet)}</strong>, kârı{' '}
                <strong>{fmtTL(cayFiyat - cayMaliyet)}</strong>. Başa baş için günde{' '}
                <strong>{basaBasBardak || '—'}</strong> bardak çay satman gerekiyor.
              </p>
            </div>
          </>
        )}

        <div className="row" style={{ marginTop: 24, justifyContent: 'space-between' }}>
          <button className="btn ghost" disabled={adim === 0} onClick={() => setAdim(adim - 1)}>
            ← Geri
          </button>
          {adim < 2 ? (
            <button
              className="btn primary"
              disabled={adim === 0 && !biz.name.trim()}
              onClick={() => setAdim(adim + 1)}
            >
              {adim === 0 ? 'Kendim ayarlayayım →' : 'İleri →'}
            </button>
          ) : (
            <button className="btn primary" onClick={bitir}>
              Kurulumu bitir ✓
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
