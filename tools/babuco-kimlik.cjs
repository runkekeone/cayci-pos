#!/usr/bin/env node
/**
 * Babuco aracının bulut kimliği: bağlantı ayarı + oturum + istek + herkese açık katalog yayını.
 * tools/babuco.cjs (panelAyar, sb) ve tools/cari/dump.cjs bunu kullanır.
 *
 * Kimlik sırası (her çalıştırmada):
 *   1) Saklı oturum dosyası (tools/.babuco-oturum.json — git'e girmez). Süresi dolduysa kendisi yeniler.
 *   2) BABUCO_EPOSTA + BABUCO_SIFRE ortam değişkenleri → o hesapla giriş yapar. Dosya yazılamasa da çalışır
 *      (telefon / bulut oturumları için bu yol tek başına yeterlidir).
 *   3) Hiçbiri yoksa oturumsuz (herkese açık anahtar) — veritabanı kilidi kurulmadan önceki davranış.
 *
 * Veritabanı kilidi kurulmadan ÖNCE de çalışsın diye: oturumla boş/yetkisiz dönen kv isteği bir kez de
 * herkese açık anahtarla denenir. Kilit kuruluyken oturumsuz okuma "kayıt yok" gibi görünmesin diye
 * açık bir hata verilir.
 *
 * Şifre hiçbir çıktıya, loga ya da dosyaya YAZILMAZ; dosyada yalnız oturum jetonları durur.
 *
 * Komut olarak:
 *   node tools/babuco-kimlik.cjs giris    e-posta + şifreyi sorar (ya da ortam değişkeninden alır), oturumu kaydeder
 *   node tools/babuco-kimlik.cjs durum    hangi kimlikle bağlanıldığını ve iznini söyler
 *   node tools/babuco-kimlik.cjs cikis    saklı oturumu siler
 */
const fs = require("fs");
const path = require("path");

const OZEL_ANAHTAR = "babuco:store";
const KATALOG_ANAHTAR = "babuco:katalog";

/* Bağlantı bilgisi panelin kendi kaynağından okunur — anahtarın ikinci bir kopyası TUTULMAZ.
   Sıra: ortam değişkeni → panelin app.js'i (tek doğru kaynak). */
let _ayar = null;
function panelAyar() {
  if (_ayar) return _ayar;
  if (process.env.BABUCO_SB_URL && process.env.BABUCO_SB_KEY) {
    return (_ayar = { url: process.env.BABUCO_SB_URL, key: process.env.BABUCO_SB_KEY });
  }
  const adaylar = [
    process.env.BABUCO_PANEL_JS,
    path.join(process.cwd(), "public/toptanci/app.js"),
    path.join(__dirname, "../public/toptanci/app.js"),          // depo içi kopya: tools/
    path.join(__dirname, "../cayci-pos/public/toptanci/app.js"), // masaüstü kopya: ajanss/babuco-cli/
    "C:/Users/PC/Desktop/ajanss/cayci-pos/public/toptanci/app.js",
  ].filter(Boolean);
  for (const p of adaylar) {
    try {
      const src = fs.readFileSync(p, "utf8");
      const u = src.match(/SB_URL\s*=\s*"([^"]+)"/), k = src.match(/SB_KEY\s*=\s*"([^"]+)"/);
      if (u && k) return (_ayar = { url: u[1], key: k[1] });
    } catch (e) { /* sıradaki adaya bak */ }
  }
  throw new Error("Panel ayarı bulunamadi. Ya depo kokunden calistir, ya da BABUCO_SB_URL + BABUCO_SB_KEY ortam degiskenlerini ver.");
}

/* ---------- ağ ---------- */
/* Windows'ta Node'un fetch'i, art arda iki istekten sonra process.exit() çağrılınca çöküyor
   ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)", çıkış kodu 3221226505) — aracın hata yolu
   tam da bunu yapıyor. O yüzden Windows'ta istekler node:https ile gider; diğer sistemlerde (telefon / bulut
   oturumu) bugünkü gibi fetch. BABUCO_TASIMA=fetch|https ile elle seçilebilir. */
