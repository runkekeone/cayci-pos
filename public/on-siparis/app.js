(() => {
  const SUPABASE_URL = "https://zchubpqbvbhcuxclirur.supabase.co";
  const SUPABASE_KEY = "sb_publishable_m5HEx3mFrjDJHBe0qfUznQ_tXkoESp3";
  const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
  const cart = new Map();
  const catalog = (window.BABUCO_CATALOG || []).filter((product) => product.active && product.name);
  const sb = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;
  let phone = "";
  let selectedCategory = "Tumu";
  let payment = "nakit";

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

  function renderCategories() {
    const categories = ["Tumu", ...new Set(catalog.map((p) => p.category).sort((a, b) => a.localeCompare(b, "tr")))];
    $("#categories").innerHTML = categories.map((category) => `<button class="category ${category === selectedCategory ? "active" : ""}" data-category="${escapeHtml(category)}" type="button">${escapeHtml(category === "Tumu" ? "Tum urunler" : category)}</button>`).join("");
    document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
      selectedCategory = button.dataset.category;
      renderCategories(); renderProducts();
    }));
  }

  function renderProducts() {
    const query = $("#search").value.trim().toLocaleLowerCase("tr-TR");
    const products = catalog.filter((product) => (selectedCategory === "Tumu" || product.category === selectedCategory) && (!query || `${product.name} ${product.category}`.toLocaleLowerCase("tr-TR").includes(query)));
    $("#catalogStatus").textContent = `${products.length} urun listeleniyor`;
    $("#products").innerHTML = products.map((product) => {
      const isPriceKnown = Number(product.price) > 0;
      return `<article class="product"><span class="product-category">${escapeHtml(product.category)}</span><h3>${escapeHtml(product.name)}</h3><div class="product-bottom"><div class="price">${isPriceKnown ? money.format(product.price) : "Fiyat sorunuz"}<span class="unit">/${escapeHtml(product.unit)}</span></div>${isPriceKnown ? `<button class="add" type="button" data-add="${escapeHtml(product.id)}" aria-label="${escapeHtml(product.name)} ekle">+</button>` : ""}</div></article>`;
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
    $("#cartCount").textContent = String(items.reduce((sum, item) => sum + item.qty, 0));
    $("#emptyCart").hidden = items.length > 0;
    $("#checkout").hidden = items.length === 0;
    $("#cartLines").innerHTML = items.map((item) => `<div class="cart-line"><div><h3>${escapeHtml(item.name)}</h3><p>${money.format(item.price)} / ${escapeHtml(item.unit)}</p></div><div class="quantity"><button type="button" data-minus="${escapeHtml(item.id)}" aria-label="Azalt">-</button><span>${item.qty}</span><button type="button" data-plus="${escapeHtml(item.id)}" aria-label="Artir">+</button></div></div>`).join("");
    $("#totals").innerHTML = `<div class="total-row"><span>Urunler toplami</span><b>${money.format(gross())}</b></div>${payment === "nakit" ? `<div class="total-row discount"><span>Nakit indirimi (%5)</span><b>-${money.format(discount())}</b></div>` : ""}<div class="total-row grand-total"><span>Odenecek tutar</span><span>${money.format(total())}</span></div>`;
    document.querySelectorAll("[data-minus]").forEach((button) => button.addEventListener("click", () => changeQty(button.dataset.minus, -1)));
    document.querySelectorAll("[data-plus]").forEach((button) => button.addEventListener("click", () => changeQty(button.dataset.plus, 1)));
  }

  function openCart(open) {
    $("#cartDrawer").classList.toggle("open", open);
    $("#cartDrawer").setAttribute("aria-hidden", String(!open));
    $("#backdrop").hidden = !open;
  }

  function begin() {
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
      note: $("#note").value.trim() || undefined,
      from: { name: `Telefon: ${formatPhone(phone)}`, phone: `0${phone}` },
      lines: items.map((item) => ({ catalogItemId: item.id, name: item.name, birim: item.unit, qty: item.qty, unitPrice: item.price })),
    };
    try {
      if (!sb) throw new Error("Baglanti hazir degil");
      const { error } = await sb.from("siparisler").upsert({ id: order.id, toptanci: "babuco", cay_ocagi: order.from.name, cay_tel: order.from.phone, payload: order, durum: "yeni", updated_at: new Date().toISOString() });
      if (error) throw error;
      openCart(false);
      $("#receiptText").textContent = `Siparisiniz ${formatPhone(phone)} numarasi ile kaydedildi. Servis ekibi teslimat oncesi siparisinizi gorur.`;
      $("#receiptSummary").innerHTML = `<div class="total-row"><span>Odeme</span><b>${payment === "nakit" ? "Nakit" : payment === "kart" ? "Kart" : "Acik hesap"}</b></div><div class="total-row"><span>Kalem sayisi</span><b>${items.length}</b></div>${payment === "nakit" ? `<div class="total-row discount"><span>Nakit indirimi</span><b>-${money.format(discount())}</b></div>` : ""}<div class="total-row"><span>Toplam</span><b>${money.format(total())}</b></div>`;
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
  $("#closeCart").addEventListener("click", () => openCart(false));
  $("#backdrop").addEventListener("click", () => openCart(false));
  $("#paymentOptions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-payment]"); if (!button) return;
    payment = button.dataset.payment;
    document.querySelectorAll("[data-payment]").forEach((item) => item.classList.toggle("selected", item === button));
    renderCart();
  });
  $("#submitOrder").addEventListener("click", submitOrder);
  $("#newOrder").addEventListener("click", () => window.location.reload());
  renderCategories(); renderProducts(); renderCart();
})();
