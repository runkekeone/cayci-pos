// Günlük rapordaki satış listesi (görsel yenileme, maddeler 25–26). Sahte bulut, uydurma veri.
// Çalıştır: node testler/gorsel/liste-rapor.mjs
import { denetci } from "../ortak/panel.mjs";
import { listeStore, listeAc, bekle, olcu, modalBaslik, modalKapat } from "./liste-veri.mjs";

const d = denetci("gorsel/liste-rapor");
const st = listeStore();
const kararlar = { sil: true };
const o = await listeAc(st, { diyalog: (dl) => (kararlar.sil ? dl.accept() : dl.dismiss()).catch(() => {}) });
const { page, git } = o;
const gorunur = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, sel);
try {
  await git("rapor-gunluk");
  const bugun = st.sales.filter((s) => new Date(s.tarih).toDateString() === new Date().toDateString());
  console.log("— 25: seçim kutuları ve Sil");
  d.esit(await page.evaluate(() => document.querySelectorAll(".sat-liste .satr").length), bugun.length, "bugünün " + bugun.length + " satışı listede");
  d.dogru(!(await gorunur("#satSil")) && !(await gorunur("#satSecim")), "hiç seçim yokken \"Sil\" ve \"0 seçili\" görünmüyor");
  const hedef = await page.evaluate(() => [...document.querySelectorAll(".sat-liste .sat-chk"), document.querySelector(".sat-all .gl-sec")].map((l) => { const r = l.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  d.dogru(hedef.every(([w, h]) => w >= 44 && h >= 44), "seçim kutularının dokunma alanı en az 44×44 px (en küçük: " + Math.min(...hedef.map((x) => Math.min(...x))) + ")");
  d.dogru(await page.evaluate(() => [...document.querySelectorAll(".sat-liste .sat-sel")].every((c) => c.getBoundingClientRect().width >= 22)), "kutunun kendisi de büyüdü (≥ 22 px; eskiden 18)");
  // kutunun kenarına (kutunun dışına, dokunma alanının içine) basınca da seçiliyor ve satış penceresi açılmıyor
  const ilk = page.locator(".sat-liste .satr").first();
  await ilk.locator(".sat-chk").click({ position: { x: 4, y: 4 } }); await bekle(100);
  d.dogru(await page.evaluate(() => document.querySelector(".sat-liste .sat-sel").checked && !document.querySelector(".modal-overlay")), "dokunma alanının kenarına basınca kutu seçiliyor, satış penceresi açılmıyor");
  d.dogru(await gorunur("#satSil") && (await page.textContent("#satSecim")) === "1 seçili", "bir satış seçilince \"Sil\" ve \"1 seçili\" görünüyor");
  await page.locator(".sat-liste .satr").nth(2).locator(".sat-sel").click(); await bekle(100);
  d.esit(await page.textContent("#satSecim"), "2 seçili", "ikinci seçimde \"2 seçili\"");
  d.dogru(await page.evaluate(() => document.getElementById("satSil").getBoundingClientRect().height >= 44), "Sil düğmesi en az 44 px");
  await ilk.locator(".sat-sel").click(); await page.locator(".sat-liste .satr").nth(2).locator(".sat-sel").click(); await bekle(100);
  d.dogru(!(await gorunur("#satSil")), "seçim kaldırılınca \"Sil\" yine gizleniyor");

  console.log("— 26: adlar kesilmiyor");
  const adlar = await page.evaluate(() => [...document.querySelectorAll(".sat-liste .satr")].map((r) => { const a = r.querySelector(".satr-ad"), c = getComputedStyle(a), t = r.querySelector(".satr-tut"), ro = r.querySelector(".satr-ode"); return { ad: a.textContent, kesik: a.scrollWidth > a.clientWidth + 1 || c.textOverflow === "ellipsis" || c.whiteSpace === "nowrap", satir: Math.round(a.getBoundingClientRect().height / parseFloat(c.lineHeight)), tutarIcinde: t.getBoundingClientRect().right <= r.getBoundingClientRect().right, rozetAltta: ro.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 1, rozetIcinde: ro.getBoundingClientRect().right <= t.getBoundingClientRect().left + 1 }; }));
  const uzun = adlar.find((x) => /^Köy Yardımlaşma/.test(x.ad));
  d.dogru(adlar.every((x) => !x.kesik) && uzun.ad === "Köy Yardımlaşma ve Dayanışma Derneği Lokali Merkez Şubesi" && uzun.satir >= 2, "müşteri adı kesilmiyor; uzun ad alt satıra iniyor (" + uzun.satir + " satır)");
  d.dogru(adlar.every((x) => x.rozetAltta && x.rozetIcinde && x.tutarIcinde), "ödeme türü rozeti adın altında, tutarla çakışmıyor; tutar satırın içinde");
  const ol = await olcu(page, ".sat-card"); d.dogru(ol.tasma <= 0 && ol.enKucukYazi >= 13, "yana taşma yok, listede en küçük yazı ≥ 13 px (" + ol.enKucukYazi + ")");

  console.log("— satıra dokununca satış, seçip silme");
  await page.locator(".sat-liste .satr").nth(1).locator(".gl-ad").click(); await bekle(250);
  d.dogru(/^İrsaliye /.test(await modalBaslik(page)), "satıra dokununca irsaliye penceresi açılıyor"); await modalKapat(page);
  const once = await page.evaluate(() => { const r = [...document.querySelectorAll(".sat-liste .satr")]; const id = (i) => r[i].dataset.saleview; const s0 = store.sales.find((s) => s.id === id(0)), s2 = store.sales.find((s) => s.id === id(2)); return { ids: [id(0), id(2)], sayi: store.sales.length, kalemler: s0.items.concat(s2.items).map((it) => [it.urunId, it.adet]), arac: Object.fromEntries(store.products.map((p) => [p.id, Number(p.aracStok) || 0])) }; });
  await page.locator(".sat-liste .satr").nth(0).locator(".sat-sel").click(); await page.locator(".sat-liste .satr").nth(2).locator(".sat-sel").click(); await bekle(100);
  kararlar.sil = false; o.diyaloglar.length = 0; await page.click("#satSil"); await bekle(300);
  d.dogru(o.diyaloglar.some((x) => /2 satış silinsin mi/.test(x.mesaj)) && (await page.evaluate(() => store.sales.length)) === once.sayi, "Sil sorarak siliyor; İptal denince hiçbir şey silinmiyor");
  kararlar.sil = true; await page.click("#satSil"); await bekle(500);
  const sonra = await page.evaluate((ids) => ({ sayi: store.sales.length, duran: store.sales.filter((s) => ids.includes(s.id)).length, satir: document.querySelectorAll(".sat-liste .satr").length, arac: Object.fromEntries(store.products.map((p) => [p.id, Number(p.aracStok) || 0])) }), once.ids);
  d.dogru(sonra.sayi === once.sayi - 2 && sonra.duran === 0 && sonra.satir === bugun.length - 2, "seçilen iki satış silindi, diğerleri duruyor");
  const beklenenArac = { ...once.arac }; once.kalemler.forEach(([id, adet]) => { beklenenArac[id] += adet; });
  d.esit(sonra.arac, beklenenArac, "silinen satışların malı stoğa geri döndü (eski davranış)");
  d.dogru(!(await gorunur("#satSil")), "silmeden sonra seçim yok → \"Sil\" gizli");
  await page.click(".sat-all"); await bekle(100);
  d.dogru(await page.evaluate(() => [...document.querySelectorAll(".sat-sel")].every((c) => c.checked)) && (await page.textContent("#satSecim")) === (bugun.length - 2) + " seçili" && await gorunur("#satSil"), "\"Tümünü seç\" hepsini seçiyor");
  await page.click(".sat-all"); await bekle(100);
  d.dogru(await page.evaluate(() => [...document.querySelectorAll(".sat-sel")].every((c) => !c.checked)) && !(await gorunur("#satSil")), "ikinci dokunuş seçimi kaldırıyor");

  console.log("— çok satışlı liste (tarihsel rapor): ilk 100 + Hepsini göster");
  await page.evaluate(() => { const s0 = store.sales[0]; for (let i = 0; i < 140; i++) store.sales.push(Object.assign({}, s0, { id: "cok" + i, belgeNo: "X-" + i })); reportFilters["rapor-tarihsel"] = { from: "2020-01-01", to: todayStr() }; });
  await git("rapor-tarihsel");
  const cok = await page.evaluate(() => ({ hepsi: document.querySelectorAll(".sat-liste .satr").length, gorunen: [...document.querySelectorAll(".sat-liste .satr")].filter((r) => r.getBoundingClientRect().height > 0).length, dugme: (document.querySelector(".sat-liste .gl-hepsi") || {}).textContent }));
  d.dogru(cok.gorunen === 100 && cok.hepsi > 100 && /Hepsini göster \(\d+ kayıt daha\)/.test(cok.dugme), cok.hepsi + " satışın ilk 100'ü çiziliyor, kalanı \"Hepsini göster\"in arkasında");
  await page.click(".sat-all"); await bekle(100);
  d.esit(await page.textContent("#satSecim"), "100 seçili", "\"Tümünü seç\" yalnız görünen satışları seçiyor (görmediğini silemezsin)");
  await page.click(".sat-liste .gl-hepsi"); await bekle(150);
  d.dogru(await page.evaluate((n) => [...document.querySelectorAll(".sat-liste .satr")].filter((r) => r.getBoundingClientRect().height > 0).length === n, cok.hepsi), "\"Hepsini göster\" kalanları açıyor");
  d.esit(o.hatalar, [], "sayfada betik hatası yok");
} finally { await o.kapat(); }

const dar = await listeAc(listeStore(), { genislik: 360, yukseklik: 740 });
try {
  await dar.git("rapor-gunluk");
  const ol = await olcu(dar.page, "#content");
  const sig = await dar.page.evaluate(() => [...document.querySelectorAll(".sat-liste .satr")].every((r) => { const a = r.querySelector(".satr-ad"), t = r.querySelector(".satr-tut"); return a.scrollWidth <= a.clientWidth + 1 && t.getBoundingClientRect().right <= window.innerWidth && a.getBoundingClientRect().width >= 100; }));
  d.dogru(ol.tasma <= 0 && sig, "360 px: taşma yok, adlar kesilmiyor, büyük tutar (1.235.200 ₺) ekranda");
  await dar.page.evaluate(() => { const k = document.querySelectorAll(".sat-sel"); k[0].click(); k[1].click(); }); await bekle(100);
  d.dogru(await dar.page.evaluate(() => { const b = document.getElementById("satSil").getBoundingClientRect(), k = document.querySelector(".sat-tools").getBoundingClientRect(); return b.width > 0 && b.right <= k.right && document.querySelector(".sat-tools").scrollWidth <= document.querySelector(".sat-tools").clientWidth + 1; }), "360 px: \"Tümünü seç · 2 seçili · Sil\" tek satıra sığıyor");
  d.esit(dar.hatalar, [], "360 px: betik hatası yok");
} finally { await dar.kapat(); }
d.bitir();
