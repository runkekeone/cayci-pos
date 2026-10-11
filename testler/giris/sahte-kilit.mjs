// Sahte bulutun giriş + veritabanı kilidi bilen hâli (ortak sahte-bulut.mjs'i `once` kancasıyla genişletir).
//
//  - /auth/v1/token (şifreyle giriş + yenileme), /auth/v1/logout, /auth/v1/user
//  - /rest/v1/rpc/babuco_yetkili  (kilit kuruluysa true/false, değilse 404 — gerçek sunucudaki gibi)
//  - tools/supabase/kilit.sql'in kurallarının taklidi (kilit açıkken):
//        özel   babuco:*            → yalnız izin listesindeki hesap okur/yazar; başkasına okuma BOŞ döner, yazma reddedilir
//        açık   babuco:katalog, duyurular, babuco:on-siparis:policy:*, babuco:cari:*  → herkes okur, yalnız yetkili yazar
//        serbest bayi_puan:*, cayci-pos:*  → bugünkü gibi herkes okur/yazar (silemez)
//        diğer  → kimseye açık değil
//  - kilit kurulmadan önceki iki olası düzen: "acik" (herkes her şeyi) ve "yalniz-anon" (eski politika yalnız
//    oturumsuz role izin veriyorsa: giriş yapmış kullanıcı hiçbir şey göremez)
//  - select=...->... (JSON yolundan seçme) — panelin katalog denetimi kullanır
//
// const b = await kilitliBulut({ satirlar, kilit: true });   b.kilitle() / b.kilidiAc() / b.oturumlariDusur() ...
import { AsyncLocalStorage } from "node:async_hooks";
import { sahteBulut, pgZaman } from "../ortak/sahte-bulut.mjs";

export const TOPTANCI = { id: "00000000-0000-4000-8000-000000000001", eposta: "toptanci@ornek.test", sifre: "Dogru-Sifre-1" };
export const YABANCI = { id: "00000000-0000-4000-8000-000000000002", eposta: "yabanci@ornek.test", sifre: "Baska-Sifre-2" };

