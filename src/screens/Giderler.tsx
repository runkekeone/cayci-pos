import { useState } from 'react'
import { useStore } from '../store'
import { dailyFixedShare } from '../lib/report'
import { fmtTL, today, uid } from '../lib/units'
import type { Expense } from '../types'

export default function Giderler() {
  const { s, saveExpense, deleteExpense } = useStore()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(0)
  const [kind, setKind] = useState<Expense['kind']>('gunluk')
  const [paidCash, setPaidCash] = useState(true)

  const aylik = s.expenses.filter((e) => e.kind === 'aylik')
  const gunlukSabit = s.expenses.filter((e) => e.kind === 'gunluk-sabit')
  const gunluk = s.expenses.filter((e) => e.kind === 'gunluk')
  const aylikToplam = aylik.reduce((n, e) => n + e.amount, 0)
  const gunlukSabitToplam = gunlukSabit.reduce((n, e) => n + e.amount, 0)

  function ekle() {
    const e: Expense = {
      id: uid(),
      date: kind === 'gunluk' ? today() : '',
      name: name.trim(),
      amount,
      kind,
      // Yevmiye gibi her gün tekrar eden giderler nakit çıkar sayılır.
      paidCash: kind === 'gunluk' ? paidCash : kind === 'gunluk-sabit',
    }
    saveExpense(e)
    setName('')
    setAmount(0)
  }

  return (
    <>
      <h1>Giderler</h1>
      <p className="sub">
        Aylık sabit giderler 30'a bölünüp her günün kârından düşülür. Günlük gider o gün elden
        çıkan paradır.
      </p>

      <div className="stats">
        <div className="stat">
          <div className="k">Aylık sabit gider</div>
          <div className="v">{fmtTL(aylikToplam)}</div>
        </div>
        <div className="stat">
          <div className="k">Aylığın günlük payı</div>
          <div className="v bad">−{fmtTL(dailyFixedShare(s))}</div>
        </div>
        <div className="stat">
          <div className="k">Günlük zorunlu gider</div>
          <div className="v bad">−{fmtTL(gunlukSabitToplam)}</div>
        </div>
        <div className="stat" style={{ borderColor: 'var(--bad)' }}>
          <div className="k">Gün kaç ₺ eksiyle başlıyor</div>
          <div className="v bad">−{fmtTL(dailyFixedShare(s) + gunlukSabitToplam)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Gider adı</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kira, temizlik, çırak harçlığı..."
            />
          </div>
          <div className="field" style={{ width: 130 }}>
            <label>Tutar ₺</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ width: 180 }}>
            <label>Tür</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as Expense['kind'])}>
              <option value="gunluk">Bugüne özel</option>
              <option value="gunluk-sabit">Her gün (yevmiye gibi)</option>
              <option value="aylik">Aylık sabit</option>
            </select>
          </div>
          {kind === 'gunluk' && (
            <div className="field" style={{ width: 130 }}>
              <label>Ödeme</label>
              <select
                value={paidCash ? 'nakit' : 'diger'}
                onChange={(e) => setPaidCash(e.target.value === 'nakit')}
              >
                <option value="nakit">Kasadan nakit</option>
                <option value="diger">Kart / havale</option>
              </select>
            </div>
          )}
          <button
            className="btn primary"
            disabled={!name.trim() || amount <= 0}
            onClick={ekle}
            style={{ marginBottom: 12 }}
          >
            + Ekle
          </button>
        </div>
      </div>

      <div className="section-title">Aylık sabit giderler</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Gider</th>
              <th className="num">Aylık</th>
              <th className="num">Günlük payı</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {aylik.map((e) => (
              <tr key={e.id}>
                <td>
                  <strong>{e.name}</strong>
                </td>
                <td className="num">{fmtTL(e.amount)}</td>
                <td className="num">{fmtTL(e.amount / 30)}</td>
                <td className="num">
                  <button className="btn sm" onClick={() => deleteExpense(e.id)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title">Her gün tekrar eden giderler</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Gider</th>
              <th className="num">Günlük</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {gunlukSabit.map((e) => (
              <tr key={e.id}>
                <td>
                  <strong>{e.name}</strong>
                </td>
                <td className="num">{fmtTL(e.amount)}</td>
                <td className="num">
                  <button className="btn sm" onClick={() => deleteExpense(e.id)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
            {gunlukSabit.length === 0 && (
              <tr>
                <td colSpan={3} className="hint">
                  Yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="section-title">Bugüne özel giderler</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Gider</th>
              <th>Ödeme</th>
              <th className="num">Tutar</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...gunluk].reverse().map((e) => (
              <tr key={e.id}>
                <td>{e.date}</td>
                <td>
                  <strong>{e.name}</strong>
                </td>
                <td>
                  <span className="tag">{e.paidCash ? 'nakit' : 'kart/havale'}</span>
                </td>
                <td className="num">{fmtTL(e.amount)}</td>
                <td className="num">
                  <button className="btn sm" onClick={() => deleteExpense(e.id)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
            {gunluk.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">
                  Bugün gider girilmedi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
