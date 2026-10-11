// Paneli denemede açmak için ortak yardımcılar.
// KURAL: panel hiçbir zaman gerçek Supabase'e bağlanmaz — *.supabase.co istekleri sahte buluta
// yönlendirilir, geri kalan dış adresler (yazı tipi vb.) kesilir.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const BURASI = path.dirname(fileURLToPath(import.meta.url));
export const DEPO = path.resolve(BURASI, "../..");
export const PANEL_DIZIN = path.join(DEPO, "public/toptanci");
export const ARAC = path.join(DEPO, "tools/babuco.cjs");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

/** Bir klasörü önbelleksiz yayınlayan küçük sunucu. */
export async function statikSunucu(dizin = PANEL_DIZIN, port = 0) {
  const s = http.createServer((req, res) => {
    const yol = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const dosya = path.join(dizin, yol === "/" ? "index.html" : yol);
    if (!dosya.startsWith(dizin) || !fs.existsSync(dosya) || fs.statSync(dosya).isDirectory()) { res.writeHead(404); res.end("yok"); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(dosya)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(dosya).pipe(res);
  });
  await new Promise((r) => s.listen(port, "127.0.0.1", r));
  return { url: "http://127.0.0.1:" + s.address().port, dur: () => new Promise((r) => { s.closeAllConnections && s.closeAllConnections(); s.close(() => r()); }) };
}

/**
 * Bir tarayıcı bağlamının Supabase isteklerini sahte buluta çevirir, diğer dış adresleri keser.
 * Aynı bağlamda birden çok sayfa açılabilir (iki sekme / iki cihaz denemesi için ayrı bağlam aç).
 */
export async function sahteyeYonlendir(context, bulutUrl) {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS", "access-control-expose-headers": "content-range" };
  await context.route("**/*", (route) => {
    const h = new URL(route.request().url()).hostname;
    return h === "127.0.0.1" || h === "localhost" ? route.continue() : route.abort("blockedbyclient");
  });
  await context.route(/^https:\/\/[a-z0-9-]+\.supabase\.co\//, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url());
    const bas = { ...req.headers() };
    ["host", "origin", "referer", "content-length", "accept-encoding", "connection"].forEach((k) => delete bas[k]);
    try {
      const r = await fetch(bulutUrl + u.pathname + u.search, { method: req.method(), headers: bas, body: ["GET", "HEAD"].includes(req.method()) ? undefined : (req.postDataBuffer() || undefined) });
      const govde = Buffer.from(await r.arrayBuffer());
      const yb = {}; r.headers.forEach((v, k) => { if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k)) yb[k] = v; });
      await route.fulfill({ status: r.status, headers: { ...yb, ...cors }, body: govde });
    } catch (e) {
      await route.abort("internetdisconnected").catch(() => {});   // sahte bulut "kapalı": bağlantı yok gibi
    }
  });
}

/**
 * Paneli telefon boyutunda açar. Dönen: { browser, context, page, kapat, diyaloglar }
 * @param {object} a
 * @param {string} a.bulutUrl                  sahteBulut().url  (ZORUNLU)
 * @param {string} [a.panelUrl]                statikSunucu().url; verilmezse kendi sunucusunu açar
 * @param {object} [a.browser]                 var olan tarayıcıyı kullan (ikinci cihaz için)
 * @param {(d) => void} [a.diyalog]            alert/confirm/prompt gelince çağrılır; verilmezse hepsi "Tamam"
 * @param {string} [a.yol]                     açılacak sayfa, ör. "#/satis"
 */
export async function panelAc(a) {
  if (!a || !a.bulutUrl) throw new Error("panelAc: bulutUrl zorunlu — panel gerçek buluta bağlanamaz.");
  const { chromium } = await import("playwright");
  const kendiSunucu = a.panelUrl ? null : await statikSunucu(a.panelDizin || PANEL_DIZIN);
  const panelUrl = a.panelUrl || kendiSunucu.url;
  const browser = a.browser || await chromium.launch({ headless: a.headless !== false });
  const context = await browser.newContext({ viewport: { width: a.genislik || 390, height: a.yukseklik || 844 }, locale: "tr-TR", timezoneId: "Europe/Istanbul", storageState: a.storageState });
  await sahteyeYonlendir(context, a.bulutUrl);
  const page = await context.newPage();
  const diyaloglar = [];
  page.on("dialog", async (d) => {
    diyaloglar.push({ tur: d.type(), mesaj: d.message() });
    if (a.diyalog) return a.diyalog(d);
    await d.accept(d.type() === "prompt" ? d.defaultValue() : undefined).catch(() => {});
  });
  const hatalar = [];
  page.on("pageerror", (e) => hatalar.push(String(e)));
  await page.goto(panelUrl + "/index.html" + (a.yol || ""));
  await page.waitForFunction(() => window.app && typeof window.app.getStore === "function");
  return {
    browser, context, page, panelUrl, diyaloglar, hatalar,
    kapat: async () => { await context.close(); if (!a.browser) await browser.close(); if (kendiSunucu) await kendiSunucu.dur(); },
  };
}

/** Aracı sahte buluta karşı çalıştırır (await ile). Dönen: { kod, cikti } — gerçek buluta gidemez.
 *  Eşzamansızdır: sahte bulut aynı süreçte çalıştığı için bekleyen (sync) çağrı onu kilitlerdi. */
export function aracCalistir(bulutUrl, argumanlar, secenek = {}) {
  if (!bulutUrl || !/^http:\/\/127\.0\.0\.1:/.test(bulutUrl)) throw new Error("aracCalistir: yalniz sahte bulut adresiyle calisir.");
  return new Promise((coz) => {
    const c = spawn(process.execPath, [secenek.arac || ARAC, ...argumanlar], {
      cwd: secenek.cwd || DEPO,
      env: { ...process.env, BABUCO_SB_URL: bulutUrl, BABUCO_SB_KEY: "sahte", ...(secenek.env || {}) },
    });
    let cikti = "";
    c.stdout.on("data", (d) => (cikti += d)); c.stderr.on("data", (d) => (cikti += d));
    c.on("close", (kod) => coz({ kod, cikti }));
  });
}

/** Küçük doğrulama yardımcısı: başarısızlıkları toplar, sonunda özet basıp çıkış kodu verir. */
export function denetci(ad) {
  let gecen = 0; const kalan = [];
  return {
    esit(gercek, beklenen, ne) { const a = JSON.stringify(gercek), b = JSON.stringify(beklenen); if (a === b) { gecen++; console.log("  ✓ " + ne); } else { kalan.push(ne); console.log("  ✗ " + ne + "\n      beklenen: " + b + "\n      gelen   : " + a); } },
    dogru(kosul, ne) { if (kosul) { gecen++; console.log("  ✓ " + ne); } else { kalan.push(ne); console.log("  ✗ " + ne); } },
    bitir() { console.log("\n" + ad + ": " + gecen + " geçti, " + kalan.length + " kaldı"); if (kalan.length) process.exitCode = 1; setTimeout(() => process.exit(), 300).unref(); return kalan.length === 0; },
  };
}

export const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
