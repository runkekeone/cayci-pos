// Eşitleme denemelerinin ortak yardımcıları. testler/ortak/'a dokunmaz; onu sarmalar.
//
//  senkronBulut()  → sahteBulut + gerçek sunucuya daha çok benzeyen üç ek:
//     · jsonb gibi davranır: yazılan değerlerin anahtar SIRASI korunmaz (Postgres jsonb yeniden sıralar).
//       Sıraya güvenen bir karşılaştırma burada da bozulsun diye.
//     · select=…,ozet:value->ozet (PostgREST JSON yolu) desteği — yedek listesi bunu kullanır.
//     · arıza düğmeleri: okumaHatasi (GET 500), yanitKaybi (yazma işlenir ama yanıt gelmez),
//       yazmalar (kimin neyi yazdığının dökümü).
//  ESKI kodu aynı senaryoyla koşturmak için:  SENKRON_PANEL=<…/taban/public/toptanci>  SENKRON_ARAC=<…/taban/tools/babuco.cjs>
import path from "node:path";
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { panelAc, aracCalistir as aracOrtak, denetci, bekle } from "../ortak/panel.mjs";
export { denetci, bekle };
export { ornekStore, ornekSatirlar, borc } from "../ortak/ornek-store.mjs";

export const STORE = "babuco:store";
export const ESKI_MI = !!process.env.SENKRON_PANEL;

