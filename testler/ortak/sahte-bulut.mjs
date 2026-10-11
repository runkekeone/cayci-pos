// Sahte bulut — Supabase'in (PostgREST) panel ve araç tarafından kullanılan kısmını bellekte taklit eder.
// Amaç: denemeler CANLI veriye hiç dokunmasın. Tablolar: kv (key, value, updated_at) ve siparisler (id, ...).
//
// Modül olarak:   const b = await sahteBulut({ satirlar: [{ key, value, updated_at }] });  → b.url, b.kv, b.dur()
// Komut olarak:   node testler/ortak/sahte-bulut.mjs <port> [satirlar.json]
//                 (araç için: BABUCO_SB_URL=http://127.0.0.1:<port> BABUCO_SB_KEY=sahte)
//
// Gerçek sunucuyla aynı davranan iki ayrıntı (bunlara güvenen kod burada da doğru sınanır):
//  - updated_at "+00:00" biçiminde ve sondaki sıfırlar atılarak döner ("...09.96+00:00"); gönderdiğin
//    "...09.960Z" metniyle harf harf AYNI DEĞİLDİR. Süzgeçte (updated_at=eq.…) karşılaştırma an olarak yapılır.
//  - Koşullu PATCH hiçbir satıra uymazsa hata vermez; return=representation ile boş dizi döner.
import http from "node:http";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "content-range",
  "access-control-max-age": "600",
};
const BIRINCIL = { kv: "key", siparisler: "id" };
const ZAMAN_SUTUN = new Set(["updated_at", "created_at"]);

/** Postgres timestamptz çıktısı: 2026-10-08T16:00:09.96+00:00 */
export function pgZaman(v) {
  const d = new Date(v);
  if (isNaN(d)) throw Object.assign(new Error('invalid input syntax for type timestamp with time zone: "' + v + '"'), { kod: "22007" });
  const iso = d.toISOString();                      // 2026-10-08T16:00:09.960Z
  const kesir = iso.slice(20, 23).replace(/0+$/, "");
  return iso.slice(0, 19) + (kesir ? "." + kesir : "") + "+00:00";
}

