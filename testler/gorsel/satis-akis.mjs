// Satış ekranı — baştan sona DOKUNUŞLARLA bir satış (evaluate kısayolu yok) + yeni yerleşimin kuralları.
// müşteri seç → üç ürün ekle → birinin adedini artır → nakit → buluttaki kayıt doğru mu.
// Çalıştır: node testler/gorsel/satis-akis.mjs
import { gsAc, gsStore, bekle, denetci, tasma } from "./satis-ortak.mjs";

const d = denetci("gorsel/satis-akis");
const st0 = gsStore();
const o = await gsAc({ store: st0 });
const { page } = o;
const kutu = (sec) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { ust: Math.round(r.top), alt: Math.round(r.bottom), sol: Math.round(r.left), sag: Math.round(r.right), y: Math.round(r.height), g: getComputedStyle(e).display !== "none" && r.height > 0 }; }, sec);
const yazi = (sec) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/ /g, " ").replace(/\s+/g, " ").trim() : null; }, sec);
const tl = (n) => page.evaluate((x) => money.format(x), n);
const bekleKi = async (kosul, ms = 8000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await kosul()) return true; await bekle(120); } return false; };

try {
  console.log("— yerleşim (390 px, boş sepet)");
  await page.click('.mobilbar [data-mroute="satis"]'); await bekle(350);
  d.esit(await page.evaluate(() => location.hash), "#/satis", "alt menüden Satış açıldı");
  const ust = await kutu(".gs-ust"), ara = await kutu(".gs-ara"), izgara = await kutu("#prodGrid"), bar = await kutu("#gsBar"), menu = await kutu(".mobilbar");
  d.dogru(ust.ust === 0, "üst çubuğun üstünde boşluk yok (üst = " + ust.ust + ")");
  d.dogru(ara.ust < izgara.ust && izgara.ust < bar.ust, "sıra: arama → ürünler/kategoriler → ödeme çubuğu");
  d.dogru(bar.alt <= menu.ust + 1 && bar.alt >= menu.ust - 1, "ödeme çubuğu alt menünün hemen üstünde, üst üste binmiyor (çubuk altı " + bar.alt + ", menü üstü " + menu.ust + ")");
  d.dogru(menu.alt <= 844 && bar.ust > 844 / 2, "ikisi de ekranın altında sabit");
  d.esit(await page.evaluate(() => getComputedStyle(document.getElementById("gsBar")).position), "fixed", "ödeme çubuğu sabit (fixed)");
  d.esit(await tasma(page), 0, "yatay taşma yok");
  d.esit(await page.evaluate(() => document.querySelectorAll("[data-tab]").length), 0, "tek sepetteyken “Müşteri 1/2/3” sekmeleri yok");
  d.esit(await page.evaluate(() => document.querySelectorAll("#posTotals, .pos-tot").length), 0, "Miktar / Brüt / İskonto / Tutar kutuları yok");
  d.esit(await page.evaluate(() => [...document.querySelectorAll(".gs-ust button")].map((b) => b.innerText.trim())), ["Stok: Dükkan", "Diğer"], "üst çubuktaki düğmeler adıyla yazılı");
  d.esit(await page.evaluate(() => { const g = getComputedStyle(document.querySelector(".gs-ust")).backgroundImage, t = getComputedStyle(document.documentElement).getPropertyValue("--topbar-grad"); const sade = (x) => x.replace(/\s+/g, ""); return /gradient/.test(g) && !/54,\s*162,\s*236|42,\s*143,\s*224/.test(g) && sade(g).length > 0 && sade(t).length > 0; }), true, "üst çubuk mavi değil, panelin üst çubuk zemininde");
  d.esit(await page.evaluate(() => (document.getElementById("content").innerHTML.match(/\p{Extended_Pictographic}/gu) || []).filter((x) => !/[©®™]/.test(x))), [], "satış ekranında emoji yok");
  d.esit(await yazi("#gsBarBas"), "Sepet boş", "boş sepette çubuk “Sepet boş” diyor");
  d.esit(await page.evaluate(() => document.getElementById("gsSepetAc").disabled), true, "boş sepette ödeme düğmesi kapalı");
  await page.click("#gsSepetAc", { force: true }).catch(() => {}); await bekle(200);
  d.esit(await page.evaluate(() => !!document.getElementById("gsSepetOv")), false, "boş sepette pencere açılmıyor");

  console.log("— 1) müşteri seç");
  await page.click("#custPick"); await bekle(250);
  d.dogru(await page.evaluate(() => !!document.querySelector(".modal-overlay #pickSearch")), "müşteri seçme penceresi açıldı");
  await page.fill("#pickSearch", "DENEME kir"); await bekle(150);
  d.esit(await page.evaluate(() => [...document.querySelectorAll("[data-pick]")].filter((li) => li.style.display !== "none").map((li) => li.dataset.pick)), ["m1"], "arama büyük/küçük harf ve Türkçe harf ayırmadan buluyor");
  await page.click('[data-pick="m1"]'); await bekle(300);
  d.esit(await yazi("#custName"), "Deneme Kıraathanesi", "seçilen müşterinin adı ekranın üstünde");
  d.dogru((await yazi("#custLimit")).includes("Borç: " + await tl(0)), "adın yanında borcu yazıyor");

  console.log("— 2) üç ürün ekle (kategoriden)");
  await page.click('#prodGrid [data-catopen="Su"]'); await bekle(200);
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#prodGrid [data-add]")].map((e) => e.dataset.add)), ["u1", "u2", "u27", "u28", "u29", "u30"], "kategoriye dokununca o kategorinin ürünleri geldi");
  d.dogru((await yazi('#prodGrid [data-add="u1"]')).includes(await tl(90)) && /özel/.test(await yazi('#prodGrid [data-add="u1"]')), "kartta müşterinin özel fiyatı (90) “özel” işaretiyle");
  d.dogru(/Dükkanda 40/.test(await yazi('#prodGrid [data-add="u1"]')), "kartta seçili kaynağın stoğu yazıyor");
  await page.click('#prodGrid [data-add="u1"]'); await page.click('#prodGrid [data-add="u2"]'); await bekle(150);
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#prodGrid .gs-urun.sepette [data-gs-adet]")].map((e) => e.textContent)), ["1", "1"], "eklenen ürünlerin kartında adet işareti çıktı");
  await page.click('#prodGrid [data-catopen="ANA"]'); await bekle(200);
  d.dogru(await page.evaluate(() => !!document.querySelector('#prodGrid [data-catopen="Gazlı İçecek"]')), "“Kategoriler” ile kategori bloklarına dönüldü");
  await page.click('#prodGrid [data-catopen="Gazlı İçecek"]'); await bekle(200);
  await page.click('#prodGrid [data-add="u3"]'); await bekle(150);
  d.esit(await yazi("#gsBarAlt"), "3 ürün · 3 adet", "çubukta sepetin özeti");
  d.esit(await yazi("#posTutar"), await tl(900), "çubukta toplam (90 + 170 + 640), kaydırmadan görünüyor");
  const bar2 = await kutu("#gsBar");
  d.dogru(bar2.ust >= 0 && bar2.alt <= 844, "çubuk ekranda (kaydırmadan)");
  d.esit(await yazi("#gsBarBas"), "Sepet ve ödeme", "çubuk ne açacağını söylüyor");
  // okunaklılık: yazı en az 13 px, dokunma hedefi en az 44 px (ürün seçme ekranının tamamı)
  const olcu = await page.evaluate(() => {
    const gor = (e) => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
    const kok = document.getElementById("content");
    const kucukYazi = [...kok.querySelectorAll("*")].filter((e) => gor(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 13).map((e) => e.className + " " + getComputedStyle(e).fontSize);
    const kucukHedef = [...kok.querySelectorAll("button, input:not([type=hidden]), [data-add], [data-catopen]")].filter(gor).filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map((e) => (e.id || e.className) + " " + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height));
    return { kucukYazi, kucukHedef };
  });
  d.esit(olcu, { kucukYazi: [], kucukHedef: [] }, "ekranda 13 px'ten küçük yazı ve 44 px'ten küçük dokunma hedefi yok");
  // sayfanın sonu sabit çubukların arkasında kalmıyor
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await bekle(150);
  d.dogru(await page.evaluate(() => { const son = [...document.querySelectorAll("#prodGrid > *")].pop().getBoundingClientRect(), b = document.getElementById("gsBar").getBoundingClientRect(); return son.bottom <= b.top; }), "en alta kaydırınca son ürün kartı çubuğun üstünde kalıyor (arkasında değil)");
  await page.evaluate(() => window.scrollTo(0, 0));

  console.log("— 3) sepet penceresi: birinin adedini artır");
  await page.click("#gsSepetAc"); await bekle(600);
  d.dogru(await page.evaluate(() => !!document.getElementById("gsSepetOv")), "çubuğa tek dokunuşla sepet ve ödeme penceresi açıldı");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#gsSepetOv [data-pay]")].map((b) => b.dataset.pay)), ["nakit", "pos", "acik", "parcali"], "ödeme düğmeleri pencerede: Nakit / Kart / Açık hesap / Parçalı");
  d.esit(await page.evaluate(() => { const ana = document.querySelectorAll("#gsSepetOv .gs-ode.ana"); return [ana.length, ana[0] && ana[0].dataset.pay]; }), [1, "nakit"], "tek ana düğme var: Nakit");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#gsSepetOv button, #gsSepetOv input")].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && (r.height < 44 || r.width < 44); }).map((e) => (e.id || e.className || e.tagName) + " " + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height))), [], "pencerede 44 px'ten küçük dokunma hedefi yok");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#cartBody .gs-kalem")].length), 3, "sepette üç satır");
  await page.click('.gs-kalem[data-line="0"] [data-lart="0"]'); await bekle(150);
  d.esit(await page.evaluate(() => [document.querySelector('.gs-kalem[data-line="0"] [data-ladet]').value, document.querySelectorAll(".modal-overlay").length]), ["2", 1], "+ ile adet 2 oldu, başka pencere açılmadı");
  d.esit(await yazi("#gsSepetToplam"), await tl(990), "toplam güncellendi (990)");

  console.log("— 4) nakit ile bitir");
  const once = o.deger().sales.length;
  await page.click('#gsSepetOv [data-pay="nakit"]'); await bekle(300);
  d.dogru(await bekleKi(async () => o.deger().sales.length === once + 1), "satış buluta yazıldı");
  const s = o.deger(), satis = s.sales[s.sales.length - 1];
  d.esit([satis.musteriId, satis.toplam, satis.brut, satis.iskonto, satis.not], ["m1", 990, 990, 0, ""], "müşteri ve toplam doğru");
  d.esit(satis.odeme, { nakit: 990, pos: 0, acik: 0 }, "ödeme: tamamı nakit");
  d.esit(satis.items.map((i) => [i.urunId, i.adet, i.fiyat]), [["u1", 2, 90], ["u2", 1, 170], ["u3", 1, 640]], "kalemler: adet ve fiyat (u1 özel fiyatla, 2 adet)");
  d.esit(satis.stokKaynak, "dukkan", "stok kaynağı kayda yazıldı");
  d.esit(["u1", "u2", "u3"].map((id) => s.products.find((p) => p.id === id).stok), [38, 29, 11], "dükkan stoğu düştü (40→38, 30→29, 12→11)");
  d.esit(await page.evaluate(() => !!document.getElementById("gsSepetOv")), false, "satıştan sonra sepet penceresi kapandı");
  d.esit(await yazi("#gsBarBas"), "Sepet boş", "sepet boşaldı");
  d.dogru(await page.evaluate(() => document.querySelectorAll(".modal-overlay").length) === 1, "fiş gönderme penceresi açıldı (müşterinin telefonu var)");
  d.esit(await page.evaluate(() => [pos.cat, pos.q, !!document.querySelector('#prodGrid [data-catopen="Su"]'), document.getElementById("custName").textContent, window.scrollY]), ["ANA", "", true, "Müşteri seç", 0], "ekran sıradaki satışa hazır: kategoriler, müşteri seçilmemiş, en üstte");
  d.esit(o.p.hatalar, [], "sayfada betik hatası yok");
} finally { await o.kapat(); }
d.bitir();