/** Postgres jsonb anahtar sırası: önce kısa anahtar, eşit uzunlukta harf sırası. */
export function jsonbSira(v) {
  if (Array.isArray(v)) return v.map(jsonbSira);
  if (v && typeof v === "object") {
    const o = {};
    Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).forEach((k) => { o[k] = jsonbSira(v[k]); });
    return o;
  }
  return v;
}
/** Anahtar sırasından bağımsız metin (karşılaştırma için). */
export function sirali(v) {
  if (Array.isArray(v)) return "[" + v.map(sirali).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + sirali(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
export const ayni = (a, b) => sirali(a) === sirali(b);

export async function senkronBulut(a = {}) {
  const ayar = { okumaHatasi: 0, yanitKaybi: 0, yazmadanOnce: null, yedekYazmaHatasi: false, jsonb: a.jsonb !== false, yazmalar: [], okumalar: 0 };
  const once = async (req, res, ctx) => {
    const { url, tablolar } = ctx;
    if (url.pathname !== "/rest/v1/kv") return false;
    const yazma = ["POST", "PATCH", "DELETE"].includes(req.method);
    if (!yazma) {
      ayar.okumalar++;
      if (ayar.okumaHatasi) { if (ayar.okumaHatasi > 0) ayar.okumaHatasi--; ctx.yanit(500, { message: "sahte bulut: okuma hatasi" }); return true; }
      const select = url.searchParams.get("select") || "";
      if (!select.includes("->")) return false;
      // PostgREST JSON yolu: [takma:]sutun->a->b
      let satirlar = [...tablolar.kv.values()];
      for (const [sutun, ham] of url.searchParams) {
        if (["select", "order", "limit", "offset"].includes(sutun)) continue;
        const i = ham.indexOf("."), op = ham.slice(0, i), deger = ham.slice(i + 1);
        if (op === "eq") satirlar = satirlar.filter((s) => String(s[sutun]) === deger);
        else if (op === "like") { const re = new RegExp("^" + deger.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*") + "$"); satirlar = satirlar.filter((s) => re.test(String(s[sutun]))); }
        else { ctx.yanit(400, { message: "senkronBulut: desteklenmeyen suzgec " + ham }); return true; }
      }
      const order = url.searchParams.get("order");
      if (order) { const [s, yon] = order.split("."); satirlar.sort((x, y) => (String(x[s]) < String(y[s]) ? -1 : 1) * (yon === "desc" ? -1 : 1)); }
      const lim = url.searchParams.get("limit"); if (lim != null) satirlar = satirlar.slice(0, Number(lim));
      const sutunlar = select.split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
        const j = x.indexOf(":"); const takma = j > 0 && !x.slice(0, j).includes("->") ? x.slice(0, j) : null; const yol = (takma ? x.slice(j + 1) : x).split("->");
        return { ad: takma || yol[yol.length - 1], yol };
      });
      ctx.yanit(200, satirlar.map((s) => { const o = {}; sutunlar.forEach((c) => { let v = s; for (const p of c.yol) v = v == null ? null : v[p]; o[c.ad] = v === undefined ? null : v; }); return o; }));
      return true;
    }
    // ---- yazma ----
    let govdeAnahtar = null; try { const g = JSON.parse(ctx.govde.toString() || "null"); govdeAnahtar = g && !Array.isArray(g) ? g.key : null; } catch (e) {}
    const anahtar = govdeAnahtar || (url.searchParams.get("key") || "").replace(/^eq\./, "");
    const kayit = { yontem: req.method, anahtar, sorgu: url.search, kosullu: url.searchParams.has("updated_at"), prefer: String(req.headers["prefer"] || "") };
    ayar.yazmalar.push(kayit);
    const sonOrj = res.end.bind(res), basOrj = res.writeHead.bind(res);
    res.writeHead = (st, ...x) => { kayit.durum = st; return basOrj(st, ...x); };
    if (ayar.yedekYazmaHatasi && req.method === "POST" && /^babuco:yedek:/.test(anahtar)) { kayit.durum = 500; ctx.yanit(500, { message: "sahte bulut: yedek yazilamadi" }); return true; }
    // Panel okudu, yazmak üzere: tam bu arada "başka biri" yazsın (tek seferlik kanca) → koşullu yazma tutmamalı.
    if (ayar.yazmadanOnce && anahtar === STORE && req.method === "PATCH") { const f = ayar.yazmadanOnce; ayar.yazmadanOnce = null; await f(ctx); }
    const kayip = ayar.yanitKaybi > 0 && req.method === "PATCH" && anahtar === STORE;
    if (kayip) { ayar.yanitKaybi--; res.writeHead = () => res; }
    res.end = (...x) => {
      kayit.bos = x[0] === "[]";                              // koşul tutmadı: hiçbir satır yazılmadı
      if (ayar.jsonb) for (const s of tablolar.kv.values()) s.value = jsonbSira(s.value);
      if (kayip) { req.socket.destroy(); return res; }       // yazma İŞLENDİ ama yanıt hiç gelmedi
      return sonOrj(...x);
    };
    return false;
  };
  const satirlar = (a.satirlar || []).map((s) => (ayar.jsonb ? { ...s, value: jsonbSira(s.value) } : s));
  const b = await sahteBulut({ ...a, satirlar, once });
  b.ayar = ayar;
  /** babuco:store'a ulaşan yazmalar (yöntem + koşullu mu) */
  b.storeYazmalari = () => ayar.yazmalar.filter((y) => y.anahtar === STORE);
  /** koşulu tutmadığı için reddedilen (hiçbir şey yazmayan) yazma sayısı */
  b.cakismalar = () => b.storeYazmalari().filter((y) => y.kosullu && y.bos).length;
  b.yedekAnahtarlari = () => [...b.kv.keys()].filter((k) => k.startsWith("babuco:yedek:")).sort();
  b.store = () => b.deger(STORE);
  return b;
}

/** Yazdırma sorusuna "hayır", diğer her soruya "tamam" diyen diyalog kuralı. */
export function diyalogKurali(kayit) {
  return async (d) => {
    if (kayit) kayit.push({ tur: d.type(), mesaj: d.message() });
    if (d.type() === "confirm" && /yazdırılsın/i.test(d.message())) return d.dismiss().catch(() => {});
    return d.accept(d.type() === "prompt" ? d.defaultValue() : undefined).catch(() => {});
  };
}
/** Paneli (telefon boyutunda) açar; SENKRON_PANEL verilmişse o klasördeki (eski) paneli. */
export async function panel(bulut, a = {}) {
  const sorular = [];
  const p = await panelAc({ bulutUrl: bulut.url, panelDizin: process.env.SENKRON_PANEL ? path.resolve(process.env.SENKRON_PANEL) : undefined, diyalog: diyalogKurali(sorular), ...a });
  p.sorular = sorular;
  return p;
}
/** Aynı "telefonda" (aynı tarayıcı bağlamı = aynı localStorage) paneli yeniden açar. */
export async function yenidenAc(p, yol = "") {
  const page = await p.context.newPage();
  const hatalar = [], sorular = [];
  page.on("pageerror", (e) => hatalar.push(String(e)));
  page.on("dialog", diyalogKurali(sorular));
  await page.goto(p.panelUrl + "/index.html" + yol);
  await page.waitForFunction(() => window.app && typeof window.app.getStore === "function");
  return { page, hatalar, sorular };
}
export function aracCalistir(bulut, argumanlar) {
  return aracOrtak(typeof bulut === "string" ? bulut : bulut.url, argumanlar, { arac: process.env.SENKRON_ARAC || undefined });
}
/** Panelden satış yap (sepete ekle + bitir). Döner: { id, belgeNo } */
export function satis(page, urunId, tur = "nakit", musteriId = null, adet = 1) {
  return page.evaluate(([u, t, m, n]) => {
    pos.carts[pos.active].musteriId = m;
    for (let i = 0; i < n; i++) window.app.addToCart(u);
    window.app.finalizeSale(t);
    document.querySelectorAll(".modal-overlay").forEach((x) => x.remove());   // fiş gönder penceresi açıldıysa kapat
    const s = store.sales[store.sales.length - 1];
    return { id: s.id, belgeNo: s.belgeNo };
  }, [urunId, tur, musteriId, adet]);
}
/** Panelden tahsilat kaydı (müşteri kartındaki "Ödeme Al"ın yazdığı kayıtla aynı biçim). */
export function tahsilat(page, musteriId, tutar, not = "Saha tahsilat") {
  return page.evaluate(([m, t, n]) => { store.payments.push({ id: genId(), musteriId: m, tutar: t, not: n, tarih: new Date().toISOString() }); saveStore(); }, [musteriId, tutar, not]);
}
/** Panel ilk çekmeyi bitirene kadar bekle. */
export async function hazir(page, ms = 15000) {
  if (ESKI_MI) return page.waitForFunction(() => _bulutHazir === true, null, { timeout: ms });
  return page.waitForFunction(() => _bulutHazir === true && !_esCalisiyor, null, { timeout: ms });
}
/** Panelde gönderilmeyi bekleyen hiçbir şey kalmayana kadar bekle (eski panelde: sabit süre). */
export async function esitlendi(page, ms = 20000) {
  if (ESKI_MI) return bekle(1800);
  return page.waitForFunction(() => !esBekleyenVar() && !_esCalisiyor && !_yazZamanlayici, null, { timeout: ms });
}
export async function kosul(fn, ms = 15000, ne = "koşul") {
  const son = Date.now() + ms;
  while (Date.now() < son) { if (await fn()) return true; await bekle(100); }
  throw new Error("zaman aşımı: " + ne);
}
export const bul = (liste, id) => (liste || []).find((x) => x.id === id);

/** Yalnız BU telefonun internetini kes / geri ver (araç ve diğer telefon çalışmaya devam eder).
 *  navigator.onLine "çevrimiçi" demeye devam eder: sahadaki gerçek durum budur (çubuk dolu, veri akmıyor). */
export async function baglantiKes(p) {
  if (!p._kesik) {
    p._kesik = { acik: false };
    await p.context.route(/^https:\/\/[a-z0-9-]+\.supabase\.co\//, (route) => (p._kesik.acik ? route.abort("internetdisconnected") : route.fallback()));
  }
  p._kesik.acik = true;
}
export function baglantiAc(p) { if (p._kesik) p._kesik.acik = false; }
/** Panelin internet yoklamasını (normalde 8 sn'de bir) hemen çalıştır. */
export const yokla = (page) => page.evaluate(() => internetKontrol(true));

/** İstanbul saatine göre n gün önceki tarih: "YYYY-AA-GG" (panel ve araç yedek anahtarında bunu kullanır). */
export function istGun(n = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - n * 86400000));
}
/** Sahte buluta konacak hazır yedek satırı. */
export function yedekSatiri(anahtarEki, store, ek = {}) {
  const say = (k) => (Array.isArray(store[k]) ? store[k].length : 0);
  return { key: "babuco:yedek:" + anahtarEki, updated_at: new Date().toISOString(),
    value: { ozet: { satis: say("sales"), musteri: say("customers"), tahsilat: say("payments"), urun: say("products"), alindi: new Date().toISOString(), kim: "deneme", tur: "gunluk", ...ek }, store } };
}
