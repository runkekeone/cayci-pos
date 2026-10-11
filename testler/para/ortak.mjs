// para denemelerinin ortak yardımcıları. Hiçbiri gerçek buluta gitmez (sahte bulut + panelAc).
// "Taban" = düzeltmelerden önceki sürüm (_wt/taban, yalnız OKUNUR): aynı senaryo orada da çalıştırılıp
// "önce yanlıştı, şimdi doğru" gösterilir. Taban klasörü yoksa o karşılaştırmalar atlanır.
import fs from "node:fs";
import path from "node:path";
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { panelAc, aracCalistir, bekle, DEPO } from "../ortak/panel.mjs";
import { ornekStore, ornekSatirlar } from "../ortak/ornek-store.mjs";

export { ornekStore, bekle, aracCalistir };
export const TABAN = path.resolve(DEPO, "../taban");
export const TABAN_PANEL = path.join(TABAN, "public/toptanci");
export const TABAN_ARAC = path.join(TABAN, "tools/babuco.cjs");
export const tabanVar = fs.existsSync(path.join(TABAN_PANEL, "app.js")) && fs.existsSync(TABAN_ARAC);
export const EKRAN = path.resolve(DEPO, "../ekran/para");

const p2 = (x) => String(x).padStart(2, "0");
export const gunStr = (d) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
/** n gün önce, verilen saatte (yerel) — ISO metni. */
export function gun(n = 0, saat = 11, dk = 0) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(saat, dk, 0, 0); return d.toISOString(); }
export const bugunStr = () => gunStr(new Date());
export const tl = (n) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(n);          // panelin biçimi: ₺1.234,50
export const tlArac = (n) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " ₺"; // aracın biçimi: 1.234,50 ₺

/** Örnek store'dan kalem üretir (alis YAZMAZ → eski kayıt gibi). */
export function satis(st, n, musteriId, kalemler, odeme, tarih, ek = {}) {
  const items = kalemler.map(([urunId, adet, fiyat]) => { const p = st.products.find((x) => x.id === urunId); return { urunId, ad: p.ad, barkod: "", kdv: p.kdv, fiyat: fiyat == null ? p.satis : fiyat, adet, iskyuzde: 0 }; });
  const toplam = items.reduce((a, i) => a + i.fiyat * i.adet, 0);
  const maliyet = items.reduce((a, i) => a + st.products.find((x) => x.id === i.urunId).alis * i.adet, 0);
  const d = new Date(tarih);
  return { id: "sx" + n, belgeNo: d.getFullYear() + "-" + String(n).padStart(6, "0"), musteriId, personelId: null, not: "", odemeAdi: null, items, brut: toplam, iskonto: 0, toplam, maliyet, komisyon: 0, odeme: { nakit: 0, pos: 0, acik: 0, ...odeme }, tarih, servisGun: gunStr(d), hafta: "", stokKaynak: "arac", ...ek };
}

/** Sahte bulut + panel. diyalogKarar(d) → true/false (kabul/ret) ya da prompt için metin; verilmezse hepsi kabul. */
export async function ortam(store, sec = {}) {
  const bulut = await sahteBulut({ satirlar: ornekSatirlar(store) });
  const karar = { fn: sec.diyalogKarar || null };
  const p = await panelAc({
    bulutUrl: bulut.url, panelDizin: sec.taban ? TABAN_PANEL : undefined, browser: sec.browser,
    diyalog: async (d) => {
      const k = karar.fn ? karar.fn(d) : true;
      if (d.type() === "prompt") return d.accept(typeof k === "string" ? k : d.defaultValue()).catch(() => {});
      return (k === false ? d.dismiss() : d.accept()).catch(() => {});
    },
  });
  await p.page.waitForFunction((n) => window.app.getStore().customers.length === n && window.app.getStore().sales.length > 0, store.customers.length, { timeout: 10000 });
  await bekle(150);
  return {
    bulut, p, page: p.page, karar,
    arac: (args) => aracCalistir(bulut.url, args),
    tabanArac: (args) => aracCalistir(bulut.url, args, { arac: TABAN_ARAC }),   // YALNIZ okuma komutları (taban klasörüne yazmamak için --kaydet YOK)
    kapat: async () => { await p.kapat(); await bulut.dur(); },
  };
}
export async function git(page, yol) {
  await page.evaluate((r) => { if (location.hash === "#/" + r) window.app.render(); else location.hash = "#/" + r; }, yol);
  await bekle(200);
}
/** Ekrandaki özet kutuları: { "Nakit Kasa": "₺265,00", ... } */
export async function statlar(page) {
  return page.evaluate(() => { const o = {}; document.querySelectorAll(".stat").forEach((s) => { const l = s.querySelector(".s-label"), v = s.querySelector(".s-value"); if (l && v) o[l.textContent.trim()] = v.textContent.trim().replace(/ /g, " "); }); return o; });
}
/** Markdown tablosundan "| etiket | değer |" satırının değerini (yıldızsız) verir. */
export function mdDeger(cikti, etiket) {
  const satir = cikti.split(/\r?\n/).find((l) => l.replace(/\*/g, "").trim().startsWith("| " + etiket + " |"));
  return satir ? satir.replace(/\*/g, "").split("|")[2].trim() : null;
}
export async function ekran(page, ad) {
  fs.mkdirSync(EKRAN, { recursive: true });
  const yol = path.join(EKRAN, ad + ".png");
  await page.screenshot({ path: yol, fullPage: false });
  return yol;
}

