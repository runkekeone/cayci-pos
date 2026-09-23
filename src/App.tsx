import { useEffect, useState, type ComponentType } from 'react'
import { StoreProvider, useStore } from './store'
import { currentUser, logout, syncUsers, type User } from './auth'
import { cloudPing } from './lib/cloud'
import { dayReport } from './lib/report'
import { useTema } from './lib/tema'
import { fmtTL, today } from './lib/units'
import Giris from './screens/Giris'
import Kurulum from './screens/Kurulum'
import Satis from './screens/Satis'
import Urunler from './screens/Urunler'
import Stok from './screens/Stok'
import Musteriler from './screens/Musteriler'
import Giderler from './screens/Giderler'
import Rapor from './screens/Rapor'
import Profil from './screens/Profil'
import Siparis from './screens/Siparis'
import Anasayfa from './screens/Anasayfa'
import Masalar from './screens/Masalar'
import { Ikon, type IkonAd } from './lib/Ikon'

/** id → ekran bileşeni. */
const EKRANLAR: Record<string, ComponentType> = {
  anasayfa: Anasayfa,
  masalar: Masalar,
  satis: Satis,
  rapor: Rapor,
  urunler: Urunler,
  stok: Stok,
  musteriler: Musteriler,
  giderler: Giderler,
  siparis: Siparis,
}

type Sayfa = { id: string; ad: string; ic: IkonAd }

/** Masaüstünde solda hepsi durur. */
const MENU: Sayfa[] = [
  { id: 'anasayfa', ad: 'Ana', ic: 'ev' },
  { id: 'masalar', ad: 'Masalar', ic: 'izgara' },
  { id: 'satis', ad: 'Satış', ic: 'fis' },
  { id: 'rapor', ad: 'Rapor', ic: 'grafik' },
  { id: 'musteriler', ad: 'Veresiye', ic: 'defter' },
  { id: 'siparis', ad: 'Sipariş', ic: 'kamyon' },
  { id: 'urunler', ad: 'Ürünler', ic: 'dukkan' },
  { id: 'stok', ad: 'Stok', ic: 'kutu' },
  { id: 'giderler', ad: 'Giderler', ic: 'para' },
  { id: 'profil', ad: 'Ayarlar', ic: 'ayar' },
]

/** Telefonda alt çubukta görünenler; gerisi "Daha" sayfasında. */
const ALT_CUBUK = ['anasayfa', 'masalar', 'satis', 'rapor']

