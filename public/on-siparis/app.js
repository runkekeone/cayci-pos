(() => {
  const SUPABASE_URL = "https://zchubpqbvbhcuxclirur.supabase.co";
  const SUPABASE_KEY = "sb_publishable_m5HEx3mFrjDJHBe0qfUznQ_tXkoESp3";
  /* Onay ekranındaki "WhatsApp'tan bize yazın" düğmesi: 90 ile başlayan numara (ör. "905XXXXXXXXX"). Boşsa düğme görünmez. */
  const WHATSAPP_NO = "";
  /* Servis günleri (0 = pazar): pazartesi ve perşembe. Öğleden önce verilen sipariş aynı günün servisine yazılır. */
  const SERVIS_GUNLERI = [1, 4];
  const SERVIS_SON_SAAT = 12;

  const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
  const cart = new Map();
  const CATEGORY_ORDER = ["Tumu", "Su", "Soda", "Ayran", "Caylar & Kahve", "Mesrubatlar", "Atistirmalik", "Temizlik", "Oyun", "Yan Urunler"];
  const categoryLabel = (category) => ({ Tumu: "Tüm ürünler", Su: "Su", Soda: "Soda", Ayran: "Ayran", "Caylar & Kahve": "Çay & Kahve", Mesrubatlar: "Meşrubat", Atistirmalik: "Atıştırmalık", Temizlik: "Temizlik", Oyun: "Oyun", "Yan Urunler": "Diğer" }[category] || category);
  function salesCategory(product) {
    const group = String(product.category || "");
    const name = String(product.name || "").toLocaleLowerCase("tr-TR");
    if (group === "Su") return "Su";
    if (group === "Sodalar") return "Soda";
    if (name.includes("ayran")) return "Ayran";
    if (group === "Atıştırmalık") return "Atistirmalik";
    if (group === "Temizlik" || group === "Kağıt & Hijyen") return "Temizlik";
    if (group === "Oyun Kağıtları" || /okey|yazboz/.test(name)) return "Oyun";
    if (["Çaylar", "Kahve & Yan Ürünler", "Sıcak İçecekler", "Toz İçecekler"].includes(group)) return "Caylar & Kahve";
    if (group === "Soğuk İçecekler" || /aroma|coca-cola|çamlıca|fanta|sarıyer/.test(name)) return "Mesrubatlar";
    return "Yan Urunler";
  }
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
    list.filter((product) => product.active !== false && product.name).forEach((product) => {
      const copy = productCopy(product.name);
      const prepared = { ...product, ...copy, listPrice: Number(product.price) || 0, salesCategory: salesCategory(product) };
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
  let selectedCategory = "Su";
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
    return { ad: String(account.ad || ""), fy: account.fy || {}, son: sales[sales.length - 1] || null };
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
      renderCategories(); renderProducts();
    }));
  }

  function priceHtml(product) {
    return `${money.format(product.price)}<span class="unit">/ ${escapeHtml(product.unit)}</span>`;
  }

  function renderProducts() {
    const query = $("#search").value.trim().toLocaleLowerCase("tr-TR");
    const products = catalog.filter((product) => (selectedCategory === "Tumu" || product.salesCategory === selectedCategory) && (!query || `${product.name} ${product.salesCategory}`.toLocaleLowerCase("tr-TR").includes(query)));
    $("#catalogStatus").textContent = `${products.length} ürün`;
    $("#products").innerHTML = products.map((product) => {
      const isPriceKnown = Number(product.price) > 0;
      return `<article class="product"><h3>${escapeHtml(product.title)}</h3>${product.detail ? `<p class="product-detail">${escapeHtml(product.detail)}</p>` : ""}<div class="product-bottom"><div class="price">${isPriceKnown ? priceHtml(product) : "Fiyat sorunuz"}</div>${isPriceKnown ? `<button class="add" type="button" data-add="${escapeHtml(product.id)}" aria-label="${escapeHtml(product.title)} ekle">+</button>` : ""}</div></article>`;
    }).join("") || `<p class="empty-search">Aramanızla eşleşen ürün yok.</p>`;
    document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => add(button.dataset.add)));
  }

  function add(id, qty) {
    const product = catalog.find((item) => item.id === id);
    if (!product || !(product.price > 0)) return;
    const item = cart.get(id) || { ...product, qty: 0 };
    item.qty += qty || 1;
    cart.set(id, item);
    renderCart();
  }

  function changeQty(id, delta) {
    const item = cart.get(id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart.delete(id);
    else cart.set(id, item);
    renderCart();
  }

  function renderCart() {
    const items = currentItems();
    const quantity = items.reduce((sum, item) => sum + item.qty, 0);
    $("#cartCount").textContent = String(quantity);
    $("#dockCount").textContent = String(quantity);
    $("#dockTotal").textContent = money.format(total());
    $("#cartDock").hidden = items.length === 0;
    $("#emptyCart").hidden = items.length > 0;
    $("#checkout").hidden = items.length === 0;
    $("#cartLines").innerHTML = items.map((item) => `<div class="cart-line"><div><h3>${escapeHtml(item.title || item.name)}</h3><p>${item.detail ? `${escapeHtml(item.detail)} · ` : ""}${money.format(item.price)} / ${escapeHtml(item.unit)}</p></div><div class="quantity"><button type="button" data-minus="${escapeHtml(item.id)}" aria-label="Azalt">−</button><span>${item.qty}</span><button type="button" data-plus="${escapeHtml(item.id)}" aria-label="Artır">+</button></div></div>`).join("");
    const upfrontRows = payment === "acik" && minimumUpfrontRate > 0
      ? `<div class="total-row"><span>Teslimde en az ödeme (%${minimumUpfrontRate * 100})</span><b>${money.format(minimumUpfront())}</b></div><div class="total-row"><span>Açık hesaba yazılacak</span><b>${money.format(openBalance())}</b></div>` : "";
    $("#totals").innerHTML = `${upfrontRows}<div class="total-row grand-total"><span>Toplam</span><span>${money.format(total())}</span></div>`;
    document.querySelectorAll("[data-minus]").forEach((button) => button.addEventListener("click", () => changeQty(button.dataset.minus, -1)));
    document.querySelectorAll("[data-plus]").forEach((button) => button.addEventListener("click", () => changeQty(button.dataset.plus, 1)));
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

  function startNewOrder() {
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
    $("#priceNotice").hidden = true;
    $("#receipt").hidden = true;
    openCart(false);
    renderProducts();
    renderCart();
    renderMinimumPaymentNote();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* Son sipariş: müşterinin sistemdeki son fişi; yoksa bu telefondan verilen son ön sipariş. */
  function lastOrderLines() {
    if (customer && customer.son) {
      const lines = customer.son.k.map(([name, qty]) => {
        const product = catalog.find((p) => nameKey(p.name) === nameKey(name)) || catalog.find((p) => nameKey(p.title) === nameKey(name));
        return product ? { product, qty: Number(qty) || 1 } : null;
      }).filter(Boolean);
      if (lines.length) return { date: customer.son.t, lines };
    }
    const previous = loadLastOrder();
    const lines = previous && Array.isArray(previous.lines) ? previous.lines.map((line) => {
      const product = catalog.find((p) => p.id === line.catalogItemId);
      return product ? { product, qty: Number(line.qty) || 1 } : null;
    }).filter(Boolean) : [];
    return lines.length ? { date: previous.date, lines } : null;
  }

  function renderQuickOrder() {
    const last = phone ? lastOrderLines() : null;
    $("#quickOrders").hidden = !last;
    if (!last) return;
    $("#quickOrderDate").textContent = new Date(last.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
    $("#quickProducts").innerHTML = `<button class="repeat-order" type="button" id="repeatOrder">Aynısını sepete ekle</button>` + last.lines.map(({ product, qty }) => `<button class="quick-product" type="button" data-quick-add="${escapeHtml(product.id)}"><span>${qty} × ${escapeHtml(product.title || product.name)}</span><b>${money.format(product.price)}</b></button>`).join("");
    document.querySelectorAll("[data-quick-add]").forEach((button) => button.addEventListener("click", () => add(button.dataset.quickAdd)));
    $("#repeatOrder").addEventListener("click", () => { last.lines.forEach(({ product, qty }) => add(product.id, qty)); openCart(true); });
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
    button.textContent = "Hesabınız açılıyor…";
    try { customer = await loadCustomer(digits); } catch (error) { console.warn("Müşteri kaydı okunamadı", error); customer = null; }
    button.disabled = false;
    button.textContent = "Devam et";
    applyCustomerPrices();
    $("#welcome").hidden = !customer;
    if (customer) $("#welcome").textContent = `Hoş geldiniz, ${customer.ad}. Fiyatlar size özel fiyatlarınızdır.`;
    $("#priceNotice").hidden = !!customer;
    $("#priceNotice").textContent = "Numaranız kayıtlarımızda bulunamadı. Liste fiyatları gösteriliyor; siparişiniz yine bize ulaşır, fiyatı teslimde hesabınıza göre yazılır.";
    $("#phoneCard").hidden = true;
    $("#catalog").hidden = false;
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
  $("#newOrder").addEventListener("click", startNewOrder);
  $("#closeReceipt").addEventListener("click", startNewOrder);
  applyCustomerPrices();
  renderCategories(); renderProducts(); renderCart();
  loadLiveCatalog();
})();
