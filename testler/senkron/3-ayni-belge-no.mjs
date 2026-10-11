// Senaryo 3: aynı belge numarası çakışması.
// Araç 000006 numaralı satışı yazar; panel (habersiz) fazla ödemeli bir satışa yine 000006 verir.
// Üstelik panel tam yazarken araya üçüncü bir yazma girer (koşullu yazma tutmaz → yeniden birleştirme).
//   YENİ: panelin satışı yeni numara alır, "Belge <no>" atıflı tahsilat notu düzelir, kullanıcıya bildirilir;
//         araçla "sil-satis 000006" yalnız aracın satışını siler (panelin fazla ödeme tahsilatına dokunmaz).
// Çalıştır: node testler/senkron/3-ayni-belge-no.mjs
import { senkronBulut, panel, aracCalistir, hazir, esitlendi, denetci, diyalogKurali, ornekStore, ornekSatirlar, borc, bul, jsonbSira, ESKI_MI } from "./yardimci.mjs";

const d = denetci("3-ayni-belge-no");
const ilk = ornekStore();
const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
// Parçalı ödeme soruları: nakit 500 (satış 340 → 160 fazla), kart 0
const sorular = [];
const genel = diyalogKurali(sorular);
const p = await panel(bulut, { diyalog: (dlg) => (dlg.type() === "prompt" ? dlg.accept(/Nakit/.test(dlg.message()) ? "500" : "0") : genel(dlg)) });
try {
  await hazir(p.page);
  const a1 = await aracCalistir(bulut, ["satis", JSON.stringify({ musteri: "Örnek Çay Ocağı", kalemler: [{ urun: "Örnek Küp Şeker", adet: 4 }], odeme: "acik", stokKaynak: "dukkan" }), "--kaydet"]);
  d.dogru(a1.kod === 0, "araç 000006 numaralı satışı yazdı");
  const yil = new Date().getFullYear();
  const no6 = yil + "-000006", no7 = yil + "-000007", no8 = yil + "-000008";
  d.dogru(bulut.store().sales.some((s) => s.belgeNo === no6), "bulutta " + no6 + " artık aracın satışı");

  // panel yazarken araya giren üçüncü yazma: "başka telefon" 000007 numaralı bir satış ekler
  bulut.ayar.yazmadanOnce = (ctx) => {
    const satir = ctx.tablolar.kv.get("babuco:store");
    const s = JSON.parse(JSON.stringify(satir.value));
    s.counters.sale = 7;
    s.sales.push({ id: "baskaTelefon1", belgeNo: no7, musteriId: "m4", items: [{ urunId: "u5", ad: "Örnek Küp Şeker", adet: 1, fiyat: 60, kdv: 1, iskyuzde: 0 }], brut: 60, iskonto: 0, toplam: 60, maliyet: 52.5, komisyon: 0, odeme: { nakit: 0, pos: 0, acik: 60 }, tarih: new Date().toISOString(), stokKaynak: "dukkan" });
    s.products.find((x) => x.id === "u5").stok -= 1;
    satir.value = jsonbSira(s);
    satir.updated_at = new Date(Date.parse(satir.updated_at) + 5).toISOString().replace("Z", "+00:00");
  };

  // panel: m1'e 2 pet su (340 ₺), 500 ₺ nakit → 160 ₺ fazlası borca tahsilat ("Belge <no>" notuyla)
  const ps = await p.page.evaluate(() => {
    pos.carts[pos.active].musteriId = "m1"; window.app.addToCart("u2"); window.app.addToCart("u2"); window.app.finalizeSale("parcali");
    document.querySelectorAll(".modal-overlay").forEach((x) => x.remove());
    const s = store.sales[store.sales.length - 1];
    return { id: s.id, belgeNo: s.belgeNo, not: store.payments[store.payments.length - 1].not };
  });
  d.esit(ps.belgeNo, no6, "panel satışa habersizce " + no6 + " verdi");
  d.dogru(ps.not.includes("Belge " + no6), "fazla ödeme tahsilatının notu \"Belge " + no6 + "\" diyor");
  await esitlendi(p.page);

  const s = bulut.store();
  if (!ESKI_MI) d.dogru(bulut.cakismalar() >= 1, "araya giren yazma yüzünden panelin ilk yazması reddedildi (hiçbir şey ezilmedi), yeniden birleştirildi");
  d.esit(s.sales.length, ilk.sales.length + 3, "üç satış da bulutta (araç, başka telefon, panel)");
  d.esit(bul(s.sales, ps.id) && bul(s.sales, ps.id).belgeNo, no8, "panelin satışı yeni numara aldı: " + no8);
  d.esit(new Set(s.sales.map((x) => x.belgeNo)).size, s.sales.length, "belge numaraları benzersiz");
  const fazla = s.payments.find((x) => x.musteriId === "m1" && x.tutar === 160);
  d.dogru(!!fazla && fazla.not.includes("Belge " + no8) && !fazla.not.includes(no6), "tahsilat notundaki atıf yeni numaraya düzeltildi");
  d.esit(s.counters.sale, 8, "belge sayacı 8'e ilerledi (sonraki satış 000009)");
  d.esit(bul(s.products, "u5").stok, bul(ilk.products, "u5").stok - 4 - 1, "küp şeker stoğu: aracın 4'ü + araya giren satışın 1'i düşmüş (50 −4 −1)");
  d.esit(borc(s, "m1"), borc(ilk, "m1") - 160, "m1: satış peşin, 160 ₺ fazlası borçtan düştü");

  const ekran = await p.page.evaluate((id) => ({ no: store.sales.find((x) => x.id === id).belgeNo, bildirim: (document.querySelector(".es-bildirim") || {}).textContent || "", sayac: store.counters.sale }), ps.id);
  d.esit(ekran.no, no8, "panelin ekranındaki satış da yeni numarayı taşıyor");
  if (!ESKI_MI) d.dogru(ekran.bildirim.includes(no6) && ekran.bildirim.includes(no8), "kullanıcıya numaranın değiştiği bildirildi");

  // araçla 000006'yı sil: yalnız aracın satışı gitmeli; panelin satışı ve fazla ödeme tahsilatı kalmalı
  const a2 = await aracCalistir(bulut, ["sil-satis", no6, "--kaydet"]);
  d.dogru(a2.kod === 0 && /SILINDI/.test(a2.cikti), "araç " + no6 + " numaralı satışı sildi");
  const s2 = bulut.store();
  d.dogru(!!bul(s2.sales, ps.id), "panelin satışı duruyor");
  d.dogru(s2.payments.some((x) => x.musteriId === "m1" && x.tutar === 160), "panelin fazla ödeme tahsilatı silinmedi (not doğru numarayı gösterdiği için)");
  d.esit(borc(s2, "m2"), borc(ilk, "m2"), "m2 borcu aracın satışı silinince eski hâline döndü");
  d.esit(p.hatalar, [], "sayfada betik hatası yok");
} catch (e) { d.dogru(false, "senaryo yarıda kesildi: " + e.message); }
finally { await p.kapat(); await bulut.dur(); }
d.bitir();
