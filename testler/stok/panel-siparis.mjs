// PANEL — gelen sipariş işareti (şerit + zil + titreşim), bekleyenlerin yaşı, teslim (araçla aynı satış),
// satış açmadan kapatma, silinenin geri gelmemesi; ürün iadesi (araçla aynı kayıt).
// Çalıştır: node testler/stok/panel-siparis.mjs
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { panelAc, denetci, bekle } from "../ortak/panel.mjs";
import { borc } from "../ortak/ornek-store.mjs";
import { arac, tabanPanel, stokStore, satirlar, siparisSatiri } from "./yardimci.mjs";

const d = denetci("panel-siparis");
const HAZIRLIK = () => {
  window.__titresim = 0; window.__izin = 0;
  try { Object.defineProperty(navigator, "vibrate", { value: () => { window.__titresim++; return true; }, configurable: true }); } catch (e) {}
  try { if (window.Notification) { Notification.requestPermission = () => { window.__izin++; return Promise.resolve("denied"); }; Object.defineProperty(Notification, "permission", { get: () => "default", configurable: true }); } } catch (e) {}
};
async function ac(store, siparisler, panelDizin) {
  const bulut = await sahteBulut({ satirlar: satirlar(store), siparisler });
  const p = await panelAc({ bulutUrl: bulut.url, panelDizin });
  await p.context.addInitScript(HAZIRLIK);
  await p.page.reload();
  await p.page.waitForFunction((n) => window.app && window.app.getStore().products.length === n, store.products.length, { timeout: 10000 });
  await bekle(600);
  const git = async (yol) => { await p.page.evaluate((r) => { location.hash = "#/" + r; }, yol); await bekle(250); };
  const cek = async () => { await p.page.evaluate(() => cayPullSupabase()); await bekle(250); };
  return { bulut, p, page: p.page, git, cek, kapat: async () => { await p.kapat(); await bulut.dur(); } };
}
const tablo = (b, id) => b.tablolar.siparisler.get(id);
const sade = (sale) => { const s = { ...sale }; delete s.id; delete s.tarih; return s; };

/* ---------- ÖNCE (taban): yeni sipariş gelince hiçbir işaret yok; silinen sipariş geri geliyor ---------- */
{
  const dizin = tabanPanel();
  if (dizin) {
    const t = await ac(stokStore(), [], dizin);
    t.bulut.tablolar.siparisler.set("ord-aaa11", siparisSatiri("ord-aaa11", { gunOnce: 0 }));
    await t.cek();
    d.esit(await t.page.evaluate(() => [store.gelenSiparisler.length, !!document.getElementById("stkSipSerit"), document.getElementById("bellBadge").textContent, window.__titresim]), [1, false, "0", 0], "taban (YOKTU): sipariş geldi ama şerit yok, zil saymıyor, titreşim yok");
    await t.page.evaluate(() => { store.gelenSiparisler = []; saveStore(); });
    await t.cek();
    d.esit(await t.page.evaluate(() => store.gelenSiparisler.length), 1, "taban (YANLIŞ): panelden silinen sipariş bir sonraki çekmede \"yeni\" diye geri geliyordu");
    await t.kapat();
  }
}

