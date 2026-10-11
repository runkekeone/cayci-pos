// Birleştirme çekirdeğinin birim denemesi: app.js içindeki /* <esitleme-saf> */ … /* </esitleme-saf> */
// arasını (saf fonksiyonlar) tarayıcısız, Node'da çalıştırır.
// Çalıştır: node testler/senkron/birim.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { denetci, ornekStore, jsonbSira, ayni } from "./yardimci.mjs";

const DEPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const kaynak = fs.readFileSync(path.join(process.env.SENKRON_PANEL || path.join(DEPO, "public/toptanci"), "app.js"), "utf8");
const bas = kaynak.indexOf("/* <esitleme-saf>"), son = kaynak.indexOf("/* </esitleme-saf> */");
if (bas < 0 || son < 0) { console.log("app.js içinde <esitleme-saf> bölümü yok (eski sürüm?)"); process.exit(1); }
const S = vm.runInNewContext(kaynak.slice(bas, son) + "\n;({ esFark, esUygula, esBirlestir, ucYonluBirlestir, esEsit, esYerinde, esKarsilastir, esTabansizFark, esKlon })", {});

const d = denetci("birim");
const klon = (x) => JSON.parse(JSON.stringify(x));
const bul = (l, id) => l.find((x) => x.id === id);
const U = (t, y, b) => klon(S.ucYonluBirlestir(t, y, b));
const satisKaydi = (id, belgeNo, musteriId, acik) => ({ id, belgeNo, musteriId, items: [{ urunId: "u1", ad: "x", adet: 1, fiyat: acik }], toplam: acik, odeme: { nakit: 0, pos: 0, acik }, tarih: new Date().toISOString() });

console.log("— değişiklik yok / tek taraflı");
{
  const t = ornekStore();
  d.dogru(S.esFark(t, klon(t)) === null, "aynı hâl → fark yok");
  d.dogru(S.esFark(t, jsonbSira(klon(t))) === null, "yalnız anahtar sırası değişmiş (jsonb) → fark yok");
  const b = klon(t); b.sales.push(satisKaydi("sB", "2026-000006", "m2", 100));
  d.dogru(ayni(U(t, klon(t), b), b), "yerel değişmedi → sonuç buluttaki hâl");
  const y = klon(t); y.payments.push({ id: "tY", musteriId: "m2", tutar: 50, not: "x", tarih: "2026-01-01T00:00:00.000Z" });
  d.dogru(ayni(U(t, y, klon(t)), y), "bulut değişmedi → sonuç yerel hâl");
  const girdi = [klon(t), klon(y), klon(b)], once = JSON.stringify(girdi);
  S.ucYonluBirlestir(girdi[0], girdi[1], girdi[2]);
  d.dogru(JSON.stringify(girdi) === once, "birleştirme girdilerini değiştirmiyor (saf)");
}

console.log("— ekleme / silme");
{
  const t = ornekStore();
  const y = klon(t), b = klon(t);
  y.sales.push(satisKaydi("sY", "2026-000007", "m1", 170));
  b.sales.push(satisKaydi("sB", "2026-000006", "m2", 1280));
  y.payments = y.payments.filter((p) => p.id !== "t2");            // yerel t2'yi sildi
  b.payments.push({ id: "tB", musteriId: "m3", tutar: 10, not: "b", tarih: "2026-01-01T00:00:00.000Z" });
  b.expenses = [];                                                 // bulut g1'i sildi
  const m = U(t, y, b);
  d.esit(m.sales.map((s) => s.id), ["s1", "s2", "s3", "s4", "s5", "sB", "sY"], "iki tarafın eklediği satışlar da duruyor");
  d.esit(m.payments.map((p) => p.id), ["t1", "tB"], "yerelin sildiği tahsilat silindi, bulutun eklediği duruyor");
  d.esit(m.expenses, [], "bulutun sildiği gider geri gelmedi");
}
{
  // yerel sildi ama bulutta bu arada DEĞİŞMİŞ → tut
  const t = ornekStore(), y = klon(t), b = klon(t);
  y.customers = y.customers.filter((c) => c.id !== "m4");
  bul(b.customers, "m4").telefon = "05559999999";
  const r = S.esBirlestir(b, [S.esFark(t, y)]);
  d.dogru(!!bul(r.store.customers, "m4") && bul(r.store.customers, "m4").telefon === "05559999999", "yerel sildi + bulut değiştirdi → kayıt TUTULDU (bulut hâliyle)");
  d.dogru(r.notlar.some((n) => n.tur === "silinmedi" && n.id === "m4"), "…ve bu durum not edildi");
  // yerel sildi, bulutta yalnız STOK değişti → silme geçerli
  const y2 = klon(t), b2 = klon(t);
  y2.products = y2.products.filter((p) => p.id !== "u6");
  bul(b2.products, "u6").stok = 9;
  d.dogru(!bul(U(t, y2, b2).products, "u6"), "yerel ürünü sildi, bulutta yalnız stoğu değişmişti → silindi");
}
{
  // bulut sildi ama yerel GERÇEKTEN değiştirdi → tut; yalnız stok değiştiyse silinmiş kalır
  const t = ornekStore(), y = klon(t), b = klon(t);
  bul(y.customers, "m3").telefon = "05551112233";
  b.customers = b.customers.filter((c) => c.id !== "m3");
  const m = U(t, y, b);
  d.dogru(bul(m.customers, "m3") && bul(m.customers, "m3").telefon === "05551112233", "bulut sildi + yerel değiştirdi → kayıt TUTULDU (yerel hâliyle)");
  const y2 = klon(t), b2 = klon(t);
  bul(y2.products, "u5").stok -= 3;
  b2.products = b2.products.filter((p) => p.id !== "u5");
  d.dogru(!bul(U(t, y2, b2).products, "u5"), "bulut ürünü sildi, yerelde yalnız stoğu düşmüştü → silinmiş kaldı");
}

