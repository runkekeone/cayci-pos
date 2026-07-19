/**
 * Ürün 2D görselleri — public/urun/<id>.svg.
 *
 * Sadece bu listedeki id'lerin dosyası var; kullanıcının sonradan eklediği
 * ürünler listede yoksa emoji ikonuna düşülür. BASE_URL şart: uygulama
 * GitHub Pages'te /cayci-pos/ altında, APK'da göreli yolda çalışıyor.
 */
const GORSELLI = new Set([
  'cay-bardak',
  'turk-kahvesi',
  'nescafe',
  'uclubir',
  'oralet',
  'tost',
  'bardak-su',
  'pet-su',
  'sade-soda',
  'meyveli-soda',
  'gazoz',
  'kola',
  'fanta',
  'ayran',
  'meyve-suyu',
  'enerji',
  'bardak-limonata',
  'gofret',
  'kraker',
  'ikram-cikolata',
])

/** Ürünün görsel yolu; görseli yoksa null (emoji göster). */
export function urunGorsel(id: string): string | null {
  return GORSELLI.has(id) ? `${import.meta.env.BASE_URL}urun/${id}.svg` : null
}
