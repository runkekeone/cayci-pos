# TAKIM — 3 oturum koordinasyonu

**Bu dosyayı her oturum İŞ BAŞLAMADAN okur.** Kanal = bu dosya + git. Oturumlar birbiriyle doğrudan konuşamaz; koordinasyon buradan + insan üzerinden.

Projeler: **cayci-pos** (çay ocağı POS, React) + **babuco-app** (toptancı paneli, vanilla JS). Canlı babuco = `cayci-pos/public/toptanci/`.

---

## Roller

### 🧠 CODER (Claude — bu oturum)
Tüm mantık, veri, entegrasyon. Sahip olduğu dosyalar:
- cayci-pos: `src/store.tsx`, `src/types.ts`, `src/auth.ts`, `src/lib/**`, `src/App.tsx`, `src/screens/*.tsx` (mantık/JSX), `src/seed.ts`, `src/defaults.ts`
- babuco: `www/app.js` (mantık), Supabase entegrasyonu
- Özellik, bug, fonksiyon, bulut/senkron, sipariş kanalı, puan sistemi mantığı

### 🎨 DESIGNER (babuco-mobil/APK oturumu)
Sadece görsel + mobil + paketleme. Sahip olduğu:
- cayci-pos: `src/index.css`
- babuco: `www/styles.css`, `www/index.html` (yalnız markup/düzen — app.js mantığına DOKUNMA)
- babuco APK paketleme: `babuco-app/android/**`, `capacitor.config.json` (görsel/viewport)
- **JSX mantığı değiştirme.** Ekran yapısı değişmeli ise → "İSTEKLER"e yaz, coder yapar. Sadece className/stil dokun.

### 🔍 MODERATÖR (puan-sistemi oturumu → artık moderatör)
Kod YAZMAZ. İnceler + doğrular:
- Diğer ikisinin commit/diff'ini oku, `npm run build` + `npx tsc -b` koş, deploy'u doğrula
- Kırık/çakışma bulursa "DURUM"a yaz + insana söyle
- TAKIM.md durumunu güncel tutar
- Not: puan sistemi MANTIĞI artık coder'ın (Satis/types/store). Moderatör onu review eder, yazmaz.

---

## KURALLAR (çakışmayı bunlar önler)
1. **Kendi dosyalarında kal.** Başkasının dosyasına dokunma.
2. **`git add -A` YASAK** — başkasının yarım işini toplar. Sadece kendi dosyanı stage'le: `git add <dosya>`.
3. **Küçük + sık commit.** Birikince çakışma büyür.
4. Sınır aşan değişiklik lazımsa → "İSTEKLER"e yaz, sahibi yapsın.
5. **babuco dağıtımı:** tablet `cayci-pos/public/toptanci/`'yi yükler (babuco-app/www DEĞİL). babuco değişince İKİSİNİ de güncelle + cayci-pos push et. **Bunu coder yapar** (designer app.js'e dokunmaz, styles/html değişince coder'a haber ver).
6. Mimari sabit: **tümü-buluttan, internet gerektiren.** Offline-first geri getirme.

---

## DURUM (2026-07-21)
Bitti: bulut senkron (kv), internet kapısı (iki app), sipariş kanalı (siparisler tablosu, çift yönlü), babuco otomatik güncelleme (server.url → /toptanci/), alt menüden Satış kaldırıldı.
Supabase: proje `zchubpqbvbhcuxclirur`, tablolar `kv` + `siparisler` kurulu.

## İSTEKLER (sınır aşan işler — sahibi alır)
- (boş)
