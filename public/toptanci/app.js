/* babu.co — işletme paneli · tüm sayfalar çalışır (localStorage, internetsiz) */

/* ============ Veri katmanı ============ */
const STORE_KEY = "benimpos-app-v1";
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const num2 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
// CSV dışa aktarmada para sütunları: hep 2 haneli (1.234,50), Türkçe Excel sayı olarak okusun diye simgesiz.
const csvTutar = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* Para hesaplarını kuruşa yuvarla. Kayan noktalı toplamlar 1848.1499999999996 gibi
   artıklar bırakıyor; bakiye/ödeme hesapları bundan geçirilir. */
function kurus(n) { return Math.round((Number(n) || 0) * 100) / 100; }
const yuzde1 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/* Kâr marjı: kârın ciroya oranı — "100 ₺ sattım, kaçı kâr kaldı".
   Ciro yoksa yüzde anlamsız, "—" döner (sıfıra bölme de olmaz). */
function karOrani(ciro, maliyet) {
  const c = Number(ciro) || 0;
  if (c <= 0) return "—";
  return "%" + yuzde1.format(((c - (Number(maliyet) || 0)) / c) * 100);
}

function emptyStore() {
  return {
    products: [], customers: [], sales: [], payments: [], tsiparisler: [],
    groups: [], firmalar: [], purchases: [], firmaPayments: [],
    expenses: [], incomes: [], personeller: [], gorevler: [],
    odemeTipleri: [], stokSayimlari: [], efaturalar: [], iadeler: [],
    stokHareket: [], altUrunler: [], varyantlar: [], gelenSiparisler: [],
    duyurular: [], gorusmeler: [], rotalar: [], talepler: [], ziyaretler: [], aracHareket: [], servisRaporlari: [], dukkanNotlari: [],
    settings: { firmaAdi: "ÖZGÜR TİCARET", firmaNo: "U225211984", eposta: "", ad: "", soyad: "", ilce: "", fisBaslik: "", fisAdres: "", fisTel: "", fisAltbilgi: "Teşekkür ederiz" },
    counters: { sale: 0, purchase: 0, sayim: 0, efatura: 0, seq: 0, tsiparis: 0 },
  };
}
let store = loadStore();
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return seedStore(emptyStore());
    const parsed = JSON.parse(raw);
    const base = emptyStore();
    for (const k in base) if (parsed[k] === undefined) parsed[k] = base[k];
    parsed.settings = Object.assign(base.settings, parsed.settings || {});
    parsed.counters = Object.assign(base.counters, parsed.counters || {});
    // İlk kez açılan cihaz: kayıt var ama ürün boşsa gömülü katalogla doldur.
    if (Array.isArray(parsed.products) && parsed.products.length === 0) seedStore(parsed);
    return parsed;
  } catch (e) { return seedStore(emptyStore()); }
}

/** Gömülü başlangıç kataloğunu (seed.js) boş depoya yükler. */
function seedStore(st) {
  const seed = typeof window !== "undefined" && window.__BABUCO_SEED;
  if (Array.isArray(seed) && seed.length && (!st.products || st.products.length === 0)) {
    st.products = seed.map((p) => Object.assign({}, p));
    if (!st.counters) st.counters = {};
    st.counters.seq = Math.max(st.counters.seq || 0, seed.length);
  }
  return st;
}
function saveStore() { yerelKaydet(); bulutaYaz(); }
function genId() { store.counters.seq = (store.counters.seq || 0) + 1; return "id" + store.counters.seq + Date.now().toString(36) + esCihazEki(); }
// ISO hafta numarası: "2026-H31"
function haftaNo(d) {
  d = new Date(d); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day + 3);
  const firstThu = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
  return d.getFullYear() + "-H" + String(week).padStart(2, "0");
}
function findProduct(id) { return store.products.find((p) => p.id === id); }
function findCustomer(id) { return store.customers.find((c) => c.id === id); }
function findFirma(id) { return store.firmalar.find((f) => f.id === id); }
// ÖZGÜR TİCARET logosu (fiş görselinde + önden yüklenir)
let OZGUR_LOGO = null;
try { OZGUR_LOGO = new Image(); OZGUR_LOGO.src = "logo.png?v=1"; } catch (e) {}

/* ---- Stok havuzu: Dükkan (p.stok) vs Araç (p.aracStok) ---- */
/* stokModu: "dukkan" | "arac". Servise girince otomatik "arac", çıkınca "dukkan". POS'ta düğmeyle override. */
let stokModu = "dukkan";
try { const m = localStorage.getItem("stok-modu-v1"); if (m === "arac" || m === "dukkan") stokModu = m; } catch (e) {}
function stokModuAyarla(m) { stokModu = (m === "arac") ? "arac" : "dukkan"; try { localStorage.setItem("stok-modu-v1", stokModu); } catch (e) {} }
function aktifStok(p) { return stokModu === "arac" ? (Number(p.aracStok) || 0) : (Number(p.stok) || 0); }
function stokDus(urunId, adet) { const p = findProduct(urunId); if (!p) return; if (stokModu === "arac") p.aracStok = (Number(p.aracStok) || 0) - adet; else p.stok = (Number(p.stok) || 0) - adet; }
function stokEkle(urunId, adet) { const p = findProduct(urunId); if (!p) return; if (stokModu === "arac") p.aracStok = (Number(p.aracStok) || 0) + adet; else p.stok = (Number(p.stok) || 0) + adet; }

/* ---- Gelişmiş mod: karta basılı tut → aynı çeşidin (altKategori) varyasyonları açılır ---- */
let gelismisMod = false;
try { gelismisMod = localStorage.getItem("gelismis-mod-v1") === "1"; } catch (e) {}
function gelismisModAyarla(on) { gelismisMod = !!on; try { localStorage.setItem("gelismis-mod-v1", on ? "1" : "0"); } catch (e) {} }
// Bir ürünün varyasyon kardeşleri = aynı altKategori'deki görünür ürünler
function varyantKardesler(p) {
  const alt = (p.altKategori || "").trim();
  if (!alt) return [p];
  return store.products.filter((x) => x.gorunur !== false && (x.altKategori || "").trim() === alt);
}
function varyantPopup(urunId) {
  const p = findProduct(urunId); if (!p) return;
  const kardes = varyantKardesler(p);
  if (kardes.length < 2) { addToCart(urunId); return; }
  const body = `<div class="aile-pop">${kardes.map((m) => `<button class="aile-opt" data-vadd="${m.id}" type="button"><span class="ao-ad">${esc(m.ad)}</span><span class="ao-fiyat">${money.format(Number(m.satis) || 0)}</span></button>`).join("")}</div>`;
  const mo = openModal((p.altKategori || "Çeşitler") + " — çeşit seç", body, { noFoot: true, onMount: (ov) => { ov.querySelectorAll("[data-vadd]").forEach((b) => b.onclick = () => { addToCart(b.dataset.vadd); mo.close(); }); } });
}
// Uzun basma (dokunma/fare) — long-press olunca cb; sonraki tap engellenir (el._lpFired)
function longPress(el, cb) {
  let t = null;
  const s = () => { el._lpFired = false; t = setTimeout(() => { el._lpFired = true; cb(); }, 450); };
  const c = () => { if (t) { clearTimeout(t); t = null; } };
  el.addEventListener("touchstart", s, { passive: true });
  el.addEventListener("touchend", c); el.addEventListener("touchmove", c);
  el.addEventListener("mousedown", s); el.addEventListener("mouseup", c); el.addEventListener("mouseleave", c);
}

function customerBorc(id) {
  const c = findCustomer(id); if (!c) return 0;
  let b = Number(c.acilis) || 0;
  store.sales.forEach((s) => { if (s.musteriId === id) b += Number(s.odeme.acik) || 0; });
  store.payments.forEach((p) => { if (p.musteriId === id) b -= Number(p.tutar) || 0; });
  // Kuruşa yuvarla: yüzlerce kalem toplanınca bakiye 1848.1499999999996 gibi
  // kalıyor ve müşteri "0,00 ₺ borçlu" olarak açık hesap listesinde takılıyordu.
  return kurus(b);
}
function customerSalesCount(id) { return store.sales.filter((s) => s.musteriId === id).length; }

/* ---- Toplu Sipariş (müşteri ile aramızdaki "sözleşme"): çok kalemli sipariş, zamanla parça parça
   teslim edilir ve parça parça ödenir. Kalan miktar/tutar bağımsız iki sayaçtır — teslim edilen adet
   ile ödenen tutar birbirine otomatik bağlı DEĞİLDİR, sadece elle girileni düşer. Normal Satış/Alışverişler
   akışına karışmaz, ayrı tabloda tutulur; ama teslimat stoktan gerçekten düşer. ---- */
function findTsiparis(id) { return store.tsiparisler.find((t) => t.id === id); }
function tsiparisKalemKalan(t, urunId) {
  const sip = t.kalemler.find((k) => k.urunId === urunId);
  if (!sip) return 0;
  let teslim = 0;
  t.hareketler.forEach((h) => (h.teslim || []).forEach((k) => { if (k.urunId === urunId) teslim += Number(k.adet) || 0; }));
  return Math.max(0, (Number(sip.adet) || 0) - teslim);
}
function tsiparisOdenen(t) { return t.hareketler.reduce((a, h) => a + (Number(h.odeme) || 0), 0); }
function tsiparisKalanTutar(t) { return (Number(t.toplamTutar) || 0) - tsiparisOdenen(t); }
function tsiparisAcikMi(t) { return t.kalemler.some((k) => tsiparisKalemKalan(t, k.urunId) > 0.001) || tsiparisKalanTutar(t) > 0.01; }
function tsiparisKalemOzet(t) { return t.kalemler.map((k) => k.ad + " (" + num2.format(tsiparisKalemKalan(t, k.urunId)) + "/" + num2.format(k.adet) + ")").join(", "); }
function firmaBorc(id) {
  let b = 0;
  store.purchases.forEach((p) => { if (p.firmaId === id) b += Number(p.borc) || 0; });
  store.firmaPayments.forEach((p) => { if (p.firmaId === id) b -= Number(p.tutar) || 0; });
  return b;
}

function pad2(x) { return String(x).padStart(2, "0"); }
function localDateStr(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function todayStr() { return localDateStr(new Date()); }
function monthStartStr() { const d = new Date(); return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1)); }
function fmtDate(iso) { const d = new Date(iso); return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function fmtDateShort(iso) { const d = new Date(iso); return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`; }
function isToday(iso) { return localDateStr(new Date(iso)) === todayStr(); }
function inRange(iso, from, to) { const d = localDateStr(new Date(iso)); return (!from || d >= from) && (!to || d <= to); }
const KATEGORILER = ["Su", "Sodalar", "Meyve Suyu", "Gazlı İçecek", "Ayran", "Gazoz", "Toz İçecekler", "Çaylar", "Kahve & Yan Ürünler", "Oyun Kağıtları", "Okey & Oyun", "Servis Ekipmanı", "Sıcak İçecekler", "Soğuk İçecekler", "Atıştırmalık", "Şeker & Gıda", "Servis & Bardak", "Temizlik", "Kağıt & Hijyen", "Mutfak & Ekipman", "Mobilya & Dış Mekan", "Oyun & Eğlence", "Kırtasiye", "Teknik & Güvenlik"];
function allGroupNames() {
  const extra = store.groups.map((g) => g.ad);
  return [...new Set(KATEGORILER.concat(extra).concat(["GRUPSUZ ÜRÜN"]))];
}
/* Eski/granü grup adlarını temiz kategorilere haritalar (tek-sefer otomatik kategorileme) */
const ESKI_GRUP_MAP = {
  "ÇAYLAR": "Temizlik", "Genel temizlik": "Temizlik", "Bulasik": "Temizlik", "Dezenfektan": "Temizlik", "Ekipman": "Temizlik",
  "Tuvalet": "Kağıt & Hijyen", "Personel sarf": "Kağıt & Hijyen",
  "Cay ve sicak icecek": "Sıcak İçecekler",
  "Tatlandirici": "Şeker & Gıda", "Mutfak sarf": "Şeker & Gıda",
  "Sarf": "Servis & Bardak", "Servis": "Servis & Bardak",
  "Mesrubat": "Soğuk İçecekler",
  "Atistirmalik": "Atıştırmalık",
  "Cay ocagi": "Mutfak & Ekipman", "Sogutma": "Mutfak & Ekipman", "Mutfak": "Mutfak & Ekipman",
  "Mobilya": "Mobilya & Dış Mekan", "Bahce/on": "Mobilya & Dış Mekan",
  "Oyun": "Oyun & Eğlence",
  "Kasa": "Teknik & Güvenlik", "Guvenlik": "Teknik & Güvenlik", "Teknik": "Teknik & Güvenlik",
  "Kirtasiye": "Kırtasiye",
};
function otomatikKategorile(sessiz) {
  const norm = (s) => String(s || "").toLocaleLowerCase("tr").replace(/[ıİ]/g, "i").replace(/[şŞ]/g, "s").replace(/[ğĞ]/g, "g").replace(/[üÜ]/g, "u").replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c");
  let deg = 0;
  (store.products || []).forEach((p) => {
    if (KATEGORILER.includes(p.grup)) return; // zaten temiz kategori — dokunma (idempotent + elle seçim korunur)
    let cat;
    if (p.grup === "Kontrol Edilecek") { const n = norm(p.ad); cat = n.includes("kokel") ? "Sıcak İçecekler" : (n.includes("cobanpinar") ? "Soğuk İçecekler" : "Şeker & Gıda"); }
    else cat = ESKI_GRUP_MAP[p.grup] || "Şeker & Gıda";
    const n = norm(p.ad);
    if (/(cay|melamin|porselen|pasabahce|gunes).*(tabag|bardag)|cay kasig|fincan/.test(n)) cat = "Servis & Bardak";
    if (p.grup !== cat) { p.grup = cat; deg++; }
  });
  const varOlan = new Set((store.groups || []).map((g) => g.ad));
  KATEGORILER.forEach((ad, i) => { if (!varOlan.has(ad)) store.groups.push({ id: "grp_" + Date.now() + "_" + i, ad }); });
  if (deg > 0 || !sessiz) {
    saveStore();
    const ts = new Date().toISOString();
    try { localStorage.setItem(BULUT_KEY + ":ts", ts); } catch (e) {}
    if (typeof kvSet === "function") kvSet(BULUT_KEY, store, ts);
    else if (typeof bulutaYaz === "function") bulutaYaz();
  }
  if (!sessiz) alert(deg + " ürün kategorilere yerleştirildi ✔");
  render();
  return deg;
}
/* Açılışta tek-sefer otomatik göç: hâlâ eski grup adı taşıyan ürün varsa temiz kategorilere dağıt. */
function kategoriGocKontrol() {
  if (!store || !store.products || !store.products.length) return;
  const eski = store.products.some((p) => p.grup && p.grup !== "GRUPSUZ ÜRÜN" && !KATEGORILER.includes(p.grup));
  if (eski) otomatikKategorile(true);
}

/* ============ CSV / dosya yardımcıları ============ */
function num(v) { if (v == null || v === "") return 0; let s = String(v).trim().replace(/[^\d.,-]/g, ""); if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) s = s.replace(/\./g, "").replace(",", "."); else if (s.indexOf(",") >= 0) s = s.replace(",", "."); return Number(s) || 0; }
function csvCell(v) { v = v == null ? "" : String(v); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function csvBuild(rows) { return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n"); }
function csvParse(text) {
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/)[0] || "";
  const delim = (firstLine.split(";").length >= firstLine.split(",").length) ? ";" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else { if (c === '"') q = true; else if (c === delim) { row.push(cell); cell = ""; } else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c === "\r") { } else cell += c; }
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => (x || "").trim() !== ""));
}
function csvModalGoster(name, text) {
  openModal(name, `<p class="hint">Dosya paylaşımı bu cihazda açılmadı. Aşağıdaki metni <b>Tümünü Kopyala</b> ile alıp Not Defteri'ne yapıştır → <b>${esc(name)}</b> olarak kaydet (Excel açar). Ya da WhatsApp'tan kendine gönder.</p>
    <textarea id="csvOut" style="width:100%;height:38vh;font-family:monospace;font-size:12px;white-space:pre" readonly>${esc(text)}</textarea>
    <div class="row" style="margin-top:10px;gap:8px">
      <button class="btn ok" id="csvKopyala" type="button">📋 Tümünü Kopyala</button>
      <button class="btn soft" id="csvWa" type="button">📲 WhatsApp'a Gönder</button>
    </div>`, {
    noFoot: true,
    onMount: (ov) => {
      const ta = ov.querySelector("#csvOut");
      ov.querySelector("#csvKopyala").onclick = async () => {
        try { await navigator.clipboard.writeText(text); alert("Kopyalandı ✔"); }
        catch (e) { ta.focus(); ta.select(); try { document.execCommand("copy"); alert("Kopyalandı ✔"); } catch (e2) { alert("Kopyalanamadı — metni elle seçip kopyalayın."); } }
      };
      ov.querySelector("#csvWa").onclick = () => window.open("https://wa.me/?text=" + encodeURIComponent(text.slice(0, 30000)), "_blank");
    },
  });
}
async function downloadFile(name, text, type) {
  const blob = new Blob([text], { type: type || "text/csv;charset=utf-8" });
  const file = new File([blob], name, { type: "text/csv" });
  // 1) Web Share — canShare bazı cihazlarda csv'yi reddediyor; koşulsuz dene.
  if (navigator.share) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e && e.name === "AbortError") return; return csvModalGoster(name, text); }
  }
  // 2) Masaüstü: normal indirme; olmazsa modal
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (e) { csvModalGoster(name, text); }
}
function openFileImport(accept, onText) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = accept;
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => onText(String(r.result)); r.readAsText(f, "utf-8"); };
  inp.click();
}
function openCsvImport(onText) { openFileImport(".csv,text/csv", onText); }

/* Tam yedek — JSON dışa/içe */
function exportBackup() { downloadFile("babuco-yedek-" + todayStr() + ".json", JSON.stringify(store), "application/json"); }
/* Dosyadan geri yükleme: önce buluttaki şimdiki hâlin yedeği alınır, sonra güvenli yazma yolundan
   (bulut bu arada değiştiyse yazmaz) geçer — ayrıntı: yedektenYukle(). */
function importBackup(text) {
  let data; try { data = JSON.parse(text); } catch (e) { alert("Geçersiz yedek dosyası."); return; }
  if (data && data.store && Array.isArray(data.store.products)) data = data.store;   // buluttan indirilmiş yedek biçimi
  if (!data || !Array.isArray(data.products)) { alert("Bu bir babu.co yedeği değil."); return; }
  return yedektenYukle(data, "dosya-oncesi", "Seçtiğin dosya");
}
function headerIndex(head, names) { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; }

/* Ürün dışa/içe */
function exportProducts() {
  const head = ["Barkod", "Ürün Adı", "Grup", "Alış Fiyatı", "Fiyat 1", "Kalan Stok", "Araç Stok", "Kritik Stok", "KDV", "Birim"];
  const rows = [head].concat(store.products.map((p) => [p.barkod || "", p.ad, p.grup || "", p.alis || 0, p.satis || 0, p.stok || 0, p.aracStok || 0, p.kritik === "" || p.kritik == null ? "" : p.kritik, p.kdv || 0, p.birim || "Adet"]));
  downloadFile("babuco-urunler.csv", csvBuild(rows));
}
function importProducts(text) {
  const rows = csvParse(text); if (rows.length < 2) { alert("Boş veya başlıksız dosya."); return; }
  const head = rows[0].map((h) => (h || "").toLowerCase().trim());
  const iBar = headerIndex(head, ["barkod", "barcode"]), iAd = headerIndex(head, ["ürün adı", "urun adi", "ürün adı ", "ad", "ürün", "urun", "name"]),
    iGrup = headerIndex(head, ["grup", "kategori", "group"]), iAlis = headerIndex(head, ["alış fiyatı", "alis fiyati", "alış", "alis", "alış fiyat"]),
    iSatis = headerIndex(head, ["fiyat 1", "fiyat1", "fiyat", "satış fiyatı", "satis fiyati", "satış", "satis", "price"]),
    iStok = headerIndex(head, ["kalan stok", "dükkan stok", "dukkan stok", "stok", "stock", "miktar"]), iKritik = headerIndex(head, ["kritik stok", "kritik", "kritik stok miktarı"]),
    iArac = headerIndex(head, ["araç stok", "arac stok", "araç", "arac"]),
    iKdv = headerIndex(head, ["kdv", "kdv %", "vat"]), iBirim = headerIndex(head, ["birim", "unit"]);
  if (iAd < 0) { alert("'Ürün Adı' sütunu bulunamadı."); return; }
  let add = 0, upd = 0, err = 0;
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r]; const ad = (c[iAd] || "").trim(); if (!ad) { err++; continue; }
    const bar = iBar >= 0 ? (c[iBar] || "").trim() : "";
    const data = { ad, barkod: bar, grup: iGrup >= 0 ? (c[iGrup] || "").trim() : "", alis: num(c[iAlis]), satis: num(c[iSatis]), stok: num(c[iStok]), kritik: iKritik >= 0 && c[iKritik] !== "" ? num(c[iKritik]) : "", kdv: num(c[iKdv]), birim: iBirim >= 0 && c[iBirim] ? c[iBirim] : "Adet", gorunur: true };
    if (iArac >= 0) data.aracStok = num(c[iArac]); // araç kolonu yoksa mevcut aracStok korunur (Object.assign dokunmaz)
    let ex = bar ? store.products.find((p) => p.barkod === bar) : store.products.find((p) => p.ad === ad);
    if (ex) { Object.assign(ex, data); upd++; } else { store.products.push(Object.assign({ id: genId() }, data)); add++; }
  }
  saveStore(); alert(`İçe aktarma bitti ✔\nEklendi: ${add} · Güncellendi: ${upd} · Hatalı: ${err}`); render();
}
/* Müşteri dışa/içe */
function exportCustomers() {
  const head = ["Müşteri Adı", "Telefon", "Açılış Borcu", "Adres", "Vergi No"];
  const rows = [head].concat(store.customers.map((c) => [c.ad, c.telefon || "", c.acilis || 0, c.adres || "", c.vergiNo || ""]));
  downloadFile("babuco-musteriler.csv", csvBuild(rows));
}
function importCustomers(text) {
  const rows = csvParse(text); if (rows.length < 2) { alert("Boş veya başlıksız dosya."); return; }
  const head = rows[0].map((h) => (h || "").toLowerCase().trim());
  const iAd = headerIndex(head, ["müşteri adı", "musteri adi", "müşteri", "musteri", "ad", "müşteri tanımı", "name"]),
    iTel = headerIndex(head, ["telefon", "gsm", "phone"]), iAcilis = headerIndex(head, ["açılış borcu", "acilis borcu", "açılış", "borç", "kalan borç", "kalan borcu"]),
    iAdres = headerIndex(head, ["adres", "address"]), iVno = headerIndex(head, ["vergi no", "vergi numarası", "tckn", "vergi no / tckn"]);
  if (iAd < 0) { alert("'Müşteri Adı' sütunu bulunamadı."); return; }
  let add = 0, upd = 0, err = 0;
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r]; const ad = (c[iAd] || "").trim(); if (!ad) { err++; continue; }
    const data = { ad, telefon: iTel >= 0 ? (c[iTel] || "").trim() : "", acilis: num(c[iAcilis]), adres: iAdres >= 0 ? (c[iAdres] || "").trim() : "", vergiNo: iVno >= 0 ? (c[iVno] || "").trim() : "" };
    let ex = store.customers.find((x) => x.ad === ad);
    if (ex) { Object.assign(ex, data); upd++; } else { store.customers.push(Object.assign({ id: genId() }, data)); add++; }
  }
  saveStore(); alert(`İçe aktarma bitti ✔\nEklendi: ${add} · Güncellendi: ${upd} · Hatalı: ${err}`); render();
}

/* ============ GİRİŞ / OTURUM ============ */
/* Panel e-posta + şifreyle açılır (Supabase Auth). Oturum cihazda saklanır: bir kez girilir, bir daha sorulmaz.
 *
 * Dışarıya açık noktalar (adlar sabit, diğer bölümler bunlara güvenir):
 *   girisKapisi()     Promise. Cihazda oturum varsa (internet olmasa da) hemen çözülür; yoksa giriş ekranını
 *                     gösterir ve giriş yapılınca çözülür.
 *   bulutYetkiliMi()  Promise<boolean>. "Bulutta kayıt yok" cevabına güvenip yazmadan önce sorulur:
 *                     false = oturum yok / hesabın izni yok / emin olunamadı → YAZMA.
 *   sbFetch()         Supabase istemcisinin bütün istekleri buradan geçer (SB bunu kullanır):
 *                     - oturum yokken veri isteği GİTMEZ, giriş yapılana kadar bekler (ekrana veri gelmez);
 *                     - kv istekleri kullanıcının jetonuyla gider; jetonun süresi dolduysa yenilenir;
 *                     - veritabanı kilidi kurulmadan ÖNCE de çalışsın diye: kullanıcı jetonuyla boş/yetkisiz
 *                       dönen kv isteği bir kez de herkese açık anahtarla denenir (bugünkü davranış);
 *                     - iki yolla da boş/yetkisiz dönen özel anahtarda hesabın izni sorulur; izinsizse oturum
 *                       kapanır ve istek yetkili girişe kadar bekler ("bulut boş" diye yorumlanamaz).
 *   Olaylar: "babuco:giris" (giriş yapıldı), "babuco:cikis" (çıkışta yerel veri silinmeden hemen önce).
 *
 * Çıkış: bu cihazdaki veri kopyası silinir (ortak telefonda borç listesi kalmasın). Oturum kendiliğinden
 * düşerse (süre/iptal) yerel kopya SİLİNMEZ; giriş ekranı üstünü kapatır, girince kaldığı yerden sürer. */
const OTURUM_ANAHTAR = "babuco:oturum";
const KATALOG_KEY = "babuco:katalog";
let _kapiSoz = null, _kapiCoz = null;    // kapı kapalıyken bekleyenlerin sözü
let _bilerekCikis = false;               // çıkışı biz başlattıysak "oturumun kapanmış" uyarısı gösterme
let _yetkiSoz = null, _yetkiSon = null;
let _katalogSonOzet = "";                // bu sayfanın en son yayınladığı / bulutta gördüğü kataloğun özeti
const _bekleyenOkuma = new Map();        // kapı kapalıyken aynı okuma tek istek olsun

function oturumKaydi() { try { return JSON.parse(localStorage.getItem(OTURUM_ANAHTAR) || "null"); } catch (e) { return null; } }
/** Cihazda saklı oturum var mı? İnternet gerektirmez. */
function oturumKayitli() { const o = oturumKaydi(); return !!(o && o.refresh_token && o.user); }
function oturumEposta() { const o = oturumKaydi(); return (o && o.user && o.user.email) || ""; }
let _sonEposta = oturumEposta();         // oturum kendiliğinden düşerse e-posta kutusu dolu gelsin

function girisKapisi() {
  if (_kapiSoz) return _kapiSoz;
  if (oturumKayitli()) return Promise.resolve();
  kapiyiKapat("");
  return _kapiSoz;
}
/** Kapıyı kapat: giriş ekranını göster, giriş yapılana kadar veri isteklerini beklet. */
function kapiyiKapat(mesaj) {
  if (!_kapiSoz) _kapiSoz = new Promise((coz) => { _kapiCoz = coz; });
  girisEkrani(mesaj);
}
function kapiyiAc() {
  const el = document.getElementById("giris-kapi"); if (el) el.remove();
  document.documentElement.classList.remove("giris-kilit");
  const coz = _kapiCoz; _kapiSoz = null; _kapiCoz = null;
  if (coz) coz();
  try { window.dispatchEvent(new CustomEvent("babuco:giris")); } catch (e) {}
  setTimeout(katalogDenetle, 1500);
}

function girisEkrani(mesaj) {
  document.documentElement.classList.add("giris-kilit");
  let el = document.getElementById("giris-kapi");
  if (!el) {
    el = document.createElement("div");
    el.id = "giris-kapi";
    el.innerHTML = `<form class="gk-kutu" id="gkForm" novalidate>
      <img class="gk-logo" src="logo.png?v=2" alt="" />
      <h1 class="gk-baslik">Özgür Ticaret</h1>
      <p class="gk-alt">Paneli açmak için giriş yap.</p>
      <div class="gk-alan"><label for="gkEposta">E-posta</label>
        <input id="gkEposta" type="email" inputmode="email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" /></div>
      <div class="gk-alan"><label for="gkSifre">Şifre</label>
        <div class="gk-sifre"><input id="gkSifre" type="password" autocomplete="current-password" /><button type="button" id="gkGoster">Göster</button></div></div>
      <div class="gk-mesaj" id="gkMesaj" role="alert" aria-live="polite"></div>
      <button class="gk-buton" id="gkGir" type="submit">Giriş Yap</button>
      <p class="gk-not">Bir kez giriş yapman yeter, bu telefon seni hatırlar.</p>
    </form>`;
    document.body.appendChild(el);
    el.querySelector("#gkEposta").value = _sonEposta || "";
    el.querySelector("#gkForm").addEventListener("submit", (e) => { e.preventDefault(); girisDene(); });
    el.querySelector("#gkGoster").addEventListener("click", () => {
      const s = el.querySelector("#gkSifre"), acik = s.type === "text";
      s.type = acik ? "password" : "text"; el.querySelector("#gkGoster").textContent = acik ? "Göster" : "Gizle";
    });
  }
  if (mesaj) girisMesaj(mesaj);
}
function girisMesaj(metin) { const m = document.getElementById("gkMesaj"); if (m) { m.textContent = metin || ""; m.classList.toggle("dolu", !!metin); } }
function girisMesgul(evet) { const b = document.getElementById("gkGir"); if (b) { b.disabled = !!evet; b.textContent = evet ? "Giriş yapılıyor…" : "Giriş Yap"; } }
function girisHataMetni(h) {
  const kod = String((h && (h.code || h.error_code)) || ""), durum = h && h.status, m = String((h && h.message) || "").toLowerCase();
  if (kod === "invalid_credentials" || m.indexOf("invalid login") >= 0) return "E-posta ya da şifre yanlış.";
  if (kod === "email_not_confirmed" || m.indexOf("not confirmed") >= 0) return "Bu hesap henüz onaylanmamış. Hesabı açan kişiye haber ver.";
  if (durum === 429 || kod.indexOf("rate_limit") >= 0) return "Çok fazla deneme yapıldı. Birkaç dakika bekleyip tekrar dene.";
  if (!durum || durum >= 500) return "Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.";
  if (durum === 400 || durum === 401 || durum === 403 || durum === 422) return "E-posta ya da şifre yanlış.";
  return "Giriş yapılamadı. Biraz sonra tekrar dene.";
}
async function girisDene() {
  const eposta = (document.getElementById("gkEposta").value || "").trim(), sifre = document.getElementById("gkSifre").value || "";
  if (!eposta || !sifre) return girisMesaj("E-posta ve şifreni yaz.");
  if (!SB) return girisMesaj("Panel tam yüklenemedi. Sayfayı yenileyip tekrar dene.");
  if (navigator.onLine === false) return girisMesaj("İnternet yok. Bağlantını kontrol edip tekrar dene.");
  girisMesaj(""); girisMesgul(true);
  let s;
  try { s = await SB.auth.signInWithPassword({ email: eposta, password: sifre }); } catch (e) { s = { error: e }; }
  if (s.error || !s.data || !s.data.session) { girisMesgul(false); return girisMesaj(girisHataMetni(s.error)); }
  _yetkiSon = null;
  if ((await yetkiSor()) === "yetkisiz") { await oturumuSil(); girisMesgul(false); return girisMesaj("Bu hesabın panele girme izni yok."); }
  girisMesgul(false);
  _sonEposta = eposta;
  kapiyiAc();
}
/** Oturumu bu cihazdan kaldır ("oturumun kapanmış" uyarısı göstermeden). */
async function oturumuSil() {
  _bilerekCikis = true;
  try { await SB.auth.signOut({ scope: "local" }); } catch (e) {}
  try { localStorage.removeItem(OTURUM_ANAHTAR); } catch (e) {}
  _bilerekCikis = false;
}
/** SB kurulduktan hemen sonra çağrılır: oturum düşmesini ve bulut yazımlarını dinler. */
function girisBaslat() {
  if (!SB) return;
  SB.auth.onAuthStateChange((olay) => {
    if (olay === "SIGNED_OUT" && !_bilerekCikis) setTimeout(() => kapiyiKapat("Oturumun kapanmış. Yeniden giriş yap."), 0);
  });
  window.addEventListener("babuco:bulut-yazildi", () => { katalogYayinla(); });
  if (oturumKayitli()) setTimeout(() => { yetkiDenetle(); katalogDenetle(); }, 1500);
}

/* ---- Yetki: bu hesap toptancı verisine girebilir mi? (kilit.sql'deki babuco_yetkili fonksiyonu) ---- */
/** "yetkili" | "yetkisiz" | "kilitsiz" (veritabanı kilidi henüz kurulmamış) | "bilinmiyor" (internet yok vb.) */
async function yetkiSor() {
  if (!SB) return "bilinmiyor";
  try {
    const { data, error, status } = await SB.rpc("babuco_yetkili");
    if (!error) return data === true ? "yetkili" : "yetkisiz";
    if (status === 404 || error.code === "PGRST202") return "kilitsiz";
    return "bilinmiyor";
  } catch (e) { return "bilinmiyor"; }
}
/** Yetkiyi sor; hesap izinsizse oturumu kapatıp giriş ekranına döndür. Aynı anda tek sorgu.
 *  Olumlu cevap bir dakika hatırlanır (her boş okumada sunucuya sorulmasın); taze=true hatırlananı yok sayar. */
function yetkiDenetle(taze) {
  if (!taze && _yetkiSon && Date.now() - _yetkiSon.an < 60000) return Promise.resolve(_yetkiSon.durum);
  if (!_yetkiSoz) {
    _yetkiSoz = yetkiSor().then(async (d) => {
      _yetkiSoz = null;
      _yetkiSon = d === "yetkili" || d === "kilitsiz" ? { durum: d, an: Date.now() } : null;
      if (d === "yetkisiz" && oturumKayitli()) { await oturumuSil(); kapiyiKapat("Bu hesabın panele girme izni yok."); }
      return d;
    });
  }
  return _yetkiSoz;
}
/** İstek, kilit kurulunca yalnız yetkili hesabın görebildiği bir kv anahtarını mı soruyor? */
function ozelAnahtarIstegi(url) {
  let m = null;
  try { m = decodeURIComponent(url).match(/[?&]key=(?:eq|like|ilike|in)\.\(?"?(babuco:[^&,)"]*)/); } catch (e) { return false; }
  return !!m && m[1] !== KATALOG_KEY && m[1].indexOf("babuco:on-siparis:policy:") !== 0;
}
async function bulutYetkiliMi() {
  if (!SB || _kapiSoz || !oturumKayitli()) return false;
  const d = await yetkiDenetle();
  return d === "yetkili" || d === "kilitsiz";
}

/* ---- Supabase istekleri ---- */
/** Kullanıcının geçerli jetonu. Oturum yoksa giriş yapılana kadar bekler; cihazda oturum var ama
 *  yenilenemiyorsa (internet yok) bağlantı hatası gibi düşer — isteği oturumsuz GÖNDERMEZ. */
async function kullaniciJetonu() {
  for (;;) {
    let o = null;
    try { o = (await SB.auth.getSession()).data.session; } catch (e) { o = null; }
    if (o && o.access_token) return o.access_token;
    if (oturumKayitli()) throw new TypeError("Oturum yenilenemedi (bağlantı yok)");
    await girisKapisi();
  }
}
async function sbGovdeBos(r) {
  try {
    const okuyucu = r.clone().body.getReader();
    const { value, done } = await okuyucu.read();
    okuyucu.cancel().catch(() => {});
    if (done || !value || !value.length) return true;
    return value.length <= 8 && new TextDecoder().decode(value).trim() === "[]";
  } catch (e) { return false; }
}
/** Cevap "bu kimlikle veri yok / izin yok" mu diyor? (öbür kimlikle bir kez daha denemeye değer mi) */
async function sbAnormal(r, yontem, init) {
  if (r.status === 401 || r.status === 403 || r.status === 406) return true;
  if (r.status !== 200) return false;
  const tercih = new Headers((init && init.headers) || {}).get("Prefer") || "";
  if (yontem === "GET" || ((yontem === "PATCH" || yontem === "DELETE") && tercih.indexOf("return=representation") >= 0)) return sbGovdeBos(r);
  return false;
}
async function sbIstek(url, init, yontem) {
  const kvMi = /\/rest\/v1\/kv(\?|$)/.test(url), rpcMi = url.indexOf("/rest/v1/rpc/") >= 0;
  const gonder = (jeton) => {
    const h = new Headers((init && init.headers) || {});
    h.set("apikey", SB_KEY); h.set("Authorization", "Bearer " + jeton);
    return fetch(url, Object.assign({}, init, { headers: h }));
  };
  for (let tur = 0; ; tur++) {
    const jeton = await kullaniciJetonu();
    if (!kvMi && !rpcMi) return gonder(SB_KEY);            // siparişler vb.: bugünkü gibi herkese açık anahtarla
    let r = await gonder(jeton);
    if (r.status === 401) {                                // jetonun süresi dolmuş olabilir: yenile, bir kez daha dene
      let y = null;
      try { y = await SB.auth.refreshSession(); } catch (e) { y = { error: e }; }
      const yeni = y && !y.error && y.data && y.data.session;
      if (yeni) r = await gonder(yeni.access_token);
      else {
        const d = y && y.error && y.error.status;
        if ((d >= 400 && d < 500 && d !== 429) || !oturumKayitli()) {
          // Sunucu hem jetonu hem yenilemeyi reddetti: oturum bitmiş. Girişi bekle, sonra aynı isteği yinele.
          if (oturumKayitli()) await oturumuSil();
          kapiyiKapat("Oturumun kapanmış. Yeniden giriş yap.");
          if (tur < 2) continue;
        }
        if (!rpcMi) throw new TypeError("Oturum yenilenemedi (bağlantı yok)");
      }
    }
    if (!kvMi || !(await sbAnormal(r, yontem, init))) return r;
    const r2 = await gonder(SB_KEY);                       // kilit kurulmadan önceki düzen: herkese açık anahtar
    if (!(await sbAnormal(r2, yontem, init))) return r2;
    // İki kimlikle de boş/yetkisiz. Özel bir anahtarsa "kayıt yok" ile "iznin yok" karışmasın: hesabın iznini sor.
    // İzinsizse oturum kapanır ve istek, yetkili bir hesapla giriş yapılana kadar bekler (çağırana "boş" dönmez).
    const reddedildi = r.status === 401 || r.status === 403;
    if (reddedildi || ozelAnahtarIstegi(url)) {
      if ((await yetkiDenetle(reddedildi)) === "yetkisiz" && tur < 2) continue;
    }
    return r;
  }
}
async function sbFetch(input, init) {
  const url = typeof input === "string" ? input : String((input && input.url) || input);
  if (url.indexOf("/rest/v1/") < 0) return fetch(input, init);   // giriş / jeton yenileme istekleri
  const yontem = String((init && init.method) || "GET").toUpperCase();
  if (_kapiSoz && yontem === "GET") {                             // kapı kapalı: aynı okumayı bir kez beklet
    if (!_bekleyenOkuma.has(url)) _bekleyenOkuma.set(url, sbIstek(url, init, yontem).finally(() => _bekleyenOkuma.delete(url)));
    return (await _bekleyenOkuma.get(url)).clone();
  }
  return sbIstek(url, init, yontem);
}

/* ---- Çıkış ---- */
function depoKanonik(x) {
  const duz = JSON.parse(JSON.stringify(x || {})), taban = emptyStore();
  for (const k in taban) if (duz[k] === undefined) duz[k] = taban[k];
  const sirala = (v) => Array.isArray(v) ? v.map(sirala) : (v && typeof v === "object" ? Object.keys(v).sort().reduce((o, k) => { o[k] = sirala(v[k]); return o; }, {}) : v);
  return JSON.stringify(sirala(duz));
}
/** Bu cihazdaki kayıtlar bulutla aynı mı? true / false / null (bakılamadı: internet yok). */
async function yerelBulutlaAyniMi() {
  if (!SB || navigator.onLine === false) return null;
  const oku = () => Promise.race([
    SB.from("kv").select("value").eq("key", BULUT_KEY).maybeSingle().then((c) => (c.error ? undefined : (c.data ? c.data.value : null))),
    new Promise((coz) => setTimeout(() => coz(undefined), 8000)),
  ]);
  try {
    let b = await oku();
    if (b === undefined) return null;
    if (b && depoKanonik(b) === depoKanonik(store)) return true;
    await new Promise((coz) => setTimeout(coz, 1800));            // sırada bekleyen yazma varsa bitsin
    b = await oku();
    if (b === undefined) return null;
    return !!(b && depoKanonik(b) === depoKanonik(store));
  } catch (e) { return null; }
}
function yerelVeriyiSil() {
  try { window.dispatchEvent(new CustomEvent("babuco:cikis")); } catch (e) {}
  try {
    const sil = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === STORE_KEY || k === "servis-v1" || k.indexOf("babuco:") === 0) sil.push(k); }
    sil.forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}
async function cikisYap() {
  if (!confirm("Çıkış yapılsın mı?\n\nBu telefondaki kayıtlar silinir. Verilerin bulutta durur; tekrar giriş yapınca geri gelir.")) return;
  const ayni = await yerelBulutlaAyniMi();
  if (ayni !== true && !confirm("DİKKAT: Bu telefondaki son işlemler buluta gitmemiş olabilir" + (ayni === null ? " (internet yok)" : "") + ".\n\nŞimdi çıkarsan o işlemler KAYBOLUR. Yine de çıkılsın mı?")) return;
  _bilerekCikis = true;
  try { if (SB) await Promise.race([SB.auth.signOut({ scope: "local" }), new Promise((coz) => setTimeout(coz, 5000))]); } catch (e) {}
  yerelVeriyiSil();
  location.reload();
}

/* ---- Herkese açık katalog: çay ocağı sipariş ekranı yalnız bunu okur ---- */
/** Kataloğa yalnız bu alanlar girer. Alış fiyatı, stok, müşteri, özel fiyat GİRMEZ. (tools/babuco-kimlik.cjs ile aynı) */
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
async function katalogYaz(liste) {
  if (!SB || !liste.length) return false;                          // boş katalog yayınlanmaz (sipariş ekranı boşalmasın)
  const ozet = katalogOzet(liste);
  if (ozet === _katalogSonOzet) return true;
  const ts = new Date().toISOString();
  const { error } = await SB.from("kv").upsert({ key: KATALOG_KEY, value: { v: 1, ozet, guncellendi: ts, urunler: liste }, updated_at: ts });
  if (error) return false;
  _katalogSonOzet = ozet;
  return true;
}
/** Store buluta yazıldıktan hemen sonra: yereldeki ürünler bulutla aynıdır, katalog onlardan çıkarılır. */
async function katalogYayinla() {
  if (_kapiSoz || !oturumKayitli()) return false;
  try { return await katalogYaz(katalogUrunleri(store.products)); } catch (e) { return false; }
}
/** Açılışta / girişten sonra: katalog buluttaki ürün listesinden çıkarılır (yerel kopya eski olabilir). */
async function katalogDenetle() {
  if (!SB || _kapiSoz || !oturumKayitli()) return false;
  try {
    // Yalnız gereken parçalar istenir (bütün store inmesin). Sunucu bu seçimi anlamazsa satırların tamamı okunur.
    let { data, error } = await SB.from("kv").select("key, ozet:value->>ozet, urunler:value->products").in("key", [BULUT_KEY, KATALOG_KEY]);
    if (error) {
      const tam = await SB.from("kv").select("key, value").in("key", [BULUT_KEY, KATALOG_KEY]);
      if (tam.error || !Array.isArray(tam.data)) return false;
      data = tam.data.map((r) => ({ key: r.key, ozet: r.value && r.value.ozet, urunler: r.value && r.value.products }));
    }
    if (!Array.isArray(data)) return false;
    const depo = data.find((r) => r.key === BULUT_KEY), kat = data.find((r) => r.key === KATALOG_KEY);
    if (!depo || !Array.isArray(depo.urunler)) return false;        // bulutta ürün listesi görünmüyor: dokunma
    const liste = katalogUrunleri(depo.urunler);
    if (kat && kat.ozet && kat.ozet === katalogOzet(liste)) { _katalogSonOzet = kat.ozet; return true; }
    return await katalogYaz(liste);
  } catch (e) { return false; }
}

/* ---- "Tüm Verileri Sil": şifre + yazılı onay + önce yedek ---- */
/** "dogru" | "yanlis" | "bilinmiyor". Açık oturuma dokunmaz. */
async function sifreDogrula(sifre) {
  try {
    const r = await fetch(SB_URL + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: oturumEposta(), password: sifre }) });
    if (r.ok) {
      const j = await r.json().catch(() => null);   // doğrulama için açılan geçici oturumu kapat
      if (j && j.access_token) fetch(SB_URL + "/auth/v1/logout?scope=local", { method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + j.access_token } }).catch(() => {});
      return "dogru";
    }
    return r.status === 400 || r.status === 401 || r.status === 403 ? "yanlis" : "bilinmiyor";
  } catch (e) { return "bilinmiyor"; }
}
/** Bütün korumalar buradadır. Dönen metin boşsa silindi; doluysa silinmedi (neden silinmediği). */
async function verileriSil(sifre, onay) {
  if (String(onay || "").trim().toLocaleUpperCase("tr-TR").replace(/I/g, "İ") !== "SİL") return "Onay kutusuna SİL yaz.";
  if (!sifre) return "Şifreni yaz.";
  if (!SB || _kapiSoz || !oturumKayitli()) return "Önce giriş yapmalısın.";
  if (navigator.onLine === false) return "İnternet yokken silinemez (önce yedek alınması gerekiyor).";
  const d = await sifreDogrula(sifre);
  if (d === "yanlis") return "Şifre yanlış. Hiçbir şey silinmedi.";
  if (d !== "dogru") return "Şifre doğrulanamadı (bağlantı sorunu). Hiçbir şey silinmedi.";
  let yedek = false;
  try { if (typeof yedekAl === "function") yedek = (await yedekAl("silme-oncesi")) === true; } catch (e) { yedek = false; }
  if (!yedek) return "Yedek alınamadı. Hiçbir şey silinmedi.";
  localStorage.removeItem(STORE_KEY); store = emptyStore(); saveStore();
  return "";
}
function verileriSilAkisi() {
  let m = null, calisiyor = false;
  const govde = `<div class="gs-sil">
    <p class="gs-uyari">Bütün müşteriler, borçlar, satışlar ve ürünler silinir. <b>Geri alınamaz.</b></p>
    <p class="gs-not">Silmeden önce buluta bir yedek alınır; yedek alınamazsa hiçbir şey silinmez.</p>
    <div class="field"><label for="gsSifre">Giriş şifren</label><input id="gsSifre" type="password" autocomplete="current-password" /></div>
    <div class="field"><label for="gsOnay">Onay için buraya SİL yaz</label><input id="gsOnay" type="text" autocomplete="off" autocapitalize="characters" /></div>
    <div class="gs-mesaj" id="gsMesaj" role="alert" aria-live="polite"></div>
  </div>`;
  m = openModal("Tüm verileri sil", govde, { okLabel: "Hepsini Sil", onOk: (ov) => {
    if (calisiyor) return false;
    const mesaj = ov.querySelector("#gsMesaj"), dugme = ov.querySelector(".ok");
    calisiyor = true; dugme.disabled = true; mesaj.textContent = "Kontrol ediliyor…";
    verileriSil(ov.querySelector("#gsSifre").value, ov.querySelector("#gsOnay").value).then((hata) => {
      calisiyor = false; dugme.disabled = false;
      if (hata) { mesaj.textContent = hata; return; }
      m.close(); alert("Veriler silindi. Yedeği bulutta duruyor."); navigate("anasayfa");
    });
    return false;
  } });
  m.ov.classList.add("gs-sil-kap");
}

// Sayfa açılır açılmaz: cihazda oturum yoksa panel hiç görünmeden giriş ekranı gelir.
if (typeof document !== "undefined" && !oturumKayitli()) kapiyiKapat("");

/* ============ Sidebar menü ============ */
const MENU = [
  { ico: "🏪", label: "Dükkan", route: "dukkan" },
  { ico: "🖊", label: "Satış Yap", route: "satis" },
  { ico: "🚗", label: "Rota / Saha Satış", route: "rota" },
  { ico: "🗺", label: "Harita / Rota Planı", route: "harita" },
  { ico: "🍵", label: "Çay Ocağı Siparişleri", route: "cay-ocagi" },
  { ico: "📢", label: "Duyurular", route: "duyurular" },
  { ico: "📈", label: "Raporlar", children: [
      { label: "Günlük Rapor", route: "rapor-gunluk" }, { label: "Tarihsel Rapor", route: "rapor-tarihsel" },
      { label: "Ürünsel Rapor", route: "rapor-urunsel" }, { label: "Grupsal Rapor", route: "rapor-grupsal" },
      { label: "Ürün Korelasyon Raporu", route: "rapor-korelasyon" }, { label: "Stok Hareket Rapor", route: "rapor-stokhareket" },
      { label: "Personel Hareket Raporu", route: "rapor-personelhareket" },
      { label: "📊 Müşteri Analizi", route: "musteri-analiz" }, { label: "📊 Ürün Analizi", route: "urun-analiz" },
      { label: "🚗 Servis Raporları (Gün Sonu)", route: "servis-raporlari" },
  ] },
  { ico: "👤", label: "Müşteriler", route: "musteriler" },
  { ico: "🧑‍🔧", label: "Servisçiler (Bayiler)", route: "servisciler" },
  { ico: "🚚", label: "Araç Stoğu (Sayım)", route: "arac-yukleme" },
  { ico: "🗂", label: "Ürünler", children: [
      { label: "Ürünler", route: "urunler" }, { label: "Ürün Ekle & Güncelle", route: "urun-ekle" },
      { label: "Varyantlı Ürün Ekle", route: "urun-varyantli" }, { label: "Ürün Grupları", route: "urun-gruplari" },
      { label: "Ürün Transferleri", route: "urun-transfer" }, { label: "Alt Ürün Tanımları", route: "alt-urun" },
      { label: "Ürün Varyantları", route: "urun-varyantlari" }, { label: "Ürün İadesi Al", route: "urun-iade" },
      { label: "İade Talepleri", route: "iade-talepleri" }, { label: "İstenen Ürünler (Talepler)", route: "talepler" }, { label: "Ürün Etiketi Üret", route: "urun-etiket" },
      { label: "Etiket Tasarla & Üret", route: "etiket-tasarla" }, { label: "Barkodlu Terazi Çıktısı", route: "terazi-cikti" },
      { label: "💰 Fiyat Bakımı (Zam · Kontrol)", route: "fiyat-bakim" }, { label: "🛒 Alınacaklar", route: "alinacaklar" },
  ] },
  { ico: "📄", label: "Alış Faturaları", children: [
      { label: "Alış Faturaları", route: "alis-faturalari" }, { label: "Alış Faturası Oluştur", route: "alis-olustur" },
  ] },
  { ico: "📰", label: "Firmalar", route: "firmalar" },
  { ico: "✉", label: "E-Faturalar", children: [
      { label: "Yeni E-Fatura Oluştur", route: "efatura-olustur" }, { label: "Giden E-Faturalar", route: "efatura-giden" },
      { label: "Gelen E-Faturalar", route: "efatura-gelen" }, { label: "Ayarlar", route: "efatura-ayarlar" },
  ] },
  { ico: "🧊", label: "Stok Sayımı", route: "stok-sayimi" },
  { ico: "🔁", label: "Gelir / Giderler", children: [
      { label: "Gelirler", route: "gelirler" }, { label: "Giderler", route: "giderler" },
  ] },
  { ico: "👥", label: "Personeller", route: "personeller" },
  { ico: "⋯", label: "Görevler", route: "gorevler" },
  { ico: "💳", label: "Ödeme Tipleri", route: "odeme-tipleri" },
];

/* ============ Çizgi ikonlar (emoji yerine) ============ */
/* Tek renk (currentColor), 24'lük ızgara, dosya/istek yok: her telefonda aynı görünür.
   Çay ocağı uygulamasındaki takımın (src/lib/Ikon.tsx) aynısı + panele özgü birkaç ek.
   Kullanım: ikon("zil")  ·  ikon("sepet", 24)  ·  `<button>${ikon("arti")} Ekle</button>`  (yazıyla aynı renkte çizilir) */
const IKON_YOLLAR = {
  ev: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  kamyon: 'M2 6h11v10H2zM13 9h4l4 4v3h-8zM6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  arti: 'M12 5v14M5 12h14',
  hediye: 'M4 11h16v10H4zM2.5 7h19v4h-19zM12 7v14M12 7S10.5 3 8 3.5 7 7 12 7zM12 7s1.5-4 4-3.5S17 7 12 7z',
  grafik: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  ara: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  kapat: 'M6 6l12 12M18 6 6 18',
  kisi: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  kisiler: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 4.2a3.5 3.5 0 0 1 0 6.6M18 14.8c2.4.6 4 2.3 4 5.2',
  saat: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  dikkat: 'M12 3 2 20h20zM12 10v4M12 17.5v.01',
  ay: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  kalem: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  fis: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  goz: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cop: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  geri: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  asagi: 'M6 9l6 6 6-6',
  yukari: 'M6 15l6-6 6 6',
  sag: 'M9 6l6 6-6 6',
  sol: 'M15 6l-6 6 6 6',
  kutu: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9',
  para: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01',
  kart: 'M2 5h20v14H2zM2 10h20M6 15h4',
  defter: 'M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2zM5 17a2 2 0 0 1 2-2h12M9 7h6',
  takvim: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  ayar: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  cikis: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3',
  indir: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  yukle: 'M12 21V9M7 14l5-5 5 5M4 3h16',
  paylas: 'M12 3v13M7 8l5-5 5 5M5 12v8h14v-8',
  yazici: 'M6 9V3h12v6M6 18H3v-8h18v8h-3M6 14h12v7H6z',
  tik: 'M4 12.5 9.5 18 20 6',
  bol: 'M12 3v18M5 8h4M15 16h4M5 16h4M15 8h4',
  gunes: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  telefon: 'M7 2h10v20H7zM11 18h2',
  menu: 'M4 7h16M4 12h16M4 17h16',
  dukkan: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6',
  izgara: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  duyuru: 'M3 10v4h3l5 4V6l-5 4H3zM15 9a3.5 3.5 0 0 1 0 6M18 6a7.5 7.5 0 0 1 0 12',
  sepet: 'M3 4h2l2.2 11h10.6L20 7H6.2M9 20h.01M17 20h.01',
  zil: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  araba: 'M3 13l2-6h14l2 6v5h-2.5M3 13v5h2.5M3 13h18M7.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9.5 18h5',
  harita: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  konum: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  banka: 'M3 10 12 4l9 6zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  tara: 'M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6',
  mesaj: 'M4 5h16v11H9l-5 4z',
  liste: 'M8 6h12M8 12h12M8 18h12M4 6v.01M4 12v.01M4 18v.01',
  ucnokta: 'M5 12v.01M12 12v.01M19 12v.01',
  kilit: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  yenile: 'M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6',
  bardak: 'M7 4h10l-1.5 15a2 2 0 0 1-2 1.8h-3a2 2 0 0 1-2-1.8zM7.6 10h8.8',
  eksi: 'M5 12h14',
  etiket: 'M3 12V4h8l10 10-8 8zM7.5 8v.01',
  internetyok: 'M3 3l18 18M5 12.5a10 10 0 0 1 3-2.2M12 20v.01M8.5 16a5 5 0 0 1 7 0M16 10.3a10 10 0 0 1 3 2.2',
};
function ikon(ad, boy, kalinlik) {
  const d = IKON_YOLLAR[ad]; if (!d) return "";
  const b = boy || 20;
  return `<svg class="ikon" width="${b}" height="${b}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${kalinlik || 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

/* ============ Ortak HTML yardımcıları ============ */
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function pageHead(title, sub, actions) {
  const acts = (actions || []).map((a) => `<button class="btn ${a.cls || ""}" type="button" ${a.route ? `data-goto="${a.route}"` : ""} ${a.act ? `data-act="${a.act}"` : ""}>${a.label}</button>`).join("");
  return `<div class="page-head"><button class="pg-back" data-goback type="button" aria-label="Geri">&#8249;</button><h1>${title}</h1>${sub ? `<span class="sub">${sub}</span>` : ""}<div class="actions">${acts}</div></div>`;
}
function field(f) {
  if (f.type === "select") return `<div class="field"><label>${f.label}</label><select>${(f.options || ["Tümü"]).map((o) => `<option>${o}</option>`).join("")}</select></div>`;
  return `<div class="field"><label>${f.label}</label><input type="${f.type || "text"}"${f.value ? ` value="${f.value}"` : ""}${f.ph ? ` placeholder="${f.ph}"` : ""} /></div>`;
}
function tableCard(columns, rowsHTML, info) {
  const ths = columns.map((c) => `<th>${c}<span class="sort">⇅</span></th>`).join("");
  const body = rowsHTML || `<tr class="empty-row"><td colspan="${columns.length}">Kayıt bulunamadı.</td></tr>`;
  return `<div class="card">
    <div class="table-tools"><div class="len"><select><option>10</option><option>25</option><option>50</option><option>100</option></select> kayıt göster</div><div class="search">Ara: <input type="text" class="tbl-search" /></div></div>
    <div class="table-wrap"><table class="grid"><thead><tr>${ths}</tr></thead><tbody>${body}</tbody></table></div>
    <div class="tbl-info">${info || "0 kayıttan 0 ile 0 arasındakiler"}</div>
    <div class="pager"><span class="mut">İlk</span><span class="mut">Önceki</span><span class="on">1</span><span class="mut">Sonraki</span><span class="mut">Son</span></div>
  </div>`;
}
function stat(label, value, cls, trend) { return `<div class="stat ${cls || ""}">${trend ? `<span class="s-trend ${trend.dir}">${trend.text}</span>` : ""}<span class="s-label">${label}</span><span class="s-value">${value}</span></div>`; }
function grid(items) { return `<div class="summary-grid">${items.map((s) => stat(s[0], s[1], s[2], s[3])).join("")}</div>`; }
function trendBadge(cur, prev) { if (!prev || prev <= 0) return null; const p = Math.round(((cur - prev) / prev) * 100); return { dir: p >= 0 ? "up" : "down", text: (p >= 0 ? "+" : "") + "%" + p }; }
function infoLine(n) { return n ? `${n} kayıttan 1 ile ${n} arasındakiler` : undefined; }

/* tablo arama (basit istemci filtre) */
function wireTableSearch() {
  document.querySelectorAll(".tbl-search").forEach((inp) => {
    inp.addEventListener("input", () => {
      const q = inp.value.toLowerCase();
      const tbody = inp.closest(".card").querySelector("tbody");
      tbody.querySelectorAll("tr").forEach((tr) => { if (tr.classList.contains("empty-row")) return; tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none"; });
    });
  });
}

/* ============ Modal ============ */
function openModal(title, bodyHTML, opts) {
  opts = opts || {};
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  ov.innerHTML = `<div class="modal" style="max-width:${opts.wide ? "680px" : "460px"}">
    <div class="modal-head"><h3>${title}</h3><button class="x" type="button">&times;</button></div>
    <div class="modal-body">${bodyHTML}</div>
    ${opts.noFoot ? "" : `<div class="modal-foot"><button class="btn soft close" type="button">İptal</button><button class="btn ok" type="button">${opts.okLabel || "Kaydet"}</button></div>`}
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector(".x").addEventListener("click", close);
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  const cb = ov.querySelector(".close"); if (cb) cb.addEventListener("click", close);
  const ok = ov.querySelector(".ok"); if (ok) ok.addEventListener("click", () => { if (!opts.onOk || opts.onOk(ov) !== false) close(); });
  if (opts.onMount) opts.onMount(ov);
  return { ov, close };
}
/* alan tabanlı form modalı */
function formModal(title, fields, item, onSave) {
  const body = fields.map((f) => {
    const val = item && item[f.key] != null ? item[f.key] : (f.def != null ? f.def : "");
    if (f.type === "select") return `<div class="field"><label>${f.label}</label><select data-k="${f.key}">${f.options.map((o) => { const v = typeof o === "object" ? o.v : o; const t = typeof o === "object" ? o.t : o; return `<option value="${esc(v)}" ${String(val) === String(v) ? "selected" : ""}>${esc(t)}</option>`; }).join("")}</select></div>`;
    if (f.type === "textarea") return `<div class="field"><label>${f.label}</label><textarea data-k="${f.key}" rows="3">${esc(val)}</textarea></div>`;
    if (f.type === "checkbox") return `<label class="field field-chk"><input data-k="${f.key}" type="checkbox" ${val ? "checked" : ""} /> <span>${f.label}</span></label>`;
    if (f.rehber) return `<div class="field"><label>${f.label}</label><div class="zk-hizli-row"><input data-k="${f.key}" type="${f.type || "text"}" value="${esc(val)}" placeholder="${f.ph || ""}" /><button class="btn soft" type="button" data-rehberfor="${f.key}">📇 Rehber</button></div></div>`;
    return `<div class="field"><label>${f.label}${f.req ? " *" : ""}</label><input data-k="${f.key}" type="${f.type || "text"}" ${f.step ? `step="${f.step}"` : ""} value="${esc(val)}" placeholder="${f.ph || ""}" /></div>`;
  }).join("");
  openModal(title, body, {
    onMount: (ov) => {
      ov.querySelectorAll("[data-rehberfor]").forEach((b) => b.addEventListener("click", async () => {
        const k = await rehberdenSec(); if (!k) return;
        const inp = ov.querySelector(`[data-k="${b.dataset.rehberfor}"]`); if (inp && k.tel) inp.value = k.tel;
        const adInp = ov.querySelector('[data-k="ad"]'); if (adInp && !adInp.value && k.ad) adInp.value = k.ad;
      }));
    },
    onOk: (ov) => {
      const data = {};
      let ok = true;
      fields.forEach((f) => {
        const el = ov.querySelector(`[data-k="${f.key}"]`);
        let v = f.type === "checkbox" ? el.checked : el.value;
        if (f.type === "number") v = v === "" ? "" : Number(v);
        if (f.req && (v === "" || v == null)) ok = false;
        data[f.key] = v;
      });
      if (!ok) { alert("Zorunlu alanları doldurun."); return false; }
      onSave(data);
    },
  });
}

/* ============ Jenerik CRUD sayfa ============ */
function crudPage(cfg) {
  // cfg: title, sub, key, columns[], row(item,i)->cells[], fields[], stamp, extraActions[]
  const items = store[cfg.key];
  const rows = items.map((it, i) => {
    const cells = cfg.row(it, i).map((c) => `<td>${c}</td>`).join("");
    const acts = `<td><div class="act-btns"><button class="edit" data-edit="${it.id}">Düzenle</button><button class="del" data-del="${it.id}">Sil</button></div></td>`;
    return `<tr>${cells}${cfg.noEdit ? "" : acts}</tr>`;
  }).join("");
  const cols = cfg.noEdit ? cfg.columns : cfg.columns.concat(["İşlem"]);
  const actions = [{ label: "＋ " + (cfg.newLabel || "Yeni Ekle"), act: "yeni" }].concat(cfg.extraActions || []);
  return pageHead(cfg.title, typeof cfg.sub === "function" ? cfg.sub() : cfg.sub, actions) + tableCard(cols, rows, infoLine(items.length));
}
function mountCrud(cfg) {
  const items = store[cfg.key];
  const y = document.querySelector('[data-act="yeni"]');
  if (y) y.addEventListener("click", () => formModal(cfg.newLabel || "Yeni Kayıt", cfg.fields, null, (data) => {
    if (cfg.stamp) data.tarih = new Date().toISOString();
    items.push(Object.assign({ id: genId() }, data));
    saveStore(); if (cfg.onSave) cfg.onSave(); render();
  }));
  document.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
    const it = items.find((x) => x.id === b.dataset.edit);
    formModal("Düzenle", cfg.fields, it, (data) => { Object.assign(it, data); saveStore(); if (cfg.onSave) cfg.onSave(); render(); });
  }));
  document.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    const it = items.find((x) => x.id === b.dataset.del);
    if (confirm("Silinsin mi?")) { store[cfg.key] = items.filter((x) => x.id !== it.id); saveStore(); render(); }
  }));
  wireTableSearch();
}

/* ============ ÜRÜNLER ============ */
function renderUrunler() {
  const rows = store.products.map((p, i) => {
    const low = stkKritikVar(p) && stkToplamStok(p) <= Number(p.kritik);
    return `<tr>
      <td>${i + 1}</td><td>📦</td><td>${esc(p.barkod) || "-"}</td>
      <td>${esc(p.ad)}<br><span class="badge">${esc(p.grup || "GRUPSUZ ÜRÜN")}</span></td>
      <td class="${low || Number(p.stok) < 0 ? "stok-low" : ""}">${num2.format(Number(p.stok) || 0)}</td>
      <td class="arac-stok ${Number(p.aracStok) < 0 ? "stok-low" : ""}">${num2.format(Number(p.aracStok) || 0)}</td>
      <td>${Number(p.kdv) || 0}</td><td>${p.kritik === "" || p.kritik == null ? 0 : Number(p.kritik)}</td>
      <td>${money.format(Number(p.alis) || 0)}</td><td>${money.format(Number(p.satis) || 0)}</td>
      <td><div class="act-btns"><button class="edit" data-edit="${p.id}">Düzenle</button><button class="del" data-del="${p.id}">Sil</button></div></td>
    </tr>`;
  }).join("");
  return pageHead("Ürünler", store.products.length + " ürün", [{ label: "🚚 Araç Stoğu", route: "arac-yukleme" }, { label: "＋ Ürün Ekle", route: "urun-ekle" }, { label: "📋 Fiyat Listesi", cls: "softgreen", act: "fiyatliste" }, { label: "⇩ Excel'e Aktar", cls: "softgreen", act: "csvOut" }, { label: "⇧ İçe Aktar", cls: "softgreen", act: "csvIn" }, { label: "Şablon", cls: "soft", act: "csvTpl" }]) +
    tableCard(["Sıra", "Görsel", "Ürün Barkodu", "Ürün Adı", "Dükkan", "Araç", "KDV", "Kritik Stok", "Alış Fiyatı", "Fiyat 1", "İşlem"], rows, infoLine(store.products.length));
}
function mountUrunler() {
  document.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => { editProductId = b.dataset.edit; navigate("urun-ekle"); }));
  document.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { const p = findProduct(b.dataset.del); if (p && confirm(`"${p.ad}" silinsin mi?`)) { store.products = store.products.filter((x) => x.id !== p.id); saveStore(); render(); } }));
  const o = document.querySelector('[data-act="csvOut"]'); if (o) o.addEventListener("click", exportProducts);
  const i = document.querySelector('[data-act="csvIn"]'); if (i) i.addEventListener("click", () => openCsvImport(importProducts));
  const t = document.querySelector('[data-act="csvTpl"]'); if (t) t.addEventListener("click", () => downloadFile("babuco-urun-sablon.csv", csvBuild([["Barkod", "Ürün Adı", "Grup", "Alış Fiyatı", "Fiyat 1", "Kalan Stok", "Araç Stok", "Kritik Stok", "KDV", "Birim"]])));
  const fl = document.querySelector('[data-act="fiyatliste"]'); if (fl) fl.addEventListener("click", () => openFiyatListesi(null));
  wireTableSearch();
}
let editProductId = null;
function renderUrunEkle() {
  const p = editProductId ? findProduct(editProductId) : null;
  const v = (x) => (p && p[x] != null ? esc(p[x]) : "");
  const grupOpts = allGroupNames().map((c) => `<option ${p && p.grup === c ? "selected" : ""}>${c}</option>`).join("");
  const gorunurSel = p && p.gorunur === false;
  return pageHead(p ? "Ürün Güncelle" : "Ürün Ekle & Güncelle", p ? esc(p.ad) : null, [{ label: "Ürünler listesi", cls: "soft", route: "urunler" }]) +
    `<form id="urunForm" class="card">
      <h1 style="font-size:15px;background:var(--brand);color:#fff;padding:8px 12px;border-radius:5px">Ürün Bilgisi</h1>
      <div class="form-grid" style="margin-top:14px">
        <div class="field"><label>Ürün Adı *</label><input name="ad" required value="${v("ad")}" placeholder="Ürün adını giriniz" /></div>
        <div class="field"><label>Barkod</label><input name="barkod" value="${v("barkod")}" placeholder="Barkod (opsiyonel)" /></div>
        <div class="field"><label>Fiyat 1 — Satış (₺)</label><input name="satis" type="number" step="0.01" value="${v("satis")}" placeholder="0" /></div>
        <div class="field"><label>Alış Fiyatı (₺)</label><input name="alis" type="number" step="0.01" value="${v("alis")}" placeholder="0" /></div>
        <div class="field"><label>Kalan Stok (Dükkan)</label><input name="stok" type="number" step="0.01" value="${v("stok")}" placeholder="0" /></div>
        <div class="field"><label>Kritik Stok (dükkan + araç bu sayıya inince uyar)</label><input name="kritik" type="number" step="0.01" value="${v("kritik")}" placeholder="boş = uyarma" /></div>
        <div class="field"><label>KDV (%)</label><input name="kdv" type="number" step="1" value="${v("kdv")}" placeholder="0" /></div>
        <div class="field"><label>Ürün Grubu</label><select name="grup">${grupOpts}</select></div>
        <div class="field"><label>Ürün Birimi (koli/paketse seç — satış o birimden)</label><select name="birim">${["Adet", "Koli", "Paket", "Çuval", "Kg", "Litre"].map((u) => `<option ${p && p.birim === u ? "selected" : ""}>${u}</option>`).join("")}</select></div>
        <div class="field"><label>Satış Sayfasında Göster</label><select name="gorunur"><option value="1" ${!gorunurSel ? "selected" : ""}>Göster</option><option value="0" ${gorunurSel ? "selected" : ""}>Gösterme</option></select></div>
        <div class="field"><label>Ön Ekranda Göster (Ana Ürün)</label><select name="anaUrun"><option value="1" ${p && p.anaUrun ? "selected" : ""}>Evet — ön ekranda</option><option value="0" ${!(p && p.anaUrun) ? "selected" : ""}>Hayır — sadece kategoriden</option></select></div>
        <div class="field"><label>Ürün Kodu</label><input name="urunKodu" value="${v("urunKodu")}" placeholder="opsiyonel" /></div>
        <div class="field"><label>Depo Min Stok</label><input name="depoMin" type="number" step="0.01" value="${v("depoMin")}" placeholder="0" /></div>
        <div class="field"><label>Araçta Bulunsun mu</label><select name="aractaBulunsun"><option value="1" ${!(p && p.aractaBulunsun === false) ? "selected" : ""}>Evet</option><option value="0" ${p && p.aractaBulunsun === false ? "selected" : ""}>Hayır</option></select></div>
        <div class="field"><label>Bozulabilir mi (SKT'li)</label><select name="bozulabilir"><option value="0" ${!(p && p.bozulabilir) ? "selected" : ""}>Hayır</option><option value="1" ${p && p.bozulabilir ? "selected" : ""}>Evet</option></select></div>
        <div class="field"><label>Analiz Notu</label><input name="analizNotu" value="${v("analizNotu")}" placeholder="opsiyonel" /></div>
      </div>
      <div style="margin-top:16px"><button class="btn green lg" type="submit">💾 ${p ? "Güncelle" : "Ürünü Kaydet"}</button></div>
    </form>`;
}
function mountUrunEkle() {
  document.getElementById("urunForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = { ad: (f.get("ad") || "").trim(), barkod: (f.get("barkod") || "").trim(), satis: f.get("satis"), alis: f.get("alis"), stok: f.get("stok"), kritik: f.get("kritik"), kdv: f.get("kdv"), grup: f.get("grup"), birim: f.get("birim"), gorunur: f.get("gorunur") === "1", anaUrun: f.get("anaUrun") === "1", urunKodu: (f.get("urunKodu") || "").trim(), depoMin: f.get("depoMin"), aractaBulunsun: f.get("aractaBulunsun") === "1", bozulabilir: f.get("bozulabilir") === "1", analizNotu: (f.get("analizNotu") || "").trim() };
    if (!data.ad) { alert("Ürün adı zorunlu."); return; }
    let alisDegisti = null;
    if (editProductId) {
      const eski = findProduct(editProductId);
      ["alis", "satis"].forEach((alan) => { if (kurus(eski[alan]) !== kurus(data[alan])) { stkFiyatGecmis(store, stkA(), { urunId: eski.id, ad: data.ad, alan, eski: eski[alan], yeni: data[alan], kaynak: "Ürün kartı" }); if (alan === "alis") alisDegisti = { [eski.id]: Number(data.alis) || 0 }; } });
      Object.assign(eski, data);
    }
    else store.products.push(Object.assign({ id: genId() }, data));
    saveStore(); editProductId = null; navigate("urunler");
    stkMarjUyariGoster(alisDegisti ? stkMarjEtki(store, alisDegisti) : []);
  });
}

/* ============ MÜŞTERİLER ============ */
function renderMusteriler() {
  const liste = store.customers.filter((c) => !c.bayi); // servisçiler (bayi) ayrı sayfada
  const toplamBorc = liste.reduce((s, c) => s + customerBorc(c.id), 0);
  const rows = liste.map((c, i) => {
    const borc = customerBorc(c.id);
    return `<tr><td>${i + 1}</td><td><button class="link-btn" data-detay="${c.id}">${esc(c.ad)}</button>${borc > 0.5 ? musteriRozetHTML(c.id) : ""}</td><td>${customerSalesCount(c.id)}</td><td class="${borc > 0 ? "borc-red" : ""}">${money.format(borc)}</td><td>${esc(c.telefon || "-")}</td><td><div class="act-btns"><button class="edit" data-duzenlec="${c.id}">✏ Düzenle</button><button class="edit" data-odeme="${c.id}">Ödeme Al</button><button class="warn" data-borcekle="${c.id}">Veresiye Borç Ekle</button><button class="del" data-delc="${c.id}">Sil</button></div></td></tr>`;
  }).join("");
  const gecSay = liste.filter((c) => { const y = borcYas(c.id); return y && y.gecikmis; }).length;
  return pageHead("Müşteriler", `${liste.length} kişi · Toplam borç: ${money.format(toplamBorc)}${gecSay ? " · " + gecSay + " müşterinin vadesi geçmiş" : ""}`, [{ label: "＋ Yeni Müşteri Oluştur", act: "yeni-musteri" }, { label: "📇 Rehberden Ekle", cls: "soft", act: "rehber-musteri" }, { label: "⇩ Excel'e Aktar", cls: "softgreen", act: "csvOut" }, { label: "⇧ İçe Aktar", cls: "softgreen", act: "csvIn" }, { label: "Şablon", cls: "soft", act: "csvTpl" }]) +
    tableCard(["Sıra", "Müşteri", "Alışveriş Sayısı", "Kalan Borcu", "Telefon", "İşlem"], rows, infoLine(liste.length));
}
// Servisçiler (bayi) — normal müşterilerden ayrı; mekanik olarak müşteri (aynı borç/tahsilat/özel fiyat).
function renderServisciler() {
  const liste = store.customers.filter((c) => c.bayi);
  const toplamBorc = liste.reduce((s, c) => s + customerBorc(c.id), 0);
  const rows = liste.map((c, i) => {
    const borc = customerBorc(c.id);
    const ozelSay = c.ozelFiyatlar ? Object.keys(c.ozelFiyatlar).length : 0;
    return `<tr><td>${i + 1}</td><td><button class="link-btn" data-detay="${c.id}">${esc(c.ad)}</button></td><td>${customerSalesCount(c.id)}</td><td>${ozelSay ? ozelSay + " ürün" : "-"}</td><td class="${borc > 0 ? "borc-red" : ""}">${money.format(borc)}</td><td>${esc(c.telefon || "-")}</td><td><div class="act-btns"><button class="edit" data-duzenlec="${c.id}">✏ Düzenle</button><button class="edit" data-odeme="${c.id}">Ödeme Al</button><button class="warn" data-borcekle="${c.id}">Veresiye Borç Ekle</button><button class="del" data-delc="${c.id}">Sil</button></div></td></tr>`;
  }).join("");
  return pageHead("Servisçiler (Bayiler)", `${liste.length} servisçi · Toplam borç: ${money.format(toplamBorc)}`, [{ label: "＋ Yeni Servisçi", act: "yeni-servisci" }]) +
    `<p class="hint" style="margin:0 2px 10px">Servisçiler senden toptan/düşük fiyata alan bayiler. Özel fiyatları satış ekranından ürün satırına dokunup "bu fiyatı … için kaydet" ile tanımlanır; dükkan modunda satış onların stoğundan (dükkan) düşer.</p>` +
    tableCard(["Sıra", "Servisçi", "Alışveriş", "Özel Fiyat", "Kalan Borcu", "Telefon", "İşlem"], rows, infoLine(liste.length));
}
function mountServisciler() {
  const y = document.querySelector('[data-act="yeni-servisci"]'); if (y) y.addEventListener("click", () => openYeniMusteri(null, null, { bayi: true }));
  document.querySelectorAll("[data-duzenlec]").forEach((b) => b.addEventListener("click", () => openYeniMusteri(null, findCustomer(b.dataset.duzenlec))));
  document.querySelectorAll("[data-detay]").forEach((b) => b.addEventListener("click", () => { selectedCustomerId = b.dataset.detay; navigate("musteri-detay"); }));
  document.querySelectorAll("[data-delc]").forEach((b) => b.addEventListener("click", () => { const c = findCustomer(b.dataset.delc); if (c && confirm(`"${c.ad}" silinsin mi?`)) { store.customers = store.customers.filter((x) => x.id !== c.id); saveStore(); render(); } }));
  document.querySelectorAll("[data-odeme]").forEach((b) => b.addEventListener("click", () => openOdemeAl(b.dataset.odeme)));
  document.querySelectorAll("[data-borcekle]").forEach((b) => b.addEventListener("click", () => openBorcEkle(b.dataset.borcekle)));
  wireTableSearch();
}
/* ---- Sabah Araç Yükleme: dükkandan araca aktarım ---- */
const ARAC_STD_ONERI = { "sırma sade soda": 5, "beypazarı sade soda": 8, "kızılay sade soda": 4, "sırma limonlu soda": 6 };
function aracStdVal(p) { if (p.aracStandart != null && p.aracStandart !== "") return p.aracStandart; const k = (p.ad || "").toLocaleLowerCase("tr"); return ARAC_STD_ONERI[k] != null ? ARAC_STD_ONERI[k] : ""; }
// Araç stoğu = DEVREDEN bakiye. Doldur/boşalt yok; ilk kez veya sayımda araçtaki miktarı doğrudan gir.
// Satılınca düşer, "🛒 Araca Al" ile artar, ertesi gün kaldığı yerden devam.
function renderAracYukleme() {
  const liste = store.products.filter((p) => p.gorunur !== false).slice().sort((a, b) => (a.grup || "").localeCompare(b.grup || "", "tr") || (a.ad || "").localeCompare(b.ad || "", "tr"));
  const toplamArac = liste.reduce((s, p) => s + (Number(p.aracStok) || 0), 0);
  const rows = liste.map((p) => `<tr>
      <td>${esc(p.ad)}<br><span class="badge">${esc(p.grup || "-")} · ${esc(p.birim || "Adet")}</span></td>
      <td><input class="ay-in" data-arac="${p.id}" type="number" inputmode="numeric" value="${Number(p.aracStok) || 0}" placeholder="0" /></td>
    </tr>`).join("");
  return pageHead("Araç Stoğu (Sayım / Başlangıç)", `Araçta toplam ${num2.format(toplamArac)} birim`, [{ label: "↩ Ürünler", route: "urunler" }]) +
    `<div class="ay-tools"><button class="btn ok" data-act="aracKaydet" type="button">✓ Araç Stoğunu Kaydet</button><button class="btn soft" data-act="aracYukle" type="button">🏪 Dükkandan Araca Yükle</button></div>
     <p class="hint" style="margin:0 2px 8px"><b>Devreden model:</b> Araç stoğu ertesi güne devreder — her sabah doldur/boşalt YOK. Sadece <b>ilk kez</b> ya da sayım gerektiğinde araçtaki gerçek miktarı yaz. Satınca otomatik düşer; yolda alınca "🛒 Araca Al" ile eklenir.</p>` +
    tableCard(["Ürün", "Araç Stok (mevcut)"], rows, "");
}
function mountAracYukleme() {
  const yukle = document.querySelector('[data-act="aracYukle"]'); if (yukle) yukle.addEventListener("click", () => aracAlimModal("yukle"));
  const s = document.querySelector('[data-act="aracKaydet"]');
  if (s) s.addEventListener("click", () => {
    let n = 0;
    store.products.forEach((p) => {
      const el = document.querySelector(`[data-arac="${p.id}"]`); if (!el) return;
      const v = el.value === "" ? 0 : Number(el.value) || 0;
      if ((Number(p.aracStok) || 0) !== v) { p.aracStok = v; store.aracHareket.push({ id: genId(), urunId: p.id, ad: p.ad, adet: v, yon: "sayim", tarih: new Date().toISOString() }); n++; }
    });
    saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
    alert(`Araç stoğu kaydedildi ✔ (${n} üründe güncellendi). Bu bir devreden bakiyedir.`);
    render();
  });
}
/* ============ ANALİZ (metrikler + raporlar) ============ */
function musteriMetrik(id) {
  const sales = store.sales.filter((s) => s.musteriId === id);
  const ciro = sales.reduce((a, s) => a + (Number(s.toplam) || 0), 0);
  const kar = sales.reduce((a, s) => a + ((Number(s.toplam) || 0) - (Number(s.maliyet) || 0)), 0);
  const tarihler = sales.map((s) => s.tarih).sort();
  const ilk = tarihler[0], son = tarihler[tarihler.length - 1];
  const hafta = ilk ? Math.max(1, (Date.now() - new Date(ilk).getTime()) / (7 * 86400000)) : 1;
  const urunAdet = {};
  sales.forEach((s) => s.items.forEach((it) => { urunAdet[it.ad] = (urunAdet[it.ad] || 0) + (Number(it.adet) || 0); }));
  const top = Object.entries(urunAdet).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
  return { siparis: sales.length, ciro, kar, ortHaftaCiro: ciro / hafta, ortHaftaKar: kar / hafta, sonSiparis: son, borc: customerBorc(id), top };
}
function urunMetrik(urunId, gunler) {
  const sinir = gunler ? Date.now() - gunler * 86400000 : 0;
  let adet = 0, ciro = 0, kar = 0, sonSatis = "";
  store.sales.forEach((s) => {
    if (sinir && new Date(s.tarih).getTime() < sinir) return;
    s.items.forEach((it) => {
      if (it.urunId !== urunId) return;
      const q = Number(it.adet) || 0, f = Number(it.fiyat) || 0;
      adet += q; ciro += q * f; kar += q * (f - kalemAlis(it));
      if (s.tarih > sonSatis) sonSatis = s.tarih;
    });
  });
  const donusHaftalik = gunler ? adet / Math.max(1, gunler / 7) : adet;
  return { adet, ciro, kar, sonSatis, donusHaftalik };
}
function riskRozet(r) { if (!r) return "-"; const cls = r === "Yüksek" ? "risk-yuksek" : (r === "Orta" ? "risk-orta" : "risk-dusuk"); return `<span class="${cls}">${esc(r)}</span>`; }
function renderMusteriAnaliz() {
  const liste = store.customers.map((c) => ({ c, m: musteriMetrik(c.id) })).sort((a, b) => b.m.ciro - a.m.ciro);
  const topCiro = liste.reduce((a, x) => a + x.m.ciro, 0), topKar = liste.reduce((a, x) => a + x.m.kar, 0);
  const rows = liste.map(({ c, m }, i) => `<tr>
    <td>${i + 1}</td>
    <td><button class="link-btn" data-detay="${c.id}">${esc(c.ad)}</button>${c.bayi ? ' <span class="badge">servisçi</span>' : ""}</td>
    <td>${esc(c.isletmeTipi || "-")}</td><td>${esc(c.bolge || c.mahalle || "-")}</td><td>${esc(c.servisGunu || "-")}</td>
    <td>${m.siparis}</td><td>${money.format(m.ciro)}</td><td>${money.format(m.kar)}</td><td>${money.format(m.ortHaftaCiro)}</td>
    <td class="${m.borc > 0 ? "borc-red" : ""}">${money.format(m.borc)}</td><td>${riskRozet(c.riskDurumu)}</td>
    <td>${m.sonSiparis ? fmtDate(m.sonSiparis) : "-"}</td><td class="hint">${m.top.map(esc).join(", ") || "-"}</td>
  </tr>`).join("");
  return pageHead("Müşteri Analizi", `${store.customers.length} müşteri · Ciro ${money.format(topCiro)} · Kâr ${money.format(topKar)}`) +
    `<p class="hint" style="margin:0 2px 8px">Ciroya göre sıralı. Veri biriktikçe (2-3 ay) ortalama haftalık ciro/kâr, en çok aldığı ürün ve risk daha isabetli olur.</p>` +
    tableCard(["#", "Müşteri", "Tip", "Bölge", "Servis", "Sip.", "Ciro", "Kâr", "Ort/Hafta", "Borç", "Risk", "Son Sip.", "En Çok Aldığı"], rows, infoLine(store.customers.length));
}
function mountMusteriAnaliz() {
  document.querySelectorAll("[data-detay]").forEach((b) => b.addEventListener("click", () => { selectedCustomerId = b.dataset.detay; navigate("musteri-detay"); }));
  wireTableSearch();
}
function renderUrunAnaliz() {
  const gun = 90;
  const liste = store.products.filter((p) => p.gorunur !== false).map((p) => ({ p, m: urunMetrik(p.id, gun) })).sort((a, b) => b.m.ciro - a.m.ciro);
  const rows = liste.map(({ p, m }, i) => `<tr>
    <td>${i + 1}</td><td>${esc(p.ad)}<br><span class="badge">${esc(p.grup || "-")}</span></td>
    <td>${num2.format(m.adet)}</td><td>${money.format(m.ciro)}</td><td>${money.format(m.kar)}</td>
    <td>${num2.format(Math.round(m.donusHaftalik * 10) / 10)}/hf</td>
    <td>${num2.format(Number(p.stok) || 0)}</td><td class="arac-stok">${num2.format(Number(p.aracStok) || 0)}</td>
    <td>${m.sonSatis ? fmtDate(m.sonSatis) : "-"}</td>
  </tr>`).join("");
  return pageHead("Ürün Analizi", "Son 90 gün · ciroya göre · dönüş hızı = haftalık satış adedi") +
    tableCard(["#", "Ürün", "Adet(90g)", "Ciro", "Kâr", "Dönüş", "Dükkan", "Araç", "Son Satış"], rows, infoLine(store.products.length));
}
function openYeniMusteri(onDone, item, preset) {
  const seed = item || preset || null; // preset: yeni kayıt için varsayılan değerler (ör. bayi:true)
  formModal(item ? "Müşteri Düzenle" : (preset && preset.bayi ? "Yeni Servisçi (Bayi)" : "Yeni Müşteri Oluştur"), [
    { key: "ad", label: "Müşteri Tanımı", req: true, ph: "Ad Soyad / Ünvan" },
    { key: "vade", label: "Vade Süresi (gün)", type: "number", ph: "opsiyonel" },
    { key: "telefon", label: "Telefon", ph: "05xx", rehber: true },
    { key: "adres", label: "Adres" },
    { key: "not", label: "Müşteri Notu" },
    { key: "limit", label: "Açık Hesap Limiti (₺)", type: "number", step: "0.01", def: 0 },
    { key: "vergiDairesi", label: "Vergi Dairesi" },
    { key: "vergiNo", label: "Vergi No / TCKN" },
    { key: "acilis", label: "Açılış Borcu (₺)", type: "number", step: "0.01", def: 0 },
    { key: "isletmeTipi", label: "İşletme Tipi", type: "select", options: [{ v: "", t: "— seç —" }, "Kıraathane", "Kafe", "Büfe", "Bakkal", "Market", "Restoran", "Ofis", "Berber", "Diğer"] },
    { key: "bolge", label: "Bölge" },
    { key: "mahalle", label: "Mahalle" },
    { key: "servisGunu", label: "Servis Günü", type: "select", options: [{ v: "", t: "— seç —" }, "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"] },
    { key: "rotaSira", label: "Rota Sırası", type: "number" },
    { key: "cayTuketim", label: "Çay Tüketim Seviyesi", type: "select", options: [{ v: "", t: "— seç —" }, "Düşük", "Orta", "Yüksek"] },
    { key: "sogukPotansiyel", label: "Soğuk İçecek Potansiyeli", type: "select", options: [{ v: "", t: "— seç —" }, "Düşük", "Orta", "Yüksek"] },
    { key: "riskDurumu", label: "Risk Durumu", type: "select", options: [{ v: "", t: "— seç —" }, "Düşük", "Orta", "Yüksek"] },
    { key: "oyunVar", label: "Oyun ürünü kullanır (okey/kağıt/yazboz)", type: "checkbox" },
    { key: "sogukDolap", label: "Soğuk dolabı var", type: "checkbox" },
    { key: "depozitoKullanir", label: "Depozitolu ürün kullanır (kasa/şişe)", type: "checkbox" },
    { key: "onSiparisMinPesin", label: "Ön siparişte açık hesap seçerse en az %40 peşin öder", type: "checkbox" },
    { key: "bayi", label: "Servisçi (senden toptan/düşük fiyata alan bayi)", type: "checkbox" },
  ], seed, (data) => {
    const customer = item ? Object.assign(item, data) : Object.assign({ id: genId() }, data);
    if (!item) store.customers.push(customer);
    saveStore(); if (onDone) onDone(); else render();
    onSiparisKuralYaz(customer);
  });
}
// Rehberden kişi seç — native getContacts + uygulama-içi liste (native picker'a bağımlı değil).
function rehberSecModal(list) {
  return new Promise((resolve) => {
    const body = `<input id="rsAra" placeholder="Ara (isim/numara)..." style="width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:11px" /><div id="rsList" style="max-height:52vh;overflow:auto;margin-top:8px"></div>`;
    const m = openModal("Rehberden Kişi Seç (" + list.length + ")", body, { noFoot: true, onMount: (ov) => {
      const liste = ov.querySelector("#rsList"), ara = ov.querySelector("#rsAra");
      const ciz = (q) => {
        const f = q ? list.filter((x) => ((x.ad || "") + " " + (x.tel || "")).toLocaleLowerCase("tr").includes(q)) : list;
        liste.innerHTML = f.slice(0, 400).map((x) => `<div class="rs-row" data-i="${list.indexOf(x)}"><b>${esc(x.ad || "(isimsiz)")}</b><span class="hint">${esc(x.tel || "-")}</span></div>`).join("") || `<p class="hint" style="padding:8px">Eşleşme yok.</p>`;
        liste.querySelectorAll("[data-i]").forEach((r) => r.onclick = () => { resolve(list[Number(r.dataset.i)]); m.close(); });
      };
      ciz(""); ara.addEventListener("input", () => ciz(ara.value.trim().toLocaleLowerCase("tr")));
      ov.querySelector(".x").addEventListener("click", () => resolve(null));
      ov.addEventListener("click", (e) => { if (e.target === ov) resolve(null); });
    } });
  });
}
async function rehberdenSec() {
  const CC = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Contacts;
  if (CC && CC.getContacts) {
    try {
      if (CC.requestPermissions) { try { await CC.requestPermissions(); } catch (e) {} }
      const res = await CC.getContacts({ projection: { name: true, phones: true } });
      const list = (res && res.contacts || []).map((c) => ({ ad: (c.name && c.name.display) || "", tel: (c.phones && c.phones[0] && c.phones[0].number) || "" })).filter((x) => x.ad || x.tel);
      if (!list.length) { alert("Rehberde kişi bulunamadı (izin verildi mi?)."); return null; }
      return await rehberSecModal(list);
    } catch (e) { alert("Rehber hatası: " + ((e && e.message) || e)); return null; }
  }
  if (navigator.contacts && navigator.contacts.select) {
    try { const r = await navigator.contacts.select(["name", "tel"], { multiple: false }); if (!r || !r.length) return null; return { ad: (r[0].name && r[0].name[0]) || "", tel: (r[0].tel && r[0].tel[0]) || "" }; } catch (e) { return null; }
  }
  alert("Rehber bu sürümde desteklenmiyor. Yeni APK'yı kur (rehber izinli) — telefonu elle gir.");
  return null;
}
async function rehberdenMusteriEkle() {
  const k = await rehberdenSec(); if (!k) return;
  const ad = (k.ad || "").trim() || (prompt("Müşteri adı:") || "").trim(); if (!ad) return;
  store.customers.push({ id: genId(), ad, telefon: (k.tel || "").trim() });
  saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); render();
  alert("Müşteri eklendi: " + ad + (k.tel ? " · " + k.tel : ""));
}
async function rehberdenNumaraAta(custId) {
  const k = await rehberdenSec(); if (!k) return;
  if (!k.tel) { alert("Seçilen kişide numara yok."); return; }
  const c = findCustomer(custId); if (!c) return;
  c.telefon = k.tel.trim(); saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); render();
  alert("Numara atandı: " + c.telefon);
}
function mountMusteriler() {
  const y = document.querySelector('[data-act="yeni-musteri"]'); if (y) y.addEventListener("click", () => openYeniMusteri());
  const rm = document.querySelector('[data-act="rehber-musteri"]'); if (rm) rm.addEventListener("click", rehberdenMusteriEkle);
  document.querySelectorAll("[data-duzenlec]").forEach((b) => b.addEventListener("click", () => openYeniMusteri(null, findCustomer(b.dataset.duzenlec))));
  document.querySelectorAll("[data-detay]").forEach((b) => b.addEventListener("click", () => { selectedCustomerId = b.dataset.detay; navigate("musteri-detay"); }));
  document.querySelectorAll("[data-delc]").forEach((b) => b.addEventListener("click", () => { const c = findCustomer(b.dataset.delc); if (c && confirm(`"${c.ad}" silinsin mi?`)) { store.customers = store.customers.filter((x) => x.id !== c.id); saveStore(); render(); } }));
  document.querySelectorAll("[data-odeme]").forEach((b) => b.addEventListener("click", () => openOdemeAl(b.dataset.odeme)));
  document.querySelectorAll("[data-borcekle]").forEach((b) => b.addEventListener("click", () => openBorcEkle(b.dataset.borcekle)));
  const o = document.querySelector('[data-act="csvOut"]'); if (o) o.addEventListener("click", exportCustomers);
  const i = document.querySelector('[data-act="csvIn"]'); if (i) i.addEventListener("click", () => openCsvImport(importCustomers));
  const t = document.querySelector('[data-act="csvTpl"]'); if (t) t.addEventListener("click", () => downloadFile("babuco-musteri-sablon.csv", csvBuild([["Müşteri Adı", "Telefon", "Açılış Borcu", "Adres", "Vergi No"]])));
  wireTableSearch();
}
function openOdemeAl(custId) {
  const c = findCustomer(custId); if (!c) return;
  const borc = customerBorc(custId);
  openModal(`Ödeme Al — ${esc(c.ad)}`, `<p class="sub">Kalan borç: <strong>${money.format(borc)}</strong></p>
    <div class="field"><label>Tahsilat Tutarı (₺) *</label><input id="pTut" type="number" step="0.01" inputmode="decimal" value="${borc > 0 ? borc : ""}" /></div>
    <div class="field"><label>Para nasıl geldi?</label>${turSeciciHTML("nakit")}</div>
    <div class="field"><label>Tarih</label><input id="pTarih" type="date" value="${todayStr()}" /></div>
    <div class="field"><label>Not</label><input id="pNot" placeholder="opsiyonel" /></div>`, {
    okLabel: "Ödemeyi Kaydet",
    onMount: (ov) => turSeciciWire(ov),
    onOk: (ov) => {
      const t = kurus(ov.querySelector("#pTut").value); if (!t || t <= 0) { alert("Geçerli tutar girin."); return false; }
      const tv = ov.querySelector("#pTarih").value;
      const tarih = tv ? new Date(tv + "T12:00:00").toISOString() : new Date().toISOString();
      const odemeTuru = (ov.querySelector("#pTur") || { dataset: {} }).dataset.tur || "nakit";
      store.payments.push({ id: genId(), musteriId: custId, tutar: t, odemeTuru, not: ov.querySelector("#pNot").value.trim(), tarih });
      bayiPuanEkle(c, t); saveStore(); render();
    },
  });
}
// Yanlışlıkla fazla/az tahsilat girilmesi gibi durumları düzeltmek için müşteri borcuna elle ekleme yapılır.
// customerBorc negatif tutarlı payments kaydını borç artışı olarak sayar (bkz. customerBorc).
function openBorcEkle(custId) {
  const c = findCustomer(custId); if (!c) return;
  const borc = customerBorc(custId);
  openModal(`Veresiye Borç Ekle — ${esc(c.ad)}`, `<p class="sub">Kalan borç: <strong>${money.format(borc)}</strong></p>
    <div class="field"><label>Eklenecek Borç (₺) *</label><input id="bTut" type="number" step="0.01" /></div>
    <div class="field"><label>Tarih</label><input id="bTarih" type="date" value="${todayStr()}" /></div>
    <div class="field"><label>Not</label><input id="bNot" placeholder="opsiyonel — ör. hatalı tahsilat düzeltmesi" /></div>`, {
    okLabel: "Borcu Kaydet",
    onOk: (ov) => {
      const t = Number(ov.querySelector("#bTut").value); if (!t || t <= 0) { alert("Geçerli tutar girin."); return false; }
      const tv = ov.querySelector("#bTarih").value;
      const tarih = tv ? new Date(tv + "T12:00:00").toISOString() : new Date().toISOString();
      store.payments.push({ id: genId(), musteriId: custId, tutar: -t, odemeTuru: "duzeltme", not: ov.querySelector("#bNot").value.trim() || "Manuel borç ekleme", tarih });
      saveStore(); render();
    },
  });
}
let selectedCustomerId = null;
function renderMusteriDetay() {
  const c = selectedCustomerId ? findCustomer(selectedCustomerId) : null;
  if (!c) return pageHead("Müşteri Detay") + `<div class="card"><p class="sub">Müşteri seçilmedi. <button class="link-btn" data-goto="musteriler">Müşteriler listesine dön</button>.</p></div>`;
  const sales = store.sales.filter((s) => s.musteriId === c.id).sort((a, b) => b.tarih.localeCompare(a.tarih));
  const pays = store.payments.filter((p) => p.musteriId === c.id).sort((a, b) => b.tarih.localeCompare(a.tarih));
  const salesRows = sales.map((s, i) => `<tr><td>${i + 1}</td><td><button class="link-btn" data-sale="${s.id}">${esc(s.belgeNo)}</button></td><td>${s.items.reduce((a, it) => a + it.adet, 0)}</td><td>${money.format(s.toplam)}</td><td>${money.format(s.odeme.acik)}</td><td>${saleOdeme(s)}</td><td>${fmtDate(s.tarih)}</td></tr>`).join("");
  const payRows = pays.map((p, i) => `<tr><td>${i + 1}</td><td>${p.tutar < 0 ? "Borç Ekleme" : (tahsilatTuru(p) === "iade" ? "İade" : (tahsilatTuru(p) === "duzeltme" ? "Düzeltme" : "Tahsilat · " + TAHSILAT_TUR_AD[tahsilatTuru(p)]))}</td><td>${esc(p.not || "-")}</td><td>${money.format(Math.abs(p.tutar))}</td><td>${fmtDate(p.tarih)}</td></tr>`).join("");
  const tsipler = store.tsiparisler.filter((t) => t.musteriId === c.id).sort((a, b) => b.tarih.localeCompare(a.tarih));
  const tsipRows = tsipler.map((t, i) => `<tr><td>${i + 1}</td><td><button class="link-btn" data-tsip="${t.id}">${esc(tsiparisKalemOzet(t))}</button></td><td>${money.format(t.toplamTutar)}</td><td>${money.format(tsiparisKalanTutar(t))}</td><td>${tsiparisAcikMi(t) ? '<span class="risk-orta">Açık</span>' : '<span class="risk-dusuk">Kapandı</span>'}</td><td>${fmtDate(t.tarih)}</td></tr>`).join("");
  return pageHead("Müşteri Detay", esc(c.ad) + (c.telefon ? " · 📞 " + esc(c.telefon) : " · telefon yok"), [{ label: "Ödeme Al", cls: "green", act: "odeme" }, { label: "Veresiye Borç Ekle", cls: "soft", act: "borcekle" }, { label: "🧾 Hesap Özeti", cls: "softgreen", act: "ekstre" }, { label: "📦 Toplu Sipariş", cls: "soft", act: "tsipYeni" }, { label: "📋 Fiyat Listesi", cls: "softgreen", act: "fiyatliste" }, { label: "📇 Rehberden Numara", cls: "soft", act: "rehber" }, { label: "✏ Düzenle", cls: "soft", act: "duzenle" }, { label: "Müşteriler", cls: "soft", route: "musteriler" }]) +
    grid([["Toplam Satış", money.format(sales.reduce((s, x) => s + x.toplam, 0)), "blue"], ["Açılış Borcu", money.format(Number(c.acilis) || 0)], ["Tahsilat", money.format(pays.reduce((s, p) => s + p.tutar, 0)), "green"], ["Kalan Borç", money.format(customerBorc(c.id))]]) + musteriDurumKartHTML(c.id) +
    `<h1 style="font-size:15px;margin:18px 0 8px">Alışverişler</h1>` + tableCard(["Sıra", "Belge No", "Toplam Ürün", "Toplam Tutar", "Açık Hesap", "Ödeme Tipi", "Tarih"], salesRows, infoLine(sales.length)) +
    `<h1 style="font-size:15px;margin:18px 0 8px">Tahsilatlar</h1>` + tableCard(["Sıra", "Türü", "Not", "Tutar", "Tarih"], payRows, infoLine(pays.length)) +
    `<h1 style="font-size:15px;margin:18px 0 8px">Toplu Siparişler</h1>` + tableCard(["Sıra", "Kalemler (kalan/sipariş)", "Toplam Tutar", "Kalan Tutar", "Durum", "Tarih"], tsipRows, infoLine(tsipler.length));
}
function mountMusteriDetay() {
  const o = document.querySelector('[data-act="odeme"]'); if (o) o.addEventListener("click", () => openOdemeAl(selectedCustomerId));
  const be = document.querySelector('[data-act="borcekle"]'); if (be) be.addEventListener("click", () => openBorcEkle(selectedCustomerId));
  const ty = document.querySelector('[data-act="tsipYeni"]'); if (ty) ty.addEventListener("click", () => openYeniTsiparis(selectedCustomerId));
  document.querySelectorAll("[data-tsip]").forEach((b) => b.addEventListener("click", () => { selectedTsiparisId = b.dataset.tsip; navigate("tsiparis-detay"); }));
  const rb = document.querySelector('[data-act="rehber"]'); if (rb) rb.addEventListener("click", () => rehberdenNumaraAta(selectedCustomerId));
  const dz = document.querySelector('[data-act="duzenle"]'); if (dz) dz.addEventListener("click", () => openYeniMusteri(null, findCustomer(selectedCustomerId)));
  const fl = document.querySelector('[data-act="fiyatliste"]'); if (fl) fl.addEventListener("click", () => openFiyatListesi(selectedCustomerId));
  const ek = document.querySelector('[data-act="ekstre"]'); if (ek) ek.addEventListener("click", () => ekstreModal(selectedCustomerId));
  document.querySelectorAll("[data-hatirlat]").forEach((b) => b.addEventListener("click", () => hatirlatmaAc(b.dataset.hatirlat)));
  wireSaleLinks();
}

/* ---- Toplu Sipariş ekranları ---- */
let selectedTsiparisId = null;
let tsipDraft = []; // yeni sipariş oluşturma modalının taslak kalemleri
function openYeniTsiparis(custId) {
  const c = findCustomer(custId); if (!c) return;
  tsipDraft = [];
  const prodOpts = `<option value="">Ürün seçin</option>` + store.products.filter((p) => p.gorunur !== false).map((p) => `<option value="${p.id}" data-fiyat="${Number(p.satis) || 0}">${esc(p.ad)}</option>`).join("");
  const body = `<p class="sub">${esc(c.ad)} için toplu sipariş — birden fazla ürün ekleyebilirsin. Bu, satıştan ayrı bir "sözleşme" kaydıdır; zamanla parça parça teslim edip parça parça tahsil edeceksin.</p>
    <div class="filters">
      <div class="field" style="flex:2"><label>Ürün</label><select id="tsUrun">${prodOpts}</select></div>
      <div class="field"><label>Adet</label><input id="tsAdet" type="number" step="0.01" value="1" /></div>
      <div class="field"><label>Birim Fiyat (₺)</label><input id="tsFiyat" type="number" step="0.01" /></div>
      <div class="field"><label>&nbsp;</label><button class="btn soft" id="tsEkle" type="button">+ Ekle</button></div>
    </div>
    <div id="tsList" class="sd-list" style="margin-top:10px"></div>
    <div class="totbox sd-genel" style="margin-top:12px"><strong>Sipariş Toplamı</strong><span id="tsTot">₺0,00</span></div>
    <div class="field" style="margin-top:10px"><label>Not</label><input id="tsNot" placeholder="opsiyonel" /></div>`;
  openModal(`Yeni Toplu Sipariş — ${esc(c.ad)}`, body, {
    wide: true,
    okLabel: "Siparişi Kaydet",
    onMount: (ov) => {
      const draw = () => {
        ov.querySelector("#tsList").innerHTML = tsipDraft.map((k, i) => `<div class="sd-card"><div class="sd-card-top"><div class="sd-card-name">${esc(k.ad)}</div><b class="sd-card-tot">${money.format(k.adet * k.fiyat)}</b><button class="sd-del" data-tsmv="${i}" type="button" aria-label="Kaldır">&times;</button></div><div class="sd-card-sub">${num2.format(k.adet)} × ${money.format(k.fiyat)}</div></div>`).join("") || `<p class="hint">Henüz ürün eklenmedi.</p>`;
        ov.querySelector("#tsTot").textContent = money.format(tsipDraft.reduce((a, k) => a + k.adet * k.fiyat, 0));
        ov.querySelectorAll("[data-tsmv]").forEach((b) => b.addEventListener("click", () => { tsipDraft.splice(Number(b.dataset.tsmv), 1); draw(); }));
      };
      ov.querySelector("#tsUrun").addEventListener("change", (e) => { const o = e.target.selectedOptions[0]; ov.querySelector("#tsFiyat").value = o ? (o.dataset.fiyat || 0) : ""; });
      ov.querySelector("#tsEkle").addEventListener("click", () => {
        const pid = ov.querySelector("#tsUrun").value, adet = Number(ov.querySelector("#tsAdet").value), fiyat = Number(ov.querySelector("#tsFiyat").value) || 0;
        if (!pid || !adet || adet <= 0) { alert("Ürün ve adet girin."); return; }
        const pr = findProduct(pid); if (!pr) return;
        const mevcut = tsipDraft.find((k) => k.urunId === pid);
        if (mevcut) { mevcut.adet += adet; mevcut.fiyat = fiyat; } else tsipDraft.push({ urunId: pid, ad: pr.ad, adet, fiyat });
        ov.querySelector("#tsUrun").value = ""; ov.querySelector("#tsAdet").value = "1"; ov.querySelector("#tsFiyat").value = "";
        draw();
      });
      draw();
    },
    onOk: (ov) => {
      if (!tsipDraft.length) { alert("En az bir ürün ekleyin."); return false; }
      const toplamTutar = tsipDraft.reduce((a, k) => a + k.adet * k.fiyat, 0);
      store.tsiparisler.push({ id: genId(), musteriId: custId, tarih: new Date().toISOString(), not: ov.querySelector("#tsNot").value.trim(), kalemler: tsipDraft.map((k) => Object.assign({}, k)), toplamTutar, hareketler: [] });
      saveStore(); render();
    },
  });
}
function renderTsiparisDetay() {
  const t = selectedTsiparisId ? findTsiparis(selectedTsiparisId) : null;
  if (!t) return pageHead("Toplu Sipariş") + `<div class="card"><p class="sub">Sipariş bulunamadı. <button class="link-btn" data-goto="musteriler">Müşteriler listesine dön</button>.</p></div>`;
  const c = findCustomer(t.musteriId);
  const kalemRows = t.kalemler.map((k, i) => `<tr><td>${i + 1}</td><td>${esc(k.ad)}</td><td>${num2.format(k.adet)}</td><td>${num2.format(k.adet - tsiparisKalemKalan(t, k.urunId))}</td><td>${num2.format(tsiparisKalemKalan(t, k.urunId))}</td><td>${money.format(k.fiyat)}</td></tr>`).join("");
  const hareketRows = t.hareketler.slice().sort((a, b) => b.tarih.localeCompare(a.tarih)).map((h, i) => {
    const teslimTxt = (h.teslim || []).filter((x) => x.adet > 0).map((x) => x.ad + " " + num2.format(x.adet)).join(", ");
    const ekstraTxt = (h.ekstra || []).filter((x) => x.adet > 0).map((x) => x.ad + " " + num2.format(x.adet)).join(", ");
    return `<tr><td>${i + 1}</td><td>${esc(h.belgeNo || "-")}</td><td>${esc(teslimTxt || "-")}</td><td>${esc(ekstraTxt || "-")}</td><td>${money.format(h.odeme || 0)}</td><td>${esc(h.not || "-")}</td><td>${fmtDate(h.tarih)}</td></tr>`;
  }).join("");
  return pageHead("Toplu Sipariş Detayı", (c ? esc(c.ad) + " · " : "") + (tsiparisAcikMi(t) ? "Açık" : "Kapandı"), [{ label: "Teslimat / Ödeme Gir", cls: "green", act: "hareket" }, { label: "🗑 Siparişi Sil", cls: "softred", act: "sil" }, { label: "Müşteriye Dön", cls: "soft", act: "musteriyeDon" }]) +
    grid([["Sipariş Toplamı", money.format(t.toplamTutar), "blue"], ["Ödenen", money.format(tsiparisOdenen(t)), "green"], ["Kalan Tutar", money.format(tsiparisKalanTutar(t))], ["Not", esc(t.not || "-")]]) +
    `<h1 style="font-size:15px;margin:18px 0 8px">Sipariş Kalemleri</h1>` + tableCard(["Sıra", "Ürün", "Sipariş Adet", "Teslim Edilen", "Kalan", "Birim Fiyat"], kalemRows, infoLine(t.kalemler.length)) +
    `<h1 style="font-size:15px;margin:18px 0 8px">Hareketler (Teslimat / Ödeme Fişleri)</h1>` + tableCard(["Sıra", "Belge No", "Teslim Edilen", "Ekstra Satış", "Ödeme", "Not", "Tarih"], hareketRows, infoLine(t.hareketler.length));
}
function mountTsiparisDetay() {
  const t = selectedTsiparisId ? findTsiparis(selectedTsiparisId) : null; if (!t) return;
  const h = document.querySelector('[data-act="hareket"]'); if (h) h.addEventListener("click", () => openTsiparisHareket(t.id));
  const md = document.querySelector('[data-act="musteriyeDon"]'); if (md) md.addEventListener("click", () => { selectedCustomerId = t.musteriId; navigate("musteri-detay"); });
  const sil = document.querySelector('[data-act="sil"]');
  if (sil) sil.addEventListener("click", () => {
    if (!confirm("Bu toplu sipariş silinsin mi? Teslim edilmiş ürünlerin stoğu geri yüklenir.")) return;
    t.hareketler.forEach((hr) => { (hr.teslim || []).forEach((k) => stokEkle(k.urunId, k.adet)); (hr.ekstra || []).forEach((k) => stokEkle(k.urunId, k.adet)); });
    const mid = t.musteriId;
    store.tsiparisler = store.tsiparisler.filter((x) => x.id !== t.id);
    saveStore(); selectedCustomerId = mid; navigate("musteri-detay");
  });
}
// Teslimat + ekstra ürün + ödeme — hepsi tek fişte. Teslim edilen adet ile alınan ödeme birbirinden
// bağımsızdır; kullanıcı o gün ne bıraktıysa, müşteri ne ödediyse onu girer.
let tsipEkstraDraft = [];
function openTsiparisHareket(tsipId) {
  const t = findTsiparis(tsipId); if (!t) return;
  tsipEkstraDraft = [];
  const acikKalemler = t.kalemler.filter((k) => tsiparisKalemKalan(t, k.urunId) > 0.001);
  const kalemInputs = acikKalemler.map((k) => {
    const kalan = tsiparisKalemKalan(t, k.urunId);
    return `<div class="field"><label>${esc(k.ad)} — kalan ${num2.format(kalan)}</label><input class="th-teslim" data-urun="${k.urunId}" data-kalan="${kalan}" type="number" step="0.01" placeholder="0" /></div>`;
  }).join("") || `<p class="hint">Bu siparişteki tüm ürünler teslim edilmiş.</p>`;
  const prodOpts = `<option value="">Ürün seçin</option>` + store.products.filter((p) => p.gorunur !== false).map((p) => `<option value="${p.id}" data-fiyat="${Number(p.satis) || 0}">${esc(p.ad)}</option>`).join("");
  const body = `<p class="sub">Bugün siparişten teslim ettiğin ürünleri gir, gerekirse ayrıca ekstra ürün ekle ve/veya alınan ödemeyi yaz. Hepsi tek fişe yansır.</p>
    <h1 style="font-size:13px;margin:10px 0 6px">Sipariş Teslimatı</h1>
    <div class="form-grid">${kalemInputs}</div>
    <h1 style="font-size:13px;margin:14px 0 6px">Ekstra Ürün (siparişe dahil olmayan, o gün ayrıca satılan)</h1>
    <div class="filters">
      <div class="field" style="flex:2"><label>Ürün</label><select id="thUrun">${prodOpts}</select></div>
      <div class="field"><label>Adet</label><input id="thAdet" type="number" step="0.01" value="1" /></div>
      <div class="field"><label>Birim Fiyat (₺)</label><input id="thFiyat" type="number" step="0.01" /></div>
      <div class="field"><label>&nbsp;</label><button class="btn soft" id="thEkle" type="button">+ Ekle</button></div>
    </div>
    <div id="thList" class="sd-list" style="margin-top:6px"></div>
    <h1 style="font-size:13px;margin:14px 0 6px">Ödeme</h1>
    <div class="field"><label>Bugün Alınan Ödeme (₺)</label><input id="thOdeme" type="number" step="0.01" placeholder="0" /></div>
    <div class="field"><label>Not</label><input id="thNot" placeholder="opsiyonel" /></div>`;
  openModal(`Teslimat / Ödeme — ${esc(findCustomer(t.musteriId) ? findCustomer(t.musteriId).ad : "")}`, body, {
    wide: true,
    okLabel: "Fişi Kaydet",
    onMount: (ov) => {
      const draw = () => {
        ov.querySelector("#thList").innerHTML = tsipEkstraDraft.map((k, i) => `<div class="sd-card"><div class="sd-card-top"><div class="sd-card-name">${esc(k.ad)}</div><b class="sd-card-tot">${money.format(k.adet * k.fiyat)}</b><button class="sd-del" data-thmv="${i}" type="button" aria-label="Kaldır">&times;</button></div><div class="sd-card-sub">${num2.format(k.adet)} × ${money.format(k.fiyat)}</div></div>`).join("") || `<p class="hint">Ekstra ürün eklenmedi.</p>`;
        ov.querySelectorAll("[data-thmv]").forEach((b) => b.addEventListener("click", () => { tsipEkstraDraft.splice(Number(b.dataset.thmv), 1); draw(); }));
      };
      ov.querySelector("#thUrun").addEventListener("change", (e) => { const o = e.target.selectedOptions[0]; ov.querySelector("#thFiyat").value = o ? (o.dataset.fiyat || 0) : ""; });
      ov.querySelector("#thEkle").addEventListener("click", () => {
        const pid = ov.querySelector("#thUrun").value, adet = Number(ov.querySelector("#thAdet").value), fiyat = Number(ov.querySelector("#thFiyat").value) || 0;
        if (!pid || !adet || adet <= 0) { alert("Ürün ve adet girin."); return; }
        const pr = findProduct(pid); if (!pr) return;
        const mevcut = tsipEkstraDraft.find((k) => k.urunId === pid);
        if (mevcut) { mevcut.adet += adet; mevcut.fiyat = fiyat; } else tsipEkstraDraft.push({ urunId: pid, ad: pr.ad, adet, fiyat });
        ov.querySelector("#thUrun").value = ""; ov.querySelector("#thAdet").value = "1"; ov.querySelector("#thFiyat").value = "";
        draw();
      });
      draw();
    },
    onOk: (ov) => {
      const teslim = [];
      let asimVar = false;
      ov.querySelectorAll(".th-teslim").forEach((el) => {
        const adet = Number(el.value) || 0; if (adet <= 0) return;
        const kalan = Number(el.dataset.kalan) || 0;
        if (adet > kalan + 0.001) { asimVar = true; return; }
        const k = t.kalemler.find((x) => x.urunId === el.dataset.urun);
        teslim.push({ urunId: el.dataset.urun, ad: k.ad, adet });
      });
      if (asimVar) { alert("Teslim edilen miktar siparişteki kalan miktardan fazla olamaz."); return false; }
      const odeme = Number(ov.querySelector("#thOdeme").value) || 0;
      if (!teslim.length && !tsipEkstraDraft.length && !odeme) { alert("Teslimat, ekstra ürün veya ödemeden en az birini girin."); return false; }
      store.counters.tsiparis = (store.counters.tsiparis || 0) + 1;
      const belgeNo = "TS-" + new Date().getFullYear() + "-" + String(store.counters.tsiparis).padStart(6, "0");
      const hareket = { id: genId(), belgeNo, tarih: new Date().toISOString(), teslim, ekstra: tsipEkstraDraft.map((k) => Object.assign({}, k)), odeme, not: ov.querySelector("#thNot").value.trim() };
      teslim.forEach((k) => stokDus(k.urunId, k.adet));
      tsipEkstraDraft.forEach((k) => stokDus(k.urunId, k.adet));
      t.hareketler.push(hareket);
      saveStore();
      printTsiparisFis(t, hareket);
      render();
    },
  });
}
function printTsiparisFis(t, h) {
  const c = findCustomer(t.musteriId);
  const st = store.settings;
  const head = `<h2>${esc(st.fisBaslik || st.firmaAdi)}</h2>${st.fisAdres ? `<div class="c">${esc(st.fisAdres)}</div>` : ""}${st.fisTel ? `<div class="c">Tel: ${esc(st.fisTel)}</div>` : ""}<div class="c">Toplu Sipariş — Teslimat / Ödeme Fişi</div><hr>`;
  const ekstraRows = (h.ekstra || []).map((it) => `<tr><td>${esc(it.ad)}</td><td class="c">${num2.format(it.adet)}</td><td class="r">${money.format(it.fiyat * it.adet)}</td></tr>`).join("");
  const ekstraToplam = (h.ekstra || []).reduce((a, it) => a + it.adet * it.fiyat, 0);
  const teslimRows = (h.teslim || []).map((it) => { const kalan = tsiparisKalemKalan(t, it.urunId); const sip = t.kalemler.find((k) => k.urunId === it.urunId); return `<tr><td>${esc(it.ad)}</td><td class="r">${num2.format(sip ? sip.adet : 0)} - ${num2.format(it.adet)} = ${num2.format(kalan)} kalan</td></tr>`; }).join("");
  const foot = `<hr><div class="c">${esc(st.fisAltbilgi || "Teşekkür ederiz")}</div>`;
  openPrint("Toplu Sipariş Fişi " + h.belgeNo, `${head}
    <div>Belge No: ${h.belgeNo}</div><div>Tarih: ${fmtDate(h.tarih)}</div>${c ? `<div>Müşteri: ${esc(c.ad)}</div>` : ""}<hr>
    ${ekstraRows ? `<div class="c"><b>Ekstra Ürünler</b></div><table>${ekstraRows}</table><table><tr><td><b>Ekstra Toplam</b></td><td class="r"><b>${money.format(ekstraToplam)}</b></td></tr></table><hr>` : ""}
    ${teslimRows ? `<div class="c"><b>Toplu Siparişten Bırakılan</b></div><table>${teslimRows}</table><hr>` : ""}
    <table>${h.odeme ? `<tr><td>Bugün Alınan Ödeme</td><td class="r">${money.format(h.odeme)}</td></tr>` : ""}<tr><td>Sipariş Kalan Tutarı</td><td class="r">${money.format(tsiparisKalanTutar(t))}</td></tr></table>
    ${h.not ? `<div>Not: ${esc(h.not)}</div>` : ""}${foot}`);
}

/* ---- Fiyat Listesi (müşteriye WhatsApp metni / PDF olarak gönder) ---- */
// Görünür ürünleri gruba göre ayırır; grup adları ve her grubun ürünleri alfabetik sıralı.
// Metin ve PDF üretimi bu ortak yapıyı kullanır.
function fiyatGruplari(secili) {
  const gruplar = {};
  store.products.filter((p) => p.gorunur !== false && (!secili || secili.has(String(p.id)))).forEach((p) => {
    const g = ((p.grup || "").trim()) || "Diğer";
    (gruplar[g] = gruplar[g] || []).push(p);
  });
  const gAdlari = Object.keys(gruplar).sort((a, b) => a.localeCompare(b, "tr"));
  gAdlari.forEach((g) => gruplar[g].sort((a, b) => String(a.ad).localeCompare(String(b.ad), "tr")));
  return { gAdlari, gruplar };
}
function urunBirimEk(p) { return p.birim && p.birim !== "Adet" ? ` (${p.birim})` : ""; }

// WhatsApp için düzenlenebilir düz metin fiyat listesi.
function buildFiyatListesi(secili) {
  const st = store.settings || {};
  const firma = st.firmaAdi || "FİYAT LİSTESİ";
  const bugun = new Date().toLocaleDateString("tr-TR");
  const { gAdlari, gruplar } = fiyatGruplari(secili);
  let govde = "";
  gAdlari.forEach((g) => {
    govde += gAdlari.length > 1 ? `\n*${g}*\n` : "\n";
    gruplar[g].forEach((p) => { govde += `• ${p.ad}${urunBirimEk(p)} — ${money.format(Number(p.satis) || 0)}\n`; });
  });
  return `📋 ${firma} — FİYAT LİSTESİ\n${bugun}\n${govde}\nFiyatlarımıza KDV dahildir. Bilgilerinize sunarız.`;
}

// PDF/yazdırma: düzenli tablo görünümlü liste. Yazdır dialogunda "PDF olarak kaydet/paylaş"
// ile müşteriye PDF gönderilir (tarayıcının kendi PDF motoru — Türkçe karakterler tam).
function fiyatListesiPDF(secili) {
  const { gAdlari, gruplar } = fiyatGruplari(secili);
  if (!gAdlari.length) { alert("Gönderilecek ürün seçili değil."); return; }
  const st = store.settings || {};
  const firma = esc(st.firmaAdi || "FİYAT LİSTESİ");
  const bugun = new Date().toLocaleDateString("tr-TR");
  const tekGrup = gAdlari.length <= 1;
  let govde = "";
  gAdlari.forEach((g) => {
    if (!tekGrup) govde += `<h3 style="font-size:14px;margin:14px 0 4px">${esc(g)}</h3>`;
    const satir = gruplar[g].map((p) => `<tr><td>${esc(p.ad)}${esc(urunBirimEk(p))}</td><td class="r">${money.format(Number(p.satis) || 0)}</td></tr>`).join("");
    govde += `<table>${satir}</table>`;
  });
  const head = `<h2>${firma}</h2><div class="c">FİYAT LİSTESİ · ${bugun}</div>${st.fisTel ? `<div class="c">Tel: ${esc(st.fisTel)}</div>` : ""}<hr>`;
  const foot = `<hr><div class="c">Fiyatlarımıza KDV dahildir. Bilgilerinize sunarız.</div>`;
  openPrint("Fiyat Listesi — PDF", head + govde + foot);
}

// Pencere içi ürün seçim listesi (işaretle/kaldır). Hepsi varsayılan işaretli.
function fiyatSecimHTML() {
  const { gAdlari, gruplar } = fiyatGruplari();
  return gAdlari.map((g) => {
    const items = gruplar[g].map((p) =>
      `<label class="fl-item" data-ad="${esc(String(p.ad || "").toLocaleLowerCase("tr"))}" style="display:flex;align-items:center;gap:8px;padding:5px 2px;cursor:pointer">
        <input type="checkbox" data-pid="${esc(String(p.id))}" checked style="width:18px;height:18px;flex:none">
        <span style="flex:1;min-width:0">${esc(p.ad)}${esc(urunBirimEk(p))}</span>
        <span class="hint" style="flex:none">${money.format(Number(p.satis) || 0)}</span>
      </label>`).join("");
    return (gAdlari.length > 1 ? `<div style="font-weight:600;margin:8px 0 2px;font-size:12px;color:var(--muted,#6b7684)">${esc(g)}</div>` : "") + items;
  }).join("");
}

// Fiyat listesini gönderme penceresi: önce gönderilecek ürünleri seç, sonra
// WhatsApp metni / PDF olarak paylaş. custId verilirse o müşterinin numarasına gider.
function openFiyatListesi(custId) {
  const c = custId ? findCustomer(custId) : null;
  if (!store.products.filter((p) => p.gorunur !== false).length) {
    alert("Gönderilecek görünür ürün yok — önce ürün ekleyin.");
    return;
  }
  const metin = buildFiyatListesi();
  const kime = c
    ? esc(c.ad) + (c.telefon ? " · 📞 " + esc(c.telefon) : " · telefon kayıtlı değil, WhatsApp'ta kişi seçeceksin")
    : "WhatsApp açılınca kişiyi sen seçeceksin";
  const body = `
    <p class="hint" style="margin-bottom:6px">Alıcı: <b>${kime}</b></p>
    <p class="hint" style="margin:0 0 6px;font-size:12px"><b>1)</b> Bu müşteriye gidecek ürünleri seç (istemediğinin işaretini kaldır):</p>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <input id="flSearch" type="text" placeholder="🔍 Ürün ara..." style="flex:1;min-width:0;padding:8px 10px;border-radius:8px;border:1px solid var(--line,#d9dee6);font-size:13px">
      <button class="btn soft" id="flAll" type="button" style="min-height:38px">Tümü</button>
      <button class="btn soft" id="flNone" type="button" style="min-height:38px">Temizle</button>
    </div>
    <div id="flList" style="max-height:190px;overflow:auto;border:1px solid var(--line,#d9dee6);border-radius:10px;padding:8px 10px">${fiyatSecimHTML()}</div>
    <div class="hint" id="flCount" style="margin:6px 0 8px"></div>
    <p class="hint" style="margin:0 0 4px;font-size:12px"><b>2)</b> Metni gerekirse düzenle, sonra gönder:</p>
    <textarea id="flText" rows="8" style="width:100%;box-sizing:border-box;font-family:inherit;font-size:13px;line-height:1.55;padding:10px;border-radius:10px;border:1px solid var(--line,#d9dee6)">${esc(metin)}</textarea>
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      <button class="btn soft" id="flCopy" type="button" style="flex:1;justify-content:center;min-height:44px">📋 Tümünü Kopyala</button>
      <button class="btn softgreen" id="flPdf" type="button" style="flex:1;justify-content:center;min-height:44px">📄 PDF olarak paylaş</button>
    </div>
    <p class="hint" style="margin-top:6px;font-size:11px">PDF: açılan yazdırma ekranından <b>"PDF olarak kaydet"</b> → dosyayı WhatsApp'ta müşteriye ekle.</p>`;
  openModal("Fiyat Listesi Gönder", body, {
    wide: true,
    okLabel: "📲 WhatsApp'tan Gönder",
    onMount: (ov) => {
      const ta = ov.querySelector("#flText");
      const cnt = ov.querySelector("#flCount");
      const list = ov.querySelector("#flList");
      const kutular = () => Array.from(list.querySelectorAll('input[type="checkbox"]'));
      const seciliSet = () => { const s = new Set(); kutular().forEach((cb) => { if (cb.checked) s.add(cb.dataset.pid); }); return s; };
      const yenile = () => {
        const s = seciliSet(), tum = kutular().length;
        ta.value = s.size ? buildFiyatListesi(s) : "";
        cnt.textContent = s.size === 0 ? "⚠ Hiç ürün seçili değil" : (s.size === tum ? `Tüm ürünler seçili (${tum})` : `${s.size} / ${tum} ürün seçili`);
      };
      list.addEventListener("change", yenile);
      ov.querySelector("#flAll").addEventListener("click", () => { kutular().forEach((cb) => (cb.checked = true)); yenile(); });
      ov.querySelector("#flNone").addEventListener("click", () => { kutular().forEach((cb) => (cb.checked = false)); yenile(); });
      const sr = ov.querySelector("#flSearch");
      sr.addEventListener("input", () => {
        const q = sr.value.trim().toLocaleLowerCase("tr");
        list.querySelectorAll(".fl-item").forEach((el) => { el.style.display = !q || el.dataset.ad.includes(q) ? "flex" : "none"; });
      });
      const cp = ov.querySelector("#flCopy");
      cp.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(ta.value); cp.textContent = "✓ Kopyalandı"; }
        catch { ta.select(); try { document.execCommand("copy"); cp.textContent = "✓ Kopyalandı"; } catch { /* yoksay */ } }
        setTimeout(() => { cp.textContent = "📋 Tümünü Kopyala"; }, 1500);
      });
      ov.querySelector("#flPdf").addEventListener("click", () => {
        const s = seciliSet();
        if (!s.size) { alert("En az bir ürün seçmelisin."); return; }
        fiyatListesiPDF(s);
      });
      yenile();
    },
    onOk: (ov) => {
      const t = ov.querySelector("#flText").value.trim();
      if (!t) { alert("Önce en az bir ürün seç — liste boş."); return false; }
      let d = ((c && c.telefon) || "").replace(/\D/g, "");
      if (d.startsWith("0")) d = "9" + d; else if (d.length === 10) d = "90" + d;
      const url = (d ? "https://wa.me/" + d : "https://wa.me/") + "?text=" + encodeURIComponent(t);
      window.open(url, "_blank");
    },
  });
}
function odemeLabel(o) { const p = []; if (o.nakit) p.push("Nakit"); if (o.pos) p.push("POS"); if (o.acik) p.push("Açık Hesap"); return p.join(" + ") || "-"; }
function saleOdeme(s) { return s.odemeAdi || odemeLabel(s.odeme); }

/* ---- Satış Detay / Düzenleme ---- */
let selectedSaleId = null, saleLines = [];
function openSale(id) { selectedSaleId = id; navigate("satis-detay"); }
function wireSaleLinks() { document.querySelectorAll("[data-sale]").forEach((el) => el.addEventListener("click", () => openSale(el.dataset.sale))); }
function renderSatisDetay() {
  const s = store.sales.find((x) => x.id === selectedSaleId);
  if (!s) return pageHead("Satış Detayı") + `<div class="card"><p class="sub">Satış bulunamadı. <button class="link-btn" data-goto="rapor-tarihsel">Raporlara dön</button>.</p></div>`;
  saleLines = s.items.map((i) => Object.assign({}, i));
  const c = s.musteriId && findCustomer(s.musteriId);
  const musOpts = `<option value="">— Müşteri yok —</option>` + store.customers.map((m) => `<option value="${m.id}" ${s.musteriId === m.id ? "selected" : ""}>${esc(m.ad)}</option>`).join("");
  const otip = s.odeme.acik ? "acik" : (s.odeme.pos ? "pos" : "nakit");
  const odOpts = [["nakit", "NAKİT"], ["pos", "POS"], ["acik", "AÇIK HESAP"]].map((o) => `<option value="${o[0]}" ${otip === o[0] ? "selected" : ""}>${o[1]}</option>`).join("");
  return pageHead("Satış Detayı", "Belge No: " + esc(s.belgeNo), [{ label: "🖨 İrsaliye", cls: "soft", act: "print" }, { label: "📲 WhatsApp", cls: "soft", act: "wa" }, { label: "🖼 Resim Paylaş", cls: "soft", act: "resim" }, { label: "🗑 Satışı Sil", cls: "softred", act: "delsale" }, { label: "Geri", cls: "soft", route: "rapor-tarihsel" }]) +
    `<div class="card"><div class="form-grid">
      <div class="field"><label>Müşteri</label><select id="sdMus">${musOpts}</select></div>
      <div class="field"><label>Ödeme Tipi</label><select id="sdOdeme">${odOpts}</select></div>
      <div class="field"><label>Genel İskonto (₺)</label><input id="sdIsk" type="number" step="0.01" value="${s.iskonto || 0}" /></div>
      <div class="field"><label>Not</label><input id="sdNot" value="${esc(s.not || "")}" /></div>
      <div class="field"><label>Tarih</label><input value="${fmtDate(s.tarih)}" disabled /></div>
      <div class="field"><label>Satış Yapan</label><input value="${(s.personelId && (store.personeller.find((p) => p.id === s.personelId) || {}).ad) || "-"}" disabled /></div>
    </div></div>
    <div class="card"><h1 style="font-size:15px;margin:0 0 12px">Ürünler</h1>
      <div class="sd-list" id="sdBody"></div>
      <div class="totbox sd-genel" style="margin-top:12px"><strong>Genel Toplam</strong><span id="sdTot">₺0,00</span></div>
      <div style="text-align:right;margin-top:10px"><button class="btn green lg" id="sdSave" type="button">💾 Güncelle</button></div>
    </div>`;
}
function sdRowHTML(r, i) {
  const kdv = Number(r.kdv) || 0;
  return `<div class="sd-card">
    <div class="sd-card-top">
      <div class="sd-card-name">${esc(r.ad)}${kdv ? ` <span class="sd-kdv">%${kdv}</span>` : ""}</div>
      <b class="sd-card-tot">${money.format((Number(r.adet) || 0) * (Number(r.fiyat) || 0))}</b>
      <button class="sd-del" data-sdmv="${i}" type="button" aria-label="Ürünü sil" title="Ürünü sil">&times;</button>
    </div>
    <div class="sd-card-sub">
      <label class="sd-mini"><span>Adet</span><input class="row-in" data-sd="${i}" data-f="adet" type="number" step="0.01" inputmode="decimal" value="${r.adet}" /></label>
      <span class="sd-x">×</span>
      <label class="sd-mini"><span>B.Fiyat ₺</span><input class="row-in" data-sd="${i}" data-f="fiyat" type="number" step="0.01" inputmode="decimal" value="${r.fiyat}" /></label>
    </div>
  </div>`;
}
function sdRefresh() {
  document.getElementById("sdBody").innerHTML = saleLines.map(sdRowHTML).join("");
  const isk = Number(document.getElementById("sdIsk").value) || 0;
  const brut = saleLines.reduce((s, r) => s + (Number(r.adet) || 0) * (Number(r.fiyat) || 0), 0);
  document.getElementById("sdTot").textContent = money.format(Math.max(0, brut - isk));
  document.querySelectorAll("[data-sd]").forEach((el) => el.addEventListener("input", () => { saleLines[Number(el.dataset.sd)][el.dataset.f] = Number(el.value); sdRefresh(); }));
  document.querySelectorAll("[data-sdmv]").forEach((b) => b.addEventListener("click", () => { saleLines.splice(Number(b.dataset.sdmv), 1); sdRefresh(); }));
}
function mountSatisDetay() {
  const s = store.sales.find((x) => x.id === selectedSaleId); if (!s) return;
  sdRefresh();
  document.getElementById("sdIsk").addEventListener("input", sdRefresh);
  const pr = document.querySelector('[data-act="print"]'); if (pr) pr.addEventListener("click", () => printSale(s));
  const wa = document.querySelector('[data-act="wa"]'); if (wa) wa.addEventListener("click", () => irsaliyeWa(s));
  const rs = document.querySelector('[data-act="resim"]'); if (rs) rs.addEventListener("click", () => irsaliyePaylas(s));
  const del = document.querySelector('[data-act="delsale"]');
  if (del) del.addEventListener("click", () => { if (!confirm("Satış silinsin mi? (stok geri yüklenir)")) return; s.items.forEach((it) => { const p = findProduct(it.urunId); if (p) p.stok = (Number(p.stok) || 0) + it.adet; }); store.sales = store.sales.filter((x) => x.id !== s.id); saveStore(); navigate("rapor-tarihsel"); });
  document.getElementById("sdSave").addEventListener("click", () => {
    const otip = document.getElementById("sdOdeme").value;
    const mus = document.getElementById("sdMus").value || null;
    if (otip === "acik" && !mus) { alert("Açık hesap için müşteri seçin."); return; }
    if (!saleLines.length) { alert("En az bir ürün olmalı."); return; }
    // stok farkı: eski geri, yeni düş
    s.items.forEach((it) => { const p = findProduct(it.urunId); if (p) p.stok = (Number(p.stok) || 0) + it.adet; });
    saleLines.forEach((it) => { const p = findProduct(it.urunId); if (p) p.stok = (Number(p.stok) || 0) - Number(it.adet); });
    const isk = Number(document.getElementById("sdIsk").value) || 0;
    const brut = saleLines.reduce((a, r) => a + Number(r.adet) * Number(r.fiyat), 0);
    const toplam = Math.max(0, brut - isk);
    const maliyet = kurus(saleLines.reduce((a, r) => a + kalemAlis(r) * Number(r.adet), 0)); // satış anındaki maliyet (kalem.alis) korunur
    s.items = saleLines.map((r) => ({ urunId: r.urunId, ad: r.ad, barkod: r.barkod || "", kdv: Number(r.kdv) || 0, fiyat: Number(r.fiyat), adet: Number(r.adet), iskyuzde: Number(r.iskyuzde) || 0, alis: kalemAlis(r) }));
    s.musteriId = mus; s.not = document.getElementById("sdNot").value; s.iskonto = isk; s.brut = brut; s.toplam = toplam; s.maliyet = maliyet;
    s.odeme = { nakit: otip === "nakit" ? toplam : 0, pos: otip === "pos" ? toplam : 0, acik: otip === "acik" ? toplam : 0 };
    saveStore(); alert("Satış güncellendi ✔"); render();
  });
}

/* ============ SATIŞ (POS) ============ */
function newCart() { return { items: [], musteriId: null, iskonto: 0, odenen: 0 }; }
const pos = { carts: [newCart(), newCart(), newCart(), newCart(), newCart()], active: 0, cat: "ANA", personelId: null, q: "" };
function activeCart() { return pos.carts[pos.active]; }
/* Satış ekranı (telefon): ÜSTTE ürün seçimi, ALTTA sabit "Ödemeye geç" çubuğu; sepet + ödeme o çubuktan açılan pencerede.
   Akış: müşteri seç → ürüne dokun (sepete eklenir) → Ödemeye geç → adet düzelt → nasıl ödendi.
   Yeni adların hepsi gs… ile başlar (görsel yenileme / satış). Hesap yapan işlevler (finalizeSale, musteriFiyat…) aynen duruyor. */
/* Kategori ikonları — ortak ikon tablosuna EK (tablo düzenlenmez) */
IKON_YOLLAR.damla = 'M12 3.5c3.2 3.6 5.5 6.7 5.5 9.7a5.5 5.5 0 0 1-11 0c0-3 2.3-6.1 5.5-9.7z';
IKON_YOLLAR.sise = 'M10 2.5h4v3.2l2 2.8V20a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 20V8.5l2-2.8zM8 13h8';
IKON_YOLLAR.caybardak = 'M8.5 3h7c0 3.2-1.6 4.3-1.6 6.5 0 1.9 1.6 3 1.6 5.5a3.5 3.5 0 0 1-7 0c0-2.5 1.6-3.6 1.6-5.5C10.1 7.3 8.5 6.2 8.5 3zM5.5 21h13';
IKON_YOLLAR.fincan = 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.2a2.3 2.3 0 0 1 0 4.6H16M4 21.5h13M8.5 3v3M12.5 3v3';
IKON_YOLLAR.oyunkart = 'M7 3h10a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 17 21H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3zM12 8l3 4-3 4-3-4z';
IKON_YOLLAR.tabak = 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z';
IKON_YOLLAR.sprey = 'M9 10h5.5l1 3v7a1.5 1.5 0 0 1-1.5 1.5H9.5A1.5 1.5 0 0 1 8 20v-7zM10.5 10V6M9 6h5l3 1.5M9 6V4.5h3M19.5 5v.01M20.5 8v.01M19.5 11v.01';
IKON_YOLLAR.sekerleme = 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8.5 10 4 8.5l1.5 5zM15.5 14l4.5 1.5-1.5-5z';
IKON_YOLLAR.rulo = 'M4 9a4 5 0 1 0 8 0 4 5 0 0 0-8 0zM8 4h8a4 5 0 0 1 4 5v10h-8V9M8 9v.01';
IKON_YOLLAR.sandalye = 'M7 3v18M7 12h10v9M7 7h5';
IKON_YOLLAR.tencere = 'M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 10h20M9 6.5h6';

function renderSatis() {
  const c = activeCart(), arac = stokModu === "arac";
  return `<div class="pos2 gs-satis" id="gsSatis">
      <!-- Üst çubuk: panelin kendi rengi. Solda ekran adı; sağda adıyla yazılı iki düğme (gerisi "Diğer"de) -->
      <div class="gs-ust">
        <h1 class="gs-ust-ad">Satış</h1>
        <button class="gs-ust-btn" id="stokModBtn" type="button" aria-label="Mal ${arac ? "araçtan" : "dükkandan"} çıkıyor. Değiştirmek için dokun">${ikon(arac ? "araba" : "dukkan", 18)}<span>Stok: ${arac ? "Araç" : "Dükkan"}</span>${ikon("asagi", 14, 2.4)}</button>
        <button class="gs-ust-btn" id="gsDiger" type="button">${ikon("ucnokta", 18, 3)}<span>Diğer</span></button>
      </div>
      <div class="gs-govde">
        <!-- Birden çok sepet açıkken: hangisinde olduğun (tek sepette görünmez) -->
        <div id="gsSepetler">${gsSepetlerHTML()}</div>
        <!-- 1. Müşteri: ad + borç / limit / kalan / gecikme -->
        <div id="gsMusteri" data-gs-mus="sayfa">${gsMusteriBlokHTML("sayfa")}</div>
        <!-- Seçili müşterinin geçen siparişi (tek dokunuşla sepete) -->
        <div id="gsBundle">${bundleBarHTML()}</div>
        <!-- 2. Ürün seçimi: arama + barkod, altında kategoriler / ürünler -->
        <div class="gs-ara">
          <div class="gs-ara-kutu">${ikon("ara", 20)}<input id="prodSearch" class="gs-ara-in" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" placeholder="Ürün ara (ad ya da barkod)" value="${esc(pos.q || "")}" /><button class="gs-ara-x" id="prodSearchX" type="button" aria-label="Aramayı temizle" style="${pos.q ? "" : "display:none"}">${ikon("kapat", 18, 2.2)}</button></div>
          <button class="gs-tara" id="taraFab" type="button">${ikon("tara", 20)}<span>Tara</span></button>
        </div>
        <div class="gs-grid" id="prodGrid">${prodGridHTML()}</div>
        <div class="gs-bosluk" aria-hidden="true"></div>
      </div>
      <!-- Satış notu sepet penceresinde yazılır; finalizeSale buradan okur -->
      <input type="hidden" id="posNot" value="${esc(c.not || "")}" />
      <!-- 3. Alt çubuk (alt menünün hemen üstünde sabit): toplam + tek dokunuşla sepet ve ödeme -->
      <div class="gs-bar" id="gsBar">
        <button class="gs-bar-btn" id="gsSepetAc" type="button">
          <span class="gs-bar-sol"><b id="gsBarBas">Sepet boş</b><small id="gsBarAlt">Eklemek için ürüne dokun</small></span>
          <span class="gs-bar-sag"><b id="posTutar"></b>${ikon("sag", 20, 2.4)}</span>
        </button>
      </div>
    </div>`;
}
function cartCustName() { const id = activeCart().musteriId; const c = id && findCustomer(id); return c ? esc(c.ad) : ""; }
/* İçinde ürün ya da müşteri olan sepetler + şu an açık olan. Tek sepet kullanılırken liste 1 elemanlıdır. */
function gsAcikSepetler() { return pos.carts.map((c, n) => n).filter((n) => n === pos.active || pos.carts[n].items.length > 0 || !!pos.carts[n].musteriId); }
function gsSepetTutar(c) { return Math.max(0, c.items.reduce((s, i) => s + netLine(i), 0) - (Number(c.iskonto) || 0)); }
function gsSepetlerHTML() {
  const acik = gsAcikSepetler();
  if (acik.length < 2) return "";
  return `<div class="gs-sepetler"><div class="gs-sepetler-bas">${acik.length} sepet açık — hangisine satıyorsan ona dokun</div><div class="gs-sepetler-liste">${acik.map((n) => {
    const c = pos.carts[n], m = c.musteriId && findCustomer(c.musteriId), on = n === pos.active;
    return `<button class="gs-sepet-sec${on ? " on" : ""}" data-tab="${n}" type="button" aria-pressed="${on}"><span class="gs-ss-ad">${on ? ikon("tik", 16, 2.8) : ""}Sepet ${n + 1}${on ? " (açık)" : ""}</span><span class="gs-ss-mus">${m ? esc(m.ad) : "Müşterisiz"}</span><span class="gs-ss-tut">${c.items.length ? money.format(gsSepetTutar(c)) : "boş"}</span></button>`;
  }).join("")}</div></div>`;
}
/* Müşteri bloğu. yer: "sayfa" (ekranın üstü; custName / custLimit / custPick kimlikleri burada) | "sepet" (ödeme penceresi). */
function gsMusteriBlokHTML(yer) {
  const mid = activeCart().musteriId, mc = mid && findCustomer(mid);
  const kimlik = (ad) => (yer === "sayfa" ? ` id="${ad}"` : "");
  if (!mc) return `<button class="gs-mus bos" data-gs-muspick type="button"${kimlik("custPick")}>
      <span class="gs-mus-ik">${ikon("kisi", 22)}</span>
      <span class="gs-mus-orta"><b${kimlik("custName")}>Müşteri seç</b><span class="gs-mus-alt"${kimlik("custLimit")}>Seçmezsen müşterisiz satış olur</span></span>
      ${ikon("sag", 20, 2.2)}</button>`;
  return `<div class="gs-mus dolu">
      ${yer === "sayfa" ? `<span class="gs-mus-ik">${ikon("kisi", 22)}</span>` : ""}
      <span class="gs-mus-orta"><b${kimlik("custName")}>${esc(mc.ad)}</b><span class="gs-mus-alt"${kimlik("custLimit")}>${satisMusteriDurumHTML(mid, cartTotals().toplam)}</span></span>
      <button class="gs-mus-deg" data-gs-muspick type="button"${kimlik("custPick")}>Değiştir</button></div>`;
}
/* Seçili stok kaynağında (araç / dükkan) bu üründen ne var; sepetteki adet onu aşıyorsa "az" (uyarı, engel değil). */
function gsStokDurum(p, sepetAdet) {
  const s = aktifStok(p), yer = stokModu === "arac" ? "Araçta" : "Dükkanda";
  if ((Number(sepetAdet) || 0) > s + 0.0001) return { az: true, kisa: s > 0 ? yer + " " + num2.format(s) + " var" : yer + " yok", uzun: s > 0 ? yer + " yalnız " + num2.format(s) + " var" : yer + " yok görünüyor" };
  return { az: false, kisa: s > 0 ? yer + " " + num2.format(s) : yer + " yok", uzun: "" };
}
function gsSepetAdet(urunId) { return activeCart().items.reduce((a, i) => a + (i.urunId === urunId ? Number(i.adet) || 0 : 0), 0); }
/* Sepet satırı (ödeme penceresinde): solda ad + birim fiyat (dokun → fiyat/iskonto penceresi), sağda − [adet] + ve satır tutarı.
   Adet kutusuna doğrudan yazılır (10 koli için 10 kez dokunmak gerekmesin). */
function gsKalemStok(it) { const p = it.urunId && findProduct(it.urunId); const d = p ? gsStokDurum(p, gsSepetAdet(it.urunId)) : null; return d && d.az ? d.uzun : ""; }
function gsAzaltIc(adet) { return adet <= 1 ? ikon("cop", 20) : ikon("eksi", 20, 2.6); }
function cartRowsHTML() {
  const items = activeCart().items;
  if (!items.length) return `<div class="gs-kalem-bos">Sepet boş.</div>`;
  return items.map((it, idx) => {
    const isk = Number(it.iskyuzde) || 0, adet = Number(it.adet) || 0;
    const p = it.urunId && findProduct(it.urunId);
    const ozel = p && Number(it.fiyat) !== (Number(p.satis) || 0);
    const stok = gsKalemStok(it);
    return `<div class="gs-kalem" data-line="${idx}">
    <button class="gs-kalem-bilgi" data-lineac type="button" aria-label="${esc(it.ad)} — fiyatı ya da iskontoyu düzelt">
      <span class="gs-kalem-ad">${esc(it.ad)}</span>
      <span class="gs-kalem-birim">${money.format(Number(it.fiyat) || 0)}${ozel ? ` <span class="ozel-tag">özel</span>` : ""}${isk ? ` · %${num2.format(isk)} iskonto` : ""}<span class="gs-kalem-duz">${ikon("kalem", 14)}düzelt</span></span>
      <span class="gs-kalem-stok" data-lstok${stok ? "" : " hidden"}>${ikon("dikkat", 15, 2.2)}<span>${stok}</span></span>
    </button>
    <div class="gs-kalem-sag">
      <div class="gs-adim">
        <button class="${adet <= 1 ? "cikar" : ""}" data-lazalt="${idx}" type="button" aria-label="${adet <= 1 ? "Sepetten çıkar" : "Bir azalt"}">${gsAzaltIc(adet)}</button>
        <input class="gs-adet" data-ladet="${idx}" type="number" inputmode="decimal" step="any" min="0" value="${adet}" aria-label="Adet" />
        <button data-lart="${idx}" type="button" aria-label="Bir artır">${ikon("arti", 20, 2.6)}</button>
      </div>
      <div class="gs-kalem-tut" data-tut="${idx}">${money.format(netLine(it))}</div>
    </div>
  </div>`;
  }).join("");
}
/* Ürün ailesi: aynı ürünün marka/model çeşitleri tek başlık altında toplansın.
   Ada göre çalışma-anında (veri değişmez). Sadece net marka kümeleri. null = tekil ürün. */
function aileGetir(ad) {
  const n = ocrNorm(ad);
  if (/sade soda/.test(n)) return "Sade Soda";
  if (/limonlu soda/.test(n)) return "Limonlu Soda";
  if (/elmali soda/.test(n)) return "Elmalı Soda";
  if (/meyveli soda/.test(n)) return "Meyveli Soda";
  if (/meyve suyu/.test(n)) return "Meyve Suyu";
  if (/\bkola\b/.test(n) || /coca|pepsi/.test(n)) return "Kola";
  if (/gazoz/.test(n)) return "Gazoz";
  if (/ayran/.test(n)) return "Ayran";
  if (/ice tea/.test(n)) return "İce Tea";
  if (/filiz cay/.test(n)) return "Filiz Çay 5kg";
  if (/kup seker/.test(n)) return "Küp Şeker";
  if (/toz seker/.test(n)) return "Toz Şeker";
  // Su: içme suyu (meyve suyu/soda/ayran/süt değil)
  if (/\bsu\b/.test(n) && !/suyu|soda|ayran|kola/.test(n)) return "Su";
  return null;
}
/* Ürün kartı (satış ekranı + rota sihirbazı aynı kartı kullanır): ad, bu müşteriye uygulanacak fiyat, seçili kaynaktaki stok,
   sepetteyse köşede adedi. Dokununca sepete 1 eklenir. */
function posSoloCard(p) {
  const cesit = gelismisMod && varyantKardesler(p).length > 1;
  const adet = gsSepetAdet(p.id), stok = gsStokDurum(p, adet);
  return `<div class="gs-urun${adet > 0 ? " sepette" : ""}" data-add="${p.id}" role="button">
    <span class="gs-urun-ad">${esc(p.ad)}</span>
    <span class="gs-urun-alt"><span class="gs-urun-fiyat" data-gs-fiyat>${gsFiyatHTML(p)}</span><span class="gs-urun-stok${stok.az ? " az" : ""}" data-gs-stok>${stok.kisa}</span></span>
    ${cesit ? `<button class="gs-urun-cesit" data-cesit="${p.id}" type="button">Çeşitler${ikon("sag", 14, 2.4)}</button>` : ""}
    <span class="gs-urun-adet" data-gs-adet${adet > 0 ? "" : " hidden"}>${adet > 0 ? num2.format(adet) : ""}</span>
  </div>`;
}
/* Kartta görünen fiyat = dokununca sepete yazılacak fiyat (seçili müşterinin özel fiyatı varsa o, "özel" işaretiyle). */
function gsFiyatHTML(p) { const liste = Number(p.satis) || 0, fiyat = musteriFiyat(p.id, liste); return money.format(fiyat) + (fiyat !== liste ? ` <span class="ozel-tag">özel</span>` : ""); }
/* Kartlardaki "sepette kaç tane" işaretini, fiyatı ve stok yazısını sepete göre tazeler (ızgarayı yeniden kurmadan). */
function gsRozetSync() {
  document.querySelectorAll("#prodGrid [data-add]").forEach((el) => {
    const p = findProduct(el.dataset.add); if (!p) return;
    const n = gsSepetAdet(p.id), roz = el.querySelector("[data-gs-adet]"), stk = el.querySelector("[data-gs-stok]");
    el.classList.toggle("sepette", n > 0);
    if (roz) {
      const yeni = n > 0 ? num2.format(n) : "";
      if (roz.textContent !== yeni) { roz.textContent = yeni; roz.hidden = !(n > 0); roz.classList.remove("zipla"); if (n > 0) { void roz.offsetWidth; roz.classList.add("zipla"); } }
    }
    if (stk) { const d = gsStokDurum(p, n); stk.textContent = d.kisa; stk.classList.toggle("az", d.az); }
    const fy = el.querySelector("[data-gs-fiyat]"); if (fy) { const h = gsFiyatHTML(p); if (fy._h !== h) { fy.innerHTML = h; fy._h = h; } }
  });
}
// Müşterinin son siparişindeki (hâlâ mevcut) ürünler — bundle önerisi
function musteriSonSiparis(id) {
  if (!id) return [];
  const sales = store.sales.filter((s) => s.musteriId === id).sort((a, b) => b.tarih.localeCompare(a.tarih));
  if (!sales.length) return [];
  const seen = new Set(), out = [];
  sales[0].items.forEach((it) => { if (it.urunId && !seen.has(it.urunId) && findProduct(it.urunId)) { seen.add(it.urunId); out.push({ urunId: it.urunId, ad: it.ad }); } });
  return out;
}
// Seçili müşteri varsa "geçen sipariş" şeridi. Ürünlerin hepsi zaten sepetteyse görünmez (eklenecek bir şey kalmamıştır).
function bundleBarHTML() {
  const c = activeCart(), id = c.musteriId;
  if (!id) return "";
  const items = musteriSonSiparis(id);
  if (!items.length) return "";
  if (items.every((i) => c.items.some((x) => x.urunId === i.urunId))) return "";
  const adlar = items.slice(0, 4).map((i) => esc(i.ad)).join(", ") + (items.length > 4 ? " +" + (items.length - 4) : "");
  return `<div class="gs-bundle">
    <div class="gs-bundle-txt"><b>Geçen sipariş · ${items.length} ürün</b><span>${adlar}</span></div>
    <button class="gs-bundle-btn" id="bundleAdd" type="button">${ikon("arti", 18, 2.6)}<span>Sepete ekle</span></button>
  </div>`;
}
// Bundle'ı sepete uygula (her ürün adet 1; zaten varsa dokunma)
function bundleUygula() {
  const c = activeCart();
  musteriSonSiparis(c.musteriId).forEach((i) => {
    if (c.items.some((x) => x.urunId === i.urunId)) return;
    const p = findProduct(i.urunId); if (!p) return;
    c.items.push({ urunId: p.id, ad: p.ad, barkod: p.barkod || "", kdv: Number(p.kdv) || 0, fiyat: musteriFiyat(p.id, Number(p.satis) || 0), adet: 1, iskyuzde: 0, not: "" });
  });
  refreshPOS();
}
// Kategori görseli: ada göre çizgi ikon (ikon() adı) + renk sınıfı
function katGorsel(name) {
  const n = ocrNorm(name);
  if (/okey/.test(n)) return { ic: "oyunkart", cls: "k-game" };
  if (/oyun|eglence/.test(n)) return { ic: "oyunkart", cls: "k-game" };
  if (/servis ekip|bardak|tabak|kasik/.test(n)) return { ic: "tabak", cls: "k-serve" };
  if (/caylar|\bcay\b/.test(n)) return { ic: "caybardak", cls: "k-tea" };
  if (/kahve|yan urun|granul|3u1|3ü1/.test(n)) return { ic: "fincan", cls: "k-kola" };
  if (/toz icecek/.test(n)) return { ic: "bardak", cls: "k-toz" };
  if (/meyve suyu/.test(n)) return { ic: "bardak", cls: "k-meyve" };
  if (/gazoz/.test(n)) return { ic: "sise", cls: "k-gazoz" };
  if (/gazli|kola|cola|fanta/.test(n)) return { ic: "sise", cls: "k-kola" };
  if (/ayran/.test(n)) return { ic: "bardak", cls: "k-milk" };
  if (/soda/.test(n)) return { ic: "sise", cls: "k-soda" };
  if (/\bsu\b/.test(n)) return { ic: "damla", cls: "k-drink" };
  if (/temizlik|deterjan|sabun|camasir|bulasik|dezenfektan/.test(n)) return { ic: "sprey", cls: "k-clean" };
  if (/sicak icecek|sahlep|salep/.test(n)) return { ic: "fincan", cls: "k-tea" };
  if (/soguk icecek|mesrubat|icecek|kola|gazoz|meyve suyu|ayran|enerji|maden/.test(n)) return { ic: "sise", cls: "k-drink" };
  if (/servis|bardak|fincan|tabak/.test(n)) return { ic: "tabak", cls: "k-serve" };
  if (/seker|gida|sekerleme|cikolata|biskuvi|bisküvi|atistir|gofret|cips/.test(n)) return { ic: "sekerleme", cls: "k-sweet" };
  if (/sut|yogurt|peynir|kahvalt|tereyag/.test(n)) return { ic: "bardak", cls: "k-milk" };
  if (/kagit|hijyen|pecete|mendil/.test(n)) return { ic: "rulo", cls: "k-paper" };
  if (/kirtasiye/.test(n)) return { ic: "kalem", cls: "k-paper" };
  if (/mobilya|dis mekan|bahce/.test(n)) return { ic: "sandalye", cls: "k-misc" };
  if (/teknik|guvenlik/.test(n)) return { ic: "ayar", cls: "k-misc" };
  if (/mutfak|ekipman/.test(n)) return { ic: "tencere", cls: "k-misc" };
  return { ic: "kutu", cls: "k-misc" };
}
// Kategori blokları (renkli, iri): dokun → o kategorinin ürünleri
function catGridHTML() {
  const used = new Set(store.products.filter((p) => p.gorunur !== false).map((p) => p.grup || "GRUPSUZ ÜRÜN"));
  const cats = allGroupNames().filter((g) => used.has(g));
  if (!cats.length) return `<div class="gs-grid-bos"><b>Kategori yok</b><span><a href="#/urun-ekle">Ürün ekleyin</a>.</span></div>`;
  return cats.map((c) => {
    const n = store.products.filter((p) => p.gorunur !== false && (p.grup || "GRUPSUZ ÜRÜN") === c).length;
    const g = katGorsel(c);
    return `<button class="gs-kat ${g.cls}" data-catopen="${esc(c)}" type="button"><span class="gs-kat-ik" aria-hidden="true">${ikon(g.ic, 22)}</span><span class="gs-kat-orta"><b>${esc(c)}</b><small>${n} ürün</small></span></button>`;
  }).join("");
}
/* Izgaranın içeriği (satış ekranı ve rota sihirbazı ortak):
   arama varsa → BÜTÜN ürünlerde arama sonucu · kategori seçiliyse → "‹ Kategoriler" + o kategorinin ürünleri ·
   hiçbiri yoksa → (varsa) sık satılanlar + kategori blokları. */
function prodGridHTML() {
  const q = ocrNorm(pos.q || "");
  const gorunur = store.products.filter((p) => p.gorunur !== false);
  if (q) {
    const qr = (pos.q || "").trim().toLocaleLowerCase("tr");
    const list = gorunur.filter((p) => ocrNorm(p.ad).includes(q) || String(p.barkod || "").toLocaleLowerCase("tr").includes(qr));
    if (!list.length) return `<div class="gs-grid-bos"><b>“${esc((pos.q || "").trim())}” bulunamadı</b><span>Aramaya uyan ürün yok. Adını daha kısa yaz ya da aramayı silip kategoriden seç.</span></div>`;
    return `<div class="gs-grid-bas">Arama sonucu · ${list.length} ürün</div>` + list.map(posSoloCard).join("");
  }
  if (pos.cat === "ANA") {
    const ana = gorunur.filter((p) => p.anaUrun);
    return (ana.length ? `<div class="gs-grid-bas">Sık satılanlar</div>` + ana.map(posSoloCard).join("") + `<div class="gs-grid-bas">Kategoriler</div>` : "") + catGridHTML();
  }
  const list = gorunur.filter((p) => (p.grup || "GRUPSUZ ÜRÜN") === pos.cat);
  const geri = `<div class="gs-kat-bas"><button class="gs-kat-geri" data-catopen="ANA" type="button">${ikon("sol", 18, 2.6)}<span>Kategoriler</span></button><b>${esc(pos.cat)}</b></div>`;
  if (!list.length) return geri + `<div class="gs-grid-bos"><b>Bu kategoride ürün yok</b><span><a href="#/urun-ekle">Ürün ekleyin</a>.</span></div>`;
  // Her ürün ayrı kart (marka/model gruplama YOK — her marka ayrı listelenir).
  return geri + list.map(posSoloCard).join("") + (list.length > 8 ? `<button class="gs-kat-geri alt" data-catopen="ANA" type="button">${ikon("sol", 18, 2.6)}<span>Kategorilere dön</span></button>` : "");
}
/* Aile kutusuna dokununca: marka seçim popup'ı */
function openAilePopup(title) {
  let list = store.products.filter((p) => p.gorunur !== false);
  if (pos.cat !== "ANA") list = list.filter((p) => (p.grup || "GRUPSUZ ÜRÜN") === pos.cat);
  const members = list.filter((p) => aileGetir(p.ad) === title);
  if (!members.length) return;
  const body = `<div class="aile-pop">${members.map((p) => `<button class="aile-opt" data-aileadd="${p.id}" type="button"><span class="ao-ad">${esc(p.ad)}</span><span class="ao-fiyat">${money.format(Number(p.satis) || 0)}</span></button>`).join("")}</div>`;
  const m = openModal(esc(title) + " — marka seç", body, { noFoot: true, onMount: (ov) => { ov.querySelectorAll("[data-aileadd]").forEach((b) => b.onclick = () => { addToCart(b.dataset.aileadd); m.close(); }); } });
}
function netLine(it) { const t = (Number(it.fiyat) || 0) * (Number(it.adet) || 0); return t * (1 - (Number(it.iskyuzde) || 0) / 100); }
function cartCount() { const c = activeCart(); return `${c.items.length} (${num2.format(c.items.reduce((s, i) => s + (Number(i.adet) || 0), 0))})`; }
function cartTotals() { const c = activeCart(); const brut = c.items.reduce((s, i) => s + netLine(i), 0); const toplam = Math.max(0, brut - (Number(c.iskonto) || 0)); return { brut, toplam, odenen: Number(c.odenen) || 0, ustu: Math.max(0, (Number(c.odenen) || 0) - toplam) }; }
function rebuildCart() { const cb = document.getElementById("cartBody"); if (cb) cb.innerHTML = cartRowsHTML(); wireCartRow(); }
/* Sepet değişince ekrandaki her özet buradan tazelenir: alt çubuk, sepet penceresi, müşteri durumu, geçen sipariş şeridi,
   açık sepetler, kartlardaki adet işaretleri. (Hesap cartTotals / limit-vade yardımcılarında; burada yalnız gösterim.) */
function syncTotals() {
  const t = cartTotals(), c = activeCart(); const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const dolu = c.items.length > 0, adet = c.items.reduce((s, i) => s + (Number(i.adet) || 0), 0);
  const ozet = c.items.length + " ürün · " + num2.format(adet) + " adet";
  const cok = gsAcikSepetler().length > 1, isk = Number(c.iskonto) || 0;
  // alt çubuk
  set("posTutar", dolu ? money.format(t.toplam) : "");
  set("gsBarBas", dolu ? "Ödemeye geç" : (cok ? "Sepet " + (pos.active + 1) + " boş" : "Sepet boş"));
  set("gsBarAlt", dolu ? (cok ? "Sepet " + (pos.active + 1) + " · " : "") + ozet : "Eklemek için ürüne dokun");
  const bar = document.getElementById("gsBar"); if (bar) bar.classList.toggle("dolu", dolu);
  const ac = document.getElementById("gsSepetAc"); if (ac) ac.disabled = !dolu;
  // sepet penceresi (açıksa)
  set("gsSepetToplam", money.format(t.toplam));
  set("posBrut", money.format(t.brut)); set("posIsk", "−" + money.format(isk));
  ["gsTopAra", "gsTopIsk"].forEach((id) => { const e = document.getElementById(id); if (e) e.hidden = !isk; });
  set("gsIskAlt", isk ? money.format(isk) + " düşülüyor — değiştirmek için dokun" : "Yok — eklemek için dokun");
  // müşteri (ad + borç / limit / kalan / gecikme), geçen sipariş, açık sepetler
  document.querySelectorAll("[data-gs-mus]").forEach((el) => { el.innerHTML = gsMusteriBlokHTML(el.dataset.gsMus); });
  const bd = document.getElementById("gsBundle"); if (bd) bd.innerHTML = bundleBarHTML();
  const sp = document.getElementById("gsSepetler"); if (sp) sp.innerHTML = gsSepetlerHTML();
  const pn = document.getElementById("posNot"); if (pn) pn.value = c.not || "";
  gsRozetSync();
  if (!dolu) gsSepetKapat();   // ödenecek bir şey kalmadı
}
function syncRow(idx) { const it = activeCart().items[idx]; if (!it) return; const cell = document.querySelector(`[data-tut="${idx}"]`); if (cell) cell.textContent = money.format(netLine(it)); syncTotals(); }
function refreshPOS() { rebuildCart(); syncTotals(); }
/* Sepet satırı: − / + ve adet kutusu adedi pencere açmadan değiştirir (1'deyken − satırı çıkarır);
   ada dokununca fiyat / iskonto penceresi açılır. */
function wireCartRow() {
  document.querySelectorAll(".gs-kalem[data-line]").forEach((row) => {
    const idx = Number(row.dataset.line);
    row.querySelectorAll("[data-lineac]").forEach((b) => { b.onclick = () => openLineModal(idx); });
    const art = row.querySelector("[data-lart]"); if (art) art.onclick = () => gsAdetDegis(idx, 1);
    const az = row.querySelector("[data-lazalt]"); if (az) az.onclick = () => gsAdetDegis(idx, -1);
    const inp = row.querySelector("[data-ladet]");
    if (inp) {
      inp.onfocus = () => { try { inp.select(); } catch (e) {} };
      inp.onchange = () => gsAdetYaz(idx, inp.value);
      inp.onkeydown = (e) => { if (e.key === "Enter") inp.blur(); };
    }
  });
}
function gsAdetDegis(idx, fark) {
  const c = activeCart(), it = c.items[idx]; if (!it) return;
  const yeni = kurus((Number(it.adet) || 0) + fark);
  if (yeni <= 0) { c.items.splice(idx, 1); refreshPOS(); return; }
  it.adet = yeni; gsSatirTazele(idx);
}
/* Adet kutusuna yazılan sayı: boş / anlamsızsa eski adet geri gelir, 0 satırı çıkarır. */
function gsAdetYaz(idx, deger) {
  const c = activeCart(), it = c.items[idx]; if (!it) return;
  const v = String(deger).trim() === "" ? NaN : Number(String(deger).replace(",", "."));
  if (!isFinite(v) || v < 0) { gsSatirTazele(idx); return; }
  if (v === 0) { c.items.splice(idx, 1); refreshPOS(); return; }
  it.adet = v; gsSatirTazele(idx);
}
/* Satırı YENİDEN KURMADAN tazeler (adet, tutar, − / çöp, stok uyarısı) — yazarken klavye kapanmasın, dokunuş yutulmasın. */
function gsSatirTazele(idx) {
  const it = activeCart().items[idx], row = document.querySelector(`.gs-kalem[data-line="${idx}"]`);
  if (!it || !row) { refreshPOS(); return; }
  const adet = Number(it.adet) || 0;
  const inp = row.querySelector("[data-ladet]"); if (inp && Number(inp.value) !== adet) inp.value = adet;
  const az = row.querySelector("[data-lazalt]"); if (az) { az.classList.toggle("cikar", adet <= 1); az.innerHTML = gsAzaltIc(adet); az.setAttribute("aria-label", adet <= 1 ? "Sepetten çıkar" : "Bir azalt"); }
  const st = row.querySelector("[data-lstok]"); if (st) { const m = gsKalemStok(it); st.hidden = !m; st.lastElementChild.textContent = m; }
  syncRow(idx);
}
/* Sepet satırına dokununca açılan düzenleme penceresi — data-inc/dec/qty/price/isk/rem/ok kancaları wireLineModal'da */
function openLineModal(idx) {
  const it = activeCart().items[idx];
  if (!it) return;
  // Yerel taslak — Tamam'a basılmadan sepete işlenmez (X / dışarı tıkla = iptal).
  const tmp = { adet: Number(it.adet) || 0, fiyat: Number(it.fiyat) || 0, iskyuzde: Number(it.iskyuzde) || 0 };
  const satirTop = () => { const t = tmp.fiyat * tmp.adet; return t * (1 - (Number(tmp.iskyuzde) || 0) / 100); };
  const body = `<div class="line-modal gs-lm">
      <div class="field"><label>Adet</label>
        <div class="lm-qtyrow">
          <button class="lm-step" data-dec type="button" aria-label="Azalt">${ikon("eksi", 24, 2.6)}</button>
          <input class="lm-qty" data-qty type="number" step="0.01" inputmode="decimal" value="${tmp.adet}" />
          <button class="lm-step" data-inc type="button" aria-label="Arttır">${ikon("arti", 24, 2.6)}</button>
        </div>
      </div>
      <div class="field"><label>Birim fiyat (₺)</label><input class="lm-in" data-price type="number" step="0.01" inputmode="decimal" value="${tmp.fiyat}" /></div>
      <div class="field"><label>İskonto (%)</label><input class="lm-in" data-isk type="number" step="0.01" inputmode="decimal" value="${tmp.iskyuzde || ""}" placeholder="0" /></div>
      <div class="lm-tot">Satır toplamı <b data-tut>${money.format(satirTop())}</b></div>
      ${(() => { const mid = activeCart().musteriId, mc = mid && findCustomer(mid); return (mc && it.urunId) ? `<label class="lm-ozel"><input type="checkbox" data-ozelkaydet /> <span>Bu fiyatı <b>${esc(mc.ad)}</b> için kaydet — sonraki satışlarda kendiliğinden uygulanır</span></label>` : ""; })()}
      <button class="btn ok lm-ok" data-ok type="button">${ikon("tik", 20, 2.6)} Tamam</button>
      <button class="gs-lm-cikar" data-rem type="button">${ikon("cop", 18)}<span>Bu ürünü sepetten çıkar</span></button>
    </div>`;
  const m = openModal(esc(it.ad), body, { noFoot: true, onMount: (ov) => wireLineModal(ov, idx, tmp, satirTop, () => m.close()) });
}
function wireLineModal(ov, idx, tmp, satirTop, close) {
  const qtyEl = ov.querySelector("[data-qty]");
  const totEl = ov.querySelector("[data-tut]");
  const refreshTot = () => { if (totEl) totEl.textContent = money.format(satirTop()); };
  ov.querySelector("[data-inc]").onclick = () => { tmp.adet = (Number(tmp.adet) || 0) + 1; qtyEl.value = tmp.adet; refreshTot(); };
  ov.querySelector("[data-dec]").onclick = () => { tmp.adet = Math.max(0, (Number(tmp.adet) || 0) - 1); qtyEl.value = tmp.adet; refreshTot(); };
  qtyEl.oninput = () => { tmp.adet = qtyEl.value === "" ? 0 : Number(qtyEl.value); refreshTot(); };
  ov.querySelector("[data-price]").oninput = (e) => { tmp.fiyat = e.target.value === "" ? 0 : Number(e.target.value); refreshTot(); };
  ov.querySelector("[data-isk]").oninput = (e) => { tmp.iskyuzde = e.target.value === "" ? 0 : Number(e.target.value); refreshTot(); };
  ov.querySelector("[data-rem]").onclick = () => { activeCart().items.splice(idx, 1); if (close) close(); refreshPOS(); };
  ov.querySelector("[data-ok]").onclick = () => {
    const it = activeCart().items[idx];
    if (it) {
      if ((Number(tmp.adet) || 0) <= 0) activeCart().items.splice(idx, 1);
      else { it.adet = Number(tmp.adet) || 0; it.fiyat = Number(tmp.fiyat) || 0; it.iskyuzde = Number(tmp.iskyuzde) || 0; }
      // Müşteriye özel fiyat kaydet (kutu işaretliyse)
      const ozelEl = ov.querySelector("[data-ozelkaydet]"), mid = activeCart().musteriId;
      if (ozelEl && ozelEl.checked && mid && it && it.urunId) {
        const c = findCustomer(mid);
        if (c) {
          c.ozelFiyatlar = c.ozelFiyatlar || {};
          const p = findProduct(it.urunId), def = p ? Number(p.satis) || 0 : null;
          if (def != null && Number(tmp.fiyat) === def) delete c.ozelFiyatlar[it.urunId]; // normale döndü → özel fiyatı sil
          else c.ozelFiyatlar[it.urunId] = Number(tmp.fiyat);
          saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
        }
      }
    }
    if (close) close(); refreshPOS();
  };
}
// Müşteriye özel fiyat (varsa) — yoksa ürünün normal satış fiyatı
function musteriFiyat(urunId, fallback) {
  const id = activeCart().musteriId;
  if (id && urunId) { const c = findCustomer(id); const v = c && c.ozelFiyatlar && c.ozelFiyatlar[urunId]; if (v != null && v !== "") return Number(v); }
  return fallback;
}
// Müşteri değişince sepetteki ürünleri o müşterinin özel fiyatına çek (özel fiyatı olanlar)
function repriceCart() {
  const c = activeCart(); const id = c.musteriId; if (!id) return;
  const mc = findCustomer(id); const map = (mc && mc.ozelFiyatlar) || {};
  c.items.forEach((it) => { if (it.urunId && map[it.urunId] != null && map[it.urunId] !== "") it.fiyat = Number(map[it.urunId]); });
}
function addToCart(prodId) { const p = findProduct(prodId); if (!p) return; const c = activeCart(); const ex = c.items.find((i) => i.urunId === prodId); if (ex) ex.adet = (Number(ex.adet) || 0) + 1; else c.items.push({ urunId: prodId, ad: p.ad, barkod: p.barkod || "", kdv: Number(p.kdv) || 0, fiyat: musteriFiyat(prodId, Number(p.satis) || 0), adet: 1, iskyuzde: 0, not: "" }); refreshPOS(); }
function finalizeCustom(tipId) { const tip = store.odemeTipleri.find((t) => t.id === tipId); if (!tip) return; finalizeSale(tip.kasa === "Nakit Kasa" ? "nakit" : "pos", tip.ad); }
function finalizeSale(type, odemeAdi) {
  const c = activeCart();
  if (!c.items.length) { alert("Sepet boş."); return; }
  const satilanMus = c.musteriId;
  const { brut, toplam } = cartTotals();
  const odeme = { nakit: 0, pos: 0, acik: 0 };
  // Satış tutarını aşan ödeme: satışa değil, müşterinin borcuna yazılır (aşağıda).
  let fazlaTahsilat = 0, fazlaNakit = 0, fazlaKart = 0;
  if (type === "nakit") odeme.nakit = toplam;
  else if (type === "pos") odeme.pos = toplam;
  else if (type === "acik") { if (!c.musteriId) { alert("Açık hesap için önce müşteri seçin (Seç düğmesi)."); return; } odeme.acik = toplam; }
  else if (type === "parcali") {
    // Öntanımlı değer DÜZ sayı olmalı: num2.format(1850) "1.850" veriyordu ve hem
    // Number() hem num() bunu 1,85 okuyordu (tek başına binlik ayracı ayırt edilemiyor).
    // Kasiyer hazır değeri onaylayınca 1.850 ₺ satış 1,85 ₺ nakit + 1.848,15 ₺ borç
    // olarak kaydediliyordu. Elle yazılan "1.850,00" / "1850,50" için num() doğru.
    const n = num(prompt("Nakit tutar:", toplam.toFixed(2)));
    const p = num(prompt("POS (kart) tutar:", "0"));
    const rest = kurus(toplam - n - p);
    if (rest > 0.001) {
      // Eksik ödeme: kalanı açık hesaba yaz (eski davranış).
      if (!c.musteriId) { alert("Kalan tutar açık hesaba yazılacak — müşteri seçin."); return; }
      odeme.nakit = n; odeme.pos = p; odeme.acik = rest;
    } else if (rest < -0.001) {
      // FAZLA ödeme: eskiden bu dal hiç yoktu — fazlalık satışa nakit olarak yazılıyor,
      // borçtan düşülmüyordu. Artık satışa yalnız tutarı kadarı işlenir, üstü
      // müşterinin borcuna tahsilat olarak geçer (kayıt aşağıda, satıştan sonra).
      if (!c.musteriId) {
        alert("Girdiğin tutar satış tutarından fazla.\n\nFazlası müşterinin borcuna sayılacak — önce müşteri seçin.\nPara üstü vereceksen satış tutarını gir.");
        return;
      }
      const posUygulanan = Math.min(p, toplam);
      const nakitUygulanan = kurus(toplam - posUygulanan);
      odeme.nakit = nakitUygulanan; odeme.pos = posUygulanan;
      fazlaNakit = kurus(n - nakitUygulanan); fazlaKart = kurus(p - posUygulanan);
      fazlaTahsilat = kurus(fazlaNakit + fazlaKart);
    } else {
      odeme.nakit = n; odeme.pos = p;
    }
  }
  // Borç limiti: açık hesaba yazılan kısım (parçalı ödemenin açığı dahil) limiti aşıyorsa satıcıya sor.
  // Engel değil — "Tamam" derse satış yazılır, "İptal" derse sepet olduğu gibi kalır.
  if (odeme.acik > 0.001 && c.musteriId) {
    const limitSoru = limitUyariMetni(c.musteriId, odeme.acik);
    if (limitSoru && !confirm(limitSoru)) return;
  }
  // Maliyet satış ANINDA kaleme yazılır (alis): alış fiyatı sonradan değişse de geçmiş kâr değişmez.
  const kalemler = c.items.map((i) => ({ urunId: i.urunId, ad: i.ad, barkod: i.barkod || "", kdv: Number(i.kdv) || 0, fiyat: Number(i.fiyat) || 0, adet: Number(i.adet) || 0, iskyuzde: Number(i.iskyuzde) || 0, alis: urunAlis(i.urunId) }));
  const maliyet = kurus(kalemler.reduce((s, i) => s + i.alis * i.adet, 0));
  // POS cihaz komisyonu: sadece "Pos" ödemede %2 (nakit/havale/açık hariç)
  const komisyon = (type === "pos" && !odemeAdi) ? Math.round(toplam * 0.02 * 100) / 100 : 0;
  store.counters.sale = (store.counters.sale || 0) + 1;
  const belgeNo = new Date().getFullYear() + "-" + String(store.counters.sale).padStart(6, "0");
  store.sales.push({ id: genId(), belgeNo, musteriId: c.musteriId, personelId: pos.personelId, not: ((document.getElementById("posNot") || {}).value || ""), odemeAdi: odemeAdi || null, items: kalemler, brut, iskonto: Number(c.iskonto) || 0, toplam, maliyet, komisyon, odeme, tarih: new Date().toISOString(), servisGun: localDateStr(new Date()), hafta: haftaNo(new Date()), stokKaynak: stokModu });
  c.items.forEach((i) => stokDus(i.urunId, i.adet)); // aktif moda göre (araç/dükkan) stok düş
  // Satış tutarını aşan kısım borç tahsilatı olarak kaydedilir — eskiden hiçbir yere
  // yazılmadığı için kasaya giren para müşterinin borcundan düşmüyordu.
  if (fazlaTahsilat > 0.001 && satilanMus) {
    // Fazlanın nakit ve kart kısmı ayrı kayıt: kasa hesabı türü buradan okur.
    [["nakit", fazlaNakit], ["kart", fazlaKart]].forEach((f) => { if (f[1] > 0.001) store.payments.push({ id: genId(), musteriId: satilanMus, tutar: f[1], odemeTuru: f[0], not: "Satış üstü fazla ödeme → borca sayıldı (Belge " + belgeNo + ")", tarih: new Date().toISOString() }); });
    const mc = findCustomer(satilanMus);
    if (mc && typeof bayiPuanEkle === "function") bayiPuanEkle(mc, fazlaTahsilat);
  }
  saveStore();
  pos.carts[pos.active] = newCart();
  refreshPOS();
  const grid = document.getElementById("prodGrid"); if (grid) { grid.innerHTML = prodGridHTML(); wireProdCards(); }
  const yeniSale = store.sales[store.sales.length - 1];
  // Elle değiştirilen fiyat var mı? Varsa müşteriye kaydetmeyi sor.
  if (satilanMus) {
    const mc = findCustomer(satilanMus);
    if (mc) {
      const map = mc.ozelFiyatlar || {};
      const degisen = yeniSale.items.filter((it) => { if (!it.urunId) return false; const pr = findProduct(it.urunId); if (!pr) return false; const def = Number(pr.satis) || 0; const kayitli = (map[it.urunId] != null && map[it.urunId] !== "") ? Number(map[it.urunId]) : def; return Number(it.fiyat) !== kayitli; });
      if (degisen.length) {
        const liste = degisen.map((it) => "• " + it.ad + ": " + money.format(it.fiyat)).join("\n");
        if (confirm(mc.ad + " için değiştirdiğin fiyatları kaydet?\n\n" + liste + "\n\nBundan sonra bu müşteriye bu fiyat(lar) otomatik uygulanır.")) {
          mc.ozelFiyatlar = mc.ozelFiyatlar || {};
          degisen.forEach((it) => { const pr = findProduct(it.urunId); const def = pr ? Number(pr.satis) || 0 : 0; if (Number(it.fiyat) === def) delete mc.ozelFiyatlar[it.urunId]; else mc.ozelFiyatlar[it.urunId] = Number(it.fiyat); });
          saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
        }
      }
    }
  }
  const inServis = servis.aktif && servis.acik && satilanMus && servis.acik === satilanMus;
  // Servis dışında (normal POS): irsaliye yazdırma sor. Serviste: otomatik WhatsApp.
  if (inServis) {
    servis.satislar = servis.satislar || []; servis.satislar.push(yeniSale.id);
    servis.sonSatisId = yeniSale.id;
    // WhatsApp'ı burada DEĞİL, ziyaret kapanışında gönderiyoruz (tahsilat/iade işlendikten
    // sonra bakiye kesinleşsin — irsaliyede doğru "Kalan Bakiye" görünsün).
    servis.adim = "kapanis";
    render();
  } else {
    // Normal satış: müşterinin telefonu varsa adisyon görseli otomatik paylaş; yoksa yazdırma sor.
    const musc = satilanMus && findCustomer(satilanMus);
    if (musc && (musc.telefon || "").replace(/\D/g, "")) fisGonderModal(yeniSale);
    else if (confirm(`Satış kaydedildi ✔\nBelge No: ${belgeNo} · Toplam: ${money.format(toplam)}\n\nİrsaliye yazdırılsın mı?`)) printSale(yeniSale);
  }
}
function wireProdCards() {
  document.querySelectorAll("[data-add]").forEach((el) => {
    el.onclick = () => { if (el._lpFired) { el._lpFired = false; return; } addToCart(el.dataset.add); };
    if (gelismisMod) longPress(el, () => varyantPopup(el.dataset.add)); // basılı tut → çeşit seç
  });
  // "Çeşitler" düğmesi: basılı tutmayı bilmeyen de çeşit penceresine tek dokunuşla ulaşsın
  document.querySelectorAll("[data-cesit]").forEach((el) => { el.onclick = (e) => { e.stopPropagation(); varyantPopup(el.dataset.cesit); }; });
  document.querySelectorAll("[data-fam]").forEach((el) => el.onclick = () => openAilePopup(el.dataset.fam));
  document.querySelectorAll("[data-catopen]").forEach((el) => el.onclick = () => { pos.cat = el.dataset.catopen; posGridYenile(true); });
}
// Ürün/kategori ızgarasını sayfayı en üste atmadan tazele (partial).
// basaGetir: kategori değişti — liste aşağı kaydırılmışken açıldıysa yeni listenin başı görünsün.
function posGridYenile(basaGetir) {
  const g = document.getElementById("prodGrid");
  if (g) { g.innerHTML = prodGridHTML(); wireProdCards(); }
  document.querySelectorAll("[data-cat]").forEach((x) => x.classList.toggle("on", x.dataset.cat === pos.cat));
  const psx = document.getElementById("prodSearchX"); if (psx) psx.style.display = pos.q ? "" : "none";
  if (g && basaGetir === true) { const r = g.getBoundingClientRect(); if (r.top < 0) window.scrollBy(0, r.top - 12); }
}
function openCustPicker() {
  const liste = store.customers.slice().sort((a, b) => String(a.ad || "").localeCompare(String(b.ad || ""), "tr"));
  const satir = (c) => { const b = customerBorc(c.id); return `<li data-pick="${c.id}" role="button" tabindex="0"><span class="gs-pl-orta"><b>${esc(c.ad)}</b><small class="${b > 0.005 ? "borclu" : ""}">${Math.abs(b) > 0.005 ? "Borç: " + money.format(b) : "Borcu yok"}</small></span>${ikon("sag", 18, 2.2)}</li>`; };
  const listHTML = liste.length ? `<ul class="gs-pick-list">${liste.map(satir).join("")}</ul><p class="gs-pick-yok" id="pickYok" hidden>Bu ada uyan müşteri yok.</p>` : `<p class="gs-pick-yok">Kayıtlı müşteri yok.</p>`;
  openModal("Müşteri seç", `<div class="gs-pick"><div class="gs-ara-kutu">${ikon("ara", 20)}<input class="gs-ara-in" id="pickSearch" type="text" inputmode="search" autocomplete="off" placeholder="Müşteri ara" /></div><button class="gs-pick-yeni" id="pickYeni" type="button">${ikon("arti", 18, 2.6)}<span>Yeni müşteri</span></button>${listHTML}</div>`, {
    noFoot: true,
    onMount: (ov) => {
      ov.querySelectorAll("[data-pick]").forEach((li) => li.addEventListener("click", () => { activeCart().musteriId = li.dataset.pick; repriceCart(); ov.remove(); render(); }));
      const s = ov.querySelector("#pickSearch"), yok = ov.querySelector("#pickYok");
      s.addEventListener("input", () => { const q = ocrNorm(s.value); let n = 0; ov.querySelectorAll("[data-pick]").forEach((li) => { const uyar = !q || ocrNorm(li.querySelector("b").textContent).includes(q); li.style.display = uyar ? "" : "none"; if (uyar) n++; }); if (yok) yok.hidden = n > 0; });
      ov.querySelector("#pickYeni").addEventListener("click", () => { ov.remove(); openYeniMusteri(() => openCustPicker()); });
    },
  });
}
/* Muhtelif tutar penceresi — "Diğer" menüsünden açılır (#muhInput/#muhEkle mantığı aynı) */
function openMuhModal() {
  openModal("Muhtelif tutar ekle", `<p class="gs-pencere-aciklama">Listede olmayan ürün için serbest tutar. Sepete “Muhtelif Ürün” diye eklenir.</p><div class="field"><label>Tutar (₺)</label><input id="muhInput" type="number" step="0.01" inputmode="decimal" placeholder="0" /></div><button class="btn ok gs-tam" id="muhEkle" type="button">Sepete ekle</button>`, {
    noFoot: true,
    onMount: (ov) => {
      const muhIn = ov.querySelector("#muhInput"), muhBtn = ov.querySelector("#muhEkle");
      const addMuh = () => { const v = Number(muhIn.value); if (!v) { alert("Tutar girin."); return; } activeCart().items.push({ urunId: null, ad: "Muhtelif Ürün", barkod: "", kdv: 0, fiyat: v, adet: 1, iskyuzde: 0, not: "" }); refreshPOS(); ov.remove(); };
      muhBtn.addEventListener("click", addMuh);
      muhIn.addEventListener("keydown", (e) => { if (e.key === "Enter") addMuh(); });
      muhIn.focus();
    },
  });
}
/* Genel iskonto penceresi — sepet penceresindeki "İskonto" satırından ya da "Diğer" menüsünden açılır (#iskGenel mantığı aynı) */
function openIskModal() {
  openModal("İskonto", `<p class="gs-pencere-aciklama">Sepetin toplamından düşülecek tutar. Kaldırmak için boş bırak.</p><div class="field"><label>İskonto tutarı (₺)</label><input id="iskGenel" type="number" step="0.01" inputmode="decimal" value="${activeCart().iskonto || ""}" placeholder="0" /></div>`, {
    okLabel: "Uygula",
    onOk: (ov) => { const isk = ov.querySelector("#iskGenel"); activeCart().iskonto = Number(isk.value) || 0; syncTotals(); },
    onMount: (ov) => { const i = ov.querySelector("#iskGenel"); if (i) { i.focus(); try { i.select(); } catch (e) {} } },
  });
}

/* ---- "Diğer" menüsü: üst çubuktaki eski dört ikonun (iskonto, ara, muhtelif, yazdır) ve geri okunun yaptıkları + nadir ayarlar ---- */
function gsDigerMenu() {
  const satir = (kimlik, ik, baslik, alt) => `<button class="gs-menu-satir" data-gs-is="${kimlik}" type="button"><span class="gs-menu-ik">${ikon(ik, 22)}</span><span class="gs-menu-orta"><b>${baslik}</b>${alt ? `<small>${alt}</small>` : ""}</span>${ikon("sag", 18, 2.2)}</button>`;
  const isk = Number(activeCart().iskonto) || 0, arac = stokModu === "arac";
  const body = `<div class="gs-menu">` +
    satir("iskonto", "etiket", "İskonto uygula", isk ? "Şu an " + money.format(isk) + " düşülüyor" : "Sepetin toplamından tutar düş") +
    satir("muhtelif", "arti", "Muhtelif tutar ekle", "Listede olmayan ürün için serbest tutar") +
    satir("sepet", "sepet", "Başka sepet aç", "Bu sepet beklesin, araya başka müşteri girsin") +
    satir("stok", arac ? "araba" : "dukkan", "Mal nereden çıkıyor: " + (arac ? "Araç" : "Dükkan"), "Satılan mal bu stoktan düşer") +
    satir("gelismis", "izgara", "Çeşit seçimi: " + (gelismisMod ? "Açık" : "Kapalı"), "Açıkken üründe “Çeşitler” düğmesi çıkar") +
    satir("tara", "tara", "Barkod tara", "Kamerayla okut, ürün sepete eklensin") +
    satir("yazdir", "yazici", "İrsaliye yazdır", "Satış kaydedilince sorulur") +
    ((activeCart().items.length || activeCart().musteriId) ? satir("bosalt", "cop", "Sepeti boşalt", "Ürünleri ve seçili müşteriyi kaldır") : "") +
    satir("ana", "ev", "Ana ekrana dön", "") + `</div>`;
  const m = openModal("Diğer işlemler", body, { noFoot: true, onMount: (ov) => {
    ov.querySelectorAll("[data-gs-is]").forEach((b) => { b.onclick = () => { m.close(); gsDigerIs(b.dataset.gsIs); }; });
  } });
}
function gsDigerIs(kimlik) {
  if (kimlik === "iskonto") openIskModal();
  else if (kimlik === "muhtelif") openMuhModal();
  else if (kimlik === "sepet") gsYeniSepet();
  else if (kimlik === "stok") gsStokSec();
  else if (kimlik === "gelismis") { gelismisModAyarla(!gelismisMod); if (gelismisMod) alert("Çeşit seçimi açık: çeşidi olan üründe “Çeşitler” düğmesi çıkar; ürüne BASILI TUTUNCA da aynı pencere açılır. Normal dokunma ürünü ekler."); render(); }
  else if (kimlik === "tara") taraBaslat();
  else if (kimlik === "yazdir") alert("Satış tamamlanınca irsaliye yazdırılır.");
  else if (kimlik === "bosalt") gsSepetBosalt();
  else if (kimlik === "ana") navigate("anasayfa");
}
function gsSepetBosalt() {
  const c = activeCart(), n = c.items.length;
  if (!n && !c.musteriId) return;
  if (!confirm((n ? "Sepetteki " + n + " ürün silinsin mi?" : "Seçili müşteri kaldırılsın mı?") + (n && c.musteriId ? "\nSeçili müşteri de kaldırılır." : ""))) return;
  pos.carts[pos.active] = newCart(); gsSepetKapat(); render();
}
/* Stok kaynağı: tek dokunuşla körlemesine değişmesin diye iki seçenekli pencere (hangisi seçili, belli). */
function gsStokSec() {
  const sec = (k, ik, ad, alt) => `<button class="gs-sec${stokModu === k ? " on" : ""}" data-gs-stoksec="${k}" type="button" aria-pressed="${stokModu === k}"><span class="gs-menu-ik">${ikon(ik, 22)}</span><span class="gs-menu-orta"><b>${ad}</b><small>${alt}</small></span>${stokModu === k ? `<span class="gs-sec-tik">${ikon("tik", 20, 2.8)}</span>` : ""}</button>`;
  const m = openModal("Mal nereden çıkıyor?", `<div class="gs-menu">${sec("arac", "araba", "Araçtan", "Satılan mal araç stoğundan düşer")}${sec("dukkan", "dukkan", "Dükkandan", "Satılan mal dükkan stoğundan düşer")}</div>`, { noFoot: true, onMount: (ov) => {
    ov.querySelectorAll("[data-gs-stoksec]").forEach((b) => { b.onclick = () => { stokModuAyarla(b.dataset.gsStoksec); m.close(); render(); }; });
  } });
}
/* İkinci (üçüncü…) sepet: boş bir sepete geçer. Açık sepetler üstte şerit olarak görünür; boşalan sepet şeritten kendiliğinden düşer. */
function gsYeniSepet() {
  const su = activeCart();
  if (!su.items.length && !su.musteriId) { alert("Bu sepet zaten boş.\nÖnce buna ürün ekle; araya başka müşteri girerse o zaman ikinci sepeti aç."); return; }
  const bos = pos.carts.findIndex((c, n) => n !== pos.active && !c.items.length && !c.musteriId);
  if (bos < 0) { alert("En çok " + pos.carts.length + " sepet açılabilir. Önce birini bitir ya da boşalt."); return; }
  pos.active = bos; render();
}

/* ---- Sepet ve ödeme penceresi (alt çubuktan açılır) ---- */
function gsSepetAcik() { return document.getElementById("gsSepetOv"); }
function gsSepetKapat() { const ov = gsSepetAcik(); if (ov) ov.remove(); }
function gsSepetAc() {
  if (!activeCart().items.length || gsSepetAcik()) return;
  openModal("Sepet ve ödeme", `<div class="gs-sepet" id="gsSepetGovde"></div>`, { noFoot: true, onMount: (ov) => {
    ov.id = "gsSepetOv"; ov.classList.add("gs-sepet-ov"); ov._acildi = Date.now();
    const alt = document.createElement("div"); alt.className = "gs-sepet-alt"; alt.id = "gsSepetAlt";
    ov.querySelector(".modal").appendChild(alt);
    ov.addEventListener("click", gsSepetTik);
    ov.addEventListener("input", (e) => { if (e.target.id === "gsSatisNot") { activeCart().not = e.target.value; const pn = document.getElementById("posNot"); if (pn) pn.value = e.target.value; } });
    ov.addEventListener("change", (e) => { if (e.target.id === "posPersonel") pos.personelId = e.target.value || null; });
  } });
  gsSepetCiz();
}
/* Pencerenin içini sepete göre (yeniden) kurar. Müşteri değişince / sepet değişince de çağrılır; kapalıysa bir şey yapmaz. */
function gsSepetCiz() {
  const ov = gsSepetAcik(); if (!ov) return;
  const c = activeCart(), govde = document.getElementById("gsSepetGovde"), alt = document.getElementById("gsSepetAlt");
  if (!govde || !alt) return;
  const bas = ov.querySelector(".modal-head h3"); if (bas) bas.textContent = gsAcikSepetler().length > 1 ? "Sepet " + (pos.active + 1) + " ve ödeme" : "Sepet ve ödeme";
  const persSel = store.personeller.length ? `<label class="gs-ek-satir">${ikon("kisiler", 20)}<select id="posPersonel" class="gs-ek-in" aria-label="Personel"><option value="">Personel seçilmedi</option>${store.personeller.map((p) => `<option value="${p.id}" ${pos.personelId === p.id ? "selected" : ""}>${esc(p.ad)}</option>`).join("")}</select></label>` : "";
  govde.innerHTML = `
    <div class="gs-kalemler" id="cartBody">${cartRowsHTML()}</div>
    <div class="gs-ek">
      <button class="gs-ek-satir" id="gsIskBtn" type="button">${ikon("etiket", 20)}<span class="gs-ek-orta"><b>İskonto</b><small id="gsIskAlt"></small></span>${ikon("sag", 18, 2.2)}</button>
      <label class="gs-ek-satir">${ikon("kalem", 20)}<input id="gsSatisNot" class="gs-ek-in" type="text" autocomplete="off" placeholder="Satış notu (isteğe bağlı)" value="${esc(c.not || "")}" /></label>
      ${persSel}
    </div>`;
  alt.innerHTML = `
    <div data-gs-mus="sepet"></div>
    <div class="gs-top" id="gsTopAra" hidden><span>Ara toplam</span><span id="posBrut"></span></div>
    <div class="gs-top" id="gsTopIsk" hidden><span>İskonto</span><span id="posIsk"></span></div>
    <div class="gs-top ana"><span>Toplam</span><b id="gsSepetToplam"></b></div>
    <div class="gs-ode-bas">Nasıl ödendi?</div>
    <button class="gs-ode ana" data-pay="nakit" type="button">${ikon("para", 24, 2)}<b>Nakit</b></button>
    <div class="gs-ode-diger">
      <button class="gs-ode" data-pay="pos" type="button"><b>Kart</b><small>POS cihazı</small></button>
      <button class="gs-ode" data-pay="acik" type="button"><b>Açık hesap</b><small>borca yaz</small></button>
      <button class="gs-ode" data-pay="parcali" type="button"><b>Parçalı</b><small>nakit + kart</small></button>
    </div>
    ${store.odemeTipleri.length ? `<div class="gs-ode-ozel">${store.odemeTipleri.map((t) => `<button class="gs-ode" data-paycustom="${t.id}" type="button"><b>${esc(t.ad)}</b></button>`).join("")}</div>` : ""}`;
  wireCartRow(); syncTotals();
}
function gsSepetTik(e) {
  const t = e.target.closest("button"); if (!t) return;
  if (t.hasAttribute("data-gs-muspick")) openCustPicker();
  else if (t.id === "gsIskBtn") openIskModal();
  else if (t.dataset.pay) gsOde(t.dataset.pay, null);
  else if (t.dataset.paycustom) gsOde(null, t.dataset.paycustom);
}
/* Ödeme düğmesi: eski düğmelerle AYNI çağrı (finalizeSale(tür) / finalizeCustom(id)). Satış kaydedildiyse pencere kapanır;
   vazgeçildiyse (limit onayı "İptal", müşteri seçilmemiş…) sepet ve pencere olduğu gibi kalır.
   Pencere açıldıktan hemen sonraki dokunuş sayılmaz: "Ödemeye geç"e çift dokunan yanlışlıkla satış kaydetmesin. */
function gsOde(tur, ozelId) {
  const ov = gsSepetAcik();
  if (ov && Date.now() - (ov._acildi || 0) < 450) return;
  const once = store.sales.length;
  if (ozelId) finalizeCustom(ozelId); else finalizeSale(tur);
  if (store.sales.length > once) gsSepetKapat();
}
/* Alt çubuğun yeri: alt menü çubuğunun (başka bölümün) gerçek yüksekliği ölçülür — sabit sayı varsayılmaz. */
function gsOlc() {
  const kok = document.documentElement, mb = document.querySelector(".mobilbar"), bar = document.getElementById("gsBar");
  if (!bar) return;
  const mbH = mb && getComputedStyle(mb).display !== "none" ? Math.round(mb.getBoundingClientRect().height) : 0;
  kok.style.setProperty("--gs-mobilbar-h", mbH + "px");
  kok.style.setProperty("--gs-bar-h", Math.round(bar.getBoundingClientRect().height) + "px");
}
if (typeof window !== "undefined") {
  window.addEventListener("resize", gsOlc);
  // Satış ekranından çıkılınca (alt menü, geri tuşu) açık kalmış sepet penceresi başka ekranın üstünde kalmasın
  window.addEventListener("hashchange", () => { if (currentRoute() !== "satis") gsSepetKapat(); });
}

function mountSatis() {
  wireProdCards(); wireCartRow();
  const tik = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
  // müşteri bloğu / geçen sipariş / açık sepetler syncTotals'da yeniden yazılır → dinleyici kabın üstünde
  tik("gsMusteri", (e) => { if (e.target.closest("[data-gs-muspick]")) openCustPicker(); });
  tik("gsBundle", (e) => { if (e.target.closest("#bundleAdd")) bundleUygula(); });
  tik("gsSepetler", (e) => { const b = e.target.closest("[data-tab]"); if (b) { pos.active = Number(b.dataset.tab); render(); } });
  tik("stokModBtn", gsStokSec);
  tik("gsDiger", gsDigerMenu);
  tik("gsSepetAc", gsSepetAc);
  tik("taraFab", taraBaslat);
  const bar = document.getElementById("barInput"), ara = document.getElementById("barAra");
  const doBar = () => { const code = bar.value.trim(); if (!code) return; const p = store.products.find((x) => x.barkod === code); if (p) { addToCart(p.id); bar.value = ""; } else alert("Bu barkodla ürün yok."); };
  if (bar) bar.addEventListener("keydown", (e) => { if (e.key === "Enter") doBar(); });
  if (ara) ara.addEventListener("click", doBar);
  document.querySelectorAll("[data-soon]").forEach((el) => el.addEventListener("click", () => alert("Bu özellik yakında.")));
  const psearch = document.getElementById("prodSearch");
  const psx = document.getElementById("prodSearchX");
  if (psearch) {
    psearch.addEventListener("input", () => { pos.q = psearch.value; posGridYenile(); });
    // Klavye açılınca görünen alan yarıya iner: arama satırını ekranın üstüne al ki sonuçlar klavyenin üstünde kalsın
    psearch.addEventListener("focus", () => setTimeout(() => {
      const k = psearch.closest(".gs-ara"); if (!k || document.activeElement !== psearch) return;
      const r = k.getBoundingClientRect(); if (r.top > 16 || r.top < 0) window.scrollBy(0, r.top - 8);
    }, 320));
  }
  if (psx) psx.addEventListener("click", () => { pos.q = ""; if (psearch) { psearch.value = ""; psearch.focus(); } posGridYenile(); });
  syncTotals();
  gsSepetCiz();      // pencere açıkken ekran yeniden çizildiyse (müşteri değişti) içi de tazelensin
  gsOlc(); if (typeof requestAnimationFrame === "function") requestAnimationFrame(gsOlc);
}

/* Yazdırma */
function openPrint(title, html) {
  // Uygulama-içi önizleme modalı (WebView'de ayrı pencere + window.close güvenilmez).
  openModal(title, `<div class="fis-onizle">${html}</div><div style="text-align:right;margin-top:12px"><button class="btn soft" id="fisYazdir" type="button">🖨 Yazdır</button></div>`, {
    noFoot: true,
    onMount: (ov) => { const y = ov.querySelector("#fisYazdir"); if (y) y.onclick = () => window.print(); },
  });
}
function printSale(s) {
  const c = s.musteriId && findCustomer(s.musteriId);
  const st = store.settings;
  const rows = s.items.map((it) => `<tr><td>${esc(it.ad)}</td><td class="c">${num2.format(it.adet)}</td><td class="r">${money.format(it.fiyat * it.adet)}</td></tr>`).join("");
  const head = `<h2>${esc(st.fisBaslik || st.firmaAdi)}</h2>${st.fisAdres ? `<div class="c">${esc(st.fisAdres)}</div>` : ""}${st.fisTel ? `<div class="c">Tel: ${esc(st.fisTel)}</div>` : ""}<div class="c">İrsaliye / Satış Fişi</div><hr>`;
  const foot = `<hr><div class="c">${esc(st.fisAltbilgi || "Teşekkür ederiz")}</div>`;
  openPrint("İrsaliye " + s.belgeNo, `${head}
    <div>Belge No: ${s.belgeNo}</div><div>Tarih: ${fmtDate(s.tarih)}</div>${c ? `<div>Müşteri: ${esc(c.ad)}</div>` : ""}<hr>
    <table>${rows}</table><hr>
    <table>${s.iskonto ? `<tr><td>İskonto</td><td class="r">-${money.format(s.iskonto)}</td></tr>` : ""}<tr><td><b>TOPLAM</b></td><td class="r"><b>${money.format(s.toplam)}</b></td></tr>
    <tr><td>Ödeme</td><td class="r">${saleOdeme(s)}</td></tr></table>${foot}`);
}

/* ============ ANASAYFA ============ */
function renderAnasayfa() {
  const today = store.sales.filter((s) => isToday(s.tarih));
  const sum = (fn) => today.reduce((a, s) => a + fn(s), 0);
  const nakit = sum((s) => s.odeme.nakit), pos_ = sum((s) => s.odeme.pos), acik = sum((s) => s.odeme.acik);
  const ciro = sum((s) => s.toplam), maliyet = sum((s) => s.maliyet || 0);
  const k = kasaHesap(todayStr(), todayStr()); // kasa ve kâr tek yerden hesaplanır
  const toplamBorc = store.customers.reduce((a, c) => a + customerBorc(c.id), 0);
  const kritik = store.products.filter((p) => (Number(p.stok) || 0) <= (Number(p.kritik) || 0) && p.kritik !== "" && p.kritik != null);
  const son = [...today].sort((a, b) => b.tarih.localeCompare(a.tarih)); // sadece bugünün satışları
  const rows = son.map((s) => { const c = s.musteriId && findCustomer(s.musteriId); return `<tr><td><button class="link-btn" data-sale="${s.id}">${esc(s.belgeNo)}</button></td><td>${c ? esc(c.ad) : "-"}</td><td>${money.format(s.toplam)}</td><td>${saleOdeme(s)}</td><td>${fmtDate(s.tarih)}</td></tr>`; }).join("");
  const kritikRows = kritik.slice(0, 10).map((p) => `<tr><td>${esc(p.ad)}</td><td class="stok-low">${num2.format(Number(p.stok) || 0)}</td><td>${Number(p.kritik) || 0}</td></tr>`).join("");
  const dun = localDateStr(new Date(Date.now() - 86400000));
  const dunCiro = store.sales.filter((s) => localDateStr(new Date(s.tarih)) === dun).reduce((a, s) => a + s.toplam, 0);
  return pageHead("Bugünün Özeti", null, [{ label: "📈 Raporlar", cls: "soft", route: "rapor-gunluk" }]) +
    grid([["Ciro (bugün)", money.format(ciro), "blue", trendBadge(ciro, dunCiro)], ["Nakit", money.format(nakit), "green"], ["POS", money.format(pos_)], ["Açık Hesap", money.format(acik)]]) +
    `<div style="height:14px"></div>` +
    grid([["Nakit Kasa", money.format(k.nakitKasa), "green"], ["Kart / Havale ile Gelen", money.format(k.kartHavale)], ["Gider (bugün)", money.format(k.giderIsletme)], ["Kâr (bugün)", money.format(k.urunKar), "green"], ["Kâr Oranı", karOrani(ciro, maliyet), "green"]]
      .concat(k.komisyon ? [["Kart (POS) Komisyonu", money.format(k.komisyon)]] : [])
      .concat([["Net Kâr (gider sonrası)", money.format(k.netKar), "green"], ["Toplam Alacak", money.format(toplamBorc)]])) +
    (k.giderEksik ? `<div class="rapor-uyari pl-gider-uyari">Bugün satış var ama hiç gider yazılmadı. Yakıt, yemek gibi bir harcama olduysa <button class="link-btn" data-goto="giderler" type="button">gider ekle</button>.</div>` : "") +
    `<h1 style="font-size:16px;margin:18px 0 10px">Borç Takibi</h1>` + vadeKartHTML() +
    `<h1 style="font-size:16px;margin:18px 0 10px">Bugünün Satışları (${today.length})</h1>` + (son.length ? sonSatisListesi(son) : `<div class="card"><p class="sub">Bugün henüz satış yok.</p></div>`) +
    `<h1 style="font-size:16px;margin:18px 0 10px">Kritik Stok (${kritik.length})</h1>` + tableCard(["Ürün", "Kalan Stok", "Kritik"], kritikRows, infoLine(kritik.length));
}
/* ============ DÜKKAN (hub) ============ */
function renderDukkan() {
  const k = kasaHesap(todayStr(), todayStr()); // Anasayfa ve Günlük Rapor ile aynı hesap
  const gider = k.gider, gelir = k.gelir, nakitKasa = k.nakitKasa;
  const dusuk = store.products.filter((p) => { if (p.gorunur === false) return false; const stok = Number(p.stok) || 0; const min = (p.kritik !== "" && p.kritik != null) ? Number(p.kritik) || 0 : (Number(p.depoMin) || 0); return min > 0 ? stok <= min : stok <= 0; }).sort((a, b) => (Number(a.stok) || 0) - (Number(b.stok) || 0));
  const stokRows = dusuk.slice(0, 10).map((p) => `<div class="dk-stok-row"><span class="dk-ad">${esc(p.ad)}</span><b class="${(Number(p.stok) || 0) <= 0 ? "sl-neg" : "stok-low"}">${num2.format(Number(p.stok) || 0)}</b></div>`).join("") || `<p class="hint" style="padding:6px">Azalan dükkan stoğu yok 👍</p>`;
  const talepler = (store.talepler || []).filter((t) => t.durum !== "kapali").slice().reverse();
  const talepRows = talepler.map((t) => { const c = t.musteriId && findCustomer(t.musteriId); return `<div class="dk-not dk-talep"><div class="dk-not-txt"><span class="hint">${fmtDate(t.tarih)}${c ? " · " + esc(c.ad) : ""}</span> ${esc(t.metin)}</div><button class="edit" data-dtok="${t.id}" type="button" title="Karşılandı">✓</button></div>`; }).join("");
  const notlar = (store.dukkanNotlari || []).slice().reverse();
  const notRows = notlar.map((n) => `<div class="dk-not"><div class="dk-not-txt"><span class="hint">${fmtDate(n.tarih)}</span> ${esc(n.metin)}</div><button class="rm" data-dnsil="${n.id}" type="button">✕</button></div>`).join("") || `<p class="hint" style="padding:6px">Not yok. Aşağıdan ekle.</p>`;
  return pageHead("Dükkan", null) +
    `<div class="dk-aksiyon"><button class="btn green lg" data-act="dsatis" type="button">🛒 +Satış</button><button class="btn soft lg" data-goto="urunler" type="button">📦 Ürünler</button><button class="btn soft lg" data-goto="arac-yukleme" type="button">🚚 Araç Stoğu</button></div>
     <div class="section-title">Dükkan Stoğu</div>
     <div class="card"><div class="dk-ozet"><span>${store.products.length} ürün</span><span class="${dusuk.length ? "sl-neg" : ""}">${dusuk.length} azalan/kritik</span><button class="link-btn" data-goto="urunler" type="button">Tüm ürünler →</button></div><div class="dk-stok-list">${stokRows}</div></div>
     <div class="section-title">Dükkan Evrakları</div>
     <div class="card"><div class="dk-evrak"><button class="btn soft" data-goto="alis-faturalari" type="button">📄 Alış Faturaları</button><button class="btn soft" data-goto="alis-olustur" type="button">＋ Alış Oluştur</button><button class="btn soft" data-goto="efatura-giden" type="button">✉ E-Faturalar</button><button class="btn soft" data-goto="rapor-stokhareket" type="button">🔁 Stok Hareket</button><button class="btn soft" data-goto="stok-sayimi" type="button">🧊 Stok Sayımı</button></div></div>
     <div class="section-title">Gelir / Gider (Kasa)</div>
     <div class="card"><div class="dk-kasa"><div class="dk-kbox green"><span>Nakit Kasa (bugün)</span><b>${money.format(nakitKasa)}</b></div><div class="dk-kbox"><span>Kart / Havale</span><b>${money.format(k.kartHavale)}</b></div><div class="dk-kbox"><span>Gelir</span><b>${money.format(gelir)}</b></div><div class="dk-kbox"><span>Gider</span><b>${money.format(gider)}</b></div></div><div class="dk-evrak" style="margin-top:8px"><button class="btn soft" data-goto="gelirler" type="button">＋ Gelirler</button><button class="btn soft" data-goto="giderler" type="button">＋ Giderler</button></div></div>
     <div class="section-title">Sipariş / İstek Notları</div>
     <div class="card">
       <div class="dk-ozet"><span>🚚 Rotadan gelen istek/talepler (${talepler.length})</span><button class="link-btn" data-goto="talepler" type="button">Tümü →</button></div>
       ${talepler.length ? `<div class="dk-not-list">${talepRows}</div>` : `<p class="hint" style="padding:6px">Açık istek/talep yok.</p>`}
       <div class="dk-not-alt">Serbest dükkan notu</div>
       <div class="zk-hizli-row" style="margin:4px 0 0"><input id="dkNotIn" placeholder="Dükkan sipariş/karar notu ekle..." /><button class="btn green" id="dkNotEkle" type="button">Ekle</button></div>
       <div class="dk-not-list">${notRows}</div>
     </div>`;
}
function mountDukkan() {
  const s = document.querySelector('[data-act="dsatis"]'); if (s) s.addEventListener("click", () => { stokModuAyarla("dukkan"); pos.carts[pos.active] = newCart(); pos.cat = "ANA"; pos.q = ""; navigate("satis"); });
  const ek = document.getElementById("dkNotEkle"); if (ek) ek.addEventListener("click", () => { const inp = document.getElementById("dkNotIn"); const v = (inp.value || "").trim(); if (!v) { inp.focus(); return; } store.dukkanNotlari = store.dukkanNotlari || []; store.dukkanNotlari.push({ id: genId(), metin: v, tarih: new Date().toISOString() }); saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); render(); });
  document.querySelectorAll("[data-dnsil]").forEach((b) => b.addEventListener("click", () => { store.dukkanNotlari = (store.dukkanNotlari || []).filter((x) => x.id !== b.dataset.dnsil); saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); render(); }));
  document.querySelectorAll("[data-dtok]").forEach((b) => b.addEventListener("click", () => { const t = (store.talepler || []).find((x) => x.id === b.dataset.dtok); if (t) t.durum = "kapali"; saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); render(); }));
}
/* Son satışlar — kompakt tek satır liste (kutucuk değil) */
// Rapor satış tablosu: satır satır (Excel gibi), ödeme tipine göre renkli, tıklanabilir, çoklu-seç + toplu sil
function raporSatisTablo(sales) {
  if (!sales.length) return `<div class="card"><div class="sl-empty">Satış yok.</div></div>`;
  const rows = sales.slice().sort((a, b) => b.tarih.localeCompare(a.tarih)).map((s) => {
    const c = s.musteriId && findCustomer(s.musteriId);
    const ad = c ? esc(c.ad) : "Müşterisiz";
    const cls = (Number(s.odeme.acik) > 0) ? "sat-borc" : (Number(s.odeme.pos) > 0 ? "sat-pos" : "sat-nakit");
    return `<div class="satr ${cls}" data-saleview="${s.id}"><input type="checkbox" class="sat-sel" data-sel="${s.id}" /><span class="satr-ad">${ad}</span><span class="satr-ode">${saleOdeme(s)}</span><span class="satr-tut">${money.format(s.toplam)}</span></div>`;
  }).join("");
  return `<div class="card sat-card">
    <div class="sat-tools"><label class="sat-all"><input type="checkbox" id="satAll" /> Tümü</label><span class="hint" id="satSecim">0 seçili</span><button class="btn softred sm" id="satSil" type="button" disabled>🗑 Sil</button></div>
    <div class="sat-liste">${rows}</div>
  </div>`;
}
function raporSatisWire() {
  const guncelle = () => { const sel = document.querySelectorAll(".sat-sel:checked").length; const d = document.getElementById("satSecim"); if (d) d.textContent = sel + " seçili"; const btn = document.getElementById("satSil"); if (btn) btn.disabled = sel === 0; const all = document.getElementById("satAll"); if (all) all.checked = sel > 0 && sel === document.querySelectorAll(".sat-sel").length; };
  document.querySelectorAll(".sat-sel").forEach((ch) => { ch.addEventListener("click", (e) => e.stopPropagation()); ch.addEventListener("change", guncelle); });
  document.querySelectorAll(".sat-chk").forEach((td) => td.addEventListener("click", (e) => e.stopPropagation()));
  const all = document.getElementById("satAll"); if (all) all.addEventListener("change", () => { document.querySelectorAll(".sat-sel").forEach((ch) => ch.checked = all.checked); guncelle(); });
  const sil = document.getElementById("satSil"); if (sil) sil.addEventListener("click", () => {
    const ids = [...document.querySelectorAll(".sat-sel:checked")].map((ch) => ch.dataset.sel);
    if (!ids.length) return;
    if (!confirm(ids.length + " satış silinsin mi? (stok geri yüklenir, geri alınamaz)")) return;
    const set = new Set(ids);
    store.sales.forEach((s) => { if (set.has(s.id)) s.items.forEach((it) => { const p = findProduct(it.urunId); if (!p) return; if (s.stokKaynak === "arac") p.aracStok = (Number(p.aracStok) || 0) + it.adet; else p.stok = (Number(p.stok) || 0) + it.adet; }); });
    store.sales = store.sales.filter((s) => !set.has(s.id));
    saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); render();
  });
}
function sonSatisListesi(son) {
  if (!son.length) return `<div class="card"><div class="sl-empty">Henüz satış yok.</div></div>`;
  const rows = son.map((s) => {
    const c = s.musteriId && findCustomer(s.musteriId);
    const ad = c ? esc(c.ad) : "Müşterisiz satış";
    const odenen = (s.odeme.nakit || 0) + (s.odeme.pos || 0);
    const kalan = c ? `<span class="sl-metric"><span class="sl-k">Kalan</span><b class="${s.odeme.acik ? "sl-neg" : ""}">${money.format(s.odeme.acik || 0)}</b></span>` : "";
    return `<li class="sl-row">
      <div class="sl-main">
        <span class="sl-ad">${ad}</span>
        <span class="sl-nums">
          <span class="sl-metric"><span class="sl-k">Tutar</span><b>${money.format(s.toplam)}</b></span>
          <span class="sl-metric"><span class="sl-k">Ödenen</span><b>${money.format(odenen)}</b></span>
          ${kalan}
        </span>
      </div>
      <button class="sl-eye" type="button" data-saleview="${s.id}" aria-label="İrsaliye detayı">👁</button>
    </li>`;
  }).join("");
  return `<ul class="sl-list">${rows}</ul>`;
}
/* İrsaliye içeriği modalı — Düzenle → openSale */
function openSaleView(id) {
  const s = store.sales.find((x) => x.id === id);
  if (!s) return;
  const c = s.musteriId && findCustomer(s.musteriId);
  const odenen = (s.odeme.nakit || 0) + (s.odeme.pos || 0);
  const items = s.items.map((it) => `<tr><td class="sv-nm">${esc(it.ad)}</td><td class="r">${num2.format(it.adet)}</td><td class="r">${money.format(it.fiyat)}</td><td class="r">${money.format(it.fiyat * it.adet)}</td></tr>`).join("");
  const body = `<div class="sv">
    <div class="sv-meta"><div><span>Belge No</span><b>${esc(s.belgeNo)}</b></div><div><span>Müşteri</span><b>${c ? esc(c.ad) : "Müşterisiz satış"}</b></div></div>
    <div class="sv-wrap"><table class="sv-items"><thead><tr><th>Ürün</th><th class="r">Adet</th><th class="r">B.Fiyat</th><th class="r">Tutar</th></tr></thead><tbody>${items}</tbody></table></div>
    <div class="sv-tot"><div><span>Toplam</span><b>${money.format(s.toplam)}</b></div><div><span>Ödenen</span><b>${money.format(odenen)}</b></div>${c ? `<div><span>Kalan</span><b class="${s.odeme.acik ? "sl-neg" : ""}">${money.format(s.odeme.acik || 0)}</b></div>` : ""}</div>
  </div>`;
  openModal("İrsaliye " + esc(s.belgeNo), body, { okLabel: "✏️ Düzenle", onOk: () => { openSale(s.id); } });
}
function mountAnasayfa() {
  wireSaleLinks();
  vadeKartWire();
  document.querySelectorAll("[data-saleview]").forEach((b) => b.addEventListener("click", () => openSaleView(b.dataset.saleview)));
}

/* ============ RAPORLAR ============ */
const reportFilters = {};
function reportDateBar(route, def) {
  const f = reportFilters[route] || def;
  return `<div class="card"><div class="filters rapor-filtre">
    <div class="field"><label>Başlangıç Tarihi</label><input type="date" id="rFrom" value="${f.from}" /></div>
    <div class="field"><label>Bitiş Tarihi</label><input type="date" id="rTo" value="${f.to}" /></div>
    <div class="field field-listele"><button class="btn" id="rListe" type="button">☰ Listele</button></div>
  </div></div>`;
}
function mountReport(route) {
  const b = document.getElementById("rListe");
  if (b) b.addEventListener("click", () => { reportFilters[route] = { from: document.getElementById("rFrom").value, to: document.getElementById("rTo").value }; render(); });
  wireTableSearch();
  wireSaleLinks();
  document.querySelectorAll("[data-saleview]").forEach((b) => b.addEventListener("click", () => openSaleView(b.dataset.saleview)));
  raporSatisWire();
  const pr = document.querySelector('[data-act="rprint"]'); if (pr) pr.addEventListener("click", () => window.print());
  const bo = document.querySelector('[data-act="bugunozet"]'); if (bo) bo.addEventListener("click", () => navigate("anasayfa"));
  const uc = document.querySelector('[data-act="urunselCsv"]'); if (uc) uc.addEventListener("click", exportUrunselRapor);
  const gc = document.querySelector('[data-act="gunlukCsv"]'); if (gc) gc.addEventListener("click", exportGunlukSatisListesi);
}
function salesInRange(route, def) { const f = reportFilters[route] || def; return store.sales.filter((s) => inRange(s.tarih, f.from, f.to)); }

let sonGunlukRapor = null; // ekranda duran gunluk rapor — "Satis Listesi (Excel)" bunu disa yazar
/* Gunluk satis listesi: satilan her urun icin tek satir — "adet + urun adi". 150 kalem urun = 150 satir. */
function exportGunlukSatisListesi() {
  const r = sonGunlukRapor;
  if (!r || !r.sales.length) { alert("Dışa aktarılacak satış yok. Önce tarih aralığını seçip Listele'ye basın."); return; }
  const agg = {};
  r.sales.forEach((s) => s.items.forEach((it) => {
    const k = it.urunId || it.ad;
    if (!agg[k]) agg[k] = { ad: it.ad, adet: 0 };
    agg[k].adet += Number(it.adet) || 0;
  }));
  const list = Object.values(agg).sort((a, b) => b.adet - a.adet || a.ad.localeCompare(b.ad, "tr"));
  const n = (v) => num2.format(Number(v) || 0);
  const rows = [["Adet", "Ürün"]].concat(list.map((a) => [n(a.adet), a.ad]));
  rows.push([n(list.reduce((t, a) => t + a.adet, 0)), "TOPLAM (" + list.length + " kalem)"]);
  const ad = r.from === r.to ? "babuco-gunluk-satis-" + r.from + ".csv" : "babuco-gunluk-satis-" + r.from + "_" + r.to + ".csv";
  downloadFile(ad, csvBuild(rows));
}
function renderRaporGunluk() {
  const route = "rapor-gunluk", def = { from: todayStr(), to: todayStr() };
  const sales = salesInRange(route, def), f = reportFilters[route] || def;
  const sum = (fn) => sales.reduce((a, s) => a + fn(s), 0);
  const nakit = sum((s) => s.odeme.nakit), pos_ = sum((s) => s.odeme.pos), acik = sum((s) => s.odeme.acik), ciro = sum((s) => s.toplam), mal = sum((s) => s.maliyet || 0);
  const k = kasaHesap(f.from, f.to); // Anasayfa, Dükkan ve gün sonu ile aynı hesap
  sonGunlukRapor = { sales, from: f.from, to: f.to };
  // Ödeme kırılımı ciroyu tutmalı. Tutmuyorsa kayıtta bir tuhaflık var (ör. satış
  // tutarını aşan nakit eskiden satışa yazılıyordu) — sessizce basmak yerine söyle.
  const odemeFarki = kurus(nakit + pos_ + acik - ciro);
  const odemeUyari = Math.abs(odemeFarki) > 0.01
    ? `<div class="rapor-uyari">⚠ Ödeme kırılımı ciroyu tutmuyor — fark <b>${money.format(odemeFarki)}</b>. Nakit + Pos + Açık Hesap toplamı Ciro'ya eşit olmalı.</div>`
    : "";
  return pageHead("Günlük Rapor", null, [{ label: "📅 Bugün Özeti", cls: "soft", act: "bugunozet" }, { label: "⇩ Satış Listesi (Excel)", cls: "softgreen", act: "gunlukCsv" }, { label: "🖨 Yazdır", cls: "soft", act: "rprint" }]) + reportDateBar(route, def) +
    `<h2 class="rapor-satis-bas">Satışlar (${sales.length})</h2>` + raporSatisTablo(sales) + odemeUyari +
    `<div class="summary-grid rapor-metrik-grid">${[
      ["Nakit", money.format(nakit), "green"], ["Pos", money.format(pos_)], ["Açık Hesap", money.format(acik)], ["Toplam", money.format(ciro), "blue"],
      ["Alınan Ödemeler", money.format(k.tahsilat)], ["Firma Ödemeleri", money.format(k.firmaOde)], ["Giderler", money.format(k.gider)], ["Gelirler", money.format(k.gelir)]]
      .concat(k.alimNakit || k.alimDiger ? [["Peşin Mal Alımı", money.format(kurus(k.alimNakit + k.alimDiger))]] : [])
      .concat(k.iade || k.duzeltme ? [["İade / Düzeltme (kasaya girmez)", money.format(kurus(k.iade + k.duzeltme))]] : [])
      .concat([["Nakit Kasa Raporu", money.format(k.nakitKasa), "green"], ["Kart / Havale ile Gelen", money.format(k.kartHavale)], ["Kâr", money.format(k.urunKar), "green"], ["Kâr Oranı", karOrani(ciro, mal), "green"]])
      .concat(k.komisyon ? [["Kart (POS) Komisyonu", money.format(k.komisyon)]] : [])
      .concat([["Net Kâr (gider sonrası)", money.format(k.netKar), "green"], ["Ciro", money.format(ciro), "blue"], ["Ürün Maliyeti", money.format(mal)]])
      .map((s) => stat(s[0], s[1], s[2])).join("")}</div>
    <p class="hint pl-kasa-not">Nakit kasa = nakit satış + nakit alınan ödeme + nakit gelir − nakit gider − firmaya nakit ödeme − peşin nakit mal alımı. Kartla ya da havaleyle gelen para, iadeler ve hesap düzeltmeleri kasaya sayılmaz.${k.giderEksik ? " <b>Bu tarihte satış var ama hiç gider yazılmamış.</b>" : ""}</p>`;
}
function renderRaporTarihsel() {
  const route = "rapor-tarihsel", def = { from: monthStartStr(), to: todayStr() };
  const sales = salesInRange(route, def);
  return pageHead("Tarihsel Rapor", null, [{ label: "📅 Bugün Özeti", cls: "soft", act: "bugunozet" }, { label: "🖨 Yazdır", cls: "soft", act: "rprint" }]) + reportDateBar(route, def) +
    `<h2 class="rapor-satis-bas">Satışlar (${sales.length})</h2>` + raporSatisTablo(sales);
}
let sonUrunselRapor = null; // ekranda duran ürünsel rapor — "Excel'e Aktar" bunu dışa yazar
function renderRaporUrunsel() {
  const route = "rapor-urunsel", def = { from: monthStartStr(), to: todayStr() };
  const sales = salesInRange(route, def), f = reportFilters[route] || def;
  const agg = {};
  sales.forEach((s) => s.items.forEach((it) => { const pr = findProduct(it.urunId); const k = it.urunId || it.ad; if (!agg[k]) agg[k] = { ad: it.ad, barkod: pr ? pr.barkod : "", adet: 0, tutar: 0, mal: 0, stok: pr ? Number(pr.stok) || 0 : 0, alis: pr ? Number(pr.alis) || 0 : 0 }; agg[k].adet += it.adet; agg[k].tutar += it.fiyat * it.adet; agg[k].mal += kalemAlis(it) * it.adet; }));
  const list = Object.values(agg).sort((a, b) => b.tutar - a.tutar);
  sonUrunselRapor = { list, from: f.from, to: f.to };
  const rows = list.map((a) => { const kar = a.tutar - a.mal; return `<tr><td>${esc(a.barkod) || "-"}</td><td>${esc(a.ad)}</td><td>${num2.format(a.adet)}</td><td>${num2.format(a.stok)}</td><td>${money.format(a.alis)}</td><td>${money.format(a.adet ? a.tutar / a.adet : 0)}</td><td>${money.format(a.adet ? kar / a.adet : 0)}</td><td>${money.format(a.tutar)}</td><td class="${kar < 0 ? "borc-red" : ""}">${money.format(kar)}</td></tr>`; }).join("");
  return pageHead("Ürünsel Rapor", null, [{ label: "⇩ Excel'e Aktar", cls: "softgreen", act: "urunselCsv" }, { label: "🖨 Yazdır", cls: "soft", act: "rprint" }]) + reportDateBar(route, def) +
    tableCard(["Ürün Barkodu", "Ürün Adı", "Satış Miktarı", "Kalan Stok", "Ort. Birim Alış", "Ort. Birim Fiyatı", "Ort. Birim Kâr", "Toplam Tutar", "Kâr/Zarar"], rows, infoLine(list.length));
}
/* Ürünsel raporu CSV olarak dışa aktar. Türkçe Excel için ondalık virgüllü (csvBuild zaten ; ile ayırıyor). */
function exportUrunselRapor() {
  const r = sonUrunselRapor;
  if (!r || !r.list.length) { alert("Dışa aktarılacak satış yok. Önce tarih aralığını seçip Listele'ye basın."); return; }
  const n = (v) => num2.format(Number(v) || 0);                                    // miktar: 11
  const tl = (v) => csvTutar.format(Number(v) || 0);                               // para: 1.234,56
  const head = ["Ürün Barkodu", "Ürün Adı", "Satış Miktarı", "Kalan Stok", "Ort. Birim Alış", "Ort. Birim Fiyatı", "Ort. Birim Kâr", "Toplam Tutar", "Kâr/Zarar"];
  const rows = [head].concat(r.list.map((a) => {
    const kar = a.tutar - a.mal;
    return [a.barkod || "", a.ad, n(a.adet), n(a.stok), tl(a.alis), tl(a.adet ? a.tutar / a.adet : 0), tl(a.adet ? kar / a.adet : 0), tl(a.tutar), tl(kar)];
  }));
  const top = r.list.reduce((o, a) => ({ adet: o.adet + a.adet, tutar: o.tutar + a.tutar, mal: o.mal + a.mal }), { adet: 0, tutar: 0, mal: 0 });
  rows.push(["", "TOPLAM", n(top.adet), "", "", "", "", tl(top.tutar), tl(top.tutar - top.mal)]);
  downloadFile("babuco-urunsel-" + r.from + "_" + r.to + ".csv", csvBuild(rows));
}
function renderRaporGrupsal() {
  const route = "rapor-grupsal", def = { from: monthStartStr(), to: todayStr() };
  const sales = salesInRange(route, def);
  const agg = {};
  sales.forEach((s) => s.items.forEach((it) => { const pr = findProduct(it.urunId); const g = pr ? (pr.grup || "GRUPSUZ ÜRÜN") : "GRUPSUZ ÜRÜN"; if (!agg[g]) agg[g] = { adet: 0, tutar: 0, mal: 0 }; agg[g].adet += it.adet; agg[g].tutar += it.fiyat * it.adet; agg[g].mal += kalemAlis(it) * it.adet; }));
  const rows = Object.keys(agg).sort((a, b) => agg[b].tutar - agg[a].tutar).map((g) => `<tr><td>${esc(g)}</td><td>${num2.format(agg[g].adet)}</td><td>${money.format(agg[g].tutar)}</td><td class="${agg[g].tutar - agg[g].mal < 0 ? "borc-red" : ""}">${money.format(agg[g].tutar - agg[g].mal)}</td></tr>`).join("");
  return pageHead("Grupsal Rapor") + reportDateBar(route, def) + tableCard(["Grup Adı", "Satış Miktarı", "Toplam Tutar", "Kâr/Zarar"], rows, infoLine(Object.keys(agg).length));
}
function renderRaporKorelasyon() {
  const route = "rapor-korelasyon", def = { from: monthStartStr(), to: todayStr() };
  const sales = salesInRange(route, def);
  const pair = {};
  sales.forEach((s) => { const names = [...new Set(s.items.map((i) => i.ad))]; for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) { const k = [names[a], names[b]].sort().join(" + "); pair[k] = (pair[k] || 0) + 1; } });
  const rows = Object.keys(pair).sort((a, b) => pair[b] - pair[a]).slice(0, 100).map((k) => { const [x, y] = k.split(" + "); return `<tr><td>${esc(x)}</td><td>${esc(y)}</td><td>${pair[k]}</td></tr>`; }).join("");
  return pageHead("Ürün Korelasyon Raporu", "Aynı fişte birlikte satılan ürünler") + reportDateBar(route, def) + tableCard(["Ürün", "Birlikte Satılan Ürün", "Birlikte Adet"], rows, infoLine(Object.keys(pair).length));
}
function renderRaporStokHareket() {
  const route = "rapor-stokhareket", def = { from: monthStartStr(), to: todayStr() };
  const f = reportFilters[route] || def;
  const mov = [];
  store.sales.forEach((s) => { if (inRange(s.tarih, f.from, f.to)) s.items.forEach((it) => mov.push({ ad: it.ad, tur: "Satış (çıkış)", miktar: -it.adet, tarih: s.tarih })); });
  store.purchases.forEach((p) => { if (inRange(p.tarih, f.from, f.to)) p.items.forEach((it) => mov.push({ ad: it.ad, tur: "Alış (giriş)", miktar: it.adet, tarih: p.tarih })); });
  store.iadeler.forEach((r) => { if (inRange(r.tarih, f.from, f.to)) mov.push({ ad: r.ad, tur: "İade (giriş)", miktar: r.adet, tarih: r.tarih }); });
  store.stokHareket.forEach((m) => { if (inRange(m.tarih, f.from, f.to)) mov.push({ ad: m.ad, tur: m.tur || "Düzeltme", miktar: m.miktar, tarih: m.tarih }); });
  mov.sort((a, b) => b.tarih.localeCompare(a.tarih));
  const rows = mov.map((m) => `<tr><td>${esc(m.ad)}</td><td>${esc(m.tur)}</td><td class="${m.miktar < 0 ? "borc-red" : ""}">${num2.format(m.miktar)}</td><td>${fmtDate(m.tarih)}</td></tr>`).join("");
  return pageHead("Stok Hareket Rapor", null, [{ label: "＋ Stok Düzeltme", act: "stokduz" }]) + reportDateBar(route, def) + tableCard(["Ürün", "Tür", "Miktar", "Tarih"], rows, infoLine(mov.length));
}
function mountRaporStokHareket() {
  mountReport("rapor-stokhareket");
  const b = document.querySelector('[data-act="stokduz"]');
  if (b) b.addEventListener("click", () => formModal("Stok Düzeltme", [
    { key: "urunId", label: "Ürün", type: "select", options: store.products.map((p) => ({ v: p.id, t: p.ad })), req: true },
    { key: "miktar", label: "Miktar (+ giriş / − çıkış)", type: "number", step: "0.01", req: true },
    { key: "tur", label: "Açıklama", def: "Manuel Düzeltme" },
  ], null, (d) => {
    const pr = findProduct(d.urunId); if (!pr) return;
    pr.stok = (Number(pr.stok) || 0) + Number(d.miktar);
    store.stokHareket.push({ id: genId(), ad: pr.ad, urunId: pr.id, miktar: Number(d.miktar), tur: d.tur, tarih: new Date().toISOString() });
    saveStore(); render();
  }));
}
function renderRaporPersonel() {
  const route = "rapor-personelhareket", def = { from: monthStartStr(), to: todayStr() };
  const sales = salesInRange(route, def);
  const agg = {};
  sales.forEach((s) => { const k = s.personelId || "yok"; if (!agg[k]) agg[k] = { adet: 0, tutar: 0 }; agg[k].adet++; agg[k].tutar += s.toplam; });
  const rows = Object.keys(agg).map((k) => { const p = store.personeller.find((x) => x.id === k); return `<tr><td>${p ? esc(p.ad) : "Atanmamış"}</td><td>${agg[k].adet}</td><td>${money.format(agg[k].tutar)}</td></tr>`; }).join("");
  return pageHead("Personel Hareket Raporu") + reportDateBar(route, def) + tableCard(["Personel", "Satış Sayısı", "Toplam Tutar"], rows, infoLine(Object.keys(agg).length));
}
/* ============ PARA: tahsilat türü · kasa · limit/vade · gider (ortak hesaplar) ============
   tahsilatTuru, kalemAlis, kasaHesap ve borcYas'ın birer kopyası tools/babuco.cjs içinde de var:
   kural değişirse İKİSİNİ birlikte değiştir. testler/para/kasa.mjs iki tarafın aynı
   gün için aynı rakamı verdiğini denetler. */
const TAHSILAT_TUR_AD = { nakit: "Nakit", kart: "Kart", havale: "Havale", iade: "İade", duzeltme: "Düzeltme" };
const KART_NOT_RE = /(^|[^a-zçğöşü])(pos|kart)(['’]?(la|tan|dan|ina|indan|iyla|i|a))?(?![a-zçğöşü])/;
const HAVALE_NOT_RE = /(^|[^a-zçğöşü])(havale[a-zçğöşü]*|eft(['’][a-zçğöşü]+)?|iban(['’]?[a-zçğöşü]{1,4})?)(?![a-zçğöşü])/;
/* Tahsilat kaydının türü. Yeni kayıtlarda odemeTuru alanı yazılıdır; eski kayıtlarda nottan çıkarılır.
   Sıra önemli: "Bakiye düzeltme: pos ile ödemişti" bir düzeltmedir, kart tahsilatı değil.
   Eksi tutar (elle borç yazma) da düzeltmedir. iade ve duzeltme PARA GİRİŞİ DEĞİLDİR. */
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
/* Gider/gelir kaydı nakit mi? Panel "odeme" (Nakit/POS/Havale) yazar, araç eskiden hiç yazmazdı → nakit. */
function kayitNakitMi(e) { const s = String((e && (e.odeme || e.odemeTuru)) || "").toLocaleLowerCase("tr-TR"); return !s || s === "nakit"; }
/* Gider türü: panel "tur", araç "kategori" yazıyordu — ikisi de okunur. */
function giderKategori(e) { return String((e && (e.kategori || e.tur)) || "").trim() || "Genel"; }
/* "Araç Stok Alımı" gideri aslında mal alımıdır: para kasadan çıkar ama işletme gideri değildir
   (o malın maliyeti satılınca zaten kârdan düşüyor; gidere de sayılırsa iki kez düşülmüş olur). */
function giderMalAlimiMi(e) { return /stok al[ıi]m/i.test(giderKategori(e)); }
/* Kalemin satış anındaki birim maliyeti. Eski kayıtlarda alan yok → ürünün şimdiki alış fiyatı. */
function urunAlis(urunId) { const p = urunId && findProduct(urunId); return p ? Number(p.alis) || 0 : 0; }
function kalemAlis(it) { return (it && it.alis != null && it.alis !== "") ? (Number(it.alis) || 0) : urunAlis(it && it.urunId); }

/* TEK kasa/kâr hesabı — Anasayfa, Dükkan, Günlük Rapor ve gün sonu hepsi bunu kullanır.
   nakitKasa = nakit satış + nakit tahsilat + nakit gelir − nakit gider − firmaya nakit ödeme − peşin nakit mal alımı.
   Kart/havale ile gelen ayrı (kartHavale). İade ve düzeltme kasaya girmez.
   Kâr: urunKar = ciro − maliyet; POS komisyonu AYRI satır; netKar = urunKar − komisyon − işletme gideri + gelir. */
function kasaHesap(from, to) {
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
  /* Firma ödemesi: odemeTuru yoksa eski davranış (nakit sayılır). */
  (store.firmaPayments || []).forEach((p) => { if (!ic(p.tarih)) return; if (!p.odemeTuru || p.odemeTuru === "nakit") r.firmaNakit += N(p.tutar); else r.firmaDiger += N(p.tutar); });
  /* Peşin mal alımı: yalnız odemeTuru yazılı kayıtlar kasayı etkiler (alan yoksa eski davranış: sayılmaz). */
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
  r.giderEksik = r.satisAdet > 0 && r.giderAdet === 0;   // satış var, hiç işletme gideri yazılmamış
  return r;
}

/* ---- Vade: borcun yaşı (ilk giren ilk kapanır) ---- */
const VADE_VARSAYILAN = 30;
function genelVade() { const v = Number(store.settings && store.settings.varsayilanVade); return v > 0 ? Math.round(v) : VADE_VARSAYILAN; }
function musteriVade(c) { const v = Number(c && c.vade); return v > 0 ? Math.round(v) : genelVade(); }
function gunFarki(iso, bugun) {
  const a = new Date(localDateStr(new Date(iso)) + "T12:00:00"), b = new Date((bugun || todayStr()) + "T12:00:00");
  return Math.round((b - a) / 86400000);
}
/* genId() kimliğinin sonundaki 8 hane kaydın açıldığı andır (Date.now().toString(36)). */
function idZamani(id) {
  const m = /^id\d+([0-9a-z]{8})$/.exec(String(id || "")); if (!m) return null;
  const t = parseInt(m[1], 36);
  return (t > 1577836800000 && t < Date.now() + 86400000) ? new Date(t).toISOString() : null;
}
/* Müşterinin açık borç kalemleri, en eskiden yeniye. Bütün ödemeler (tahsilat, iade, düzeltme,
   eksi açılış) toplanır ve borçlar tarih sırasıyla kapatılır; kapanmayan kısım "açık" kalır.
   Açılış borcunun tarihi yoktur: müşteri kartının açıldığı an ya da ilk hareketi (hangisi eskiyse) sayılır. */
function borcYas(id, bugun) {
  const c = findCustomer(id); if (!c) return null;
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
  const vade = musteriVade(c), gec = acik.filter((a) => a.gun > vade);
  const gecikmisTutar = kurus(gec.reduce((a, x) => a + x.tutar, 0));
  const gecikmis = gecikmisTutar > 0.5;
  return { borc: kurus(acik.reduce((a, x) => a + x.tutar, 0) - odenen), acik: acik, avans: odenen, vade: vade, vadeOzel: Number(c.vade) > 0,
    enEski: acik[0] || null, gecikmis: gecikmis, gecikmisTutar: gecikmis ? gecikmisTutar : 0, gecikmeGun: gecikmis ? acik[0].gun - vade : 0 };
}
/* ---- Limit ---- */
function musteriLimit(c) { const l = Number(c && c.limit); return l > 0 ? l : 0; }
/* ekAcik: bu satıştan açık hesaba yazılacak tutar (0 = sadece şimdiki durum). */
function limitDurum(id, ekAcik) {
  const c = findCustomer(id), limit = musteriLimit(c), borc = customerBorc(id), yeni = kurus(borc + (Number(ekAcik) || 0));
  return { limit: limit, borc: borc, yeni: yeni, kalan: limit ? kurus(limit - borc) : null, asim: (limit && yeni > limit + 0.005) ? kurus(yeni - limit) : 0 };
}
/* Açık hesaba yazan satıştan önce sorulan onay metni; limit yoksa/aşılmıyorsa "" döner (soru sorulmaz). */
function limitUyariMetni(id, ekAcik) {
  const c = findCustomer(id); if (!c) return "";
  const d = limitDurum(id, ekAcik); if (!d.asim) return "";
  const y = borcYas(id);
  return "DİKKAT — BORÇ LİMİTİ AŞILIYOR\n\n" + c.ad +
    "\nŞimdiki borcu: " + money.format(d.borc) +
    "\nBu satıştan borca yazılacak: " + money.format(Number(ekAcik) || 0) +
    "\nYeni borcu: " + money.format(d.yeni) +
    "\nLimiti: " + money.format(d.limit) + "  →  " + money.format(d.asim) + " fazla" +
    (y && y.gecikmis ? "\n\nAyrıca " + money.format(y.gecikmisTutar) + " borcu " + y.gecikmeGun + " gündür gecikmiş." : "") +
    "\n\nYine de borca yazılsın mı?\nTamam = satışı kaydet · İptal = vazgeç (hiçbir şey kaydedilmez)";
}
/* Satış ekranında müşteri adının altındaki satır: borç, kalan limit, gecikme uyarısı. */
function satisMusteriDurumHTML(id, sepetTutar) {
  const c = findCustomer(id); if (!c) return "";
  const d = limitDurum(id, 0), y = borcYas(id);
  let h = "Borç: <b>" + money.format(d.borc) + "</b>";
  if (d.limit) h += " · Limit: " + money.format(d.limit) + (d.kalan >= 0 ? " · Kalan: <b>" + money.format(d.kalan) + "</b>" : "");
  else h += " · Limit yok";
  const u = [];
  if (d.limit && d.kalan < -0.005) u.push(["dikkat", "", "Limit " + money.format(-d.kalan) + " aşılmış"]);
  else if (d.limit && Number(sepetTutar) > 0 && d.borc + Number(sepetTutar) > d.limit + 0.005) u.push(["dikkat", " sari", "Bu sepet borca yazılırsa limit " + money.format(kurus(d.borc + Number(sepetTutar) - d.limit)) + " aşılır"]);
  if (y && y.gecikmis) u.push(["saat", "", money.format(y.gecikmisTutar) + " borcu " + y.gecikmeGun + " gündür gecikmiş"]);
  return h + u.map((x) => `<em class="pl-uyari${x[1]}">${ikon(x[0], 15, 2.2)}<span>${esc(x[2])}</span></em>`).join("");
}
/* Listelerde ad/borç yanına konan küçük işaretler. */
function musteriRozetHTML(id) {
  const d = limitDurum(id, 0), y = borcYas(id); let h = "";
  if (d.asim) h += ` <span class="pl-rozet kirmizi">⛔ limit aşıldı</span>`;
  if (y && y.gecikmis) h += ` <span class="pl-rozet turuncu">⏰ ${y.gecikmeGun} gün gecikmiş</span>`;
  return h;
}
function vadeListesi() {
  return store.customers.map((c) => ({ c: c, y: borcYas(c.id), l: limitDurum(c.id, 0) }))
    .filter((x) => x.y && (x.y.gecikmis || x.l.asim > 0))
    .sort((a, b) => (b.y.gecikmisTutar - a.y.gecikmisTutar) || (b.l.asim - a.l.asim));
}
function vadeSatirHTML(x) {
  const alt = [];
  if (x.y.gecikmis) alt.push(`<b>${money.format(x.y.gecikmisTutar)}</b> · ${x.y.gecikmeGun} gün gecikmiş`);
  if (x.l.asim) alt.push(`limit ${money.format(x.l.asim)} aşıldı`);
  return `<div class="pv-satir"><div class="pv-mid"><button class="link-btn pv-ad" data-detay="${x.c.id}" type="button">${esc(x.c.ad)}</button><span class="pv-alt">${alt.join(" · ")} · toplam borç ${money.format(x.y.borc)}</span></div>
    <div class="pv-btns"><button class="btn soft pv-btn" data-hatirlat="${x.c.id}" type="button">📲 Hatırlat</button><button class="btn green pv-btn" data-odeme="${x.c.id}" type="button">Ödeme Al</button></div></div>`;
}
/* Anasayfa kartı: vadesi geçenler + limiti aşanlar. */
function vadeKartHTML() {
  const list = vadeListesi(), gec = list.filter((x) => x.y.gecikmis);
  const top = kurus(gec.reduce((a, x) => a + x.y.gecikmisTutar, 0));
  const alt = `<p class="hint pv-ayar">Vadesi yazılmamış müşteride ${genelVade()} gün sayılır. <button class="link-btn" data-act="genelvade" type="button">Değiştir</button></p>`;
  if (!list.length) return `<div class="card pv-kart"><div class="pv-bas"><b>Vadesi geçen borç yok</b> <span class="pv-ok">✓</span></div>${alt}</div>`;
  const ilk = list.slice(0, 5), kalan = list.slice(5);
  return `<div class="card pv-kart"><div class="pv-bas"><b>Vadesi geçenler (${gec.length})</b><span class="pv-top">${money.format(top)}</span></div>
    ${ilk.map(vadeSatirHTML).join("")}
    ${kalan.length ? `<details class="pv-diger"><summary>Diğer ${kalan.length} müşteri</summary>${kalan.map(vadeSatirHTML).join("")}</details>` : ""}${alt}</div>`;
}
function vadeKartWire() {
  document.querySelectorAll("[data-hatirlat]").forEach((b) => b.addEventListener("click", () => hatirlatmaAc(b.dataset.hatirlat)));
  document.querySelectorAll(".pv-kart [data-odeme]").forEach((b) => b.addEventListener("click", () => openOdemeAl(b.dataset.odeme)));
  document.querySelectorAll(".pv-kart [data-detay]").forEach((b) => b.addEventListener("click", () => { selectedCustomerId = b.dataset.detay; navigate("musteri-detay"); }));
  const gv = document.querySelector('[data-act="genelvade"]');
  if (gv) gv.addEventListener("click", () => {
    const v = prompt("Vadesi yazılmamış müşteriler için kaç gün sayılsın?", String(genelVade())); if (v == null) return;
    const n = Math.round(Number(String(v).replace(",", ".")));
    if (!(n > 0 && n < 366)) { alert("1 ile 365 arasında bir gün sayısı yaz."); return; }
    store.settings.varsayilanVade = n; saveStore(); render();
  });
}
/* Müşteri detayındaki durum kartı. */
function musteriDurumKartHTML(id) {
  const c = findCustomer(id); if (!c) return "";
  const d = limitDurum(id, 0), y = borcYas(id);
  const satir = (k, v, cls) => `<div class="pd-satir"><span>${k}</span><b class="${cls || ""}">${v}</b></div>`;
  let h = satir("Borç limiti", d.limit ? money.format(d.limit) + (d.asim ? " — " + money.format(d.asim) + " aşıldı" : " — kalan " + money.format(d.kalan)) : "yok (sınırsız)", d.asim ? "borc-red" : "");
  h += satir("Vade", y.vade + " gün" + (y.vadeOzel ? "" : " (genel)"));
  if (y.enEski) h += satir("En eski ödenmemiş borç", fmtDateShort(y.enEski.t) + " · " + y.enEski.gun + " gün önce" + (y.enEski.acilis ? " (açılış borcu)" : ""));
  h += satir("Durum", y.gecikmis ? money.format(y.gecikmisTutar) + " borcu " + y.gecikmeGun + " gündür gecikmiş" : (d.borc > 0.5 ? "Vadesi geçen borç yok" : "Borcu yok"), y.gecikmis ? "borc-red" : "");
  return `<div class="card pd-kart">${h}${d.borc > 0.5 ? `<button class="btn soft pd-btn" data-hatirlat="${id}" type="button">📲 Nazik Hatırlatma Gönder (WhatsApp)</button>` : ""}</div>`;
}
/* ---- Nazik hatırlatma: hazır metin + WhatsApp'ı açar. Kendiliğinden hiçbir şey göndermez. ---- */
function waNo(c) { let d = ((c && c.telefon) || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "9" + d; else if (d.length === 10) d = "90" + d; return d; }
function hatirlatmaMetni(id) {
  const c = findCustomer(id); if (!c) return "";
  const y = borcYas(id), st = store.settings || {}, firma = st.fisBaslik || st.firmaAdi || "Özgür Ticaret";
  return "Merhaba " + c.ad + ",\n" + firma + " olarak küçük bir hatırlatma yapmak istedik. Hesabınızda " + money.format(y.borc) + " bakiye görünüyor" +
    (y.gecikmis ? "; bunun " + money.format(y.gecikmisTutar) + " kadarı " + y.gecikmeGun + " gündür bekliyor" : "") +
    ".\nMüsait olduğunuzda ödeme için haber verirseniz çok seviniriz. Bir yanlışlık varsa lütfen söyleyin, hemen düzeltelim.\nTeşekkür eder, hayırlı işler dileriz.";
}
function hatirlatmaAc(id) {
  const c = findCustomer(id); if (!c) return;
  const d = waNo(c);
  openModal("Hatırlatma — " + esc(c.ad), `<p class="hint">Mesajı istersen değiştir. Düğmeye basınca WhatsApp açılır; <b>göndermek için orada sen basarsın</b>.</p>
    <textarea id="htMetin" class="pl-metin" rows="9">${esc(hatirlatmaMetni(id))}</textarea>
    ${d ? "" : `<p class="hint">Bu müşteride telefon yok — WhatsApp'ta kişiyi kendin seçersin.</p>`}
    <button class="btn green lg pl-tam" id="htGonder" type="button">📲 WhatsApp'ta Aç</button>`, {
    noFoot: true,
    onMount: (ov) => { ov.querySelector("#htGonder").onclick = () => { window.open((d ? "https://wa.me/" + d : "https://wa.me/") + "?text=" + encodeURIComponent(ov.querySelector("#htMetin").value), "_blank"); }; },
  });
}
/* ---- Tahsilat türü seçici (Ödeme Al) ---- */
function turSeciciHTML(secili) {
  return `<div class="pt-sec" id="pTur" data-tur="${secili || "nakit"}">${[["nakit", "💵 Nakit"], ["kart", "💳 Kart"], ["havale", "🏦 Havale"]].map((t) => `<button class="pt-btn ${t[0] === (secili || "nakit") ? "on" : ""}" data-ptur="${t[0]}" type="button">${t[1]}</button>`).join("")}</div>`;
}
function turSeciciWire(ov) {
  const kutu = ov.querySelector("#pTur"); if (!kutu) return;
  kutu.querySelectorAll("[data-ptur]").forEach((b) => b.addEventListener("click", () => { kutu.dataset.tur = b.dataset.ptur; kutu.querySelectorAll("[data-ptur]").forEach((x) => x.classList.toggle("on", x === b)); }));
}
/* İade tutarı: müşterinin o ürünü GERÇEKTE aldığı fiyat — son satış fiyatı, yoksa özel fiyatı, o da yoksa liste. */
function musteriUrunFiyat(musteriId, urunId) {
  const pr = findProduct(urunId), liste = pr ? Number(pr.satis) || 0 : 0;
  if (!musteriId) return liste;
  let son = null;
  store.sales.forEach((s) => { if (s.musteriId !== musteriId) return; s.items.forEach((it) => { if (it.urunId === urunId && Number(it.adet) > 0 && (!son || s.tarih > son.t)) son = { t: s.tarih, f: Number(it.fiyat) || 0 }; }); });
  if (son) return son.f;
  const c = findCustomer(musteriId), oz = c && c.ozelFiyatlar && c.ozelFiyatlar[urunId];
  return (oz != null && oz !== "") ? Number(oz) : liste;
}

/* ---- GİDERLER: tek dokunuşla tür seç, tutarı yaz ---- */
const GIDER_HIZLI = [["Yakıt", "⛽"], ["Yemek", "🍽"], ["Araç Bakım", "🔧"], ["Otopark / Köprü", "🅿"], ["Telefon", "📱"], ["Diğer", "➕"]];
function giderHizliHTML() { return `<div class="pg-hizli">${GIDER_HIZLI.map((g) => `<button class="pg-chip" data-gkat="${esc(g[0])}" type="button"><span>${g[1]}</span>${esc(g[0])}</button>`).join("")}</div>`; }
function giderEkleModal(kategori, sonra) {
  const diger = kategori === "Diğer";
  const m = openModal("Gider — " + esc(kategori), `
    ${diger ? `<div class="field"><label>Ne gideri?</label><input id="gdTur" placeholder="ör. lastik, kırtasiye" /></div>` : ""}
    <div class="field"><label>Tutar (₺)</label><input id="gdTutar" type="number" step="0.01" inputmode="decimal" placeholder="0" /></div>
    <div class="field"><label>Nasıl ödendi?</label>${turSeciciHTML("nakit")}</div>
    <div class="field"><label>Not (istersen)</label><input id="gdNot" placeholder="" /></div>
    <div class="field"><label>Tarih</label><input id="gdTarih" type="date" value="${todayStr()}" /></div>`, {
    okLabel: "Gideri Kaydet",
    onMount: (ov) => { turSeciciWire(ov); const t = ov.querySelector(diger ? "#gdTur" : "#gdTutar"); if (t) t.focus(); },
    onOk: (ov) => {
      const tutar = kurus(ov.querySelector("#gdTutar").value); if (!(tutar > 0)) { alert("Tutarı yaz."); return false; }
      const kat = diger ? ((ov.querySelector("#gdTur").value || "").trim() || "Diğer") : kategori;
      const tur = ov.querySelector("#pTur").dataset.tur, tv = ov.querySelector("#gdTarih").value;
      const simdi = new Date(), tarih = (tv && tv !== todayStr()) ? new Date(tv + "T12:00:00").toISOString() : simdi.toISOString();
      store.expenses.push({ id: genId(), tutar: tutar, kategori: kat, tur: kat, not: (ov.querySelector("#gdNot").value || "").trim(), odeme: tur === "kart" ? "POS" : (tur === "havale" ? "Havale" : "Nakit"), tarih: tarih });
      saveStore();
      if (sonra) setTimeout(sonra, 0); else render();
    },
  });
  return m;
}
/* Aylık sabit giderler (telefon, sigorta…): { id, ad, tutar, baslangic: "YYYY-AA" }. Başladığı aydan itibaren
   her ayın net kârından düşülür; geçmiş aylar geriye dönük değişmez. */
function sabitGiderler() { return store.sabitGiderler || []; }
function sabitGiderAylik(ym) { return kurus(sabitGiderler().filter((g) => (!g.baslangic || g.baslangic <= ym) && (!g.bitis || g.bitis >= ym)).reduce((a, g) => a + (Number(g.tutar) || 0), 0)); }
function ayOzet(ym) {
  const son = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0);
  const k = kasaHesap(ym + "-01", localDateStr(son));
  k.sabit = sabitGiderAylik(ym); k.net = kurus(k.netKar - k.sabit);
  return k;
}
function renderGiderler() {
  const ym = todayStr().slice(0, 7), a = ayOzet(ym), bugun = kasaHesap(todayStr(), todayStr());
  const liste = store.expenses.slice().sort((x, y) => String(y.tarih).localeCompare(String(x.tarih)));
  const rows = liste.slice(0, 200).map((e) => `<div class="pg-satir"><div class="pg-mid"><b>${esc(giderKategori(e))}</b><span class="pg-alt">${e.tarih && !isNaN(new Date(e.tarih)) ? fmtDateShort(e.tarih) : "tarihsiz"}${e.not ? " · " + esc(e.not) : ""}${kayitNakitMi(e) ? "" : " · " + esc(e.odeme || e.odemeTuru)}</span></div><b class="pg-tut">${money.format(Number(e.tutar) || 0)}</b><button class="pg-sil" data-gsil="${e.id}" type="button" aria-label="Sil">✕</button></div>`).join("") || `<p class="hint" style="padding:8px">Henüz gider yazılmamış.</p>`;
  const sabit = sabitGiderler().map((g) => `<div class="pg-satir"><div class="pg-mid"><b>${esc(g.ad)}</b><span class="pg-alt">her ay${g.baslangic ? " · " + esc(g.baslangic) + "'den beri" : ""}</span></div><b class="pg-tut">${money.format(Number(g.tutar) || 0)}</b><button class="pg-sil" data-sgsil="${g.id}" type="button" aria-label="Sil">✕</button></div>`).join("") || `<p class="hint" style="padding:8px">Her ay aynı gelen gider (telefon, sigorta, kira…) varsa buraya bir kez yaz; her ayın net kârından kendiliğinden düşülür.</p>`;
  const oz = (k, v, cls) => `<div class="pd-satir"><span>${k}</span><b class="${cls || ""}">${v}</b></div>`;
  return pageHead("Giderler", "Bugün " + money.format(bugun.giderIsletme) + " · bu ay " + money.format(a.giderIsletme)) +
    `<div class="card"><div class="pg-bas">Gider ekle — türüne dokun</div>${giderHizliHTML()}</div>
     <div class="section-title">Bu ay — ne kaldı?</div>
     <div class="card pd-kart">
       ${oz("Satışlardan kâr", money.format(a.urunKar))}
       ${a.komisyon ? oz("Kart (POS) komisyonu", "−" + money.format(a.komisyon)) : ""}
       ${oz("Giderler", "−" + money.format(a.giderIsletme))}
       ${a.sabit ? oz("Aylık sabit giderler", "−" + money.format(a.sabit)) : ""}
       ${a.gelir ? oz("Diğer gelirler", "+" + money.format(a.gelir)) : ""}
       ${oz("<b>Net kalan</b>", money.format(a.net), a.net < 0 ? "borc-red" : "pd-net")}
       ${a.giderMal ? `<p class="hint">Araca alınan mal (${money.format(a.giderMal)}) gider sayılmadı: o malın parası satılınca kârdan zaten düşüyor.</p>` : ""}
     </div>
     <div class="section-title">Aylık sabit giderler</div>
     <div class="card">${sabit}<button class="btn soft pl-tam" data-act="sabitekle" type="button">＋ Sabit gider ekle</button></div>
     <div class="section-title">Yazılan giderler (${liste.length})</div>
     <div class="card">${rows}</div>`;
}
function giderHizliWire(sonra) { document.querySelectorAll("[data-gkat]").forEach((b) => { b.onclick = () => giderEkleModal(b.dataset.gkat, sonra); }); }
function mountGiderler() {
  giderHizliWire();
  document.querySelectorAll("[data-gsil]").forEach((b) => b.addEventListener("click", () => { if (!confirm("Bu gider silinsin mi?")) return; store.expenses = store.expenses.filter((x) => x.id !== b.dataset.gsil); saveStore(); render(); }));
  document.querySelectorAll("[data-sgsil]").forEach((b) => b.addEventListener("click", () => { if (!confirm("Bu sabit gider silinsin mi?")) return; store.sabitGiderler = sabitGiderler().filter((x) => x.id !== b.dataset.sgsil); saveStore(); render(); }));
  const se = document.querySelector('[data-act="sabitekle"]');
  if (se) se.addEventListener("click", () => formModal("Aylık Sabit Gider", [{ key: "ad", label: "Ne gideri? (ör. Telefon)", req: true }, { key: "tutar", label: "Her ay kaç ₺?", type: "number", step: "0.01", req: true }], null, (d) => {
    if (!(Number(d.tutar) > 0)) { alert("Tutarı yaz."); return; }
    store.sabitGiderler = sabitGiderler(); store.sabitGiderler.push({ id: genId(), ad: String(d.ad).trim(), tutar: kurus(d.tutar), baslangic: todayStr().slice(0, 7) });
    saveStore(); render();
  }));
}
/* Gün sonu: bugün satış var ama hiç gider yazılmamışsa hatırlat; oradan hızlıca yazılır. */
function giderHatirlatModal(devam) {
  const bugun = store.expenses.filter((e) => isToday(e.tarih) && !giderMalAlimiMi(e));
  const yazilan = bugun.map((e) => `<div class="pg-satir"><div class="pg-mid"><b>${esc(giderKategori(e))}</b></div><b class="pg-tut">${money.format(Number(e.tutar) || 0)}</b></div>`).join("");
  const m = openModal("Bugün gider var mı?", `
    ${bugun.length ? `<p class="hint">Bugün yazılan giderler:</p>${yazilan}<p class="hint" style="margin-top:10px">Başka varsa ekle:</p>` : `<p class="pl-soru">Bugün <b>hiç gider yazılmadı</b>. Yakıt, yemek gibi bir harcama olduysa şimdi yaz — yazılmazsa kâr olduğundan fazla görünür.</p>`}
    ${giderHizliHTML()}
    <button class="btn ${bugun.length ? "green" : "soft"} lg pl-tam" id="ghBitir" type="button">${bugun.length ? "Tamam, günü bitir" : "Gider yok, günü bitir"}</button>`, {
    noFoot: true,
    onMount: (ov) => {
      ov.querySelectorAll("[data-gkat]").forEach((b) => { b.onclick = () => {
        m.close();
        const g = giderEkleModal(b.dataset.gkat, () => giderHatirlatModal(devam));
        // Gider penceresinden vazgeçilirse (İptal / ✕ / dışına dokunma) soru kaybolmasın, geri gelsin.
        const geri = () => setTimeout(() => { if (!document.querySelector(".modal-overlay")) giderHatirlatModal(devam); }, 0);
        g.ov.querySelectorAll(".x, .close").forEach((x) => x.addEventListener("click", geri));
        g.ov.addEventListener("click", (e) => { if (e.target === g.ov) geri(); });
      }; });
      ov.querySelector("#ghBitir").onclick = () => { m.close(); devam(); };
    },
  });
}

/* ============ FİRMALAR ============ */
function renderFirmalar() {
  const toplam = store.firmalar.reduce((s, f) => s + firmaBorc(f.id), 0);
  const rows = store.firmalar.map((f, i) => { const borc = firmaBorc(f.id); const alis = store.purchases.filter((p) => p.firmaId === f.id).reduce((s, p) => s + p.toplam, 0); const ode = store.firmaPayments.filter((p) => p.firmaId === f.id).reduce((s, p) => s + p.tutar, 0); return `<tr><td>${i + 1}</td><td>${esc(f.ad)}</td><td>${money.format(alis)}</td><td>${money.format(ode)}</td><td class="${borc > 0 ? "borc-red" : ""}">${money.format(borc)}</td><td><div class="act-btns"><button class="edit" data-fode="${f.id}">Ödeme Yap</button><button class="del" data-delf="${f.id}">Sil</button></div></td></tr>`; }).join("");
  return pageHead("Firmalar", "Tüm firmalara kalan borcunuz: " + money.format(toplam), [{ label: "＋ Yeni Firma Oluştur", act: "yenifirma" }]) +
    tableCard(["Sıra", "Firma Adı", "Toplam Alış", "Toplam Ödeme", "Kalan Borç", "İşlem"], rows, infoLine(store.firmalar.length));
}
function mountFirmalar() {
  const y = document.querySelector('[data-act="yenifirma"]'); if (y) y.addEventListener("click", () => formModal("Yeni Firma", [{ key: "ad", label: "Firma Adı", req: true }, { key: "telefon", label: "Telefon" }], null, (d) => { store.firmalar.push(Object.assign({ id: genId() }, d)); saveStore(); render(); }));
  document.querySelectorAll("[data-delf]").forEach((b) => b.addEventListener("click", () => { const f = findFirma(b.dataset.delf); if (f && confirm(`"${f.ad}" silinsin mi?`)) { store.firmalar = store.firmalar.filter((x) => x.id !== f.id); saveStore(); render(); } }));
  document.querySelectorAll("[data-fode]").forEach((b) => b.addEventListener("click", () => { const f = findFirma(b.dataset.fode); const borc = firmaBorc(f.id); openModal(`Ödeme Yap — ${esc(f.ad)}`, `<p class="sub">Kalan borç: <strong>${money.format(borc)}</strong></p><div class="field"><label>Ödeme (₺) *</label><input id="fTut" type="number" inputmode="decimal" step="0.01" value="${borc > 0 ? borc : ""}" /></div><div class="field"><label>Nasıl ödedin?</label>${stkSecim("fTur", [["nakit", "Nakit"], ["kart", "Kart"], ["havale", "Havale"]], "nakit")}</div>`, { onMount: (ov) => stkSecimBagla(ov, "fTur"), okLabel: "Ödemeyi Kaydet", onOk: (ov) => { const t = Number(ov.querySelector("#fTut").value); if (!t || t <= 0) { alert("Geçerli tutar."); return false; } store.firmaPayments.push({ id: genId(), firmaId: f.id, tutar: t, odemeTuru: ov.querySelector("#fTur").value, tarih: new Date().toISOString() }); saveStore(); render(); } }); }));
  wireTableSearch();
}

/* ============ ALIŞ FATURALARI ============ */
function alisOdemeAd(p) { return p.odeme === "veresiye" ? "Veresiye" : "Peşin" + (p.odemeTuru ? " · " + ({ nakit: "Nakit", kart: "Kart", havale: "Havale" }[p.odemeTuru] || p.odemeTuru) : ""); }
function renderAlisFaturalari() {
  const liste = store.purchases.slice().sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
  const rows = liste.map((p, i) => { const f = p.firmaId && findFirma(p.firmaId); return `<tr><td>${i + 1}</td><td>${esc(p.no || "-")}</td><td>${fmtDateShort(p.tarih)}</td><td>${f ? esc(f.ad) : "-"}</td><td>${stkHavuzAd(p.hedef)}</td><td>${alisOdemeAd(p)}</td><td>${num2.format((p.items || []).reduce((a, it) => a + (Number(it.adet) || 0), 0))}</td><td>${money.format(Number(p.toplam) || 0)}</td><td><button class="btn softred" data-delp="${p.id}">Sil</button></td></tr>`; }).join("");
  return pageHead("Alış Faturaları", store.purchases.length + " fatura", [{ label: "＋ Yeni oluştur", route: "alis-olustur" }]) +
    tableCard(["Sıra", "Fatura No", "Fatura Tarihi", "Firma", "Mal Nereye Girdi", "Ödeme", "Toplam Ürün", "Toplam Tutar", "İşlem"], rows, infoLine(store.purchases.length));
}
function mountAlisFaturalari() {
  document.querySelectorAll("[data-delp]").forEach((b) => b.addEventListener("click", () => {
    const p = store.purchases.find((x) => x.id === b.dataset.delp);
    if (p && confirm("Fatura silinsin mi?\nMal " + stkHavuzAd(p.hedef).toLocaleUpperCase("tr-TR") + " stoğundan geri alınır.")) { stkAlimSil(store, p.id); saveStore(); render(); }
  }));
  wireTableSearch();
}
let alisRows = [];
function alisBosSatir() { return { urunId: "", ad: "", adet: 1, birimFiyat: 0 }; }
function renderAlisOlustur() {
  alisRows = [alisBosSatir()];
  const firmaOpts = `<option value="">Firmasız</option>` + store.firmalar.map((f) => `<option value="${f.id}">${esc(f.ad)}</option>`).join("") + `<option value="__yeni">＋ Yeni firma…</option>`;
  return pageHead("Alış Faturası Oluştur", null, [{ label: "Faturalar", cls: "soft", route: "alis-faturalari" }]) +
    `<div class="card stk-form">
      <div class="field"><label>Mal nereye girdi?</label>${stkSecim("aHedef", [["dukkan", "🏪 Dükkana"], ["arac", "🚚 Araca"]], stokModu === "arac" ? "arac" : "dukkan")}</div>
      <div class="field"><label>Firma</label><select id="aFirma">${firmaOpts}</select><input id="aFirmaYeni" placeholder="Yeni firmanın adı" style="display:none;margin-top:6px" /></div>
      <div class="stk-iki"><div class="field"><label>Fatura No</label><input id="aNo" placeholder="isteğe bağlı" /></div><div class="field"><label>Fatura Tarihi</label><input id="aTarih" type="date" value="${todayStr()}" /></div></div>
      <div class="field"><label>Ödeme</label>${stkSecim("aOdeme", [["pesin", "Peşin ödedim"], ["veresiye", "Veresiye (borç)"]], "pesin")}</div>
      <div class="field" id="aTurKutu"><label>Nasıl ödedin?</label>${stkSecim("aOdemeTuru", [["nakit", "Nakit"], ["kart", "Kart"], ["havale", "Havale"]], "nakit")}</div>
    </div>
    <div class="card stk-form">
      <div class="section-title" style="margin-top:0">Alınan ürünler</div>
      <div id="aBody"></div>
      <button class="btn soft" id="aAddRow" type="button" style="width:100%;justify-content:center">＋ Ürün ekle</button>
      <p class="hint">Listeden ürün seçersen o ürünün stoğu artar ve alış fiyatı güncellenir. "Listede yok" seçersen faturaya yazılır ama stok tutulmaz.</p>
      <div class="field"><label>Faturada yazan toplam (boş bırakırsan satırların toplamı)</label><input id="aFisToplam" type="number" inputmode="decimal" step="0.01" placeholder="örn. 20567,50" /></div>
      <div class="stk-toplam"><span>Genel Toplam</span><b id="aTotal">₺0,00</b></div>
      <p class="hint" id="aFark" style="display:none"></p>
      <button class="btn green lg" id="aSave" type="button" style="width:100%;justify-content:center;margin-top:10px">💾 Alış Faturasını Kaydet</button>
    </div>`;
}
function alisRowHTML(r, i) {
  const opts = `<option value="">— listede yok (yeni ürün) —</option>` + store.products.map((p) => `<option value="${p.id}" ${r.urunId === p.id ? "selected" : ""}>${esc(p.ad)}</option>`).join("");
  return `<div class="stk-alis-satir">
    <div class="stk-yan"><select data-ar="${i}" data-fld="urunId">${opts}</select><button class="rm" data-armv="${i}" type="button" aria-label="Satırı sil">✕</button></div>
    ${r.urunId ? "" : `<input data-ar="${i}" data-fld="ad" placeholder="Ürün adı" value="${esc(r.ad)}" />`}
    <div class="stk-uc"><label>Miktar<input data-ar="${i}" data-fld="adet" type="number" inputmode="decimal" step="0.01" value="${r.adet}" /></label><label>Birim fiyat (₺)<input data-ar="${i}" data-fld="birimFiyat" type="number" inputmode="decimal" step="0.01" value="${r.birimFiyat}" /></label><span class="stk-tutar" data-artut="${i}">${money.format((Number(r.adet) || 0) * (Number(r.birimFiyat) || 0))}</span></div>
  </div>`;
}
function alisToplamYaz() {
  const kalem = kurus(alisRows.reduce((s, r) => s + (Number(r.adet) || 0) * (Number(r.birimFiyat) || 0), 0));
  const fis = stkOkuSayi((document.getElementById("aFisToplam") || {}).value);
  alisRows.forEach((r, i) => { const el = document.querySelector(`[data-artut="${i}"]`); if (el) el.textContent = money.format((Number(r.adet) || 0) * (Number(r.birimFiyat) || 0)); });
  document.getElementById("aTotal").textContent = money.format(isNaN(fis) ? kalem : fis);
  const fark = document.getElementById("aFark");
  if (fark) { const var_ = !isNaN(fis) && Math.abs(fis - kalem) > 0.005; fark.style.display = var_ ? "" : "none"; if (var_) fark.textContent = "Satırların toplamı " + money.format(kalem) + " · fark " + money.format(kurus(fis - kalem)) + " (KDV / iskonto olabilir). Kayda faturadaki toplam yazılır."; }
}
function alisRefresh() {
  document.getElementById("aBody").innerHTML = alisRows.map(alisRowHTML).join("");
  alisToplamYaz();
  /* Miktar/fiyat yazarken satırlar yeniden çizilmez (odak kaybolmasın); yalnız ürün değişince çizilir. */
  document.querySelectorAll("[data-ar]").forEach((el) => el.addEventListener("input", () => {
    const i = Number(el.dataset.ar), fld = el.dataset.fld; alisRows[i][fld] = el.value;
    if (fld === "urunId") { const pr = findProduct(el.value); if (pr && !Number(alisRows[i].birimFiyat)) alisRows[i].birimFiyat = Number(pr.alis) || 0; alisRefresh(); return; }
    alisToplamYaz();
  }));
  document.querySelectorAll("[data-armv]").forEach((b) => b.addEventListener("click", () => { alisRows.splice(Number(b.dataset.armv), 1); if (!alisRows.length) alisRows.push(alisBosSatir()); alisRefresh(); }));
}
/* ---- Metin normalleştirme + ürün eşleştirme (serbest yazılan siparişi ürüne bağlar) ---- */
function ocrNorm(s) {
  return String(s || "").toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i").replace(/[şŞ]/g, "s").replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u").replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
// Serbest sipariş kelimesini ürüne eşle — MÜŞTERİ GEÇMİŞİNE göre (ör. "sade soda" → o müşterinin hep aldığı marka)
function musteriUrunSecim(keyword, musteriId) {
  let n = ocrNorm(keyword);
  if (!n) return "";
  n = n.replace(/kola/g, "cola").replace(/mesrubat/g, "").trim(); // sinonim (kola=cola)
  if (!n) return "";
  let adaylar = store.products.filter((p) => p.gorunur !== false && ocrNorm(p.ad).includes(n));
  if (!adaylar.length) {
    const kel = n.split(/\s+/).filter(Boolean);
    if (kel.length) adaylar = store.products.filter((p) => p.gorunur !== false && kel.every((k) => ocrNorm(p.ad).includes(k)));
  }
  if (!adaylar.length) return ocrMatch(keyword, store.products, "ad"); // yedek: genel eşleşme
  if (adaylar.length === 1) return adaylar[0].id;
  // Bu müşterinin geçmişinde en çok aldığı aday öne
  if (musteriId) {
    const say = {};
    store.sales.forEach((s) => { if (s.musteriId === musteriId) s.items.forEach((it) => { say[it.urunId] = (say[it.urunId] || 0) + (Number(it.adet) || 0); }); });
    const sirali = adaylar.slice().sort((a, b) => (say[b.id] || 0) - (say[a.id] || 0));
    if ((say[sirali[0].id] || 0) > 0) return sirali[0].id;
  }
  // Geçmiş yoksa: ana ürün (öne çıkan) tercih, yoksa ilk aday
  const ana = adaylar.find((p) => p.anaUrun);
  return (ana || adaylar[0]).id;
}
function ocrMatch(name, list, key) {
  const n = ocrNorm(name);
  if (!n) return "";
  let best = "", score = 0;
  for (const it of list) {
    const m = ocrNorm(it[key]);
    let s = 0;
    if (m === n) s = 100;
    else if (m.includes(n) || n.includes(m)) s = 60;
    else { const nt = new Set(n.split(" ")); s = m.split(" ").filter((t) => nt.has(t)).length * 20; }
    if (s > score) { score = s; best = it.id; }
  }
  return score >= 20 ? best : "";
}
function mountAlisOlustur() {
  alisRefresh();
  stkSecimBagla(document, "aHedef");
  stkSecimBagla(document, "aOdemeTuru");
  stkSecimBagla(document, "aOdeme", (v) => { document.getElementById("aTurKutu").style.display = v === "veresiye" ? "none" : ""; });
  const firmaSel = document.getElementById("aFirma"), firmaYeni = document.getElementById("aFirmaYeni");
  firmaSel.addEventListener("change", () => { firmaYeni.style.display = firmaSel.value === "__yeni" ? "" : "none"; if (firmaSel.value === "__yeni") firmaYeni.focus(); });
  document.getElementById("aFisToplam").addEventListener("input", alisToplamYaz);
  document.getElementById("aAddRow").addEventListener("click", () => { alisRows.push(alisBosSatir()); alisRefresh(); });
  document.getElementById("aSave").addEventListener("click", () => {
    const items = alisRows.filter((r) => (r.urunId || (r.ad || "").trim()) && Number(r.adet) > 0).map((r) => ({ urunId: r.urunId || null, ad: r.urunId ? (findProduct(r.urunId) || {}).ad : (r.ad || "").trim(), adet: Number(r.adet), birimFiyat: Number(r.birimFiyat) || 0 }));
    if (!items.length) { alert("En az bir ürün satırı girin."); return; }
    const odeme = document.getElementById("aOdeme").value === "veresiye" ? "veresiye" : "pesin";
    let firmaId = firmaSel.value || null;
    if (firmaId === "__yeni") {
      const ad = firmaYeni.value.trim();
      if (!ad) { alert("Yeni firmanın adını yazın."); return; }
      const var_ = store.firmalar.find((f) => f.ad.trim().toLocaleLowerCase("tr") === ad.toLocaleLowerCase("tr"));
      if (var_) firmaId = var_.id; else { const f = { id: genId(), ad, telefon: "" }; store.firmalar.push(f); firmaId = f.id; }
    }
    if (odeme === "veresiye" && !firmaId) { alert("Veresiye alışta borcun kime yazılacağı belli olmalı — firma seçin."); return; }
    const fis = stkOkuSayi(document.getElementById("aFisToplam").value);
    if (!isNaN(fis) && fis < 0) { alert("Faturadaki toplam eksi olamaz."); return; }
    const tarihStr = document.getElementById("aTarih").value;
    const sonuc = stkAlimKaydet(store, {
      hedef: document.getElementById("aHedef").value, odeme, odemeTuru: document.getElementById("aOdemeTuru").value, firmaId,
      no: document.getElementById("aNo").value, tarih: tarihStr ? new Date(tarihStr + "T12:00:00").toISOString() : new Date().toISOString(),
      toplam: isNaN(fis) ? null : fis, items,
    }, stkA());
    saveStore();
    const etki = stkMarjEtki(store, sonuc.degisen);
    if (!etki.length) alert("Alış faturası kaydedildi ✔\n" + stkHavuzAd(sonuc.kayit.hedef) + " stoğuna eklendi.");
    navigate("alis-faturalari");            // önce formdan çık: uyarı penceresi nasıl kapatılırsa kapatılsın aynı fatura ikinci kez kaydedilemesin
    stkMarjUyariGoster(etki);
  });
}

/* ============ STOK SAYIMI ============ */
function sayimHavuz(s) { return s && s.havuz === "arac" ? "arac" : "dukkan"; }   // eski sayımlarda alan yok → dükkan
function renderStokSayimi() {
  const rows = store.stokSayimlari.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.kod)}</td><td>${esc(s.ad || "-")}</td><td>${stkHavuzAd(sayimHavuz(s))}</td><td>${s.durum === "acik" ? '<span class="badge">Açık</span>' : '<span style="color:var(--green-d)">✔ Tamamlandı</span>'}</td><td>${fmtDateShort(s.tarih)}</td><td>${s.items ? s.items.filter((it) => it.sayilan !== "" && it.sayilan != null).length : 0}</td><td><div class="act-btns"><button class="edit" data-sayim="${s.id}">${s.durum === "acik" ? "Devam Et" : "Görüntüle"}</button><button class="del" data-delsayim="${s.id}">Sil</button></div></td></tr>`).join("");
  const eksi = stkEksiler(store), eD = eksi.filter((e) => e.havuz === "dukkan").length, eA = eksi.filter((e) => e.havuz === "arac").length;
  return pageHead("Stok Sayımları", store.stokSayimlari.length + " stok sayımı") +
    `<div class="stk-dugmeler buyuk"><button class="btn lg" type="button" data-act="sayDukkan">🏪 Dükkanı Say</button><button class="btn lg" type="button" data-act="sayArac">🚚 Aracı Say</button></div>` +
    (eksi.length ? `<div class="stk-uyari"><b>⚠ Stok eksi görünen ürünler var</b><span>Dükkanda ${eD}, araçta ${eA} üründe kayıtlı stok sıfırın altında. Stok eksi olamaz; mal girişi yazılmadan satış yapıldığı için birikmiş. Sayım yaparak gerçek miktarı girin ya da hepsini sıfırlayın.</span><button class="btn soft" type="button" data-act="eksiSifirla">Eksi stokları sıfırla (${eksi.length})</button></div>` : "") +
    tableCard(["Sıra", "Sayım Kodu", "Sayım Adı", "Nerede", "Durum", "Tarih", "Sayılan Ürün", "Detay"], rows, infoLine(store.stokSayimlari.length));
}
function sayimBaslat(havuz) {
  store.counters.sayim = (store.counters.sayim || 0) + 1;
  const alan = havuz === "arac" ? "aracStok" : "stok";
  const s = { id: genId(), kod: "STC" + String(store.counters.sayim).padStart(6, "0"), ad: stkHavuzAd(havuz) + " sayımı " + store.counters.sayim, durum: "acik", havuz, items: store.products.map((p) => ({ urunId: p.id, sistem: Number(p[alan]) || 0, sayilan: "" })), tarih: new Date().toISOString() };
  store.stokSayimlari.push(s); saveStore(); activeSayimId = s.id; navigate("stok-sayimi-detay");
}
function eksiSifirlaModal() {
  const eksi = stkEksiler(store).sort((a, b) => a.miktar - b.miktar);
  if (!eksi.length) { alert("Eksi stok yok."); return; }
  const rows = eksi.map((e) => `<div class="stk-satir"><div class="stk-s-sol"><b>${esc(e.p.ad)}</b><span>${stkHavuzAd(e.havuz)} stoğu</span></div><div class="stk-s-sag genis"><b class="dustu">${stkAdet(e.miktar)} → 0</b></div></div>`).join("");
  openModal("Eksi stokları sıfırla", `<p class="hint" style="margin:0 0 10px">Aşağıdaki ${eksi.length} stok <b>0</b> yapılacak. Elinde gerçekten mal olan ürünleri sonra sayımla düzeltebilirsin.</p><div class="stk-liste">${rows}</div>`, {
    okLabel: "Hepsini 0 yap",
    onOk: () => { const y = stkStokYaz(store, stkEksiler(store).map((e) => ({ urunId: e.p.id, havuz: e.havuz, yeni: 0 })), Object.assign(stkA(), { tur: "Eksi Stok Sıfırlama" })); saveStore(); alert(y.length + " eksi stok sıfırlandı ✔"); render(); },
  });
}
function mountStokSayimi() {
  const d = document.querySelector('[data-act="sayDukkan"]'); if (d) d.addEventListener("click", () => sayimBaslat("dukkan"));
  const a = document.querySelector('[data-act="sayArac"]'); if (a) a.addEventListener("click", () => sayimBaslat("arac"));
  const e = document.querySelector('[data-act="eksiSifirla"]'); if (e) e.addEventListener("click", eksiSifirlaModal);
  document.querySelectorAll("[data-sayim]").forEach((b) => b.addEventListener("click", () => { activeSayimId = b.dataset.sayim; navigate("stok-sayimi-detay"); }));
  document.querySelectorAll("[data-delsayim]").forEach((b) => b.addEventListener("click", () => { if (confirm("Sayım silinsin mi?")) { store.stokSayimlari = store.stokSayimlari.filter((x) => x.id !== b.dataset.delsayim); saveStore(); render(); } }));
  wireTableSearch();
}
let activeSayimId = null;
let sayimSuzgec = "hepsi";
/* Sayım sırası: son 90 günde satılanlar (çok satılan önce), sonra diğerleri ada göre. */
function sayimSirasi(s) {
  const bas = new Date(Date.now() - 90 * 86400000).toISOString(), sat = {};
  store.sales.forEach((x) => { if (x.tarih >= bas) (x.items || []).forEach((it) => { if (it.urunId) sat[it.urunId] = (sat[it.urunId] || 0) + (Number(it.adet) || 0); }); });
  return s.items.map((it, i) => ({ it, i, pr: findProduct(it.urunId) })).filter((x) => x.pr).sort((a, b) => (sat[b.it.urunId] || 0) - (sat[a.it.urunId] || 0) || (a.pr.ad || "").localeCompare(b.pr.ad || "", "tr")).map((x) => Object.assign(x, { satilan: sat[x.it.urunId] || 0 }));
}
function renderStokSayimiDetay() {
  const s = store.stokSayimlari.find((x) => x.id === activeSayimId);
  if (!s) return pageHead("Stok Sayımı") + `<div class="card"><p class="sub">Sayım bulunamadı.</p></div>`;
  const havuz = sayimHavuz(s);
  if (s.durum !== "acik") {
    const rows = s.items.filter((it) => it.sayilan !== "" && it.sayilan != null).map((it, i) => { const pr = findProduct(it.urunId); const fark = Number(it.sayilan) - it.sistem; return `<tr><td>${i + 1}</td><td>${pr ? esc(pr.ad) : "?"}</td><td>${num2.format(it.sistem)}</td><td>${num2.format(Number(it.sayilan) || 0)}</td><td class="${fark < 0 ? "borc-red" : ""}">${num2.format(fark)}</td></tr>`; }).join("");
    return pageHead("Stok Sayımı — " + esc(s.kod), stkHavuzAd(havuz) + " · tamamlandı", [{ label: "Geri", cls: "soft", route: "stok-sayimi" }]) + tableCard(["Sıra", "Ürün", "Kayıtlı Stok", "Sayılan", "Fark"], rows, "");
  }
  const sira = sayimSirasi(s);
  const sayilan = s.items.filter((it) => it.sayilan !== "" && it.sayilan != null).length;
  let ayrac = false;
  const rows = sira.map((x) => {
    const bas = !ayrac && !(x.satilan > 0) ? (ayrac = true, `<div class="stk-grup">Son 3 ayda satılmayanlar</div>`) : "";
    return bas + `<div class="stk-say-satir ${x.it.sayilan !== "" && x.it.sayilan != null ? "tamam" : ""}" data-ara="${esc(ocrNorm(x.pr.ad))}" data-eksi="${x.it.sistem < 0 ? 1 : 0}" data-sayrow="${x.i}">
      <div class="stk-s-sol"><b>${esc(x.pr.ad)}</b><span>Kayıtlı: <i class="${x.it.sistem < 0 ? "eksi" : ""}">${num2.format(x.it.sistem)}</i> ${esc(x.pr.birim || "Adet")}</span></div>
      <div class="stk-adim"><button type="button" data-sayeksi="${x.i}" aria-label="Azalt">−</button><input type="number" inputmode="decimal" step="0.01" data-say="${x.i}" value="${x.it.sayilan}" placeholder="say" /><button type="button" data-sayarti="${x.i}" aria-label="Artır">＋</button></div>
    </div>`;
  }).join("");
  return pageHead(stkHavuzAd(havuz) + " Sayımı", esc(s.kod), [{ label: "Vazgeç", cls: "soft", route: "stok-sayimi" }]) +
    `<div class="stk-say-ust"><input id="sayAra" class="stk-ara" placeholder="Ürün ara…" />
      <div class="stk-cipler">${[["hepsi", "Hepsi"], ["kalan", "Sayılmayan"], ["eksi", "Stoğu eksi"]].map((c) => `<button type="button" class="stk-cip ${sayimSuzgec === c[0] ? "on" : ""}" data-saysuz="${c[0]}">${c[1]}</button>`).join("")}</div></div>
    <p class="hint" style="margin:0 2px 8px">${havuz === "arac" ? "Araçtaki" : "Dükkandaki"} gerçek miktarı yazın. Boş bıraktığınız ürün değişmez; "hiç yok" için 0 yazın.</p>
    <div class="stk-liste" id="sayListe">${rows}</div>
    <div class="stk-say-alt"><span id="sayDurum">${sayilan} / ${sira.length} sayıldı</span><button class="btn green lg" type="button" data-act="tamamla">✔ Sayımı Bitir</button></div>`;
}
function mountStokSayimiDetay() {
  const s = store.stokSayimlari.find((x) => x.id === activeSayimId); if (!s || s.durum !== "acik") return;
  const havuz = sayimHavuz(s), alan = havuz === "arac" ? "aracStok" : "stok";
  const yaz = (i, deger) => {
    s.items[i].sayilan = deger; saveStore();
    const satir = document.querySelector(`[data-sayrow="${i}"]`); if (satir) satir.classList.toggle("tamam", deger !== "");
    document.getElementById("sayDurum").textContent = s.items.filter((it) => it.sayilan !== "" && it.sayilan != null).length + " / " + document.querySelectorAll("[data-sayrow]").length + " sayıldı";
  };
  document.querySelectorAll("[data-say]").forEach((el) => el.addEventListener("input", () => yaz(Number(el.dataset.say), el.value)));
  const adim = (i, fark) => { const el = document.querySelector(`[data-say="${i}"]`); const v = el.value === "" ? (fark > 0 ? 1 : 0) : Math.max(0, kurus((Number(el.value) || 0) + fark)); el.value = v; yaz(i, String(v)); };
  document.querySelectorAll("[data-sayarti]").forEach((b) => b.addEventListener("click", () => adim(Number(b.dataset.sayarti), 1)));
  document.querySelectorAll("[data-sayeksi]").forEach((b) => b.addEventListener("click", () => adim(Number(b.dataset.sayeksi), -1)));
  const ara = document.getElementById("sayAra");
  const suz = () => {
    const q = ocrNorm(ara.value);
    document.querySelectorAll("[data-sayrow]").forEach((r) => {
      const uy = r.dataset.ara.includes(q) && (sayimSuzgec === "hepsi" || (sayimSuzgec === "kalan" && !r.classList.contains("tamam")) || (sayimSuzgec === "eksi" && r.dataset.eksi === "1"));
      r.style.display = uy ? "" : "none";
    });
  };
  ara.addEventListener("input", suz);
  document.querySelectorAll("[data-saysuz]").forEach((b) => b.addEventListener("click", () => { sayimSuzgec = b.dataset.saysuz; document.querySelectorAll("[data-saysuz]").forEach((x) => x.classList.toggle("on", x === b)); suz(); }));
  suz();
  const t = document.querySelector('[data-act="tamamla"]');
  if (t) t.addEventListener("click", () => {
    const girilen = s.items.filter((it) => it.sayilan !== "" && it.sayilan != null && findProduct(it.urunId));
    if (!girilen.length) { alert("Henüz hiçbir ürün sayılmadı."); return; }
    const degisecek = girilen.filter((it) => (Number(findProduct(it.urunId)[alan]) || 0) !== Number(it.sayilan)).length;
    if (!confirm(girilen.length + " ürün sayıldı, " + degisecek + " tanesinin " + stkHavuzAd(havuz).toLocaleLowerCase("tr-TR") + " stoğu değişecek.\nSayılan miktarlar stok olarak yazılsın mı? (boş bırakılanlar değişmez)")) return;
    stkStokYaz(store, girilen.map((it) => ({ urunId: it.urunId, havuz, yeni: Number(it.sayilan) })), stkA());
    s.durum = "kapali"; saveStore(); navigate("stok-sayimi");
  });
}

/* ============ STOK · FİYAT · SİPARİŞ (ortak hesaplar + yeni ekranlar) ============ */
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

/* ---- panel tarafı küçük yardımcılar ---- */
function stkA() { return { id: genId, tarih: new Date().toISOString() }; }
function stkHavuzAd(h) { return h === "arac" ? "Araç" : "Dükkan"; }
/* İki-üç seçenekli büyük düğme grubu (telefonda açılır liste yerine). Seçim gizli bir <input id>'de durur. */
function stkSecim(id, secenekler, secili) {
  return `<div class="stk-sec" data-sec="${id}"><input type="hidden" id="${id}" value="${esc(secili)}" />${secenekler.map((s) => `<button type="button" class="stk-sec-b ${String(s[0]) === String(secili) ? "on" : ""}" data-v="${esc(s[0])}">${s[1]}</button>`).join("")}</div>`;
}
function stkSecimBagla(kok, id, cb) {
  const kutu = (kok || document).querySelector(`[data-sec="${id}"]`); if (!kutu) return;
  kutu.querySelectorAll(".stk-sec-b").forEach((b) => b.addEventListener("click", () => {
    kutu.querySelectorAll(".stk-sec-b").forEach((x) => x.classList.toggle("on", x === b));
    kutu.querySelector("input").value = b.dataset.v;
    if (cb) cb(b.dataset.v);
  }));
}
function stkOkuSayi(v) { return v === "" || v == null ? NaN : Number(String(v).replace(",", ".")); }
/* Metni paylaş: telefonun paylaş menüsü; yoksa kopyala / WhatsApp penceresi. */
async function stkPaylas(baslik, metin) {
  if (navigator.share) { try { await navigator.share({ title: baslik, text: metin }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  openModal(baslik, `<textarea id="stkPayMetin" class="stk-metin" readonly>${esc(metin)}</textarea>
    <div class="stk-dugmeler"><button class="btn ok" id="stkPayKopya" type="button">📋 Kopyala</button><button class="btn soft" id="stkPayWa" type="button">📲 WhatsApp</button></div>`, {
    noFoot: true,
    onMount: (ov) => {
      const ta = ov.querySelector("#stkPayMetin");
      ov.querySelector("#stkPayKopya").onclick = async () => { try { await navigator.clipboard.writeText(metin); alert("Kopyalandı ✔"); } catch (e) { ta.focus(); ta.select(); try { document.execCommand("copy"); alert("Kopyalandı ✔"); } catch (e2) { alert("Kopyalanamadı — metni elle seçip kopyalayın."); } } };
      ov.querySelector("#stkPayWa").onclick = () => window.open("https://wa.me/?text=" + encodeURIComponent(metin), "_blank");
    },
  });
}
/* Kârı eşiğin altına düşenleri gösteren pencere. Liste boşsa hiçbir şey açmaz, doğrudan `sonra` çalışır. */
function stkMarjUyariGoster(etki, sonra) {
  if (!etki || !etki.length) { if (sonra) sonra(); return; }
  const esik = stkMarjEsik(store);
  const html = etki.map((x) => `<div class="stk-uy-urun"><b>${esc(x.p.ad)}</b>
      <div class="stk-uy-satir ${x.zarar ? "kotu" : x.dusuk ? "az" : ""}"><span>Alış ${money.format(x.alis)} · liste ${money.format(x.satis)}</span><b>${x.zarar ? "ZARAR" : "kâr " + stkYuzde(x.marj)}</b></div>
      ${x.musteriler.map((m) => `<div class="stk-uy-satir ${m.fiyat <= x.alis ? "kotu" : "az"}"><span>${esc(m.c.ad)} — özel fiyat ${money.format(m.fiyat)}</span><b>${m.fiyat <= x.alis ? "ZARAR" : "kâr " + stkYuzde(m.marj)}</b></div>`).join("")}
    </div>`).join("");
  const m = openModal("⚠ Kârı düşen fiyatlar", `<p class="hint" style="margin:0 0 10px">Alış fiyatı değişti. Aşağıdakilerin kârı <b>${stkYuzde(esik)}</b> altına düştü — satış fiyatını ya da müşterinin özel fiyatını gözden geçir.</p>${html}
    <div class="stk-dugmeler"><button class="btn ok" type="button" id="stkUyTamam">Anladım</button><button class="btn soft" type="button" id="stkUyBak">Fiyat Bakımına Git</button></div>`, { noFoot: true, onMount: (ov) => {
    ov.querySelector("#stkUyTamam").onclick = () => { m.close(); if (sonra) sonra(); };
    ov.querySelector("#stkUyBak").onclick = () => { m.close(); navigate("fiyat-bakim"); };
    ov.querySelector(".x").addEventListener("click", () => { if (sonra) sonra(); });
  } });
}

/* ============ ALINACAKLAR + kritik seviye önerisi ============ */
let alinacakAyar = { hafta: 6, hedefHafta: 2 };
function stkEksiUyariHTML() {
  const n = new Set(stkEksiler(store).map((e) => e.p.id)).size;
  if (!n) return "";
  return `<div class="stk-uyari"><b>⚠ Bu liste henüz güvenilir değil</b><span>${n} üründe kayıtlı stok eksi görünüyor (mal girişi yazılmamış). Önce sayım yapıp stoğu düzeltin.</span><button class="btn soft" type="button" data-goto="stok-sayimi">Stok Sayımına Git</button></div>`;
}
function renderAlinacaklar() {
  const r = stkAlinacaklar(store, alinacakAyar);
  const oneri = stkKritikOneri(store, { hafta: alinacakAyar.hafta });
  let grup = null, rows = "";
  r.satirlar.forEach((x) => {
    const g = x.p.grup || "Diğer";
    if (g !== grup) { grup = g; rows += `<div class="stk-grup">${esc(g)}</div>`; }
    rows += `<div class="stk-satir ${x.eksi ? "eksi" : ""}"><div class="stk-s-sol"><b>${esc(x.p.ad)}</b><span>${x.haftalik > 0 ? "Haftada ~" + stkAdet(Math.round(x.haftalik * 10) / 10) + " satılıyor · " : ""}dükkan ${stkAdet(x.dukkan)} · araç ${stkAdet(x.arac)}${x.eksi ? " · <em>stok eksi</em>" : ""}</span></div><div class="stk-s-sag"><b>${stkAdet(x.oneri)}</b><span>${esc(x.p.birim || "Adet")}</span></div></div>`;
  });
  const hSec = (id, deger, secenekler) => `<select id="${id}">${secenekler.map((n) => `<option value="${n}" ${n === deger ? "selected" : ""}>${n} hafta</option>`).join("")}</select>`;
  return pageHead("Alınacaklar", r.satirlar.length ? r.satirlar.length + " ürün azaldı" : "Azalan ürün yok", [{ label: "📤 Listeyi Paylaş", act: "alPaylas" }]) +
    stkEksiUyariHTML() +
    `<div class="card stk-ayar"><div class="field"><label>Elde kaç haftalık mal dursun?</label>${hSec("alHedef", r.hedefHafta, [1, 2, 3, 4])}</div><div class="field"><label>Satış hızı (son kaç hafta)</label>${hSec("alHafta", r.hafta, [4, 6, 8])}</div></div>` +
    (r.satirlar.length ? `<div class="stk-liste" id="alListe">${rows}</div><div class="stk-toplam"><span>Tahmini tutar (alış fiyatıyla)</span><b>${money.format(r.tutar)}</b></div>` : `<div class="card"><p class="sub">Dükkan ve araçtaki mal ${r.hedefHafta} haftalık satışa yetiyor görünüyor 👍</p></div>`) +
    `<div class="card stk-kritik"><div><b>Uyarı (kritik) seviyeleri</b><p class="hint">Bir ürün bu seviyeye inince üstteki zilde görünür. Satış hızına göre ${oneri.length ? `<b>${oneri.length} ürün</b> için öneri var.` : "önerilecek değişiklik yok."}</p></div>${oneri.length ? `<button class="btn" type="button" id="alKritik">Önerileri Gör</button>` : ""}</div>`;
}
function mountAlinacaklar() {
  const h = document.getElementById("alHedef"), w = document.getElementById("alHafta");
  if (h) h.onchange = () => { alinacakAyar.hedefHafta = Number(h.value) || 2; render(); };
  if (w) w.onchange = () => { alinacakAyar.hafta = Number(w.value) || 6; render(); };
  const p = document.querySelector('[data-act="alPaylas"]');
  if (p) p.addEventListener("click", () => stkPaylas("Alınacaklar", stkAlinacakMetin(stkAlinacaklar(store, alinacakAyar), (store.settings.firmaAdi || "") + " — Alınacaklar")));
  const k = document.getElementById("alKritik"); if (k) k.addEventListener("click", kritikOneriModal);
}
function kritikOneriModal() {
  const liste = stkKritikOneri(store, { hafta: alinacakAyar.hafta });
  const bos = liste.filter((x) => x.eski == null).length;
  const rows = liste.map((x) => `<div class="stk-satir"><div class="stk-s-sol"><b>${esc(x.p.ad)}</b><span>Haftada ~${stkAdet(Math.round(x.haftalik * 10) / 10)} satılıyor · şimdiki seviye ${x.eski == null ? "yok" : stkAdet(x.eski)}</span></div><div class="stk-s-sag"><b>${stkAdet(x.oneri)}</b><span>öneri</span></div></div>`).join("");
  const m = openModal("Uyarı seviyesi önerisi", `<p class="hint" style="margin:0 0 10px">Öneri: elde bir haftalık satış kadar mal kalınca uyar (dükkan + araç birlikte sayılır).</p><div class="stk-liste">${rows}</div>
    <div class="stk-dugmeler">${bos ? `<button class="btn ok" type="button" id="kritBos">Seviyesi boş olan ${bos} ürüne yaz</button>` : ""}<button class="btn soft" type="button" id="kritHepsi">Hepsini önerilenle değiştir (${liste.length})</button></div>`, { noFoot: true, onMount: (ov) => {
    const uygula = (hepsi) => { const n = stkKritikUygula(stkKritikOneri(store, { hafta: alinacakAyar.hafta }), hepsi); saveStore(); m.close(); alert(n + " üründe uyarı seviyesi yazıldı ✔"); render(); };
    const b = ov.querySelector("#kritBos"); if (b) b.onclick = () => uygula(false);
    ov.querySelector("#kritHepsi").onclick = () => { if (confirm("Elle girdiğin seviyeler de önerilenle değişsin mi?")) uygula(true); };
  } });
}

/* ============ FİYAT BAKIMI: kontrol listesi ============ */
function renderFiyatBakim() {
  const k = stkFiyatKontrol(store);
  const urunSatir = (x, kotu) => `<button class="stk-satir stk-tik ${kotu ? "kotu" : ""}" type="button" data-fburun="${x.p.id}"><div class="stk-s-sol"><b>${esc(x.p.ad)}</b><span>Alış ${money.format(stkN(x.p.alis))} · satış ${money.format(stkN(x.p.satis))}</span></div><div class="stk-s-sag"><b>${stkYuzde(x.marj)}</b><span>kâr</span></div></button>`;
  const bolum = (cls, baslik, n, aciklama, icerik) => `<details class="stk-bolum ${cls}" ${n ? "open" : ""}><summary><b>${baslik}</b><span class="stk-say">${n}</span></summary>${n ? `<p class="hint">${aciklama}</p><div class="stk-liste">${icerik}</div>` : `<p class="hint">Yok 👍</p>`}</details>`;
  const ozelDusuk = k.ozelDusuk.map((x) => `<button class="stk-satir stk-tik ${x.zarar ? "kotu" : ""}" type="button" data-fbmus="${x.c.id}"><div class="stk-s-sol"><b>${esc(x.c.ad)}</b><span>${esc(x.p.ad)} · alış ${money.format(stkN(x.p.alis))} · özel fiyat ${money.format(x.fiyat)}</span></div><div class="stk-s-sag"><b>${x.zarar ? "ZARAR" : stkYuzde(x.marj)}</b><span>${x.zarar ? "" : "kâr"}</span></div></button>`).join("");
  const yuksek = k.ozelYuksek.map((x, i) => `<div class="stk-kart"><b>${esc(x.urunler[0].ad)}${x.urunler.length > 1 ? ` <span class="badge">+${x.urunler.length - 1} çeşit</span>` : ""}</b>
      <span>Liste fiyatı ${money.format(x.liste)} · ${x.musteriler.length} müşteri daha pahalıya alıyor:</span>
      <span class="stk-kucuk">${x.musteriler.map((m) => esc(m.c.ad) + " " + money.format(m.fiyat)).join(" · ")}</span>
      ${x.oneri != null ? `<button class="btn soft" type="button" data-fbcek="${i}">Liste fiyatını ${money.format(x.oneri)} yap</button>` : ""}</div>`).join("");
  return pageHead("Fiyat Bakımı", "Zam yap, kârı düşen fiyatları gör", [{ label: "％ Toplu Zam", route: "toplu-zam" }, { label: "🕘 Fiyat Geçmişi", cls: "soft", route: "fiyat-gecmisi" }]) +
    `<div class="card stk-ayar"><div class="field"><label>Kâr en az yüzde kaç olsun? (altı uyarılır)</label><div class="stk-yan"><input id="fbEsik" type="number" inputmode="decimal" step="1" min="0" value="${k.esik}" /><button class="btn soft" type="button" id="fbEsikKaydet">Kaydet</button></div></div></div>` +
    bolum("kirmizi", "Zararına satılanlar", k.zarar.length, "Satış fiyatı alış fiyatına eşit ya da altında. Dokununca ürün açılır.", k.zarar.map((x) => urunSatir(x, true)).join("")) +
    bolum("turuncu", "Kârı düşük ürünler", k.dusuk.length, "Kârı " + stkYuzde(k.esik) + " altında kalan ürünler.", k.dusuk.map((x) => urunSatir(x, false)).join("")) +
    bolum("turuncu", "Kârı düşük özel fiyatlar", k.ozelDusuk.length, "Bu müşterilere verilen özel fiyat alışa çok yakın. Dokununca müşteri açılır.", ozelDusuk) +
    bolum("mavi", "Liste fiyatı eskimiş olabilir", k.ozelYuksek.length, "Müşteri liste fiyatından pahalıya alıyorsa liste fiyatı güncel değildir.", yuksek) +
    (k.alisYok.length ? `<p class="hint" style="margin:10px 2px">Alış fiyatı girilmemiş ${k.alisYok.length} üründe kâr hesaplanamadı.</p>` : "");
}
function mountFiyatBakim() {
  const e = document.getElementById("fbEsikKaydet");
  if (e) e.addEventListener("click", () => { const v = stkOkuSayi(document.getElementById("fbEsik").value); if (isNaN(v) || v < 0 || v >= 100) { alert("0 ile 99 arasında bir yüzde yazın."); return; } store.settings.marjEsik = v; saveStore(); render(); });
  document.querySelectorAll("[data-fburun]").forEach((b) => b.addEventListener("click", () => openProductEdit(b.dataset.fburun)));
  document.querySelectorAll("[data-fbmus]").forEach((b) => b.addEventListener("click", () => openCustomerDetail(b.dataset.fbmus)));
  document.querySelectorAll("[data-fbcek]").forEach((b) => b.addEventListener("click", () => listeFiyatCekModal(Number(b.dataset.fbcek))));
}
/* "Liste fiyatını en yaygın özel fiyata çek": aile birlikte taşınır, özel fiyatlara dokunulmaz. */
function listeFiyatCekModal(i) {
  const x = stkFiyatKontrol(store).ozelYuksek[i]; if (!x || x.oneri == null) return;
  const a = { urunIdler: x.urunler.map((u) => u.id), tur: "yeni", deger: x.oneri, yuvarla: 0, ozel: "dokunma" };
  const plan = stkZamPlan(store, a);
  const rows = plan.urunler.map((u) => `<div class="stk-satir"><div class="stk-s-sol"><b>${esc(u.p.ad)}</b><span>${money.format(u.eski)} → ${money.format(u.yeni)}</span></div></div>`).join("");
  openModal("Liste fiyatını güncelle", `<p class="hint" style="margin:0 0 10px"><b>${x.oneriSayi} müşteri</b> zaten ${money.format(x.oneri)} ödüyor. Liste fiyatı bu olursa <b>özel fiyatı olmayan herkes</b> de bundan sonra ${money.format(x.oneri)} öder. Müşterilerin özel fiyatları değişmez.</p><div class="stk-liste">${rows}</div>`, {
    okLabel: "Liste fiyatını değiştir",
    onOk: () => { stkZamUygula(store, stkZamPlan(store, a), Object.assign(stkA(), { kaynak: "Liste fiyatı güncelleme" })); saveStore(); render(); },
  });
}

/* ============ TOPLU ZAM ============ */
let zamForm = { grup: "", secili: {}, tur: "yuzde", deger: "", yuvarla: "0", yon: "yakin", ozel: "dokunma" };
function zamParam() {
  const tek = zamForm.grup === "__sec";
  return { urunIdler: tek ? Object.keys(zamForm.secili).filter((id) => zamForm.secili[id]) : null, grup: tek ? null : (zamForm.grup || null), tur: zamForm.tur, deger: stkOkuSayi(zamForm.deger), yuvarla: Number(zamForm.yuvarla) || 0, yon: zamForm.yon, ozel: zamForm.ozel };
}
function renderTopluZam() {
  const gruplar = [...new Set(store.products.filter((p) => p.gorunur !== false).map((p) => p.grup || "GRUPSUZ ÜRÜN"))].sort((a, b) => a.localeCompare(b, "tr"));
  const tek = zamForm.grup === "__sec";
  const urunSec = tek ? `<div class="field"><label>Zam yapılacak ürünler</label><input id="zAra" class="stk-ara" placeholder="Ürün ara…" /><div class="stk-secliste" id="zUrunler">${store.products.filter((p) => p.gorunur !== false).slice().sort((a, b) => (a.ad || "").localeCompare(b.ad || "", "tr")).map((p) => `<label class="stk-chk" data-ara="${esc(ocrNorm(p.ad))}"><input type="checkbox" data-zurun="${p.id}" ${zamForm.secili[p.id] ? "checked" : ""} /><span>${esc(p.ad)}</span><b>${money.format(stkN(p.satis))}</b></label>`).join("")}</div></div>` : "";
  return pageHead("Toplu Zam", "Önce önizle, sonra uygula", [{ label: "Fiyat Bakımı", cls: "soft", route: "fiyat-bakim" }]) +
    `<div class="card stk-form">
      <div class="field"><label>Hangi ürünlere?</label><select id="zGrup"><option value="">Tüm ürünler</option>${gruplar.map((g) => `<option value="${esc(g)}" ${zamForm.grup === g ? "selected" : ""}>${esc(g)}</option>`).join("")}<option value="__sec" ${tek ? "selected" : ""}>Tek tek seçeceğim…</option></select></div>
      ${urunSec}
      <div class="field"><label>Zam nasıl hesaplansın?</label>${stkSecim("zTur", [["yuzde", "Yüzde (%)"], ["tutar", "Tutar (₺)"]], zamForm.tur)}</div>
      <div class="field"><label id="zDegerEt">${zamForm.tur === "tutar" ? "Kaç lira eklensin?" : "Yüzde kaç zam?"}</label><input id="zDeger" type="text" inputmode="decimal" value="${esc(zamForm.deger)}" placeholder="örn. 10" /><span class="hint">İndirim için başına eksi koy (örn. -5).</span></div>
      <div class="field"><label>Yeni fiyat yuvarlansın mı?</label><div class="stk-yan"><select id="zYuv">${[["0", "Yuvarlama yok"], ["0.5", "50 kuruşa"], ["1", "1 liraya"], ["5", "5 liraya"], ["10", "10 liraya"]].map((o) => `<option value="${o[0]}" ${zamForm.yuvarla === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select><select id="zYon">${[["yakin", "en yakına"], ["yukari", "yukarı"], ["asagi", "aşağı"]].map((o) => `<option value="${o[0]}" ${zamForm.yon === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></div></div>
      <div class="field"><label>Müşterilere özel fiyatlar ne olsun?</label>${stkSecim("zOzel", [["dokunma", "Aynı kalsın"], ["ayni", "Onlar da artsın"]], zamForm.ozel)}</div>
      <button class="btn lg" type="button" id="zOnizle" style="width:100%;justify-content:center">👁 Önizle</button>
    </div><div id="zOnizleme"></div>`;
}
function zamFormOku() {
  const g = (id) => document.getElementById(id);
  if (g("zGrup")) zamForm.grup = g("zGrup").value;
  if (g("zTur")) zamForm.tur = g("zTur").value;
  if (g("zDeger")) zamForm.deger = g("zDeger").value.trim();
  if (g("zYuv")) zamForm.yuvarla = g("zYuv").value;
  if (g("zYon")) zamForm.yon = g("zYon").value;
  if (g("zOzel")) zamForm.ozel = g("zOzel").value;
  document.querySelectorAll("[data-zurun]").forEach((c) => { zamForm.secili[c.dataset.zurun] = c.checked; });
}
function zamOnizle() {
  zamFormOku();
  const kutu = document.getElementById("zOnizleme"), a = zamParam();
  if (isNaN(a.deger) || a.deger === 0) { alert(zamForm.tur === "tutar" ? "Kaç lira zam yapılacağını yazın." : "Yüzde kaç zam yapılacağını yazın."); return; }
  if (a.urunIdler && !a.urunIdler.length) { alert("En az bir ürün seçin."); return; }
  const plan = stkZamPlan(store, a);
  if (!plan.urunler.length) { kutu.innerHTML = `<div class="card"><p class="sub">Fiyatı değişecek ürün yok.</p></div>`; return; }
  const rows = plan.urunler.map((u) => `<div class="stk-satir ${u.zarar ? "kotu" : ""}"><div class="stk-s-sol"><b>${esc(u.p.ad)}</b><span>${money.format(u.eski)} → <strong>${money.format(u.yeni)}</strong>${u.aileden ? " · aynı çeşit, birlikte değişir" : ""}${u.zarar ? " · <em>alışın altında!</em>" : ""}</span></div><div class="stk-s-sag"><b>${u.alis > 0 ? stkYuzde(u.marj) : "—"}</b><span>kâr</span></div></div>`).join("");
  const ozel = plan.ozel.length
    ? `<details class="stk-bolum mavi"><summary><b>Değişecek özel fiyatlar</b><span class="stk-say">${plan.ozel.length}</span></summary><div class="stk-liste">${plan.ozel.map((o) => `<div class="stk-satir"><div class="stk-s-sol"><b>${esc(o.c.ad)}</b><span>${esc(o.p.ad)} · ${money.format(o.eski)} → <strong>${money.format(o.yeni)}</strong></span></div></div>`).join("")}</div></details>`
    : (plan.ozelSayisi && a.ozel !== "ayni" ? `<p class="hint" style="margin:8px 2px">Bu ürünlerde ${plan.ozelSayisi} özel fiyat var; onlar <b>aynı kalacak</b> (o müşteriler eski fiyattan alır).</p>` : "");
  kutu.innerHTML = `<div class="section-title">Önizleme — ${plan.urunler.length} ürünün fiyatı değişecek</div>
    ${plan.uyarilar.map((u) => `<div class="stk-uyari"><b>⚠ Dikkat</b><span>${esc(u)}</span></div>`).join("")}
    <div class="stk-liste" id="zListe">${rows}</div>${ozel}
    <button class="btn green lg" type="button" id="zUygula" style="width:100%;justify-content:center;margin-top:12px">✔ Zammı Uygula (${plan.urunler.length} ürün${plan.ozel.length ? " + " + plan.ozel.length + " özel fiyat" : ""})</button>`;
  document.getElementById("zUygula").addEventListener("click", () => {
    if (!confirm(plan.urunler.length + " ürünün fiyatı değişecek" + (plan.ozel.length ? ", " + plan.ozel.length + " özel fiyat da değişecek" : "") + ". Emin misin?")) return;
    const tanim = a.tur === "yuzde" ? "%" + stkAdet(a.deger) : stkAdet(a.deger) + " ₺";
    const n = stkZamUygula(store, stkZamPlan(store, a), Object.assign(stkA(), { kaynak: "Toplu zam (" + tanim + ")" }));
    saveStore(); zamForm.deger = ""; zamForm.secili = {};
    alert(n.urun + " ürünün fiyatı değişti ✔" + (n.ozel ? "\n" + n.ozel + " özel fiyat da değişti." : "")); navigate("fiyat-bakim");
  });
  kutu.scrollIntoView({ behavior: "smooth", block: "start" });
}
function mountTopluZam() {
  const g = document.getElementById("zGrup"); if (g) g.onchange = () => { zamFormOku(); render(); };
  stkSecimBagla(document, "zTur", (v) => { document.getElementById("zDegerEt").textContent = v === "tutar" ? "Kaç lira eklensin?" : "Yüzde kaç zam?"; });
  stkSecimBagla(document, "zOzel");
  const ara = document.getElementById("zAra");
  if (ara) ara.addEventListener("input", () => { const q = ocrNorm(ara.value); document.querySelectorAll("#zUrunler .stk-chk").forEach((l) => { l.style.display = l.dataset.ara.includes(q) ? "" : "none"; }); });
  document.getElementById("zOnizle").addEventListener("click", zamOnizle);
}

/* ============ FİYAT GEÇMİŞİ ============ */
function renderFiyatGecmisi() {
  const liste = (store.fiyatGecmisi || []).slice().sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
  const rows = liste.slice(0, 300).map((g) => { const c = g.musteriId && findCustomer(g.musteriId); const artti = g.yeni > g.eski; return `<div class="stk-satir" data-ara="${esc(ocrNorm(g.ad + " " + (c ? c.ad : "")))}"><div class="stk-s-sol"><b>${esc(g.ad)}</b><span>${fmtDateShort(g.tarih)} · ${g.alan === "alis" ? "alış fiyatı" : g.alan === "ozel" ? "özel fiyat" + (c ? " (" + esc(c.ad) + ")" : "") : "satış fiyatı"}${g.kaynak ? " · " + esc(g.kaynak) : ""}</span></div><div class="stk-s-sag genis"><b class="${artti ? "artti" : "dustu"}">${money.format(g.yeni)}</b><span>${money.format(g.eski)} idi</span></div></div>`; }).join("");
  return pageHead("Fiyat Geçmişi", liste.length + " değişiklik", [{ label: "Fiyat Bakımı", cls: "soft", route: "fiyat-bakim" }]) +
    (liste.length ? `<input id="fgAra" class="stk-ara" placeholder="Ürün ya da müşteri ara…" /><div class="stk-liste" id="fgListe">${rows}</div>` : `<div class="card"><p class="sub">Henüz kayıt yok. Bundan sonra alış ya da satış fiyatı her değiştiğinde burada görünür.</p></div>`);
}
function mountFiyatGecmisi() {
  const ara = document.getElementById("fgAra");
  if (ara) ara.addEventListener("input", () => { const q = ocrNorm(ara.value); document.querySelectorAll("#fgListe .stk-satir").forEach((l) => { l.style.display = l.dataset.ara.includes(q) ? "" : "none"; }); });
}

/* ============ GELEN SİPARİŞ: gözden kaçmayan işaret ============ */
const SIP_DUYURULDU_KEY = "stk-sip-duyuruldu-v1";
function sipDuyurulanlar() { try { return JSON.parse(localStorage.getItem(SIP_DUYURULDU_KEY) || "[]"); } catch (e) { return []; } }
function sipBip() {
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const c = sipBip.c || (sipBip.c = new C()), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; g.gain.value = 0.18; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.3);
  } catch (e) { /* ses açılamadı: önemli değil */ }
}
/* Yeni gelen (daha önce haber verilmemiş) sipariş varsa: titreşim + ses + izin verildiyse tarayıcı bildirimi. */
function sipYeniHaberVer(bekleyen) {
  const eski = sipDuyurulanlar(), yeni = bekleyen.filter((o) => !eski.includes(o.orderId || o.id));
  if (!yeni.length) return false;
  try { localStorage.setItem(SIP_DUYURULDU_KEY, JSON.stringify(eski.concat(yeni.map((o) => o.orderId || o.id)).slice(-300))); } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([250, 120, 250]); } catch (e) {}
  sipBip();
  try { if ("Notification" in window && Notification.permission === "granted") new Notification("Yeni sipariş: " + yeni[0].dealer, { body: yeni.length > 1 ? "ve " + (yeni.length - 1) + " sipariş daha bekliyor" : money.format(yeni[0].toplam) + " · " + (yeni[0].items || []).length + " kalem", tag: "babuco-siparis" }); } catch (e) { /* Android'de sayfa içinden bildirim açılamaz */ }
  return true;
}
/* Ekranın üstünde, her sayfada görünen şerit. Bekleyen (onaylanmamış) sipariş kalmayınca kaybolur. */
function sipSeritGuncelle() {
  const bekleyen = stkSiparisBekleyen(store);
  let el = document.getElementById("stkSipSerit");
  if (!bekleyen.length) { if (el) el.remove(); return; }
  const yeniGeldi = sipYeniHaberVer(bekleyen);
  if (!el) {
    el = document.createElement("button"); el.type = "button"; el.id = "stkSipSerit"; el.className = "stk-serit";
    const content = document.getElementById("content");
    if (!content || !content.parentNode) return;
    content.parentNode.insertBefore(el, content);
    el.addEventListener("click", () => { el.classList.remove("yeni"); navigate("cay-ocagi"); });
  }
  const enEski = bekleyen.reduce((m, o) => Math.max(m, stkSiparisYasSaat(o)), 0);
  el.classList.toggle("gec", enEski >= 24);
  if (yeniGeldi) el.classList.add("yeni");
  el.innerHTML = `<span class="stk-serit-ic">🔔</span><span class="stk-serit-yazi"><b>${bekleyen.length} sipariş bekliyor</b><small>${bekleyen.length === 1 ? esc(bekleyen[0].dealer) + " · " : "en eskisi "}${stkYasMetin(enEski)}${enEski >= 24 ? " — gecikti" : ""}</small></span><span class="stk-serit-git">Gör ›</span>`;
}
/* Tarayıcı bildirimi izni — yalnız kullanıcı dokununca istenir. */
function sipBildirimIzniIste() {
  if (!("Notification" in window)) { alert("Bu cihazda tarayıcı bildirimi yok. Yeni sipariş gelince ekranın üstünde şerit çıkar, telefon titrer."); return; }
  try { Notification.requestPermission().then((p) => { alert(p === "granted" ? "Bildirim açıldı ✔ Panel açıkken yeni sipariş gelince haber verilecek." : "Bildirim izni verilmedi."); updateBell(); }); } catch (e) { alert("Bildirim izni istenemedi."); }
}
/* Sipariş zaten elle satışa girilmişse: satış AÇMADAN kapat (çay ocağı "teslim edildi" görür). */
function cayElleKapat(o, sessiz) {
  stkSiparisKapat(o, "Satışı ayrıca girildi");
  if (!sessiz) { saveStore(); render(); }
  cayDurumBulut(o);
}
function cayTopluKapatModal() {
  const acik = store.gelenSiparisler.filter((o) => o.durum !== "teslim").sort((a, b) => String(a.tarih).localeCompare(String(b.tarih)));
  if (!acik.length) { alert("Bekleyen sipariş yok."); return; }
  const rows = acik.map((o) => `<label class="stk-chk"><input type="checkbox" data-kapat="${o.id}" /><span><b>${esc(o.dealer)}</b><small>${fmtDateShort(o.tarih)} · ${stkYasMetin(stkSiparisYasSaat(o))} · ${money.format(o.toplam)}</small></span></label>`).join("");
  openModal("Teslim edilmiş siparişleri kapat", `<p class="hint" style="margin:0 0 10px">Malını <b>zaten teslim edip satışını girdiğin</b> siparişleri işaretle. Yeni satış yazılmaz, stok ve borç değişmez; sipariş listeden kalkar.</p><div class="stk-secliste">${rows}</div>`, {
    okLabel: "Seçilenleri Kapat",
    onOk: (ov) => {
      const idler = [...ov.querySelectorAll("[data-kapat]:checked")].map((c) => c.dataset.kapat);
      if (!idler.length) { alert("En az bir sipariş işaretleyin."); return false; }
      idler.forEach((id) => { const o = cayFind(id); if (o) cayElleKapat(o, true); });
      saveStore(); render();
    },
  });
}

/* ============ İADE ============ */
/* Müşteriden geri alınan mal. Tutar LİSTE fiyatından değil, müşterinin o ürünü gerçekte aldığı fiyattan hesaplanır
   (son satış fiyatı → özel fiyat → liste; stkIadeFiyat). Kayıt aracın `iade` komutuyla ORTAK işlevden geçer
   (stkIadeKaydet): müşteri varsa eksi adetli iade fişi açılır — borç, o günün cirosu ve maliyeti birlikte düşer.
   Tahsilat (payments) yazılmaz; iade para girişi değildir. */
function renderUrunIade() {
  return pageHead("Ürün İadesi Al") +
    `<div class="card stk-form">
      <div class="field"><label>Müşteri (kimden geri alındı?)</label><select id="iMus"><option value="">— müşterisiz —</option>${store.customers.map((c) => `<option value="${c.id}">${esc(c.ad)}</option>`).join("")}</select></div>
      <div class="field"><label>Ürün</label><select id="iUrun"><option value="">Ürün seçin</option>${store.products.map((p) => `<option value="${p.id}">${esc(p.ad)}</option>`).join("")}</select></div>
      <div class="stk-iki"><div class="field"><label>Miktar</label><input id="iAdet" type="number" inputmode="decimal" step="0.01" value="1" /></div><div class="field"><label>Birim fiyat (₺)</label><input id="iFiyat" type="number" inputmode="decimal" step="0.01" placeholder="0" /></div></div>
      <p class="hint" id="iFiyatNot" style="margin-top:0">Müşteri ve ürün seçince, müşterinin o ürünü en son aldığı fiyat gelir.</p>
      <div class="field"><label>Mal nereye girdi?</label>${stkSecim("iHavuz", [["arac", "🚚 Araca"], ["dukkan", "🏪 Dükkana"]], "arac")}</div>
      <div class="stk-toplam"><span>İade tutarı</span><b id="iTutar">${money.format(0)}</b></div>
      <button class="btn green lg" id="iSave" type="button" style="width:100%;justify-content:center;margin-top:10px">İadeyi Al</button>
      <p class="hint">İade alınan ürünün stoğu artar. Müşteri seçilirse iade tutarı borcundan ve o günün satışından düşülür.</p>
    </div>` +
    tableCard(["Ürün", "Miktar", "Tutar", "Müşteri", "Tarih"], store.iadeler.slice().reverse().map((r) => { const c = r.musteriId && findCustomer(r.musteriId); return `<tr><td>${esc(r.ad)}</td><td>${num2.format(r.adet)}</td><td>${money.format(r.tutar)}</td><td>${c ? esc(c.ad) : "-"}</td><td>${fmtDate(r.tarih)}</td></tr>`; }).join(""), infoLine(store.iadeler.length));
}
function mountUrunIade() {
  const g = (id) => document.getElementById(id);
  stkSecimBagla(document, "iHavuz");
  const tutarYaz = () => { g("iTutar").textContent = money.format(kurus((Number(g("iAdet").value) || 0) * (Number(g("iFiyat").value) || 0))); };
  const fiyatGetir = () => {
    const pr = findProduct(g("iUrun").value); if (!pr) { g("iFiyatNot").textContent = "Müşteri ve ürün seçince, müşterinin o ürünü en son aldığı fiyat gelir."; return; }
    const f = stkIadeFiyat(store, g("iMus").value || null, pr);
    g("iFiyat").value = f.fiyat;
    g("iFiyatNot").textContent = f.kaynak === "son-satis" ? "Bu müşteri bu ürünü en son " + money.format(f.fiyat) + " fiyatla aldı (" + fmtDateShort(f.tarih) + "). İade bu fiyattan düşülür."
      : f.kaynak === "ozel" ? "Bu müşterinin özel fiyatı: " + money.format(f.fiyat) + "." : "Liste fiyatı: " + money.format(f.fiyat) + (g("iMus").value ? " (bu müşteri bu ürünü daha önce almamış)." : ".");
    tutarYaz();
  };
  g("iMus").addEventListener("change", fiyatGetir); g("iUrun").addEventListener("change", fiyatGetir);
  g("iAdet").addEventListener("input", tutarYaz); g("iFiyat").addEventListener("input", tutarYaz);
  g("iSave").addEventListener("click", () => {
    const pid = g("iUrun").value, adet = Number(g("iAdet").value), mus = g("iMus").value || null;
    if (!pid || !adet || adet <= 0) { alert("Ürün ve miktar girin."); return; }
    const pr = findProduct(pid), fiyat = g("iFiyat").value === "" ? stkIadeFiyat(store, mus, pr).fiyat : Number(g("iFiyat").value) || 0;
    const r = stkIadeKaydet(store, { musteriId: mus, urunId: pid, adet, fiyat, havuz: g("iHavuz").value }, stkA());
    saveStore(); alert("İade alındı ✔\n" + stkHavuzAd(r.havuz) + " stoğuna " + num2.format(adet) + " eklendi" + (r.sale ? ", " + money.format(r.tutar) + " borçtan düşüldü (iade fişi " + r.sale.belgeNo + ")." : ".")); render();
  });
}

/* ============ ETİKET ============ */
function renderUrunEtiket() {
  return pageHead("Ürün Etiketi Üret") +
    `<div class="card"><div class="filters">
      <div class="field" style="flex:1"><label>Ürün</label><select id="etUrun">${store.products.map((p) => `<option value="${p.id}">${esc(p.ad)}</option>`).join("") || "<option>Ürün yok</option>"}</select></div>
      <div class="field"><label>Adet</label><input id="etAdet" type="number" value="6" /></div>
      <div class="field"><label>&nbsp;</label><button class="btn" id="etPrint" type="button">🖨 Etiket Yazdır</button></div>
    </div><p class="hint">Seçilen ürün için barkod/fiyat etiketi yazdırır.</p></div>`;
}
function mountUrunEtiket() {
  const b = document.getElementById("etPrint"); if (!b) return;
  b.addEventListener("click", () => {
    const p = findProduct(document.getElementById("etUrun").value); const n = Number(document.getElementById("etAdet").value) || 1;
    if (!p) { alert("Ürün seçin."); return; }
    let cells = ""; for (let i = 0; i < n; i++) cells += `<div class="label-cell"><div class="lname">${esc(p.ad)}</div><div>${money.format(Number(p.satis) || 0)}</div><div class="lbarcode">${esc(p.barkod || "-")}</div></div>`;
    openPrint("Etiket", `<div class="label-sheet" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${cells}</div>`);
  });
}

/* ============ GELİR / GİDER ============ */
function gelirGiderPage(key, title, tur) {
  const items = store[key];
  const toplam = items.reduce((s, x) => s + Number(x.tutar || 0), 0);
  return crudPage({
    title, sub: () => "Toplam: " + money.format(toplam), key, newLabel: "Yeni " + tur + " Ekle",
    columns: ["Sıra", tur + " Türü", "Not", "Tutar", "Ödeme Tipi", "Tarih"],
    row: (it, i) => [i + 1, esc(it.kategori || it.tur || "-"), esc(it.not || "-"), money.format(Number(it.tutar) || 0), esc(it.odeme || "Nakit"), fmtDate(it.tarih)],
    fields: [{ key: "tur", label: tur + " Türü", req: true }, { key: "not", label: "Not" }, { key: "tutar", label: "Tutar (₺)", type: "number", step: "0.01", req: true }, { key: "odeme", label: "Ödeme Tipi", type: "select", options: ["Nakit", "POS", "Havale"] }],
    stamp: true,
  });
}

/* ============ Jenerik shell liste ============ */
const DATE_FILTERS = [{ label: "Başlangıç Tarihi", value: todayStr() }, { label: "Bitiş Tarihi", value: todayStr() }];
function listPage(cfg) { return pageHead(cfg.title, cfg.sub, cfg.actions) + (cfg.filters ? `<div class="card"><div class="filters">${cfg.filters.map(field).join("")}<div class="field"><label>&nbsp;</label><button class="btn">☰ Listele</button></div></div></div>` : "") + tableCard(cfg.columns) + (cfg.summary ? grid(cfg.summary) : ""); }

/* ============ Çay Ocağı Siparişleri (çay ocağı uygulamasından gelen) ============ */
/* Sipariş kodu formatı çay ocağı uygulamasıyla AYNI: "CAYSIP1:" + base64(JSON{v:1,order}) */
const CAYSIP_PREFIX = "CAYSIP1:";
function decodeCaySiparis(raw) {
  try {
    const s = String(raw || "");
    // Kod metnin ortasında olabilir (WhatsApp mesajı gibi) — prefix'i bul, sonraki ilk token'ı al.
    const idx = s.indexOf(CAYSIP_PREFIX);
    if (idx < 0) return null;
    const payload = s.slice(idx + CAYSIP_PREFIX.length).trim().split(/\s/)[0];
    const json = decodeURIComponent(escape(atob(payload)));
    const obj = JSON.parse(json);
    if (!obj || obj.v !== 1 || !obj.order || !Array.isArray(obj.order.lines)) return null;
    return obj.order;
  } catch (e) { return null; }
}
/* 3 aşama: yeni → onay (teklif hazır) → dagitim (fiş + müşteriye gönder) → teslim (rapora işlenir) */
const CAY_ASAMALAR = [
  { id: "yeni", ad: "Yeni", badge: "badge" },
  { id: "onay", ad: "Onaylandı · teklif hazır", badge: "badge-amber" },
  { id: "dagitim", ad: "Dağıtımda", badge: "badge-amber" },
  { id: "teslim", ad: "Teslim edildi", badge: "badge-green" },
];
const cayAsama = (id) => CAY_ASAMALAR.find((a) => a.id === id) || CAY_ASAMALAR[0];
function cayFind(id) { return store.gelenSiparisler.find((x) => x.id === id); }

/* ---- Bulut (Supabase): çay ocağı siparişlerini internetten otomatik al + durumu geri yaz ---- */
/* Çay ocağı uygulamasıyla AYNI Supabase projesi. anon/publishable anahtar public (pakete gömülür). */
const SB_URL = "https://zchubpqbvbhcuxclirur.supabase.co";
const SB_KEY = "sb_publishable_m5HEx3mFrjDJHBe0qfUznQ_tXkoESp3";
/* Oturum cihazda kalıcıdır (bir kez giriş, bir daha sormaz). Bütün veri istekleri sbFetch'ten geçer:
   oturum yokken hiçbir istek gitmez, kullanıcının jetonuyla gider (bkz. "GİRİŞ / OTURUM" bölümü). */
const SB = (typeof window !== "undefined" && window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: OTURUM_ANAHTAR }, global: { fetch: sbFetch } })
  : null;
girisBaslat();

/** Supabase'den siparişleri çek; yeni olanları gelenSiparisler'e ekle. orderId ile mükerrer engeli.
 *  Satır → sipariş çevirisi araçla ortak (stkSiparisSatirdan); fiyat panelin güncel kataloğundan kurulur. */
async function cayPullSupabase() {
  if (!SB) return;
  try {
    const { data, error } = await SB.from("siparisler").select("*").eq("toptanci", "babuco").order("created_at");
    if (error || !data) return;
    let degisti = false;
    for (const row of data) {
      if (store.gelenSiparisler.some((o) => o.orderId === row.id)) continue; // zaten alınmış
      if ((store.sipSilinenler || []).some((x) => x.id === row.id)) continue;  // panelden silinmiş: geri gelmesin
      const o = stkSiparisSatirdan(store, row, stkA());
      // Araçtan (ya da başka cihazdan) işlenmiş siparişi "yeni" diye geri getirme.
      if (row.durum === "onay" || row.durum === "dagitim" || row.durum === "teslim") o.durum = row.durum;
      store.gelenSiparisler.push(o);
      degisti = true;
    }
    // Ekranı baştan çizme: kullanıcı o an fatura/satış yazıyor olabilir (form silinir, sayfa en üste atlar).
    // Sipariş listesi açıksa çiz; değilse üstteki şerit ve zil yeter.
    if (degisti) { saveStore(); if (currentRoute() === "cay-ocagi") render(); else updateBell(); }
  } catch (e) { /* çevrimdışı / ağ hatası: sessiz, panel yerelle çalışır */ }
}
/* Siparişi panelden sil. Tablodaki satır durduğu için kimliği saklanır; yoksa 15 sn sonra "yeni" diye geri gelirdi. */
function caySil(o) {
  if (o.orderId) { store.sipSilinenler = store.sipSilinenler || []; if (!store.sipSilinenler.some((x) => x.id === o.orderId)) store.sipSilinenler.push({ id: o.orderId, tarih: new Date().toISOString() }); }
  store.gelenSiparisler = store.gelenSiparisler.filter((x) => x.id !== o.id);
  saveStore(); render();
}

/** Bir siparişin durumunu buluta geri yaz — çay ocağı "Onaylandı/Hazırlanıyor/Teslim" görsün. */
async function cayDurumBulut(o) {
  if (!SB || !o || !o.orderId) return;
  try { await SB.from("siparisler").update({ durum: o.durum, updated_at: new Date().toISOString() }).eq("id", o.orderId); }
  catch (e) { /* sessiz */ }
}

/* ---- Bulut eşitleme: tüm store Supabase kv tablosunda tek satır (babuco:store) ---- */
/* Çay ocağı uygulamasıyla aynı kv tablosu; farklı anahtar. Aynı satırı terminal aracı (tools/babuco.cjs)
   ve başka telefonlar da yazar. Bu yüzden panel ASLA körlemesine üstüne yazmaz:
     1. Bu cihazda yapılıp buluta henüz gitmemiş değişiklikler "yama" olarak tutulur (günlük, localStorage).
     2. Yazmadan önce buluttaki güncel hâl okunur, yamalar onun ÜSTÜNE uygulanır (üç yönlü birleştirme).
     3. Sonuç "bulut hâlâ okuduğum hâldeyse yaz" koşuluyla gönderilir (updated_at eşitse). Koşul tutmazsa
        hiçbir şey yazılmamıştır: yeniden okunur, yeniden birleştirilir.
     4. Her yama numaralıdır; buluttaki kayıt "bu cihazın kaçıncı yamasına kadar işlendi" bilgisini
        (store.esitleme[cihaz]) taşır. Yazma ulaşıp yanıtı kaybolsa bile aynı yama iki kez uygulanmaz
        (stok iki kez düşmez). */

/* <esitleme-saf> ---------------------------------------------------------------------------------
   SAF BİRLEŞTİRME ÇEKİRDEĞİ — tarayıcıya, store'a, buluta dokunmaz; girdilerini değiştirmez
   (esYerinde hariç: o bilerek hedefini yerinde günceller). testler/senkron/birim.mjs bu iki işaret
   arasını Node'da ayrıca çalıştırıp sınar; buraya dış bağımlılık EKLEME.

   Fikir:  yerel = taban + yama   →   buluta yazılacak hâl = bulut + yama.
   Yama kuralları (esFark çıkarır, esUygula uygular):
     · id'li kayıt dizileri id'ye göre: yerelde eklenen eklenir, silinen silinir, değişen kayıtta yalnız
       yerelin değiştirdiği alanlar yerelden gelir (diğer alanlar buluttaki hâliyle kalır).
     · Sayaç alanları (stok, aracStok) FARK olarak: bulut + (yerel − taban). İki taraf da satış
       yaptıysa ikisinin düşümü de kalır.
     · counters / esitleme: anahtar anahtar en büyük değer.  · settings ve diğer düz nesneler: anahtar anahtar.
     · En üst düzeydeki id'siz diziler içeriğe göre (ekle/çıkar); kayıt içindeki id'siz diziler bütün olarak.
     · Emin olunamayan yerde SİLMEK yerine TUTULUR: bulutta bu arada değişmiş kaydı yerel silme silmez;
       bulutta silinmiş kaydı yerelin gerçek (stok dışı) değişikliği geri getirir. */
const ES_SAYAC = { stok: 1, aracStok: 1 };            // fark olarak birleşen alan adları
const ES_ENBUYUK = { counters: 1, esitleme: 1 };       // en üst düzeyde "en büyük kazanır" nesneleri
const ES_TEKIL = { gelenSiparisler: "orderId", groups: "ad" };   // aynı şeyi iki cihaz ayrı id ile ekleyebilir → tek kayıt

function esDuz(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function esYok(v) { return v === undefined || v === null; }
function esBos(v) { return (Array.isArray(v) && v.length === 0) || (esDuz(v) && Object.keys(v).length === 0); }
function esKlon(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function esSayi(v) { return (typeof v === "number" && isFinite(v)) || (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))); }
function esYuvarla(n) { return Math.round(n * 1e6) / 1e6; }
function esIdVar(x) { return esDuz(x) && (typeof x.id === "string" || typeof x.id === "number") && x.id !== ""; }
function esIdli(d) { return d.every(esIdVar); }
/** Derin eşitlik. Anahtar SIRASI önemsizdir (Postgres jsonb anahtarları yeniden sıralar); undefined alan = yok. */
function esEsit(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const ad = Array.isArray(a);
  if (ad !== Array.isArray(b)) return false;
  if (ad) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!esEsit(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  let nb = 0;
  for (const k in b) if (Object.prototype.hasOwnProperty.call(b, k) && b[k] !== undefined) nb++;
  if (ka.length !== nb) return false;
  for (const k of ka) { if (b[k] === undefined || !esEsit(a[k], b[k])) return false; }
  return true;
}
/** Anahtarları sıralı, kararlı JSON metni (özet ve içerik anahtarı için). */
function esKanonik(v) {
  if (v === null || typeof v !== "object") { const s = JSON.stringify(v); return s === undefined ? "null" : s; }
  if (Array.isArray(v)) return "[" + v.map(esKanonik).join(",") + "]";
  return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + esKanonik(v[k])).join(",") + "}";
}
function esOzet(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
/** Dizi öğelerinin kimlikleri: id varsa "i:<id>", yoksa "c:<içerik>"; aynısı tekrar ederse "#2", "#3"… */
function esAnahtarlar(d) {
  const say = new Map();
  return d.map((x) => {
    const ham = esIdVar(x) ? "i:" + x.id : "c:" + esKanonik(x);
    const n = (say.get(ham) || 0) + 1; say.set(ham, n);
    return n === 1 ? ham : ham + "#" + n;
  });
}
function esSayacsiz(k) { const o = {}; Object.keys(k).forEach((a) => { if (!ES_SAYAC[a]) o[a] = k[a]; }); return o; }
/** Kaydın "bu arada değişmiş mi" karşılaştırması için özeti (stok gibi sayaçlar hariç). */
function esKayitOzeti(k) { return esOzet(esKanonik(esDuz(k) ? esSayacsiz(k) : k)); }

/** taban → yerel farkı (yama). Fark yoksa null. ad: bu değerin anahtarı, ust: bir üstünün anahtarı, derin: kökten uzaklık. */
function esFark(t, y, ad, ust, derin) {
  derin = derin || 0;
  if (y === undefined) return null;
  if (esEsit(t, y)) return null;
  if (esYok(t) && esBos(y)) return null;            // tembel oluşturulan boş koleksiyon değişiklik sayılmaz
  if (Array.isArray(y)) {
    const tb = Array.isArray(t) ? t : (esYok(t) ? [] : null);
    if (tb && (derin === 1 || (esIdli(y) && esIdli(tb)))) return esDiziFark(tb, y, ad, derin);
    return { t: "=", v: esKlon(y) };
  }
  if (esDuz(y)) {
    const tb = esDuz(t) ? t : (esYok(t) ? {} : null);
    if (!tb) return { t: "=", v: esKlon(y) };
    const a = {}, s = [];
    // esitleme (cihazların yama sayaçları) yerel değişiklik sayılmaz: onu yalnız eşitleme yazar. Yoksa "tüm
    // verileri sil" gibi store'u baştan kuran bir işlem diğer cihazların sayaçlarını da silerdi.
    const atla = (k) => derin === 0 && k === "esitleme";
    Object.keys(y).forEach((k) => { if (y[k] === undefined || atla(k)) return; const f = esFark(tb[k], y[k], k, ad, derin + 1); if (f) a[k] = f; });
    Object.keys(tb).forEach((k) => { if (y[k] === undefined && tb[k] !== undefined && !atla(k)) s.push(k); });
    return (Object.keys(a).length || s.length) ? { t: "n", a, s } : null;
  }
  if (derin === 2 && ES_ENBUYUK[ust] && typeof y === "number") return { t: "m", v: y };
  if (ES_SAYAC[ad] && esSayi(y) && (esYok(t) || t === "" || esSayi(t))) return { t: "+", d: esYuvarla(Number(y) - (Number(t) || 0)), v: Number(y) };
  return { t: "=", v: y };
}
function esDiziFark(tb, y, ad, derin) {
  const tk = esAnahtarlar(tb), yk = esAnahtarlar(y), tMap = new Map(), yVar = new Set(yk);
  tk.forEach((k, i) => tMap.set(k, tb[i]));
  const ek = [], sil = {}, deg = {};
  yk.forEach((k, i) => {
    if (!tMap.has(k)) { ek.push(esKlon(y[i])); return; }
    if (k[0] !== "i") return;                        // içerik anahtarlı öğe: aynı içerik = değişmemiş
    const f = esFark(tMap.get(k), y[i], null, ad, derin + 1);
    if (f) deg[k] = { f, tam: esKlon(y[i]) };        // tam: bulutta silinmişse geri getirebilmek için
  });
  tk.forEach((k, i) => { if (!yVar.has(k)) sil[k] = k[0] === "i" ? esKayitOzeti(tb[i]) : 1; });
  return (ek.length || Object.keys(sil).length || Object.keys(deg).length) ? { t: "d", ek, sil, deg } : null;
}
/** Yamada sayaç (stok) dışında gerçek bir değişiklik var mı? */
function esGercek(f) {
  if (!f || f.t === "+") return false;
  if (f.t !== "n") return true;
  return f.s.length > 0 || Object.keys(f.a).some((k) => esGercek(f.a[k]));
}
/** Yamayı h üstüne uygular; h'yi değiştirmez, yeni değeri döndürür. bag: { esleme, notlar } */
function esUygula(h, f, ad, derin, bag) {
  if (!f) return h;
  if (f.t === "=") return esKlon(f.v);
  if (f.t === "+") return esYuvarla((Number(h) || 0) + f.d);
  if (f.t === "m") return (typeof h === "number" && h > f.v) ? h : f.v;
  if (f.t === "n") {
    const o = esDuz(h) ? Object.assign({}, h) : {};
    Object.keys(f.a).forEach((k) => { o[k] = esUygula(o[k], f.a[k], k, derin + 1, bag); });
    f.s.forEach((k) => { delete o[k]; });
    return o;
  }
  if (f.t === "d") return esDiziUygula(Array.isArray(h) ? h : [], f, ad, derin, bag);
  return h;
}
function esDiziUygula(h, f, ad, derin, bag) {
  const dizi = h.slice(), konum = new Map(), cikar = new Set();
  esAnahtarlar(dizi).forEach((k, i) => konum.set(k, i));
  const esleme = (derin === 1 && bag.esleme[ad]) || {};        // önceki yamalarda bulut kaydıyla eşlenen yerel id'ler
  Object.keys(f.sil).forEach((k0) => {
    const k = esleme[k0] || k0, i = konum.get(k);
    if (i === undefined) return;                                // bulutta zaten yok
    if (k === k0 && k[0] === "i" && esKayitOzeti(dizi[i]) !== f.sil[k0]) {   // bulutta bu arada değişmiş → silme, tut
      bag.notlar.push({ tur: "silinmedi", kol: ad, id: dizi[i].id });
      return;
    }
    cikar.add(i);
  });
  Object.keys(f.deg).forEach((k0) => {
    const k = esleme[k0] || k0, d = f.deg[k0], i = konum.get(k);
    if (i !== undefined) { dizi[i] = esUygula(dizi[i], d.f, null, derin + 1, bag); return; }
    if (esGercek(d.f)) {                                        // bulutta silinmiş ama yerelde gerçekten değiştirilmiş → tut
      konum.set(k, dizi.length); dizi.push(esKlon(d.tam));
      bag.notlar.push({ tur: "geri-geldi", kol: ad, id: d.tam && d.tam.id });
    }
  });
  const tekil = derin === 1 ? ES_TEKIL[ad] : null;
  f.ek.forEach((kayit) => {
    const k = esIdVar(kayit) ? "i:" + kayit.id : "c:" + esKanonik(kayit);
    const i = konum.get(k);
    if (i !== undefined && !cikar.has(i)) {                     // iki tarafta da aynı kimlikle var
      if (k[0] === "i") {
        const o = Object.assign({}, dizi[i], esKlon(kayit));
        Object.keys(ES_SAYAC).forEach((s) => { if (dizi[i][s] !== undefined) o[s] = dizi[i][s]; });
        dizi[i] = o;
      }
      return;
    }
    if (tekil && k[0] === "i" && !esYok(kayit[tekil]) && kayit[tekil] !== "") {
      const j = dizi.findIndex((x, n) => !cikar.has(n) && esDuz(x) && x[tekil] === kayit[tekil]);
      if (j >= 0) {                                             // aynı şey bulutta başka id ile var → buluttaki kalır
        if (esIdVar(dizi[j])) { bag.esleme[ad] = bag.esleme[ad] || {}; bag.esleme[ad][k] = "i:" + dizi[j].id; }
        return;
      }
    }
    konum.set(k, dizi.length); dizi.push(esKlon(kayit));
  });
  return cikar.size ? dizi.filter((x, i) => !cikar.has(i)) : dizi;
}
/** Yerelde açılan satışın belge numarası bulutta başka bir satışta kullanılmışsa yereldekine yeni numara
    verir; aynı yamadaki tahsilat notlarında geçen "Belge <eski>" atıflarını da düzeltir. Yamayı değiştirmez. */
function esBelgeNoDuzelt(m, yama, bag) {
  const sf = yama && yama.t === "n" && yama.a.sales && yama.a.sales.t === "d" ? yama.a.sales : null;
  if (!sf || !sf.ek.length) return yama;
  const mevcut = new Map();
  (Array.isArray(m && m.sales) ? m.sales : []).forEach((s) => { if (esDuz(s) && s.belgeNo) mevcut.set(String(s.belgeNo), s.id); });
  const carpisir = (s) => esDuz(s) && s.belgeNo && mevcut.has(String(s.belgeNo)) && mevcut.get(String(s.belgeNo)) !== s.id;
  if (!sf.ek.some(carpisir)) return yama;
  const y = esKlon(yama);
  let enBuyuk = Number(m && m.counters && m.counters.sale) || 0;
  const ys = y.a.counters && y.a.counters.t === "n" ? y.a.counters.a.sale : null;
  if (ys && typeof ys.v === "number") enBuyuk = Math.max(enBuyuk, ys.v);
  const tum = new Set(mevcut.keys());
  y.a.sales.ek.forEach((s) => { if (esDuz(s) && s.belgeNo) tum.add(String(s.belgeNo)); });
  y.a.sales.ek.forEach((s) => {
    if (!carpisir(s)) return;
    const eski = String(s.belgeNo), mt = /^(.*?)(\d+)$/.exec(eski);
    if (!mt) return;                                            // tanımadığımız biçim: dokunma
    tum.forEach((b) => { if (b.indexOf(mt[1]) === 0 && /^\d+$/.test(b.slice(mt[1].length))) enBuyuk = Math.max(enBuyuk, Number(b.slice(mt[1].length))); });
    let n = enBuyuk, yeni;
    do { n++; yeni = mt[1] + String(n).padStart(mt[2].length, "0"); } while (tum.has(yeni));
    enBuyuk = n; tum.add(yeni); s.belgeNo = yeni;
    const re = new RegExp("Belge " + eski.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?!\\d)", "g");
    if (y.a.payments && y.a.payments.t === "d") y.a.payments.ek.forEach((p) => { if (esDuz(p) && typeof p.not === "string") p.not = p.not.replace(re, "Belge " + yeni); });
    bag.notlar.push({ tur: "belgeNo", eski, yeni, id: s.id });
  });
  if (!y.a.counters || y.a.counters.t !== "n") y.a.counters = { t: "n", a: {}, s: [] };
  y.a.counters.a.sale = { t: "m", v: enBuyuk };
  return y;
}
/** Buluttaki hâlin üstüne bekleyen yamaları sırayla uygular → { store, notlar }. */
function esBirlestir(bulut, yamalar) {
  const bag = { esleme: {}, notlar: [] };
  let m = esDuz(bulut) ? bulut : {};
  (yamalar || []).forEach((y) => { if (y) m = esUygula(m, esBelgeNoDuzelt(m, y, bag), null, 0, bag); });
  return { store: m, notlar: bag.notlar };
}
/** Klasik üç yönlü birleştirme: taban (son ortak hâl), yerel, bulut → birleşmiş store. */
function ucYonluBirlestir(taban, yerel, bulut) { return esBirlestir(bulut, [esFark(taban, yerel, null, null, 0)]).store; }
/** Taban yokken (eski sürümden geçiş): yalnız "yerelde olup bulutta olmayan kayıtları ekle" yaması. Hiçbir şey silmez. */
function esTabansizFark(yerel, bulut) {
  const a = {};
  Object.keys(yerel || {}).forEach((k) => {
    const y = yerel[k];
    if (!Array.isArray(y) || !y.length) return;
    const varOlan = new Set(esAnahtarlar(Array.isArray(bulut && bulut[k]) ? bulut[k] : []));
    const ek = [];
    esAnahtarlar(y).forEach((an, i) => { if (an[0] === "i" && !varOlan.has(an)) ek.push(esKlon(y[i])); });
    if (ek.length) a[k] = { t: "d", ek, sil: {}, deg: {} };
  });
  return Object.keys(a).length ? { t: "n", a, s: [] } : null;
}
/** h'yi k'ya eşitler ama nesneleri YERİNDE günceller: açık bir pencerenin elinde tuttuğu müşteri/ürün
    nesnesi geçerli kalır (store toptan değiştirilseydi o nesneye yazılan değişiklik boşa giderdi). */
function esYerinde(h, k) {
  if (Array.isArray(k)) {
    if (!Array.isArray(h)) return esKlon(k);
    if (esIdli(k) && esIdli(h)) {
      const eski = new Map();
      h.forEach((x) => { if (!eski.has(x.id)) eski.set(x.id, x); });
      const yeni = k.map((x) => { const e = eski.get(x.id); if (e) { eski.delete(x.id); return esYerinde(e, x); } return esKlon(x); });
      h.length = 0; for (let i = 0; i < yeni.length; i++) h.push(yeni[i]);
      return h;
    }
    if (esEsit(h, k)) return h;
    const kopya = esKlon(k); h.length = 0; for (let i = 0; i < kopya.length; i++) h.push(kopya[i]);
    return h;
  }
  if (esDuz(k)) {
    if (!esDuz(h)) return esKlon(k);
    Object.keys(h).forEach((a) => { if (k[a] === undefined) delete h[a]; });
    Object.keys(k).forEach((a) => { if (k[a] !== undefined) h[a] = esYerinde(h[a], k[a]); });
    return h;
  }
  return k;
}
/** İki store arasındaki kayıt farkının sayımı (geri yükleme onayında "ne değişecek" demek için). */
function esKarsilastir(simdi, hedef) {
  const kol = {}; let toplam = 0;
  const adlar = new Set(Object.keys(simdi || {}).concat(Object.keys(hedef || {})));
  adlar.forEach((ad) => {
    const a = simdi && simdi[ad], b = hedef && hedef[ad];
    if (!Array.isArray(a) && !Array.isArray(b)) return;
    const da = Array.isArray(a) ? a : [], db = Array.isArray(b) ? b : [];
    const ma = new Map(), mb = new Map();
    esAnahtarlar(da).forEach((k, i) => ma.set(k, da[i]));
    esAnahtarlar(db).forEach((k, i) => mb.set(k, db[i]));
    let sil = 0, ek = 0, deg = 0;
    ma.forEach((v, k) => { if (!mb.has(k)) sil++; else if (!esEsit(v, mb.get(k))) deg++; });
    mb.forEach((v, k) => { if (!ma.has(k)) ek++; });
    if (sil || ek || deg) { kol[ad] = { sil, ek, deg }; toplam += sil + ek + deg; }
  });
  const ayar = !esEsit((simdi && simdi.settings) || {}, (hedef && hedef.settings) || {});
  return { kol, toplam, ayar };
}
/* </esitleme-saf> */

const BULUT_KEY = "babuco:store";
const ES_GUNLUK_KEY = BULUT_KEY + ":gunluk";   // localStorage: bu cihazın buluta henüz gitmemiş yamaları
const YEDEK_ONEK = "babuco:yedek:";            // bulut: günlük yedek = babuco:yedek:<YYYY-AA-GG>
const YEDEK_GUN = 30;                          // bu kadar gün tutulur
let _bulutHazir = false;      // buluttan ilk çekme başarıyla bitti mi
let _yazZamanlayici = null;
let _esKapi = false;          // giriş kapısı geçildi mi (geçilmeden buluta dokunulmaz)
let _esCalisiyor = null;      // süren eşitleme (aynı anda yalnız bir tane)
let _esTekrar = false;        // eşitleme sürerken yeni yazma istendi
let _esIlk = true;            // bu oturumda bulut kaydı henüz tam okunmadı
let _esCizBekliyor = false;   // ekranı yenileme ertelendi (kullanıcı yazıyor / pencere açık)
let _esCikis = false;         // çıkış yapıldı: yeniden giriş olana kadar telefona da buluta da hiçbir şey yazılmaz
let _esNesil = 0;             // her çıkışta artar: çıkıştan önce başlamış eşitleme sonradan hiçbir şeye dokunmaz
const _esDurum = { cevrimdisi: false, hata: "", hataSayisi: 0, sonraki: 0, depoDolu: false, yedekHata: "" };
let _esCihaz = esCihazKimligi();
let _esGunluk = esGunlukOku();
let _esTaban = esKlon(store); // açık yamanın ölçüldüğü hâl (son eşitlenen hâl ya da açılıştaki hâl)

/** Bu cihazın kimliği (localStorage "babuco:cihaz"); buluttaki store.esitleme bu anahtarla tutulur. */
function esCihazKimligi(yenile) {
  const uret = () => "c" + (Math.random().toString(36).slice(2, 10) + "00000000").slice(0, 8) + Date.now().toString(36).slice(-4);
  try {
    let c = yenile ? "" : localStorage.getItem("babuco:cihaz");
    if (!c) { c = uret(); localStorage.setItem("babuco:cihaz", c); }
    if (yenile) esCihazEki.e = "";
    return c;
  } catch (e) { return uret(); }
}
/** genId()'nin sonuna eklenen, cihaza özgü 3 harf. İki telefon aynı sıra numarasıyla aynı milisaniyede kayıt
    açarsa id'leri aynı çıkıyor, birleştirme ikisini tek kayıt sanıyordu (biri kayboluyordu). */
function esCihazEki() {
  if (!esCihazEki.e) esCihazEki.e = esCihazKimligi().slice(1, 4);
  return esCihazEki.e;
}
/** Günlük: { n: son yama no, y: [{k, f}] gönderilmeyi bekleyen dondurulmuş yamalar, acik: son eşitlemeden
    beri bu oturumda biriken yama, tabanTs: son eşitlenen bulut zamanı, ilkBekleyen, sonBasari, gecis } */
function esGunlukOku() {
  let g = null;
  try { g = JSON.parse(localStorage.getItem(ES_GUNLUK_KEY) || "null"); } catch (e) { g = null; }
  if (!g || typeof g !== "object" || !Array.isArray(g.y)) g = { v: 1, n: 0, y: [], acik: null, tabanTs: "", ilkBekleyen: 0, sonBasari: 0, gecis: true };
  g.n = Number(g.n) || 0;
  // Önceki oturumun açık yaması o oturumun tabanına göreydi; taban artık yok → numaralayıp dondur.
  if (g.acik) { g.n += 1; g.y.push({ k: g.n, f: g.acik }); g.acik = null; }
  return g;
}
function esGunlukYaz() {
  try { localStorage.setItem(ES_GUNLUK_KEY, JSON.stringify(_esGunluk)); return true; } catch (e) { return false; }
}
function esBekleyenVar() { return !!(_esGunluk.acik || _esGunluk.y.length); }
/** Bağlantı noktası (giriş bölümü çıkıştan önce sorar): bu telefonda buluta henüz gitmemiş değişiklik var mı? */
function bekleyenDegisiklikVar() {
  if (_esCikis) return false;
  try { return !!(_esGunluk.y.length || esFark(_esTaban, esKlon(store), null, null, 0)); }
  catch (e) { return esBekleyenVar(); }
}
/** Giriş bölümü bulutYetkiliMi() tanımladıysa ona sorar. Yetki yokken buluttan gelen boş yanıt "bulut boş"
    demek DEĞİLDİR: yazma, birleştirme, yedek alma/silme yapılmaz. Fonksiyon yoksa (bu dal tek başına) yetkili sayılır. */
async function esYetkili() {
  if (typeof bulutYetkiliMi !== "function") return true;
  try { return (await bulutYetkiliMi()) !== false; } catch (e) { return false; }
}
/** Çalışan store'u telefona yazar. Sıra önemli: önce küçük günlük (bekleyen değişiklik kaybolmasın),
    sonra store. Telefonun hafızası dolarsa store bellekte çalışmaya ve buluta gitmeye devam eder. */
function yerelKaydet() {
  if (_esCikis) return;            // çıkış yapıldı: cihazda kopya bırakma, "her şey silindi" diye yama da üretme
  let metin = null;
  try { metin = JSON.stringify(store); } catch (e) { console.error("store metne çevrilemedi", e); return; }
  try {
    _esGunluk.acik = esFark(_esTaban, JSON.parse(metin), null, null, 0);
    if (esBekleyenVar() && !_esGunluk.ilkBekleyen) _esGunluk.ilkBekleyen = Date.now();
  } catch (e) { console.error("eşitleme farkı çıkarılamadı", e); }
  let tamam = esGunlukYaz();
  try { localStorage.setItem(STORE_KEY, metin); } catch (e) { tamam = false; }
  _esDurum.depoDolu = !tamam;
  esSeritCiz();
}

/* ---- kv tablosu: düşük düzey ---- */
function esAgHatasi(h) { return /fetch|network|abort|load failed|timeout|internet|bulut-yok/i.test(String(h || "")); }
/** Supabase sorgusunu zaman aşımıyla çalıştırır → { data, hata }. Asla fırlatmaz. */
async function kvSor(kur, ms) {
  if (!SB) return { data: null, hata: "bulut-yok" };
  const ac = typeof AbortController === "function" ? new AbortController() : null;
  const t = setTimeout(() => { if (ac) ac.abort(); }, ms || 25000);
  try {
    let q = kur(SB.from("kv"));
    if (ac && q && typeof q.abortSignal === "function") q = q.abortSignal(ac.signal);
    const { data, error } = await q;
    if (error) return { data: null, hata: String(error.message || error.code || "hata"), kod: error.code || "" };
    return { data, hata: "" };
  } catch (e) { return { data: null, hata: String((e && e.message) || e || "hata") }; }
  finally { clearTimeout(t); }
}
/** Okuma. "kayıt yok" ile "okunamadı" AYRI sonuçlardır: { durum: "var" | "yok" | "hata" }.
    (Eskiden ikisi de null dönüyor, ağ hatası "bulut boş" sanılıp eldeki store buluta itiliyordu.) */
async function kvOku(key, sutun, ms) {
  const r = await kvSor((t) => t.select(sutun || "value, updated_at").eq("key", key).limit(1), ms);
  if (r.hata) return { durum: "hata", hata: r.hata };
  if (!r.data || !r.data.length) return { durum: "yok" };
  return { durum: "var", value: r.data[0].value, updatedAt: r.data[0].updated_at };
}
/** Koşullu yazma: yalnız bulut hâlâ beklenenTs'deyse yazar → "tamam" | "cakisma" (hiçbir şey yazılmadı) | "hata". */
async function kvKosulluYaz(key, value, ts, beklenenTs) {
  const r = await kvSor((t) => t.update({ value, updated_at: ts }).eq("key", key).eq("updated_at", beklenenTs).select("updated_at"), 60000);
  if (r.hata) return { durum: "hata", hata: r.hata };
  if (!r.data || !r.data.length) return { durum: "cakisma" };
  return { durum: "tamam", updatedAt: r.data[0].updated_at };
}
/** Yalnız kayıt YOKSA oluşturur (var olanın üstüne asla yazmaz). */
async function kvEkle(key, value, ts) {
  const r = await kvSor((t) => t.insert({ key, value, updated_at: ts }).select("updated_at"), 60000);
  if (r.hata) return /duplicate|23505|409/i.test(r.hata + " " + (r.kod || "")) ? { durum: "cakisma" } : { durum: "hata", hata: r.hata };
  return { durum: "tamam", updatedAt: r.data && r.data[0] ? r.data[0].updated_at : ts };
}
/** Diğer anahtarlar (puan, duyuru…) için eski sade okuma: yoksa da okunamazsa da null. */
async function kvGet(key) {
  const r = await kvOku(key);
  return r.durum === "var" ? { value: r.value, updatedAt: r.updatedAt } : null;
}
/** Diğer anahtarlar için sade yazma. Ana kayıt (babuco:store) buradan körlemesine YAZILMAZ; güvenli yola gider. */
async function kvSet(key, value, updatedAt) {
  if (!SB) return false;
  if (key === BULUT_KEY) return bulutaYaz(true);
  const r = await kvSor((t) => t.upsert({ key, value, updated_at: updatedAt }));
  return !r.hata;
}

/** Müşteri sipariş ekranında yalnız ön ödeme kuralı okunur; müşteri/cari verisi paylaşılmaz. */
function onSiparisKuralYaz(c) {
  const tel = (c && c.telefon || "").replace(/\D/g, "").replace(/^90/, "").replace(/^0/, "");
  if (!tel) return;
  const ts = new Date().toISOString();
  kvSet("babuco:on-siparis:policy:" + tel, { minPesinOrani: c.onSiparisMinPesin ? 0.4 : 0 }, ts);
}

/** Çay ocağı bayisiyse tahsilatın %1'ini işletme puanına ekle ve buluta yayınla.
 *  Çay ocağı uygulaması bunu Profil'de "Toptancı Puanım" olarak telefonla (bayi_puan:<tel>) okur
 *  ve ödül alınca aynı anahtardan DÜŞER. Bu yüzden kaynak = bulut (kv-authoritative): önce oku,
 *  ekle, yaz — yoksa çay ocağının harcaması bir sonraki kazanımla ezilir. */
async function bayiPuanEkle(c, tutar) {
  if (!c || !c.cayOcagi) return;
  const tel = (c.telefon || "").replace(/\D/g, "");
  if (!tel || !(tutar > 0)) return;
  const eklen = Math.round(tutar * 0.01); // 1 puan = 1 ₺
  const rec = await kvGet("bayi_puan:" + tel);
  const cur = rec && rec.value && typeof rec.value.puan === "number" ? rec.value.puan : (Number(c.puan) || 0);
  const yeni = cur + eklen;
  c.puan = yeni; // yerel cache (gösterim); kaynak buluttur
  const ts = new Date().toISOString();
  await kvSet("bayi_puan:" + tel, { puan: yeni, updatedAt: ts }, ts);
}

/** Eksik anahtarları emptyStore varsayılanlarıyla tamamla (buluttan gelen kayıt için). */
function bulutStoreBirlestir(parsed) {
  const base = emptyStore();
  for (const k in base) if (parsed[k] === undefined) parsed[k] = base[k];
  parsed.settings = Object.assign(base.settings, parsed.settings || {});
  parsed.counters = Object.assign(base.counters, parsed.counters || {});
  return parsed;
}

/** Store değişince buluta gönder (1 sn bekleyip toplu). hemen=true: beklemeden.
    Değişiklik zaten günlükte (telefonda) durduğu için bu çağrı kaçsa bile kayıt kaybolmaz. */
function bulutaYaz(hemen) {
  if (!SB) return hemen ? Promise.resolve(false) : undefined;
  clearTimeout(_yazZamanlayici); _yazZamanlayici = null;
  if (hemen) return esitle();
  _yazZamanlayici = setTimeout(() => { _yazZamanlayici = null; esitle(); }, 1000);
}
/** Uygulama arka plana alınırken / kapanırken: bekleyen varsa 1 sn'yi beklemeden dene.
    Yetişmezse sorun değil — günlük telefonda; bir sonraki açılışta birleştirilerek gider. */
function esHemenGonder() { if (esBekleyenVar()) bulutaYaz(true); }
function bulutHydrate() { return esitle(); }

function esSonrakiZaman(onceki) {   // buluttaki zamandan mutlaka ileri (aracın "değişmediyse yaz" koşulu buna dayanır)
  return new Date(Math.max(Date.now(), (Date.parse(onceki) || 0) + 1)).toISOString();
}
function esHata(h) {
  _esDurum.hata = String(h || "hata");
  _esDurum.cevrimdisi = (typeof navigator !== "undefined" && navigator.onLine === false) || esAgHatasi(h);
  _esDurum.hataSayisi += 1;
  // İnternet var ama sunucu kabul etmiyorsa aralığı aç (8 sn → en çok 5 dk); internet yoksa yoklama zaten bekletir.
  _esDurum.sonraki = _esDurum.cevrimdisi ? 0 : Date.now() + Math.min(300000, 4000 * Math.pow(2, Math.min(_esDurum.hataSayisi, 7)));
  return false;
}
function esTamam() { _esDurum.hata = ""; _esDurum.cevrimdisi = false; _esDurum.hataSayisi = 0; _esDurum.sonraki = 0; }
function esIlkHazir() {
  if (_bulutHazir) return;
  _bulutHazir = true;
  try { kategoriGocKontrol(); } catch (e) { console.error(e); }
}
function esYazildi() { try { window.dispatchEvent(new CustomEvent("babuco:bulut-yazildi")); } catch (e) {} }

/** Eşitle: buluttaki hâli oku, bekleyen yerel değişiklikleri üstüne uygula, koşullu yaz, sonucu ekrana al.
    Aynı anda tek eşitleme çalışır. Döner: Promise<boolean> (true = telefon ile bulut aynı hâlde). */
function esitle() {
  if (!SB || !_esKapi) return Promise.resolve(false);
  if (_esCalisiyor) { _esTekrar = true; return _esCalisiyor; }
  const p = esitleIc()
    .catch((e) => { console.error("eşitleme hatası", e); return esHata("ic: " + ((e && e.message) || e)); })
    .then((sonuc) => {
      if (_esCalisiyor === p) _esCalisiyor = null;
      esSeritCiz();
      if (_esTekrar) { _esTekrar = false; if (esBekleyenVar()) bulutaYaz(); }
      return sonuc;
    });
  _esCalisiyor = p;
  return p;
}
async function esitleIc() {
  const g = _esGunluk, nesil = _esNesil;
  const birakildi = () => !_esKapi || nesil !== _esNesil;   // bu arada çıkış yapıldı
  for (let deneme = 0; deneme < 5; deneme++) {
    // Gönderilecek bir şey yoksa koca kaydı indirmeden önce yalnız zamanına bak.
    if (!_esIlk && !esBekleyenVar()) {
      const z = await kvOku(BULUT_KEY, "updated_at", 12000);
      if (birakildi()) return false;
      if (z.durum === "hata") return esHata(z.hata);
      if (z.durum === "var" && z.updatedAt === g.tabanTs && !esBekleyenVar()) { esTamam(); return true; }
    }
    const b = await kvOku(BULUT_KEY);
    if (b.durum === "hata") return esHata(b.hata);       // OKUNAMADI ≠ BOŞ: buluta hiçbir şey itilmez
    if (!(await esYetkili())) return esHata("yetki-yok"); // YETKİSİZ boş yanıt da "boş" değildir
    if (birakildi()) return false;

    /* --- buradan bir sonraki await'e kadar tek solukta: yerel hâl tutarlı bir anda dondurulur --- */
    const yerel = esKlon(store);
    const acik = esFark(_esTaban, yerel, null, null, 0);

    if (b.durum === "yok") {
      // Bulutta gerçekten kayıt yok. Yalnız tohum katalog varsa itme; gerçek veri/değişiklik varsa OLUŞTUR
      // (insert: bu arada başkası oluşturduysa üstüne yazmaz, çakışma sayılır).
      const gercekVeri = (yerel.customers || []).length || (yerel.sales || []).length || (yerel.payments || []).length;
      if (!acik && !g.y.length && !gercekVeri) { _esIlk = false; esTamam(); esIlkHazir(); return true; }
      if (acik) { g.n += 1; g.y.push({ k: g.n, f: acik }); g.acik = null; }
      _esTaban = yerel; esGunlukYaz();
      const ilk = esKlon(yerel);
      ilk.esitleme = Object.assign({}, ilk.esitleme, { [_esCihaz]: g.n });
      const tsIlk = esSonrakiZaman("");
      const ri = await kvEkle(BULUT_KEY, ilk, tsIlk);
      if (birakildi()) return false;
      if (ri.durum === "cakisma") continue;
      if (ri.durum === "hata") return esHata(ri.hata);
      g.y = []; g.gecis = false; g.onay = g.n;
      esBenimse(ilk, ri.updatedAt || tsIlk);
      esTamam(); esIlkHazir(); esYazildi();
      return true;
    }
    if (!esDuz(b.value) || !Array.isArray(b.value.products)) return esHata("bulut-bozuk");   // tanımadığımız içerik: ne al ne ez

    // Bulut bu cihaz için bizim bildiğimizden ileri bir yama numarası söylüyorsa günlük kaybolmuş ya da
    // kimlik başka cihazla paylaşılıyor demektir: bekleyenleri "işlenmiş" sanmamak için yeni kimlik al.
    let islenen = Number((b.value.esitleme || {})[_esCihaz]) || 0;
    if (islenen > g.n) { _esCihaz = esCihazKimligi(true); g.y.forEach((x, i) => { x.k = i + 1; }); g.n = g.y.length; g.onay = 0; islenen = 0; }
    // Tersi: bulut, bu cihazın ONAYLANMIŞ bir yamasını artık tanımıyorsa kayıt eski bir hâlle ezilmiş demektir
    // (önbellekte kalmış eski panel sürümü körlemesine yazar). Engellenemez; en azından haber ver.
    if (islenen < (Number(g.onay) || 0)) { g.onay = islenen; g.ezilme = Date.now(); esBildir("Dikkat: buluttaki kayıtlar eski bir uygulama sürümüyle ezilmiş görünüyor. Profil → Yedekleme'den kontrol et."); }
    g.y = g.y.filter((x) => x.k > islenen);              // yazması ulaşmış ama yanıtı kaybolmuş yamalar: tekrar uygulanmaz

    if (g.gecis) {
      // Eski panel sürümünden ilk geçiş: taban yok. Eski sürüm "yerelim buluttan yeni" diyorsa (gönderemediği
      // kayıt kalmış olabilir) yerelde olup bulutta olmayan kayıtları ekle; hiçbir şeyi silme/ezme.
      g.gecis = false;
      let eskiTs = ""; try { eskiTs = localStorage.getItem(BULUT_KEY + ":ts") || ""; } catch (e) {}
      if (eskiTs && Date.parse(eskiTs) > Date.parse(b.updatedAt)) {
        const tf = esTabansizFark(yerel, b.value);
        if (tf) { g.n += 1; g.y.push({ k: g.n, f: tf }); }
      }
    }
    if (!acik && !g.y.length) {                          // gönderilecek bir şey yok → buluttaki hâli al
      esBenimse(b.value, b.updatedAt);
      esTamam(); esIlkHazir();
      return true;
    }
    if (acik) { g.n += 1; g.y.push({ k: g.n, f: acik }); g.acik = null; }
    _esTaban = yerel;
    esGunlukYaz();
    const br = esBirlestir(b.value, g.y.map((x) => x.f));
    const m = br.store;
    m.esitleme = Object.assign({}, m.esitleme, { [_esCihaz]: g.n });
    const sonK = g.n;
    /* --- tek soluk bitti --- */

    await gunlukYedekSagla(b);                           // günün ilk yazmasından ÖNCE buluttaki hâlin kopyası
    if (birakildi()) return false;
    const ts = esSonrakiZaman(b.updatedAt);
    const r = await kvKosulluYaz(BULUT_KEY, m, ts, b.updatedAt);
    if (birakildi()) return false;                       // yazma sürerken çıkış yapıldı: telefona bir şey alma
    if (r.durum === "hata") return esHata(r.hata);       // ulaştı mı bilinmez: yamalar günlükte, numaralı; sonra bakılır
    if (r.durum === "cakisma") {                         // araya başkası yazdı: hiçbir şey yazılmadı → baştan
      await new Promise((c) => setTimeout(c, 120 + Math.random() * 380));
      continue;
    }
    g.y = g.y.filter((x) => x.k > sonK);
    g.onay = sonK;
    esBenimse(m, r.updatedAt || ts, br.notlar);
    esTamam(); esIlkHazir(); esYazildi();
    return true;
  }
  return esHata("cakisma");
}
/** Eşitlenen hâli (m) telefona al. Eşitleme sürerken yapılan yeni yerel değişiklikler m'nin üstüne
    yeniden uygulanır (kaybolmaz, bir sonraki turda gider). */
function esBenimse(m, ts, notlar) {
  if (_esCikis) return;
  const g = _esGunluk;
  const simdi = esKlon(store);
  const acik = esFark(_esTaban, simdi, null, null, 0);
  const taban = bulutStoreBirlestir(esKlon(m));
  const br = acik ? esBirlestir(taban, [acik]) : null;      // esYerinde hedefi kopyalayarak alır; ayrı kopya gerekmez
  const hedef = br ? bulutStoreBirlestir(br.store) : taban;
  if (br) notlar = (notlar || []).concat(br.notlar);
  // Ekranların tembel oluşturduğu boş koleksiyonlar (store.x = store.x || []) yerinde kalsın.
  Object.keys(store).forEach((k) => { if (hedef[k] === undefined && esBos(store[k])) { hedef[k] = esKlon(store[k]); taban[k] = esKlon(store[k]); } });
  const degisti = !esEsit(simdi, hedef);
  if (degisti) esYerinde(store, hedef);
  _esTaban = taban;
  g.acik = acik ? esFark(taban, hedef, null, null, 0) : null;
  g.tabanTs = ts || "";
  g.sonBasari = Date.now();
  if (!esBekleyenVar()) g.ilkBekleyen = 0;
  _esIlk = false;
  // Sıra önemli (yerelKaydet'in tersi): önce store, sonra günlük. Arada kesilirse günlükteki eski yamalar
  // bulutta "işlendi" göründüğü için atılır; tersi olsaydı telefon eski hâlde kalıp fark edilmezdi.
  let tamam = true;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { tamam = false; }
  tamam = esGunlukYaz() && tamam;
  _esDurum.depoDolu = !tamam;
  // Ekranı yalnız GÖRÜNEN bir şey değiştiyse yeniden çiz. Her yazmada değişen eşitleme sayacı (store.esitleme)
  // tek başına yeniden çizim sebebi değil — yoksa her kayıttan 1 sn sonra yarım doldurulmuş form silinir.
  if (degisti && !esEsit(Object.assign({}, simdi, { esitleme: null }), Object.assign({}, hedef, { esitleme: null }))) esEkranYenile();
  (notlar || []).forEach((n) => { if (n.tur === "belgeNo") esBildir("Fiş numarası değişti: " + n.eski + " → " + n.yeni + ". Aynı numara başka bir cihazda da kullanılmıştı."); });
  if (g.acik) bulutaYaz();
}
/** Bulut yeni hâl getirdiğinde ekranı yenile; kullanıcı yazarken, pencere açıkken ya da sepet doluyken
    bekle (veri yerinde güncellendi, yalnız görüntü gecikir) — internetKontrol sonra tekrar dener. */
function esEkranYenile() {
  try {
    const a = document.activeElement;
    const yaziyor = !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    let sepetDolu = false;
    try { sepetDolu = currentRoute() === "satis" && pos.carts[pos.active].items.length > 0; } catch (e) {}
    if (yaziyor || sepetDolu || document.querySelector(".modal-overlay") || document.body.classList.contains("sheet-open")) { _esCizBekliyor = true; return; }
    _esCizBekliyor = false;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  } catch (e) { console.error(e); }
}
function esBildir(metin) {
  try {
    const el = document.createElement("div");
    el.className = "es-bildirim"; el.setAttribute("role", "status"); el.textContent = metin;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 9000);
  } catch (e) {}
}

/* ---- Yedek: günde bir otomatik + istenince; son 30 gün ---- */
/** İstanbul saatine göre { gun: "YYYY-AA-GG", saat: "SSDDss" } — panel de araç da aynı günü hesaplasın diye. */
function esGunSaat(d) {
  d = d || new Date();
  try {
    const p = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
    return { gun: p.year + "-" + p.month + "-" + p.day, saat: (p.hour === "24" ? "00" : p.hour) + p.minute + p.second };
  } catch (e) { return { gun: localDateStr(d), saat: pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) }; }
}
function esYedekAnahtari(etiket) {
  const z = esGunSaat();
  const ek = String(etiket || "elle").toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "elle";
  return YEDEK_ONEK + z.gun + "-" + z.saat + "-" + ek;
}
/** Yedek satırı yazar: { ozet, store }. Aynı anahtar varsa DOKUNMAZ (günün ilk yedeği korunur). */
async function yedekYaz(key, deger, ek) {
  const s = esDuz(deger) ? deger : {};
  const say = (k) => (Array.isArray(s[k]) ? s[k].length : 0);
  const ozet = Object.assign({ satis: say("sales"), musteri: say("customers"), tahsilat: say("payments"), urun: say("products"), alindi: new Date().toISOString(), kim: "panel" }, ek || {});
  const r = await kvSor((t) => t.upsert({ key, value: { ozet, store: deger }, updated_at: new Date().toISOString() }, { onConflict: "key", ignoreDuplicates: true }), 60000);
  return !r.hata;
}
/** Yedeği yazar ve GERÇEKTEN yazıldığını okuyarak doğrular (silme / geri yükleme bu "true"ya güvenir). → kesin true | false */
async function yedekYazDogrula(key, deger, ek) {
  if (!(await esYetkili())) return false;
  if (!(await yedekYaz(key, deger, ek))) return false;
  const v = await kvOku(key, "key", 15000);
  return v.durum === "var";
}
/** Bugünün yedeği bulutta yoksa, verilen (yazmadan önceki) bulut hâlini yedek olarak koyar.
    Yedek alınamazsa yazma ENGELLENMEZ (satışlar bekletilmez) ama Yedekleme ekranında görünür ve sonraki yazmada yine denenir. */
async function gunlukYedekSagla(b) {
  if (!(await esYetkili())) return false;
  const gun = esGunSaat().gun;
  try { if (localStorage.getItem(YEDEK_ONEK + "son") === gun) return true; } catch (e) {}
  const key = YEDEK_ONEK + gun;
  const v = await kvOku(key, "key", 15000);
  if (v.durum === "hata") { _esDurum.yedekHata = v.hata; return false; }
  if (v.durum === "yok") {
    if (!(await yedekYaz(key, b.value, { tur: "gunluk", kaynakTs: b.updatedAt }))) { _esDurum.yedekHata = "yedek yazılamadı"; return false; }
    yedekBudama();                                         // beklemeden: eski yedekleri temizle
  }
  _esDurum.yedekHata = "";
  try { localStorage.setItem(YEDEK_ONEK + "son", gun); } catch (e) {}
  return true;
}
/** Tarihi YEDEK_GUN günden eski yedekleri siler. */
async function yedekBudama() {
  if (!(await esYetkili())) return 0;
  const r = await kvSor((t) => t.select("key").like("key", YEDEK_ONEK + "%").limit(1000), 20000);
  if (r.hata || !r.data) return 0;
  const sinir = esGunSaat(new Date(Date.now() - YEDEK_GUN * 86400000)).gun;
  const eski = r.data.map((x) => x.key).filter((k) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(k).slice(YEDEK_ONEK.length)); return m && m[1] <= sinir; });
  for (const k of eski) await kvSor((t) => t.delete().eq("key", k), 15000);
  return eski.length;
}
/** Buluttaki O ANKİ hâlin kopyasını ayrı bir yedek olarak alır (ör. "silme-oncesi"). Başarıda true.
    Telefonda bekleyen kayıt varsa önce onları göndermeyi dener ki yedekte onlar da olsun. */
async function yedekAl(etiket) {
  if (!SB) return false;
  try {
    while (_esCalisiyor) await _esCalisiyor;
    if (_esKapi && esBekleyenVar()) await esitle();
    if (!(await esYetkili())) return false;
    const b = await kvOku(BULUT_KEY);
    if (b.durum === "hata") return false;
    const ok = await yedekYazDogrula(esYedekAnahtari(etiket), b.durum === "var" ? b.value : esKlon(store), { tur: String(etiket || "elle"), kaynakTs: b.updatedAt || "" });
    return ok === true;
  } catch (e) { console.error(e); return false; }
}
/** Telefonda bekleyen her şeyi gönder ve buluttaki son hâli al. true = telefon ile bulut şu an aynı. */
async function esHepsiniGonder() {
  if (!SB || !_esKapi) return false;
  for (let i = 0; i < 3; i++) {
    while (_esCalisiyor) await _esCalisiyor;
    _esDurum.sonraki = 0;
    const ok = await esitle();
    if (ok && !esBekleyenVar()) return true;
    if (!ok && _esDurum.cevrimdisi) return false;
  }
  return false;
}
/** Buluttaki kaydı TÜMÜYLE verilen store ile değiştirir (geri yükleme). Önce şimdiki hâlin yedeğini alır;
    yedek alınamazsa ya da bulut beklenenTs'den beri değiştiyse HİÇBİR ŞEY yazmaz. → { tamam, mesaj } */
async function esTamDegistir(yeni, etiket, beklenenTs) {
  while (_esCalisiyor) await _esCalisiyor;
  let birak; const kilit = new Promise((c) => { birak = c; });
  _esCalisiyor = kilit;
  try {
    if (!(await esYetkili())) return { tamam: false, mesaj: "Oturum açık değil. Hiçbir şey değiştirilmedi." };
    const b = await kvOku(BULUT_KEY);
    if (b.durum === "hata") return { tamam: false, mesaj: "İnternete ulaşılamadı. Hiçbir şey değiştirilmedi." };
    if (b.durum === "var" && beklenenTs && b.updatedAt !== beklenenTs) return { tamam: false, mesaj: "Bu sırada başka bir cihazdan kayıt girildi. Hiçbir şey değiştirilmedi; lütfen tekrar dene." };
    if (b.durum === "var" && !(await yedekYazDogrula(esYedekAnahtari(etiket), b.value, { tur: String(etiket || "elle"), kaynakTs: b.updatedAt }))) {
      return { tamam: false, mesaj: "Şimdiki hâlin yedeği alınamadı. Hiçbir şey değiştirilmedi." };
    }
    const m = bulutStoreBirlestir(esKlon(yeni));
    const es = Object.assign({}, m.esitleme);              // cihazların yama sayaçları geri gitmesin
    const bes = (b.durum === "var" && esDuz(b.value) && b.value.esitleme) || {};
    Object.keys(bes).forEach((c) => { es[c] = Math.max(Number(es[c]) || 0, Number(bes[c]) || 0); });
    m.esitleme = es;
    const ts = esSonrakiZaman(b.durum === "var" ? b.updatedAt : "");
    const r = b.durum === "var" ? await kvKosulluYaz(BULUT_KEY, m, ts, b.updatedAt) : await kvEkle(BULUT_KEY, m, ts);
    if (r.durum === "cakisma") return { tamam: false, mesaj: "Bu sırada başka bir cihazdan kayıt girildi. Hiçbir şey değiştirilmedi; lütfen tekrar dene." };
    if (r.durum !== "tamam") return { tamam: false, mesaj: "Gönderilemedi. İnternet bağlantını kontrol edip tekrar dene." };
    _esGunluk.y = []; _esGunluk.acik = null; _esTaban = esKlon(store);   // her şey yeni hâlle değişiyor: bekleyen yok
    esBenimse(m, r.updatedAt || ts);
    esTamam(); esYazildi();
    return { tamam: true, mesaj: "" };
  } catch (e) {
    console.error(e);
    return { tamam: false, mesaj: "Beklenmeyen bir hata oldu. Hiçbir şey değiştirilmedi." };
  } finally {
    if (_esCalisiyor === kilit) _esCalisiyor = null;
    birak(false);
  }
}
const ES_KOL_ADI = { sales: "satış", payments: "tahsilat", customers: "müşteri", products: "ürün", expenses: "gider", incomes: "gelir", purchases: "alış", firmalar: "firma", iadeler: "iade" };
function esFarkMetni(fark) {
  const satir = (alan, baslik) => {
    const p = []; let diger = 0;
    Object.keys(fark.kol).forEach((k) => { const n = fark.kol[k][alan]; if (!n) return; if (ES_KOL_ADI[k]) p.push(n + " " + ES_KOL_ADI[k]); else diger += n; });
    if (diger) p.push(diger + " diğer kayıt");
    return p.length ? baslik + ": " + p.join(", ") : "";
  };
  const s = [satir("sil", "Silinecek (şimdi var, yedekte yok)"), satir("ek", "Geri gelecek (şimdi yok, yedekte var)"), satir("deg", "Yedekteki hâline dönecek"), fark.ayar ? "Ayarlar yedekteki hâline dönecek." : ""].filter(Boolean);
  return s.length ? s.join("\n") : "Şimdiki kayıtlarla bu yedek arasında fark yok.";
}
/** Bir yedeği (buluttan ya da dosyadan) geri yükler: fark söylenir, onay alınır, şimdiki hâl yedeklenir, güvenli yazılır. */
async function yedektenYukle(hedefHam, etiket, ad) {
  const hedef = bulutStoreBirlestir(esKlon(hedefHam));
  if (!SB) {                                               // bulutsuz kurulum: yalnız bu cihaz
    if (!confirm("Mevcut TÜM veri bu yedekle DEĞİŞTİRİLECEK. Devam edilsin mi?")) return false;
    esYerinde(store, hedef); saveStore(); alert("Yedek geri yüklendi ✔"); navigate("anasayfa"); render();
    return true;
  }
  if (!(await esHepsiniGonder())) { alert("İnternete ulaşılamadı.\n\nGeri yükleme için internet gerekir. Hiçbir şey değiştirilmedi."); return false; }
  const fark = esKarsilastir(store, hedef);
  if (!confirm(ad + " geri yüklenecek.\n\n" + esFarkMetni(fark) + "\n\nÖnce şimdiki hâlin yedeği alınır; istersen ona geri dönebilirsin.\n\nDevam edilsin mi?")) return false;
  const r = await esTamDegistir(hedef, etiket, _esGunluk.tabanTs);
  if (!r.tamam) { alert(r.mesaj); return false; }
  alert("Geri yüklendi ✔");
  navigate("anasayfa"); render();
  return true;
}
/* Yedekleme sekmesi (Profil) */
const ES_ETIKET_ADI = { "geri-donus-oncesi": "Geri dönmeden önceki hâl", "dosya-oncesi": "Dosyadan yüklemeden önceki hâl", "silme-oncesi": "Silmeden önceki hâl", "geri-yukleme-oncesi": "Geri yüklemeden önceki hâl", elle: "Elle alınan yedek" };
function esYedekCoz(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2})(\d{2}))?(?:-(.+))?$/.exec(String(key).slice(YEDEK_ONEK.length));
  if (!m) return null;
  const tarih = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  const gunAdi = tarih.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
  if (!m[4] && !m[7]) return { key, gunluk: true, baslik: gunAdi, alt: "Gün başlarken" };
  return { key, gunluk: false, baslik: gunAdi + (m[4] ? " · " + m[4] + ":" + m[5] : ""), alt: ES_ETIKET_ADI[m[7]] || (m[7] || "").replace(/-/g, " ") };
}
async function yedekListeGetir() {
  const r = await kvSor((t) => t.select("key, updated_at, ozet:value->ozet").like("key", YEDEK_ONEK + "%").order("key", { ascending: false }).limit(200), 20000);
  if (r.hata) return null;
  return (r.data || []).map((x) => { const c = esYedekCoz(x.key); return c ? Object.assign(c, { ozet: x.ozet || {} }) : null; }).filter(Boolean);
}
function yedekDurumHTML() {
  const g = _esGunluk;
  const son = g.sonBasari ? fmtDate(new Date(g.sonBasari).toISOString()) : "henüz yok";
  const bek = esBekleyenVar() ? `<b class="yd-uyari">${esc(esBekleyenMetni())} gönderilmeyi bekliyor</b>` : "Bekleyen kayıt yok ✔";
  return `<div><span>İnternete son gönderim</span><b>${esc(son)}</b></div><div><span>Telefonda bekleyen</span>${bek}</div>` +
    (_esDurum.yedekHata ? `<div><span>Günlük yedek</span><b class="yd-uyari">Bugünkü yedek alınamadı; sonraki kayıtta yine denenecek.</b></div>` : "") +
    (g.ezilme ? `<div><span>Dikkat</span><b class="yd-uyari">${esc(fmtDate(new Date(g.ezilme).toISOString()))} sıralarında buluttaki kayıtlar eski bir uygulama sürümüyle ezildi. Eksik kayıt varsa aşağıdan önceki bir yedeğe dönebilirsin.</b></div>` : "");
}
async function yedekSekmeKur() {
  const kutu = document.getElementById("yedekListe"), durum = document.getElementById("yedekDurum");
  if (!kutu) return;
  if (durum) durum.innerHTML = yedekDurumHTML();
  const simdi = document.getElementById("yedekSimdiBtn");
  if (simdi && !simdi._bagli) {
    simdi._bagli = true;
    simdi.addEventListener("click", async () => {
      simdi.disabled = true; simdi.textContent = "Yedek alınıyor…";
      const ok = await yedekAl("elle");
      alert(ok ? "Yedek alındı ✔" : "Yedek alınamadı. İnternet bağlantını kontrol edip tekrar dene.");
      if (document.body.contains(simdi)) { simdi.disabled = false; simdi.textContent = "Şimdi yedek al"; yedekSekmeKur(); }
    });
  }
  if (!SB) { kutu.innerHTML = `<p class="hint">Bulut bağlantısı yok; yalnız dosyaya yedek alınabilir.</p>`; return; }
  kutu.innerHTML = `<p class="hint">Yedekler getiriliyor…</p>`;
  const liste = await yedekListeGetir();
  if (!document.body.contains(kutu)) return;
  if (!liste) { kutu.innerHTML = `<p class="hint">Yedek listesi alınamadı. İnternet gelince bu sayfayı yeniden aç.</p>`; return; }
  if (!liste.length) { kutu.innerHTML = `<p class="hint">Henüz yedek yok. İlk yedek, bir sonraki kayıtla birlikte kendiliğinden alınır.</p>`; return; }
  const ILK = 8;                                           // uzun liste ekranı doldurmasın: son 8'i göster, gerisi istenince
  kutu.classList.remove("hepsi");
  kutu.innerHTML = liste.map((y, i) => `<div class="yedek-satir${i >= ILK ? " ys-eski" : ""}">
      <div class="ys-bilgi"><b>${esc(y.baslik)}</b><small>${esc(y.alt)} · ${Number(y.ozet.satis) || 0} satış · ${Number(y.ozet.musteri) || 0} müşteri</small></div>
      <button class="btn soft" type="button" data-yedek="${i}">Bu hâle dön</button>
    </div>`).join("") + (liste.length > ILK ? `<button class="btn soft ys-hepsi" id="yedekHepsiBtn" type="button">Daha eski ${liste.length - ILK} yedeği göster</button>` : "");
  const hepsi = document.getElementById("yedekHepsiBtn");
  if (hepsi) hepsi.addEventListener("click", () => kutu.classList.add("hepsi"));
  kutu.querySelectorAll("[data-yedek]").forEach((b) => b.addEventListener("click", async () => {
    const y = liste[Number(b.dataset.yedek)];
    b.disabled = true; b.textContent = "Getiriliyor…";
    const v = await kvOku(y.key, "value", 60000);
    const icerik = v.durum === "var" && v.value ? (v.value.store || v.value) : null;
    if (!icerik || !Array.isArray(icerik.products)) alert("Yedek okunamadı. İnternet bağlantını kontrol edip tekrar dene.");
    else await yedektenYukle(icerik, "geri-donus-oncesi", y.baslik + " (" + y.alt + ") yedeği");
    if (document.body.contains(b)) { b.disabled = false; b.textContent = "Bu hâle dön"; yedekSekmeKur(); }
  }));
}

/* ---- İnternet durumu: veri telefondaysa internetsiz de çalışılır (üstte küçük şerit);
        telefonda hiç veri yoksa (ilk kurulum) tam ekran örtü kalır ---- */
async function sbPing() {
  if (!SB) return false;
  const r = await kvSor((t) => t.select("key").limit(1), 8000);
  return !r.hata;
}
function internetOverlay(goster) {
  let el = document.getElementById("net-kapi");
  if (goster && !el) {
    el = document.createElement("div");
    el.id = "net-kapi";
    el.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#0f1115;color:#e8e8ea;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px";
    el.innerHTML = '<div style="font-size:48px">📡</div><div style="font-weight:700;font-size:20px">İnternet bağlantısı gerekli</div><div style="opacity:.75;max-width:320px">Bu telefona veriler henüz inmedi. İlk açılış için internet gerekir; bağlantı gelince kendiliğinden açılır.</div>';
    document.body.appendChild(el);
  } else if (!goster && el) { el.remove(); }
}
/** Çevrimdışı kabuk (sw.js): panel bir kez açıldıysa internet yokken de AÇILABİLSİN diye sayfanın kendi
    dosyalarını saklar. Önce-ağ çalışır: internet varken hep yeni sürüm gelir. Geliştirme/deneme adresinde
    (localhost) kurulmaz — orada ağ isteklerini denemeler yönetir. */
function esKabukKur() {
  try {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    let dene = false; try { dene = localStorage.getItem("babuco:sw-dene") === "1"; } catch (e) {}
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !dene) return;
    navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then((kayit) => {
      const gonder = () => {
        const adresler = [location.href.split("#")[0]];
        try { performance.getEntriesByType("resource").forEach((r) => { if (r.name.indexOf(location.origin + "/") === 0) adresler.push(r.name.split("#")[0]); }); } catch (e) {}
        if (kayit.active) kayit.active.postMessage({ tur: "kabuk", adresler });
      };
      if (document.readyState === "complete") gonder(); else window.addEventListener("load", gonder);
    }).catch(() => {});
  } catch (e) {}
}
/** Çıkış (giriş bölümü "babuco:cikis" yayınlar): eşitlemeyi durdur, bellekteki günlüğü boşalt. Bu andan sonra
    store boşaltılsa bile "her şey silindi" yaması ÜRETİLMEZ ve telefona hiçbir kopya yazılmaz.
    Yerel anahtarların hepsi "babuco:" ile başlar; giriş bölümü çıkışta onları topluca siler. */
function esCikisYapildi() {
  _esCikis = true; _esKapi = false; _bulutHazir = false; _esIlk = true; _esNesil += 1;
  clearTimeout(_yazZamanlayici); _yazZamanlayici = null;
  _esGunluk = { v: 1, n: 0, y: [], acik: null, tabanTs: "", ilkBekleyen: 0, sonBasari: 0, gecis: true };
  try { localStorage.removeItem(ES_GUNLUK_KEY); localStorage.removeItem(YEDEK_ONEK + "son"); } catch (e) {}
  esSeritCiz();
}
/** Yeniden giriş ("babuco:giris"): çıkıştan sonra geldiyse sıfırdan başla — o anki store taban olur, bulut alınır.
    Çıkış olmadan gelen giriş olayı (açılıştaki oturum) bekleyen kayıtlara DOKUNMAZ; yalnız eşitlemeyi dürter. */
function esGirisYapildi() {
  if (_esCikis) {
    _esCikis = false;
    try { localStorage.removeItem(ES_GUNLUK_KEY); } catch (e) {}
    _esCihaz = esCihazKimligi(); esCihazEki.e = "";
    _esGunluk = esGunlukOku();
    _esTaban = esKlon(store);
    _esIlk = true;
  }
  _esKapi = true; _esDurum.sonraki = 0;
  internetKontrol(true);
}
/** Bu telefonda daha önce buluttan çekilmiş (ya da burada girilmiş) veri var mı? */
function esCihazdaVeriVar() {
  if (_esGunluk.tabanTs || esBekleyenVar()) return true;
  try { if (localStorage.getItem(BULUT_KEY + ":ts")) return true; } catch (e) {}
  return (store.customers || []).length > 0 || (store.sales || []).length > 0;
}
function esSureMetni(ms) {
  const dk = Math.floor(ms / 60000);
  if (dk < 60) return Math.max(1, dk) + " dakikadır";
  const sa = Math.floor(dk / 60);
  return sa < 48 ? sa + " saattir" : Math.floor(sa / 24) + " gündür";
}
function esBekleyenMetni() {
  let satis = 0, tahsilat = 0;
  _esGunluk.y.map((x) => x.f).concat(_esGunluk.acik ? [_esGunluk.acik] : []).forEach((f) => {
    const a = (f && f.a) || {};
    if (a.sales && a.sales.t === "d") satis += a.sales.ek.length;
    if (a.payments && a.payments.t === "d") tahsilat += a.payments.ek.length;
  });
  const p = [];
  if (satis) p.push(satis + " satış");
  if (tahsilat) p.push(tahsilat + " tahsilat");
  return p.length ? p.join(", ") : "Yaptığın değişiklikler";
}
/** Üstteki durum şeridi: internet yok / kayıtlar gönderilemiyor / telefon hafızası dolu. Her şey yolundaysa görünmez. */
function esSeritCiz() {
  if (typeof document === "undefined" || !document.body) return;
  const bekleyen = esBekleyenVar();
  const sure = bekleyen && _esGunluk.ilkBekleyen ? Date.now() - _esGunluk.ilkBekleyen : 0;
  let tur = "", baslik = "", alt = "";
  if (_esDurum.depoDolu) {
    tur = "hata"; baslik = "Telefonun hafızası doldu";
    alt = "Kayıtlar internete gönderiliyor ama telefonda saklanamıyor. İnternet varken kullan.";
  } else if (_esDurum.cevrimdisi) {
    tur = "uyari"; baslik = "İnternet yok";
    alt = bekleyen ? esBekleyenMetni() + " telefonda bekliyor. Bağlantı gelince gönderilecek." : "Kayıtlar telefonda tutulur, bağlantı gelince gönderilir.";
    if (bekleyen && sure > 3600000) { tur = "hata"; alt = esBekleyenMetni() + " " + esSureMetni(sure) + " gönderilemedi. İnternete bağlanınca gidecek."; }
  } else if (bekleyen && sure > 90000) {
    tur = "hata"; baslik = "Kayıtlar gönderilemiyor";
    alt = esBekleyenMetni() + " " + esSureMetni(sure) + " bekliyor. Tekrar denemek için dokun.";
  }
  let el = document.getElementById("es-serit");
  if (!tur) {
    if (el) el.remove();
    document.body.classList.remove("es-seritli");
    return;
  }
  if (!el) {
    el = document.createElement("button");
    el.id = "es-serit"; el.type = "button";
    el.addEventListener("click", () => { _esDurum.sonraki = 0; internetKontrol(true); });
    document.body.appendChild(el);
  }
  el.className = "es-serit " + tur;
  const html = `<span class="es-ikon" aria-hidden="true">${tur === "uyari" ? "📡" : "⚠️"}</span><span class="es-yazi"><b>${esc(baslik)}</b><small>${esc(alt)}</small></span>`;
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
  document.body.classList.add("es-seritli");
  document.documentElement.style.setProperty("--es-serit-h", el.offsetHeight + "px");
}
/** 8 sn'de bir + ekrana dönünce + bağlantı değişince: internet var mı, bulut değişmiş mi, bekleyen var mı → gerekiyorsa eşitle. */
async function internetKontrol(zorla) {
  if (!_esKapi) return;
  if (!SB) { _esDurum.cevrimdisi = true; internetOverlay(!esCihazdaVeriVar()); esSeritCiz(); return; }
  const z = navigator.onLine === false ? { durum: "hata", hata: "network: cihaz çevrimdışı" } : await kvOku(BULUT_KEY, "updated_at", 8000);
  const agYok = z.durum === "hata" && (navigator.onLine === false || esAgHatasi(z.hata));
  _esDurum.cevrimdisi = agYok;
  internetOverlay(agYok && !esCihazdaVeriVar());
  if (!agYok && z.durum !== "hata") {
    const gerek = _esIlk || esBekleyenVar() || (z.durum === "var" && z.updatedAt !== _esGunluk.tabanTs);
    if (gerek && (zorla === true || Date.now() >= _esDurum.sonraki)) esitle();
  }
  if (_esCizBekliyor) esEkranYenile();
  esSeritCiz();
}

function caySiparisAl(raw) {
  const order = decodeCaySiparis(raw);
  if (!order) { alert("Kod okunamadı — geçerli bir çay ocağı sipariş kodu değil (CAYSIP1:...)."); return; }
  if (order.id && store.gelenSiparisler.some((o) => o.orderId === order.id)) { alert("Bu sipariş zaten alınmış."); return; }
  const items = order.lines.map((l) => ({ ad: l.name, birim: l.birim, adet: Number(l.qty) || 0, fiyat: Number(l.unitPrice) || 0 }));
  const toplam = items.reduce((n, l) => n + l.adet * l.fiyat, 0);
  store.gelenSiparisler.push({
    id: genId(), orderId: order.id || "", dealer: (order.from && order.from.name) || "Bilinmeyen bayi",
    dealerTel: (order.from && order.from.phone) || "", not: order.note || "", tarih: order.date || new Date().toISOString(),
    alindi: new Date().toISOString(), durum: "yeni", items, toplam,
    teklifNo: "", fisNo: "", teslimTarih: "", teslimSaat: "", saleId: "",
  });
  saveStore(); render();
  alert("Sipariş alındı ✔");
}

/* --- aşama aksiyonları --- */
function cayOnayla(o) { o.durum = "onay"; o.teklifNo = "TKF-" + Date.now().toString().slice(-6); saveStore(); render(); cayDurumBulut(o); alert("Onaylandı ✔ Teklif hazır (" + o.teklifNo + ")."); }
function cayDagitim(o) {
  const gun = prompt("Teslimat günü (örn. 18 Tem Cuma):", o.teslimTarih || "");
  if (gun == null) return;
  const saat = prompt("Teslimat saati (örn. 10:00):", o.teslimSaat || "");
  o.teslimTarih = gun.trim(); o.teslimSaat = (saat || "").trim();
  o.fisNo = "FIS-" + Date.now().toString().slice(-6); o.durum = "dagitim";
  saveStore(); render(); cayDurumBulut(o);
  if (confirm("Dağıtıma alındı ✔ Fiş oluştu (" + o.fisNo + ").\nMüşteriye WhatsApp'tan gönderilsin mi?")) cayGonder(o);
}
function cayGonder(o) {
  const st = store.settings;
  const satir = o.items.map((l) => `• ${num2.format(l.adet)} ${l.birim} ${l.ad} — ${money.format(l.fiyat * l.adet)}`).join("\n");
  const tesl = o.teslimTarih ? `\nTeslim: ${o.teslimTarih} ${o.teslimSaat || ""}` : "";
  const txt = `${st.firmaAdi} — SİPARİŞ FİŞİ\nFiş No: ${o.fisNo || "-"}\n${satir}\nTOPLAM: ${money.format(o.toplam)}${tesl}`;
  const tel = (o.dealerTel || "").replace(/\D/g, "");
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(txt)}`, "_blank");
}
/* Teslim: sipariş satışa çevrilir. Hesap araçla ortak (stkSiparisTeslim) — `siparis-teslim` komutu aynı sonucu verir.
   havuz: mal nereden çıktı ("dukkan" | "arac"); verilmezse o anki satış modu (serviste araç). */
function cayTeslim(o, odemeTuru, havuz) {
  if (o.saleId) { alert("Bu sipariş zaten teslim edilip rapora işlendi."); return; }
  const r = stkSiparisTeslim(store, o, odemeTuru, havuz || stokModu, stkA(), true);
  saveStore(); render(); cayDurumBulut(o);
  const son = r.odemeTuru === "bakiye" ? "Bayinin açık hesabına yazıldı: " + o.dealer : r.odemeTuru === "nakit-acik" || r.odemeTuru === "kart-acik" ? money.format(r.minPesin) + " peşin tahsil edildi, " + money.format(r.toplam - r.minPesin) + " açık hesaba yazıldı" : r.odemeAdi + " olarak tahsil edildi";
  alert("Teslim edildi ✔ Satış raporlara işlendi (Belge " + r.sale.belgeNo + ").\n" + son + ".\nMal " + stkHavuzAd(r.stokKaynak).toLocaleLowerCase("tr-TR") + " stoğundan düşüldü." + (r.eslesmeyen.length ? "\n\nÜrün listesinde bulunamadı (stok düşmedi): " + r.eslesmeyen.join(", ") : ""));
}
/* Teslim ödeme seçimi — nakit / kart / bakiye (açık hesap) */
function cayTeslimOde(o) {
  if (o.saleId) { alert("Bu sipariş zaten teslim edilip rapora işlendi."); return; }
  const cust = stkSiparisMusteri(store, o);
  const minPesin = cust && cust.onSiparisMinPesin ? kurus(Number(o.toplam) * 0.4) : 0;
  const acikHesapSecenek = minPesin
    ? `<button class="btn cay-ode cay-ode-bakiye" type="button" data-ode="nakit-acik">Nakit %40 + Açık Hesap<br><small>${money.format(minPesin)} peşin</small></button><button class="btn cay-ode cay-ode-bakiye" type="button" data-ode="kart-acik">Kart %40 + Açık Hesap<br><small>${money.format(minPesin)} peşin</small></button>`
    : `<button class="btn cay-ode cay-ode-bakiye" type="button" data-ode="bakiye">Bakiye (Açık Hesap)</button>`;
  const secilen = o.odemeTuru === "nakit" ? "Nakit" : o.odemeTuru === "kart" ? "Kart" : "Açık Hesap";
  const kural = minPesin ? ` Bu müşteri için açık hesapta <b>${money.format(minPesin)} (%40)</b> peşin ödeme zorunludur.` : "";
  const body = `<p class="sub" style="margin:0 0 12px">Müşterinin seçimi: <b>${secilen}</b>. Teslimatta gerekirse değiştirebilirsin. <b>Bakiye</b> seçilirse tutar bayinin açık hesabına (cari borç) yazılır.${kural}</p>
    <div class="cay-ode-tut">Tutar <b>${money.format(o.toplam)}</b></div>
    <div class="field"><label>Mal nereden çıktı?</label>${stkSecim("cayHavuz", [["dukkan", "🏪 Dükkandan"], ["arac", "🚚 Araçtan"]], stokModu === "arac" ? "arac" : "dukkan")}</div>
    <div class="cay-ode-sec">
      ${o.odemeTuru === "parcali" ? `<button class="btn cay-ode" type="button" data-ode="parcali">Siparişte seçilen parçalı ödeme</button>` : ""}
      <button class="btn cay-ode" type="button" data-ode="nakit">Nakit</button>
      <button class="btn cay-ode" type="button" data-ode="kart">Kart</button>
      ${acikHesapSecenek}
    </div>`;
  const m = openModal("Teslim — Ödeme", body, { noFoot: true, onMount: (ov) => {
    stkSecimBagla(ov, "cayHavuz");
    ov.querySelectorAll("[data-ode]").forEach((b) => b.addEventListener("click", () => { const tur = b.dataset.ode, havuz = ov.querySelector("#cayHavuz").value; m.close(); cayTeslim(o, tur, havuz); }));
  } });
}

/* Teklif / Fiş yazdırma */
function cayDoc(o, tur) {
  const st = store.settings;
  const rows = o.items.map((it) => `<tr><td>${esc(it.ad)}</td><td class="c">${num2.format(it.adet)} ${esc(it.birim)}</td><td class="r">${money.format(it.fiyat * it.adet)}</td></tr>`).join("");
  const tesl = o.teslimTarih ? `<div>Teslim: ${esc(o.teslimTarih)} ${esc(o.teslimSaat || "")}</div>` : "";
  const no = tur === "Teklif" ? (o.teklifNo ? `<div>Teklif No: ${esc(o.teklifNo)}</div>` : "") : (o.fisNo ? `<div>Fiş No: ${esc(o.fisNo)}</div>` : "");
  openPrint(tur + " " + o.dealer, `<h2>${esc(st.fisBaslik || st.firmaAdi)}</h2><div class="c">${tur.toUpperCase()}</div><hr>
    <div>Bayi: ${esc(o.dealer)}</div>${o.dealerTel ? `<div>Tel: ${esc(o.dealerTel)}</div>` : ""}${no}${tesl}<hr>
    <table>${rows}</table><hr>
    <table>${o.iskonto ? `<tr><td>Nakit indirimi</td><td class="r">-${money.format(o.iskonto)}</td></tr>` : ""}<tr><td><b>TOPLAM</b></td><td class="r"><b>${money.format(o.toplam)}</b></td></tr></table><hr>
    <div class="c">${esc(st.fisAltbilgi || "Teşekkür ederiz")}</div>`);
}

function cayIslemBtns(o) {
  const b = [];
  if (o.durum === "yeni") b.push(`<button class="btn" style="padding:4px 8px" data-onayla="${o.id}">✔ Onayla</button>`);
  if (o.durum === "onay") { b.push(`<button class="btn soft" style="padding:4px 8px" data-teklif="${o.id}">📄 Teklif</button>`); b.push(`<button class="btn" style="padding:4px 8px" data-dagitim="${o.id}">🚚 Dağıtıma Al</button>`); }
  if (o.durum === "dagitim") { b.push(`<button class="btn soft" style="padding:4px 8px" data-fis="${o.id}">🧾 Fiş</button>`); b.push(`<button class="btn soft" style="padding:4px 8px" data-gonder="${o.id}">📤 Gönder</button>`); b.push(`<button class="btn" style="padding:4px 8px" data-teslim="${o.id}">✅ Teslim Et</button>`); }
  if (o.durum === "teslim") b.push(`<button class="btn soft" style="padding:4px 8px" data-fis="${o.id}">🧾 Fiş</button>`);
  b.push(`<button class="del" data-caydel="${o.id}">Sil</button>`);
  return b.join(" ");
}
/* Ürün detay penceresi — kartta liste yok, tıklanınca modalde açılır */
function cayUrunModal(o) {
  const rows = o.items.map((l) => `<div class="cay-urow">
    <span class="cay-uad">${esc(l.ad)}</span>
    <span class="cay-uqty">${num2.format(l.adet)} ${esc(l.birim || "")}</span>
    <span class="cay-utut">${money.format(l.fiyat * l.adet)}</span>
  </div>`).join("");
  const body = `<div class="cay-ulist">${rows}</div>
    <div class="cay-utoplam">${o.iskonto ? `<span>Nakit indirimi</span><span>-${money.format(o.iskonto)}</span>` : ""}<span>TOPLAM</span><span>${money.format(o.toplam)}</span></div>
    ${o.not ? `<div class="cay-unot">Not: ${esc(o.not)}</div>` : ""}`;
  openModal(`${esc(o.dealer)} — Ürünler`, body, { noFoot: true });
}
/* Anasayfa özet tablosu için satır (klasik <tr> — dashboard düzeni korunur) */
function caySiparisTableRow(o) {
  const urunler = o.items.map((l) => `${num2.format(l.adet)} ${esc(l.birim)} ${esc(l.ad)}`).join(", ");
  const a = cayAsama(o.durum);
  const tesl = o.teslimTarih ? `<br><span class="sub">Teslim: ${esc(o.teslimTarih)} ${esc(o.teslimSaat || "")}</span>` : "";
  return `<tr>
    <td>${esc(o.dealer)}${o.dealerTel ? `<br><span class="sub">${esc(o.dealerTel)}</span>` : ""}</td>
    <td>${urunler}${o.not ? `<br><span class="sub">Not: ${esc(o.not)}</span>` : ""}${tesl}</td>
    <td>${money.format(o.toplam)}</td>
    <td><span class="${a.badge}">${esc(a.ad)}</span></td>
    <td>${fmtDate(o.alindi)}</td>
    <td><div class="act-btns">${cayIslemBtns(o)}</div></td>
  </tr>`;
}
/* Tek satır liste — tıklayınca sipariş modalı açılır */
function caySiparisListRow(o) {
  const a = cayAsama(o.durum);
  const kalem = o.items.length;
  const search = esc([o.dealer, o.dealerTel, o.items.map((l) => l.ad).join(" ")].join(" ").toLowerCase());
  return `<li class="sl-row cay-li" data-search="${search}" data-cayopen="${o.id}">
    <div class="sl-main">
      <span class="sl-ad">${esc(o.dealer)}</span>
      <span class="sl-nums">
        <span class="sl-metric"><span class="sl-k">Tutar</span><b>${money.format(o.toplam)}</b></span>
        <span class="sl-metric"><span class="sl-k">Kalem</span><b>${kalem}</b></span>
        <span class="cay-badge ${a.badge}">${esc(a.ad)}</span>
        ${o.durum !== "teslim" ? `<span class="stk-yas ${stkSiparisYasSaat(o) >= 24 ? "gec" : ""}">${stkYasMetin(stkSiparisYasSaat(o))}</span>` : ""}
      </span>
    </div>
    <button class="sl-eye" type="button" data-cayopen="${o.id}" aria-label="Siparişi aç">👁</button>
  </li>`;
}
/* Sipariş modalı — ürünler + aşama aksiyonları (Onayla / Teslim Et …) */
function cayOrderModal(o) {
  const a = cayAsama(o.durum);
  const rows = o.items.map((l) => `<div class="cay-urow"><span class="cay-uad">${esc(l.ad)}</span><span class="cay-uqty">${num2.format(l.adet)} ${esc(l.birim || "")}</span><span class="cay-utut">${money.format(l.fiyat * l.adet)}</span></div>`).join("");
  const btns = [];
  if (o.durum === "yeni") btns.push(`<button class="btn" type="button" data-m-onayla>✔ Onayla</button>`);
  if (o.durum === "onay") btns.push(`<button class="btn soft" type="button" data-m-dagitim>🚚 Dağıtıma Al</button>`);
  if (o.durum === "onay" || o.durum === "dagitim") btns.push(`<button class="btn soft" type="button" data-m-teklif>📄 Teklif</button>`);
  if (o.durum === "dagitim" || o.durum === "teslim") btns.push(`<button class="btn soft" type="button" data-m-fis>🧾 Fiş</button>`);
  if (o.durum === "dagitim") btns.push(`<button class="btn soft" type="button" data-m-gonder>📤 Gönder</button>`);
  if (o.durum !== "teslim") btns.push(`<button class="btn cay-teslim-btn" type="button" data-m-teslim>✅ Teslim Et</button>`);
  if (o.durum !== "teslim") btns.push(`<button class="btn soft" type="button" data-m-kapat>☑ Zaten teslim ettim (satış yazma)</button>`);
  btns.push(`<button class="del" type="button" data-m-del>Sil</button>`);
  const tesl = o.teslimTarih ? `<div class="cay-sub">🚚 Teslim: ${esc(o.teslimTarih)} ${esc(o.teslimSaat || "")}</div>` : "";
  const body = `
    <div class="cay-modal-meta">
      <div><span>Bayi</span><b>${esc(o.dealer)}</b></div>
      ${o.dealerTel ? `<div><span>Telefon</span><b>${esc(o.dealerTel)}</b></div>` : ""}
      <div><span>Durum</span><b><span class="cay-badge ${a.badge}">${esc(a.ad)}</span></b></div>
    </div>
    <div class="cay-ulist">${rows}</div>
    <div class="cay-utoplam">${o.iskonto ? `<span>Nakit indirimi</span><span>-${money.format(o.iskonto)}</span>` : ""}<span>TOPLAM</span><span>${money.format(o.toplam)}</span></div>
    <div class="cay-sub">Ödeme: ${esc(o.odemeTuru === "nakit" ? "Nakit" : o.odemeTuru === "kart" ? "Kart" : "Açık Hesap")}</div>
    ${o.not ? `<div class="cay-unot">Not: ${esc(o.not)}</div>` : ""}
    ${tesl}
    ${o.elleKapandi ? `<div class="cay-sub">☑ Satış yazılmadan kapatıldı${o.kapanisNot ? " — " + esc(o.kapanisNot) : ""}</div>` : ""}
    <div class="cay-modal-act">${btns.join("")}</div>`;
  const m = openModal(`${esc(o.dealer)} — Sipariş`, body, { noFoot: true, onMount: (ov) => {
    const on = (sel, fn) => { const b = ov.querySelector(sel); if (b) b.addEventListener("click", fn); };
    on("[data-m-onayla]", () => { m.close(); cayOnayla(o); });
    on("[data-m-dagitim]", () => { m.close(); cayDagitim(o); });
    on("[data-m-teklif]", () => cayDoc(o, "Teklif"));
    on("[data-m-fis]", () => cayDoc(o, "Fiş"));
    on("[data-m-gonder]", () => cayGonder(o));
    on("[data-m-teslim]", () => { m.close(); cayTeslimOde(o); });
    on("[data-m-del]", () => { if (confirm("Sipariş silinsin mi?")) { m.close(); caySil(o); } });
    on("[data-m-kapat]", () => { if (confirm("Bu siparişin malını zaten teslim edip satışını ayrıca girdin mi?\n\nEvet dersen YENİ SATIŞ YAZILMAZ, sipariş \"teslim edildi\" diye kapanır.")) { m.close(); cayElleKapat(o); } });
  } });
}
function renderCayOcagi() {
  // Bekleyenler (teslim edilmemiş) üstte, en eski en başta; kapananlar altta yeniden eskiye.
  const acik = store.gelenSiparisler.filter((o) => o.durum !== "teslim").sort((a, b) => String(a.tarih).localeCompare(String(b.tarih)));
  const kapali = store.gelenSiparisler.filter((o) => o.durum === "teslim").reverse();
  const rows = acik.concat(kapali).map(caySiparisListRow).join("");
  const yeni = store.gelenSiparisler.filter((o) => o.durum === "yeni").length;
  return pageHead("Çay Ocağı Siparişleri", (store.gelenSiparisler.length + " sipariş") + (yeni ? ` · ${yeni} yeni` : ""), [
    { label: "📥 Kod Yapıştır", act: "cayKod" },
    { label: "📂 Dosyadan Al", cls: "soft", act: "cayDosya" },
  ].concat(acik.length ? [{ label: "☑ Teslim Edilenleri Kapat", cls: "soft", act: "cayTopluKapat" }] : [])) + `<div class="cay-wrap">
    <div class="cay-search"><input type="text" class="cay-q" placeholder="Bayi, telefon veya ürün ara…" /></div>
    ${rows ? `<ul class="sl-list cay-sl">${rows}</ul>` : '<div class="cay-empty">Henüz sipariş yok.</div>'}
  </div>`;
}
function wireCayOcagi() {
  document.querySelectorAll("[data-cayopen]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); const o = cayFind(b.dataset.cayopen); if (o) cayOrderModal(o); }));
}
/* çay ocağı kart arama — data-search üzerinden filtre */
function wireCaySearch() {
  const inp = document.querySelector(".cay-q");
  if (!inp) return;
  inp.addEventListener("input", () => {
    const q = inp.value.trim().toLowerCase();
    document.querySelectorAll(".cay-li").forEach((c) => { c.style.display = (c.dataset.search || "").includes(q) ? "" : "none"; });
  });
}
function mountCayOcagi() {
  const k = document.querySelector('[data-act="cayKod"]');
  if (k) k.addEventListener("click", () => { const c = prompt("Çay ocağından gelen sipariş kodunu yapıştır (CAYSIP1:...)"); if (c) caySiparisAl(c); });
  const d = document.querySelector('[data-act="cayDosya"]');
  if (d) d.addEventListener("click", () => openFileImport(".txt,.caysip,text/plain", caySiparisAl));
  const tk = document.querySelector('[data-act="cayTopluKapat"]'); if (tk) tk.addEventListener("click", cayTopluKapatModal);
  wireCayOcagi();
  wireCaySearch();
}

/* ============ Sayfa tablosu ============ */
const PAGES = {
  "cay-ocagi": { render: renderCayOcagi, mount: mountCayOcagi },
  duyurular: { render: renderDuyurular, mount: mountDuyurular },
  anasayfa: { render: renderAnasayfa, mount: mountAnasayfa },
  dukkan: { render: renderDukkan, mount: mountDukkan },
  satis: { render: renderSatis, mount: mountSatis },
  rota: { render: renderRota, mount: mountRota },
  "rota-olustur": { render: renderRotaOlustur, mount: mountRotaOlustur },
  harita: { render: renderHarita, mount: mountHarita },
  talepler: { render: renderTalepler, mount: mountTalepler },
  "servis-raporlari": { render: renderServisRaporlari, mount: mountServisRaporlari },
  "satis-detay": { render: renderSatisDetay, mount: mountSatisDetay },

  "rapor-gunluk": { render: renderRaporGunluk, mount: () => mountReport("rapor-gunluk") },
  "rapor-tarihsel": { render: renderRaporTarihsel, mount: () => mountReport("rapor-tarihsel") },
  "rapor-urunsel": { render: renderRaporUrunsel, mount: () => mountReport("rapor-urunsel") },
  "rapor-grupsal": { render: renderRaporGrupsal, mount: () => mountReport("rapor-grupsal") },
  "rapor-korelasyon": { render: renderRaporKorelasyon, mount: () => mountReport("rapor-korelasyon") },
  "rapor-stokhareket": { render: renderRaporStokHareket, mount: mountRaporStokHareket },
  "rapor-personelhareket": { render: renderRaporPersonel, mount: () => mountReport("rapor-personelhareket") },
  "musteri-analiz": { render: renderMusteriAnaliz, mount: mountMusteriAnaliz },
  "urun-analiz": { render: renderUrunAnaliz },

  musteriler: { render: renderMusteriler, mount: mountMusteriler },
  "musteri-detay": { render: renderMusteriDetay, mount: mountMusteriDetay },
  "tsiparis-detay": { render: renderTsiparisDetay, mount: mountTsiparisDetay },
  servisciler: { render: renderServisciler, mount: mountServisciler },

  urunler: { render: renderUrunler, mount: mountUrunler },
  "arac-yukleme": { render: renderAracYukleme, mount: mountAracYukleme },
  "urun-ekle": { render: renderUrunEkle, mount: mountUrunEkle },
  "urun-varyantli": { render: () => renderUrunEkle(), mount: mountUrunEkle },
  "urun-gruplari": { render: () => crudPage({ title: "Ürün Grupları", key: "groups", newLabel: "Yeni Grup", columns: ["Sıra", "Grup Adı"], row: (g, i) => [i + 1, esc(g.ad)], fields: [{ key: "ad", label: "Grup Adı", req: true }] }) + `<div class="card" style="margin-top:12px"><button class="btn green lg" id="autoKat" type="button">🏷️ Ürünleri Otomatik Kategorile</button><p class="hint" style="margin-top:8px">Tüm ürünlerini Sıcak/Soğuk İçecekler, Temizlik, Servis vb. temiz kategorilere dağıtır. Zaten kategorili ürünlere ve elle seçtiklerine dokunmaz.</p></div>`, mount: () => { mountCrud({ key: "groups", fields: [{ key: "ad", label: "Grup Adı", req: true }] }); const b = document.getElementById("autoKat"); if (b) b.addEventListener("click", () => { if (confirm("Tüm ürünler otomatik kategorilere dağıtılsın mı?")) otomatikKategorile(); }); } },
  "urun-transfer": { render: () => pageHead("Ürün Transferleri", "Tek şube — transfer yerine stok düzeltmesi için Stok Hareket Rapor'daki 'Stok Düzeltme' aracını kullanın.") + `<div class="card"><p class="sub">Şubeler arası transfer bu sürümde kapalı (tek işletme). Stok düzeltme: <button class="link-btn" data-goto="rapor-stokhareket">Stok Hareket Rapor</button>.</p></div>` },
  "alt-urun": { render: () => crudPage({ title: "Alt Ürün Tanımları", sub: "Reçete: bir ürün satılınca elle takip", key: "altUrunler", newLabel: "Yeni Alt Ürün", columns: ["Sıra", "Ana Ürün", "Alt Ürün", "Oran"], row: (a, i) => [i + 1, esc(a.ana), esc(a.alt), esc(a.oran)], fields: [{ key: "ana", label: "Ana Ürün" }, { key: "alt", label: "Alt Ürün" }, { key: "oran", label: "Oran", type: "number", step: "0.01", def: 1 }] }), mount: () => mountCrud({ key: "altUrunler", fields: [{ key: "ana", label: "Ana Ürün" }, { key: "alt", label: "Alt Ürün" }, { key: "oran", label: "Oran", type: "number", step: "0.01", def: 1 }] }) },
  "urun-varyantlari": { render: () => crudPage({ title: "Ürün Varyantları", key: "varyantlar", newLabel: "Yeni Varyant", columns: ["Sıra", "Varyant Adı", "Değerler"], row: (v, i) => [i + 1, esc(v.ad), esc(v.degerler)], fields: [{ key: "ad", label: "Varyant Adı", req: true, ph: "örn. Beden" }, { key: "degerler", label: "Değerler (virgülle)", ph: "S, M, L" }] }), mount: () => mountCrud({ key: "varyantlar", fields: [{ key: "ad", label: "Varyant Adı", req: true }, { key: "degerler", label: "Değerler" }] }) },
  "urun-iade": { render: renderUrunIade, mount: mountUrunIade },
  "iade-talepleri": { render: () => pageHead("İade Talepleri", store.iadeler.length + " iade") + tableCard(["Ürün", "Miktar", "Tutar", "Müşteri", "Tarih"], store.iadeler.slice().reverse().map((r) => { const c = r.musteriId && findCustomer(r.musteriId); return `<tr><td>${esc(r.ad)}</td><td>${num2.format(r.adet)}</td><td>${money.format(r.tutar)}</td><td>${c ? esc(c.ad) : "-"}</td><td>${fmtDate(r.tarih)}</td></tr>`; }).join(""), infoLine(store.iadeler.length)) },
  "urun-etiket": { render: renderUrunEtiket, mount: mountUrunEtiket },
  "etiket-tasarla": { render: () => pageHead("Etiket Tasarla & Üret", "Basit etiket üretimi için 'Ürün Etiketi Üret' sayfasını kullanın.") + `<div class="card"><p class="sub">Gelişmiş tasarım aracı bu sürümde yok. <button class="link-btn" data-goto="urun-etiket">Ürün Etiketi Üret</button>.</p></div>` },
  "terazi-cikti": { render: () => pageHead("Barkodlu Terazi Çıktısı", "Terazi entegrasyonu masaüstü cihaz gerektirir.") + `<div class="card"><p class="sub">Bu sürümde kapalı. Tartılı ürünlerde birim olarak 'Kg' seçin.</p></div>` },

  "alis-faturalari": { render: renderAlisFaturalari, mount: mountAlisFaturalari },
  "alis-olustur": { render: renderAlisOlustur, mount: mountAlisOlustur },

  firmalar: { render: renderFirmalar, mount: mountFirmalar },

  "efatura-olustur": { render: renderEFaturaOlustur, mount: mountEFaturaOlustur },
  "efatura-giden": { render: () => pageHead("Giden E-Faturalar", store.efaturalar.filter((e) => e.yon === "giden").length + " fatura", [{ label: "＋ Yeni E-Fatura", route: "efatura-olustur" }]) + tableCard(["Fatura No", "Müşteri", "Tutar", "Durum", "Tarih"], store.efaturalar.filter((e) => e.yon === "giden").reverse().map((e) => `<tr><td>${esc(e.no)}</td><td>${esc(e.musteri || "-")}</td><td>${money.format(e.toplam)}</td><td><span class="badge">${esc(e.durum || "Taslak")}</span></td><td>${fmtDate(e.tarih)}</td></tr>`).join(""), infoLine(store.efaturalar.filter((e) => e.yon === "giden").length)) },
  "efatura-gelen": { render: () => pageHead("Gelen E-Faturalar", "0 fatura") + `<div class="card"><p class="sub">Gelen e-fatura entegrasyonu (GİB) bu sürümde yok. Manuel gelen fatura için Alış Faturaları kullanın.</p></div>` },
  "efatura-ayarlar": { render: renderEFaturaAyarlar, mount: mountEFaturaAyarlar },

  "stok-sayimi": { render: renderStokSayimi, mount: mountStokSayimi },
  "stok-sayimi-detay": { render: renderStokSayimiDetay, mount: mountStokSayimiDetay },
  alinacaklar: { render: renderAlinacaklar, mount: mountAlinacaklar },
  "fiyat-bakim": { render: renderFiyatBakim, mount: mountFiyatBakim },
  "toplu-zam": { render: renderTopluZam, mount: mountTopluZam },
  "fiyat-gecmisi": { render: renderFiyatGecmisi, mount: mountFiyatGecmisi },

  gelirler: { render: () => gelirGiderPage("incomes", "Gelirler", "Gelir"), mount: () => mountCrud({ key: "incomes", stamp: true, fields: [{ key: "tur", label: "Gelir Türü", req: true }, { key: "not", label: "Not" }, { key: "tutar", label: "Tutar (₺)", type: "number", step: "0.01", req: true }, { key: "odeme", label: "Ödeme Tipi", type: "select", options: ["Nakit", "POS", "Havale"] }] }) },
  giderler: { render: renderGiderler, mount: mountGiderler },

  personeller: { render: () => crudPage({ title: "Personeller", key: "personeller", newLabel: "Yeni Personel", columns: ["Sıra", "Personel Kodu", "Personel Adı", "Toplam Satış", "Durum"], row: (p, i) => [i + 1, esc(p.kod || "P" + (i + 1)), esc(p.ad), money.format(store.sales.filter((s) => s.personelId === p.id).reduce((a, s) => a + s.toplam, 0)), (p.aktif === "0" ? "Pasif" : "Aktif")], fields: [{ key: "ad", label: "Personel Adı", req: true }, { key: "kod", label: "Personel Kodu" }, { key: "aktif", label: "Durum", type: "select", options: [{ v: "1", t: "Aktif" }, { v: "0", t: "Pasif" }] }] }), mount: () => mountCrud({ key: "personeller", fields: [{ key: "ad", label: "Personel Adı", req: true }, { key: "kod", label: "Personel Kodu" }, { key: "aktif", label: "Durum", type: "select", options: [{ v: "1", t: "Aktif" }, { v: "0", t: "Pasif" }] }] }) },
  gorevler: { render: () => renderGorevler(), mount: mountGorevler },
  "odeme-tipleri": { render: () => crudPage({ title: "Ödeme Tipleri", key: "odemeTipleri", newLabel: "Yeni Ödeme Tipi", columns: ["Sıra", "Ödeme Adı", "Kasa"], row: (o, i) => [i + 1, esc(o.ad), esc(o.kasa || "Nakit Kasa")], fields: [{ key: "ad", label: "Ödeme Adı", req: true }, { key: "kasa", label: "Kasa", type: "select", options: ["Nakit Kasa", "Banka/POS", "Diğer"] }] }), mount: () => mountCrud({ key: "odemeTipleri", fields: [{ key: "ad", label: "Ödeme Adı", req: true }, { key: "kasa", label: "Kasa", type: "select", options: ["Nakit Kasa", "Banka/POS", "Diğer"] }] }) },

  profilim: { render: renderProfilim, mount: mountProfilim },
};

/* ============ GÖREVLER ============ */
function renderGorevler() {
  const rows = store.gorevler.map((g, i) => `<tr><td>${i + 1}</td><td style="${g.durum === "bitti" ? "text-decoration:line-through;color:var(--muted)" : ""}">${esc(g.ad)}</td><td>${g.durum === "bitti" ? '<span style="color:var(--green-d)">✔ Bitti</span>' : '<span class="badge">Bekliyor</span>'}</td><td>${fmtDateShort(g.tarih)}</td><td><div class="act-btns"><button class="edit" data-tog="${g.id}">${g.durum === "bitti" ? "Geri Al" : "Bitir"}</button><button class="del" data-delg="${g.id}">Sil</button></div></td></tr>`).join("");
  return pageHead("Görevler", store.gorevler.length + " görev", [{ label: "＋ Yeni Görev", act: "yenig" }]) + tableCard(["Sıra", "Görev", "Durum", "Tarih", "İşlem"], rows, infoLine(store.gorevler.length));
}
function mountGorevler() {
  const y = document.querySelector('[data-act="yenig"]'); if (y) y.addEventListener("click", () => formModal("Yeni Görev", [{ key: "ad", label: "Görev", req: true }], null, (d) => { store.gorevler.push({ id: genId(), ad: d.ad, durum: "bekliyor", tarih: new Date().toISOString() }); saveStore(); render(); }));
  document.querySelectorAll("[data-tog]").forEach((b) => b.addEventListener("click", () => { const g = store.gorevler.find((x) => x.id === b.dataset.tog); g.durum = g.durum === "bitti" ? "bekliyor" : "bitti"; saveStore(); render(); }));
  document.querySelectorAll("[data-delg]").forEach((b) => b.addEventListener("click", () => { if (confirm("Silinsin mi?")) { store.gorevler = store.gorevler.filter((x) => x.id !== b.dataset.delg); saveStore(); render(); } }));
  wireTableSearch();
}

/* ============ DUYURULAR ============ */
/* Toptancı duyuru yayınlar; çay ocağı uygulaması kv anahtarı "duyurular"dan okur.
 * Sözleşme: [{ id, tarih: "21 Tem", metin }] — en yeni en üstte. */
const DUYURU_AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
function duyuruTarihTR() { const d = new Date(); return d.getDate() + " " + DUYURU_AYLAR[d.getMonth()]; }
function duyuruBulutaYaz() { kvSet("duyurular", store.duyurular, new Date().toISOString()); }
function renderDuyurular() {
  const list = store.duyurular.length
    ? store.duyurular.map((d) => `<div class="card duyuru-item"><div class="duyuru-ust"><span class="badge">${esc(d.tarih)}</span><button class="del" data-deldy="${d.id}">Sil</button></div><div class="duyuru-metin">${esc(d.metin)}</div></div>`).join("")
    : `<div class="card"><p class="sub">Henüz duyuru yok.</p></div>`;
  return pageHead("Duyurular", store.duyurular.length + " duyuru · çay ocağı uygulamasına yayınlanır")
    + `<div class="card"><div class="field"><label>Yeni Duyuru</label><textarea class="duyuru-input" rows="3" placeholder="Duyuru metni…"></textarea></div><div class="actions"><button class="btn" type="button" data-act="duyuruYayinla">📢 Yayınla</button></div></div>`
    + list;
}
function mountDuyurular() {
  const b = document.querySelector('[data-act="duyuruYayinla"]');
  if (b) b.addEventListener("click", () => {
    const ta = document.querySelector(".duyuru-input");
    const metin = ((ta && ta.value) || "").trim();
    if (!metin) { alert("Duyuru metni boş olamaz."); return; }
    store.duyurular.unshift({ id: genId(), tarih: duyuruTarihTR(), metin });
    saveStore(); duyuruBulutaYaz(); render();
  });
  document.querySelectorAll("[data-deldy]").forEach((x) => x.addEventListener("click", () => {
    if (!confirm("Duyuru silinsin mi?")) return;
    store.duyurular = store.duyurular.filter((d) => d.id !== x.dataset.deldy);
    saveStore(); duyuruBulutaYaz(); render();
  }));
}

/* ============ E-FATURA ============ */
let efItems = [];
function renderEFaturaOlustur() {
  efItems = [{ ad: "", adet: 1, fiyat: 0, kdv: 20 }];
  return pageHead("E-Fatura Oluştur", null, [{ label: "Giden E-Faturalar", cls: "soft", route: "efatura-giden" }]) +
    `<div class="card"><div class="filters">
      <div class="field" style="flex:1"><label>Müşteri Adı</label><input id="efMus" placeholder="Ad Soyad / Firma" /></div>
      <div class="field"><label>Vergi No / TCKN</label><input id="efVno" placeholder="opsiyonel" /></div>
      <div class="field"><label>Fatura Tarihi</label><input id="efTarih" type="date" value="${todayStr()}" /></div>
    </div></div>
    <div class="card">
      <table class="line-table"><thead><tr><th style="width:40%">Ürün/Hizmet</th><th>Miktar</th><th>Birim Fiyat</th><th>KDV %</th><th>Tutar</th><th></th></tr></thead><tbody id="efBody"></tbody></table>
      <div style="margin-top:10px"><button class="btn soft" id="efAdd" type="button">＋ Satır ekle</button></div>
      <div class="totbox" style="margin-top:10px">Ara Toplam: <span id="efAra">₺0,00</span> · KDV: <span id="efKdv">₺0,00</span> · <strong>Genel Toplam: <span id="efTot">₺0,00</span></strong></div>
      <div style="text-align:right;margin-top:10px"><button class="btn green lg" id="efSave" type="button">💾 E-Faturayı Kaydet</button></div>
      <p class="hint">Not: Gerçek GİB gönderimi yok; fatura kayıt + yazdırma yapılır.</p>
    </div>`;
}
function efRowHTML(r, i) { return `<tr><td><input data-ef="${i}" data-f="ad" value="${esc(r.ad)}" placeholder="Ürün/hizmet" /></td><td><input data-ef="${i}" data-f="adet" type="number" step="0.01" value="${r.adet}" /></td><td><input data-ef="${i}" data-f="fiyat" type="number" step="0.01" value="${r.fiyat}" /></td><td><input data-ef="${i}" data-f="kdv" type="number" value="${r.kdv}" /></td><td>${money.format((Number(r.adet) || 0) * (Number(r.fiyat) || 0))}</td><td><button class="rm" data-efmv="${i}" type="button">✕</button></td></tr>`; }
function efRefresh() {
  document.getElementById("efBody").innerHTML = efItems.map(efRowHTML).join("");
  const ara = efItems.reduce((s, r) => s + (Number(r.adet) || 0) * (Number(r.fiyat) || 0), 0);
  const kdv = efItems.reduce((s, r) => s + (Number(r.adet) || 0) * (Number(r.fiyat) || 0) * (Number(r.kdv) || 0) / 100, 0);
  document.getElementById("efAra").textContent = money.format(ara); document.getElementById("efKdv").textContent = money.format(kdv); document.getElementById("efTot").textContent = money.format(ara + kdv);
  document.querySelectorAll("[data-ef]").forEach((el) => el.addEventListener("input", () => { efItems[Number(el.dataset.ef)][el.dataset.f] = el.value; efRefresh(); }));
  document.querySelectorAll("[data-efmv]").forEach((b) => b.addEventListener("click", () => { efItems.splice(Number(b.dataset.efmv), 1); if (!efItems.length) efItems.push({ ad: "", adet: 1, fiyat: 0, kdv: 20 }); efRefresh(); }));
}
function mountEFaturaOlustur() {
  efRefresh();
  document.getElementById("efAdd").addEventListener("click", () => { efItems.push({ ad: "", adet: 1, fiyat: 0, kdv: 20 }); efRefresh(); });
  document.getElementById("efSave").addEventListener("click", () => {
    const items = efItems.filter((r) => (r.ad || "").trim() && Number(r.adet) > 0);
    if (!items.length) { alert("En az bir satır girin."); return; }
    const ara = items.reduce((s, r) => s + Number(r.adet) * Number(r.fiyat), 0);
    const kdv = items.reduce((s, r) => s + Number(r.adet) * Number(r.fiyat) * (Number(r.kdv) || 0) / 100, 0);
    store.counters.efatura = (store.counters.efatura || 0) + 1;
    const ef = { id: genId(), no: "EF" + String(store.counters.efatura).padStart(6, "0"), musteri: document.getElementById("efMus").value.trim(), vno: document.getElementById("efVno").value.trim(), items, toplam: ara + kdv, yon: "giden", durum: "Oluşturuldu", tarih: document.getElementById("efTarih").value ? new Date(document.getElementById("efTarih").value).toISOString() : new Date().toISOString() };
    store.efaturalar.push(ef); saveStore();
    if (confirm("E-Fatura kaydedildi ✔ Yazdırılsın mı?")) printEFatura(ef);
    navigate("efatura-giden");
  });
}
function printEFatura(ef) {
  const rows = ef.items.map((it) => `<tr><td>${esc(it.ad)}</td><td class="c">${num2.format(it.adet)}</td><td class="r">${money.format(it.adet * it.fiyat)}</td></tr>`).join("");
  openPrint("E-Fatura " + ef.no, `<h2>${esc(store.settings.firmaAdi)}</h2><div class="c">E-FATURA</div><hr><div>No: ${ef.no}</div><div>Tarih: ${fmtDate(ef.tarih)}</div><div>Müşteri: ${esc(ef.musteri || "-")}</div>${ef.vno ? `<div>VKN/TCKN: ${esc(ef.vno)}</div>` : ""}<hr><table>${rows}</table><hr><table><tr><td><b>TOPLAM</b></td><td class="r"><b>${money.format(ef.toplam)}</b></td></tr></table>`);
}
function renderEFaturaAyarlar() {
  const s = store.settings;
  return pageHead("E-Fatura Ayarları") + `<form id="efAyarForm" class="card"><div class="form-grid">
    <div class="field"><label>Firma Ünvanı</label><input name="firmaAdi" value="${esc(s.firmaAdi || "")}" /></div>
    <div class="field"><label>Vergi/Firma No</label><input name="firmaNo" value="${esc(s.firmaNo || "")}" /></div>
    <div class="field"><label>E-posta</label><input name="eposta" value="${esc(s.eposta || "")}" /></div>
    <div class="field"><label>GİB Kullanıcı (bilgi)</label><input name="gib" value="${esc(s.gib || "")}" placeholder="opsiyonel" /></div>
  </div><div style="margin-top:14px"><button class="btn green lg" type="submit">💾 Kaydet</button></div></form>`;
}
function mountEFaturaAyarlar() { document.getElementById("efAyarForm").addEventListener("submit", (e) => { e.preventDefault(); const f = new FormData(e.target); ["firmaAdi", "firmaNo", "eposta", "gib"].forEach((k) => store.settings[k] = f.get(k)); saveStore(); alert("Kaydedildi ✔"); }); }

/* ============ ROTA / SAHA SATIŞ ============ */
const rota = { konum: null };
// Aktif servis oturumu (kalıcı değil — modül seviyesinde, gezinmede korunur):
const servis = { aktif: false, musteriIds: [], edilen: [], paslar: [], acik: null, adim: "onay", satislar: [], sonSatisId: null, watchId: null, stokBitti: false, km: 0, kmSon: null };

function rotaKaydet(ad, musteriIds) {
  const r = { id: genId(), ad: ad || ("Rota " + fmtDate(new Date().toISOString())), musteriIds, tarih: new Date().toISOString() };
  store.rotalar = store.rotalar || []; store.rotalar.push(r); saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
  return r;
}
function servisBaslat(musteriIds) {
  servis.aktif = true; servis.musteriIds = musteriIds.slice(); servis.edilen = []; servis.paslar = []; servis.satislar = [];
  servis.acik = servis.musteriIds[0] || null; servis.adim = "onay"; servis.stokBitti = false; servis.km = 0; servis.kmSon = null; // önce araç stok kontrol
  stokModuAyarla("arac"); // servis = araçtan satış
  // Zaten rota sayfasındaysak hash değişmez → render tetiklenmez; elle render et (otomatik geçiş).
  if ((location.hash || "").replace(/^#\/?/, "") === "rota") render(); else navigate("rota");
  servisKonumIzle();
}
function servisSonrakiAc() {
  const next = servis.musteriIds.find((id) => !servis.edilen.includes(id) && !servis.paslar.includes(id));
  servis.acik = next || null; servis.adim = "onay"; servis.sonSatisId = null;
}
// Upsell: müşterinin son 60 günde alıp bu ay almadığı ürünler + kampanya işaretliler.
function musteriOneri(id) {
  const bugun = new Date(), ay = monthStartStr();
  const alt = localDateStr(new Date(bugun.getTime() - 60 * 86400000));
  const gecmis = {}, buAy = {};
  store.sales.filter((s) => s.musteriId === id).forEach((s) => {
    const g = localDateStr(new Date(s.tarih));
    s.items.forEach((it) => { if (g >= alt) gecmis[it.urunId] = (gecmis[it.urunId] || 0) + 1; if (g >= ay) buAy[it.urunId] = 1; });
  });
  const oner = Object.keys(gecmis).filter((pid) => !buAy[pid]).map((pid) => findProduct(pid)).filter(Boolean);
  const kamp = store.products.filter((p) => p.kampanya && p.gorunur !== false && !oner.some((o) => o.id === p.id));
  return oner.concat(kamp).slice(0, 6);
}
function ziyaretKapat(id) {
  const c = findCustomer(id);
  const satildi = !!servis.sonSatisId;
  const sebepEl = document.querySelector(".kp-sb.on"); const sebep = sebepEl ? sebepEl.dataset.sebep : null;
  const tah = Number((document.getElementById("kpTahsil") || {}).value) || 0;
  const tahTip = (document.getElementById("kpTahsilTip") || {}).value || "nakit";
  const tahTur = tahTip === "pos" ? "kart" : (tahTip === "havale" ? "havale" : "nakit");
  if (tah > 0 && c) { store.payments.push({ id: genId(), musteriId: id, tutar: kurus(tah), odemeTuru: tahTur, not: "Saha tahsilat (" + tahTip + ")", tarih: new Date().toISOString() }); if (typeof bayiPuanEkle === "function") bayiPuanEkle(c, tah); }
  const iadeUrun = (document.getElementById("kpIadeUrun") || {}).value;
  const iadeAdet = Number((document.getElementById("kpIadeAdet") || {}).value) || 0;
  let iadeTutar = 0;
  if (iadeUrun && iadeAdet > 0) { const pr = findProduct(iadeUrun); if (pr) { iadeTutar = kurus(musteriUrunFiyat(id, pr.id) * iadeAdet); /* müşterinin gerçekte aldığı fiyat (liste fiyatı değil) */ store.iadeler.push({ id: genId(), urunId: pr.id, ad: pr.ad, adet: iadeAdet, tutar: iadeTutar, musteriId: id, tarih: new Date().toISOString() }); stokEkle(pr.id, iadeAdet); if (id) store.payments.push({ id: genId(), musteriId: id, tutar: iadeTutar, odemeTuru: "iade", not: "Ürün iadesi: " + pr.ad, tarih: new Date().toISOString() }); } }
  const talep = ((document.getElementById("kpTalep") || {}).value || "").trim();
  if (talep) store.talepler.push({ id: genId(), musteriId: id, metin: talep, tarih: new Date().toISOString(), durum: "acik" });
  const not = ((document.getElementById("kpNot") || {}).value || "").trim();
  const sonraki = (document.getElementById("kpSonraki") || {}).value || null;
  store.ziyaretler.push({ id: genId(), musteriId: id, tarih: new Date().toISOString(), sonuc: satildi ? "satis" : "yok", sebep: satildi ? null : sebep, not, sonraki, satisId: servis.sonSatisId || null, tahsilat: tah, iadeTutar, servisGun: localDateStr(new Date()) });
  saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
  // Adisyon otomatik WhatsApp — bu ziyarette satış varsa ve numara kayıtlıysa (kullanıcı jesti içinde).
  // Tahsilat/iade tam işlendi → irsaliyede "Kalan Bakiye" doğru çıkar.
  if (satildi && c && (c.telefon || "").replace(/\D/g, "")) {
    const sale = store.sales.find((x) => x.id === servis.sonSatisId);
    if (sale) fisGonderModal(sale, { tah, iade: iadeTutar });
  }
  durakTamamla(id);
}
function servisRaporModal(r) {
  openModal("Gün Sonu — Servis Raporu", `<div class="rapor-grid">
    <div class="rk"><span>Ziyaret</span><b>${r.ziyaret}</b></div>
    <div class="rk"><span>Ciro</span><b>${money.format(r.ciro)}</b></div>
    <div class="rk"><span>Ürün Maliyeti</span><b>${money.format(r.maliyet)}</b></div>
    <div class="rk"><span>Kâr</span><b class="rk-kar">${money.format(r.kar)} <small>(%${num2.format(r.karYuzde)})</small></b></div>
    ${r.komisyon ? `<div class="rk"><span>Kart (POS) Komisyonu</span><b>${money.format(r.komisyon)}</b></div>` : ""}
    <div class="rk"><span>Giderler</span><b>${money.format(r.gider)}</b></div>
    ${r.netKar != null ? `<div class="rk"><span>Net Kâr (gider sonrası)</span><b class="rk-kar">${money.format(r.netKar)}</b></div>` : ""}
    <div class="rk"><span>${r.nakitKasa != null ? "Nakit Kasa" : "Nakit"}</span><b>${money.format(r.nakitKasa != null ? r.nakitKasa : r.nakit)}</b></div>
    <div class="rk"><span>${r.kartHavale != null ? "Kart / Havale" : "Pos"}</span><b>${money.format(r.kartHavale != null ? r.kartHavale : r.pos)}</b></div>
    <div class="rk"><span>Bakiye</span><b class="${r.bakiye > 0 ? "rk-borc" : ""}">${money.format(r.bakiye)}</b></div>
    <div class="rk"><span>KM (gidilen)</span><b>${num2.format(r.km)} km</b></div>
  </div><p class="hint" style="margin-top:10px">Kâr %'si ciroya göre. KM konum servisleriyle takip edildi. Bakiye = bugün açık hesaba yazılan. Detay: Menü → Raporlar.</p>`, { noFoot: true });
}
function renderServisRaporlari() {
  const list = (store.servisRaporlari || []).slice().reverse();
  const rows = list.map((r) => `<tr class="sr-row" data-srview="${r.id}"><td>${fmtDate(r.tarih)}</td><td>${r.ziyaret}</td><td>${money.format(r.ciro)}</td><td class="${r.kar < 0 ? "sl-neg" : ""}">${money.format(r.kar)} <small>(%${num2.format(r.karYuzde || 0)})</small></td><td>${num2.format(r.km || 0)} km</td></tr>`).join("");
  return pageHead("Servis Raporları", list.length + " gün sonu raporu") +
    (list.length ? tableCard(["Tarih", "Ziyaret", "Ciro", "Kâr", "KM"], rows, infoLine(list.length)) : `<div class="card"><p class="sub">Henüz kayıtlı gün sonu raporu yok. Bir servisi bitirince otomatik buraya kaydolur.</p></div>`);
}
function mountServisRaporlari() {
  document.querySelectorAll("[data-srview]").forEach((tr) => tr.addEventListener("click", () => { const r = (store.servisRaporlari || []).find((x) => x.id === tr.dataset.srview); if (r) servisRaporModal(r); }));
}
function renderTalepler() {
  const acik = (store.talepler || []).filter((t) => t.durum !== "kapali").slice().reverse();
  const rows = acik.map((t) => { const c = t.musteriId && findCustomer(t.musteriId); return `<tr><td>${fmtDate(t.tarih)}</td><td>${c ? esc(c.ad) : "-"}</td><td>${esc(t.metin)}</td><td><div class="act-btns"><button class="edit" data-talepok="${t.id}">✓ Karşılandı</button><button class="del" data-talepsil="${t.id}">Sil</button></div></td></tr>`; }).join("");
  return pageHead("İstenen Ürünler (Talepler)", acik.length + " açık talep — sahada müşterinin istediği ama verilemeyenler") +
    tableCard(["Tarih", "Müşteri", "İstenen ürün", "İşlem"], rows, infoLine(acik.length));
}
function mountTalepler() {
  document.querySelectorAll("[data-talepok]").forEach((b) => b.addEventListener("click", () => { const t = store.talepler.find((x) => x.id === b.dataset.talepok); if (t) t.durum = "kapali"; saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); render(); }));
  document.querySelectorAll("[data-talepsil]").forEach((b) => b.addEventListener("click", () => { store.talepler = store.talepler.filter((x) => x.id !== b.dataset.talepsil); saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); render(); }));
  if (typeof wireTableSearch === "function") wireTableSearch();
}
function servisKaydet() {
  try { localStorage.setItem("servis-v1", JSON.stringify({ aktif: servis.aktif, musteriIds: servis.musteriIds, edilen: servis.edilen, paslar: servis.paslar, acik: servis.acik, adim: servis.adim, satislar: servis.satislar, sonSatisId: servis.sonSatisId, stokBitti: servis.stokBitti, km: servis.km, kmSon: servis.kmSon, carts: pos.carts, active: pos.active })); } catch (e) {}
}
function servisYukle() {
  try {
    const s = JSON.parse(localStorage.getItem("servis-v1") || "null");
    if (s && s.aktif) {
      servis.aktif = true; servis.musteriIds = s.musteriIds || []; servis.edilen = s.edilen || []; servis.paslar = s.paslar || [];
      servis.acik = s.acik || null; servis.adim = s.adim || "onay"; servis.satislar = s.satislar || []; servis.sonSatisId = s.sonSatisId || null; servis.watchId = null; servis.stokBitti = !!s.stokBitti; servis.km = Number(s.km) || 0; servis.kmSon = s.kmSon || null;
      if (s.carts && s.carts.length) { pos.carts = s.carts; pos.active = s.active || 0; }
    }
  } catch (e) {}
}
function servisBitir(sec) {
  const gun = localDateStr(new Date());
  const zys = store.ziyaretler.filter((z) => z.servisGun === gun);
  // Kasa ve kâr, Anasayfa/Günlük Rapor ile AYNI fonksiyondan: gün sonu rakamı diğer ekranlarla tutar.
  const k = kasaHesap(gun, gun);
  // Bugün satış var ama hiç gider yazılmamışsa önce sor (bir kez); oradan hızlıca yazılabilir.
  if (k.giderEksik && !(sec && sec.giderSoruldu)) { giderHatirlatModal(() => servisBitir({ giderSoruldu: true })); return; }
  const ciro = k.ciro, maliyet = k.maliyet, bakiye = k.satisAcik, komisyon = k.komisyon, gider = k.giderIsletme;
  // Kâr = ciro − ürün maliyeti (bütün ekranlarda aynı). Kart komisyonu ve gider ayrı satır, net kârdan düşülür.
  const kar = k.urunKar;
  const rapor = { ziyaret: zys.length, ciro, maliyet, kar, karYuzde: ciro > 0 ? (kar / ciro * 100) : 0, komisyon, gider, netKar: k.netKar, nakit: k.nakitKasa, pos: k.satisPos, nakitKasa: k.nakitKasa, kartHavale: k.kartHavale, bakiye, km: (servis.km || 0) / 1000 };
  // Gün sonu raporunu kaydet (sonradan Menü → Servis Raporları'ndan görülebilir)
  store.servisRaporlari = store.servisRaporlari || [];
  store.servisRaporlari.push(Object.assign({ id: genId(), tarih: new Date().toISOString() }, rapor));
  servis.aktif = false; servis.acik = null;
  stokModuAyarla("dukkan"); // servis bitti = dükkana dön
  if (servis.watchId != null && navigator.geolocation) { navigator.geolocation.clearWatch(servis.watchId); servis.watchId = null; }
  servis.musteriIds = []; servis.edilen = []; servis.paslar = []; servis.satislar = []; servis.sonSatisId = null;
  try { localStorage.removeItem("servis-v1"); } catch (e) {}
  saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
  render();
  servisRaporModal(rapor);
}
function durakTamamla(id) {
  if (!servis.edilen.includes(id)) servis.edilen.push(id);
  servis.paslar = servis.paslar.filter((x) => x !== id);
  servisSonrakiAc(); render();
}
function durakPasGec(id) {
  if (!servis.paslar.includes(id) && !servis.edilen.includes(id)) servis.paslar.push(id);
  servisSonrakiAc(); render();
}
function durakSonaAt(id) {
  const i = servis.musteriIds.indexOf(id);
  if (i >= 0) { servis.musteriIds.splice(i, 1); servis.musteriIds.push(id); }
  servisSonrakiAc(); render();
}
function servisGunOzet() {
  const sat = (servis.satislar || []).map((sid) => store.sales.find((s) => s.id === sid)).filter(Boolean);
  const toplam = sat.reduce((a, s) => a + (Number(s.toplam) || 0), 0);
  return { adet: sat.length, toplam, sat };
}
function servisOzetAc() {
  const o = servisGunOzet();
  const rows = o.sat.length ? o.sat.map((s) => { const c = s.musteriId && findCustomer(s.musteriId); return `<div class="so-row"><span>${c ? esc(c.ad) : "Müşterisiz"}</span><b>${money.format(s.toplam)}</b></div>`; }).join("") : `<p class="hint">Henüz satış yok.</p>`;
  openModal("Bugünkü Servis Özeti", `<div class="so-list">${rows}</div><div class="so-tot"><b>Toplam</b><b>${money.format(o.toplam)}</b> · ${o.adet} satış</div><p class="hint" style="margin-top:8px">Genel rapor için Menü → Raporlar.</p>`, { noFoot: true });
}
// "7 soda 2 gazoz 17 adet su" → [{q, k}]
function siparisParse(text) {
  const out = []; const re = /(\d+(?:[.,]\d+)?)\s*(?:adet|tane|koli|paket|kutu|şişe|sise|kg|lt)?\s*([a-zA-ZğüşıöçİĞÜŞÖÇ][a-zA-ZğüşıöçİĞÜŞÖÇ ]*?)(?=\s*\d|$)/g;
  let m; while ((m = re.exec(text))) { const q = Number(String(m[1]).replace(",", ".")); const k = (m[2] || "").trim(); if (q > 0 && k) out.push({ q, k }); }
  return out;
}
function hizliSiparisDoldur(id, text, durumEl) {
  const parc = siparisParse(text);
  if (!parc.length) { if (durumEl) durumEl.textContent = "Anlaşılamadı. Örnek: 7 soda 2 gazoz 17 su"; return; }
  const c = pos.carts[pos.active]; c.musteriId = id;
  let ekli = 0; const atil = [];
  parc.forEach((p) => { const pid = musteriUrunSecim(p.k, id); if (pid) { for (let i = 0; i < Math.round(p.q); i++) addToCart(pid); ekli++; } else atil.push(p.q + " " + p.k); });
  if (!ekli) { if (durumEl) durumEl.textContent = "Ürün eşleşmedi: " + atil.join(", "); return; }
  navigate("satis");
}
function servisKonumIzle() {
  if (!navigator.geolocation || servis.watchId != null) return;
  servis.watchId = navigator.geolocation.watchPosition((p) => {
    rota.konum = { lat: p.coords.latitude, lng: p.coords.longitude };
    if (!servis.aktif) return;
    // KM sayacı: konum servisleriyle gidilen mesafe (jitter/atlama filtreli)
    const cur = { lat: p.coords.latitude, lng: p.coords.longitude };
    if (servis.kmSon) { const dm = haversine(servis.kmSon.lat, servis.kmSon.lng, cur.lat, cur.lng); if (dm >= 15 && dm <= 400) { servis.km = (servis.km || 0) + dm; servisKaydet(); } }
    servis.kmSon = cur;
    const kmEl = document.getElementById("rtKm"); if (kmEl) kmEl.textContent = ((servis.km || 0) / 1000).toFixed(1) + " km";
    const banner = document.getElementById("servisBanner"); if (!banner) return;
    // 100m içinde, henüz ziyaret edilmemiş rota müşterileri (program tahmin yürütmez — hepsini listeler)
    const yakin = servis.musteriIds.map(findCustomer).filter((c) => c && c.lat != null && !servis.edilen.includes(c.id))
      .map((c) => ({ c, d: haversine(rota.konum.lat, rota.konum.lng, c.lat, c.lng) }))
      .filter((x) => x.d <= 100).sort((a, b) => a.d - b.d);
    if (!yakin.length) { banner.innerHTML = ""; return; }
    banner.innerHTML = `<div class="servis-uyari"><b>📍 Yakındasın:</b> ${yakin.map((x) => `${esc(x.c.ad)} (${mesafeMetin(x.d)})`).join(" · ")}. Vardığın müşteride <b>Vardım</b>'a bas.</div>`;
  }, () => {}, { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 });
}

function haversine(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (c - a) * r, dLng = (d - b) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function mesafeMetin(m) { return m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(1) + " km"; }
function konumAl() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) { rej(new Error("konum desteği yok")); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => rej(e), { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
  });
}
function musteriAylikCiro(id) {
  const ay = monthStartStr();
  return store.sales.filter((s) => s.musteriId === id && localDateStr(new Date(s.tarih)) >= ay).reduce((a, s) => a + (Number(s.toplam) || 0), 0);
}
function musterininSonSatisi(id) {
  const l = store.sales.filter((s) => s.musteriId === id).sort((a, b) => b.tarih.localeCompare(a.tarih));
  return l[0] || null;
}
// Bakiye takibi: önceki bakiye → bu alışveriş → ödeme/tahsilat/iade → kalan bakiye.
// customerBorc(id) = kesin güncel bakiye (açılış + açık satışlar - ödemeler). Pozitif = müşteri borçlu.
function bakiyeHesap(s, opts) {
  opts = opts || {};
  const c = s.musteriId && findCustomer(s.musteriId);
  if (!c) return null;
  const tah = Number(opts.tah) || 0, iade = Number(opts.iade) || 0;
  const kalan = customerBorc(s.musteriId);
  const pesin = (Number(s.odeme.nakit) || 0) + (Number(s.odeme.pos) || 0);
  const T = Number(s.toplam) || 0;
  // Önceki (bu satıştan/ziyaretten önceki bakiye): kalan - açık(bu satış) + tahsilat + iade.
  const onceki = kalan - (Number(s.odeme.acik) || 0) + tah + iade;
  const etiket = kalan > 0.005 ? " (BORÇ)" : (kalan < -0.005 ? " (ALACAK)" : " (kapandı ✓)");
  return { onceki, T, pesin, tah, iade, kalan, etiket };
}
function saleIrsaliyeMetni(s, opts) {
  const c = s.musteriId && findCustomer(s.musteriId); const st = store.settings;
  const kalem = s.items.map((it) => {
    const bk = it.barkod ? " - " + it.barkod : "";
    const tutar = (Number(it.fiyat) || 0) * (Number(it.adet) || 0);
    return "• " + it.ad + bk + "\n   " + num2.format(it.adet) + " x " + money.format(it.fiyat) + " = " + money.format(tutar);
  }).join("\n");
  let bak = "";
  const b = bakiyeHesap(s, opts);
  if (b) {
    bak = "\n————————————\n" +
      "Önceki Bakiye: " + money.format(b.onceki) + "\n" +
      "Bu Alışveriş: +" + money.format(b.T) + "\n" +
      (b.pesin > 0.005 ? "Peşin Ödeme: -" + money.format(b.pesin) + "\n" : "") +
      (b.tah > 0.005 ? "Tahsilat: -" + money.format(b.tah) + "\n" : "") +
      (b.iade > 0.005 ? "İade: -" + money.format(b.iade) + "\n" : "") +
      "KALAN BAKİYE: " + money.format(b.kalan) + b.etiket + "\n";
  }
  return (st.fisBaslik || st.firmaAdi || "") + "\nİRSALİYE / SATIŞ FİŞİ\nBelge: " + s.belgeNo + "\nTarih: " + fmtDate(s.tarih) +
    (c ? "\nMüşteri: " + c.ad : "") + "\n\n" + kalem + "\n" +
    (s.iskonto ? "İskonto: -" + money.format(s.iskonto) + "\n" : "") +
    "TOPLAM: " + money.format(s.toplam) + "\nÖdeme: " + saleOdeme(s) + (s.komisyon ? "\nPOS Komisyonu (%2): -" + money.format(s.komisyon) : "") + bak + "\n" + (st.fisAltbilgi || "Teşekkür ederiz");
}
function irsaliyeWa(sale, opts) {
  if (!sale) { alert("Bu müşteride gönderilecek satış yok."); return; }
  const c = sale.musteriId && findCustomer(sale.musteriId);
  let d = ((c && c.telefon) || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "9" + d; else if (d.length === 10) d = "90" + d;
  const metin = encodeURIComponent(saleIrsaliyeMetni(sale, opts));
  window.open((d ? "https://wa.me/" + d : "https://wa.me/") + "?text=" + metin, "_blank");
}
// İrsaliyeyi tam-boy PNG görsel olarak üret (canvas).
function irsaliyeGorsel(s, opts) {
  const c = s.musteriId && findCustomer(s.musteriId), st = store.settings;
  const rows = [];
  rows.push({ t: st.fisBaslik || st.firmaAdi || "", size: 22, bold: true, center: true });
  rows.push({ t: "İRSALİYE / SATIŞ FİŞİ", size: 13, center: true, color: "#555" });
  rows.push({ sep: 1 });
  rows.push({ t: "Belge No: " + s.belgeNo });
  rows.push({ t: "Tarih: " + fmtDate(s.tarih) });
  if (c) rows.push({ t: "Müşteri: " + c.ad });
  rows.push({ sep: 1 });
  s.items.forEach((it) => rows.push({ t: it.ad, r: money.format((Number(it.fiyat) || 0) * (Number(it.adet) || 0)), sub: (it.barkod ? it.barkod + "  ·  " : "") + num2.format(it.adet) + " × " + money.format(it.fiyat) }));
  rows.push({ sep: 1 });
  if (s.iskonto) rows.push({ t: "İskonto", r: "-" + money.format(s.iskonto) });
  rows.push({ t: "TOPLAM", r: money.format(s.toplam), bold: true, size: 20 });
  rows.push({ t: "Ödeme: " + saleOdeme(s), color: "#555" });
  if (s.komisyon) rows.push({ t: "POS Komisyonu (%2)", r: "-" + money.format(s.komisyon), color: "#555" });
  const b = bakiyeHesap(s, opts);
  if (b) {
    rows.push({ sep: 1 });
    rows.push({ t: "Önceki Bakiye", r: money.format(b.onceki), color: "#555" });
    rows.push({ t: "Bu Alışveriş", r: "+" + money.format(b.T), color: "#555" });
    if (b.pesin > 0.005) rows.push({ t: "Peşin Ödeme", r: "-" + money.format(b.pesin), color: "#555" });
    if (b.tah > 0.005) rows.push({ t: "Tahsilat", r: "-" + money.format(b.tah), color: "#555" });
    if (b.iade > 0.005) rows.push({ t: "İade", r: "-" + money.format(b.iade), color: "#555" });
    rows.push({ t: "KALAN BAKİYE" + b.etiket, r: money.format(b.kalan), bold: true, size: 18, color: b.kalan > 0.005 ? "#c0392b" : "#1e824c" });
  }
  rows.push({ sep: 1 });
  rows.push({ t: st.fisAltbilgi || "Teşekkür ederiz", center: true, color: "#555" });
  return fisCanvasCiz(rows);
}
/* Satır listesini fiş görseline çizer. Hem irsaliye hem hesap özeti bunu kullanır —
   ikisinin görünümü tek yerden değişsin diye ayrıldı.
   Satır: {t, r, sub, sep, bold, center, size, color} */
function fisCanvasCiz(rows) {
  const W = 520, pad = 28, lh = 30;
  const logoOk = OZGUR_LOGO && OZGUR_LOGO.complete && OZGUR_LOGO.naturalWidth > 0;
  const logoH = logoOk ? 100 : 0;
  let H = pad * 2 + logoH;
  rows.forEach((r) => H += r.sep ? 16 : (r.sub ? lh + 14 : lh));
  const dpr = 2, cv = document.createElement("canvas"); cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext("2d"); g.scale(dpr, dpr);
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); g.textBaseline = "top";
  let y = pad;
  if (logoOk) { try { g.drawImage(OZGUR_LOGO, (W - logoH) / 2, y, logoH, logoH); } catch (e) {} y += logoH + 4; }
  rows.forEach((r) => {
    if (r.sep) { g.strokeStyle = "#ccc"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(pad, y + 8); g.lineTo(W - pad, y + 8); g.stroke(); g.setLineDash([]); y += 16; return; }
    g.fillStyle = r.color || "#111"; g.font = (r.bold ? "700 " : "400 ") + (r.size || 16) + "px system-ui,sans-serif";
    if (r.center) { g.textAlign = "center"; g.fillText(r.t, W / 2, y); }
    else { g.textAlign = "left"; g.fillText(r.t, pad, y); if (r.r) { g.textAlign = "right"; g.font = "700 " + (r.size || 16) + "px system-ui,sans-serif"; g.fillText(r.r, W - pad, y); } }
    g.textAlign = "left"; y += lh;
    if (r.sub) { g.fillStyle = "#777"; g.font = "400 12px system-ui,sans-serif"; g.fillText(r.sub, pad, y - 8); y += 14; }
  });
  return cv.toDataURL("image/png");
}
function dataURLtoFile(d, name) {
  const arr = d.split(","), mime = (arr[0].match(/:(.*?);/) || [])[1] || "image/png", bstr = atob(arr[1]);
  let n = bstr.length; const u8 = new Uint8Array(n); while (n--) u8[n] = bstr.charCodeAt(n);
  return new File([u8], name, { type: mime });
}
// Açıklama metni: fiş kodu + müşteri + kalan bakiye (görselin yanına gider).
function irsaliyeAciklama(s, opts) {
  const c = s.musteriId && findCustomer(s.musteriId);
  const b = bakiyeHesap(s, opts);
  return "İrsaliye " + s.belgeNo + (c ? " · " + c.ad : "") +
    (b ? " · Kalan Bakiye: " + money.format(b.kalan) + b.etiket : "");
}
async function irsaliyePaylas(s, opts) {
  if (!s) { alert("Gönderilecek satış yok."); return; }
  const url = irsaliyeGorsel(s, opts);
  const cap = irsaliyeAciklama(s, opts);
  const c = s.musteriId && findCustomer(s.musteriId);
  let d = ((c && c.telefon) || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "9" + d; else if (d.length === 10) d = "90" + d;
  // 0) Numara kayıtlıysa native köprü ile DOĞRUDAN o WhatsApp sohbetine görsel aç (jid intent)
  if (d && window.AndroidWa && window.AndroidWa.sendImage) {
    try { window.AndroidWa.sendImage(url.split(",")[1], d, cap); return; } catch (e) {}
  }
  const P = window.Capacitor && window.Capacitor.Plugins;
  // 1) Native: Filesystem'e yaz → Share ile görsel dosyayı paylaş (WebView'de en güvenilir)
  if (P && P.Filesystem && P.Share) {
    try {
      const b64 = url.split(",")[1];
      const fname = "irsaliye-" + s.belgeNo + "-" + ((store.counters && store.counters.seq) || 0) + ".png";
      const w = await P.Filesystem.writeFile({ path: fname, data: b64, directory: "CACHE" });
      await P.Share.share({ title: "İrsaliye " + s.belgeNo, text: cap, files: [w.uri], dialogTitle: "Fişi paylaş" });
      return;
    } catch (e) { if (e && (e.message || "").toLowerCase().includes("cancel")) return; /* devam: web share */ }
  }
  // 2) Web Share (dosya) — koşulsuz dene
  if (navigator.share) {
    try { await navigator.share({ files: [dataURLtoFile(url, "irsaliye-" + s.belgeNo + ".png")], title: "İrsaliye " + s.belgeNo, text: cap }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  // 3) Son çare: görseli göster (basılı-tut yok — güncel APK'da native paylaşım gelir)
  openModal("Fiş Görseli " + s.belgeNo, `<img src="${url}" style="width:100%;border:1px solid var(--line);border-radius:8px" alt="fiş" /><p class="hint" style="margin-top:8px">Paylaşım menüsü açılamadı. Masaüstündeki <b>güncel ToptanciPanel.apk</b>'yı kur (native görsel paylaşımı eklendi).</p>`, { noFoot: true });
}
// Fiş kesildikten sonra: görsel + fiş metni bir arada; bağlı numaraya metin gönder / görseli paylaş
function fisGonderModal(s, opts) {
  if (!s) return;
  const url = irsaliyeGorsel(s, opts), c = s.musteriId && findCustomer(s.musteriId);
  const metin = saleIrsaliyeMetni(s, opts);
  let d = ((c && c.telefon) || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "9" + d; else if (d.length === 10) d = "90" + d;
  const body = `<img src="${url}" style="width:100%;border:1px solid var(--line);border-radius:8px" alt="fiş" />
    <div class="fg-actions">
      ${d ? `<a class="btn green lg" href="https://wa.me/${d}?text=${encodeURIComponent(metin)}" target="_blank" rel="noopener">📲 ${esc(c ? c.ad : "Numaraya")} — Fiş Metnini Gönder</a>` : `<p class="hint">Müşteri telefonu kayıtlı değil — metin numaraya gönderilemez.</p>`}
      <button class="btn primary lg" id="fgResim" type="button">🖼 Fiş Görselini Paylaş</button>
    </div>
    <p class="hint" style="margin-top:6px">Metin doğrudan bağlı numaraya gider (tek dokunuş gönder). Görsel için Paylaş → WhatsApp → kişi seç.</p>`;
  const m = openModal("Fiş / İrsaliye " + s.belgeNo, body, { noFoot: true, onMount: (ov) => { const r = ov.querySelector("#fgResim"); if (r) r.onclick = () => irsaliyePaylas(s, opts); } });
}
/* ---- HESAP ÖZETİ (ekstre) ----------------------------------------------
   Müşteriye "şu tarihten beri ne aldın, ne ödedin, ne kaldı" diye gönderilen belge.
   İrsaliye tek satışı gösterir; bu, dönem içindeki BÜTÜN hareketleri gösterir.
   Varsayılan dönem "son sıfırlanma": bakiyenin en son 0'a indiği an — müşteri
   "ben ödemiştim" dediğinde tartışma oradan başladığı için en anlaşılır kesit. */
function ekstreHareketler(id) {
  const c = findCustomer(id); if (!c) return [];
  const h = [];
  store.sales.forEach((s) => {
    if (s.musteriId !== id) return;
    const pesin = (Number(s.odeme.nakit) || 0) + (Number(s.odeme.pos) || 0);
    h.push({ t: s.tarih, tip: "satis", tutar: Number(s.toplam) || 0, acik: Number(s.odeme.acik) || 0,
             pesin: pesin, items: s.items || [], belge: s.belgeNo });
  });
  store.payments.forEach((p) => {
    if (p.musteriId !== id) return;
    h.push({ t: p.tarih, tip: "odeme", tutar: Number(p.tutar) || 0, not: p.not || "" });
  });
  h.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  let bak = Number(c.acilis) || 0;
  h.forEach((x) => { bak = kurus(bak + (x.tip === "satis" ? x.acik : -x.tutar)); x.bakiye = bak; x.oncesi = kurus(bak - (x.tip === "satis" ? x.acik : -x.tutar)); });
  return h;
}
/* Kalemleri tek satırlık özete indirger: "10 × Pet Şişe Su · 4 × Bardak Su".
   Canvas satır kaydırmadığı için uzunsa kırpılır. */
function ekstreKalemOzet(items) {
  const t = (items || []).map((it) => num2.format(it.adet) + " × " + it.ad).join("  ·  ");
  return t.length > 66 ? t.slice(0, 63) + "..." : t;
}
function ekstreSatirlari(id, mod) {
  const c = findCustomer(id), st = store.settings;
  const hep = ekstreHareketler(id);
  let bas = 0;
  if (mod === "gun90") {
    const sinir = new Date(Date.now() - 90 * 86400000).toISOString();
    bas = hep.findIndex((x) => x.t >= sinir); if (bas < 0) bas = hep.length;
  } else if (mod !== "tumu") {
    // son sıfırlanma: bakiyenin en son 0'a indiği hareket (o hareket dahil)
    for (let i = hep.length - 1; i >= 0; i--) { if (Math.abs(hep[i].bakiye) < 0.005) { bas = i; break; } }
  }
  const hs = hep.slice(bas);
  const donemBasi = hs.length ? hs[0].oncesi : customerBorc(id);
  const rows = [];
  rows.push({ t: st.fisBaslik || st.firmaAdi || "", size: 22, bold: true, center: true });
  rows.push({ t: "HESAP ÖZETİ", size: 13, center: true, color: "#555" });
  rows.push({ sep: 1 });
  rows.push({ t: "Müşteri: " + c.ad });
  rows.push({ t: "Tarih: " + fmtDateShort(new Date().toISOString()) });
  rows.push({ t: "Dönem: " + (hs.length ? fmtDateShort(hs[0].t) : "—") + " – " + fmtDateShort(new Date().toISOString()) });
  rows.push({ sep: 1 });
  if (Math.abs(donemBasi) > 0.005) rows.push({ t: "Dönem Başı Bakiye", r: money.format(donemBasi), color: "#555" });
  let alis = 0, ode = 0;
  hs.forEach((x) => {
    if (x.tip === "satis") {
      alis += x.tutar;
      rows.push({ t: fmtDateShort(x.t) + " — Teslimat", r: money.format(x.tutar), sub: ekstreKalemOzet(x.items) });
      if (x.pesin > 0.005) { ode += x.pesin; rows.push({ t: fmtDateShort(x.t) + " — Ödeme (peşin)", r: "-" + money.format(x.pesin), color: "#1e824c" }); }
    } else {
      ode += x.tutar;
      // Not YAZILMAZ: tahsilat notları iç kayıt ("bakiye düzeltmesi", "sisteme girilmemişti"
      // gibi) ve müşteriye gösterilecek şeyler değil. Sadece iade bilgisi anlamlı.
      const iade = /iade/i.test(x.not || "") ? x.not : "";
      rows.push({ t: fmtDateShort(x.t) + " — " + (iade ? "İADE" : "ÖDEME"), r: "-" + money.format(x.tutar), color: "#1e824c", sub: iade });
    }
  });
  rows.push({ sep: 1 });
  rows.push({ t: "TOPLAM TESLİMAT", r: money.format(alis), bold: true, size: 18 });
  rows.push({ t: "TOPLAM ÖDEME", r: "-" + money.format(ode), bold: true, size: 18, color: "#1e824c" });
  const kalan = customerBorc(id);
  rows.push({ sep: 1 });
  rows.push({ t: kalan > 0.005 ? "KALAN BAKİYE (BORÇ)" : "KALAN BAKİYE", r: money.format(kalan), bold: true, size: 20, color: kalan > 0.005 ? "#c0392b" : "#1e824c" });
  rows.push({ sep: 1 });
  rows.push({ t: st.fisAltbilgi || "Teşekkür ederiz", center: true, color: "#555" });
  return rows;
}
function ekstreGorsel(id, mod) { return fisCanvasCiz(ekstreSatirlari(id, mod)); }
function ekstreMetni(id, mod) {
  const c = findCustomer(id);
  return (store.settings.fisBaslik || store.settings.firmaAdi || "") + "\nHESAP ÖZETİ\n" + c.ad +
    "\nTarih: " + fmtDateShort(new Date().toISOString()) +
    "\nKalan bakiye: " + money.format(customerBorc(id));
}
async function ekstrePaylas(id, mod) {
  const c = findCustomer(id); if (!c) { alert("Müşteri bulunamadı."); return; }
  const url = ekstreGorsel(id, mod);
  const cap = "Hesap Özeti · " + c.ad + " · Kalan Bakiye: " + money.format(customerBorc(id));
  let d = (c.telefon || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "9" + d; else if (d.length === 10) d = "90" + d;
  if (d && window.AndroidWa && window.AndroidWa.sendImage) {
    try { window.AndroidWa.sendImage(url.split(",")[1], d, cap); return; } catch (e) {}
  }
  const P = window.Capacitor && window.Capacitor.Plugins;
  if (P && P.Filesystem && P.Share) {
    try {
      const fname = "hesap-ozeti-" + (c.ad || "musteri").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-" + Date.now() + ".png";
      const w = await P.Filesystem.writeFile({ path: fname, data: url.split(",")[1], directory: "CACHE" });
      await P.Share.share({ title: "Hesap Özeti", text: cap, files: [w.uri], dialogTitle: "Hesap özetini paylaş" });
      return;
    } catch (e) { if (e && (e.message || "").toLowerCase().includes("cancel")) return; }
  }
  if (navigator.share) {
    try { await navigator.share({ files: [dataURLtoFile(url, "hesap-ozeti.png")], title: "Hesap Özeti", text: cap }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  openModal("Hesap Özeti · " + c.ad, `<img src="${url}" style="width:100%;border:1px solid var(--line);border-radius:8px" alt="hesap özeti" />`, { noFoot: true });
}
/* Önizleme + dönem seçimi. Müşteri kartındaki "Hesap Özeti" düğmesi burayı açar. */
function ekstreModal(id, mod) {
  const c = findCustomer(id); if (!c) return;
  mod = mod || "sifir";
  const url = ekstreGorsel(id, mod);
  const metin = ekstreMetni(id, mod);
  let d = (c.telefon || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "9" + d; else if (d.length === 10) d = "90" + d;
  const sec = (k, ad) => `<button class="btn ${mod === k ? "primary" : "soft"} sm" data-ekmod="${k}" type="button">${ad}</button>`;
  const body = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      ${sec("sifir", "Son sıfırlamadan")}${sec("gun90", "Son 90 gün")}${sec("tumu", "Tüm hareketler")}
    </div>
    <img src="${url}" style="width:100%;border:1px solid var(--line);border-radius:8px" alt="hesap özeti" />
    <div class="fg-actions">
      ${d ? `<a class="btn green lg" href="https://wa.me/${d}?text=${encodeURIComponent(metin)}" target="_blank" rel="noopener">📲 ${esc(c.ad)} — Özet Metnini Gönder</a>` : `<p class="hint">Müşteri telefonu kayıtlı değil — metin numaraya gönderilemez.</p>`}
      <button class="btn primary lg" id="ekResim" type="button">🖼 Hesap Özetini Paylaş (görsel)</button>
    </div>
    <p class="hint" style="margin-top:6px">Görsel için Paylaş → WhatsApp → kişi seç. Dönemi yukarıdan değiştirebilirsin.</p>`;
  const m = openModal("Hesap Özeti · " + c.ad, body, { noFoot: true, onMount: (ov) => {
    const r = ov.querySelector("#ekResim"); if (r) r.onclick = () => ekstrePaylas(id, mod);
    ov.querySelectorAll("[data-ekmod]").forEach((b) => {
      b.onclick = () => { const k = b.getAttribute("data-ekmod"); m.close(); ekstreModal(id, k); };
    });
  } });
  return m;
}
function openSaleForCustomer(id) {
  const c = pos.carts[pos.active]; c.musteriId = id; navigate("satis");
}
// Kamera-barkod tarama (BarcodeDetector). Desteklenmezse elle giriş için barkod alanına odaklanır.
async function taraBaslat() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const bi = document.getElementById("barInput"); if (bi) bi.focus();
    alert("Bu cihazda kamera erişimi yok — barkodu elle okutun."); return;
  }
  const hasBD = "BarcodeDetector" in window;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
  } catch (e) { alert("Kamera açılamadı: " + ((e && e.message) || e)); return; }
  let stop = false;
  const durdur = () => { stop = true; try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {} };
  const body = `<div class="tara-modal">
      <video id="taraVid" playsinline autoplay muted></video>
      <div class="tara-cerceve"></div>
      <div class="tara-hint" id="taraHint">${hasBD ? "Barkodu çerçeveye getir…" : "Kamera açık — okununca eşleşen ürün sepete eklenir."}</div>
    </div>`;
  const m = openModal("Barkod Tara", body, {
    noFoot: true,
    onMount: (ov) => {
      const vid = ov.querySelector("#taraVid"); vid.srcObject = stream; try { vid.play(); } catch (e) {}
      const kapatBtn = ov.querySelector(".x"); if (kapatBtn) kapatBtn.addEventListener("click", durdur);
      ov.addEventListener("click", (e) => { if (e.target === ov) durdur(); });
      if (!hasBD) return; // BarcodeDetector yok: kullanıcı görüntüden okuyup elle girer
      let det; try { det = new window.BarcodeDetector(); } catch (e) { return; }
      const bul = (code) => {
        durdur(); m.close();
        const p = store.products.find((x) => String(x.barkod || "") === String(code));
        if (p) { addToCart(p.id); }
        else { const bi = document.getElementById("barInput"); if (bi) bi.value = code; alert("Barkod: " + code + "\nEşleşen ürün yok — elle arayabilirsiniz."); }
      };
      const tick = async () => {
        if (stop) return;
        try { const codes = await det.detect(vid); if (codes && codes.length && codes[0].rawValue) { bul(codes[0].rawValue); return; } } catch (e) {}
        if (!stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
  });
}
function konumKaydet(id) {
  const c = findCustomer(id); if (!c) return;
  const kaydet = (lat, lng) => { c.lat = lat; c.lng = lng; c.konumTarih = new Date().toISOString(); saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); alert(c.ad + " konumu kaydedildi 📍"); render(); };
  if (rota.konum) { kaydet(rota.konum.lat, rota.konum.lng); return; }
  if (!navigator.geolocation) { alert("Bu cihazda konum desteklenmiyor."); return; }
  // Servis başlamış olsun olmasın anlık konumu al (GPS watch henüz fix vermemişse de çalışır)
  navigator.geolocation.getCurrentPosition(
    (p) => { rota.konum = { lat: p.coords.latitude, lng: p.coords.longitude }; kaydet(p.coords.latitude, p.coords.longitude); },
    (e) => alert("Konum alınamadı: " + ((e && e.message) || e) + "\nTelefon konumunu/GPS'i aç ve tekrar dene."),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function ziyaretKartiHTML(id) {
  const c = findCustomer(id); if (!c) return "";
  const borc = customerBorc(id);
  const ay = musteriAylikCiro(id);
  const son = [...store.sales].filter((s) => s.musteriId === id).sort((a, b) => b.tarih.localeCompare(a.tarih)).slice(0, 3);
  const sonRows = son.length ? son.map((s) => `<div class="zk-satis"><span>${fmtDate(s.tarih)} · ${s.items.length} kalem</span><b>${money.format(s.toplam)}</b></div>`).join("") : `<p class="hint">Henüz satış yok.</p>`;
  const konumVar = c.lat != null && c.lng != null;
  return `<div class="ziyaret-kart">
    <div class="zk-head"><div><h2>${esc(c.ad)}</h2>${c.telefon ? `<span class="hint">${esc(c.telefon)}</span>` : ""}</div>
      <button class="btn soft sm" data-zkapat type="button">✕</button></div>
    <div class="zk-metrik">
      <div class="zkm"><span>Bakiye</span><b class="${borc > 0 ? "borc-red" : ""}">${money.format(borc)}</b></div>
      <div class="zkm"><span>Bu ay ciro</span><b>${money.format(ay)}</b></div>
      <div class="zkm"><span>Puan</span><b id="zkPuan">…</b></div>
    </div>
    <div class="zk-son"><h3>Son satışlar</h3>${sonRows}</div>
    ${servis.aktif ? `<div class="zk-hizli">
      <label>Hızlı sipariş (ne aldı, kaç adet)</label>
      <div class="zk-hizli-row"><input id="zkHizli" placeholder="7 soda 2 gazoz 17 su" /><button class="btn green" id="zkHizliBtn" type="button">Sepete Doldur → Satış</button></div>
      <p class="hint" id="zkHizliDurum">Yaz → ürünler sepete dolar, satış ekranına geçer. (Boş bırakıp "Satış Yap" ile de girebilirsin.)</p>
    </div>` : ""}
    <div class="zk-aksiyon">
      <button class="btn green lg" data-zksatis="${id}" type="button">🖊 Satış Yap</button>
      <button class="btn soft" data-zkkonum="${id}" type="button">📍 ${konumVar ? "Konumu Güncelle" : "Konumu Kaydet"}</button>
      <button class="btn soft" data-zkwa="${id}" type="button">📲 Son İrsaliyeyi Paylaş (görsel)</button>
      <button class="btn soft" data-zkekstre="${id}" type="button">🧾 Hesap Özeti Çıkar</button>
      ${servis.aktif ? `<button class="btn primary lg" data-zktamam="${id}" type="button">✓ Ziyareti Tamamla → Sonraki</button>
      <div class="zk-alt"><button class="btn soft sm" data-zkpas="${id}" type="button">⏭ Pas Geç</button><button class="btn soft sm" data-zksona="${id}" type="button">&#8630; Rotanın Sonuna</button></div>` : ""}
    </div>
    </div>
  </div>`;
}
function ziyaretKartiWire(id) {
  const kart = document.getElementById("rotaKart");
  const c = findCustomer(id);
  kart.querySelector("[data-zkapat]").onclick = () => { if (servis.aktif) { servis.acik = null; render(); } else kart.innerHTML = ""; };
  kart.querySelector("[data-zksatis]").onclick = () => openSaleForCustomer(id);
  kart.querySelector("[data-zkkonum]").onclick = () => konumKaydet(id);
  kart.querySelector("[data-zkwa]").onclick = () => irsaliyePaylas(musterininSonSatisi(id));
  kart.querySelector("[data-zkekstre]").onclick = () => ekstreModal(id);
  const tmbtn = kart.querySelector("[data-zktamam]"); if (tmbtn) tmbtn.onclick = () => durakTamamla(id);
  const pasbtn = kart.querySelector("[data-zkpas]"); if (pasbtn) pasbtn.onclick = () => { if (confirm("Bu müşteri pas geçilsin mi?")) durakPasGec(id); };
  const sonabtn = kart.querySelector("[data-zksona]"); if (sonabtn) sonabtn.onclick = () => durakSonaAt(id);
  const hzbtn = kart.querySelector("#zkHizliBtn");
  if (hzbtn) hzbtn.onclick = () => hizliSiparisDoldur(id, (kart.querySelector("#zkHizli") || {}).value || "", kart.querySelector("#zkHizliDurum"));
  // puan (bayi_puan:<tel>) — async
  const tel = ((c && c.telefon) || "").replace(/\D/g, "");
  const pEl = document.getElementById("zkPuan");
  if (tel && typeof kvGet === "function") { kvGet("bayi_puan:" + tel).then((r) => { if (pEl) pEl.textContent = num2.format((r && r.value) || 0); }).catch(() => { if (pEl) pEl.textContent = "0"; }); }
  else if (pEl) pEl.textContent = "0";
  // kayıt
}
function rotaListeDoldur() {
  const el = document.getElementById("rotaListe"); if (!el) return;
  if (!rota.konum) { el.innerHTML = `<p class="hint" style="padding:8px">Yakındaki müşterileri görmek için "Konumu Al"a bas.</p>`; return; }
  const konumlu = store.customers.filter((c) => c.lat != null && c.lng != null)
    .map((c) => ({ c, d: haversine(rota.konum.lat, rota.konum.lng, c.lat, c.lng) }))
    .sort((a, b) => a.d - b.d);
  const konumsuz = store.customers.filter((c) => c.lat == null || c.lng == null);
  const yakin = konumlu.map(({ c, d }) => `<div class="rota-satir" data-rmus="${c.id}"><span class="rota-mes ${d < 100 ? "yakin" : ""}">${mesafeMetin(d)}</span><div class="rota-mid"><b>${esc(c.ad)}</b><span class="hint">Bakiye ${money.format(customerBorc(c.id))}</span></div><span class="rota-ok">›</span></div>`).join("");
  el.innerHTML =
    (konumlu.length ? `<div class="section-title" style="margin:4px 0 8px">Yakındaki müşteriler</div>${yakin}` : `<p class="hint" style="padding:8px">Konumu kayıtlı müşteri yok. Bir müşteriye uğrayınca kartından "Konumu Kaydet" ile öğret.</p>`) +
    (konumsuz.length ? `<details class="rota-konumsuz"><summary>Konumu kayıtlı olmayanlar (${konumsuz.length})</summary>${konumsuz.map((c) => `<div class="rota-satir" data-rmus="${c.id}"><span class="rota-mes">—</span><div class="rota-mid"><b>${esc(c.ad)}</b><span class="hint">Bakiye ${money.format(customerBorc(c.id))}</span></div><span class="rota-ok">›</span></div>`).join("")}</details>` : "");
  el.querySelectorAll("[data-rmus]").forEach((row) => row.addEventListener("click", () => {
    const kart = document.getElementById("rotaKart"); kart.innerHTML = ziyaretKartiHTML(row.dataset.rmus); ziyaretKartiWire(row.dataset.rmus);
    kart.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}
// Araca mal girişi. İki ayrı iş:
//   "Satın aldım"        → araç stoğu artar + ALIŞ KAYDI açılır (peşin; nakit/kart/havale). Gider yazılmaz: mal alımı
//                          masraf değildir, maliyeti satılınca düşer.
//   "Dükkandan yükledim" → dükkan stoğundan düşer, araca eklenir (para hareketi yok).
function aracAlimModal(baslangic) {
  let q = "", mod = baslangic === "yukle" ? "yukle" : "satin", oturumAlis = null;
  const liste = () => {
    let list = store.products.filter((p) => p.gorunur !== false);
    if (q) { const n = ocrNorm(q); list = list.filter((p) => ocrNorm(p.ad).includes(n)); }
    return list.slice(0, 300).map((p) => `<div class="aa-row"><div class="aa-ad">${esc(p.ad)}<span class="hint" data-aastok="${p.id}"> · araç ${num2.format(Number(p.aracStok) || 0)}${mod === "yukle" ? " · dükkan " + num2.format(Number(p.stok) || 0) : ""}</span></div><input class="aa-in" data-aa="${p.id}" type="number" inputmode="numeric" placeholder="adet" />${mod === "satin" ? `<input class="aa-in aa-al" data-aaal="${p.id}" type="number" inputmode="decimal" placeholder="₺alış" value="${Number(p.alis) || ""}" title="birim alış" />` : ""}<button class="btn ok aa-btn" data-aaadd="${p.id}" type="button">＋</button></div>`).join("") || `<p class="hint" style="padding:8px">Ürün yok.</p>`;
  };
  const aciklama = () => mod === "satin"
    ? `Adet + birim alış (₺) yaz → ＋. Araca eklenir ve <b>alış faturası</b> olarak kaydedilir.`
    : `Adet yaz → ＋. <b>Dükkan stoğundan düşer</b>, araca eklenir.`;
  const body = `${stkSecim("aaMod", [["satin", "🧾 Satın aldım"], ["yukle", "🏪 Dükkandan yükledim"]], mod)}
    <div class="field" id="aaTurKutu" style="margin:8px 0 0"><label>Nasıl ödedin?</label>${stkSecim("aaTur", [["nakit", "Nakit"], ["kart", "Kart"], ["havale", "Havale"]], "nakit")}</div>
    <input id="aaAra" placeholder="Ürün ara..." style="width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:11px;margin-top:8px" /><p class="hint" id="aaAciklama" style="margin:8px 0 4px">${aciklama()}</p><div id="aaList" style="max-height:48vh;overflow:auto">${liste()}</div>`;
  const m = openModal("🛒 Araca Mal Girişi", body, {
    noFoot: true,
    onMount: (ov) => {
      const l = ov.querySelector("#aaList"), ara = ov.querySelector("#aaAra");
      const wire = () => l.querySelectorAll("[data-aaadd]").forEach((b) => b.onclick = () => {
        const inp = l.querySelector(`[data-aa="${b.dataset.aaadd}"]`); const n = inp ? Number(inp.value) || 0 : 0;
        if (n <= 0) { alert("Adet gir."); return; }
        const p = findProduct(b.dataset.aaadd); if (!p) return;
        if (mod === "yukle") stkAktar(store, [{ urunId: p.id, adet: n }], "araca", stkA());
        else {
          const alEl = l.querySelector(`[data-aaal="${b.dataset.aaadd}"]`); const birimAlis = alEl ? Number(alEl.value) || 0 : (Number(p.alis) || 0);
          const r = stkAlimKaydet(store, { hedef: "arac", odeme: "pesin", odemeTuru: ov.querySelector("#aaTur").value, no: oturumAlis ? oturumAlis.no : "", not: "Araca alım (yolda)", items: [{ urunId: p.id, ad: p.ad, adet: n, birimFiyat: birimAlis }] }, stkA());
          // Aynı pencerede eklenen kalemler TEK alış kaydında toplanır.
          if (oturumAlis && store.purchases.includes(oturumAlis)) { oturumAlis.items.push(r.kayit.items[0]); oturumAlis.toplam = kurus(oturumAlis.toplam + r.kayit.toplam); store.purchases = store.purchases.filter((x) => x.id !== r.kayit.id); store.counters.purchase -= 1; }
          else oturumAlis = r.kayit;
          store.aracHareket.push({ id: genId(), urunId: p.id, ad: p.ad, adet: n, birimAlis, tutar: kurus(n * birimAlis), yon: "alim", alisId: oturumAlis.id, tarih: new Date().toISOString() });
          const etki = stkMarjEtki(store, r.degisen);
          if (etki.length) alert(stkMarjMetin(etki, stkMarjEsik(store)).join("\n"));
        }
        saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
        if (inp) inp.value = "";
        const st = l.querySelector(`[data-aastok="${p.id}"]`); if (st) st.textContent = " · araç " + num2.format(Number(p.aracStok) || 0) + (mod === "yukle" ? " · dükkan " + num2.format(Number(p.stok) || 0) : "");
        b.textContent = "✓"; setTimeout(() => { b.textContent = "＋"; }, 700);
      });
      wire();
      const modGuncelle = () => { ov.querySelector("#aaTurKutu").style.display = mod === "satin" ? "" : "none"; ov.querySelector("#aaAciklama").innerHTML = aciklama(); l.innerHTML = liste(); wire(); };
      stkSecimBagla(ov, "aaMod", (v) => { mod = v; modGuncelle(); });
      stkSecimBagla(ov, "aaTur");
      modGuncelle();
      ara.addEventListener("input", () => { q = ara.value.trim(); l.innerHTML = liste(); wire(); });
      const x = ov.querySelector(".x"); if (x) x.addEventListener("click", () => render());
    },
  });
}
// Rota içeriğini incele: kimler var (çıkar), kimler yok (ekle)
function rotaIncele(rotaId) {
  const r = (store.rotalar || []).find((x) => x.id === rotaId); if (!r) return;
  const inSet = new Set(r.musteriIds);
  const uyeler = r.musteriIds.map((id) => findCustomer(id)).filter(Boolean);
  const disinda = store.customers.filter((c) => !inSet.has(c.id) && !c.bayi);
  const uyeRows = uyeler.map((c, i) => `<div class="ri-row"><span class="ri-no">${i + 1}</span><div class="ri-mid"><b>${esc(c.ad)}</b><span class="hint">${esc(c.mahalle || c.bolge || "")}${c.servisGunu ? " · " + esc(c.servisGunu) : ""} · Bakiye ${money.format(customerBorc(c.id))}</span></div>${(c.telefon || "").replace(/\D/g, "") ? `<button class="btn soft sm" data-onsip="${c.id}" type="button" title="Ön sipariş mesajı">📲</button>` : ""}<button class="rm" data-rcikar="${c.id}" type="button" title="Rotadan çıkar">✕</button></div>`).join("") || `<p class="hint" style="padding:8px">Bu rotada müşteri yok.</p>`;
  const disRows = disinda.map((c) => `<div class="ri-row"><span class="ri-no">＋</span><div class="ri-mid"><b>${esc(c.ad)}</b><span class="hint">${esc(c.mahalle || c.bolge || "")}</span></div><button class="btn green sm" data-rekle="${c.id}" type="button">Ekle</button></div>`).join("") || `<p class="hint" style="padding:8px">Tüm müşteriler bu rotada.</p>`;
  const telli = uyeler.filter((c) => (c.telefon || "").replace(/\D/g, "")).length;
  const body = `<div class="ri-bas">Rotadaki müşteriler (${uyeler.length}) <span class="hint">📲 = ön sipariş mesajı</span></div><div class="ri-list">${uyeRows}</div>
    <details style="margin-top:12px"><summary>Rotada olmayanlar (${disinda.length}) — eklemek için</summary><div class="ri-list">${disRows}</div></details>
    <button class="btn softred" id="rotaSilBtn" type="button" style="width:100%;margin-top:14px">🗑 Rotayı Sil</button>`;
  const m = openModal("👁 " + esc(r.ad) + " — Rota İçeriği", body, {
    noFoot: true,
    onMount: (ov) => {
      ov.querySelectorAll("[data-rcikar]").forEach((b) => b.onclick = () => { r.musteriIds = r.musteriIds.filter((x) => x !== b.dataset.rcikar); saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); m.close(); rotaIncele(rotaId); });
      ov.querySelectorAll("[data-rekle]").forEach((b) => b.onclick = () => { if (!r.musteriIds.includes(b.dataset.rekle)) r.musteriIds.push(b.dataset.rekle); saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); m.close(); rotaIncele(rotaId); });
      ov.querySelectorAll("[data-onsip]").forEach((b) => b.onclick = () => onSiparisMesaj(findCustomer(b.dataset.onsip)));
      const sil = ov.querySelector("#rotaSilBtn"); if (sil) sil.onclick = () => { if (confirm(`"${r.ad}" rotası silinsin mi?`)) { store.rotalar = (store.rotalar || []).filter((x) => x.id !== rotaId); saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); m.close(); render(); } };
      const x = ov.querySelector(".x"); if (x) x.addEventListener("click", () => render());
    },
  });
}
// Ön sipariş: müşteriye WhatsApp'tan sipariş isteği mesajı (rotadan önce)
function onSiparisMesaj(c) {
  if (!c) return;
  let d = (c.telefon || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "9" + d; else if (d.length === 10) d = "90" + d;
  if (!d) { alert("Bu müşteride telefon kayıtlı değil."); return; }
  const st = store.settings || {};
  const txt = `Merhaba ${c.ad},\n${st.fisBaslik || st.firmaAdi || "Özgür Ticaret"} 🚚\nYakında servisimiz size uğrayacak. İhtiyacınız olan ürünleri bu mesaja yazarsanız hazırlayıp getirelim.\nTeşekkürler.`;
  window.open("https://wa.me/" + d + "?text=" + encodeURIComponent(txt), "_blank");
}
// 🤖 Araç Stok Ajanı: araçta olması gereken ama azalan/biten ürünleri izler
const ARAC_AJAN_ESIK = 5; // aracStandart yoksa varsayılan alt sınır
function aracDusukListe() {
  return store.products.filter((p) => {
    if (p.gorunur === false || p.aractaBulunsun === false) return false;
    const arac = Number(p.aracStok) || 0;
    const min = Number(p.aracStandart) > 0 ? Number(p.aracStandart) : ARAC_AJAN_ESIK;
    const araçta = arac > 0 || Number(p.aracStandart) > 0 || (store.aracHareket || []).some((h) => h.urunId === p.id);
    return araçta && arac <= min;
  }).map((p) => ({ p, arac: Number(p.aracStok) || 0 })).sort((a, b) => a.arac - b.arac);
}
function aracStokAjaniHTML() {
  const list = aracDusukListe();
  if (!list.length) return `<div class="ajan ok"><span class="ajan-ic">🤖</span><div class="ajan-txt"><b>Araç Stok Ajanı</b><span class="hint">Azalan/biten ürün yok — araç dolu 👍</span></div></div>`;
  const bitti = list.filter((x) => x.arac <= 0).length;
  const chips = list.map(({ p, arac }) => `<span class="ajan-chip ${arac <= 0 ? "bitti" : "az"}">${esc(p.ad)}: <b>${num2.format(arac)}</b></span>`).join("");
  return `<details class="ajan uyari"><summary class="ajan-bas"><span class="ajan-ic">🤖</span><b>Araç Stok Ajanı — ${list.length} azaldı${bitti ? " · " + bitti + " bitti" : ""}</b><span class="ajan-ok">▾</span></summary><div class="ajan-body"><div class="ajan-chips">${chips}</div><button class="ajan-al btn ok sm" data-act="aracalim" type="button">🛒 Araca Al</button></div></details>`;
}
// Yemek/mola gideri — servis sırasında hızlı gider girişi
function yemekModal() {
  const m = openModal("🍽️ Yemek / Mola Gideri", `<div class="field"><label>Tutar (₺)</label><input id="ymTutar" type="number" inputmode="decimal" placeholder="0" /></div><div class="field"><label>Not (opsiyonel)</label><input id="ymNot" placeholder="ör. öğle yemeği" /></div><button class="btn ok" id="ymKaydet" type="button" style="width:100%;min-height:46px;justify-content:center">Gider Ekle</button>`, {
    noFoot: true,
    onMount: (ov) => {
      const t = ov.querySelector("#ymTutar"); t.focus();
      ov.querySelector("#ymKaydet").onclick = () => {
        const v = Number(t.value) || 0; if (v <= 0) { alert("Tutar gir."); return; }
        store.expenses.push({ id: genId(), tutar: v, kategori: "Yemek", not: (ov.querySelector("#ymNot").value || "").trim() || "Servis yemek/mola", tarih: new Date().toISOString() });
        saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
        m.close(); alert("Yemek gideri eklendi ✔");
      };
    },
  });
}
function renderRota() {
  return servis.aktif ? renderServisAktif() : renderServisBaslat();
}
function renderServisBaslat() {
  const rotalar = store.rotalar || [];
  const rlist = rotalar.length
    ? rotalar.map((r) => `<div class="rota-kayit-satir" data-rincele="${r.id}" role="button" tabindex="0"><div class="rk-mid"><b>${esc(r.ad)}</b><span class="hint">${r.musteriIds.length} müşteri · dokun → incele/düzenle/sil</span></div><button class="btn green sm" data-rbaslat="${r.id}" type="button">▶ Başlat</button></div>`).join("")
    : `<p class="hint" style="padding:6px">Kayıtlı rota yok. "Yeni Rota Oluştur" ile başla.</p>`;
  return pageHead("Rota / Saha Satış", "Servisi başlat — uygulama seni müşteri müşteri yönlendirir", [{ label: "🛒 Araca Al", cls: "soft", act: "aracalim" }]) +
    aracStokAjaniHTML() +
    `<div class="card"><button class="btn primary lg" id="rotaOlustur" type="button" style="width:100%">＋ Yeni Rota Oluştur & Servisi Başlat</button></div>
    <div class="section-title" style="margin-top:14px">Kayıtlı Rotalar</div>
    <div class="card">${rlist}</div>`;
}
function servisStepperHTML() {
  return servis.musteriIds.map((id, i) => {
    const c = findCustomer(id); if (!c) return "";
    const edildi = servis.edilen.includes(id), pasli = servis.paslar.includes(id), bu = servis.acik === id;
    const durum = edildi ? "edildi" : pasli ? "pas" : bu ? "acik" : "";
    const sag = edildi ? `<span class="sd-tag ok">✓</span>` : pasli ? `<span class="sd-tag pas">pas</span>` : bu ? `<span class="sd-tag now">şimdi</span>` : `<button class="btn soft sm" data-durakac="${id}" type="button">Aç</button>`;
    return `<div class="servis-durak ${durum}"><span class="sd-no">${edildi ? "✓" : pasli ? "–" : (i + 1)}</span><div class="sd-mid"><b>${esc(c.ad)}</b></div>${sag}</div>`;
  }).join("");
}
function servisSepetHTML() {
  const it = activeCart().items;
  if (!it.length) return `<p class="hint" style="padding:6px">Sepet boş — yukarıdan ürün ekle.</p>`;
  const t = cartTotals();
  return it.map((l, i) => {
    const tut = (Number(l.fiyat) || 0) * (Number(l.adet) || 0);
    return `<div class="ss-row">
      <span class="ss-ad">${esc(l.ad)}</span>
      <span class="ss-adet"><button class="ss-b" data-ssm="${i}" type="button">−</button><b>${num2.format(l.adet)}</b><button class="ss-b" data-ssp="${i}" type="button">+</button></span>
      <input class="ss-fin" data-ssfiyat="${i}" type="number" step="0.01" inputmode="decimal" value="${Number(l.fiyat) || 0}" />
      <span class="ss-tut" data-sstut="${i}">${money.format(tut)}</span>
    </div>`;
  }).join("") + `<div class="ss-tot"><b>Toplam</b><b class="ss-toplam">${money.format(t.toplam)}</b></div>`;
}
// Servis ürün adımı kategori şeridi (ana satış ekranıyla aynı kategoriler; data-scat)
function sCatTabsHTML() {
  const used = new Set(store.products.filter((p) => p.gorunur !== false).map((p) => p.grup || "GRUPSUZ ÜRÜN"));
  const cats = ["ANA"].concat(allGroupNames().filter((g) => used.has(g)));
  return cats.map((c) => `<span class="cat-tab ${c === pos.cat ? "on" : ""}" data-scat="${c}">${c === "ANA" ? "☰ Kategoriler" : esc(c)}</span>`).join("");
}
function servisSihirbaz(id) {
  const c = findCustomer(id); if (!c) return "";
  const adim = servis.adim || "onay";
  if (adim === "onay") {
    const borc = customerBorc(id), ay = musteriAylikCiro(id), son = musterininSonSatisi(id);
    return `<div class="card sihir">
      <div class="sihir-adim">Durak · 1/4</div><h2>${esc(c.ad)}</h2>
      ${c.telefon ? `<p class="hint">${esc(c.telefon)}${c.adres ? " · " + esc(c.adres) : ""}</p>` : ""}
      <div class="zk-metrik" style="margin:12px 0">
        <div class="zkm"><span>Bakiye</span><b class="${borc > 0 ? "borc-red" : ""}">${money.format(borc)}</b></div>
        <div class="zkm"><span>Bu ay</span><b>${money.format(ay)}</b></div>
        <div class="zkm"><span>Puan</span><b id="zkPuan">…</b></div>
      </div>
      ${son ? `<p class="hint">Son satış: ${fmtDate(son.tarih)} · ${money.format(son.toplam)}</p>` : ""}
      ${(() => { const notlar = (store.ziyaretler || []).filter((z) => z.musteriId === id && (z.not || "").trim()).slice(-3).reverse(); return notlar.length ? `<div class="zn-kutu"><div class="zn-bas">📝 Önceki ziyaret notları</div>${notlar.map((z) => `<div class="zn-not"><span class="hint">${fmtDate(z.tarih)}</span> ${esc(z.not)}</div>`).join("")}</div>` : ""; })()}
      ${(() => { const o = musteriOneri(id); return o.length ? `<div class="oner-kutu"><div class="oner-bas">🎯 Öner (geçen aldı, bu ay almadı)</div><div class="oner-cip">${o.map((p) => `<button class="oner-c" data-oner="${p.id}" type="button">${esc(p.ad)}</button>`).join("")}</div></div>` : ""; })()}
      <button class="btn soft" data-skonum="${id}" type="button" style="width:100%;margin:10px 0 0">📍 ${(c.lat != null && c.lng != null) ? "Konumu Güncelle" : "Bu Müşterinin Konumunu Kaydet"}</button>
      <p class="sihir-soru">Doğru müşteriye mi geldin?</p>
      <div class="sihir-btn">
        <button class="btn green lg" data-sonay="${id}" type="button">✓ Evet — Devam</button>
        <div class="zk-alt"><button class="btn soft sm" data-zkpas="${id}" type="button">⏭ Pas Geç</button><button class="btn soft sm" data-zksona="${id}" type="button">&#8630; Sona At</button></div>
      </div>
    </div>`;
  }
  if (adim === "satisMi") {
    return `<div class="card sihir"><div class="sihir-adim">Satış · 2/4</div><h2>${esc(c.ad)}</h2>
      <p class="sihir-soru">Satış var mı?</p>
      <div class="sihir-btn"><button class="btn green lg" data-satvar="${id}" type="button">✅ Evet, ürün seç</button><button class="btn soft lg" data-satyok="${id}" type="button">🚫 Satış yok — sadece ziyaret</button></div>
    </div>`;
  }
  if (adim === "urun") {
    return `<div class="card sihir"><div class="sihir-adim">Ürünler · 3/4</div><h2>${esc(c.ad)}</h2>
      <div class="sip-bar">
        <input id="zkHizli" class="sip-in" placeholder="Sipariş yaz veya 🎤 söyle: 7 soda 2 gazoz 5 su" />
        <div class="sip-btns">
          <button class="btn soft" id="zkSes" type="button">&#127908; Sesli</button>
          <button class="btn green" id="zkHizliBtn" type="button">&#10003; Doldur</button>
        </div>
      </div>
      <div class="pos-search" style="margin-bottom:8px"><input class="bar-input" id="prodSearch" placeholder="Ürün ara..." value="${esc(pos.q || "")}" /></div>
      <div class="cat-tabs" id="sCatTabs">${sCatTabsHTML()}</div>
      <div class="prod-grid" id="prodGrid">${prodGridHTML()}</div>
      <div class="sihir-sepet" id="sihirSepet">${servisSepetHTML()}</div>
      <div class="sihir-btn"><button class="btn primary lg" id="odemeGec" type="button">Ödemeye Geç →</button><button class="btn soft sm" data-sgeri="satisMi" type="button">← Geri</button></div>
    </div>`;
  }
  if (adim === "kapanis") {
    const borc = customerBorc(id);
    const satildi = !!servis.sonSatisId;
    const sale = satildi ? store.sales.find((s) => s.id === servis.sonSatisId) : null;
    const urunOpts = `<option value="">— iade ürünü —</option>` + store.products.map((p) => `<option value="${p.id}">${esc(p.ad)}</option>`).join("");
    return `<div class="card sihir"><div class="sihir-adim">Kapanış</div><h2>${esc(c.ad)}</h2>
      ${satildi ? `<div class="kp-ok">✓ Satış yapıldı · ${money.format(sale ? sale.toplam : 0)}</div>` : `<div class="kp-blok"><label>Satış yok — sebep?</label><div class="kp-sebep">${["Stok dolu", "Borç fazla", "Kapalı", "Küs", "Fiyat", "Diğer"].map((s) => `<button class="kp-sb" data-sebep="${s}" type="button">${s}</button>`).join("")}</div></div>`}
      ${borc > 0 ? `<div class="kp-blok"><label>💰 Tahsilat — bakiye ${money.format(borc)}</label><div class="zk-hizli-row"><input id="kpTahsil" type="number" inputmode="decimal" placeholder="0" /><select id="kpTahsilTip"><option value="nakit">Nakit</option><option value="pos">Kart (POS)</option><option value="havale">Havale</option></select></div></div>` : ""}
      <div class="kp-blok"><label>↩ İade (varsa)</label><div class="zk-hizli-row"><select id="kpIadeUrun">${urunOpts}</select><input id="kpIadeAdet" type="number" inputmode="decimal" placeholder="adet" style="max-width:78px" /></div></div>
      <div class="kp-blok"><label>📋 İstediği ama veremediğin ürün</label><input id="kpTalep" placeholder="ör. 5 koli X marka ayran" /></div>
      <div class="kp-blok"><label>📝 Not</label><input id="kpNot" placeholder="ziyaret notu / şikayet" /></div>
      <div class="kp-blok"><label>📅 Sonraki ziyaret</label><input id="kpSonraki" type="date" /></div>
      <button class="btn primary lg" id="kpBitir" type="button" style="width:100%;margin-top:10px">✓ Ziyareti Bitir → Sonraki</button>
    </div>`;
  }
  const t = cartTotals();
  return `<div class="card sihir"><div class="sihir-adim">Ödeme · 4/4</div><h2>${esc(c.ad)}</h2>
    <div class="sihir-tot">Toplam <b>${money.format(t.toplam)}</b></div>
    <p class="sihir-soru">Nasıl ödendi?</p>
    <div class="sihir-odeme">
      <button class="btn green lg" data-sode="nakit" type="button">₺ Nakit</button>
      <button class="btn lg" data-sode="pos" type="button">▤ POS</button>
      <button class="btn soft lg" data-sode="acik" type="button">📖 Açık Hesap</button>
      <button class="btn soft lg" data-sode="parcali" type="button">⇄ Parçalı</button>
    </div>
    <button class="btn soft sm" data-sgeri="urun" type="button" style="margin-top:10px">← Ürünlere Dön</button>
  </div>`;
}
// Rota başında araç stok kontrol adımı — tek tek say/işaretle, sonra rota başlar
function aracStokKontrolHTML() {
  let src = store.products.filter((p) => p.gorunur !== false && p.aractaBulunsun !== false && (Number(p.aracStok) > 0 || Number(p.aracStandart) > 0 || (store.aracHareket || []).some((h) => h.urunId === p.id)));
  if (!src.length) src = store.products.filter((p) => p.gorunur !== false && p.aractaBulunsun !== false);
  src = src.slice().sort((a, b) => (a.grup || "").localeCompare(b.grup || "", "tr") || (a.ad || "").localeCompare(b.ad || "", "tr"));
  const rows = src.map((p) => `<label class="sk-row"><input type="checkbox" class="sk-chk" data-skchk="${p.id}" /><span class="sk-ad">${esc(p.ad)}<span class="hint"> · ${esc(p.grup || "")}</span></span><input class="sk-adet" data-skadet="${p.id}" type="number" inputmode="numeric" value="${Number(p.aracStok) || 0}" /></label>`).join("") || `<p class="hint" style="padding:10px">Araçta ürün yok. Önce "🛒 Araca Al" ile yükle.</p>`;
  return pageHead("🚚 Araç Stok Kontrol", "Her ürünü say, doğrula, işaretle → sonra rota başlar", [{ label: "🛒 Araca Al", cls: "soft", act: "aracalim" }, { label: "⏹ İptal", cls: "softred", act: "servisbitir" }]) +
    `<div class="sk-tools"><button class="btn soft sm" id="skHepsi" type="button">✓ Hepsini işaretle</button><span class="hint" id="skDurum">0 / ${src.length} işaretlendi</span></div>
     <div class="card sk-list">${rows}</div>
     <button class="btn primary lg" id="skBitir" type="button" style="width:100%;margin-top:12px">✓ Stok Tamam → Rotayı Başlat</button>`;
}
function renderServisAktif() {
  if (!servis.stokBitti) return aracStokKontrolHTML();
  const total = servis.musteriIds.length, done = servis.edilen.length, pas = servis.paslar.length;
  const o = servisGunOzet();
  const fab = `<button class="servis-fab" id="servisOzetFab" type="button"><span>📋 ${o.adet} satış</span><b>${money.format(o.toplam)}</b></button>`;
  const govde = servis.acik
    ? servisSihirbaz(servis.acik)
    : `<div class="card" style="text-align:center;padding:24px"><h2 style="margin:0 0 6px">Rota tamam 🎉</h2><p class="hint" style="margin-bottom:14px">${done} satış · ${pas} pas</p><button class="btn softred lg" data-act="servisbitir" type="button" style="width:100%;justify-content:center">⏹ Servisi Bitir → Gün Sonu Raporu</button></div>`;
  return pageHead("🚗 Servis", done + "/" + total + " durak" + (pas ? " · " + pas + " pas" : "")) +
    `<div class="rota-tiles">
       <button class="rt rt-satis" data-act="ekstrasatis" type="button"><span class="rt-ic">➕</span><span>+Satış</span></button>
       <button class="rt rt-stok" data-act="aracalim" type="button"><span class="rt-ic">📦</span><span>+Stok</span></button>
       <button class="rt rt-yemek" data-act="yemek" type="button"><span class="rt-ic">🍽️</span><span>Yemek</span></button>
       <button class="rt rt-kmb" data-act="km" type="button"><span class="rt-ic">🚗</span><span id="rtKm">${((servis.km || 0) / 1000).toFixed(1)} km</span></button>
     </div>` +
    fab + aracStokAjaniHTML() + `<div id="servisBanner"></div>` + govde +
    `<details class="servis-tumu"><summary>Tüm duraklar (${done}/${total})</summary><div class="card">${servisStepperHTML() || `<p class="hint">Rotada müşteri yok.</p>`}</div></details>`;
}
function servisSepetGuncelle() {
  const el = document.getElementById("sihirSepet"); if (el) { el.innerHTML = servisSepetHTML(); servisSepetWire(); }
  gsRozetSync();   // ürün kartlarındaki "sepette kaç tane" işareti
}
function servisSepetWire() {
  document.querySelectorAll("#sihirSepet [data-ssp]").forEach((b) => b.onclick = () => { const it = activeCart().items[Number(b.dataset.ssp)]; if (it) it.adet = (Number(it.adet) || 0) + 1; servisSepetGuncelle(); });
  document.querySelectorAll("#sihirSepet [data-ssm]").forEach((b) => b.onclick = () => { const c = activeCart(); const idx = Number(b.dataset.ssm); const it = c.items[idx]; if (it) { it.adet = (Number(it.adet) || 0) - 1; if (it.adet <= 0) c.items.splice(idx, 1); } servisSepetGuncelle(); });
  document.querySelectorAll("#sihirSepet [data-sssil]").forEach((b) => b.onclick = () => { activeCart().items.splice(Number(b.dataset.sssil), 1); servisSepetGuncelle(); });
  // Fiyat düzenleme — re-render YOK (odak kaybolmasın), sadece satır ve toplam güncellenir
  document.querySelectorAll("#sihirSepet [data-ssfiyat]").forEach((el) => el.oninput = () => {
    const idx = Number(el.dataset.ssfiyat); const it = activeCart().items[idx]; if (!it) return;
    it.fiyat = el.value === "" ? 0 : Number(el.value) || 0;
    const tc = document.querySelector(`#sihirSepet [data-sstut="${idx}"]`); if (tc) tc.textContent = money.format((Number(it.fiyat) || 0) * (Number(it.adet) || 0));
    const tot = document.querySelector("#sihirSepet .ss-toplam"); if (tot) tot.textContent = money.format(cartTotals().toplam);
  });
}
// Sesli sipariş: konuşulanı metin kutusuna döker (Web Speech API; yoksa klavye mikrofonuna yönlendirir)
function sesliSiparis(inputId) {
  const inp = document.getElementById(inputId);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { if (inp) inp.focus(); alert("Uygulama-içi ses tanıma bu cihazda yok.\nKlavyedeki 🎤 mikrofon tuşuyla konuşabilirsin (kutuya dokun → klavyede mikrofon)."); return; }
  let rec; try { rec = new SR(); } catch (e) { if (inp) inp.focus(); return; }
  rec.lang = "tr-TR"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  const btn = document.getElementById("zkSes"); if (btn) btn.classList.add("dinliyor");
  let taban = inp ? inp.value : ""; if (taban && !/\s$/.test(taban)) taban += " ";
  rec.onresult = (e) => { let m = ""; for (let i = e.resultIndex; i < e.results.length; i++) m += e.results[i][0].transcript; if (inp) inp.value = taban + m; };
  rec.onerror = (e) => { if (btn) btn.classList.remove("dinliyor"); if (e && e.error === "not-allowed") alert("Mikrofon izni gerekli (Ayarlar → Uygulama → İzinler)."); };
  rec.onend = () => { if (btn) btn.classList.remove("dinliyor"); };
  try { rec.start(); } catch (e) { if (btn) btn.classList.remove("dinliyor"); }
}
function hizliSiparisDoldurInline(id) {
  const inp = document.getElementById("zkHizli"); const text = inp ? inp.value : "";
  const parc = siparisParse(text); if (!parc.length) { alert("Anlaşılamadı. Örnek: 7 soda 2 gazoz 17 su"); return; }
  const c = activeCart(); c.musteriId = id;
  parc.forEach((p) => { const pid = musteriUrunSecim(p.k, id); if (pid) { for (let i = 0; i < Math.round(p.q); i++) addToCart(pid); } });
  if (inp) inp.value = "";
  servisSepetGuncelle();
}
/* Sürükle-bırak rota oluşturma ekranı */
let rotaYapim = { ad: "", sira: [] };
function renderRotaOlustur() {
  return pageHead("Rota Oluştur", "Müşteri kartına dokun → rotaya ekle · rotada ≡'yi sürükle → sırala", [{ label: "Geri", cls: "soft", route: "rota" }]) +
    `<div class="card">
      <div class="field"><label>Rota Adı</label><input id="ryAd" placeholder="ör. Salı Rotası" value="${esc(rotaYapim.ad)}" /></div>
      <div class="section-title" style="margin:12px 0 6px">Rota Sırası</div>
      <div id="rySira" class="ry-sira"></div>
      <div style="margin-top:12px"><button class="btn green lg" id="rySave" type="button" style="width:100%">Kaydet & Servisi Başlat</button></div>
    </div>
    <div class="row" style="margin-top:14px;justify-content:space-between;align-items:center;gap:10px"><div class="section-title" style="margin:0">Müşteriler (dokun → ekle)</div><div class="row" style="gap:6px"><button class="btn soft sm" id="ryYeniMus" type="button">＋ Yeni</button><button class="btn soft sm" id="ryRehber" type="button">📇 Rehberden</button></div></div>
    <div id="ryHavuz" class="ry-havuz" style="margin-top:8px"></div>`;
}
function ryCiz() {
  const sira = document.getElementById("rySira"), hav = document.getElementById("ryHavuz");
  if (!sira || !hav) return;
  sira.innerHTML = rotaYapim.sira.length
    ? rotaYapim.sira.map((id, i) => { const c = findCustomer(id); return `<div class="ry-item" data-ryid="${id}"><span class="ry-tut" data-ryhandle="${id}">≡</span><span class="ry-no">${i + 1}</span><b>${c ? esc(c.ad) : "?"}</b><button class="rm" data-rycik="${id}" type="button">✕</button></div>`; }).join("")
    : `<p class="hint" style="padding:8px">Aşağıdan müşteri ekle. Eklenenler burada sıralanır.</p>`;
  const kalan = store.customers.filter((c) => !rotaYapim.sira.includes(c.id));
  hav.innerHTML = kalan.length
    ? kalan.map((c) => `<button class="ry-kart" data-ryekle="${c.id}" type="button"><span class="ry-kad">${esc(c.ad)}</span><span class="hint">${money.format(customerBorc(c.id))}</span></button>`).join("")
    : `<p class="hint" style="padding:8px">Tüm müşteriler rotada.</p>`;
  ryWire();
}
function ryWire() {
  document.querySelectorAll("[data-ryekle]").forEach((b) => b.onclick = () => { rotaYapim.sira.push(b.dataset.ryekle); ryCiz(); });
  document.querySelectorAll("[data-rycik]").forEach((b) => b.onclick = () => { rotaYapim.sira = rotaYapim.sira.filter((x) => x !== b.dataset.rycik); ryCiz(); });
  document.querySelectorAll("[data-ryhandle]").forEach((h) => h.addEventListener("pointerdown", (e) => rySurukleBasla(e, h.dataset.ryhandle)));
}
function rySurukleBasla(e, id) {
  e.preventDefault();
  const liste = document.getElementById("rySira");
  const el = liste.querySelector(`[data-ryid="${id}"]`); if (!el) return;
  el.classList.add("suru");
  const move = (ev) => {
    const y = ev.clientY;
    const kardes = [...liste.querySelectorAll(".ry-item:not(.suru)")];
    const alt = kardes.find((k) => { const r = k.getBoundingClientRect(); return y < r.top + r.height / 2; });
    if (alt) liste.insertBefore(el, alt); else liste.appendChild(el);
  };
  const up = () => {
    document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
    el.classList.remove("suru");
    rotaYapim.sira = [...liste.querySelectorAll(".ry-item")].map((x) => x.dataset.ryid);
    ryCiz();
  };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
}
function mountRotaOlustur() {
  ryCiz();
  const ym = document.getElementById("ryYeniMus");
  if (ym) ym.addEventListener("click", () => {
    const ad = (prompt("Yeni müşteri adı:") || "").trim(); if (!ad) return;
    const m = { id: genId(), ad, balance: 0 }; store.customers.push(m);
    rotaYapim.sira.push(m.id); saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); ryCiz();
  });
  const yr = document.getElementById("ryRehber");
  if (yr) yr.addEventListener("click", async () => {
    const k = await rehberdenSec(); if (!k) return;
    const ad = (k.ad || "").trim() || (prompt("Müşteri adı:") || "").trim(); if (!ad) return;
    const m = { id: genId(), ad, telefon: (k.tel || "").trim() }; store.customers.push(m);
    rotaYapim.sira.push(m.id); saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); ryCiz();
  });
  const ad = document.getElementById("ryAd"); if (ad) ad.addEventListener("input", () => { rotaYapim.ad = ad.value; });
  const save = document.getElementById("rySave");
  if (save) save.onclick = () => {
    if (!rotaYapim.sira.length) { alert("En az bir müşteri ekle."); return; }
    rotaKaydet(rotaYapim.ad.trim(), rotaYapim.sira.slice());
    const ids = rotaYapim.sira.slice(); rotaYapim = { ad: "", sira: [] };
    servisBaslat(ids);
  };
}

/* ============ HARİTA / ROTA PLANI ============ */
/* Harita + pinler: Leaflet + OpenStreetMap (anahtar gerekmez, ücretsiz).
 * Navigasyon: Google Maps yol tarifi bağlantısı (google.com/maps/dir/?api=1 ...).
 * Sıra numarası = rotadaki durak numarası; servis aktifken edilen duraklar yeşil ✓ olur. */
const harita = { map: null, katman: null, cizgi: null, sira: [], rotaId: "", benim: null, watchId: null, kirli: false, yol: null, yolIstek: "" };
const HR_MAX_DURAK = 10; // Google Maps yol tarifi: origin + 8 ara nokta + destination
const HR_YOL_KAT = 1.3;  // yol servisi yoksa kuş uçuşu → tahmini asfalt yol payı
const HR_YAKIT_VARSAYILAN = { fiyat: 75, tuketim: 10 }; // ₺/lt · lt/100km
/* Gerçek yol mesafesi: OSRM açık sunucusu (ücretsiz, anahtarsız). Ulaşılamazsa
 * kuş uçuşu × HR_YOL_KAT tahminine düşer — internet yokken de sayfa çalışır. */
const HR_OSRM = "https://router.project-osrm.org/route/v1/driving/";

function haritaKonumlu() { return store.customers.filter((c) => c.lat != null && c.lng != null && !c.bayi); }

function hrYakitAyar() {
  const s = store.settings || {};
  return {
    fiyat: Number(s.yakitFiyat) > 0 ? Number(s.yakitFiyat) : HR_YAKIT_VARSAYILAN.fiyat,
    tuketim: Number(s.yakitTuketim) > 0 ? Number(s.yakitTuketim) : HR_YAKIT_VARSAYILAN.tuketim,
  };
}

/** Rota noktaları: konum (varsa) + sıradaki duraklar. OSRM için lng,lat düzeninde. */
function hrNoktalar(duraklar) {
  return (rota.konum ? [[rota.konum.lng, rota.konum.lat]] : []).concat(duraklar.map((c) => [c.lng, c.lat]));
}
function hrImza(noktalar) { return noktalar.map((p) => p[0].toFixed(5) + "," + p[1].toFixed(5)).join(";"); }

/** Gerçek yolu OSRM'den çek (bacak bacak mesafe + süre + yol çizgisi). Sessizce başarısız olur. */
async function hrYolHesapla() {
  const duraklar = harita.sira.map((id) => findCustomer(id)).filter((c) => c && c.lat != null);
  const noktalar = hrNoktalar(duraklar);
  if (noktalar.length < 2) { harita.yol = null; return; }
  const imza = hrImza(noktalar);
  if ((harita.yol && harita.yol.imza === imza) || harita.yolIstek === imza) return; // zaten var / uçuşta
  harita.yolIstek = imza;
  try {
    const r = await fetch(HR_OSRM + imza + "?overview=full&geometries=geojson");
    const j = await r.json();
    if (!r.ok || j.code !== "Ok" || !j.routes || !j.routes.length) throw new Error(j.code || "yol bulunamadı");
    const y = j.routes[0];
    harita.yol = { imza, mesafe: y.distance, sure: y.duration, bacak: y.legs.map((l) => l.distance), geo: y.geometry.coordinates };
  } catch (e) {
    harita.yol = { imza, hata: true }; // internet yok / servis meşgul → tahmine düş
  } finally {
    harita.yolIstek = "";
  }
  if (harita.map) haritaCiz();
}

/** Rota ölçümü: durak arası mesafeler, toplam yol, sonraki durak, mazot bedeli.
 *  Kaynak = OSRM gerçek yol; yoksa kuş uçuşu (haversine) × HR_YOL_KAT tahmini. */
function hrOlcum() {
  const duraklar = harita.sira.map((id) => findCustomer(id)).filter((c) => c && c.lat != null);
  const imza = hrImza(hrNoktalar(duraklar));
  const yol = harita.yol && harita.yol.imza === imza && !harita.yol.hata ? harita.yol : null;
  const bacak = [];            // bacak[i] = i. durağa gelirken gidilen metre (yoksa null)
  let onceki = rota.konum ? { lat: rota.konum.lat, lng: rota.konum.lng } : null;
  let kus = 0;
  duraklar.forEach((c, i) => {
    const d = onceki ? haversine(onceki.lat, onceki.lng, c.lat, c.lng) : null;
    if (d != null) kus += d;
    // OSRM bacakları: konum varsa legs[i] = i. durağa geliş, yoksa legs[i-1].
    const legIdx = rota.konum ? i : i - 1;
    bacak.push(yol ? (legIdx >= 0 ? yol.bacak[legIdx] : null) : (d != null ? d * HR_YOL_KAT : null));
    onceki = c;
  });
  const yolM = yol ? yol.mesafe : kus * HR_YOL_KAT;
  const { fiyat, tuketim } = hrYakitAyar();
  const litre = (yolM / 1000) * (tuketim / 100);
  // Sonraki durak: servis açıksa ilk ziyaret edilmemiş durak, değilse 1. durak.
  const kalanlar = servis.aktif ? duraklar.filter((c) => !servis.edilen.includes(c.id) && !servis.paslar.includes(c.id)) : duraklar;
  const hedef = kalanlar[0] || null;
  const hedefIdx = hedef ? duraklar.indexOf(hedef) : -1;
  let sonrakiD = null;
  if (hedef && rota.konum) {
    // Sıradaki durak listenin başındaysa gerçek bacak; ortasındaysa senden kuş uçuşu tahmini.
    sonrakiD = (yol && hedefIdx === 0) ? yol.bacak[0]
      : haversine(rota.konum.lat, rota.konum.lng, hedef.lat, hedef.lng) * HR_YOL_KAT;
  }
  return {
    duraklar, bacak, kusUcusuM: kus, yolM, litre, bedel: litre * fiyat, fiyat, tuketim,
    gercekYol: !!yol, sure: yol ? yol.sure : null,
    yolDurum: yol ? "yol" : (harita.yol && harita.yol.imza === imza && harita.yol.hata ? "hata" : (harita.yolIstek === imza ? "yukleniyor" : "tahmin")),
    sonraki: hedef ? { c: hedef, no: hedefIdx + 1, d: sonrakiD, kesin: !!(yol && hedefIdx === 0) } : null,
  };
}

function hrOlcumCiz() {
  const kutu = document.getElementById("hrOlcum"); if (!kutu) return;
  const o = hrOlcum();
  const yakit = hrYakitAyar();
  const sonrakiMetin = o.sonraki
    ? `${o.sonraki.no}. ${esc(o.sonraki.c.ad)}${o.sonraki.d != null ? ` · <b>${mesafeMetin(o.sonraki.d)}</b>${o.sonraki.kesin ? "" : "*"}` : ` · <span class="hint">📍 Konumum'a bas</span>`}`
    : `<span class="hint">durak yok</span>`;
  const rozet = {
    yol: `<span class="hr-rozet ok">🛣 yol üzerinden</span>`,
    yukleniyor: `<span class="hr-rozet">⏳ yol hesaplanıyor…</span>`,
    hata: `<span class="hr-rozet uyari">⚠ yol servisi yok — kuş uçuşu ×${HR_YOL_KAT} tahmini</span>`,
    tahmin: `<span class="hr-rozet">kuş uçuşu ×${HR_YOL_KAT} tahmini</span>`,
  }[o.yolDurum];
  const sure = o.sure ? `${Math.round(o.sure / 60)} dk` : "—";
  kutu.innerHTML = `
    <div class="hr-olc">
      <div class="hr-olc-k"><span>Toplam rota</span><b>${o.yolM ? (o.yolM / 1000).toFixed(1) + " km" : "—"}</b></div>
      <div class="hr-olc-k"><span>Sonraki durak</span><b class="ince">${sonrakiMetin}</b></div>
      <div class="hr-olc-k"><span>Tahmini mazot</span><b>${money.format(o.bedel)}</b></div>
      <div class="hr-olc-k"><span>Yakıt · süre</span><b>${o.litre ? num2.format(o.litre) + " lt" : "—"} · ${sure}</b></div>
    </div>
    <div class="hr-yakit">
      <label>₺/lt <input id="hrFiyat" type="number" inputmode="decimal" step="0.01" value="${yakit.fiyat}" /></label>
      <label>lt/100km <input id="hrTuketim" type="number" inputmode="decimal" step="0.1" value="${yakit.tuketim}" /></label>
      ${rozet}
      <button class="btn soft sm" id="hrYolYenile" type="button">🔄 Yolu Yenile</button>
      <span class="hint">${rota.konum ? "" : "İlk bacak için 📍 Konumum"}${o.sonraki && !o.sonraki.kesin && o.sonraki.d != null ? " · * sıradaki durak kuş uçuşu tahmini" : ""}</span>
    </div>`;
  const kaydet = (k, el) => el.addEventListener("change", () => {
    const v = Number(el.value);
    store.settings = store.settings || {};
    store.settings[k] = v > 0 ? v : "";
    saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
    hrOlcumCiz();
  });
  kaydet("yakitFiyat", kutu.querySelector("#hrFiyat"));
  kaydet("yakitTuketim", kutu.querySelector("#hrTuketim"));
  const yn = kutu.querySelector("#hrYolYenile");
  if (yn) yn.addEventListener("click", () => { harita.yol = null; harita.yolIstek = ""; hrOlcumCiz(); hrYolHesapla(); });
}

/** Seçili rotaya (ya da rotaSira alanına) göre başlangıç sırasını kur. */
function haritaSiraKur() {
  const konumluIds = new Set(haritaKonumlu().map((c) => c.id));
  if (harita.rotaId) {
    const r = (store.rotalar || []).find((x) => x.id === harita.rotaId);
    harita.sira = r ? r.musteriIds.filter((id) => konumluIds.has(id)) : [];
  } else if (servis.aktif && servis.musteriIds.length) {
    harita.sira = servis.musteriIds.filter((id) => konumluIds.has(id));
  } else {
    harita.sira = haritaKonumlu().filter((c) => Number(c.rotaSira) > 0)
      .sort((a, b) => Number(a.rotaSira) - Number(b.rotaSira)).map((c) => c.id);
  }
  harita.kirli = false;
}

function renderHarita() {
  const konumlu = haritaKonumlu(), konumsuz = store.customers.filter((c) => !c.bayi && (c.lat == null || c.lng == null));
  const rotaOpts = [`<option value="">— Rota seçilmedi (rota sırasına göre) —</option>`]
    .concat((store.rotalar || []).map((r) => `<option value="${r.id}" ${r.id === harita.rotaId ? "selected" : ""}>${esc(r.ad)} (${r.musteriIds.length})</option>`)).join("");
  return pageHead("Harita / Rota Planı", `${konumlu.length} konumlu müşteri${konumsuz.length ? " · " + konumsuz.length + " konumsuz" : ""}`, [{ label: "🚗 Rota Sayfası", cls: "soft", route: "rota" }]) +
    `<div class="card hr-card">
      <div class="hr-ust">
        <select id="hrRota" class="hr-sel">${rotaOpts}</select>
        <button class="btn soft sm" id="hrKonum" type="button">📍 Konumum</button>
        <button class="btn soft sm" id="hrYakin" type="button" title="Konumundan başlayarak en yakın duraklara göre sırala">⚡ En Yakından Sırala</button>
        <button class="btn soft sm" id="hrHepsi" type="button">➕ Tüm Konumluları Ekle</button>
      </div>
      <div id="hrMap" class="hr-map"></div>
      <div id="hrOlcum" class="hr-olcum"></div>
      <p class="hint hr-ipucu">Gri pin = rotada değil (dokun → ekle) · Numaralı pin = rota sırası · Yeşil ✓ = ziyaret edildi</p>
    </div>
    <div class="section-title" style="margin-top:14px">Rota Sırası (<span id="hrSayi">0</span> durak)</div>
    <div class="card"><div id="hrListe" class="hr-liste"></div>
      <div class="hr-alt">
        <button class="btn primary" id="hrNav" type="button">🧭 Google Maps'te Navigasyon</button>
        <button class="btn ok" id="hrKaydet" type="button">💾 Rotayı Kaydet</button>
        <button class="btn green" id="hrBaslat" type="button">▶ Servisi Başlat</button>
      </div>
    </div>` +
    (konumsuz.length ? `<details class="card" style="margin-top:12px"><summary>Konumu kayıtlı olmayanlar (${konumsuz.length}) — haritada gösterilemez</summary><div class="hr-liste">${konumsuz.map((c) => `<div class="hr-item"><span class="hr-no gri">—</span><div class="hr-mid"><b>${esc(c.ad)}</b><span class="hint">${esc(c.telefon || "telefon yok")}</span></div></div>`).join("")}</div><p class="hint" style="margin-top:8px">Sahada uğrayınca müşteri kartından <b>📍 Konumu Kaydet</b>.</p></details>` : "");
}

/** Numaralı / durum renkli pin (görsel dosya yok — CSS ile çizilir). */
function hrIkon(metin, sinif) {
  return L.divIcon({ className: "", html: `<span class="hr-pin ${sinif}">${metin}</span>`, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16] });
}

function haritaCiz() {
  if (!harita.map) return;
  harita.katman.clearLayers();
  const siraSet = new Map(harita.sira.map((id, i) => [id, i + 1]));
  const noktalar = [];
  for (const c of haritaKonumlu()) {
    const no = siraSet.get(c.id);
    const edildi = servis.aktif && servis.edilen.includes(c.id);
    const m = L.marker([c.lat, c.lng], { icon: hrIkon(no ? (edildi ? "✓" : no) : "•", no ? (edildi ? "bitti" : "rota") : "dis") });
    const borc = customerBorc(c.id);
    m.bindPopup(`<div class="hr-pop"><b>${esc(c.ad)}</b>
      <span class="hint">${esc(c.mahalle || c.bolge || "")}${no ? " · " + no + ". durak" : ""}</span>
      <span class="hint">Bakiye: ${money.format(borc)}</span>
      <div class="hr-pop-btn">
        ${no ? `<button class="btn softred sm" data-hrcik="${c.id}" type="button">✕ Rotadan çıkar</button>` : `<button class="btn green sm" data-hrekle="${c.id}" type="button">＋ Rotaya ekle</button>`}
        <a class="btn soft sm" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}" target="_blank" rel="noopener">🧭 Buraya git</a>
      </div></div>`);
    m.addTo(harita.katman);
    if (no) noktalar[no - 1] = [c.lat, c.lng];
  }
  const cizgiNoktalar = noktalar.filter(Boolean);
  if (harita.cizgi) { harita.map.removeLayer(harita.cizgi); harita.cizgi = null; }
  const duraklar = harita.sira.map((id) => findCustomer(id)).filter((c) => c && c.lat != null);
  const imza = hrImza(hrNoktalar(duraklar));
  const yol = harita.yol && harita.yol.imza === imza && !harita.yol.hata ? harita.yol : null;
  if (yol) {
    // Gerçek yol geometrisi (OSRM: [lng, lat] → Leaflet [lat, lng])
    harita.cizgi = L.polyline(yol.geo.map((p) => [p[1], p[0]]), { color: "#1E40AF", weight: 5, opacity: 0.75 }).addTo(harita.map);
  } else if (cizgiNoktalar.length > 1) {
    harita.cizgi = L.polyline(cizgiNoktalar, { color: "#1E40AF", weight: 3, opacity: 0.5, dashArray: "6 6" }).addTo(harita.map);
  }
  if (duraklar.length) hrYolHesapla(); // gerçek yol yoksa/eskiyse arka planda çek
  hrListeCiz();
}

function hrListeCiz() {
  const el = document.getElementById("hrListe"); if (!el) return;
  const sayi = document.getElementById("hrSayi"); if (sayi) sayi.textContent = String(harita.sira.length);
  const o = hrOlcum();
  const bacakMap = new Map(o.duraklar.map((c, i) => [c.id, o.bacak[i]]));
  const sonrakiId = o.sonraki ? o.sonraki.c.id : null;
  el.innerHTML = harita.sira.length
    ? harita.sira.map((id, i) => {
        const c = findCustomer(id); if (!c) return "";
        const edildi = servis.aktif && servis.edilen.includes(id);
        const bacak = bacakMap.get(id);
        const mes = bacak != null ? `<span class="hr-mes">${i === 0 ? "senden" : "önceki duraktan"} ${mesafeMetin(bacak * HR_YOL_KAT)}</span>` : "";
        return `<div class="hr-item ${edildi ? "bitti" : ""} ${id === sonrakiId ? "sonraki" : ""}">
          <span class="hr-no ${edildi ? "yesil" : ""}">${edildi ? "✓" : i + 1}</span>
          <div class="hr-mid" data-hrgit="${id}" role="button" tabindex="0"><b>${esc(c.ad)}</b><span class="hint">${esc(c.mahalle || c.bolge || "—")} · ${money.format(customerBorc(id))}${mes ? " · " : ""}${mes}</span></div>
          <div class="hr-ok"><button class="hr-mini" data-hryukari="${id}" type="button" title="Yukarı">▲</button><button class="hr-mini" data-hrasagi="${id}" type="button" title="Aşağı">▼</button><button class="hr-mini rm" data-hrcik="${id}" type="button" title="Çıkar">✕</button></div>
        </div>`;
      }).join("")
    : `<p class="hint" style="padding:8px">Rotada durak yok. Haritadaki gri pinlere dokunup ekle ya da "Tüm Konumluları Ekle".</p>`;
  hrOlcumCiz();
  hrWire();
}

function hrWire() {
  const cik = (id) => { harita.sira = harita.sira.filter((x) => x !== id); harita.kirli = true; haritaCiz(); };
  const ekle = (id) => { if (!harita.sira.includes(id)) harita.sira.push(id); harita.kirli = true; haritaCiz(); };
  const tasi = (id, yon) => {
    const i = harita.sira.indexOf(id), j = i + yon;
    if (i < 0 || j < 0 || j >= harita.sira.length) return;
    const t = harita.sira[i]; harita.sira[i] = harita.sira[j]; harita.sira[j] = t;
    harita.kirli = true; haritaCiz();
  };
  document.querySelectorAll("[data-hrcik]").forEach((b) => b.onclick = () => cik(b.dataset.hrcik));
  document.querySelectorAll("[data-hrekle]").forEach((b) => b.onclick = () => ekle(b.dataset.hrekle));
  document.querySelectorAll("[data-hryukari]").forEach((b) => b.onclick = () => tasi(b.dataset.hryukari, -1));
  document.querySelectorAll("[data-hrasagi]").forEach((b) => b.onclick = () => tasi(b.dataset.hrasagi, 1));
  document.querySelectorAll("[data-hrgit]").forEach((b) => b.onclick = () => {
    const c = findCustomer(b.dataset.hrgit); if (!c || !harita.map) return;
    harita.map.setView([c.lat, c.lng], Math.max(harita.map.getZoom(), 16));
    document.getElementById("hrMap").scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

/** Google Maps yol tarifi bağlantısı. Tek bağlantıda en fazla HR_MAX_DURAK nokta
 *  (başlangıç + 8 ara nokta + varış) taşınır; fazlası uç uca eklenen bölümlere ayrılır. */
function hrNavigasyon() {
  const duraklar = harita.sira.map((id) => findCustomer(id)).filter((c) => c && c.lat != null);
  if (!duraklar.length) { alert("Önce rotaya durak ekle."); return; }
  const kisa = (s) => (s.length > 16 ? s.slice(0, 15) + "…" : s);
  const noktalar = (rota.konum ? [{ k: `${rota.konum.lat},${rota.konum.lng}`, et: "Konumun" }] : [])
    .concat(duraklar.map((c, i) => ({ k: `${c.lat},${c.lng}`, et: `${i + 1}. ${kisa(c.ad)}` })));
  const link = (grup) => {
    const q = (v) => encodeURIComponent(v);
    if (grup.length === 1) return `https://www.google.com/maps/dir/?api=1&destination=${q(grup[0].k)}&travelmode=driving`;
    const ara = grup.slice(1, -1).map((g) => g.k).join("|");
    return `https://www.google.com/maps/dir/?api=1&origin=${q(grup[0].k)}&destination=${q(grup[grup.length - 1].k)}${ara ? "&waypoints=" + q(ara) : ""}&travelmode=driving`;
  };
  if (noktalar.length <= HR_MAX_DURAK) { window.open(link(noktalar), "_blank"); return; }
  const parcalar = [];
  for (let i = 0; i < noktalar.length - 1; i += HR_MAX_DURAK - 1) {
    const g = noktalar.slice(i, i + HR_MAX_DURAK);
    parcalar.push({ ad: `${g[0].et} → ${g[g.length - 1].et}`, url: link(g) });
  }
  openModal("🧭 Navigasyon — " + duraklar.length + " durak", `<p class="hint">Google Maps tek yol tarifinde en fazla ${HR_MAX_DURAK} nokta taşır. Rota ${parcalar.length} bölüme ayrıldı — bölüm bitince sonrakini aç (bölümler uç uca ekli).</p>
    <div class="hr-parca">${parcalar.map((p, i) => `<a class="btn ${i === 0 ? "primary" : "soft"}" href="${p.url}" target="_blank" rel="noopener">Bölüm ${i + 1} · ${esc(p.ad)}</a>`).join("")}</div>`, { noFoot: true });
}

/** Konumdan başlayarak en yakın komşu sırası (basit ısınma turu). */
function hrEnYakindanSirala() {
  const kalan = harita.sira.map((id) => findCustomer(id)).filter((c) => c && c.lat != null);
  if (kalan.length < 2) { alert("Sıralamak için en az 2 durak gerek."); return; }
  if (!rota.konum) { alert("Önce 📍 Konumum'a bas — sıralama senin konumundan başlar."); return; }
  let x = rota.konum.lat, y = rota.konum.lng;
  const yeni = [];
  while (kalan.length) {
    let en = 0, enD = Infinity;
    kalan.forEach((c, i) => { const d = haversine(x, y, c.lat, c.lng); if (d < enD) { enD = d; en = i; } });
    const s = kalan.splice(en, 1)[0]; yeni.push(s.id); x = s.lat; y = s.lng;
  }
  harita.sira = yeni; harita.kirli = true; haritaCiz();
  alert("Rota konumuna göre en yakından uzağa sıralandı ⚡\nGerekirse ▲▼ ile elle düzelt.");
}

function hrKonumTakip() {
  if (!navigator.geolocation) { alert("Bu cihazda konum desteklenmiyor."); return; }
  navigator.geolocation.getCurrentPosition(
    (p) => {
      rota.konum = { lat: p.coords.latitude, lng: p.coords.longitude };
      if (!harita.map) return;
      if (harita.benim) harita.map.removeLayer(harita.benim);
      harita.benim = L.marker([rota.konum.lat, rota.konum.lng], { icon: hrIkon("🚚", "ben"), zIndexOffset: 1000 }).addTo(harita.map).bindPopup("Buradasın");
      harita.map.setView([rota.konum.lat, rota.konum.lng], 15);
      hrListeCiz(); // ilk bacak + sonraki durak mesafesi artık hesaplanabilir
    },
    (e) => alert("Konum alınamadı: " + ((e && e.message) || e) + "\nTelefonun konum/GPS iznini aç."),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
  );
}

function hrRotaKaydet() {
  if (!harita.sira.length) { alert("Rotada durak yok."); return; }
  const mevcut = (store.rotalar || []).find((r) => r.id === harita.rotaId);
  if (mevcut) {
    // Rotada konumu olmayan üyeler varsa korunur — haritada sadece konumlular sıralanır.
    const konumluIds = new Set(haritaKonumlu().map((c) => c.id));
    const konumsuzUyeler = mevcut.musteriIds.filter((id) => !konumluIds.has(id));
    mevcut.musteriIds = harita.sira.concat(konumsuzUyeler);
    saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
    harita.kirli = false;
    alert(`"${mevcut.ad}" rotası güncellendi ✔ (${harita.sira.length} durak${konumsuzUyeler.length ? " + " + konumsuzUyeler.length + " konumsuz üye" : ""})`);
    return;
  }
  const ad = (prompt("Yeni rota adı:", "Harita Rotası") || "").trim();
  if (!ad) return;
  const r = rotaKaydet(ad, harita.sira.slice());
  harita.rotaId = r.id; harita.kirli = false;
  alert(`"${ad}" rotası kaydedildi ✔ — Rota sayfasından başlatabilirsin.`);
  render();
}

function haritaTemizle() {
  if (harita.watchId != null && navigator.geolocation) { navigator.geolocation.clearWatch(harita.watchId); harita.watchId = null; }
  if (harita.map) { harita.map.remove(); harita.map = null; harita.katman = null; harita.cizgi = null; harita.benim = null; }
}
// Sayfadan çıkınca haritayı bırak (GPS/tile dinleyicileri sızmasın). Sayfada kalınıyorsa dokunma.
window.addEventListener("hashchange", () => { if (currentRoute() !== "harita") haritaTemizle(); });

function mountHarita() {
  const el = document.getElementById("hrMap");
  if (!el) return;
  if (typeof L === "undefined") { el.innerHTML = `<p class="hint" style="padding:16px">Harita kütüphanesi yüklenemedi (vendor/leaflet.js). Uygulamayı güncelle.</p>`; return; }
  haritaTemizle();
  haritaSiraKur();

  const konumlu = haritaKonumlu();
  harita.map = L.map(el, { zoomControl: true, attributionControl: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(harita.map);
  harita.katman = L.layerGroup().addTo(harita.map);
  harita.map.on("popupopen", hrWire); // popup DOM'a sonradan girer — butonları o an bağla
  if (konumlu.length) harita.map.fitBounds(L.latLngBounds(konumlu.map((c) => [c.lat, c.lng])).pad(0.25));
  else harita.map.setView([41.0, 29.09], 12);
  setTimeout(() => harita.map && harita.map.invalidateSize(), 150); // sayfa yerleşimi oturunca

  haritaCiz();
  if (rota.konum) hrKonumTakip();

  const sel = document.getElementById("hrRota");
  if (sel) sel.addEventListener("change", () => {
    if (harita.kirli && !confirm("Kaydedilmemiş sıra değişikliği var. Rota değiştirilsin mi?")) { sel.value = harita.rotaId; return; }
    harita.rotaId = sel.value; haritaSiraKur(); haritaCiz();
  });
  const hepsi = document.getElementById("hrHepsi");
  if (hepsi) hepsi.addEventListener("click", () => {
    const varOlan = new Set(harita.sira);
    haritaKonumlu().forEach((c) => { if (!varOlan.has(c.id)) harita.sira.push(c.id); });
    harita.kirli = true; haritaCiz();
  });
  const kn = document.getElementById("hrKonum"); if (kn) kn.addEventListener("click", hrKonumTakip);
  const yk = document.getElementById("hrYakin"); if (yk) yk.addEventListener("click", hrEnYakindanSirala);
  const nv = document.getElementById("hrNav"); if (nv) nv.addEventListener("click", hrNavigasyon);
  const kd = document.getElementById("hrKaydet"); if (kd) kd.addEventListener("click", hrRotaKaydet);
  const bs = document.getElementById("hrBaslat");
  if (bs) bs.addEventListener("click", () => {
    if (!harita.sira.length) { alert("Rotada durak yok."); return; }
    if (harita.kirli && confirm("Sıra değişti — servise başlamadan rota kaydedilsin mi?")) hrRotaKaydet();
    servisBaslat(harita.sira.slice());
  });
}

function mountRota() {
  document.querySelectorAll('[data-act="aracalim"]').forEach((aa) => aa.addEventListener("click", aracAlimModal));
  document.querySelectorAll('[data-act="ekstrasatis"]').forEach((b) => b.addEventListener("click", () => { pos.carts[pos.active] = newCart(); pos.cat = "ANA"; pos.q = ""; navigate("satis"); }));
  document.querySelectorAll('[data-act="yemek"]').forEach((b) => b.addEventListener("click", yemekModal));
  document.querySelectorAll('[data-act="km"]').forEach((b) => b.addEventListener("click", () => alert("Bugün gidilen: " + ((servis.km || 0) / 1000).toFixed(2) + " km\nKonum servisleriyle takip edilir; rota bitene kadar sayar.")));
  if (servis.aktif && !servis.stokBitti) {
    // Araç stok kontrol adımı
    const bitir = document.querySelector('[data-act="servisbitir"]'); if (bitir) bitir.addEventListener("click", () => { if (confirm("Rota iptal edilsin mi?")) servisBitir(); });
    const durumGuncelle = () => { const t = document.querySelectorAll(".sk-chk").length, c = document.querySelectorAll(".sk-chk:checked").length; const d = document.getElementById("skDurum"); if (d) d.textContent = c + " / " + t + " işaretlendi"; };
    document.querySelectorAll(".sk-chk").forEach((ch) => ch.addEventListener("change", () => { const row = ch.closest(".sk-row"); if (row) row.classList.toggle("done", ch.checked); durumGuncelle(); }));
    const hepsi = document.getElementById("skHepsi"); if (hepsi) hepsi.addEventListener("click", () => { document.querySelectorAll(".sk-chk").forEach((ch) => { ch.checked = true; const r = ch.closest(".sk-row"); if (r) r.classList.add("done"); }); durumGuncelle(); });
    const bit = document.getElementById("skBitir"); if (bit) bit.addEventListener("click", () => {
      const t = document.querySelectorAll(".sk-chk").length, c = document.querySelectorAll(".sk-chk:checked").length;
      if (c < t && !confirm((t - c) + " ürün işaretlenmedi. Yine de rotayı başlat?")) return;
      document.querySelectorAll("[data-skadet]").forEach((el) => { const p = findProduct(el.dataset.skadet); if (p) { const v = el.value === "" ? 0 : Number(el.value) || 0; if ((Number(p.aracStok) || 0) !== v) { p.aracStok = v; store.aracHareket.push({ id: genId(), urunId: p.id, ad: p.ad, adet: v, yon: "sayim", tarih: new Date().toISOString() }); } } });
      servis.stokBitti = true; saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); servisKaydet();
      render();
    });
    servisKonumIzle(); servisKaydet();
    return;
  }
  if (servis.aktif) {
    const bitir = document.querySelector('[data-act="servisbitir"]'); if (bitir) bitir.addEventListener("click", () => { if (confirm("Servisi bitir?")) servisBitir(); });
    const fab = document.getElementById("servisOzetFab"); if (fab) fab.addEventListener("click", servisOzetAc);
    document.querySelectorAll("[data-durakac]").forEach((b) => b.addEventListener("click", () => { servis.acik = b.dataset.durakac; servis.adim = "onay"; render(); }));
    const onay = document.querySelector("[data-sonay]");
    if (onay) {
      onay.addEventListener("click", () => { servis.adim = "satisMi"; render(); });
      const tel = ((findCustomer(servis.acik) || {}).telefon || "").replace(/\D/g, ""); const pEl = document.getElementById("zkPuan");
      if (tel && typeof kvGet === "function") kvGet("bayi_puan:" + tel).then((r) => { if (pEl) pEl.textContent = num2.format((r && r.value) || 0); }).catch(() => { if (pEl) pEl.textContent = "0"; });
      else if (pEl) pEl.textContent = "0";
    }
    document.querySelectorAll("[data-skonum]").forEach((b) => b.addEventListener("click", () => konumKaydet(b.dataset.skonum)));
    document.querySelectorAll("[data-zkpas]").forEach((b) => b.addEventListener("click", () => { if (confirm("Pas geçilsin mi?")) durakPasGec(b.dataset.zkpas); }));
    document.querySelectorAll("[data-zksona]").forEach((b) => b.addEventListener("click", () => durakSonaAt(b.dataset.zksona)));
    const satvar = document.querySelector("[data-satvar]"); if (satvar) satvar.addEventListener("click", () => { pos.carts[pos.active] = newCart(); activeCart().musteriId = servis.acik; pos.cat = "ANA"; pos.q = ""; servis.adim = "urun"; render(); });
    const satyok = document.querySelector("[data-satyok]"); if (satyok) satyok.addEventListener("click", () => { servis.sonSatisId = null; servis.adim = "kapanis"; render(); });
    document.querySelectorAll("[data-oner]").forEach((b) => b.addEventListener("click", () => { pos.carts[pos.active] = newCart(); activeCart().musteriId = servis.acik; addToCart(b.dataset.oner); servis.adim = "urun"; render(); }));
    if (servis.adim === "kapanis") {
      document.querySelectorAll("[data-sebep]").forEach((b) => b.addEventListener("click", () => { document.querySelectorAll("[data-sebep]").forEach((x) => x.classList.remove("on")); b.classList.add("on"); }));
      const kb = document.getElementById("kpBitir"); if (kb) kb.addEventListener("click", () => ziyaretKapat(servis.acik));
    }
    if (servis.adim === "urun") {
      activeCart().musteriId = servis.acik;
      const gridYen = () => { const g = document.getElementById("prodGrid"); if (g) { g.innerHTML = prodGridHTML(); srvAdds(); } document.querySelectorAll("[data-scat]").forEach((x) => x.classList.toggle("on", x.dataset.scat === pos.cat)); };
      const srvAdds = () => {
        document.querySelectorAll("#prodGrid [data-add]").forEach((el) => el.onclick = () => { addToCart(el.dataset.add); servisSepetGuncelle(); });
        document.querySelectorAll("#prodGrid [data-catopen]").forEach((el) => el.onclick = () => { pos.cat = el.dataset.catopen; gridYen(); });
      };
      srvAdds();
      document.querySelectorAll("[data-scat]").forEach((el) => el.addEventListener("click", () => { pos.cat = el.dataset.scat; gridYen(); }));
      const ps = document.getElementById("prodSearch"); if (ps) ps.addEventListener("input", () => { pos.q = ps.value; gridYen(); });
      const hz = document.getElementById("zkHizliBtn"); if (hz) hz.addEventListener("click", () => hizliSiparisDoldurInline(servis.acik));
      const sesB = document.getElementById("zkSes"); if (sesB) sesB.addEventListener("click", () => sesliSiparis("zkHizli"));
      const og = document.getElementById("odemeGec"); if (og) og.addEventListener("click", () => { if (!activeCart().items.length) { alert("Sepet boş — ürün ekle."); return; } servis.adim = "odeme"; render(); });
      servisSepetWire();
    }
    document.querySelectorAll("[data-sode]").forEach((b) => b.addEventListener("click", () => finalizeSale(b.dataset.sode)));
    document.querySelectorAll("[data-sgeri]").forEach((b) => b.addEventListener("click", () => { servis.adim = b.dataset.sgeri; render(); }));
    servisKonumIzle();
    servisKaydet();
    return;
  }
  const ol = document.getElementById("rotaOlustur"); if (ol) ol.addEventListener("click", () => { rotaYapim = { ad: "", sira: [] }; navigate("rota-olustur"); });
  document.querySelectorAll(".rota-kayit-satir[data-rincele]").forEach((row) => {
    row.addEventListener("click", () => rotaIncele(row.dataset.rincele));
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); rotaIncele(row.dataset.rincele); } });
  });
  document.querySelectorAll("[data-rbaslat]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation(); // satıra yayılıp incele açmasın
    const r = (store.rotalar || []).find((x) => x.id === b.dataset.rbaslat); if (r) servisBaslat(r.musteriIds);
  }));
}

/* ============ PROFİLİM ============ */
function renderProfilim() {
  const s = store.settings;
  const tabs = ["Firma Bilgilerim", "Fiş Ayarları", "Yedekleme", "Verilerimi Sil"];
  return pageHead("Profilim") + `<div class="card"><div class="profile-grid">
    <ul class="profile-tabs">${tabs.map((t, i) => `<li class="${i === 0 ? "on" : ""}" data-ptab="${i}">${t}</li>`).join("")}</ul>
    <div>
      <form id="profForm" class="ptab" data-ptab="0">
        <h1 style="font-size:15px;margin:0 0 14px">Firma Bilgilerim</h1>
        <div class="form-grid">
          <div class="field"><label>Firma Numaranız</label><input value="${esc(s.firmaNo)}" disabled /></div>
          <div class="field"><label>E-posta</label><input name="eposta" value="${esc(s.eposta || "")}" /></div>
          <div class="field"><label>Adınız</label><input name="ad" value="${esc(s.ad || "")}" /></div>
          <div class="field"><label>Soyadınız</label><input name="soyad" value="${esc(s.soyad || "")}" /></div>
          <div class="field"><label>Firma Adı (Panelde)</label><input name="firmaAdi" value="${esc(s.firmaAdi || "")}" /></div>
          <div class="field"><label>İlçe</label><input name="ilce" value="${esc(s.ilce || "")}" /></div>
        </div>
        <div style="margin-top:16px"><button class="btn lg" type="submit">💾 Güncelle & Kaydet</button></div>
      </form>
      <form id="fisForm" class="ptab" data-ptab="1" style="display:none">
        <h1 style="font-size:15px;margin:0 0 14px">Fiş / İrsaliye Şablonu</h1>
        <div class="form-grid">
          <div class="field"><label>Fiş Başlığı</label><input name="fisBaslik" value="${esc(s.fisBaslik || s.firmaAdi || "")}" placeholder="Firma adı" /></div>
          <div class="field"><label>Telefon</label><input name="fisTel" value="${esc(s.fisTel || "")}" placeholder="0xxx" /></div>
          <div class="field" style="grid-column:1/-1"><label>Adres</label><input name="fisAdres" value="${esc(s.fisAdres || "")}" placeholder="Fişte görünecek adres" /></div>
          <div class="field" style="grid-column:1/-1"><label>Alt Bilgi (teşekkür mesajı)</label><input name="fisAltbilgi" value="${esc(s.fisAltbilgi || "Teşekkür ederiz")}" /></div>
        </div>
        <div style="margin-top:16px"><button class="btn green lg" type="submit">💾 Kaydet</button></div>
        <p class="hint">Bu bilgiler satış/irsaliye fişinin başına ve altına basılır.</p>
      </form>
      <div class="ptab" data-ptab="2" style="display:none">
        <h1 style="font-size:15px;margin:0 0 14px">Yedekleme</h1>
        <p class="sub">Kayıtların her gün kendiliğinden yedeklenir ve 30 gün saklanır. Bir şey yanlış giderse aşağıdan eski bir güne dönebilirsin.</p>
        <div class="yedek-durum" id="yedekDurum"></div>
        <div class="yedek-liste" id="yedekListe"></div>
        <div style="margin-top:12px"><button class="btn soft" id="yedekSimdiBtn" type="button">Şimdi yedek al</button></div>
        <h1 style="font-size:15px;margin:22px 0 8px">Dosyaya yedekle</h1>
        <p class="sub">Tüm verini (ürün, müşteri, satış, ayar) tek dosyaya indir; başka cihaza taşı veya sonra geri yükle.</p>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn green lg" id="backupBtn" type="button">⇩ Yedek Al (JSON indir)</button>
          <button class="btn soft lg" id="restoreBtn" type="button">⇧ Yedekten Geri Yükle</button>
        </div>
        <p class="hint">Geri yükleme mevcut tüm veriyi seçtiğin yedekle değiştirir. Önce şimdiki hâlin yedeği alınır.</p>
      </div>
      <div class="ptab" data-ptab="3" style="display:none">
        <h1 style="font-size:15px;margin:0 0 14px">Verilerimi Sil</h1>
        <p class="sub">Tüm ürün, müşteri, satış ve ayarları kalıcı olarak siler. Bu işlem geri alınamaz.</p>
        <p class="sub">Yanlışlıkla silinmesin diye şifren sorulur ve silmeden önce buluta yedek alınır.</p>
        <div style="margin-top:14px"><button class="btn softred lg" id="wipeBtn" type="button">🗑 Tüm Verileri Sil…</button></div>
      </div>
    </div>
  </div></div>`;
}
function mountProfilim() {
  document.querySelectorAll("[data-ptab]").forEach((el) => { if (el.tagName === "LI") el.addEventListener("click", () => {
    const i = el.dataset.ptab;
    document.querySelectorAll("li[data-ptab]").forEach((x) => x.classList.toggle("on", x === el));
    document.querySelectorAll("form.ptab, div.ptab").forEach((p) => p.style.display = p.dataset.ptab === i ? "" : "none");
  }); });
  document.getElementById("profForm").addEventListener("submit", (e) => { e.preventDefault(); const f = new FormData(e.target); ["eposta", "ad", "soyad", "firmaAdi", "ilce"].forEach((k) => store.settings[k] = f.get(k)); saveStore(); alert("Kaydedildi ✔"); });
  document.getElementById("fisForm").addEventListener("submit", (e) => { e.preventDefault(); const f = new FormData(e.target); ["fisBaslik", "fisTel", "fisAdres", "fisAltbilgi"].forEach((k) => store.settings[k] = f.get(k)); saveStore(); alert("Fiş ayarları kaydedildi ✔"); });
  document.getElementById("backupBtn").addEventListener("click", exportBackup);
  document.getElementById("restoreBtn").addEventListener("click", () => openFileImport(".json,application/json", importBackup));
  yedekSekmeKur();
  document.getElementById("wipeBtn").addEventListener("click", verileriSilAkisi);
}

/* ============ Sidebar ============ */
function buildMenu() {
  const menuEl = document.getElementById("menu");
  menuEl.innerHTML = MENU.map((item, i) => {
    const ico = `<span class="m-ico">${item.ico}</span>`;
    if (item.children) return `<li class="menu-item has-sub" data-idx="${i}"><a class="parent">${ico}<span class="m-text">${item.label}</span><span class="m-caret">▶</span></a><ul class="submenu">${item.children.map((c) => `<li><a data-route="${c.route}" class="sublink">${c.label}</a></li>`).join("")}</ul></li>`;
    return `<li class="menu-item" data-idx="${i}"><a data-route="${item.route}">${ico}<span class="m-text">${item.label}</span></a></li>`;
  }).join("");
  menuEl.querySelectorAll(".parent").forEach((p) => p.addEventListener("click", () => p.closest(".menu-item").classList.toggle("open")));
  menuEl.querySelectorAll("[data-route]").forEach((a) => a.addEventListener("click", () => navigate(a.dataset.route)));
}
function findMenuIndexByRoute(route) {
  for (let i = 0; i < MENU.length; i++) { const m = MENU[i]; if (m.route === route) return { idx: i }; if (m.children && m.children.some((c) => c.route === route)) return { idx: i, sub: true }; }
  const alias = { "musteri-detay": "musteriler", "tsiparis-detay": "musteriler", "urun-ekle": "urunler", "stok-sayimi-detay": "stok-sayimi", "satis-detay": "satis" };
  if (alias[route]) return findMenuIndexByRoute(alias[route]);
  return null;
}
function setActiveMenu(route) {
  const menuEl = document.getElementById("menu");
  menuEl.querySelectorAll(".menu-item").forEach((li) => li.classList.remove("active"));
  menuEl.querySelectorAll(".submenu a").forEach((a) => a.classList.remove("active"));
  const found = findMenuIndexByRoute(route); if (!found || found.idx < 0) return;
  const li = menuEl.querySelector(`.menu-item[data-idx="${found.idx}"]`);
  if (li) { li.classList.add("active"); if (li.classList.contains("has-sub")) li.classList.add("open"); }
  const subA = menuEl.querySelector(`.submenu a[data-route="${route}"]`); if (subA) subA.classList.add("active");
}

/* ============ Router ============ */
function navigate(route) { location.hash = "#/" + route; }
function currentRoute() { return location.hash.replace(/^#\/?/, "") || "rapor-gunluk"; }
function render() {
  const route = currentRoute();
  const page = PAGES[route] || PAGES.anasayfa;
  const content = document.getElementById("content");
  try { content.innerHTML = page.render(); } catch (e) { content.innerHTML = `<div class="card"><h1>Hata</h1><pre>${esc(e.message)}</pre></div>`; console.error(e); }
  setActiveMenu(route);
  content.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.goto)));
  content.querySelectorAll("[data-goback]").forEach((b) => b.addEventListener("click", () => { if (history.length > 1) history.back(); else navigate("rapor-gunluk"); }));
  if (page.mount) try { page.mount(); } catch (e) { console.error(e); }
  try { enhanceTables(); } catch (e) { console.error(e); }
  try { updateBell(); } catch (e) { console.error(e); }
  try { mobilTabloEtiketle(); mobilBarAktif(route); } catch (e) { console.error(e); }
  document.body.classList.remove("nav-open");
  document.body.classList.remove("sheet-open");
  document.body.classList.toggle("pos-active", route === "satis");
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", render);

/* ---- Mobil: tablo hücrelerine başlık etiketi ekle (dar ekranda kart görünümü için) ---- */
const MOBIL_GIZLI_ETIKET = new Set(["Sıra", "Görsel", "Ürün Barkodu", "KDV", "Kritik Stok"]);
function mobilTabloEtiketle() {
  document.querySelectorAll("table.grid").forEach((tbl) => {
    const bas = [...tbl.querySelectorAll("thead th")].map((th) => (th.childNodes[0] ? th.childNodes[0].textContent : th.textContent).trim());
    tbl.querySelectorAll("tbody tr").forEach((tr) => {
      if (tr.classList.contains("empty-row")) return;
      let baslikVar = false;
      [...tr.children].forEach((td, i) => {
        const et = bas[i] || "";
        if (et) td.setAttribute("data-label", et);
        td.classList.remove("m-title", "m-act");
        // Aksiyon hücresi (İşlem / Detay / buton grubu) → kart altı kompakt satır
        if (et === "İşlem" || et === "Detay" || td.querySelector(".act-btns")) {
          td.classList.add("m-act");
        } else if (!baslikVar && et && !MOBIL_GIZLI_ETIKET.has(et) && td.textContent.trim()) {
          // İlk anlamlı metin hücresi → kart başlığı
          td.classList.add("m-title"); baslikVar = true;
        }
      });
    });
  });
}

/* ---- Mobil alt sekme çubuğu ---- */
const MOBILBAR = [
  { ico: "🚗", label: "Rota", route: "rota" },
  // Satış Yap en çok kullanılan ekran; eskiden yalnız çekmeceden (51 hedef
  // arasından) ya da Dükkan > +Satış ile iki dokunuşta gidiliyordu.
  { ico: "🖊", label: "Satış", route: "satis" },
  { ico: "🏪", label: "Dükkan", route: "dukkan" },
  { ico: "📈", label: "Rapor", route: "rapor-gunluk" },
  { ico: "☰", label: "Menü", act: "menu" },
];
function mobilBarKur() {
  if (document.querySelector(".mobilbar")) return;
  const nav = document.createElement("nav");
  nav.className = "mobilbar";
  nav.innerHTML = MOBILBAR.map((m) => `<button type="button" data-mroute="${m.route || ""}" data-mact="${m.act || ""}"><span class="mb-ico">${m.ico}</span><span class="mb-lbl">${m.label}</span></button>`).join("");
  document.body.appendChild(nav);
  nav.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.mact === "menu") { document.body.classList.toggle("nav-open"); return; }
    if (b.dataset.mroute) navigate(b.dataset.mroute);
  }));
}
function mobilBarAktif(route) {
  const nav = document.querySelector(".mobilbar"); if (!nav) return;
  // Alt sayfaları üst sekmeye eşle (raporlar → Rapor, satış detay → Satış).
  const r = /^rapor-/.test(route) ? "rapor-gunluk" : route === "satis-detay" ? "satis" : route;
  nav.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.mroute === r));
}

/* Tablo sayfalama (DOM üstü) — .table-tools içeren tablolar */
function enhanceTables() {
  document.querySelectorAll(".card").forEach((card) => {
    const tools = card.querySelector(".table-tools"); const tbody = card.querySelector("table.grid tbody");
    if (!tools || !tbody) return;
    const allRows = [...tbody.querySelectorAll("tr")].filter((tr) => !tr.classList.contains("empty-row"));
    if (allRows.length <= 1) return;
    const lenSel = tools.querySelector(".len select"); const searchInp = tools.querySelector(".tbl-search");
    const info = card.querySelector(".tbl-info"); const pager = card.querySelector(".pager");
    let page = 1;
    function apply() {
      const q = searchInp ? searchInp.value.toLowerCase() : ""; const per = Number(lenSel ? lenSel.value : 10) || 10;
      const filtered = allRows.filter((tr) => !q || tr.textContent.toLowerCase().includes(q));
      const total = filtered.length; const pages = Math.max(1, Math.ceil(total / per)); if (page > pages) page = pages;
      const start = (page - 1) * per, end = start + per;
      allRows.forEach((tr) => tr.style.display = "none");
      filtered.slice(start, end).forEach((tr) => tr.style.display = "");
      if (info) info.textContent = total ? `${total} kayıttan ${start + 1} ile ${Math.min(end, total)} arası` : "Kayıt bulunamadı.";
      if (pager) {
        pager.innerHTML = "";
        const mk = (t, p, mut, on) => { const s = document.createElement("span"); s.textContent = t; if (mut) s.className = "mut"; else if (on) s.className = "on"; else s.onclick = () => { page = p; apply(); }; return s; };
        pager.appendChild(mk("İlk", 1, page === 1)); pager.appendChild(mk("Önceki", page - 1, page === 1));
        for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) pager.appendChild(mk(String(p), p, false, p === page));
        pager.appendChild(mk("Sonraki", page + 1, page === pages)); pager.appendChild(mk("Son", pages, page === pages));
      }
    }
    if (lenSel) lenSel.onchange = () => { page = 1; apply(); };
    if (searchInp) searchInp.oninput = () => { page = 1; apply(); };
    apply();
  });
}
function openProductEdit(id) { editProductId = id; navigate("urun-ekle"); }
function openCustomerDetail(id) { selectedCustomerId = id; navigate("musteri-detay"); }

/* Zil: bekleyen çay ocağı siparişleri + azalan ürünler. "Azalan" = dükkan + araç TOPLAMI kritik seviyenin altında
   (eskiden yalnız dükkan stoğuna bakıyordu; mal araçtayken de "bitti" diyordu). */
function criticalProducts() { return stkKritikler(store); }
function updateBell() {
  const crit = criticalProducts(), bekleyen = stkSiparisBekleyen(store), eksi = new Set(stkEksiler(store).map((e) => e.p.id)).size;
  const badge = document.getElementById("bellBadge");
  if (badge) { const n = crit.length + bekleyen.length; badge.textContent = n; badge.classList.toggle("show", n > 0); badge.classList.toggle("siparis", bekleyen.length > 0); }
  const dd = document.getElementById("bellDropdown");
  if (dd) {
    const izin = (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") ? `<a data-bellizin class="stk-dd-izin">🔔 Yeni siparişte bildirim gönder (izin ver)</a>` : "";
    dd.innerHTML =
      (bekleyen.length ? `<div class="dd-head">Bekleyen Sipariş (${bekleyen.length})</div>` + bekleyen.slice(0, 8).map((o) => `<a data-bellsip="${o.id}">${esc(o.dealer)}<small class="${stkSiparisYasSaat(o) >= 24 ? "borc-red" : ""}">${stkYasMetin(stkSiparisYasSaat(o))}</small></a>`).join("") : "") +
      `<div class="dd-head">Azalan Ürünler (${crit.length})</div>` +
      (crit.length ? crit.slice(0, 20).map((p) => `<a data-critp="${p.id}">${esc(p.ad)}<small class="borc-red">${num2.format(stkToplamStok(p))} kaldı</small></a>`).join("") : `<div class="dd-empty">Azalan ürün yok 👍</div>`) +
      `<a data-bellgit="alinacaklar">🛒 Alınacaklar listesi</a>` +
      (eksi ? `<a data-bellgit="stok-sayimi" class="stk-dd-uyari">⚠ ${eksi} üründe stok eksi — sayım yapın</a>` : "") + izin;
    dd.querySelectorAll("[data-critp]").forEach((a) => a.addEventListener("click", () => { dd.classList.remove("open"); openProductEdit(a.dataset.critp); }));
    dd.querySelectorAll("[data-bellsip]").forEach((a) => a.addEventListener("click", () => { dd.classList.remove("open"); navigate("cay-ocagi"); }));
    dd.querySelectorAll("[data-bellgit]").forEach((a) => a.addEventListener("click", () => { dd.classList.remove("open"); navigate(a.dataset.bellgit); }));
    const iz = dd.querySelector("[data-bellizin]"); if (iz) iz.addEventListener("click", (e) => { e.stopPropagation(); sipBildirimIzniIste(); });
  }
  try { sipSeritGuncelle(); } catch (e) { console.error(e); }
}
function wireBell() {
  const btn = document.getElementById("bellBtn"), dd = document.getElementById("bellDropdown"); if (!btn || !dd) return;
  btn.addEventListener("click", (e) => { e.stopPropagation(); dd.classList.toggle("open"); });
  document.addEventListener("click", () => dd.classList.remove("open"));
}

/* ============ Üst bar ============ */
function initTopbar() {
  document.getElementById("hamburger").addEventListener("click", () => {
    if (window.innerWidth <= 768) { document.body.classList.remove("rail"); document.body.classList.toggle("nav-open"); }
    else { document.body.classList.remove("nav-open"); document.body.classList.toggle("rail"); }
  });
  // Mobil çekmece örtüsüne tıklayınca kapat
  const scrim = document.getElementById("navScrim");
  if (scrim) scrim.addEventListener("click", () => document.body.classList.remove("nav-open"));
  // Mobilde rail (daraltma) geçersiz; masaüstüne büyürse çekmeceyi sıfırla
  const syncNav = () => {
    if (window.innerWidth <= 768) document.body.classList.remove("rail");
    else document.body.classList.remove("nav-open");
  };
  window.addEventListener("resize", syncNav);
  syncNav();
  const userBtn = document.getElementById("userBtn"), dd = document.getElementById("userDropdown");
  userBtn.addEventListener("click", (e) => { e.stopPropagation(); dd.classList.toggle("open"); });
  document.addEventListener("click", () => dd.classList.remove("open"));
  dd.querySelectorAll("[data-route]").forEach((a) => a.addEventListener("click", () => navigate(a.dataset.route)));
  dd.querySelectorAll("a").forEach((a) => { if (a.textContent.indexOf("Çıkış Yap") >= 0) { a.setAttribute("role", "button"); a.addEventListener("click", () => { cikisYap(); }); } });
  wireGlobalSearch();
  wireBell();
}
function wireGlobalSearch() {
  const box = document.querySelector(".searchbox"); if (!box) return;
  const inp = box.querySelector("input"); if (!inp) return;
  let panel = box.querySelector(".search-results");
  if (!panel) { panel = document.createElement("div"); panel.className = "search-results"; box.appendChild(panel); }
  const close = () => panel.classList.remove("open");
  const run = () => {
    const q = inp.value.trim().toLowerCase(); if (!q) { close(); return; }
    const prod = store.products.filter((p) => (p.ad || "").toLowerCase().includes(q) || (p.barkod || "").includes(q)).slice(0, 6);
    const cust = store.customers.filter((c) => (c.ad || "").toLowerCase().includes(q)).slice(0, 5);
    const sale = store.sales.filter((s) => (s.belgeNo || "").toLowerCase().includes(q)).slice(0, 4);
    let html = "";
    if (prod.length) html += `<div class="sr-group">Ürünler</div>` + prod.map((p) => `<a data-sr="prod" data-id="${p.id}">${esc(p.ad)}<small>${money.format(Number(p.satis) || 0)}</small></a>`).join("");
    if (cust.length) html += `<div class="sr-group">Müşteriler</div>` + cust.map((c) => `<a data-sr="cust" data-id="${c.id}">${esc(c.ad)}<small>${money.format(customerBorc(c.id))}</small></a>`).join("");
    if (sale.length) html += `<div class="sr-group">Satışlar</div>` + sale.map((s) => `<a data-sr="sale" data-id="${s.id}">${esc(s.belgeNo)}<small>${money.format(s.toplam)}</small></a>`).join("");
    if (!html) html = `<div class="sr-empty">Sonuç yok.</div>`;
    panel.innerHTML = html; panel.classList.add("open");
    panel.querySelectorAll("[data-sr]").forEach((a) => a.addEventListener("click", () => {
      const id = a.dataset.id, t = a.dataset.sr; close(); inp.value = "";
      if (t === "prod") openProductEdit(id); else if (t === "cust") openCustomerDetail(id); else openSale(id);
    }));
  };
  inp.addEventListener("input", run);
  inp.addEventListener("focus", () => { if (inp.value.trim()) run(); });
  document.addEventListener("click", (e) => { if (!box.contains(e.target)) close(); });
}

/* ============ Başlat ============ */
servisYukle();
buildMenu();
initTopbar();
mobilBarKur();
render();
if (servis.aktif) navigate("rota");
esKabukKur();
window.addEventListener("babuco:cikis", esCikisYapildi);
// Giriş kapısı (varsa) geçilmeden buluta dokunulmaz. Kapı, cihazda geçerli oturum varsa internetsiz de açılır.
(typeof girisKapisi === "function" ? girisKapisi() : Promise.resolve()).then(() => {
  _esKapi = true;
  if (!SB) { _bulutHazir = true; kategoriGocKontrol(); }
  // Açılışta buluttan çek + bekleyen kayıt varsa birleştirerek gönder. Sonra 8 sn'de bir yokla:
  // internet var mı, başka cihaz/araç yazmış mı, gönderilemeyen kayıt var mı.
  internetKontrol(true);
  setInterval(internetKontrol, 8000);
  window.addEventListener("online", () => internetKontrol(true));
  window.addEventListener("offline", () => internetKontrol());
  // Ekrana dönünce tazele; ekrandan çıkarken / kapanırken bekleyen kaydı 1 sn'yi beklemeden gönder.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") internetKontrol(true);
    else esHemenGonder();
  });
  window.addEventListener("pagehide", esHemenGonder);
  window.addEventListener("babuco:giris", esGirisYapildi);
  // Çay ocağı siparişlerini internetten otomatik çek (açılışta + 15sn'de bir).
  if (SB) { cayPullSupabase(); setInterval(cayPullSupabase, 15000); }
});
if (typeof window !== "undefined") window.app = { getStore: () => store, pos, addToCart, finalizeSale, finalizeCustom, findProduct, customerBorc, firmaBorc, saveStore, render, navigate, openSale, netLine, cartTotals, exportBackup, importBackup, criticalProducts, saleOdeme };
