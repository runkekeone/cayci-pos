import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { dayOf, fmtTL } from '../lib/units'
import { INDIRIM_ID } from '../lib/report'
import { Ikon } from '../lib/Ikon'
import { FisModal, OnayModal, SatisIncele } from './Satis'
import type { Sale } from '../types'

const ODEME_AD: Record<string, string> = { nakit: 'Nakit', kart: 'Kart', veresiye: 'Veresiye' }

/**
 * Seçilen günün satışları — hizalı satırlar: saat · içerik · ödeme · tutar.
 * Satıra dokununca incele/düzenle/iptal; fiş düğmesi ayrı.
 * (Eskiden Satış ekranının altındaydı; satış yaparken kalabalık ediyordu.)
 */
export default function GunSatislari({ gun }: { gun: string }) {
  const { s, editSale, cancelSale, restoreSale } = useStore()
  const [incele, setIncele] = useState<Sale | null>(null)
  const [iptalSale, setIptalSale] = useState<Sale | null>(null)
  const [undo, setUndo] = useState<Sale | null>(null)
  const [fisSale, setFisSale] = useState<Sale | null>(null)
  const [hepsi, setHepsi] = useState(false)

  // Geri alma balonu 6 sn açık kalır.
  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(t)
  }, [undo])

  const satislar = s.sales.filter((x) => (x.bizDay ?? dayOf(x.date)) === gun).reverse()
  const gorunen = hepsi ? satislar : satislar.slice(0, 8)

  function iptalEt(sale: Sale) {
    cancelSale(sale.id)
    setUndo(sale)
  }

  return (
    <>
      <div className="ana-bolum-bas">
        <h2>Satışlar</h2>
        <span className="ana-bolum-ek">{satislar.length} satış</span>
      </div>
      {satislar.length === 0 ? (
        <div className="adisyon-bos">
          <Ikon ad="fis" boy={22} />
          <span>Bu gün satış yok.</span>
        </div>
      ) : (
        <div className="adisyon-satirlar">
          {gorunen.map((sale) => {
            const saat = new Date(sale.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            const icerik = sale.lines
              .filter((l) => l.itemId !== INDIRIM_ID)
              .map((l) => `${l.qty} ${l.name}`)
              .join(', ')
            const odemeler = sale.payments ?? [{ payment: sale.payment, amount: sale.total }]
            const odeme = odemeler.length > 1 ? 'Parçalı' : ODEME_AD[odemeler[0].payment]
            const veresiye = odemeler.some((p) => p.payment === 'veresiye')
            return (
              <div className="satis-satir" key={sale.id}>
                <button className="ss-ana" onClick={() => setIncele(sale)}>
                  <span className="ss-saat">{saat}</span>
                  <span className="as-ad">
                    <b>{sale.tableName ?? 'Tezgâh'}</b>
                    <small>{icerik}</small>
                  </span>
                  <span className={`ss-odeme ${veresiye ? 'veresiye' : ''}`}>{odeme}</span>
                  <span className="as-tutar">{fmtTL(sale.total)}</span>
                </button>
                <button className="satir-duzenle" onClick={() => setFisSale(sale)} aria-label="Fiş">
                  <Ikon ad="fis" boy={18} />
                </button>
              </div>
            )
          })}
          {satislar.length > 8 && (
            <button className="ss-hepsi" onClick={() => setHepsi((v) => !v)}>
              {hepsi ? 'Daha az göster' : `Hepsini göster (${satislar.length})`}
            </button>
          )}
        </div>
      )}

      {incele && (
        <SatisIncele
          sale={incele}
          onClose={() => setIncele(null)}
          onSave={(yeni) => {
            editSale(incele.id, yeni)
            setIncele(null)
          }}
          onIptal={() => {
            setIptalSale(incele)
            setIncele(null)
          }}
        />
      )}

      {iptalSale && (
        <OnayModal
          baslik="Satışı iptal et"
          mesaj={`${fmtTL(iptalSale.total)} tutarındaki satış iptal edilecek. Stok geri yüklenecek, veresiyeyse borç silinecek.`}
          onayYazi="İptal et"
          onClose={() => setIptalSale(null)}
          onOk={() => {
            iptalEt(iptalSale)
            setIptalSale(null)
          }}
        />
      )}

      {undo && (
        <div className="onay koyu" role="status">
          Satış iptal edildi ·{' '}
          <button
            className="btn sm"
            style={{ marginLeft: 6 }}
            onClick={() => {
              restoreSale(undo)
              setUndo(null)
            }}
          >
            <Ikon ad="geri" boy={16} />
            Geri al
          </button>
        </div>
      )}

      {fisSale && <FisModal sale={fisSale} business={s.business} onClose={() => setFisSale(null)} />}
    </>
  )
}
