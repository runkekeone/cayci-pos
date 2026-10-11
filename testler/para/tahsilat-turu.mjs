// TAHSİLAT TÜRÜ ve İADE: Ödeme Al'da ve ziyaret kapanışında tür seçilir, araçta bayrakla gelir;
// kart/havale kasayı şişirmez; iade müşterinin gerçekte aldığı fiyattan yazılır ve kasaya girmez.
// Çalıştır: node testler/para/tahsilat-turu.mjs
import { denetci } from "../ortak/panel.mjs";
import { ortam, git, statlar, mdDeger, ornekStore, satis, karisikGun, gun, bugunStr, tl, tlArac, tabanVar, bekle } from "./ortak.mjs";

const d = denetci("para/tahsilat-turu");
const bugun = bugunStr();
/** Bugün tek nakit satış (340) olan sade gün. */
function sadeGun() { const st = ornekStore(); st.sales.push(satis(st, 31, null, [["u2", 2]], { nakit: 340 }, gun(0, 9))); st.counters.sale = 31; return st; }
const kapanisAc = (page) => page.evaluate(() => { servis.aktif = true; servis.stokBitti = true; servis.musteriIds = ["m3"]; servis.edilen = []; servis.paslar = []; servis.acik = "m3"; servis.adim = "kapanis"; servis.sonSatisId = null; stokModuAyarla("arac"); });
async function odemeAl(page, musteri, tutar, tur) {
  await page.evaluate((m) => openOdemeAl(m), musteri);
  await page.fill("#pTut", String(tutar));
  if (tur) await page.click('[data-ptur="' + tur + '"]');
  await page.click(".modal-overlay .modal-foot .btn.ok");
  await bekle(120);
}

/* ---- Taban: kartla/havaleyle alınan ödeme ve iade nakit kasayı şişiriyordu ---- */
if (tabanVar) {
  const t = await ortam(sadeGun(), { taban: true });
  try {
    await t.page.evaluate(() => openOdemeAl("m2"));
    d.dogru(!(await t.page.$("[data-ptur]")), "TABAN: Ödeme Al'da para türü seçilemiyordu");
    await t.page.fill("#pTut", "300"); await t.page.click(".modal-overlay .modal-foot .btn.ok"); await bekle(120);
    await kapanisAc(t.page); await git(t.page, "rota");
    await t.page.fill("#kpTahsil", "100"); await t.page.selectOption("#kpTahsilTip", "pos");
    await t.page.selectOption("#kpIadeUrun", "u3"); await t.page.fill("#kpIadeAdet", "1");
    await t.page.click("#kpBitir"); await bekle(200);
    const iade = await t.page.evaluate(() => store.iadeler[store.iadeler.length - 1].tutar);
    d.esit(iade, 640, "TABAN: iade liste fiyatından (640) yazılıyordu — müşteri 620'den almıştı, 20 ₺ fazla alacak");
    await git(t.page, "anasayfa");
    d.esit((await statlar(t.page))["Nakit Kasa"], tl(340 + 300 + 100 + 640), "TABAN: kart tahsilatı ve iade nakit kasaya ekleniyordu (340 yerine 1.380)");
  } finally { await t.kapat(); }
}

