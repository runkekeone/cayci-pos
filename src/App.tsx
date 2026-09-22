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
import { Ikon, type IkonAd } from './lib/Ikon'

/** id → ekran bileşeni. */
const EKRANLAR: Record<string, ComponentType> = {
  anasayfa: Anasayfa,
  satis: Satis,
  rapor: Rapor,
  urunler: Urunler,
  stok: Stok,
  musteriler: Musteriler,
  giderler: Giderler,
  siparis: Siparis,
}

type MenuLeaf = { id: string; ad: string; kisa: string; ic: IkonAd }
type MenuItem = MenuLeaf & { ana?: boolean; alt?: MenuLeaf[] }

/**
 * Sol menü. `ana` olanlar telefonda alt çubukta çıkar; gerisi "Daha" panelinde.
 * `alt` olan bir grup (Raporlar) masaüstünde açılıp alt başlıklarını gösterir.
 */
/**
 * Telefonda alt çubuk mockup düzeni: Ana Ekran / Satış / (+) Hızlı Satış /
 * Adisyonlar / Profil. Diğer modüllere Anasayfa'daki Hızlı İşlemler
 * ızgarasından gidilir; masaüstünde hepsi solda durur.
 */
const MENU: MenuItem[] = [
  { id: 'anasayfa', ad: 'Anasayfa', kisa: 'Ana Ekran', ic: 'ev', ana: true },
  // Mobilde alt çubukta gösterilmez (nav-gizli): (+) Hızlı Satış zaten satış ekranına gidiyor.
  // Masaüstü sidebar'da görünmeye devam eder.
  { id: 'satis', ad: 'Satış', kisa: 'Satış', ic: 'fis', ana: false },
  { id: 'siparis', ad: 'Sipariş', kisa: 'Sipariş', ic: 'kamyon', ana: true },
  {
    id: 'rapor',
    ad: 'Raporlar',
    kisa: 'Rapor',
    ic: 'grafik',
    ana: false,
    alt: [
      { id: 'rapor', ad: 'Rapor', kisa: 'Rapor', ic: 'grafik' },
      { id: 'urunler', ad: 'Ürünler', kisa: 'Ürünler', ic: 'dukkan' },
      { id: 'stok', ad: 'Stok', kisa: 'Stok', ic: 'kutu' },
      { id: 'musteriler', ad: 'Müşteriler', kisa: 'Müşteri', ic: 'kisiler' },
      { id: 'giderler', ad: 'Giderler', kisa: 'Giderler', ic: 'defter' },
    ],
  },
]

/** Giriş yapılmış kullanıcının verisiyle çalışan asıl uygulama. */
function Shell({ user, onOut }: { user: User; onOut: () => void }) {
  const { s } = useStore()
  const [sayfa, setSayfa] = useState('anasayfa')
  const [acikGruplar, setAcikGruplar] = useState<string[]>(['rapor'])

  // Anasayfa'daki Hızlı İşlemler ızgarası gibi ekran dışı yerlerden sayfa
  // değiştirmek için: window'a 'cayci-git' olayı at, burada yakala.
  useEffect(() => {
    const f = (e: Event) => setSayfa((e as CustomEvent<string>).detail)
    window.addEventListener('cayci-git', f)
    return () => {
      window.removeEventListener('cayci-git', f)
    }
  }, [])

  // Tema/yazı boyutu <html> niteliklerine yazılır — erken çıkışlardan ÖNCE,
  // yoksa Kurulum ve Gün Başlat ekranları temasız kalırdı.
  useTema(s.settings)

  // Kurulum bitmeden uygulamaya girilemez.
  if (!s.setupDone) return <Kurulum businessName={user.businessName} />

  // İş günü kendiliğinden döner (bkz. today()); "Günü başlat" kapısı yok.
  const Ekran = EKRANLAR[sayfa] ?? Satis
  const r = dayReport(s, today())
  const doluMasa = s.tables.filter((t) => t.lines.length > 0).length

  function git(id: string) {
    setSayfa(id)
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

        {MENU.map((p) => {
          // Grup değilse: düz menü satırı.
          if (!p.alt) {
            return (
              <button
                key={p.id}
                className={`nav ${sayfa === p.id ? 'on' : ''} ${p.ana ? '' : 'nav-gizli'}`}
                onClick={() => git(p.id)}
              >
                <Ikon ad={p.ic} />
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
                className={`nav nav-gizli ${cocukAktif ? 'on' : ''}`}
                onClick={() => {
                  git(p.alt![0].id)
                  setAcikGruplar((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))
                }}
              >
                <Ikon ad={p.ic} />
                <span className="nav-ad">{p.ad}</span>
                <span className="nav-kisa">{p.kisa}</span>
                <span className="nav-caret nav-ad">
                  <Ikon ad={acik ? 'asagi' : 'sag'} boy={16} />
                </span>
              </button>
              {acik &&
                p.alt.map((a) => (
                  <button
                    key={a.id}
                    className={`nav nav-alt nav-gizli ${sayfa === a.id ? 'on' : ''}`}
                    onClick={() => git(a.id)}
                  >
                    <Ikon ad={a.ic} boy={18} />
                    <span className="nav-ad">{a.ad}</span>
                  </button>
                ))}
            </div>
          )
        })}

        {/* telefonda: ortada yükseltilmiş (+) hızlı satış, adisyonlar, profil */}
        <button
          className="nav only-mobile nav-arti"
          onClick={() => {
            git('satis')
            window.dispatchEvent(new CustomEvent('cayci-hizli'))
          }}
          aria-label="Hızlı Satış"
        >
          <span className="arti-yuvarlak">
            <Ikon ad="arti" boy={22} kalinlik={2.2} />
            {doluMasa > 0 && <span className="nav-rozet">{doluMasa}</span>}
          </span>
          <span className="nav-kisa">Satış</span>
        </button>
        <button
          className={`nav only-mobile ${sayfa === 'musteriler' ? 'on' : ''}`}
          onClick={() => git('musteriler')}
        >
          <Ikon ad="defter" boy={22} />
          <span className="nav-kisa">Veresiye</span>
        </button>
        <button
          className={`nav only-mobile ${sayfa === 'rapor' ? 'on' : ''}`}
          onClick={() => git('rapor')}
        >
          <Ikon ad="grafik" boy={22} />
          <span className="nav-kisa">Rapor</span>
        </button>

        <div className="side-alt">
          <div className="hint" style={{ padding: '8px 12px' }}>
            Bugünkü satış: <strong className="v">{fmtTL(r.ciro)}</strong>
          </div>
          <button
            className={`nav ${sayfa === 'profil' ? 'on' : ''}`}
            onClick={() => git('profil')}
          >
            <Ikon ad="kisi" />
            <span>
              Profil <span className="hint">({user.username})</span>
            </span>
          </button>
        </div>
      </aside>

      <main className="main">
        {sayfa === 'profil' ? <Profil user={user} onOut={onOut} /> : <Ekran />}
      </main>

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
