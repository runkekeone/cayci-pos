// ESKİ VERİ: yeni alanların hiçbiri olmayan (odemeTuru, alis, limit/vade, sabitGiderler… YOK) veriyle
// hiçbir ekran bozulmaz, rakamlar değişmez; kullanıcının alıştığı araç şablonları (fiş, müşteri tablosu,
// ekstre, haftalık) harfi harfine aynı kalır.
// Çalıştır: node testler/para/eski-veri.mjs
import { denetci } from "../ortak/panel.mjs";
import { ortam, git, statlar, paraSayi, ornekStore, gun, tabanVar, bekle } from "./ortak.mjs";

const d = denetci("para/eski-veri");
/** Olabildiğince "eski": müşterilerde limit/vade alanı bile yok, ayarlarda varsayılan vade yok, eski gün sonu raporu var. */
function eski() {
  const st = ornekStore();
  st.customers.forEach((c) => { delete c.limit; delete c.vade; });
  st.customers[3] = { id: "m4", ad: "Yeni Müşteri" };                                   // rehberden eklenen: yalnız ad
  st.servisRaporlari.push({ id: "r1", tarih: gun(3, 18), ziyaret: 4, ciro: 500, maliyet: 350, kar: 140, karYuzde: 28, gider: 250, nakit: 0, pos: 500, bakiye: 0, km: 12.4 });
  st.expenses.push({ id: "g0", tutar: 40 });                                             // türü, notu, tarihi olmayan bozuk gider
  st.payments.push({ id: "t0", musteriId: "m1", tutar: 0, tarih: gun(5) });             // notu olmayan tahsilat
  delete st.iadeler; delete st.firmaPayments;                                             // eksik koleksiyon
  return st;
}
const SAYFALAR = ["anasayfa", "dukkan", "satis", "musteriler", "musteri-detay", "musteri-analiz", "urun-analiz", "rapor-gunluk", "rapor-tarihsel", "rapor-urunsel", "rapor-grupsal", "giderler", "gelirler", "servis-raporlari", "rota", "servisciler"];

const o = await ortam(eski(), { diyalogKarar: () => false });
try {
  const page = o.page;
  await page.evaluate(() => { selectedCustomerId = "m2"; pos.carts[pos.active].musteriId = "m4"; });
  for (const s of SAYFALAR) {
    await git(page, s);
    const durum = await page.evaluate(() => ({ dolu: document.getElementById("view") ? document.getElementById("view").innerText.length : document.body.innerText.length, nan: /NaN|undefined|\[object/.test(document.body.innerText) }));
    d.dogru(durum.dolu > 20 && !durum.nan && o.p.hatalar.length === 0, "eski veriyle açılıyor: " + s + (o.p.hatalar.length ? " — " + o.p.hatalar[0] : ""));
  }
  // eski gün sonu raporu (komisyon/net alanı yok) eski etiketleriyle açılıyor
  await git(page, "servis-raporlari"); await page.click("[data-srview]"); await bekle(150);
  const m = await page.evaluate(() => document.querySelector(".modal-overlay .rapor-grid").innerText);
  d.dogru(/Nakit/.test(m) && /Pos/.test(m) && !/Net Kâr/.test(m) && !/NaN|undefined/.test(m), "eski gün sonu raporu eski alanlarıyla gösteriliyor");
  await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));
  // yeni hesaplar eski kayıtta makul varsayılanla çalışıyor
  const y = await page.evaluate(() => ({ m4: borcYas("m4"), lim: limitDurum("m4", 500), soru: limitUyariMetni("m2", 99999), tur: tahsilatTuru({}), kat: giderKategori({}), k: kasaHesap(null, null) }));
  d.esit([y.m4.borc, y.m4.gecikmis, y.m4.vade, y.lim.limit, y.lim.asim, y.soru, y.tur, y.kat], [0, false, 30, 0, 0, "", "nakit", "Genel"], "alansız müşteri: limit yok (soru sorulmaz), vade genel 30 gün; boş kayıt nakit / Genel sayılır");
  d.dogru(Object.values(y.k).every((v) => typeof v === "boolean" || Number.isFinite(v)), "kasaHesap eksik koleksiyon ve bozuk kayıtla da sayı döndürüyor (NaN yok)");
  // limitsiz müşteriye açık satış: soru yok, satış yazılır, kaleme alis eklenir
  await page.evaluate(() => { pos.carts[pos.active] = { items: [], musteriId: "m4", iskonto: 0, odenen: 0 }; window.app.addToCart("u1"); window.app.finalizeSale("acik"); }); await bekle(150);
  const s = await page.evaluate(() => store.sales[store.sales.length - 1]);
  d.esit([s.musteriId, s.odeme.acik, s.items[0].alis, o.p.diyaloglar.some((x) => /LİMİT/.test(x.mesaj))], ["m4", 100, 70, false], "alansız müşteriye açık satış eskisi gibi soru sormadan yazılıyor");
  d.esit(o.p.hatalar, [], "hiçbir ekranda betik hatası yok");
} finally { await o.kapat(); }