/* ---- Panel ---- */
const o = await ortam(sadeGun());
try {
  const page = o.page;
  const son = () => page.evaluate(() => { const p = store.payments[store.payments.length - 1]; return { m: p.musteriId, tutar: p.tutar, tur: p.odemeTuru }; });
  await page.evaluate(() => openOdemeAl("m2"));
  const dugme = await page.evaluate(() => [...document.querySelectorAll("[data-ptur]")].map((b) => [b.dataset.ptur, Math.round(b.getBoundingClientRect().height), b.classList.contains("on")]));
  d.dogru(dugme.length === 3 && dugme.every((x) => x[1] >= 44) && dugme[0][2] && dugme[0][0] === "nakit", "Ödeme Al: Nakit / Kart / Havale düğmeleri (≥44 px), Nakit seçili gelir");
  await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));
  await odemeAl(page, "m2", 300, "kart"); d.esit(await son(), { m: "m2", tutar: 300, tur: "kart" }, "Ödeme Al → Kart: odemeTuru=kart yazıldı");
  await odemeAl(page, "m2", 150, "havale"); d.esit(await son(), { m: "m2", tutar: 150, tur: "havale" }, "Ödeme Al → Havale: odemeTuru=havale");
  await odemeAl(page, "m2", 200, null); d.esit(await son(), { m: "m2", tutar: 200, tur: "nakit" }, "Ödeme Al (seçmeden): odemeTuru=nakit");
  // elle borç yazma = düzeltme, kasaya girmez
  await page.evaluate(() => openBorcEkle("m2")); await page.fill("#bTut", "500"); await page.click(".modal-overlay .modal-foot .btn.ok"); await bekle(120);
  d.esit(await son(), { m: "m2", tutar: -500, tur: "duzeltme" }, "Veresiye Borç Ekle: odemeTuru=duzeltme (eksi tutar)");

  // ziyaret kapanışı: tahsilat türü seçilir (Havale dahil), iade gerçek fiyattan
  await kapanisAc(page); await git(page, "rota");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#kpTahsilTip option")].map((x) => x.value)), ["nakit", "pos", "havale"], "Ziyaret kapanışı: Nakit / Kart / Havale seçilebiliyor");
  await page.fill("#kpTahsil", "100"); await page.selectOption("#kpTahsilTip", "havale");
  await page.selectOption("#kpIadeUrun", "u3"); await page.fill("#kpIadeAdet", "1");
  await page.click("#kpBitir"); await bekle(200);
  const z = await page.evaluate(() => ({ iade: store.iadeler[store.iadeler.length - 1].tutar, pay: store.payments.slice(-2).map((p) => [p.tutar, p.odemeTuru]), arac: store.products.find((p) => p.id === "u3").aracStok }));
  d.esit(z.pay, [[100, "havale"], [620, "iade"]], "kapanış: tahsilat havale, iade kaydı odemeTuru=iade");
  d.esit(z.iade, 620, "iade müşterinin gerçekte aldığı fiyattan (620), liste fiyatından (640) değil");
  d.esit(z.arac, 7, "iade edilen mal araç stoğuna geri girdi");
  d.esit(await page.evaluate(() => [musteriUrunFiyat("m1", "u1"), musteriUrunFiyat("m3", "u5"), musteriUrunFiyat("m4", "u3"), musteriUrunFiyat(null, "u3")]), [90, 55, 640, 640], "iade fiyatı sırası: son satış fiyatı → özel fiyat → liste");

  await git(page, "anasayfa"); const ana = await statlar(page);
  d.esit(ana["Nakit Kasa"], tl(340 + 200), "nakit kasa yalnız nakdi sayıyor: 340 satış + 200 nakit tahsilat (kart, havale, iade, borç ekleme hariç)");
  d.esit(ana["Kart / Havale ile Gelen"], tl(300 + 150 + 100), "kart + havale ayrı satırda: 550");
  await page.evaluate(() => { selectedCustomerId = "m2"; }); await git(page, "musteri-detay");
  const turSutun = await page.evaluate(() => [...document.querySelectorAll("table")][1].innerText);
  d.dogru(/Tahsilat · Kart/.test(turSutun) && /Tahsilat · Havale/.test(turSutun) && /Borç Ekleme/.test(turSutun), "Müşteri detayı: tahsilatın türü listede yazıyor");
  d.esit(o.p.hatalar, [], "sayfada betik hatası yok");
} finally { await o.kapat(); }

