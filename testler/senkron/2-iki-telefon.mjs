// Senaryo 2: iki ayrı telefon (iki ayrı tarayıcı bağlamı = ayrı localStorage) aynı anda açık.
// Önce sırayla, sonra iç içe (aynı anda, yavaş bağlantıda) satış / tahsilat / müşteri düzeltmesi yaparlar.
//   ESKİ: son yazan kazanır → diğer telefonun kayıtları silinir.
//   YENİ: hiçbir kayıt kaybolmaz, stok iki telefonun düşümünü de taşır, iki telefon aynı hâle gelir.
// Çalıştır: node testler/senkron/2-iki-telefon.mjs
import { senkronBulut, panel, satis, tahsilat, hazir, esitlendi, denetci, bekle, ornekStore, ornekSatirlar, borc, bul, ESKI_MI } from "./yardimci.mjs";

const d = denetci("2-iki-telefon");
const ilk = ornekStore();
const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
const A = await panel(bulut);
const B = await panel(bulut, { browser: A.browser });
const tazele = async (p) => { if (!ESKI_MI) { await p.page.evaluate(() => internetKontrol(true)); await bekle(300); await esitlendi(p.page); } };
try {
  await hazir(A.page); await hazir(B.page);

  // --- sırayla: A satar, gönderir; B (A'nınkini henüz görmeden) satar ---
  const a1 = await satis(A.page, "u1", "acik", "m1", 2);       // m1 özel fiyat 90 → 180
  await esitlendi(A.page);
  const b1 = await satis(B.page, "u1", "acik", "m2", 1);       // 100
  await esitlendi(B.page);
  let s = bulut.store();
  d.dogru(!!bul(s.sales, a1.id) && !!bul(s.sales, b1.id), "sırayla: iki telefonun satışı da bulutta");
  d.esit(bul(s.products, "u1").stok, bul(ilk.products, "u1").stok - 3, "sırayla: stok 40 −2 −1 = 37");

  // --- iç içe: yavaş bağlantıda ikisi aynı anda birkaç tur kayıt girer ---
  bulut.durum.gecikmeMs = 250;
  const idler = [a1.id, b1.id];
  for (let tur = 0; tur < 3; tur++) {
    const [x, y] = await Promise.all([satis(A.page, "u2", "acik", "m3", 1), satis(B.page, "u2", "nakit", null, 2)]);
    idler.push(x.id, y.id);
    await Promise.all([tahsilat(A.page, "m2", 50, "A tahsilat " + tur), tahsilat(B.page, "m3", 20, "B tahsilat " + tur)]);
    await bekle(tur === 1 ? 1200 : 200);                       // bir turda yazmalar tam üst üste binsin
  }
  // aynı müşteride farklı alanlar
  await A.page.evaluate(() => { findCustomer("m4").telefon = "05550000444"; saveStore(); });
  await B.page.evaluate(() => { findCustomer("m4").limit = 750; saveStore(); });
  await Promise.all([esitlendi(A.page, 60000), esitlendi(B.page, 60000)]);
  bulut.durum.gecikmeMs = 0;
  await tazele(A); await tazele(B); await tazele(A);

  s = bulut.store();
  d.esit(new Set(idler).size, 8, "iki telefonun aynı anda ürettiği kayıt kimlikleri çakışmıyor");
  d.dogru(idler.every((id) => !!bul(s.sales, id)), "iç içe: 8 satışın 8'i de bulutta (kayıp yok)");
  if (!ESKI_MI) console.log("    (bilgi: koşulu tutmadığı için reddedilip yeniden birleştirilen yazma sayısı: " + bulut.cakismalar() + ")");
  d.esit(s.sales.length, ilk.sales.length + 8, "toplam satış sayısı: 5 + 8");
  d.esit(new Set(s.sales.map((x) => x.belgeNo)).size, s.sales.length, "belge numaraları benzersiz");
  d.esit(s.payments.length, ilk.payments.length + 6, "6 tahsilatın 6'sı da bulutta");
  d.esit(bul(s.products, "u2").stok, bul(ilk.products, "u2").stok - 3 * 1 - 3 * 2, "stok iki telefonun düşümünü taşıyor (30 −3 −6 = 21)");
  d.esit(borc(s, "m3"), borc(ilk, "m3") + 3 * 170 - 3 * 20, "m3 borcu: A'nın 3 satışı − B'nin 3 tahsilatı");
  d.esit(borc(s, "m2"), borc(ilk, "m2") + 100 - 3 * 50, "m2 borcu: B'nin satışı − A'nın 3 tahsilatı");
  d.esit([bul(s.customers, "m4").telefon, bul(s.customers, "m4").limit], ["05550000444", 750], "aynı müşteride A'nın telefonu, B'nin limiti: ikisi de duruyor");

  const ozet = (p) => p.page.evaluate(() => ({ satis: store.sales.map((x) => x.id).sort(), tahsilat: store.payments.map((x) => x.id).sort(), stok: store.products.map((x) => [x.id, x.stok, x.aracStok]), m4: [findCustomer("m4").telefon, findCustomer("m4").limit], sayac: store.counters.sale }));
  const [oa, ob] = [await ozet(A), await ozet(B)];
  d.esit(oa, ob, "iki telefon aynı hâle geldi");
  d.esit(oa.satis, s.sales.map((x) => x.id).sort(), "telefonlardaki satışlar buluttakiyle aynı");
  if (!ESKI_MI) d.dogru(bulut.storeYazmalari().every((y) => y.yontem === "PATCH" && y.kosullu), "bütün yazmalar koşullu");
  d.esit(A.hatalar.concat(B.hatalar), [], "sayfalarda betik hatası yok");
} catch (e) { d.dogru(false, "senaryo yarıda kesildi: " + e.message); }
finally { await B.kapat(); await A.kapat(); await bulut.dur(); }
d.bitir();
