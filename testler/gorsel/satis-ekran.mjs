// Satış ekranının uç durumlarının görüntüsünü alır (390 px ve 360 px) → _wt/ekran/g-satis/sonra/*.png. Gözle bakmak için.
// Çalıştır: node testler/gorsel/satis-ekran.mjs [yalnız-şu-ad-parçası]
import { gsAc, bekle, tasma } from "./satis-ortak.mjs";

const SUZ = process.argv[2] || "";
const o = await gsAc({ diyalog: (d) => d.dismiss().catch(() => {}) });
const { page, git } = o;
const tasmalar = [];
let K = "sonra";
const cek = async (ad, tam) => { if (SUZ && !ad.includes(SUZ)) return; await o.cek(K, ad, tam); const t = await tasma(page); if (t > 0) tasmalar.push(K + "/" + ad + ": " + t + " px"); };
const sepet = async (musteriId, urunler, ek) => {
  await page.evaluate(([m, u, e]) => {
    pos.carts.forEach((c, n) => { pos.carts[n] = newCart(); }); pos.active = 0; pos.cat = "ANA"; pos.q = "";
    activeCart().musteriId = m; u.forEach((x) => addToCart(x)); Object.assign(activeCart(), e || {});
  }, [musteriId, urunler, ek || null]);
  await git("satis");
};
const sepetAc = async () => { await page.click("#gsSepetAc"); await bekle(600); };   // pencere açıldıktan sonraki ilk 450 ms dokunuş sayılmaz
const kapat = () => page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));
const ONIKI = ["u1", "u1", "u2", "u3", "u4", "u5", "u11", "u12", "u13", "u15", "u16", "u18", "u22", "u24"];

async function tur(etiket) {
  K = etiket;
  await sepet(null, []); await cek("01-bos-sepet"); await cek("01b-bos-sepet-tam", true);
  await sepet(null, ["u1"]); await cek("02-bir-urun");
  await sepetAc(); await cek("02b-bir-urun-sepet"); await kapat();
  await sepet("m1", ONIKI); await cek("03-on-iki-urun"); await cek("03b-on-iki-urun-tam", true);
  await sepetAc(); await cek("03c-on-iki-urun-sepet");
  await page.evaluate(() => { const b = document.querySelector("#gsSepetOv .modal-body"); b.scrollTop = b.scrollHeight; }); await cek("03d-on-iki-urun-sepet-sonu"); await kapat();
  await sepet("m6", ["u21", "u21", "u26", "u26", "u26", "u26", "u26", "u26", "u26", "u26", "u26", "u26"]); await cek("04-uzun-ad-buyuk-tutar");
  await page.evaluate(() => { pos.cat = "Sodalar"; posGridYenile(); }); await cek("04b-uzun-ad-kart");
  await sepetAc(); await cek("04c-uzun-ad-sepet"); await kapat();
  await sepet("m5", ["u1", "u3", "u4"]); await cek("05-limit-asmis-gecikmis");
  await sepetAc(); await cek("05b-limit-asmis-sepet"); await kapat();
  await sepet("m2", ["u4"]); await cek("05c-limit-asilacak");
  await sepet(null, ["u1", "u3"]); await sepetAc(); await cek("06-musterisiz-sepet"); await kapat();
  // ikinci sepet
  await sepet("m1", ["u1", "u3"]); await page.evaluate(() => { pos.active = 1; activeCart().musteriId = "m6"; addToCart("u2"); render(); }); await bekle(250); await cek("07-ikinci-sepet");
  await page.evaluate(() => { pos.active = 2; render(); }); await bekle(250); await cek("07b-ucuncu-sepet-bos");
  // kategori / arama
  await sepet(null, ["u1"]); await page.evaluate(() => { pos.cat = "Su"; posGridYenile(); }); await cek("08-kategori-secili"); await cek("08b-kategori-secili-tam", true);
  await page.evaluate(() => { pos.cat = "ANA"; }); await git("satis"); await page.fill("#prodSearch", "su"); await bekle(200); await cek("09-arama-sonucu");
  await page.fill("#prodSearch", "zzz yok"); await bekle(200); await cek("09b-arama-bos");
  // klavye açıkken: görünen alan yarıya iner
  await page.setViewportSize({ width: page.viewportSize().width, height: 430 }); await page.fill("#prodSearch", "örnek"); await page.focus("#prodSearch"); await bekle(600); await cek("10-klavye-acik-arama");
  await sepet("m1", ["u1", "u3", "u4"]); await sepetAc(); await cek("10b-klavye-acik-sepet"); await kapat();
  await page.setViewportSize({ width: page.viewportSize().width, height: etiket === "sonra" ? 844 : 780 }); await bekle(200);
  // pencereler
  await sepet("m1", ["u1", "u3"]); await sepetAc(); await page.click('.gs-kalem[data-line="0"] [data-lineac]'); await bekle(300); await cek("11-satir-penceresi"); await kapat();
  await git("satis"); await page.click("#gsDiger"); await bekle(300); await cek("12-diger-menu"); await kapat();
  await page.click("#stokModBtn"); await bekle(300); await cek("13-stok-kaynagi"); await kapat();
  await page.click("#gsMusteri [data-gs-muspick]"); await bekle(300); await cek("14-musteri-sec"); await kapat();
  // araç stoğu yetmeyen ürün + iskonto + not
  await page.evaluate(() => stokModuAyarla("arac")); await sepet("m1", ["u14", "u19", "u19", "u1"], { iskonto: 50, not: "kapıya bırakıldı" }); await page.evaluate(() => { pos.cat = "Meyve Suyu"; posGridYenile(); }); await cek("15-arac-stok-yetmiyor");
  await sepetAc(); await cek("15b-arac-stok-sepet"); await kapat(); await page.evaluate(() => stokModuAyarla("dukkan"));
  // bekleyen sipariş şeridi varken: üst çubuğun üstünde boşluk kalmamalı
  await sepet("m1", ["u1"]);
  await page.evaluate(() => { store.gelenSiparisler.push({ id: "gsip1", orderId: "ord-1", dealer: "Yıldız Çay Evi", dealerTel: "05550000006", not: "", tarih: new Date().toISOString(), alindi: new Date().toISOString(), durum: "yeni", items: [{ urunId: "u1", ad: "Örnek Bardak Su 200 ml", birim: "Koli", adet: 5, fiyat: 100 }], brut: 500, iskonto: 0, toplam: 500, odemeTuru: "bakiye", pesinNakit: 0, pesinKart: 0, bakiyeTutar: 500, minPesinOran: 0, minPesinTutar: 0, teklifNo: "", fisNo: "", teslimTarih: "", teslimSaat: "", saleId: "" }); render(); });
  await bekle(250); await cek("16-siparis-seridi");
  // üstte "İnternet yok" şeridi de varken (sabit şerit sayfayı aşağı iter)
  await page.evaluate(() => { _esDurum.cevrimdisi = true; esSeritCiz(); }); await bekle(200); await cek("16b-internet-yok-seridi");
  await sepetAc(); await cek("16c-internet-yok-sepet"); await kapat();
  await page.evaluate(() => { _esDurum.cevrimdisi = false; esSeritCiz(); });
  await page.evaluate(() => { store.gelenSiparisler = store.gelenSiparisler.filter((x) => x.id !== "gsip1"); render(); }); await bekle(150);
  // ek işlevler: sık satılanlar, çeşit seçimi (gelişmiş), personel, özel ödeme tipleri
  await page.evaluate(() => {
    ["u1", "u3", "u4"].forEach((id) => { findProduct(id).anaUrun = true; });
    ["u22", "u23", "u6"].forEach((id) => { findProduct(id).altKategori = "Meyveli Soda"; });
    store.personeller = [{ id: "p1", ad: "Deneme Personel" }]; store.odemeTipleri = [{ id: "o1", ad: "Havale", kasa: "Banka" }, { id: "o2", ad: "Yemek Kartı", kasa: "Banka" }];
    gelismisModAyarla(true);
  });
  await sepet("m1", ["u1", "u22"]); await cek("17-sik-satilanlar"); await cek("17b-sik-satilanlar-tam", true);
  await page.evaluate(() => { pos.cat = "Sodalar"; posGridYenile(); }); await cek("17c-cesit-dugmesi");
  await page.click('[data-cesit="u22"]'); await bekle(300); await cek("17d-cesit-penceresi"); await kapat();
  await sepetAc(); await page.evaluate(() => { const b = document.querySelector("#gsSepetOv .modal-body"); b.scrollTop = b.scrollHeight; }); await cek("17e-personel-ozel-odeme"); await kapat();
  await page.evaluate(() => {
    ["u1", "u3", "u4"].forEach((id) => { findProduct(id).anaUrun = false; }); ["u22", "u23", "u6"].forEach((id) => { delete findProduct(id).altKategori; });
    store.personeller = []; store.odemeTipleri = []; gelismisModAyarla(false);
  });
}

