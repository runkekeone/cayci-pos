# Paneli şifreye ve veritabanını kilide alma — kurulum

Bugün panel adresini bilen herkes müşterileri, telefonları ve borçları görebiliyor.
Bu adımlar bitince panel **şifreyle** açılır ve veriyi **yalnız senin hesabın** okuyup yazabilir.
Çay ocaklarının uygulaması eskisi gibi çalışmaya devam eder.

**Şifre ekranı tek başına veriyi korumaz.** Ekran yalnız paneli kapatır; veriyi asıl kapatan 7. adımdaki
veritabanı kilididir. 7. adım yapılana kadar veri, uygulama anahtarını bilen herkese açık kalır.

**Sırayı değiştirme.** Her adımın sonunda "doğrula" var; doğrulama tutmadan sonrakine geçme.
Veritabanı adımlarının hepsi Supabase panosunda yapılır: <https://supabase.com/dashboard> → projen.

| Dosya | Ne işe yarar |
|---|---|
| `once-bak.sql` | Hiçbir şeyi değiştirmez; şu anki durumu tek tabloda gösterir. |
| `kilit.sql` | Kilidi kurar. Hata çıkarsa hiçbir şey değişmez. |
| `geri-al.sql` | Kilidi kaldırır, eski hâle döner (veri yeniden herkese açılır). |

---

## 1. Giriş hesabını aç

1. Soldan **Authentication → Users → Add user → Create new user**.
2. E-postanı ve **uzun, başka yerde kullanmadığın** bir şifre yaz.
3. **Auto Confirm User** işaretli kalsın → **Create user**.
4. Baban ayrı hesapla girecekse aynı şekilde ikinci bir hesap aç. (Aynı hesabı iki telefonda kullanmak da olur.)

Listede e-postan **zaten varsa ve o hesabı sen açmadıysan** (2. adım yapılmadan önce biri senin adına kayıt olmuş olabilir):
şifresini değiştirmekle yetinme — o kullanıcıyı **sil**, sonra yeniden aç.

**Doğrula:** kullanıcı listede görünüyor.

## 2. Yeni üyeliği kapat

Panelde "kayıt ol" ekranı yok; ama dışarıdan biri doğrudan Supabase'e kayıt olmayı deneyebilir. Kapat:

1. **Authentication → Sign In / Providers** (eski panoda: Authentication → Settings).
2. **Allow new users to sign up** → **kapalı** → Save.

Kapalıyken de 1. adımdaki gibi panodan hesap açabilirsin.

**Doğrula:** anahtar kapalı görünüyor.

## 3. Yeni sürümü yayınla

Bu değişiklikler `main`'e girip yayınlanınca (GitHub Pages, birkaç dakika):

**Doğrula:** panel adresini aç → müşteriler değil, **giriş ekranı** gelmeli. Gelmiyorsa sayfayı bir kez yenile.

## 4. Panele giriş yap

Paneli kullanan her telefonda bir kez e-posta + şifreyle gir. Telefon seni hatırlar, bir daha sormaz.

**Doğrula:** müşteriler ve borçlar eskisi gibi görünüyor.

Giriş yapınca panel, çay ocaklarının sipariş ekranı için **herkese açık küçük bir katalog** yayınlar
(yalnız ürün adı, grubu, satış fiyatı, birimi, barkodu — alış fiyatı, stok, müşteri yok). Bir dakika bekle.

## 5. Önce bak

**SQL Editor → New query** → `once-bak.sql` dosyasının tamamını yapıştır → **Run**. Çıkan tablonun ekran görüntüsünü sakla.

**Doğrula** (tabloda):

- **6. Herkese açık katalog** satırı "… ürün" diyor ve iki sayı birbirine eşit. "YOK" diyorsa 4. adıma dön.
- **4. kv içindeki anahtarlar** bölümünde yalnız şunlar var: `babuco:…`, `cayci-pos:…`, `bayi_puan:*`, `duyurular`.
  Başka bir şey görürsen dur; kilit onu kapatır (betik zaten kendini durdurur ve adını söyler).
- **5.** ile başlayan satır **yok** (varsa dur, sor).
- **7. Giriş hesapları** bölümünde 1. adımda açtığın e-posta var.

## 6. Bir gün bekle

Çay ocaklarının uygulaması yeni sürümü **bir sonraki açılışta** alır. Eski sürüm ürün listesini doğrudan senin
verinden okuyordu; kilitten sonra okuyamaz ve sipariş ekranı boş görünür. Yeni sürüm kataloğu okur.

Yayından sonra **en az bir gün** bekle ki bütün çay ocakları yeni sürüme geçmiş olsun.
(Arada panel de araç da eskisi gibi çalışır; acele yok.)