console.log("— çift taraflı değişiklik (alan alan)");
{
  const t = ornekStore(), y = klon(t), b = klon(t);
  bul(y.customers, "m1").telefon = "0500 YEREL"; bul(y.customers, "m1").ozelFiyatlar.u2 = 160;
  bul(b.customers, "m1").limit = 5000; bul(b.customers, "m1").ozelFiyatlar.u3 = 600; bul(b.customers, "m1").ad = "Deneme Kıraathanesi (yeni)";
  bul(y.customers, "m2").vade = 30; bul(b.customers, "m2").vade = 45;        // aynı alan: yerel kazanır
  const m = U(t, y, jsonbSira(b));
  const m1 = bul(m.customers, "m1");
  d.esit([m1.telefon, m1.limit, m1.ad], ["0500 YEREL", 5000, "Deneme Kıraathanesi (yeni)"], "aynı müşteride farklı alanlar: ikisi de duruyor");
  d.dogru(ayni(m1.ozelFiyatlar, { u1: 90, u2: 160, u3: 600 }), "iç içe nesne (özel fiyatlar) anahtar anahtar birleşti");
  d.esit(bul(m.customers, "m2").vade, 30, "aynı alanı iki taraf da değiştirdi → yerelin değeri");
  const y2 = klon(t), b2 = klon(t);
  y2.settings.fisTel = "0212"; delete y2.settings.ilce; b2.settings.fisAdres = "Adres"; b2.settings.firmaAdi = "BULUT";
  const s = U(t, y2, b2).settings;
  d.esit([s.fisTel, s.fisAdres, s.firmaAdi, "ilce" in s], ["0212", "Adres", "BULUT", false], "settings anahtar anahtar (yerelin sildiği anahtar silindi)");
}

console.log("— sayaç alanları fark olarak");
{
  const t = ornekStore(), y = klon(t), b = klon(t);
  bul(y.products, "u2").stok -= 2;  bul(b.products, "u2").stok -= 5;         // 30 → yerel 28, bulut 25
  bul(y.products, "u3").aracStok -= 1; bul(b.products, "u3").aracStok += 10; // 6 → yerel 5, bulut 16
  bul(y.products, "u1").satis = 110; bul(b.products, "u1").stok -= 4;        // fiyat yerelden, stok buluttan
  bul(b.products, "u4").stok = "6"; bul(y.products, "u4").stok -= 1;         // bulutta metin olarak duruyor
  delete bul(b.products, "u5").aracStok; bul(y.products, "u5").aracStok -= 5;// bulutta alan yok
  const m = U(t, y, b);
  d.esit(bul(m.products, "u2").stok, 23, "iki taraf da sattı: 30 −2 −5 = 23");
  d.esit(bul(m.products, "u3").aracStok, 15, "araç stoğu: 6 −1 +10 = 15");
  d.esit([bul(m.products, "u1").satis, bul(m.products, "u1").stok], [110, 36], "fiyat değişikliği yerelden, stok düşümü buluttan");
  d.esit(bul(m.products, "u4").stok, 5, "bulutta metin duran stok: 6 −1 = 5 (sayı)");
  d.esit(bul(m.products, "u5").aracStok, -5, "bulutta alan yoksa 0 sayılır: 0 −5");
  const y2 = klon(t), b2 = klon(t);
  y2.counters.sale = 6; b2.counters.sale = 9; y2.counters.seq = 140; b2.counters.seq = 120; b2.counters.yeniSayac = 3;
  const c = U(t, y2, b2).counters;
  d.esit([c.sale, c.seq, c.yeniSayac], [9, 140, 3], "counters: anahtar anahtar en büyük değer");
}

