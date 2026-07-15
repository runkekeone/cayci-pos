import { useState, type ComponentType } from 'react'
import { StoreProvider, useStore, aktifOturum } from './store'
import { currentUser, logout, type User } from './auth'
import { dayReport } from './lib/report'
import { fmtTL } from './lib/units'
import Giris from './screens/Giris'
import Kurulum from './screens/Kurulum'
import GunBaslat from './screens/GunBaslat'
import GunSonu from './screens/GunSonu'
import Satis from './screens/Satis'
import Urunler from './screens/Urunler'
import Stok from './screens/Stok'
import Musteriler from './screens/Musteriler'
import Giderler from './screens/Giderler'
import Kasa from './screens/Kasa'
import Rapor from './screens/Rapor'
import Takvim from './screens/Takvim'
import Profil from './screens/Profil'

/** id → ekran bileşeni. */
const EKRANLAR: Record<string, ComponentType> = {
  satis: Satis,
  rapor: Rapor,
  urunler: Urunler,
  stok: Stok,
  musteriler: Musteriler,
  giderler: Giderler,
  kasa: Kasa,
  takvim: Takvim,
}

type MenuLeaf = { id: string; ad: string; kisa: string; ic: string }
type MenuItem = MenuLeaf & { ana?: boolean; alt?: MenuLeaf[] }

/**
 * Sol menü. `ana` olanlar telefonda alt çubukta çıkar; gerisi "Daha" panelinde.
 * `alt` olan bir grup (Raporlar) masaüstünde açılıp alt başlıklarını gösterir.
 */
const MENU: MenuItem[] = [
  { id: 'satis', ad: 'Satış', kisa: 'Satış', ic: '🧾', ana: true },
  {
    id: 'rapor',
    ad: 'Raporlar',
    kisa: 'Rapor',
    ic: '📊',
    ana: true,
    alt: [
      { id: 'rapor', ad: 'Genel Bakış', kisa: 'Rapor', ic: '📈' },
      { id: 'kasa', ad: 'Kasa', kisa: 'Kasa', ic: '💵' },
      { id: 'takvim', ad: 'Takvim', kisa: 'Takvim', ic: '🗓️' },
    ],
  },
  { id: 'urunler', ad: 'Ürünler', kisa: 'Ürünler', ic: '🍵', ana: true },
  { id: 'stok', ad: 'Stok', kisa: 'Stok', ic: '📦', ana: true },
  { id: 'musteriler', ad: 'Müşteriler', kisa: 'Müşteri', ic: '👥', ana: true },
  { id: 'giderler', ad: 'Giderler', kisa: 'Giderler', ic: '💸', ana: false },
]

/** "Daha" panelinde (telefon) gösterilecek — çubuğa girmeyen tüm başlıklar. */
const DAHA: MenuLeaf[] = [
  { id: 'giderler', ad: 'Giderler', kisa: 'Giderler', ic: '💸' },
  { id: 'kasa', ad: 'Kasa', kisa: 'Kasa', ic: '💵' },
  { id: 'takvim', ad: 'Takvim', kisa: 'Takvim', ic: '🗓️' },
]

/** Giriş yapılmış kullanıcının verisiyle çalışan asıl uygulama. */
function Shell({ user, onOut }: { user: User; onOut: () => void }) {
  const { s, startDay } = useStore()
  const [sayfa, setSayfa] = useState('satis')
  const [daha, setDaha] = useState(false)
  const [gunSonu, setGunSonu] = useState(false)
  const [acikGruplar, setAcikGruplar] = useState<string[]>(['rapor'])

  // Kurulum bitmeden uygulamaya girilemez.
  if (!s.setupDone) return <Kurulum businessName={user.businessName} />

  // Gün başlatılmadan uygulamaya girilemez (tam kapı).
  const aktif = aktifOturum(s)
  if (!aktif)
    return (
      <GunBaslat
        isletme={s.business.name || user.businessName}
        onBaslat={(nakit) => startDay(nakit)}
      />
    )

  const Ekran = EKRANLAR[sayfa] ?? Satis
  const r = dayReport(s, aktif.date)
  const gizliAktif = DAHA.some((p) => p.id === sayfa)

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

        {MENU.map((p) => {
          // Grup değilse: düz menü satırı.
          if (!p.alt) {
            return (
              <button
                key={p.id}
                className={`nav ${sayfa === p.id ? 'on' : ''} ${p.ana ? '' : 'nav-gizli'}`}
                onClick={() => git(p.id)}
              >
                <span>{p.ic}</span>
                <span className="nav-ad">{p.ad}</span>
                <span className="nav-kisa">{p.kisa}</span>
              </button>
            )
          }
          // Grup: masaüstünde açılır alt başlıklar; telefonda çubukta ilk alta gider.
          const acik = acikGruplar.includes(p.id)
          const cocukAktif = p.alt.some((a) => a.id === sayfa)
          return (
            <div key={p.id} className="nav-grup">
              <button
                className={`nav ${cocukAktif ? 'on' : ''}`}
                onClick={() => {
                  git(p.alt![0].id)
                  setAcikGruplar((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))
                }}
              >
                <span>{p.ic}</span>
                <span className="nav-ad">{p.ad}</span>
                <span className="nav-kisa">{p.kisa}</span>
                <span className="nav-caret nav-ad">{acik ? '▾' : '▸'}</span>
              </button>
              {acik &&
                p.alt.map((a) => (
                  <button
                    key={a.id}
                    className={`nav nav-alt nav-gizli ${sayfa === a.id ? 'on' : ''}`}
                    onClick={() => git(a.id)}
                  >
                    <span>{a.ic}</span>
                    <span className="nav-ad">{a.ad}</span>
                  </button>
                ))}
            </div>
          )
        })}

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
          <button className="nav" onClick={() => setGunSonu(true)}>
            <span>🌙</span>
            <span>Gün Sonu</span>
          </button>
          <button
            className={`nav ${sayfa === 'profil' ? 'on' : ''}`}
            onClick={() => git('profil')}
          >
            <span>👤</span>
            <span>
              Profil <span className="hint">({user.username})</span>
            </span>
          </button>
        </div>
      </aside>

      {daha && (
        <div className="modal-bg only-mobile" onClick={() => setDaha(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{s.business.name || user.businessName}</h2>

            {DAHA.map((p) => (
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
              <button
                className="nav"
                onClick={() => {
                  setGunSonu(true)
                  setDaha(false)
                }}
              >
                <span>🌙</span>
                <span>Gün Sonu</span>
              </button>
              <button
                className={`nav ${sayfa === 'profil' ? 'on' : ''}`}
                onClick={() => git('profil')}
              >
                <span>👤</span>
                <span>Profil ({user.username})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="main">
        {sayfa === 'profil' ? <Profil user={user} onOut={onOut} /> : <Ekran />}
      </main>

      {gunSonu && <GunSonu gun={aktif.date} onKapat={() => setGunSonu(false)} />}
    </div>
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
