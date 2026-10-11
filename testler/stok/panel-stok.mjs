// PANEL — stok gerçek olsun: alış faturası doğru havuza girer / silince geri alınır, iki havuz için sayım,
// eksi sıfırlama, araca alım (alış kaydı) ve dükkandan yükleme (aktarma), alınacaklar + kritik öneri, zil.
// Çalıştır: node testler/stok/panel-stok.mjs
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { panelAc, denetci, bekle } from "../ortak/panel.mjs";
import { tabanPanel, stokStore, satirlar, gun } from "./yardimci.mjs";

const d = denetci("panel-stok");
async function ac(store, panelDizin) {
  const bulut = await sahteBulut({ satirlar: satirlar(store) });
  const p = await panelAc({ bulutUrl: bulut.url, panelDizin });
  await p.page.waitForFunction((n) => window.app.getStore().products.length === n, store.products.length, { timeout: 10000 });
  await bekle(300);
  const git = async (yol) => { await p.page.evaluate((r) => { location.hash = "#/" + r; }, yol); await bekle(250); };
  const urun = (id) => p.page.evaluate((i) => { const x = store.products.find((q) => q.id === i); return [Number(x.stok), Number(x.aracStok)]; }, id);
  return { bulut, p, page: p.page, git, urun, kapat: async () => { await p.kapat(); await bulut.dur(); } };
}
function veri() {
  const s = stokStore();
  s.purchases.push({ id: "a0", no: "ESKI-1", firmaId: null, items: [{ urunId: "u2", ad: "Örnek Pet Su 500 ml", adet: 4, birimFiyat: 120 }], toplam: 480, odeme: "pesin", borc: 0, tarih: gun(12) });   // eski kayıt: hedef/odemeTuru yok
  s.firmalar.push({ id: "f1", ad: "Deneme Toptan", telefon: "" });
  return s;
}

/* ---------- ÖNCE (taban panel): alış yalnız dükkana giriyordu; araç havuzu sayılamıyordu; zil yalnız dükkana bakıyordu ---------- */
{
  const dizin = tabanPanel();
  if (dizin) {
    const st = veri(); Object.assign(st.products.find((x) => x.id === "u1"), { stok: 2, aracStok: 30, kritik: 5 });
    const t = await ac(st, dizin);
    await t.git("alis-olustur");
    d.dogru(await t.page.evaluate(() => !document.querySelector("#aHedef") && !document.querySelector("#aOdemeTuru")), "taban (YOKTU): alış faturasında \"nereye girsin\" ve ödeme türü yoktu");
    await t.page.selectOption('[data-ar="0"][data-fld="urunId"]', "u3"); await t.page.fill('[data-ar="0"][data-fld="adet"]', "5"); await bekle(100);
    await t.page.click("#aSave"); await bekle(300);
    d.esit(await t.urun("u3"), [17, -4], "taban (YANLIŞ): araca alınan mal da dükkan stoğuna yazılıyordu");
    await t.git("stok-sayimi");
    d.dogru(await t.page.evaluate(() => !document.querySelector('[data-act="sayArac"]')), "taban (YOKTU): araç stoğu sayılamıyordu");
    d.esit(await t.page.evaluate(() => window.app.criticalProducts().map((x) => x.id)), ["u1"], "taban (YANLIŞ): araçta 30 koli varken zil \"bitti\" diyordu (yalnız dükkana bakıyordu)");
    d.dogru(await t.page.evaluate(() => getComputedStyle(document.getElementById("bellBtn")).display === "none"), "taban (YANLIŞ): zil telefonda (390 px) hiç görünmüyordu");
    await t.kapat();
  }
}

