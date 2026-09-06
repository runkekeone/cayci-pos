# Prompt Kalıbı

Görsel üretim promptları için kalıp stüdyosu. Sabit kalan stil / teknik bloğu bir kez
kaydedilir; her yeni iş için sadece değişen konu-konsept alanları doldurulur.

## Nasıl çalışır

1. **Kalıp** — prompt metnini yapıştır. Değişen kısımlar `{{konu}}` gibi yer tutucularla
   işaretlenir. `Değişkenleri bul` düğmesi metni Claude'a inceletip yer tutucuları
   otomatik yerleştirir; stil, çizgi, render ve kalite satırlarına dokunmaz.
2. **Referans** — referans görseli sürükle, yapıştır veya seç. `Referanstan doldur`
   görseldeki konu, aksiyon, mekân, objeler ve atmosferi okuyup yalnızca değişken
   alanları doldurur. Stil hakkında yorum üretmez, çünkü stil kalıpta sabittir.
3. **Çıktı** — kalıp + değerler birleşip kopyalanmaya hazır prompt olur. Kopyalanan her
   prompt arşive düşer, tek tıkla geri yüklenir.

Alan değerleri İngilizce veya Türkçe üretilebilir (üst sağdaki `Değerler` seçimi).

## Yüklü kalıp

`kit-neo-psychedelic.md` — Neo-psychedelic tattoo-flash tişört kiti. Uygulamaya varsayılan
kalıp olarak gömülü, slotları boş gelir: `ana_konu`, `cerceve`, `palet`, `gok_motifi`,
`marka`, `slogan`, `yil`. Stili tutan beş kritik öbek (dotwork, flat spot-color, simetri,
art-nouveau çerçeve, silkscreen dokusu), Midjourney parametreleri ve negatif prompt sabit
blokta durur.

## Dosya

Tek dosyalık statik sayfa: `index.html`. Claude Artifact olarak yayımlanır; kalıplar ve
arşiv artifact veritabanında tutulur, erişilemediğinde `localStorage`'a düşer.
