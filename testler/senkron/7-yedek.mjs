// Senaryo 7: otomatik günlük yedek + Profil → Yedekleme ekranı + geri dönüş (panel).
//   · Günün İLK yazmasından önce buluttaki hâlin kopyası babuco:yedek:<gün> anahtarına bir kez yazılır.
//   · 30 günden eski yedekler silinir.
//   · Ekrandan seçilen güne dönülür: ne değişeceği söylenir, önce şimdiki hâlin yedeği alınır.
//   · Dosyadan geri yükleme de aynı güvenli yoldan geçer. Araya başka yazma girerse geri yükleme yapılmaz.
// Çalıştır: node testler/senkron/7-yedek.mjs      (ekran görüntüsü: _wt/ekran/senkron/)
import fs from "node:fs";
import path from "node:path";
import { senkronBulut, panel, aracCalistir, satis, hazir, esitlendi, yokla, kosul, denetci, bekle, ornekStore, ornekSatirlar, borc, bul, ayni, istGun, yedekSatiri, STORE } from "./yardimci.mjs";

const EKRAN = path.resolve(import.meta.dirname, "../../../ekran/senkron");
fs.mkdirSync(EKRAN, { recursive: true });
const d = denetci("7-yedek");
const ilk = ornekStore();
const bugun = istGun(0), GUNLUK = "babuco:yedek:" + bugun;

// Bulutta eskiden kalma yedekler: 1…35 gün öncesinin günlükleri + 40 gün öncesinden elle alınmış bir yedek
const eskiYedekler = [];
for (let n = 1; n <= 35; n++) eskiYedekler.push(yedekSatiri(istGun(n), { ...ilk, sales: ilk.sales.slice(0, 3) }));
eskiYedekler.push(yedekSatiri(istGun(40) + "-120000-elle", ilk, { tur: "elle" }));
eskiYedekler.push(yedekSatiri(istGun(2) + "-093000-silme-oncesi", ilk, { tur: "silme-oncesi" }));
const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk).concat(eskiYedekler) });

