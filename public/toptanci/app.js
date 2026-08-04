/* babu.co — işletme paneli · tüm sayfalar çalışır (localStorage, internetsiz) */

/* ============ Veri katmanı ============ */
const STORE_KEY = "benimpos-app-v1";
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const num2 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

function emptyStore() {
  return {
    products: [], customers: [], sales: [], payments: [],
    groups: [], firmalar: [], purchases: [], firmaPayments: [],
    expenses: [], incomes: [], personeller: [], gorevler: [],
    odemeTipleri: [], stokSayimlari: [], efaturalar: [], iadeler: [],
    stokHareket: [], altUrunler: [], varyantlar: [], gelenSiparisler: [],
    duyurular: [], gorusmeler: [], rotalar: [], talepler: [], ziyaretler: [], aracHareket: [], servisRaporlari: [], dukkanNotlari: [],
    settings: { firmaAdi: "ÖZGÜR TİCARET", firmaNo: "U225211984", eposta: "", ad: "", soyad: "", ilce: "", fisBaslik: "", fisAdres: "", fisTel: "", fisAltbilgi: "Teşekkür ederiz" },
    counters: { sale: 0, purchase: 0, sayim: 0, efatura: 0, seq: 0 },
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
function saveStore() { localStorage.setItem(STORE_KEY, JSON.stringify(store)); bulutaYaz(); }
function genId() { store.counters.seq = (store.counters.seq || 0) + 1; return "id" + store.counters.seq + Date.now().toString(36); }
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
  return b;
}
function customerSalesCount(id) { return store.sales.filter((s) => s.musteriId === id).length; }
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
function importBackup(text) {
  let data; try { data = JSON.parse(text); } catch (e) { alert("Geçersiz yedek dosyası."); return; }
  if (!data || !Array.isArray(data.products)) { alert("Bu bir babu.co yedeği değil."); return; }
  if (!confirm("Mevcut TÜM veri bu yedekle DEĞİŞTİRİLECEK. Devam edilsin mi?")) return;
  const base = emptyStore();
  for (const k in base) if (data[k] === undefined) data[k] = base[k];
  data.settings = Object.assign(base.settings, data.settings || {});
  data.counters = Object.assign(base.counters, data.counters || {});
  store = data; saveStore(); alert("Yedek geri yüklendi ✔"); navigate("anasayfa");
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

/* ============ Sidebar menü ============ */
const MENU = [
  { ico: "🏪", label: "Dükkan", route: "dukkan" },
  { ico: "🖊", label: "Satış Yap", route: "satis" },
  { ico: "🚗", label: "Rota / Saha Satış", route: "rota" },
  { ico: "🗺", label: "Harita / Rota Planı", route: "harita" },
  { ico: "🎧", label: "Saha Koçu (Görüşme Analizi)", route: "saha-kocu" },
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
    if (f.type === "foto") return `<div class="field"><button class="btn soft" type="button" data-foto="${f.key}" style="width:100%;justify-content:center;min-height:44px">${f.label}</button><span class="hint" id="fotoDurum-${f.key}" style="display:block;margin-top:4px"></span></div>`;
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
      ov.querySelectorAll("[data-foto]").forEach((b) => b.addEventListener("click", () => vergiLevhasiOku(ov, b.dataset.foto)));
    },
    onOk: (ov) => {
      const data = {};
      let ok = true;
      fields.forEach((f) => {
        if (f.type === "foto") return; // sadece aksiyon butonu, veri değil
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
    const low = (Number(p.stok) || 0) <= (Number(p.kritik) || 0) && p.kritik !== "" && p.kritik != null;
    return `<tr>
      <td>${i + 1}</td><td>📦</td><td>${esc(p.barkod) || "-"}</td>
      <td>${esc(p.ad)}<br><span class="badge">${esc(p.grup || "GRUPSUZ ÜRÜN")}</span></td>
      <td class="${low ? "stok-low" : ""}">${num2.format(Number(p.stok) || 0)}</td>
      <td class="arac-stok">${num2.format(Number(p.aracStok) || 0)}</td>
      <td>${Number(p.kdv) || 0}</td><td>${p.kritik === "" || p.kritik == null ? 0 : Number(p.kritik)}</td>
      <td>${money.format(Number(p.alis) || 0)}</td><td>${money.format(Number(p.satis) || 0)}</td>
      <td><div class="act-btns"><button class="edit" data-edit="${p.id}">Düzenle</button><button class="del" data-del="${p.id}">Sil</button></div></td>
    </tr>`;
  }).join("");
  return pageHead("Ürünler", store.products.length + " ürün", [{ label: "🚚 Araç Stoğu", route: "arac-yukleme" }, { label: "＋ Ürün Ekle", route: "urun-ekle" }, { label: "⇩ Excel'e Aktar", cls: "softgreen", act: "csvOut" }, { label: "⇧ İçe Aktar", cls: "softgreen", act: "csvIn" }, { label: "Şablon", cls: "soft", act: "csvTpl" }]) +
    tableCard(["Sıra", "Görsel", "Ürün Barkodu", "Ürün Adı", "Dükkan", "Araç", "KDV", "Kritik Stok", "Alış Fiyatı", "Fiyat 1", "İşlem"], rows, infoLine(store.products.length));
}
function mountUrunler() {
  document.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => { editProductId = b.dataset.edit; navigate("urun-ekle"); }));
  document.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { const p = findProduct(b.dataset.del); if (p && confirm(`"${p.ad}" silinsin mi?`)) { store.products = store.products.filter((x) => x.id !== p.id); saveStore(); render(); } }));
  const o = document.querySelector('[data-act="csvOut"]'); if (o) o.addEventListener("click", exportProducts);
  const i = document.querySelector('[data-act="csvIn"]'); if (i) i.addEventListener("click", () => openCsvImport(importProducts));
  const t = document.querySelector('[data-act="csvTpl"]'); if (t) t.addEventListener("click", () => downloadFile("babuco-urun-sablon.csv", csvBuild([["Barkod", "Ürün Adı", "Grup", "Alış Fiyatı", "Fiyat 1", "Kalan Stok", "Araç Stok", "Kritik Stok", "KDV", "Birim"]])));
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
        <div class="field"><label>Kalan Stok</label><input name="stok" type="number" step="0.01" value="${v("stok")}" placeholder="0" /></div>
        <div class="field"><label>Kritik Stok</label><input name="kritik" type="number" step="0.01" value="${v("kritik")}" placeholder="0" /></div>
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
    if (editProductId) Object.assign(findProduct(editProductId), data);
    else store.products.push(Object.assign({ id: genId() }, data));
    saveStore(); editProductId = null; navigate("urunler");
  });
}

