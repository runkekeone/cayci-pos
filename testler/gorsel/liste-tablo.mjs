// Ortak tablo davranışı (görsel yenileme, madde 22): az kayıtta arama / sayfalama yok, çok kayıtta var.
// tableCard + enhanceTables panelin bütün tablolarında çalışır; burada Gelirler tablosuyla ve diğer ekranların
// açılışıyla sınanır. Çalıştır: node testler/gorsel/liste-tablo.mjs
import { denetci } from "../ortak/panel.mjs";
import { listeStore, listeAc, bekle, olcu } from "./liste-veri.mjs";

const d = denetci("gorsel/liste-tablo");
const o = await listeAc(listeStore());
const { page, git } = o;
const gelirYap = async (n) => { await page.evaluate((k) => { store.incomes = Array.from({ length: k }, (_, i) => ({ id: "gg" + i, tutar: 100 + i, not: i === 3 ? "IŞIKLI tabela kirası" : (i === 4 ? "çay ocağı payı" : "gelir " + (i + 1)), tur: "Diğer", odeme: "Nakit", tarih: new Date(Date.now() - i * 3600000).toISOString() })); }, n); await git("gelirler"); };
const durum = () => page.evaluate(() => {
  const gor = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const k = document.querySelector("#content .gl-tablo");
  return { arama: gor(k.querySelector(".tbl-search")), sayfa: gor(k.querySelector(".pager")) && k.querySelectorAll(".pager button").length > 0, bilgi: gor(k.querySelector(".tbl-info")) ? k.querySelector(".tbl-info").textContent : "", satir: [...k.querySelectorAll("tbody tr")].filter((tr) => !tr.classList.contains("empty-row") && gor(tr)).length, bos: gor(k.querySelector(".empty-row")), eskiSayfa: /İlk|Son$/.test(k.querySelector(".pager").textContent) };
});
try {
  console.log("— 22: az kayıtta arama / sayfalama yok");
  await gelirYap(0);
  let s = await durum();
  d.dogru(!s.arama && !s.sayfa && !s.bilgi && s.bos && s.satir === 0, "boş tablo: yalnız \"Kayıt bulunamadı.\" — arama kutusu, sayfa düğmesi, \"0 kayıttan…\" yok");
  await gelirYap(1); s = await durum();
  d.dogru(!s.arama && !s.sayfa && !s.bilgi && s.satir === 1 && !s.eskiSayfa, "tek kayıt: arama kutusu yok, sayfa numarası yok, \"1 kayıttan…\" yok");
  await gelirYap(5); s = await durum();
  d.dogru(!s.arama && !s.sayfa && s.satir === 5, "5 kayıt: hâlâ arama / sayfalama yok");
  await gelirYap(8); s = await durum();
  d.dogru(s.arama && !s.sayfa && !s.bilgi && s.satir === 8, "8 kayıt: arama kutusu var (5'ten çok), tek sayfaya sığdığı için sayfa düğmesi yok");

  console.log("— 22: çok kayıtta arama + sayfalama var");
  await gelirYap(24); s = await durum();
  d.dogru(s.arama && s.sayfa && s.satir === 10 && /^24 kayıttan 1–10/.test(s.bilgi), "24 kayıt: arama + sayfa düğmeleri var, ilk 10 satır görünüyor (\"" + s.bilgi + "\")");
  const dugme = await page.evaluate(() => [...document.querySelectorAll("#content .pager button")].map((b) => ({ yazi: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), kapali: b.disabled })));
  d.dogru(dugme.length === 2 && dugme[0].yazi === "Önceki" && dugme[1].yazi === "Sonraki" && dugme.every((b) => b.h >= 44) && dugme[0].kapali && !dugme[1].kapali, "sayfa düğmeleri: Önceki (ilk sayfada kapalı) / Sonraki, en az 44 px");
  d.dogru(/Sayfa 1 \/ 3/.test(await page.textContent("#content .pager")), "\"Sayfa 1 / 3\" yazıyor");
  await page.click("#content .pager button:last-child"); await bekle(150); s = await durum();
  d.dogru(s.satir === 10 && /^24 kayıttan 11–20/.test(s.bilgi) && /Sayfa 2 \/ 3/.test(await page.textContent("#content .pager")), "Sonraki → 11–20. kayıtlar");
  await page.click("#content .pager button:last-child"); await bekle(150); s = await durum();
  d.dogru(s.satir === 4 && /Sayfa 3 \/ 3/.test(await page.textContent("#content .pager")) && await page.evaluate(() => document.querySelector("#content .pager button:last-child").disabled), "son sayfada 4 kayıt, Sonraki kapalı");
  await page.click("#content .pager button:first-child"); await bekle(150); s = await durum();
  d.dogru(/^24 kayıttan 11–20/.test(s.bilgi), "Önceki → 11–20. kayıtlara dönüyor");
  d.dogru(await page.evaluate(() => { const i = document.querySelector("#content .tbl-search").getBoundingClientRect(); return i.height >= 44; }), "tablo arama kutusu en az 44 px");

  console.log("— tablo araması Türkçe harfe duyarsız");
  for (const [q, n] of [["isikli", 1], ["ISIKLI", 1], ["ışıklı", 1], ["cay ocagi", 1], ["ÇAY", 1], ["gelir", 22]]) {
    await page.fill("#content .tbl-search", q); await bekle(100);
    const toplam = await page.evaluate(() => { const b = document.querySelector("#content .tbl-info").textContent; const m = b.match(/^(\d+) kayıt/); return m ? Number(m[1]) : 0; });
    d.esit(toplam, n, "\"" + q + "\" → " + n + " kayıt");
  }
  await page.fill("#content .tbl-search", "isikli"); await bekle(100); s = await durum();
  d.dogru(s.satir === 1 && !s.sayfa && s.bilgi === "1 kayıt bulundu", "arama sonucu tek sayfaya sığınca sayfa düğmeleri gizleniyor");
  await page.fill("#content .tbl-search", "hicyok"); await bekle(100); s = await durum();
  d.dogru(s.satir === 0 && s.bilgi === "Aramaya uyan kayıt yok." && s.arama, "eşleşme yok: \"Aramaya uyan kayıt yok.\" (arama kutusu duruyor)");
  await page.fill("#content .tbl-search", ""); await bekle(100); s = await durum();
  d.dogru(s.satir === 10 && s.sayfa, "arama silinince liste ve sayfalama geri geliyor");
  d.dogru(await page.evaluate(() => { const w = document.querySelector("#content .gl-tablo .table-wrap"), c = getComputedStyle(w); return w.scrollHeight <= w.clientHeight + 1 && c.overflowY !== "auto" && c.overflowY !== "scroll"; }), "telefonda tablo kendi kutusunda ayrı kaymıyor (iç içe kaydırma yok)");

  console.log("— diğer ekranlar bozulmadı (açılıyor, taşma yok, hata yok)");
  const yollar = ["anasayfa", "rapor-urunsel", "rapor-grupsal", "rapor-stokhareket", "rapor-tarihsel", "musteri-analiz", "urun-analiz", "alis-faturalari", "giderler", "gelirler", "cay-ocagi", "servisciler", "firmalar", "stok-sayimi", "urun-gruplari", "arac-yukleme", "dukkan"];
  for (const yol of yollar) {
    await git(yol);
    const r = await page.evaluate(() => {
      const gor = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
      const kartlar = [...document.querySelectorAll("#content .gl-tablo")];
      const tutarsiz = kartlar.filter((k) => { const n = [...k.querySelectorAll("tbody tr")].filter((tr) => !tr.classList.contains("empty-row")).length; const arama = gor(k.querySelector(".tbl-search")), sayfa = k.querySelectorAll(".pager button").length > 0 && gor(k.querySelector(".pager")); return (n <= 5 && arama) || (n <= 10 && sayfa) || (n > 10 && !sayfa) || (n > 5 && !arama); }).length;
      return { hata: !!document.querySelector("#content > .card > pre"), tasma: document.documentElement.scrollWidth - window.innerWidth, kart: kartlar.length, tutarsiz, eski: [...document.querySelectorAll("#content .pager")].some((p) => /İlk/.test(p.textContent)) };
    });
    d.dogru(!r.hata && r.tasma <= 0 && r.tutarsiz === 0 && !r.eski, yol + ": açıldı, taşma yok, " + r.kart + " tabloda arama/sayfalama kayıt sayısına uygun");
  }
  d.esit(o.hatalar, [], "sayfada betik hatası yok");
} finally { await o.kapat(); }
d.bitir();