/** kilit.sql'deki babuco_kv_sinifi ile AYNI kural. */
export function sinif(key) {
  if (key == null) return "bilinmeyen";
  key = String(key);
  if (key === "babuco:katalog" || key === "duyurular" || key.startsWith("babuco:on-siparis:policy:") || key.startsWith("babuco:cari:")) return "acik";
  if (key.startsWith("babuco:")) return "ozel";
  if (key.startsWith("bayi_puan:") || key.startsWith("cayci-pos:")) return "serbest";
  return "bilinmeyen";
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

export async function kilitliBulut(a = {}) {
  const hesaplar = a.hesaplar || [TOPTANCI, YABANCI];
  const durum = {
    kilit: a.kilit === true,
    oncekiDuzen: a.oncekiDuzen || "acik",            // "acik" | "yalniz-anon"
    yetkililer: new Set(a.yetkililer || [TOPTANCI.id]),
    jetonSuresi: a.jetonSuresi || 3600,
    girisHata: null,                                  // sayı verilirse /auth/v1/token o durum koduyla düşer
    jsonYoluYok: false,                               // true: select=...->... 400 döner (sunucu bu seçimi anlamıyormuş gibi)
  };
  const jetonlar = new Map();                         // access_token → { uid, bitis, yenileme }
  const yenilemeler = new Map();                      // refresh_token → uid
  const istekler = [];                                // { yontem, yol, sorgu, rol, uid }
  const sayac = { giris: 0, yenileme: 0, reddedilenGiris: 0, sira: 0 };
  const als = new AsyncLocalStorage();

  const yetkili = (kim) => kim.rol === "authenticated" && durum.yetkililer.has(kim.uid);
  const izin = {
    oku(kim, key) {
      if (!durum.kilit) return durum.oncekiDuzen === "acik" || kim.rol === "anon";
      const s = sinif(key);
      return s === "acik" || s === "serbest" || (s === "ozel" && yetkili(kim));
    },
    yaz(kim, key) {                                   // ekleme + güncelleme (using ve with check aynı kural)
      if (!durum.kilit) return durum.oncekiDuzen === "acik" || kim.rol === "anon";
      const s = sinif(key);
      return s === "serbest" || ((s === "ozel" || s === "acik") && yetkili(kim));
    },
    sil(kim, key) {
      if (!durum.kilit) return durum.oncekiDuzen === "acik" || kim.rol === "anon";
      const s = sinif(key);
      return (s === "ozel" || s === "acik") && yetkili(kim);
    },
  };

  function oturumVer(h) {
    const n = ++sayac.sira, simdi = Math.floor(Date.now() / 1000);
    const access = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub: h.id, email: h.eposta, role: "authenticated", aud: "authenticated", iat: simdi, exp: simdi + durum.jetonSuresi, session_id: "s" + n }) + ".imza" + n;
    const yenileme = "yenile-" + n + "-" + Math.random().toString(36).slice(2);
    jetonlar.set(access, { uid: h.id, bitis: Date.now() + durum.jetonSuresi * 1000, yenileme });
    yenilemeler.set(yenileme, h.id);
    return {
      access_token: access, token_type: "bearer", expires_in: durum.jetonSuresi, expires_at: simdi + durum.jetonSuresi, refresh_token: yenileme,
      user: { id: h.id, aud: "authenticated", role: "authenticated", email: h.eposta, email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
    };
  }
  /** İsteği kim yapıyor? { rol, uid } ya da { hata } (süresi dolmuş / bilinmeyen jeton → 401). */
  function kim(req) {
    const yetki = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!yetki || yetki === req.headers.apikey || yetki === "sahte") return { rol: "anon" };
    const j = jetonlar.get(yetki);
    if (!j) return { hata: { code: "PGRST301", message: "JWSError JWSInvalidSignature" } };
    if (j.bitis <= Date.now()) return { hata: { code: "PGRST303", message: "JWT expired" } };
    return { rol: "authenticated", uid: j.uid };
  }

  function once(req, res, ctx) {
    const { url, govde, yanit } = ctx;
    const yol = url.pathname;
    // ---------- giriş sunucusu ----------
    if (yol === "/auth/v1/token" && req.method === "POST") {
      const g = JSON.parse(govde.toString() || "{}"), tur = url.searchParams.get("grant_type");
      if (durum.girisHata) { yanit(durum.girisHata, { code: durum.girisHata, error_code: durum.girisHata === 429 ? "over_request_rate_limit" : "unexpected_failure", msg: "zorlanmis hata" }); return true; }
      if (tur === "password") {
        const h = hesaplar.find((x) => x.eposta.toLowerCase() === String(g.email || "").toLowerCase() && x.sifre === g.password);
        if (!h) { sayac.reddedilenGiris++; yanit(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }); return true; }
        sayac.giris++; yanit(200, oturumVer(h)); return true;
      }
      if (tur === "refresh_token") {
        const uid = yenilemeler.get(g.refresh_token), h = hesaplar.find((x) => x.id === uid);
        if (!h) { yanit(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" }); return true; }
        yenilemeler.delete(g.refresh_token);
        for (const [t, j] of jetonlar) if (j.yenileme === g.refresh_token) jetonlar.delete(t);
        sayac.yenileme++; yanit(200, oturumVer(h)); return true;
      }
      yanit(400, { code: 400, error_code: "unsupported_grant_type", msg: "unsupported_grant_type" }); return true;
    }
    if (yol === "/auth/v1/logout" && req.method === "POST") {
      const t = String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""), j = jetonlar.get(t);
      if (j) { yenilemeler.delete(j.yenileme); jetonlar.delete(t); }
      yanit(204, null); return true;
    }
    if (yol === "/auth/v1/user" && req.method === "GET") {
      const k = kim(req), h = k.uid && hesaplar.find((x) => x.id === k.uid);
      if (!h) { yanit(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" }); return true; }
      yanit(200, { id: h.id, aud: "authenticated", role: "authenticated", email: h.eposta }); return true;
    }
    if (yol.startsWith("/auth/v1/")) { yanit(404, { code: 404, error_code: "not_found", msg: "sahte giris sunucusu: bu yol yok: " + yol }); return true; }
    if (!yol.startsWith("/rest/v1/")) return false;

    // ---------- veri istekleri: kim soruyor? ----------
    const k = kim(req);
    istekler.push({ yontem: req.method, yol, sorgu: url.search, rol: k.rol || "gecersiz", uid: k.uid || null });
    if (k.hata) { yanit(401, k.hata); return true; }

    if (yol === "/rest/v1/rpc/babuco_yetkili") {
      if (!durum.kilit) { yanit(404, { code: "PGRST202", details: null, hint: null, message: "Could not find the function public.babuco_yetkili without parameters in the schema cache" }); return true; }
      yanit(200, JSON.stringify(yetkili(k))); return true;
    }
    if (yol !== "/rest/v1/kv") return false;            // siparisler vb.: kilit bu turda dokunmuyor

    const red = () => { yanit(k.rol === "anon" ? 401 : 403, { code: "42501", details: null, hint: null, message: 'new row violates row-level security policy for table "kv"' }); return true; };
    const gercek = ctx.tablolar.kv[GERCEK];
    if (req.method === "POST") {                        // upsert: ekleme + (varsa) güncelleme + görme izni gerekir
      const gelen = JSON.parse(govde.toString() || "null"), dizi = Array.isArray(gelen) ? gelen : [gelen];
      for (const g of dizi) {
        if (!g || g.key == null) continue;
        if (!izin.yaz(k, g.key)) return red();
        if (gercek.has(g.key) && !izin.oku(k, g.key)) return red();
      }
    }
    if (req.method === "PATCH") {
      const g = JSON.parse(govde.toString() || "{}");
      if (g.key != null && !izin.yaz(k, g.key)) return red();   // satırı yazamayacağı bir anahtara taşıyamaz
    }
    // JSON yolundan seçme (select=ad:value->alan, value->>alan): ortak taklit bilmiyor, burada yanıtla
    const select = url.searchParams.get("select") || "";
    if (req.method === "GET" && select.includes("->") && durum.jsonYoluYok) { yanit(400, { code: "PGRST100", details: null, hint: null, message: "sahte: JSON yolundan secme desteklenmiyor" }); return true; }
    if (req.method === "GET" && select.includes("->")) {
      const anahtarSuz = url.searchParams.get("key") || "";
      const istenen = anahtarSuz.startsWith("eq.") ? [anahtarSuz.slice(3)] : anahtarSuz.startsWith("in.") ? anahtarSuz.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, "")) : null;
      const benzer = anahtarSuz.startsWith("like.") ? new RegExp("^" + anahtarSuz.slice(5).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*") + "$") : null;
      const satirlar = [...gercek.values()].filter((s) => (!istenen || istenen.includes(s.key)) && (!benzer || benzer.test(s.key)) && izin.oku(k, s.key));
      yanit(200, satirlar.map((s) => {
        const o = {};
        for (const parca of select.split(",").map((x) => x.trim()).filter(Boolean)) {
          const m = parca.match(/^(?:([A-Za-z_]+):)?([a-z_]+)(?:(->>?)([A-Za-z_]+))?$/);
          if (!m) continue;
          let v = s[m[2]];
          if (m[3]) { v = v == null ? null : v[m[4]]; if (v === undefined) v = null; if (m[3] === "->>" && v != null && typeof v !== "string") v = JSON.stringify(v); }
          o[m[1] || m[4] || m[2]] = v === undefined ? null : v;
        }
        return o;
      }));
      return true;
    }
    // Geri kalanını ortak taklit yanıtlar; tabloyu bu isteği yapanın görebildiği kadarıyla görür.
    als.enterWith({ suz: (key) => (req.method === "PATCH" ? izin.oku(k, key) && izin.yaz(k, key) : req.method === "DELETE" ? izin.oku(k, key) && izin.sil(k, key) : req.method === "POST" ? true : izin.oku(k, key)) });
    return false;
  }

  const b = await sahteBulut({ ...a, once });
  const gercek = b.tablolar.kv;
  b.tablolar.kv = new Proxy(gercek, {
    get(t, ad) {
      if (ad === GERCEK) return t;
      if (ad === "values") return () => { const c = als.getStore(); const hepsi = [...t.values()]; return c ? hepsi.filter((s) => c.suz(s.key)) : hepsi; };
      const v = t[ad];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });

  return {
    ...b, kv: gercek, durum, istekler, sayac, hesaplar,
    deger: (key) => (gercek.get(key) || {}).value,
    satir: (key) => gercek.get(key),
    yaz: (key, value, zaman) => gercek.set(key, { key, value, updated_at: pgZaman(zaman || new Date()) }),
    /** Veritabanı kilidini kur / kaldır (kilit.sql çalıştırıldı / geri alındı). */
    kilitle: () => { durum.kilit = true; }, kilidiAc: () => { durum.kilit = false; },
    /** Bütün oturumları iptal et (yenileme de çalışmaz) — "hesap kapatıldı / oturum sonlandırıldı". */
    oturumlariDusur: () => { jetonlar.clear(); yenilemeler.clear(); },
    /** Erişim jetonlarının süresini doldur; yenileme anahtarı geçerli kalır. */
    jetonlariEskit: () => { for (const j of jetonlar.values()) j.bitis = 0; },
    /** Verilen kimlikle doğrudan istek (paneli/aracı atlayıp "dışarıdan biri" gibi). jeton verilmezse oturumsuz. */
    async istek(yol, secenek = {}) {
      const r = await fetch(b.url + yol, { method: secenek.method || "GET", headers: { apikey: "sahte", Authorization: "Bearer " + (secenek.jeton || "sahte"), "Content-Type": "application/json", ...(secenek.headers || {}) }, body: secenek.body === undefined ? undefined : JSON.stringify(secenek.body) });
      const metin = await r.text();
      let json = null; try { json = metin ? JSON.parse(metin) : null; } catch (e) { json = metin; }
      return { durum: r.status, json };
    },
    /** Şifreyle giriş yapıp jetonu döndürür (deneme kolaylığı). */
    async girisYap(h = TOPTANCI) {
      const r = await fetch(b.url + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: "sahte", "Content-Type": "application/json" }, body: JSON.stringify({ email: h.eposta, password: h.sifre }) });
      return r.ok ? await r.json() : null;
    },
  };
}
const GERCEK = Symbol("gercek-tablo");
