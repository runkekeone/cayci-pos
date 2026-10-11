// Senaryo 1: panel açıkken terminal aracı satış yazar, hemen ardından panel satış yapar.
//   ESKİ: panel körlemesine üstüne yazar → aracın satışı ve tahsilatı bulutta SİLİNİR.
//   YENİ: ikisi de bulutta; stok iki tarafın düşümünü de taşır; borçlar doğru; belge numaraları ayrı.
// Çalıştır: node testler/senkron/1-arac-ve-panel.mjs
import { senkronBulut, panel, aracCalistir, satis, hazir, esitlendi, denetci, ornekStore, ornekSatirlar, borc, bul } from "./yardimci.mjs";

const d = denetci("1-arac-ve-panel");
const ilk = ornekStore();
const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
const p = await panel(bulut);
try {
  await hazir(p.page);
  d.esit(await p.page.evaluate(() => store.customers.length), 4, "panel açıldı, veriyi buluttan çekti");
  const ilkYazma = bulut.storeYazmalari().length;
  d.esit(ilkYazma, 0, "açılışta buluta hiçbir şey yazılmadı (yalnız okundu)");

  // --- araç: m2'ye açık hesap satış (dükkan stoğundan 3 pet su + 2 kola) ve m3'ten tahsilat ---
  const a1 = await aracCalistir(bulut, ["satis", JSON.stringify({ musteri: "Örnek Çay Ocağı", kalemler: [{ urun: "Örnek Pet Su 500 ml", adet: 3 }, { urun: "Örnek Kola 250 ml", adet: 2 }], odeme: "acik", stokKaynak: "dukkan" }), "--kaydet"]);
  d.dogru(a1.kod === 0 && /KAYDEDILDI/.test(a1.cikti), "araç satışı kaydetti");
  const a2 = await aracCalistir(bulut, ["tahsilat", "Sınama Derneği", "300", "--kaydet"]);
  d.dogru(a2.kod === 0, "araç tahsilatı kaydetti");
  const aracSonrasi = JSON.parse(JSON.stringify(bulut.store()));
  const aracSatis = aracSonrasi.sales[aracSonrasi.sales.length - 1];
  d.esit(aracSatis.belgeNo.slice(-6), "000006", "aracın satışı 000006 numarasını aldı");

  // --- panel (aracın yazdığından habersiz) hemen satış yapar: m1'e açık hesap 2 pet su ---
  const ps = await satis(p.page, "u2", "acik", "m1", 2);
  d.esit(ps.belgeNo.slice(-6), "000006", "panel de habersizce aynı numarayı (000006) verdi");
  await esitlendi(p.page);

  const son = bulut.store();
  d.dogru(!!bul(son.sales, aracSatis.id), "aracın satışı bulutta duruyor");
  d.dogru(!!bul(son.sales, ps.id), "panelin satışı bulutta duruyor");
  d.esit(son.sales.length, ilk.sales.length + 2, "toplam satış sayısı: 5 + 2");
  d.dogru(son.payments.some((x) => x.musteriId === "m3" && x.tutar === 300), "aracın tahsilatı bulutta duruyor");
  d.esit(bul(son.products, "u2").stok, bul(ilk.products, "u2").stok - 3 - 2, "pet su stoğu iki düşümü de taşıyor (30 −3 −2 = 25)");
  d.esit(bul(son.products, "u3").stok, bul(ilk.products, "u3").stok - 2, "kola stoğu aracın düşümünü taşıyor");
  d.esit(borc(son, "m2"), borc(ilk, "m2") + 3 * 170 + 2 * 640, "m2 borcu: aracın satışı kadar arttı");
  d.esit(borc(son, "m1"), borc(ilk, "m1") + 2 * 170, "m1 borcu: panelin satışı kadar arttı");
  d.esit(borc(son, "m3"), borc(ilk, "m3") - 300, "m3 borcu: aracın tahsilatı kadar azaldı");
  d.esit(new Set(son.sales.map((s) => s.belgeNo)).size, son.sales.length, "belge numaraları benzersiz");
  d.esit(bul(son.sales, aracSatis.id).belgeNo, aracSatis.belgeNo, "buluttaki (aracın) satışın numarası değişmedi");

  // panelin ekranı da aynı hâlde
  const yerel = await p.page.evaluate(() => ({ satis: store.sales.length, m2: customerBorc("m2"), m1: customerBorc("m1"), u2: findProduct("u2").stok, belge: store.sales.map((s) => s.belgeNo) }));
  d.esit([yerel.satis, yerel.m2, yerel.m1, yerel.u2], [7, borc(son, "m2"), borc(son, "m1"), 25], "panelin kendi verisi de birleşmiş hâlde (aracın satışı panelde görünüyor)");
  d.dogru(bulut.storeYazmalari().every((y) => y.yontem === "PATCH" && y.kosullu), "buluta giden bütün yazmalar koşullu (körlemesine upsert yok)");

  // araç bundan sonra da çalışır (panelin yazdığı zaman damgasıyla uyumlu)
  const a3 = await aracCalistir(bulut, ["tahsilat", "Deneme Kıraathanesi", "100", "--kaydet"]);
  d.dogru(a3.kod === 0 && !/CAKISMA/.test(a3.cikti), "panelden sonra araç yine yazabiliyor (çakışma yok)");
  d.esit(borc(bulut.store(), "m1"), borc(ilk, "m1") + 340 - 100, "aracın ikinci tahsilatı da işlendi");
  d.esit(p.hatalar, [], "sayfada betik hatası yok");
} catch (e) { d.dogru(false, "senaryo yarıda kesildi: " + e.message); }
finally { await p.kapat(); await bulut.dur(); }
d.bitir();
