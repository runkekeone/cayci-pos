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
 *   node babuco.js musteritablo [YYYY-AA-GG] [--tutar]  Günün satış şablonu (uğrama sırasına göre)
 *   node babuco.js kasa [YYYY-AA-GG] [--hesaba=ad,ad]  Gün sonu: para tipi, gider, maliyet, kâr, ciro
 *   node babuco.js urun [arama]                Ürün ara (satış/alış fiyatı, stok)
 *   node babuco.js satis <dosya.json|json>     Satış gir            (--kaydet)
 *                                              Önce Markdown FİŞ basar (kullanıcı onaylasın diye);
 *                                              eski düz metin özet için --duz.
 *   node babuco.js alim <dosya.json|json>      Mal girişi: stok ekle (--kaydet)
 *   node babuco.js tahsilat <musteri> <tutar> [not]                 (--kaydet)
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

/* ---------- rapor (panelin Gunluk/Urunsel/Grupsal hesabiyla ayni) ---------- */
function raporMd(store, gun, updatedAt) {
  const inR = (iso) => iso && localDateStr(new Date(iso)) === gun;
  const cust = (id) => (store.customers.find((c) => c.id === id) || {}).ad || "(perakende)";
  const sales = store.sales.filter((s) => inR(s.tarih)).sort((a, b) => a.tarih.localeCompare(b.tarih));
  const sum = (fn) => sales.reduce((a, s) => a + (Number(fn(s)) || 0), 0);
  const nakit = sum((s) => s.odeme.nakit), pos = sum((s) => s.odeme.pos), acik = sum((s) => s.odeme.acik);
  const ciro = sum((s) => s.toplam), mal = sum((s) => s.maliyet);
  const gider = store.expenses.filter((e) => inR(e.tarih)).reduce((a, e) => a + (Number(e.tutar) || 0), 0);
  const gelir = store.incomes.filter((e) => inR(e.tarih)).reduce((a, e) => a + (Number(e.tutar) || 0), 0);
  const tahsilat = store.payments.filter((p) => inR(p.tarih)).reduce((a, p) => a + (Number(p.tutar) || 0), 0);
  const firmaOde = (store.firmaPayments || []).filter((p) => inR(p.tarih)).reduce((a, p) => a + (Number(p.tutar) || 0), 0);
  const nakitKasa = nakit + tahsilat + gelir - gider - firmaOde;

  const urun = {};
  sales.forEach((s) => s.items.forEach((it) => {
    const p = store.products.find((x) => x.id === it.urunId);
    const alis = p ? Number(p.alis) || 0 : 0, adet = Number(it.adet) || 0, fiyat = Number(it.fiyat) || 0;
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
  L.push("| **Nakit kasa** | **" + money(nakitKasa) + "** |", "");
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
  liste("Tahsilatlar", store.payments.filter((p) => inR(p.tarih)), (p) => cust(p.musteriId) + " — " + money(p.tutar) + (p.not ? " · " + p.not : ""));
  liste("Giderler", store.expenses.filter((e) => inR(e.tarih)), (e) => (e.kategori || "-") + " — " + money(e.tutar) + (e.not ? " · " + e.not : ""));
  liste("Gelirler", store.incomes.filter((e) => inR(e.tarih)), (e) => (e.tur || "-") + " — " + money(e.tutar) + (e.not ? " · " + e.not : ""));
  liste("Çay ocağından gelen siparişler", (store.gelenSiparisler || []).filter((o) => inR(o.tarih)), (o) => o.dealer + " — " + money(o.toplam) + " · durum: **" + o.durum + "**" + (o.saleId ? " (satışa işlendi)" : ""));
  liste("Servis (gün sonu) raporları", (store.servisRaporlari || []).filter((r) => inR(r.tarih)), (r) => saat(r.tarih) + " — ciro " + money(r.ciro) + ", kâr " + money(r.kar) + ", gider " + money(r.gider) + ", " + (r.ziyaret || 0) + " ziyaret, " + (r.km || 0) + " km");
  L.push("---", "_Kaynak: babuco bulut yedeği, son güncelleme " + new Date(updatedAt).toLocaleString("tr-TR") + "._");
  return L.join("\n");
}

/* ---------- satış: panelin kaydetSatis() mantığı ---------- */
function satisHazirla(store, girdi) {
  const c = girdi.musteri ? musteriBul(store, girdi.musteri) : null;
  const ozel = (c && c.ozelFiyatlar) || {};
  const kalemler = (girdi.kalemler || []).map((k) => {
    const p = urunBul(store, k.urun);
    const varsayilan = (ozel[p.id] != null && ozel[p.id] !== "") ? Number(ozel[p.id]) : (Number(p.satis) || 0);
    const fiyat = (k.fiyat != null && k.fiyat !== "") ? Number(k.fiyat) : varsayilan;
    const adet = Number(k.adet) || 0;
    if (adet <= 0) throw new Error('"' + p.ad + '" icin adet gecersiz.');
    return { p: p, ad: p.ad, urunId: p.id, adet: adet, fiyat: fiyat, alis: Number(p.alis) || 0, listeFiyat: Number(p.satis) || 0, ozelFiyat: ozel[p.id] != null ? Number(ozel[p.id]) : null };
  });
  if (!kalemler.length) throw new Error("Satista kalem yok.");
  const brut = kurus(kalemler.reduce((a, k) => a + k.adet * k.fiyat, 0));
  const iskonto = kurus(girdi.iskonto || 0);
  const toplam = kurus(brut - iskonto);
  const maliyet = kurus(kalemler.reduce((a, k) => a + k.alis * k.adet, 0));

  // Odeme: ya {nakit,pos,acik} ya da tip kisayolu ("nakit"|"pos"|"acik")
  let odeme = { nakit: 0, pos: 0, acik: 0 }, fazla = 0;
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
      fazla = kurus(n - nakitU + (p - posU));
    } else odeme = { nakit: n, pos: p, acik: 0 };
  } else throw new Error("Odeme belirtilmedi.");

  if (odeme.acik > 0.001 && !c) throw new Error("Acik hesap icin musteri sart.");
  if (fazla > 0.001 && !c) throw new Error("Fazla odeme borca yazilacak - musteri sart.");
  const kirilim = kurus(odeme.nakit + odeme.pos + odeme.acik - toplam);
  if (Math.abs(kirilim) > 0.01) throw new Error("Odeme kirilimi toplami tutmuyor (fark " + money(kirilim) + ").");

  const posSaf = odeme.pos > 0 && odeme.nakit === 0 && odeme.acik === 0;
  const komisyon = (posSaf && !girdi.odemeAdi) ? Math.round(toplam * 0.02 * 100) / 100 : 0;
  const tarih = girdi.tarih ? new Date(girdi.tarih) : new Date();
  return { c: c, kalemler: kalemler, brut: brut, iskonto: iskonto, toplam: toplam, maliyet: maliyet, odeme: odeme, fazla: fazla, komisyon: komisyon, tarih: tarih, girdi: girdi };
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
    items: h.kalemler.map((k) => ({ urunId: k.urunId, ad: k.ad, barkod: k.p.barkod || "", kdv: Number(k.p.kdv) || 0, fiyat: k.fiyat, adet: k.adet, iskyuzde: 0 })),
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
    store.payments.push({ id: genId(store), musteriId: h.c.id, tutar: h.fazla, not: "Satış üstü fazla ödeme → borca sayıldı (Belge " + belgeNo + ")", tarih: h.tarih.toISOString() });
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
    const sales = store.sales.filter((s) => inR(s.tarih));
    if (!sales.length) { console.log("Bu tarihte satış yok: " + gun); return; }
    const odemeler = store.payments.filter((p) => inR(p.tarih));
    const fazlaOde = odemeler.filter((p) => /fazla ödeme/i.test(p.not || ""));
    const digerTahsilat = odemeler.filter((p) => !/fazla ödeme/i.test(p.not || ""));

    const eldeSatir = [], hesapSatir = [];
    sales.forEach((s) => {
      const n = Number(s.odeme.nakit) || 0;
      if (n <= 0) return;
      const f = fazlaOde.filter((p) => String(p.not || "").indexOf(s.belgeNo) !== -1)
        .reduce((a, p) => a + (Number(p.tutar) || 0), 0);
      const ad = cust(s.musteriId);
      const kayit = { ad: ad, tutar: kurus(n + f) };
      (hesabaAdlar.some((h) => norm(ad).includes(h)) ? hesapSatir : eldeSatir).push(kayit);
    });
    const topla = (arr) => kurus(arr.reduce((a, x) => a + x.tutar, 0));
    const elde = topla(eldeSatir), hesaba = topla(hesapSatir);
    const posT = kurus(sales.reduce((a, s) => a + (Number(s.odeme.pos) || 0), 0));
    const acikT = kurus(sales.reduce((a, s) => a + (Number(s.odeme.acik) || 0), 0));
    const ciro = kurus(sales.reduce((a, s) => a + (Number(s.toplam) || 0), 0));
    const mal = kurus(sales.reduce((a, s) => a + (Number(s.maliyet) || 0), 0));
    const giderler = store.expenses.filter((e) => inR(e.tarih));
    const gider = kurus(giderler.reduce((a, e) => a + (Number(e.tutar) || 0), 0));
    const gelirler = store.incomes.filter((e) => inR(e.tarih));
    const gelir = kurus(gelirler.reduce((a, e) => a + (Number(e.tutar) || 0), 0));
    const komisyon = kurus(sales.reduce((a, s) => a + (Number(s.komisyon) || 0), 0));

    const p = gun.split("-"), L = [];
    L.push("# Kasa Özeti — " + p[2] + "." + p[1] + "." + p[0] + "\n");
    L.push("## Elimdeki para", "", "| Tip | Tutar |", "|---|---|");
    L.push("| **Nakit (elde)** | **" + money(kurus(elde + gelir - gider)) + "** |");
    if (hesaba) L.push("| Nakit (hesaba yatan) | " + money(hesaba) + " |");
    L.push("| Pos (hesaba geçecek) | " + money(posT) + (komisyon ? " · komisyon " + money(komisyon) : "") + " |");
    L.push("| Açık hesap (alacak) | " + money(acikT) + " |");
    L.push("| **Günün toplam tahsilatı** | **" + money(kurus(elde + hesaba + posT)) + "** |", "");
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
    if (gelir) L.push("| Gelir | " + money(gelir) + " |");
    L.push("| **Kâr (ürün)** | **" + money(kurus(ciro - mal)) + "** · " + karOrani(ciro, mal) + " |");
    L.push("| **Net kâr (gider sonrası)** | **" + money(kurus(ciro - mal - gider + gelir)) + "** |", "");
    if (giderler.length) {
      L.push("### Giderler", "");
      giderler.forEach((e) => L.push("- " + (e.kategori || "-") + " — " + money(e.tutar) + (e.not ? " · " + e.not : "")));
      L.push("");
    }
    if (digerTahsilat.length) {
      L.push("> **Dikkat:** aşağıdaki tahsilat kayıtları satışa bağlı değil, bugün elden para girişi sayılmadı:");
      digerTahsilat.forEach((x) => L.push("> - " + cust(x.musteriId) + " · " + money(x.tutar) + " · " + (x.not || "-")));
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
    if (!(tutar > 0)) throw new Error("Tutar gecersiz.");
    const not = pos.slice(3).join(" ") || "Saha tahsilat";
    const eski = customerBorc(store, c.id);
    console.log(c.ad + " — tahsilat " + money(tutar) + "\nBakiye: " + money(eski) + " -> " + money(kurus(eski - tutar)) + "\nNot: " + not);
    if (!kaydet) { provaUyari('tahsilat "' + c.ad + '" ' + tutar); return; }
    store.payments.push({ id: genId(store), musteriId: c.id, tutar: tutar, not: not, tarih: new Date().toISOString() });
    const y = await storeYaz(store, updatedAt);
    console.log("\nKAYDEDILDI · yedek: " + path.basename(y.yedek));
    return;
  }

  if (komut === "gider" || komut === "gelir") {
    const tutar = kurus(String(pos[1]).replace(",", "."));
    if (!(tutar > 0)) throw new Error("Tutar gecersiz.");
    const aciklama = pos[2] || "";
    if (!aciklama) throw new Error("Aciklama gerekli.");
    const etiket = pos[3] || (komut === "gider" ? "Genel" : "Diger");
    console.log((komut === "gider" ? "Gider" : "Gelir") + ": " + money(tutar) + " · " + aciklama + " · " + etiket);
    if (!kaydet) { provaUyari(komut + " " + tutar + ' "' + aciklama + '"'); return; }
    const kayit = { id: genId(store), tutar: tutar, not: aciklama, tarih: new Date().toISOString() };
    if (komut === "gider") { kayit.kategori = etiket; store.expenses.push(kayit); }
    else { kayit.tur = etiket; kayit.odeme = "Nakit"; store.incomes.push(kayit); }
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

  console.log("Bilinmeyen komut: " + komut + "\nKomutlar: durum | rapor | musteri | urun | satis | tahsilat | gider | gelir | sil-satis | siparisler");
})().catch((e) => { console.error("\nHATA: " + e.message); process.exit(1); });
