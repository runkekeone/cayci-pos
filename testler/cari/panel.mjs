// Panel (public/toptanci/app.js) → canlı müşteri sayfası.
//  (b) panelden satış → müşteri sayfası (telefonla ve kişisel linkle) yeni fişi ve doğru bakiyeyi gösterir
//  (f) panel de yalnız hesabı değişen müşterinin kaydını yazar
//  (g) panelde telefonu değişen / silinen müşterinin eski kaydı kalmaz
//  (h) aracın ve panelin ürettiği kayıtlar birbirinin koduyla çözülür; biri ötekinin yazdığını "güncel" sayar
//  + yayın başarısız olursa panelin satışı buluta yine gider
// Çalıştır: node testler/cari/panel.mjs
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { panelAc, aracCalistir, denetci, bekle } from "../ortak/panel.mjs";
import { cariStore, satirlar, borc, para, cariAnahtarlar, hesapCoz, telCoz, goruntu, degisenler, sayfaAc, hesapOku, telefonlaGir, linkOlustur, sirOku, ONEK } from "./yardimci.mjs";

const d = denetci("cari-panel");
const bekleKi = async (kosul, ms = 15000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await kosul()) return true; await bekle(150); } return false; };

/* ---------- 1) araç yayınlamış; panel satış yapıyor ---------- */
{
  console.log("— araç yayınladı, panel satış yapıyor");
  let kes = false;
  const bulut = await sahteBulut({ satirlar: satirlar(), once: (req, res, ctx) => {
    if (kes && req.method === "POST" && ctx.url.pathname === "/rest/v1/kv" && ctx.govde.toString().includes(ONEK)) { ctx.yanit(500, { message: "zorlanmis hata" }); return true; }
    return false;
  } });
  const store = () => bulut.deger("babuco:store");
  const ilk = await aracCalistir(bulut.url, ["cari-yayinla", "--kaydet"]);
  d.dogru(ilk.kod === 0 && cariAnahtarlar(bulut).length === 7, "araç ilk yayını yaptı (7 satır)");
  const sir = sirOku(bulut), g0 = goruntu(bulut);
  const p = await panelAc({ bulutUrl: bulut.url });
  try {
    await p.page.waitForFunction(() => window.app.getStore().customers.length === 4, null, { timeout: 15000 });
    const n = store().sales.length, borcOnce = borc(store(), "m1"), anahtarM1 = (await hesapCoz(bulut, "m1")).key;
    await p.page.evaluate(() => { activeCart().musteriId = "m1"; addToCart("u4"); finalizeSale("acik"); });
    d.dogru(await bekleKi(() => store().sales.length === n + 1), "panelin satışı buluta gitti");
    d.dogru(await bekleKi(() => goruntu(bulut)[anahtarM1] !== g0[anahtarM1]), "panel, satıştan sonra müşterinin cari kaydını kendiliğinden güncelledi");
    await bekle(800);
    d.esit(degisenler(g0, goruntu(bulut)), { yazilan: [anahtarM1], silinen: [] }, "(f)(h) panel yalnız o müşterinin satırını yazdı; aracın yazdığı diğer 6 satırı güncel saydı");
    d.esit(sirOku(bulut), sir, "panel aracın oluşturduğu sırrı kullandı (yenisini üretmedi)");
    const beklenen = borcOnce + 2000, yeniFis = store().sales[n].belgeNo;
    const k = await hesapCoz(bulut, "m1");
    d.esit([k.hesap.bakiye, k.hesap.f.map((x) => x.no).includes(yeniFis)], [beklenen, true], "(h) panelin yazdığı kayıt aracın koduyla çözüldü: bakiye ve yeni fiş doğru");
    d.dogru(!/alis|maliyet|limit|"not"/.test(k.metin), "panelin yazdığı kayıtta da alış / maliyet / limit / not yok");

    const s = await sayfaAc({ bulutUrl: bulut.url });
    d.esit(await telefonlaGir(s.page, "05550000001"), "", "(b) müşteri telefonla girdi");
    let e = await hesapOku(s.page);
    d.esit([e.ad, e.bakiye, e.fisler.includes(yeniFis)], ["Deneme Kıraathanesi", para(beklenen), true], "(b) telefonla: panelin satışı ve yeni bakiye görünüyor");
    await s.kapat();
    const link = await linkOlustur(bulut, "m1");
    const s2 = await sayfaAc({ bulutUrl: bulut.url, hash: link.slice(link.indexOf("#")) });
    e = await hesapOku(s2.page);
    d.esit([e.bakiye, e.fisler.includes(yeniFis)], [para(beklenen), true], "(b) kişisel linkle: panelin satışı ve yeni bakiye görünüyor");
    await s2.kapat();

    // araç, panelin yazdığını güncel sayıyor
    const tekrar = await aracCalistir(bulut.url, ["cari-yayinla", "--kaydet"]);
    d.dogru(/0 kayıt yazıldı · 0 eski kayıt silindi/.test(tekrar.cikti), "(h) araç, panelin yazdığı kaydı güncel saydı (yeniden yazmadı)");

    // müşteri detayı → Diğer → "Canlı hesap sayfası": patron görünümünü o müşteriyle açar (adres panelin yanındaki ../cari/)
    await p.page.evaluate(() => {
      document.querySelectorAll(".modal-overlay").forEach((x) => x.remove());      // satıştan sonra açık kalan fiş penceresi
      window.__acilan = null; window.open = (u) => { window.__acilan = u; }; selectedCustomerId = "m2"; navigate("musteri-detay");
    });
    await p.page.click('[data-act="gl-diger"]');
    await p.page.locator(".modal-overlay .gl-menu-oge", { hasText: "Canlı hesap sayfası" }).click();
    d.esit(await p.page.evaluate(() => window.__acilan && new URL(window.__acilan, "https://ornek.test/cayci-pos/toptanci/index.html").href), "https://ornek.test/cayci-pos/cari/#patron&m=m2", "panel: müşteri detayı → Diğer → 'Canlı hesap sayfası' patron görünümünü o müşteriyle açıyor");
    await p.page.evaluate(() => navigate("satis"));

    console.log("— (g) panelde telefon değişir, müşteri silinir");
    const eskiTel = (await telCoz(bulut, "05550000004")).key, hesap4 = (await hesapCoz(bulut, "m4")).key;
    await p.page.evaluate(() => { store.customers.find((c) => c.id === "m4").telefon = "0555 000 00 44"; saveStore(); });
    d.dogru(await bekleKi(async () => !bulut.deger(eskiTel) && !!(await telCoz(bulut, "05550000044"))), "telefon değişince eski telefon kaydı silindi, yenisi yazıldı");
    await p.page.evaluate(() => { store.customers = store.customers.filter((c) => c.id !== "m4"); saveStore(); });
    d.dogru(await bekleKi(() => !bulut.deger(hesap4) && cariAnahtarlar(bulut, "t").length === 2), "müşteri silinince hesap ve telefon satırı silindi");
    d.esit(cariAnahtarlar(bulut, "h").length, 3, "bulutta kalan hesap satırı = kalan müşteri sayısı (3)");

    console.log("— yayın başarısız olursa satış etkilenmez");
    kes = true;
    const g1 = goruntu(bulut), n2 = store().sales.length;
    await p.page.evaluate(() => { activeCart().musteriId = "m3"; addToCart("u2"); finalizeSale("acik"); });
    d.dogru(await bekleKi(() => store().sales.length === n2 + 1), "cari yayını düşerken panelin satışı buluta yine gitti");
    await bekle(1200);
    d.esit(degisenler(g1, goruntu(bulut)), { yazilan: [], silinen: [] }, "o sırada cari satırları değişmedi");
    kes = false;
    await p.page.evaluate(() => { activeCart().musteriId = null; addToCart("u2"); finalizeSale("nakit"); });
    const anahtarM3 = (await hesapCoz(bulut, "m3")).key;
    d.dogru(await bekleKi(() => goruntu(bulut)[anahtarM3] !== g1[anahtarM3]), "panelin sonraki eşitlemesinde kaçan müşterinin kaydı güncellendi");
    d.esit((await hesapCoz(bulut, "m3")).hesap.bakiye, borc(store(), "m3"), "toparlanan kayıtta bakiye doğru");
    d.esit(p.hatalar, [], "panelde betik hatası yok");
  } finally { await p.kapat(); await bulut.dur(); }
}

