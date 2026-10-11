// Ürün listesi (görsel yenileme, madde 27 + 18/19/20'nin ürün tarafı). Sahte bulut, uydurma veri.
// Çalıştır: node testler/gorsel/liste-urun.mjs
import { denetci } from "../ortak/panel.mjs";
import { listeStore, listeAc, bekle, sade, olcu, menuBas, modalBaslik, modalKapat } from "./liste-veri.mjs";

const d = denetci("gorsel/liste-urun");
const st = listeStore();
const o = await listeAc(st);
const { page, git } = o;
try {
  console.log("— 27: ürün listesi tek satır");
  await git("urunler");
  const liste = await page.evaluate(() => [...document.querySelectorAll("#glUrunKart .gl-satir")].map((r) => ({ id: r.dataset.edit, ad: r.querySelector(".gl-ad").textContent, h: Math.round(r.getBoundingClientRect().height), fiyat: r.querySelector(".gl-tutar").textContent, alt: r.querySelector(".gl-alt").innerText.replace(/\s+/g, " ").trim() })));
  d.esit(liste.length, 130, "130 ürün de tek listede (sayfalama yok)");
  d.esit(liste.map((x) => x.ad), st.products.map((p) => p.ad).sort((a, b) => a.localeCompare(b, "tr")), "adlar alfabetik (Türkçe sıra)");
  d.dogru(liste.every((x) => x.h >= 56), "her satır en az 56 px");
  const u1 = liste.find((x) => x.id === "u1"), bek = await page.evaluate(() => money.format(100));
  d.dogru(u1.fiyat === bek && /^Su\s+Dükkan 40\s+Araç 20$/.test(u1.alt), "satırda: ad, grup, dükkan ve araç stoğu, satış fiyatı (\"" + u1.alt + "\" · " + u1.fiyat + ")");
  const sayfa = await page.evaluate(() => document.getElementById("content").innerText);
  d.dogru(/Satış fiyatı/.test(sayfa) && !/Fiyat 1/.test(sayfa), "\"Fiyat 1\" yerine \"Satış fiyatı\" yazıyor");
  d.dogru(await page.evaluate(() => !document.querySelector("#content table") && !document.querySelector("#content .pager") && !document.querySelector("#content .tbl-search")), "eski tablo / sayfa numaraları / küçük arama kutusu yok");
  d.esit(await page.evaluate(() => [...document.querySelectorAll("#content button")].filter((b) => /^(Sil|Düzenle)$/.test(b.textContent.trim())).length), 0, "listede Sil / Düzenle düğmesi yok");
  d.esit(await page.evaluate(() => [...document.querySelectorAll(".page-head .actions .btn")].map((b) => b.textContent.trim())), ["Ürün Ekle", "Diğer"], "üstte yalnız iki düğme: Ürün Ekle + Diğer");
  const isaret = await page.evaluate(() => { const al = (id) => { const r = document.querySelector('#glUrunKart .gl-satir[data-edit="' + id + '"]'); return { rozet: [...r.querySelectorAll(".gl-rozet")].map((x) => x.textContent.trim()), dukkanIsaretli: !!r.querySelector(".gl-stok b.stok-low:not(.arac-stok)"), aracIsaretli: !!r.querySelector(".arac-stok.stok-low"), renk: r.querySelector(".gl-stok b.stok-low") ? getComputedStyle(r.querySelector(".gl-stok b.stok-low")).color : "", yazi: r.querySelector(".gl-alt").innerText.replace(/\s+/g, " ") }; }; return { eksiD: al("u10"), eksiA: al("u15"), kritik: al("u19"), normal: al("u1"), metin: getComputedStyle(document.querySelector("#glUrunKart .gl-ad")).color }; });
  d.dogru(isaret.eksiD.rozet.includes("eksi stok") && isaret.eksiD.dukkanIsaretli && /Dükkan -4/.test(isaret.eksiD.yazi), "eksi dükkan stoğu belirgin (sayı işaretli + \"eksi stok\")");
  d.dogru(isaret.eksiA.rozet.includes("eksi stok") && isaret.eksiA.aracIsaretli, "eksi araç stoğu belirgin");
  d.dogru(isaret.kritik.rozet.includes("azaldı") && isaret.kritik.dukkanIsaretli, "kritik seviyenin altındaki ürün \"azaldı\" işaretli");
  d.dogru(isaret.normal.rozet.length === 0 && !isaret.normal.dukkanIsaretli && isaret.eksiD.renk !== isaret.metin, "stoğu yerinde olan üründe işaret yok; işaretli sayı farklı renkte");
  const uzun = await page.evaluate(() => { const a = [...document.querySelectorAll("#glUrunKart .gl-ad")].find((x) => /Çok Uzun Adlı/.test(x.textContent)); return { tasma: a.scrollWidth - a.clientWidth, satir: Math.round(a.getBoundingClientRect().height / parseFloat(getComputedStyle(a).lineHeight)) }; });
  d.dogru(uzun.tasma <= 0 && uzun.satir >= 2, "çok uzun ürün adı kesilmiyor (" + uzun.satir + " satır)");
  let ol = await olcu(page, "#content"); d.dogru(ol.tasma <= 0 && ol.enKucukYazi >= 13, "390 px: yana taşma yok, en küçük yazı ≥ 13 px (" + ol.enKucukYazi + ")");

  console.log("— 20: \"Ürün ara\"");
  d.dogru(await page.evaluate(() => { const i = document.getElementById("glUrunAra"); return i.getBoundingClientRect().height >= 48 && i.placeholder === "Ürün ara"; }), "üstte büyük \"Ürün ara\" kutusu");
  const gorunen = () => page.evaluate(() => [...document.querySelectorAll("#glUrunKart .gl-satir")].filter((r) => !r.hidden && r.getBoundingClientRect().height > 0).map((r) => r.dataset.edit).sort());
  const beklenen = (q) => st.products.filter((p) => q.split(" ").every((k) => sade(p.ad + " " + (p.grup || "") + " " + (p.barkod || "")).includes(sade(k)))).map((p) => p.id).sort();
  for (const q of ["seftali", "ŞEFTALİ", "kusburnu", "ihlamur", "uzun adli", "kagit", "8690000001040"]) {
    await page.fill("#glUrunAra", q); await bekle(80);
    const g = await gorunen();
    d.dogru(g.length > 0 && JSON.stringify(g) === JSON.stringify(beklenen(q)), "\"" + q + "\" → " + g.length + " ürün");
  }
  await page.fill("#glUrunAra", "olmayan urun"); await bekle(80);
  d.dogru((await gorunen()).length === 0 && /olmayan urun/.test(await page.textContent("#glUrunKart .gl-yok")) && await page.evaluate(() => !document.querySelector("#glUrunKart .gl-yok").hidden), "eşleşme yoksa \"… ile eşleşen ürün yok\"");
  await page.click("#glUrunKart [data-gl-temizle]"); await bekle(80); d.esit((await gorunen()).length, 130, "\"Aramayı temizle\" listeyi geri getiriyor");

  console.log("— 19: Diğer menüsü");
  await page.evaluate(() => { window.__inen = []; window.__ice = []; window.downloadFile = (ad) => { window.__inen.push(ad); }; window.openFileImport = (kabul) => { window.__ice.push(kabul); }; });
  await page.click('[data-act="gl-diger"]'); await bekle(250);
  d.esit(await page.evaluate(() => [...document.querySelectorAll(".modal-overlay .gl-menu-oge b")].map((b) => b.textContent)), ["Araç stoğu", "Fiyat listesi", "Excel'e aktar", "İçe aktar", "Şablon indir"], "Diğer: Araç stoğu, Fiyat listesi, Excel'e aktar, İçe aktar, Şablon indir");
  await menuBas(page, "Excel'e aktar"); d.dogru(await page.evaluate(() => window.__inen.length === 1 && /urun/.test(window.__inen[0])), "Excel'e aktar çalışıyor");
  await page.click('[data-act="gl-diger"]'); await bekle(250); await menuBas(page, "Şablon indir"); d.esit(await page.evaluate(() => window.__inen[1]), "babuco-urun-sablon.csv", "Şablon indir çalışıyor");
  await page.click('[data-act="gl-diger"]'); await bekle(250); await menuBas(page, "İçe aktar"); d.esit(await page.evaluate(() => window.__ice), [".csv,text/csv"], "İçe aktar dosya seçtiriyor");
  await page.click('[data-act="gl-diger"]'); await bekle(250); await menuBas(page, "Fiyat listesi"); d.dogru(/Fiyat Listesi/i.test(await modalBaslik(page)), "Fiyat listesi penceresi açılıyor"); await modalKapat(page);
  await page.click('[data-act="gl-diger"]'); await bekle(250); await menuBas(page, "Araç stoğu"); await bekle(300);
  d.esit(await page.evaluate(() => location.hash), "#/arac-yukleme", "Araç stoğu ekranı açılıyor");

  console.log("— 27: satıra dokununca düzenleme; 18: silme düzenleme ekranında, onayla");
  await git("urunler"); await page.click('#glUrunKart .gl-satir[data-edit="u3"]'); await bekle(400);
  d.dogru(await page.evaluate(() => location.hash === "#/urun-ekle" && editProductId === "u3" && document.querySelector('#urunForm [name="ad"]').value === "Örnek Kola 250 ml"), "satıra dokununca o ürünün düzenleme ekranı açıldı");
  const sil = await page.evaluate(() => { const b = document.getElementById("glUrunSil"), k = document.querySelector('#urunForm button[type="submit"]'); return b ? { var_: true, h: b.getBoundingClientRect().height, formDisi: !b.closest("form"), ara: b.getBoundingClientRect().top - k.getBoundingClientRect().bottom } : { var_: false }; });
  d.dogru(sil.var_ && sil.formDisi && sil.h >= 44 && sil.ara >= 24, "\"Bu ürünü sil\" düzenleme ekranının altında, Kaydet'ten ayrı (" + Math.round(sil.ara) + " px aşağıda)");
  await page.click("#glUrunSil"); await bekle(250);
  const onay = await page.evaluate(() => ({ baslik: [...document.querySelectorAll(".modal-overlay .modal-head h3")].pop().textContent, yazi: document.querySelector(".gl-sil-onay").innerText, dugme: [...document.querySelectorAll(".modal-overlay .modal-foot .btn")].map((b) => b.textContent.trim()) }));
  d.dogru(onay.baslik === "Ürün silinsin mi?" && onay.yazi.includes("Örnek Kola 250 ml") && /geri alınamaz/.test(onay.yazi), "onay penceresi hangi ürünü sildiğini ve geri alınamadığını söylüyor");
  d.esit(onay.dugme, ["Vazgeç", "Evet, sil"], "düğmeler: Vazgeç / Evet, sil");
  await page.click(".modal-overlay .modal-foot .close"); await bekle(200);
  d.dogru(await page.evaluate(() => store.products.some((p) => p.id === "u3") && location.hash === "#/urun-ekle"), "Vazgeç: ürün duruyor");
  await page.click("#glUrunSil"); await bekle(250); await page.click(".modal-overlay .modal-foot .ok"); await bekle(500);
  d.dogru(await page.evaluate(() => !store.products.some((p) => p.id === "u3") && store.products.length === 129 && location.hash === "#/urunler" && document.querySelectorAll("#glUrunKart .gl-satir").length === 129 && editProductId === null), "Evet, sil: ürün silindi, listeye dönüldü");
  const s = Date.now(); let bulutta = true; while (Date.now() - s < 8000) { bulutta = o.bulut.deger("babuco:store").products.some((p) => p.id === "u3"); if (!bulutta) break; await bekle(150); }
  d.dogru(!bulutta, "silme buluta da yazıldı");
  await page.click('#glUrunKart .gl-satir[data-edit="u2"]'); await bekle(350); await page.evaluate(() => history.back()); await bekle(400);
  await page.click('[data-act="gl-urun-ekle"]'); await bekle(400);
  d.dogru(await page.evaluate(() => location.hash === "#/urun-ekle" && editProductId === null && document.querySelector('#urunForm [name="ad"]').value === "" && !document.getElementById("glUrunSil")), "\"Ürün Ekle\" boş form açıyor (az önce bakılan ürünü değil); yeni üründe sil düğmesi yok");
  d.esit(o.hatalar, [], "sayfada betik hatası yok");
} finally { await o.kapat(); }

const dar = await listeAc(listeStore(), { genislik: 360, yukseklik: 740 });
try {
  await dar.git("urunler");
  const ol = await olcu(dar.page, "#content");
  d.dogru(ol.tasma <= 0 && await dar.page.evaluate(() => [...document.querySelectorAll("#glUrunKart .gl-satir")].every((r) => { const a = r.querySelector(".gl-ad"), t = r.querySelector(".gl-tutar"); return a.scrollWidth <= a.clientWidth + 1 && t.getBoundingClientRect().right <= window.innerWidth && a.getBoundingClientRect().width >= 110; })), "360 px ürünler: taşma yok, ad kesilmiyor, fiyat (1.234.567 ₺ dahil) ekranda, ada en az 110 px kalıyor");
  d.esit(dar.hatalar, [], "360 px: betik hatası yok");
} finally { await dar.kapat(); }
d.bitir();
