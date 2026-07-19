import { useState } from 'react'
import { useStore } from '../store'
import { fmtTL, uid } from '../lib/units'
import { totalVeresiye } from '../lib/report'
import type { Customer } from '../types'

export default function Musteriler() {
  const { s, saveCustomer, collect } = useStore()
  const [yeni, setYeni] = useState('')
  const [kart, setKart] = useState<string | null>(null)

  /** Bir müşterinin hesabına yazılan tutar (parçalı ödemede sadece o parçalar). */
  function borcYazilan(customerId: string): number {
    return s.sales.reduce((n, sale) => {
      const parts = sale.payments ?? [
        { payment: sale.payment, amount: sale.total, customerId: sale.customerId },
      ]
      return (
        n +
        parts
          .filter((p) => p.payment === 'veresiye' && p.customerId === customerId)
          .reduce((m, p) => m + p.amount, 0)
      )
    }, 0)
  }

  function odenen(customerId: string): number {
    return s.payments.filter((p) => p.customerId === customerId).reduce((n, p) => n + p.amount, 0)
  }

  return (
    <>
      <h1>Müşteriler</h1>
      <p className="sub">
        Veresiye kişiye yazılır, masaya değil. Toplam açık hesap: {fmtTL(totalVeresiye(s))}
      </p>

      <div className="row" style={{ marginBottom: 16 }}>
        <input
          placeholder="Yeni müşteri adı"
          value={yeni}
          onChange={(e) => setYeni(e.target.value)}
          style={{ flex: 1, maxWidth: 260 }}
        />
        <button
          className="btn primary"
          disabled={!yeni.trim()}
          onClick={() => {
            saveCustomer({ id: uid(), name: yeni.trim(), balance: 0 })
            setYeni('')
          }}
        >
          + Ekle
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Müşteri</th>
              <th className="num">Toplam yazılan</th>
              <th className="num">Toplam ödenen</th>
              <th className="num">Kalan borç</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {s.customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  {c.phone && <span className="hint"> · {c.phone}</span>}
                </td>
                <td className="num">{fmtTL(borcYazilan(c.id))}</td>
                <td className="num">{fmtTL(odenen(c.id))}</td>
                <td className="num">
                  <span className={c.balance > 0 ? 'v bad' : 'v good'} style={{ fontSize: 14 }}>
                    {fmtTL(c.balance)}
                  </span>
                </td>
                <td className="num">
                  <button className="btn sm" onClick={() => setKart(c.id)}>
                    Kartı aç
                  </button>
                </td>
              </tr>
            ))}
            {s.customers.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">
                  Henüz müşteri yok. Veresiye satışta da yeni müşteri açabilirsin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {kart && (
        <MusteriKarti
          customerId={kart}
          onClose={() => setKart(null)}
          onCollect={(amount, method) => collect(kart, amount, method)}
          onSave={saveCustomer}
        />
      )}
    </>
  )
}

/** Müşteri kartı: girdiler (veresiye satışlar) ve çıktılar (tahsilatlar). */
function MusteriKarti({
  customerId,
  onClose,
  onCollect,
  onSave,
}: {
  customerId: string
  onClose: () => void
  onCollect: (amount: number, method: 'nakit' | 'kart') => void
  onSave: (c: Customer) => void
}) {
  const { s } = useStore()
  const c = s.customers.find((x) => x.id === customerId)!
  const [tutar, setTutar] = useState(c.balance)
  const [yontem, setYontem] = useState<'nakit' | 'kart'>('nakit')
  const [telefon, setTelefon] = useState(c.phone ?? '')

  // Bu müşterinin hesabına yazılan satışlar — parçalı ödemede sadece ona düşen parça.
  const hareketler = [
    ...s.sales.flatMap((sale) => {
      const parts = sale.payments ?? [
        { payment: sale.payment, amount: sale.total, customerId: sale.customerId },
      ]
      const bana = parts.filter((p) => p.payment === 'veresiye' && p.customerId === customerId)
      if (bana.length === 0) return []
      return bana.map((p) => ({
        tip: 'borc' as const,
        date: sale.date,
        tutar: p.amount,
        aciklama: sale.lines.map((l) => `${l.qty}× ${l.name}`).join(', '),
        parcali: !!sale.payments,
      }))
    }),
    ...s.payments
      .filter((p) => p.customerId === customerId)
      .map((p) => ({
        tip: 'odeme' as const,
        date: p.date,
        tutar: p.amount,
        aciklama: `Tahsilat (${p.method})`,
        parcali: false,
      })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <h2>{c.name}</h2>

        <div className="stats" style={{ marginBottom: 16 }}>
          <div className="stat">
            <div className="k">Kalan borç</div>
            <div className={`v ${c.balance > 0 ? 'bad' : 'good'}`}>{fmtTL(c.balance)}</div>
          </div>
          <div className="stat">
            <div className="k">Hareket sayısı</div>
            <div className="v">{hareketler.length}</div>
          </div>
        </div>

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Telefon</label>
            <input
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              onBlur={() => onSave({ ...c, phone: telefon || undefined })}
              placeholder="05xx..."
            />
          </div>
        </div>

        <div className="section-title">Tahsilat al</div>
        <div className="row">
          <input
            type="number"
            style={{ width: 120 }}
            value={tutar}
            onChange={(e) => setTutar(Number(e.target.value))}
          />
          <span className="hint">₺</span>
          <select value={yontem} onChange={(e) => setYontem(e.target.value as 'nakit' | 'kart')}>
            <option value="nakit">Nakit</option>
            <option value="kart">Kart</option>
          </select>
          <button
            className="btn primary"
            disabled={tutar <= 0}
            onClick={() => {
              onCollect(tutar, yontem)
              onClose()
            }}
          >
            Tahsil et
          </button>
        </div>

        <div className="section-title">Hesap hareketleri</div>
        <table className="gtablo">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Açıklama</th>
              <th className="num">Borç</th>
              <th className="num">Ödeme</th>
            </tr>
          </thead>
          <tbody>
            {hareketler.map((h, i) => (
              <tr key={i}>
                <td>{new Date(h.date).toLocaleDateString('tr-TR')}</td>
                <td>
                  <span className="hint">{h.aciklama}</span>
                  {h.parcali && <span className="tag"> bölünmüş hesap</span>}
                </td>
                <td className="num">
                  {h.tip === 'borc' ? (
                    <span className="v bad" style={{ fontSize: 14 }}>
                      +{fmtTL(h.tutar)}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="num">
                  {h.tip === 'odeme' ? (
                    <span className="v good" style={{ fontSize: 14 }}>
                      −{fmtTL(h.tutar)}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {hareketler.length === 0 && (
              <tr>
                <td colSpan={4} className="hint">
                  Bu müşterinin henüz hareketi yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
