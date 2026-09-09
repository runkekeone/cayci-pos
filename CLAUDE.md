# cayci-pos / babuco — oturum notları

Bu depoda iki uygulama var:

- **Çaycı POS** (React, `src/`) — çay ocağı mobil uygulaması.
- **Toptancı paneli "Özgür Ticaret" / babuco** (vanilla JS, `public/toptanci/`) —
  kullanıcının satışlarını girdiği panel. Sadece telefonda kullanılır; koddaki
  masaüstü düzeni yanıltıcıdır, öncelik her zaman 390 px.

Rol dağılımı ve dosya sahipliği için `TAKIM.md`. **`git add -A` yasak** — sadece
kendi dokunduğun dosyayı stage'le.

## Babuco verisine erişim (rapor, satış girişi)

Kullanıcı sahadayken telefondan oturum açıp konuşarak satış girdiriyor ve rapor
istiyor. Paneli açmaya, tarayıcı otomasyonuna, localStorage aramaya **gerek yok**.
Panelin verisi buluttadır: Supabase `kv` tablosu, anahtar **`babuco:store`**.
(`cayci-pos:data:<userId>` çaycı POS'un verisidir, babuco'nun değil — karıştırma.)

Araç depoda: **`node tools/babuco.cjs <komut>`** (depo kökünden çalıştır)

```
durum                        bulut yedeğinin son hâli, kayıt sayıları
rapor [YYYY-AA-GG]           günlük rapor (Markdown; boş = bugün)
musteri [arama]              müşteri + borç + telefon + özel fiyatları
urun [arama]                 ürün + satış/alış fiyatı + dükkan/araç stoğu
siparisler                   çay ocağından gelen siparişler
satis <dosya.json|json>      satış gir
tahsilat <musteri> <tutar> [not]
gider <tutar> <aciklama> [kategori]
gelir <tutar> <aciklama> [tur]
sil-satis <belgeNo>          satışı geri al (stok + borç geri döner)
```

Bağlantı bilgisi `public/toptanci/app.js` içindeki `SB_URL`/`SB_KEY`'den okunur —
araçta ikinci bir kopya tutulmaz. Gerekirse `BABUCO_SB_URL` + `BABUCO_SB_KEY`
ortam değişkenleriyle ezilebilir.

### Kaydetme protokolü
**`--kaydet` verilmedikçe hiçbir şey yazılmaz** — araç sadece özeti basar.
Önce `--kaydet`siz çalıştır, özeti (kalemler, fiyatlar, toplam, **kâr ve marj**,
bakiyenin ne olacağı) kullanıcıya göster, **tamam** dedikten sonra aynı komutu
`--kaydet` ile tekrarla. Kullanıcı onaylamadan kaydetme.

Satış JSON'u:
```json
{ "musteri": "Güneş kıraathanesi",
  "kalemler": [ {"urun":"Mavizade 200 ml Bardak Su","adet":10},
                {"urun":"Coca-Cola","adet":2,"fiyat":640} ],
  "odeme": {"nakit":1000},
  "not": "", "stokKaynak": "arac" }
```
- `fiyat` yazılmazsa müşterinin **özel fiyatı**, o da yoksa liste fiyatı uygulanır.
- `odeme`: `"nakit"` / `"pos"` / `"acik"` kısayolu ya da `{nakit,pos,acik}`.
  Ödenen tutar satıştan **azsa** kalan açık hesaba, **fazlaysa** fazlası borca
  tahsilat olarak yazılır — panelin davranışının aynısı.
- Ürün/müşteri adı birden çok kayda uyarsa araç hata verip adayları listeler.
  Kendi kafana göre seçme, kullanıcıya sor.

### Çakışma
Panel tüm veriyi tek bulut anahtarına yazar, **son yazan kazanır**. Araç bunu
compare-and-swap ile korur: okuduğundan beri bulut değiştiyse yazmayı reddeder ve
`CAKISMA` der. Onu görürsen körlemesine tekrarlama — yeniden oku, kaydın zaten
girip girmediğine bak, sonra dene. Her yazmadan önce buluttaki önceki hâl
`tools/yedek/` altına kaydedilir (bu klasör git'e girmez).

### Bulut oturumunda ağ izni
Anthropic bulut oturumları varsayılan olarak dışarıya çıkamaz. Araç
`Supabase HTTP` / bağlantı hatası veriyorsa ortamın ağ politikası engelliyordur:
claude.ai/code → ortam seçici → ortamı düzenle → **Network access: Custom** →
**Allowed domains**'e Supabase host'unu ekle. Bu ayarı kullanıcı yapar, sen yapamazsın.
