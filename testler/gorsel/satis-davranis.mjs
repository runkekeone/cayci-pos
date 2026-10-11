// Satış ekranı — yeni yerleşimin davranışları (dokunuşlarla): adet yazma, çift dokunuş koruması, açık hesap + limit onayı,
// iskonto + not, parçalı, ikinci sepet, stok kaynağı / eksi stok uyarısı, arama, satır penceresi, klavye açıkken sabit çubuklar.
// Çalıştır: node testler/gorsel/satis-davranis.mjs
import { gsAc, bekle, denetci, tasma } from "./satis-ortak.mjs";

const d = denetci("gorsel/satis-davranis");
// Tarayıcı pencereleri (alert / confirm / prompt): her adım kendi kararını verir; görülen mesajlar toplanır.
let karar = () => true; const mesajlar = [];
const o = await gsAc({ diyalog: async (dl) => {
  mesajlar.push(dl.type() + ": " + dl.message());
  const k = karar(dl);
  if (dl.type() === "prompt") return dl.accept(typeof k === "string" ? k : dl.defaultValue()).catch(() => {});
  return (k === false ? dl.dismiss() : dl.accept()).catch(() => {});
} });
const { page, git } = o;
const yazi = (sec) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/ /g, " ").replace(/\s+/g, " ").trim() : null; }, sec);
const tl = (n) => page.evaluate((x) => money.format(x), n);
const satisSay = () => page.evaluate(() => store.sales.length);
const sonSatis = () => page.evaluate(() => store.sales[store.sales.length - 1]);
const pencereler = () => page.evaluate(() => document.querySelectorAll(".modal-overlay").length);
const sepetAcik = () => page.evaluate(() => !!document.getElementById("gsSepetOv"));
const kapat = () => page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));
/** Durum kur (yalnız hazırlık; denenen iş dokunuşla yapılır). */
const sepet = async (musteriId, urunler) => {
  await page.evaluate(([m, u]) => { pos.carts.forEach((c, n) => { pos.carts[n] = newCart(); }); pos.active = 0; pos.cat = "ANA"; pos.q = ""; activeCart().musteriId = m; u.forEach((x) => addToCart(x)); }, [musteriId, urunler]);
  await git("satis");
};
const sepetAc = async () => { await page.click("#gsSepetAc"); await bekle(600); };   // ilk 450 ms dokunuş sayılmaz

