// PANEL — fiyat bakımı: toplu zam (önizleme → uygula, aile birlikte, özel fiyat seçeneği), fiyat kontrol listesi,
// "liste fiyatını en yaygın özel fiyata çek", kâr eşiği ayarı, ürün kartında alış değişince uyarı, fiyat geçmişi.
// Panel ile aracın AYNI sonucu verdiğini de sınar. Çalıştır: node testler/stok/panel-fiyat.mjs
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { panelAc, denetci, bekle } from "../ortak/panel.mjs";
import { arac, tabanPanel, stokStore, satirlar } from "./yardimci.mjs";

const d = denetci("panel-fiyat");
async function ac(store, panelDizin) {
  const bulut = await sahteBulut({ satirlar: satirlar(store) });
  const p = await panelAc({ bulutUrl: bulut.url, panelDizin });
  await p.page.waitForFunction((n) => window.app.getStore().products.length === n, store.products.length, { timeout: 10000 });
  await bekle(300);
  const git = async (yol) => { await p.page.evaluate((r) => { location.hash = "#/" + r; }, yol); await bekle(250); };
  return { bulut, p, page: p.page, git, kapat: async () => { await p.kapat(); await bulut.dur(); } };
}
const fiyatlar = (page) => page.evaluate(() => ({ u7: Number(store.products.find((x) => x.id === "u7").satis), u8: Number(store.products.find((x) => x.id === "u8").satis), m1u7: store.customers.find((c) => c.id === "m1").ozelFiyatlar.u7, m1u8: store.customers.find((c) => c.id === "m1").ozelFiyatlar.u8, m2u7: store.customers.find((c) => c.id === "m2").ozelFiyatlar.u7 }));

/* ---------- ÖNCE ---------- */
{
  const dizin = tabanPanel();
  if (dizin) {
    const t = await ac(stokStore(), dizin);
    d.dogru(await t.page.evaluate(() => !PAGES["toplu-zam"] && !PAGES["fiyat-bakim"] && !PAGES["alinacaklar"] && !PAGES["fiyat-gecmisi"]), "taban (YOKTU): toplu zam, fiyat kontrol, alınacaklar, fiyat geçmişi ekranları yoktu");
    await t.kapat();
  }
}

