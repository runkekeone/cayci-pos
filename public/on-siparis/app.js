(() => {
  const SUPABASE_URL = "https://zchubpqbvbhcuxclirur.supabase.co";
  const SUPABASE_KEY = "sb_publishable_m5HEx3mFrjDJHBe0qfUznQ_tXkoESp3";
  const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
  const cart = new Map();
  const CATEGORY_ORDER = ["Tumu", "Su", "Soda", "Ayran", "Caylar & Kahve", "Mesrubatlar", "Atistirmalik", "Temizlik", "Oyun", "Yan Urunler"];
  const categoryLabel = (category) => ({ Tumu: "Tüm ürünler", Su: "Su", Soda: "Soda", Ayran: "Ayran", "Caylar & Kahve": "Çaylar & Kahve", Mesrubatlar: "Meşrubatlar", Atistirmalik: "Atıştırmalık", Temizlik: "Temizlik", Oyun: "Oyun", "Yan Urunler": "Yan Ürünler" }[category] || category);
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
  const catalogMap = new Map();
  (window.BABUCO_CATALOG || []).filter((product) => product.active && product.name).forEach((product) => {
    const copy = productCopy(product.name);
    const prepared = { ...product, ...copy, salesCategory: salesCategory(product) };
    const key = `${prepared.salesCategory}|${prepared.title}`.toLocaleLowerCase("tr-TR");
    const previous = catalogMap.get(key);
    // Aynı ürünün açıklamasız kopyası varsa, paket bilgisini taşıyan kaydı göster.
    if (!previous || (prepared.detail && !previous.detail)) catalogMap.set(key, prepared);
  });
  const catalog = [...catalogMap.values()];
  const sb = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;
  let phone = "";
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
  const gross = () => currentItems().reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = () => payment === "nakit" ? Math.round(gross() * 5) / 100 : 0;
  const total = () => gross() - discount();
  const minimumUpfront = () => Math.round(total() * minimumUpfrontRate * 100) / 100;
  const openBalance = () => Math.round((total() - minimumUpfront()) * 100) / 100;
  const historyKey = () => `babuco:on-siparis:last:${phone}`;
  const loadLastOrder = () => { try { return JSON.parse(localStorage.getItem(historyKey()) || "null"); } catch { return null; } };
  const saveLastOrder = (order) => localStorage.setItem(historyKey(), JSON.stringify({ date: order.date, lines: order.lines }));

  function renderCategories() {
    $("#categories").innerHTML = CATEGORY_ORDER.map((category) => `<button class="category ${category === selectedCategory ? "active" : ""}" data-category="${escapeHtml(category)}" type="button">${escapeHtml(categoryLabel(category))}</button>`).join("");
    document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
      selectedCategory = button.dataset.category;
      renderCategories(); renderProducts();
    }));
  }

  function renderProducts() {
    const query = $("#search").value.trim().toLocaleLowerCase("tr-TR");
    const products = catalog.filter((product) => (selectedCategory === "Tumu" || product.salesCategory === selectedCategory) && (!query || `${product.name} ${product.salesCategory}`.toLocaleLowerCase("tr-TR").includes(query)));
    $("#catalogStatus").textContent = `${products.length} urun listeleniyor`;
    $("#products").innerHTML = products.map((product) => {
      const isPriceKnown = Number(product.price) > 0;
      return `<article class="product"><h3>${escapeHtml(product.title)}</h3>${product.detail ? `<p class="product-detail">${escapeHtml(product.detail)}</p>` : ""}<div class="product-bottom"><div class="price">${isPriceKnown ? money.format(product.price) : "Fiyat sorunuz"}<span class="unit">/${escapeHtml(product.unit)}</span></div>${isPriceKnown ? `<button class="add" type="button" data-add="${escapeHtml(product.id)}" aria-label="${escapeHtml(product.title)} ekle">+</button>` : ""}</div></article>`;
    }).join("") || "<p>Aramanizla eslesen urun yok.</p>";
    document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => add(button.dataset.add)));
  }

  function add(id) {
    const product = catalog.find((item) => item.id === id);
    if (!product) return;
    const item = cart.get(id) || { ...product, qty: 0 };
    item.qty += 1;
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
    $("#cartLines").innerHTML = items.map((item) => `<div class="cart-line"><div><h3>${escapeHtml(item.title || item.name)}</h3><p>${item.detail ? `${escapeHtml(item.detail)} · ` : ""}${money.format(item.price)} / ${escapeHtml(item.unit)}</p></div><div class="quantity"><button type="button" data-minus="${escapeHtml(item.id)}" aria-label="Azalt">-</button><span>${item.qty}</span><button type="button" data-plus="${escapeHtml(item.id)}" aria-label="Artir">+</button></div></div>`).join("");
    const upfrontRows = payment === "acik" && minimumUpfrontRate > 0
      ? `<div class="total-row"><span>Teslimde minimum ödeme (%${minimumUpfrontRate * 100})</span><b>${money.format(minimumUpfront())}</b></div><div class="total-row"><span>Açık hesaba yazılacak</span><b>${money.format(openBalance())}</b></div>` : "";
    $("#totals").innerHTML = `<div class="total-row"><span>Urunler toplami</span><b>${money.format(gross())}</b></div>${payment === "nakit" ? `<div class="total-row discount"><span>Nakit indirimi (%5)</span><b>-${money.format(discount())}</b></div>` : ""}${upfrontRows}<div class="total-row grand-total"><span>Odenecek tutar</span><span>${money.format(total())}</span></div>`;
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
    if (note) note.textContent = minimumUpfrontRate > 0 ? `Teslimde en az %${minimumUpfrontRate * 100} peşin ödeme` : "Cari hesaba yazilir";
  }

  async function loadMinimumPaymentRule() {
    minimumUpfrontRate = 0;
    if (!sb || !phone) return;
    try {
      const { data, error } = await sb.from("kv").select("value").eq("key", "babuco:on-siparis:policy:" + phone).maybeSingle();
      if (!error && data && data.value) minimumUpfrontRate = Number(data.value.minPesinOrani) || 0;
    } catch (error) { console.warn("Ön ödeme kuralı okunamadı", error); }
    renderMinimumPaymentNote();
    renderCart();
  }

  function startNewOrder() {
    cart.clear();
    phone = "";
    payment = "nakit";
    minimumUpfrontRate = 0;
    $("#note").value = "";
    $("#phone").value = "";
    $("#phoneCard").hidden = false;
    $("#catalog").hidden = true;
    $("#quickOrders").hidden = true;
    $("#receipt").hidden = true;
    openCart(false);
    renderCart();
    renderMinimumPaymentNote();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderQuickOrder() {
    const previous = loadLastOrder();
    const lines = previous && Array.isArray(previous.lines) ? previous.lines : [];
    const products = lines.map((line) => catalog.find((product) => product.id === line.catalogItemId)).filter(Boolean);
    $("#quickOrders").hidden = products.length === 0;
    if (!products.length) return;
    $("#quickOrderDate").textContent = new Date(previous.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
    $("#quickProducts").innerHTML = products.map((product) => `<button class="quick-product" type="button" data-quick-add="${escapeHtml(product.id)}"><span>${escapeHtml(product.title || product.name)}</span><b>${money.format(product.price)}</b><small>Tekrar ekle</small></button>`).join("");
    document.querySelectorAll("[data-quick-add]").forEach((button) => button.addEventListener("click", () => add(button.dataset.quickAdd)));
  }

  async function begin() {
    const digits = phoneDigits($("#phone").value);
    if (digits.length !== 10 || !digits.startsWith("5")) {
      $("#phoneError").textContent = "Lutfen 05 ile baslayan gecerli telefon numaranizi girin.";
      $("#phoneError").hidden = false;
      return;
    }
    phone = digits;
    $("#phoneError").hidden = true;
    $("#phoneCard").hidden = true;
    $("#catalog").hidden = false;
    renderQuickOrder();
    await loadMinimumPaymentRule();
    $("#search").focus();
  }

  async function submitOrder() {
    const items = currentItems();
    if (!items.length || !phone) return;
    const button = $("#submitOrder");
    button.disabled = true;
    button.textContent = "Gonderiliyor...";
    $("#submitError").hidden = true;
    const order = {
      id: uid(), date: new Date().toISOString(), status: "gonderildi", gonderim: "bulut",
      paymentType: payment, grossTotal: gross(), cashDiscount: discount(), total: total(),
      minimumUpfrontRate, minimumUpfrontAmount: payment === "acik" ? minimumUpfront() : 0, openBalanceAmount: payment === "acik" ? openBalance() : 0,
      note: $("#note").value.trim() || undefined,
      from: { name: `Telefon: ${formatPhone(phone)}`, phone: `0${phone}` },
      lines: items.map((item) => ({ catalogItemId: item.id, name: item.name, birim: item.unit, qty: item.qty, unitPrice: item.price })),
    };
    try {
      if (!sb) throw new Error("Baglanti hazir degil");
      const { error } = await sb.from("siparisler").upsert({ id: order.id, toptanci: "babuco", cay_ocagi: order.from.name, cay_tel: order.from.phone, payload: order, durum: "yeni", updated_at: new Date().toISOString() });
      if (error) throw error;
      saveLastOrder(order);
      cart.clear();
      renderCart();
      openCart(false);
      $("#receiptText").textContent = `Siparisiniz ${formatPhone(phone)} numarasi ile kaydedildi. Servis ekibi teslimat oncesi siparisinizi gorur.`;
      const openBreakdown = payment === "acik" && minimumUpfrontRate > 0
        ? `<div class="total-row"><span>Teslimde minimum ödeme</span><b>${money.format(minimumUpfront())}</b></div><div class="total-row"><span>Açık hesaba yazılacak</span><b>${money.format(openBalance())}</b></div>` : "";
      $("#receiptSummary").innerHTML = `<div class="total-row"><span>Odeme</span><b>${payment === "nakit" ? "Nakit" : payment === "kart" ? "Kart" : "Acik hesap"}</b></div><div class="total-row"><span>Kalem sayisi</span><b>${items.length}</b></div>${payment === "nakit" ? `<div class="total-row discount"><span>Nakit indirimi</span><b>-${money.format(discount())}</b></div>` : ""}${openBreakdown}<div class="total-row"><span>Toplam</span><b>${money.format(total())}</b></div>`;
      $("#receipt").hidden = false;
    } catch (error) {
      $("#submitError").textContent = "Siparis gonderilemedi. Baglantinizi kontrol edip tekrar deneyin.";
      $("#submitError").hidden = false;
      console.error(error);
    } finally {
      button.disabled = false;
      button.textContent = "Siparisi gonder";
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
  renderCategories(); renderProducts(); renderCart();
})();
