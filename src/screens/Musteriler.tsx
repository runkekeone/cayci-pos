import { useState } from 'react'
import { useStore } from '../store'
import { fmtTL, uid } from '../lib/units'
import { totalVeresiye } from '../lib/report'

export default function Musteriler() {
  const { s, saveCustomer, collect } = useStore()
  const [yeni, setYeni] = useState('')
  const [tahsil, setTahsil] = useState<string | null>(null)

  return (
    <>
      <h1>Veresiye Defteri</h1>
      <p className="sub">Borç kişiye yazılır, masaya değil. Toplam açık: {fmtTL(totalVeresiye(s))}</p>

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
              <th className="num">Borç</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {s.customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                </td>
                <td className="num">
                  <span className={c.balance > 0 ? 'v bad' : 'v good'} style={{ fontSize: 14 }}>
                    {fmtTL(c.balance)}
                  </span>
                </td>
                <td className="num">
                  <button className="btn sm" disabled={c.balance <= 0} onClick={() => setTahsil(c.id)}>
                    Tahsilat
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title">Son tahsilatlar</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Müşteri</th>
              <th>Yöntem</th>
              <th className="num">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {[...s.payments]
              .reverse()
              .slice(0, 10)
              .map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.date).toLocaleDateString('tr-TR')}</td>
                  <td>{s.customers.find((c) => c.id === p.customerId)?.name ?? '—'}</td>
                  <td>
                    <span className="tag">{p.method}</span>
                  </td>
                  <td className="num">{fmtTL(p.amount)}</td>
                </tr>
              ))}
            {s.payments.length === 0 && (
              <tr>
                <td colSpan={4} className="hint">
                  Henüz tahsilat yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {tahsil && (
        <TahsilatModal
          customerId={tahsil}
          onClose={() => setTahsil(null)}
          onSave={(amount, method) => {
            collect(tahsil, amount, method)
            setTahsil(null)
          }}
        />
      )}
    </>
  )
}

function TahsilatModal({
  customerId,
  onClose,
  onSave,
}: {
  customerId: string
  onClose: () => void
  onSave: (amount: number, method: 'nakit' | 'kart') => void
}) {
  const { s } = useStore()
  const c = s.customers.find((x) => x.id === customerId)!
  const [amount, setAmount] = useState(c.balance)
  const [method, setMethod] = useState<'nakit' | 'kart'>('nakit')

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <h2>{c.name} — tahsilat</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Mevcut borç: <strong>{fmtTL(c.balance)}</strong>
        </p>

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Alınan tutar ₺</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ width: 120 }}>
            <label>Yöntem</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as 'nakit' | 'kart')}>
              <option value="nakit">Nakit</option>
              <option value="kart">Kart</option>
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" disabled={amount <= 0} onClick={() => onSave(amount, method)}>
            Tahsil et
          </button>
        </div>
      </div>
    </div>
  )
}