// Sorulara verilecek yanıtlar: yazdırmaya hayır, diğerlerine evet; istenirse onaydan ÖNCE bir iş çalıştır.
const sorular = []; let onaydanOnce = null;
const diyalog = async (dlg) => {
  sorular.push({ tur: dlg.type(), mesaj: dlg.message() });
  if (dlg.type() === "confirm" && /yazdırılsın/i.test(dlg.message())) return dlg.dismiss().catch(() => {});
  if (dlg.type() === "confirm" && onaydanOnce) { const f = onaydanOnce; onaydanOnce = null; await f(); }
  return dlg.accept().catch(() => {});
};
const A = await panel(bulut, { diyalog });
const B = await panel(bulut, { browser: A.browser });
const gunlukler = () => bulut.yedekAnahtarlari().filter((k) => /^babuco:yedek:\d{4}-\d{2}-\d{2}$/.test(k));
const yedekSekmesi = async (page) => {
  await page.evaluate(() => { location.hash = "#/profilim"; });
  await page.waitForSelector('li[data-ptab="2"]');
  await page.click('li[data-ptab="2"]');
  await page.waitForSelector(".yedek-satir", { timeout: 15000 });
};
const don = async (page, anahtarParcasi) => {       // listede anahtarı (başlığı) verilen yedeğin "Bu hâle dön" düğmesine bas
  const once = sorular.length;
  const i = await page.evaluate(async (parca) => { const l = await yedekListeGetir(); return l.findIndex((y) => y.key.includes(parca)); }, anahtarParcasi);
  if (await page.evaluate((n) => !document.querySelector('[data-yedek="' + n + '"]').offsetParent, i)) await page.click("#yedekHepsiBtn");   // eski yedekler katlı
  await page.click('[data-yedek="' + i + '"]');
  await kosul(() => sorular.slice(once).some((s) => s.tur === "alert"), 20000, "geri yükleme sonucunun bildirilmesi");
  await bekle(300);
  return sorular.slice(once);
};
try {
  await hazir(A.page); await hazir(B.page);
  d.dogru(!bulut.kv.has(GUNLUK), "bugün henüz yazma yok → bugünün yedeği de yok");

  // --- günün ilk yazması ---
  const s1 = await satis(A.page, "u1", "acik", "m1", 2);
  await esitlendi(A.page);
  const y1 = bulut.deger(GUNLUK);
  d.dogru(!!y1, "günün ilk yazmasıyla bugünün yedeği oluştu (" + GUNLUK + ")");
  d.dogru(!!y1 && ayni(y1.store, ilk), "yedek = yazmadan ÖNCEKİ bulut hâli (5 satış, yeni satış içinde yok)");
  d.dogru(!!y1 && y1.ozet.satis === 5 && y1.ozet.musteri === 4 && y1.ozet.tur === "gunluk", "yedeğin özeti doğru (5 satış · 4 müşteri)");
  d.dogru(!!bul(bulut.store().sales, s1.id), "satışın kendisi de buluta gitti");

  // --- aynı gün sonraki yazmalar yedeği DEĞİŞTİRMEZ (panel, araç, ikinci telefon) ---
  await satis(A.page, "u2", "nakit", null, 1); await esitlendi(A.page);
  const a1 = await aracCalistir(bulut, ["tahsilat", "Örnek Çay Ocağı", "100", "--kaydet"]);
  d.dogru(a1.kod === 0, "araç da aynı gün yazdı");
  await yokla(B.page); await esitlendi(B.page);
  await satis(B.page, "u3", "acik", "m3", 1); await esitlendi(B.page);
  d.dogru(ayni(bulut.deger(GUNLUK).store, ilk), "gün içindeki sonraki yazmalar bugünün yedeğini değiştirmedi");
  d.esit(gunlukler().filter((k) => k === GUNLUK).length, 1, "bugün için tek günlük yedek var");

  // --- 30 günden eskiler silindi ---
  await kosul(() => !bulut.kv.has("babuco:yedek:" + istGun(35)), 10000, "eski yedeklerin silinmesi");
  const kalan = bulut.yedekAnahtarlari();
  d.dogru(kalan.every((k) => k.slice(13, 23) > istGun(30)), "30 günden eski hiçbir yedek kalmadı (elle alınan 40 günlük dahil)");
  d.esit(gunlukler().length, 30, "son 30 günün günlük yedeği duruyor (29 eski + bugün)");
  d.dogru(bulut.kv.has("babuco:yedek:" + istGun(29)) && bulut.kv.has("babuco:yedek:" + istGun(2) + "-093000-silme-oncesi"), "sınırın içindeki yedeklere dokunulmadı");

  // --- Yedekleme ekranı ---
  await yokla(A.page); await esitlendi(A.page);
  const simdi = JSON.parse(JSON.stringify(bulut.store()));
  d.esit(simdi.sales.length, 8, "şu an bulutta 8 satış var (5 + 3)");
  await yedekSekmesi(A.page);
  const satirlar = await A.page.evaluate(() => [...document.querySelectorAll(".yedek-satir")].map((x) => x.querySelector(".ys-bilgi").textContent.replace(/\s+/g, " ").trim()));
  d.esit(satirlar.length, bulut.yedekAnahtarlari().length, "ekranda bütün yedekler listeleniyor (" + satirlar.length + ")");
  d.esit(await A.page.evaluate(() => [[...document.querySelectorAll(".yedek-satir")].filter((x) => x.offsetParent).length, (document.getElementById("yedekHepsiBtn") || {}).textContent]), [8, "Daha eski " + (satirlar.length - 8) + " yedeği göster"], "ilk açılışta son 8 yedek görünür, gerisi tek düğmeyle açılır");
  d.dogru(/Gün başlarken · 5 satış · 4 müşteri/.test(satirlar[0]), "ilk satır bugünün yedeği: \"" + satirlar[0] + "\"");
  d.dogru(satirlar.some((t) => /Silmeden önceki hâl/.test(t) && /09:30/.test(t)), "etiketli yedek okunur adıyla ve saatiyle görünüyor");
  const hedefler = await A.page.evaluate(() => [...document.querySelectorAll(".yedek-satir .btn, #yedekHepsiBtn, #yedekSimdiBtn")].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().height));
  d.dogru(hedefler.length === 10 && hedefler.every((h) => h >= 44), "düğmeler en az 44 px (" + hedefler.length + " düğme)");
  d.dogru(await A.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "390 px'te yatay taşma yok");
  await A.page.evaluate(() => { const e = document.getElementById("yedekDurum"); if (e) e.scrollIntoView(); window.scrollBy(0, -80); });
  await A.page.screenshot({ path: path.join(EKRAN, "yedek-listesi.png") });

  // --- bugünün yedeğine dön ---
  let konusma = await don(A.page, bugun);
  const onay = konusma.find((s) => s.tur === "confirm");
  d.dogru(!!onay && /Silinecek[^\n]*3 satış/.test(onay.mesaj) && /1 tahsilat/.test(onay.mesaj), "onay sorusu ne kadar kaydın değişeceğini söylüyor");
  console.log("      onay metni: " + (onay ? onay.mesaj.replace(/\n+/g, " | ") : "(yok)"));
  d.dogru(konusma.some((s) => s.tur === "alert" && /Geri yüklendi/.test(s.mesaj)), "\"Geri yüklendi\" bildirildi");
  let s = bulut.store();
  d.esit([s.sales.length, s.payments.length, bul(s.products, "u1").stok, borc(s, "m1"), borc(s, "m2")], [5, 2, 40, borc(ilk, "m1"), borc(ilk, "m2")], "bulut bugünün başındaki hâle döndü (satış, tahsilat, stok, borç)");
  const onceKey = bulut.yedekAnahtarlari().find((k) => k.endsWith("-geri-donus-oncesi"));
  d.dogru(!!onceKey && ayni({ ...bulut.deger(onceKey).store, esitleme: 0 }, { ...simdi, esitleme: 0 }), "dönmeden önceki hâlin yedeği alındı (8 satışlı hâl)");
  d.esit(await A.page.evaluate(() => [store.sales.length, customerBorc("m1"), findProduct("u1").stok]), [5, borc(ilk, "m1"), 40], "telefon da geri dönülen hâli gösteriyor");
  await yokla(B.page); await esitlendi(B.page);
  d.esit(await B.page.evaluate(() => store.sales.length), 5, "diğer telefon da geri dönülen hâli aldı");

  // --- vazgeç: dönmeden önceki hâle geri dön ---
  await yedekSekmesi(A.page);
  konusma = await don(A.page, "-geri-donus-oncesi");
  d.dogru(/Geri gelecek[^\n]*3 satış/.test((konusma.find((x) => x.tur === "confirm") || {}).mesaj || ""), "vazgeçerken onay \"3 satış geri gelecek\" diyor");
  s = bulut.store();
  d.dogru(ayni({ ...s, esitleme: 0 }, { ...simdi, esitleme: 0 }), "dönüşten vazgeçilebildi: 8 satışlı hâl aynen geri geldi");

  // --- araya başka yazma girerse geri yükleme YAPILMAZ ---
  await yedekSekmesi(A.page);
  onaydanOnce = async () => { const a = await aracCalistir(bulut, ["tahsilat", "Sınama Derneği", "40", "--kaydet"]); if (a.kod !== 0) throw new Error(a.cikti); };
  konusma = await don(A.page, bugun);
  d.dogru(konusma.some((x) => x.tur === "alert" && /başka bir cihazdan kayıt girildi/.test(x.mesaj)), "onay beklerken araç yazdı → geri yükleme yapılmadı, kullanıcıya söylendi");
  s = bulut.store();
  d.esit([s.sales.length, s.payments.some((x) => x.tutar === 40)], [8, true], "bulut değiştirilmedi; aracın tahsilatı duruyor");

  // --- dosyadan geri yükleme (JSON) aynı güvenli yoldan ---
  const once = sorular.length;
  await A.page.evaluate((metin) => window.app.importBackup(metin), JSON.stringify(ilk));
  d.dogru(sorular.slice(once).some((x) => x.tur === "confirm" && /Seçtiğin dosya/.test(x.mesaj) && /Silinecek/.test(x.mesaj)), "dosyadan yüklerken de ne değişeceği soruldu");
  s = bulut.store();
  d.esit([s.sales.length, s.payments.length], [5, 2], "dosyadaki hâl buluta yazıldı");
  d.dogru(bulut.yedekAnahtarlari().some((k) => k.endsWith("-dosya-oncesi")), "dosyadan yüklemeden önce de yedek alındı");
  d.dogru(bulut.storeYazmalari().every((y) => y.yontem === "PATCH" && y.kosullu), "geri yüklemeler dahil bütün yazmalar koşullu");

  // --- yedekAl(etiket) bağlantı noktası ---
  d.esit(await A.page.evaluate(() => yedekAl("silme-oncesi")), true, "yedekAl(\"silme-oncesi\") true döndü");
  const silmeOncesi = bulut.yedekAnahtarlari().filter((k) => k.startsWith(GUNLUK + "-") && k.endsWith("-silme-oncesi"));
  d.dogru(silmeOncesi.length === 1 && bulut.deger(silmeOncesi[0]).store.sales.length === 5, "o anki bulut hâli babuco:yedek:<gün>-<saat>-silme-oncesi olarak kaydedildi");
  bulut.kapat();
  d.esit(await A.page.evaluate(() => yedekAl("x")), false, "internet yokken yedekAl false döner");
  bulut.ac();
  d.esit(A.hatalar.concat(B.hatalar), [], "sayfalarda betik hatası yok");
} catch (e) { d.dogru(false, "senaryo yarıda kesildi: " + e.message); }
finally { await B.kapat(); await A.kapat(); await bulut.dur(); }