const TASIMA = process.env.BABUCO_TASIMA || (process.platform === "win32" ? "https" : "fetch");
/** Dönen: { status, ok, txt }. Bağlantı kurulamazsa fırlatır. */
function ag(url, opts) {
  opts = opts || {};
  if (TASIMA === "fetch") return fetch(url, opts).then(async (r) => ({ status: r.status, ok: r.ok, txt: await r.text() }));
  return new Promise((coz, red) => {
    const u = new URL(url), zlib = require("zlib");
    const govde = opts.body == null ? null : Buffer.from(String(opts.body), "utf8");
    const basliklar = Object.assign({ "Accept-Encoding": "gzip" }, opts.headers || {}, govde ? { "Content-Length": govde.length } : {});
    const q = require(u.protocol === "http:" ? "http" : "https").request(u, { method: opts.method || "GET", headers: basliklar, agent: false }, (res) => {
      const p = [];
      res.on("data", (c) => p.push(c));
      res.on("error", red);
      res.on("end", () => {
        try {
          let b = Buffer.concat(p);
          if (res.headers["content-encoding"] === "gzip") b = zlib.gunzipSync(b);
          coz({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, txt: b.toString("utf8") });
        } catch (e) { red(e); }
      });
    });
    q.setTimeout(120000, () => q.destroy(new Error("sunucu yanit vermedi (zaman asimi)")));
    q.on("error", red);
    if (govde) q.write(govde);
    q.end();
  });
}

/* ---------- saklı oturum dosyası ---------- */
const oturumDosyasi = () => process.env.BABUCO_OTURUM_DOSYA || path.join(__dirname, ".babuco-oturum.json");
function dosyaOku() {
  try { const j = JSON.parse(fs.readFileSync(oturumDosyasi(), "utf8")); return j && typeof j === "object" ? j : {}; }
  catch (e) { return {}; }
}
/** Dosya adrese (Supabase projesine) göre ayrı tutulur: deneme sunucusunun oturumu gerçeğinin üstüne yazmaz. */
function dosyaYaz(url, kayit) {
  try {
    const hepsi = dosyaOku();
    if (kayit) hepsi[url] = kayit; else delete hepsi[url];
    const hedef = oturumDosyasi(), gecici = hedef + "." + process.pid + ".tmp";
    fs.writeFileSync(gecici, JSON.stringify(hepsi), { mode: 0o600 });
    fs.renameSync(gecici, hedef);
    return true;
  } catch (e) { return false; }           // salt-okunur ortam: oturum bu çalıştırmada bellekte kalır
}

/* ---------- giriş / yenileme ---------- */
/** Dönen: oturum kaydı | null (kimlik reddedildi). Bağlantı hatasında fırlatır. */
async function jetonAl(tur, govde) {
  const A = panelAyar();
  let r;
  try {
    r = await ag(A.url + "/auth/v1/token?grant_type=" + tur, { method: "POST", headers: { apikey: A.key, "Content-Type": "application/json" }, body: JSON.stringify(govde) });
  } catch (e) { throw new Error("Giris sunucusuna baglanilamadi (" + ((e.cause && e.cause.code) || e.code || e.message) + ")."); }
  if (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 422) return null;
  if (!r.ok) throw new Error("Giris sunucusu HTTP " + r.status + (r.status === 429 ? " (cok fazla deneme; birkac dakika bekle)" : ""));
  let j = null;
  try { j = JSON.parse(r.txt); } catch (e) { j = null; }
  if (!j || !j.access_token) throw new Error("Giris sunucusu beklenmeyen yanit verdi.");
  return {
    eposta: (j.user && j.user.email) || govde.email || "",
    access_token: j.access_token,
    refresh_token: j.refresh_token || "",
    expires_at: Number(j.expires_at) || Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600),
  };
}