console.log("— bilinmeyen / yeni koleksiyonlar");
{
  const t = ornekStore(), y = klon(t), b = klon(t);
  y.yeniKol = [{ id: "a1", x: 1 }]; b.yeniKol = [{ id: "b1", x: 2 }];        // ikisi de tembel oluşturup eklemiş
  y.etiketler = ["kırmızı", "mavi"]; b.etiketler = ["mavi", "yeşil"];        // id'siz üst düzey dizi
  y.ayarlar2 = { a: 1 }; b.ayarlar2 = { b: 2 };                              // yeni düz nesne
  const m = U(t, y, b);
  d.esit(m.yeniKol.map((x) => x.id).sort(), ["a1", "b1"], "tabanda olmayan koleksiyon: iki tarafın kayıtları da var");
  d.esit(m.etiketler.slice().sort(), ["kırmızı", "mavi", "yeşil"], "id'siz dizi içeriğe göre birleşti (tekrar yok)");
  d.dogru(ayni(m.ayarlar2, { a: 1, b: 2 }), "yeni düz nesne anahtar anahtar birleşti");
  const t2 = klon(t); t2.yeniKol = [{ id: "a0", x: 0, alt: [{ id: "h1" }] }];
  const y2 = klon(t2), b2 = klon(t2);
  y2.yeniKol[0].x = 5; y2.yeniKol[0].alt.push({ id: "h2" }); b2.yeniKol[0].y = 7; b2.yeniKol[0].alt.push({ id: "h3" }); b2.yeniKol.push({ id: "b9" });
  const m2 = U(t2, y2, b2);
  d.dogru(ayni(m2.yeniKol[0], { id: "a0", x: 5, y: 7, alt: [{ id: "h1" }, { id: "h3" }, { id: "h2" }] }), "bilinmeyen koleksiyonda alan alan + iç içe id'li dizi birleşti");
  d.esit(m2.yeniKol.length, 2, "…bulutun eklediği kayıt da duruyor");
  const y3 = klon(t); y3.bosKol = []; y3.bosNesne = {};
  d.dogru(S.esFark(t, y3) === null, "tembel oluşturulmuş BOŞ koleksiyon değişiklik sayılmıyor");
  const t4 = klon(t); t4.cift = [{ id: "x", n: 1 }, { id: "x", n: 2 }];
  const y4 = klon(t4), b4 = klon(t4); y4.cift.push({ id: "z" }); b4.cift[1].n = 22;
  d.dogru(ayni(U(t4, y4, b4).cift, [{ id: "x", n: 1 }, { id: "x", n: 22 }, { id: "z" }]), "aynı id iki kez geçse de kayıt kaybolmuyor");
}

console.log("— aynı belge numarası");
{
  const t = ornekStore(), y = klon(t), b = klon(t);
  y.counters.sale = 6; y.sales.push(satisKaydi("sY", "2026-000006", "m1", 100));
  y.payments.push({ id: "tY", musteriId: "m1", tutar: 30, not: "Satış üstü fazla ödeme → borca sayıldı (Belge 2026-000006)", tarih: "2026-01-01T00:00:00.000Z" });
  b.counters.sale = 7; b.sales.push(satisKaydi("sB1", "2026-000006", "m2", 200)); b.sales.push(satisKaydi("sB2", "2026-000007", "m2", 300));
  b.payments.push({ id: "tB", musteriId: "m2", tutar: 40, not: "Satış üstü fazla ödeme → borca sayıldı (Belge 2026-000006)", tarih: "2026-01-01T00:00:00.000Z" });
  const r = S.esBirlestir(b, [S.esFark(t, y)]), m = klon(r.store);
  d.esit(bul(m.sales, "sY").belgeNo, "2026-000008", "yereldeki satışa yeni numara verildi (bulutta 6 ve 7 dolu → 8)");
  d.esit([bul(m.sales, "sB1").belgeNo, bul(m.sales, "sB2").belgeNo], ["2026-000006", "2026-000007"], "buluttaki satışların numarası değişmedi");
  d.dogru(/\(Belge 2026-000008\)$/.test(bul(m.payments, "tY").not), "yerel tahsilat notundaki atıf yeni numaraya çevrildi");
  d.dogru(/\(Belge 2026-000006\)$/.test(bul(m.payments, "tB").not), "buluttaki tahsilat notu değişmedi");
  d.esit(m.counters.sale, 8, "sayaç yeni numaraya ilerledi");
  d.esit(new Set(m.sales.map((s) => s.belgeNo)).size, m.sales.length, "belge numaraları benzersiz");
  d.dogru(r.notlar.some((n) => n.tur === "belgeNo" && n.eski === "2026-000006" && n.yeni === "2026-000008"), "numara değişikliği not edildi (ekranda bildirilir)");
  // aynı satış (aynı id) zaten buluttaysa numara DEĞİŞMEZ
  const b2 = klon(y);
  d.esit(bul(U(t, y, b2).sales, "sY").belgeNo, "2026-000006", "aynı satış zaten buluttaysa numarası değişmiyor");
}

