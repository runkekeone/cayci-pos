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
   testler/para/kasa.mjs iki tarafın aynı gün için aynı rakamı verdiğini denetler. */
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

  /* Bekleyen çay ocağı siparişi varsa komut bittikten SONRA stderr'e tek satır uyarı düşer (stdout'a dokunmaz). */
  sipUyariKur();

  if (komut === "durum") {
    console.log("Bulut yedegi:", new Date(updatedAt).toLocaleString("tr-TR"));
    console.log("Satis " + store.sales.length + " · Musteri " + store.customers.length + " · Urun " + store.products.length + " · Tahsilat " + store.payments.length + " · Gider " + store.expenses.length);
    const son = store.sales[store.sales.length - 1];
    if (son) console.log("Son satis:", son.belgeNo, "·", new Date(son.tarih).toLocaleString("tr-TR"), "·", money(son.toplam));
    const eksiD = stkEksiler(store, "dukkan"), eksiA = stkEksiler(store, "arac");
    console.log("Stok: alis kaydi " + (store.purchases || []).length + " · eksi dukkan " + eksiD.length + " urun · eksi arac " + eksiA.length + " urun · azalan " + stkKritikler(store).length + " · bekleyen siparis " + stkSiparisBekleyen(store).length);
    if (eksiD.length || eksiA.length) console.log("  (eksi stok gercek degildir: sayim ile duzelt — 'eksi-stok' listeler)");
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

  /* Çay ocağından gelen siparişler: panele düşmüş olanlar + `siparisler` tablosunda bekleyip panele henüz
     düşmemiş olanlar (panel kapalıyken gelenler). Bekleyenler kalem kalem, yaşıyla; kapananlar tek satır. */
  if (komut === "siparisler") {
    const t = await sipOku();
    const liste = t.liste;
    if (!liste.length) { console.log("Gelen siparis yok." + (t.hata ? "\n(siparis tablosu okunamadi: " + t.hata + ")" : "")); return; }
    const acik = liste.filter((x) => x.o.durum !== "teslim"), kapali = liste.filter((x) => x.o.durum === "teslim");
    const yeni = acik.filter((x) => x.o.durum === "yeni").length;
    const L = ["# Çay ocağı siparişleri — " + (acik.length ? acik.length + " açık" + (yeni ? " (" + yeni + " yeni, onay bekliyor)" : "") : "bekleyen yok"), ""];
    if (t.hata) L.push("> Sipariş tablosu okunamadı (" + t.hata + ") — yalnız panele düşmüş siparişler gösteriliyor.", "");
    acik.forEach((x) => {
      const o = x.o, saat = stkSiparisYasSaat(o);
      L.push("### [" + stkSiparisKod(o) + "] " + o.dealer + (o.dealerTel ? " · " + o.dealerTel : "") + " — " + sipDurumAd(o) + " · " + stkYasMetin(saat) + (saat >= 24 && o.durum === "yeni" ? " ⚠" : ""));
      L.push("Sipariş: " + new Date(o.tarih).toLocaleString("tr-TR") + (x.yeniGelen ? " · panele henüz düşmemiş (tablodan okundu)" : "") + (!x.yeniGelen && x.tabloDurum && x.tabloDurum !== o.durum ? " · çay ocağı hâlâ \"" + x.tabloDurum + "\" görüyor (siparis-esitle)" : ""), "");
      L.push("| Adet | Ürün | Fiyat | Tutar |", "|---:|---|---:|---:|");
      (o.items || []).forEach((l) => L.push("| " + stkAdet(l.adet) + " " + (l.birim || "") + " | " + l.ad + (stkSiparisUrun(store, l.urunId, l.ad) ? "" : " ⚠ listede yok") + " | " + stkPara(l.fiyat) + " | " + stkPara(l.adet * l.fiyat) + " |"));
      if (o.iskonto) L.push("| | | Nakit indirimi | −" + stkPara(o.iskonto) + " |");
      L.push("| | | **TOPLAM** | **" + stkPara(o.toplam) + "** |", "");
      L.push("Ödeme seçimi: " + sipOdemeAd(o.odemeTuru) + (o.not ? " · Not: " + o.not : "") + (o.teslimTarih ? " · Teslim: " + o.teslimTarih + " " + (o.teslimSaat || "") : ""));
      const f = sipSonrakiFisler(o);
      if (f.length) L.push("ℹ Bu müşteriye siparişten sonra fiş kesilmiş: " + f.map((s) => s.belgeNo + " (" + new Date(s.tarih).toLocaleDateString("tr-TR") + ", " + stkPara(s.toplam) + ")").join(" · ") + " — sipariş bu fişle teslim edildiyse `siparis-kapat " + stkSiparisKod(o) + "`");
      L.push("");
    });
    if (acik.length) L.push("İşlemek için: `siparis-onayla <kod>` · `siparis-dagitim <kod> [gün] [saat]` · `siparis-teslim <kod> [--odeme=nakit|kart|bakiye]` (satış oluşturur) · `siparis-kapat <kod>` (satış zaten girildiyse)", "");
    if (kapali.length) {
      const hepsi = args.includes("--hepsi"), goster = hepsi ? kapali : kapali.slice(-5);
      L.push("## Kapananlar (" + kapali.length + (hepsi ? "" : ", son " + goster.length + " — tümü için --hepsi") + ")", "");
      goster.forEach((x) => { const o = x.o; L.push("- " + new Date(o.tarih).toLocaleString("tr-TR") + " | " + o.dealer + " | " + money(o.toplam) + " | durum: " + o.durum + (o.saleId ? " (satisa islendi)" : o.elleKapandi ? " (satış açılmadan kapatıldı: " + (o.kapanisNot || "") + ")" : "")); });
    }
    console.log(L.join("\n"));
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

  /* Mal girisi: satin alinan urunu dukkan ya da arac stoguna ekler VE alış kaydı (purchases) açar.
     Fistaki adet urunun KENDI biriminde verilir (soda icin koli, birimIciAdet=24).
     Kalemde "alis" verilirse yeni koli maliyeti olarak yazilir (adetAlis de guncellenir);
     verilmezse fiyatlara dokunulmaz, sadece stok artar.
     İsteğe bağlı alanlar: firma, faturaNo, tarih (YYYY-AA-GG), odeme (pesin|veresiye), odemeTuru (nakit|kart|havale),
     toplam (FİŞTEKİ tutar — ödenen değil), odenen (veresiyede peşin verilen kısım). Hiçbiri yoksa eski biçim:
     firmasız, peşin, nakit, toplam = kalemlerin toplamı. */
  if (komut === "alim") {
    const girdi = jsonGirdi(pos[1], "Alim");
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
    const yeniAlislar = {};
    kalemler.forEach((k) => {
      const ici = Number(k.p.birimIciAdet) || 0;
      const birim = k.p.birim || "Adet";
      const maliyet = k.yeniAlis != null ? k.yeniAlis : (Number(k.p.alis) || 0);
      tutar += maliyet * k.adet;
      if (k.yeniAlis != null && k.yeniAlis !== kurus(k.p.alis)) yeniAlislar[k.p.id] = k.yeniAlis;
      L.push("  " + String(k.adet).padStart(5) + " " + birim + " x " + String(k.p.ad).padEnd(32) +
        (ici ? " (" + k.adet * ici + " adet)" : "") +
        "  stok " + k.eski + " -> " + (k.eski + k.adet) +
        (k.yeniAlis != null ? "  ·  alis " + money(Number(k.p.alis) || 0) + " -> " + money(k.yeniAlis) : ""));
    });
    L.push("", "Toplam maliyet: " + money(tutar));

    /* --- alış kaydı --- */
    const kalemToplam = kurus(tutar);
    const fisToplam = (girdi.toplam != null && girdi.toplam !== "") ? kurus(sayi(girdi.toplam)) : kalemToplam;
    if (!(fisToplam >= 0) || isNaN(fisToplam)) throw new Error('"toplam" gecersiz.');
    const oHam = norm(girdi.odeme || ""), tHam = norm(girdi.odemeTuru || "");
    const turCoz = (x) => (/kart|pos/.test(x) ? "kart" : /havale|eft|iban/.test(x) ? "havale" : /nakit/.test(x) ? "nakit" : null);
    const odeme = /veresiye|acik|açık|vadeli|borc|borç/.test(oHam) ? "veresiye" : "pesin";
    if (oHam && odeme === "pesin" && !/pesin|peşin/.test(oHam) && !turCoz(oHam)) throw new Error('"odeme": "pesin" | "veresiye" olmali (odeme turu icin "odemeTuru": "nakit" | "kart" | "havale").');
    if (tHam && !turCoz(tHam)) throw new Error('"odemeTuru": "nakit" | "kart" | "havale" olmali.');
    const odemeTuru = turCoz(tHam) || turCoz(oHam) || "nakit";
    const odenen = (girdi.odenen != null && girdi.odenen !== "") ? kurus(sayi(girdi.odenen)) : null;
    if (odenen != null && (isNaN(odenen) || odenen < 0)) throw new Error('"odenen" gecersiz.');
    const firmaAd = String(girdi.firma || "").trim();
    let firma = null, firmaYeni = false;
    if (firmaAd) {
      const hepsi = store.firmalar || [];
      const tam = hepsi.filter((f) => norm(f.ad) === norm(firmaAd)), kismi = hepsi.filter((f) => norm(f.ad).includes(norm(firmaAd)));
      if (tam.length) firma = tam[0];
      else if (kismi.length === 1 && !girdi.firmaYeni) firma = kismi[0];
      else if (kismi.length > 1 && !girdi.firmaYeni) throw new Error('Firma tek degil, "' + firmaAd + '" birden cok eslesti:\n' + kismi.map((f) => "  - " + f.ad).join("\n") + '\nTam adini yaz; yeni firma acilacaksa JSON\'a "firmaYeni": true ekle.');
      else firmaYeni = true;
    }
    if (odeme === "veresiye" && !firmaAd) throw new Error('Veresiye alim icin "firma" sart (borc kime yazilacak?).');
    if (odenen != null && odenen > fisToplam + 0.001) throw new Error("Odenen (" + money(odenen) + ") fis toplamindan (" + money(fisToplam) + ") fazla olamaz.");
    let tarihIso = null;
    if (girdi.tarih) { const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(girdi.tarih) ? girdi.tarih + "T12:00:00" : girdi.tarih); if (isNaN(d)) throw new Error('"tarih" gecersiz (ornek 2026-10-09).'); tarihIso = d.toISOString(); }
    const faturaNo = String(girdi.faturaNo || girdi.no || "").trim();
    L.push("");
    L.push("FİŞ TOPLAMI : " + money(fisToplam) + "   <- alış kaydına bu tutar yazılır (ödenen değil, fişte yazan)");
    if (Math.abs(fisToplam - kalemToplam) > 0.005) L.push("  ! kalemlerin toplamı " + money(kalemToplam) + " · fark " + money(kurus(fisToplam - kalemToplam)) + " — KDV / iskonto olabilir; kalem fiyatlarını fişle karşılaştır");
    L.push("Firma       : " + (firmaAd ? (firma ? firma.ad : firmaAd + "  (YENİ FİRMA açılacak)") : "(firmasız)"));
    L.push("Fatura      : " + (faturaNo || "(no yok — otomatik verilecek)") + " · " + new Date(tarihIso || Date.now()).toLocaleDateString("tr-TR"));
    if (odeme === "pesin") {
      L.push("Ödeme       : PEŞİN · " + odemeTuru.toLocaleUpperCase("tr-TR") + (odemeTuru === "nakit" ? "  (nakit kasadan düşer)" : "") + (!oHam && !tHam ? "   [yazılmadı → varsayılan; farklıysa odeme / odemeTuru ekle]" : ""));
      if (odenen != null && Math.abs(odenen - fisToplam) > 0.005) L.push("  ! ödenen " + money(odenen) + " fişteki tutardan farklı — kayıt FİŞTEKİ tutarla yapılır. Kalanı borçsa \"odeme\": \"veresiye\" yaz.");
    } else {
      const pesinat = odenen || 0;
      L.push("Ödeme       : VERESİYE — firmaya borç " + money(kurus(fisToplam - pesinat)) + (pesinat ? "  (" + money(pesinat) + " " + odemeTuru + " peşin verildi)" : ""));
    }
    const esik = bayrak("esik") != null ? sayi(bayrak("esik")) : stkMarjEsik(store);
    const etki = stkMarjMetin(stkMarjEtki(store, yeniAlislar, esik), esik);
    if (etki.length) L.push("", ...etki);
    console.log(L.join("\n"));
    if (!kaydet) { provaUyari("alim <dosya.json>"); return; }
    if (firmaYeni) { firma = { id: genId(store), ad: firmaAd, telefon: "" }; store.firmalar = store.firmalar || []; store.firmalar.push(firma); }
    const sonuc = stkAlimKaydet(store, {
      hedef: hedef, odeme: odeme, odemeTuru: odemeTuru, firmaId: firma ? firma.id : null, no: faturaNo, tarih: tarihIso, not: girdi.not || "",
      toplam: fisToplam, odenen: odeme === "veresiye" ? (odenen || 0) : 0,
      items: kalemler.map((k) => ({ urunId: k.p.id, ad: k.p.ad, adet: k.adet, birimFiyat: k.yeniAlis != null ? k.yeniAlis : (Number(k.p.alis) || 0), fiyatYaz: k.yeniAlis != null })),
    }, stkA());
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · " + kalemler.length + " kalem · alış kaydı " + sonuc.kayit.no + " (" + money(sonuc.kayit.toplam) + ") · buluta yazildi " + new Date(y.ts).toLocaleString("tr-TR") + " · yedek: " + path.basename(y.yedek));
    return;
  }

  /* =====================================================================================
     STOK AJANI — yardımcılar ve yeni komutlar (stok düzeltme, fiyat bakımı, sipariş işleme)
     ===================================================================================== */
/* >>> STOK-ORTAK-BASLA
   Bu blok tools/babuco.cjs ile public/toptanci/app.js içinde HARFİ HARFİNE aynıdır; panel ile araç aynı
   hesabı yapsın diye. Birini değiştirince diğerine kopyala:  node testler/stok/ortak-blok.mjs --yaz
   (araçtaki hâli panele yazar; --yaz'sız çalıştırınca yalnız aynı mı diye bakar).
   Hepsi saf işlev: store'u ilk parametre (S) olarak alır, ekrana ve buluta dokunmaz. Sabit (const) YOK —
   araçta bu blok komut işlevinin içinde durur, sabitler ilk komutlardan önce hazır olmazdı.
   a = { id: () => yeni benzersiz id, tarih: ISO (boşsa şimdi) } */
function stkAyar() { return { marjEsik: 10, hizHafta: 6, hedefHafta: 2, kritikGun: 7 }; }
function stkN(v) { return Number(v) || 0; }
function stkKurus(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function stkUrun(S, id) { return (S.products || []).find((p) => p.id === id); }
function stkToplamStok(p) { return stkN(p.stok) + stkN(p.aracStok); }
function stkKritikVar(p) { return p.kritik !== "" && p.kritik != null && !isNaN(Number(p.kritik)); }
function stkMarjEsik(S) { const v = S.settings && S.settings.marjEsik; return (v !== "" && v != null && Number(v) >= 0) ? Number(v) : stkAyar().marjEsik; }
/* Kâr marjı (%): satıştan kaçı kâr. Satış fiyatı yoksa null. */
function stkMarj(satis, alis) { const s = stkN(satis); return s > 0 ? ((s - stkN(alis)) / s) * 100 : null; }
function stkYuzde(m) { return m == null ? "—" : "%" + (Math.round(m * 10) / 10).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function stkPara(n) { return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0) + " ₺"; }
function stkAdet(n) { return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(n) || 0); }
/* Fiyat ailesi = aynı altKategori + aynı liste fiyatı (bir müşteride ailenin tek fiyatı olur). */
function stkAile(S, p) {
  const alt = (p.altKategori || "").trim();
  if (!alt) return [p];
  return (S.products || []).filter((x) => (x.altKategori || "").trim() === alt && Number(x.satis) === Number(p.satis));
}
function stkOzel(c, id) { const oz = (c && c.ozelFiyatlar) || {}; return (oz[id] != null && oz[id] !== "") ? Number(oz[id]) : null; }

/* ---- satış hızı, kritik seviye, alınacaklar ---- */
/* urunId → son `hafta` haftanın haftalık ortalama satışı (iadeler eksi adetle düşer). */
function stkSatisHizi(S, hafta, simdi) {
  hafta = hafta > 0 ? hafta : stkAyar().hizHafta;
  const bas = new Date((simdi ? new Date(simdi) : new Date()).getTime() - hafta * 7 * 86400000).toISOString();
  const hiz = {};
  (S.sales || []).forEach((s) => { if (!s.tarih || s.tarih < bas) return; (s.items || []).forEach((it) => { if (it.urunId) hiz[it.urunId] = (hiz[it.urunId] || 0) + stkN(it.adet); }); });
  Object.keys(hiz).forEach((k) => { hiz[k] = Math.max(0, hiz[k]) / hafta; });
  return hiz;
}
/* Kritik seviye önerisi: `gun` günlük satış kadar mal kalınca uyar (varsayılan 1 hafta). Yalnız değişecekler döner. */
function stkKritikOneri(S, a) {
  a = a || {};
  const hiz = stkSatisHizi(S, a.hafta, a.simdi), gun = a.gun > 0 ? a.gun : stkAyar().kritikGun;
  return (S.products || []).filter((p) => p.gorunur !== false).map((p) => {
    const h = hiz[p.id] || 0;
    return { p: p, haftalik: h, oneri: h > 0 ? Math.max(1, Math.ceil(h * gun / 7 - 1e-9)) : 0, eski: stkKritikVar(p) ? Number(p.kritik) : null };
  }).filter((x) => x.oneri > 0 && x.eski !== x.oneri).sort((x, y) => y.haftalik - x.haftalik);
}
/* hepsi=false: yalnız kritik seviyesi boş olanlara yazar (elle girilmiş seviyeye dokunmaz). */
function stkKritikUygula(liste, hepsi) { let n = 0; liste.forEach((x) => { if (!hepsi && x.eski != null) return; x.p.kritik = x.oneri; n++; }); return n; }
/* Azalan ürünler: iki havuzun TOPLAMI kritik seviyenin altında/eşit. */
function stkKritikler(S) { return (S.products || []).filter((p) => p.gorunur !== false && stkKritikVar(p) && stkToplamStok(p) <= Number(p.kritik)); }
function stkEksiler(S, havuz) {
  const L = [];
  (S.products || []).forEach((p) => {
    if (havuz !== "arac" && stkN(p.stok) < 0) L.push({ p: p, havuz: "dukkan", miktar: stkN(p.stok) });
    if (havuz !== "dukkan" && stkN(p.aracStok) < 0) L.push({ p: p, havuz: "arac", miktar: stkN(p.aracStok) });
  });
  return L;
}
/* Alınacaklar: dükkan+araç toplamı `hedefHafta` haftalık satışın altına düşen (ya da kritik seviyeye inen) ürünler. */
function stkAlinacaklar(S, a) {
  a = a || {};
  const hafta = a.hafta > 0 ? a.hafta : stkAyar().hizHafta, hedef = a.hedefHafta > 0 ? a.hedefHafta : stkAyar().hedefHafta;
  const hiz = stkSatisHizi(S, hafta, a.simdi), satirlar = [];
  (S.products || []).forEach((p) => {
    if (p.gorunur === false) return;
    const h = hiz[p.id] || 0, dukkan = stkN(p.stok), arac = stkN(p.aracStok), toplam = dukkan + arac;
    const kritik = stkKritikVar(p) ? Number(p.kritik) : null, ihtiyac = h * hedef;
    if (!((h > 0 && toplam < ihtiyac) || (kritik != null && toplam <= kritik))) return;
    const oneri = Math.max(1, Math.ceil(Math.max(ihtiyac, kritik || 0) - Math.max(0, toplam) - 1e-9));
    satirlar.push({ p: p, haftalik: h, dukkan: dukkan, arac: arac, toplam: toplam, ihtiyac: ihtiyac, oneri: oneri, eksi: dukkan < 0 || arac < 0, tutar: stkKurus(oneri * stkN(p.alis)) });
  });
  satirlar.sort((x, y) => (x.p.grup || "").localeCompare(y.p.grup || "", "tr") || y.haftalik - x.haftalik || (x.p.ad || "").localeCompare(y.p.ad || "", "tr"));
  const eksiUrun = new Set(stkEksiler(S).map((e) => e.p.id));
  return { satirlar: satirlar, hafta: hafta, hedefHafta: hedef, eksiSayisi: eksiUrun.size, tutar: stkKurus(satirlar.reduce((t, x) => t + x.tutar, 0)) };
}
/* Paylaşılacak düz metin (WhatsApp'a yapıştırılır). */
function stkAlinacakMetin(r, baslik) {
  const L = [(baslik || "Alınacaklar") + " — " + new Date().toLocaleDateString("tr-TR")];
  let grup = null;
  r.satirlar.forEach((x) => {
    const g = x.p.grup || "Diğer";
    if (g !== grup) { grup = g; L.push("", g.toLocaleUpperCase("tr-TR")); }
    L.push("• " + stkAdet(x.oneri) + " " + (x.p.birim || "Adet") + " " + x.p.ad);
  });
  if (!r.satirlar.length) L.push("", "Alınacak ürün görünmüyor.");
  return L.join("\n");
}

/* ---- stok yazma: sayım, eksi sıfırlama, dükkan ↔ araç aktarma ---- */
/* degisimler: [{ urunId, havuz: "dukkan"|"arac", yeni }] — mutlak değer yazar, farkı stokHareket'e işler. */
function stkStokYaz(S, degisimler, a) {
  const tarih = a.tarih || new Date().toISOString(), yazilan = [];
  S.stokHareket = S.stokHareket || [];
  degisimler.forEach((d) => {
    const p = stkUrun(S, d.urunId); if (!p) return;
    const arac = d.havuz === "arac", alan = arac ? "aracStok" : "stok", eski = stkN(p[alan]), yeni = stkN(d.yeni);
    if (eski === yeni) return;
    p[alan] = yeni;
    S.stokHareket.push({ id: a.id(), ad: p.ad, urunId: p.id, miktar: stkKurus(yeni - eski), tur: (a.tur || "Sayım Düzeltme") + (arac ? " (Araç)" : ""), havuz: arac ? "arac" : "dukkan", tarih: tarih });
    if (arac) { S.aracHareket = S.aracHareket || []; S.aracHareket.push({ id: a.id(), urunId: p.id, ad: p.ad, adet: yeni, yon: "sayim", tarih: tarih }); }
    yazilan.push({ p: p, havuz: arac ? "arac" : "dukkan", eski: eski, yeni: yeni });
  });
  return yazilan;
}
/* kalemler: [{ urunId, adet }] · yon: "araca" (dükkandan araca) | "dukkana". Bir havuzdan düşen diğerine eklenir. */
function stkAktar(S, kalemler, yon, a) {
  const tarih = a.tarih || new Date().toISOString(), dukkana = yon === "dukkana", yazilan = [];
  S.aracHareket = S.aracHareket || [];
  kalemler.forEach((k) => {
    const p = stkUrun(S, k.urunId), adet = stkN(k.adet); if (!p || adet <= 0) return;
    const d0 = stkN(p.stok), a0 = stkN(p.aracStok);
    p.stok = stkKurus(d0 + (dukkana ? adet : -adet)); p.aracStok = stkKurus(a0 + (dukkana ? -adet : adet));
    S.aracHareket.push({ id: a.id(), urunId: p.id, ad: p.ad, adet: adet, yon: dukkana ? "bosaltma" : "yukleme", tarih: tarih });
    yazilan.push({ p: p, adet: adet, dukkan: [d0, p.stok], arac: [a0, p.aracStok] });
  });
  return yazilan;
}

/* ---- fiyat: geçmiş, yazma, marj uyarısı, kontrol listesi, toplu zam ---- */
/* k: { urunId, ad, alan: "alis"|"satis"|"ozel", eski, yeni, kaynak, musteriId } */
function stkFiyatGecmis(S, a, k) {
  if (stkKurus(k.eski) === stkKurus(k.yeni)) return;
  S.fiyatGecmisi = S.fiyatGecmisi || [];
  const r = { id: a.id(), urunId: k.urunId, ad: k.ad, alan: k.alan, eski: stkKurus(k.eski), yeni: stkKurus(k.yeni), kaynak: k.kaynak || "", tarih: a.tarih || new Date().toISOString() };
  if (k.musteriId) r.musteriId = k.musteriId;
  S.fiyatGecmisi.push(r);
}
/* Ürün kartına fiyat yazar: alanın türünü (metin/sayı) korur, adet fiyatını (adetAlis/adetSatis) birlikte günceller. */
function stkFiyatYaz(p, alan, yeni) {
  yeni = stkKurus(yeni);
  const ek = alan === "alis" ? "adetAlis" : "adetSatis", ici = stkN(p.birimIciAdet);
  p[alan] = typeof p[alan] === "string" ? String(yeni) : yeni;
  if (ici > 0) p[ek] = yeni / ici; else if (p[ek] != null) p[ek] = yeni;
}
/* Alış fiyatı değişince kimin kârı eşiğin altına düşüyor? yeniAlis: { urunId: alış } (kaydetmeden önce de sorulabilir). */
function stkMarjEtki(S, yeniAlis, esik) {
  esik = esik != null ? esik : stkMarjEsik(S);
  const L = [];
  Object.keys(yeniAlis || {}).forEach((id) => {
    const p = stkUrun(S, id); if (!p) return;
    const alis = stkN(yeniAlis[id]), satis = stkN(p.satis), m = stkMarj(satis, alis), musteriler = [];
    (S.customers || []).forEach((c) => { const f = stkOzel(c, id); if (f == null || f <= 0) return; const mm = stkMarj(f, alis); if (mm < esik) musteriler.push({ c: c, fiyat: f, marj: mm }); });
    const dusuk = m != null && m < esik;
    if (dusuk || musteriler.length) L.push({ p: p, alis: alis, satis: satis, marj: m, dusuk: dusuk, zarar: satis > 0 && satis <= alis, musteriler: musteriler });
  });
  return L;
}
function stkMarjMetin(L, esik) {
  const S = [];
  L.forEach((x) => {
    S.push((x.zarar ? "ZARAR " : x.dusuk ? "DUSUK " : "      ") + x.p.ad + ": alış " + stkPara(x.alis) + " · liste " + stkPara(x.satis) + " · kâr " + stkYuzde(x.marj));
    x.musteriler.forEach((m) => S.push("        - " + m.c.ad + ": özel fiyat " + stkPara(m.fiyat) + " · kâr " + stkYuzde(m.marj) + (m.fiyat <= x.alis ? " (ZARAR)" : "")));
  });
  return S.length ? ["KÂR UYARISI — kârı " + stkYuzde(esik) + " altına düşenler:"].concat(S) : [];
}
/* Fiyat kontrol listesi. Alış fiyatı girilmemiş (0) ürünlerde kâr hesaplanamaz, onlar "alisYok"ta sayılır. */
function stkFiyatKontrol(S, esik) {
  esik = esik != null ? esik : stkMarjEsik(S);
  const urunler = (S.products || []).filter((p) => p.gorunur !== false), zarar = [], dusuk = [], ozelDusuk = [], alisYok = [];
  urunler.forEach((p) => {
    const s = stkN(p.satis), al = stkN(p.alis); if (s <= 0) return;
    if (al <= 0) { alisYok.push({ p: p }); return; }
    const m = stkMarj(s, al);
    if (s <= al) zarar.push({ p: p, marj: m }); else if (m < esik) dusuk.push({ p: p, marj: m });
  });
  const aileKayit = {};
  (S.customers || []).forEach((c) => Object.keys(c.ozelFiyatlar || {}).forEach((id) => {
    const f = stkOzel(c, id), p = urunler.find((x) => x.id === id); if (f == null || f <= 0 || !p) return;
    const al = stkN(p.alis);
    if (al > 0) { const m = stkMarj(f, al); if (m < esik) ozelDusuk.push({ c: c, p: p, fiyat: f, marj: m, zarar: f <= al }); }
    const aile = stkAile(S, p), anahtar = aile.map((x) => x.id).sort().join(",");
    const k = aileKayit[anahtar] = aileKayit[anahtar] || { urunler: aile, liste: stkN(p.satis), fiyatlar: {}, yuksek: {} };
    (k.fiyatlar[f] = k.fiyatlar[f] || {})[c.id] = c;
    if (f > k.liste) k.yuksek[c.id] = { c: c, fiyat: f };
  }));
  const ozelYuksek = [];
  Object.keys(aileKayit).forEach((an) => {
    const k = aileKayit[an], yuksek = Object.keys(k.yuksek).map((id) => k.yuksek[id]); if (!yuksek.length) return;
    let oneri = null, oneriSayi = 0;
    Object.keys(k.fiyatlar).map(Number).sort((x, y) => x - y).forEach((f) => { const n = Object.keys(k.fiyatlar[f]).length; if (f > k.liste && n > oneriSayi) { oneri = f; oneriSayi = n; } });
    /* Öneri yalnız en az 2 müşteri aynı (liste üstü) fiyattan alıyorsa — tek müşteri "yaygın" sayılmaz. */
    if (oneriSayi < 2) { oneri = null; }
    ozelYuksek.push({ urunler: k.urunler, liste: k.liste, musteriler: yuksek.sort((x, y) => y.fiyat - x.fiyat), oneri: oneri, oneriSayi: oneri == null ? 0 : oneriSayi });
  });
  ozelYuksek.sort((x, y) => y.musteriler.length - x.musteriler.length);
  zarar.sort((x, y) => x.marj - y.marj); dusuk.sort((x, y) => x.marj - y.marj); ozelDusuk.sort((x, y) => x.marj - y.marj);
  return { esik: esik, zarar: zarar, dusuk: dusuk, ozelDusuk: ozelDusuk, ozelYuksek: ozelYuksek, alisYok: alisYok };
}
/* adim: 0 = kuruşa, 0.5 / 1 / 5 / 10 … · yon: "yakin" | "yukari" | "asagi" */
function stkYuvarla(n, adim, yon) {
  n = Number(n) || 0; adim = Number(adim) || 0;
  if (adim <= 0) return stkKurus(n);
  const k = n / adim;
  return stkKurus((yon === "yukari" ? Math.ceil(k - 1e-9) : yon === "asagi" ? Math.floor(k + 1e-9) : Math.round(k)) * adim);
}
function stkZamHesap(eski, a) {
  const e = stkN(eski);
  const y = a.tur === "tutar" ? e + stkN(a.deger) : a.tur === "yeni" ? stkN(a.deger) : e * (1 + stkN(a.deger) / 100);
  return Math.max(0, stkYuvarla(y, a.yuvarla, a.yon));
}
/* Toplu zam önizlemesi. a: { urunIdler: [..]|null, grup: "…"|null, tur: "yuzde"|"tutar"|"yeni", deger, yuvarla, yon,
   ozel: "ayni"|"dokunma" }. Seçilen her ürünün AİLESİ de birlikte taşınır (aile bölünmesin). Hiçbir şey yazmaz. */
function stkZamPlan(S, a) {
  const idler = a.urunIdler ? new Set(a.urunIdler) : null;
  const secili = (S.products || []).filter((p) => (idler ? idler.has(p.id) : p.gorunur !== false) && (a.grup ? (p.grup || "") === a.grup : true));
  const hedef = {}, sira = [];
  secili.forEach((p) => stkAile(S, p).forEach((x) => { if (hedef[x.id]) return; hedef[x.id] = { p: x, aileden: !secili.includes(x) }; sira.push(x.id); }));
  const urunler = sira.map((id) => {
    const p = hedef[id].p, eski = stkN(p.satis);
    return { p: p, eski: eski, yeni: stkZamHesap(eski, a), aileden: hedef[id].aileden, alis: stkN(p.alis) };
  }).filter((u) => (a.tur === "yeni" || u.eski > 0) && u.yeni !== u.eski);
  urunler.forEach((u) => { u.marj = stkMarj(u.yeni, u.alis); u.zarar = u.alis > 0 && u.yeni <= u.alis; });
  const ozel = [];
  let ozelSayisi = 0;
  (S.customers || []).forEach((c) => urunler.forEach((u) => {
    const f = stkOzel(c, u.p.id); if (f == null) return;
    ozelSayisi++;
    if (a.ozel !== "ayni") return;
    const y = a.tur === "yeni" ? Math.max(0, stkYuvarla(f + (u.yeni - u.eski), a.yuvarla, a.yon)) : stkZamHesap(f, a);
    if (y !== f) ozel.push({ c: c, p: u.p, eski: f, yeni: y });
  }));
  /* Aile çakışması: önce FARKLI fiyatlı olup zamdan sonra aynı fiyata gelen aynı çeşitteki (altKategori) ürünler
     artık tek aile sayılır — kullanıcı bilsin. */
  const uyarilar = [], yeniFiyat = {};
  urunler.forEach((u) => { yeniFiyat[u.p.id] = u.yeni; });
  const altlar = {};
  urunler.forEach((u) => { const alt = (u.p.altKategori || "").trim(); if (alt) altlar[alt] = true; });
  Object.keys(altlar).forEach((alt) => {
    const grup = {};
    (S.products || []).filter((x) => (x.altKategori || "").trim() === alt).forEach((x) => {
      const y = yeniFiyat[x.id] != null ? yeniFiyat[x.id] : stkN(x.satis);
      (grup[y] = grup[y] || []).push(x);
    });
    Object.keys(grup).forEach((y) => {
      const eskiler = {}; grup[y].forEach((x) => { eskiler[stkN(x.satis)] = true; });
      if (Object.keys(eskiler).length > 1) uyarilar.push(alt + ": " + grup[y].map((x) => x.ad + " (" + stkPara(x.satis) + ")").join(", ") + " → hepsi " + stkPara(Number(y)) + " oluyor; bundan sonra aynı fiyat ailesi sayılırlar.");
    });
  });
  return { a: a, urunler: urunler, ozel: ozel, ozelSayisi: ozelSayisi, uyarilar: uyarilar };
}
function stkZamUygula(S, plan, a) {
  plan.urunler.forEach((u) => { stkFiyatGecmis(S, a, { urunId: u.p.id, ad: u.p.ad, alan: "satis", eski: u.eski, yeni: u.yeni, kaynak: a.kaynak || "Toplu zam" }); stkFiyatYaz(u.p, "satis", u.yeni); });
  plan.ozel.forEach((o) => { o.c.ozelFiyatlar[o.p.id] = o.yeni; stkFiyatGecmis(S, a, { urunId: o.p.id, ad: o.p.ad, alan: "ozel", eski: o.eski, yeni: o.yeni, kaynak: a.kaynak || "Toplu zam", musteriId: o.c.id }); });
  return { urun: plan.urunler.length, ozel: plan.ozel.length };
}

/* ---- mal alımı (alış kaydı) ---- */
/* g: { hedef: "dukkan"|"arac", odeme: "pesin"|"veresiye", odemeTuru: "nakit"|"kart"|"havale", firmaId, no, tarih, not,
        toplam (fişteki tutar; boşsa kalemlerin toplamı), odenen (veresiyede peşinat),
        items: [{ urunId, ad, adet, birimFiyat, fiyatYaz }] }   fiyatYaz === false → ürünün alış fiyatına dokunma.
   Stoğu `hedef` havuzuna ekler, alış kaydı (purchases) açar, değişen alış fiyatlarını geçmişe işler. */
function stkAlimKaydet(S, g, a) {
  const hedef = g.hedef === "arac" ? "arac" : "dukkan", alan = hedef === "arac" ? "aracStok" : "stok";
  const tarih = g.tarih || a.tarih || new Date().toISOString();
  const items = (g.items || []).map((it) => ({ urunId: it.urunId || null, ad: it.ad, adet: stkN(it.adet), birimFiyat: stkKurus(it.birimFiyat) }));
  const kalemToplam = stkKurus(items.reduce((s, it) => s + it.adet * it.birimFiyat, 0));
  const toplam = (g.toplam != null && g.toplam !== "") ? stkKurus(g.toplam) : kalemToplam;
  const odeme = g.odeme === "veresiye" ? "veresiye" : "pesin";
  const tur = (g.odemeTuru === "kart" || g.odemeTuru === "havale") ? g.odemeTuru : "nakit";
  S.purchases = S.purchases || []; S.firmaPayments = S.firmaPayments || [];
  S.counters.purchase = (S.counters.purchase || 0) + 1;
  const kayit = { id: a.id(), no: String(g.no || "").trim() || "A" + S.counters.purchase, firmaId: g.firmaId || null, items: items, toplam: toplam, odeme: odeme, borc: odeme === "veresiye" ? toplam : 0, tarih: tarih, hedef: hedef };
  if (odeme === "pesin") kayit.odemeTuru = tur;
  if (toplam !== kalemToplam) kayit.kalemToplam = kalemToplam;
  if (g.not) kayit.not = String(g.not);
  S.purchases.push(kayit);
  const odenen = stkKurus(g.odenen);
  if (odeme === "veresiye" && odenen > 0) S.firmaPayments.push({ id: a.id(), firmaId: kayit.firmaId, tutar: Math.min(odenen, toplam), odemeTuru: tur, alisId: kayit.id, not: "Alış " + kayit.no + " — peşin ödenen kısım", tarih: tarih });
  const degisen = {};
  items.forEach((it, i) => {
    const p = it.urunId && stkUrun(S, it.urunId); if (!p) return;
    p[alan] = stkKurus(stkN(p[alan]) + it.adet);
    if (g.items[i].fiyatYaz === false || !(it.birimFiyat > 0) || stkKurus(p.alis) === it.birimFiyat) return;
    stkFiyatGecmis(S, { id: a.id, tarih: tarih }, { urunId: p.id, ad: p.ad, alan: "alis", eski: p.alis, yeni: it.birimFiyat, kaynak: "Alış " + kayit.no });
    stkFiyatYaz(p, "alis", it.birimFiyat); degisen[p.id] = it.birimFiyat;
  });
  return { kayit: kayit, degisen: degisen, kalemToplam: kalemToplam };
}
/* Alış kaydını siler: stok, girdiği havuzdan geri alınır (eski kayıtta `hedef` yok → dükkan). Alış fiyatı geri alınmaz. */
function stkAlimSil(S, id) {
  const k = (S.purchases || []).find((x) => x.id === id); if (!k) return null;
  const alan = k.hedef === "arac" ? "aracStok" : "stok";
  (k.items || []).forEach((it) => { const p = it.urunId && stkUrun(S, it.urunId); if (p) p[alan] = stkKurus(stkN(p[alan]) - stkN(it.adet)); });
  S.purchases = S.purchases.filter((x) => x.id !== id);
  S.firmaPayments = (S.firmaPayments || []).filter((x) => x.alisId !== id);
  return k;
}

/* ---- iade ---- */
/* İade fiyatı: müşterinin bu ürünü EN SON aldığı fiyat → yoksa özel fiyatı → yoksa liste fiyatı. */
function stkIadeFiyat(S, musteriId, p) {
  if (musteriId) {
    let son = null;
    (S.sales || []).forEach((s) => { if (s.musteriId !== musteriId) return; (s.items || []).forEach((it) => { if (it.urunId === p.id && stkN(it.adet) > 0 && (!son || s.tarih > son.tarih)) son = { fiyat: stkN(it.fiyat), tarih: s.tarih }; }); });
    if (son) return { fiyat: son.fiyat, kaynak: "son-satis", tarih: son.tarih };
    const oz = stkOzel((S.customers || []).find((c) => c.id === musteriId), p.id);
    if (oz != null) return { fiyat: oz, kaynak: "ozel" };
  }
  return { fiyat: stkN(p.satis), kaynak: "liste" };
}
/* İadeyi yazar (panel ve araç AYNI kaydı üretir). g: { musteriId, urunId, adet, fiyat, havuz: "arac"|"dukkan" }
   Müşteri varsa eksi adetli bir "iade fişi" açılır: tutar borçtan düşer (açık hesap eksi), o günün cirosu ve maliyeti
   eksiye gider (kâr doğru kalsın). Tahsilat (payments) YAZILMAZ — ortada para girişi yok. Mal `havuz`a geri girer. */
function stkIadeKaydet(S, g, a) {
  const p = stkUrun(S, g.urunId), adet = stkN(g.adet); if (!p || adet <= 0) return null;
  const fiyat = stkKurus(g.fiyat), tutar = stkKurus(adet * fiyat), maliyet = stkKurus(adet * stkN(p.alis));
  const havuz = g.havuz === "dukkan" ? "dukkan" : "arac", tarih = a.tarih || new Date().toISOString(), d = new Date(tarih);
  let sale = null;
  if (g.musteriId) {
    S.counters.sale = (S.counters.sale || 0) + 1;
    sale = {
      id: a.id(), belgeNo: d.getFullYear() + "-" + String(S.counters.sale).padStart(6, "0"), musteriId: g.musteriId, personelId: null, not: "İADE — " + adet + " x " + p.ad, odemeAdi: "İade",
      items: [{ urunId: p.id, ad: p.ad, barkod: p.barkod || "", kdv: stkN(p.kdv), fiyat: fiyat, adet: -adet, iskyuzde: 0, alis: stkN(p.alis) }],
      brut: -tutar, iskonto: 0, toplam: -tutar, maliyet: -maliyet, komisyon: 0,
      odeme: { nakit: 0, pos: 0, acik: -tutar }, tarih: tarih, servisGun: localDateStr(d), hafta: haftaNo(d), stokKaynak: havuz,
    };
    S.sales.push(sale);
  }
  if (havuz === "arac") p.aracStok = stkKurus(stkN(p.aracStok) + adet); else p.stok = stkKurus(stkN(p.stok) + adet);
  S.iadeler = S.iadeler || [];
  const kayit = { id: a.id(), urunId: p.id, ad: p.ad, adet: adet, tutar: tutar, fiyat: fiyat, havuz: havuz, musteriId: g.musteriId || null, tarih: tarih };
  if (sale) kayit.belgeNo = sale.belgeNo;
  S.iadeler.push(kayit);
  return { sale: sale, tutar: tutar, maliyet: maliyet, havuz: havuz };
}

/* ---- çay ocağı siparişleri ---- */
function stkTel(t) { return String(t || "").replace(/\D/g, "").replace(/^90/, "").replace(/^0/, ""); }
function stkSiparisMusteri(S, o) {
  const tel = stkTel(o.dealerTel), ad = String(o.dealer || "").trim().toLowerCase();
  return (tel && (S.customers || []).find((c) => stkTel(c.telefon) === tel)) || (S.customers || []).find((c) => String(c.ad || "").trim().toLowerCase() === ad) || null;
}
function stkSiparisUrun(S, id, ad) {
  const kimlik = String(id || ""), isim = String(ad || "").trim().toLowerCase();
  /* Çay ocağı uygulaması katalog kimliğini "b-<ürün id>" diye gönderir. */
  return (S.products || []).find((p) => p.id === kimlik || "b-" + p.id === kimlik) || (isim ? (S.products || []).find((p) => String(p.ad || "").trim().toLowerCase() === isim) : null) || null;
}
/* `siparisler` tablosunun bir satırını panelin sipariş kaydına çevirir (fiyat panelin güncel kataloğundan kurulur). */
function stkSiparisSatirdan(S, row, a) {
  const order = row.payload || {}, lines = Array.isArray(order.lines) ? order.lines : [];
  const items = lines.map((l) => {
    const pr = stkSiparisUrun(S, l.catalogItemId, l.name);
    return { urunId: pr ? pr.id : (l.catalogItemId || ""), ad: pr ? pr.ad : l.name, birim: pr ? (pr.birim || l.birim) : l.birim, adet: stkN(l.qty), fiyat: pr ? stkN(pr.satis) : stkN(l.unitPrice) };
  });
  const brut = stkKurus(items.reduce((n, l) => n + l.adet * l.fiyat, 0));
  const parcalar = Array.isArray(order.paymentParts) ? order.paymentParts : [];
  const parca = (tur) => stkKurus(parcalar.filter((p) => p && p.payment === tur).reduce((n, p) => n + stkN(p.amount), 0));
  const odemeTuru = parcalar.length > 1 ? "parcali" : order.paymentType === "nakit" ? "nakit" : order.paymentType === "kart" ? "kart" : "bakiye";
  const iskonto = odemeTuru === "nakit" ? stkKurus(brut * 0.05) : 0, toplam = stkKurus(brut - iskonto);
  const o = {
    id: a.id(), orderId: row.id, dealer: row.cay_ocagi || (order.from && order.from.name) || "Bilinmeyen bayi",
    dealerTel: row.cay_tel || (order.from && order.from.phone) || "", not: order.note || "",
    tarih: order.date || row.created_at || new Date().toISOString(), alindi: a.tarih || new Date().toISOString(), durum: "yeni",
    items: items, brut: brut, iskonto: iskonto, toplam: toplam, odemeTuru: odemeTuru,
    pesinNakit: parca("nakit"), pesinKart: parca("kart"), bakiyeTutar: parca("bakiye"),
    minPesinOran: 0, minPesinTutar: 0, teklifNo: "", fisNo: "", teslimTarih: "", teslimSaat: "", saleId: "",
  };
  const c = stkSiparisMusteri(S, o);
  o.minPesinOran = c && c.onSiparisMinPesin ? 0.4 : 0; o.minPesinTutar = stkKurus(toplam * o.minPesinOran);
  return o;
}
function stkSiparisOdeme(o, odemeTuru, toplam, minPesin) {
  const odeme = odemeTuru === "parcali" ? { nakit: stkKurus(o.pesinNakit), pos: stkKurus(o.pesinKart), acik: stkKurus(o.bakiyeTutar) }
    : odemeTuru === "nakit" ? { nakit: toplam, pos: 0, acik: 0 }
    : odemeTuru === "kart" ? { nakit: 0, pos: toplam, acik: 0 }
    : odemeTuru === "nakit-acik" ? { nakit: minPesin, pos: 0, acik: stkKurus(toplam - minPesin) }
    : odemeTuru === "kart-acik" ? { nakit: 0, pos: minPesin, acik: stkKurus(toplam - minPesin) }
    : { nakit: 0, pos: 0, acik: toplam };
  const odemeAdi = odemeTuru === "nakit" ? "Nakit" : odemeTuru === "kart" ? "Kart" : odemeTuru === "nakit-acik" ? "Nakit %40 + Açık Hesap" : odemeTuru === "kart-acik" ? "Kart %40 + Açık Hesap" : "Açık Hesap";
  return { odeme: odeme, odemeAdi: odemeAdi };
}
/* Teslim: siparişi satışa çevirir (bayi müşteri kartına bağlanır, stok `havuz`dan düşer). kaydet=false → store'a
   dokunmadan yalnız ne olacağını hesaplar (önizleme). */
function stkSiparisTeslim(S, o, odemeTuru, havuz, a, kaydet) {
  odemeTuru = odemeTuru || o.odemeTuru || "bakiye";
  const mevcut = stkSiparisMusteri(S, o);
  let cust = mevcut || { id: null, ad: o.dealer, telefon: o.dealerTel || "", acilis: 0, adres: "", vergiNo: "" };
  if (odemeTuru === "bakiye" && cust.onSiparisMinPesin) odemeTuru = "nakit-acik";
  const items = (o.items || []).map((l) => {
    const pr = stkSiparisUrun(S, l.urunId, l.ad);
    return { urunId: pr ? pr.id : "", ad: l.ad, barkod: pr ? pr.barkod || "" : "", kdv: pr ? stkN(pr.kdv) : 0, fiyat: stkN(l.fiyat), adet: stkN(l.adet), iskyuzde: 0, alis: pr ? stkN(pr.alis) : 0 };
  });
  const brut = stkKurus(items.reduce((s, i) => s + i.fiyat * i.adet, 0)), iskonto = stkKurus(o.iskonto);
  const toplam = stkKurus(stkN(o.toplam) || (brut - iskonto));
  const minPesin = cust.onSiparisMinPesin ? stkKurus(toplam * 0.4) : 0;
  const maliyet = stkKurus(items.reduce((s, i) => s + i.alis * i.adet, 0));
  const od = stkSiparisOdeme(o, odemeTuru, toplam, minPesin);
  const tarih = a.tarih || new Date().toISOString(), kaynak = havuz === "arac" ? "arac" : "dukkan";
  const sonuc = { cust: cust, yeniMusteri: !mevcut, odemeTuru: odemeTuru, odemeAdi: od.odemeAdi, odeme: od.odeme, items: items, brut: brut, iskonto: iskonto, toplam: toplam, maliyet: maliyet, minPesin: minPesin, stokKaynak: kaynak, eslesmeyen: items.filter((i) => !i.urunId).map((i) => i.ad), sale: null };
  if (!kaydet) return sonuc;
  if (!mevcut) { cust.id = a.id(); S.customers.push(cust); }
  cust.cayOcagi = true;
  if (!cust.telefon && o.dealerTel) cust.telefon = o.dealerTel;
  S.counters.sale = (S.counters.sale || 0) + 1;
  const d = new Date(tarih), belgeNo = d.getFullYear() + "-" + String(S.counters.sale).padStart(6, "0");
  const sale = { id: a.id(), belgeNo: belgeNo, musteriId: cust.id, personelId: null, not: "Çay Ocağı siparişi · " + o.dealer, odemeAdi: od.odemeAdi, items: items, brut: brut, iskonto: iskonto, toplam: toplam, maliyet: maliyet, odeme: od.odeme, tarih: tarih, servisGun: localDateStr(d), hafta: haftaNo(d), stokKaynak: kaynak };
  S.sales.push(sale);
  items.forEach((i) => { const pr = i.urunId && stkUrun(S, i.urunId); if (!pr) return; if (kaynak === "arac") pr.aracStok = stkKurus(stkN(pr.aracStok) - i.adet); else pr.stok = stkKurus(stkN(pr.stok) - i.adet); });
  o.durum = "teslim"; o.saleId = sale.id; o.odemeTuru = odemeTuru;
  sonuc.sale = sale;
  return sonuc;
}
/* Satış AÇMADAN kapat: sipariş zaten elle satışa girilmişse. Çay ocağı "teslim edildi" görür. */
function stkSiparisKapat(o, not, tarih) { o.durum = "teslim"; o.elleKapandi = true; o.kapanisNot = not || "Satışı ayrıca girildi"; o.kapanisTarih = tarih || new Date().toISOString(); }
function stkSiparisBekleyen(S) { return (S.gelenSiparisler || []).filter((o) => o.durum === "yeni"); }
function stkSiparisYasSaat(o, simdi) { const t = new Date(o.tarih || o.alindi).getTime(); return isNaN(t) ? 0 : Math.max(0, ((simdi ? new Date(simdi) : new Date()).getTime() - t) / 3600000); }
function stkYasMetin(saat) { return saat < 1 ? "az önce" : saat < 24 ? Math.floor(saat) + " saat önce" : Math.floor(saat / 24) + " gün önce"; }
function stkSiparisKod(o) { const s = String(o.orderId || o.id || "").replace(/[^a-zA-Z0-9]/g, ""); return s.slice(-5).toUpperCase(); }
/* <<< STOK-ORTAK-BITTI */

  function bayrak(ad) { const a = args.find((x) => x.indexOf("--" + ad + "=") === 0); return a ? a.slice(ad.length + 3) : null; }
  function bayraklar(ad) { return args.filter((x) => x.indexOf("--" + ad + "=") === 0).map((x) => x.slice(ad.length + 3)); }
  function sayi(v) { return Number(String(v).replace(",", ".")); }
  function stkA(tarih) { return { id: () => genId(store), tarih: tarih || new Date().toISOString() }; }
  function jsonGirdi(ham, ne) {
    if (!ham) throw new Error(ne + " verisi gerekli: dosya yolu ya da JSON metni.");
    return JSON.parse(fs.existsSync(ham) ? fs.readFileSync(ham, "utf8") : ham);
  }
  function isaretli(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + stkAdet(Math.abs(n)); }
  function havuzAd(h) { return h === "arac" ? "Araç" : "Dükkan"; }

  /* ---- sipariş: tablo okuma / yazma ---- */
  function sipDurumAd(o) { return ({ yeni: "YENİ", onay: "ONAYLANDI", dagitim: "DAĞITIMDA", teslim: "TESLİM" })[o.durum] || String(o.durum || "").toLocaleUpperCase("tr-TR"); }
  function sipOdemeAd(t) { return ({ nakit: "nakit", kart: "kart", bakiye: "açık hesap", parcali: "parçalı", "nakit-acik": "nakit %40 + açık hesap", "kart-acik": "kart %40 + açık hesap" })[t] || "açık hesap"; }
  async function sipTabloOku(yalnizYeni, sureMs) {
    const q = "siparisler?toptanci=eq.babuco&select=*&order=created_at" + (yalnizYeni ? "&durum=eq.yeni" : "");
    const kes = new AbortController(), z = setTimeout(() => kes.abort(), sureMs || 15000);
    try { return (await sb(q, { signal: kes.signal })) || []; } finally { clearTimeout(z); }
  }
  /* Panelin "Sil" dediği siparişler tabloda durur; yeniden içeri alınmasın diye kimlikleri saklanır. */
  function sipSilinmis(orderId) { return (store.sipSilinenler || []).some((x) => x.id === orderId); }
  /* store + tablo → tek liste. Tabloda olup panele henüz düşmemiş siparişler BELLEKTE kurulur; ancak işlenirken kaydedilir. */
  async function sipOku() {
    let rows = [], hata = null;
    try { rows = await sipTabloOku(false); } catch (e) { hata = String(e.message || e).slice(0, 120); }
    const tabloDurum = {};
    rows.forEach((r) => { tabloDurum[r.id] = r.durum; });
    const liste = (store.gelenSiparisler || []).map((o) => ({ o: o, yeniGelen: false, tabloDurum: o.orderId ? tabloDurum[o.orderId] : undefined }));
    rows.forEach((r) => {
      if ((store.gelenSiparisler || []).some((o) => o.orderId === r.id) || sipSilinmis(r.id)) return;
      const o = stkSiparisSatirdan(store, r, { id: () => "gecici-" + r.id });
      if (r.durum === "onay" || r.durum === "dagitim" || r.durum === "teslim") o.durum = r.durum;
      liste.push({ o: o, yeniGelen: true, tabloDurum: r.durum });
    });
    liste.sort((x, y) => String(x.o.tarih).localeCompare(String(y.o.tarih)));
    return { liste: liste, hata: hata };
  }
  function sipBul(liste, ara) {
    const a = String(ara || "").trim();
    if (!a) throw new Error("Siparis kodu gerekli ('siparisler' komutu kodlari [KOD] olarak gosterir).");
    const kod = liste.filter((x) => stkSiparisKod(x.o) === a.toUpperCase() || x.o.orderId === a || x.o.id === a);
    if (kod.length === 1) return kod[0];
    const acik = liste.filter((x) => x.o.durum !== "teslim" && norm(x.o.dealer).includes(norm(a)));
    if (!kod.length && acik.length === 1) return acik[0];
    const aday = kod.length ? kod : acik;
    if (!aday.length) throw new Error('Siparis bulunamadi: "' + ara + '"');
    throw new Error('Siparis tek degil, "' + ara + '" birden cok eslesti:\n' + aday.map((x) => "  - [" + stkSiparisKod(x.o) + "] " + x.o.dealer + " · " + new Date(x.o.tarih).toLocaleString("tr-TR") + " · " + money(x.o.toplam)).join("\n") + "\nKodu yaz.");
  }
  /* Tablodan okunan (panele düşmemiş) siparişi store'a kalıcı kimlikle ekler. */
  function sipKaliciYap(x) {
    if (!x.yeniGelen) return x.o;
    x.o.id = genId(store); x.o.alindi = new Date().toISOString();
    store.gelenSiparisler = store.gelenSiparisler || []; store.gelenSiparisler.push(x.o); x.yeniGelen = false;
    return x.o;
  }
  /* Durumu çay ocağının gördüğü tabloya geri yazar. Dönen: yazılamayanların listesi (boşsa hepsi tamam). */
  async function sipDurumYaz(siparisler) {
    const kalan = [];
    for (const o of siparisler) {
      if (!o.orderId) continue;
      try {
        const out = await sb("siparisler?id=eq." + encodeURIComponent(o.orderId), { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ durum: o.durum, updated_at: new Date().toISOString() }) });
        if (!out || !out.length) kalan.push({ o: o, neden: "tabloda bu sipariş yok" });
      } catch (e) { kalan.push({ o: o, neden: String(e.message || e).slice(0, 100) }); }
    }
    return kalan;
  }
  function sipDurumSonuc(kalan, n) {
    if (!kalan.length) { if (n) console.log("  çay ocağına bildirildi: " + n + " sipariş"); return; }
    console.log("  ! " + kalan.length + " siparişin durumu çay ocağına İLETİLEMEDİ (panel kaydı tamam): " + kalan.map((k) => "[" + stkSiparisKod(k.o) + "] " + k.neden).join(" · ") + "\n    Tekrar denemek için: node tools/babuco.cjs siparis-esitle --kaydet");
  }
  /* Sipariş tarihinden sonra aynı müşteriye kesilmiş fişler — sipariş elle satışa girilmiş olabilir. */
  function sipSonrakiFisler(o) {
    const c = stkSiparisMusteri(store, o); if (!c) return [];
    const bas = new Date(new Date(o.tarih).getTime() - 3600000).toISOString();
    return store.sales.filter((s) => s.musteriId === c.id && s.tarih >= bas && s.id !== o.saleId).slice(-4);
  }
  /* Komut bitince (çıktıdan SONRA) stderr'e kısa uyarı. satis fişi stdout'a basıldığı için oraya dokunulmaz.
     Kapatmak için: BABUCO_SIPARIS_UYARI=0 */
  function sipUyariKur() {
    if (process.env.BABUCO_SIPARIS_UYARI === "0" || /^siparis/.test(komut)) return;
    let basildi = false;
    /* Tablo, komut işini bitirdikten SONRA okunur: komut sürerken araya ikinci bir ağ isteği girmez, hatayla
       çıkan komutta hiç istek atılmaz. */
    process.on("beforeExit", async () => {
      if (basildi) return; basildi = true;
      const rows = await sipTabloOku(true, 4000).catch(() => null);
      const bekleyen = stkSiparisBekleyen(store).map((o) => ({ ad: o.dealer, tarih: o.tarih }));
      (rows || []).forEach((r) => { if (!(store.gelenSiparisler || []).some((o) => o.orderId === r.id) && !sipSilinmis(r.id)) bekleyen.push({ ad: r.cay_ocagi || "Bilinmeyen bayi", tarih: (r.payload && r.payload.date) || r.created_at }); });
      if (!bekleyen.length) return;
      bekleyen.sort((a, b) => String(a.tarih).localeCompare(String(b.tarih)));
      const eski = bekleyen[0];
      console.error("\n[!] BEKLEYEN SIPARIS: " + bekleyen.length + " cay ocagi siparisi onay bekliyor (en eskisi " + stkYasMetin(stkSiparisYasSaat({ tarih: eski.tarih })) + ": " + eski.ad + "). Kullaniciya haber ver · ayrinti: node tools/babuco.cjs siparisler");
    });
  }

  /* Sipariş komutları ayrı bir işlevde: hata olursa process.exit ÇAĞIRMADAN çıkılır. (Windows'ta art arda iki
     ağ isteğinden hemen sonra process.exit, Node'u "Assertion failed … UV_HANDLE_CLOSING" ile çökertiyor;
     bu komutlar hem store'u hem sipariş tablosunu okuduğu için her hatada buna takılırdı.) */
  if (/^siparis-/.test(komut)) {
    let sonuc;
    try { sonuc = await sipKomutlari(); } catch (e) { console.error("\nHATA: " + e.message); process.exitCode = 1; return; }
    if (sonuc !== "yok") return;
  }
  async function sipKomutlari() {
  /* ---------- siparis-onayla / siparis-dagitim: panelin "Onayla" ve "Dağıtıma Al" aşamaları ---------- */
  if (komut === "siparis-onayla" || komut === "siparis-dagitim") {
    const t = await sipOku();
    const x = sipBul(t.liste, pos[1]), o = x.o;
    if (o.durum === "teslim") throw new Error("Bu siparis zaten teslim edilmis / kapatilmis.");
    const dagitim = komut === "siparis-dagitim";
    const gun = dagitim ? (pos[2] || o.teslimTarih || "") : "", saatS = dagitim ? (pos[3] || o.teslimSaat || "") : "";
    console.log("Sipariş [" + stkSiparisKod(o) + "] " + o.dealer + " · " + money(o.toplam) + " · " + (o.items || []).length + " kalem");
    console.log("  durum: " + sipDurumAd(o) + " -> " + (dagitim ? "DAĞITIMDA" + (gun ? " · teslim " + gun + " " + saatS : "") : "ONAYLANDI") + "   (çay ocağı uygulamasında da böyle görünecek)");
    if (!kaydet) { provaUyari(komut + " " + stkSiparisKod(o) + (gun ? ' "' + gun + '"' : "") + (saatS ? " " + saatS : "")); return; }
    sipKaliciYap(x);
    if (dagitim) { o.teslimTarih = gun; o.teslimSaat = saatS; o.fisNo = o.fisNo || "FIS-" + Date.now().toString().slice(-6); o.durum = "dagitim"; }
    else { o.durum = "onay"; o.teklifNo = o.teklifNo || "TKF-" + Date.now().toString().slice(-6); }
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · " + (dagitim ? "fiş " + o.fisNo : "teklif " + o.teklifNo) + " · yedek: " + path.basename(y.yedek));
    sipDurumSonuc(await sipDurumYaz([o]), 1);
    return;
  }

  /* ---------- siparis-teslim: siparişi satışa çevirir (panelin "Teslim Et"i) ----------
     Bayi müşteri kartına bağlanır (yoksa açılır), stok düşer (varsayılan ARAÇ; --dukkan ile dükkan),
     ödeme: --odeme=nakit|kart|bakiye|parcali|nakit-acik|kart-acik (yazılmazsa çay ocağının seçtiği). */
  if (komut === "siparis-teslim") {
    const t = await sipOku();
    const x = sipBul(t.liste, pos[1]), o = x.o;
    if (o.saleId || o.durum === "teslim") throw new Error("Bu siparis zaten teslim edilmis / kapatilmis.");
    const oArg = bayrak("odeme");
    const tur = oArg ? ({ nakit: "nakit", kart: "kart", pos: "kart", bakiye: "bakiye", acik: "bakiye", veresiye: "bakiye", parcali: "parcali", "nakit-acik": "nakit-acik", "kart-acik": "kart-acik" })[norm(oArg)] : (o.odemeTuru || "bakiye");
    if (!tur) throw new Error("--odeme= nakit | kart | bakiye | parcali | nakit-acik | kart-acik");
    const havuz = args.includes("--dukkan") ? "dukkan" : "arac";
    const r = stkSiparisTeslim(store, o, tur, havuz, stkA(), false);
    const q = (n) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
    const L = [];
    L.push("### 🧾 SİPARİŞ TESLİM — " + r.cust.ad + (r.yeniMusteri ? "  (YENİ MÜŞTERİ kartı açılacak)" : "") + "  [" + stkSiparisKod(o) + "]");
    L.push("**" + new Date().toLocaleDateString("tr-TR") + "**" + (havuz === "arac" ? " · araçtan" : " · dükkandan") + " · sipariş " + new Date(o.tarih).toLocaleDateString("tr-TR") + " (" + stkYasMetin(stkSiparisYasSaat(o)) + ")", "");
    L.push("| Adet | Ürün | Fiyat | Tutar |", "|---:|---|---:|---:|");
    r.items.forEach((i) => L.push("| " + stkAdet(i.adet) + " | " + i.ad + (i.urunId ? "" : " ⚠") + " | " + q(i.fiyat) + " | " + q(i.adet * i.fiyat) + " |"));
    if (r.iskonto) { L.push("| | | Ara toplam | " + q(r.brut) + " |"); L.push("| | | Nakit indirimi | −" + q(r.iskonto) + " |"); }
    L.push("| | | **TOPLAM** | **" + q(r.toplam) + " ₺** |", "", "| | |", "|---|---:|");
    L.push("| Ödeme | " + r.odemeAdi + (oArg ? "" : " (çay ocağının seçimi)") + " |");
    if (r.odeme.nakit) L.push("| Nakit alınan | " + q(r.odeme.nakit) + " ₺ |");
    if (r.odeme.pos) L.push("| Kart / pos | " + q(r.odeme.pos) + " ₺ |");
    if (r.odeme.acik > 0.001) L.push("| **Açık hesap kalan** | **" + q(r.odeme.acik) + " ₺** |");
    const eskiB = r.yeniMusteri ? 0 : customerBorc(store, r.cust.id);
    L.push("| **Bakiye** | " + q(eskiB) + " → **" + q(kurus(eskiB + r.odeme.acik)) + " ₺** |");
    L.push("| Kâr | " + q(r.toplam - r.maliyet) + " ₺ · " + karOrani(r.toplam, r.maliyet) + " |", "");
    if (r.eslesmeyen.length) L.push("⚠ Ürün listesinde bulunamadı (stok düşmez, maliyeti 0 sayılır): " + r.eslesmeyen.join(", "));
    if (Math.abs(kurus(r.odeme.nakit + r.odeme.pos + r.odeme.acik - r.toplam)) > 0.01) L.push("⚠ Ödeme parçaları toplamı tutmuyor (" + q(r.odeme.nakit + r.odeme.pos + r.odeme.acik) + " ≠ " + q(r.toplam) + ") — --odeme= ile tek tür seç.");
    const f = sipSonrakiFisler(o);
    if (f.length) L.push("⚠ Bu müşteriye siparişten sonra zaten fiş kesilmiş: " + f.map((s) => s.belgeNo + " (" + new Date(s.tarih).toLocaleDateString("tr-TR") + ", " + q(s.toplam) + " ₺)").join(" · ") + " — aynı teslimatsa satış AÇMA, `siparis-kapat " + stkSiparisKod(o) + "` kullan.");
    if (Math.abs(kurus(r.odeme.nakit + r.odeme.pos + r.odeme.acik - r.toplam)) > 0.01 && kaydet) throw new Error("Odeme kirilimi toplami tutmuyor; --odeme= ile tek tur sec.");
    if (!kaydet) { L.push("**KAYDEDİLMEDİ** — onayını bekliyorum"); console.log(L.join("\n")); provaUyari("siparis-teslim " + stkSiparisKod(o) + (oArg ? " --odeme=" + oArg : "") + (havuz === "dukkan" ? " --dukkan" : "")); return; }
    sipKaliciYap(x);
    const s = stkSiparisTeslim(store, o, tur, havuz, stkA(), true);
    L.push("**KAYDEDİLDİ** — Belge " + s.sale.belgeNo);
    console.log(L.join("\n"));
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI - Belge " + s.sale.belgeNo + " · " + money(s.sale.toplam) + " · kar " + money(s.sale.toplam - s.sale.maliyet) + " (" + karOrani(s.sale.toplam, s.sale.maliyet) + ") · yedek: " + path.basename(y.yedek));
    sipDurumSonuc(await sipDurumYaz([o]), 1);
    return;
  }

  /* ---------- siparis-kapat: satış AÇMADAN "halledildi" diye kapat ----------
     Sipariş zaten elle satışa girilmişse. siparis-kapat <kod> [<kod>...] [--not="..."]  ya da  --eski=GUN (GUN günden eski hepsi). */
  if (komut === "siparis-kapat") {
    const t = await sipOku();
    const eskiGun = bayrak("eski");
    let secilen;
    if (eskiGun != null) {
      if (!(sayi(eskiGun) >= 0)) throw new Error("--eski=GUN (ornek --eski=3: 3 gunden eski bekleyenlerin hepsi)");
      secilen = t.liste.filter((x) => x.o.durum !== "teslim" && stkSiparisYasSaat(x.o) >= sayi(eskiGun) * 24);
    } else {
      if (!pos[1]) throw new Error("Kullanim: siparis-kapat <kod> [<kod>...]   ya da   siparis-kapat --eski=GUN");
      secilen = pos.slice(1).map((k) => sipBul(t.liste, k));
    }
    secilen = secilen.filter((x, i) => secilen.indexOf(x) === i);
    if (secilen.some((x) => x.o.durum === "teslim")) throw new Error("Secilenlerden biri zaten kapali.");
    if (!secilen.length) { console.log("Kapatılacak bekleyen sipariş yok."); return; }
    const not = bayrak("not") || "Satışı ayrıca girildi";
    const L = ["Satış AÇILMADAN kapatılacak siparişler (" + secilen.length + ") — stok ve bakiye DEĞİŞMEZ, çay ocağı \"teslim edildi\" görür:", ""];
    secilen.forEach((x) => {
      const o = x.o, f = sipSonrakiFisler(o);
      L.push("  [" + stkSiparisKod(o) + "] " + o.dealer + " · " + new Date(o.tarih).toLocaleDateString("tr-TR") + " (" + stkYasMetin(stkSiparisYasSaat(o)) + ") · " + money(o.toplam) + " · " + (o.items || []).map((l) => stkAdet(l.adet) + " " + l.ad).join(", "));
      L.push(f.length ? "        siparişten sonraki fişleri: " + f.map((s) => s.belgeNo + " " + new Date(s.tarih).toLocaleDateString("tr-TR") + " " + money(s.toplam)).join(" · ")
                      : "        ! siparişten sonra bu müşteriye kesilmiş fiş YOK — gerçekten teslim edildi mi? (edilmediyse siparis-teslim)");
    });
    L.push("", "Not: " + not);
    console.log(L.join("\n"));
    if (!kaydet) { provaUyari("siparis-kapat " + (eskiGun != null ? "--eski=" + eskiGun : secilen.map((x) => stkSiparisKod(x.o)).join(" "))); return; }
    const simdi = new Date().toISOString();
    secilen.forEach((x) => { sipKaliciYap(x); stkSiparisKapat(x.o, not, simdi); });
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · " + secilen.length + " sipariş kapatıldı · yedek: " + path.basename(y.yedek));
    sipDurumSonuc(await sipDurumYaz(secilen.map((x) => x.o)), secilen.length);
    return;
  }

  /* ---------- siparis-esitle: paneldeki durumu çay ocağının tablosuna yeniden gönder ---------- */
  if (komut === "siparis-esitle") {
    const t = await sipOku();
    if (t.hata) throw new Error("Siparis tablosu okunamadi: " + t.hata);
    const farkli = t.liste.filter((x) => !x.yeniGelen && x.o.orderId && x.tabloDurum && x.tabloDurum !== x.o.durum);
    if (!farkli.length) { console.log("Çay ocağının gördüğü durumlar panelle aynı — yapılacak bir şey yok."); return; }
    farkli.forEach((x) => console.log("  [" + stkSiparisKod(x.o) + "] " + x.o.dealer + ": çay ocağı \"" + x.tabloDurum + "\" görüyor -> \"" + x.o.durum + "\" yazılacak"));
    if (!kaydet) { provaUyari("siparis-esitle"); return; }
    sipDurumSonuc(await sipDurumYaz(farkli.map((x) => x.o)), farkli.length);
    return;
  }

  return "yok";
  }

  /* ---------- sayim: sayılan miktarı MUTLAK değer olarak yaz ----------
     { "arac": { "<urun>": 6, ... }, "dukkan": { ... } }   ya da   { "havuz": "arac", "kalemler": [{ "urun": "..", "adet": 6 }] }
     Listede olmayan ürün değişmez. Farklar stok hareketlerine "Sayım Düzeltme" diye işlenir. */
  if (komut === "sayim") {
    const girdi = jsonGirdi(pos[1], "Sayim");
    const ham = [];
    ["dukkan", "arac"].forEach((h) => { const o = girdi[h]; if (o && typeof o === "object") Object.keys(o).forEach((ad) => ham.push({ havuz: h, urun: ad, adet: o[ad] })); });
    if (Array.isArray(girdi.kalemler)) { const h = girdi.havuz === "dukkan" ? "dukkan" : girdi.havuz === "arac" ? "arac" : null; if (!h) throw new Error('"havuz": "dukkan" | "arac" gerekli.'); girdi.kalemler.forEach((k) => ham.push({ havuz: h, urun: k.urun, adet: k.adet })); }
    if (!ham.length) throw new Error('Sayimda kalem yok. Ornek: {"arac": {"Coca-Cola": 6}, "dukkan": {"Coca-Cola": 12}}');
    const gorulen = {};
    const satirlar = ham.map((k) => {
      const p = urunBul(store, k.urun), yeni = sayi(k.adet);
      if (k.adet === "" || k.adet == null || isNaN(yeni)) throw new Error('"' + p.ad + '" icin sayilan miktar gecersiz.');
      if (gorulen[k.havuz + p.id]) throw new Error('"' + p.ad + '" ' + havuzAd(k.havuz) + " sayiminda iki kez yazilmis.");
      gorulen[k.havuz + p.id] = true;
      return { p: p, havuz: k.havuz, eski: Number(p[k.havuz === "arac" ? "aracStok" : "stok"]) || 0, yeni: yeni };
    });
    const L = ["# Stok sayımı — sayılan miktar kayıtlı stoğun YERİNE yazılır", ""];
    ["dukkan", "arac"].forEach((h) => {
      const hs = satirlar.filter((x) => x.havuz === h); if (!hs.length) return;
      const deg = hs.filter((x) => x.eski !== x.yeni);
      L.push("## " + havuzAd(h).toLocaleUpperCase("tr-TR") + " — " + hs.length + " ürün sayıldı, " + deg.length + " tanesi değişecek", "");
      if (deg.length) {
        L.push("| Ürün | Kayıtlı | Sayılan | Fark |", "|---|---:|---:|---:|");
        deg.forEach((x) => L.push("| " + x.p.ad + " | " + stkAdet(x.eski) + " | **" + stkAdet(x.yeni) + "** | " + isaretli(x.yeni - x.eski) + " |"));
        L.push("");
      }
      if (hs.length - deg.length) L.push("Değişmeyen (sayılan = kayıtlı): " + hs.filter((x) => x.eski === x.yeni).map((x) => x.p.ad).join(", "), "");
      if (hs.some((x) => x.yeni < 0)) L.push("! Sayılan miktar eksi olamaz — kontrol et.", "");
    });
    L.push("Listede olmayan ürünlere dokunulmaz.");
    console.log(L.join("\n"));
    if (!kaydet) { provaUyari("sayim <dosya.json>"); return; }
    const yazilan = stkStokYaz(store, satirlar.map((x) => ({ urunId: x.p.id, havuz: x.havuz, yeni: x.yeni })), stkA());
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · " + yazilan.length + " stok düzeltildi · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- eksi-stok: eksi görünen stokları listele; --sifirla ile 0 yap ---------- */
  if (komut === "eksi-stok") {
    const havuz = args.includes("--arac") ? "arac" : args.includes("--dukkan") ? "dukkan" : null;
    const liste = stkEksiler(store, havuz), sifirla = args.includes("--sifirla");
    if (!liste.length) { console.log("Eksi stok yok" + (havuz ? " (" + havuzAd(havuz) + ")" : "") + "."); return; }
    const top = (h) => liste.filter((x) => x.havuz === h);
    const L = ["# Eksi stoklar — dükkan " + top("dukkan").length + " ürün (" + stkAdet(top("dukkan").reduce((a, x) => a + x.miktar, 0)) + ") · araç " + top("arac").length + " ürün (" + stkAdet(top("arac").reduce((a, x) => a + x.miktar, 0)) + ")", ""];
    L.push(sifirla ? "| Ürün | Havuz | Kayıtlı | Olacak |" : "| Ürün | Havuz | Kayıtlı |", sifirla ? "|---|---|---:|---:|" : "|---|---|---:|");
    liste.sort((a, b) => a.miktar - b.miktar).forEach((x) => L.push("| " + x.p.ad + " | " + havuzAd(x.havuz) + " | " + stkAdet(x.miktar) + (sifirla ? " | **0** |" : " |")));
    L.push("", "_Stok eksi olamaz: mal girişi kaydedilmeden satıldığı için birikmiş. Gerçek miktarı biliyorsan `sayim` ile yaz;_", "_bilmiyorsan `eksi-stok --sifirla` hepsini 0 yapar (sonraki alımlar doğru saysın diye)._");
    console.log(L.join("\n"));
    if (!sifirla) return;
    if (!kaydet) { provaUyari("eksi-stok --sifirla" + (havuz ? " --" + havuz : "")); return; }
    const yazilan = stkStokYaz(store, liste.map((x) => ({ urunId: x.p.id, havuz: x.havuz, yeni: 0 })), Object.assign(stkA(), { tur: "Eksi Stok Sıfırlama" }));
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · " + yazilan.length + " eksi stok sıfırlandı · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- aktar: dükkan ↔ araç (bir havuzdan düşer, diğerine eklenir) ----------
     aktar "<urun>" <adet> [--dukkana]     ya da     aktar '{"yon":"araca","kalemler":[{"urun":"..","adet":5}]}' */
  if (komut === "aktar") {
    let kalemHam, yon = args.includes("--dukkana") ? "dukkana" : "araca";
    if (pos[1] && (/^\s*\{/.test(pos[1]) || fs.existsSync(pos[1]))) { const g = jsonGirdi(pos[1], "Aktarma"); kalemHam = g.kalemler || []; if (g.yon === "dukkana" || g.yon === "araca") yon = g.yon; }
    else kalemHam = [{ urun: pos[1], adet: pos[2] }];
    const kalemler = kalemHam.map((k) => { const p = urunBul(store, k.urun), adet = sayi(k.adet); if (!(adet > 0)) throw new Error('"' + p.ad + '" icin adet gecersiz.'); return { p: p, adet: adet }; });
    if (!kalemler.length) throw new Error('Kullanim: aktar "<urun>" <adet> [--dukkana]');
    const L = [(yon === "araca" ? "DÜKKAN -> ARAÇ" : "ARAÇ -> DÜKKAN") + " aktarma", "", "| Adet | Ürün | Dükkan | Araç |", "|---:|---|---:|---:|"];
    const eksiye = [];
    kalemler.forEach((k) => {
      const d = Number(k.p.stok) || 0, a = Number(k.p.aracStok) || 0, i = yon === "araca" ? -1 : 1;
      L.push("| " + stkAdet(k.adet) + " | " + k.p.ad + " | " + stkAdet(d) + " → " + stkAdet(d + i * k.adet) + " | " + stkAdet(a) + " → " + stkAdet(a - i * k.adet) + " |");
      if ((yon === "araca" ? d : a) - k.adet < 0) eksiye.push(k.p.ad);
    });
    if (eksiye.length) L.push("", "! " + (yon === "araca" ? "Dükkan" : "Araç") + " stoğu eksiye düşecek: " + eksiye.join(", ") + " — kayıtlı stok yanlış olabilir (önce `sayim`).");
    console.log(L.join("\n"));
    if (!kaydet) { provaUyari("aktar ..."); return; }
    stkAktar(store, kalemler.map((k) => ({ urunId: k.p.id, adet: k.adet })), yon, stkA());
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · " + kalemler.length + " ürün aktarıldı · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- alinacaklar: azalan ürünler, önerilen miktarla ---------- */
  if (komut === "alinacaklar") {
    const r = stkAlinacaklar(store, { hafta: sayi(bayrak("hafta") || 0), hedefHafta: sayi(bayrak("hedef") || 0) });
    if (args.includes("--metin")) { console.log(stkAlinacakMetin(r)); return; }
    const L = ["# Alınacaklar — " + new Date().toLocaleDateString("tr-TR"), ""];
    if (r.eksiSayisi) L.push("> ⚠ **Bu liste güvenilir DEĞİL:** " + r.eksiSayisi + " üründe kayıtlı stok eksi (mal girişi kaydedilmemiş). Eksi stok 0 sayıldı; doğru liste için önce sayım yap (`eksi-stok`, `sayim`).", "");
    L.push("_Son " + r.hafta + " haftanın satış hızına göre; dükkan + araç toplamı " + r.hedefHafta + " haftalık satışın altına düşenler (ya da kritik seviyeye inenler)._", "");
    if (!r.satirlar.length) { L.push("Alınacak ürün görünmüyor."); console.log(L.join("\n")); return; }
    L.push("| Al | Ürün | Haftada satılan | Dükkan | Araç | Tahmini tutar |", "|---:|---|---:|---:|---:|---:|");
    let grup = null;
    r.satirlar.forEach((x) => {
      const g = x.p.grup || "Diğer";
      if (g !== grup) { grup = g; L.push("| | **" + g + "** | | | | |"); }
      L.push("| **" + stkAdet(x.oneri) + "** " + (x.p.birim || "Adet") + " | " + x.p.ad + (x.eksi ? " ⚠" : "") + " | " + stkAdet(Math.round(x.haftalik * 10) / 10) + " | " + stkAdet(x.dukkan) + " | " + stkAdet(x.arac) + " | " + (x.tutar ? stkPara(x.tutar) : "—") + " |");
    });
    L.push("| | **" + r.satirlar.length + " ürün** | | | | **" + stkPara(r.tutar) + "** |", "", "⚠ = bu ürünün kayıtlı stoğu eksi · paylaşılacak düz liste için `alinacaklar --metin`");
    console.log(L.join("\n"));
    return;
  }

  /* ---------- kritik-oner: satış hızından kritik seviye önerisi ---------- */
  if (komut === "kritik-oner") {
    const hafta = sayi(bayrak("hafta") || 0) || stkAyar().hizHafta, gun = sayi(bayrak("gun") || 0) || stkAyar().kritikGun, hepsi = args.includes("--hepsi");
    const liste = stkKritikOneri(store, { hafta: hafta, gun: gun });
    const yazilacak = liste.filter((x) => hepsi || x.eski == null);
    console.log("# Kritik seviye önerisi\n\n_Son " + hafta + " haftanın satışına göre: elde (dükkan + araç) " + gun + " günlük mal kalınca uyarı verilsin._\n");
    if (!liste.length) { console.log("Önerilecek değişiklik yok."); return; }
    const L = ["| Ürün | Haftada satılan | Şimdiki kritik | Önerilen | |", "|---|---:|---:|---:|---|"];
    liste.forEach((x) => L.push("| " + x.p.ad + " | " + stkAdet(Math.round(x.haftalik * 10) / 10) + " | " + (x.eski == null ? "—" : stkAdet(x.eski)) + " | **" + stkAdet(x.oneri) + "** | " + (hepsi || x.eski == null ? "yazılacak" : "elle girilmiş, dokunulmaz") + " |"));
    L.push("", yazilacak.length + " üründe kritik seviye yazılacak" + (hepsi ? "" : " (elle girilmişleri de değiştirmek için --hepsi)") + ".");
    console.log(L.join("\n"));
    if (!yazilacak.length) return;
    if (!kaydet) { provaUyari("kritik-oner" + (hepsi ? " --hepsi" : "")); return; }
    const n = stkKritikUygula(liste, hepsi);
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · " + n + " üründe kritik seviye yazıldı · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- toplu-zam: gruba / seçilen ürünlere yüzde ya da tutar zam ----------
     toplu-zam (--grup="Su" | --urun="A" [--urun="B"...] | --hepsi) (--yuzde=10 | --tutar=5 | --yeni=300)
               [--yuvarla=5] [--yukari|--asagi] [--ozel]
     Seçilen ürünün fiyat ailesi (aynı çeşit + aynı liste fiyatı) birlikte taşınır. --ozel: müşterilerin özel
     fiyatları da aynı kuralla artar (yazılmazsa özel fiyatlara dokunulmaz). */
  if (komut === "toplu-zam") {
    const grup = bayrak("grup"), urunAd = bayraklar("urun"), hepsi = args.includes("--hepsi");
    if ([!!grup, urunAd.length > 0, hepsi].filter(Boolean).length !== 1) throw new Error('Neye zam? Birini sec: --grup="Su"  |  --urun="..." (birden cok yazilabilir)  |  --hepsi');
    const turler = [["yuzde", bayrak("yuzde")], ["tutar", bayrak("tutar")], ["yeni", bayrak("yeni")]].filter((x) => x[1] != null);
    if (turler.length !== 1) throw new Error("Ne kadar? Birini sec: --yuzde=10  |  --tutar=5  |  --yeni=300 (yeni liste fiyati)");
    const tur = turler[0][0], deger = sayi(turler[0][1]);
    if (isNaN(deger) || (tur === "yeni" && !(deger > 0))) throw new Error("Zam degeri gecersiz.");
    if (tur === "yeni" && !urunAd.length) throw new Error("--yeni yalniz --urun ile kullanilir (tek aileye yeni fiyat).");
    let grupAd = null;
    if (grup) { const gl = [...new Set(store.products.map((p) => p.grup || ""))].filter((g) => norm(g) === norm(grup)); if (!gl.length) throw new Error('Grup bulunamadi: "' + grup + '". Gruplar: ' + [...new Set(store.products.map((p) => p.grup || ""))].filter(Boolean).join(", ")); grupAd = gl[0]; }
    const idler = urunAd.length ? urunAd.map((a) => urunBul(store, a).id) : null;
    const yuv = bayrak("yuvarla") != null ? sayi(bayrak("yuvarla")) : 0;
    if (isNaN(yuv) || yuv < 0) throw new Error("--yuvarla= 0.5 | 1 | 5 | 10 ...");
    const yon = args.includes("--yukari") ? "yukari" : args.includes("--asagi") ? "asagi" : "yakin";
    const plan = stkZamPlan(store, { urunIdler: idler, grup: grupAd, tur: tur, deger: deger, yuvarla: yuv, yon: yon, ozel: args.includes("--ozel") ? "ayni" : "dokunma" });
    const tanim = (tur === "yuzde" ? "%" + stkAdet(deger) : tur === "tutar" ? isaretli(deger) + " ₺" : "yeni fiyat " + stkPara(deger)) + (yuv ? " · " + stkAdet(yuv) + " ₺'ye " + (yon === "yukari" ? "yukarı" : yon === "asagi" ? "aşağı" : "en yakına") + " yuvarla" : "");
    const L = ["# Toplu zam — " + (grupAd ? "grup: " + grupAd : hepsi ? "TÜM ürünler" : urunAd.length + " ürün (+ aileleri)") + " · " + tanim, ""];
    if (!plan.urunler.length) { L.push("Fiyatı değişecek ürün yok."); console.log(L.join("\n")); return; }
    L.push("| Ürün | Eski | Yeni | Kâr | |", "|---|---:|---:|---:|---|");
    plan.urunler.forEach((u) => L.push("| " + u.p.ad + " | " + stkPara(u.eski) + " | **" + stkPara(u.yeni) + "** | " + (u.alis > 0 ? stkYuzde(u.marj) : "—") + " | " + [u.aileden ? "ailesiyle birlikte" : "", u.zarar ? "⚠ ALIŞIN ALTINDA" : ""].filter(Boolean).join(" · ") + " |"));
    L.push("", plan.urunler.length + " ürünün liste fiyatı değişecek.");
    if (plan.ozel.length) {
      L.push("", "## Özel fiyatlar da aynı kuralla değişecek (" + plan.ozel.length + ")", "", "| Müşteri | Ürün | Eski | Yeni |", "|---|---|---:|---:|");
      plan.ozel.forEach((o) => L.push("| " + o.c.ad + " | " + o.p.ad + " | " + stkPara(o.eski) + " | **" + stkPara(o.yeni) + "** |"));
    } else if (plan.ozelSayisi) L.push("", "Özel fiyatlar: " + plan.ozelSayisi + " özel fiyat " + (args.includes("--ozel") ? "değişmiyor (yuvarlama sonrası aynı)." : "DEĞİŞMEYECEK — o müşteriler eski fiyattan almaya devam eder. Onlar da artsın istersen --ozel ekle."));
    plan.uyarilar.forEach((u) => L.push("", "⚠ " + u));
    console.log(L.join("\n"));
    if (!kaydet) { provaUyari("toplu-zam ... (aynı bayraklarla)"); return; }
    const n = stkZamUygula(store, plan, Object.assign(stkA(), { kaynak: "Toplu zam (" + tanim + ")" }));
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · " + n.urun + " liste fiyatı" + (n.ozel ? " + " + n.ozel + " özel fiyat" : "") + " değişti · yedek: " + path.basename(y.yedek));
    return;
  }

  /* ---------- fiyat-kontrol: zararına / düşük kârlı / bakımsız fiyatlar ---------- */
  if (komut === "fiyat-kontrol") {
    const esik = bayrak("esik") != null ? sayi(bayrak("esik")) : stkMarjEsik(store);
    const k = stkFiyatKontrol(store, esik), L = ["# Fiyat kontrol — kâr eşiği " + stkYuzde(esik), ""];
    const bolum = (bas, arr, baslik, satir) => { L.push("## " + bas + " (" + arr.length + ")", ""); if (!arr.length) { L.push("_Yok._", ""); return; } L.push(baslik[0], baslik[1]); arr.forEach((x) => L.push(satir(x))); L.push(""); };
    bolum("Zararına satılan: satış ≤ alış", k.zarar, ["| Ürün | Alış | Satış | Kâr |", "|---|---:|---:|---:|"], (x) => "| " + x.p.ad + " | " + stkPara(x.p.alis) + " | " + stkPara(x.p.satis) + " | " + stkYuzde(x.marj) + " |");
    bolum("Kârı düşük ürünler", k.dusuk, ["| Ürün | Alış | Satış | Kâr |", "|---|---:|---:|---:|"], (x) => "| " + x.p.ad + " | " + stkPara(x.p.alis) + " | " + stkPara(x.p.satis) + " | " + stkYuzde(x.marj) + " |");
    bolum("Kârı düşük özel fiyatlar", k.ozelDusuk, ["| Müşteri | Ürün | Alış | Özel fiyat | Kâr |", "|---|---|---:|---:|---:|"], (x) => "| " + x.c.ad + " | " + x.p.ad + " | " + stkPara(x.p.alis) + " | " + stkPara(x.fiyat) + " | " + stkYuzde(x.marj) + (x.zarar ? " ⚠ zarar" : "") + " |");
    L.push("## Özel fiyatı liste fiyatından yüksek (" + k.ozelYuksek.reduce((a, x) => a + x.musteriler.length, 0) + " müşteri fiyatı, " + k.ozelYuksek.length + " ürün ailesi)", "");
    if (!k.ozelYuksek.length) L.push("_Yok._", "");
    else {
      L.push("_Müşteri listeden pahalıya alıyorsa liste fiyatı eskimiş demektir._", "");
      k.ozelYuksek.forEach((x) => {
        L.push("- **" + x.urunler[0].ad + "**" + (x.urunler.length > 1 ? " (+" + (x.urunler.length - 1) + " çeşit, aynı aile)" : "") + " — liste " + stkPara(x.liste) + " · " + x.musteriler.map((m) => m.c.ad + " " + stkPara(m.fiyat)).join(" · "));
        if (x.oneri != null) L.push("  öneri: liste fiyatını **" + stkPara(x.oneri) + "** yap (" + x.oneriSayi + " müşteri zaten bu fiyattan alıyor) → `toplu-zam --urun=\"" + x.urunler[0].ad + "\" --yeni=" + x.oneri + "`  _(özel fiyatı olmayan herkes yeni fiyattan alır)_");
      });
      L.push("");
    }
    if (k.alisYok.length) L.push("_Alış fiyatı girilmemiş " + k.alisYok.length + " üründe kâr hesaplanamadı: " + k.alisYok.slice(0, 8).map((x) => x.p.ad).join(", ") + (k.alisYok.length > 8 ? " …" : "") + "_");
    console.log(L.join("\n"));
    return;
  }

  /* ---------- fiyat-gecmisi [urun]: alış / satış / özel fiyat ne zaman neyden neye değişti ---------- */
  if (komut === "fiyat-gecmisi") {
    const ara = pos.slice(1).join(" ");
    const liste = (store.fiyatGecmisi || []).filter((g) => !ara || norm(g.ad).includes(norm(ara))).slice().sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
    if (!liste.length) { console.log("Fiyat değişikliği kaydı yok" + (ara ? ' ("' + ara + '")' : "") + ". (Geçmiş, bu sürümden sonraki değişiklikleri tutar.)"); return; }
    const L = ["# Fiyat geçmişi" + (ara ? " — " + ara : ""), "", "| Tarih | Ürün | Ne | Eski | Yeni | Kaynak |", "|---|---|---|---:|---:|---|"];
    liste.slice(0, 80).forEach((g) => { const c = g.musteriId && store.customers.find((x) => x.id === g.musteriId); L.push("| " + new Date(g.tarih).toLocaleDateString("tr-TR") + " | " + g.ad + " | " + (g.alan === "alis" ? "alış" : g.alan === "ozel" ? "özel fiyat" + (c ? " (" + c.ad + ")" : "") : "satış") + " | " + stkPara(g.eski) + " | " + stkPara(g.yeni) + " | " + (g.kaynak || "") + " |"); });
    if (liste.length > 80) L.push("", "... " + (liste.length - 80) + " kayıt daha");
    console.log(L.join("\n"));
    return;
  }

  /* ---------- alislar / sil-alim: alış kayıtları ---------- */
  if (komut === "alislar") {
    const liste = (store.purchases || []).slice().sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
    if (!liste.length) { console.log("Alış kaydı yok."); return; }
    const L = ["# Alış kayıtları (" + liste.length + ")", "", "| Tarih | No | Firma | Nereye | Ödeme | Kalem | Tutar |", "|---|---|---|---|---|---:|---:|"];
    liste.slice(0, 40).forEach((p) => { const f = p.firmaId && (store.firmalar || []).find((x) => x.id === p.firmaId); L.push("| " + new Date(p.tarih).toLocaleDateString("tr-TR") + " | " + (p.no || "-") + " | " + (f ? f.ad : "—") + " | " + havuzAd(p.hedef) + " | " + (p.odeme === "veresiye" ? "veresiye" : "peşin" + (p.odemeTuru ? " · " + p.odemeTuru : "")) + " | " + (p.items || []).length + " | " + stkPara(p.toplam) + " |"); });
    L.push("", "**Toplam: " + stkPara(liste.reduce((a, p) => a + (Number(p.toplam) || 0), 0)) + "**");
    console.log(L.join("\n"));
    return;
  }
  if (komut === "sil-alim") {
    const adaylar = (store.purchases || []).filter((p) => String(p.no) === String(pos[1]));
    if (!adaylar.length) throw new Error("Alis kaydi bulunamadi: " + pos[1] + " ('alislar' komutu numaralari gosterir)");
    if (adaylar.length > 1) throw new Error("Bu numarayla " + adaylar.length + " alis kaydi var; panelden sil.");
    const p = adaylar[0], alan = p.hedef === "arac" ? "aracStok" : "stok";
    console.log("SILINECEK ALIŞ: " + p.no + " · " + new Date(p.tarih).toLocaleDateString("tr-TR") + " · " + money(p.toplam) + " · " + havuzAd(p.hedef) + " stoğundan geri alınacak:");
    (p.items || []).forEach((it) => { const pr = it.urunId && store.products.find((x) => x.id === it.urunId); console.log("  " + stkAdet(it.adet) + " x " + it.ad + (pr ? "   stok " + stkAdet(pr[alan]) + " -> " + stkAdet((Number(pr[alan]) || 0) - it.adet) : "   (ürün kartı yok)")); });
    console.log("Alış fiyatları geri alınmaz (gerekirse urun-fiyat ile düzelt).");
    if (!kaydet) { provaUyari("sil-alim " + p.no); return; }
    stkAlimSil(store, p.id);
    const y = await storeYaz(store, updatedAt);
    console.log("\nSILINDI · yedek: " + path.basename(y.yedek));
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
    if (fiyat == null) fiyat = stkIadeFiyat(store, c.id, p).fiyat;   // panelin iade ekranıyla aynı kural
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
    /* Kayıt panelin "Ürün İadesi Al" ekranıyla ortak işlevden geçer (stkIadeKaydet) — iki yol aynı sonucu verir. */
    const belgeNo = stkIadeKaydet(store, { musteriId: c.id, urunId: p.id, adet: adet, fiyat: fiyat, havuz: kaynak }, stkA()).sale.belgeNo;
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
    /* Kâr uyarısı: bu değişiklikten sonra ürünün ya da özel fiyatlı müşterilerin kârı eşiğin altına düşüyor mu? */
    {
      const esik = bayrak("esik") != null ? sayi(bayrak("esik")) : stkMarjEsik(store);
      const sanal = alan === "alis" ? store : Object.assign({}, store, { products: store.products.map((x) => (x.id === p.id ? Object.assign({}, x, { satis: yeni }) : x)) });
      const etki = stkMarjEtki(sanal, { [p.id]: alan === "alis" ? yeni : Number(p.alis) || 0 }, esik);
      const metin = stkMarjMetin(alan === "alis" ? etki : etki.map((e) => Object.assign({}, e, { musteriler: [] })).filter((e) => e.dusuk), esik);
      if (metin.length) console.log("\n" + metin.join("\n"));
      const kardes = alan === "satis" ? aile(store, p).filter((x) => x.id !== p.id) : [];
      if (kardes.length && yeni !== Number(p.satis)) console.log("\nℹ Bu ürün \"" + (p.altKategori || "").trim() + "\" ailesinden AYRILIR (kardeşleri " + money(p.satis) + " kalır: " + kardes.map((x) => x.ad).join(", ") + ").\n  Aileyi birlikte taşımak için: toplu-zam --urun=\"" + p.ad + "\" --yeni=" + yeni);
    }
    if (!kaydet) { provaUyari('urun-fiyat "' + p.ad + '" ' + alan + " " + yeni); return; }
    const pr = store.products.find((x) => x.id === p.id);
    stkFiyatGecmis(store, stkA(), { urunId: pr.id, ad: pr.ad, alan: alan, eski: pr[alan], yeni: yeni, kaynak: "urun-fiyat" });
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