/* ---------- 2) araç hiç yayınlamamış: ilk yayını panel yapar ---------- */
{
  console.log("— ilk yayını panel yapıyor (sır yok)");
  const bulut = await sahteBulut({ satirlar: satirlar() });
  const store = () => bulut.deger("babuco:store");
  const p = await panelAc({ bulutUrl: bulut.url });
  try {
    await p.page.waitForFunction(() => window.app.getStore().customers.length === 4, null, { timeout: 15000 });
    d.esit(cariAnahtarlar(bulut).length, 0, "panel yalnız açılmakla (yazma olmadan) yayın yapmadı");
    await p.page.evaluate(() => { activeCart().musteriId = "m2"; addToCart("u1"); finalizeSale("nakit"); });
    d.dogru(await bekleKi(() => cariAnahtarlar(bulut, "h").length === 4 && cariAnahtarlar(bulut, "t").length === 3, 30000), "panel sırrı oluşturdu ve bütün müşterileri yayınladı (4 hesap + 3 telefon)");
    for (const c of store().customers) {
      const k = await hesapCoz(bulut, c.id);
      d.dogru(!!k && k.hesap.ad === c.ad && k.hesap.bakiye === borc(store(), c.id), "(h) panelin kaydı aracın koduyla çözüldü: " + c.ad);
    }
    const r = await aracCalistir(bulut.url, ["cari-yayinla", "--kaydet"]);
    d.dogru(r.kod === 0 && /4 müşteri · 0 kayıt yazıldı · 0 eski kayıt silindi/.test(r.cikti), "(h) araç, panelin ürettiği 7 satırın hepsini güncel saydı (aynı biçim, aynı özet)");
    const s = await sayfaAc({ bulutUrl: bulut.url });
    d.esit(await telefonlaGir(s.page, "05550000002"), "", "panelin yayınladığı hesaba müşteri telefonla girdi");
    const e = await hesapOku(s.page);
    d.esit([e.ad, e.bakiye], ["Örnek Çay Ocağı", para(borc(store(), "m2"))], "sayfa panelin yayınladığı hesabı doğru gösteriyor");
    d.dogru(/İade \(geri aldığımız ürün\)/.test(e.metin) && /Hesap düzeltmesi/.test(e.metin) && /borcunuza eklendi/.test(e.metin) && /fazlası eski borcunuza sayıldı/.test(e.metin) && /havale/.test(e.metin), "iade, düzeltme, fazla ödeme ve havale müşterinin anlayacağı dille yazıyor");
    await s.kapat();
    d.esit(p.hatalar, [], "panelde betik hatası yok");
  } finally { await p.kapat(); await bulut.dur(); }
}
d.bitir();
