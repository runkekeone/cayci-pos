// Rota sihirbazının satış adımı satış ekranıyla aynı ürün kartlarını ve sepeti (pos.carts) kullanıyor:
// yeni kartlarla da çalıştığını DOKUNUŞLARLA doğrular — rota başlat → müşteriye gir → ürün ekle → satışı tamamla.
// Çalıştır: node testler/gorsel/satis-rota.mjs
import { gsAc, bekle, denetci, tasma } from "./satis-ortak.mjs";

const d = denetci("gorsel/satis-rota");
const mesajlar = [];
const o = await gsAc({ diyalog: async (dl) => { mesajlar.push(dl.type() + ": " + dl.message()); await dl.accept(dl.type() === "prompt" ? dl.defaultValue() : undefined).catch(() => {}); } });
const { page } = o;
const yazi = (sec) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/ /g, " ").replace(/\s+/g, " ").trim() : null; }, sec);
const tl = (n) => page.evaluate((x) => money.format(x), n);
const bekleKi = async (kosul, ms = 8000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await kosul()) return true; await bekle(120); } return false; };

try {
  console.log("— rota başlat → araç stok kontrolü → müşteri");
  await page.click('.mobilbar [data-mroute="rota"]'); await bekle(350);
  await page.click('[data-rbaslat="r1"]'); await bekle(400);
  d.esit(await page.evaluate(() => [servis.aktif, servis.stokBitti, stokModu]), [true, false, "arac"], "kayıtlı rota başlatıldı; stok kaynağı araca geçti");
  await page.click("#skHepsi"); await page.click("#skBitir"); await bekle(400);
  d.esit(await page.evaluate(() => [servis.stokBitti, servis.acik, servis.adim]), [true, "m1", "onay"], "stok kontrolü geçildi, ilk durak açıldı");
  await page.click("[data-sonay]"); await bekle(250);
  await page.click("[data-satvar]"); await bekle(300);
  d.esit(await page.evaluate(() => [servis.adim, activeCart().musteriId, activeCart().items.length]), ["urun", "m1", 0], "ürün adımı: sepet durağın müşterisine açıldı");

  console.log("— ürün adımı: satış ekranıyla aynı kartlar");
  d.dogru(await page.evaluate(() => document.querySelectorAll("#prodGrid .gs-kat[data-catopen]").length) >= 10, "kategoriler aynı renkli bloklarla geldi");
  d.esit(await page.evaluate(() => (document.querySelector(".sihir").innerHTML.match(/\p{Extended_Pictographic}/gu) || []).filter((x) => document.querySelector("#prodGrid").innerHTML.includes(x) || document.querySelector("#sihirSepet").innerHTML.includes(x))), [], "kartlarda ve sepette emoji yok");
  await page.click('#prodGrid [data-catopen="Su"]'); await bekle(200);
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#prodGrid .gs-urun[data-add]")].map((e) => e.dataset.add)), ["u1", "u2", "u27", "u28", "u29", "u30"], "kategoriye dokununca ürün kartları geldi");
  const kart = await yazi('#prodGrid [data-add="u1"]');
  d.dogru(kart.includes(await tl(90)) && /özel/.test(kart) && /Araçta 20/.test(kart), "kartta müşterinin fiyatı (90, özel) ve ARAÇ stoğu yazıyor");
  await page.click('#prodGrid [data-add="u1"]'); await page.click('#prodGrid [data-add="u1"]'); await page.click('#prodGrid [data-add="u2"]'); await bekle(200);
  d.esit(await page.evaluate(() => activeCart().items.map((i) => [i.urunId, i.adet, i.fiyat])), [["u1", 2, 90], ["u2", 1, 170]], "karta dokunmak sepete ekliyor");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#prodGrid .gs-urun.sepette")].map((e) => [e.dataset.add, e.querySelector("[data-gs-adet]").textContent])), [["u1", "2"], ["u2", "1"]], "kartlarda sepetteki adet işareti");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#sihirSepet .ss-row")].map((r) => [r.querySelector(".ss-ad").textContent, r.querySelector(".ss-adet b").textContent])), [["Örnek Bardak Su 200 ml", "2"], ["Örnek Pet Su 500 ml", "1"]], "sihirbazın sepeti satırları gösteriyor (ad kesilmeden)");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#sihirSepet .ss-b, #sihirSepet .ss-fin")].filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).length), 0, "sepetteki − / + ve fiyat kutusu en az 44 px");
  await page.click('#sihirSepet [data-ssp="0"]'); await bekle(150);
  d.esit([await page.evaluate(() => activeCart().items[0].adet), await page.evaluate(() => document.querySelector('#prodGrid [data-add="u1"] [data-gs-adet]').textContent), await yazi("#sihirSepet .ss-toplam")], [3, "3", await tl(440)], "sepetteki + adedi artırdı; karttaki işaret ve toplam da güncellendi");
  await page.fill('#sihirSepet [data-ssfiyat="1"]', "165"); await bekle(150);
  d.esit(await yazi("#sihirSepet .ss-toplam"), await tl(435), "sepetteki fiyat kutusu çalışıyor (170 → 165)");
  await page.click('#prodGrid [data-catopen="ANA"]'); await bekle(200);
  d.dogru(await page.evaluate(() => !!document.querySelector('#prodGrid [data-catopen="Su"]')), "“Kategoriler” düğmesi sihirbazda da çalışıyor");
  d.esit(await tasma(page), 0, "yatay taşma yok");
  await page.screenshot({ path: (await import("node:path")).join((await import("./satis-ortak.mjs")).EKRAN, "sonra", "21-rota-deneme-urun-adimi.png"), fullPage: true }).catch(() => {});

  console.log("— ödeme → satış kaydı");
  await page.click("#odemeGec"); await bekle(300);
  d.dogru((await yazi(".sihir-tot")).includes(await tl(435)), "ödeme adımı toplamı gösteriyor");
  const once = o.deger().sales.length;
  await page.click('[data-sode="nakit"]'); await bekle(300);
  d.dogru(await bekleKi(async () => o.deger().sales.length === once + 1), "satış buluta yazıldı");
  const s = o.deger(), satis = s.sales[s.sales.length - 1];
  d.esit([satis.musteriId, satis.toplam, satis.odeme, satis.stokKaynak], ["m1", 435, { nakit: 435, pos: 0, acik: 0 }, "arac"], "müşteri, toplam, ödeme ve stok kaynağı (araç) doğru");
  d.esit(satis.items.map((i) => [i.urunId, i.adet, i.fiyat]), [["u1", 3, 90], ["u2", 1, 165]], "kalemler doğru");
  d.esit(["u1", "u2"].map((id) => s.products.find((p) => p.id === id).aracStok), [17, 9], "araç stoğu düştü (20→17, 10→9)");
  d.esit(await page.evaluate(() => [servis.adim, !!document.getElementById("kpBitir"), activeCart().items.length]), ["kapanis", true, 0], "sihirbaz kapanış adımına geçti, sepet boşaldı");
  d.esit(o.p.hatalar, [], "sayfada betik hatası yok");
} finally { await o.kapat(); }
d.bitir();
