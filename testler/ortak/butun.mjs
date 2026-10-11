// Uçtan uca deneme: dört bölümün GERÇEK kodu birlikte — giriş + kilitli veritabanı + eşitleme/yedek + para + stok + araç.
// (Bölümlerin kendi denemeleri birbirini taklit ediyordu; bu dosya taklitsiz hâlini sınar.)
// Çalıştır: node testler/ortak/butun.mjs
import os from "node:os";
import path from "node:path";
import { panelAc, aracCalistir, denetci, bekle } from "./panel.mjs";
import { ornekStore, ornekSatirlar, borc } from "./ornek-store.mjs";
import { kilitliBulut, TOPTANCI } from "../giris/sahte-kilit.mjs";
import { girisFormu, girisEkraniVar } from "../giris/yardimci.mjs";

const d = denetci("butun");
const bulut = await kilitliBulut({ satirlar: ornekSatirlar(), kilit: true });
const store = () => bulut.deger("babuco:store");
const bekleKi = async (kosul, ms = 12000) => { const s = Date.now(); while (Date.now() - s < ms) { if (kosul()) return true; await bekle(150); } return false; };
const oturumDosya = path.join(os.tmpdir(), "babuco-butun-" + process.pid + ".json");
const girisli = { env: { BABUCO_EPOSTA: TOPTANCI.eposta, BABUCO_SIFRE: TOPTANCI.sifre, BABUCO_OTURUM_DOSYA: oturumDosya } };

