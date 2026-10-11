// Cari sayfa denemeleri için yardımcılar. Sayfa yalnız sahte buluta bağlanan tarayıcı bağlamında açılır;
// gerçek Supabase'e hiçbir istek gitmez (sahteyeYonlendir diğer bütün dış adresleri keser).
import path from "node:path";
import { createRequire } from "node:module";
import { DEPO, statikSunucu, sahteyeYonlendir, bekle } from "../ortak/panel.mjs";
import { ornekStore } from "../ortak/ornek-store.mjs";

const require = createRequire(import.meta.url);
export const cari = require(path.join(DEPO, "tools/babuco-cari.cjs"));
export const SIR_ANAHTAR = "babuco:cari-sir", ONEK = "babuco:cari:";
export const EKRAN_DIZIN = path.resolve(DEPO, "../ekran/cari");

/** Kayda ASLA girmemesi gereken, store'a bilerek serpiştirilmiş işaretler. */
export const GIZLI = ["GIZLI-SATIS-NOTU", "GIZLI-ODEME-NOTU", "GIZLI-MUSTERI-NOTU"];

const gun = (n, saat = 11) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(saat, 0, 0, 0); return d.toISOString(); };

/** Örnek store + cari sayfanın bütün hâlleri: iade fişi, bakiye düzeltmeleri, fazla ödeme, iskonto, iç notlar. Uydurma veri. */
export function cariStore() {
  const s = ornekStore();
  s.sales.forEach((x, i) => { x.not = GIZLI[0] + "-" + i; x.items.forEach((it) => { it.alis = s.products.find((p) => p.id === it.urunId).alis; }); });
  s.payments.forEach((x) => { x.not = x.not + " " + GIZLI[1]; });
  s.customers.forEach((c) => { c.not = GIZLI[2]; c.adres = "Gizli Sokak 7"; });
  const m2 = s.customers.find((c) => c.id === "m2");
  m2.limit = 3210; m2.vade = 17;
  // m2: iade fişi (panelin/aracın ürettiği biçimde), düzeltmeler, fazla ödeme, iskontolu fiş
  s.sales.push({ id: "s6", belgeNo: new Date().getFullYear() + "-000006", musteriId: "m2", personelId: null, not: "İADE — 2 x Örnek Küp Şeker", odemeAdi: "İade",
    items: [{ urunId: "u5", ad: "Örnek Küp Şeker", barkod: "", kdv: 1, fiyat: 60, adet: -2, iskyuzde: 0, alis: 52.5 }],
    brut: -120, iskonto: 0, toplam: -120, maliyet: -105, komisyon: 0, odeme: { nakit: 0, pos: 0, acik: -120 }, tarih: gun(8), servisGun: "", hafta: "", stokKaynak: "arac" });
  s.sales.push({ id: "s7", belgeNo: new Date().getFullYear() + "-000007", musteriId: "m2", personelId: null, not: GIZLI[0], odemeAdi: null,
    items: [{ urunId: "u3", ad: "Örnek Kola 250 ml", barkod: "", kdv: 10, fiyat: 640, adet: 2, iskyuzde: 0, alis: 500 }, { urunId: "u6", ad: "Örnek Soda", barkod: "", kdv: 10, fiyat: 240, adet: 1, iskyuzde: 0, alis: 180 }],
    brut: 1520, iskonto: 20, toplam: 1500, maliyet: 1180, komisyon: 0, odeme: { nakit: 1500, pos: 0, acik: 0 }, tarih: gun(5), servisGun: "", hafta: "", stokKaynak: "arac" });
  s.payments.push({ id: "t3", musteriId: "m2", tutar: 300, odemeTuru: "nakit", not: "Satış üstü fazla ödeme → borca sayıldı (Belge " + new Date().getFullYear() + "-000007)", tarih: gun(5) });
  s.payments.push({ id: "t4", musteriId: "m2", tutar: -150, odemeTuru: "duzeltme", not: "Manuel borç ekleme " + GIZLI[1], tarih: gun(4) });
  s.payments.push({ id: "t5", musteriId: "m2", tutar: 80, odemeTuru: "duzeltme", not: "Bakiye düzeltme: " + GIZLI[1], tarih: gun(2) });
  s.payments.push({ id: "t6", musteriId: "m2", tutar: 400, odemeTuru: "havale", not: "havale attı", tarih: gun(1) });
  s.counters.sale = 7;
  return s;
}
export const satirlar = (store = cariStore()) => [{ key: "babuco:store", value: store, updated_at: new Date(Date.now() - 3600_000).toISOString() }];

/** Panelin borç formülü (beklenen bakiye). */
export function borc(store, id) {
  const c = store.customers.find((x) => x.id === id); if (!c) return 0;
  let b = Number(c.acilis) || 0;
  store.sales.forEach((s) => { if (s.musteriId === id) b += Number(s.odeme.acik) || 0; });
  store.payments.forEach((p) => { if (p.musteriId === id) b -= Number(p.tutar) || 0; });
  return Math.round(b * 100) / 100;
}
export const para = (n) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(n);