/* ---------- 1) Yeni sipariş gelince: şerit + zil sayacı + titreşim; izin yalnız dokununca istenir ---------- */
{
  const t = await ac(stokStore(), []);
  d.esit(await t.page.evaluate(() => [!!document.getElementById("stkSipSerit"), document.getElementById("bellBadge").classList.contains("show")]), [false, false], "sipariş yokken şerit de zil sayacı da yok");
  t.bulut.tablolar.siparisler.set("ord-aaa11", siparisSatiri("ord-aaa11", { gunOnce: 0 }));
  await t.cek();
  const s1 = await t.page.evaluate(() => { const e = document.getElementById("stkSipSerit"); return { var: !!e, yazi: e && e.textContent.replace(/\s+/g, " "), yeni: e && e.classList.contains("yeni"), gec: e && e.classList.contains("gec"), rozet: document.getElementById("bellBadge").textContent, rozetGor: document.getElementById("bellBadge").classList.contains("show"), titresim: window.__titresim, izin: window.__izin, yukseklik: e && e.getBoundingClientRect().height, ust: e && e.getBoundingClientRect().top }; });
  d.dogru(s1.var && /1 sipariş bekliyor/.test(s1.yazi) && /Örnek Çay Ocağı/.test(s1.yazi), "yeni sipariş gelince ekranın üstünde şerit çıkıyor (kimden geldiği yazıyor)");
  d.dogru(s1.yeni && !s1.gec && s1.yukseklik >= 44 && s1.ust < 140, "şerit dikkat çekiyor (yanıp sönüyor), en az 44 px, sayfanın en üstünde");
  d.esit([s1.rozet, s1.rozetGor, s1.titresim], ["1", true, 1], "zil sayacı 1 oldu, telefon bir kez titredi");
  d.esit(s1.izin, 0, "tarayıcı bildirimi izni kendiliğinden İSTENMEDİ");
  await t.page.evaluate(() => render()); await bekle(100);
  d.esit(await t.page.evaluate(() => window.__titresim), 1, "aynı sipariş için tekrar tekrar titremiyor");
  await t.git("satis");
  d.dogru(await t.page.evaluate(() => !!document.getElementById("stkSipSerit")), "şerit başka ekranlarda da (satış) görünüyor");
  await t.page.evaluate(() => { location.hash = "#/anasayfa"; }); await bekle(250);
  await t.page.click("#bellBtn"); await bekle(150);
  d.dogru(/Bekleyen Sipariş \(1\)/.test(await t.page.textContent("#bellDropdown")), "zil listesi bekleyen siparişi gösteriyor");
  await t.page.click("[data-bellizin]"); await bekle(150);
  d.esit(await t.page.evaluate(() => window.__izin), 1, "izin yalnız kullanıcı \"bildirim gönder\"e dokununca istendi");
  await t.page.click("#stkSipSerit"); await bekle(250);
  d.esit(await t.page.evaluate(() => location.hash), "#/cay-ocagi", "şeride dokununca siparişler açılıyor");

  /* ikinci (eski tarihli) sipariş → sayı artar, şerit "gecikti" rengine döner, yeniden titrer */
  t.bulut.tablolar.siparisler.set("ord-bbb22", siparisSatiri("ord-bbb22", { ad: "Yepyeni Ocak", tel: "05551112233", gunOnce: 3 }));
  await t.cek();
  const s2 = await t.page.evaluate(() => { const e = document.getElementById("stkSipSerit"); return [/2 sipariş bekliyor/.test(e.textContent), /3 gün önce — gecikti/.test(e.textContent), e.classList.contains("gec"), window.__titresim, document.getElementById("bellBadge").textContent]; });
  d.esit(s2, [true, true, true, 2, "2"], "ikinci sipariş: sayı 2, bir günü geçen bekleyiş \"gecikti\" diye belirgin, yeniden titredi");
  const satirlar_ = await t.page.evaluate(() => [...document.querySelectorAll(".cay-li")].map((li) => [li.querySelector(".sl-ad").textContent, li.querySelector(".stk-yas").textContent, li.querySelector(".stk-yas").classList.contains("gec")]));
  d.esit(satirlar_, [["Yepyeni Ocak", "3 gün önce", true], ["Örnek Çay Ocağı", satirlar_[1][1], false]], "sipariş listesinde en eski bekleyen en üstte, yaşıyla; gecikenler kırmızı");
  d.esit(t.p.hatalar, [], "sayfada betik hatası yok (işaret)");
  await t.kapat();
}

