// Genel görünüş — davranış denemeleri (sahte bulut, uydurma veri). Kökten: node testler/gorsel/genel-davranis.mjs
//  1) para yazımı  2) geri oku yalnız alt sayfada  3) menü: 8 satır, hepsi doğru sayfaya gidiyor; çıkarılan sayfalar adresle açılıyor
//  4) ana ekran + günlük rapor: üç büyük rakam kasaHesap ile aynı, "Ayrıntı" açılıp kapanıyor  5) üst çubuk / alt menü
//  6) emoji kalmadı  7) hiçbir ekranda yana taşma yok (390 ve 360 px)
import { execFileSync } from "node:child_process";
import path from "node:path";
import { denetci, bekle, DEPO } from "../ortak/panel.mjs";
import { genelStore, ac } from "./genel-cek.mjs";

const d = denetci("gorsel/genel-davranis");
const t = await ac(genelStore(), { genislik: 390 });
const { page, git } = t;
try {
  /* ---- 1) para yazımı ---- */
  const para = await page.evaluate(() => [12890, 12890.5, -1250, 0, 1234567, 1234567.89, 0.1 + 0.2, 1848.1499999999996, -0.004, 999.999, "75", null, undefined, NaN].map((x) => money.format(x)));
  d.esit(para, ["12.890 ₺", "12.890,50 ₺", "-1.250 ₺", "0 ₺", "1.234.567 ₺", "1.234.567,89 ₺", "0,30 ₺", "1.848,15 ₺", "0 ₺", "1.000 ₺", "75 ₺", "0 ₺", "0 ₺", "0 ₺"],
    "para: tam sayı kuruşsuz, kuruş varsa iki hane, eksi, sıfır, büyük sayı, yuvarlama (-0 yok), boş değer");
  d.esit(await page.evaluate(() => [paraBelge.format(12890), csvTutar.format(12890)]), ["₺12.890,00", "12.890,00"], "müşteriye giden belge ve CSV eski biçimde (kuruşlar hizalı)");
  const belge = await page.evaluate(() => { const s = store.sales.find((x) => x.musteriId === "m5"); return { metin: saleIrsaliyeMetni(s), ekstre: ekstreSatirlari("m5", "tumu").map((r) => r.r || "").join("|") }; });
  d.dogru(/TOPLAM: ₺3\.060,00/.test(belge.metin) && !/\d ₺/.test(belge.metin), "WhatsApp irsaliye metni eski biçimde: TOPLAM: ₺3.060,00");
  d.dogru(/₺3\.060,00/.test(belge.ekstre) && !/\d ₺/.test(belge.ekstre), "hesap özeti görseli satırları eski biçimde");
  const yazi = await page.evaluate(() => { const e = document.createElement("span"); e.className = "s-value"; document.body.appendChild(e); const c = getComputedStyle(e); const r = [c.fontFamily, c.fontVariantNumeric, getComputedStyle(document.body).fontVariantNumeric]; e.remove(); return r; });
  d.dogru(!/Fira Code|mono/i.test(yazi[0]) && /tabular-nums/.test(yazi[1]) && /tabular-nums/.test(yazi[2]), "rakamlar daktilo yazısıyla değil; tabular-nums açık (" + yazi[0].split(",")[0] + ")");

  /* ---- 2) geri oku ---- */
  const geriVar = async () => page.evaluate(() => !!document.querySelector("#content .page-head [data-goback]"));
  const kokler = ["anasayfa", "rota", "dukkan", "rapor-gunluk", "musteriler", "urunler", "giderler", "cay-ocagi", "stok-sayimi", "alis-faturalari", "alinacaklar", "fiyat-bakim", "harita", "profilim", "duyurular", "arac-yukleme"];
  const kokSonuc = []; for (const y of kokler) { await git(y); if (await geriVar()) kokSonuc.push(y); }
  d.esit(kokSonuc, [], "kök ekranlarda (alt çubuk + menüden gelinen) geri oku yok");
  await page.evaluate(() => { selectedCustomerId = "m5"; }); await git("musteri-detay"); const g1 = await geriVar();
  await page.evaluate(() => { editProductId = "u1"; }); await git("urun-ekle"); const g2 = await geriVar();
  await git("alis-olustur"); const g3 = await geriVar(); await git("toplu-zam"); const g4 = await geriVar(); await git("fiyat-gecmisi"); const g5 = await geriVar();
  d.esit([g1, g2, g3, g4, g5], [true, true, true, true, true], "alt sayfalarda geri oku var (müşteri detayı, ürün düzenle, alış oluştur, toplu zam, fiyat geçmişi)");
  await git("musteriler"); await page.evaluate(() => openCustomerDetail("m5")); await bekle(300);
  await page.click("#content .page-head [data-goback]"); await bekle(400);
  d.esit(await page.evaluate(() => currentRoute()), "musteriler", "geri oku bir önceki ekrana dönüyor (müşteri detayı → müşteriler)");
  d.dogru(await page.evaluate(() => { const b = document.createElement("div"); b.innerHTML = pageHead("x"); return true; }), "pageHead çağrısı aynı (başlık, alt yazı, düğmeler)");

  /* ---- 3) menü ---- */
  await git("anasayfa");
  const menu = await page.evaluate(() => [...document.querySelectorAll("#menu > .menu-item")].map((li) => ({ ad: li.querySelector(".m-text").textContent, ikon: !!li.querySelector(".m-ico svg.ikon"), alt: [...li.querySelectorAll(".submenu a")].map((a) => a.dataset.route), yol: (li.querySelector(":scope > a[data-route]") || { dataset: {} }).dataset.route || null })));
  d.esit(menu.map((m) => m.ad), ["Bugünün Özeti", "Satış Yap", "Rota", "Müşteriler", "Çay Ocağı Siparişleri", "Ürünler ve Stok", "Raporlar ve Giderler", "Diğer"], "yan menü 8 satır");
  d.dogru(menu.every((m) => m.ikon), "her menü satırında çizgi ikon var");
  const kullanilan = ["satis", "rota", "harita", "musteriler", "urunler", "fiyat-bakim", "alinacaklar", "arac-yukleme", "stok-sayimi", "alis-faturalari", "giderler", "rapor-gunluk", "rapor-urunsel", "musteri-analiz", "servis-raporlari", "cay-ocagi", "duyurular", "profilim", "dukkan", "anasayfa"];
  const menudeki = menu.flatMap((m) => (m.yol ? [m.yol] : m.alt));
  d.esit(kullanilan.filter((y) => !menudeki.includes(y)), [], "kullanılan bütün ekranlar menüde");
  const diger = menu[7].alt, disarida = menu.slice(0, 7).flatMap((m) => (m.yol ? [m.yol] : m.alt));
  d.dogru(["firmalar", "personeller", "gorevler", "odeme-tipleri", "efatura-giden", "urun-varyantlari", "alt-urun", "etiket-tasarla", "terazi-cikti", "urun-transfer"].every((y) => diger.includes(y) && !disarida.includes(y)), "kullanılmayan bölümler yalnız 'Diğer'in altında");
  // her menü satırı: dokun → doğru adres + ekran hatasız çiziliyor
  const yanlis = [];
  for (const yol of menudeki) {
    await page.evaluate(() => { location.hash = "#/anasayfa"; }); await bekle(120);
    await page.click("#hamburger"); await bekle(250);
    const ustAcik = await page.evaluate((y) => { const a = document.querySelector(`#menu a[data-route="${y}"]`); const li = a.closest(".menu-item"); if (li.classList.contains("has-sub") && !li.classList.contains("open")) li.querySelector(".parent").click(); return true; }, yol);
    await bekle(120);
    await page.click(`#menu a[data-route="${yol}"]`); await bekle(300);
    const durum = await page.evaluate(() => ({ yol: currentRoute(), hata: !!document.querySelector("#content > .card > h1") && /Hata/.test(document.querySelector("#content > .card > h1").textContent), dolu: document.getElementById("content").children.length > 0, cekmece: document.body.classList.contains("nav-open") }));
    if (!ustAcik || durum.yol !== yol || durum.hata || !durum.dolu || durum.cekmece) yanlis.push(yol + JSON.stringify(durum));
  }
  d.esit(yanlis, [], "menüdeki " + menudeki.length + " satırın hepsi doğru sayfayı açıyor, çekmece kapanıyor");
  await page.evaluate(() => { location.hash = "#/anasayfa"; }); await bekle(250); await page.click("#hamburger"); await bekle(250);
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#menu > .menu-item")].filter((li) => getComputedStyle(li).display !== "none").length + "/" + [...document.querySelectorAll("#menu .submenu")].filter((u) => getComputedStyle(u).display !== "none").length), "8/0", "ana ekranda menü açılınca 8 satır görünür, hiçbir grup açık değil");
  await page.click('.menu-item[data-idx="7"] > a.parent'); await bekle(150); await page.click('.menu-item[data-idx="5"] > a.parent'); await bekle(150);
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#menu .menu-item.open")].map((li) => li.querySelector(".m-text").textContent)), ["Ürünler ve Stok"], "aynı anda tek grup açık kalıyor");
  await page.evaluate(() => document.getElementById("navScrim").click());
  // menüde hiç olmayan sayfalar adresle açılıyor
  const adresle = [];
  for (const yol of ["urun-ekle", "alis-olustur", "toplu-zam", "fiyat-gecmisi", "rota-olustur", "satis-detay", "tsiparis-detay", "stok-sayimi-detay", "musteri-detay"].concat(diger)) {
    await page.evaluate((y) => { location.hash = "#/" + y; }, yol); await bekle(180);
    const ok = await page.evaluate((y) => currentRoute() === y && !!PAGES[y] && document.getElementById("content").children.length > 0 && !/^Hata/.test((document.querySelector("#content h1") || {}).textContent || ""), yol);
    if (!ok) adresle.push(yol);
  }
  d.esit(adresle, [], "menüden çıkarılan / 'Diğer'e alınan sayfalar adresle (#/…) hâlâ açılıyor");
  d.esit(await page.evaluate(() => Object.keys(PAGES).length), 56, "hiçbir sayfa silinmedi (taban ile aynı: 56 adres)");

  /* ---- 4) ana ekran: üç büyük rakam ---- */
  await git("anasayfa");
  const ozet = () => page.evaluate(() => {
    const k = kasaHesap(todayStr(), todayStr()), ciro = store.sales.filter((s) => isToday(s.tarih)).reduce((a, s) => a + s.toplam, 0);
    const b = [...document.querySelectorAll(".gg-ozet .gg-buyuk .stat")].map((e) => [e.querySelector(".s-label").textContent, e.querySelector(".s-value").textContent]);
    const ay = document.querySelector(".gg-ozet .gg-ayrinti"), btn = document.querySelector(".gg-ayrinti-btn");
    return { b, beklenen: [["Kasadaki nakit", money.format(k.nakitKasa)], ["Bugünkü ciro", money.format(ciro)], ["Net kâr", money.format(k.netKar)]], gizli: ay.hidden || getComputedStyle(ay).display === "none", acikMi: btn.getAttribute("aria-expanded"), yazi: btn.textContent.trim(), satir: [...ay.querySelectorAll(".s-label")].map((e) => e.textContent), yukseklik: Math.round(document.querySelector(".gg-buyuk .s-value").getBoundingClientRect().height), boy: parseFloat(getComputedStyle(document.querySelector(".gg-buyuk .s-value")).fontSize), eskiKutu: document.querySelectorAll("#content .summary-grid").length, rozet: document.querySelectorAll("#content .s-trend").length };
  });
  let o = await ozet();
  d.esit(o.b, o.beklenen, "ana ekran: üç büyük rakam = kasadaki nakit, bugünkü ciro, net kâr (kasaHesap ile aynı değerler)");
  d.dogru(o.boy >= 24 && o.eskiKutu === 0 && o.rozet === 0, "büyük rakamlar ≥ 24 px (" + o.boy + "); eski kutu ızgarası ve yüzde rozeti yok");
  d.esit([o.gizli, o.acikMi, o.yazi], [true, "false", "Ayrıntı"], "ayrıntı başta kapalı");
  d.esit(o.satir, ["Nakit", "POS", "Açık Hesap", "Kart / Havale ile Gelen", "Gider (bugün)", "Kâr (bugün)", "Kâr Oranı", "Toplam Alacak"], "ayrıntıdaki satırlar (geri kalan rakamların hepsi duruyor)");
  await page.click(".gg-ayrinti-btn"); await bekle(150); o = await ozet();
  d.esit([o.gizli, o.acikMi, o.yazi], [false, "true", "Ayrıntıyı gizle"], "Ayrıntı'ya dokununca açılıyor");
  await page.evaluate(() => render()); await bekle(150); o = await ozet();
  d.esit(o.gizli, false, "ekran yeniden çizilince (eşitleme) açık kalıyor");
  await page.click(".gg-ayrinti-btn"); await bekle(150); o = await ozet();
  d.esit([o.gizli, o.acikMi], [true, "false"], "tekrar dokununca kapanıyor");
  const not = await page.evaluate(() => [...document.querySelectorAll(".gg-buyuk .gg-not")].map((e) => e.textContent));
  d.dogru(/^Dünden [\d.,]+ ₺ (fazla|az)$/.test(not[0]) && !/%/.test(not.join(" ")), "ciro altında düz cümle: '" + not[0] + "' (yüzde yok)");
  d.esit(await page.evaluate(() => [ggDunFarki(5000, 800), ggDunFarki(800, 5000), ggDunFarki(100, 0), ggDunFarki(0, 0), ggDunFarki(0, 900), ggDunFarki(250, 250)]), ["Dünden 4.200 ₺ fazla", "Dünden 4.200 ₺ az", "", "", "", "Dünle aynı"], "dün kıyası: fazla / az / dün ya da bugün satış yoksa hiçbir şey");
  d.dogru(await page.evaluate(() => !document.querySelector('#content .page-head [data-goto="rapor-gunluk"]') && !/Raporlar/.test(document.querySelector("#content .page-head").textContent)), "ana ekranda 'Raporlar' düğmesi yok");
  d.dogru(await page.evaluate(() => !!document.querySelector("#content .pv-kart")), "'Vadesi geçenler' kartı yerinde");
  const liste = await page.evaluate(() => [...document.querySelectorAll("#content .gg-liste")].map((u) => ({ n: u.children.length, enAz: Math.min(...[...u.querySelectorAll(".gg-satir")].map((b) => Math.round(b.getBoundingClientRect().height))), ok: [...u.querySelectorAll(".gg-satir")].every((b) => b.querySelector("svg.ikon") && b.querySelector(".gg-ad") && b.querySelector(".gg-sag")), kesik: [...u.querySelectorAll(".gg-ad")].some((a) => a.scrollWidth > a.clientWidth + 1) })));
  d.dogru(liste.length === 2 && liste[0].n === 5 && liste.every((l) => l.enAz >= 56 && l.ok && !l.kesik), "Bugünün Satışları + Kritik Stok satır liste kalıbında (≥ 56 px, ad kesilmiyor, sağda tutar + ok): " + JSON.stringify(liste));
  await page.click("#content .gg-liste [data-saleview]"); await bekle(250);
  d.dogru(await page.evaluate(() => /İrsaliye/.test((document.querySelector(".modal-overlay h3") || {}).textContent || "")), "satış satırına dokununca irsaliye penceresi açılıyor");
  await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));

  /* ---- günlük rapor özeti ---- */
  await git("rapor-gunluk");
  const gr = await page.evaluate(() => { const k = kasaHesap(todayStr(), todayStr()), ciro = store.sales.filter((s) => isToday(s.tarih)).reduce((a, s) => a + s.toplam, 0); return { b: [...document.querySelectorAll(".gg-ozet .gg-buyuk .stat")].map((e) => [e.querySelector(".s-label").textContent, e.querySelector(".s-value").textContent]), beklenen: [["Kasadaki nakit", money.format(k.nakitKasa)], ["Ciro", money.format(ciro)], ["Net kâr", money.format(k.netKar)]], kutu: document.querySelectorAll("#content .summary-grid, #content .rapor-metrik-grid").length, etiketler: [...document.querySelectorAll(".gg-ozet .s-label")].map((e) => e.textContent), not: !!document.querySelector("#content .pl-kasa-not"), liste: !!document.querySelector("#content .rapor-satis-bas"), gizli: document.querySelector(".gg-ayrinti").hidden }; });
  d.esit(gr.b, gr.beklenen, "günlük rapor: aynı düzen, üç büyük rakam kasaHesap ile aynı");
  d.dogru(gr.kutu === 0 && gr.gizli && new Set(gr.etiketler).size === gr.etiketler.length && !gr.etiketler.includes("Toplam"), "günlük rapor: on beş kutu yok, ayrıntı kapalı, tekrar eden rakam yok ('Toplam' = 'Ciro' tek satır)");
  d.dogru(gr.not && gr.liste, "günlük rapor: satış listesi ve 'Nakit kasa = …' açıklaması yerinde");
  await page.click(".gg-ayrinti-btn"); await bekle(120);
  d.esit(await page.evaluate(() => document.querySelector(".gg-ayrinti").hidden), false, "günlük raporda da Ayrıntı açılıyor");

  /* ---- 5) üst çubuk + alt menü ---- */
  await git("anasayfa");
  const ust = await page.evaluate(() => ({ h: Math.round(document.querySelector(".topbar").getBoundingClientRect().height), ara: getComputedStyle(document.querySelector(".searchbox")).display, ikonlar: ["hamburger", "bellBtn", "userBtn"].map((id) => !!document.querySelector("#" + id + " svg.ikon")), hedef: ["hamburger", "bellBtn", "userBtn"].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return Math.min(Math.round(r.width), Math.round(r.height)); }), satirlar: [...document.querySelectorAll("#userDropdown a")].map((a) => a.textContent.trim()) }));
  d.dogru(ust.h <= 62 && ust.ara === "none" && ust.ikonlar.every(Boolean) && ust.hedef.every((x) => x >= 44), "üst çubuk: " + ust.h + " px (≤ 62), telefonda büyüteç yok, üç düğme çizgi ikon ve ≥ 44 px");
  d.esit(ust.satirlar, ["Profilim", "Çıkış Yap"], "kullanıcı menüsünde yalnız çalışan iki satır");
  await page.click("#userBtn"); await bekle(150); await page.click('#userDropdown a[data-route="profilim"]'); await bekle(300);
  d.esit(await page.evaluate(() => currentRoute()), "profilim", "Profilim satırı profil ekranını açıyor");
  const alt = [];
  for (const yol of ["rota", "satis", "dukkan", "rapor-gunluk", "anasayfa"]) { await git(yol); alt.push(await page.evaluate(() => [...document.querySelectorAll(".mobilbar button.on")].map((b) => b.dataset.mroute).join(","))); }
  d.esit(alt, ["rota", "satis", "dukkan", "rapor-gunluk", ""], "alt menü: seçili sekme ekranla aynı; sekme olmayan ekranda hiçbiri seçili değil");
  await git("dukkan");
  const sekme = await page.evaluate(() => { const lum = (c) => { const m = c.match(/\d+/g).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; }; const b = document.querySelector(".mobilbar button:not(.on)"), on = document.querySelector(".mobilbar button.on"); const cs = getComputedStyle(b); return { kontrast: Math.round(((1.0 + 0.05) / (lum(cs.color) + 0.05)) * 10) / 10, boy: parseFloat(getComputedStyle(b.querySelector(".mb-lbl")).fontSize), ikon: [...document.querySelectorAll(".mobilbar button")].every((x) => x.querySelector("svg.ikon")), onZemin: getComputedStyle(on.querySelector(".mb-ico")).backgroundColor, h: Math.round(b.getBoundingClientRect().height) }; });
  d.dogru(sekme.kontrast >= 7 && sekme.boy >= 12.5 && sekme.ikon && sekme.onZemin !== "rgba(0, 0, 0, 0)" && sekme.h >= 44, "alt menü: seçili olmayan sekme okunur (kontrast " + sekme.kontrast + ":1, yazı " + sekme.boy + " px), seçili olan dolu zeminli");

  /* ---- 6) emoji ---- */
  let tara = ""; let kod = 0;
  try { tara = execFileSync(process.execPath, [path.join(DEPO, "testler/gorsel/genel-emoji-tara.mjs")], { cwd: DEPO, encoding: "utf8" }); } catch (e) { kod = e.status; tara = String(e.stdout || ""); }
  d.dogru(kod === 0 && /genel=0/.test(tara), "genel bölgesinde arayüz emojisi kalmadı — " + tara.trim().split("\n").pop());
  const ekranEmoji = [];
  for (const yol of ["anasayfa", "dukkan", "rota", "harita", "giderler", "gelirler", "alis-faturalari", "alis-olustur", "stok-sayimi", "fiyat-bakim", "toplu-zam", "alinacaklar", "cay-ocagi", "profilim", "arac-yukleme", "duyurular", "servis-raporlari", "urun-iade", "talepler", "rapor-gunluk", "rapor-urunsel"]) {
    await git(yol);
    const e = await page.evaluate(() => { const re = /\p{Extended_Pictographic}/gu; const kok = [document.querySelector(".topbar"), document.querySelector(".mobilbar"), document.getElementById("menu"), document.getElementById("content"), document.querySelector(".stk-serit")].filter(Boolean); const bas = document.querySelector("#content .rapor-satis-bas"); if (bas && bas.nextElementSibling) bas.nextElementSibling.remove();   /* günlük rapordaki satış listesi liste ajanının */ return kok.flatMap((k) => (k.innerText.match(re) || [])).filter((x) => !/[©®™]/.test(x)).join(""); });
    if (e) ekranEmoji.push(yol + ":" + e);
  }
  d.esit(ekranEmoji, [], "genel ajanının ekranlarında ekranda görünen emoji yok");
  d.dogru(t.hatalar.length === 0, "sayfada betik hatası yok" + (t.hatalar.length ? ": " + t.hatalar.join(" | ") : ""));
} finally { await t.kapat(); }