/** Buluttaki cari satırlarının anahtarları ("h" / "t"). */
export const cariAnahtarlar = (bulut, tur) => [...bulut.kv.keys()].filter((k) => k.startsWith(ONEK + (tur ? tur + ":" : ""))).sort();
export const sirOku = (bulut) => { const v = bulut.deger(SIR_ANAHTAR); return v && v.sir; };
/** Bir müşterinin yayınlanmış hesabını aracın koduyla çözer → { key, hesap, metin } | null (satır yok). */
export async function hesapCoz(bulut, musteriId) {
  const sir = sirOku(bulut); if (!sir) return null;
  const a = await cari.cariAnahtar("h", await cari.cariKod(sir, musteriId)), v = bulut.deger(a.key);
  if (!v) return null;
  const metin = await cari.cariCoz(a, v.d);
  return { key: a.key, hesap: JSON.parse(metin), metin };
}
/** Bir telefon numarasının kaydını çözer → { key, icerik } | null. */
export async function telCoz(bulut, telefon) {
  const a = await cari.cariAnahtar("t", await cari.cariTelTohum(cari.cariTel10(telefon))), v = bulut.deger(a.key);
  return v ? { key: a.key, icerik: JSON.parse(await cari.cariCoz(a, v.d)) } : null;
}
export const linkOlustur = async (bulut, musteriId) => cari.cariLink(sirOku(bulut), musteriId);
/** Satırların şifreli içeriğinin anlık görüntüsü: hangisi yeniden yazıldı diye karşılaştırmak için. */
export const goruntu = (bulut) => Object.fromEntries(cariAnahtarlar(bulut).map((k) => [k, bulut.deger(k).d]));
export const degisenler = (once, sonra) => ({
  yazilan: Object.keys(sonra).filter((k) => once[k] !== sonra[k]).sort(),
  silinen: Object.keys(once).filter((k) => !(k in sonra)).sort(),
});

/**
 * Cari sayfayı (public/cari/index.html) telefon boyutunda açar; Supabase istekleri sahte buluta gider.
 * @param {object} a  { bulutUrl (ZORUNLU), hash?, genislik?, oturum? (babuco:oturum kaydı), browser?, sunucu? }
 * Dönen: { page, context, url, istekler: [{ yontem, yol }], hatalar, kapat }
 */
export async function sayfaAc(a) {
  if (!a || !a.bulutUrl) throw new Error("sayfaAc: bulutUrl zorunlu — sayfa gerçek buluta bağlanamaz.");
  const { chromium } = await import("playwright");
  const sunucu = a.sunucu || await statikSunucu(path.join(DEPO, "public"));
  const browser = a.browser || await chromium.launch();
  const depolama = { cookies: [], origins: a.oturum ? [{ origin: sunucu.url, localStorage: [{ name: "babuco:oturum", value: JSON.stringify(a.oturum) }] }] : [] };
  const context = await browser.newContext({ viewport: { width: a.genislik || 390, height: a.yukseklik || 844 }, locale: "tr-TR", timezoneId: "Europe/Istanbul", storageState: depolama });
  await sahteyeYonlendir(context, a.bulutUrl);
  const page = await context.newPage();
  const istekler = [], hatalar = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (/supabase\.co$/.test(u.hostname)) istekler.push({ yontem: r.method(), yol: u.pathname, sorgu: decodeURIComponent(u.search) }); });
  page.on("pageerror", (e) => hatalar.push(String(e)));
  const url = sunucu.url + "/cari/index.html";
  await page.goto(url + (a.hash || ""));
  return { page, context, browser, sunucu, url, istekler, hatalar,
    kapat: async () => { await context.close(); if (!a.browser) await browser.close(); if (!a.sunucu) await sunucu.dur(); } };
}
/** Kişisel linki (yayındaki adres) denemedeki yerel sayfanın adresine çevirir. */
export const yerelLink = (s, link) => s.url + link.slice(link.indexOf("#"));
/** Hesap ekranı açılana kadar bekler; ekrandaki ad, bakiye metni ve fiş numaralarını döndürür. */
export async function hesapOku(page, ms = 15000) {
  await page.waitForSelector("#bakiyeTutar", { timeout: ms });
  return page.evaluate(() => ({
    ad: (document.getElementById("musteriAd") || {}).textContent || "",
    etiket: document.querySelector(".bakiye .etiket").textContent.trim(),
    bakiye: document.getElementById("bakiyeTutar").textContent.trim(),
    fisler: Array.from(document.querySelectorAll("details.fis"), (d) => d.dataset.no),
    metin: document.getElementById("kok").innerText,
  }));
}
/** Telefonla giriş formunu doldurur; hesap açılana ya da hata yazılana kadar bekler. Dönen: hata metni ("" = açıldı). */
export async function telefonlaGir(page, telefon) {
  await page.waitForSelector("#tel");
  await page.fill("#tel", telefon);
  await page.click("#telBtn");
  await page.waitForFunction(() => document.getElementById("bakiyeTutar") || (document.getElementById("hata") && document.getElementById("hata").textContent && !document.getElementById("telBtn").disabled), null, { timeout: 20000 });
  return page.evaluate(() => (document.getElementById("hata") || { textContent: "" }).textContent);
}
export { bekle };