/* ---------- 1) Toplu zam: önizleme hiçbir şey yazmaz; tek ürün seçilse de aile birlikte gider ---------- */
{
  const t = await ac(stokStore());
  await t.git("urunler");
  d.dogru(await t.page.evaluate(() => [...document.querySelectorAll("#menu a")].some((a) => a.dataset.route === "fiyat-bakim") && [...document.querySelectorAll("#menu a")].some((a) => a.dataset.route === "alinacaklar")), "menüde (Ürünler altında) Fiyat Bakımı ve Alınacaklar var");
  await t.git("toplu-zam");
  await t.page.selectOption("#zGrup", "__sec"); await bekle(200);
  await t.page.fill("#zAra", "kuşburnu"); await bekle(100);
  d.esit(await t.page.evaluate(() => [...document.querySelectorAll("#zUrunler .stk-chk")].filter((l) => l.style.display !== "none").length), 1, "ürün seçerken arama çalışıyor");
  await t.page.check('[data-zurun="u7"]');
  await t.page.fill("#zDeger", "10"); await t.page.selectOption("#zYuv", "5"); await t.page.selectOption("#zYon", "yukari");
  await t.page.click("#zOnizle"); await bekle(300);
  const onizleme = await t.page.evaluate(() => [...document.querySelectorAll("#zListe .stk-satir")].map((r) => r.querySelector(".stk-s-sol").textContent.replace(/\s+/g, " ")));
  d.dogru(onizleme.length === 2 && /Kuşburnus*75 ₺ → 85 ₺/.test(onizleme[0]) && /Nane Limons*75 ₺ → 85 ₺ · aynı çeşit, birlikte değişir/.test(onizleme[1]), "önizleme eski → yeni; seçilmeyen aile kardeşi de listede (75 → 82,5 → 85)");
  d.dogru(/4 özel fiyat var; onlar aynı kalacak/.test(await t.page.textContent("#zOnizleme")), "özel fiyatların aynı kalacağı söyleniyor");
  d.esit(await fiyatlar(t.page), { u7: 75, u8: 75, m1u7: 80, m1u8: 80, m2u7: 80 }, "önizleme hiçbir fiyatı değiştirmedi");
  await t.page.click("#zUygula"); await bekle(300);
  d.esit(await fiyatlar(t.page), { u7: 85, u8: 85, m1u7: 80, m1u8: 80, m2u7: 80 }, "uygulandı: aile birlikte 85; özel fiyatlar (seçilmediği için) aynı");
  d.esit(await t.page.evaluate(() => store.fiyatGecmisi.map((g) => [g.urunId, g.alan, g.eski, g.yeni])), [["u7", "satis", 75, 85], ["u8", "satis", 75, 85]], "zam fiyat geçmişine işlendi");

  /* aynı zammı ARAÇ da aynı hesaplıyor mu? (aynı başlangıç verisiyle) */
  const b2 = await sahteBulut({ satirlar: satirlar(stokStore()) });
  await arac(b2.url, ["toplu-zam", "--urun=Kuşburnu", "--yuzde=10", "--yuvarla=5", "--yukari", "--kaydet"]);
  const s2 = b2.deger("babuco:store");
  d.esit([s2.products.find((x) => x.id === "u7").satis, s2.products.find((x) => x.id === "u8").satis], [85, 85], "araçtaki toplu-zam aynı sonucu veriyor");
  await b2.dur();

  /* grup + tutar + özel fiyatlar da artsın */
  await t.git("toplu-zam");
  await t.page.selectOption("#zGrup", "Toz İçecekler"); await bekle(200);
  await t.page.click('[data-sec="zTur"] [data-v="tutar"]');
  d.esit(await t.page.textContent("#zDegerEt"), "Kaç lira eklensin?", "tutar seçilince soru değişiyor");
  await t.page.fill("#zDeger", "2,5"); await t.page.selectOption("#zYuv", "0"); await t.page.click('[data-sec="zOzel"] [data-v="ayni"]');
  await t.page.click("#zOnizle"); await bekle(300);
  d.dogru(/Zammı Uygula \(2 ürün \+ 4 özel fiyat\)/.test(await t.page.textContent("#zUygula")), "özel fiyatlar da artsın seçilince kaç özel fiyatın değişeceği yazıyor");
  await t.page.click("#zUygula"); await bekle(300);
  d.esit(await fiyatlar(t.page), { u7: 87.5, u8: 87.5, m1u7: 82.5, m1u8: 82.5, m2u7: 82.5 }, "tutar zammı (+2,50): liste ve özel fiyatlar birlikte arttı, aile tek fiyatta");
  d.esit(t.p.hatalar, [], "sayfada betik hatası yok (toplu zam)");
  await t.kapat();
}