console.log("— aynı şeyi iki cihazın ayrı id ile eklemesi (çay ocağı siparişi)");
{
  const t = ornekStore(), y = klon(t), b = klon(t);
  y.gelenSiparisler.push({ id: "idY", orderId: "sip-7", durum: "yeni" });
  b.gelenSiparisler.push({ id: "idB", orderId: "sip-7", durum: "yeni" });
  const y2 = klon(y); bul(y2.gelenSiparisler, "idY").durum = "onay";
  const r = S.esBirlestir(b, [S.esFark(t, y), S.esFark(y, y2)]);
  d.esit(r.store.gelenSiparisler.length, 1, "aynı sipariş (orderId) tek kayıt kaldı");
  d.esit([r.store.gelenSiparisler[0].id, r.store.gelenSiparisler[0].durum], ["idB", "onay"], "yereldeki sonraki değişiklik buluttaki kayda uygulandı");
}

console.log("— sırayla birden çok yama / iki kez uygulanmama");
{
  const t = ornekStore();
  const y1 = klon(t); y1.sales.push(satisKaydi("sA", "2026-000006", "m1", 100)); bul(y1.products, "u2").stok -= 1; y1.counters.sale = 6;
  const y2 = klon(y1); y2.sales.push(satisKaydi("sC", "2026-000007", "m1", 100)); bul(y2.products, "u2").stok -= 2; y2.counters.sale = 7;
  const f1 = S.esFark(t, y1), f2 = S.esFark(y1, y2);
  const b = klon(t); bul(b.products, "u2").stok -= 10;
  const m = klon(S.esBirlestir(b, [f1, f2]).store);
  d.esit([bul(m.products, "u2").stok, m.sales.length], [17, 7], "iki yama sırayla: 30 −10 −1 −2 = 17, iki satış da var");
  // 1. yama buluta ulaşmış (yanıtı kaybolmuş) → yalnız 2. yama uygulanır
  const b2 = klon(S.esBirlestir(b, [f1]).store);
  const m2 = klon(S.esBirlestir(b2, [f2]).store);
  d.esit([bul(m2.products, "u2").stok, m2.sales.length], [17, 7], "ulaşmış yama atlanınca stok iki kez düşmüyor");
}

console.log("— taban yokken (eski sürümden geçiş)");
{
  const t = ornekStore(), y = klon(t), b = klon(t);
  y.sales.push(satisKaydi("sY", "2026-000006", "m1", 100)); bul(y.customers, "m1").telefon = "X"; y.payments = [];
  b.sales.push(satisKaydi("sB", "2026-000006", "m2", 100));
  const m = klon(S.esBirlestir(b, [S.esTabansizFark(y, b)]).store);
  d.dogru(!!bul(m.sales, "sY") && !!bul(m.sales, "sB"), "yalnız yerelde olan kayıt eklendi, buluttaki duruyor");
  d.esit([m.payments.length, bul(m.customers, "m1").telefon], [2, "05550000001"], "tabansız birleştirme hiçbir şeyi silmiyor/ezmiyor");
  d.esit(new Set(m.sales.map((s) => s.belgeNo)).size, m.sales.length, "…belge numarası çakışması burada da çözülüyor");
}

