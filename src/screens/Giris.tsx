import { useState } from 'react'
import { login, register, type User } from '../auth'

export default function Giris({ onIn }: { onIn: (u: User) => void }) {
  const [mod, setMod] = useState<'giris' | 'uyelik'>('giris')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [hata, setHata] = useState('')

  function gonder() {
    setHata('')
    const r =
      mod === 'giris' ? login(username, password) : register(username, password, businessName)
    if ('error' in r) {
      setHata(r.error)
      return
    }
    onIn(r)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 34 }}>🍵</div>
          <h1 style={{ marginTop: 8 }}>Çay Ocağı POS</h1>
          <p className="hint">
            {mod === 'giris' ? 'İşletmene giriş yap.' : 'Yeni işletme kaydı oluştur.'}
          </p>
        </div>

        {mod === 'uyelik' && (
          <div className="field">
            <label>İşletme adı</label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Merkez Kıraathanesi"
            />
          </div>
        )}

        <div className="field">
          <label>Kullanıcı adı</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && gonder()}
          />
        </div>

        <div className="field">
          <label>Parola</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && gonder()}
          />
        </div>

        {hata && (
          <p className="hint" style={{ color: 'var(--bad)', marginBottom: 10 }}>
            {hata}
          </p>
        )}

        <button className="btn primary" style={{ width: '100%' }} onClick={gonder}>
          {mod === 'giris' ? 'Giriş yap' : 'Üye ol ve kuruluma başla'}
        </button>

        <p className="hint" style={{ textAlign: 'center', marginTop: 14 }}>
          {mod === 'giris' ? 'Hesabın yok mu? ' : 'Zaten üye misin? '}
          <button
            className="btn ghost sm"
            onClick={() => {
              setMod(mod === 'giris' ? 'uyelik' : 'giris')
              setHata('')
            }}
          >
            {mod === 'giris' ? 'Üye ol' : 'Giriş yap'}
          </button>
        </p>

        <p
          className="hint"
          style={{ textAlign: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}
        >
          Veriler bu cihazda saklanır. Sunucu yok — parola gerçek bir güvenlik katmanı değildir.
        </p>
      </div>
    </div>
  )
}
