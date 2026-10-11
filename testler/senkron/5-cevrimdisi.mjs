// Senaryo 5: internet yokken satış. Telefonun bağlantısı kesilir (araç çalışmaya devam eder),
// telefonda satış + tahsilat yapılır, uygulama kapatılıp internetsiz yeniden açılır, bir satış daha yapılır.
// Bu arada araç buluta satış ve tahsilat yazar. Bağlantı gelince hepsi bulutta olmalı.
//   ESKİ: internet yokken tam ekran kilit ("İnternet bağlantısı gerekli") → satış yazılamıyor.
//   YENİ: küçük şerit; kayıtlar telefonda bekler; bağlantı gelince birleştirilerek gider.
// Çalıştır: node testler/senkron/5-cevrimdisi.mjs      (ekran görüntüsü: _wt/ekran/senkron/)
import fs from "node:fs";
import path from "node:path";
import { senkronBulut, panel, yenidenAc, aracCalistir, satis, tahsilat, hazir, esitlendi, yokla, baglantiKes, baglantiAc, denetci, bekle, ornekStore, ornekSatirlar, borc, bul, ESKI_MI } from "./yardimci.mjs";

const EKRAN = path.resolve(import.meta.dirname, "../../../ekran/senkron");
fs.mkdirSync(EKRAN, { recursive: true });
const d = denetci("5-cevrimdisi");
const ilk = ornekStore();
const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
const p = await panel(bulut);
const serit = (page) => page.evaluate(() => { const e = document.getElementById("es-serit"); return e ? { sinif: e.className, yazi: e.textContent, yukseklik: e.offsetHeight } : null; });
try {
  await hazir(p.page);
  d.dogru((await serit(p.page)) === null, "internet varken şerit yok");

  // --- telefonun interneti kesildi ---
  await baglantiKes(p);
  if (ESKI_MI) await bekle(9000); else await yokla(p.page);
  const kilit = await p.page.evaluate(() => !!document.getElementById("net-kapi"));
  d.dogru(!kilit, "tam ekran kilit YOK (telefonda veri var)");
  if (ESKI_MI) throw new Error("eski panel internetsiz kilitleniyor; senaryonun kalanı uygulanamaz");
  let s = await serit(p.page);
  d.dogru(!!s && /uyari/.test(s.sinif) && /İnternet yok/.test(s.yazi), "\"İnternet yok\" şeridi göründü");
  d.dogru(!!s && s.yukseklik >= 44 && s.yukseklik <= 80, "şerit küçük (" + (s && s.yukseklik) + " px) ve dokunulabilir");
  await p.page.screenshot({ path: path.join(EKRAN, "serit-internet-yok.png") });

  // --- internetsiz kayıt ---
  const s1 = await satis(p.page, "u1", "acik", "m1", 3);            // 3 × 90 = 270
  const s2 = await satis(p.page, "u3", "nakit", "m3", 1);           // m3 özel fiyat 620, peşin
  await tahsilat(p.page, "m2", 400, "Saha tahsilat (nakit)");
  await bekle(1500);
  s = await serit(p.page);
  d.dogru(/2 satış, 1 tahsilat/.test(s.yazi) && /bekliyor/.test(s.yazi), "şerit bekleyenleri söylüyor: \"" + s.yazi.replace(/\s+/g, " ").trim() + "\"");
  await p.page.evaluate(() => { location.hash = "#/satis"; }); await bekle(400);
  await p.page.screenshot({ path: path.join(EKRAN, "serit-satis-ekrani.png") });
  await p.page.evaluate(() => { location.hash = "#/musteriler"; }); await bekle(400);
  await p.page.screenshot({ path: path.join(EKRAN, "serit-bekleyen.png") });
  d.esit(bulut.storeYazmalari().length, 0, "internet yokken buluta bir şey gitmedi");

  // --- bu arada araç (interneti var) yazıyor ---
  const a1 = await aracCalistir(bulut, ["satis", JSON.stringify({ musteri: "Yeni Müşteri", kalemler: [{ urun: "Örnek Bardak Su 200 ml", adet: 5 }], odeme: "acik", stokKaynak: "dukkan" }), "--kaydet"]);
  const a2 = await aracCalistir(bulut, ["tahsilat", "Sınama Derneği", "100", "--kaydet"]);
  d.dogru(a1.kod === 0 && a2.kod === 0, "araç bu arada satış + tahsilat yazdı");
  const aracSatis = bulut.store().sales[5];

  // --- uygulama kapanıp internetsiz yeniden açılıyor ---
  await p.page.close();
  const y = await yenidenAc(p);
  await yokla(y.page);
  d.dogru(!(await y.page.evaluate(() => !!document.getElementById("net-kapi"))), "internetsiz yeniden açılışta da kilit yok");
  d.esit(await y.page.evaluate(() => store.sales.length), 7, "önceki oturumun internetsiz satışları telefonda duruyor");
  s = await serit(y.page);
  d.dogru(!!s && /2 satış, 1 tahsilat/.test(s.yazi), "yeniden açılışta şerit bekleyenleri hâlâ gösteriyor");
  const s3 = await satis(y.page, "u1", "acik", "m1", 2);            // 2 × 90 = 180 (ikinci oturumda)
  await bekle(1200);
  d.dogru(/3 satış, 1 tahsilat/.test((await serit(y.page)).yazi), "ikinci oturumdaki satış da bekleyenlere eklendi");

  // uzun süredir gönderilemiyorsa fark edilsin
  await y.page.evaluate(() => { _esGunluk.ilkBekleyen = Date.now() - 3 * 3600 * 1000; esSeritCiz(); });
  s = await serit(y.page);
  d.dogru(/hata/.test(s.sinif) && /3 saattir gönderilemedi/.test(s.yazi), "saatlerdir gönderilemeyen kayıt kırmızı şeritle söyleniyor: \"" + s.yazi.replace(/\s+/g, " ").trim() + "\"");
  await y.page.screenshot({ path: path.join(EKRAN, "serit-saatlerdir.png") });

  // --- bağlantı geldi ---
  baglantiAc(p);
  await yokla(y.page);
  await esitlendi(y.page);
  await yokla(y.page);
  const son = bulut.store();
  d.dogru([s1.id, s2.id, s3.id].every((id) => !!bul(son.sales, id)), "internetsiz yapılan 3 satış bulutta");
  d.dogru(!!bul(son.sales, aracSatis.id), "aracın o arada yazdığı satış da duruyor");
  d.esit(son.sales.length, ilk.sales.length + 4, "toplam satış: 5 + 3 + 1");
  d.esit(son.payments.length, ilk.payments.length + 2, "iki tahsilat da bulutta (telefon + araç)");
  d.esit(bul(son.products, "u1").stok, bul(ilk.products, "u1").stok - 3 - 2 - 5, "bardak su stoğu üç düşümü de taşıyor (40 −3 −2 −5 = 30)");
  d.esit(borc(son, "m1"), borc(ilk, "m1") + 270 + 180, "m1 borcu doğru");
  d.esit(borc(son, "m2"), borc(ilk, "m2") - 400, "m2 borcu doğru (telefondaki tahsilat)");
  d.esit(borc(son, "m3"), borc(ilk, "m3") - 100, "m3 borcu doğru (aracın tahsilatı)");
  d.esit(borc(son, "m4"), borc(ilk, "m4") + 500, "m4 borcu doğru (aracın satışı)");
  d.esit(new Set(son.sales.map((x) => x.belgeNo)).size, son.sales.length, "belge numaraları benzersiz");
  d.dogru((await serit(y.page)) === null, "bağlantı gelip kayıtlar gidince şerit kalktı");
  d.esit(await y.page.evaluate(() => [store.sales.length, customerBorc("m4")]), [9, borc(son, "m4")], "telefon da aracın kayıtlarını aldı");
  d.esit(p.hatalar.concat(y.hatalar), [], "sayfalarda betik hatası yok");
} catch (e) { d.dogru(false, "senaryo yarıda kesildi: " + e.message); }
finally { await p.kapat(); await bulut.dur(); }

// --- ilk kurulum: telefonda hiç veri yokken internet de yoksa kilit ekranı kalır ---
{
  const bulut2 = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
  bulut2.kapat();
  const q = await panel(bulut2);
  try {
    if (ESKI_MI) await bekle(1500); else await yokla(q.page);
    d.dogru(await q.page.evaluate(() => !!document.getElementById("net-kapi")), "ilk kurulum + internet yok → kilit ekranı duruyor");
    await q.page.screenshot({ path: path.join(EKRAN, "ilk-kurulum-kilit.png") });
    bulut2.ac();
    if (!ESKI_MI) await yokla(q.page);
    await q.page.waitForFunction(() => !document.getElementById("net-kapi") && store.customers.length === 4, null, { timeout: 20000 }).then(() => d.dogru(true, "internet gelince kilit kalktı, veri indi"), () => d.dogru(false, "internet gelince kilit kalktı, veri indi"));
  } finally { await q.kapat(); await bulut2.dur(); }
}
d.bitir();
