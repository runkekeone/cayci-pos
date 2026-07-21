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
    duyurular: [],
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
function findProduct(id) { return store.products.find((p) => p.id === id); }
function findCustomer(id) { return store.customers.find((c) => c.id === id); }
function findFirma(id) { return store.firmalar.find((f) => f.id === id); }

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
function allGroupNames() {
  const base = ["ÇAYLAR", "KAHVE", "KIRAATHANE ARAÇLARI", "MEŞRUBATLAR", "OYUN MALZEMELERİ", "SODALAR", "SOĞUK", "TOZ İÇECEKLER", "GRUPSUZ ÜRÜN"];
  const extra = store.groups.map((g) => g.ad);
  return [...new Set(base.concat(extra))];
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
function downloadFile(name, text, type) {
  const blob = new Blob([text], { type: type || "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const head = ["Barkod", "Ürün Adı", "Grup", "Alış Fiyatı", "Fiyat 1", "Kalan Stok", "Kritik Stok", "KDV", "Birim"];
  const rows = [head].concat(store.products.map((p) => [p.barkod || "", p.ad, p.grup || "", p.alis || 0, p.satis || 0, p.stok || 0, p.kritik === "" || p.kritik == null ? "" : p.kritik, p.kdv || 0, p.birim || "Adet"]));
  downloadFile("babuco-urunler.csv", csvBuild(rows));
}
function importProducts(text) {
  const rows = csvParse(text); if (rows.length < 2) { alert("Boş veya başlıksız dosya."); return; }
  const head = rows[0].map((h) => (h || "").toLowerCase().trim());
  const iBar = headerIndex(head, ["barkod", "barcode"]), iAd = headerIndex(head, ["ürün adı", "urun adi", "ürün adı ", "ad", "ürün", "urun", "name"]),
    iGrup = headerIndex(head, ["grup", "kategori", "group"]), iAlis = headerIndex(head, ["alış fiyatı", "alis fiyati", "alış", "alis", "alış fiyat"]),
    iSatis = headerIndex(head, ["fiyat 1", "fiyat1", "fiyat", "satış fiyatı", "satis fiyati", "satış", "satis", "price"]),
    iStok = headerIndex(head, ["kalan stok", "stok", "stock", "miktar"]), iKritik = headerIndex(head, ["kritik stok", "kritik", "kritik stok miktarı"]),
    iKdv = headerIndex(head, ["kdv", "kdv %", "vat"]), iBirim = headerIndex(head, ["birim", "unit"]);
  if (iAd < 0) { alert("'Ürün Adı' sütunu bulunamadı."); return; }
  let add = 0, upd = 0, err = 0;
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r]; const ad = (c[iAd] || "").trim(); if (!ad) { err++; continue; }
    const bar = iBar >= 0 ? (c[iBar] || "").trim() : "";
    const data = { ad, barkod: bar, grup: iGrup >= 0 ? (c[iGrup] || "").trim() : "", alis: num(c[iAlis]), satis: num(c[iSatis]), stok: num(c[iStok]), kritik: iKritik >= 0 && c[iKritik] !== "" ? num(c[iKritik]) : "", kdv: num(c[iKdv]), birim: iBirim >= 0 && c[iBirim] ? c[iBirim] : "Adet", gorunur: true };
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
  { ico: "▦", label: "Anasayfa", route: "anasayfa" },
  { ico: "🖊", label: "Satış Yap", route: "satis" },
  { ico: "🍵", label: "Çay Ocağı Siparişleri", route: "cay-ocagi" },
  { ico: "📢", label: "Duyurular", route: "duyurular" },
  { ico: "📈", label: "Raporlar", children: [
      { label: "Günlük Rapor", route: "rapor-gunluk" }, { label: "Tarihsel Rapor", route: "rapor-tarihsel" },
      { label: "Ürünsel Rapor", route: "rapor-urunsel" }, { label: "Grupsal Rapor", route: "rapor-grupsal" },
      { label: "Ürün Korelasyon Raporu", route: "rapor-korelasyon" }, { label: "Stok Hareket Rapor", route: "rapor-stokhareket" },
      { label: "Personel Hareket Raporu", route: "rapor-personelhareket" },
  ] },
  { ico: "👤", label: "Müşteriler", route: "musteriler" },
  { ico: "🗂", label: "Ürünler", children: [
      { label: "Ürünler", route: "urunler" }, { label: "Ürün Ekle & Güncelle", route: "urun-ekle" },
      { label: "Varyantlı Ürün Ekle", route: "urun-varyantli" }, { label: "Ürün Grupları", route: "urun-gruplari" },
      { label: "Ürün Transferleri", route: "urun-transfer" }, { label: "Alt Ürün Tanımları", route: "alt-urun" },
      { label: "Ürün Varyantları", route: "urun-varyantlari" }, { label: "Ürün İadesi Al", route: "urun-iade" },
      { label: "İade Talepleri", route: "iade-talepleri" }, { label: "Ürün Etiketi Üret", route: "urun-etiket" },
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
  return `<div class="page-head"><h1>${title}</h1>${sub ? `<span class="sub">${sub}</span>` : ""}<div class="actions">${acts}</div></div>`;
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
    return `<div class="field"><label>${f.label}${f.req ? " *" : ""}</label><input data-k="${f.key}" type="${f.type || "text"}" ${f.step ? `step="${f.step}"` : ""} value="${esc(val)}" placeholder="${f.ph || ""}" /></div>`;
  }).join("");
  openModal(title, body, {
    onOk: (ov) => {
      const data = {};
      let ok = true;
      fields.forEach((f) => {
        const el = ov.querySelector(`[data-k="${f.key}"]`);
        let v = el.value;
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
      <td>${Number(p.kdv) || 0}</td><td>${p.kritik === "" || p.kritik == null ? 0 : Number(p.kritik)}</td>
      <td>${money.format(Number(p.alis) || 0)}</td><td>${money.format(Number(p.satis) || 0)}</td>
      <td><div class="act-btns"><button class="edit" data-edit="${p.id}">Düzenle</button><button class="del" data-del="${p.id}">Sil</button></div></td>
    </tr>`;
  }).join("");
  return pageHead("Ürünler", store.products.length + " ürün", [{ label: "＋ Ürün Ekle", route: "urun-ekle" }, { label: "⇩ Excel'e Aktar", cls: "softgreen", act: "csvOut" }, { label: "⇧ İçe Aktar", cls: "softgreen", act: "csvIn" }, { label: "Şablon", cls: "soft", act: "csvTpl" }]) +
    tableCard(["Sıra", "Görsel", "Ürün Barkodu", "Ürün Adı", "Stok", "KDV", "Kritik Stok", "Alış Fiyatı", "Fiyat 1", "İşlem"], rows, infoLine(store.products.length));
}
function mountUrunler() {
  document.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => { editProductId = b.dataset.edit; navigate("urun-ekle"); }));
  document.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { const p = findProduct(b.dataset.del); if (p && confirm(`"${p.ad}" silinsin mi?`)) { store.products = store.products.filter((x) => x.id !== p.id); saveStore(); render(); } }));
  const o = document.querySelector('[data-act="csvOut"]'); if (o) o.addEventListener("click", exportProducts);
  const i = document.querySelector('[data-act="csvIn"]'); if (i) i.addEventListener("click", () => openCsvImport(importProducts));
  const t = document.querySelector('[data-act="csvTpl"]'); if (t) t.addEventListener("click", () => downloadFile("babuco-urun-sablon.csv", csvBuild([["Barkod", "Ürün Adı", "Grup", "Alış Fiyatı", "Fiyat 1", "Kalan Stok", "Kritik Stok", "KDV", "Birim"]])));
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
        <div class="field"><label>Ürün Birimi</label><select name="birim"><option ${p && p.birim === "Adet" ? "selected" : ""}>Adet</option><option ${p && p.birim === "Kg" ? "selected" : ""}>Kg</option><option ${p && p.birim === "Litre" ? "selected" : ""}>Litre</option></select></div>
        <div class="field"><label>Satış Sayfasında Göster</label><select name="gorunur"><option value="1" ${!gorunurSel ? "selected" : ""}>Göster</option><option value="0" ${gorunurSel ? "selected" : ""}>Gösterme</option></select></div>
      </div>
      <div style="margin-top:16px"><button class="btn green lg" type="submit">💾 ${p ? "Güncelle" : "Ürünü Kaydet"}</button></div>
    </form>`;
}
function mountUrunEkle() {
  document.getElementById("urunForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = { ad: (f.get("ad") || "").trim(), barkod: (f.get("barkod") || "").trim(), satis: f.get("satis"), alis: f.get("alis"), stok: f.get("stok"), kritik: f.get("kritik"), kdv: f.get("kdv"), grup: f.get("grup"), birim: f.get("birim"), gorunur: f.get("gorunur") === "1" };
    if (!data.ad) { alert("Ürün adı zorunlu."); return; }
    if (editProductId) Object.assign(findProduct(editProductId), data);
    else store.products.push(Object.assign({ id: genId() }, data));
    saveStore(); editProductId = null; navigate("urunler");
  });
}

/* ============ MÜŞTERİLER ============ */
function renderMusteriler() {
  const toplamBorc = store.customers.reduce((s, c) => s + customerBorc(c.id), 0);
  const rows = store.customers.map((c, i) => {
    const borc = customerBorc(c.id);
    return `<tr><td>${i + 1}</td><td><button class="link-btn" data-detay="${c.id}">${esc(c.ad)}</button></td><td>${customerSalesCount(c.id)}</td><td class="${borc > 0 ? "borc-red" : ""}">${money.format(borc)}</td><td>${esc(c.telefon || "-")}</td><td><div class="act-btns"><button class="edit" data-odeme="${c.id}">Ödeme Al</button><button class="del" data-delc="${c.id}">Sil</button></div></td></tr>`;
  }).join("");
  return pageHead("Müşteriler", `${store.customers.length} kişi · Toplam borç: ${money.format(toplamBorc)}`, [{ label: "＋ Yeni Müşteri Oluştur", act: "yeni-musteri" }, { label: "⇩ Excel'e Aktar", cls: "softgreen", act: "csvOut" }, { label: "⇧ İçe Aktar", cls: "softgreen", act: "csvIn" }, { label: "Şablon", cls: "soft", act: "csvTpl" }]) +
    tableCard(["Sıra", "Müşteri", "Alışveriş Sayısı", "Kalan Borcu", "Telefon", "İşlem"], rows, infoLine(store.customers.length));
}
function openYeniMusteri(onDone, item) {
  formModal(item ? "Müşteri Düzenle" : "Yeni Müşteri Oluştur", [
    { key: "ad", label: "Müşteri Tanımı", req: true, ph: "Ad Soyad / Ünvan" },
    { key: "vade", label: "Vade Süresi (gün)", type: "number", ph: "opsiyonel" },
    { key: "telefon", label: "Telefon", ph: "05xx" },
    { key: "adres", label: "Adres" },
    { key: "not", label: "Müşteri Notu" },
    { key: "limit", label: "Açık Hesap Limiti (₺)", type: "number", step: "0.01", def: 0 },
    { key: "vergiDairesi", label: "Vergi Dairesi" },
    { key: "vergiNo", label: "Vergi No / TCKN" },
    { key: "acilis", label: "Açılış Borcu (₺)", type: "number", step: "0.01", def: 0 },
  ], item, (data) => {
    if (item) Object.assign(item, data);
    else store.customers.push(Object.assign({ id: genId() }, data));
    saveStore(); if (onDone) onDone(); else render();
  });
}
function mountMusteriler() {
  const y = document.querySelector('[data-act="yeni-musteri"]'); if (y) y.addEventListener("click", () => openYeniMusteri());
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
  return pageHead("Müşteri Detay", esc(c.ad), [{ label: "Ödeme Al", cls: "green", act: "odeme" }, { label: "Müşteriler", cls: "soft", route: "musteriler" }]) +
    grid([["Toplam Satış", money.format(sales.reduce((s, x) => s + x.toplam, 0)), "blue"], ["Açılış Borcu", money.format(Number(c.acilis) || 0)], ["Tahsilat", money.format(pays.reduce((s, p) => s + p.tutar, 0)), "green"], ["Kalan Borç", money.format(customerBorc(c.id))]]) +
    `<h1 style="font-size:15px;margin:18px 0 8px">Alışverişler</h1>` + tableCard(["Sıra", "Belge No", "Toplam Ürün", "Toplam Tutar", "Açık Hesap", "Ödeme Tipi", "Tarih"], salesRows, infoLine(sales.length)) +
    `<h1 style="font-size:15px;margin:18px 0 8px">Tahsilatlar</h1>` + tableCard(["Sıra", "Türü", "Not", "Tutar", "Tarih"], payRows, infoLine(pays.length));
}
function mountMusteriDetay() {
  const o = document.querySelector('[data-act="odeme"]'); if (o) o.addEventListener("click", () => openOdemeAl(selectedCustomerId));
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
  return pageHead("Satış Detayı", "Belge No: " + esc(s.belgeNo), [{ label: "🖨 İrsaliye", cls: "soft", act: "print" }, { label: "🗑 Satışı Sil", cls: "softred", act: "delsale" }, { label: "Geri", cls: "soft", route: "rapor-tarihsel" }]) +
    `<div class="card"><div class="form-grid">
      <div class="field"><label>Müşteri</label><select id="sdMus">${musOpts}</select></div>
      <div class="field"><label>Ödeme Tipi</label><select id="sdOdeme">${odOpts}</select></div>
      <div class="field"><label>Genel İskonto (₺)</label><input id="sdIsk" type="number" step="0.01" value="${s.iskonto || 0}" /></div>
      <div class="field"><label>Not</label><input id="sdNot" value="${esc(s.not || "")}" /></div>
      <div class="field"><label>Tarih</label><input value="${fmtDate(s.tarih)}" disabled /></div>
      <div class="field"><label>Satış Yapan</label><input value="${(s.personelId && (store.personeller.find((p) => p.id === s.personelId) || {}).ad) || "-"}" disabled /></div>
    </div></div>
    <div class="card"><h1 style="font-size:15px;margin:0 0 8px">Ürünler</h1>
      <table class="line-table"><thead><tr><th style="width:36%">Ürün</th><th>KDV</th><th>Adet</th><th>Birim Fiyat</th><th>Tutar</th><th></th></tr></thead><tbody id="sdBody"></tbody></table>
      <div class="totbox" style="margin-top:10px"><strong>Genel Toplam: <span id="sdTot">₺0,00</span></strong></div>
      <div style="text-align:right;margin-top:10px"><button class="btn green lg" id="sdSave" type="button">💾 Güncelle</button></div>
    </div>`;
}
function sdRowHTML(r, i) { return `<tr><td>${esc(r.ad)}</td><td>%${Number(r.kdv) || 0}</td><td><input class="row-in" data-sd="${i}" data-f="adet" type="number" step="0.01" value="${r.adet}" style="width:80px" /></td><td><input class="row-in" data-sd="${i}" data-f="fiyat" type="number" step="0.01" value="${r.fiyat}" style="width:100px" /></td><td>${money.format((Number(r.adet) || 0) * (Number(r.fiyat) || 0))}</td><td><button class="rm" data-sdmv="${i}" type="button">✕</button></td></tr>`; }
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
const pos = { carts: [newCart(), newCart(), newCart(), newCart(), newCart()], active: 0, cat: "ANA", personelId: null };
function activeCart() { return pos.carts[pos.active]; }
function renderSatis() {
  const cats = ["ANA"].concat(allGroupNames());
  const custTabs = pos.carts.map((c, n) => `<div class="cust-tab ${n === pos.active ? "on" : ""}" data-tab="${n}">Müşteri ${n + 1} (${num2.format(c.items.reduce((s, i) => s + i.fiyat * i.adet, 0))})</div>`).join("");
  const quick = [["20", "20"], ["50", "50"], ["100", "100"], ["200", "200"], ["+20", "+20"], ["-20", "-20"]].map((q) => `<button type="button" data-quick="${q[1]}">${q[0]}</button>`).join("");
  const catTabs = cats.map((c) => `<span class="cat-tab ${c === pos.cat ? "on" : ""}" data-cat="${c}">${c}</span>`).join("");
  const persSel = store.personeller.length ? `<div class="field" style="margin:0"><label>Personel</label><select id="posPersonel"><option value="">— seç —</option>${store.personeller.map((p) => `<option value="${p.id}" ${pos.personelId === p.id ? "selected" : ""}>${esc(p.ad)}</option>`).join("")}</select></div>` : "";
  return `<div class="pos-topbar">
      <div class="pos-search">
        <div class="pos-price-sel">Fiyat 1 ▾</div>
        <input class="bar-input" id="barInput" placeholder="Ürün barkodunu okutup Enter'a basın..." />
        <button class="pos-btn blue" id="barAra" type="button">🔍<small>Ara</small></button>
        <button class="pos-btn green" type="button" data-soon>▥<small>Fiyat Gör</small></button>
        <button class="pos-btn orange" id="posYazdir" type="button">🖨<small>Yazdır</small></button>
        <button class="pos-btn teal" type="button" data-soon>➕<small>Ödeme Ekle</small></button>
      </div>
      <div class="pos-totals">
        <div class="pos-tot"><div class="l">Ödenen</div><div class="v" id="posOdenen">0</div></div>
        <div class="pos-tot red"><div class="l">Tutar</div><div class="v" id="posTutar">0</div></div>
        <div class="pos-tot green"><div class="l">Para Üstü</div><div class="v" id="posUstu">0</div></div>
      </div>
    </div>
    <div class="pos-main">
      <div class="card pos-cart">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px"><h2 style="margin:0;font-size:16px">Ürünler ⓘ</h2><span id="cartCount" class="sub">${cartCount()}</span></div>
        <div class="muh-row">
          <div class="field" style="flex:1"><label>Muhtelif Tutar</label><input id="muhInput" type="number" step="0.01" placeholder="Serbest tutar" /></div>
          <button class="btn soft" id="muhEkle" type="button">Ekle</button>
          <div class="field"><label>İsk. Değeri (₺)</label><input id="iskGenel" type="number" step="0.01" value="${activeCart().iskonto || ""}" placeholder="0" /></div>
          <div class="field" style="flex:1"><label>Seçili Müşteri</label><input id="custLabel" readonly value="${cartCustName()}" placeholder="Müşteri seçilmedi" /></div>
          ${persSel}
        </div>
        <div class="cust-tabs" id="custTabs">${custTabs}</div>
        <div class="table-wrap"><table class="grid"><thead><tr><th>Sil</th><th>Ürün</th><th>İsk./Not</th><th>Miktar</th><th>Fiyat</th><th>Tutar</th><th>G.</th></tr></thead><tbody id="cartBody">${cartRowsHTML()}</tbody></table></div>
      </div>
      <div class="pos-side">
        <div class="card" style="padding:12px;display:flex;flex-direction:column;gap:10px">
          <div class="cust-select"><input id="custSearch" readonly value="${cartCustName()}" placeholder="Müşteri Seç" /><button class="btn" id="custPick" type="button">Seç</button></div>
          <div class="pos-daterow"><span>${fmtDate(new Date().toISOString())}</span><span id="custLimit">${activeCart().musteriId ? "Borç: " + money.format(customerBorc(activeCart().musteriId)) : "Müşteri yok"}</span></div>
          <div class="quick-amts">${quick}</div>
          <div class="pay-grid">
            <button class="pay-btn nakit" data-pay="nakit" type="button">₺ (F8)<small>NAKİT</small></button>
            <button class="pay-btn pos" data-pay="pos" type="button">▤ (F9)<small>POS</small></button>
            <button class="pay-btn acik" data-pay="acik" type="button">📖 (F10)<small>AÇIK HESAP</small></button>
            <button class="pay-btn parcali" data-pay="parcali" type="button">⇄<small>PARÇALI</small></button>
          </div>
          ${store.odemeTipleri.length ? `<div class="pay-custom" style="display:flex;flex-wrap:wrap;gap:6px">${store.odemeTipleri.map((t) => `<button class="btn soft" data-paycustom="${t.id}" type="button">${esc(t.ad)}</button>`).join("")}</div>` : ""}
        </div>
        <div class="card" style="padding:12px">
          <div class="cat-tabs" id="catTabs">${catTabs}</div>
          <div class="prod-grid" id="prodGrid">${prodGridHTML()}</div>
        </div>
      </div>
    </div>`;
}
function cartCustName() { const id = activeCart().musteriId; const c = id && findCustomer(id); return c ? esc(c.ad) : ""; }
function cartRowsHTML() {
  const items = activeCart().items;
  if (!items.length) return `<tr class="empty-row"><td colspan="7">Sepet boş — üründen tıklayın.</td></tr>`;
  return items.map((it, idx) => `<tr>
    <td><button class="cart-del" data-rem="${idx}" title="Sil">✕</button></td>
    <td><div class="p-bar">${esc(it.barkod || "")}</div>${esc(it.ad)} <span class="badge">%${Number(it.kdv) || 0}</span></td>
    <td><input class="row-in isk-in" data-isk="${idx}" type="number" step="0.01" value="${it.iskyuzde || ""}" placeholder="%" /></td>
    <td><div class="cart-qty"><button class="minus" data-dec="${idx}" type="button">−</button><input class="row-in qty-in" data-qty="${idx}" type="number" step="0.01" value="${it.adet}" /><button data-inc="${idx}" type="button">+</button></div></td>
    <td><input class="row-in price-in" data-price="${idx}" type="number" step="0.01" value="${it.fiyat}" /></td>
    <td data-tut="${idx}">${money.format(netLine(it))}</td>
    <td class="g-cell"><input type="checkbox" title="Gramaj/hediye" /></td>
  </tr>`).join("");
}
function prodGridHTML() {
  let list = store.products.filter((p) => p.gorunur !== false);
  if (pos.cat !== "ANA") list = list.filter((p) => (p.grup || "GRUPSUZ ÜRÜN") === pos.cat);
  if (!list.length) return `<div style="grid-column:1/-1;color:var(--muted);padding:20px;text-align:center">Bu kategoride ürün yok. <a href="#/urun-ekle">Ürün ekleyin</a>.</div>`;
  return list.map((p) => `<div class="prod-card" data-add="${p.id}"><span class="p-name">${esc(p.ad)}</span><span class="p-price">${money.format(Number(p.satis) || 0)}</span></div>`).join("");
}
function netLine(it) { const t = (Number(it.fiyat) || 0) * (Number(it.adet) || 0); return t * (1 - (Number(it.iskyuzde) || 0) / 100); }
function cartCount() { const c = activeCart(); return `${c.items.length} (${num2.format(c.items.reduce((s, i) => s + (Number(i.adet) || 0), 0))})`; }
function cartTotals() { const c = activeCart(); const brut = c.items.reduce((s, i) => s + netLine(i), 0); const toplam = Math.max(0, brut - (Number(c.iskonto) || 0)); return { brut, toplam, odenen: Number(c.odenen) || 0, ustu: Math.max(0, (Number(c.odenen) || 0) - toplam) }; }
function rebuildCart() { const cb = document.getElementById("cartBody"); if (cb) cb.innerHTML = cartRowsHTML(); wireCartRow(); }
function syncTotals() {
  const t = cartTotals(); const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("posTutar", num2.format(t.toplam)); set("posOdenen", num2.format(t.odenen)); set("posUstu", num2.format(t.ustu));
  const cc = document.getElementById("cartCount"); if (cc) cc.textContent = cartCount();
  document.querySelectorAll("[data-tab]").forEach((el) => { const n = Number(el.dataset.tab); el.textContent = `Müşteri ${n + 1} (${num2.format(pos.carts[n].items.reduce((s, i) => s + netLine(i), 0))})`; el.classList.toggle("on", n === pos.active); });
  const cl = document.getElementById("custLabel"); if (cl) cl.value = cartCustName();
  const cs = document.getElementById("custSearch"); if (cs) cs.value = cartCustName();
  const lim = document.getElementById("custLimit"); if (lim) lim.textContent = activeCart().musteriId ? "Borç: " + money.format(customerBorc(activeCart().musteriId)) : "Müşteri yok";
}
function syncRow(idx) { const it = activeCart().items[idx]; if (!it) return; const cell = document.querySelector(`[data-tut="${idx}"]`); if (cell) cell.textContent = money.format(netLine(it)); syncTotals(); }
function refreshPOS() { rebuildCart(); syncTotals(); }
function wireCartRow() {
  const c = activeCart();
  document.querySelectorAll("[data-rem]").forEach((b) => b.onclick = () => { c.items.splice(Number(b.dataset.rem), 1); refreshPOS(); });
  document.querySelectorAll("[data-inc]").forEach((b) => b.onclick = () => { const it = c.items[Number(b.dataset.inc)]; it.adet = (Number(it.adet) || 0) + 1; refreshPOS(); });
  document.querySelectorAll("[data-dec]").forEach((b) => b.onclick = () => { const it = c.items[Number(b.dataset.dec)]; it.adet = (Number(it.adet) || 0) - 1; if (it.adet <= 0) c.items.splice(Number(b.dataset.dec), 1); refreshPOS(); });
  document.querySelectorAll("[data-qty]").forEach((el) => el.oninput = () => { c.items[Number(el.dataset.qty)].adet = el.value === "" ? 0 : Number(el.value); syncRow(Number(el.dataset.qty)); });
  document.querySelectorAll("[data-price]").forEach((el) => el.oninput = () => { c.items[Number(el.dataset.price)].fiyat = el.value === "" ? 0 : Number(el.value); syncRow(Number(el.dataset.price)); });
  document.querySelectorAll("[data-isk]").forEach((el) => el.oninput = () => { c.items[Number(el.dataset.isk)].iskyuzde = el.value === "" ? 0 : Number(el.value); syncRow(Number(el.dataset.isk)); });
}
function addToCart(prodId) { const p = findProduct(prodId); if (!p) return; const c = activeCart(); const ex = c.items.find((i) => i.urunId === prodId); if (ex) ex.adet = (Number(ex.adet) || 0) + 1; else c.items.push({ urunId: prodId, ad: p.ad, barkod: p.barkod || "", kdv: Number(p.kdv) || 0, fiyat: Number(p.satis) || 0, adet: 1, iskyuzde: 0, not: "" }); refreshPOS(); }
function finalizeCustom(tipId) { const tip = store.odemeTipleri.find((t) => t.id === tipId); if (!tip) return; finalizeSale(tip.kasa === "Nakit Kasa" ? "nakit" : "pos", tip.ad); }
function finalizeSale(type, odemeAdi) {
  const c = activeCart();
  if (!c.items.length) { alert("Sepet boş."); return; }
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
  store.counters.sale = (store.counters.sale || 0) + 1;
  const belgeNo = new Date().getFullYear() + "-" + String(store.counters.sale).padStart(6, "0");
  store.sales.push({ id: genId(), belgeNo, musteriId: c.musteriId, personelId: pos.personelId, not: "", odemeAdi: odemeAdi || null, items: c.items.map((i) => ({ urunId: i.urunId, ad: i.ad, barkod: i.barkod || "", kdv: Number(i.kdv) || 0, fiyat: Number(i.fiyat) || 0, adet: Number(i.adet) || 0, iskyuzde: Number(i.iskyuzde) || 0 })), brut, iskonto: Number(c.iskonto) || 0, toplam, maliyet, odeme, tarih: new Date().toISOString() });
  c.items.forEach((i) => { const pr = findProduct(i.urunId); if (pr) pr.stok = (Number(pr.stok) || 0) - i.adet; });
  saveStore();
  pos.carts[pos.active] = newCart();
  refreshPOS();
  const grid = document.getElementById("prodGrid"); if (grid) { grid.innerHTML = prodGridHTML(); wireProdCards(); }
  if (confirm(`Satış kaydedildi ✔\nBelge No: ${belgeNo} · Toplam: ${money.format(toplam)}\n\nİrsaliye yazdırılsın mı?`)) printSale(store.sales[store.sales.length - 1]);
}
function wireProdCards() { document.querySelectorAll("[data-add]").forEach((el) => el.onclick = () => addToCart(el.dataset.add)); }
function openCustPicker() {
  const listHTML = store.customers.length ? `<ul class="pick-list">${store.customers.map((c) => `<li data-pick="${c.id}">${esc(c.ad)} <small>· borç ${money.format(customerBorc(c.id))}</small></li>`).join("")}</ul>` : `<p class="sub">Kayıtlı müşteri yok.</p>`;
  openModal("Müşteri Seç", `<input class="pick-search" id="pickSearch" placeholder="Müşteri ara..." />${listHTML}<div style="margin-top:10px"><button class="btn soft" id="pickYeni" type="button">＋ Yeni Müşteri</button></div>`, {
    noFoot: true,
    onMount: (ov) => {
      ov.querySelectorAll("[data-pick]").forEach((li) => li.addEventListener("click", () => { activeCart().musteriId = li.dataset.pick; ov.remove(); refreshPOS(); }));
      const s = ov.querySelector("#pickSearch"); s.addEventListener("input", () => { const q = s.value.toLowerCase(); ov.querySelectorAll("[data-pick]").forEach((li) => { li.style.display = li.textContent.toLowerCase().includes(q) ? "" : "none"; }); });
      ov.querySelector("#pickYeni").addEventListener("click", () => { ov.remove(); openYeniMusteri(() => openCustPicker()); });
    },
  });
}
function mountSatis() {
  wireProdCards(); wireCartRow();
  document.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => { pos.active = Number(el.dataset.tab); render(); }));
  document.querySelectorAll("[data-cat]").forEach((el) => el.addEventListener("click", () => { pos.cat = el.dataset.cat; document.querySelectorAll("[data-cat]").forEach((x) => x.classList.toggle("on", x === el)); const g = document.getElementById("prodGrid"); g.innerHTML = prodGridHTML(); wireProdCards(); }));
  document.querySelectorAll("[data-pay]").forEach((el) => el.addEventListener("click", () => finalizeSale(el.dataset.pay)));
  document.querySelectorAll("[data-paycustom]").forEach((el) => el.addEventListener("click", () => finalizeCustom(el.dataset.paycustom)));
  document.querySelectorAll("[data-quick]").forEach((el) => el.addEventListener("click", () => { const v = el.dataset.quick, c = activeCart(); if (v[0] === "+" || v[0] === "-") c.odenen = Math.max(0, (Number(c.odenen) || 0) + Number(v)); else c.odenen = (Number(c.odenen) || 0) + Number(v); syncTotals(); }));
  const isk = document.getElementById("iskGenel"); if (isk) isk.addEventListener("input", () => { activeCart().iskonto = Number(isk.value) || 0; syncTotals(); });
  const muhBtn = document.getElementById("muhEkle"), muhIn = document.getElementById("muhInput");
  const addMuh = () => { const v = Number(muhIn.value); if (!v) { alert("Tutar girin."); return; } activeCart().items.push({ urunId: null, ad: "Muhtelif Ürün", barkod: "", kdv: 0, fiyat: v, adet: 1, iskyuzde: 0, not: "" }); muhIn.value = ""; refreshPOS(); };
  if (muhBtn) muhBtn.addEventListener("click", addMuh);
  if (muhIn) muhIn.addEventListener("keydown", (e) => { if (e.key === "Enter") addMuh(); });
  const pick = document.getElementById("custPick"); if (pick) pick.addEventListener("click", openCustPicker);
  const pers = document.getElementById("posPersonel"); if (pers) pers.addEventListener("change", () => { pos.personelId = pers.value || null; });
  const bar = document.getElementById("barInput"), ara = document.getElementById("barAra");
  const doBar = () => { const code = bar.value.trim(); if (!code) return; const p = store.products.find((x) => x.barkod === code); if (p) { addToCart(p.id); bar.value = ""; } else alert("Bu barkodla ürün yok."); };
  if (bar) bar.addEventListener("keydown", (e) => { if (e.key === "Enter") doBar(); });
  if (ara) ara.addEventListener("click", doBar);
  const yz = document.getElementById("posYazdir"); if (yz) yz.addEventListener("click", () => alert("Satış tamamlanınca irsaliye yazdırılır."));
  document.querySelectorAll("[data-soon]").forEach((el) => el.addEventListener("click", () => alert("Bu özellik yakında.")));
  syncTotals();
}

/* Yazdırma */
function openPrint(title, html) {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) { alert("Yazdırma penceresi engellendi."); return; }
  w.document.write(`<html><head><title>${title}</title><style>body{font-family:monospace;padding:10px;font-size:13px}h2{text-align:center;margin:4px 0}table{width:100%;border-collapse:collapse}td{padding:2px 0}hr{border:0;border-top:1px dashed #000}.r{text-align:right}.c{text-align:center}</style></head><body>${html}<script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
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
  const son = [...store.sales].sort((a, b) => b.tarih.localeCompare(a.tarih)).slice(0, 10);
  const rows = son.map((s) => { const c = s.musteriId && findCustomer(s.musteriId); return `<tr><td><button class="link-btn" data-sale="${s.id}">${esc(s.belgeNo)}</button></td><td>${c ? esc(c.ad) : "-"}</td><td>${money.format(s.toplam)}</td><td>${saleOdeme(s)}</td><td>${fmtDate(s.tarih)}</td></tr>`; }).join("");
  const kritikRows = kritik.slice(0, 10).map((p) => `<tr><td>${esc(p.ad)}</td><td class="stok-low">${num2.format(Number(p.stok) || 0)}</td><td>${Number(p.kritik) || 0}</td></tr>`).join("");
  const dun = localDateStr(new Date(Date.now() - 86400000));
  const dunCiro = store.sales.filter((s) => localDateStr(new Date(s.tarih)) === dun).reduce((a, s) => a + s.toplam, 0);
  const cayBekleyen = store.gelenSiparisler.filter((o) => o.durum !== "teslim").length;
  const cayRows = store.gelenSiparisler.slice().reverse().slice(0, 8).map(caySiparisRow).join("");
  return pageHead("Anasayfa", "Bugünün özeti") +
    grid([["Ciro (bugün)", money.format(ciro), "blue", trendBadge(ciro, dunCiro)], ["Nakit", money.format(nakit), "green"], ["POS", money.format(pos_)], ["Açık Hesap", money.format(acik)]]) +
    `<div style="height:14px"></div>` +
    grid([["Nakit Kasa", money.format(nakit + tahsilat + gelir - gider), "green"], ["Gider (bugün)", money.format(gider)], ["Kâr (bugün)", money.format(ciro - maliyet), "green"], ["Toplam Alacak", money.format(toplamBorc)]]) +
    `<h1 style="font-size:16px;margin:18px 0 10px">🍵 Çay Ocağı Siparişleri${cayBekleyen ? ` <span class="badge-amber">${cayBekleyen} bekliyor</span>` : ""}</h1>` +
    tableCard(["Bayi", "Ürünler", "Tutar", "Aşama", "Alındı", "İşlem"], cayRows, infoLine(store.gelenSiparisler.length)) +
    `<h1 style="font-size:16px;margin:18px 0 10px">Son Satışlar</h1>` + tableCard(["Belge No", "Müşteri", "Tutar", "Ödeme Tipi", "Tarih"], rows, infoLine(son.length)) +
    `<h1 style="font-size:16px;margin:18px 0 10px">Kritik Stok (${kritik.length})</h1>` + tableCard(["Ürün", "Kalan Stok", "Kritik"], kritikRows, infoLine(kritik.length));
}
function mountAnasayfa() { wireSaleLinks(); wireCayOcagi(); }

/* ============ RAPORLAR ============ */
const reportFilters = {};
function reportDateBar(route, def) {
  const f = reportFilters[route] || def;
  return `<div class="card"><div class="filters">
    <div class="field"><label>Başlangıç Tarihi</label><input type="date" id="rFrom" value="${f.from}" /></div>
    <div class="field"><label>Bitiş Tarihi</label><input type="date" id="rTo" value="${f.to}" /></div>
    <div class="field"><label>&nbsp;</label><button class="btn" id="rListe" type="button">☰ Listele</button></div>
  </div></div>`;
}
function mountReport(route) {
  const b = document.getElementById("rListe");
  if (b) b.addEventListener("click", () => { reportFilters[route] = { from: document.getElementById("rFrom").value, to: document.getElementById("rTo").value }; render(); });
  wireTableSearch();
  wireSaleLinks();
  const pr = document.querySelector('[data-act="rprint"]'); if (pr) pr.addEventListener("click", () => window.print());
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
  const rows = sales.map((s) => { const c = s.musteriId && findCustomer(s.musteriId); const per = s.personelId && store.personeller.find((p) => p.id === s.personelId); return `<tr><td><button class="link-btn" data-sale="${s.id}">${esc(s.belgeNo)}</button></td><td>${c ? esc(c.ad) : "-"}</td><td>${s.items.reduce((a, i) => a + i.adet, 0)}</td><td>${money.format(s.toplam)}</td><td>${money.format(s.iskonto || 0)}</td><td>${saleOdeme(s)}</td><td>${fmtDate(s.tarih)}</td><td>${per ? esc(per.ad) : "-"}</td><td>${esc(s.not || "")}</td><td><button class="btn soft" data-sale="${s.id}">👁</button></td></tr>`; }).join("");
  return pageHead("Günlük Rapor", null, [{ label: "🖨 Yazdır", cls: "soft", act: "rprint" }]) + reportDateBar(route, def) +
    tableCard(["Satış Kodu", "Müşteri", "Toplam Ürün", "Toplam Tutar", "İskonto", "Ödeme Tipi", "Tarih", "Personel", "Satış Notu", "Detay"], rows, infoLine(sales.length)) +
    grid([["Nakit", money.format(nakit), "green"], ["Pos", money.format(pos_)], ["Açık Hesap", money.format(acik)], ["Toplam", money.format(ciro), "blue"]]) +
    `<div style="height:14px"></div>` +
    grid([["Alınan Ödemeler", money.format(tahsilat)], ["Firma Ödemeleri", money.format(firmaOde)], ["Giderler", money.format(gider)], ["Gelirler", money.format(gelir)]]) +
    `<div style="height:14px"></div>` +
    grid([["Nakit Kasa Raporu", money.format(nakitKasa), "green"], ["Kâr", money.format(ciro - mal), "green"], ["Ciro", money.format(ciro), "blue"], ["Ürün Maliyeti", money.format(mal)]]);
}
function renderRaporTarihsel() {
  const route = "rapor-tarihsel", def = { from: monthStartStr(), to: todayStr() };
  const sales = salesInRange(route, def);
  const rows = sales.map((s) => { const c = s.musteriId && findCustomer(s.musteriId); const per = s.personelId && store.personeller.find((p) => p.id === s.personelId); return `<tr><td><button class="link-btn" data-sale="${s.id}">${esc(s.belgeNo)}</button></td><td>${c ? esc(c.ad) : "-"}</td><td>${s.items.reduce((a, i) => a + i.adet, 0)}</td><td>${money.format(s.toplam)}</td><td>${money.format(s.iskonto || 0)}</td><td>${saleOdeme(s)}</td><td>${fmtDate(s.tarih)}</td><td>${per ? esc(per.ad) : "-"}</td></tr>`; }).join("");
  return pageHead("Tarihsel Rapor") + reportDateBar(route, def) +
    tableCard(["Satış Kodu", "Müşteri", "Toplam Ürün", "Toplam Tutar", "İskonto", "Ödeme Tipi", "Tarih", "Personel"], rows, infoLine(sales.length));
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
      <div style="margin-top:10px"><button class="btn soft" id="aAddRow" type="button">＋ Satır ekle</button></div>
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
function mountAlisOlustur() {
  alisRefresh();
  document.getElementById("aAddRow").addEventListener("click", () => { alisRows.push({ urunId: "", ad: "", adet: 1, birimFiyat: 0 }); alisRefresh(); });
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
  if (!SB) { _bulutHazir = true; return; }
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
function cayTeslim(o) {
  if (o.saleId) { alert("Bu sipariş zaten teslim edilip rapora işlendi."); return; }
  if (!confirm("Sipariş teslim edilip satış olarak raporlara işlensin mi?")) return;
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
  const sale = { id: genId(), belgeNo, musteriId: cust.id, personelId: null, not: "Çay Ocağı siparişi · " + o.dealer, odemeAdi: "Çay Ocağı", items, brut: toplam, iskonto: 0, toplam, maliyet, odeme: { nakit: 0, pos: 0, acik: toplam }, tarih: new Date().toISOString() };
  store.sales.push(sale);
  items.forEach((i) => { const pr = findProduct(i.urunId); if (pr) pr.stok = (Number(pr.stok) || 0) - i.adet; });
  o.durum = "teslim"; o.saleId = sale.id;
  saveStore(); render(); cayDurumBulut(o);
  alert("Teslim edildi ✔ Satış raporlara işlendi (Belge " + belgeNo + ", açık hesap: " + o.dealer + ").");
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
function caySiparisRow(o) {
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
function renderCayOcagi() {
  const rows = store.gelenSiparisler.slice().reverse().map(caySiparisRow).join("");
  const yeni = store.gelenSiparisler.filter((o) => o.durum === "yeni").length;
  return pageHead("Çay Ocağı Siparişleri", (store.gelenSiparisler.length + " sipariş") + (yeni ? ` · ${yeni} yeni` : ""), [
    { label: "📥 Kod Yapıştır", act: "cayKod" },
    { label: "📂 Dosyadan Al", cls: "soft", act: "cayDosya" },
  ]) + tableCard(["Bayi", "Ürünler", "Tutar", "Aşama", "Alındı", "İşlem"], rows, infoLine(store.gelenSiparisler.length));
}
function wireCayOcagi() {
  document.querySelectorAll("[data-onayla]").forEach((b) => b.addEventListener("click", () => { const o = cayFind(b.dataset.onayla); if (o) cayOnayla(o); }));
  document.querySelectorAll("[data-dagitim]").forEach((b) => b.addEventListener("click", () => { const o = cayFind(b.dataset.dagitim); if (o) cayDagitim(o); }));
  document.querySelectorAll("[data-teslim]").forEach((b) => b.addEventListener("click", () => { const o = cayFind(b.dataset.teslim); if (o) cayTeslim(o); }));
  document.querySelectorAll("[data-gonder]").forEach((b) => b.addEventListener("click", () => { const o = cayFind(b.dataset.gonder); if (o) cayGonder(o); }));
  document.querySelectorAll("[data-teklif]").forEach((b) => b.addEventListener("click", () => { const o = cayFind(b.dataset.teklif); if (o) cayDoc(o, "Teklif"); }));
  document.querySelectorAll("[data-fis]").forEach((b) => b.addEventListener("click", () => { const o = cayFind(b.dataset.fis); if (o) cayDoc(o, "Fiş"); }));
  document.querySelectorAll("[data-caydel]").forEach((b) => b.addEventListener("click", () => { if (confirm("Sipariş silinsin mi?")) { store.gelenSiparisler = store.gelenSiparisler.filter((x) => x.id !== b.dataset.caydel); saveStore(); render(); } }));
}
function mountCayOcagi() {
  const k = document.querySelector('[data-act="cayKod"]');
  if (k) k.addEventListener("click", () => { const c = prompt("Çay ocağından gelen sipariş kodunu yapıştır (CAYSIP1:...)"); if (c) caySiparisAl(c); });
  const d = document.querySelector('[data-act="cayDosya"]');
  if (d) d.addEventListener("click", () => openFileImport(".txt,.caysip,text/plain", caySiparisAl));
  wireCayOcagi();
  wireTableSearch();
}

/* ============ Sayfa tablosu ============ */
const PAGES = {
  "cay-ocagi": { render: renderCayOcagi, mount: mountCayOcagi },
  duyurular: { render: renderDuyurular, mount: mountDuyurular },
  anasayfa: { render: renderAnasayfa, mount: mountAnasayfa },
  satis: { render: renderSatis, mount: mountSatis },
  "satis-detay": { render: renderSatisDetay, mount: mountSatisDetay },

  "rapor-gunluk": { render: renderRaporGunluk, mount: () => mountReport("rapor-gunluk") },
  "rapor-tarihsel": { render: renderRaporTarihsel, mount: () => mountReport("rapor-tarihsel") },
  "rapor-urunsel": { render: renderRaporUrunsel, mount: () => mountReport("rapor-urunsel") },
  "rapor-grupsal": { render: renderRaporGrupsal, mount: () => mountReport("rapor-grupsal") },
  "rapor-korelasyon": { render: renderRaporKorelasyon, mount: () => mountReport("rapor-korelasyon") },
  "rapor-stokhareket": { render: renderRaporStokHareket, mount: mountRaporStokHareket },
  "rapor-personelhareket": { render: renderRaporPersonel, mount: () => mountReport("rapor-personelhareket") },

  musteriler: { render: renderMusteriler, mount: mountMusteriler },
  "musteri-detay": { render: renderMusteriDetay, mount: mountMusteriDetay },

  urunler: { render: renderUrunler, mount: mountUrunler },
  "urun-ekle": { render: renderUrunEkle, mount: mountUrunEkle },
  "urun-varyantli": { render: () => renderUrunEkle(), mount: mountUrunEkle },
  "urun-gruplari": { render: () => crudPage({ title: "Ürün Grupları", key: "groups", newLabel: "Yeni Grup", columns: ["Sıra", "Grup Adı"], row: (g, i) => [i + 1, esc(g.ad)], fields: [{ key: "ad", label: "Grup Adı", req: true }] }), mount: () => mountCrud({ key: "groups", fields: [{ key: "ad", label: "Grup Adı", req: true }] }) },
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
function currentRoute() { return location.hash.replace(/^#\/?/, "") || "anasayfa"; }
function render() {
  const route = currentRoute();
  const page = PAGES[route] || PAGES.anasayfa;
  const content = document.getElementById("content");
  try { content.innerHTML = page.render(); } catch (e) { content.innerHTML = `<div class="card"><h1>Hata</h1><pre>${esc(e.message)}</pre></div>`; console.error(e); }
  setActiveMenu(route);
  content.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.goto)));
  if (page.mount) try { page.mount(); } catch (e) { console.error(e); }
  try { enhanceTables(); } catch (e) { console.error(e); }
  try { updateBell(); } catch (e) { console.error(e); }
  try { mobilTabloEtiketle(); mobilBarAktif(route); } catch (e) { console.error(e); }
  document.body.classList.remove("nav-open");
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", render);

/* ---- Mobil: tablo hücrelerine başlık etiketi ekle (dar ekranda kart görünümü için) ---- */
function mobilTabloEtiketle() {
  document.querySelectorAll("table.grid").forEach((tbl) => {
    const bas = [...tbl.querySelectorAll("thead th")].map((th) => (th.childNodes[0] ? th.childNodes[0].textContent : th.textContent).trim());
    tbl.querySelectorAll("tbody tr").forEach((tr) => {
      if (tr.classList.contains("empty-row")) return;
      [...tr.children].forEach((td, i) => { if (bas[i]) td.setAttribute("data-label", bas[i]); });
    });
  });
}

/* ---- Mobil alt sekme çubuğu ---- */
const MOBILBAR = [
  { ico: "🏠", label: "Ana", route: "anasayfa" },
  { ico: "🛒", label: "Satış", route: "satis" },
  { ico: "🍵", label: "Çay Ocağı", route: "cay-ocagi" },
  { ico: "📊", label: "Rapor", route: "rapor-gunluk" },
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
buildMenu();
initTopbar();
mobilBarKur();
render();
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
