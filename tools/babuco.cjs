#!/usr/bin/env node
/**
 * BABUCO CLI — Özgür Ticaret toptancı panelinin verisini terminalden oku/yaz.
 *
 * Neden var: kullanıcı sahadayken telefondan konuşarak satış girdiriyor. Panel
 * (cayci-pos/public/toptanci/app.js) tüm store'u tek bir bulut anahtarına yazıyor
 * (Supabase kv → "babuco:store", son-yazan-kazanır). Bu araç aynı anahtarı panelin
 * kendi mantığıyla okur ve yazar; her yeni oturumda sıfırdan keşif gerekmesin diye
 * kalıcı yere kuruldu.
 *
 * Komutlar:
 *   node babuco.js durum                       Bulut yedeğinin durumu
 *   node babuco.js rapor [YYYY-AA-GG]          Günlük rapor (Markdown)
 *   node babuco.js musteri [arama]             Müşteri(ler) + borç + özel fiyat
 *   node babuco.js ekstre <musteri>            Müşterinin tüm hareketleri + bakiye seyri
 *   node babuco.js tahsilat-listesi            Kim borçlu, en son ne zaman ödedi (riskli üstte)
 *   node babuco.js aylik                       Aylık servis günü / ciro / kâr / sahadaki alacak
 *   node babuco.js musteritablo [YYYY-AA-GG] [--tutar]  Günün satış şablonu (uğrama sırasına göre)
 *   node babuco.js kasa [YYYY-AA-GG] [--hesaba=ad,ad]  Gün sonu: para tipi, gider, maliyet, kâr, ciro
 *   node babuco.js urun [arama]                Ürün ara (satış/alış fiyatı, stok)
 *   node babuco.js haftalik [YYYY-AA]                                hafta hafta toplanan / babaya / cepte kalan
 *   node babuco.js iade <musteri> <urun> <adet> [fiyat] [--dukkan]       (--kaydet)
 *   node babuco.js urun-ekle <ad> <alis> <satis> [grup]               (--kaydet)
 *   node babuco.js urun-fiyat <urun> <alis|satis> <fiyat>            (--kaydet)
 *   node babuco.js musteri-ekle <ad> [telefon]                        (--kaydet)
 *   node babuco.js ozel-fiyat <musteri> <urun> <fiyat|sil>          (--kaydet; bütün aileye, --tek sadece o ürün)
 *   node babuco.js satis <dosya.json|json>     Satış gir            (--kaydet)
 *                                              Önce Markdown FİŞ basar (kullanıcı onaylasın diye);
 *                                              eski düz metin özet için --duz.
 *   node babuco.js alim <dosya.json|json>      Mal girişi: stok ekle (--kaydet)
 *   node babuco.js tahsilat <musteri> <tutar> [not] [--tarih=YYYY-AA-GG]                 (--kaydet)
 *   node babuco.js gider <tutar> <aciklama> [kategori]              (--kaydet)
 *   node babuco.js gelir <tutar> <aciklama> [tur]                   (--kaydet)
 *   node babuco.js sil-satis <belgeNo>         Satışı geri al       (--kaydet)
 *   node babuco.js siparisler                  Çay ocağından gelen siparişler
 *
 * GÜVENLİK: --kaydet verilmezse HİÇBİR ŞEY yazılmaz, sadece özet basılır.
 * Her yazmadan önce buluttaki mevcut hâl `yedek/<zaman>.json` olarak saklanır.
 * Yazma "compare-and-swap": bu arada telefondaki panel yazdıysa işlem reddedilir,
 * körlemesine üzerine yazıp veri silmez.
 */
const fs = require("fs");
const path = require("path");

/* Bağlantı bilgisi panelin kendi kaynağından okunur — bu dosyada anahtarın ikinci bir
   kopyası TUTULMAZ. Sıra: ortam değişkeni → panelin app.js'i (tek doğru kaynak).
   Panel zaten publishable (tarayıcıya gömülen) anahtarı kullanıyor. */
function panelAyar() {
  if (process.env.BABUCO_SB_URL && process.env.BABUCO_SB_KEY) {
    return { url: process.env.BABUCO_SB_URL, key: process.env.BABUCO_SB_KEY };
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
      if (u && k) return { url: u[1], key: k[1] };
    } catch (e) { /* sıradaki adaya bak */ }
  }
  throw new Error("Panel ayarı bulunamadi. Ya depo kokunden calistir, ya da BABUCO_SB_URL + BABUCO_SB_KEY ortam degiskenlerini ver.");
}
const _ayar = panelAyar();
const SB_URL = _ayar.url;
const SB_KEY = _ayar.key;
const BULUT_KEY = "babuco:store";
const YEDEK_DIR = path.join(__dirname, "yedek");

/* ---------- panelden birebir alınan yardımcılar ---------- */
const pad2 = (n) => String(n).padStart(2, "0");
const localDateStr = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const todayStr = () => localDateStr(new Date());
const kurus = (n) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0) + " ₺";
const saat = (iso) => { const d = new Date(iso); return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); };
function haftaNo(d) {
  d = new Date(d); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day + 3);
  const firstThu = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
  return d.getFullYear() + "-H" + String(week).padStart(2, "0");
}
function genId(store) { store.counters.seq = (store.counters.seq || 0) + 1; return "id" + store.counters.seq + Date.now().toString(36); }
function customerBorc(store, id) {
  const c = store.customers.find((x) => x.id === id); if (!c) return 0;
  let b = Number(c.acilis) || 0;
  store.sales.forEach((s) => { if (s.musteriId === id) b += Number(s.odeme.acik) || 0; });
  store.payments.forEach((p) => { if (p.musteriId === id) b -= Number(p.tutar) || 0; });
  return kurus(b);
}
const karOrani = (ciro, mal) => (Number(ciro) > 0 ? "%" + (((ciro - mal) / ciro) * 100).toFixed(1) : "—");

/* ---------- bulut ---------- */
async function sb(pathQ, opts) {
  opts = opts || {};
  const base = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };
  const r = await fetch(SB_URL + "/rest/v1/" + pathQ, Object.assign({}, opts, { headers: Object.assign(base, opts.headers || {}) }));
  const txt = await r.text();
  if (!r.ok) throw new Error("Supabase HTTP " + r.status + ": " + txt.slice(0, 300));
  return txt ? JSON.parse(txt) : null;
}
async function storeOku() {
  const rows = await sb("kv?key=eq." + encodeURIComponent(BULUT_KEY) + "&select=value,updated_at");
  if (!rows || !rows.length) throw new Error("Bulutta babuco:store kaydı yok.");
  return { store: rows[0].value, updatedAt: rows[0].updated_at };
}
/**
 * Compare-and-swap yazma: yalnız updated_at hâlâ okuduğumuz değerdeyse yazar.
 * Bu arada telefondaki panel yazdıysa 0 satır döner → işlem iptal, veri korunur.
 */
async function storeYaz(store, beklenenTs) {
  fs.mkdirSync(YEDEK_DIR, { recursive: true });
  const onceki = await storeOku();
  const yedek = path.join(YEDEK_DIR, new Date().toISOString().replace(/[:.]/g, "-") + ".json");
  fs.writeFileSync(yedek, JSON.stringify(onceki.store));
  if (onceki.updatedAt !== beklenenTs) {
    throw new Error("CAKISMA: bulut bu arada degisti (" + onceki.updatedAt + "). Telefondaki panel yazmis olabilir. Yeniden oku ve tekrar dene. (Onceki hal yedeklendi: " + path.basename(yedek) + ")");
  }
  const ts = new Date().toISOString();
  const q = "kv?key=eq." + encodeURIComponent(BULUT_KEY) + "&updated_at=eq." + encodeURIComponent(beklenenTs);
  const out = await sb(q, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ value: store, updated_at: ts }) });
  if (!out || !out.length) throw new Error("CAKISMA: yazma sirasinda bulut degisti, hicbir sey yazilmadi. Tekrar dene.");
  return { ts: ts, yedek: yedek };
}

