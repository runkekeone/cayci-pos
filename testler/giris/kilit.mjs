// Veritabanı kilidinin kuralları (kilit.sql'in taklidi) + herkese açık katalog + çay ocağı tarafının okuması.
// Çalıştır: node testler/giris/kilit.mjs
// NOT: buradaki kurallar kilit.sql'in ELLE yazılmış taklididir (sahte-kilit.mjs). SQL'in kendisini gerçek
//      Postgres'te sınayan deneme ayrı: testler/giris/sql-dene.mjs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { panelAc, denetci, bekle, DEPO } from "../ortak/panel.mjs";
import { ornekStore, ornekSatirlar } from "../ortak/ornek-store.mjs";
import { kilitliBulut, TOPTANCI, YABANCI, sinif } from "./sahte-kilit.mjs";
import { girisFormu, tabanPaneli, TABAN_COMMIT } from "./yardimci.mjs";

const d = denetci("kilit");
const zaman = () => new Date().toISOString();
const baslangic = () => [
  ...ornekSatirlar(),
  { key: "babuco:yedek:2026-10-01", value: { customers: [{ ad: "yedekteki müşteri" }] } },
  { key: "duyurular", value: [{ id: "d1", tarih: "1 Eki", metin: "Deneme duyurusu" }] },
  { key: "babuco:on-siparis:policy:5550000002", value: { minPesinOrani: 0.4 } },
  { key: "bayi_puan:05550000002", value: { puan: 12 } },
  { key: "cayci-pos:data:u-1", value: { items: [] } },
  { key: "cayci-pos:users", value: [{ id: "u-1" }] },
];

