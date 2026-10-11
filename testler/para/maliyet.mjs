// MALİYETİN SATIŞ ANINDA SABİTLENMESİ: kalem "alis" taşır; alış fiyatı sonradan değişince geçmiş ürün kârı değişmez.
// Eski (alis'siz) kalemler eskisi gibi ürünün şimdiki alış fiyatıyla hesaplanır.
// Çalıştır: node testler/para/maliyet.mjs
import { denetci } from "../ortak/panel.mjs";
import { ortam, git, ornekStore, bugunStr, tlArac, tabanVar, bekle } from "./ortak.mjs";

const d = denetci("para/maliyet");
const bugun = bugunStr();
const hayir = () => false;   // "irsaliye yazdırılsın mı" vb. → hayır
/** Bugün için Ürünsel / Grupsal rapor ve ürün analizindeki kâr (Örnek Kola). */
const urunKar = (page) => page.evaluate((g) => {
  reportFilters["rapor-urunsel"] = { from: g, to: g }; reportFilters["rapor-grupsal"] = { from: g, to: g };
  renderRaporUrunsel();
  const u = sonUrunselRapor.list.find((x) => x.ad === "Örnek Kola 250 ml");
  const grup = (renderRaporGrupsal().match(/Gazlı İçecek<\/td><td>[^<]*<\/td><td>[^<]*<\/td><td class="[^"]*">([^<]*)</) || [])[1];
  return { urunsel: u.tutar - u.mal, grupsal: (grup || "").replace(/ /g, " "), analiz: urunMetrik("u3", 1).kar };
}, bugun);
const satVeZamla = async (page) => {
  await page.evaluate(() => { pos.carts[pos.active].musteriId = "m4"; window.app.addToCart("u3"); window.app.addToCart("u3"); window.app.finalizeSale("nakit"); });   // 2 × 640, alış 500 → kâr 280
  await bekle(150);
  await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));
  const once = await urunKar(page);
  await page.evaluate(() => { store.products.find((p) => p.id === "u3").alis = 600; });   // alış fiyatı zamlandı
  return { once, sonra: await urunKar(page) };
};

/* ---- Taban: alış fiyatı değişince bugünkü satışın (geçmişin) ürün kârı da değişiyordu ---- */
if (tabanVar) {
  const t = await ortam(ornekStore(), { taban: true, diyalogKarar: hayir });
  try {
    const r = await satVeZamla(t.page);
    d.esit([r.once.urunsel, r.sonra.urunsel, r.sonra.analiz], [280, 80, 80], "TABAN: alış 500→600 olunca yapılmış satışın ürün kârı 280'den 80'e düşüyordu (Ürünsel, Ürün Analizi)");
  } finally { await t.kapat(); }
}

/* ---- Panel ---- */
const o = await ortam(ornekStore(), { diyalogKarar: hayir });
try {
  const page = o.page;
  const r = await satVeZamla(page);
  const sale = await page.evaluate(() => store.sales[store.sales.length - 1]);
  d.esit([sale.items[0].alis, sale.maliyet], [500, 1000], "satış kalemine o anki birim maliyet yazıldı (alis 500), fiş maliyeti 1.000");
  d.esit([r.once.urunsel, r.sonra.urunsel], [280, 280], "Ürünsel rapor: alış fiyatı değişse de yapılmış satışın kârı 280 kalıyor");
  d.esit([r.sonra.grupsal, r.sonra.analiz], ["₺280,00", 280], "Grupsal rapor ve Ürün Analizi de aynı (280)");
  d.esit(await page.evaluate(() => [kalemAlis({ urunId: "u3" }), kalemAlis({ urunId: "u3", alis: 500 }), kalemAlis({ urunId: "u3", alis: 0 }), kalemAlis({ urunId: null }), kalemAlis({ urunId: "yok" })]), [600, 500, 0, 0, 0], "kalemAlis: alan varsa o (0 dahil), yoksa ürünün şimdiki alışı; ürün yoksa 0");
  // eski satış (alis yok): eski davranış — şimdiki alışla hesaplanır, ekran bozulmaz
  const eski = await page.evaluate(() => { const s = store.sales.find((x) => x.id === "s1"); return { alanVar: "alis" in s.items[1], mal: kalemAlis(s.items[1]) }; });
  d.esit(eski, { alanVar: false, mal: 600 }, "eski (alis'siz) kalem: ürünün şimdiki alış fiyatı kullanılıyor");

  // satış düzenleme: adet 2→3; maliyet kayıtlı 500 üzerinden (yeni 600 değil), alis korunur
  await page.evaluate((id) => { selectedSaleId = id; }, sale.id); await git(page, "satis-detay");
  o.karar.fn = () => true;
  await page.fill('[data-sd="0"][data-f="adet"]', "3"); await page.click("#sdSave"); await bekle(150);
  const s2 = await page.evaluate((id) => store.sales.find((x) => x.id === id), sale.id);
  d.esit([s2.items[0].adet, s2.items[0].alis, s2.maliyet, s2.toplam], [3, 500, 1500, 1920], "satış düzenlenince kalemin kayıtlı maliyeti korunuyor (3 × 500 = 1.500)");
  d.esit(o.p.hatalar, [], "sayfada betik hatası yok");
} finally { await o.kapat(); }

