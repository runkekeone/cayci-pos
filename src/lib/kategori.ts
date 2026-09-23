/**
 * Bölüm renkleri — satışta bölüm blokları ve ürün kartının kenarı bu renkte.
 * Göz ürünü önce renginden bulur (Sıcak turuncu, Soğuk mavi...). Beyaz yazı
 * her birinin üstünde okunur (kontrast ≥ 4.5).
 */
const SABIT: Record<string, string> = {
  Sıcak: '#c2410c',
  Soğuk: '#1d63c4',
  Yiyecek: '#2b7a3a',
  Atıştırmalık: '#8e32a8',
}

// Toptancının kendi grupları (Su, Gazlı, Çay, Şeker…) sırayla bu renkleri alır.
const DIGER = ['#0b7285', '#c2255c', '#6b4f2a', '#5f3dc4', '#2f7d32', '#b35c00', '#1864ab', '#862e9c', '#a61e4d', '#495057']

/** Kategori sırası sabit; kullanıcının eklediği yeni kategoriler sona düşer. */
export const KATEGORI_SIRA = ['Sıcak', 'Soğuk', 'Yiyecek', 'Atıştırmalık']

export function katRenk(kategori: string, hepsi: string[] = []): string {
  if (SABIT[kategori]) return SABIT[kategori]
  const digerler = hepsi.filter((k) => !SABIT[k])
  const i = Math.max(0, digerler.indexOf(kategori))
  return DIGER[i % DIGER.length]
}