/* ---- Araç ---- */
const a = await ortam(sadeGun());
try {
  const pay = () => a.bulut.deger("babuco:store").payments;
  const n0 = pay().length;
  const p1 = await a.arac(["tahsilat", "Örnek Çay Ocağı", "500", "--havale"]);
  d.dogru(/Tür\s*: Havale — kasaya girmez/.test(p1.cikti) && /PROVA/.test(p1.cikti) && pay().length === n0, "tahsilat --havale: türü gösterir, --kaydet'siz yazmaz");
  await a.arac(["tahsilat", "Örnek Çay Ocağı", "500", "--havale", "--kaydet"]);
  d.esit([pay().length, pay()[n0].odemeTuru, pay()[n0].tutar], [n0 + 1, "havale", 500], "tahsilat --havale --kaydet: odemeTuru=havale");
  await a.arac(["tahsilat", "Örnek Çay Ocağı", "300", "kartla ödedi", "--kaydet"]);
  d.esit(pay()[n0 + 1].odemeTuru, "kart", "bayrak yoksa tür nottan çıkar (\"kartla ödedi\" → kart)");
  await a.arac(["tahsilat", "Örnek Çay Ocağı", "200", "--kaydet"]);
  d.esit([pay()[n0 + 2].odemeTuru, pay()[n0 + 2].not], ["nakit", "Saha tahsilat"], "bayrak ve not yoksa nakit; not eskisi gibi \"Saha tahsilat\"");
  await a.arac(["tahsilat", "Örnek Çay Ocağı", "-50", "pos ile ödemişti", "--duzeltme", "--kaydet"]);
  d.esit([pay()[n0 + 3].odemeTuru, pay()[n0 + 3].tutar, pay()[n0 + 3].not], ["duzeltme", -50, "Bakiye düzeltme: pos ile ödemişti"], "--duzeltme: tür her zaman duzeltme (notta 'pos' geçse de), not biçimi aynı");
  const dun = gun(1).slice(0, 10);
  await a.arac(["tahsilat", "Örnek Çay Ocağı", "100", "--tarih=" + dun, "--tur=kart", "--kaydet"]);
  d.esit([pay()[n0 + 4].odemeTuru, pay()[n0 + 4].tarih.slice(0, 10)], ["kart", dun], "--tarih ile --tur birlikte çalışıyor");
  const hata = await a.arac(["tahsilat", "Örnek Çay Ocağı", "100", "--tur=cek", "--kaydet"]);
  d.dogru(hata.kod !== 0 && /Tur gecersiz/.test(hata.cikti) && pay().length === n0 + 5, "geçersiz tür reddediliyor, hiçbir şey yazılmıyor");
  const ks = await a.arac(["kasa", bugun]);
  d.esit([mdDeger(ks.cikti, "Nakit (elde)"), mdDeger(ks.cikti, "Nakit (hesaba yatan)"), mdDeger(ks.cikti, "Pos (hesaba geçecek)")], [tlArac(540), tlArac(500), tlArac(300)], "kasa: elde 340+200, hesaba yatan 500 (havale), pos 300 (kart)");
  d.dogru(/Kasaya sayılmayan kayıtlar/.test(ks.cikti) && /Bakiye düzeltme: pos ile ödemişti/.test(ks.cikti), "kasa: düzeltme kaydı sayılmıyor, altta listeleniyor");
} finally { await a.kapat(); }

/* ---- haftalik: iade de "toplanan" değildir (düzeltme kuralının aynısı) ---- */
const h = await ortam(karisikGun().st);
try {
  const yeni = await h.arac(["haftalik", bugun.slice(0, 7), "--servis"]);
  const satirBul = (c) => c.split(/\r?\n/).find((l) => l.includes(bugun.slice(8, 10) + "." + bugun.slice(5, 7)) && !l.includes("servis yok")) || "";
  const toplanan = (c) => satirBul(c).split("|")[3].trim();
  // satış peşini 1300+640 + gerçek tahsilat 645+550+370 = 3.505
  d.esit(toplanan(yeni.cikti), tlArac(3505), "haftalik: bugün toplanan 3.505 (iade 190 ve düzeltmeler sayılmadı)");
  if (tabanVar) { const eski = await h.tabanArac(["haftalik", bugun.slice(0, 7), "--servis"]); d.esit(toplanan(eski.cikti), tlArac(3505 + 190), "TABAN haftalik: iadeleri (190) toplanan paraya sayıyordu"); }
} finally { await h.kapat(); }
d.bitir();