/* ---------- 1b) Sipariş geldiğinde yazılmakta olan form silinmez ---------- */
{
  const dene = async (dizin) => {
    const t = await ac(stokStore(), [], dizin);
    await t.git("alis-olustur");
    await t.page.fill("#aNo", "F-YARIM");
    t.bulut.tablolar.siparisler.set("ord-aaa11", siparisSatiri("ord-aaa11", { gunOnce: 0 }));
    await t.cek();
    const r = await t.page.evaluate(() => [document.getElementById("aNo").value, !!document.getElementById("stkSipSerit")]);
    await t.kapat();
    return r;
  };
  const dizin = tabanPanel();
  if (dizin) d.esit(await dene(dizin), ["", false], "taban (YANLIŞ): sipariş gelince ekran baştan çiziliyor, yarım yazılmış fatura siliniyordu (ve hiçbir işaret yoktu)");
  d.esit(await dene(), ["F-YARIM", true], "sipariş gelince yazılmakta olan form yerinde kalıyor, şerit yine de çıkıyor");
}

/* ---------- 2) Teslim: panel ile araç AYNI satışı üretir; durum tabloya yazılır ---------- */
{
  const sip = () => [siparisSatiri("ord-aaa11", { gunOnce: 2 })];
  const t = await ac(stokStore(), sip());
  await t.cek();
  await t.git("cay-ocagi");
  await t.page.click("[data-cayopen]"); await bekle(200);
  await t.page.click("[data-m-teslim]"); await bekle(200);
  d.dogru(await t.page.evaluate(() => !!document.querySelector('.modal [data-sec="cayHavuz"]') && document.getElementById("cayHavuz").value === "dukkan"), "teslimde malın nereden çıktığı soruluyor (satış modu dükkansa dükkan seçili)");
  await t.page.click('.modal [data-sec="cayHavuz"] [data-v="arac"]');
  await t.page.click('.modal [data-ode="bakiye"]'); await bekle(500);
  const pS = await t.page.evaluate(() => ({ sale: store.sales[store.sales.length - 1], stok: store.products.map((x) => [x.id, Number(x.stok), Number(x.aracStok)]), o: store.gelenSiparisler[0], n: store.sales.length }));
  const b2 = await sahteBulut({ satirlar: satirlar(stokStore()), siparisler: sip() });
  await arac(b2.url, ["siparis-teslim", "AAA11", "--odeme=bakiye", "--kaydet"]);
  const aS = b2.deger("babuco:store");
  d.esit(sade(pS.sale), sade(aS.sales[aS.sales.length - 1]), "panelin teslim satışı ile aracın `siparis-teslim` satışı AYNI (kalemler, alış, ödeme, stok kaynağı, belge no)");
  d.esit(pS.stok, aS.products.map((x) => [x.id, Number(x.stok), Number(x.aracStok)]), "stoklar da aynı (araçtan düştü)");
  d.esit([pS.o.durum, pS.o.saleId === pS.sale.id, tablo(t.bulut, "ord-aaa11").durum, tablo(b2, "ord-aaa11").durum], ["teslim", true, "teslim", "teslim"], "iki yolda da sipariş satışa bağlandı ve tabloda \"teslim\"");
  d.dogru(pS.sale.items.every((i) => typeof i.alis === "number") && pS.sale.stokKaynak === "arac" && !!pS.sale.servisGun, "satış kalemleri satış anındaki alışı taşıyor; stok kaynağı ve servis günü yazılı");
  await b2.dur();
  d.esit(t.p.hatalar, [], "sayfada betik hatası yok (teslim)");
  await t.kapat();
}