**Doğrula:** bir çay ocağının telefonunda sipariş ekranını aç → ürünler görünüyor.

## 7. Kilidi kur

1. `kilit.sql` dosyasını aç. En üstteki **AYAR** bölümünde `BURAYA-KENDI-EPOSTANI-YAZ` yazan yere,
   tırnakları silmeden, panele girdiğin e-postayı yaz. Baban ayrı hesapla giriyorsa alt satırın başındaki
   `--` işaretini silip onun e-postasını yaz.
2. **SQL Editor → New query** → dosyanın tamamını yapıştır → **Run**.
3. Pano "bu sorgu bir şeyleri siliyor/değiştiriyor" diye sorarsa onayla (eski kuralları kaldırıp yenisini kuruyor; veri silmiyor).

**Doğrula:** altta tek satır çıkar: `KİLİT KURULDU`, yanında senin e-postan, `kv_politika_sayisi = 5`, `satir_guvenligi_acik = true`.

Kırmızı bir hata çıkarsa **hiçbir şey değişmemiştir**. Mesaj nedenini söyler:

| Mesaj | Ne yapmalı |
|---|---|
| İzin listesi boş | AYAR'a e-postanı yazmayı unuttun. |
| … için giriş hesabı bulunamadı | E-postayı yanlış yazdın ya da 1. adımı atladın. |
| katalog henüz yayınlanmamış | 4. adım: panele giriş yap, bir dakika bekle, yeniden dene. |
| tanımadığım anahtar(lar) var | Dur. O anahtarı kimin kullandığı bulunmadan kilit kurulmaz. |
| kv tablosunu okuyan görünüm var | Dur. O görünüm kilidi deler; önce incelenmeli. |

## 8. Kilitten sonra dene

1. **Panel (giriş yapılmış telefon):** sayfayı yenile → müşteriler duruyor. Sıradaki ilk gerçek satışı panelden gir;
   kaydolduğunu 9. adımdan sonra araçla da gör (`node tools/babuco.cjs durum` → satış sayısı bir artmış).
2. **Gizli sekme:** panel adresini aç → giriş ekranı; şifresiz hiçbir şey görünmüyor.
3. **Çay ocağı telefonu:** sipariş ekranında ürünler duruyor; deneme siparişi panele düşüyor.
4. **`once-bak.sql`'i yeniden çalıştır:** 1. bölümde `kv → AÇIK`, 2. bölümde `babuco_kv_…` adlı 5 politika.
5. İstersen dışarıdan bak (isteğe bağlı, teknik): `app.js` içindeki `SB_URL` ve `SB_KEY` ile
   `curl "<SB_URL>/rest/v1/kv?key=eq.babuco:store&select=key" -H "apikey: <SB_KEY>"` → cevap `[]` olmalı.

Bir şey ters giderse 11. adıma bak.

## 9. Terminal aracını bağla

Kilitten sonra araç giriş yapmadan veri okuyamaz; `Veritabani kilitli: giris yapmadan…` der.