/* ---------- eşleştirme ---------- */
const norm = (s) => String(s || "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
function tekEslesme(liste, ara, alan, tur) {
  const a = norm(ara);
  if (!a) throw new Error(tur + " adi bos.");
  const tam = liste.filter((x) => norm(x[alan]) === a);
  if (tam.length === 1) return tam[0];
  const kismi = liste.filter((x) => norm(x[alan]).includes(a));
  if (kismi.length === 1) return kismi[0];
  if (kismi.length === 0) throw new Error(tur + ' bulunamadi: "' + ara + '"');
  throw new Error(tur + ' tek degil, "' + ara + '" birden cok eslesti:\n' + kismi.slice(0, 12).map((x) => "  - " + x[alan]).join("\n") + "\nDaha acik yaz.");
}
const urunBul = (store, ara) => tekEslesme(store.products.filter((p) => p.gorunur !== false), ara, "ad", "Urun");
const musteriBul = (store, ara) => tekEslesme(store.customers, ara, "ad", "Musteri");

/* ---------- ortak para hesapları (panelin app.js'indeki "PARA" bloğunun BİREBİR kopyası) ----------
   tahsilatTuru, kalemAlis, kasaHesap, borcYas: kural değişirse panelde de değiştir.
   testler/para/panel-arac-esit.mjs iki tarafın aynı gün için aynı rakamı verdiğini denetler. */
const TAHSILAT_TUR_AD = { nakit: "Nakit", kart: "Kart", havale: "Havale", iade: "İade", duzeltme: "Düzeltme" };
const KART_NOT_RE = /(^|[^a-zçğöşü])(pos|kart)(['’]?(la|tan|dan|ina|indan|iyla|i|a))?(?![a-zçğöşü])/;
const HAVALE_NOT_RE = /(^|[^a-zçğöşü])(havale[a-zçğöşü]*|eft(['’][a-zçğöşü]+)?|iban(['’]?[a-zçğöşü]{1,4})?)(?![a-zçğöşü])/;
/* Tahsilatın türü: odemeTuru alanı, yoksa nottan çıkarım. iade ve duzeltme PARA GİRİŞİ DEĞİLDİR
   (kasaya ve "toplanan"a sayılmaz) — --duzeltme kayıtları için zaten geçerli olan kuralın aynısı. */
function tahsilatTuru(p) {
  const t = p && p.odemeTuru;
  if (t === "nakit" || t === "kart" || t === "havale" || t === "iade" || t === "duzeltme") return t;
  const n = String((p && p.not) || "").toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
  if (/d[üu]zeltme/.test(n) || Number(p && p.tutar) < 0) return "duzeltme";
  if (/iade/.test(n)) return "iade";
  if (KART_NOT_RE.test(n)) return "kart";
  if (HAVALE_NOT_RE.test(n)) return "havale";
  return "nakit";
}
function kayitNakitMi(e) { const s = String((e && (e.odeme || e.odemeTuru)) || "").toLocaleLowerCase("tr-TR"); return !s || s === "nakit"; }
function giderKategori(e) { return String((e && (e.kategori || e.tur)) || "").trim() || "Genel"; }
function giderMalAlimiMi(e) { return /stok al[ıi]m/i.test(giderKategori(e)); }
function kalemAlis(store, it) {
  if (it && it.alis != null && it.alis !== "") return Number(it.alis) || 0;
  const p = it && it.urunId && store.products.find((x) => x.id === it.urunId);
  return p ? Number(p.alis) || 0 : 0;
}
/* Fişin maliyeti: kayıtlı s.maliyet esas; hiç yoksa kalemlerden. */
function satisMaliyet(store, s) {
  return (s.maliyet != null && s.maliyet !== "") ? Number(s.maliyet) || 0 : kurus((s.items || []).reduce((a, it) => a + kalemAlis(store, it) * (Number(it.adet) || 0), 0));
}
const inRange = (iso, from, to) => { const d = localDateStr(new Date(iso)); return (!from || d >= from) && (!to || d <= to); };
/* TEK kasa/kâr hesabı (panel: kasaHesap). nakitKasa = nakit satış + nakit tahsilat + nakit gelir
   − nakit gider − firmaya nakit ödeme − peşin nakit mal alımı. Kart/havale ayrı; iade ve düzeltme kasaya girmez.
   urunKar = ciro − maliyet; POS komisyonu ayrı satır; netKar = urunKar − komisyon − işletme gideri + gelir. */
function kasaHesap(store, from, to) {
  const ic = (iso) => !!iso && inRange(iso, from, to), N = (v) => Number(v) || 0;
  const r = { satisAdet: 0, satisNakit: 0, satisPos: 0, satisAcik: 0, ciro: 0, maliyet: 0, komisyon: 0,
    tahNakit: 0, tahKart: 0, tahHavale: 0, iade: 0, duzeltme: 0,
    giderNakit: 0, giderDiger: 0, giderMal: 0, giderAdet: 0, gelirNakit: 0, gelirDiger: 0,
    firmaNakit: 0, firmaDiger: 0, alimNakit: 0, alimDiger: 0 };
  store.sales.forEach((s) => {
    if (!ic(s.tarih)) return;
    const o = s.odeme || {};
    r.satisAdet++; r.satisNakit += N(o.nakit); r.satisPos += N(o.pos); r.satisAcik += N(o.acik);
    r.ciro += N(s.toplam); r.maliyet += N(s.maliyet); r.komisyon += N(s.komisyon);
  });
  (store.payments || []).forEach((p) => {
    if (!ic(p.tarih)) return;
    const t = tahsilatTuru(p), v = N(p.tutar);
    if (t === "nakit") r.tahNakit += v; else if (t === "kart") r.tahKart += v; else if (t === "havale") r.tahHavale += v;
    else if (t === "iade") r.iade += v; else r.duzeltme += v;
  });
  (store.expenses || []).forEach((e) => {
    if (!ic(e.tarih)) return;
    const v = N(e.tutar);
    if (kayitNakitMi(e)) r.giderNakit += v; else r.giderDiger += v;
    if (giderMalAlimiMi(e)) r.giderMal += v; else r.giderAdet++;
  });
  (store.incomes || []).forEach((e) => { if (!ic(e.tarih)) return; if (kayitNakitMi(e)) r.gelirNakit += N(e.tutar); else r.gelirDiger += N(e.tutar); });
  (store.firmaPayments || []).forEach((p) => { if (!ic(p.tarih)) return; if (!p.odemeTuru || p.odemeTuru === "nakit") r.firmaNakit += N(p.tutar); else r.firmaDiger += N(p.tutar); });
  (store.purchases || []).forEach((p) => {
    if (!ic(p.tarih) || p.odeme !== "pesin" || !p.odemeTuru) return;
    if (p.odemeTuru === "nakit") r.alimNakit += N(p.toplam); else r.alimDiger += N(p.toplam);
  });
  Object.keys(r).forEach((k) => { if (k !== "satisAdet" && k !== "giderAdet") r[k] = kurus(r[k]); });
  r.tahsilat = kurus(r.tahNakit + r.tahKart + r.tahHavale);
  r.gider = kurus(r.giderNakit + r.giderDiger);
  r.giderIsletme = kurus(r.gider - r.giderMal);
  r.gelir = kurus(r.gelirNakit + r.gelirDiger);
  r.firmaOde = kurus(r.firmaNakit + r.firmaDiger);
  r.nakitKasa = kurus(r.satisNakit + r.tahNakit + r.gelirNakit - r.giderNakit - r.firmaNakit - r.alimNakit);
  r.kartHavale = kurus(r.satisPos + r.tahKart + r.tahHavale + r.gelirDiger);
  r.urunKar = kurus(r.ciro - r.maliyet);
  r.netKar = kurus(r.urunKar - r.komisyon - r.giderIsletme + r.gelir);
  r.giderEksik = r.satisAdet > 0 && r.giderAdet === 0;
  return r;
}
/* ---- vade (ilk giren ilk kapanır) + limit ---- */
const VADE_VARSAYILAN = 30;
function genelVade(store) { const v = Number(store.settings && store.settings.varsayilanVade); return v > 0 ? Math.round(v) : VADE_VARSAYILAN; }
function musteriVade(store, c) { const v = Number(c && c.vade); return v > 0 ? Math.round(v) : genelVade(store); }
function gunFarki(iso, bugun) {
  const a = new Date(localDateStr(new Date(iso)) + "T12:00:00"), b = new Date((bugun || todayStr()) + "T12:00:00");
  return Math.round((b - a) / 86400000);
}
function idZamani(id) {
  const m = /^id\d+([0-9a-z]{8})$/.exec(String(id || "")); if (!m) return null;
  const t = parseInt(m[1], 36);
  return (t > 1577836800000 && t < Date.now() + 86400000) ? new Date(t).toISOString() : null;
}
function borcYas(store, id, bugun) {
  const c = store.customers.find((x) => x.id === id); if (!c) return null;
  const N = (v) => Number(v) || 0, borclar = [];
  let odenen = 0, ilk = null;
  const gor = (t) => { if (t && (!ilk || t < ilk)) ilk = t; };
  store.sales.forEach((s) => {
    if (s.musteriId !== id) return; gor(s.tarih);
    const a = N(s.odeme && s.odeme.acik);
    if (a > 0) borclar.push({ t: s.tarih, tutar: a, belge: s.belgeNo }); else if (a < 0) odenen += -a;
  });
  store.payments.forEach((p) => {
    if (p.musteriId !== id) return; gor(p.tarih);
    const t = N(p.tutar);
    if (t > 0) odenen += t; else if (t < 0) borclar.push({ t: p.tarih, tutar: -t, belge: "elle yazılan borç" });
  });
  const ac = N(c.acilis);
  if (ac > 0) {
    const kart = idZamani(c.id);
    let t = ilk && kart ? (kart < ilk ? kart : ilk) : (ilk || kart);
    if (!t) t = store.sales.reduce((m, s) => (!m || s.tarih < m ? s.tarih : m), null) || new Date().toISOString();
    borclar.push({ t: t, tutar: ac, belge: "açılış borcu", acilis: true });
  } else if (ac < 0) odenen += -ac;
  borclar.sort((a, b) => (a.acilis ? -1 : b.acilis ? 1 : (a.t < b.t ? -1 : a.t > b.t ? 1 : 0)));
  odenen = kurus(odenen);
  const acik = [];
  borclar.forEach((b) => {
    const kapanan = Math.min(b.tutar, odenen); odenen = kurus(odenen - kapanan);
    const kalan = kurus(b.tutar - kapanan);
    if (kalan > 0.005) acik.push({ t: b.t, tutar: kalan, belge: b.belge, gun: Math.max(0, gunFarki(b.t, bugun)) });
  });
  const vade = musteriVade(store, c), gec = acik.filter((a) => a.gun > vade);
  const gecikmisTutar = kurus(gec.reduce((a, x) => a + x.tutar, 0));
  const gecikmis = gecikmisTutar > 0.5;
  return { borc: kurus(acik.reduce((a, x) => a + x.tutar, 0) - odenen), acik: acik, avans: odenen, vade: vade, vadeOzel: Number(c.vade) > 0,
    enEski: acik[0] || null, gecikmis: gecikmis, gecikmisTutar: gecikmis ? gecikmisTutar : 0, gecikmeGun: gecikmis ? acik[0].gun - vade : 0 };
}
function musteriLimit(c) { const l = Number(c && c.limit); return l > 0 ? l : 0; }
/* Aylık sabit giderler: { id, ad, tutar, baslangic: "YYYY-AA" } — başladığı aydan itibaren her ayın netinden düşülür. */
function sabitGiderAylik(store, ym) {
  return kurus((store.sabitGiderler || []).filter((g) => (!g.baslangic || g.baslangic <= ym) && (!g.bitis || g.bitis >= ym)).reduce((a, g) => a + (Number(g.tutar) || 0), 0));
}

/* ---------- rapor (panelin Gunluk/Urunsel/Grupsal hesabiyla ayni) ---------- */
function raporMd(store, gun, updatedAt) {
  const inR = (iso) => iso && localDateStr(new Date(iso)) === gun;
  const cust = (id) => (store.customers.find((c) => c.id === id) || {}).ad || "(perakende)";
  const sales = store.sales.filter((s) => inR(s.tarih)).sort((a, b) => a.tarih.localeCompare(b.tarih));
  const sum = (fn) => sales.reduce((a, s) => a + (Number(fn(s)) || 0), 0);
  const nakit = sum((s) => s.odeme.nakit), pos = sum((s) => s.odeme.pos), acik = sum((s) => s.odeme.acik);
  const ciro = sum((s) => s.toplam), mal = sum((s) => s.maliyet);
  /* Kasa ve kâr tek fonksiyondan (panelle aynı): tahsilat türüne göre ayrılır, iade/düzeltme kasaya girmez. */
  const k = kasaHesap(store, gun, gun);
  const gider = k.gider, gelir = k.gelir, tahsilat = k.tahsilat, firmaOde = k.firmaOde, nakitKasa = k.nakitKasa;

  const urun = {};
  sales.forEach((s) => s.items.forEach((it) => {
    const p = store.products.find((x) => x.id === it.urunId);
    const alis = kalemAlis(store, it), adet = Number(it.adet) || 0, fiyat = Number(it.fiyat) || 0; // satış anındaki maliyet
    urun[it.ad] = urun[it.ad] || { adet: 0, ciro: 0, kar: 0, grup: (p && p.grup) || "GRUPSUZ URUN" };
    urun[it.ad].adet += adet; urun[it.ad].ciro += adet * fiyat; urun[it.ad].kar += adet * (fiyat - alis);
  }));
  const grup = {};
  Object.values(urun).forEach((v) => {
    grup[v.grup] = grup[v.grup] || { adet: 0, ciro: 0, kar: 0 };
    grup[v.grup].adet += v.adet; grup[v.grup].ciro += v.ciro; grup[v.grup].kar += v.kar;
  });
  const odemeTipi = (s) => {
    const n = [s.odeme.nakit > 0, s.odeme.pos > 0, s.odeme.acik > 0].filter(Boolean).length;
    if (n > 1) return "Parçalı";
    return s.odeme.pos > 0 ? "Pos" : s.odeme.acik > 0 ? "Açık" : "Nakit";
  };

  const L = [], parca = gun.split("-");
  L.push("# Babuco Günlük Rapor — " + parca[2] + "." + parca[1] + "." + parca[0], "");
  L.push("| Metrik | Tutar |", "|---|---|");
  L.push("| **Ciro** | **" + money(ciro) + "** |", "| Ürün maliyeti | " + money(mal) + " |", "| **Kâr** | **" + money(ciro - mal) + "** |", "| Kâr oranı | " + karOrani(ciro, mal) + " |");
  [["Nakit", nakit], ["Pos", pos], ["Açık hesap", acik], ["Alınan ödemeler", tahsilat], ["Firma ödemeleri", firmaOde], ["Giderler", gider], ["Gelirler", gelir]]
    .forEach((x) => L.push("| " + x[0] + " | " + money(x[1]) + " |"));
  if (k.alimNakit || k.alimDiger) L.push("| Peşin mal alımı | " + money(kurus(k.alimNakit + k.alimDiger)) + " |");
  L.push("| **Nakit kasa** | **" + money(nakitKasa) + "** |");
  L.push("| Kart / havale ile gelen | " + money(k.kartHavale) + " |");
  if (k.iade || k.duzeltme) L.push("| İade / düzeltme (kasaya girmez) | " + money(kurus(k.iade + k.duzeltme)) + " |");
  if (k.komisyon) L.push("| POS komisyonu | " + money(k.komisyon) + " |");
  L.push("| **Net kâr (gider sonrası)** | **" + money(k.netKar) + "** |", "");
  if (k.giderEksik) L.push("> ⚠ Bu gün satış var ama hiç gider yazılmamış — yakıt/yemek olduysa `gider` ile gir.", "");
  const fark = kurus(nakit + pos + acik - ciro);
  L.push(Math.abs(fark) > 0.01 ? "> **Ödeme kırılımı ciroyu tutmuyor** — fark " + money(fark) + "." : "> Ödeme kırılımı ciroyu tutuyor.", "");

  L.push("## Satışlar (" + sales.length + ")", "");
  if (sales.length) {
    L.push("| Saat | Belge | Müşteri | Ödeme | Tutar | Maliyet | Kâr | Marj |", "|---|---|---|---|---|---|---|---|");
    sales.forEach((s) => L.push("| " + saat(s.tarih) + " | " + s.belgeNo + " | " + cust(s.musteriId) + " | " + odemeTipi(s) + " | " + money(s.toplam) + " | " + money(s.maliyet) + " | " + money(s.toplam - (Number(s.maliyet) || 0)) + " | " + karOrani(s.toplam, s.maliyet) + " |"));
  } else L.push("_Bu tarihte satış yok._");
  L.push("");
  L.push("## Ürünsel", "");
  if (Object.keys(urun).length) {
    L.push("| Adet | Ürün | Grup | Ciro | Kâr |", "|---|---|---|---|---|");
    Object.entries(urun).sort((a, b) => b[1].ciro - a[1].ciro).forEach((e) => L.push("| " + e[1].adet + " | " + e[0] + " | " + e[1].grup + " | " + money(e[1].ciro) + " | " + money(e[1].kar) + " |"));
  } else L.push("_Yok._");
  L.push("");
  L.push("## Grupsal", "");
  if (Object.keys(grup).length) {
    L.push("| Grup | Adet | Ciro | Kâr |", "|---|---|---|---|");
    Object.entries(grup).sort((a, b) => b[1].ciro - a[1].ciro).forEach((e) => L.push("| " + e[0] + " | " + e[1].adet + " | " + money(e[1].ciro) + " | " + money(e[1].kar) + " |"));
  } else L.push("_Yok._");
  L.push("");
  const liste = (bas, arr, satir) => { L.push("## " + bas, ""); if (arr.length) arr.forEach((x) => L.push("- " + satir(x))); else L.push("_Yok._"); L.push(""); };
  liste("Tahsilatlar", store.payments.filter((p) => inR(p.tarih)), (p) => cust(p.musteriId) + " — " + money(p.tutar) + " · " + TAHSILAT_TUR_AD[tahsilatTuru(p)] + (p.not ? " · " + p.not : ""));
  liste("Giderler", store.expenses.filter((e) => inR(e.tarih)), (e) => giderKategori(e) + " — " + money(e.tutar) + (kayitNakitMi(e) ? "" : " · " + (e.odeme || e.odemeTuru)) + (e.not ? " · " + e.not : ""));
  liste("Gelirler", store.incomes.filter((e) => inR(e.tarih)), (e) => (e.tur || "-") + " — " + money(e.tutar) + (e.not ? " · " + e.not : ""));
  liste("Çay ocağından gelen siparişler", (store.gelenSiparisler || []).filter((o) => inR(o.tarih)), (o) => o.dealer + " — " + money(o.toplam) + " · durum: **" + o.durum + "**" + (o.saleId ? " (satışa işlendi)" : ""));
  liste("Servis (gün sonu) raporları", (store.servisRaporlari || []).filter((r) => inR(r.tarih)), (r) => saat(r.tarih) + " — ciro " + money(r.ciro) + ", kâr " + money(r.kar) + ", gider " + money(r.gider) + ", " + (r.ziyaret || 0) + " ziyaret, " + (r.km || 0) + " km");
  L.push("---", "_Kaynak: babuco bulut yedeği, son güncelleme " + new Date(updatedAt).toLocaleString("tr-TR") + "._");
  return L.join("\n");
}

/* ---------- fiyat ailesi ----------
   Kullanıcının kuralı: bir müşteride bir ailenin TEK fiyatı olur — toz içeceklerin
   hepsi 75 ise kuşburnu da 75, nane limon da 75; vişneyi 600'den verdiyse şeftali de 600.
   Aile = aynı altKategori (panelin varyant gruplaması) + aynı liste fiyatı. Liste fiyatı
   şartı, markası farklı olup ayrı fiyatlanan ürünleri (Beypazarı 315 / Kızılay 285 sade
   soda, Kola 625 / Sarıyer 700) birbirine bağlamamak için. */
function aile(store, p) {
  const alt = (p.altKategori || "").trim();
  if (!alt) return [p];
  return store.products.filter((x) => (x.altKategori || "").trim() === alt && Number(x.satis) === Number(p.satis));
}
function ozelOku(c, id) {
  const oz = (c && c.ozelFiyatlar) || {};
  return (oz[id] != null && oz[id] !== "") ? Number(oz[id]) : null;
}
/* Bu müşteriye bu aileden en son hangi fiyattan satıldı (fişteki kontrol notu için). */
function aileSonSatis(store, c, p) {
  if (!c) return null;
  const ids = aile(store, p).map((x) => x.id);
  let son = null;
  store.sales.forEach((s) => {
    if (s.musteriId !== c.id) return;
    s.items.forEach((it) => { if (ids.includes(it.urunId) && (!son || s.tarih > son.tarih)) son = { fiyat: Number(it.fiyat), tarih: s.tarih }; });
  });
  return son;
}
/* Müşterinin bu ürün için geçerli özel fiyatı: ürünün kendi özel fiyatı, yoksa aile
   kardeşlerinden biri. Kardeşler çelişirse aileden en son satılan fiyata uyan kazanır. */
function aileOzelFiyat(store, c, p) {
  const kendi = ozelOku(c, p.id);
  if (kendi != null) return kendi;
  const fiyatlar = [...new Set(aile(store, p).map((x) => ozelOku(c, x.id)).filter((v) => v != null))];
  if (!fiyatlar.length) return null;
  if (fiyatlar.length === 1) return fiyatlar[0];
  const son = aileSonSatis(store, c, p);
  return (son && fiyatlar.includes(son.fiyat)) ? son.fiyat : fiyatlar[0];
}

/* ---------- satış: panelin kaydetSatis() mantığı ---------- */
function satisHazirla(store, girdi) {
  const c = girdi.musteri ? musteriBul(store, girdi.musteri) : null;
  const ham = (girdi.kalemler || []).map((k) => ({ k: k, p: urunBul(store, k.urun) }));
  /* Fişte ailenin bir üyesine elle fiyat verildiyse, fiyatı yazılmayan kardeşleri de onu alır
     ("toz içecekler 75" dendiğinde her çeşide tek tek fiyat yazmaya gerek kalmasın). */
  const elleAile = {};
  ham.forEach(({ k, p }) => { if (k.fiyat != null && k.fiyat !== "") aile(store, p).forEach((x) => { if (elleAile[x.id] == null) elleAile[x.id] = Number(k.fiyat); }); });
  const kalemler = ham.map(({ k, p }) => {
    const ozelFiyat = aileOzelFiyat(store, c, p);
    const varsayilan = elleAile[p.id] != null ? elleAile[p.id] : (ozelFiyat != null ? ozelFiyat : (Number(p.satis) || 0));
    const fiyat = (k.fiyat != null && k.fiyat !== "") ? Number(k.fiyat) : varsayilan;
    const adet = Number(k.adet) || 0;
    if (adet <= 0) throw new Error('"' + p.ad + '" icin adet gecersiz.');
    return { p: p, ad: p.ad, urunId: p.id, adet: adet, fiyat: fiyat, alis: Number(p.alis) || 0, listeFiyat: Number(p.satis) || 0, ozelFiyat: ozelFiyat, sonSatis: aileSonSatis(store, c, p) };
  });
  if (!kalemler.length) throw new Error("Satista kalem yok.");
  const brut = kurus(kalemler.reduce((a, k) => a + k.adet * k.fiyat, 0));
  const iskonto = kurus(girdi.iskonto || 0);
  const toplam = kurus(brut - iskonto);
  const maliyet = kurus(kalemler.reduce((a, k) => a + k.alis * k.adet, 0));

  // Odeme: ya {nakit,pos,acik} ya da tip kisayolu ("nakit"|"pos"|"acik")
  let odeme = { nakit: 0, pos: 0, acik: 0 }, fazla = 0, fazlaNakit = 0, fazlaKart = 0;
  const o = girdi.odeme;
  if (typeof o === "string" || (o && o.tip)) {
    const tip = typeof o === "string" ? o : o.tip;
    if (tip === "nakit") odeme.nakit = toplam;
    else if (tip === "pos" || tip === "kart") odeme.pos = toplam;
    else if (tip === "acik" || tip === "veresiye") odeme.acik = toplam;
    else throw new Error('Odeme tipi: "nakit" | "pos" | "acik" ya da {nakit,pos,acik}.');
  } else if (o && typeof o === "object") {
    const n = kurus(o.nakit || 0), p = kurus(o.pos || 0);
    const kalan = kurus(toplam - n - p);
    if (o.acik != null) odeme = { nakit: n, pos: p, acik: kurus(o.acik) };
    else if (kalan > 0.001) odeme = { nakit: n, pos: p, acik: kalan };      // eksik -> acik hesap
    else if (kalan < -0.001) {                                              // fazla -> borca tahsilat
      const posU = Math.min(p, toplam), nakitU = kurus(toplam - posU);
      odeme = { nakit: nakitU, pos: posU, acik: 0 };
      fazlaNakit = kurus(n - nakitU); fazlaKart = kurus(p - posU);
      fazla = kurus(fazlaNakit + fazlaKart);
    } else odeme = { nakit: n, pos: p, acik: 0 };
  } else throw new Error("Odeme belirtilmedi.");

  if (odeme.acik > 0.001 && !c) throw new Error("Acik hesap icin musteri sart.");
  if (fazla > 0.001 && !c) throw new Error("Fazla odeme borca yazilacak - musteri sart.");
  const kirilim = kurus(odeme.nakit + odeme.pos + odeme.acik - toplam);
  if (Math.abs(kirilim) > 0.01) throw new Error("Odeme kirilimi toplami tutmuyor (fark " + money(kirilim) + ").");

  const posSaf = odeme.pos > 0 && odeme.nakit === 0 && odeme.acik === 0;
  const komisyon = (posSaf && !girdi.odemeAdi) ? Math.round(toplam * 0.02 * 100) / 100 : 0;
  const tarih = girdi.tarih ? new Date(girdi.tarih) : new Date();
  return { c: c, kalemler: kalemler, brut: brut, iskonto: iskonto, toplam: toplam, maliyet: maliyet, odeme: odeme, fazla: fazla, fazlaNakit: fazlaNakit, fazlaKart: fazlaKart, komisyon: komisyon, tarih: tarih, girdi: girdi };
}
function satisOzet(store, h) {
  const L = [];
  L.push("Müşteri : " + (h.c ? h.c.ad : "(perakende / müşterisiz)"));
  L.push("Tarih   : " + h.tarih.toLocaleString("tr-TR"));
  L.push("");
  L.push("Kalemler:");
  h.kalemler.forEach((k) => {
    const beklenen = k.ozelFiyat != null ? k.ozelFiyat : k.listeFiyat;
    const not = k.fiyat !== beklenen ? "  (elle fiyat, liste " + money(beklenen) + ")" : (k.ozelFiyat != null ? "  (özel fiyat)" : "");
    L.push("  " + String(k.adet).padStart(3) + " x " + k.ad.padEnd(34) + money(k.fiyat).padStart(13) + " = " + money(k.adet * k.fiyat).padStart(14) + not);
  });
  L.push("");
  if (h.iskonto) L.push("Brüt    : " + money(h.brut) + "   İskonto: " + money(h.iskonto));
  L.push("TOPLAM  : " + money(h.toplam));
  L.push("Maliyet : " + money(h.maliyet));
  L.push("KÂR     : " + money(h.toplam - h.maliyet) + "   (marj " + karOrani(h.toplam, h.maliyet) + ")");
  L.push("Ödeme   : nakit " + money(h.odeme.nakit) + " · pos " + money(h.odeme.pos) + " · açık " + money(h.odeme.acik) + (h.komisyon ? " · pos komisyonu " + money(h.komisyon) : ""));
  if (h.fazla > 0.001) L.push("Fazla ödeme: " + money(h.fazla) + " -> borca tahsilat olarak yazılacak");
  if (h.c) {
    const eski = customerBorc(store, h.c.id);
    L.push("Bakiye  : " + money(eski) + " -> " + money(kurus(eski + h.odeme.acik - h.fazla)));
  }
  return L.join("\n");
}
/**
 * Fiş şablonu (Markdown) — kullanıcı sahada telefondan okuyup "tamam"/"hayır" desin diye.
 * Kaydetmeden ÖNCE basılır; amacı yanlış ürün/fiyat/ödeme girişini kullanıcıya yakalatmak.
 * ⚠ = elle verilen fiyat (listeden farklı) · ⭐ = müşterinin özel fiyatı.
 */
function satisFis(store, h, kaydedildi, belgeNo) {
  const q = (n) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
  const L = [];
  L.push("### 🧾 FİŞ — " + (h.c ? h.c.ad : "(perakende / müşterisiz)"));
  L.push("**" + h.tarih.toLocaleDateString("tr-TR") + "**" +
    (h.girdi.stokKaynak === "arac" ? " · araçtan" : " · dükkandan") +
    (belgeNo ? " · Belge " + belgeNo : ""));
  L.push("");
  L.push("| Adet | Ürün | Fiyat | Tutar |");
  L.push("|---:|---|---:|---:|");
  let elle = false, ozelV = false;
  h.kalemler.forEach((k) => {
    const beklenen = k.ozelFiyat != null ? k.ozelFiyat : k.listeFiyat;
    let im = "";
    if (k.fiyat !== beklenen) { im = " ⚠"; elle = true; }
    else if (k.ozelFiyat != null) { im = " ⭐"; ozelV = true; }
    L.push("| " + k.adet + " | " + k.ad + " | " + q(k.fiyat) + im + " | " + q(k.adet * k.fiyat) + " |");
  });
  if (h.iskonto) {
    L.push("| | | Ara toplam | " + q(h.brut) + " |");
    L.push("| | | İskonto | −" + q(h.iskonto) + " |");
  }
  L.push("| | | **TOPLAM** | **" + q(h.toplam) + " ₺** |");
  L.push("");
  L.push("| | |");
  L.push("|---|---:|");
  if (h.odeme.nakit) L.push("| Nakit alınan | " + q(h.odeme.nakit + h.fazla) + " ₺ |");
  if (h.odeme.pos) L.push("| Kart / pos" + (h.girdi.odemeAdi ? " (" + h.girdi.odemeAdi + ")" : "") + " | " + q(h.odeme.pos) + " ₺ |");
  if (h.komisyon) L.push("| Pos komisyonu (%2) | −" + q(h.komisyon) + " ₺ |");
  if (h.fazla > 0.001) L.push("| Fazlası borca | −" + q(h.fazla) + " ₺ |");
  if (h.odeme.acik > 0.001) L.push("| **Açık hesap kalan** | **" + q(h.odeme.acik) + " ₺** |");
  if (h.c) {
    const eski = customerBorc(store, h.c.id);
    L.push("| **Bakiye** | " + q(eski) + " → **" + q(kurus(eski + h.odeme.acik - h.fazla)) + " ₺** |");
  }
  L.push("| Kâr | " + q(h.toplam - h.maliyet) + " ₺ · " + karOrani(h.toplam, h.maliyet) + " |");
  L.push("");
  /* Aile kontrolü: aynı ailede farklı fiyat, ya da bu müşteriye aileden en son başka
     fiyattan satılmış olması — ikisi de genelde eski/yanlış özel fiyat demek. */
  const gorulen = {};
  h.kalemler.forEach((k) => {
    const anahtar = aile(store, k.p).map((x) => x.id).sort().join(",");
    (gorulen[anahtar] = gorulen[anahtar] || []).push(k);
  });
  Object.values(gorulen).forEach((ks) => {
    const fiyatlar = [...new Set(ks.map((k) => k.fiyat))];
    if (fiyatlar.length > 1) L.push("⚠ **Aynı ailede farklı fiyat:** " + ks.map((k) => k.ad + " " + q(k.fiyat)).join(" · "));
    const son = ks[0].sonSatis;
    if (son && fiyatlar.length === 1 && son.fiyat !== fiyatlar[0]) L.push("ℹ Bu müşteriye bu aileden en son **" + q(son.fiyat) + "** ile satıldı (" + new Date(son.tarih).toLocaleDateString("tr-TR") + ")");
  });
  /* Borç uyarısı (tek satır): bu fiş açık hesaba yazıyor ve limit aşılıyorsa; ayrıca vadesi geçmiş borcu varsa. */
  if (h.c) {
    const eskiB = customerBorc(store, h.c.id), yeniB = kurus(eskiB + h.odeme.acik - h.fazla), lim = musteriLimit(h.c), y = borcYas(store, h.c.id);
    const uy = [];
    if (lim && h.odeme.acik > 0.001 && yeniB > lim + 0.005) uy.push("limit " + q(lim) + " ₺ aşılıyor — yeni bakiye " + q(yeniB) + " ₺ (" + q(kurus(yeniB - lim)) + " ₺ fazla)");
    if (y && y.gecikmis) uy.push("vadesi geçmiş " + q(y.gecikmisTutar) + " ₺ borcu var, " + y.gecikmeGun + " gündür gecikmiş (vade " + y.vade + " gün)");
    if (uy.length) L.push("⚠ **Borç uyarısı:** " + uy.join(" · "));
  }
  /* Stok notu: bu fiş hangi ürünün stoğunu eksiye düşürüyor (satış yine de yazılır). */
  {
    const alan = h.girdi.stokKaynak === "arac" ? "aracStok" : "stok", top = {};
    h.kalemler.forEach((k) => { top[k.urunId] = (top[k.urunId] || 0) + k.adet; });
    const eksi = Object.keys(top).map((id) => { const p = store.products.find((x) => x.id === id); const once = Number(p && p[alan]) || 0; return { ad: p ? p.ad : id, once: once, sonra: once - top[id] }; }).filter((x) => x.sonra < 0);
    if (eksi.length) L.push("ℹ **Stok eksiye düşüyor** (" + (alan === "aracStok" ? "araç" : "dükkan") + "): " + eksi.map((x) => x.ad + " " + x.once + " → " + x.sonra).join(" · "));
  }
  const im = [];
  if (elle) im.push("⚠ = elle fiyat (listeden farklı)");
  if (ozelV) im.push("⭐ = müşterinin özel fiyatı");
  if (im.length) L.push(im.join(" · "));
  L.push(kaydedildi ? "**KAYDEDİLDİ**" : "**KAYDEDİLMEDİ** — onayını bekliyorum");
  return L.join("\n");
}
function satisIsle(store, h) {
  store.counters.sale = (store.counters.sale || 0) + 1;
  const belgeNo = h.tarih.getFullYear() + "-" + String(store.counters.sale).padStart(6, "0");
  const stokKaynak = h.girdi.stokKaynak === "arac" ? "arac" : "dukkan";
  const sale = {
    id: genId(store), belgeNo: belgeNo, musteriId: h.c ? h.c.id : null, personelId: null,
    not: h.girdi.not || "", odemeAdi: h.girdi.odemeAdi || null,
    items: h.kalemler.map((k) => ({ urunId: k.urunId, ad: k.ad, barkod: k.p.barkod || "", kdv: Number(k.p.kdv) || 0, fiyat: k.fiyat, adet: k.adet, iskyuzde: 0, alis: k.alis })), // alis: satış anındaki birim maliyet
    brut: h.brut, iskonto: h.iskonto, toplam: h.toplam, maliyet: h.maliyet, komisyon: h.komisyon,
    odeme: h.odeme, tarih: h.tarih.toISOString(), servisGun: localDateStr(h.tarih), hafta: haftaNo(h.tarih), stokKaynak: stokKaynak,
  };
  store.sales.push(sale);
  h.kalemler.forEach((k) => {
    const p = store.products.find((x) => x.id === k.urunId); if (!p) return;
    if (stokKaynak === "arac") p.aracStok = (Number(p.aracStok) || 0) - k.adet;
    else p.stok = (Number(p.stok) || 0) - k.adet;
  });
  if (h.fazla > 0.001 && h.c) {
    /* Fazlanın nakit ve kart kısmı ayrı kayıt: kasa türü buradan okur. */
    [["nakit", h.fazlaNakit], ["kart", h.fazlaKart]].forEach((f) => {
      if (f[1] > 0.001) store.payments.push({ id: genId(store), musteriId: h.c.id, tutar: f[1], odemeTuru: f[0], not: "Satış üstü fazla ödeme → borca sayıldı (Belge " + belgeNo + ")", tarih: h.tarih.toISOString() });
    });
  }
  return sale;
}

/* ---------- komutlar ---------- */
const args = process.argv.slice(2);
const kaydet = args.indexOf("--kaydet") !== -1;
const pos = args.filter((a) => a.indexOf("--") !== 0);
const komut = (pos[0] || "rapor").toLowerCase();

function provaUyari(ornek) {
  if (kaydet) return;
  console.log("\n" + "-".repeat(60));
  console.log("PROVA - hicbir sey yazilmadi. Kaydetmek icin: node babuco.js " + ornek + " --kaydet");
}

(async () => {
  const okunan = await storeOku();
  const store = okunan.store, updatedAt = okunan.updatedAt;

  if (komut === "durum") {
    console.log("Bulut yedegi:", new Date(updatedAt).toLocaleString("tr-TR"));
    console.log("Satis " + store.sales.length + " · Musteri " + store.customers.length + " · Urun " + store.products.length + " · Tahsilat " + store.payments.length + " · Gider " + store.expenses.length);
    const son = store.sales[store.sales.length - 1];
    if (son) console.log("Son satis:", son.belgeNo, "·", new Date(son.tarih).toLocaleString("tr-TR"), "·", money(son.toplam));
    return;
  }

  if (komut === "rapor") { console.log(raporMd(store, pos[1] || todayStr(), updatedAt)); return; }

  if (komut === "musteri") {
    const ara = pos.slice(1).join(" ");
    const liste = ara ? store.customers.filter((c) => norm(c.ad).includes(norm(ara))) : store.customers.slice();
    if (!liste.length) { console.log("Eslesen musteri yok."); return; }
    liste.sort((a, b) => customerBorc(store, b.id) - customerBorc(store, a.id)).forEach((c) => {
      console.log(c.ad + "  |  borc " + money(customerBorc(store, c.id)) + (c.telefon ? "  |  " + c.telefon : "") + (c.cayOcagi ? "  |  cay ocagi" : ""));
      const oz = c.ozelFiyatlar || {};
      const anahtarlar = Object.keys(oz);
      if (anahtarlar.length) {
        console.log("    ozel fiyat: " + anahtarlar.map((id) => { const p = store.products.find((x) => x.id === id); return (p ? p.ad : id) + " " + money(oz[id]); }).join(" · "));
      }
    });
    return;
  }

  /* Gunun satis sablonu: her musteri icin tek satir.
     Musteri | Icerik (ozet) | Tutar | Odenen | Kalan Bakiye | Kar Marji
     "Odenen" = satisin nakit+pos'u + o belgeye ait fazla odeme tahsilati,
     yani musterinin o gun elden verdigi toplam para. */
  if (komut === "musteritablo") {
    const gun = pos[1] || todayStr();
    const inR = (iso) => iso && localDateStr(new Date(iso)) === gun;
    const cust = (id) => (store.customers.find((c) => c.id === id) || {}).ad || "(perakende)";
    const sales = store.sales.filter((s) => inR(s.tarih));
    if (!sales.length) { console.log("Bu tarihte satış yok: " + gun); return; }
    const fazlalar = store.payments.filter((p) => inR(p.tarih) && /fazla ödeme/i.test(p.not || ""));

    /* Urun adini ozet icin kisaltir; ayni kisa ada dusenler tek satirda toplanir. */
    const kisaAd = (ad) => {
      const a = String(ad);
      if (/Toz İçecek/i.test(a)) return "toz içecek";
      if (/Bardak Su|Pet Şişe Su/i.test(a)) return "su";
      if (/Küp Şeker/i.test(a)) return "şeker";
      if (/Süt Tozu/i.test(a)) return "süt tozu";
      if (/Çay 5 kg/i.test(a)) return "çay";
      if (/Ayran/i.test(a)) return "ayran";
      if (/Coca-Cola/i.test(a)) return "kola";
      if (/Gazoz/i.test(a)) return "gazoz";
      if (/Yazboz/i.test(a)) return "yazboz";
      if (/Çıkma Kağıt/i.test(a)) return "çıkma kağıt";
      if (/Oyun Kağıdı/i.test(a)) return "oyun kağıdı";
      const soda = a.match(/(\S+)\s+Soda$/i);
      if (soda) return soda[1].toLocaleLowerCase("tr") + " soda";
      const aroma = a.match(/^Aroma\s+(\S+)/i);
      if (aroma) return aroma[1].toLocaleLowerCase("tr");
      return a.toLocaleLowerCase("tr");
    };

    const grup = {};
    sales.forEach((s) => {
      const key = s.musteriId || "__perakende__";
      grup[key] = grup[key] || { musteriId: s.musteriId, toplam: 0, maliyet: 0, odenen: 0, kalem: {}, ilk: s.tarih, saat: saat(s.tarih) };
      const g = grup[key];
      if (s.tarih < g.ilk) { g.ilk = s.tarih; g.saat = saat(s.tarih); }
      g.toplam += Number(s.toplam) || 0;
      g.maliyet += Number(s.maliyet) || 0;
      g.odenen += (Number(s.odeme.nakit) || 0) + (Number(s.odeme.pos) || 0) +
        fazlalar.filter((p) => String(p.not || "").indexOf(s.belgeNo) !== -1)
          .reduce((a, p) => a + (Number(p.tutar) || 0), 0);
      s.items.forEach((it) => { const k = kisaAd(it.ad); g.kalem[k] = (g.kalem[k] || 0) + (Number(it.adet) || 0); });
    });

    const parca = gun.split("-");
    console.log("# " + parca[2] + "." + parca[1] + "." + parca[0] + "\n");
    console.log("| # | Saat | Müşteri | İçerik | Tutar | Ödenen | Kalan Bakiye | Kâr Marjı |");
    console.log("|---|---|---|---|---|---|---|---|");
    let tT = 0, tO = 0, tM = 0, sira = 0;
    const tutaraGore = args.indexOf("--tutar") !== -1;
    const siralanmis = Object.values(grup).sort((a, b) =>
      tutaraGore ? b.toplam - a.toplam : String(a.ilk).localeCompare(String(b.ilk)));
    siralanmis.forEach((g) => {
      const icerik = Object.entries(g.kalem).sort((a, b) => b[1] - a[1])
        .map((e) => e[1] + " " + e[0]).join(", ");
      const bakiye = g.musteriId ? money(customerBorc(store, g.musteriId)) : "—";
      sira += 1;
      console.log("| " + sira + " | " + g.saat + " | " + cust(g.musteriId) + " | " + icerik + " | " + money(g.toplam) + " | " +
        money(g.odenen) + " | " + bakiye + " | " + karOrani(g.toplam, g.maliyet) + " |");
      tT += g.toplam; tO += g.odenen; tM += g.maliyet;
    });
    console.log("| | | **TOPLAM** | " + sales.length + " satış | **" + money(tT) + "** | **" + money(tO) +
      "** | — | **" + karOrani(tT, tM) + "** |");
    return;
  }

  /* Gun sonu kasa ozeti: elde ne kadar nakit olmasi gerektigi + ciro/maliyet/kar.
     Satista odeme.nakit toplamla sinirli tutulup fazlasi ayri bir tahsilat kaydina
     yazildigi icin, ELDEN ALINAN nakit = satisin nakidi + o belgeye ait fazla odeme.
     --hesaba=ad,ad ile nakdini bankaya yatiran musteriler elde kalandan dusulur. */
  if (komut === "kasa") {
    const gun = pos[1] || todayStr();
    const hesabaArg = (args.find((a) => a.indexOf("--hesaba=") === 0) || "").slice(9);
    const hesabaAdlar = hesabaArg ? hesabaArg.split(",").map((x) => norm(x)).filter(Boolean) : [];
    const inR = (iso) => iso && localDateStr(new Date(iso)) === gun;
    const cust = (id) => (store.customers.find((c) => c.id === id) || {}).ad || "(perakende)";
    /* Rakamların kaynağı panelle aynı tek fonksiyon; aşağıdaki satırlar yalnız "kimden" dökümü. */
    const k = kasaHesap(store, gun, gun);
    if (args.indexOf("--json") !== -1) { console.log(JSON.stringify(k)); return; }
    const sales = store.sales.filter((s) => inR(s.tarih));
    const odemeler = store.payments.filter((p) => inR(p.tarih));
    if (!sales.length && !odemeler.length && !k.gider && !k.gelir) { console.log("Bu tarihte satış yok: " + gun); return; }
    const fazlaMi = (p) => /fazla ödeme/i.test(p.not || "");
    const hesabaMi = (ad) => hesabaAdlar.some((h) => norm(ad).includes(h));

    const eldeSatir = [], hesapSatir = [], sayilmayan = [];
    sales.forEach((s) => {
      const n = Number(s.odeme.nakit) || 0;
      const f = odemeler.filter((p) => fazlaMi(p) && tahsilatTuru(p) === "nakit" && String(p.not || "").indexOf(s.belgeNo) !== -1)
        .reduce((a, p) => a + (Number(p.tutar) || 0), 0);
      if (n + f <= 0) return;
      const ad = cust(s.musteriId);
      const kayit = { ad: ad, tutar: kurus(n + f) };
      (hesabaMi(ad) ? hesapSatir : eldeSatir).push(kayit);
    });
    /* Satışa bağlı olmayan tahsilatlar türüne göre: nakit → elde, havale → hesaba, kart → pos satırı;
       iade ve düzeltme para girişi değildir, altta ayrıca listelenir. */
    odemeler.forEach((p) => {
      const t = tahsilatTuru(p), ad = cust(p.musteriId), v = kurus(p.tutar);
      if (t === "iade" || t === "duzeltme") { sayilmayan.push(p); return; }
      if (fazlaMi(p) && t === "nakit" && sales.some((s) => String(p.not || "").indexOf(s.belgeNo) !== -1)) return; // yukarıda satışla birlikte sayıldı
      if (t === "nakit") (hesabaMi(ad) ? hesapSatir : eldeSatir).push({ ad: ad + " (tahsilat)", tutar: v });
      else if (t === "havale") hesapSatir.push({ ad: ad + " (havale)", tutar: v });
    });
    const topla = (arr) => kurus(arr.reduce((a, x) => a + x.tutar, 0));
    const elde = topla(eldeSatir), hesaba = topla(hesapSatir);
    const posT = kurus(k.satisPos + k.tahKart);
    const acikT = k.satisAcik, ciro = k.ciro, mal = k.maliyet;
    const giderler = store.expenses.filter((e) => inR(e.tarih));
    const gider = k.giderIsletme, gelir = k.gelir, komisyon = k.komisyon;
    const nakitCikis = kurus(k.giderNakit + k.firmaNakit + k.alimNakit);

    const p = gun.split("-"), L = [];
    L.push("# Kasa Özeti — " + p[2] + "." + p[1] + "." + p[0] + "\n");
    L.push("## Elimdeki para", "", "| Tip | Tutar |", "|---|---|");
    L.push("| **Nakit (elde)** | **" + money(kurus(elde + k.gelirNakit - nakitCikis)) + "** |");
    if (hesaba) L.push("| Nakit (hesaba yatan) | " + money(hesaba) + " |");
    L.push("| Pos (hesaba geçecek) | " + money(posT) + (komisyon ? " · komisyon " + money(komisyon) : "") + " |");
    L.push("| Açık hesap (alacak) | " + money(acikT) + " |");
    L.push("| **Günün toplam tahsilatı** | **" + money(kurus(elde + hesaba + posT)) + "** |", "");
    if (k.firmaNakit || k.alimNakit) L.push("> Nakitten düşülen: gider " + money(k.giderNakit) + (k.firmaNakit ? " · firmaya ödeme " + money(k.firmaNakit) : "") + (k.alimNakit ? " · peşin mal alımı " + money(k.alimNakit) : ""), "");
    if (eldeSatir.length) {
      L.push("### Elden alınan nakit", "", "| Müşteri | Tutar |", "|---|---|");
      eldeSatir.sort((a, b) => b.tutar - a.tutar).forEach((x) => L.push("| " + x.ad + " | " + money(x.tutar) + " |"));
      L.push("| **Toplam** | **" + money(elde) + "** |", "");
    }
    if (hesapSatir.length) {
      L.push("### Hesaba yatan (elde değil)", "", "| Müşteri | Tutar |", "|---|---|");
      hesapSatir.sort((a, b) => b.tutar - a.tutar).forEach((x) => L.push("| " + x.ad + " | " + money(x.tutar) + " |"));
      L.push("| **Toplam** | **" + money(hesaba) + "** |", "");
    }
    L.push("## Ciro · maliyet · kâr", "", "| Metrik | Tutar |", "|---|---|");
    L.push("| **Ciro** | **" + money(ciro) + "** |");
    L.push("| Ürün maliyeti | " + money(mal) + " |");
    L.push("| Gider | " + money(gider) + " |");
    if (k.giderMal) L.push("| Araca mal alımı (gider değil, kasadan çıktı) | " + money(k.giderMal) + " |");
    if (komisyon) L.push("| POS komisyonu | " + money(komisyon) + " |");
    if (gelir) L.push("| Gelir | " + money(gelir) + " |");
    L.push("| **Kâr (ürün)** | **" + money(k.urunKar) + "** · " + karOrani(ciro, mal) + " |");
    L.push("| **Net kâr (gider sonrası)** | **" + money(k.netKar) + "** |", "");
    if (k.giderEksik) L.push("> ⚠ Bu gün satış var ama hiç gider yazılmamış — yakıt/yemek olduysa `gider` ile gir.", "");
    if (giderler.length) {
      L.push("### Giderler", "");
      giderler.forEach((e) => L.push("- " + giderKategori(e) + " — " + money(e.tutar) + (kayitNakitMi(e) ? "" : " · " + (e.odeme || e.odemeTuru)) + (e.not ? " · " + e.not : "")));
      L.push("");
    }
    if (sayilmayan.length) {
      L.push("> **Kasaya sayılmayan kayıtlar** (iade / düzeltme — para girişi değil):");
      sayilmayan.forEach((x) => L.push("> - " + cust(x.musteriId) + " · " + money(x.tutar) + " · " + (x.not || TAHSILAT_TUR_AD[tahsilatTuru(x)])));
    }
    console.log(L.join("\n"));
    return;
  }

  if (komut === "urun") {
    const ara = pos.slice(1).join(" ");
    const liste = store.products.filter((p) => p.gorunur !== false && (!ara || norm(p.ad).includes(norm(ara))));
    if (!liste.length) { console.log("Eslesen urun yok."); return; }
    liste.slice(0, 80).forEach((p) => console.log(String(p.ad).padEnd(40) + " satis " + money(p.satis).padStart(13) + " · alis " + money(p.alis).padStart(13) + " · dukkan " + (Number(p.stok) || 0) + " · arac " + (Number(p.aracStok) || 0) + " · " + (p.grup || "-")));
    if (liste.length > 80) console.log("... " + (liste.length - 80) + " urun daha");
    return;
  }

  if (komut === "siparisler") {
    const list = store.gelenSiparisler || [];
    if (!list.length) { console.log("Gelen siparis yok."); return; }
    list.forEach((o) => console.log(new Date(o.tarih).toLocaleString("tr-TR") + " | " + o.dealer + " | " + money(o.toplam) + " | durum: " + o.durum + (o.saleId ? " (satisa islendi)" : "")));
    return;
  }

  if (komut === "satis") {
    const ham = pos[1];
    if (!ham) throw new Error("Satis verisi gerekli: dosya yolu ya da JSON metni.");
    const girdi = JSON.parse(fs.existsSync(ham) ? fs.readFileSync(ham, "utf8") : ham);
    const h = satisHazirla(store, girdi);
    const duz = args.includes("--duz");
    /* Fiş, satış işlenmeden ÖNCE üretilir: bakiye satırı "eski -> yeni" gösterebilsin diye
       (satisIsle'den sonra customerBorc zaten yeni bakiyeyi döndürür). */
    const fis = duz ? satisOzet(store, h) : satisFis(store, h, false, null);
    if (!kaydet) { console.log(fis); provaUyari("satis <dosya.json>"); return; }
    const sale = satisIsle(store, h);
    console.log(duz ? fis : fis.replace(/\*\*KAYDEDİLMEDİ\*\* — onayını bekliyorum$/,
      "**KAYDEDİLDİ** — Belge " + sale.belgeNo));
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI - Belge " + sale.belgeNo + " · " + money(sale.toplam) + " · kar " + money(sale.toplam - sale.maliyet) + " (" + karOrani(sale.toplam, sale.maliyet) + ")");
    console.log("  buluta yazildi " + new Date(y.ts).toLocaleString("tr-TR") + " · yedek: " + path.basename(y.yedek));
    return;
  }

  /* Mal girisi: satin alinan urunu dukkan ya da arac stoguna ekler.
     Fistaki adet urunun KENDI biriminde verilir (soda icin koli, birimIciAdet=24).
     Kalemde "alis" verilirse yeni koli maliyeti olarak yazilir (adetAlis de guncellenir);
     verilmezse fiyatlara dokunulmaz, sadece stok artar. */
  if (komut === "alim") {
    const ham = pos[1];
    if (!ham) throw new Error("Alim verisi gerekli: dosya yolu ya da JSON metni.");
    const girdi = JSON.parse(fs.existsSync(ham) ? fs.readFileSync(ham, "utf8") : ham);
    const hedef = girdi.hedef === "dukkan" ? "dukkan" : "arac";
    const alan = hedef === "arac" ? "aracStok" : "stok";
    const kalemler = (girdi.kalemler || []).map((k) => {
      const p = urunBul(store, k.urun);
      const adet = Number(k.adet) || 0;
      if (adet <= 0) throw new Error('"' + p.ad + '" icin adet gecersiz.');
      const yeniAlis = (k.alis != null && k.alis !== "") ? kurus(k.alis) : null;
      return { p: p, adet: adet, yeniAlis: yeniAlis, eski: Number(p[alan]) || 0 };
    });
    if (!kalemler.length) throw new Error("Alimda kalem yok.");
    const L = [];
    L.push("Mal girisi -> " + (hedef === "arac" ? "ARAC" : "DUKKAN") + " stogu" + (girdi.not ? "  ·  " + girdi.not : ""), "");
    let tutar = 0;
    kalemler.forEach((k) => {
      const ici = Number(k.p.birimIciAdet) || 0;
      const birim = k.p.birim || "Adet";
      const maliyet = k.yeniAlis != null ? k.yeniAlis : (Number(k.p.alis) || 0);
      tutar += maliyet * k.adet;
      L.push("  " + String(k.adet).padStart(5) + " " + birim + " x " + String(k.p.ad).padEnd(32) +
        (ici ? " (" + k.adet * ici + " adet)" : "") +
        "  stok " + k.eski + " -> " + (k.eski + k.adet) +
        (k.yeniAlis != null ? "  ·  alis " + money(Number(k.p.alis) || 0) + " -> " + money(k.yeniAlis) : ""));
    });
    L.push("", "Toplam maliyet: " + money(tutar));
    console.log(L.join("\n"));
    if (!kaydet) { provaUyari("alim <dosya.json>"); return; }
    kalemler.forEach((k) => {
      k.p[alan] = k.eski + k.adet;
      if (k.yeniAlis != null) {
        k.p.alis = k.yeniAlis;
        const ici = Number(k.p.birimIciAdet) || 0;
        if (ici) k.p.adetAlis = k.yeniAlis / ici;
      }
    });
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · " + kalemler.length + " kalem · buluta yazildi " + new Date(y.ts).toLocaleString("tr-TR") + " · yedek: " + path.basename(y.yedek));
    return;
  }

  if (komut === "tahsilat") {
    const c = musteriBul(store, pos[1]);
    const tutar = kurus(String(pos[2]).replace(",", "."));
    /* --duzeltme: bakiyeyi elle düzeltir (eksi tutar = borcu artırır). Notu "Bakiye düzeltme"
       ile başlar; haftalik/kasa raporları "düzeltme" notlu kayıtları toplanan paraya saymaz. */
    const duzeltme = args.indexOf("--duzeltme") >= 0;
    if (duzeltme ? !tutar || isNaN(tutar) : !(tutar > 0)) throw new Error("Tutar gecersiz.");
    const not = duzeltme ? "Bakiye düzeltme" + (pos.slice(3).length ? ": " + pos.slice(3).join(" ") : "")
                         : (pos.slice(3).join(" ") || "Saha tahsilat");
    /* --tarih=YYYY-AA-GG: geçmiş bir günde alınmış ödeme bugünün kasasına düşmesin
       (panelin "Ödeme Al" tarih alanıyla aynı: o günün öğlesi). */
    const tArg = args.find((a) => a.indexOf("--tarih=") === 0);
    const tarih = tArg ? new Date(tArg.slice(8) + "T12:00:00") : new Date();
    if (isNaN(tarih)) throw new Error("Tarih gecersiz: " + tArg + " (ornek --tarih=2026-09-24)");
    /* Tür: --tur=nakit|kart|havale (kısa: --kart, --havale). Verilmezse nottan çıkarılır ("havale attı" → havale),
       o da yoksa nakit. --duzeltme her zaman "duzeltme"dir (kasaya sayılmaz). */
    const turArg = (args.find((a) => a.indexOf("--tur=") === 0) || "").slice(6).toLocaleLowerCase("tr-TR");
    const turHam = turArg || (args.indexOf("--kart") >= 0 || args.indexOf("--pos") >= 0 ? "kart" : (args.indexOf("--havale") >= 0 ? "havale" : (args.indexOf("--nakit") >= 0 ? "nakit" : "")));
    const turEs = { nakit: "nakit", kart: "kart", pos: "kart", havale: "havale", eft: "havale" };
    if (turHam && !turEs[turHam]) throw new Error("Tur gecersiz: --tur=nakit | kart | havale");
    const odemeTuru = duzeltme ? "duzeltme" : (turEs[turHam] || tahsilatTuru({ not: pos.slice(3).join(" "), tutar: tutar }));
    const turNot = { nakit: "Nakit — kasaya girer", kart: "Kart — kasaya girmez, hesaba geçer", havale: "Havale — kasaya girmez, hesaba geçer", iade: "İade — para girişi değil", duzeltme: "Düzeltme — para girişi değil, kasaya sayılmaz" }[odemeTuru];
    const eski = customerBorc(store, c.id);
    console.log(c.ad + " — tahsilat " + money(tutar) + "\nTarih : " + tarih.toLocaleDateString("tr-TR") + "\nTür   : " + turNot + "\nBakiye: " + money(eski) + " -> " + money(kurus(eski - tutar)) + "\nNot: " + not);
    if (!kaydet) { provaUyari('tahsilat "' + c.ad + '" ' + tutar + (tArg ? " " + tArg : "") + (duzeltme ? " --duzeltme" : " --tur=" + odemeTuru)); return; }
    store.payments.push({ id: genId(store), musteriId: c.id, tutar: tutar, odemeTuru: odemeTuru, not: not, tarih: tarih.toISOString() });
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · yedek: " + path.basename(y.yedek));
    return;
  }

  if (komut === "gider" || komut === "gelir") {
    const tutar = kurus(String(pos[1]).replace(",", "."));
    if (!(tutar > 0)) throw new Error("Tutar gecersiz.");
    const aciklama = pos[2] || "";
    if (!aciklama) throw new Error("Aciklama gerekli.");
    /* Gider türü panelle AYNI adlarla yazılır (Yakıt, Yemek, Araç Bakım, Otopark / Köprü, Telefon…):
       kategori verilmezse açıklamadan tanınır ("mazot" → Yakıt), tanınmazsa "Genel". Kayıt hem
       "kategori" hem panelin okuduğu "tur" + "odeme" alanlarını taşır — iki biçim tek biçim olur. */
    const giderTani = (m) => { const t = norm(m);
      if (/yak[ıi]t|benzin|mazot|motorin|lpg|akaryak/.test(t)) return "Yakıt";
      if (/yemek|ö[ğg]le|kahvalt|lokanta|çay paras|simit/.test(t)) return "Yemek";
      if (/bak[ıi]m|tamir|lastik|sanayi|ya[ğg] de[ğg]i|muayene|y[ıi]kama/.test(t)) return "Araç Bakım";
      if (/otopark|köprü|otoyol|hgs|ogs|geçi[şs]/.test(t)) return "Otopark / Köprü";
      if (/telefon|fatura|internet|kont[öo]r/.test(t)) return "Telefon";
      return ""; };
    const etiket = komut === "gider" ? (pos[3] ? (giderTani(pos[3]) || pos[3]) : (giderTani(aciklama) || "Genel")) : (pos[3] || "Diger");
    const oArg = (args.find((a) => a.indexOf("--odeme=") === 0) || "").slice(8).toLocaleLowerCase("tr-TR");
    const odemeAd = ({ "": "Nakit", nakit: "Nakit", kart: "POS", pos: "POS", havale: "Havale", eft: "Havale" })[args.indexOf("--kart") >= 0 ? "kart" : (args.indexOf("--havale") >= 0 ? "havale" : oArg)];
    if (!odemeAd) throw new Error("--odeme= nakit | kart | havale");
    console.log((komut === "gider" ? "Gider" : "Gelir") + ": " + money(tutar) + " · " + aciklama + " · " + etiket + (odemeAd !== "Nakit" ? " · " + odemeAd + " (kasadan çıkmaz)" : ""));
    if (!kaydet) { provaUyari(komut + " " + tutar + ' "' + aciklama + '"'); return; }
    const kayit = { id: genId(store), tutar: tutar, not: aciklama, odeme: odemeAd, tarih: new Date().toISOString() };
    if (komut === "gider") { kayit.kategori = etiket; kayit.tur = etiket; store.expenses.push(kayit); }
    else { kayit.tur = etiket; store.incomes.push(kayit); }
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · yedek: " + path.basename(y.yedek));
    return;
  }

  if (komut === "sil-satis") {
    const belge = pos[1];
    const s = store.sales.find((x) => x.belgeNo === belge);
    if (!s) throw new Error("Belge bulunamadi: " + belge);
    const cust = (store.customers.find((c) => c.id === s.musteriId) || {}).ad || "(perakende)";
    console.log("SILINECEK: " + s.belgeNo + " · " + cust + " · " + money(s.toplam) + " · " + new Date(s.tarih).toLocaleString("tr-TR"));
    s.items.forEach((it) => console.log("  " + it.adet + " x " + it.ad + " @ " + money(it.fiyat)));
    console.log("Stok geri yuklenecek, acik hesap borcu geri alinacak.");
    if (!kaydet) { provaUyari("sil-satis " + belge); return; }
    s.items.forEach((it) => {
      const p = store.products.find((x) => x.id === it.urunId); if (!p) return;
      if (s.stokKaynak === "arac") p.aracStok = (Number(p.aracStok) || 0) + it.adet;
      else p.stok = (Number(p.stok) || 0) + it.adet;
    });
    store.sales = store.sales.filter((x) => x.id !== s.id);
    store.payments = store.payments.filter((p) => String(p.not || "").indexOf("Belge " + belge) === -1);
    const y = await storeYaz(store, updatedAt);
    console.log("\nSILINDI · yedek: " + path.basename(y.yedek));
    return;
  }


  /* ---------- ekstre: musterinin tum hareketleri, bakiye seyriyle ---------- */
  if (komut === "ekstre") {
    const c = musteriBul(store, pos[1]);
    const h = [];
    store.sales.filter((x) => x.musteriId === c.id).forEach((x) =>
      h.push({ t: x.tarih, tip: "satis", belge: x.belgeNo, tutar: Number(x.toplam) || 0, acik: Number(x.odeme.acik) || 0,
               odenen: (Number(x.odeme.nakit) || 0) + (Number(x.odeme.pos) || 0), items: x.items }));
    store.payments.filter((x) => x.musteriId === c.id).forEach((x) =>
      h.push({ t: x.tarih, tip: "tahsilat", tutar: Number(x.tutar) || 0, not: x.not }));
    h.sort((a, b) => (a.t < b.t ? -1 : 1));
    let bak = Number(c.acilis) || 0;
    const L = [];
    L.push("# Ekstre — " + c.ad + (c.telefon ? "  ·  " + c.telefon : ""), "");
    L.push("| Tarih | İşlem | Belge | Tutar | Ödenen | Açık | Bakiye |");
    L.push("|---|---|---|---:|---:|---:|---:|");
    L.push("| — | açılış | | | | | " + money(bak) + " |");
    h.forEach((x) => {
      const g = new Date(x.t).toLocaleDateString("tr-TR");
      if (x.tip === "satis") {
        bak = kurus(bak + x.acik);
        L.push("| " + g + " | satış | " + x.belge + " | " + money(x.tutar) + " | " + money(x.odenen) + " | " + money(x.acik) + " | " + money(bak) + " |");
      } else {
        bak = kurus(bak - x.tutar);
        L.push("| " + g + " | **tahsilat** | | | " + money(x.tutar) + " | | " + money(bak) + " |" + (x.not ? "  <!-- " + x.not + " -->" : ""));
      }
    });
    L.push("", "**Güncel bakiye: " + money(bak) + "**");
    const tah = h.filter((x) => x.tip === "tahsilat");
    const son = tah[tah.length - 1];
    L.push("Satış " + h.filter((x) => x.tip === "satis").length + " · tahsilat " + tah.length +
      (son ? " · son ödeme " + new Date(son.t).toLocaleDateString("tr-TR") + " (" + money(son.tutar) + ")" : " · **hiç ödeme yok**"));
    console.log(L.join("\n"));
    return;
  }

  /* ---------- limit: müşterinin borç limiti ve vadesi ----------
     limit                                   limiti/vadesi yazılı müşteriler + genel vade
     limit <musteri> <tutar|sil> [--vade=gun|sil]
     limit --genel-vade=30                   vadesi yazılmamış müşterilerde sayılacak gün */
  if (komut === "limit") {
    const gvArg = args.find((a) => a.indexOf("--genel-vade=") === 0);
    const vArg = args.find((a) => a.indexOf("--vade=") === 0);
    if (gvArg) {
      const g = Math.round(Number(gvArg.slice(13)));
      if (!(g > 0 && g < 366)) throw new Error("Genel vade 1-365 gun olmali.");
      console.log("Genel vade (vadesi yazılmamış müşterilerde): " + genelVade(store) + " gün -> " + g + " gün");
      if (!kaydet) { provaUyari("limit " + gvArg); return; }
      store.settings = store.settings || {}; store.settings.varsayilanVade = g;
      const y = await storeYaz(store, updatedAt);
      console.log("\nKAYDEDILDI · yedek: " + path.basename(y.yedek));
      return;
    }
    if (!pos[1]) {
      const L = ["# Borç limiti ve vade", "", "Genel vade (vadesi yazılmamış müşteride): **" + genelVade(store) + " gün**", "", "| Müşteri | Bakiye | Limit | Kalan limit | Vade | Gecikme |", "|---|---:|---:|---:|---:|---|"];
      store.customers.map((c) => ({ c: c, b: customerBorc(store, c.id), lim: musteriLimit(c), y: borcYas(store, c.id) }))
        .filter((x) => x.lim || Number(x.c.vade) > 0 || x.y.gecikmis).sort((a, b) => b.b - a.b)
        .forEach((x) => L.push("| " + x.c.ad + " | " + money(x.b) + " | " + (x.lim ? money(x.lim) : "—") + " | " + (x.lim ? (x.b > x.lim + 0.005 ? "⛔ " + money(kurus(x.b - x.lim)) + " aşıldı" : money(kurus(x.lim - x.b))) : "—") + " | " + x.y.vade + (x.y.vadeOzel ? "" : " (genel)") + " | " + (x.y.gecikmis ? "⏰ " + money(x.y.gecikmisTutar) + " · " + x.y.gecikmeGun + " gün" : "—") + " |"));
      if (L.length === 6) L.push("| _limit ya da vade yazılı müşteri yok, vadesi geçen de yok_ | | | | | |");
      console.log(L.join("\n"));
      return;
    }
    const c = musteriBul(store, pos[1]);
    if (pos[2] == null && !vArg) throw new Error('Kullanim: limit "<musteri>" <tutar|sil> [--vade=gun|sil]');
    const limSil = pos[2] != null && String(pos[2]).toLocaleLowerCase("tr") === "sil";
    const yeniLim = pos[2] == null ? null : (limSil ? 0 : kurus(String(pos[2]).replace(",", ".")));
    if (yeniLim != null && !limSil && !(yeniLim > 0)) throw new Error("Limit gecersiz (kaldirmak icin: sil).");
    const vSil = vArg && vArg.slice(7).toLocaleLowerCase("tr") === "sil";
    const yeniVade = vArg ? (vSil ? "" : Math.round(Number(vArg.slice(7)))) : null;
    if (vArg && !vSil && !(yeniVade > 0 && yeniVade < 366)) throw new Error("Vade 1-365 gun olmali (kaldirmak icin: --vade=sil).");
    const b = customerBorc(store, c.id);
    console.log(c.ad + " · bakiye " + money(b));
    if (yeniLim != null) console.log("  Limit: " + (musteriLimit(c) ? money(musteriLimit(c)) : "(yok)") + "  ->  " + (yeniLim ? money(yeniLim) + (b > yeniLim + 0.005 ? "   ⛔ şimdiki borcu bu limitin " + money(kurus(b - yeniLim)) + " üstünde" : "") : "(yok)"));
    if (yeniVade != null) console.log("  Vade : " + (Number(c.vade) > 0 ? c.vade + " gün" : "(yok — genel " + genelVade(store) + " gün)") + "  ->  " + (yeniVade ? yeniVade + " gün" : "(yok — genel " + genelVade(store) + " gün)"));
    if (!kaydet) { provaUyari('limit "' + c.ad + '"' + (pos[2] != null ? " " + pos[2] : "") + (vArg ? " " + vArg : "")); return; }
    if (yeniLim != null) c.limit = yeniLim;
    if (yeniVade != null) c.vade = yeniVade;
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- sabit-gider: her ay aynı gelen giderler (telefon, sigorta…) ----------
     sabit-gider                      liste
     sabit-gider ekle <ad> <tutar>    bu aydan itibaren her ayın net kârından düşülür
     sabit-gider sil <ad> */
  if (komut === "sabit-gider") {
    store.sabitGiderler = store.sabitGiderler || [];
    const is = (pos[1] || "").toLocaleLowerCase("tr");
    if (!is) {
      if (!store.sabitGiderler.length) { console.log('Sabit gider yok. Eklemek icin: sabit-gider ekle "Telefon" 450'); return; }
      store.sabitGiderler.forEach((g) => console.log(g.ad + " · " + money(g.tutar) + " / ay" + (g.baslangic ? " · " + g.baslangic + "'den beri" : "")));
      console.log("Toplam: " + money(sabitGiderAylik(store, todayStr().slice(0, 7))) + " / ay");
      return;
    }
    if (is === "ekle") {
      const ad = (pos[2] || "").trim(), tutar = kurus(String(pos[3] || "").replace(",", "."));
      if (!ad || !(tutar > 0)) throw new Error('Kullanim: sabit-gider ekle "<ad>" <tutar>');
      if (store.sabitGiderler.find((g) => norm(g.ad) === norm(ad))) throw new Error("Bu adla sabit gider zaten var: " + ad + " (once sil).");
      const bas = todayStr().slice(0, 7);
      console.log("Sabit gider: " + ad + " · " + money(tutar) + " / ay · " + bas + " ayından itibaren net kârdan düşülür.\nDikkat: bu gideri ayrıca `gider` ile girme, iki kez düşülür.");
      if (!kaydet) { provaUyari('sabit-gider ekle "' + ad + '" ' + tutar); return; }
      store.sabitGiderler.push({ id: genId(store), ad: ad, tutar: tutar, baslangic: bas });
    } else if (is === "sil") {
      const g = tekEslesme(store.sabitGiderler, pos[2], "ad", "Sabit gider");
      console.log("SILINECEK: " + g.ad + " · " + money(g.tutar) + " / ay");
      if (!kaydet) { provaUyari('sabit-gider sil "' + g.ad + '"'); return; }
      store.sabitGiderler = store.sabitGiderler.filter((x) => x.id !== g.id);
    } else throw new Error("Kullanim: sabit-gider [ekle <ad> <tutar> | sil <ad>]");
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- tahsilat-listesi: kim borclu, en son ne zaman odedi ---------- */
  if (komut === "tahsilat-listesi" || komut === "alacak") {
    const simdi = new Date();
    const d60 = new Date(simdi - 60 * 86400000);
    const satir = store.customers.map((c) => {
      const b = customerBorc(store, c.id);
      const tah = store.payments.filter((p) => p.musteriId === c.id).sort((a, x) => (a.tarih < x.tarih ? -1 : 1));
      const son = tah[tah.length - 1];
      const gun = son ? Math.round((simdi - new Date(son.tarih)) / 86400000) : null;
      const s60 = store.sales.filter((s) => s.musteriId === c.id && new Date(s.tarih) >= d60);
      const acik60 = s60.reduce((a, s) => a + (Number(s.odeme.acik) || 0), 0);
      const tah60 = tah.filter((p) => new Date(p.tarih) >= d60).reduce((a, p) => a + (Number(p.tutar) || 0), 0);
      const kar60 = s60.reduce((a, s) => a + (Number(s.toplam) || 0) - satisMaliyet(store, s), 0); // fişin kayıtlı maliyeti
      return { ad: c.ad, b: b, son: son, gun: gun, net: kurus(tah60 - acik60), kar60: kurus(kar60), y: borcYas(store, c.id), lim: musteriLimit(c) };
    }).filter((x) => x.b > 0.5).sort((a, b) => b.b - a.b);
    const L = [];
    L.push("# Tahsilat listesi — " + new Date().toLocaleDateString("tr-TR"), "");
    L.push("| ! | Müşteri | Bakiye | Son ödeme | Kaç gün | 60g net | 60g kâr | Gecikme |");
    L.push("|---|---|---:|---|---:|---:|---:|---|");
    satir.forEach((x) => {
      const risk = !x.son ? "🔴" : (x.gun > 30 ? "🔴" : (x.net < 0 ? "🟡" : "🟢"));
      L.push("| " + risk + " | " + x.ad + " | **" + money(x.b) + "** | " +
        (x.son ? money(x.son.tutar) + " · " + new Date(x.son.tarih).toLocaleDateString("tr-TR") : "**hiç yok**") + " | " +
        (x.gun == null ? "—" : x.gun) + " | " + money(x.net) + " | " + money(x.kar60) + " | " +
        ((x.y && x.y.gecikmis ? "⏰ " + money(x.y.gecikmisTutar) + " · " + x.y.gecikmeGun + " gün" : "—") + (x.lim && x.b > x.lim + 0.005 ? " · ⛔ limit " + money(x.lim) : "")) + " |");
    });
    L.push("", "**TOPLAM ALACAK: " + money(satir.reduce((a, x) => a + x.b, 0)) + "** · " + satir.length + " borçlu müşteri");
    const gecT = satir.filter((x) => x.y && x.y.gecikmis);
    L.push("**VADESİ GEÇMİŞ: " + money(kurus(gecT.reduce((a, x) => a + x.y.gecikmisTutar, 0))) + "** · " + gecT.length + " müşteri");
    L.push("", "🔴 hiç ödeme yok ya da 30 günden eski · 🟡 aldığından az ödüyor (borç büyüyor) · 🟢 düzenli");
    L.push("_60g net = son 60 günde ödediği − yeni açtığı borç. Eksi ise borcu büyüyor._");
    L.push("_Gecikme = vadesini geçen borç ve kaç gündür geçtiği (ödemeler en eski borcu kapatır; vadesi yazılmamış müşteride " + genelVade(store) + " gün). ⛔ = borç limitini aşmış._");
    console.log(L.join("\n"));
    return;
  }

  /* ---------- kalem-ekle: var olan fise kalem ekle (fark acik hesaba yazilir) ---------- */
  if (komut === "kalem-ekle") {
    const s = store.sales.find((x) => x.belgeNo === pos[1]);
    if (!s) throw new Error("Belge bulunamadi: " + pos[1]);
    const p = urunBul(store, pos[2]);
    const adet = Number(pos[3]) || 0;
    if (adet <= 0) throw new Error("Adet gecersiz.");
    const c = store.customers.find((x) => x.id === s.musteriId);
    /* Fişte aynı aileden kalem varsa onun fiyatı, yoksa müşterinin aile özel fiyatı. */
    const aileIds = aile(store, p).map((x) => x.id);
    const fisteki = s.items.find((it) => aileIds.includes(it.urunId));
    const ozel = fisteki ? Number(fisteki.fiyat) : aileOzelFiyat(store, c, p);
    const fiyat = pos[4] != null ? Number(String(pos[4]).replace(",", ".")) : (ozel != null ? ozel : Number(p.satis) || 0);
    const ekTutar = kurus(adet * fiyat), ekMaliyet = kurus(adet * (Number(p.alis) || 0));
    console.log("Belge " + s.belgeNo + " · " + (c ? c.ad : "(perakende)") + " · " + new Date(s.tarih).toLocaleString("tr-TR"));
    s.items.forEach((it) => console.log("   " + it.adet + " x " + it.ad + " @ " + money(it.fiyat)));
    console.log("  + EKLENECEK: " + adet + " x " + p.ad + " @ " + money(fiyat) + (ozel != null && fiyat === ozel ? " (özel fiyat)" : "") + " = " + money(ekTutar));
    /* --odeme=nakit|pos: eklenen kalemin parası o an alındıysa açık hesaba değil oraya yazılır
       (varsayılan açık hesap). Saf pos satışta %2 komisyon yeni toplamdan yeniden hesaplanır. */
    const oArg = args.find((a) => a.indexOf("--odeme=") === 0);
    const odemeAlan = oArg ? ({ nakit: "nakit", pos: "pos", kart: "pos", acik: "acik" })[oArg.slice(8)] : "acik";
    if (!odemeAlan) throw new Error("--odeme= nakit | pos | acik");
    const yeniToplam = kurus(s.toplam + ekTutar);
    const posSaf = odemeAlan === "pos" && !(Number(s.odeme.nakit) || 0) && !(Number(s.odeme.acik) || 0);
    const yeniKomisyon = (posSaf && !s.odemeAdi) ? Math.round(yeniToplam * 0.02 * 100) / 100 : (Number(s.komisyon) || 0);
    const etiket = { nakit: "Nakit ", pos: "Kart  ", acik: "Açık  " }[odemeAlan];
    console.log("  Toplam : " + money(s.toplam) + " -> " + money(yeniToplam));
    console.log("  " + etiket + ": " + money(s.odeme[odemeAlan]) + " -> " + money(kurus((Number(s.odeme[odemeAlan]) || 0) + ekTutar)));
    if (yeniKomisyon !== (Number(s.komisyon) || 0)) console.log("  Pos komisyonu: " + money(s.komisyon) + " -> " + money(yeniKomisyon));
    if (c) { const eski = customerBorc(store, c.id); console.log("  Bakiye : " + money(eski) + " -> " + money(kurus(eski + (odemeAlan === "acik" ? ekTutar : 0)))); }
    if (!kaydet) { provaUyari("kalem-ekle " + s.belgeNo + ' "' + p.ad + '" ' + adet + (oArg ? " " + oArg : "")); return; }
    s.items.push({ urunId: p.id, ad: p.ad, barkod: p.barkod || "", kdv: Number(p.kdv) || 0, fiyat: fiyat, adet: adet, iskyuzde: 0, alis: Number(p.alis) || 0 }); // alis: ekleme anındaki birim maliyet
    s.brut = kurus((Number(s.brut) || 0) + ekTutar);
    s.toplam = kurus((Number(s.toplam) || 0) + ekTutar);
    s.maliyet = kurus((Number(s.maliyet) || 0) + ekMaliyet);
    s.odeme[odemeAlan] = kurus((Number(s.odeme[odemeAlan]) || 0) + ekTutar);
    s.komisyon = yeniKomisyon;
    const pr = store.products.find((x) => x.id === p.id);
    if (s.stokKaynak === "arac") pr.aracStok = (Number(pr.aracStok) || 0) - adet;
    else pr.stok = (Number(pr.stok) || 0) - adet;
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- iade: müşteriden mal geri alındı ----------
     Eksi adetli bir "iade fişi" olarak yazılır: tutar müşterinin borcundan düşer (açık hesap eksi),
     ciro ve maliyet o gün eksiye gider (kâr ve babaya ödenecek maliyet doğru kalsın), mal araca/dükkana
     geri girer. Tahsilat olarak YAZILMAZ — ortada para girişi yok, haftalık cep tablosunu şişirmesin.
     Panelin "İade" listesinde de görünsün diye store.iadeler'e de kayıt düşer. */
  if (komut === "iade") {
    const c = musteriBul(store, pos[1]);
    const p = urunBul(store, pos[2]);
    const adet = Number(pos[3]) || 0;
    if (adet <= 0) throw new Error('Adet gecersiz: iade "<musteri>" "<urun>" <adet> [fiyat]');
    // Fiyat verilmezse müşteriye bu ürünün en son satıldığı fiyat (iade, ödediği fiyattan düşülür).
    let fiyat = pos[4] != null ? kurus(String(pos[4]).replace(",", ".")) : null;
    if (fiyat == null) {
      const son = store.sales.filter((x) => x.musteriId === c.id).sort((a, b) => b.tarih.localeCompare(a.tarih))
        .map((x) => x.items.find((it) => it.urunId === p.id && it.adet > 0)).find(Boolean);
      fiyat = son ? Number(son.fiyat) : Number(p.satis) || 0;
    }
    const tutar = kurus(adet * fiyat), maliyet = kurus(adet * (Number(p.alis) || 0));
    const kaynak = args.includes("--dukkan") ? "dukkan" : "arac";
    const eski = customerBorc(store, c.id);
    const q = (n) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
    console.log("### ↩ İADE — " + c.ad + "\n**" + new Date().toLocaleDateString("tr-TR") + "** · " + (kaynak === "arac" ? "araca" : "dükkana") + " geri\n");
    console.log("| Adet | Ürün | Fiyat | Tutar |\n|---:|---|---:|---:|");
    console.log("| −" + adet + " | " + p.ad + " | " + q(fiyat) + " | −" + q(tutar) + " |");
    console.log("| | | **İADE TOPLAM** | **−" + q(tutar) + " ₺** |\n");
    console.log("| | |\n|---|---:|");
    console.log("| **Bakiye** | " + q(eski) + " → **" + q(kurus(eski - tutar)) + " ₺** |");
    console.log("| Bugünün cirosundan düşer | −" + q(tutar) + " ₺ |");
    console.log("| Bugünün maliyetinden düşer (mal geri geldi) | −" + q(maliyet) + " ₺ |");
    console.log("| Kârdan düşer | −" + q(tutar - maliyet) + " ₺ |\n");
    if (!kaydet) { console.log("**KAYDEDİLMEDİ** — onayını bekliyorum"); provaUyari('iade "' + c.ad + '" "' + p.ad + '" ' + adet + " " + fiyat); return; }
    const now = new Date();
    store.counters.sale = (store.counters.sale || 0) + 1;
    const belgeNo = now.getFullYear() + "-" + String(store.counters.sale).padStart(6, "0");
    store.sales.push({
      id: genId(store), belgeNo: belgeNo, musteriId: c.id, personelId: null, not: "İADE — " + adet + " x " + p.ad, odemeAdi: "İade",
      items: [{ urunId: p.id, ad: p.ad, barkod: p.barkod || "", kdv: Number(p.kdv) || 0, fiyat: fiyat, adet: -adet, iskyuzde: 0 }],
      brut: -tutar, iskonto: 0, toplam: -tutar, maliyet: -maliyet, komisyon: 0,
      odeme: { nakit: 0, pos: 0, acik: -tutar }, tarih: now.toISOString(), servisGun: localDateStr(now), hafta: haftaNo(now), stokKaynak: kaynak,
    });
    const pr = store.products.find((x) => x.id === p.id);
    if (kaynak === "arac") pr.aracStok = (Number(pr.aracStok) || 0) + adet; else pr.stok = (Number(pr.stok) || 0) + adet;
    store.iadeler = store.iadeler || [];
    store.iadeler.push({ id: genId(store), urunId: p.id, ad: p.ad, adet: adet, tutar: tutar, musteriId: c.id, tarih: now.toISOString() });
    const y = await storeYaz(store, updatedAt);
    console.log("**KAYDEDİLDİ** — İade belgesi " + belgeNo + " · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- urun-ekle: listede olmayan ürünü aç (panelin ürün kartı alanlarıyla) ---------- */
  if (komut === "urun-ekle") {
    const ad = (pos[1] || "").trim();
    const alis = kurus(String(pos[2] || "").replace(",", ".")), satis = kurus(String(pos[3] || "").replace(",", "."));
    if (!ad || !(alis >= 0) || !(satis > 0)) throw new Error('Kullanim: urun-ekle "<ad>" <alis> <satis> [grup]');
    const grup = (pos[4] || "").trim() || "Diğer";
    const benzer = store.products.filter((p) => norm(p.ad).includes(norm(ad)) || norm(ad).includes(norm(p.ad)));
    if (benzer.find((p) => norm(p.ad) === norm(ad))) throw new Error("Bu adla urun zaten var: " + ad);
    if (benzer.length) console.log("Dikkat, benzer isimli ürün var: " + benzer.map((p) => p.ad + " (" + money(p.satis) + ")").join(" · "));
    console.log("Yeni ürün: " + ad + " · alış " + money(alis) + " · satış " + money(satis) + " · grup " + grup);
    if (!kaydet) { provaUyari('urun-ekle "' + ad + '" ' + alis + " " + satis + ' "' + grup + '"'); return; }
    store.products.push({ id: genId(store), ad: ad, kdv: "0", not: "", alis: String(alis), adetAlis: alis, satis: String(satis), adetSatis: satis,
      grup: grup, stok: 0, aracStok: 0, birim: "Adet", birimIciAdet: 1, barkod: "", kritik: "", gorunur: true, altKategori: "" });
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- urun-fiyat: ürün kartındaki alış/satış fiyatını değiştir ----------
     Sadece bundan sonraki fişleri etkiler; geçmiş fişlerin maliyeti satış anında yazılmıştır.
     Panel fiyatı iki alanda tutuyor (alis/adetAlis, satis/adetSatis) — ikisi birlikte güncellenir. */
  if (komut === "urun-fiyat") {
    const p = urunBul(store, pos[1]);
    const tur = String(pos[2] || "").toLocaleLowerCase("tr");
    if (tur !== "alis" && tur !== "alış" && tur !== "satis" && tur !== "satış") throw new Error('Tür: alis | satis — ornek: urun-fiyat "Kardelen Filiz" alis 1400');
    const alan = tur.startsWith("a") ? "alis" : "satis";
    const yeni = kurus(String(pos[3]).replace(",", "."));
    if (!(yeni >= 0) || pos[3] == null) throw new Error("Fiyat gecersiz.");
    console.log(p.ad + "\n  " + alan + ": " + money(p[alan]) + "  ->  " + money(yeni) +
      "\n  (alış " + money(alan === "alis" ? yeni : p.alis) + " · satış " + money(alan === "satis" ? yeni : p.satis) + " · birim kâr " + money((alan === "satis" ? yeni : Number(p.satis)) - (alan === "alis" ? yeni : Number(p.alis))) + ")");
    if (!kaydet) { provaUyari('urun-fiyat "' + p.ad + '" ' + alan + " " + yeni); return; }
    const pr = store.products.find((x) => x.id === p.id);
    pr[alan] = String(yeni);
    pr[alan === "alis" ? "adetAlis" : "adetSatis"] = yeni;
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- musteri-ekle: yeni müşteri kartı (panelin "Yeni Müşteri" alanlarıyla) ---------- */
  if (komut === "musteri-ekle") {
    const ad = (pos[1] || "").trim();
    if (!ad) throw new Error('Ad gerekli: musteri-ekle "Onur Gül" [telefon]');
    const telefon = (pos[2] || "").trim();
    const benzer = store.customers.filter((c) => norm(c.ad).includes(norm(ad)) || norm(ad).includes(norm(c.ad)));
    if (benzer.length) console.log("Dikkat, benzer isimli müşteri var: " + benzer.map((c) => c.ad).join(" · "));
    console.log("Yeni müşteri: " + ad + (telefon ? " · " + telefon : " · telefon yok"));
    if (!kaydet) { provaUyari('musteri-ekle "' + ad + '"' + (telefon ? " " + telefon : "")); return; }
    store.customers.push({ id: genId(store), ad: ad, telefon: telefon, acilis: 0, adres: "", vergiNo: "" });
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- ozel-fiyat: musterinin urun fiyatini ayarla ---------- */
  if (komut === "ozel-fiyat") {
    const c = musteriBul(store, pos[1]);
    const p = urunBul(store, pos[2]);
    c.ozelFiyatlar = c.ozelFiyatlar || {};
    if (pos[3] == null) throw new Error('Fiyat gerekli. Silmek icin: ozel-fiyat "' + c.ad + '" "' + p.ad + '" sil');
    const sil = String(pos[3]).toLocaleLowerCase("tr") === "sil";
    const fiyat = sil ? null : kurus(String(pos[3]).replace(",", "."));
    // Aile kuralı: fiyat ailenin bütün çeşitlerine birden yazılır (--tek ile sadece bu ürün).
    const hedef = args.includes("--tek") ? [p] : aile(store, p);
    console.log(c.ad + (hedef.length > 1 ? " · " + (p.altKategori || "").trim() + " ailesi (" + hedef.length + " çeşit)" : ""));
    hedef.forEach((x) => { const e = ozelOku(c, x.id); console.log("  " + x.ad.padEnd(34) + (e != null ? money(e) : "(yok)").padStart(14) + "  ->  " + (sil ? "(silinecek)" : money(fiyat))); });
    console.log("  liste fiyatı: " + money(p.satis) + " · alış " + money(p.alis));
    if (!kaydet) { provaUyari('ozel-fiyat "' + c.ad + '" "' + p.ad + '" ' + (sil ? "sil" : fiyat)); return; }
    hedef.forEach((x) => { if (sil) delete c.ozelFiyatlar[x.id]; else c.ozelFiyatlar[x.id] = fiyat; });
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- haftalik: cebe giren para, hafta hafta ----------
     Kullanıcının istediği şablon: hafta (Pzt–Paz) · toplanan · babaya · cepte kalan.
     Toplanan = fişlerde peşin alınan (nakit + kart/havale) + eski borçlardan tahsilat.
     Babaya  = o hafta satılan malın maliyeti (babaya her gün o günün maliyeti ödeniyor).
     Masraf  = gider + POS komisyonu − gelir.  Cepte = toplanan − babaya − masraf.
     "Bakiye düzeltmesi" notlu tahsilatlar para girişi değil, geçmişe dönük kayıt — sayılmaz. */
  if (komut === "haftalik") {
    /* haftalik [YYYY-AA]: ay verilirse sadece o aya düşen kayıtlar sayılır; ayı taşan
       haftalar ay sınırında kesilir (31.08–06.09 haftası → 01.09–06.09). */
    const ay = /^\d{4}-\d{2}$/.test(pos[1] || "") ? pos[1] : null;
    const ayda = (iso) => !ay || localDateStr(new Date(iso)).slice(0, 7) === ay;
    /* --servis: hafta yerine servis günü servis günü (satış olmayan günler — sadece havale/gider — ayrı satır). */
    const gunluk = args.includes("--servis");
    const pzt = (iso) => { const d = new Date(iso); d.setHours(0, 0, 0, 0); if (!gunluk) d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localDateStr(d); };
    const hf = {};
    const h = (iso) => { const k = pzt(iso); return (hf[k] = hf[k] || { top: 0, baba: 0, masraf: 0, gun: new Set() }); };
    store.sales.forEach((x) => {
      if (!ayda(x.tarih)) return;
      const w = h(x.tarih);
      w.top += (Number(x.odeme.nakit) || 0) + (Number(x.odeme.pos) || 0);
      w.baba += Number(x.maliyet) || 0;
      w.masraf += Number(x.komisyon) || 0;
      w.gun.add(x.servisGun || String(x.tarih).slice(0, 10));
      w.fis = (w.fis || 0) + 1;
    });
    store.payments.forEach((p) => {
      const tt = tahsilatTuru(p);
      if (!(Number(p.tutar) > 0) || tt === "duzeltme" || tt === "iade" || !ayda(p.tarih)) return;
      h(p.tarih).top += Number(p.tutar);
    });
    (store.expenses || []).forEach((e) => { if (ayda(e.tarih)) h(e.tarih).masraf += Number(e.tutar) || 0; });
    (store.incomes || []).forEach((e) => { if (ayda(e.tarih)) h(e.tarih).masraf -= Number(e.tutar) || 0; });
    const kisa = (ymd) => ymd.slice(8, 10) + "." + ymd.slice(5, 7);
    const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const GUNLER = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
    const L = [(gunluk ? "# Servis servis cep" : "# Haftalık cep") + (ay ? " — " + AYLAR[Number(ay.slice(5, 7)) - 1] + " " + ay.slice(0, 4) : ""), "", gunluk ? "| Gün | Fiş | Toplanan | Babaya | Masraf | **Cepte kalan** |" : "| Hafta | Servis | Toplanan | Babaya | Masraf | **Cepte kalan** |", "|---|---:|---:|---:|---:|---:|"];
    const T = { top: 0, baba: 0, masraf: 0 };
    Object.keys(hf).sort().forEach((k) => {
      const w = hf[k]; const bit = new Date(k + "T12:00:00"); bit.setDate(bit.getDate() + 6);
      let bas = k, son = localDateStr(bit);
      if (ay) { if (bas.slice(0, 7) < ay) bas = ay + "-01"; if (son.slice(0, 7) > ay) { const s2 = new Date(Number(ay.slice(0, 4)), Number(ay.slice(5, 7)), 0); son = localDateStr(s2); } }
      const cep = w.top - w.baba - w.masraf;
      T.top += w.top; T.baba += w.baba; T.masraf += w.masraf;
      const etiket = gunluk ? GUNLER[new Date(k + "T12:00:00").getDay()] + " " + kisa(k) + (w.fis ? "" : " _(servis yok)_") : kisa(bas) + " – " + kisa(son);
      L.push("| " + etiket + " | " + (gunluk ? (w.fis || "–") : w.gun.size) + " | " + money(w.top) + " | " + money(w.baba) + " | " + money(w.masraf) + " | **" + money(cep) + "** |");
    });
    L.push("| **TOPLAM** | | **" + money(T.top) + "** | **" + money(T.baba) + "** | **" + money(T.masraf) + "** | **" + money(T.top - T.baba - T.masraf) + "** |");
    L.push("", "_Toplanan = fişte peşin alınan + eski borçtan tahsilat (nakit, kart, havale hepsi). Babaya = satılan malın maliyeti. Masraf = gider + POS komisyonu. Cepte = toplanan − babaya − masraf._");
    console.log(L.join("\n"));
    return;
  }

  /* ---------- aylik: servis gunu / ciro / kar ozeti ---------- */
  if (komut === "aylik") {
    /* Ürün kârı fişin KAYITLI maliyetinden (s.maliyet) — alış fiyatı sonradan değişse de geçmiş ay değişmez.
       Net kâr = ürün kârı − işletme gideri − POS komisyonu + gelir − aylık sabit gider (kasaHesap ile aynı kural). */
    const aylar = {};
    store.sales.forEach((s) => {
      const g = s.servisGun || localDateStr(new Date(s.tarih));
      const a = localDateStr(new Date(s.tarih)).slice(0, 7);
      (aylar[a] = aylar[a] || new Set()).add(g);
    });
    const giderGun = new Set(store.expenses.filter((e) => !giderMalAlimiMi(e)).map((e) => localDateStr(new Date(e.tarih))));
    const satirlar = Object.keys(aylar).sort().map((a) => {
      const son = new Date(Number(a.slice(0, 4)), Number(a.slice(5, 7)), 0);
      const k = kasaHesap(store, a + "-01", localDateStr(son));
      const gunler = [...aylar[a]], gidersiz = gunler.filter((g) => !giderGun.has(g)).length;
      const sabit = sabitGiderAylik(store, a);
      return { a: a, k: k, gun: gunler.length, gidersiz: gidersiz, sabit: sabit, net: kurus(k.netKar - sabit) };
    });
    const komVar = satirlar.some((x) => x.k.komisyon), sabitVar = satirlar.some((x) => x.sabit), gelirVar = satirlar.some((x) => x.k.gelir);
    const L = [];
    L.push("# Aylık özet", "");
    L.push("| Ay | Servis günü | Satış | Ciro | Ürün kârı | Marj | Gider |" + (komVar ? " POS kom. |" : "") + (sabitVar ? " Sabit |" : "") + (gelirVar ? " Gelir |" : "") + " Net kâr | Gün başı |");
    L.push("|---|---:|---:|---:|---:|---:|---:|" + (komVar ? "---:|" : "") + (sabitVar ? "---:|" : "") + (gelirVar ? "---:|" : "") + "---:|---:|");
    const uyari = [];
    satirlar.forEach((x) => {
      const k = x.k;
      /* Gider şüphesi: hiç yok, ya da servis günlerinin yarısından fazlasında tek gider bile yazılmamış. */
      const suphe = k.giderAdet === 0 ? "hiç gider yazılmamış" : (x.gidersiz * 2 > x.gun ? x.gun + " servis gününün " + x.gidersiz + "'inde gider yok" : "");
      if (suphe) uyari.push("⚠ " + x.a + ": " + suphe + " — net kâr olduğundan iyi görünüyor olabilir.");
      L.push("| " + x.a + " | " + x.gun + " | " + k.satisAdet + " | " + money(k.ciro) + " | " + money(k.urunKar) + " | " +
        karOrani(k.ciro, k.maliyet) + " | " + money(k.giderIsletme) + (suphe ? " ⚠" : "") + " | " +
        (komVar ? money(k.komisyon) + " | " : "") + (sabitVar ? money(x.sabit) + " | " : "") + (gelirVar ? money(k.gelir) + " | " : "") +
        "**" + money(x.net) + "** | " + money(kurus(x.net / x.gun)) + " |");
    });
    const alacak = store.customers.reduce((a, c) => a + Math.max(0, customerBorc(store, c.id)), 0);
    L.push("", "**Sahadaki alacak: " + money(kurus(alacak)) + "**");
    if (uyari.length) L.push("", uyari.join("\n"));
    const sg = store.sabitGiderler || [];
    if (sg.length) L.push("", "_Aylık sabit giderler: " + sg.map((g) => g.ad + " " + money(g.tutar) + (g.baslangic ? " (" + g.baslangic + "'den beri)" : "")).join(" · ") + "_");
    L.push("", "_Ürün kârı fişlerin kayıtlı maliyetinden hesaplanır. Net kâr = ürün kârı − gider" + (komVar ? " − POS komisyonu" : "") + (sabitVar ? " − sabit gider" : "") + (gelirVar ? " + gelir" : "") + ". Araca alınan mal gider sayılmaz._");
    console.log(L.join("\n"));
    return;
  }

  console.log("Bilinmeyen komut: " + komut + "\nKomutlar: durum | rapor | musteri | musteritablo | kasa | aylik | ekstre | tahsilat-listesi |\n          urun | ozel-fiyat | satis | kalem-ekle | alim | tahsilat | gider | gelir | sil-satis | siparisler");
})().catch((e) => { console.error("\nHATA: " + e.message); process.exit(1); });
