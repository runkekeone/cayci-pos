(() => {
  const SUPABASE_URL = "https://zchubpqbvbhcuxclirur.supabase.co";
  const SUPABASE_KEY = "sb_publishable_m5HEx3mFrjDJHBe0qfUznQ_tXkoESp3";
  /* Onay ekranındaki "WhatsApp'tan bize yazın" düğmesi: 90 ile başlayan numara (ör. "905XXXXXXXXX"). Boşsa düğme görünmez. */
  const WHATSAPP_NO = "";
  /* Servis günleri (0 = pazar): pazartesi ve perşembe. Öğleden önce verilen sipariş aynı günün servisine yazılır. */
  const SERVIS_GUNLERI = [1, 4];
  const SERVIS_SON_SAAT = 12;
  /* Bu telefonda hatırlanan numara: link bir dahaki açılışta numara sormadan girer. */
  const TEL_KEY = "babuco:on-siparis:tel";

  /* Fiyat yazımı: "60 ₺", kuruş varsa "62,50 ₺". */
  const tamSayi = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
  const kurusSayi = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = { format: (n) => { const v = Math.round((Number(n) || 0) * 100) / 100; return (Number.isInteger(v) ? tamSayi.format(v) : kurusSayi.format(v)) + " ₺"; } };
  const cart = new Map();
  /* Sekiz başlık (telefonda yana kayan tek satır). */
  const CATEGORY_ORDER = ["su-soda", "ayran-mesrubat", "cay", "sicak", "atistirmalik", "temizlik", "oyun", "diger"];
  const categoryLabel = (category) => ({ "su-soda": "Su & Soda", "ayran-mesrubat": "Ayran & Meşrubat", cay: "Çay", sicak: "Sıcak İçecekler", atistirmalik: "Atıştırmalık", temizlik: "Temizlik", oyun: "Oyun & Malzemeleri", diger: "Diğer" }[category] || category);
  function salesCategory(product) {
    const group = String(product.category || "");
    const name = String(product.name || "").toLocaleLowerCase("tr-TR");
    if (group === "Su" || group === "Sodalar") return "su-soda";
    if (/ayran|aroma|coca-cola|fanta|gazoz|sarıyer|sprite|kavanoz/.test(name) || group === "Soğuk İçecekler") return "ayran-mesrubat";
    if (group === "Çaylar" || /küp şeker/.test(name)) return "cay";
    if (group === "Toz İçecekler" || group === "Sıcak İçecekler" || (group === "Kahve & Yan Ürünler" && !/kıskaç/.test(name))) return "sicak";
    if (group === "Atıştırmalık") return "atistirmalik";
    if (group === "Temizlik" || group === "Kağıt & Hijyen") return "temizlik";
    if (group === "Oyun Kağıtları" || group === "Kırtasiye" || /okey|yazboz/.test(name)) return "oyun";
    return "diger";
  }
  /* Çeşitli ürünler tek satırda toplanır; dokununca çeşitleri açılır. label: çeşidin kısa adı. */
  const FAMILIES = [
    { id: "su", title: "Mavizade Su", test: /^Mavizade /i, label: (n) => n.replace(/^Mavizade /i, "") },
    { id: "sade-soda", title: "Sade Soda", test: /Sade Soda$/i, label: (n) => n.replace(/ Sade Soda$/i, "") },
    { id: "meyveli-soda", title: "Limonlu & Meyveli Soda", test: /(Elmalı|Mango|Karadut|Portakal|Mandalina|Limonlu|Ananas) Soda$/i, label: (n) => n.replace(/ Soda$/i, "") },
    { id: "toz", title: "Ori Toz İçecek", test: /^Ori .+ Toz İçecek$/i, label: (n) => n.replace(/^Ori /i, "").replace(/ Toz İçecek$/i, "") },
    { id: "aroma", title: "Aroma Meyve Suyu", test: /^Aroma /i, label: (n) => n.replace(/^Aroma /i, "") },
    { id: "filiz", title: "Filiz Çay 5 kg", test: /Filiz Çay 5 kg$/i, label: (n) => n.replace(/ Filiz Çay 5 kg$/i, "") },
    { id: "oyun-kagidi", title: "Oyun Kağıdı", test: /Oyun Kağıdı$/i, label: (n) => n.replace(/ ?Oyun Kağıdı$/i, "") || "Standart" },
    { id: "okey", title: "Okey Takımı", test: /Okey Takımı$/i, label: (n) => n.replace(/ Okey Takımı$/i, "") },
    { id: "yazboz", title: "Yazboz", test: /Yazboz$/i, label: (n) => n.replace(/ ?Yazboz$/i, "") || "Standart" },
    { id: "kek-top", title: "Eti Kek Top", test: /^Eti Kek Top /i, label: (n) => n.replace(/^Eti Kek Top /i, "") },
    { id: "kek-pop", title: "Eti Kek Pop", test: /^Eti Kek Pop /i, label: (n) => n.replace(/^Eti Kek Pop /i, "") },
    { id: "eti-cin", title: "Eti Cin", test: /^Eti Cin /i, label: (n) => n.replace(/^Eti Cin /i, "") },
    { id: "rondo", title: "Ülker Rondo", test: /^Ülker Rondo /i, label: (n) => n.replace(/^Ülker Rondo /i, "") },
    { id: "biskrem", title: "Ülker Biskrem Rulo", test: /^Ülker Biskrem /i, label: (n) => n.replace(/^Ülker Biskrem /i, "").replace(/ Rulo$/i, "") },
    { id: "ikram", title: "Ülker İkram", test: /^Ülker İkram /i, label: (n) => n.replace(/^Ülker İkram /i, "") },
    { id: "kraker", title: "Ülker Çubuk Kraker", test: /Çubuk Kraker$/i, label: (n) => n.replace(/^Ülker /i, "").replace(/ ?Çubuk Kraker$/i, "") || "Klasik" },
    { id: "kutu", title: "Kutu İçecekler (koli)", test: /( Kutu|Red Bull|Enerji İçeceği|Express Black|Coffee Latte)$/i, label: (n) => n.replace(/ Kutu$/i, "") },
    { id: "kola", title: "Coca-Cola & Fanta", test: /^(Coca-Cola|Fanta)$/i, label: (n) => n },
    { id: "gazoz", title: "Çamlıca Gazoz", test: /^Çamlıca Gazoz/i, label: (n) => n.replace(/^Çamlıca Gazoz ?/i, "") || "Standart" },
    { id: "tabak", title: "Çay Tabağı", test: /^Çay Tabağı/i, label: (n) => n.replace(/^Çay Tabağı ?/i, "") || "Standart" },
    { id: "kalem", title: "Kalem", test: /Kalem( 60'lı)?$/i, label: (n) => n },
  ];
  const familyOf = (title) => FAMILIES.find((f) => f.test.test(title)) || null;  // sıra önemli: ilk uyan aile
  function productCopy(name) {
    const match = String(name || "").match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    if (!match) return { title: String(name || ""), detail: "" };
    // Koli fiyatı karttaki satış fiyatıyla zaten gösteriliyor; içerikte yalnız paket bilgisi kalsın.
    const detail = match[2].replace(/\s*[·-]?\s*birim fiyatı\s*[^·)]+/i, "").trim();
    return { title: match[1].trim(), detail };
  }
  const nameKey = (name) => String(name || "").trim().toLocaleLowerCase("tr-TR");

  /* Katalog: panelin her kayıtta yayınladığı canlı katalog (kv "babuco:katalog"); okunamazsa sayfadaki yedek liste. */
  let catalog = [];
  function buildCatalog(list) {
    const map = new Map();
    list.filter((product) => product.active !== false && product.name && Number(product.price) > 0).forEach((product) => {
      const copy = productCopy(product.name);
      const prepared = { ...product, ...copy, listPrice: Number(product.price) || 0, salesCategory: salesCategory(product) };
      const family = familyOf(prepared.title);
      prepared.family = family ? family.id : "";
      prepared.variant = family ? family.label(prepared.title) : "";
      const key = `${prepared.salesCategory}|${prepared.title}`.toLocaleLowerCase("tr-TR");
      const previous = map.get(key);
      // Aynı ürünün açıklamasız kopyası varsa, paket bilgisini taşıyan kaydı göster.
      if (!previous || (prepared.detail && !previous.detail)) map.set(key, prepared);
    });
    catalog = [...map.values()];
  }
  buildCatalog(window.BABUCO_CATALOG || []);

  const sb = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;
  let phone = "";
  let customer = null;          // { ad, fy, son } — telefon müşteri kaydıyla eşleşirse
  let selectedCategory = "su-soda";
  const openFamilies = new Set();
  let payment = "nakit";
  let minimumUpfrontRate = 0;

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (text) => String(text).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
  const phoneDigits = (value) => value.replace(/\D/g, "").replace(/^90/, "").replace(/^0/, "");
  const formatPhone = (value) => {
    const d = phoneDigits(value).slice(0, 10);
    return d ? "0" + d.replace(/(\d{3})(\d{3})(\d{2})(\d{0,2})/, (_, a, b, c, e) => [a, b, c, e].filter(Boolean).join(" ")) : "";
  };
  const uid = () => "ws" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const currentItems = () => [...cart.values()];
  const total = () => Math.round(currentItems().reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;
  const minimumUpfront = () => Math.round(total() * minimumUpfrontRate * 100) / 100;
  const openBalance = () => Math.round((total() - minimumUpfront()) * 100) / 100;
  const historyKey = () => `babuco:on-siparis:last:${phone}`;
  const loadLastOrder = () => { try { return JSON.parse(localStorage.getItem(historyKey()) || "null"); } catch { return null; } };
  const saveLastOrder = (order) => { try { localStorage.setItem(historyKey(), JSON.stringify({ date: order.date, lines: order.lines })); } catch { /* özel pencere */ } };
  const paymentLabel = () => ({ nakit: "Nakit", kart: "Kart", acik: "Açık hesap" }[payment] || payment);

  async function kvRead(key) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: "no-store" });
    if (!response.ok) throw new Error("kv " + response.status);
    const rows = await response.json();
    return rows && rows[0] ? rows[0].value : null;
  }

  async function loadLiveCatalog() {
    try {
      const value = await kvRead("babuco:katalog");
      const list = value && Array.isArray(value.urunler) ? value.urunler : [];
      if (!list.length) return;
      buildCatalog(list.map((p) => ({ id: p.id, name: p.ad, category: p.grup, unit: p.birim || "Adet", price: Number(p.satis) || 0, active: true })));
      applyCustomerPrices();
      renderProducts(); renderQuickOrder(); renderCart();
    } catch (error) { console.warn("Canlı katalog okunamadı, yedek liste kullanılıyor", error); }
  }

  /* Telefon → müşterinin şifreli cari kaydı (cari sayfasıyla aynı kayıt): ad, özel fiyatlar, son fiş. */
  async function loadCustomer(tel10) {
    if (typeof cariAnahtar !== "function") return null;
    const t = await cariAnahtar("t", await cariTelTohum(tel10));
    const telRow = await kvRead(t.key);
    if (!telRow || !telRow.d) return null;
    const kod = String(JSON.parse(await cariCoz(t, telRow.d)).k || "");
    if (!kod) return null;
    const h = await cariAnahtar("h", kod);
    const row = await kvRead(h.key);
    if (!row || !row.d) return null;
    const account = JSON.parse(await cariCoz(h, row.d));
    const sales = (account.f || []).filter((s) => !s.iade && Array.isArray(s.k) && s.k.length).sort((a, b) => String(a.t) < String(b.t) ? -1 : 1);
    return { ad: String(account.ad || ""), fy: account.fy || {}, satislar: sales, kod };
  }

  function applyCustomerPrices() {
    const fy = (customer && customer.fy) || {};
    catalog.forEach((product) => {
      const special = Number(fy[product.id]);
      product.price = special > 0 ? special : product.listPrice;
      product.special = special > 0;
    });
    cart.forEach((item, id) => { const product = catalog.find((p) => p.id === id); if (product) { item.price = product.price; item.special = product.special; } });
  }

  function renderCategories() {
    $("#categories").innerHTML = CATEGORY_ORDER.map((category) => `<button class="category ${category === selectedCategory ? "active" : ""}" data-category="${escapeHtml(category)}" type="button">${escapeHtml(categoryLabel(category))}</button>`).join("");
    document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
      selectedCategory = button.dataset.category;
      $("#search").value = "";
      renderCategories(); renderProducts();
      const active = document.querySelector(".category.active");
      if (active) active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }));
  }

  const qtyOf = (id) => (cart.get(id) || {}).qty || 0;
  const stepper = (product) => {
    const q = qtyOf(product.id);
    return q
      ? `<div class="stepper"><button type="button" data-minus="${escapeHtml(product.id)}" aria-label="Azalt">−</button><span>${q}</span><button type="button" data-plus="${escapeHtml(product.id)}" aria-label="Artır">+</button></div>`
      : `<button class="add" type="button" data-add="${escapeHtml(product.id)}" aria-label="${escapeHtml(product.title)} ekle">+</button>`;
  };
  const unitText = (product) => `<span class="unit">/ ${escapeHtml(product.unit)}</span>`;
  function priceRange(items) {
    const prices = items.map((p) => p.price);
    const lo = Math.min(...prices), hi = Math.max(...prices);
    return lo === hi ? money.format(lo) : `${money.format(lo)} – ${money.format(hi)}`;
  }

  /* Seçili başlıktaki ürünler satır satır; aynı ailedekiler tek satırda, dokununca çeşitleri açılır.
     Arama yapılınca başlık fark etmez, eşleşen çeşitler açık gelir. */
  /* Ürünleri satırlara böler: aynı ailedekiler tek satır (sıra korunur). */
  function buildRows(products) {
    const rows = [], byFamily = new Map();
    products.forEach((product) => {
      if (!product.family) { rows.push({ product }); return; }
      if (!byFamily.has(product.family)) { const row = { family: FAMILIES.find((f) => f.id === product.family), items: [] }; byFamily.set(product.family, row); rows.push(row); }
      byFamily.get(product.family).items.push(product);
    });
    return rows;
  }
  function rowHtml(row, forceOpen, scope) {
    if (row.product || row.items.length === 1) {
      const product = row.product || row.items[0];
      const title = row.product || product.variant === "Standart" ? product.title : `${row.family.title} · ${product.variant}`;
      return `<article class="row"><div class="row-main"><h3>${escapeHtml(title)}</h3>${product.detail ? `<p class="product-detail">${escapeHtml(product.detail)}</p>` : ""}<p class="price">${money.format(product.price)}${unitText(product)}</p></div>${stepper(product)}</article>`;
    }
    const key = scope + ":" + row.family.id;
    const open = forceOpen || openFamilies.has(key);
    const picked = row.items.reduce((sum, p) => sum + qtyOf(p.id), 0);
    const samePrice = row.items.every((p) => p.price === row.items[0].price);
    const variants = open ? `<div class="variants">${row.items.map((product) => `<div class="variant"><div class="row-main"><h4>${escapeHtml(product.variant)}</h4>${samePrice ? "" : `<p class="price small">${money.format(product.price)}${unitText(product)}</p>`}</div>${stepper(product)}</div>`).join("")}</div>` : "";
    return `<article class="row family ${open ? "open" : ""}"><button class="family-head" type="button" data-family="${escapeHtml(key)}" aria-expanded="${open}"><div class="row-main"><h3>${escapeHtml(row.family.title)}</h3><p class="price">${priceRange(row.items)}${unitText(row.items[0])}</p><p class="product-detail">${row.items.length} çeşit</p></div><span class="family-side">${picked ? `<b class="picked">${picked}</b>` : ""}<span class="chevron" aria-hidden="true"></span></span></button>${variants}</article>`;
  }
  function bindRows(container) {
    container.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => add(button.dataset.add)));
    container.querySelectorAll("[data-plus]").forEach((button) => button.addEventListener("click", () => changeQty(button.dataset.plus, 1)));
    container.querySelectorAll("[data-minus]").forEach((button) => button.addEventListener("click", () => changeQty(button.dataset.minus, -1)));
    container.querySelectorAll("[data-family]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.family;
      if (openFamilies.has(id)) openFamilies.delete(id); else openFamilies.add(id);
      renderProducts();
    }));
  }

  /* Seçili başlıktaki ürünler satır satır; aynı ailedekiler tek satırda, dokununca çeşitleri açılır.
     Arama yapılınca başlık fark etmez, eşleşen çeşitler açık gelir. */
  function renderProducts() {
    const query = $("#search").value.trim().toLocaleLowerCase("tr-TR");
    const matches = (product) => !query || `${product.name} ${product.variant}`.toLocaleLowerCase("tr-TR").includes(query);
    const visible = catalog.filter((product) => (query || product.salesCategory === selectedCategory) && matches(product));
    const html = buildRows(visible).map((row) => rowHtml(row, !!query, "k")).join("");
    $("#catalogStatus").textContent = query ? `“${$("#search").value.trim()}” için ${visible.length} ürün` : "";
    $("#products").innerHTML = html || `<p class="empty-search">Aramanızla eşleşen ürün yok.</p>`;
    bindRows($("#products"));
    renderQuickOrder();
  }

  function add(id, qty) {
    const product = catalog.find((item) => item.id === id);
    if (!product || !(product.price > 0)) return;
    const item = cart.get(id) || { ...product, qty: 0 };
    item.qty += qty || 1;
    cart.set(id, item);
    renderCart(); renderProducts(); bump();
  }
  /* Ürün eklenince alttaki sepet bandı kısa bir tepki verir (tek efekt). */
  function bump() {
    const dock = $("#cartDock");
    dock.classList.remove("bump");
    void dock.offsetWidth;
    dock.classList.add("bump");
  }

  function changeQty(id, delta) {
    const item = cart.get(id);
    if (!item) return;
    item.qty += delta;
    if (delta > 0) bump();
    if (item.qty <= 0) cart.delete(id);
    else cart.set(id, item);
    renderCart(); renderProducts();
  }

  function renderCart() {
    const items = currentItems();
    const quantity = items.reduce((sum, item) => sum + item.qty, 0);
    $("#cartCount").textContent = String(quantity);
    $("#cartCount").hidden = quantity === 0;
    $("#dockCount").textContent = String(quantity);
    $("#dockTotal").textContent = money.format(total());
    $("#cartDock").hidden = items.length === 0;
    $("#emptyCart").hidden = items.length > 0;
    $("#checkout").hidden = items.length === 0;
    $("#cartLines").innerHTML = items.map((item) => `<div class="cart-line"><div class="row-main"><h3>${escapeHtml(item.variant ? `${FAMILIES.find((f) => f.id === item.family).title} · ${item.variant}` : (item.title || item.name))}</h3><p>${item.qty} × ${money.format(item.price)} = <b>${money.format(item.price * item.qty)}</b></p></div><div class="stepper"><button type="button" data-minus="${escapeHtml(item.id)}" aria-label="Azalt">−</button><span>${item.qty}</span><button type="button" data-plus="${escapeHtml(item.id)}" aria-label="Artır">+</button></div></div>`).join("");
    const upfrontRows = payment === "acik" && minimumUpfrontRate > 0
      ? `<div class="total-row"><span>Teslimde en az ödeme (%${minimumUpfrontRate * 100})</span><b>${money.format(minimumUpfront())}</b></div><div class="total-row"><span>Açık hesaba yazılacak</span><b>${money.format(openBalance())}</b></div>` : "";
    $("#totals").innerHTML = `${upfrontRows}<div class="total-row grand-total"><span>Toplam</span><span>${money.format(total())}</span></div>`;
    document.querySelectorAll("#cartLines [data-minus]").forEach((button) => button.addEventListener("click", () => changeQty(button.dataset.minus, -1)));
    document.querySelectorAll("#cartLines [data-plus]").forEach((button) => button.addEventListener("click", () => changeQty(button.dataset.plus, 1)));
  }

  function openCart(open) {
    $("#cartDrawer").classList.toggle("open", open);
    $("#cartDrawer").setAttribute("aria-hidden", String(!open));
    $("#backdrop").hidden = !open;
  }

  function renderMinimumPaymentNote() {
    const note = document.querySelector('[data-payment="acik"] small');
    if (note) note.textContent = minimumUpfrontRate > 0 ? `Teslimde en az %${minimumUpfrontRate * 100} peşin` : "Cari hesaba yazılır";
  }

  async function loadMinimumPaymentRule() {
    minimumUpfrontRate = 0;
    if (!phone) return;
    try {
      const value = await kvRead("babuco:on-siparis:policy:" + phone);
      if (value) minimumUpfrontRate = Number(value.minPesinOrani) || 0;
    } catch (error) { console.warn("Ön ödeme kuralı okunamadı", error); }
    renderMinimumPaymentNote();
    renderCart();
  }

  /* Sipariş gönderildikten sonra: sepet boşalır, müşteri girişli kalır. */
  function newOrder() {
    cart.clear();
    $("#note").value = "";
    $("#receipt").hidden = true;
    renderProducts(); renderCart();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* Çıkış: hatırlanan numara silinir, giriş ekranına dönülür. */
  function startNewOrder() {
    try { localStorage.removeItem(TEL_KEY); } catch { /* özel pencere */ }
    cart.clear();
    phone = "";
    customer = null;
    payment = "nakit";
    minimumUpfrontRate = 0;
    applyCustomerPrices();
    document.querySelectorAll("[data-payment]").forEach((item) => item.classList.toggle("selected", item.dataset.payment === "nakit"));
    $("#note").value = "";
    $("#phone").value = "";
    $("#phoneCard").hidden = false;
    $("#catalog").hidden = true;
    $("#quickOrders").hidden = true;
    $("#welcome").hidden = true;
    document.body.classList.remove("ordering");
    $("#accountFrame").removeAttribute("src");
    setTab("order");
    $("#priceNotice").hidden = true;
    $("#receipt").hidden = true;
    openCart(false);
    renderProducts();
    renderCart();
    renderMinimumPaymentNote();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* Sık aldıklarınız: müşterinin fişlerinde en çok geçen ürünler (adet değil, kaç fişte geçtiği; eşitlikte en
     yenisi). Aile ürünleri tek satırda toplanır. Müşteri tanınmadıysa bu telefondan verilen son ön sipariş. */
  const QUICK_LIMIT = 6;
  function frequentProducts() {
    const score = new Map();
    const bump = (product, when) => {
      const s = score.get(product.id) || { product, count: 0, last: "" };
      s.count += 1; if (String(when) > s.last) s.last = String(when);
      score.set(product.id, s);
    };
    const byName = (name) => catalog.find((p) => nameKey(p.name) === nameKey(name)) || catalog.find((p) => nameKey(p.title) === nameKey(name));
    if (customer && customer.satislar && customer.satislar.length) {
      customer.satislar.forEach((sale) => {
        const seen = new Set();
        sale.k.forEach(([name]) => { const p = byName(name); if (p && !seen.has(p.id)) { seen.add(p.id); bump(p, sale.t); } });
      });
    } else {
      const previous = loadLastOrder();
      (previous && Array.isArray(previous.lines) ? previous.lines : []).forEach((line) => { const p = catalog.find((x) => x.id === line.catalogItemId); if (p) bump(p, previous.date); });
    }
    return [...score.values()].sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1)).map((s) => s.product);
  }

  function renderQuickOrder() {
    const products = phone ? frequentProducts() : [];
    const rows = buildRows(products).slice(0, QUICK_LIMIT);
    $("#quickOrders").hidden = rows.length === 0;
    if (!rows.length) return;
    $("#quickProducts").innerHTML = rows.map((row) => rowHtml(row, false, "s")).join("");
    bindRows($("#quickProducts"));
  }

  /* Sekmeler aynı sayfada geçer: "Sipariş ver" katalog, "Hesabım" gömülü cari hesap (kişisel kodla, numara sormadan). */
  let pendingTab = location.hash === "#hesap" ? "account" : "order";
  function setTab(tab) {
    pendingTab = tab;
    document.querySelectorAll("[data-tab]").forEach((button) => {
      const on = button.dataset.tab === tab;
      button.classList.toggle("active", on);
      if (on) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    document.body.classList.toggle("tab-account", tab === "account");
    const loggedIn = !!phone;
    $("#accountPanel").hidden = tab !== "account" || !loggedIn;
    $("#catalog").hidden = tab !== "order" || !loggedIn;
    if (tab === "account" && loggedIn) {
      const frame = $("#accountFrame");
      const has = !!(customer && customer.kod);
      $("#accountNotice").hidden = has;
      $("#accountNotice").textContent = "Bu numarayla kayıtlı bir hesap bulamadık. Hesabınızı görmek için bize ulaşın.";
      frame.hidden = !has;
      const src = has ? `../cari/?gomulu=1#k=${encodeURIComponent(customer.kod)}` : "";
      if (has && frame.getAttribute("src") !== src) frame.setAttribute("src", src);
    }
    history.replaceState(null, "", tab === "account" ? "#hesap" : location.pathname + location.search);
    window.scrollTo({ top: 0 });
  }

  async function begin() {
    const digits = phoneDigits($("#phone").value);
    if (digits.length !== 10 || !digits.startsWith("5")) {
      $("#phoneError").textContent = "Lütfen 05 ile başlayan telefon numaranızı girin.";
      $("#phoneError").hidden = false;
      return;
    }
    phone = digits;
    $("#phoneError").hidden = true;
    const button = $("#startButton");
    button.disabled = true;
    button.classList.add("loading");
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span>Hesabınız açılıyor`;
    try { customer = await loadCustomer(digits); } catch (error) { console.warn("Müşteri kaydı okunamadı", error); customer = null; }
    button.disabled = false;
    button.classList.remove("loading");
    button.textContent = "Devam et";
    document.body.classList.add("ordering");
    try { localStorage.setItem(TEL_KEY, digits); } catch { /* özel pencere */ }
    applyCustomerPrices();
    $("#welcome").hidden = false;
    $("#welcome").innerHTML = `<div><b>${customer ? `Merhaba, ${escapeHtml(customer.ad)}` : escapeHtml(formatPhone(digits))}</b><span>${customer ? "Fiyatlar size özeldir." : "Numaranızla giriş yaptınız."}</span></div><button class="logout" type="button" id="logout">Çıkış</button>`;
    $("#logout").addEventListener("click", startNewOrder);
    $("#priceNotice").hidden = !!customer;
    $("#priceNotice").textContent = "Numaranız kayıtlarımızda bulunamadı. Liste fiyatları gösteriliyor; siparişiniz yine bize ulaşır, fiyatı teslimde hesabınıza göre yazılır.";
    $("#phoneCard").hidden = true;
    $("#catalog").hidden = false;
    setTab(pendingTab);
    renderProducts();
    renderQuickOrder();
    renderCart();
    await loadMinimumPaymentRule();
  }

  /* En yakın servis günü: bugün servis günüyse ve öğleden önceyse bugün; değilse sıradaki servis günü. */
  function nextServiceDay(now) {
    const d = new Date(now);
    if (SERVIS_GUNLERI.includes(d.getDay()) && d.getHours() < SERVIS_SON_SAAT) return { date: d, today: true };
    for (let i = 1; i <= 7; i++) {
      const n = new Date(d); n.setDate(d.getDate() + i);
      if (SERVIS_GUNLERI.includes(n.getDay())) return { date: n, today: false };
    }
    return { date: d, today: false };
  }

  async function submitOrder() {
    const items = currentItems();
    if (!items.length || !phone) return;
    const button = $("#submitOrder");
    button.disabled = true;
    button.textContent = "Gönderiliyor…";
    $("#submitError").hidden = true;
    const order = {
      id: uid(), date: new Date().toISOString(), status: "gonderildi", gonderim: "bulut",
      paymentType: payment, grossTotal: total(), cashDiscount: 0, total: total(),
      minimumUpfrontRate, minimumUpfrontAmount: payment === "acik" ? minimumUpfront() : 0, openBalanceAmount: payment === "acik" ? openBalance() : 0,
      note: $("#note").value.trim() || undefined,
      from: { name: customer ? customer.ad : `Telefon: ${formatPhone(phone)}`, phone: `0${phone}` },
      lines: items.map((item) => ({ catalogItemId: item.id, name: item.name, birim: item.unit, qty: item.qty, unitPrice: item.price, ozelFiyat: !!item.special })),
    };
    try {
      if (!sb) throw new Error("Bağlantı hazır değil");
      const { error } = await sb.from("siparisler").upsert({ id: order.id, toptanci: "babuco", cay_ocagi: order.from.name, cay_tel: order.from.phone, payload: order, durum: "yeni", updated_at: new Date().toISOString() });
      if (error) throw error;
      saveLastOrder(order);
      cart.clear();
      renderCart();
      openCart(false);
      const service = nextServiceDay(new Date());
      const dayText = service.today ? "bugünkü" : service.date.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
      $("#receiptTitle").textContent = customer ? `Teşekkür ederiz, ${customer.ad}` : "Teşekkür ederiz";
      $("#receiptText").textContent = `Siparişiniz ${dayText} servisinde teslim edilecek.`;
      const openBreakdown = payment === "acik" && minimumUpfrontRate > 0
        ? `<div class="total-row"><span>Teslimde en az ödeme</span><b>${money.format(minimumUpfront())}</b></div><div class="total-row"><span>Açık hesaba yazılacak</span><b>${money.format(openBalance())}</b></div>` : "";
      $("#receiptSummary").innerHTML = items.map((item) => `<div class="total-row line"><span>${item.qty} × ${escapeHtml(item.title || item.name)}</span><b>${money.format(item.price * item.qty)}</b></div>`).join("")
        + `<div class="total-row"><span>Ödeme</span><b>${paymentLabel()}</b></div>${openBreakdown}<div class="total-row grand-total"><span>Toplam</span><span>${money.format(order.total)}</span></div>`;
      const wa = $("#whatsappLink");
      wa.hidden = !WHATSAPP_NO;
      if (WHATSAPP_NO) wa.href = `https://wa.me/${WHATSAPP_NO}?text=${encodeURIComponent(`Merhaba, ${order.from.name} adına önden sipariş verdim (${money.format(order.total)}).`)}`;
      $("#receipt").hidden = false;
    } catch (error) {
      $("#submitError").textContent = "Sipariş gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.";
      $("#submitError").hidden = false;
      console.error(error);
    } finally {
      button.disabled = false;
      button.textContent = "Siparişi gönder";
    }
  }

  $("#phone").addEventListener("input", (event) => { event.target.value = formatPhone(event.target.value); });
  $("#phone").addEventListener("keydown", (event) => { if (event.key === "Enter") begin(); });
  $("#startButton").addEventListener("click", begin);
  $("#search").addEventListener("input", renderProducts);
  $("#cartButton").addEventListener("click", () => openCart(true));
  $("#cartDock").addEventListener("click", () => openCart(true));
  $("#closeCart").addEventListener("click", () => openCart(false));
  $("#backdrop").addEventListener("click", () => openCart(false));
  $("#paymentOptions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-payment]"); if (!button) return;
    payment = button.dataset.payment;
    document.querySelectorAll("[data-payment]").forEach((item) => item.classList.toggle("selected", item === button));
    renderCart();
  });
  $("#submitOrder").addEventListener("click", submitOrder);
  $("#newOrder").addEventListener("click", newOrder);
  $("#closeReceipt").addEventListener("click", newOrder);
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
  /* Arama + başlıklar yapışınca altına ince gölge. */
  window.addEventListener("scroll", () => {
    const tools = document.querySelector(".catalog-tools");
    if (tools) tools.classList.toggle("stuck", tools.getBoundingClientRect().top <= 0 && window.scrollY > 0);
  }, { passive: true });
  applyCustomerPrices();
  renderCategories(); renderProducts(); renderCart();
  loadLiveCatalog();
  setTab(pendingTab);
  try {
    const saved = localStorage.getItem(TEL_KEY);
    if (saved && /^5\d{9}$/.test(saved)) { $("#phone").value = formatPhone(saved); begin(); }
  } catch { /* özel pencere */ }
})();
