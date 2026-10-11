// Liste ekranlarının görüntülerini alır (uydurma veri, sahte bulut): node testler/gorsel/liste-ekran.mjs [süzgeç]
//   GENISLIK=360 → dar telefon;  ONCE=1 → değişiklikten önceki panel (_wt/g-taban, yalnız okunur) — dosya adı "once-…"
// Çıktı: _wt/ekran/g-liste/<genişlik>/…png
import fs from "node:fs";
import path from "node:path";
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { panelAc, DEPO } from "../ortak/panel.mjs";
import { ornekSatirlar } from "../ortak/ornek-store.mjs";
import { listeStore, EKRAN, bekle } from "./liste-veri.mjs";

const G = Number(process.env.GENISLIK) || 390, ONCE = !!process.env.ONCE, SUZ = process.argv[2] || "";
const CIKTI = path.join(EKRAN, String(G)); fs.mkdirSync(CIKTI, { recursive: true });
const st = listeStore();
const bulut = await sahteBulut({ satirlar: ornekSatirlar(st) });
const p = await panelAc({ bulutUrl: bulut.url, genislik: G, panelDizin: ONCE ? path.resolve(DEPO, "../g-taban/public/toptanci") : undefined, diyalog: (d) => d.dismiss().catch(() => {}) });
const { page } = p;
const cek = async (ad, tam) => { if (SUZ && !ad.includes(SUZ)) return; await bekle(300); await page.screenshot({ path: path.join(CIKTI, (ONCE ? "once-" : "") + ad + ".png"), fullPage: !!tam }); console.log("  " + ad); };
const git = async (yol) => { await page.evaluate((y) => { document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()); if (location.hash === "#/" + y) render(); else location.hash = "#/" + y; }, yol); await bekle(350); await page.evaluate(() => window.scrollTo(0, 0)); };
const detay = async (id) => { await page.evaluate((x) => { selectedCustomerId = x; }, id); await git("musteri-detay"); };
try {
  await page.waitForFunction((n) => store.customers.length === n, st.customers.length, { timeout: 15000 });
  // --- müşteriler ---
  await git("musteriler"); await cek("01-musteriler"); await cek("01b-musteriler-tam", true);
  if (!ONCE) {
    await page.fill("#glMusAra", "isik kaf"); await cek("02-musteri-arama");
    await page.fill("#glMusAra", "zzz bulunmaz"); await cek("03-musteri-sonuc-yok");
    await page.fill("#glMusAra", ""); await page.click('[data-act="gl-diger"]'); await cek("04-musteriler-diger");
  }
  // --- müşteri detayı ---
  for (const [id, ad] of [["m5", "05-detay-borclu-limit"], ["m10", "06-detay-gecikmis"], ["m6", "07-detay-borcsuz"], ["m4", "08-detay-yeni"], ["m9", "09-detay-buyuk-tutar"], ["m7", "10-detay-uzun-ad"], ["m11", "11-detay-cok-alisveris"], ["m12", "12-detay-alacakli"]]) { await detay(id); await cek(ad); await cek(ad + "-tam", true); }
  if (!ONCE) {
    await detay("m5"); await page.click('[data-act="gl-diger"]'); await cek("13-detay-diger");
    await page.click(".gl-menu-oge.gl-tehlike"); await cek("14-musteri-sil-onay");
    await detay("m5"); await page.click(".gl-oz-dokum summary"); await cek("15-detay-dokum-acik");
  }
  // --- ürünler ---
  await git("urunler"); await cek("20-urunler"); await cek("20b-urunler-tam", true);
  if (!ONCE) {
    await page.fill("#glUrunAra", "uzun adli"); await cek("21-urun-arama");
    await page.fill("#glUrunAra", "eksi yok boyle"); await cek("22-urun-sonuc-yok");
    await page.fill("#glUrunAra", ""); await page.click('[data-act="gl-diger"]'); await cek("23-urunler-diger");
    await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));
    await page.click('.gl-satir[data-edit="u10"]'); await bekle(350); await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await cek("24-urun-duzenle-sil");
    await page.click("#glUrunSil"); await cek("25-urun-sil-onay");
  }
  // --- günlük rapor satış listesi ---
  await git("rapor-gunluk"); await cek("30-rapor-secim-yok"); await cek("30b-rapor-tam", true);
  await page.evaluate(() => { const k = document.querySelectorAll(".sat-sel"); k[0].click(); k[2].click(); }); await cek("31-rapor-iki-secim");
  await page.evaluate(() => { reportFilters["rapor-tarihsel"] = { from: "2020-01-01", to: todayStr() }; }); await git("rapor-tarihsel"); await cek("32-rapor-tarihsel"); await cek("32b-rapor-tarihsel-tam", true);
  // --- ortak tablo: diğer ekranlar (daha kötü olmamalı) ---
  for (const [yol, ad] of [["giderler", "40-giderler-tek-kayit"], ["gelirler", "41-gelirler-cok-kayit"], ["rapor-urunsel", "42-urunsel-rapor"], ["musteri-analiz", "43-musteri-analiz"], ["alis-faturalari", "44-alis-faturalari"], ["rapor-stokhareket", "45-stok-hareket"], ["anasayfa", "46-anasayfa"], ["cay-ocagi", "47-cay-ocagi"], ["servisciler", "48-servisciler"], ["urun-analiz", "49-urun-analiz"], ["firmalar", "50-firmalar"], ["stok-sayimi", "51-stok-sayimi"]]) { await git(yol); await cek(ad); await cek(ad + "-tam", true); }
  if (!ONCE) {
    await git("gelirler"); await page.evaluate(() => { const b = [...document.querySelectorAll(".gl-sayfa-btn")].pop(); b.click(); window.scrollTo(0, document.body.scrollHeight); }); await cek("41c-gelirler-sayfa-2");
    await git("gelirler"); await page.fill(".tbl-search", "ISIKLI"); await cek("41d-gelirler-arama");
  }
  console.log("betik hatası:", JSON.stringify(p.hatalar));
} finally { await p.kapat(); await bulut.dur(); }
process.exit(0);