/** KARIŞIK GÜN: bugün nakit/kart/havale/iade/düzeltme/peşin alım hem yeni alanlı hem eski (alansız) kayıtlarla.
 *  Beklenen rakamlar aşağıda `beklenen` içinde elle hesaplanmıştır (koddan türetilmez). */
export function karisikGun() {
  const st = ornekStore();
  const t = (saat, dk = 0) => gun(0, saat, dk);
  const A = satis(st, 11, "m1", [["u1", 10, 100]], { nakit: 1000 }, t(9));                    // ciro 1000, maliyet 700
  const B = satis(st, 12, "m2", [["u3", 1]], { pos: 640 }, t(9, 30), { komisyon: 12.8 });     // ciro 640,  maliyet 500
  const C = satis(st, 13, "m3", [["u3", 1, 640]], { nakit: 300, acik: 340 }, t(10));          // ciro 640,  maliyet 500
  st.sales.push(A, B, C);
  st.counters.sale = 13;
  st.payments.push(
    { id: "k1", musteriId: "m2", tutar: 500, odemeTuru: "nakit", not: "", tarih: t(10, 5) },
    { id: "k2", musteriId: "m2", tutar: 400, odemeTuru: "kart", not: "", tarih: t(10, 6) },
    { id: "k3", musteriId: "m3", tutar: 250, odemeTuru: "havale", not: "", tarih: t(10, 7) },
    { id: "k4", musteriId: "m1", tutar: 100, odemeTuru: "iade", not: "Ürün iadesi: Örnek Bardak Su 200 ml", tarih: t(10, 8) },
    { id: "k5", musteriId: "m2", tutar: -200, odemeTuru: "duzeltme", not: "Manuel borç ekleme", tarih: t(10, 9) },
    // eski kayıtlar: odemeTuru alanı YOK, tür nottan çıkar
    { id: "k6", musteriId: "m3", tutar: 150, not: "Saha tahsilat (pos)", tarih: t(10, 10) },                  // kart
    { id: "k7", musteriId: "m3", tutar: 120, not: "havale geldi", tarih: t(10, 11) },                         // havale
    { id: "k8", musteriId: "m1", tutar: 90, not: "Ürün iadesi: Örnek Kola 250 ml", tarih: t(10, 12) },        // iade
    { id: "k9", musteriId: "m2", tutar: 60, not: "Bakiye düzeltme: pos ile ödemişti", tarih: t(10, 13) },     // düzeltme (kart DEĞİL)
    { id: "k10", musteriId: "m2", tutar: 75, not: "", tarih: t(10, 14) },                                     // nakit
    { id: "k11", musteriId: "m1", tutar: 70, not: "Satış üstü fazla ödeme → borca sayıldı (Belge " + A.belgeNo + ")", tarih: t(9, 1) }, // nakit
  );
  st.expenses.push(
    { id: "e1", tutar: 200, kategori: "Yakıt", not: "mazot", tarih: t(12) },                                  // araç biçimi → nakit
    { id: "e2", tutar: 150, tur: "Yemek", not: "", odeme: "POS", tarih: t(13) },                              // panel biçimi, kartla
    { id: "e3", tutar: 480, kategori: "Araç Stok Alımı", not: "4 x Örnek Pet Su", tarih: t(14) },             // mal alımı: kasadan çıkar, gider değil
  );
  st.incomes.push({ id: "i1", tutar: 300, tur: "Kira", not: "", odeme: "Nakit", tarih: t(15) }, { id: "i2", tutar: 100, tur: "Diğer", not: "", odeme: "Havale", tarih: t(15, 5) });
  st.firmalar.push({ id: "f1", ad: "Deneme Tedarik" });
  st.firmaPayments.push({ id: "fo1", firmaId: "f1", tutar: 400, tarih: t(16) }, { id: "fo2", firmaId: "f1", tutar: 250, odemeTuru: "havale", tarih: t(16, 5) });
  const alim = (id, toplam, ek) => ({ id, no: id, firmaId: "f1", items: [{ urunId: "u2", ad: "Örnek Pet Su 500 ml", adet: 1, birimFiyat: toplam }], toplam, odeme: "pesin", borc: 0, tarih: t(17), ...ek });
  st.purchases.push(alim("a1", 900, { odemeTuru: "nakit" }), alim("a2", 700, { odemeTuru: "kart" }), alim("a3", 500, {}), alim("a4", 800, { odeme: "veresiye", borc: 800 }));
  const beklenen = {
    satisNakit: 1300, satisPos: 640, satisAcik: 340, ciro: 2280, maliyet: 1700, komisyon: 12.8,
    tahNakit: 645, tahKart: 550, tahHavale: 370, iade: 190, duzeltme: -140,
    giderNakit: 680, giderDiger: 150, giderMal: 480, gelirNakit: 300, gelirDiger: 100,
    firmaNakit: 400, firmaDiger: 250, alimNakit: 900, alimDiger: 700,
    nakitKasa: 265,          // 1300 + 645 + 300 − 680 − 400 − 900
    kartHavale: 1660,        // 640 + 550 + 370 + 100
    urunKar: 580, giderIsletme: 350, gelir: 400,
    netKar: 617.2,           // 580 − 12,8 − 350 + 400
    // taban sürümün verdiği (yanlış) rakamlar — bütün tahsilat nakit sayılıyor, iade/düzeltme kasaya giriyor:
    tabanAnasayfa: 2485,     // 1300 + 1615 + 400 − 830        (firma ödemesi ve peşin alım düşülmüyor)
    tabanGunluk: 1835,       // 2485 − 650
  };
  return { st, beklenen, A, B, C };
}