let _oturum;                 // undefined = henüz bakılmadı · null = oturumsuz · nesne = oturum
async function oturum() {
  if (_oturum !== undefined) return _oturum;
  const A = panelAyar();
  const eposta = (process.env.BABUCO_EPOSTA || "").trim(), sifre = process.env.BABUCO_SIFRE || "";
  let k = dosyaOku()[A.url] || null;
  if (k && eposta && k.eposta && k.eposta.toLowerCase() !== eposta.toLowerCase()) k = null;   // başka hesabın oturumu
  if (k && k.access_token && k.expires_at - 60 > Date.now() / 1000) return (_oturum = k);
  if (k && k.refresh_token) {
    const y = await jetonAl("refresh_token", { refresh_token: k.refresh_token });
    if (y) { if (!y.eposta) y.eposta = k.eposta; dosyaYaz(A.url, y); return (_oturum = y); }
    dosyaYaz(A.url, null);
  }
  if (eposta && sifre) {
    const y = await jetonAl("password", { email: eposta, password: sifre });
    if (!y) throw new Error("Giris basarisiz: e-posta ya da sifre yanlis (BABUCO_EPOSTA / BABUCO_SIFRE).");
    dosyaYaz(A.url, y);
    return (_oturum = y);
  }
  if (k) console.error("UYARI: sakli oturumun suresi dolmus. Yeniden giris: node tools/babuco-kimlik.cjs giris");
  return (_oturum = null);
}
async function oturumYenile() {
  const A = panelAyar(), k = _oturum;
  let y = k && k.refresh_token ? await jetonAl("refresh_token", { refresh_token: k.refresh_token }) : null;
  if (!y && process.env.BABUCO_EPOSTA && process.env.BABUCO_SIFRE) y = await jetonAl("password", { email: process.env.BABUCO_EPOSTA.trim(), password: process.env.BABUCO_SIFRE });
  if (y) { if (!y.eposta && k) y.eposta = k.eposta; dosyaYaz(A.url, y); _oturum = y; }
  return y;
}

/* ---------- istek ---------- */
async function gonder(pathQ, opts, jeton) {
  const A = panelAyar();
  const base = { apikey: A.key, Authorization: "Bearer " + jeton, "Content-Type": "application/json" };
  const r = await ag(A.url + "/rest/v1/" + pathQ, Object.assign({}, opts, { headers: Object.assign(base, opts.headers || {}) }));
  return { r: r, txt: r.txt };
}
/** Cevap "bu kimlikle veri yok / izin yok" mu diyor? (öbür kimlikle bir kez daha denemeye değer mi) */
function anormal(c, yontem, opts) {
  if (c.r.status === 401 || c.r.status === 403 || c.r.status === 406) return true;
  if (c.r.status !== 200) return false;
  const tercih = String((opts.headers && (opts.headers.Prefer || opts.headers.prefer)) || "");
  if (yontem === "GET" || ((yontem === "PATCH" || yontem === "DELETE") && /return=representation/.test(tercih))) return c.txt.trim() === "[]";
  return false;
}
/** "yetkili" | "yetkisiz" | "kilitsiz" (kilit.sql henüz çalıştırılmamış) | "bilinmiyor" */
async function yetkiSor(jeton) {
  try {
    const c = await gonder("rpc/babuco_yetkili", { method: "POST", body: "{}" }, jeton || panelAyar().key);
    if (c.r.ok) return c.txt.trim() === "true" ? "yetkili" : "yetkisiz";
    return c.r.status === 404 ? "kilitsiz" : "bilinmiyor";
  } catch (e) { return "bilinmiyor"; }
}
async function hamIstek(pathQ, opts) {
  const A = panelAyar(), yontem = String(opts.method || "GET").toUpperCase();
  const kvMi = /^kv(\?|$)/.test(pathQ);
  const o = kvMi ? await oturum() : null;                      // siparisler vb.: bugünkü gibi herkese açık anahtarla
  if (!o) return { c: await gonder(pathQ, opts, A.key), yontem: yontem, o: null };
  let c = await gonder(pathQ, opts, o.access_token);
  if (c.r.status === 401) { const y = await oturumYenile(); if (y) c = await gonder(pathQ, opts, y.access_token); }
  if (anormal(c, yontem, opts)) {                               // kilit kurulmadan önceki düzen: herkese açık anahtar
    const c2 = await gonder(pathQ, opts, A.key);
    if (!anormal(c2, yontem, opts)) c = c2;
  }
  return { c: c, yontem: yontem, o: _oturum };
}
/** İstek, kilit kurulunca yalnız yetkili hesabın görebildiği bir kv anahtarını mı soruyor? */
function ozelAnahtarSorgusu(pathQ) {
  let m = null;
  try { m = decodeURIComponent(pathQ).match(/^kv\?(?:.*&)?key=(?:eq|like|ilike)\.(babuco:[^&]*)/); } catch (e) { return false; }
  return !!m && m[1] !== KATALOG_ANAHTAR && m[1].indexOf("babuco:on-siparis:policy:") !== 0;
}
/** Supabase REST isteği. Hata durumunda fırlatır; gövdeyi JSON olarak döndürür. */
async function sb(pathQ, opts) {
  opts = opts || {};
  const s = await hamIstek(pathQ, opts), c = s.c;
  const ozelBos = c.r.ok && s.yontem === "GET" && ozelAnahtarSorgusu(pathQ) && c.txt.trim() === "[]";
  if (c.r.status === 401 || c.r.status === 403 || ozelBos) {
    // "Kayıt yok" ile "iznin yok"u karıştırma: kilit kuruluysa nedenini açıkça söyle.
    const y = await yetkiSor(s.o && s.o.access_token);
    if (y === "yetkisiz") {
      throw new Error(s.o
        ? "Bu hesabin (" + s.o.eposta + ") toptanci verisine izni yok. Izin listesine eklenmeli (tools/supabase/KURULUM.md)."
        : "Veritabani kilitli: giris yapmadan veri okunamaz/yazilamaz. BABUCO_EPOSTA + BABUCO_SIFRE ortam degiskenlerini ver ya da bir kez `node tools/babuco-kimlik.cjs giris` calistir.");
    }
  }
  if (!c.r.ok) throw new Error("Supabase HTTP " + c.r.status + ": " + c.txt.slice(0, 300));
  const veri = c.txt ? JSON.parse(c.txt) : null;
  await yazimSonrasi(pathQ, s.yontem, opts, veri);
  return veri;
}

