import { useState } from 'react'
import { useStore } from '../store'
import { fmtTL } from '../lib/units'
import { URUNLER, VARSAYILAN_SECILI, basitUrunleriKur, varsayilanMaliyet } from '../defaults'
import type { Business } from '../types'

const ZORUNLU = 'cay-bardak'
const KATEGORILER = ['Sıcak', 'Soğuk', 'Yiyecek', 'Atıştırmalık']

/**
 * KURULUM — iki adım: işletme adı, sonra sattığın ürünler ve fiyatları.
 *
 * Eskiden tarif (gram), hammadde alışı ve aylık giderler de soruluyordu; çay
 * ocağı sahibi bunları girmiyor, girse de güncellemiyordu. Artık her ürünün
 * yalnız satış fiyatı ve isteğe bağlı tek bir maliyeti var. Giderler sonradan
 * Giderler ekranından eklenir — hazır uydurma kira rakamı yazılmaz.
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

  const [secili, setSecili] = useState<string[]>(VARSAYILAN_SECILI)
  const [fiyat, setFiyat] = useState<Record<string, number>>(
    Object.fromEntries(URUNLER.map((u) => [u.id, u.price])),
  )
  const [maliyet, setMaliyet] = useState<Record<string, number | undefined>>(varsayilanMaliyet)

  function toggle(id: string) {
    if (id === ZORUNLU) return
    setSecili((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  function kur(ids: string[]) {
    finishSetup({ items: basitUrunleriKur(ids, fiyat, maliyet), expenses: [], business: biz })
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px 60px' }}>
      <h1>Kurulum</h1>
      <p className="sub">
        {adim === 0 ? 'Adım 1 / 2 — işletmen' : 'Adım 2 / 2 — sattığın ürünler'}. Her şey sonradan
        değiştirilebilir.
      </p>

      {adim === 0 && (
        <div className="card">
          <div className="field">
            <label htmlFor="k-ad">İşletme adı</label>
            <input id="k-ad" value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="k-sahip">Sahibi</label>
            <input id="k-sahip" value={biz.owner} onChange={(e) => setBiz({ ...biz, owner: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="k-tel">Telefon</label>
            <input
              id="k-tel"
              inputMode="tel"
              value={biz.phone}
              onChange={(e) => setBiz({ ...biz, phone: e.target.value })}
            />
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn primary"
              style={{ flex: '1 1 200px' }}
              disabled={!biz.name.trim()}
              onClick={() => kur(VARSAYILAN_SECILI)}
            >
              Hazır ürünlerle başla
            </button>
            <button
              className="btn"
              style={{ flex: '1 1 200px' }}
              disabled={!biz.name.trim()}
              onClick={() => setAdim(1)}
            >
              Ürünleri kendim seçeyim
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Hazır listede çay, kahve, soda, tost gibi {URUNLER.length} ürün tipik fiyatlarıyla gelir.
          </p>
        </div>
      )}

      {adim === 1 && (
        <>
          <p className="hint" style={{ marginTop: -6 }}>
            Satmadığın ürünün işaretini kaldır. Maliyet boş kalabilir; yazarsan kârın hesaplanır.
          </p>
          {KATEGORILER.map((kat) => (
            <div key={kat}>
              <div className="section-title">{kat}</div>
              <div className="card liste">
                {URUNLER.filter((u) => u.category === kat).map((u) => {
                  const on = secili.includes(u.id)
                  return (
                    <div className="kurulum-satir" key={u.id} style={{ opacity: on ? 1 : 0.5 }}>
                      <label className="ks-ad">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={u.id === ZORUNLU}
                          onChange={() => toggle(u.id)}
                        />
                        {u.name}
                      </label>
                      <label className="ks-kutu">
                        <span>Fiyat</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={fiyat[u.id] ?? ''}
                          disabled={!on}
                          onChange={(e) => setFiyat({ ...fiyat, [u.id]: Number(e.target.value) })}
                        />
                      </label>
                      <label className="ks-kutu">
                        <span>Maliyet</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={maliyet[u.id] ?? ''}
                          placeholder="—"
                          disabled={!on}
                          onChange={(e) =>
                            setMaliyet({
                              ...maliyet,
                              [u.id]: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="kurulum-alt">
            <button className="btn ghost" onClick={() => setAdim(0)}>
              Geri
            </button>
            <button className="btn primary" onClick={() => kur(secili)}>
              {secili.length} ürünle bitir
            </button>
          </div>
          <p className="hint" style={{ textAlign: 'right' }}>
            Örnek: çay {fmtTL(fiyat[ZORUNLU] ?? 0)}, maliyeti{' '}
            {maliyet[ZORUNLU] != null ? fmtTL(maliyet[ZORUNLU]!) : 'girilmedi'}.
          </p>
        </>
      )}
    </div>
  )
}