/* ---------- 1) Alış faturası → seçilen havuz + ödeme türü; kâr uyarısı; silince aynı havuzdan geri ---------- */
{
  const t = await ac(veri());
  await t.git("alis-olustur");
  await t.page.click('[data-sec="aHedef"] [data-v="arac"]');
  await t.page.click('[data-sec="aOdemeTuru"] [data-v="kart"]');
  await t.page.selectOption("#aFirma", "f1");
  await t.page.fill("#aNo", "F-12");
  await t.page.selectOption('[data-ar="0"][data-fld="urunId"]', "u3");
  await t.page.fill('[data-ar="0"][data-fld="adet"]', "5");
  await t.page.fill('[data-ar="0"][data-fld="birimFiyat"]', "600");
  d.dogru(await t.page.evaluate(() => document.activeElement && document.activeElement.dataset.fld === "birimFiyat"), "fiyat yazarken satır yeniden çizilmiyor (odak yerinde kalıyor)");
  await t.page.fill("#aFisToplam", "3200");
  d.dogru(/3\.200 ₺/.test(await t.page.textContent("#aTotal")) && /fark 200 ₺/.test(await t.page.textContent("#aFark")), "faturadaki toplam esas alınıyor, satır toplamıyla fark gösteriliyor");
  await t.page.click("#aSave"); await bekle(300);
  d.esit(await t.urun("u3"), [12, 1], "mal ARAÇ stoğuna girdi (−4 → 1), dükkan değişmedi");
  const k = await t.page.evaluate(() => store.purchases[store.purchases.length - 1]);
  d.esit({ hedef: k.hedef, odeme: k.odeme, tur: k.odemeTuru, firma: k.firmaId, no: k.no, toplam: k.toplam, kalem: k.kalemToplam, borc: k.borc }, { hedef: "arac", odeme: "pesin", tur: "kart", firma: "f1", no: "F-12", toplam: 3200, kalem: 3000, borc: 0 }, "alış kaydı: hedef araç, peşin · kart, fişteki toplam");
  d.dogru(await t.page.evaluate(() => { const m = document.querySelector(".modal"); return !!m && /Kârı düşen fiyatlar/.test(m.textContent) && /Örnek Kola 250 ml/.test(m.textContent) && /Sınama Derneği — özel fiyat/.test(m.textContent); }), "alış fiyatı 500 → 600 olunca kârı düşen ürün ve özel fiyatlı müşteri uyarısı çıkıyor");
  await t.page.click("#stkUyTamam"); await bekle(250);
  d.esit(await t.page.evaluate(() => location.hash), "#/alis-faturalari", "uyarı kapanınca fatura listesine dönüyor");
  d.dogru(await t.page.evaluate(() => /Araç/.test(document.querySelector("#content tbody tr").textContent) && /Peşin · Kart/.test(document.querySelector("#content tbody tr").textContent)), "fatura listesi malın nereye girdiğini ve ödeme türünü gösteriyor");
  await t.page.click(`[data-delp="${k.id}"]`); await bekle(250);
  d.esit(await t.urun("u3"), [12, -4], "fatura silinince stok girdiği havuzdan (araç) geri alındı");
  d.dogru(/ARAÇ stoğundan geri alınır/.test(t.p.diyaloglar.map((x) => x.mesaj).join("|")), "silme onayı hangi havuzdan geri alınacağını söylüyor");
  await t.page.click('[data-delp="a0"]'); await bekle(250);
  d.esit(await t.urun("u2"), [26, 10], "eski (hedef alanı olmayan) fatura silinince dükkandan geri alınıyor");

  /* veresiye + yeni firma */
  await t.git("alis-olustur");
  await t.page.click('[data-sec="aOdeme"] [data-v="veresiye"]');
  d.dogru(await t.page.evaluate(() => document.getElementById("aTurKutu").style.display === "none"), "veresiyede \"nasıl ödedin\" gizleniyor");
  await t.page.selectOption("#aFirma", "__yeni"); await t.page.fill("#aFirmaYeni", "Yeni Toptancı");
  await t.page.selectOption('[data-ar="0"][data-fld="urunId"]', "u1"); await t.page.fill('[data-ar="0"][data-fld="adet"]', "10"); await bekle(100);
  await t.page.click("#aSave"); await bekle(300);
  const v = await t.page.evaluate(() => { const k = store.purchases[store.purchases.length - 1], f = store.firmalar.find((x) => x.id === k.firmaId); return { firma: f && f.ad, hedef: k.hedef, odeme: k.odeme, borc: k.borc, tur: k.odemeTuru, firmaBorc: window.app.firmaBorc(k.firmaId) }; });
  d.esit(v, { firma: "Yeni Toptancı", hedef: "dukkan", odeme: "veresiye", borc: 700, firmaBorc: 700 }, "veresiye alış: yeni firma açıldı, borç firmaya yazıldı, mal dükkana girdi");

  /* firmaya ödeme: ödeme türü */
  await t.git("firmalar");
  await t.page.click(`[data-fode="${await t.page.evaluate(() => store.firmalar.find((x) => x.ad === "Yeni Toptancı").id)}"]`); await bekle(200);
  await t.page.click('.modal [data-sec="fTur"] [data-v="havale"]'); await t.page.fill("#fTut", "300"); await t.page.click(".modal .ok"); await bekle(200);
  d.esit(await t.page.evaluate(() => store.firmaPayments.map((x) => [x.tutar, x.odemeTuru])), [[300, "havale"]], "firmaya ödeme, ödeme türüyle kaydedildi");
  d.esit(t.p.hatalar, [], "sayfada betik hatası yok (alış)");
  await t.kapat();
}