/* ---------- 3) Satış AÇMADAN kapat (tek tek ve toplu); silinen geri gelmez ---------- */
{
  const st = stokStore();
  const t = await ac(st, [siparisSatiri("ord-aaa11", { gunOnce: 5 }), siparisSatiri("ord-bbb22", { ad: "Yepyeni Ocak", tel: "05551112233", gunOnce: 4 }), siparisSatiri("ord-ccc33", { ad: "Sınama Derneği", tel: "", gunOnce: 1 })]);
  await t.cek();
  const once = await t.page.evaluate(() => ({ satis: store.sales.length, stok: JSON.stringify(store.products.map((x) => [x.stok, x.aracStok])) }));
  await t.git("cay-ocagi");
  await t.page.click('[data-cayopen]'); await bekle(200);                     // en eski: ord-aaa11
  d.dogru(/Zaten teslim ettim \(satış yazma\)/.test(await t.page.textContent(".modal")), "sipariş penceresinde \"zaten teslim ettim (satış yazma)\" seçeneği var");
  await t.page.click("[data-m-kapat]"); await bekle(500);
  const k1 = await t.page.evaluate(() => { const o = store.gelenSiparisler.find((x) => x.orderId === "ord-aaa11"); return { durum: o.durum, elle: o.elleKapandi, saleId: o.saleId, satis: store.sales.length, stok: JSON.stringify(store.products.map((x) => [x.stok, x.aracStok])), serit: document.getElementById("stkSipSerit").textContent }; });
  d.esit([k1.durum, k1.elle, k1.saleId, k1.satis, k1.stok], ["teslim", true, "", once.satis, once.stok], "satış açılmadan kapatıldı: stok ve satışlar değişmedi");
  d.esit(tablo(t.bulut, "ord-aaa11").durum, "teslim", "çay ocağı tabloda \"teslim\" görüyor");
  d.dogru(/2 sipariş bekliyor/.test(k1.serit), "şerit kalan bekleyen sayısına indi");

  await t.page.click('[data-act="cayTopluKapat"]'); await bekle(200);
  d.esit(await t.page.evaluate(() => document.querySelectorAll(".modal [data-kapat]").length), 2, "toplu kapatma yalnız açık siparişleri listeliyor");
  await t.page.evaluate(() => { document.querySelector(".modal [data-kapat]").checked = true; });
  await t.page.click(".modal .ok"); await bekle(500);
  d.esit([tablo(t.bulut, "ord-bbb22").durum, await t.page.evaluate(() => store.gelenSiparisler.filter((o) => o.durum === "yeni").length), await t.page.evaluate(() => store.sales.length)], ["teslim", 1, once.satis], "toplu kapatma: işaretlenen kapandı (tablo dahil), satış açılmadı");

  await t.page.click('[data-cayopen]'); await bekle(200);
  await t.page.click("[data-m-del]"); await bekle(300);
  await t.cek();
  d.esit(await t.page.evaluate(() => [store.gelenSiparisler.some((o) => o.orderId === "ord-ccc33"), (store.sipSilinenler || []).map((x) => x.id), !!document.getElementById("stkSipSerit")]), [false, ["ord-ccc33"], false], "silinen sipariş bir sonraki çekmede GERİ GELMEDİ; bekleyen kalmayınca şerit kalktı");
  d.dogru(/Gelen siparis yok|bekleyen yok/.test((await (async () => { await bekle(1500); return arac(t.bulut.url, ["siparisler"]); })()).stdout) && (await arac(t.bulut.url, ["durum"])).stderr === "", "araç da silineni bekleyen saymıyor");
  d.esit(t.p.hatalar, [], "sayfada betik hatası yok (kapatma)");
  await t.kapat();
}

