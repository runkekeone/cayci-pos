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

/**
 * ana: telefonda alt çubukta doğrudan görünür (5 tane — parmakla rahat).
 * Gerisi "Daha" panelinde. Masaüstünde hepsi yan menüde.
 */
const SAYFALAR = [
  { id: 'satis', ad: 'Satış', kisa: 'Satış', ic: '🧾', el: Satis, ana: true },
  { id: 'rapor', ad: 'Rapor', kisa: 'Rapor', ic: '📊', el: Rapor, ana: true },
  { id: 'urunler', ad: 'Ürünler & Tarif', kisa: 'Ürünler', ic: '🍵', el: Urunler, ana: true },
  { id: 'stok', ad: 'Stok & Alış', kisa: 'Stok', ic: '📦', el: Stok, ana: true },
  { id: 'musteriler', ad: 'Müşteriler', kisa: 'Müşteri', ic: '📒', el: Musteriler, ana: true },
  { id: 'giderler', ad: 'Giderler', kisa: 'Giderler', ic: '💸', el: Giderler, ana: false },
  { id: 'kasa', ad: 'Kasa', kisa: 'Kasa', ic: '💵', el: Kasa, ana: false },
  { id: 'takvim', ad: 'Takvim', kisa: 'Takvim', ic: '📅', el: Takvim, ana: false },
]

/** Giriş yapılmış kullanıcının verisiyle çalışan asıl uygulama. */
function Shell({ user, onOut }: { user: User; onOut: () => void }) {
  const { s } = useStore()
  const [sayfa, setSayfa] = useState('satis')
  const [daha, setDaha] = useState(false)

  // Kurulum bitmeden uygulamaya girilemez.
  if (!s.setupDone) return <Kurulum businessName={user.businessName} />

  const Ekran = SAYFALAR.find((p) => p.id === sayfa)?.el ?? Satis
  const r = dayReport(s, today())
  const gizliAktif = SAYFALAR.some((p) => !p.ana && p.id === sayfa)

  function git(id: string) {
    setSayfa(id)
    setDaha(false)
  }

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
            // ana olmayan sayfalar telefonda çubukta değil, "Daha" panelinde
            className={`nav ${sayfa === p.id ? 'on' : ''} ${p.ana ? '' : 'nav-gizli'}`}
            onClick={() => git(p.id)}
          >
            <span>{p.ic}</span>
            <span className="nav-ad">{p.ad}</span>
            <span className="nav-kisa">{p.kisa}</span>
          </button>
        ))}

        {/* telefonda: kalan sayfalar + yedek + çıkış */}
        <button
          className={`nav only-mobile ${gizliAktif ? 'on' : ''}`}
          onClick={() => setDaha(true)}
        >
          <span>⋯</span>
          <span className="nav-kisa">Daha</span>
        </button>

        <div className="side-alt">
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

      {daha && (
        <div className="modal-bg only-mobile" onClick={() => setDaha(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{s.business.name || user.businessName}</h2>

            {SAYFALAR.filter((p) => !p.ana).map((p) => (
              <button
                key={p.id}
                className={`nav ${sayfa === p.id ? 'on' : ''}`}
                onClick={() => git(p.id)}
              >
                <span>{p.ic}</span>
                <span>{p.ad}</span>
              </button>
            ))}

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <div className="hint" style={{ padding: '0 12px 8px' }}>
                Bugün net:{' '}
                <strong className={r.netKar >= 0 ? 'v good' : 'v bad'} style={{ fontSize: 13 }}>
                  {fmtTL(r.netKar)}
                </strong>
              </div>
              <Yedek />
              <button className="nav" onClick={onOut}>
                <span>🚪</span>
                <span>Çıkış ({user.username})</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