/* ---------- 2) Stok sayımı: araç havuzu; arama, +/−; eksi sıfırlama ---------- */
{
  const t = await ac(veri());
  await t.git("stok-sayimi");
  d.dogru(/Dükkanda 1, araçta 1 üründe/.test(await t.page.textContent(".stk-uyari")), "sayım ekranı eksi stokları haber veriyor");
  await t.page.click('[data-act="sayArac"]'); await bekle(300);
  const ilk = await t.page.evaluate(() => [...document.querySelectorAll("[data-sayrow] .stk-s-sol b")].slice(0, 2).map((x) => x.textContent));
  d.esit(ilk, ["Örnek Bardak Su 200 ml", "Örnek Küp Şeker"], "son 3 ayda çok satılanlar en üstte");
  d.dogru(await t.page.evaluate(() => { const b = document.querySelector("[data-sayarti]").getBoundingClientRect(); return b.width >= 44 && b.height >= 44; }), "+/− düğmeleri en az 44 px");
  const sira = await t.page.evaluate(() => { const s = store.stokSayimlari[0]; return { u3: s.items.findIndex((i) => i.urunId === "u3"), u1: s.items.findIndex((i) => i.urunId === "u1"), havuz: s.havuz, sistem: s.items.find((i) => i.urunId === "u3").sistem }; });
  d.esit([sira.havuz, sira.sistem], ["arac", -4], "sayım araç havuzu için açıldı, kayıtlı miktar araç stoğu");
  await t.page.fill("#sayAra", "kola"); await bekle(100);
  d.esit(await t.page.evaluate(() => [...document.querySelectorAll("[data-sayrow]")].filter((r) => r.style.display !== "none").length), 1, "arama listeyi daraltıyor");
  await t.page.fill(`[data-say="${sira.u3}"]`, "6");
  await t.page.fill("#sayAra", ""); await bekle(100);
  await t.page.click(`[data-sayarti="${sira.u1}"]`); await t.page.click(`[data-sayarti="${sira.u1}"]`); await t.page.click(`[data-sayeksi="${sira.u1}"]`);
  d.esit(await t.page.evaluate((i) => document.querySelector(`[data-say="${i}"]`).value, sira.u1), "1", "+ + − → 1");
  d.dogru(/^2 \/ 10 sayıldı/.test(await t.page.textContent("#sayDurum")), "kaç ürünün sayıldığı gösteriliyor");
  await t.page.click('[data-act="tamamla"]'); await bekle(300);
  d.esit([await t.urun("u3"), await t.urun("u1"), await t.urun("u2")], [[12, 6], [40, 1], [30, 10]], "sayılanlar ARAÇ stoğuna yazıldı; dükkan ve sayılmayan ürünler değişmedi");
  d.esit(await t.page.evaluate(() => store.stokHareket.map((h) => [h.urunId, h.miktar, h.tur, h.havuz]).sort()), [["u1", -19, "Sayım Düzeltme (Araç)", "arac"], ["u3", 10, "Sayım Düzeltme (Araç)", "arac"]], "farklar stok hareketine işlendi");

  await t.page.click('[data-act="eksiSifirla"]'); await bekle(200);
  d.dogru(/Örnek Küp Şeker/.test(await t.page.textContent(".modal")) && /-7 → 0/.test(await t.page.textContent(".modal")), "eksi sıfırlama önce neyin 0 olacağını gösteriyor");
  d.esit(await t.urun("u5"), [-7, 15], "onaylanmadan hiçbir şey değişmedi");
  await t.page.click(".modal .ok"); await bekle(250);
  d.esit([await t.urun("u5"), await t.page.evaluate(() => !document.querySelector(".stk-uyari"))], [[0, 15], true], "onaylayınca eksi stok 0 oldu, uyarı kalktı");
  d.esit(t.p.hatalar, [], "sayfada betik hatası yok (sayım)");
  await t.kapat();
}