/* ---------- herkese açık katalog ---------- */
/** Kataloğa yalnız bu alanlar girer. Alış fiyatı, stok, müşteri, özel fiyat GİRMEZ. (panel app.js ile aynı) */
function katalogUrunleri(urunler) {
  return (Array.isArray(urunler) ? urunler : []).filter((p) => p && p.id && p.ad && p.gorunur !== false)
    .map((p) => ({ id: String(p.id), ad: String(p.ad), grup: p.grup || "", satis: Number(p.satis) || 0, birim: p.birim || "", barkod: p.barkod || "" }));
}
function katalogOzet(liste) {
  const s = JSON.stringify(liste);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + "-" + liste.length;
}
async function katalogYayinla(urunler) {
  const liste = katalogUrunleri(urunler);
  if (!liste.length) return false;                              // boş katalog yayınlanmaz (sipariş ekranı boşalmasın)
  const ts = new Date().toISOString();
  const s = await hamIstek("kv?on_conflict=key", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: KATALOG_ANAHTAR, value: { v: 1, ozet: katalogOzet(liste), guncellendi: ts, urunler: liste }, updated_at: ts }),
  });
  if (!s.c.r.ok) throw new Error("HTTP " + s.c.r.status);
  return true;
}
/** Store buluta yazıldıysa kataloğu da güncelle (çay ocağı sipariş ekranı eski fiyat görmesin). */
async function yazimSonrasi(pathQ, yontem, opts, veri) {
  if (yontem !== "PATCH" && yontem !== "POST") return;
  if (!/^kv(\?|$)/.test(pathQ)) return;
  let govde = null, urunler = null;
  try { govde = JSON.parse(opts.body); } catch (e) { return; }
  if (yontem === "PATCH") {
    // Koşullu yazma hiçbir satıra uymadıysa (çakışma) boş dizi döner: store yazılmamıştır, katalog da yazılmaz.
    if (pathQ.indexOf("key=eq." + encodeURIComponent(OZEL_ANAHTAR)) < 0 || !Array.isArray(veri) || !veri.length) return;
    urunler = govde && govde.value && govde.value.products;
  } else {
    const satir = [].concat(govde).find((x) => x && x.key === OZEL_ANAHTAR);
    urunler = satir && satir.value && satir.value.products;
  }
  if (!Array.isArray(urunler)) return;
  try { await katalogYayinla(urunler); }
  catch (e) { console.error("UYARI: siparis katalogu guncellenemedi (" + e.message + "). Panel acilinca kendisi duzeltir."); }
}