// ---------- 1) dışarıdan (oturumsuz) biri ----------
{
  console.log("— dışarıdan biri (herkese açık anahtarla) —");
  const bulut = await kilitliBulut({ satirlar: baslangic() });
  try {
    const acikken = await bulut.istek("/rest/v1/kv?key=eq.babuco%3Astore&select=value");
    d.dogru(acikken.json.length === 1 && acikken.json[0].value.customers.length === 4, "ÖNCE (kilit yok): oturumsuz biri bütün müşteri/borç verisini okuyabiliyor");
    bulut.kilitle();
    const once = JSON.stringify(bulut.deger("babuco:store"));
    d.esit((await bulut.istek("/rest/v1/kv?key=eq.babuco%3Astore&select=value")).json, [], "kilitli: oturumsuz okuma boş döner (babuco:store)");
    d.esit((await bulut.istek("/rest/v1/kv?key=like.babuco%3Ayedek%3A*&select=key")).json, [], "kilitli: yedekler de görünmez");
    const gorunen = (await bulut.istek("/rest/v1/kv?select=key")).json.map((r) => r.key).sort();
    d.esit(gorunen, ["babuco:on-siparis:policy:5550000002", "bayi_puan:05550000002", "cayci-pos:data:u-1", "cayci-pos:users", "duyurular"], "kilitli: tüm tabloyu isteyen yalnız açık + çay ocağı satırlarını görür");
    const upsert = (key, value) => bulut.istek("/rest/v1/kv", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: { key, value, updated_at: zaman() } });
    d.esit((await upsert("babuco:store", { products: [], customers: [] })).durum, 401, "kilitli: oturumsuz biri babuco:store'un üstüne yazamaz");
    d.esit((await bulut.istek("/rest/v1/kv?key=eq.babuco%3Astore", { method: "PATCH", headers: { Prefer: "return=representation" }, body: { value: {} } })).json, [], "kilitli: koşullu güncelleme hiçbir satıra uymaz");
    await bulut.istek("/rest/v1/kv?key=eq.babuco%3Astore", { method: "DELETE" });
    d.dogru(JSON.stringify(bulut.deger("babuco:store")) === once, "kilitli: babuco:store silinemedi, değişmedi");
    d.esit((await upsert("babuco:katalog", { urunler: [{ id: "x", ad: "SAHTE", satis: 1 }] })).durum, 401, "kilitli: oturumsuz biri sahte katalog yayınlayamaz");
    d.esit((await upsert("duyurular", [{ metin: "sahte duyuru" }])).durum, 401, "kilitli: oturumsuz biri duyuru yazamaz");
    d.esit((await upsert("babuco:on-siparis:policy:5550000002", { minPesinOrani: 0 })).durum, 401, "kilitli: oturumsuz biri ön ödeme kuralını değiştiremez");
    d.esit((await upsert("babuco:yeni-bir-sey", { a: 1 })).durum, 401, "kilitli: yeni bir babuco:* anahtarı açılamaz (varsayılan ret)");
    d.esit((await upsert("baska:anahtar", { a: 1 })).durum, 401, "kilitli: tanınmayan anahtar açılamaz (varsayılan ret)");
    d.esit((await bulut.istek("/rest/v1/kv?key=eq.duyurular&select=value")).json[0].value[0].metin, "Deneme duyurusu", "kilitli: duyurular herkese açık okunur");
    d.esit((await bulut.istek("/rest/v1/kv?key=eq.babuco%3Aon-siparis%3Apolicy%3A5550000002&select=value")).json[0].value, { minPesinOrani: 0.4 }, "kilitli: ön ödeme kuralı herkese açık okunur");
    // çay ocağı uygulamasının bugünkü işleri sürüyor
    d.esit((await upsert("bayi_puan:05550000002", { puan: 7 })).durum, 201, "kilitli: bayi puanı bugünkü gibi yazılıyor");
    d.esit((await upsert("cayci-pos:data:u-1", { items: [1] })).durum, 201, "kilitli: çay ocağı verisi bugünkü gibi yazılıyor");
    d.esit((await upsert("cayci-pos:data:u-yeni", { items: [] })).durum, 201, "kilitli: yeni çay ocağı hesabı satır açabiliyor");
    d.esit(bulut.deger("cayci-pos:data:u-1"), { items: [1] }, "kilitli: çay ocağı verisi okunup yazıldı");
    d.dogru([401, 403].includes((await bulut.istek("/rest/v1/kv?key=eq.cayci-pos%3Adata%3Au-1", { method: "PATCH", body: { key: "babuco:store" } })).durum) && bulut.deger("cayci-pos:data:u-1") && JSON.stringify(bulut.deger("babuco:store")) === once, "kilitli: serbest bir satır babuco:store adına taşınamaz");
    await bulut.istek("/rest/v1/kv?key=eq.cayci-pos%3Ausers", { method: "DELETE" });
    d.dogru(!!bulut.deger("cayci-pos:users"), "kilitli: oturumsuz biri çay ocağı satırını silemez");
    d.esit((await bulut.istek("/rest/v1/rpc/babuco_yetkili", { method: "POST", body: {} })).json, false, "kilitli: oturumsuz biri için babuco_yetkili() = false");

    // giriş yapmış ama izin listesinde olmayan hesap
    const y = await bulut.girisYap(YABANCI), t = await bulut.girisYap(TOPTANCI);
    d.esit((await bulut.istek("/rest/v1/kv?key=eq.babuco%3Astore&select=value", { jeton: y.access_token })).json, [], "kilitli: izin listesinde olmayan hesap da okuyamaz");
    d.esit((await bulut.istek("/rest/v1/kv", { jeton: y.access_token, method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: { key: "babuco:store", value: {}, updated_at: zaman() } })).durum, 403, "kilitli: izin listesinde olmayan hesap yazamaz");
    d.esit((await bulut.istek("/rest/v1/rpc/babuco_yetkili", { jeton: y.access_token, method: "POST", body: {} })).json, false, "kilitli: izinsiz hesap için babuco_yetkili() = false");
    // yetkili toptancı
    d.esit((await bulut.istek("/rest/v1/kv?key=eq.babuco%3Astore&select=value", { jeton: t.access_token })).json[0].value.customers.length, 4, "kilitli: yetkili hesap babuco:store'u okur");
    d.esit((await bulut.istek("/rest/v1/kv?key=like.babuco%3Ayedek%3A*&select=key", { jeton: t.access_token })).json.length, 1, "kilitli: yetkili hesap yedekleri görür");
    d.esit((await bulut.istek("/rest/v1/kv", { jeton: t.access_token, method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: { key: "babuco:yedek:2026-10-02", value: { a: 1 }, updated_at: zaman() } })).durum, 201, "kilitli: yetkili hesap yeni yedek yazar");
    d.esit((await bulut.istek("/rest/v1/kv", { jeton: t.access_token, method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: { key: "duyurular", value: [], updated_at: zaman() } })).durum, 201, "kilitli: yetkili hesap duyuru yazar");
    d.esit((await bulut.istek("/rest/v1/rpc/babuco_yetkili", { jeton: t.access_token, method: "POST", body: {} })).json, true, "kilitli: yetkili hesap için babuco_yetkili() = true");
    d.dogru(sinif("babuco:katalog") === "acik" && sinif("babuco:katalogx") === "ozel" && sinif("bayi_puanx:1") === "bilinmeyen" && sinif("babuco:on-siparis:last:1") === "ozel", "anahtar sınıfları: benzer adlar yanlış sınıfa düşmüyor");
  } finally { await bulut.dur(); }
}

