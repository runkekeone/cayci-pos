import { useState } from 'react'

/**
 * GÜN BAŞLAT KAPISI.
 * Gün açılana kadar tüm ekranların önünde durur (tam kapı). Koşu app'i gibi:
 * "Günü Başlat"a basılınca oturum açılır, o günün satış/rapor ölçümü başlar.
 * Açılış nakdi burada girilir (kasa gün başı).
 */
export default function GunBaslat({
  isletme,
  onBaslat,
}: {
  isletme: string
  onBaslat: (openingCash: number) => void
}) {
  const [nakit, setNakit] = useState('')

  const simdi = new Date().toLocaleString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'var(--bg)',
      }}
    >
      <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: '32px 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>☕</div>
        <h1 style={{ margin: 0 }}>{isletme || 'Çay Ocağı'}</h1>
        <p className="hint" style={{ marginTop: 6, marginBottom: 24 }}>
          {simdi}
        </p>

        <div className="field" style={{ textAlign: 'left', marginBottom: 24 }}>
          <label>Kasadaki açılış nakdi (₺)</label>
          <input
            type="number"
            min={0}
            autoFocus
            value={nakit}
            placeholder="Örn. 500"
            onChange={(e) => setNakit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onBaslat(Number(nakit) || 0)}
          />
          <span className="hint">Para üstü için kasada bıraktığın nakit. Sonra Kasa'dan değişebilir.</span>
        </div>

        <button
          className="btn primary"
          onClick={() => onBaslat(Number(nakit) || 0)}
          style={{
            width: 180,
            height: 180,
            borderRadius: '50%',
            fontSize: 22,
            fontWeight: 700,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Günü Başlat
        </button>
      </div>
    </div>
  )
}
