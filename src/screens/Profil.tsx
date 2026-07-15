import { useState } from 'react'
import { useStore } from '../store'
import { today } from '../lib/units'
import type { User } from '../auth'
import type { Business } from '../types'

/**
 * PROFİL & AYARLAR.
 * Kullanıcı profille girdiği için hesap, işletme bilgileri, ayarlar, yedekleme
 * ve çıkış hepsi burada toplanır. Sol menüdeki dağınık alt butonların yerini alır.
 */
export default function Profil({ user, onOut }: { user: User; onOut: () => void }) {
  const { s, set } = useStore()
  const [biz, setBiz] = useState<Business>(s.business)
  const [kayitli, setKayitli] = useState(false)

  function isletmeKaydet() {
    set((st) => ({ ...st, business: biz }))
    setKayitli(true)
    setTimeout(() => setKayitli(false), 1500)
  }

  function ayar(patch: Partial<typeof s.settings>) {
    set((st) => ({ ...st, settings: { ...st.settings, ...patch } }))
  }

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
        if (confirm('Yedekteki veri şu anki verinin ÜZERİNE yazılacak. Devam edilsin mi?')) {
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
      <h1>Profil & Ayarlar</h1>
      <p className="sub">
        {user.username} · {s.business.name || user.businessName}
      </p>

      {/* ---- İşletme bilgileri ---- */}
      <div className="section-title">İşletme bilgileri</div>
      <div className="card">
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 2, minWidth: 180 }}>
            <label>İşletme adı</label>
            <input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label>Sahibi</label>
            <input value={biz.owner} onChange={(e) => setBiz({ ...biz, owner: e.target.value })} />
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label>Telefon</label>
            <input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} />
          </div>
          <div className="field" style={{ flex: 2, minWidth: 180 }}>
            <label>Adres</label>
            <input value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} />
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ width: 140 }}>
            <label>Açılış saati</label>
            <input
              type="time"
              value={biz.openTime}
              onChange={(e) => setBiz({ ...biz, openTime: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 140 }}>
            <label>Kapanış saati</label>
            <input
              type="time"
              value={biz.closeTime}
              onChange={(e) => setBiz({ ...biz, closeTime: e.target.value })}
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: 8, alignItems: 'center', gap: 10 }}>
          <button className="btn primary" onClick={isletmeKaydet}>
            Kaydet
          </button>
          {kayitli && <span className="hint v good">✓ Kaydedildi</span>}
        </div>
      </div>

      {/* ---- Ayarlar ---- */}
      <div className="section-title">Ayarlar</div>
      <div className="card">
        <label className="row" style={{ cursor: 'pointer', gap: 10, justifyContent: 'space-between' }}>
          <span>
            <strong>Ürün görselleri</strong>
            <span className="hint" style={{ display: 'block' }}>
              Satış ekranında ürün fotoğraflarını göster.
            </span>
          </span>
          <input
            type="checkbox"
            checked={s.settings.showImages}
            onChange={(e) => ayar({ showImages: e.target.checked })}
            style={{ width: 20, height: 20 }}
          />
        </label>

        <div style={{ borderTop: '1px solid var(--line)', margin: '12px 0' }} />

        <label className="row" style={{ gap: 10, justifyContent: 'space-between', opacity: 0.55 }}>
          <span>
            <strong>Otomatik gün başlat/bitir</strong>
            <span className="hint" style={{ display: 'block' }}>
              Açılış/kapanış saatine göre günü otomatik başlatır, kapanışa 30 dk kala uyarır.{' '}
              <em>Yakında.</em>
            </span>
          </span>
          <input type="checkbox" disabled checked={false} style={{ width: 20, height: 20 }} />
        </label>
      </div>

      {/* ---- Yedekleme ---- */}
      <div className="section-title">Yedekleme</div>
      <div className="card">
        <p className="hint" style={{ marginTop: 0 }}>
          Tüm veriler bu cihazın tarayıcısında tutulur. Tarayıcı temizlenirse gider — düzenli yedek al.
        </p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={yedekAl}>
            💾 Yedek al (indir)
          </button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            📂 Geri yükle
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
        </div>
      </div>

      {/* ---- Oturum ---- */}
      <div className="section-title">Oturum</div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="hint">
            Giriş: <strong>{user.username}</strong>
          </span>
          <button className="btn ghost" onClick={onOut} style={{ color: 'var(--bad)' }}>
            🚪 Çıkış yap
          </button>
        </div>
      </div>
    </>
  )
}