// ---------- 2) ÖNCE: eski panel kilitli veritabanında "bulut boş" sanıp yazmaya kalkıyor ----------
{
  console.log("\n— eski panel + kilitli veritabanı —");
  const bulut = await kilitliBulut({ satirlar: baslangic(), kilit: true });
  const once = JSON.stringify(bulut.deger("babuco:store"));
  const taban = tabanPaneli();
  const p = await panelAc({ bulutUrl: bulut.url, panelDizin: taban.dizin });
  try {
    await bekle(2500);
    const yazmaDenemesi = bulut.gunluk.filter((g) => g.yol === "/rest/v1/kv" && g.yontem === "POST");
    d.dogru(yazmaDenemesi.length >= 1 && yazmaDenemesi.every((g) => g.durum === 401), "ÖNCE (eski sürüm): veriyi göremeyince bulutu boş sanıp kendi boş kopyasını yazmayı denedi — kilit reddetti");
    d.dogru(JSON.stringify(bulut.deger("babuco:store")) === once, "kilit sayesinde buluttaki veri değişmedi");
  } finally { await p.kapat(); await bulut.dur(); taban.sil(); }
}

// ---------- 3) panel kataloğu yayınlıyor ----------
for (const kip of ["kilitsiz", "kilitli"]) {
  console.log("\n— katalog yayını (" + kip + ") —");
  const store = ornekStore();
  store.products.find((x) => x.id === "u6").gorunur = false;                // gizli ürün kataloğa girmemeli
  const bulut = await kilitliBulut({ satirlar: ornekSatirlar(store), kilit: kip === "kilitli" });
  const p = await panelAc({ bulutUrl: bulut.url });
  const { page } = p;
  try {
    await bekle(1500);
    d.dogru(bulut.deger("babuco:katalog") === undefined, kip + ": giriş yapılmadan katalog yazılmaz");
    await girisFormu(page, TOPTANCI.eposta, TOPTANCI.sifre);
    await page.waitForFunction(() => window.app.getStore().customers.length === 4);
    await bekle(3000);
    const k = bulut.deger("babuco:katalog");
    d.dogru(!!k && k.v === 1 && Array.isArray(k.urunler), kip + ": girişten sonra katalog yayınlandı");
    d.esit(k.urunler.map((u) => u.id), ["u1", "u2", "u3", "u4", "u5"], kip + ": görünür 5 ürün var, gizli ürün yok");
    d.esit([...new Set(k.urunler.flatMap((u) => Object.keys(u)))].sort(), ["ad", "barkod", "birim", "grup", "id", "satis"], kip + ": üründe yalnız 6 açık alan var");
    const metin = JSON.stringify(k);
    d.dogru(!/alis|stok|aracStok|kritik|customers|telefon|ozelFiyat|0555|Kıraathane|Çay Ocağı|Dernek/i.test(metin), kip + ": katalogda alış fiyatı, stok, müşteri adı/telefonu yok");
    d.esit(k.urunler.find((u) => u.id === "u3"), { id: "u3", ad: "Örnek Kola 250 ml", grup: "Gazlı İçecek", satis: 640, birim: "Koli", barkod: "" }, kip + ": ürün satırı beklenen biçimde");
    // herkese açık okunur; dışarıdan değiştirilemez (kilitliyken)
    d.esit((await bulut.istek("/rest/v1/kv?key=eq.babuco%3Akatalog&select=value")).json[0].value.urunler.length, 5, kip + ": katalog oturumsuz okunuyor");
    if (kip === "kilitli") d.esit((await bulut.istek("/rest/v1/kv", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: { key: "babuco:katalog", value: { urunler: [] }, updated_at: zaman() } })).durum, 401, "kilitli: katalog dışarıdan değiştirilemiyor");

    // fiyat değişince: store buluta yazıldı olayından sonra katalog güncellenir
    const yazim = bulut.satir("babuco:katalog").updated_at;
    await page.evaluate(() => { findProduct("u3").satis = 700; saveStore(); });
    await bekle(1800);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("babuco:bulut-yazildi")));
    await bekle(800);
    d.esit(bulut.deger("babuco:katalog").urunler.find((u) => u.id === "u3").satis, 700, kip + ": fiyat değişti → 'babuco:bulut-yazildi' olayında katalog güncellendi");
    // ürün değişmediyse yeniden yazmaz
    const yazim2 = bulut.satir("babuco:katalog").updated_at;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("babuco:bulut-yazildi")));
    await bekle(600);
    d.dogru(yazim2 !== yazim && bulut.satir("babuco:katalog").updated_at === yazim2, kip + ": ürünler değişmediyse katalog boşuna yeniden yazılmıyor");
    // açılış denetimi kataloğu BULUTTAKİ üründen çıkarır; eski yerel kopya kataloğu bozamaz
    await page.evaluate(() => { findProduct("u3").satis = 1; });      // yalnız bellekte, buluta gitmedi
    d.esit(await page.evaluate(() => katalogDenetle()), true, kip + ": katalog denetimi çalıştı");
    d.esit(bulut.deger("babuco:katalog").urunler.find((u) => u.id === "u3").satis, 700, kip + ": denetim buluttaki fiyatı esas aldı (eski yerel kopya kataloğu bozmadı)");
    // sunucu "yalnız şu parçayı ver" seçimini anlamazsa satırın tamamını okuyup yine doğru kataloğu çıkarır
    bulut.durum.jsonYoluYok = true;
    bulut.kv.delete("babuco:katalog");
    await page.evaluate(() => { _katalogSonOzet = ""; });
    d.esit(await page.evaluate(() => katalogDenetle()), true, kip + ": parça seçimi desteklenmese de katalog denetimi çalıştı");
    d.esit((bulut.deger("babuco:katalog") || { urunler: [] }).urunler.length, 5, kip + ": o durumda da katalog yeniden yayınlandı");
    bulut.durum.jsonYoluYok = false;
    // boş ürün listesi yayınlanmaz
    d.esit(await page.evaluate(() => katalogYaz(katalogUrunleri([]))), false, kip + ": boş katalog yayınlanmıyor");
    d.esit(bulut.deger("babuco:katalog").urunler.length, 5, kip + ": katalog boşalmadı");
    d.esit(p.hatalar, [], kip + ": betik hatası yok");
  } finally { await p.kapat(); await bulut.dur(); }
}