/** Giriş yapılmış kullanıcının verisiyle çalışan asıl uygulama. */
function Shell({ user, onOut }: { user: User; onOut: () => void }) {
  const { s } = useStore()
  const [sayfa, setSayfa] = useState('anasayfa')
  const [daha, setDaha] = useState(false)

  // Ekran dışı yerlerden (ana ekran kısayolları, masalar) sayfa değiştirmek için.
  useEffect(() => {
    const f = (e: Event) => {
      setSayfa((e as CustomEvent<string>).detail)
      setDaha(false)
      window.scrollTo(0, 0)
    }
    window.addEventListener('cayci-git', f)
    return () => window.removeEventListener('cayci-git', f)
  }, [])

  // Tema/yazı boyutu <html> niteliklerine yazılır — erken çıkıştan ÖNCE,
  // yoksa Kurulum ekranı temasız kalırdı.
  useTema(s.settings)

  // Kurulum bitmeden uygulamaya girilemez.
  if (!s.setupDone) return <Kurulum businessName={user.businessName} />

  // İş günü kendiliğinden döner (bkz. today()); "Günü başlat" kapısı yok.
  const Ekran = EKRANLAR[sayfa] ?? Satis
  const r = dayReport(s, today())
  const doluMasa = s.tables.filter((t) => t.lines.length > 0).length

  function git(id: string) {
    setSayfa(id)
    setDaha(false)
    window.scrollTo(0, 0)
  }

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <span className="brand-ust">
            {s.business.logo && <img className="brand-logo" src={s.business.logo} alt="" />}
            {s.business.name || user.businessName}
          </span>
          <small>çay ocağı POS</small>
        </div>

        {MENU.map((p) => (
          <button
            key={p.id}
            className={`nav ${sayfa === p.id && !daha ? 'on' : ''} ${ALT_CUBUK.includes(p.id) ? '' : 'nav-gizli'}`}
            onClick={() => git(p.id)}
          >
            <span className="nav-ic">
              <Ikon ad={p.ic} boy={22} />
              {p.id === 'masalar' && doluMasa > 0 && <span className="nav-rozet">{doluMasa}</span>}
            </span>
            <span className="nav-ad">{p.ad}</span>
          </button>
        ))}

        <button
          className={`nav only-mobile ${daha || !ALT_CUBUK.includes(sayfa) ? 'on' : ''}`}
          onClick={() => setDaha(true)}
        >
          <span className="nav-ic">
            <Ikon ad="menu" boy={22} />
          </span>
          <span className="nav-ad">Daha</span>
        </button>

        <div className="side-alt">
          <div className="hint" style={{ padding: '8px 12px' }}>
            Bugünkü satış: <strong className="v">{fmtTL(r.ciro)}</strong>
          </div>
        </div>
      </aside>

      <main className="main">
        {sayfa === 'profil' ? <Profil user={user} onOut={onOut} /> : <Ekran />}
      </main>

      {daha && (
        <div className="modal-bg" onClick={() => setDaha(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="cart-bas">
              <strong>Daha fazla</strong>
              <button className="x" onClick={() => setDaha(false)} aria-label="Kapat">
                <Ikon ad="kapat" />
              </button>
            </div>
            <div className="daha-izgara">
              {MENU.filter((p) => !ALT_CUBUK.includes(p.id)).map((p) => (
                <button key={p.id} className={`daha-kutu ${sayfa === p.id ? 'on' : ''}`} onClick={() => git(p.id)}>
                  <Ikon ad={p.ic} boy={26} />
                  <span>{p.ad}</span>
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 12 }}>
              Giriş: {user.username}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/** İnternet var mı — navigator + gerçek Supabase ping. Kapı bunu kullanır. */
function useInternet(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    let alive = true
    const kontrol = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (alive) setOnline(false)
        return
      }
      const ok = await cloudPing()
      if (alive) setOnline(ok)
    }
    void kontrol()
    const iv = setInterval(() => void kontrol(), 8000)
    const on = () => void kontrol()
    window.addEventListener('online', on)
    window.addEventListener('offline', on)
    return () => {
      alive = false
      clearInterval(iv)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', on)
    }
  }, [])
  return online
}

/** İnternet yokken tüm uygulamayı kapatan ekran. */
function InternetKapisi() {
  return (
    <div className="acilis">
      <div className="acilis-ic">
        <div className="acilis-logo">!</div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>İnternet bağlantısı gerekli</div>
        <div style={{ opacity: 0.75, textAlign: 'center', maxWidth: 300 }}>
          Bu uygulama verileri buluttan çalışır. Bağlantı gelince otomatik açılır.
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const online = useInternet()
  const [user, setUser] = useState<User | null>(() => currentUser())
  // Açılışta bulut kullanıcı listesini senkronla; bitene kadar girişi beklet
  // (başka cihazda açılmış hesapla giriş çalışsın diye).
  const [booted, setBooted] = useState(false)
  useEffect(() => {
    let alive = true
    syncUsers().finally(() => {
      if (alive) setBooted(true)
    })
    return () => {
      alive = false
    }
  }, [])

  // İnternet yoksa hiçbir şey açılmaz (tümü-buluttan mimarisi).
  if (!online) return <InternetKapisi />

  if (!booted) {
    return (
      <div className="acilis">
        <div className="acilis-ic">
          <div className="acilis-logo nabiz">Ç</div>
          <div>Yükleniyor…</div>
        </div>
      </div>
    )
  }

  if (!user) return <Giris onIn={setUser} />

  const cikis = () => {
    logout()
    setUser(null)
  }

  return (
    <StoreProvider userId={user.id} key={user.id}>
      <Shell user={user} onOut={cikis} />
    </StoreProvider>
  )
}