/* ============ MÜŞTERİLER ============ */
function renderMusteriler() {
  const liste = store.customers.filter((c) => !c.bayi); // servisçiler (bayi) ayrı sayfada
  const toplamBorc = liste.reduce((s, c) => s + customerBorc(c.id), 0);
  const rows = liste.map((c, i) => {
    const borc = customerBorc(c.id);
    return `<tr><td>${i + 1}</td><td><button class="link-btn" data-detay="${c.id}">${esc(c.ad)}</button></td><td>${customerSalesCount(c.id)}</td><td class="${borc > 0 ? "borc-red" : ""}">${money.format(borc)}</td><td>${esc(c.telefon || "-")}</td><td><div class="act-btns"><button class="edit" data-duzenlec="${c.id}">✏ Düzenle</button><button class="edit" data-odeme="${c.id}">Ödeme Al</button><button class="del" data-delc="${c.id}">Sil</button></div></td></tr>`;
  }).join("");
  return pageHead("Müşteriler", `${liste.length} kişi · Toplam borç: ${money.format(toplamBorc)}`, [{ label: "＋ Yeni Müşteri Oluştur", act: "yeni-musteri" }, { label: "📇 Rehberden Ekle", cls: "soft", act: "rehber-musteri" }, { label: "⇩ Excel'e Aktar", cls: "softgreen", act: "csvOut" }, { label: "⇧ İçe Aktar", cls: "softgreen", act: "csvIn" }, { label: "Şablon", cls: "soft", act: "csvTpl" }]) +
    tableCard(["Sıra", "Müşteri", "Alışveriş Sayısı", "Kalan Borcu", "Telefon", "İşlem"], rows, infoLine(liste.length));
}
// Servisçiler (bayi) — normal müşterilerden ayrı; mekanik olarak müşteri (aynı borç/tahsilat/özel fiyat).
function renderServisciler() {
  const liste = store.customers.filter((c) => c.bayi);
  const toplamBorc = liste.reduce((s, c) => s + customerBorc(c.id), 0);
  const rows = liste.map((c, i) => {
    const borc = customerBorc(c.id);
    const ozelSay = c.ozelFiyatlar ? Object.keys(c.ozelFiyatlar).length : 0;
    return `<tr><td>${i + 1}</td><td><button class="link-btn" data-detay="${c.id}">${esc(c.ad)}</button></td><td>${customerSalesCount(c.id)}</td><td>${ozelSay ? ozelSay + " ürün" : "-"}</td><td class="${borc > 0 ? "borc-red" : ""}">${money.format(borc)}</td><td>${esc(c.telefon || "-")}</td><td><div class="act-btns"><button class="edit" data-duzenlec="${c.id}">✏ Düzenle</button><button class="edit" data-odeme="${c.id}">Ödeme Al</button><button class="del" data-delc="${c.id}">Sil</button></div></td></tr>`;
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
    `<div class="ay-tools"><button class="btn ok" data-act="aracKaydet" type="button">✓ Araç Stoğunu Kaydet</button></div>
     <p class="hint" style="margin:0 2px 8px"><b>Devreden model:</b> Araç stoğu ertesi güne devreder — her sabah doldur/boşalt YOK. Sadece <b>ilk kez</b> ya da sayım gerektiğinde araçtaki gerçek miktarı yaz. Satınca otomatik düşer; yolda alınca "🛒 Araca Al" ile eklenir.</p>` +
    tableCard(["Ürün", "Araç Stok (mevcut)"], rows, "");
}
function mountAracYukleme() {
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
  const pr = findProduct(urunId); const al = pr ? Number(pr.alis) || 0 : 0;
  let adet = 0, ciro = 0, kar = 0, sonSatis = "";
  store.sales.forEach((s) => {
    if (sinir && new Date(s.tarih).getTime() < sinir) return;
    s.items.forEach((it) => {
      if (it.urunId !== urunId) return;
      const q = Number(it.adet) || 0, f = Number(it.fiyat) || 0;
      adet += q; ciro += q * f; kar += q * (f - al);
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
    { key: "vergiFoto", label: "📷 Vergi Levhası Çek → Otomatik Doldur", type: "foto" },
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
    { key: "bayi", label: "Servisçi (senden toptan/düşük fiyata alan bayi)", type: "checkbox" },
  ], seed, (data) => {
    if (item) Object.assign(item, data);
    else store.customers.push(Object.assign({ id: genId() }, data));
    saveStore(); if (onDone) onDone(); else render();
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
  const o = document.querySelector('[data-act="csvOut"]'); if (o) o.addEventListener("click", exportCustomers);
  const i = document.querySelector('[data-act="csvIn"]'); if (i) i.addEventListener("click", () => openCsvImport(importCustomers));
  const t = document.querySelector('[data-act="csvTpl"]'); if (t) t.addEventListener("click", () => downloadFile("babuco-musteri-sablon.csv", csvBuild([["Müşteri Adı", "Telefon", "Açılış Borcu", "Adres", "Vergi No"]])));
  wireTableSearch();
}
function openOdemeAl(custId) {
  const c = findCustomer(custId); if (!c) return;
  const borc = customerBorc(custId);
  openModal(`Ödeme Al — ${esc(c.ad)}`, `<p class="sub">Kalan borç: <strong>${money.format(borc)}</strong></p>
    <div class="field"><label>Tahsilat Tutarı (₺) *</label><input id="pTut" type="number" step="0.01" value="${borc > 0 ? borc : ""}" /></div>
    <div class="field"><label>Not</label><input id="pNot" placeholder="opsiyonel" /></div>`, {
    okLabel: "Ödemeyi Kaydet",
    onOk: (ov) => { const t = Number(ov.querySelector("#pTut").value); if (!t || t <= 0) { alert("Geçerli tutar girin."); return false; } store.payments.push({ id: genId(), musteriId: custId, tutar: t, not: ov.querySelector("#pNot").value.trim(), tarih: new Date().toISOString() }); bayiPuanEkle(c, t); saveStore(); render(); },
  });
}
let selectedCustomerId = null;
function renderMusteriDetay() {
  const c = selectedCustomerId ? findCustomer(selectedCustomerId) : null;
  if (!c) return pageHead("Müşteri Detay") + `<div class="card"><p class="sub">Müşteri seçilmedi. <button class="link-btn" data-goto="musteriler">Müşteriler listesine dön</button>.</p></div>`;
  const sales = store.sales.filter((s) => s.musteriId === c.id).sort((a, b) => b.tarih.localeCompare(a.tarih));
  const pays = store.payments.filter((p) => p.musteriId === c.id).sort((a, b) => b.tarih.localeCompare(a.tarih));
  const salesRows = sales.map((s, i) => `<tr><td>${i + 1}</td><td><button class="link-btn" data-sale="${s.id}">${esc(s.belgeNo)}</button></td><td>${s.items.reduce((a, it) => a + it.adet, 0)}</td><td>${money.format(s.toplam)}</td><td>${money.format(s.odeme.acik)}</td><td>${saleOdeme(s)}</td><td>${fmtDate(s.tarih)}</td></tr>`).join("");
  const payRows = pays.map((p, i) => `<tr><td>${i + 1}</td><td>Tahsilat</td><td>${esc(p.not || "-")}</td><td>${money.format(p.tutar)}</td><td>${fmtDate(p.tarih)}</td></tr>`).join("");
  return pageHead("Müşteri Detay", esc(c.ad) + (c.telefon ? " · 📞 " + esc(c.telefon) : " · telefon yok"), [{ label: "Ödeme Al", cls: "green", act: "odeme" }, { label: "📇 Rehberden Numara", cls: "soft", act: "rehber" }, { label: "✏ Düzenle", cls: "soft", act: "duzenle" }, { label: "Müşteriler", cls: "soft", route: "musteriler" }]) +
    grid([["Toplam Satış", money.format(sales.reduce((s, x) => s + x.toplam, 0)), "blue"], ["Açılış Borcu", money.format(Number(c.acilis) || 0)], ["Tahsilat", money.format(pays.reduce((s, p) => s + p.tutar, 0)), "green"], ["Kalan Borç", money.format(customerBorc(c.id))]]) +
    `<h1 style="font-size:15px;margin:18px 0 8px">Alışverişler</h1>` + tableCard(["Sıra", "Belge No", "Toplam Ürün", "Toplam Tutar", "Açık Hesap", "Ödeme Tipi", "Tarih"], salesRows, infoLine(sales.length)) +
    `<h1 style="font-size:15px;margin:18px 0 8px">Tahsilatlar</h1>` + tableCard(["Sıra", "Türü", "Not", "Tutar", "Tarih"], payRows, infoLine(pays.length));
}
function mountMusteriDetay() {
  const o = document.querySelector('[data-act="odeme"]'); if (o) o.addEventListener("click", () => openOdemeAl(selectedCustomerId));
  const rb = document.querySelector('[data-act="rehber"]'); if (rb) rb.addEventListener("click", () => rehberdenNumaraAta(selectedCustomerId));
  const dz = document.querySelector('[data-act="duzenle"]'); if (dz) dz.addEventListener("click", () => openYeniMusteri(null, findCustomer(selectedCustomerId)));
  wireSaleLinks();
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
    const maliyet = saleLines.reduce((a, r) => { const p = findProduct(r.urunId); return a + (p ? Number(p.alis) || 0 : 0) * Number(r.adet); }, 0);
    s.items = saleLines.map((r) => ({ urunId: r.urunId, ad: r.ad, barkod: r.barkod || "", kdv: Number(r.kdv) || 0, fiyat: Number(r.fiyat), adet: Number(r.adet), iskyuzde: Number(r.iskyuzde) || 0 }));
    s.musteriId = mus; s.not = document.getElementById("sdNot").value; s.iskonto = isk; s.brut = brut; s.toplam = toplam; s.maliyet = maliyet;
    s.odeme = { nakit: otip === "nakit" ? toplam : 0, pos: otip === "pos" ? toplam : 0, acik: otip === "acik" ? toplam : 0 };
    saveStore(); alert("Satış güncellendi ✔"); render();
  });
}

/* ============ SATIŞ (POS) ============ */
function newCart() { return { items: [], musteriId: null, iskonto: 0, odenen: 0 }; }
const pos = { carts: [newCart(), newCart(), newCart(), newCart(), newCart()], active: 0, cat: "ANA", personelId: null, q: "" };
function activeCart() { return pos.carts[pos.active]; }
function renderSatis() {
  const usedSet = new Set(store.products.filter((p) => p.gorunur !== false).map((p) => p.grup || "GRUPSUZ ÜRÜN"));
  const cats = ["ANA"].concat(allGroupNames().filter((g) => usedSet.has(g)));
  const custTabs = pos.carts.map((c, n) => `<div class="cust-tab ${n === pos.active ? "on" : ""}" data-tab="${n}">Müşteri ${n + 1} (${num2.format(c.items.reduce((s, i) => s + i.fiyat * i.adet, 0))})</div>`).join("");
  const catTabs = cats.map((c) => `<span class="cat-tab ${c === pos.cat ? "on" : ""}" data-cat="${c}">${c === "ANA" ? "☰ Kategoriler" : esc(c)}</span>`).join("");
  const persSel = store.personeller.length ? `<div class="field" style="margin:0"><label>Personel</label><select id="posPersonel"><option value="">— seç —</option>${store.personeller.map((p) => `<option value="${p.id}" ${pos.personelId === p.id ? "selected" : ""}>${esc(p.ad)}</option>`).join("")}</select></div>` : "";
  return `<div class="pos2">
      <!-- 0. Satış app-bar (mavi gradyan) — BenimPOS başlığı -->
      <div class="satis-appbar">
        <button class="sab-back" id="sabBack" type="button" aria-label="Geri">&#9664;</button>
        <div class="sab-title">Satış Yap</div>
        <div class="sab-actions">
          <button class="sab-ico" id="sabIsk" type="button" title="İskonto uygula">&#10549;</button>
          <button class="sab-ico" id="sabAra" type="button" title="Ürün / barkod ara">&#8853;</button>
          <button class="sab-ico" id="sabMuh" type="button" title="Muhtelif tutar ekle"><span class="sab-num">100</span></button>
          <button class="sab-ico" id="posYazdir" type="button" title="Yazdır">&#128424;</button>
        </div>
      </div>

      <!-- 0b. Stok kaynağı modu + Gelişmiş çeşit modu -->
      <div class="stok-mod-bar">
        <span class="smb-label">Stok kaynağı</span>
        <button class="smb-toggle ${stokModu}" id="stokModBtn" type="button">${stokModu === "arac" ? "🚗 Araç" : "🏪 Dükkan"}<span class="smb-swap">↔ değiştir</span></button>
        <button class="smb-gelismis ${gelismisMod ? "on" : ""}" id="gelismisBtn" type="button" title="Açıkken: karta basılı tut → çeşitleri seç">⚙ Gelişmiş${gelismisMod ? " ✓" : ""}</button>
      </div>

      <!-- 1. Özet çubuğu: Miktar | Brüt | İskonto | Tutar -->
      <div class="pos-totals" id="posTotals">
        <div class="pos-tot"><div class="l">Miktar</div><div class="v" id="posMiktar">0</div></div>
        <div class="pos-tot"><div class="l">Brüt</div><div class="v" id="posBrut">0</div></div>
        <div class="pos-tot"><div class="l">İskonto</div><div class="v" id="posIsk">0</div></div>
        <div class="pos-tot brand"><div class="l">Tutar</div><div class="v" id="posTutar">0</div></div>
      </div>

      <div class="pos2-cols">
        <!-- SOL sütun (mobilde akışta üst blok) -->
        <div class="pos2-left">
          <!-- 3. Müşteri pill sekmeleri -->
          <div class="cust-tabs" id="custTabs">${custTabs}</div>

          <!-- 3b. Bundle: seçili müşterinin geçen siparişi (tek dokunuş sepete) -->
          ${bundleBarHTML()}

          <!-- 4. Adisyon / sepet listesi (satıra tıkla → düzenleme penceresi) -->
          <div class="card ades-wrap">
            <div class="ades-head"><span>Adisyon</span><button class="ades-tara" id="taraFab" type="button"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M4 12h16"/></svg> Tara</button><span id="cartCount" class="sub">${cartCount()}</span></div>
            <div class="ades-list" id="cartBody">${cartRowsHTML()}</div>
          </div>

          <!-- 5. Müşteri satırı + satış notu + onay kutuları -->
          <div class="pos-meta2">
            <div class="cust-line">
              <span class="cust-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#3a4250" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></span>
              <div class="cust-txt">
                <b id="custName">${cartCustName() || "Müşterisiz satış"}</b>
                <span id="custLimit">${activeCart().musteriId ? "Borç : " + money.format(customerBorc(activeCart().musteriId)) : "(Borç : 0.00  Limit : 0.00)"}</span>
              </div>
              <button class="cust-add" id="custPick" type="button" aria-label="Müşteri seç"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#3a4250" stroke-width="1.7"><circle cx="9" cy="8" r="4"/><path d="M2 20c0-3.5 3.2-5.5 7-5.5"/><path d="M18 9v6M15 12h6"/></svg></button>
            </div>
            <div class="note-line">
              <input id="posNot" class="note-in" placeholder="Satış notu" />
              <span class="app-ver">Özgür Ticaret</span>
            </div>
          </div>

          <!-- 6. Ödeme (tek satır 4 buton) -->
          <div class="pay-grid">
            <button class="pay-btn nakit" data-pay="nakit" type="button">Nakit</button>
            <button class="pay-btn pos" data-pay="pos" type="button">Pos</button>
            <button class="pay-btn acik" data-pay="acik" type="button">Açık Hesap</button>
            <button class="pay-btn parcali" data-pay="parcali" type="button">Parçalı</button>
          </div>
          ${store.odemeTipleri.length ? `<div class="pay-custom">${store.odemeTipleri.map((t) => `<button class="btn soft" data-paycustom="${t.id}" type="button">${esc(t.ad)}</button>`).join("")}</div>` : ""}
          ${persSel}
        </div>

        <!-- SAĞ sütun (mobilde akışta alt blok): kategoriler + ürünler -->
        <div class="pos2-right">
          <!-- 8. Ürün arama + kategori pill'leri (yapışkan) -->
          <div class="prod-filterbar">
            <div class="prod-search">
              <span class="prod-search-ic">&#128269;</span>
              <input id="prodSearch" class="prod-search-in" placeholder="Ürün ara (isim / barkod)..." value="${esc(pos.q || "")}" />
              <button class="prod-search-x" id="prodSearchX" type="button" aria-label="Temizle" style="${pos.q ? "" : "display:none"}">&times;</button>
            </div>
            <div class="cat-tabs" id="catTabs">${catTabs}</div>
          </div>
          <!-- 9. Ürün ızgarası (kart kart) -->
          <div class="prod-grid" id="prodGrid">${prodGridHTML()}</div>
        </div>
      </div>

    </div>`;
}
function cartCustName() { const id = activeCart().musteriId; const c = id && findCustomer(id); return c ? esc(c.ad) : ""; }
function cartRowsHTML() {
  const items = activeCart().items;
  if (!items.length) return `<div class="ades-empty">Sepet boş — üründen ekleyin.</div>`;
  return items.map((it, idx) => {
    const isk = Number(it.iskyuzde) || 0;
    const p = it.urunId && findProduct(it.urunId);
    const ozel = p && Number(it.fiyat) !== (Number(p.satis) || 0);
    return `<div class="ades-row" data-line="${idx}" role="button" tabindex="0">
    <div class="ades-qty">${num2.format(Number(it.adet) || 0)} ×</div>
    <div class="ades-mid">
      <div class="ades-name">${esc(it.ad)}</div>
      <div class="ades-unit">${money.format(Number(it.fiyat) || 0)}${ozel ? ` <span class="ozel-tag">özel</span>` : ""}${isk ? ` · %${num2.format(isk)} isk` : ""}</div>
    </div>
    <div class="ades-tot" data-tut="${idx}">${money.format(netLine(it))}</div>
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
function posSoloCard(p) {
  const cesit = gelismisMod && varyantKardesler(p).length > 1;
  return `<div class="prod-card${cesit ? " has-var" : ""}" data-add="${p.id}">${cesit ? `<span class="var-badge">⋮ çeşit</span>` : ""}<span class="p-name">${esc(p.ad)}</span><span class="p-price">${money.format(Number(p.satis) || 0)}</span></div>`;
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
// Seçili müşteri varsa "son sipariş" bundle çubuğu
function bundleBarHTML() {
  const id = activeCart().musteriId;
  if (!id) return "";
  const items = musteriSonSiparis(id);
  if (!items.length) return "";
  const c = findCustomer(id);
  const adlar = items.slice(0, 4).map((i) => esc(i.ad)).join(", ") + (items.length > 4 ? " +" + (items.length - 4) : "");
  return `<div class="bundle-bar">
    <div class="bundle-txt"><b>🔁 ${esc(c ? c.ad : "Müşteri")} — geçen sipariş</b><span>${items.length} ürün · ${adlar}</span></div>
    <button class="btn ok bundle-add" id="bundleAdd" type="button">＋ Sepete Ekle</button>
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
// Kategori görseli: ada göre emoji + renk sınıfı
function katGorsel(name) {
  const n = ocrNorm(name);
  if (/okey/.test(n)) return { ic: "🀄", cls: "k-game" };
  if (/oyun|eglence/.test(n)) return { ic: "🃏", cls: "k-game" };
  if (/servis ekip|bardak|tabak|kasik/.test(n)) return { ic: "🍽️", cls: "k-serve" };
  if (/caylar|\bcay\b/.test(n)) return { ic: "🍵", cls: "k-tea" };
  if (/kahve|yan urun|granul|3u1|3ü1/.test(n)) return { ic: "☕", cls: "k-tea" };
  if (/toz icecek/.test(n)) return { ic: "🧃", cls: "k-drink" };
  if (/meyve suyu/.test(n)) return { ic: "🧃", cls: "k-drink" };
  if (/gazoz/.test(n)) return { ic: "🥤", cls: "k-drink" };
  if (/gazli|kola|cola|fanta/.test(n)) return { ic: "🥤", cls: "k-drink" };
  if (/ayran/.test(n)) return { ic: "🥛", cls: "k-milk" };
  if (/soda/.test(n)) return { ic: "🥤", cls: "k-drink" };
  if (/\bsu\b/.test(n)) return { ic: "💧", cls: "k-drink" };
  if (/temizlik|deterjan|sabun|camasir|bulasik|dezenfektan/.test(n)) return { ic: "🧽", cls: "k-clean" };
  if (/sicak icecek|sahlep|salep/.test(n)) return { ic: "🍵", cls: "k-tea" };
  if (/soguk icecek|mesrubat|icecek|kola|gazoz|meyve suyu|ayran|enerji|maden/.test(n)) return { ic: "🥤", cls: "k-drink" };
  if (/servis|bardak|fincan|tabak/.test(n)) return { ic: "🍽️", cls: "k-serve" };
  if (/seker|gida|sekerleme|cikolata|biskuvi|bisküvi|atistir|gofret|cips/.test(n)) return { ic: "🍬", cls: "k-sweet" };
  if (/sut|yogurt|peynir|kahvalt|tereyag/.test(n)) return { ic: "🥛", cls: "k-milk" };
  if (/kagit|hijyen|pecete|mendil/.test(n)) return { ic: "🧻", cls: "k-paper" };
  if (/kirtasiye/.test(n)) return { ic: "✏️", cls: "k-paper" };
  if (/mobilya|dis mekan|bahce/.test(n)) return { ic: "🪑", cls: "k-misc" };
  if (/teknik|guvenlik/.test(n)) return { ic: "🔧", cls: "k-misc" };
  if (/mutfak|ekipman/.test(n)) return { ic: "🍳", cls: "k-misc" };
  return { ic: "📦", cls: "k-misc" };
}
// Kategori-önce görünüm: kategori kartları (tıkla → o kategorinin ürünleri)
function catGridHTML() {
  const used = new Set(store.products.filter((p) => p.gorunur !== false).map((p) => p.grup || "GRUPSUZ ÜRÜN"));
  const cats = allGroupNames().filter((g) => used.has(g));
  if (!cats.length) return `<div style="grid-column:1/-1;color:var(--muted);padding:20px;text-align:center">Kategori yok. <a href="#/urun-ekle">Ürün ekleyin</a>.</div>`;
  return cats.map((c) => {
    const n = store.products.filter((p) => p.gorunur !== false && (p.grup || "GRUPSUZ ÜRÜN") === c).length;
    const g = katGorsel(c);
    return `<button class="cat-card ${g.cls}" data-catopen="${esc(c)}" type="button"><span class="cc-ic" aria-hidden="true">${g.ic}</span><span class="cc-name">${esc(c)}</span><span class="cc-count">${n} ürün</span></button>`;
  }).join("");
}
function prodGridHTML() {
  const q = ocrNorm(pos.q || "");
  // Arama yoksa ve ANA'daysak: ön ekran = ana ürünler; yoksa kategori kartları
  if (pos.cat === "ANA" && !q) {
    const ana = store.products.filter((p) => p.gorunur !== false && p.anaUrun);
    if (ana.length) return ana.map(posSoloCard).join("");
    return catGridHTML();
  }
  let list = store.products.filter((p) => p.gorunur !== false);
  if (pos.cat !== "ANA") list = list.filter((p) => (p.grup || "GRUPSUZ ÜRÜN") === pos.cat);
  if (q) {
    const qr = (pos.q || "").trim().toLocaleLowerCase("tr");
    list = list.filter((p) => ocrNorm(p.ad).includes(q) || String(p.barkod || "").toLocaleLowerCase("tr").includes(qr));
  }
  if (!list.length) return `<div style="grid-column:1/-1;color:var(--muted);padding:20px;text-align:center">${q ? "Aramaya uyan ürün yok." : `Bu kategoride ürün yok. <a href="#/urun-ekle">Ürün ekleyin</a>.`}</div>`;
  // Her ürün ayrı kart (marka/model gruplama YOK — her marka ayrı listelenir).
  return list.map(posSoloCard).join("");
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
function syncTotals() {
  const t = cartTotals(); const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("posTutar", money.format(t.toplam)); set("posOdenen", num2.format(t.odenen)); set("posUstu", num2.format(t.ustu));
  const cc0 = activeCart(); set("posMiktar", num2.format(cc0.items.reduce((s, i) => s + (Number(i.adet) || 0), 0))); set("posBrut", money.format(t.brut)); set("posIsk", "%" + num2.format(Number(cc0.iskonto) || 0));
  const cc = document.getElementById("cartCount"); if (cc) cc.textContent = cartCount();
  const sbc = document.getElementById("sepetBarCount"); if (sbc) sbc.textContent = cartCount();
  const sbt = document.getElementById("sepetBarTotal"); if (sbt) sbt.textContent = money.format(t.toplam);
  document.querySelectorAll("[data-tab]").forEach((el) => { const n = Number(el.dataset.tab); el.textContent = `Müşteri ${n + 1} (${num2.format(pos.carts[n].items.reduce((s, i) => s + netLine(i), 0))})`; el.classList.toggle("on", n === pos.active); });
  const cl = document.getElementById("custLabel"); if (cl) cl.value = cartCustName();
  const cs = document.getElementById("custSearch"); if (cs) cs.value = cartCustName();
  const cn = document.getElementById("custName"); if (cn) cn.textContent = cartCustName() || "Müşterisiz satış";
  const lim = document.getElementById("custLimit");
  if (lim) {
    const mid = activeCart().musteriId, mc = mid && findCustomer(mid);
    lim.textContent = mc ? "Borç : " + money.format(customerBorc(mid)) + "   Limit : " + money.format(Number(mc.limit) || 0) : "(Borç : 0.00  Limit : 0.00)";
  }
}
function syncRow(idx) { const it = activeCart().items[idx]; if (!it) return; const cell = document.querySelector(`[data-tut="${idx}"]`); if (cell) cell.textContent = money.format(netLine(it)); syncTotals(); }
function refreshPOS() { rebuildCart(); syncTotals(); }
function wireCartRow() {
  document.querySelectorAll(".ades-row[data-line]").forEach((row) => {
    const open = () => openLineModal(Number(row.dataset.line));
    row.onclick = open;
    row.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
  });
}
/* Adisyon satırına tıklanınca açılan düzenleme penceresi — mevcut data-inc/dec/qty/price/isk/rem hook'larını modal içinde çalıştırır */
function openLineModal(idx) {
  const it = activeCart().items[idx];
  if (!it) return;
  // Yerel taslak — Onayla'ya basılmadan sepete işlenmez (X / dışarı tıkla = iptal).
  const tmp = { adet: Number(it.adet) || 0, fiyat: Number(it.fiyat) || 0, iskyuzde: Number(it.iskyuzde) || 0 };
  const satirTop = () => { const t = tmp.fiyat * tmp.adet; return t * (1 - (Number(tmp.iskyuzde) || 0) / 100); };
  const body = `<div class="line-modal">
      <div class="lm-qtyrow">
        <button class="lm-step" data-dec type="button" aria-label="Azalt">−</button>
        <input class="lm-qty" data-qty type="number" step="0.01" inputmode="decimal" value="${tmp.adet}" />
        <button class="lm-step" data-inc type="button" aria-label="Arttır">+</button>
      </div>
      <div class="field"><label>Birim Fiyat (₺)</label><input class="lm-in" data-price type="number" step="0.01" inputmode="decimal" value="${tmp.fiyat}" /></div>
      <div class="field"><label>İskonto (%)</label><input class="lm-in" data-isk type="number" step="0.01" inputmode="decimal" value="${tmp.iskyuzde || ""}" placeholder="0" /></div>
      <div class="lm-tot">Satır Toplamı <b data-tut>${money.format(satirTop())}</b></div>
      ${(() => { const mid = activeCart().musteriId, mc = mid && findCustomer(mid); return (mc && it.urunId) ? `<label class="lm-ozel"><input type="checkbox" data-ozelkaydet /> <span>Bu fiyatı <b>${esc(mc.ad)}</b> için kaydet — sonraki satışlarda otomatik uygulanır</span></label>` : ""; })()}
      <div class="lm-actions">
        <button class="btn lm-del" data-rem type="button">🗑 Sil</button>
        <button class="btn ok lm-ok" data-ok type="button">✓ Onayla</button>
      </div>
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
  if (type === "nakit") odeme.nakit = toplam;
  else if (type === "pos") odeme.pos = toplam;
  else if (type === "acik") { if (!c.musteriId) { alert("Açık hesap için önce müşteri seçin (Seç düğmesi)."); return; } odeme.acik = toplam; }
  else if (type === "parcali") {
    const n = Number(prompt("Nakit tutar:", num2.format(toplam))) || 0;
    const p = Number(prompt("POS (kart) tutar:", "0")) || 0;
    const rest = Math.round((toplam - n - p) * 100) / 100;
    odeme.nakit = n; odeme.pos = p;
    if (rest > 0.001) { if (!c.musteriId) { alert("Kalan tutar açık hesaba yazılacak — müşteri seçin."); return; } odeme.acik = rest; }
  }
  const maliyet = c.items.reduce((s, i) => { const pr = findProduct(i.urunId); return s + (pr ? (Number(pr.alis) || 0) : 0) * i.adet; }, 0);
  // POS cihaz komisyonu: sadece "Pos" ödemede %2 (nakit/havale/açık hariç)
  const komisyon = (type === "pos" && !odemeAdi) ? Math.round(toplam * 0.02 * 100) / 100 : 0;
  store.counters.sale = (store.counters.sale || 0) + 1;
  const belgeNo = new Date().getFullYear() + "-" + String(store.counters.sale).padStart(6, "0");
  store.sales.push({ id: genId(), belgeNo, musteriId: c.musteriId, personelId: pos.personelId, not: ((document.getElementById("posNot") || {}).value || ""), odemeAdi: odemeAdi || null, items: c.items.map((i) => ({ urunId: i.urunId, ad: i.ad, barkod: i.barkod || "", kdv: Number(i.kdv) || 0, fiyat: Number(i.fiyat) || 0, adet: Number(i.adet) || 0, iskyuzde: Number(i.iskyuzde) || 0 })), brut, iskonto: Number(c.iskonto) || 0, toplam, maliyet, komisyon, odeme, tarih: new Date().toISOString(), servisGun: localDateStr(new Date()), hafta: haftaNo(new Date()), stokKaynak: stokModu });
  c.items.forEach((i) => stokDus(i.urunId, i.adet)); // aktif moda göre (araç/dükkan) stok düş
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
  document.querySelectorAll("[data-fam]").forEach((el) => el.onclick = () => openAilePopup(el.dataset.fam));
  document.querySelectorAll("[data-catopen]").forEach((el) => el.onclick = () => { pos.cat = el.dataset.catopen; posGridYenile(); });
}
// Ürün/kategori ızgarasını sayfayı en üste atmadan tazele (partial). Kategori seçili + arama yoksa
// kategori kartları; aksi halde ürün LİSTESİ (list-mode).
function posGridYenile() {
  const g = document.getElementById("prodGrid");
  if (g) { g.innerHTML = prodGridHTML(); wireProdCards(); }
  document.querySelectorAll("[data-cat]").forEach((x) => x.classList.toggle("on", x.dataset.cat === pos.cat));
  const psx = document.getElementById("prodSearchX"); if (psx) psx.style.display = pos.q ? "" : "none";
}
function openCustPicker() {
  const listHTML = store.customers.length ? `<ul class="pick-list">${store.customers.map((c) => `<li data-pick="${c.id}">${esc(c.ad)} <small>· borç ${money.format(customerBorc(c.id))}</small></li>`).join("")}</ul>` : `<p class="sub">Kayıtlı müşteri yok.</p>`;
  openModal("Müşteri Seç", `<input class="pick-search" id="pickSearch" placeholder="Müşteri ara..." />${listHTML}<div style="margin-top:10px"><button class="btn soft" id="pickYeni" type="button">＋ Yeni Müşteri</button></div>`, {
    noFoot: true,
    onMount: (ov) => {
      ov.querySelectorAll("[data-pick]").forEach((li) => li.addEventListener("click", () => { activeCart().musteriId = li.dataset.pick; repriceCart(); ov.remove(); render(); }));
      const s = ov.querySelector("#pickSearch"); s.addEventListener("input", () => { const q = s.value.toLowerCase(); ov.querySelectorAll("[data-pick]").forEach((li) => { li.style.display = li.textContent.toLowerCase().includes(q) ? "" : "none"; }); });
      ov.querySelector("#pickYeni").addEventListener("click", () => { ov.remove(); openYeniMusteri(() => openCustPicker()); });
    },
  });
}
/* Muhtelif tutar penceresi — app-bar ▣100 ikonundan açılır (mevcut #muhInput/#muhEkle mantığı) */
function openMuhModal() {
  openModal("Muhtelif Tutar", `<div class="field"><label>Serbest Tutar (₺)</label><input id="muhInput" type="number" step="0.01" inputmode="decimal" placeholder="0" /></div><button class="btn ok" id="muhEkle" type="button" style="width:100%;justify-content:center;min-height:46px">Ekle</button>`, {
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
/* Genel iskonto penceresi — app-bar ⤵ ikonundan açılır (mevcut #iskGenel mantığı) */
function openIskModal() {
  openModal("Genel İskonto", `<div class="field"><label>Genel İskonto (₺)</label><input id="iskGenel" type="number" step="0.01" inputmode="decimal" value="${activeCart().iskonto || ""}" placeholder="0" /></div>`, {
    okLabel: "Uygula",
    onOk: (ov) => { const isk = ov.querySelector("#iskGenel"); activeCart().iskonto = Number(isk.value) || 0; syncTotals(); },
    onMount: (ov) => { const i = ov.querySelector("#iskGenel"); if (i) { i.focus(); try { i.select(); } catch (e) {} } },
  });
}
function mountSatis() {
  wireProdCards(); wireCartRow();
  document.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => { pos.active = Number(el.dataset.tab); render(); }));
  document.querySelectorAll("[data-cat]").forEach((el) => el.addEventListener("click", () => { pos.cat = el.dataset.cat; posGridYenile(); }));
  /* Tek-akışlı düzen: mobil bottom-sheet kaldırıldı (fiş akış içinde) */
  document.querySelectorAll("[data-pay]").forEach((el) => el.addEventListener("click", () => finalizeSale(el.dataset.pay)));
  document.querySelectorAll("[data-paycustom]").forEach((el) => el.addEventListener("click", () => finalizeCustom(el.dataset.paycustom)));
  const pick = document.getElementById("custPick"); if (pick) pick.addEventListener("click", openCustPicker);
  const bAdd = document.getElementById("bundleAdd"); if (bAdd) bAdd.addEventListener("click", bundleUygula);
  const smBtn = document.getElementById("stokModBtn"); if (smBtn) smBtn.addEventListener("click", () => { stokModuAyarla(stokModu === "arac" ? "dukkan" : "arac"); render(); });
  const gmBtn = document.getElementById("gelismisBtn"); if (gmBtn) gmBtn.addEventListener("click", () => { gelismisModAyarla(!gelismisMod); if (gelismisMod) alert("Gelişmiş mod açık: bir ürüne BASILI TUT → aynı çeşidin diğer markaları/varyasyonları açılır. Normal dokunma = ürünü ekler."); render(); });
  const pers = document.getElementById("posPersonel"); if (pers) pers.addEventListener("change", () => { pos.personelId = pers.value || null; });
  const bar = document.getElementById("barInput"), ara = document.getElementById("barAra");
  const doBar = () => { const code = bar.value.trim(); if (!code) return; const p = store.products.find((x) => x.barkod === code); if (p) { addToCart(p.id); bar.value = ""; } else alert("Bu barkodla ürün yok."); };
  if (bar) bar.addEventListener("keydown", (e) => { if (e.key === "Enter") doBar(); });
  if (ara) ara.addEventListener("click", doBar);
  const yz = document.getElementById("posYazdir"); if (yz) yz.addEventListener("click", () => alert("Satış tamamlanınca irsaliye yazdırılır."));
  document.querySelectorAll("[data-soon]").forEach((el) => el.addEventListener("click", () => alert("Bu özellik yakında.")));
  /* Satış app-bar ikonları — pencere aç / mevcut inputa odaklan */
  const focusEl = (id) => { const el = document.getElementById(id); if (el) { el.focus(); if (el.select) try { el.select(); } catch (e) {} el.scrollIntoView({ block: "center", behavior: "smooth" }); } };
  const sBack = document.getElementById("sabBack"); if (sBack) sBack.addEventListener("click", () => navigate("anasayfa"));
  const sIsk = document.getElementById("sabIsk"); if (sIsk) sIsk.addEventListener("click", openIskModal);
  const sAra = document.getElementById("sabAra"); if (sAra) sAra.addEventListener("click", () => focusEl("barInput"));
  const sMuh = document.getElementById("sabMuh"); if (sMuh) sMuh.addEventListener("click", openMuhModal);
  const taraBtn = document.getElementById("taraFab"); if (taraBtn) taraBtn.addEventListener("click", taraBaslat);
  const psearch = document.getElementById("prodSearch");
  const psx = document.getElementById("prodSearchX");
  if (psearch) psearch.addEventListener("input", () => { pos.q = psearch.value; posGridYenile(); });
  if (psx) psx.addEventListener("click", () => { pos.q = ""; if (psearch) { psearch.value = ""; psearch.focus(); } posGridYenile(); });
  syncTotals();
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
  const gider = store.expenses.filter((e) => isToday(e.tarih)).reduce((a, e) => a + Number(e.tutar || 0), 0);
  const gelir = store.incomes.filter((e) => isToday(e.tarih)).reduce((a, e) => a + Number(e.tutar || 0), 0);
  const tahsilat = store.payments.filter((p) => isToday(p.tarih)).reduce((a, p) => a + p.tutar, 0);
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
    grid([["Nakit Kasa", money.format(nakit + tahsilat + gelir - gider), "green"], ["Gider (bugün)", money.format(gider)], ["Kâr (bugün)", money.format(ciro - maliyet), "green"], ["Toplam Alacak", money.format(toplamBorc)]]) +
    `<h1 style="font-size:16px;margin:18px 0 10px">Bugünün Satışları (${today.length})</h1>` + (son.length ? sonSatisListesi(son) : `<div class="card"><p class="sub">Bugün henüz satış yok.</p></div>`) +
    `<h1 style="font-size:16px;margin:18px 0 10px">Kritik Stok (${kritik.length})</h1>` + tableCard(["Ürün", "Kalan Stok", "Kritik"], kritikRows, infoLine(kritik.length));
}
/* ============ DÜKKAN (hub) ============ */
function renderDukkan() {
  const today = store.sales.filter((s) => isToday(s.tarih));
  const nakit = today.reduce((a, s) => a + (Number(s.odeme.nakit) || 0), 0);
  const gider = store.expenses.filter((e) => isToday(e.tarih)).reduce((a, e) => a + Number(e.tutar || 0), 0);
  const gelir = store.incomes.filter((e) => isToday(e.tarih)).reduce((a, e) => a + Number(e.tutar || 0), 0);
  const tahsilat = store.payments.filter((p) => isToday(p.tarih)).reduce((a, p) => a + (Number(p.tutar) || 0), 0);
  const nakitKasa = nakit + tahsilat + gelir - gider;
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
     <div class="card"><div class="dk-kasa"><div class="dk-kbox green"><span>Nakit Kasa (bugün)</span><b>${money.format(nakitKasa)}</b></div><div class="dk-kbox"><span>Gelir</span><b>${money.format(gelir)}</b></div><div class="dk-kbox"><span>Gider</span><b>${money.format(gider)}</b></div></div><div class="dk-evrak" style="margin-top:8px"><button class="btn soft" data-goto="gelirler" type="button">＋ Gelirler</button><button class="btn soft" data-goto="giderler" type="button">＋ Giderler</button></div></div>
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
}
function salesInRange(route, def) { const f = reportFilters[route] || def; return store.sales.filter((s) => inRange(s.tarih, f.from, f.to)); }

function renderRaporGunluk() {
  const route = "rapor-gunluk", def = { from: todayStr(), to: todayStr() };
  const sales = salesInRange(route, def), f = reportFilters[route] || def;
  const sum = (fn) => sales.reduce((a, s) => a + fn(s), 0);
  const nakit = sum((s) => s.odeme.nakit), pos_ = sum((s) => s.odeme.pos), acik = sum((s) => s.odeme.acik), ciro = sum((s) => s.toplam), mal = sum((s) => s.maliyet || 0);
  const gider = store.expenses.filter((e) => inRange(e.tarih, f.from, f.to)).reduce((a, e) => a + Number(e.tutar || 0), 0);
  const gelir = store.incomes.filter((e) => inRange(e.tarih, f.from, f.to)).reduce((a, e) => a + Number(e.tutar || 0), 0);
  const tahsilat = store.payments.filter((p) => inRange(p.tarih, f.from, f.to)).reduce((a, p) => a + Number(p.tutar || 0), 0);
  const firmaOde = store.firmaPayments.filter((p) => inRange(p.tarih, f.from, f.to)).reduce((a, p) => a + Number(p.tutar || 0), 0);
  const nakitKasa = nakit + tahsilat + gelir - gider - firmaOde;
  return pageHead("Günlük Rapor", null, [{ label: "📅 Bugün Özeti", cls: "soft", act: "bugunozet" }, { label: "🖨 Yazdır", cls: "soft", act: "rprint" }]) + reportDateBar(route, def) +
    `<h2 class="rapor-satis-bas">Satışlar (${sales.length})</h2>` + raporSatisTablo(sales) +
    grid([["Nakit", money.format(nakit), "green"], ["Pos", money.format(pos_)], ["Açık Hesap", money.format(acik)], ["Toplam", money.format(ciro), "blue"]]) +
    `<div style="height:14px"></div>` +
    grid([["Alınan Ödemeler", money.format(tahsilat)], ["Firma Ödemeleri", money.format(firmaOde)], ["Giderler", money.format(gider)], ["Gelirler", money.format(gelir)]]) +
    `<div style="height:14px"></div>` +
    grid([["Nakit Kasa Raporu", money.format(nakitKasa), "green"], ["Kâr", money.format(ciro - mal), "green"], ["Ciro", money.format(ciro), "blue"], ["Ürün Maliyeti", money.format(mal)]]);
}
function renderRaporTarihsel() {
  const route = "rapor-tarihsel", def = { from: monthStartStr(), to: todayStr() };
  const sales = salesInRange(route, def);
  return pageHead("Tarihsel Rapor", null, [{ label: "📅 Bugün Özeti", cls: "soft", act: "bugunozet" }, { label: "🖨 Yazdır", cls: "soft", act: "rprint" }]) + reportDateBar(route, def) +
    `<h2 class="rapor-satis-bas">Satışlar (${sales.length})</h2>` + raporSatisTablo(sales);
}
function renderRaporUrunsel() {
  const route = "rapor-urunsel", def = { from: monthStartStr(), to: todayStr() };
  const sales = salesInRange(route, def);
  const agg = {};
  sales.forEach((s) => s.items.forEach((it) => { const pr = findProduct(it.urunId); const k = it.urunId || it.ad; if (!agg[k]) agg[k] = { ad: it.ad, barkod: pr ? pr.barkod : "", adet: 0, tutar: 0, mal: 0, stok: pr ? Number(pr.stok) || 0 : 0, alis: pr ? Number(pr.alis) || 0 : 0 }; agg[k].adet += it.adet; agg[k].tutar += it.fiyat * it.adet; agg[k].mal += (pr ? Number(pr.alis) || 0 : 0) * it.adet; }));
  const list = Object.values(agg).sort((a, b) => b.tutar - a.tutar);
  const rows = list.map((a) => { const kar = a.tutar - a.mal; return `<tr><td>${esc(a.barkod) || "-"}</td><td>${esc(a.ad)}</td><td>${num2.format(a.adet)}</td><td>${num2.format(a.stok)}</td><td>${money.format(a.alis)}</td><td>${money.format(a.adet ? a.tutar / a.adet : 0)}</td><td>${money.format(a.adet ? kar / a.adet : 0)}</td><td>${money.format(a.tutar)}</td><td class="${kar < 0 ? "borc-red" : ""}">${money.format(kar)}</td></tr>`; }).join("");
  return pageHead("Ürünsel Rapor") + reportDateBar(route, def) +
    tableCard(["Ürün Barkodu", "Ürün Adı", "Satış Miktarı", "Kalan Stok", "Ort. Birim Alış", "Ort. Birim Fiyatı", "Ort. Birim Kâr", "Toplam Tutar", "Kâr/Zarar"], rows, infoLine(list.length));
}
function renderRaporGrupsal() {
  const route = "rapor-grupsal", def = { from: monthStartStr(), to: todayStr() };
  const sales = salesInRange(route, def);
  const agg = {};
  sales.forEach((s) => s.items.forEach((it) => { const pr = findProduct(it.urunId); const g = pr ? (pr.grup || "GRUPSUZ ÜRÜN") : "GRUPSUZ ÜRÜN"; if (!agg[g]) agg[g] = { adet: 0, tutar: 0, mal: 0 }; agg[g].adet += it.adet; agg[g].tutar += it.fiyat * it.adet; agg[g].mal += (pr ? Number(pr.alis) || 0 : 0) * it.adet; }));
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
  document.querySelectorAll("[data-fode]").forEach((b) => b.addEventListener("click", () => { const f = findFirma(b.dataset.fode); const borc = firmaBorc(f.id); openModal(`Ödeme Yap — ${esc(f.ad)}`, `<p class="sub">Kalan borç: <strong>${money.format(borc)}</strong></p><div class="field"><label>Ödeme (₺) *</label><input id="fTut" type="number" step="0.01" value="${borc > 0 ? borc : ""}" /></div>`, { okLabel: "Ödemeyi Kaydet", onOk: (ov) => { const t = Number(ov.querySelector("#fTut").value); if (!t || t <= 0) { alert("Geçerli tutar."); return false; } store.firmaPayments.push({ id: genId(), firmaId: f.id, tutar: t, tarih: new Date().toISOString() }); saveStore(); render(); } }); }));
  wireTableSearch();
}

/* ============ ALIŞ FATURALARI ============ */
function renderAlisFaturalari() {
  const rows = store.purchases.sort((a, b) => b.tarih.localeCompare(a.tarih)).map((p, i) => { const f = p.firmaId && findFirma(p.firmaId); return `<tr><td>${i + 1}</td><td>Alış Faturası</td><td>${esc(p.no || "-")}</td><td>${fmtDateShort(p.tarih)}</td><td>${f ? esc(f.ad) : "-"}</td><td>${p.odeme === "veresiye" ? "Veresiye" : "Peşin"}</td><td>${p.items.reduce((a, i) => a + i.adet, 0)}</td><td>${money.format(p.toplam)}</td><td><button class="btn softred" data-delp="${p.id}">Sil</button></td></tr>`; }).join("");
  return pageHead("Alış Faturaları", store.purchases.length + " fatura", [{ label: "＋ Yeni oluştur", route: "alis-olustur" }]) +
    tableCard(["Sıra", "Fatura Tipi", "Fatura No", "Fatura Tarihi", "Firma", "Ödeme", "Toplam Ürün", "Toplam Tutar", "İşlem"], rows, infoLine(store.purchases.length));
}
function mountAlisFaturalari() {
  document.querySelectorAll("[data-delp]").forEach((b) => b.addEventListener("click", () => {
    const p = store.purchases.find((x) => x.id === b.dataset.delp);
    if (p && confirm("Fatura silinsin mi? (stok geri alınır)")) { p.items.forEach((it) => { if (it.urunId) { const pr = findProduct(it.urunId); if (pr) pr.stok = (Number(pr.stok) || 0) - it.adet; } }); store.purchases = store.purchases.filter((x) => x.id !== p.id); saveStore(); render(); }
  }));
  wireTableSearch();
}
let alisRows = [];
function renderAlisOlustur() {
  alisRows = [{ urunId: "", ad: "", adet: 1, birimFiyat: 0 }];
  const firmaOpts = `<option value="">Firmasız</option>` + store.firmalar.map((f) => `<option value="${f.id}">${esc(f.ad)}</option>`).join("");
  return pageHead("Alış Faturası Oluştur", null, [{ label: "Faturalar", cls: "soft", route: "alis-faturalari" }]) +
    `<div class="card"><div class="filters">
      <div class="field"><label>Fatura No</label><input id="aNo" placeholder="Fatura no (opsiyonel)" /></div>
      <div class="field"><label>Fatura Tarihi</label><input id="aTarih" type="date" value="${todayStr()}" /></div>
      <div class="field"><label>Firma</label><select id="aFirma">${firmaOpts}</select></div>
      <div class="field"><label>Ödeme</label><select id="aOdeme"><option value="pesin">Peşin</option><option value="veresiye">Veresiye (firma borcu)</option></select></div>
    </div></div>
    <div class="card">
      <table class="line-table" id="aTable"><thead><tr><th style="width:40%">Ürün</th><th>Miktar</th><th>Birim Fiyat (₺)</th><th>Tutar</th><th></th></tr></thead><tbody id="aBody"></tbody></table>
      <div style="margin-top:10px"><button class="btn soft" id="aAddRow" type="button">＋ Satır ekle</button> <button class="btn soft" id="aFoto" type="button">📷 Faturadan oku</button> <span id="aFotoDurum" class="hint"></span></div>
      <p class="hint">Not: Listeden ürün seçersen o ürünün stoğu artar. "Yeni ürün" seçersen faturaya yazılır ama stok tutulmaz.</p>
      <div class="totbox" style="margin-top:10px"><strong>Genel Toplam: <span id="aTotal">₺0,00</span></strong></div>
      <div style="text-align:right;margin-top:10px"><button class="btn green lg" id="aSave" type="button">💾 Alış Faturasını Kaydet</button></div>
    </div>`;
}
function alisRowHTML(r, i) {
  const opts = `<option value="">— yeni ürün —</option>` + store.products.map((p) => `<option value="${p.id}" ${r.urunId === p.id ? "selected" : ""}>${esc(p.ad)}</option>`).join("");
  return `<tr>
    <td><select data-ar="${i}" data-fld="urunId">${opts}</select>${r.urunId ? "" : `<input data-ar="${i}" data-fld="ad" placeholder="Yeni ürün adı" value="${esc(r.ad)}" style="margin-top:4px" />`}</td>
    <td><input data-ar="${i}" data-fld="adet" type="number" step="0.01" value="${r.adet}" /></td>
    <td><input data-ar="${i}" data-fld="birimFiyat" type="number" step="0.01" value="${r.birimFiyat}" /></td>
    <td>${money.format((Number(r.adet) || 0) * (Number(r.birimFiyat) || 0))}</td>
    <td><button class="rm" data-armv="${i}" type="button">✕</button></td>
  </tr>`;
}
function alisRefresh() {
  document.getElementById("aBody").innerHTML = alisRows.map(alisRowHTML).join("");
  document.getElementById("aTotal").textContent = money.format(alisRows.reduce((s, r) => s + (Number(r.adet) || 0) * (Number(r.birimFiyat) || 0), 0));
  document.querySelectorAll("[data-ar]").forEach((el) => el.addEventListener("input", () => { const i = Number(el.dataset.ar), fld = el.dataset.fld; alisRows[i][fld] = el.value; if (fld === "urunId") { const pr = findProduct(el.value); if (pr && !Number(alisRows[i].birimFiyat)) alisRows[i].birimFiyat = pr.alis || 0; alisRefresh(); } if (fld === "adet" || fld === "birimFiyat") alisRefresh(); }));
  document.querySelectorAll("[data-armv]").forEach((b) => b.addEventListener("click", () => { alisRows.splice(Number(b.dataset.armv), 1); if (!alisRows.length) alisRows.push({ urunId: "", ad: "", adet: 1, birimFiyat: 0 }); alisRefresh(); }));
}
/* ---- Fotoğraftan fatura okuma (AI Vision, Supabase Edge Function) ---- */
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
function ocrPickImage(cb) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment");
  inp.style.display = "none"; document.body.appendChild(inp);
  inp.addEventListener("change", () => {
    const f = inp.files && inp.files[0];
    document.body.removeChild(inp);
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { const s = String(r.result), c = s.indexOf(","); const h = s.slice(0, c); const mt = (h.match(/data:([^;]+)/) || [])[1] || "image/jpeg"; cb(s.slice(c + 1), mt); };
    r.readAsDataURL(f);
  });
  inp.click();
}
// Vergi levhası fotoğrafı → OCR → müşteri formu alanlarını doldur (formModal içinden)
async function vergiLevhasiOku(ov, key) {
  const durum = ov.querySelector("#fotoDurum-" + key);
  if (!SB || !SB.functions) { if (durum) durum.textContent = "Bulut bağlantısı yok."; return; }
  ocrPickImage(async (imageBase64, mediaType) => {
    if (durum) durum.textContent = "Vergi levhası okunuyor…";
    let res;
    try {
      const { data, error } = await SB.functions.invoke("ocr-extract", { body: { mode: "vergi", imageBase64, mediaType } });
      res = error ? null : data;
    } catch (e) { res = null; }
    if (!res || !res.ok || !res.data) { if (durum) durum.textContent = "Okunamadı (internet/kurulum). Elle gir."; return; }
    const d = res.data, set = (k, v) => { if (v == null || v === "") return; const el = ov.querySelector(`[data-k="${k}"]`); if (el && !el.value) el.value = v; };
    const setForce = (k, v) => { if (v == null || v === "") return; const el = ov.querySelector(`[data-k="${k}"]`); if (el) el.value = v; };
    setForce("ad", d.unvan); setForce("vergiNo", d.vergiNo); setForce("vergiDairesi", d.vergiDairesi);
    setForce("adres", d.adres); set("bolge", d.il); set("mahalle", d.ilce);
    if (durum) durum.textContent = "✓ Dolduruldu — kontrol edip Kaydet'e bas.";
  });
}
async function alisFotoOku() {
  const durum = document.getElementById("aFotoDurum");
  ocrPickImage(async (imageBase64, mediaType) => {
    if (durum) durum.textContent = "Okunuyor…";
    let res;
    try {
      const { data, error } = await SB.functions.invoke("ocr-extract", {
        body: { mode: "fatura", imageBase64, mediaType, catalog: store.products.map((p) => p.ad) },
      });
      res = error ? null : data;
    } catch (e) { res = null; }
    if (!res || !res.ok || !res.data) { if (durum) durum.textContent = "Okunamadı — internet/kurulum gerekli. Elle girebilirsin."; return; }
    const d = res.data;
    if (d.no) { const el = document.getElementById("aNo"); if (el) el.value = d.no; }
    if (d.tarih) { const t = new Date(d.tarih); if (!isNaN(t)) { const el = document.getElementById("aTarih"); if (el) el.value = t.toISOString().slice(0, 10); } }
    if (d.firma) { const fid = ocrMatch(d.firma, store.firmalar, "ad"); const el = document.getElementById("aFirma"); if (fid && el) el.value = fid; }
    if (Array.isArray(d.lines) && d.lines.length) {
      alisRows = d.lines.map((l) => { const pid = ocrMatch(l.ad, store.products, "ad"); return { urunId: pid, ad: pid ? "" : (l.ad || ""), adet: Number(l.adet) || 1, birimFiyat: Number(l.birimFiyat) || 0 }; });
      alisRefresh();
    }
    if (durum) durum.textContent = "Okundu — kontrol edip Kaydet'e bas.";
  });
}
/* Satış ekranı — fotoğraftan fiş okuyup sepete ürün ekle (mode: masa) */
async function satisFotoOku() {
  ocrPickImage(async (imageBase64, mediaType) => {
    let res;
    try {
      const { data, error } = await SB.functions.invoke("ocr-extract", {
        body: { mode: "masa", imageBase64, mediaType, catalog: store.products.map((p) => p.ad) },
      });
      res = error ? null : data;
    } catch (e) { res = null; }
    if (!res || !res.ok || !res.data || !Array.isArray(res.data.lines)) { alert("Okunamadı — internet/kurulum gerekli. Elle ekleyebilirsin."); return; }
    let eklendi = 0, atlandi = 0;
    res.data.lines.forEach((l) => {
      const pid = ocrMatch(l.name, store.products, "ad");
      if (!pid) { atlandi++; return; }
      const q = Math.max(1, Math.round(Number(l.qty) || 1));
      for (let k = 0; k < q; k++) addToCart(pid);
      eklendi++;
    });
    render();
    alert(eklendi + " ürün sepete eklendi" + (atlandi ? ", " + atlandi + " ürün eşleşmedi (elle ekle)" : "") + ".");
  });
}
function mountAlisOlustur() {
  alisRefresh();
  document.getElementById("aAddRow").addEventListener("click", () => { alisRows.push({ urunId: "", ad: "", adet: 1, birimFiyat: 0 }); alisRefresh(); });
  const foto = document.getElementById("aFoto");
  if (foto) foto.addEventListener("click", alisFotoOku);
  document.getElementById("aSave").addEventListener("click", () => {
    const items = alisRows.filter((r) => (r.urunId || (r.ad || "").trim()) && Number(r.adet) > 0).map((r) => ({ urunId: r.urunId || null, ad: r.urunId ? (findProduct(r.urunId) || {}).ad : (r.ad || "").trim(), adet: Number(r.adet), birimFiyat: Number(r.birimFiyat) || 0 }));
    if (!items.length) { alert("En az bir ürün satırı girin."); return; }
    const toplam = items.reduce((s, r) => s + r.adet * r.birimFiyat, 0);
    const odeme = document.getElementById("aOdeme").value;
    const firmaId = document.getElementById("aFirma").value || null;
    const tarih = document.getElementById("aTarih").value ? new Date(document.getElementById("aTarih").value).toISOString() : new Date().toISOString();
    store.counters.purchase = (store.counters.purchase || 0) + 1;
    store.purchases.push({ id: genId(), no: document.getElementById("aNo").value.trim() || "A" + store.counters.purchase, firmaId, items, toplam, odeme, borc: odeme === "veresiye" ? toplam : 0, tarih });
    items.forEach((it) => { if (it.urunId) { const pr = findProduct(it.urunId); if (pr) { pr.stok = (Number(pr.stok) || 0) + it.adet; if (it.birimFiyat) pr.alis = it.birimFiyat; } } });
    saveStore(); alert("Alış faturası kaydedildi ✔"); navigate("alis-faturalari");
  });
}

/* ============ STOK SAYIMI ============ */
function renderStokSayimi() {
  const rows = store.stokSayimlari.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.kod)}</td><td>${esc(s.ad || "-")}</td><td>${s.durum === "acik" ? '<span class="badge">Açık</span>' : '<span style="color:var(--green-d)">✔ Tamamlandı</span>'}</td><td>${fmtDateShort(s.tarih)}</td><td>${s.items ? s.items.length : 0}</td><td><div class="act-btns"><button class="edit" data-sayim="${s.id}">${s.durum === "acik" ? "Devam Et" : "Görüntüle"}</button><button class="del" data-delsayim="${s.id}">Sil</button></div></td></tr>`).join("");
  return pageHead("Stok Sayımları", store.stokSayimlari.length + " stok sayımı", [{ label: "＋ Yeni stok sayımı başlat", act: "yenisayim" }]) +
    tableCard(["Sıra", "Sayım Kodu", "Sayım Adı", "Durum", "Tarih", "Ürün", "Detay"], rows, infoLine(store.stokSayimlari.length));
}
function mountStokSayimi() {
  const y = document.querySelector('[data-act="yenisayim"]');
  if (y) y.addEventListener("click", () => { store.counters.sayim = (store.counters.sayim || 0) + 1; const s = { id: genId(), kod: "STC" + String(store.counters.sayim).padStart(6, "0"), ad: "Sayım " + store.counters.sayim, durum: "acik", items: store.products.map((p) => ({ urunId: p.id, sistem: Number(p.stok) || 0, sayilan: "" })), tarih: new Date().toISOString() }; store.stokSayimlari.push(s); saveStore(); activeSayimId = s.id; navigate("stok-sayimi-detay"); });
  document.querySelectorAll("[data-sayim]").forEach((b) => b.addEventListener("click", () => { activeSayimId = b.dataset.sayim; navigate("stok-sayimi-detay"); }));
  document.querySelectorAll("[data-delsayim]").forEach((b) => b.addEventListener("click", () => { if (confirm("Sayım silinsin mi?")) { store.stokSayimlari = store.stokSayimlari.filter((x) => x.id !== b.dataset.delsayim); saveStore(); render(); } }));
  wireTableSearch();
}
let activeSayimId = null;
function renderStokSayimiDetay() {
  const s = store.stokSayimlari.find((x) => x.id === activeSayimId);
  if (!s) return pageHead("Stok Sayımı") + `<div class="card"><p class="sub">Sayım bulunamadı.</p></div>`;
  const rows = s.items.map((it, i) => { const pr = findProduct(it.urunId); const fark = it.sayilan === "" ? "" : Number(it.sayilan) - it.sistem; return `<tr><td>${i + 1}</td><td>${pr ? esc(pr.ad) : "?"}</td><td>${num2.format(it.sistem)}</td><td>${s.durum === "acik" ? `<input type="number" step="0.01" data-say="${i}" value="${it.sayilan}" style="width:90px;border:1px solid var(--line);border-radius:4px;padding:4px" />` : num2.format(Number(it.sayilan) || 0)}</td><td class="${fark < 0 ? "borc-red" : ""}">${fark === "" ? "-" : num2.format(fark)}</td></tr>`; }).join("");
  const actions = s.durum === "acik" ? [{ label: "✔ Sayımı Tamamla (stok güncelle)", cls: "green", act: "tamamla" }, { label: "Vazgeç", cls: "soft", route: "stok-sayimi" }] : [{ label: "Geri", cls: "soft", route: "stok-sayimi" }];
  return pageHead("Stok Sayımı — " + esc(s.kod), s.durum === "acik" ? "Sayılan miktarları girin" : "Tamamlandı", actions) +
    tableCard(["Sıra", "Ürün", "Sistem Stok", "Sayılan", "Fark"], rows, infoLine(s.items.length));
}
function mountStokSayimiDetay() {
  const s = store.stokSayimlari.find((x) => x.id === activeSayimId); if (!s) return;
  document.querySelectorAll("[data-say]").forEach((el) => el.addEventListener("input", () => { s.items[Number(el.dataset.say)].sayilan = el.value; saveStore(); }));
  const t = document.querySelector('[data-act="tamamla"]');
  if (t) t.addEventListener("click", () => { if (!confirm("Sayılan miktarlar stok olarak yazılsın mı? (boş bırakılanlar değişmez)")) return; s.items.forEach((it) => { if (it.sayilan !== "" && it.sayilan != null) { const pr = findProduct(it.urunId); if (pr) { const eski = Number(pr.stok) || 0; const yeni = Number(it.sayilan); if (yeni !== eski) store.stokHareket.push({ id: genId(), ad: pr.ad, urunId: pr.id, miktar: yeni - eski, tur: "Sayım Düzeltme", tarih: new Date().toISOString() }); pr.stok = yeni; } } }); s.durum = "kapali"; saveStore(); navigate("stok-sayimi"); });
}

/* ============ İADE ============ */
function renderUrunIade() {
  return pageHead("Ürün İadesi Al") +
    `<div class="card"><div class="filters">
      <div class="field" style="flex:1"><label>Ürün</label><select id="iUrun"><option value="">Ürün seçin</option>${store.products.map((p) => `<option value="${p.id}">${esc(p.ad)}</option>`).join("")}</select></div>
      <div class="field"><label>Miktar</label><input id="iAdet" type="number" step="0.01" value="1" /></div>
      <div class="field" style="flex:1"><label>Müşteri (opsiyonel)</label><select id="iMus"><option value="">—</option>${store.customers.map((c) => `<option value="${c.id}">${esc(c.ad)}</option>`).join("")}</select></div>
      <div class="field"><label>&nbsp;</label><button class="btn green" id="iSave" type="button">İadeyi Al (stok +)</button></div>
    </div><p class="hint">İade alınan ürünün stoğu artar. Müşteri seçilirse iade tutarı borcundan düşülür.</p></div>` +
    tableCard(["Ürün", "Miktar", "Tutar", "Müşteri", "Tarih"], store.iadeler.slice().reverse().map((r) => { const c = r.musteriId && findCustomer(r.musteriId); return `<tr><td>${esc(r.ad)}</td><td>${num2.format(r.adet)}</td><td>${money.format(r.tutar)}</td><td>${c ? esc(c.ad) : "-"}</td><td>${fmtDate(r.tarih)}</td></tr>`; }).join(""), infoLine(store.iadeler.length));
}
function mountUrunIade() {
  document.getElementById("iSave").addEventListener("click", () => {
    const pid = document.getElementById("iUrun").value; const adet = Number(document.getElementById("iAdet").value); const mus = document.getElementById("iMus").value || null;
    if (!pid || !adet || adet <= 0) { alert("Ürün ve miktar girin."); return; }
    const pr = findProduct(pid); const tutar = (Number(pr.satis) || 0) * adet;
    pr.stok = (Number(pr.stok) || 0) + adet;
    store.iadeler.push({ id: genId(), urunId: pid, ad: pr.ad, adet, tutar, musteriId: mus, tarih: new Date().toISOString() });
    if (mus) store.payments.push({ id: genId(), musteriId: mus, tutar, not: "Ürün iadesi: " + pr.ad, tarih: new Date().toISOString() });
    saveStore(); alert("İade alındı ✔"); render();
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
    row: (it, i) => [i + 1, esc(it.tur || "-"), esc(it.not || "-"), money.format(Number(it.tutar) || 0), esc(it.odeme || "Nakit"), fmtDate(it.tarih)],
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
const SB = (typeof window !== "undefined" && window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })
  : null;

/** Supabase'den siparişleri çek; yeni olanları gelenSiparisler'e ekle. orderId ile mükerrer engeli. */
async function cayPullSupabase() {
  if (!SB) return;
  try {
    const { data, error } = await SB.from("siparisler").select("*").eq("toptanci", "babuco").order("created_at");
    if (error || !data) return;
    let degisti = false;
    for (const row of data) {
      if (store.gelenSiparisler.some((o) => o.orderId === row.id)) continue; // zaten alınmış
      const order = row.payload || {};
      const lines = Array.isArray(order.lines) ? order.lines : [];
      const items = lines.map((l) => ({ ad: l.name, birim: l.birim, adet: Number(l.qty) || 0, fiyat: Number(l.unitPrice) || 0 }));
      const toplam = items.reduce((n, l) => n + l.adet * l.fiyat, 0);
      store.gelenSiparisler.push({
        id: genId(), orderId: row.id,
        dealer: row.cay_ocagi || (order.from && order.from.name) || "Bilinmeyen bayi",
        dealerTel: row.cay_tel || (order.from && order.from.phone) || "",
        not: order.note || "", tarih: order.date || row.created_at || new Date().toISOString(),
        alindi: new Date().toISOString(), durum: "yeni", items, toplam,
        teklifNo: "", fisNo: "", teslimTarih: "", teslimSaat: "", saleId: "",
      });
      degisti = true;
    }
    if (degisti) { saveStore(); render(); }
  } catch (e) { /* çevrimdışı / ağ hatası: sessiz, panel yerelle çalışır */ }
}

/** Bir siparişin durumunu buluta geri yaz — çay ocağı "Onaylandı/Hazırlanıyor/Teslim" görsün. */
async function cayDurumBulut(o) {
  if (!SB || !o || !o.orderId) return;
  try { await SB.from("siparisler").update({ durum: o.durum, updated_at: new Date().toISOString() }).eq("id", o.orderId); }
  catch (e) { /* sessiz */ }
}

/* ---- Bulut yedek: tüm store'u Supabase kv tablosuna yedekle (çevrimdışı çalışır, gelince senkron) ---- */
/* Çay ocağı uygulamasıyla aynı kv tablosu; farklı anahtar (babuco:store). Son-yazan-kazanır. */
const BULUT_KEY = "babuco:store";
let _bulutHazir = false;      // ilk çekme bitene kadar buluta YAZMA (boş store gerçek yedeği ezmesin)
let _yazZamanlayici = null;

async function kvGet(key) {
  if (!SB) return null;
  try {
    const { data, error } = await SB.from("kv").select("value, updated_at").eq("key", key).maybeSingle();
    if (error || !data) return null;
    return { value: data.value, updatedAt: data.updated_at };
  } catch (e) { return null; }
}
async function kvSet(key, value, updatedAt) {
  if (!SB) return false;
  try { const { error } = await SB.from("kv").upsert({ key, value, updated_at: updatedAt }); return !error; }
  catch (e) { return false; }
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

/** Store değişince buluta yaz (1sn debounce). Yedek hazır olmadan yazmaz. */
function bulutaYaz() {
  if (!SB || !_bulutHazir) return;
  clearTimeout(_yazZamanlayici);
  _yazZamanlayici = setTimeout(() => {
    const ts = new Date().toISOString();
    localStorage.setItem(BULUT_KEY + ":ts", ts);
    kvSet(BULUT_KEY, store, ts);
  }, 1000);
}

/** Açılışta: buluttan çek. Bulut daha yeniyse benimse; yerel daha yeniyse buluta it. */
async function bulutHydrate() {
  if (!SB) { _bulutHazir = true; kategoriGocKontrol(); return; }
  const localTs = localStorage.getItem(BULUT_KEY + ":ts") || "";
  const cloud = await kvGet(BULUT_KEY);
  if (cloud && cloud.value && (!localTs || cloud.updatedAt > localTs)) {
    store = bulutStoreBirlestir(cloud.value);
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    localStorage.setItem(BULUT_KEY + ":ts", cloud.updatedAt);
    render();
  } else if (!cloud || (localTs && localTs > cloud.updatedAt)) {
    const ts = localTs || new Date().toISOString();
    localStorage.setItem(BULUT_KEY + ":ts", ts);
    kvSet(BULUT_KEY, store, ts);
  }
  _bulutHazir = true;
  kategoriGocKontrol();
}

/* ---- İnternet kapısı: bağlantı yoksa tüm paneli kapatan tam ekran örtü ---- */
async function sbPing() {
  if (!SB) return false;
  try { const { error } = await SB.from("kv").select("key").limit(1); return !error; }
  catch (e) { return false; }
}
function internetOverlay(goster) {
  let el = document.getElementById("net-kapi");
  if (goster && !el) {
    el = document.createElement("div");
    el.id = "net-kapi";
    el.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#0f1115;color:#e8e8ea;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px";
    el.innerHTML = '<div style="font-size:48px">📡</div><div style="font-weight:700;font-size:20px">İnternet bağlantısı gerekli</div><div style="opacity:.75;max-width:320px">Panel verileri buluttan çalışır. Bağlantı gelince otomatik açılır.</div>';
    document.body.appendChild(el);
  } else if (!goster && el) { el.remove(); }
}
async function internetKontrol() {
  const online = (navigator.onLine !== false) && await sbPing();
  internetOverlay(!online);
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
function cayTeslim(o, odemeTuru) {
  if (o.saleId) { alert("Bu sipariş zaten teslim edilip rapora işlendi."); return; }
  odemeTuru = odemeTuru || "bakiye";
  // Bayiyi müşteri olarak eşle/oluştur (cari borç). Önce TELEFON (kararlı), sonra isim.
  const dtel = (o.dealerTel || "").replace(/\D/g, "");
  let cust = (dtel && store.customers.find((c) => (c.telefon || "").replace(/\D/g, "") === dtel))
    || store.customers.find((c) => c.ad.trim().toLowerCase() === o.dealer.trim().toLowerCase());
  if (!cust) { cust = { id: genId(), ad: o.dealer, telefon: o.dealerTel || "", acilis: 0, adres: "", vergiNo: "" }; store.customers.push(cust); }
  // Çay ocağı bayisi işareti + telefon garanti (puan telefonla eşleşir).
  cust.cayOcagi = true;
  if (!cust.telefon && o.dealerTel) cust.telefon = o.dealerTel;
  const items = o.items.map((l) => {
    const pr = store.products.find((p) => p.ad.trim().toLowerCase() === (l.ad || "").trim().toLowerCase());
    return { urunId: pr ? pr.id : "", ad: l.ad, barkod: pr ? pr.barkod || "" : "", kdv: pr ? Number(pr.kdv) || 0 : 0, fiyat: Number(l.fiyat) || 0, adet: Number(l.adet) || 0, iskyuzde: 0 };
  });
  const toplam = items.reduce((s, i) => s + i.fiyat * i.adet, 0);
  const maliyet = items.reduce((s, i) => { const pr = findProduct(i.urunId); return s + (pr ? Number(pr.alis) || 0 : 0) * i.adet; }, 0);
  store.counters.sale = (store.counters.sale || 0) + 1;
  const belgeNo = new Date().getFullYear() + "-" + String(store.counters.sale).padStart(6, "0");
  // Ödeme türüne göre: nakit → nakit, kart → pos, bakiye → açık hesap (müşteri cari borcuna yazılır).
  const odeme = odemeTuru === "nakit" ? { nakit: toplam, pos: 0, acik: 0 }
    : odemeTuru === "kart" ? { nakit: 0, pos: toplam, acik: 0 }
    : { nakit: 0, pos: 0, acik: toplam };
  const odemeAdi = odemeTuru === "nakit" ? "Nakit" : odemeTuru === "kart" ? "Kart" : "Açık Hesap";
  const sale = { id: genId(), belgeNo, musteriId: cust.id, personelId: null, not: "Çay Ocağı siparişi · " + o.dealer, odemeAdi, items, brut: toplam, iskonto: 0, toplam, maliyet, odeme, tarih: new Date().toISOString() };
  store.sales.push(sale);
  items.forEach((i) => { const pr = findProduct(i.urunId); if (pr) pr.stok = (Number(pr.stok) || 0) - i.adet; });
  o.durum = "teslim"; o.saleId = sale.id; o.odemeTuru = odemeTuru;
  saveStore(); render(); cayDurumBulut(o);
  const son = odemeTuru === "bakiye" ? "Bayinin açık hesabına yazıldı: " + o.dealer : odemeAdi + " olarak tahsil edildi";
  alert("Teslim edildi ✔ Satış raporlara işlendi (Belge " + belgeNo + ").\n" + son + ".");
}
/* Teslim ödeme seçimi — nakit / kart / bakiye (açık hesap) */
function cayTeslimOde(o) {
  if (o.saleId) { alert("Bu sipariş zaten teslim edilip rapora işlendi."); return; }
  const body = `<p class="sub" style="margin:0 0 12px">Ödeme türünü seç. <b>Bakiye</b> seçilirse tutar bayinin açık hesabına (cari borç) yazılır.</p>
    <div class="cay-ode-tut">Tutar <b>${money.format(o.toplam)}</b></div>
    <div class="cay-ode-sec">
      <button class="btn cay-ode" type="button" data-ode="nakit">💵 Nakit</button>
      <button class="btn cay-ode" type="button" data-ode="kart">💳 Kart</button>
      <button class="btn cay-ode cay-ode-bakiye" type="button" data-ode="bakiye">📒 Bakiye (Açık Hesap)</button>
    </div>`;
  const m = openModal("Teslim — Ödeme", body, { noFoot: true, onMount: (ov) => {
    ov.querySelectorAll("[data-ode]").forEach((b) => b.addEventListener("click", () => { const tur = b.dataset.ode; m.close(); cayTeslim(o, tur); }));
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
    <table><tr><td><b>TOPLAM</b></td><td class="r"><b>${money.format(o.toplam)}</b></td></tr></table><hr>
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
    <div class="cay-utoplam"><span>TOPLAM</span><span>${money.format(o.toplam)}</span></div>
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
  btns.push(`<button class="del" type="button" data-m-del>Sil</button>`);
  const tesl = o.teslimTarih ? `<div class="cay-sub">🚚 Teslim: ${esc(o.teslimTarih)} ${esc(o.teslimSaat || "")}</div>` : "";
  const body = `
    <div class="cay-modal-meta">
      <div><span>Bayi</span><b>${esc(o.dealer)}</b></div>
      ${o.dealerTel ? `<div><span>Telefon</span><b>${esc(o.dealerTel)}</b></div>` : ""}
      <div><span>Durum</span><b><span class="cay-badge ${a.badge}">${esc(a.ad)}</span></b></div>
    </div>
    <div class="cay-ulist">${rows}</div>
    <div class="cay-utoplam"><span>TOPLAM</span><span>${money.format(o.toplam)}</span></div>
    ${o.not ? `<div class="cay-unot">Not: ${esc(o.not)}</div>` : ""}
    ${tesl}
    <div class="cay-modal-act">${btns.join("")}</div>`;
  const m = openModal(`${esc(o.dealer)} — Sipariş`, body, { noFoot: true, onMount: (ov) => {
    const on = (sel, fn) => { const b = ov.querySelector(sel); if (b) b.addEventListener("click", fn); };
    on("[data-m-onayla]", () => { m.close(); cayOnayla(o); });
    on("[data-m-dagitim]", () => { m.close(); cayDagitim(o); });
    on("[data-m-teklif]", () => cayDoc(o, "Teklif"));
    on("[data-m-fis]", () => cayDoc(o, "Fiş"));
    on("[data-m-gonder]", () => cayGonder(o));
    on("[data-m-teslim]", () => { m.close(); cayTeslimOde(o); });
    on("[data-m-del]", () => { if (confirm("Sipariş silinsin mi?")) { m.close(); store.gelenSiparisler = store.gelenSiparisler.filter((x) => x.id !== o.id); saveStore(); render(); } });
  } });
}
function renderCayOcagi() {
  const rows = store.gelenSiparisler.slice().reverse().map(caySiparisListRow).join("");
  const yeni = store.gelenSiparisler.filter((o) => o.durum === "yeni").length;
  return pageHead("Çay Ocağı Siparişleri", (store.gelenSiparisler.length + " sipariş") + (yeni ? ` · ${yeni} yeni` : ""), [
    { label: "📥 Kod Yapıştır", act: "cayKod" },
    { label: "📂 Dosyadan Al", cls: "soft", act: "cayDosya" },
  ]) + `<div class="cay-wrap">
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
  "saha-kocu": { render: renderSahaKocu, mount: mountSahaKocu },
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

  gelirler: { render: () => gelirGiderPage("incomes", "Gelirler", "Gelir"), mount: () => mountCrud({ key: "incomes", stamp: true, fields: [{ key: "tur", label: "Gelir Türü", req: true }, { key: "not", label: "Not" }, { key: "tutar", label: "Tutar (₺)", type: "number", step: "0.01", req: true }, { key: "odeme", label: "Ödeme Tipi", type: "select", options: ["Nakit", "POS", "Havale"] }] }) },
  giderler: { render: () => gelirGiderPage("expenses", "Giderler", "Gider"), mount: () => mountCrud({ key: "expenses", stamp: true, fields: [{ key: "tur", label: "Gider Türü", req: true }, { key: "not", label: "Not" }, { key: "tutar", label: "Tutar (₺)", type: "number", step: "0.01", req: true }, { key: "odeme", label: "Ödeme Tipi", type: "select", options: ["Nakit", "POS", "Havale"] }] }) },

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

/* ============ SAHA KOÇU (Görüşme Analizi) ============ */
function sesDosyaSec(cb) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "audio/*"; inp.setAttribute("capture", "microphone");
  inp.style.display = "none"; document.body.appendChild(inp);
  inp.addEventListener("change", () => {
    const f = inp.files && inp.files[0]; document.body.removeChild(inp);
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { const s = String(r.result), c = s.indexOf(","); const h = s.slice(0, c); const mt = (h.match(/data:([^;]+)/) || [])[1] || "audio/webm"; cb(s.slice(c + 1), mt); };
    r.readAsDataURL(f);
  });
  inp.click();
}
function kocKartHTML(a) {
  if (!a) return "";
  const list = (arr) => (arr && arr.length) ? `<ul class="koc-list">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="hint">—</p>`;
  const puan = Math.max(0, Math.min(100, Math.round(Number(a.puan) || 0)));
  const renk = puan >= 70 ? "iyi" : puan >= 45 ? "orta" : "dusuk";
  const itir = (a.itirazlar && a.itirazlar.length)
    ? `<ul class="koc-list">${a.itirazlar.map((i) => `<li><b>${esc(i.itiraz)}</b><br><span class="hint">→ ${esc(i.karsilanma)}</span></li>`).join("")}</ul>`
    : `<p class="hint">Belirgin itiraz yok.</p>`;
  return `<div class="koc-kart">
    <div class="koc-head">
      <div class="koc-puan ${renk}">${puan}<span>/100</span></div>
      <div class="koc-ozet">${esc(a.ozet || "")}</div>
    </div>
    <div class="koc-blok koc-iyi"><h3>✓ İyi yapılanlar</h3>${list(a.iyi)}</div>
    <div class="koc-blok koc-eksik"><h3>✗ Kaçırılanlar</h3>${list(a.eksik)}</div>
    <div class="koc-blok"><h3>💬 İtirazlar & karşılanma</h3>${itir}</div>
    <div class="koc-blok"><h3>🎯 Kaçan fırsatlar</h3>${list(a.firsatlar)}</div>
    <div class="koc-blok koc-oneri"><h3>💡 Öneriler ("şöyle deseydin")</h3>${list(a.oneriler)}</div>
  </div>`;
}
function renderSahaKocu() {
  const gec = [...(store.gorusmeler || [])].reverse().slice(0, 20);
  const musOpts = `<option value="">Müşteri seç (ops.)</option>` + store.customers.map((m) => `<option value="${m.id}">${esc(m.ad)}</option>`).join("");
  const persOpts = store.personeller.length ? `<select id="skPers"><option value="">Plasiyer seç (ops.)</option>${store.personeller.map((p) => `<option value="${p.id}">${esc(p.ad)}</option>`).join("")}</select>` : "";
  const gecRows = gec.length ? gec.map((g) => {
    const c = g.musteriId && findCustomer(g.musteriId);
    const p = Math.round(Number(g.analiz && g.analiz.puan) || 0);
    const renk = p >= 70 ? "iyi" : p >= 45 ? "orta" : "dusuk";
    return `<div class="koc-gec" data-gec="${g.id}"><span class="koc-gpuan ${renk}">${p}</span><div class="koc-gmid"><b>${c ? esc(c.ad) : "Görüşme"}</b><span class="hint">${fmtDate(g.tarih)}</span></div><button class="rm" data-gecdel="${g.id}" type="button">✕</button></div>`;
  }).join("") : `<p class="hint">Henüz görüşme analizi yok.</p>`;
  return pageHead("Saha Koçu", "Görüşme kaydını yükle → yapay zeka satışını analiz etsin") +
    `<div class="card">
      <div class="koc-kvkk">
        <label><input type="checkbox" id="skOnay" /> <b>Müşteriye kayıt alındığı bildirildi ve onay verildi.</b> (KVKK — zorunlu)</label>
      </div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label>Müşteri</label><select id="skMus">${musOpts}</select></div>
        ${persOpts ? `<div class="field"><label>Plasiyer</label>${persOpts}</div>` : ""}
      </div>
      <div style="margin-top:14px;text-align:center">
        <button class="btn green lg" id="skSes" type="button" disabled>🎧 Ses Kaydını Yükle & Analiz Et</button>
        <p class="hint" id="skDurum" style="margin-top:10px">Telefonun ses kayıt uygulamasıyla görüşmeyi kaydet, sonra buradan yükle. (En fazla ~15 dk.)</p>
      </div>
      <div id="skSonuc" style="margin-top:12px"></div>
    </div>
    <div class="section-title" style="margin-top:16px">Geçmiş Görüşmeler</div>
    <div class="card">${gecRows}</div>`;
}
function mountSahaKocu() {
  const onay = document.getElementById("skOnay"), btn = document.getElementById("skSes"), durum = document.getElementById("skDurum"), sonuc = document.getElementById("skSonuc");
  if (onay) onay.addEventListener("change", () => { btn.disabled = !onay.checked; });
  if (btn) btn.addEventListener("click", () => {
    if (!onay.checked) { alert("Önce KVKK onayını işaretle."); return; }
    sesDosyaSec(async (audioBase64, mediaType) => {
      durum.textContent = "Yükleniyor ve analiz ediliyor… (birkaç dakika sürebilir)"; btn.disabled = true;
      let res;
      try {
        const { data, error } = await SB.functions.invoke("ses-analiz", { body: { audioBase64, mediaType } });
        res = error ? null : data;
      } catch (e) { res = null; }
      btn.disabled = false;
      if (!res || !res.ok) { durum.textContent = "Analiz edilemedi — internet/kurulum (OpenAI anahtarı) gerekli. Hata: " + ((res && res.error) || "bağlantı"); return; }
      durum.textContent = "Analiz hazır ✔";
      sonuc.innerHTML = kocKartHTML(res.analiz);
      const g = { id: genId(), tarih: new Date().toISOString(), musteriId: document.getElementById("skMus").value || null, plasiyerId: (document.getElementById("skPers") || {}).value || null, transcript: res.transcript || "", analiz: res.analiz };
      store.gorusmeler = store.gorusmeler || []; store.gorusmeler.push(g);
      saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
    });
  });
  document.querySelectorAll("[data-gec]").forEach((el) => el.addEventListener("click", (e) => {
    if (e.target.closest("[data-gecdel]")) return;
    const g = (store.gorusmeler || []).find((x) => x.id === el.dataset.gec);
    if (g) { document.getElementById("skSonuc").innerHTML = kocKartHTML(g.analiz); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }));
  document.querySelectorAll("[data-gecdel]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm("Bu görüşme analizi silinsin mi?")) return;
    store.gorusmeler = (store.gorusmeler || []).filter((x) => x.id !== b.dataset.gecdel);
    saveStore(); if (typeof bulutaYaz === "function") bulutaYaz(); render();
  }));
}

/* ============ ROTA / SAHA SATIŞ ============ */
const rota = { konum: null, kayit: null, kayitTimer: null };
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
  if (tah > 0 && c) { store.payments.push({ id: genId(), musteriId: id, tutar: tah, not: "Saha tahsilat (" + tahTip + ")", tarih: new Date().toISOString() }); if (typeof bayiPuanEkle === "function") bayiPuanEkle(c, tah); }
  const iadeUrun = (document.getElementById("kpIadeUrun") || {}).value;
  const iadeAdet = Number((document.getElementById("kpIadeAdet") || {}).value) || 0;
  let iadeTutar = 0;
  if (iadeUrun && iadeAdet > 0) { const pr = findProduct(iadeUrun); if (pr) { iadeTutar = (Number(pr.satis) || 0) * iadeAdet; store.iadeler.push({ id: genId(), urunId: pr.id, ad: pr.ad, adet: iadeAdet, tutar: iadeTutar, musteriId: id, tarih: new Date().toISOString() }); stokEkle(pr.id, iadeAdet); if (id) store.payments.push({ id: genId(), musteriId: id, tutar: iadeTutar, not: "Ürün iadesi: " + pr.ad, tarih: new Date().toISOString() }); } }
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
    <div class="rk"><span>Giderler</span><b>${money.format(r.gider)}</b></div>
    <div class="rk"><span>Nakit</span><b>${money.format(r.nakit)}</b></div>
    <div class="rk"><span>Pos</span><b>${money.format(r.pos)}</b></div>
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
function servisBitir() {
  const gun = localDateStr(new Date());
  const zys = store.ziyaretler.filter((z) => z.servisGun === gun);
  const satlar = store.sales.filter((s) => s.servisGun === gun); // servis + ekstra satışlar
  const ciro = satlar.reduce((a, s) => a + (Number(s.toplam) || 0), 0);
  const maliyet = satlar.reduce((a, s) => a + (Number(s.maliyet) || 0), 0);
  const nakit = satlar.reduce((a, s) => a + (Number(s.odeme.nakit) || 0), 0) + zys.reduce((a, z) => a + (Number(z.tahsilat) || 0), 0);
  const pos = satlar.reduce((a, s) => a + (Number(s.odeme.pos) || 0), 0);
  const bakiye = satlar.reduce((a, s) => a + (Number(s.odeme.acik) || 0), 0);
  const komisyon = satlar.reduce((a, s) => a + (Number(s.komisyon) || 0), 0);
  const gider = store.expenses.filter((e) => isToday(e.tarih)).reduce((a, e) => a + Number(e.tutar || 0), 0);
  const kar = ciro - maliyet - komisyon;
  const rapor = { ziyaret: zys.length, ciro, maliyet, kar, karYuzde: ciro > 0 ? (kar / ciro * 100) : 0, gider, nakit, pos, bakiye, km: (servis.km || 0) / 1000 };
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
function blobToBase64(blob) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => { const s = String(r.result); res(s.slice(s.indexOf(",") + 1)); }; r.readAsDataURL(blob); });
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
      ${servis.aktif ? `<button class="btn primary lg" data-zktamam="${id}" type="button">✓ Ziyareti Tamamla → Sonraki</button>
      <div class="zk-alt"><button class="btn soft sm" data-zkpas="${id}" type="button">⏭ Pas Geç</button><button class="btn soft sm" data-zksona="${id}" type="button">&#8630; Rotanın Sonuna</button></div>` : ""}
    </div>
    <div class="zk-kayit">
      <label class="zk-kvkk"><input type="checkbox" id="zkOnay" /> Müşteriye kayıt onayı verildi (KVKK)</label>
      <button class="btn lg" id="zkKayit" data-mus="${id}" type="button" disabled>🎙 Görüşmeyi Kaydet</button>
      <p class="hint" id="zkDurum">Kaydı başlat, konuşma bitince durdur → analiz.</p>
      <div id="ziyaretKocKart" style="margin-top:10px"></div>
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
  const onay = document.getElementById("zkOnay"), kbtn = document.getElementById("zkKayit"), durum = document.getElementById("zkDurum");
  onay.addEventListener("change", () => { kbtn.disabled = !onay.checked && !rota.kayit; });
  kbtn.addEventListener("click", () => {
    if (rota.kayit) gorusmeKayitDurdur(kbtn, durum);
    else { if (!onay.checked) { alert("Önce KVKK onayını işaretle."); return; } gorusmeKayitBaslat(id, kbtn, durum); }
  });
}
async function gorusmeKayitBaslat(musteriId, btn, durum) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      durum.textContent = "Yükleniyor ve analiz ediliyor… (birkaç dakika)";
      const b64 = await blobToBase64(blob);
      let res;
      try { const { data, error } = await SB.functions.invoke("ses-analiz", { body: { audioBase64: b64, mediaType: blob.type } }); res = error ? null : data; }
      catch (e) { res = null; }
      if (!res || !res.ok) { durum.textContent = "Analiz edilemedi: " + ((res && res.error) || "bağlantı/kurulum"); return; }
      durum.textContent = "Analiz hazır ✔";
      const g = { id: genId(), tarih: new Date().toISOString(), musteriId, plasiyerId: null, transcript: res.transcript || "", analiz: res.analiz };
      store.gorusmeler = store.gorusmeler || []; store.gorusmeler.push(g); saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
      const k = document.getElementById("ziyaretKocKart"); if (k) k.innerHTML = kocKartHTML(res.analiz);
    };
    rec.start();
    rota.kayit = { rec, musteriId };
    rota.kayitTimer = setTimeout(() => { if (rota.kayit) gorusmeKayitDurdur(btn, durum); }, 15 * 60 * 1000);
    btn.textContent = "⏹ Kaydı Durdur";
    btn.classList.add("kayit-aktif");
    durum.textContent = "🔴 Kayıt sürüyor… (en fazla 15 dk)";
  } catch (e) {
    durum.textContent = "Mikrofon açılamadı — izin verildi mi / APK güncel mi? (" + (e.message || e) + ")";
  }
}
function gorusmeKayitDurdur(btn, durum) {
  if (rota.kayit && rota.kayit.rec && rota.kayit.rec.state !== "inactive") rota.kayit.rec.stop();
  clearTimeout(rota.kayitTimer); rota.kayit = null;
  if (btn) { btn.textContent = "🎙 Görüşmeyi Kaydet"; btn.classList.remove("kayit-aktif"); }
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
// Rotada araca ürün alımı: seçilen ürünün adedini ARAÇ stoğuna ekler (aracHareket: alim)
function aracAlimModal() {
  let q = "";
  const liste = () => {
    let list = store.products.filter((p) => p.gorunur !== false);
    if (q) { const n = ocrNorm(q); list = list.filter((p) => ocrNorm(p.ad).includes(n)); }
    return list.slice(0, 300).map((p) => `<div class="aa-row"><div class="aa-ad">${esc(p.ad)}<span class="hint" data-aastok="${p.id}"> · araç ${num2.format(Number(p.aracStok) || 0)}</span></div><input class="aa-in" data-aa="${p.id}" type="number" inputmode="numeric" placeholder="adet" /><input class="aa-in aa-al" data-aaal="${p.id}" type="number" inputmode="decimal" placeholder="₺alış" value="${Number(p.alis) || ""}" title="birim alış" /><button class="btn ok aa-btn" data-aaadd="${p.id}" type="button">＋</button></div>`).join("") || `<p class="hint" style="padding:8px">Ürün yok.</p>`;
  };
  const body = `<input id="aaAra" placeholder="Ürün ara..." style="width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:11px" /><p class="hint" style="margin:8px 0 4px">Adet + birim alış (₺) yaz → ＋. Araca eklenir, maliyet <b>gidere</b> işlenir.</p><div id="aaList" style="max-height:56vh;overflow:auto">${liste()}</div>`;
  const m = openModal("🛒 Araca Ürün Al", body, {
    noFoot: true,
    onMount: (ov) => {
      const l = ov.querySelector("#aaList"), ara = ov.querySelector("#aaAra");
      const wire = () => l.querySelectorAll("[data-aaadd]").forEach((b) => b.onclick = () => {
        const inp = l.querySelector(`[data-aa="${b.dataset.aaadd}"]`); const n = inp ? Number(inp.value) || 0 : 0;
        if (n <= 0) { alert("Adet gir."); return; }
        const p = findProduct(b.dataset.aaadd); if (!p) return;
        const alEl = l.querySelector(`[data-aaal="${b.dataset.aaadd}"]`); const birimAlis = alEl ? Number(alEl.value) || 0 : (Number(p.alis) || 0);
        const maliyet = n * birimAlis;
        p.aracStok = (Number(p.aracStok) || 0) + n;
        store.aracHareket.push({ id: genId(), urunId: p.id, ad: p.ad, adet: n, birimAlis, tutar: maliyet, yon: "alim", tarih: new Date().toISOString() });
        if (maliyet > 0) store.expenses.push({ id: genId(), tutar: maliyet, kategori: "Araç Stok Alımı", not: num2.format(n) + " x " + p.ad + " (birim " + money.format(birimAlis) + ")", tarih: new Date().toISOString() });
        saveStore(); if (typeof bulutaYaz === "function") bulutaYaz();
        if (inp) inp.value = "";
        const st = l.querySelector(`[data-aastok="${p.id}"]`); if (st) st.textContent = " · araç " + num2.format(p.aracStok);
        b.textContent = "✓"; setTimeout(() => { b.textContent = "＋"; }, 700);
      });
      wire();
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
          <button class="btn soft" id="sFoto" type="button">&#128247; Kamera</button>
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
      ${borc > 0 ? `<div class="kp-blok"><label>💰 Tahsilat — bakiye ${money.format(borc)}</label><div class="zk-hizli-row"><input id="kpTahsil" type="number" inputmode="decimal" placeholder="0" /><select id="kpTahsilTip"><option value="nakit">Nakit</option><option value="pos">POS</option></select></div></div>` : ""}
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
const harita = { map: null, katman: null, cizgi: null, sira: [], rotaId: "", benim: null, watchId: null, kirli: false };
const HR_MAX_DURAK = 10; // Google Maps yol tarifi: origin + 8 ara nokta + destination

function haritaKonumlu() { return store.customers.filter((c) => c.lat != null && c.lng != null && !c.bayi); }

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
  if (cizgiNoktalar.length > 1) harita.cizgi = L.polyline(cizgiNoktalar, { color: "#1E40AF", weight: 3, opacity: 0.65, dashArray: "6 6" }).addTo(harita.map);
  hrListeCiz();
}

function hrListeCiz() {
  const el = document.getElementById("hrListe"); if (!el) return;
  const sayi = document.getElementById("hrSayi"); if (sayi) sayi.textContent = String(harita.sira.length);
  el.innerHTML = harita.sira.length
    ? harita.sira.map((id, i) => {
        const c = findCustomer(id); if (!c) return "";
        const edildi = servis.aktif && servis.edilen.includes(id);
        return `<div class="hr-item ${edildi ? "bitti" : ""}">
          <span class="hr-no ${edildi ? "yesil" : ""}">${edildi ? "✓" : i + 1}</span>
          <div class="hr-mid" data-hrgit="${id}" role="button" tabindex="0"><b>${esc(c.ad)}</b><span class="hint">${esc(c.mahalle || c.bolge || "—")} · ${money.format(customerBorc(id))}</span></div>
          <div class="hr-ok"><button class="hr-mini" data-hryukari="${id}" type="button" title="Yukarı">▲</button><button class="hr-mini" data-hrasagi="${id}" type="button" title="Aşağı">▼</button><button class="hr-mini rm" data-hrcik="${id}" type="button" title="Çıkar">✕</button></div>
        </div>`;
      }).join("")
    : `<p class="hint" style="padding:8px">Rotada durak yok. Haritadaki gri pinlere dokunup ekle ya da "Tüm Konumluları Ekle".</p>`;
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
      const sf = document.getElementById("sFoto"); if (sf) sf.addEventListener("click", satisFotoOku);
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
        <p class="sub">Tüm verini (ürün, müşteri, satış, ayar) tek dosyaya yedekle; başka cihaza taşı veya sonra geri yükle.</p>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn green lg" id="backupBtn" type="button">⇩ Yedek Al (JSON indir)</button>
          <button class="btn soft lg" id="restoreBtn" type="button">⇧ Yedekten Geri Yükle</button>
        </div>
        <p class="hint">Geri yükleme mevcut tüm veriyi seçtiğin yedekle değiştirir.</p>
      </div>
      <div class="ptab" data-ptab="3" style="display:none">
        <h1 style="font-size:15px;margin:0 0 14px">Verilerimi Sil</h1>
        <p class="sub">Tüm ürün, müşteri, satış ve ayarları kalıcı olarak siler. Bu işlem geri alınamaz.</p>
        <div style="margin-top:14px"><button class="btn softred lg" id="wipeBtn" type="button">🗑 Tüm Verileri Sil</button></div>
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
  document.getElementById("wipeBtn").addEventListener("click", () => { if (confirm("TÜM veriler (ürün, müşteri, satış...) silinecek. Emin misiniz?") && confirm("Son kez: gerçekten sil?")) { localStorage.removeItem(STORE_KEY); store = emptyStore(); saveStore(); alert("Veriler silindi."); navigate("anasayfa"); } });
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
  const alias = { "musteri-detay": "musteriler", "urun-ekle": "urunler", "stok-sayimi-detay": "stok-sayimi", "satis-detay": "satis" };
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

/* Kritik stok çan bildirimi */
function criticalProducts() { return store.products.filter((p) => (Number(p.stok) || 0) <= (Number(p.kritik) || 0) && p.kritik !== "" && p.kritik != null); }
function updateBell() {
  const crit = criticalProducts();
  const badge = document.getElementById("bellBadge");
  if (badge) { badge.textContent = crit.length; badge.classList.toggle("show", crit.length > 0); }
  const dd = document.getElementById("bellDropdown");
  if (dd) {
    dd.innerHTML = `<div class="dd-head">Kritik Stok (${crit.length})</div>` + (crit.length ? crit.slice(0, 20).map((p) => `<a data-critp="${p.id}">${esc(p.ad)}<small class="borc-red">${num2.format(Number(p.stok) || 0)}</small></a>`).join("") : `<div class="dd-empty">Kritik stok yok 👍</div>`);
    dd.querySelectorAll("[data-critp]").forEach((a) => a.addEventListener("click", () => { dd.classList.remove("open"); openProductEdit(a.dataset.critp); }));
  }
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
// Bulut yedeği: açılışta store'u buluttan çek (başka cihazdan da erişilsin).
bulutHydrate();
// İnternet kapısı: bağlantı yoksa paneli kapat, gelince aç (tümü-buluttan mimarisi).
internetKontrol();
setInterval(internetKontrol, 8000);
window.addEventListener("online", internetKontrol);
window.addEventListener("offline", internetKontrol);
// Ekrana geri dönünce: internet kontrol + buluttan tazele (veri hep güncel).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  internetKontrol();
  if (SB && _bulutHazir) bulutHydrate();
});
// Çay ocağı siparişlerini internetten otomatik çek (açılışta + 15sn'de bir).
if (SB) { cayPullSupabase(); setInterval(cayPullSupabase, 15000); }
if (typeof window !== "undefined") window.app = { getStore: () => store, pos, addToCart, finalizeSale, finalizeCustom, findProduct, customerBorc, firmaBorc, saveStore, render, navigate, openSale, netLine, cartTotals, exportBackup, importBackup, criticalProducts, saleOdeme };
