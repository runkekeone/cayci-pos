// Müşteri listesi + müşteri detayı (görsel yenileme, maddeler 17–23). Sahte bulut, uydurma veri.
// Çalıştır: node testler/gorsel/liste-musteri.mjs
import { denetci } from "../ortak/panel.mjs";
import { listeStore, listeAc, bekle, sade, olcu, menuBas, modalBaslik, modalKapat } from "./liste-veri.mjs";

const d = denetci("gorsel/liste-musteri");
const st = listeStore();
const o = await listeAc(st);
const { page, git } = o;
const detay = async (id) => { await page.evaluate((x) => { selectedCustomerId = x; }, id); await git("musteri-detay"); };
const gorunur = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, sel);
try {
  console.log("— 17/18/19/20: müşteri listesi");
  await git("musteriler");
  const liste = await page.evaluate(() => [...document.querySelectorAll("#glMusKart .gl-satir")].map((r) => ({ ad: r.querySelector(".gl-ad").textContent, h: Math.round(r.getBoundingClientRect().height), alt: r.getBoundingClientRect().bottom, tutar: r.querySelector(".gl-tutar").textContent })));
  d.esit(liste.length, 40, "40 müşteri de tek listede (sayfalama yok)");
  d.esit(liste.map((x) => x.ad), st.customers.map((c) => c.ad).sort((a, b) => a.localeCompare(b, "tr")), "adlar alfabetik (Türkçe sıra)");
  d.dogru(liste.every((x) => x.h >= 56), "her satır en az 56 px (en kısa: " + Math.min(...liste.map((x) => x.h)) + ")");
  const barUst = await page.evaluate(() => document.querySelector(".mobilbar").getBoundingClientRect().top);
  const sigan = liste.filter((x) => x.alt <= barUst + 1).length;
  d.dogru(sigan >= 8, "ilk ekrana en az 8 müşteri sığıyor (sığan: " + sigan + ")");
  d.dogru(await page.evaluate(() => !document.querySelector("#content table") && !document.querySelector("#content .pager") && !document.querySelector("#content .tbl-search")), "eski tablo / sayfa numaraları / küçük arama kutusu yok");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#content button")].filter((b) => /^(Sil|Ödeme Al|Veresiye Borç Ekle)$/.test(b.textContent.trim()) || /Düzenle/.test(b.textContent)).length), 0, "listede Sil / Ödeme Al / Düzenle / Veresiye düğmesi yok");
  d.esit(await page.evaluate(() => [...document.querySelectorAll(".page-head .actions .btn")].map((b) => b.textContent.trim())), ["Yeni müşteri", "Diğer"], "üstte yalnız iki düğme: Yeni müşteri + Diğer");
  const borclar = await page.evaluate(() => ({ m5: money.format(customerBorc("m5")), m9: money.format(customerBorc("m9")) }));
  d.dogru(liste.find((x) => /^Kardeşler/.test(x.ad)).tutar === borclar.m5 && liste.find((x) => /^Büyük Hesap/.test(x.ad)).tutar === borclar.m9, "satırdaki borç customerBorc ile aynı (büyük tutar dahil)");
  d.esit(liste.find((x) => x.ad === "Yıldız Çay Evi").tutar, "Borcu yok", "borcu olmayan müşteride tutar yerine \"Borcu yok\"");
  const rozet = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#glMusKart .gl-satir")].map((r) => [r.dataset.detay, [...r.querySelectorAll(".gl-rozet")].map((x) => x.textContent.trim())])));
  d.dogru(rozet.m5.includes("limit aşıldı") && rozet.m10.some((x) => /^\d+ gün gecikmiş$/.test(x)) && rozet.m6.length === 0, "işaretler duruyor: limit aşıldı (m5), N gün gecikmiş (m10); borçsuzda işaret yok");
  const beklenenRozet = await page.evaluate(() => { const y = borcYas("m10"); return y.gecikmeGun + " gün gecikmiş"; });
  d.dogru(rozet.m10.includes(beklenenRozet), "gecikme günü borcYas'tan geliyor (" + beklenenRozet + ")");
  const uzun = await page.evaluate(() => { const a = document.querySelector('#glMusKart .gl-satir[data-detay="m7"] .gl-ad'); return { tam: a.textContent, tasma: a.scrollWidth - a.clientWidth, satir: Math.round(a.getBoundingClientRect().height / parseFloat(getComputedStyle(a).lineHeight)) }; });
  d.dogru(uzun.tam === "Köy Yardımlaşma ve Dayanışma Derneği Lokali Merkez Şubesi" && uzun.tasma <= 0 && uzun.satir >= 2, "uzun ad kesilmiyor, alt satıra iniyor (" + uzun.satir + " satır)");
  let ol = await olcu(page, "#content");
  d.dogru(ol.tasma <= 0, "390 px: yana taşma yok"); d.dogru(ol.enKucukYazi >= 13, "en küçük yazı ≥ 13 px (" + ol.enKucukYazi + ")");
  d.dogru(await page.evaluate(() => { const i = document.getElementById("glMusAra").getBoundingClientRect(); return i.height >= 48 && i.width >= window.innerWidth - 40 && document.getElementById("glMusAra").placeholder === "Müşteri ara"; }), "üstte büyük \"Müşteri ara\" kutusu (≥ 48 px, tam genişlik)");

  console.log("— 20: arama (yazdıkça süzer, Türkçe harfe duyarsız)");
  const gorunenAdlar = () => page.evaluate(() => [...document.querySelectorAll("#glMusKart .gl-satir")].filter((r) => !r.hidden && r.getBoundingClientRect().height > 0).map((r) => r.querySelector(".gl-ad").textContent));
  const beklenen = (q) => st.customers.map((c) => c.ad).filter((ad) => q.split(" ").every((k) => sade(ad + " ").includes(sade(k)))).sort((a, b) => a.localeCompare(b, "tr"));
  for (const q of ["isik", "IŞIK", "cay", "ÇAY", "sirin", "kiraathane", "kar mer"]) {
    await page.fill("#glMusAra", q); await bekle(60);
    const g = await gorunenAdlar();
    d.dogru(g.length > 0 && JSON.stringify(g) === JSON.stringify(beklenen(q)), "\"" + q + "\" → " + g.length + " müşteri (ı/i, ş/s, ç/c fark etmiyor)");
  }
  await page.fill("#glMusAra", "5550001004"); d.esit(await gorunenAdlar(), ["Kardeşler Kıraathanesi Merkez Şube"], "telefon numarasıyla da bulunuyor");
  await page.fill("#glMusAra", "zzz bulunmaz"); await bekle(60);
  d.dogru((await gorunenAdlar()).length === 0 && await gorunur("#glMusKart .gl-yok") && /zzz bulunmaz/.test(await page.textContent("#glMusKart .gl-yok")), "eşleşme yoksa \"… ile eşleşen müşteri yok\" yazıyor");
  await page.click("#glMusKart [data-gl-temizle]"); await bekle(60);
  d.dogru((await gorunenAdlar()).length === 40 && (await page.inputValue("#glMusAra")) === "", "\"Aramayı temizle\" bütün listeyi geri getiriyor");
  await page.fill("#glMusAra", "bahar"); await page.evaluate(() => render()); await bekle(200);
  d.dogru((await page.inputValue("#glMusAra")) === "bahar" && (await gorunenAdlar()).length === beklenen("bahar").length, "ekran yeniden çizilince (eşitleme) yazılan arama kaybolmuyor");
  await page.click("#glMusAra + .gl-ara-sil"); await bekle(60);
  d.esit((await gorunenAdlar()).length, 40, "kutudaki çarpı aramayı temizliyor");

  console.log("— 19: Diğer menüsü (hiçbir işlev kaybolmadı)");
  await page.evaluate(() => { window.__inen = []; window.__ice = []; window.downloadFile = (ad) => { window.__inen.push(ad); }; window.openFileImport = (kabul) => { window.__ice.push(kabul); }; });
  await page.click('[data-act="gl-diger"]'); await bekle(250);
  d.esit(await page.evaluate(() => [...document.querySelectorAll(".modal-overlay .gl-menu-oge b")].map((b) => b.textContent)), ["Rehberden ekle", "Excel'e aktar", "İçe aktar", "Şablon indir"], "Diğer: Rehberden ekle, Excel'e aktar, İçe aktar, Şablon indir");
  d.dogru(await page.evaluate(() => [...document.querySelectorAll(".modal-overlay .gl-menu-oge")].every((b) => b.getBoundingClientRect().height >= 56)), "menü satırları en az 56 px");
  await menuBas(page, "Excel'e aktar"); d.esit(await page.evaluate(() => window.__inen), ["babuco-musteriler.csv"], "Excel'e aktar çalışıyor");
  await page.click('[data-act="gl-diger"]'); await bekle(250); await menuBas(page, "Şablon indir"); d.esit(await page.evaluate(() => window.__inen[1]), "babuco-musteri-sablon.csv", "Şablon indir çalışıyor");
  await page.click('[data-act="gl-diger"]'); await bekle(250); await menuBas(page, "İçe aktar"); d.esit(await page.evaluate(() => window.__ice), [".csv,text/csv"], "İçe aktar dosya seçtiriyor");
  o.diyaloglar.length = 0; await page.click('[data-act="gl-diger"]'); await bekle(250); await menuBas(page, "Rehberden ekle");
  d.dogru(o.diyaloglar.some((x) => /Rehber/.test(x.mesaj)), "Rehberden ekle rehberi açmaya çalışıyor (tarayıcıda: \"desteklenmiyor\" uyarısı)");
  d.esit(await page.evaluate(() => document.querySelectorAll(".modal-overlay").length), 0, "menü, seçimden sonra kapanıyor");
  await page.click('[data-act="yeni-musteri"]'); await bekle(250);
  d.esit(await modalBaslik(page), "Yeni Müşteri Oluştur", "Yeni müşteri penceresi açılıyor"); await modalKapat(page);

  console.log("— 17: satıra dokununca müşteri detayı");
  await page.click('#glMusKart .gl-satir[data-detay="m5"]'); await bekle(400);
  d.dogru(await page.evaluate(() => location.hash === "#/musteri-detay" && selectedCustomerId === "m5" && document.querySelector(".gl-oz-ad").textContent === "Kardeşler Kıraathanesi Merkez Şube"), "satıra dokununca o müşterinin detayı açıldı");

  console.log("— uzun liste: detaydan dönünce yer ve arama korunur");
  await page.evaluate(() => history.back()); await bekle(500);
  await page.evaluate(() => document.querySelector('#glMusKart .gl-satir[data-detay="m4"]').scrollIntoView({ block: "center" })); await bekle(100);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.click('#glMusKart .gl-satir[data-detay="m4"]'); await bekle(400);
  await page.evaluate(() => history.back()); await bekle(600);
  const y1 = await page.evaluate(() => ({ y: window.scrollY, hash: location.hash }));
  d.dogru(y0 > 500 && y1.hash === "#/musteriler" && Math.abs(y1.y - y0) <= 2, "listenin aşağısındaki müşteriden geri dönünce liste aynı yerde (kaydırma " + y0 + " → " + y1.y + ")");
  await page.evaluate(() => window.scrollTo(0, 0)); await page.fill("#glMusAra", "kahve"); await bekle(80);
  const kahve = (await gorunenAdlar()).length;
  await page.locator("#glMusKart .gl-satir:not([hidden])").first().click(); await bekle(400);
  await page.evaluate(() => history.back()); await bekle(500);
  d.dogru((await page.inputValue("#glMusAra")) === "kahve" && (await gorunenAdlar()).length === kahve, "aranan müşterinin detayından dönünce arama duruyor (" + kahve + " sonuç)");
  await git("anasayfa"); await git("musteriler");
  d.dogru((await page.inputValue("#glMusAra")) === "" && (await gorunenAdlar()).length === 40, "başka ekrandan gelince arama temiz, bütün liste görünüyor (eski süzgeç kalmıyor)");
  await page.click('#glMusKart .gl-satir[data-detay="m5"]'); await bekle(400);

  console.log("— 21/23: müşteri detayı (tek özet, iki ana düğme + Diğer)");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#content .btn")].filter((b) => b.getBoundingClientRect().height > 0).map((b) => b.textContent.trim())), ["Ödeme Al", "Hesap Özeti", "Diğer"], "ekranda yalnız üç düğme: Ödeme Al, Hesap Özeti, Diğer (\"Müşteriler\" düğmesi yok)");
  d.dogru(await page.evaluate(() => [...document.querySelectorAll(".gl-dugmeler .btn")].every((b) => b.getBoundingClientRect().height >= 48)), "düğmeler en az 48 px");
  d.dogru(await page.evaluate(() => !document.querySelector("#content .summary-grid") && !document.querySelector("#content .pd-kart") && document.querySelectorAll("#content .gl-ozet").length === 1), "borç tek yerde anlatılıyor (dört kutu + ayrı kart yok, tek özet var)");
  const oz = await page.evaluate(() => { const dd = limitDurum("m5", 0), y = borcYas("m5"); return { tutar: document.querySelector(".gl-oz-tutar").textContent, bek: money.format(customerBorc("m5")), boy: parseFloat(getComputedStyle(document.querySelector(".gl-oz-tutar")).fontSize), yazi: document.querySelector(".gl-ozet").innerText, limit: money.format(dd.limit), asim: money.format(dd.asim), vade: y.vade + " gün" }; });
  d.dogru(oz.tutar === oz.bek && oz.boy >= 28, "kalan borç büyük yazıyor ve customerBorc ile aynı (" + oz.boy + " px)");
  d.dogru(oz.yazi.includes("Borç limiti") && oz.yazi.includes(oz.limit) && oz.yazi.includes(oz.asim + " aşıldı") && oz.yazi.includes(oz.vade) && /limit aşıldı/.test(oz.yazi), "limit, aşım ve vade özetin içinde (limitDurum / borcYas değerleri)");
  d.dogru(!(await gorunur("#content [data-hatirlat]")), "gecikme yokken hatırlatma düğmesi öne çıkmıyor (m5)");
  await page.click(".gl-oz-dokum summary"); await bekle(100);
  const dokum = await page.evaluate(() => ({ yazi: document.querySelector(".gl-oz-dokum").innerText, satis: money.format(store.sales.filter((s) => s.musteriId === "m5").reduce((a, s) => a + s.toplam, 0)), tah: money.format(store.payments.filter((p) => p.musteriId === "m5").reduce((a, p) => a + p.tutar, 0)), ac: money.format(4200) }));
  d.dogru(dokum.yazi.includes(dokum.satis) && dokum.yazi.includes(dokum.tah) && dokum.yazi.includes(dokum.ac), "eski kutulardaki rakamlar (toplam satış, tahsilat, açılış borcu) \"Satış ve tahsilat toplamı\"nda duruyor");
  ol = await olcu(page, "#content"); d.dogru(ol.tasma <= 0 && ol.enKucukYazi >= 13, "detay: yana taşma yok, en küçük yazı ≥ 13 px (" + ol.enKucukYazi + ")");

  console.log("— geçmiş: tek satır kalıbı, boş bölüm yok");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#content .gl-bolum")].map((h) => h.textContent.replace(/\s+/g, " ").trim())), ["Alışverişler (2)", "Tahsilatlar (3)", "Toplu Siparişler (1)"], "m5: üç bölüm de kayıt sayısıyla");
  d.dogru(await page.evaluate(() => !document.querySelector("#content table") && !document.querySelector("#content .pager") && !document.querySelector("#content .tbl-search")), "detayda tablo / arama kutusu / sayfa numarası yok");
  d.dogru(/Tahsilat · Nakit/.test(await page.textContent("#glTahsilatlar")) && /Tahsilat · Kart/.test(await page.textContent("#glTahsilatlar")) && /Borç Ekleme/.test(await page.textContent("#glTahsilatlar")), "tahsilat türleri yazıyor");
  const ilkSatis = await page.evaluate(() => { const s = store.sales.filter((x) => x.musteriId === "m5").sort((a, b) => b.tarih.localeCompare(a.tarih))[0]; const r = document.querySelector("#glAlisverisler .gl-satir"); return { id: s.id, veri: r.dataset.sale, yazi: r.innerText, belge: s.belgeNo, tutar: money.format(s.toplam), acik: money.format(s.odeme.acik) }; });
  d.dogru(ilkSatis.veri === ilkSatis.id && ilkSatis.yazi.includes(ilkSatis.belge) && ilkSatis.yazi.includes(ilkSatis.tutar) && ilkSatis.yazi.includes("açık " + ilkSatis.acik), "alışveriş satırı: fiş no, tarih, tutar, açık kalan");
  await page.click("#glAlisverisler .gl-satir"); await bekle(400);
  d.dogru(await page.evaluate((id) => location.hash === "#/satis-detay" && selectedSaleId === id, ilkSatis.id), "alışveriş satırına dokununca satış detayı açılıyor");
  await detay("m5"); await page.click("#glTsiparisler .gl-satir"); await bekle(400);
  d.dogru(await page.evaluate(() => location.hash === "#/tsiparis-detay" && selectedTsiparisId === "ts1"), "toplu sipariş satırına dokununca sipariş detayı açılıyor");
  await detay("m6");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#content .gl-bolum")].map((h) => h.textContent.replace(/\s+/g, " ").trim())), ["Alışverişler (1)"], "m6: kaydı olmayan Tahsilatlar / Toplu Siparişler bölümü hiç çıkmıyor");
  d.dogru(/Borcu yok/.test(await page.textContent(".gl-ozet")) && !(await gorunur("#content [data-hatirlat]")), "borçsuz müşteri: \"Borcu yok\", hatırlatma düğmesi yok");
  await detay("m4");
  d.dogru(await page.evaluate(() => !document.querySelector("#content .gl-bolum") && /henüz alışverişi ya da tahsilatı yok/.test(document.querySelector("#content .gl-bos").textContent)), "yeni müşteri: bölüm yok, tek cümle var");
  await detay("m11");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#glAlisverisler .gl-satir")].filter((r) => r.getBoundingClientRect().height > 0).length), 10, "25 alışverişin ilk 10'u görünüyor");
  await page.click("#glAlisverisler .gl-hepsi"); await bekle(100);
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#glAlisverisler .gl-satir")].filter((r) => r.getBoundingClientRect().height > 0).length), 25, "\"Hepsini göster\" kalan 15'i açıyor");

  console.log("— 23: hatırlatma yalnız gecikme varken öne çıkıyor");
  await detay("m10");
  const gec = await page.evaluate(() => { const y = borcYas("m10"); const b = document.querySelector(".gl-ozet [data-hatirlat]"); return { var_: !!b && b.getBoundingClientRect().height >= 44, yazi: document.querySelector(".gl-oz-gecikme").innerText, bek: money.format(y.gecikmisTutar), gun: y.gecikmeGun + " gündür gecikmiş" }; });
  d.dogru(gec.var_ && gec.yazi.includes(gec.bek) && gec.yazi.includes(gec.gun) && /Nazik Hatırlatma \(WhatsApp\)/.test(gec.yazi), "gecikmiş müşteri: tutar + kaç gündür + \"Nazik Hatırlatma (WhatsApp)\" düğmesi özetin içinde");
  await page.click(".gl-ozet [data-hatirlat]"); await bekle(250);
  d.dogru(/^Hatırlatma — Kısa Vadeli Kahve/.test(await modalBaslik(page)), "düğme hatırlatma penceresini açıyor"); await modalKapat(page);
  await page.click('[data-act="gl-diger"]'); await bekle(250);
  d.dogru(!(await page.evaluate(() => [...document.querySelectorAll(".modal-overlay .gl-menu-oge b")].map((b) => b.textContent))).some((x) => /Hatırlatma/.test(x)), "gecikmişte hatırlatma menüde ikinci kez yok"); await modalKapat(page);

  console.log("— 21: detaydaki Diğer menüsü (eski sekiz düğmenin işlevleri)");
  await detay("m5");
  await page.click('[data-act="odeme"]'); await bekle(250); d.dogru(/^Ödeme Al — Kardeşler/.test(await modalBaslik(page)), "Ödeme Al penceresi açılıyor"); await modalKapat(page);
  await page.click('[data-act="ekstre"]'); await bekle(500); d.dogru(await page.evaluate(() => document.querySelectorAll(".modal-overlay").length === 1), "Hesap Özeti penceresi açılıyor (" + (await modalBaslik(page)) + ")"); await modalKapat(page);
  await page.click('[data-act="gl-diger"]'); await bekle(250);
  d.esit(await page.evaluate(() => [...document.querySelectorAll(".modal-overlay .gl-menu-oge b")].map((b) => b.textContent)), ["Veresiye borç ekle", "Toplu sipariş", "Fiyat listesi", "Rehberden numara al", "Düzenle", "Hatırlatma gönder (WhatsApp)", "Müşteriyi sil"], "Diğer: Veresiye, Toplu sipariş, Fiyat listesi, Rehberden numara, Düzenle, Hatırlatma, Sil");
  await modalKapat(page);
  for (const [oge, baslik] of [["Veresiye borç ekle", /^Veresiye Borç Ekle — Kardeşler/], ["Toplu sipariş", /Toplu Sipariş/i], ["Fiyat listesi", /Fiyat Listesi/i], ["Düzenle", /^Müşteri Düzenle$/], ["Hatırlatma gönder", /^Hatırlatma — Kardeşler/]]) {
    await page.click('[data-act="gl-diger"]'); await bekle(250); await menuBas(page, oge);
    const b = await modalBaslik(page);
    d.dogru(baslik.test(b), "Diğer → " + oge + " → \"" + b + "\""); await modalKapat(page);
  }
  o.diyaloglar.length = 0; await page.click('[data-act="gl-diger"]'); await bekle(250); await menuBas(page, "Rehberden numara al");
  d.dogru(o.diyaloglar.some((x) => /Rehber/.test(x.mesaj)), "Diğer → Rehberden numara al rehberi açmaya çalışıyor");

  console.log("— 18: silme detayın içinde, onayla");
  await page.click('[data-act="gl-diger"]'); await bekle(250); await menuBas(page, "Müşteriyi sil");
  const onay = await page.evaluate(() => ({ baslik: [...document.querySelectorAll(".modal-overlay .modal-head h3")].pop().textContent, yazi: document.querySelector(".gl-sil-onay").innerText, borc: money.format(customerBorc("m5")), dugme: [...document.querySelectorAll(".modal-overlay .modal-foot .btn")].map((b) => b.textContent.trim()) }));
  d.dogru(onay.baslik === "Müşteri silinsin mi?" && onay.yazi.includes("Kardeşler Kıraathanesi Merkez Şube") && onay.yazi.includes(onay.borc) && /geri alınamaz/.test(onay.yazi), "onay penceresi kimi sildiğini, borcunu ve geri alınamadığını söylüyor");
  d.esit(onay.dugme, ["Vazgeç", "Evet, sil"], "düğmeler: Vazgeç / Evet, sil");
  d.esit(await page.evaluate(() => store.customers.length), 40, "onaylanmadan hiçbir şey silinmedi");
  await page.click(".modal-overlay .modal-foot .close"); await bekle(200);
  d.dogru(await page.evaluate(() => store.customers.some((c) => c.id === "m5") && location.hash === "#/musteri-detay" && !document.querySelector(".modal-overlay")), "Vazgeç: müşteri duruyor, detayda kalındı");
  await page.click('[data-act="gl-diger"]'); await bekle(250); await menuBas(page, "Müşteriyi sil"); await page.click(".modal-overlay .modal-foot .ok"); await bekle(500);
  d.dogru(await page.evaluate(() => !store.customers.some((c) => c.id === "m5") && store.customers.length === 39 && location.hash === "#/musteriler" && !document.querySelector('#glMusKart [data-detay="m5"]') && document.querySelectorAll("#glMusKart .gl-satir").length === 39), "Evet, sil: müşteri silindi, listeye dönüldü");
  const s = Date.now(); let bulutta = true; while (Date.now() - s < 8000) { bulutta = o.bulut.deger("babuco:store").customers.some((c) => c.id === "m5"); if (!bulutta) break; await bekle(150); }
  d.dogru(!bulutta && o.bulut.deger("babuco:store").customers.length === 39, "silme buluta da yazıldı (eski silme ile aynı kayıt yolu)");
  d.esit(o.bulut.deger("babuco:store").sales.filter((x) => x.musteriId === "m5").length, 2, "müşterinin eski satış fişleri silinmedi");

  console.log("— 360 px");
  d.esit(o.hatalar, [], "sayfada betik hatası yok");
} finally { await o.kapat(); }

