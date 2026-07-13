import { useState } from 'react'
import { StoreProvider, useStore } from './store'
import { dayReport } from './lib/report'
import { fmtTL, today } from './lib/units'
import Satis from './screens/Satis'
import Urunler from './screens/Urunler'
import Stok from './screens/Stok'
import Musteriler from './screens/Musteriler'
import Giderler from './screens/Giderler'
import Kasa from './screens/Kasa'
import Rapor from './screens/Rapor'

const SAYFALAR = [
  { id: 'satis', ad: 'Satış', ic: '🧾', el: Satis },
  { id: 'urunler', ad: 'Ürünler & Tarif', ic: '🍵', el: Urunler },
  { id: 'stok', ad: 'Stok & Alış', ic: '📦', el: Stok },
  { id: 'musteriler', ad: 'Veresiye', ic: '📒', el: Musteriler },
  { id: 'giderler', ad: 'Giderler', ic: '💸', el: Giderler },
  { id: 'kasa', ad: 'Kasa', ic: '💵', el: Kasa },
  { id: 'rapor', ad: 'Rapor', ic: '📊', el: Rapor },
]

function Shell() {
  const { s } = useStore()
  const [sayfa, setSayfa] = useState('satis')
  const Ekran = SAYFALAR.find((p) => p.id === sayfa)?.el ?? Satis
  const r = dayReport(s, today())

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          {s.settings.businessName}
          <small>çay ocağı POS</small>
        </div>

        {SAYFALAR.map((p) => (
          <button
            key={p.id}
            className={`nav ${sayfa === p.id ? 'on' : ''}`}
            onClick={() => setSayfa(p.id)}
          >
            <span>{p.ic}</span>
            <span>{p.ad}</span>
          </button>
        ))}

        <div style={{ marginTop: 'auto', padding: '10px 12px', fontSize: 12 }} className="hint">
          Bugün net:{' '}
          <strong className={r.netKar >= 0 ? 'v good' : 'v bad'} style={{ fontSize: 13 }}>
            {fmtTL(r.netKar)}
          </strong>
        </div>
      </aside>

      <main className="main">
        <Ekran />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