- **Bilgisayarda (bir kez):** depo klasöründe `node tools/babuco-kimlik.cjs giris` → e-posta ve şifreyi sorar (şifre ekrana yazılmaz).
  Oturum `tools/.babuco-oturum.json` dosyasında durur (git'e girmez, içinde şifre yok). Sonra araç eskisi gibi çalışır.
  Kontrol: `node tools/babuco-kimlik.cjs durum`. Silmek için: `node tools/babuco-kimlik.cjs cikis`.
- **Telefondan açılan bulut oturumlarında:** claude.ai/code → ortam seçici → ortamı düzenle → **Environment variables**:
  `BABUCO_EPOSTA` = e-postan, `BABUCO_SIFRE` = şifren. Dosyaya gerek kalmaz. Şifre hiçbir çıktıya yazılmaz.
- Müşteri cari sayfası güncellemesi (`tools/cari/guncelle.sh`) aynı kimliği kullanır; ayrıca bir şey gerekmez.

**Doğrula:** `node tools/babuco.cjs durum` satış/müşteri sayılarını gösteriyor.

## 10. Sonradan

**Hesap eklemek** (ör. babana ayrı hesap): önce 1. adımdaki gibi hesabı aç, sonra SQL Editor'de:

```sql
insert into public.babuco_yetkililer (user_id, eposta)
select id, email from auth.users where lower(email) = lower('yeni-hesap@ornek.com')
on conflict do nothing;
select eposta, eklendi from public.babuco_yetkililer;
```

**Hesap çıkarmak:**

```sql
delete from public.babuco_yetkililer where lower(eposta) = lower('cikacak-hesap@ornek.com');
```

**Şifre değiştirmek:** Authentication → Users → kullanıcı → Reset password / şifreyi elle değiştir.

**Telefon kaybolursa ya da çalınırsa:** Authentication → Users → kullanıcı → oturumlarını kapat (Sign out) ve şifreyi değiştir.
O telefon en geç bir saat içinde veriye ulaşamaz olur. Hemen kesmek istersen o hesabı izin listesinden çıkar
(yukarıdaki "hesap çıkarmak"), kendine yeni bir hesap açıp onu ekle. **Ama** o telefonda daha önce inmiş olan kopya,
biri panelden "Çıkış Yap" demedikçe telefonda kalır; uzaktan silinemez. Telefonun ekran kilidi bu yüzden önemli.

**Ortak telefonda** işin bitince üst menüden **Çıkış Yap**: o telefondaki kopya silinir, veri bulutta kalır.

## 11. Geri alma

Kilitten sonra panel ya da çay ocakları çalışmıyorsa ve nedenini hemen bulamıyorsan:

1. **SQL Editor → New query** → `geri-al.sql` dosyasının tamamını yapıştır → **Run**.
2. `KİLİT GERİ ALINDI` satırını gör. Her şey kilitten önceki hâline döner.

**Bil ki:** geri alınca veri yeniden herkese açılır. Sorun çözülünce 7. adımı yeniden yap (`kilit.sql` tekrar çalıştırılabilir).
Geri alma hiçbir veriyi silmez; giriş hesapları ve panelin şifre ekranı yerinde kalır.

Sık görülenler:

| Belirti | Neden | Çözüm |
|---|---|---|
| Panel: "Bu hesabın panele girme izni yok" | Hesap izin listesinde değil | 10. adımdaki "hesap eklemek" |
| Araç: "Veritabani kilitli" | Araç giriş yapmamış | 9. adım |
| Araç: "Bu hesabin … izni yok" | Araç başka hesapla girmiş | Doğru hesapla `giris` ya da izin listesine ekle |
| Çay ocağında sipariş ekranı boş | Uygulama eski sürümde ya da katalog yok | Uygulamayı kapat-aç; `once-bak.sql` 6. satır; olmazsa geri al |

---

## Bu kilit neyi kapatır, neyi kapatmaz

**Kapatır:** `babuco:store` (bütün müşteri, borç, satış, alış fiyatı), `babuco:yedek:*` ve diğer bütün `babuco:*` satırları
artık yalnız izin listesindeki hesapça okunur ve yazılır. Katalog, duyurular ve ön ödeme kuralı herkesçe **okunur** ama
yalnız senin hesabınca yazılır (kimse sahte katalog ya da duyuru yayınlayamaz). "Tüm Verileri Sil" şifre ister ve önce yedek alır.

**Kapatmaz — bilerek bu tura bırakıldı, hâlâ açık:**

- **Çay ocaklarının parolaları.** `cayci-pos:users` satırında çay ocağı hesaplarının kullanıcı adı ve parolaları **düz yazıyla**
  duruyor ve uygulama anahtarını bilen herkes okuyabiliyor. Kilit buna dokunmuyor (dokunursa çay ocakları giriş yapamaz).
- **Çay ocaklarının verisi.** `cayci-pos:data:*` satırlarını (her çay ocağının satışları, stoğu) herkes okuyup değiştirebiliyor.
- **Bayi puanı.** `bayi_puan:*` satırlarını herkes değiştirebiliyor; biri kendine puan yazabilir.
- **Siparişler.** `siparisler` tablosuna bu betik hiç dokunmuyor; o tablonun bugünkü durumu `once-bak.sql`'de görünür.
  Açıksa çay ocağı adları, telefonları ve sipariş içerikleri okunabilir, sahte sipariş yazılabilir.
- **Geçmiş.** Veri bugüne kadar açıktı; biri kopyaladıysa kilit bunu geri alamaz. Depo da herkese açık.
  Aynı nedenle kilitten önce biri duyurulara ya da ön ödeme kurallarına bir şey yazdıysa o satır öyle kalır;
  kilitten sonra Duyurular sayfasına bir göz at.
- **Cihazdaki kopyalar.** Giriş yapılmış telefonda verinin bir kopyası durur (internetsiz çalışabilmek için).
  İndirilen yedek dosyaları ve bilgisayardaki `tools/yedek/` klasörü şifresizdir.

Bunların hepsi çay ocağı uygulamasına gerçek giriş (hesap başına ayrı yetki) eklenince kapanır; ayrı bir iş.

**Gizli tutulacak tek şey:** panodaki `service_role` / `secret` anahtarı. O anahtar bütün kilitleri aşar; hiçbir dosyaya,
hiçbir sohbete yazma. Uygulamalardaki anahtar (`sb_publishable_…`) gizli değildir, herkese açıktır; kilit ona göre kuruldu.