// dar telefon: taşma yok, düğmeler sığıyor
const dar = await listeAc(listeStore(), { genislik: 360, yukseklik: 740 });
try {
  await dar.git("musteriler");
  let ol = await olcu(dar.page, "#content"); d.dogru(ol.tasma <= 0, "360 px müşteriler: yana taşma yok");
  d.dogru(await dar.page.evaluate(() => [...document.querySelectorAll("#glMusKart .gl-satir")].every((r) => { const a = r.querySelector(".gl-ad"), t = r.querySelector(".gl-tutar"); return a.scrollWidth <= a.clientWidth + 1 && t.getBoundingClientRect().right <= window.innerWidth; })), "360 px: hiçbir ad kesilmiyor, hiçbir tutar ekrandan taşmıyor (1.234.567 ₺ dahil)");
  for (const id of ["m5", "m9", "m10", "m7"]) {
    await dar.page.evaluate((x) => { selectedCustomerId = x; }, id); await dar.git("musteri-detay");
    ol = await olcu(dar.page, "#content");
    const dugme = await dar.page.evaluate(() => [...document.querySelectorAll(".gl-dugmeler .btn")].map((b) => ({ sig: b.scrollWidth <= b.clientWidth + 1, sag: b.getBoundingClientRect().right })));
    const tutar = await dar.page.evaluate(() => { const t = document.querySelector(".gl-oz-tutar").getBoundingClientRect(), k = document.querySelector(".gl-ozet").getBoundingClientRect(); return t.right <= k.right - 8; });
    d.dogru(ol.tasma <= 0 && dugme.every((b) => b.sig && b.sag <= 360) && tutar, "360 px detay (" + id + "): taşma yok, üç düğme yazısıyla sığıyor, büyük tutar kartın içinde");
  }
  d.esit(dar.hatalar, [], "360 px: betik hatası yok");
} finally { await dar.kapat(); }
d.bitir();