// rota sihirbazı: satış adımı (aynı ürün kartları + sihirbazın kendi sepeti)
async function rota(etiket) {
  K = etiket;
  await page.evaluate(() => { pos.carts.forEach((c, n) => { pos.carts[n] = newCart(); }); pos.active = 0; servisBaslat(["m1", "m2"]); }); await bekle(400);
  await page.evaluate(() => { servis.stokBitti = true; servis.adim = "urun"; pos.cat = "ANA"; pos.q = ""; activeCart().musteriId = servis.acik; render(); }); await bekle(300);
  await cek("20-rota-urun-adimi", true);
  await page.click('#prodGrid [data-catopen="Su"]'); await bekle(200); await page.click('#prodGrid [data-add="u1"]'); await page.click('#prodGrid [data-add="u1"]'); await page.click('#prodGrid [data-add="u2"]'); await bekle(200);
  await cek("20b-rota-urun-secili", true);
  await page.evaluate(() => document.getElementById("prodGrid").scrollIntoView({ block: "start" })); await cek("20d-rota-urun-kartlari");
  await page.evaluate(() => document.getElementById("sihirSepet").scrollIntoView({ block: "center" })); await cek("20e-rota-sepet");
  await page.click("#odemeGec"); await bekle(300); await cek("20c-rota-odeme-adimi");
  await page.evaluate(() => { servisBitir(); }); await bekle(300); await page.evaluate(() => { document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()); stokModuAyarla("dukkan"); });
}

try {
  await tur("sonra"); await rota("sonra");
  await page.setViewportSize({ width: 360, height: 780 });
  await tur("sonra-360"); await rota("sonra-360");
  // masaüstü (kullanılmıyor; bozuk olmadığına bakmak için)
  K = "sonra"; await page.setViewportSize({ width: 1280, height: 800 }); await sepet("m5", ["u1", "u3"]); await cek("30-masaustu"); await sepetAc(); await cek("30b-masaustu-sepet"); await kapat();
  console.log("yatay taşma:", tasmalar.length ? tasmalar.join(" | ") : "yok");
  console.log("betik hatası:", JSON.stringify(o.p.hatalar));
} finally { await o.kapat(); }
process.exit(0);