// --- yedek yazılamazsa satış bekletilmez; sonraki yazmada yine denenir ---
{
  const bulut2 = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
  bulut2.ayar.yedekYazmaHatasi = true;
  const p = await panel(bulut2);
  try {
    await hazir(p.page);
    const ps = await satis(p.page, "u1", "nakit", null, 1); await esitlendi(p.page);
    d.dogru(!!bul(bulut2.store().sales, ps.id) && !bulut2.kv.has(GUNLUK), "yedek alınamadı ama satış buluta gitti (satış bekletilmez)");
    d.dogru(await p.page.evaluate(() => !!_esDurum.yedekHata), "yedeğin alınamadığı kayda geçti (Yedekleme ekranında görünür)");
    bulut2.ayar.yedekYazmaHatasi = false;
    await satis(p.page, "u1", "nakit", null, 1); await esitlendi(p.page);
    d.dogru(bulut2.kv.has(GUNLUK) && bulut2.deger(GUNLUK).store.sales.length === 6, "sonraki yazmada yedek yeniden denendi ve alındı");
    d.dogru(await p.page.evaluate(() => !_esDurum.yedekHata), "uyarı kalktı");
  } catch (e) { d.dogru(false, "yedek hatası bölümü yarıda kesildi: " + e.message); }
  finally { await p.kapat(); await bulut2.dur(); }
}
d.bitir();