/* ---------- 3) Araca mal girişi: satın alma alış kaydı bırakır; dükkandan yükleme aktarmadır ---------- */
{
  const dizin = tabanPanel();
  if (dizin) {
    const t = await ac(veri(), dizin);
    await t.page.evaluate(() => aracAlimModal()); await bekle(200);
    await t.page.fill('[data-aa="u3"]', "2"); await t.page.click('[data-aaadd="u3"]'); await bekle(150);
    d.esit(await t.page.evaluate(() => [store.purchases.length, store.expenses.filter((e) => e.kategori === "Araç Stok Alımı").length]), [1, 1], "taban (YANLIŞ): araca alım alış kaydı bırakmıyor, GİDER yazıyordu (purchases yalnız eski 1 kayıt)");
    await t.kapat();
  }
  const t = await ac(veri());
  await t.page.evaluate(() => aracAlimModal()); await bekle(200);
  await t.page.fill('[data-aa="u3"]', "2"); await t.page.fill('[data-aaal="u3"]', "510"); await t.page.click('[data-aaadd="u3"]'); await bekle(150);
  await t.page.fill('[data-aa="u1"]', "3"); await t.page.click('[data-aaadd="u1"]'); await bekle(150);
  const s = await t.page.evaluate(() => { const k = store.purchases[store.purchases.length - 1]; return { n: store.purchases.length, hedef: k.hedef, odeme: k.odeme, tur: k.odemeTuru, toplam: k.toplam, kalem: k.items.map((i) => [i.urunId, i.adet, i.birimFiyat]), gider: store.expenses.filter((e) => e.kategori === "Araç Stok Alımı").length, sayac: store.counters.purchase }; });
  d.esit(s, { n: 2, hedef: "arac", odeme: "pesin", tur: "nakit", toplam: 1230, kalem: [["u3", 2, 510], ["u1", 3, 70]], gider: 0, sayac: 1 }, "araca alım: aynı pencerede eklenenler TEK alış kaydında; gider yazılmıyor (kasadan çift düşmez)");
  d.esit([await t.urun("u3"), await t.urun("u1")], [[12, -2], [40, 23]], "satın alınan mal araç stoğuna girdi, dükkan değişmedi");
  await t.page.click('.modal [data-sec="aaMod"] [data-v="yukle"]'); await bekle(150);
  d.dogru(await t.page.evaluate(() => !document.querySelector("[data-aaal]") && document.getElementById("aaTurKutu").style.display === "none"), "\"dükkandan yükledim\" modunda fiyat ve ödeme sorulmuyor");
  await t.page.fill('[data-aa="u2"]', "4"); await t.page.click('[data-aaadd="u2"]'); await bekle(150);
  d.esit([await t.urun("u2"), await t.page.evaluate(() => store.purchases.length)], [[26, 14], 2], "dükkandan yükleme: dükkandan düştü, araca eklendi, alış kaydı açılmadı");
  d.esit(t.p.hatalar, [], "sayfada betik hatası yok (araca alım)");
  await t.kapat();
}