/* ---------- 2) Fiyat kontrol listesi + liste fiyatını çek + eşik ---------- */
{
  const st = stokStore();
  st.products.find((p) => p.id === "u2").alis = 170;        // satış = alış
  st.products.find((p) => p.id === "u6").alis = 225;        // %6,3
  const t = await ac(st);
  await t.git("fiyat-bakim");
  const say = () => t.page.evaluate(() => [...document.querySelectorAll(".stk-bolum")].map((b) => [b.querySelector("summary b").textContent, Number(b.querySelector(".stk-say").textContent)]));
  d.esit(await say(), [["Zararına satılanlar", 1], ["Kârı düşük ürünler", 1], ["Kârı düşük özel fiyatlar", 2], ["Liste fiyatı eskimiş olabilir", 2]], "kontrol listesi dört başlıkta sayıyor");
  d.dogru(/Örnek Pet Su 500 ml/.test(await t.page.textContent(".stk-bolum.kirmizi")) && /Sınama Derneği/.test(await t.page.textContent(".stk-bolum.turuncu + .stk-bolum.turuncu")), "satış ≤ alış olan ürün ve kârı düşük özel fiyat listede");
  /* araçla aynı sayılar */
  const ak = (await arac(t.bulut.url, ["fiyat-kontrol"])).stdout;
  d.dogru(/Zararına satılan: satış ≤ alış \(1\)/.test(ak) && /Kârı düşük ürünler \(1\)/.test(ak) && /Kârı düşük özel fiyatlar \(2\)/.test(ak) && /2 ürün ailesi/.test(ak), "aracın fiyat-kontrol komutu aynı sayıları veriyor");

  await t.page.fill("#fbEsik", "5"); await t.page.click("#fbEsikKaydet"); await bekle(250);
  d.esit([(await say())[1][1], (await say())[2][1], await t.page.evaluate(() => store.settings.marjEsik)], [0, 2, 5], "kâr eşiği ayarlanıyor ve kaydediliyor (%5 → %6,3'lük ürün listeden çıktı)");
  await bekle(1600);                                   // panel buluta 1 sn gecikmeyle yazar
  d.dogru(/kâr eşiği %5,0/.test((await arac(t.bulut.url, ["fiyat-kontrol"])).stdout), "araç da panelde ayarlanan eşiği kullanıyor");

  await t.page.click('[data-fbcek="0"]'); await bekle(200);
  d.dogru(/2 müşteri/.test(await t.page.textContent(".modal")) && /özel fiyatı olmayan herkes/.test(await t.page.textContent(".modal")) && /Nane Limon/.test(await t.page.textContent(".modal")), "liste fiyatını çekmeden önce kimi etkileyeceğini ve aileyi gösteriyor");
  d.esit(await fiyatlar(t.page), { u7: 75, u8: 75, m1u7: 80, m1u8: 80, m2u7: 80 }, "onaylanmadan değişmedi");
  await t.page.click(".modal .ok"); await bekle(250);
  d.esit(await fiyatlar(t.page), { u7: 80, u8: 80, m1u7: 80, m1u8: 80, m2u7: 80 }, "liste fiyatı en yaygın özel fiyata (80) çekildi; aile birlikte, özel fiyatlar yerinde");
  d.esit((await say())[3][1], 1, "o aile \"liste fiyatı eskimiş\" listesinden çıktı");
  d.dogru(await t.page.evaluate(() => !document.querySelector('[data-fbcek="0"]')), "tek müşterinin yüksek fiyatı için \"çek\" önerisi yok");

  /* ürün kartında alış değişince: geçmiş + kâr uyarısı */
  await t.page.evaluate(() => openProductEdit("u3")); await bekle(250);
  await t.page.fill('#urunForm [name="alis"]', "600");
  await t.page.click('#urunForm button[type="submit"]'); await bekle(300);
  d.dogru(/Kârı düşen fiyatlar/.test(await t.page.textContent(".modal")) && /Sınama Derneği/.test(await t.page.textContent(".modal")), "ürün kartında alış fiyatı değişince kâr uyarısı çıkıyor");
  await t.page.click("#stkUyTamam"); await bekle(250);
  await t.git("fiyat-gecmisi");
  const g = await t.page.evaluate(() => [...document.querySelectorAll("#fgListe .stk-satir")].map((r) => r.textContent.replace(/\s+/g, " ")));
  d.dogru(g.length === 3 && /Örnek Kola 250 ml.*alış fiyatı · Ürün kartı.*600 ₺.*500 ₺ idi/.test(g[0]), "fiyat geçmişi: ne zaman, neyden neye, hangi kaynaktan");
  d.esit(t.p.hatalar, [], "sayfada betik hatası yok (fiyat bakımı)");
  await t.kapat();
}
d.bitir();