// ---------- 4) çay ocağı uygulaması: src/lib/cloud.ts → babucoKatalogGetir ----------
{
  console.log("\n— çay ocağı uygulaması kataloğu nasıl okuyor —");
  const istemciKok = createRequire(import.meta.url).resolve("@supabase/supabase-js");
  const ts = createRequire(import.meta.url)("typescript");
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "babuco-cloud-"));
  /** cloud.ts'i derleyip SAHTE buluta bağlı olarak yükler (gerçek adres hiçbir koşulda kalmaz). */
  async function cloudYukle(kaynak, bulutUrl, ad) {
    let js = ts.transpileModule(kaynak, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    js = js.replace(/import\.meta\.env/g, "(" + JSON.stringify({ VITE_SUPABASE_URL: bulutUrl, VITE_SUPABASE_KEY: "sahte" }) + ")")
      .replace(/https:\/\/[a-z0-9-]+\.supabase\.co/g, "http://gecersiz.invalid")
      .replace(/from ['"]@supabase\/supabase-js['"]/, "from " + JSON.stringify(pathToFileURL(istemciKok).href));
    if (/supabase\.co/.test(js)) throw new Error("güvenlik: derlenen cloud.ts içinde gerçek adres kaldı");
    const dosya = path.join(gecici, ad + "-" + Date.now() + ".mjs");
    fs.writeFileSync(dosya, js);
    return import(pathToFileURL(dosya).href);
  }
  const yeniKaynak = fs.readFileSync(path.join(DEPO, "src/lib/cloud.ts"), "utf8");
  const eskiKaynak = execFileSync("git", ["show", TABAN_COMMIT + ":src/lib/cloud.ts"], { cwd: DEPO, encoding: "utf8" });
  const store = ornekStore();
  store.products.find((x) => x.id === "u6").gorunur = false;
  const ozet = (liste) => liste && liste.map((k) => [k.id, k.name, k.category, k.buyUnit, k.koliPrice, k.adetPrice, k.active]);
  const bulut = await kilitliBulut({ satirlar: ornekSatirlar(store) });
  try {
    const yeni = await cloudYukle(yeniKaynak, bulut.url, "yeni"), eski = await cloudYukle(eskiKaynak, bulut.url, "eski");
    // a) katalog henüz yayınlanmamış, kilit yok → bugünkü gibi babuco:store'dan
    const eskiListe = await eski.babucoKatalogGetir();
    const yeniListe = await yeni.babucoKatalogGetir();
    d.dogru(eskiListe.length === 5, "eski sürüm: 5 ürün (karşılaştırma tabanı)");
    d.esit(ozet(yeniListe), ozet(eskiListe), "katalog yayınlanmadan önce: yeni sürüm eski yola düşüyor, sipariş ekranı aynı listeyi görüyor");
    // b) katalog yayınlandı → oradan okur, babuco:store'a hiç dokunmaz
    const { katalogUrunleri, katalogOzet } = createRequire(import.meta.url)(path.join(DEPO, "tools/babuco-kimlik.cjs"));
    const liste = katalogUrunleri(store.products);
    bulut.yaz("babuco:katalog", { v: 1, ozet: katalogOzet(liste), guncellendi: zaman(), urunler: liste });
    bulut.istekler.length = 0;
    const katalogdan = await yeni.babucoKatalogGetir();
    d.esit(ozet(katalogdan), ozet(eskiListe), "katalog yayınlandıktan sonra: sipariş ekranı yine aynı listeyi görüyor");
    d.dogru(bulut.istekler.length === 1 && /babuco%3Akatalog/.test(bulut.istekler[0].sorgu), "katalog varken babuco:store hiç istenmiyor (tek küçük istek)");
    d.dogru(katalogdan.every((k) => k.cost === undefined), "katalogdan gelen üründe toptancının alış maliyeti yok");
    d.dogru(eskiListe.some((k) => k.cost > 0), "ÖNCE: eski yol toptancının alış maliyetini çay ocağının telefonuna indiriyordu");
    // c) kilit kuruldu → yeni sürüm çalışır, eski sürüm boş kalır
    bulut.kilitle();
    d.esit(ozet(await yeni.babucoKatalogGetir()), ozet(eskiListe), "kilit kurulunca: yeni sürüm kataloğu okumaya devam ediyor");
    d.esit(await eski.babucoKatalogGetir(), null, "ÖNCE: kilit kurulunca eski sürümün sipariş ekranı boş kalırdı (bu yüzden önce yeni sürüm yayınlanmalı)");
    // d) kilit var, katalog yok → boş (kurulum sırası bunu engeller; kilit.sql katalog yoksa çalışmayı reddeder)
    bulut.kv.delete("babuco:katalog");
    d.esit(await yeni.babucoKatalogGetir(), null, "kilit var + katalog yok: liste boş (kurulum sırası bu durumu engelliyor)");
  } finally { await bulut.dur(); fs.rmSync(gecici, { recursive: true, force: true }); }
}

d.bitir();