/* ---------- 4) Ürün iadesi: müşterinin aldığı fiyattan, seçilen havuza; araçla aynı kayıt ---------- */
{
  const dizin = tabanPanel();
  if (dizin) {
    const t = await ac(stokStore(), [], dizin);
    await t.git("urun-iade");
    await t.page.selectOption("#iUrun", "u3"); await t.page.selectOption("#iMus", "m3"); await t.page.fill("#iAdet", "1");
    await t.page.click("#iSave"); await bekle(250);
    const r = await t.page.evaluate(() => ({ tutar: store.iadeler[0].tutar, stok: [store.products.find((x) => x.id === "u3").stok, store.products.find((x) => x.id === "u3").aracStok], satis: store.sales.length }));
    d.esit(r, { tutar: 640, stok: [13, -4], satis: 5 }, "taban (YANLIŞ): müşteri 620'den almışken iade LİSTE fiyatından (640) düşülüyor, mal hep dükkana giriyor, ciro düşmüyordu");
    await t.kapat();
  }
  const t = await ac(stokStore(), []);
  const borcOnce = borc(stokStore(), "m3");
  await t.git("urun-iade");
  await t.page.selectOption("#iMus", "m3"); await t.page.selectOption("#iUrun", "u3"); await bekle(100);
  d.esit([await t.page.inputValue("#iFiyat"), /en son 620 ₺ fiyatla aldı/.test(await t.page.textContent("#iFiyatNot")), await t.page.inputValue("#iHavuz")], ["620", true, "arac"], "fiyat müşterinin EN SON aldığı fiyattan geliyor (620, liste 640 değil); varsayılan havuz araç");
  await t.page.fill("#iAdet", "2"); await bekle(50);
  d.dogru(/1\.240 ₺/.test(await t.page.textContent("#iTutar")), "iade tutarı miktar × alınan fiyat");
  await t.page.click("#iSave"); await bekle(300);
  const pS = await t.page.evaluate(() => ({ sale: store.sales[store.sales.length - 1], iade: store.iadeler[store.iadeler.length - 1], stok: [store.products.find((x) => x.id === "u3").stok, store.products.find((x) => x.id === "u3").aracStok], borc: window.app.customerBorc("m3"), odemeler: store.payments.length }));
  const b2 = await sahteBulut({ satirlar: satirlar(stokStore()) });
  await arac(b2.url, ["iade", "Sınama Derneği", "Örnek Kola", "2", "--kaydet"]);
  const aS = b2.deger("babuco:store");
  d.esit(sade(pS.sale), sade(aS.sales[aS.sales.length - 1]), "panel iadesi ile aracın `iade` komutu AYNI iade fişini üretiyor (ciro ve maliyet eksiye)");
  d.esit([pS.stok, pS.borc], [[aS.products.find((x) => x.id === "u3").stok, aS.products.find((x) => x.id === "u3").aracStok], borc(aS, "m3")], "stok ve bakiye de aynı");
  d.esit([pS.stok, pS.borc, pS.sale.toplam, pS.sale.maliyet, pS.odemeler], [[12, -2], borcOnce - 1240, -1240, -1000, 2], "araca 2 girdi, borç 1.240 düştü, ciro −1.240 / maliyet −1.000; tahsilat kaydı açılmadı (para girişi değil)");
  const { id: _i, tarih: _t, ...pI } = pS.iade, { id: _i2, tarih: _t2, ...aI } = aS.iadeler[aS.iadeler.length - 1];
  d.esit(pI, aI, "iade listesi kaydı da aynı (fiyat, havuz, belge no)");
  await b2.dur();

  /* özel fiyat → liste sırası; dükkana iade; müşterisiz iade */
  await t.page.selectOption("#iMus", "m2"); await t.page.selectOption("#iUrun", "u9"); await bekle(100);
  d.esit([await t.page.inputValue("#iFiyat"), /özel fiyatı/.test(await t.page.textContent("#iFiyatNot"))], ["300", true], "hiç almamışsa müşterinin ÖZEL fiyatı (300; liste 285)");
  await t.page.selectOption("#iMus", "m4"); await bekle(100);
  d.esit(await t.page.inputValue("#iFiyat"), "285", "özel fiyatı da yoksa liste fiyatı");
  await t.page.selectOption("#iMus", ""); await t.page.click('[data-sec="iHavuz"] [data-v="dukkan"]');
  const satisOnce = await t.page.evaluate(() => store.sales.length);
  await t.page.click("#iSave"); await bekle(300);
  d.esit(await t.page.evaluate(() => [store.products.find((x) => x.id === "u9").stok, store.products.find((x) => x.id === "u9").aracStok, store.sales.length]), [6, 3, satisOnce], "müşterisiz iade seçilen havuza (dükkan) girer, fiş açılmaz");
  d.esit(t.p.hatalar, [], "sayfada betik hatası yok (iade)");
  await t.kapat();
}
d.bitir();