try {
  console.log("— adet: yaz / azalt / satırı çıkar");
  await sepet(null, ["u1", "u2"]); await sepetAc();
  await page.evaluate(() => { document.querySelector('.gs-kalem[data-line="0"] [data-ladet]')._isaret = 1; });
  await page.click('.gs-kalem[data-line="0"] [data-ladet]'); await page.keyboard.type("10"); await page.keyboard.press("Enter"); await bekle(150);
  d.esit(await page.evaluate(() => activeCart().items[0].adet), 10, "adet kutusuna 10 yazılınca sepette 10 oldu (10 kez dokunmak gerekmedi)");
  d.esit([await yazi('[data-tut="0"]'), await yazi("#gsSepetToplam")], [await tl(1000), await tl(1170)], "satır tutarı ve toplam güncellendi");
  d.esit(await page.evaluate(() => [document.querySelector('.gs-kalem[data-line="0"] [data-ladet]')._isaret || 0, document.querySelectorAll(".modal-overlay").length]), [1, 1], "satır yeniden kurulmadı, başka pencere açılmadı");
  d.esit(await page.evaluate(() => document.querySelector('.gs-kalem[data-line="0"] [data-lazalt]').classList.contains("cikar")), false, "adet 1'den büyükken − düğmesi “azalt”");
  await page.click('.gs-kalem[data-line="0"] [data-ladet]'); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await page.keyboard.press("Enter"); await bekle(150);
  d.esit(await page.evaluate(() => [activeCart().items[0].adet, document.querySelector('.gs-kalem[data-line="0"] [data-ladet]').value]), [10, "10"], "kutu boş bırakılırsa eski adet geri geliyor");
  await page.click('.gs-kalem[data-line="1"] [data-lazalt="1"]'); await bekle(150);
  d.esit(await page.evaluate(() => activeCart().items.map((i) => i.urunId)), ["u1"], "adet 1'deyken − satırı sepetten çıkarıyor");
  await page.click('.gs-kalem[data-line="0"] [data-lazalt="0"]'); await bekle(100);
  d.esit(await page.evaluate(() => activeCart().items[0].adet), 9, "− bir azaltıyor");
  await page.click('.gs-kalem[data-line="0"] [data-ladet]'); await page.keyboard.type("0"); await page.keyboard.press("Enter"); await bekle(200);
  d.esit([await page.evaluate(() => activeCart().items.length), await sepetAcik(), await yazi("#gsBarBas")], [0, false, "Sepet boş"], "0 yazınca satır çıkıyor; sepet boşalınca pencere kapanıyor");

  console.log("— çift dokunuş koruması");
  await sepet(null, ["u1"]); await sepetAc();
  const nokta = await page.evaluate(() => { const r = document.querySelector('#gsSepetOv [data-pay="nakit"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await kapat(); await bekle(100);
  let once = await satisSay();
  await page.click("#gsSepetAc"); await page.mouse.click(nokta.x, nokta.y); await bekle(150);
  d.esit([await satisSay() - once, await sepetAcik()], [0, true], "pencere açılır açılmaz gelen dokunuş (çift dokunuş) satış KAYDETMİYOR");
  karar = () => false; mesajlar.length = 0; await bekle(500);
  await page.click('#gsSepetOv [data-pay="nakit"]'); await bekle(250);
  d.esit([await satisSay() - once, await sepetAcik()], [1, false], "yarım saniye sonra aynı düğme satışı kaydediyor, pencere kapanıyor");
  d.dogru(mesajlar.some((m) => /Satış kaydedildi/.test(m)), "müşterisiz satışta “yazdırılsın mı” soruldu (eski akış)");
  d.esit((await sonSatis()).odeme, { nakit: 100, pos: 0, acik: 0 }, "müşterisiz nakit satış doğru yazıldı");

  console.log("— açık hesap: müşterisiz / limit onayı");
  await sepet(null, ["u4"]); await sepetAc(); once = await satisSay(); karar = () => true; mesajlar.length = 0;
  await page.click('#gsSepetOv [data-pay="acik"]'); await bekle(200);
  d.dogru(mesajlar.some((m) => /önce müşteri seçin/.test(m)) && await satisSay() === once && await sepetAcik(), "müşterisiz açık hesap: uyarı çıktı, satış yazılmadı, pencere açık kaldı");
  await page.click("#gsSepetOv [data-gs-muspick]"); await bekle(250);
  await page.click('[data-pick="m2"]'); await bekle(350);
  d.dogru(await sepetAcik(), "müşteri pencereden seçildi, sepet penceresi açık kaldı");
  const altMus = await yazi('#gsSepetOv [data-gs-mus="sepet"]');
  d.dogru(altMus.includes("Örnek Çay Ocağı") && altMus.includes("Borç: " + await tl(2100)) && altMus.includes("Kalan: " + await tl(900)) && altMus.includes("limit " + await tl(1100) + " aşılır") && /20 gündür gecikmiş/.test(altMus), "ödeme düğmelerinin üstünde: ad, borç, kalan limit, aşım ve gecikme uyarısı");
  const ustMus = await yazi("#custLimit");
  d.dogru(ustMus.includes("Limit: " + await tl(3000)) && /20 gündür gecikmiş/.test(ustMus), "ekranın üstünde de adın yanında aynı bilgi");
  const uy = await page.evaluate(() => { const e = document.querySelector('#gsSepetOv [data-gs-mus="sepet"] .pl-uyari'), m = document.querySelector(".mobilbar").getBoundingClientRect(), r = e.getBoundingClientRect(); return { alt: r.bottom, gorunur: r.height > 0 && r.bottom <= window.innerHeight, menuUstu: m.top }; });
  d.dogru(uy.gorunur, "uyarı satırı ekranda, alt menünün arkasında değil");
  mesajlar.length = 0; karar = () => false; await bekle(300);
  await page.click('#gsSepetOv [data-pay="acik"]'); await bekle(200);
  d.dogru(mesajlar.some((m) => /BORÇ LİMİTİ AŞILIYOR/.test(m)) && await satisSay() === once && await sepetAcik() && await page.evaluate(() => activeCart().items.length) === 1, "limit sorusuna İptal: satış yok, sepet ve pencere olduğu gibi");
  karar = () => true;
  await page.click('#gsSepetOv [data-pay="acik"]'); await bekle(250);
  let s = await sonSatis();
  d.esit([await satisSay() - once, s.musteriId, s.odeme], [1, "m2", { nakit: 0, pos: 0, acik: 2000 }], "Tamam: satış açık hesaba yazıldı");
  d.esit(await sepetAcik(), false, "pencere kapandı");
  await kapat();

  console.log("— iskonto + not + kart");
  await sepet(null, ["u3"]); await sepetAc(); once = await satisSay(); karar = () => false;
  d.esit(await page.evaluate(() => [document.getElementById("gsTopAra").hidden, document.getElementById("gsTopIsk").hidden]), [true, true], "iskonto yokken ara toplam / iskonto satırı görünmüyor");
  await page.click("#gsIskBtn"); await bekle(250);
  await page.fill("#iskGenel", "40"); await page.click(".modal-overlay:last-child .modal-foot .btn.ok"); await bekle(200);
  d.esit([await yazi("#posBrut"), await yazi("#posIsk"), await yazi("#gsSepetToplam")], [await tl(640), "−" + await tl(40), await tl(600)], "pencerede ara toplam, iskonto ve toplam");
  d.esit(await yazi("#posTutar"), await tl(600), "alt çubuktaki toplam da iskontolu");
  await page.click("#gsSatisNot"); await page.keyboard.type("kapıya bırakıldı");
  await page.click('#gsSepetOv [data-pay="pos"]'); await bekle(250);
  s = await sonSatis();
  d.esit([await satisSay() - once, s.brut, s.iskonto, s.toplam, s.not, s.odeme, s.komisyon], [1, 640, 40, 600, "kapıya bırakıldı", { nakit: 0, pos: 600, acik: 0 }, 12], "satış: brüt 640, iskonto 40, toplam 600, not ve kart ödemesi yazıldı");
  d.esit(await page.evaluate(() => [activeCart().not || "", document.getElementById("posNot").value]), ["", ""], "satıştan sonra not temizlendi");

  console.log("— parçalı ödeme");
  await sepet("m4", ["u4"]); await sepetAc(); once = await satisSay(); mesajlar.length = 0;
  karar = (dl) => (dl.type() === "prompt" ? (/Nakit/.test(dl.message()) ? "500" : "300") : true);
  await page.click('#gsSepetOv [data-pay="parcali"]'); await bekle(250);
  s = await sonSatis();
  d.esit([await satisSay() - once, s.odeme], [1, { nakit: 500, pos: 300, acik: 1200 }], "parçalı: 500 nakit + 300 kart, kalan 1.200 borca");
  d.esit(mesajlar.filter((m) => /^prompt/.test(m)).length, 2, "parçalıda iki soru soruldu (nakit, kart)");
  await kapat(); karar = () => true;

  console.log("— ikinci sepet");
  await sepet("m1", ["u1"]);
  d.esit(await page.evaluate(() => document.querySelectorAll("#gsSepetler [data-tab]").length), 0, "tek sepette sepet şeridi yok");
  await page.click("#gsDiger"); await bekle(250); await page.click('[data-gs-is="sepet"]'); await bekle(300);
  d.esit(await page.evaluate(() => [pos.active, pos.carts.length, pos.carts[0].items.length, pos.carts[0].musteriId]), [1, 5, 1, "m1"], "“Başka sepet aç”: ikinci sepete geçildi, ilk sepet duruyor");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#gsSepetler [data-tab]")].map((b) => [b.dataset.tab, b.classList.contains("on")])), [["0", false], ["1", true]], "iki sepet görünüyor; hangisinde olduğun işaretli");
  d.esit(await yazi("#gsBarBas"), "Sepet 2 boş", "alt çubuk hangi sepette olduğunu söylüyor");
  await page.click('#prodGrid [data-catopen="Su"]'); await bekle(150); await page.click('#prodGrid [data-add="u2"]'); await bekle(150);
  d.esit(await yazi("#gsBarAlt"), "Sepet 2 · 1 ürün · 1 adet", "ikinci sepete ürün eklendi");
  d.dogru(await page.evaluate(() => { const l = document.querySelector(".gs-sepetler-liste"); return l.scrollWidth <= l.clientWidth + 1 && [...l.children].every((b) => b.getBoundingClientRect().right <= window.innerWidth); }), "sepet şeridi sağdan kesilmiyor");
  await page.click('#gsSepetler [data-tab="0"]'); await bekle(300);
  d.esit(await page.evaluate(() => [pos.active, activeCart().items.map((i) => i.urunId), pos.carts[1].items.map((i) => i.urunId), document.getElementById("custName").textContent]), [0, ["u1"], ["u2"], "Deneme Kıraathanesi"], "ilk sepete dönüldü; iki sepet de yerinde");
  await page.evaluate(() => { servisKaydet(); });
  d.esit(await page.evaluate(() => { const k = JSON.parse(localStorage.getItem("servis-v1")); return [k.carts.length, k.active, Object.keys(k.carts[2]).sort()]; }), [5, 0, ["iskonto", "items", "musteriId", "odenen"]], "rota servisinin sakladığı pos.carts biçimi aynı (5 sepet)");
  await page.evaluate(() => { pos.carts[0] = newCart(); pos.carts[1] = newCart(); pos.active = 0; }); await git("satis"); mesajlar.length = 0;
  await page.click("#gsDiger"); await bekle(250); await page.click('[data-gs-is="sepet"]'); await bekle(200);
  d.dogru(mesajlar.some((m) => /zaten boş/.test(m)) && await page.evaluate(() => pos.active) === 0, "boş sepetteyken ikinci sepet açılmıyor (gerek yok)");

  console.log("— “Diğer” menüsü: eski dört ikonun işleri duruyor");
  await sepet(null, ["u1"]);
  await page.click("#gsDiger"); await bekle(250);
  d.esit(await page.evaluate(() => [...document.querySelectorAll("[data-gs-is]")].map((b) => b.dataset.gsIs)), ["iskonto", "muhtelif", "sepet", "stok", "gelismis", "tara", "yazdir", "bosalt", "ana"], "menüde: iskonto, muhtelif, ikinci sepet, stok, çeşit seçimi, barkod, yazdır, boşalt, ana ekran");
  await page.click('[data-gs-is="muhtelif"]'); await bekle(250); await page.fill("#muhInput", "75"); await page.click("#muhEkle"); await bekle(200);
  d.esit(await page.evaluate(() => activeCart().items.map((i) => [i.urunId, i.ad, i.fiyat, i.adet])), [["u1", "Örnek Bardak Su 200 ml", 100, 1], [null, "Muhtelif Ürün", 75, 1]], "muhtelif tutar sepete eklendi");
  mesajlar.length = 0; await page.click("#gsDiger"); await bekle(250); await page.click('[data-gs-is="yazdir"]'); await bekle(150);
  d.dogru(mesajlar.some((m) => /irsaliye yazdırılır/.test(m)), "yazdır: eski bilgi mesajı");
  mesajlar.length = 0; await page.click("#gsDiger"); await bekle(250); await page.click('[data-gs-is="gelismis"]'); await bekle(250);
  d.esit(await page.evaluate(() => [gelismisMod, localStorage.getItem("gelismis-mod-v1")]), [true, "1"], "çeşit seçimi (gelişmiş mod) açıldı");
  await page.evaluate(() => { gelismisModAyarla(false); });
  karar = () => true; await page.click("#gsDiger"); await bekle(250); await page.click('[data-gs-is="bosalt"]'); await bekle(250);
  d.esit(await page.evaluate(() => [activeCart().items.length, activeCart().musteriId]), [0, null], "sepeti boşalt: onaydan sonra sepet sıfırlandı");
  await page.click("#gsDiger"); await bekle(250); await page.click('[data-gs-is="ana"]'); await bekle(300);
  d.esit(await page.evaluate(() => location.hash), "#/anasayfa", "ana ekrana dön (eski geri oku)");

  console.log("— stok kaynağı + eksi stok uyarısı");
  await sepet(null, []);
  await page.click("#stokModBtn"); await bekle(250);
  d.esit(await page.evaluate(() => [...document.querySelectorAll("[data-gs-stoksec]")].map((b) => [b.dataset.gsStoksec, b.classList.contains("on")])), [["arac", false], ["dukkan", true]], "stok kaynağı penceresi: iki seçenek, seçili olan işaretli");
  await page.click('[data-gs-stoksec="arac"]'); await bekle(300);
  d.esit([await page.evaluate(() => [stokModu, localStorage.getItem("stok-modu-v1")]), await yazi("#stokModBtn")], [["arac", "arac"], "Stok: Araç"], "Araç seçildi; üst çubukta yazıyor");
  await page.click('#prodGrid [data-catopen="Meyve Suyu"]'); await bekle(150);
  d.dogru(/Araçta 3/.test(await yazi('#prodGrid [data-add="u13"]')), "kartlar araç stoğunu gösteriyor");
  await page.click('#prodGrid [data-add="u14"]'); await bekle(150);
  d.esit(await page.evaluate(() => { const e = document.querySelector('#prodGrid [data-add="u14"] [data-gs-stok]'); return [e.textContent, e.classList.contains("az")]; }), ["Araçta yok", true], "araçta olmayan ürün sepete girince kartta uyarı rengiyle “Araçta yok”");
  await sepetAc();
  d.esit(await yazi('.gs-kalem[data-line="0"] [data-lstok]'), "Araçta yok görünüyor", "sepet satırında da uyarı");
  once = await satisSay(); karar = () => false;
  await page.click('#gsSepetOv [data-pay="nakit"]'); await bekle(250);
  d.esit([await satisSay() - once, (await sonSatis()).stokKaynak, await page.evaluate(() => findProduct("u14").aracStok)], [1, "arac", -1], "uyarı engel değil: satış yazıldı, araç stoğu eksiye düştü");
  await page.evaluate(() => stokModuAyarla("dukkan")); karar = () => true;

  console.log("— arama");
  await sepet(null, []);
  await page.click('#prodGrid [data-catopen="Su"]'); await bekle(150);
  await page.click("#prodSearch"); await page.keyboard.type("KOLA"); await bekle(200);
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#prodGrid [data-add]")].map((e) => e.dataset.add)), ["u3"], "arama bütün ürünlerde arıyor (Su kategorisindeyken “kola” bulundu)");
  await page.fill("#prodSearch", "zzz"); await bekle(200);
  d.dogru(/bulunamadı/.test(await yazi("#prodGrid")) && await page.evaluate(() => document.querySelectorAll("#prodGrid [data-add]").length) === 0, "sonuç yoksa açık bir mesaj var");
  await page.click("#prodSearchX"); await bekle(200);
  d.esit(await page.evaluate(() => [pos.q, document.getElementById("prodSearch").value, document.querySelectorAll("#prodGrid [data-add]").length]), ["", "", 6], "× aramayı temizliyor, kategoriye geri dönüyor");

  console.log("— satır penceresi (fiyat düzeltme)");
  await sepet("m4", ["u1", "u2"]); await sepetAc();
  await page.click('.gs-kalem[data-line="0"] [data-lineac]'); await bekle(250);
  d.esit(await pencereler(), 2, "ada dokununca düzenleme penceresi açıldı (sepet penceresinin üstünde)");
  await page.fill(".modal-overlay:last-child [data-price]", "95"); await page.click(".modal-overlay:last-child [data-ok]"); await bekle(200);
  d.esit([await page.evaluate(() => activeCart().items[0].fiyat), await pencereler(), /özel/.test(await yazi('.gs-kalem[data-line="0"]'))], [95, 1, true], "fiyat 95 oldu, pencere kapandı, satırda “özel” işareti");
  await page.click('.gs-kalem[data-line="1"] [data-lineac]'); await bekle(250);
  d.dogru(await page.evaluate(() => { const ov = document.querySelector(".modal-overlay:last-child"), ok = ov.querySelector("[data-ok]").getBoundingClientRect(), sil = ov.querySelector("[data-rem]").getBoundingClientRect(); return sil.top >= ok.bottom + 8; }), "“sepetten çıkar” ana düğmenin yanında değil, altında ayrı duruyor");
  await page.click(".modal-overlay:last-child [data-rem]"); await bekle(200);
  d.esit(await page.evaluate(() => activeCart().items.map((i) => i.urunId)), ["u1"], "“Bu ürünü sepetten çıkar” satırı sildi");
  await kapat();

  console.log("— geçen sipariş");
  await sepet("m3", []);   // m3'ün son satışı: 2 × Örnek Kola (özel fiyat 620)
  d.dogru(/Geçen sipariş · 1 ürün/.test(await yazi("#gsBundle")) && /Örnek Kola/.test(await yazi("#gsBundle")), "müşterinin geçen siparişi şerit olarak görünüyor");
  await page.click("#bundleAdd"); await bekle(300);
  d.esit([await page.evaluate(() => activeCart().items.map((i) => [i.urunId, i.adet, i.fiyat])), await sepetAcik(), await page.evaluate(() => document.getElementById("gsBundle").innerHTML)], [[["u3", 1, 620]], true, ""], "“Sepete ekle”: ürün müşterinin fiyatıyla eklendi, sepet açıldı (adet düzeltmek için), şerit kalktı");
  await kapat();

  console.log("— ekrandan çıkınca pencere kalmıyor");
  await sepet(null, ["u1"]); await sepetAc();
  await page.evaluate(() => { location.hash = "#/dukkan"; }); await bekle(300);
  d.esit(await sepetAcik(), false, "başka ekrana geçince sepet penceresi kapandı");

  console.log("— klavye açıkken (görünen alan 390×430)");
  await sepet(null, ["u1", "u3"]);
  await page.setViewportSize({ width: 390, height: 430 }); await bekle(250);
  await page.click("#prodSearch"); await page.keyboard.type("su"); await bekle(500);
  const kisa = await page.evaluate(() => { const b = document.getElementById("gsBar").getBoundingClientRect(), m = document.querySelector(".mobilbar"), g = document.getElementById("prodGrid").getBoundingClientRect(), a = document.querySelector(".gs-ara").getBoundingClientRect(); return { menu: getComputedStyle(m).display, barAlt: Math.round(b.bottom), barY: Math.round(b.height), araUst: Math.round(a.top), izgaraUst: Math.round(g.top), pencere: window.innerHeight, vv: Math.round(window.visualViewport.height) }; });
  d.esit([kisa.vv, kisa.menu, kisa.barAlt], [430, "none", 430], "alt menü gizlendi, ödeme çubuğu görünen alanın dibinde");
  d.dogru(kisa.barY <= 64, "çubuk tek satıra indi (" + kisa.barY + " px)");
  d.dogru(kisa.araUst >= 0 && kisa.araUst <= 16, "arama satırı görünen alanın en üstüne alındı (üst = " + kisa.araUst + ")");
  d.dogru(430 - kisa.barY - kisa.izgaraUst >= 250, "sonuçlara en az 250 px kalıyor (" + (430 - kisa.barY - kisa.izgaraUst) + " px) — sabit çubuklar ekranı yutmuyor");
  d.dogru(await page.evaluate(() => { const k = document.querySelector("#prodGrid [data-add]").getBoundingClientRect(), b = document.getElementById("gsBar").getBoundingClientRect(); return k.top >= 0 && k.bottom <= b.top; }), "ilk sonuç kartının tamamı çubuğun üstünde görünüyor");
  await page.setViewportSize({ width: 390, height: 844 }); await bekle(250);
  d.esit(await page.evaluate(() => { const b = document.getElementById("gsBar").getBoundingClientRect(), m = document.querySelector(".mobilbar").getBoundingClientRect(); return [getComputedStyle(document.querySelector(".mobilbar")).display, Math.abs(b.bottom - m.top) <= 1]; }), ["flex", true], "klavye kapanınca alt menü ve çubuk eski yerinde");

  console.log("— 360 px");
  await page.setViewportSize({ width: 360, height: 780 });
  await sepet("m6", ["u21", "u26", "u26", "u26", "u26", "u26", "u26", "u26", "u26", "u26", "u26"]);
  const t1 = await tasma(page);
  const tutarTam = await page.evaluate(() => { const e = document.getElementById("posTutar"); return e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().right <= window.innerWidth; });
  await sepetAc();
  const t2 = await tasma(page);
  const pencereTasma = await page.evaluate(() => [...document.querySelectorAll("#gsSepetOv *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5); }).length);
  d.esit([t1, t2, pencereTasma, tutarTam], [0, 0, 0, true], "360 px: 1.234.565 ₺'lik sepet + uzun adlar — yatay taşma yok, toplam kesilmiyor");
  await kapat(); await page.setViewportSize({ width: 390, height: 844 });
  d.esit(o.p.hatalar, [], "sayfada betik hatası yok");
} finally { await o.kapat(); }
d.bitir();