/* ---- Eski veride rakamlar ve şablonlar tabanla aynı ---- */
if (tabanVar) {
  const yeni = await ortam(eski(), { diyalogKarar: () => false }), tab = await ortam(eski(), { taban: true, diyalogKarar: () => false });
  try {
    const dun = gun(1).slice(0, 10), ucGun = gun(3).slice(0, 10);
    const urunsel = (pg) => pg.evaluate(() => { reportFilters["rapor-urunsel"] = { from: "2000-01-01", to: "2100-01-01" }; renderRaporUrunsel(); return sonUrunselRapor.list.map((x) => [x.ad, x.adet, x.tutar, x.mal]); });
    d.esit(await urunsel(yeni.page), await urunsel(tab.page), "eski veride Ürünsel rapor (ürün kârı) tabanla aynı");
    for (const g of [dun, ucGun]) {
      yeni.page.evaluate((x) => { reportFilters["rapor-gunluk"] = { from: x, to: x }; }, g); tab.page.evaluate((x) => { reportFilters["rapor-gunluk"] = { from: x, to: x }; }, g);
      await git(yeni.page, "rapor-gunluk"); await git(tab.page, "rapor-gunluk");
      const a = await statlar(yeni.page), b = await statlar(tab.page);
      // yeni ekranda "Toplam" ile "Ciro" tek rakam (Ciro), "Nakit Kasa Raporu" = "Kasadaki nakit"; para yazımı da değişti → sayı olarak karşılaştır
      d.esit(["Nakit", "Pos", "Açık Hesap", "Ciro", "Giderler", "Gelirler", "Kasadaki nakit", "Kâr", "Ciro", "Ürün Maliyeti"].map((x) => paraSayi(a[x])), ["Nakit", "Pos", "Açık Hesap", "Toplam", "Giderler", "Gelirler", "Nakit Kasa Raporu", "Kâr", "Ciro", "Ürün Maliyeti"].map((x) => paraSayi(b[x])), "eski veride Günlük Rapor rakamları tabanla aynı (" + g + ")");
    }
    // araç şablonları: harfi harfine aynı
    const es = async (args, ne) => { const a = await yeni.arac(args), b = await yeni.tabanArac(args); d.dogru(a.kod === 0 && a.cikti === b.cikti, ne + " çıktısı tabanla harfi harfine aynı"); };
    await es(["musteritablo", dun], "musteritablo");
    await es(["musteritablo", gun(40).slice(0, 10), "--tutar"], "musteritablo --tutar");
    await es(["ekstre", "Örnek Çay Ocağı"], "ekstre");
    await es(["haftalik"], "haftalik");
    await es(["haftalik", "--servis"], "haftalik --servis");
    await es(["satis", JSON.stringify({ musteri: "Deneme Kıraathanesi", kalemler: [{ urun: "Örnek Bardak Su", adet: 3 }, { urun: "Örnek Kola", adet: 1, fiyat: 630 }], odeme: { nakit: 500 }, stokKaynak: "arac" })], "satis fişi (uyarı gerektirmeyen satış)");
    await es(["satis", JSON.stringify({ musteri: "Sınama Derneği", kalemler: [{ urun: "Örnek Küp Şeker", adet: 4 }], odeme: { nakit: 1000 }, stokKaynak: "dukkan" }), "--duz"], "satis --duz (fazla ödemeli)");
    // kasa: aynı düzen; yalnız gidersiz gün uyarı satırı eklenir
    const k1 = await yeni.arac(["kasa", dun]), k0 = await yeni.tabanArac(["kasa", dun]);
    const uyarisiz = k1.cikti.split(/\r?\n/).filter((l, i, arr) => !/hiç gider yazılmamış/.test(l) && !(l === "" && /hiç gider yazılmamış/.test(arr[i - 1] || ""))).join("\n");
    d.esit(uyarisiz.replace(/\n+/g, "\n"), k0.cikti.replace(/\r/g, "").replace(/\n+/g, "\n"), "kasa çıktısı eski veride aynı düzen ve rakamlar (tek fark: gidersiz gün uyarı satırı)");
    for (const c of [["rapor", ucGun], ["aylik"], ["tahsilat-listesi"], ["limit"], ["sabit-gider"], ["kasa", ucGun]]) { const r = await yeni.arac(c); d.dogru(r.kod === 0 && !/NaN|undefined/.test(r.cikti), "araç eski veriyle çalışıyor: " + c.join(" ")); }
  } finally { await yeni.kapat(); await tab.kapat(); }
} else console.log("  (taban klasörü yok — taban karşılaştırması atlandı)");
d.bitir();