/* ---- 7) yana taşma: 390 ve 360 px ---- */
for (const genislik of [390, 360]) {
  const k = await ac(genelStore({ buyuk: genislik === 360 }), { genislik });
  try {
    const tasan = [];
    for (const yol of ["anasayfa", "dukkan", "rota", "harita", "giderler", "gelirler", "alis-faturalari", "alis-olustur", "stok-sayimi", "fiyat-bakim", "toplu-zam", "alinacaklar", "cay-ocagi", "profilim", "arac-yukleme", "duyurular", "servis-raporlari", "urun-iade", "talepler", "rapor-gunluk", "rapor-urunsel", "musteri-analiz", "firmalar"]) {
      await k.git(yol); if (yol === "anasayfa" || yol === "rapor-gunluk") { await k.page.click(".gg-ayrinti-btn"); await bekle(100); }
      const r = await k.page.evaluate(() => ({ sayfa: document.documentElement.scrollWidth - window.innerWidth, ic: [...document.querySelectorAll("#content *, .topbar *, .mobilbar *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > window.innerWidth + 1 && !e.closest(".table-wrap, .cat-tabs, .line-table, .stk-secliste, .dropdown, .leaflet-container, .search-results"); }).map((e) => e.className || e.tagName).slice(0, 3) }));
      if (r.sayfa > 0 || r.ic.length) tasan.push(yol + " " + JSON.stringify(r));
    }
    d.esit(tasan, [], genislik + " px: genel ajanının ekranlarında yana taşma yok" + (genislik === 360 ? " (milyonluk rakamlarla)" : ""));
    await k.git("anasayfa");
    const sig = await k.page.evaluate(() => [...document.querySelectorAll(".gg-buyuk .gg-b")].map((b) => { const l = b.querySelector(".s-label").getBoundingClientRect(), v = b.querySelector(".s-value").getBoundingClientRect(); return v.left >= l.right - 1 || v.top >= l.bottom - 1; }));
    d.dogru(sig.every(Boolean), genislik + " px: büyük rakam etiketinin üstüne binmiyor");
    d.dogru(k.hatalar.length === 0, genislik + " px: betik hatası yok");
  } finally { await k.kapat(); }
}
d.bitir();