/* ---------- 4) Alınacaklar + kritik öneri + zil ---------- */
{
  const st = veri();
  Object.assign(st.products.find((x) => x.id === "u1"), { stok: 1, aracStok: 1 });       // haftada 2,5 → 2 haftalık 5 → 3 al
  st.products.find((x) => x.id === "u5").aracStok = 2;                                    // eksi dükkan → 0 sayılır → 4 al
  const t = await ac(st);
  await t.git("alinacaklar");
  d.dogru(/Bu liste henüz güvenilir değil/.test(await t.page.textContent(".stk-uyari")), "eksi stok varken listenin güvenilmez olduğu en üstte yazıyor");
  const liste = await t.page.evaluate(() => [...document.querySelectorAll("#alListe .stk-satir")].map((r) => [r.querySelector(".stk-s-sol b").textContent, r.querySelector(".stk-s-sag b").textContent, r.classList.contains("eksi")]));
  d.esit(liste, [["Örnek Bardak Su 200 ml", "3", false], ["Örnek Küp Şeker", "4", true]], "alınacaklar: önerilen miktarlar (araçla aynı hesap), eksi stoklu satır işaretli");
  await t.page.selectOption("#alHedef", "3"); await bekle(200);
  d.esit(await t.page.evaluate(() => document.querySelector("#alListe .stk-satir .stk-s-sag b").textContent), "6", "\"kaç haftalık mal dursun\" değişince miktar yeniden hesaplanıyor (3 hafta → 6)");
  await t.page.selectOption("#alHedef", "2"); await bekle(200);
  await t.page.click('[data-act="alPaylas"]'); await bekle(200);
  d.dogru(/• 3 Koli Örnek Bardak Su 200 ml/.test(await t.page.inputValue("#stkPayMetin")), "liste metin olarak paylaşılabiliyor");
  await t.page.click(".modal .x");
  await t.page.click("#alKritik"); await bekle(200);
  d.dogru(/Seviyesi boş olan 4 ürüne yaz/.test(await t.page.textContent(".modal")), "kritik seviye önerisi satış hızından geliyor");
  await t.page.click("#kritBos"); await bekle(250);
  d.esit(await t.page.evaluate(() => ["u1", "u2", "u3", "u4", "u5", "u6"].map((id) => store.products.find((x) => x.id === id).kritik)), [5, 1, 1, 1, 2, ""], "tek dokunuşla uygulandı (elle girilmiş 5 korundu)");

  d.esit(await t.page.evaluate(() => window.app.criticalProducts().map((x) => x.id).sort()), ["u1", "u5"], "zil: dükkan + araç TOPLAMI kritik seviyenin altındakiler");
  await t.page.evaluate(() => { Object.assign(store.products.find((x) => x.id === "u1"), { stok: 2, aracStok: 30 }); render(); });
  d.esit(await t.page.evaluate(() => window.app.criticalProducts().map((x) => x.id)), ["u5"], "zil: mal araçtaysa \"bitti\" demiyor");
  d.dogru(await t.page.evaluate(() => getComputedStyle(document.getElementById("bellBtn")).display !== "none" && document.getElementById("bellBadge").textContent === "1"), "zil telefonda görünüyor ve sayıyı gösteriyor");
  await t.page.click("#bellBtn"); await bekle(150);
  d.dogru(/Örnek Küp Şeker/.test(await t.page.textContent("#bellDropdown")) && /stok eksi — sayım yapın/.test(await t.page.textContent("#bellDropdown")), "zil listesi azalan ürünü ve eksi stok uyarısını gösteriyor");
  await t.git("urunler");
  d.dogru(await t.page.evaluate(() => [...document.querySelectorAll("#content .gl-satir")].some((tr) => /Örnek Kola/.test(tr.textContent) && tr.querySelector(".arac-stok.stok-low"))), "ürün listesinde eksi araç stoğu işaretli");
  d.esit(t.p.hatalar, [], "sayfada betik hatası yok (alınacaklar)");
  await t.kapat();
}
d.bitir();