module.exports = { panelAyar, sb, oturum, yetkiSor, katalogUrunleri, katalogOzet, katalogYayinla, oturumDosyasi };

/* ---------- komut satırı ---------- */
function sor(soru, gizli) {
  return new Promise((coz, red) => {
    if (!process.stdin.isTTY) return red(new Error("Sifre sorulamiyor (etkilesimli terminal degil). BABUCO_EPOSTA + BABUCO_SIFRE ortam degiskenlerini ver."));
    process.stdout.write(soru);
    if (!gizli) {
      const rl = require("readline").createInterface({ input: process.stdin, output: process.stdout, terminal: false });
      rl.once("line", (s) => { rl.close(); coz(s.trim()); });
      return;
    }
    let s = "";
    const oku = (b) => {                                         // şifre ekrana yazılmaz
      for (const ch of b.toString("utf8")) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener("data", oku); process.stdout.write("\n"); return coz(s); }
        if (ch === "\u0003") { process.stdin.setRawMode(false); process.stdout.write("\n"); process.exit(1); }
        if (ch === "\u007f" || ch === "\b") s = s.slice(0, -1); else s += ch;
      }
    };
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on("data", oku);
  });
}
const YETKI_METNI = {
  yetkili: "izin listesinde · veritabani kilidi kurulu",
  yetkisiz: "IZIN LISTESINDE DEGIL — veriyi okuyamaz (tools/supabase/KURULUM.md)",
  kilitsiz: "veritabani kilidi henuz kurulmamis (herkese acik)",
  bilinmiyor: "izin sorulamadi (baglanti?)",
};
if (require.main === module) {
  (async () => {
    const komut = (process.argv[2] || "durum").toLowerCase();
    const A = panelAyar();
    if (komut === "cikis") {
      const vardi = !!dosyaOku()[A.url];
      dosyaYaz(A.url, null);
      console.log(vardi ? "Sakli oturum silindi." : "Sakli oturum yoktu.");
      return;
    }
    if (komut === "giris") {
      const eposta = (process.env.BABUCO_EPOSTA || "").trim() || await sor("E-posta: ");
      const sifre = process.env.BABUCO_SIFRE || await sor("Sifre: ", true);
      const y = await jetonAl("password", { email: eposta, password: sifre });
      if (!y) throw new Error("Giris basarisiz: e-posta ya da sifre yanlis.");
      const yazildi = dosyaYaz(A.url, y);
      console.log("Giris yapildi: " + y.eposta + " · " + YETKI_METNI[await yetkiSor(y.access_token)]);
      console.log(yazildi ? "Oturum kaydedildi (" + path.basename(oturumDosyasi()) + "); arac artik sifre sormadan calisir."
        : "UYARI: oturum dosyasi yazilamadi; her calistirmada BABUCO_EPOSTA + BABUCO_SIFRE gerekir.");
      return;
    }
    if (komut === "durum") {
      const o = await oturum();
      console.log("Sunucu: " + A.url);
      console.log(o ? "Oturum: " + o.eposta + " · " + YETKI_METNI[await yetkiSor(o.access_token)]
        : "Oturum: yok (herkese acik anahtarla) · " + (await yetkiSor(null) === "kilitsiz" ? YETKI_METNI.kilitsiz : "veritabani kilitli — giris gerekli"));
      return;
    }
    console.log("Komutlar: giris | durum | cikis");
  })().catch((e) => { console.error("\nHATA: " + e.message); process.exit(1); });
}