function suzgecAyir(params) {
  const ayri = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
  const liste = [];
  for (const [sutun, ham] of params) {
    if (ayri.has(sutun)) continue;
    const i = ham.indexOf(".");
    if (i < 0) throw Object.assign(new Error("gecersiz suzgec: " + sutun + "=" + ham), { kod: "PGRST100" });
    liste.push({ sutun, op: ham.slice(0, i), deger: ham.slice(i + 1) });
  }
  return liste;
}
function uyuyor(satir, f) {
  const a = satir[f.sutun];
  const zaman = ZAMAN_SUTUN.has(f.sutun);
  const an = (x) => { const t = Date.parse(x); if (isNaN(t)) throw Object.assign(new Error('invalid input syntax for type timestamp with time zone: "' + x + '"'), { kod: "22007" }); return t; };
  const kiyas = (x, y) => (zaman ? an(x) - an(y) : (String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0));
  switch (f.op) {
    case "eq": return a != null && kiyas(a, f.deger) === 0;
    case "neq": return a == null || kiyas(a, f.deger) !== 0;
    case "gt": return a != null && kiyas(a, f.deger) > 0;
    case "gte": return a != null && kiyas(a, f.deger) >= 0;
    case "lt": return a != null && kiyas(a, f.deger) < 0;
    case "lte": return a != null && kiyas(a, f.deger) <= 0;
    case "like": case "ilike": {
      const re = new RegExp("^" + f.deger.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*") + "$", f.op === "ilike" ? "i" : "");
      return a != null && re.test(String(a));
    }
    case "in": {
      const ic = f.deger.replace(/^\(/, "").replace(/\)$/, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
      return a != null && ic.includes(String(a));
    }
    case "is": return f.deger === "null" ? a == null : String(a) === f.deger;
    default: throw Object.assign(new Error("desteklenmeyen islec: " + f.op), { kod: "PGRST100" });
  }
}
function sutunSec(satir, select) {
  if (!select || select === "*") return { ...satir };
  const o = {};
  select.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => { o[s] = satir[s] === undefined ? null : satir[s]; });
  return o;
}

/**
 * @param {object} [a]
 * @param {Array<{key:string,value:any,updated_at?:string}>} [a.satirlar]  kv başlangıç satırları
 * @param {Array<object>} [a.siparisler]                                   siparisler başlangıç satırları
 * @param {number} [a.port]            0 = boş bir port seç
 * @param {number} [a.gecikmeMs]       her isteğe eklenen bekleme (yavaş bağlantı taklidi)
 * @param {(req, res, ctx) => (boolean|Promise<boolean>)} [a.once]  her istekten önce çağrılır; true dönerse isteği o yanıtlamış sayılır
 *        ctx: { url: URL, govde: Buffer, yanit(status, json, basliklar), tablolar }
 */
export async function sahteBulut(a = {}) {
  const tablolar = {
    kv: new Map((a.satirlar || []).map((r) => [r.key, { key: r.key, value: r.value, updated_at: pgZaman(r.updated_at || new Date()) }])),
    siparisler: new Map((a.siparisler || []).map((r) => [r.id, { ...r }])),
  };
  const gunluk = [];                 // { yontem, yol, sorgu, durum }
  const durum = { kapali: false, gecikmeMs: a.gecikmeMs || 0, hata: null };

  const sunucu = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const parcalar = [];
    for await (const p of req) parcalar.push(p);
    const govde = Buffer.concat(parcalar);
    const yanit = (st, json, bas) => {
      const metin = json === undefined || json === null ? "" : (typeof json === "string" ? json : JSON.stringify(json));
      res.writeHead(st, { "content-type": "application/json; charset=utf-8", ...CORS, ...(bas || {}) });
      res.end(metin);
      gunluk.push({ yontem: req.method, yol: url.pathname, sorgu: url.search, durum: st });
    };
    try {
      // --- denetim uçları (yalnız testler kullanır) ---
      if (url.pathname.startsWith("/__sahte/")) {
        const ne = url.pathname.slice(9);
        if (ne === "dok") return yanit(200, { kv: [...tablolar.kv.values()], siparisler: [...tablolar.siparisler.values()] });
        if (ne === "gunluk") return yanit(200, gunluk);
        if (ne === "kapat") { durum.kapali = true; return yanit(200, { kapali: true }); }
        if (ne === "ac") { durum.kapali = false; return yanit(200, { kapali: false }); }
        if (ne === "yukle") { const j = JSON.parse(govde.toString() || "{}"); if (j.kv) { tablolar.kv.clear(); j.kv.forEach((r) => tablolar.kv.set(r.key, { key: r.key, value: r.value, updated_at: pgZaman(r.updated_at || new Date()) })); } return yanit(200, { tamam: true }); }
        return yanit(404, { message: "bilinmeyen denetim ucu" });
      }
      if (durum.kapali) { req.socket.destroy(); gunluk.push({ yontem: req.method, yol: url.pathname, sorgu: url.search, durum: 0 }); return; }
      if (durum.gecikmeMs) await new Promise((r) => setTimeout(r, durum.gecikmeMs));
      if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
      if (a.once && (await a.once(req, res, { url, govde, yanit, tablolar }))) return;
      if (durum.hata) return yanit(durum.hata, { message: "sahte bulut: zorlanmis hata" });

      const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
      if (!m) return yanit(404, { message: "sahte bulut: bu yol taklit edilmiyor: " + url.pathname });
      const ad = m[1], tablo = tablolar[ad];
      if (!tablo) return yanit(404, { code: "PGRST205", message: "Could not find the table 'public." + ad + "' in the schema cache" });
      const pk = BIRINCIL[ad];
      const tercih = String(req.headers["prefer"] || "");
      const temsil = /return=representation/.test(tercih);
      const select = url.searchParams.get("select");
      const suzgec = suzgecAyir(url.searchParams);
      const secili = () => [...tablo.values()].filter((s) => suzgec.every((f) => uyuyor(s, f)));
      const normal = (s) => { const o = { ...s }; for (const k of ZAMAN_SUTUN) if (o[k] != null) o[k] = pgZaman(o[k]); return o; };

      if (req.method === "GET" || req.method === "HEAD") {
        let satirlar = secili();
        const order = url.searchParams.get("order");
        if (order) { const [sutun, yon] = order.split(".")[0] ? [order.split(".")[0], order.split(".")[1]] : [order, "asc"]; satirlar.sort((x, y) => (String(x[sutun]) < String(y[sutun]) ? -1 : 1) * (yon === "desc" ? -1 : 1)); }
        const off = Number(url.searchParams.get("offset")) || 0, lim = url.searchParams.get("limit");
        satirlar = satirlar.slice(off, lim != null ? off + Number(lim) : undefined);
        const cikti = satirlar.map((s) => sutunSec(s, select));
        if (String(req.headers["accept"] || "").includes("vnd.pgrst.object")) {
          if (cikti.length !== 1) return yanit(406, { code: "PGRST116", details: "The result contains " + cikti.length + " rows", hint: null, message: "JSON object requested, multiple (or no) rows returned" });
          return yanit(200, req.method === "HEAD" ? null : cikti[0]);
        }
        return yanit(200, req.method === "HEAD" ? null : cikti);
      }
      if (req.method === "POST") {
        const gelen = JSON.parse(govde.toString() || "null");
        const dizi = Array.isArray(gelen) ? gelen : [gelen];
        const birlestir = /resolution=merge-duplicates/.test(tercih), yoksay = /resolution=ignore-duplicates/.test(tercih);
        const yazilan = [];
        for (const g of dizi) {
          if (!g || g[pk] == null) return yanit(400, { code: "23502", message: 'null value in column "' + pk + '" violates not-null constraint' });
          const var_ = tablo.get(g[pk]);
          if (var_ && yoksay) continue;
          if (var_ && !birlestir) return yanit(409, { code: "23505", message: 'duplicate key value violates unique constraint "' + ad + '_pkey"' });
          const yeni = normal({ ...(var_ || {}), ...g });
          if (ad === "kv" && yeni.updated_at == null) yeni.updated_at = pgZaman(new Date());
          tablo.set(g[pk], yeni); yazilan.push(yeni);
        }
        return yanit(201, temsil ? yazilan.map((s) => sutunSec(s, select)) : null);
      }
      if (req.method === "PATCH") {
        const g = JSON.parse(govde.toString() || "{}");
        const hedef = secili();
        hedef.forEach((s) => { const yeni = normal({ ...s, ...g }); tablo.delete(s[pk]); tablo.set(yeni[pk], yeni); Object.assign(s, yeni); });
        return temsil ? yanit(200, hedef.map((s) => sutunSec(s, select))) : yanit(204, null);
      }
      if (req.method === "DELETE") {
        const hedef = secili();
        hedef.forEach((s) => tablo.delete(s[pk]));
        return temsil ? yanit(200, hedef.map((s) => sutunSec(s, select))) : yanit(204, null);
      }
      return yanit(405, { message: "yontem desteklenmiyor" });
    } catch (e) {
      return yanit(400, { code: e.kod || "XX000", message: e.message });
    }
  });
  await new Promise((r) => sunucu.listen(a.port || 0, "127.0.0.1", r));
  const port = sunucu.address().port;
  return {
    url: "http://127.0.0.1:" + port, port, tablolar, gunluk, durum,
    kv: tablolar.kv,
    /** kv satırının value'su (yoksa undefined) */
    deger: (key) => (tablolar.kv.get(key) || {}).value,
    satir: (key) => tablolar.kv.get(key),
    /** bağlantı kopması taklidi: istekler yanıtsız kesilir */
    kapat: () => { durum.kapali = true; }, ac: () => { durum.kapali = false; },
    dur: () => new Promise((r) => { sunucu.closeAllConnections && sunucu.closeAllConnections(); sunucu.close(() => r()); }),
  };
}

// Komut satırından: node sahte-bulut.mjs <port> [satirlar.json]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2]) || 54329;
  const dosya = process.argv[3];
  let satirlar = [];
  if (dosya) { const j = JSON.parse(fs.readFileSync(dosya, "utf8")); satirlar = Array.isArray(j) ? j : [{ key: "babuco:store", value: j, updated_at: new Date().toISOString() }]; }
  const b = await sahteBulut({ port, satirlar });
  console.log("Sahte bulut calisiyor: " + b.url + " · kv satiri: " + b.kv.size);
  console.log("Arac icin:  BABUCO_SB_URL=" + b.url + " BABUCO_SB_KEY=sahte node tools/babuco.cjs durum");
}