const p = await panelAc({ bulutUrl: bulut.url, oturumsuz: true });
try {
  const page = p.page;
  console.log("— giriş + kilitli veritabanı");
  d.dogru(await girisEkraniVar(page), "oturumsuz açılışta giriş ekranı var");
  d.esit(await page.evaluate(() => store.customers.length), 0, "girişten önce ekranda müşteri yok");
  d.esit(await girisFormu(page, TOPTANCI.eposta, TOPTANCI.sifre), "", "doğru şifreyle girildi");
  await page.waitForFunction(() => store.customers.length === 4, null, { timeout: 15000 });
  d.dogru(true, "girişten sonra veri kilitli veritabanından geldi");

  console.log("— panel satışı: koşullu yazma + günlük yedek + açık katalog");
  await page.evaluate(() => { addToCart("u2"); finalizeSale("nakit"); });
  d.dogru(await bekleKi(() => store().sales.length === 6), "panelin satışı buluta gitti");
  const yedekler = [...bulut.kv.keys()].filter((k) => /^babuco:yedek:\d{4}-\d{2}-\d{2}$/.test(k));
  d.esit(yedekler.length, 1, "günün ilk yazmasından önce bir günlük yedek alındı");
  d.esit(yedekler.length ? bulut.deger(yedekler[0]).store.sales.length : null, 5, "yedek, yazmadan ÖNCEKİ hâli tutuyor (5 satış)");
  d.dogru(await bekleKi(() => !!bulut.deger("babuco:katalog")), "açık katalog yayınlandı");
  const katalog = JSON.stringify(bulut.deger("babuco:katalog") || {});
  d.dogru(/Örnek Kola/.test(katalog) && !/"alis"|"stok"|aracStok|telefon|Deneme Kıraathanesi/.test(katalog), "katalogda ürün var; alış fiyatı, stok, müşteri yok");
  d.esit(store().sales[5].items[0].alis, 120, "satış kalemi o anki alış fiyatını taşıyor (maliyet sabitlendi)");

  console.log("— araç, panel açıkken yazıyor; panel onu silmiyor");
  const kilitliDurum = await aracCalistir(bulut.url, ["durum"], { env: { BABUCO_OTURUM_DOSYA: oturumDosya } });
  d.dogru(kilitliDurum.kod !== 0 && /kilitli/i.test(kilitliDurum.cikti), "oturumsuz araç kilitli veritabanında veri alamıyor, nedenini söylüyor");
  const t = await aracCalistir(bulut.url, ["tahsilat", "Örnek Çay Ocağı", "300", "--tur=kart", "--kaydet"], girisli);
  d.dogru(t.kod === 0 && /KAYDEDILDI/.test(t.cikti), "girişli araç tahsilatı kaydetti");
  const tah = store().payments[store().payments.length - 1];
  d.esit([tah.musteriId, tah.tutar, tah.odemeTuru], ["m2", 300, "kart"], "tahsilat türüyle (kart) yazıldı");
  // Panel hâlâ ESKİ hâli tutuyor; şimdi veresiye satış yapıyor (limit 3000, borç zaten yüksek → onay sorusu "Tamam").
  await page.evaluate(() => { activeCart().musteriId = "m2"; addToCart("u4"); finalizeSale("acik"); });
  d.dogru(await bekleKi(() => store().sales.length === 7), "panelin ikinci satışı buluta gitti");
  const son = store();
  d.esit(son.payments.filter((x) => x.odemeTuru === "kart" && x.tutar === 300).length, 1, "aracın tahsilatı panelin yazmasından sonra da duruyor (ezilmedi)");
  d.esit(borc(son, "m2"), borc(ornekStore(), "m2") - 300 + 2000, "borç doğru: eski − 300 tahsilat + 2000 veresiye");
  d.esit(son.products.find((x) => x.id === "u2").stok, 29, "stok: panelin ilk satışı düşmüş");
  d.dogru(p.diyaloglar.some((x) => /limit/i.test(x.mesaj)), "limit aşımında satıcıya soruldu");
  await page.waitForFunction(() => store.payments.some((x) => x.odemeTuru === "kart" && x.tutar === 300), null, { timeout: 15000 });
  d.dogru(true, "aracın tahsilatı panelin ekranına da geldi");

  console.log("— kasa: panel ile araç aynı rakamı veriyor");
  const bugun = await page.evaluate(() => todayStr());
  const panelKasa = await page.evaluate((g) => kasaHesap(g, g).nakitKasa, bugun);
  const aracKasa = await aracCalistir(bulut.url, ["kasa", bugun, "--json"], girisli);
  let aracNakit = null; try { aracNakit = JSON.parse(aracKasa.cikti.slice(aracKasa.cikti.indexOf("{"))).nakitKasa; } catch (e) {}
  d.esit(aracNakit, panelKasa, "bugünün nakit kasası iki tarafta aynı (kart tahsilatı nakde sayılmadı)");
  d.esit(panelKasa, 170, "nakit kasa = yalnız nakit satış (170)");

  console.log("— stok aracı + sipariş uyarısı kanalı");
  const al = await aracCalistir(bulut.url, ["alim", JSON.stringify({ hedef: "arac", odeme: "pesin", odemeTuru: "nakit", kalemler: [{ urun: "Örnek Soda", adet: 5, alis: 190 }] }), "--kaydet"], girisli);
  d.dogru(al.kod === 0, "araçla mal alımı kaydedildi");
  const s3 = store();
  d.esit([s3.products.find((x) => x.id === "u6").aracStok, s3.purchases.length, s3.purchases[0] && s3.purchases[0].odemeTuru], [5, 1, "nakit"], "alım stoğa girdi ve alış kaydı oluştu");
  const aracKasa2 = await aracCalistir(bulut.url, ["kasa", bugun, "--json"], girisli);
  let nakit2 = null; try { nakit2 = JSON.parse(aracKasa2.cikti.slice(aracKasa2.cikti.indexOf("{"))).nakitKasa; } catch (e) {}
  d.esit(nakit2, 170 - 950, "peşin nakit mal alımı kasadan bir kez düştü (170 − 950)");

  console.log("— tüm verileri sil: gerçek yedekle");
  await page.evaluate(() => { location.hash = "#/profilim"; });
  await page.waitForSelector("#wipeBtn", { state: "attached" });
  const hata = await page.evaluate((sifre) => verileriSil(sifre, "SİL"), TOPTANCI.sifre);
  d.esit(hata || "", "", "şifre + SİL ile silme tamamlandı");
  d.dogru(await bekleKi(() => store().sales.length === 0 && store().customers.length === 0), "bulut boşaldı");
  const silYedek = [...bulut.kv.keys()].find((k) => /silme-oncesi/.test(k));
  d.dogru(!!silYedek && bulut.deger(silYedek).store.sales.length === 7, "silmeden önceki hâl bulutta yedekte (7 satış)");
  d.esit(p.hatalar, [], "sayfada betik hatası yok");
} finally {
  await p.kapat();
  await bulut.dur();
}
d.bitir();