/* ---- Araç ---- */
const a = await ortam(ornekStore());
try {
  const st = () => a.bulut.deger("babuco:store");
  const girdi = { musteri: "Yeni Müşteri", kalemler: [{ urun: "Örnek Kola", adet: 2 }], odeme: "nakit", stokKaynak: "arac" };
  const k = await a.arac(["satis", JSON.stringify(girdi), "--kaydet"]);
  const sale = st().sales[st().sales.length - 1];
  d.esit([k.kod, sale.items[0].alis, sale.maliyet], [0, 500, 1000], "araç satis: kaleme alis 500 yazıldı, maliyet 1.000");
  const karSatiri = (c) => (c.split(/\r?\n/).find((l) => l.includes("| Örnek Kola 250 ml |")) || "").split("|").slice(-2)[0].trim();
  const ayKari = (c) => (c.split(/\r?\n/).find((l) => l.startsWith("| " + bugun.slice(0, 7) + " |")) || "").split("|")[5].trim();
  const r0 = await a.arac(["rapor", bugun]), ay0 = await a.arac(["aylik"]);
  d.esit(karSatiri(r0.cikti), tlArac(280), "araç rapor Ürünsel: kâr 280");
  const z = await a.arac(["urun-fiyat", "Örnek Kola", "alis", "600", "--kaydet"]);
  d.esit([z.kod, st().products.find((p) => p.id === "u3").alis], [0, "600"], "alış fiyatı 600 yapıldı");
  const r1 = await a.arac(["rapor", bugun]), ay1 = await a.arac(["aylik"]);
  d.esit(karSatiri(r1.cikti), tlArac(280), "araç rapor Ürünsel: alış değişse de bugünkü satışın kârı 280");
  d.esit(ayKari(ay1.cikti), ayKari(ay0.cikti), "araç aylik: ürün kârı alış fiyatı değişince DEĞİŞMİYOR (fişin kayıtlı maliyeti)");
  if (tabanVar) {
    const t1 = await a.tabanArac(["rapor", bugun]), tay = await a.tabanArac(["aylik"]);
    d.esit(karSatiri(t1.cikti), tlArac(80), "TABAN araç rapor: aynı satışın kârı 80'e düşüyordu");
    d.dogru(ayKari(tay.cikti) !== ayKari(ay0.cikti), "TABAN araç aylik: geçmiş ayın ürün kârı alış fiyatıyla birlikte değişiyordu (" + ayKari(tay.cikti) + " ≠ " + ayKari(ay0.cikti) + ")");
  }
  // kalem-ekle: eklenen kalem de o anki maliyeti taşır
  const ek = await a.arac(["kalem-ekle", sale.belgeNo, "Örnek Küp Şeker", "2", "--odeme=nakit", "--kaydet"]);
  const s3 = st().sales.find((x) => x.id === sale.id);
  d.esit([ek.kod, s3.items[1].alis, s3.maliyet, s3.items[0].alis], [0, 52.5, 1105, 500], "kalem-ekle: yeni kaleme alis 52,5; fiş maliyeti 1.105; eski kalem 500 kaldı");
  const tl2 = await a.arac(["tahsilat-listesi"]);
  d.dogru(tl2.kod === 0, "tahsilat-listesi çalışıyor (60g kâr fişin kayıtlı maliyetinden)");
} finally { await a.kapat(); }
d.bitir();