console.log("— yerinde güncelleme (açık pencerenin elindeki nesne geçerli kalsın)");
{
  const canli = ornekStore(), m1 = bul(canli.customers, "m1"), u2 = bul(canli.products, "u2"), dizi = canli.sales;
  const hedef = jsonbSira(klon(canli));
  bul(hedef.customers, "m1").telefon = "YENİ"; hedef.customers.push({ id: "m9", ad: "Dokuz" }); hedef.sales.shift(); bul(hedef.products, "u2").stok = 1; hedef.yeni = [1, 2];
  delete hedef.dukkanNotlari;
  S.esYerinde(canli, hedef);
  d.dogru(S.esEsit(canli, hedef), "sonuç hedefle aynı");
  d.dogru(bul(canli.customers, "m1") === m1 && m1.telefon === "YENİ" && bul(canli.products, "u2") === u2 && u2.stok === 1, "var olan kayıt nesneleri AYNI nesne, içerikleri güncel");
  d.dogru(canli.sales === dizi && dizi.length === 4, "dizi de aynı dizi; silinen kayıt çıktı");
  const hedefMetni = JSON.stringify(hedef);
  bul(canli.customers, "m9").ad = "değişti"; canli.yeni.push(3); canli.sales[0].items[0].adet = 99; canli.settings.fisTel = "x"; bul(canli.customers, "m1").ozelFiyatlar.u9 = 1;
  d.dogru(JSON.stringify(hedef) === hedefMetni, "canlı store ile hedef arasında ortak nesne kalmadı (birini değiştirmek diğerini etkilemiyor)");
}

console.log("— geri yükleme önizlemesi");
{
  const a = ornekStore(), b = klon(a);
  b.sales = b.sales.slice(0, 3); bul(b.customers, "m2").limit = 1; b.payments.push({ id: "tZ" }); b.settings.fisTel = "1";
  const k = S.esKarsilastir(a, jsonbSira(b));
  d.dogru(ayni(k.kol, { sales: { sil: 2, ek: 0, deg: 0 }, customers: { sil: 0, ek: 0, deg: 1 }, payments: { sil: 0, ek: 1, deg: 0 } }) && k.ayar === true, "silinecek / geri gelecek / değişecek sayıları doğru");
}

console.log("— rastgele denemeler (iki taraf rastgele satış yapar)");
{
  let tohum = 20261011; const rnd = (n) => { tohum = (tohum * 1103515245 + 12345) & 0x7fffffff; return tohum % n; };
  let hata = 0;
  for (let tur = 0; tur < 300 && !hata; tur++) {
    const t = ornekStore(), y = klon(t), b = jsonbSira(klon(t));
    const dusum = {};
    const oyna = (s, on) => {
      const n = rnd(4);
      for (let i = 0; i < n; i++) {
        const p = s.products[rnd(s.products.length)], alan = rnd(2) ? "stok" : "aracStok", adet = 1 + rnd(5);
        p[alan] = (Number(p[alan]) || 0) - adet; dusum[p.id + alan] = (dusum[p.id + alan] || 0) + adet;
        s.counters.sale++; s.sales.push(satisKaydi(on + tur + "_" + i, "2026-" + String(s.counters.sale).padStart(6, "0"), "m" + (1 + rnd(4)), 10 * adet));
        if (rnd(3) === 0) s.payments.push({ id: on + "t" + tur + "_" + i, musteriId: "m2", tutar: 5, not: "n", tarih: "2026-01-01T00:00:00.000Z" });
      }
      return n;
    };
    const ny = oyna(y, "y"), nb = oyna(b, "b");
    const m = klon(S.ucYonluBirlestir(t, y, b));
    const stokTamam = t.products.every((p) => ["stok", "aracStok"].every((a) => bul(m.products, p.id)[a] === p[a] - (dusum[p.id + a] || 0)));
    const satisTamam = m.sales.length === t.sales.length + ny + nb && new Set(m.sales.map((s) => s.belgeNo)).size === m.sales.length && new Set(m.sales.map((s) => s.id)).size === m.sales.length;
    const tahsilatTamam = m.payments.length === t.payments.length + (y.payments.length - t.payments.length) + (b.payments.length - t.payments.length);
    // birleşmiş hâli ikinci kez birleştirmek (taban = bulut = birleşmiş) hiçbir şey değiştirmemeli
    const kararli = ayni(U(m, klon(m), jsonbSira(klon(m))), m);
    if (!stokTamam || !satisTamam || !tahsilatTamam || !kararli) { hata = tur + 1; console.log("    ilk bozulan tur:", tur, { stokTamam, satisTamam, tahsilatTamam, kararli }); }
  }
  d.dogru(!hata, "300 rastgele turda: stok = taban − iki tarafın düşümü, hiçbir satış/tahsilat kaybolmadı, belge numaraları benzersiz");
}

d.bitir();
