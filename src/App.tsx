import { useState } from 'react'
import { StoreProvider, useStore } from './store'
import { currentUser, logout, type User } from './auth'
import { dayReport } from './lib/report'
import { fmtTL, today } from './lib/units'
import Giris from './screens/Giris'
import Kurulum from './screens/Kurulum'
import Satis from './screens/Satis'
import Urunler from './screens/Urunler'
import Stok from './screens/Stok'
import Musteriler from './screens/Musteriler'
import Giderler from './screens/Giderler'
import Kasa from './screens/Kasa'
import Rapor from './screens/Rapor'
import Takvim from './screens/Takvim'

const SAYFALAR = [
  { id: 'satis', ad: 'Satış', ic: '🧾', el: Satis },
  { id: 'rapor', ad: 'Rapor', ic: '📊', el: Rapor },
  { id: 'urunler', ad: 'Ürünler & Tarif', ic: '🍵', el: Urunler },
  { id: 'stok', ad: 'Stok & Alış', ic: '📦', el: Stok },
  { id: 'musteriler', ad: 'Müşteriler', ic: '📒', el: Musteriler },
  { id: 'giderler', ad: 'Giderler', ic: '💸', el: Giderler },
  { id: 'kasa', ad: 'Kasa', ic: '💵', el: Kasa },
  { id: 'takvim', ad: 'Takvim', ic: '📅', el: Takvim },
]

/** Giriş yapılmış kullanıcının verisiyle çalışan asıl uygulama. */
function Shell({ user, onOut }: { user: User; onOut: () => void }) {
  const { s } = useStore()
  const [sayfa, setSayfa] = useState('satis')

  // Kurulum bitmeden uygulamaya girilemez.
  if (!s.setupDone) return <Kurulum businessName={user.businessName} />

  const Ekran = SAYFALAR.find((p) => p.id === sayfa)?.el ?? Satis
  const r = dayReport(s, today())

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          {s.business.name || user.businessName}
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

        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div className="hint" style={{ padding: '8px 12px' }}>
            Bugün net:{' '}
            <strong className={r.netKar >= 0 ? 'v good' : 'v bad'} style={{ fontSize: 13 }}>
              {fmtTL(r.netKar)}
            </strong>
          </div>
          <Yedek />
          <button className="nav" onClick={onOut}>
            <span>🚪</span>
            <span>
              Çıkış <span className="hint">({user.username})</span>
            </span>
          </button>
        </div>
      </aside>

      <main className="main">
        <Ekran />
      </main>
    </div>
  )
}

/**
 * Veri yedeği. Tarayıcı temizlenirse her şey gider — dosyaya al, gerektiğinde geri yükle.
 * Sunucu gelene kadar tek koruma bu.
 */
function Yedek() {
  const { s, set } = useStore()

  function yedekAl() {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cayci-yedek-${today()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function geriYukle(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const veri = JSON.parse(String(reader.result))
        if (!veri.items || !veri.sales) throw new Error('geçersiz')
        if (
          confirm('Yedekteki veri şu anki verinin ÜZERİNE yazılacak. Devam edilsin mi?')
        ) {
          set(() => veri)
        }
      } catch {
        alert('Dosya okunamadı — geçerli bir yedek dosyası değil.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <>
      <button className="nav" onClick={yedekAl}>
        <span>💾</span>
        <span>Yedek al</span>
      </button>
      <label className="nav" style={{ cursor: 'pointer' }}>
        <span>📂</span>
        <span>Geri yükle</span>
        <input
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) geriYukle(f)
            e.target.value = ''
          }}
        />
      </label>
    </>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => currentUser())

  if (!user) return <Giris onIn={setUser} />

  return (
    <StoreProvider userId={user.id} key={user.id}>
      <Shell
        user={user}
        onOut={() => {
          logout()
          setUser(null)
        }}
      />
    </StoreProvider>
  )
}
