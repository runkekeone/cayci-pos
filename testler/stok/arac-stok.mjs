// ARAÇ — stok gerçek olsun: alim alış kaydı bırakır, sayım, eksi sıfırlama, aktarma, kritik öneri, alınacaklar.
// Çalıştır: node testler/stok/arac-stok.mjs
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { denetci } from "../ortak/panel.mjs";
import { arac, tabanArac, stokStore, satirlar, kopya } from "./yardimci.mjs";

const d = denetci("arac-stok");
const yeniBulut = (store = stokStore()) => sahteBulut({ satirlar: satirlar(store) });
const S = (b) => b.deger("babuco:store");
const urun = (b, id) => S(b).products.find((p) => p.id === id);
const ESKI_ALIM = JSON.stringify({ kalemler: [{ urun: "Örnek Kola", adet: 5 }, { urun: "Örnek Sade Soda A", adet: 2, alis: 210 }] });

/* ---------- 1) ÖNCE: taban sürümde alim stok ekler ama alış kaydı bırakmaz ---------- */
{
  const taban = tabanArac();
  if (taban) {
    const b = await yeniBulut();
    const r = await arac(b.url, ["alim", ESKI_ALIM, "--kaydet"], { arac: taban });
    d.dogru(r.kod === 0 && urun(b, "u3").aracStok === 1, "taban: alim araç stoğunu artırıyordu (−4 → 1)");
    d.esit(S(b).purchases.length, 0, "taban (YANLIŞ): alim alış kaydı (purchases) bırakmıyordu");
    await b.dur();
  }
}

/* ---------- 2) ŞİMDİ: eski JSON biçimi çalışır, hem stok hem alış kaydı oluşur ---------- */
{
  const b = await yeniBulut(), once = kopya(S(b));
  const prova = await arac(b.url, ["alim", ESKI_ALIM]);
  d.dogru(prova.kod === 0 && /Mal girisi -> ARAC stogu/.test(prova.stdout) && /Toplam maliyet: 2\.920,00 ₺/.test(prova.stdout), "alim provası eski satırları aynen basıyor (hedef, toplam maliyet)");
  d.dogru(/FİŞ TOPLAMI : 2\.920,00 ₺/.test(prova.stdout) && /PEŞİN · NAKİT/.test(prova.stdout), "prova fiş toplamını ve ödemeyi (yazılmadıysa peşin·nakit) açıkça gösteriyor");
  d.esit(S(b), once, "prova hiçbir şey yazmadı");

  const r = await arac(b.url, ["alim", ESKI_ALIM, "--kaydet"]);
  d.dogru(r.kod === 0 && /KAYDEDILDI · 2 kalem · alış kaydı A1/.test(r.stdout), "eski biçim --kaydet ile çalıştı");
  d.esit([urun(b, "u3").aracStok, urun(b, "u9").aracStok, urun(b, "u3").stok], [1, 5, 12], "stok ARAÇ havuzuna eklendi, dükkan değişmedi");
  const k = S(b).purchases[0];
  d.esit({ n: S(b).purchases.length, hedef: k.hedef, odeme: k.odeme, odemeTuru: k.odemeTuru, toplam: k.toplam, borc: k.borc, firmaId: k.firmaId, no: k.no },
    { n: 1, hedef: "arac", odeme: "pesin", odemeTuru: "nakit", toplam: 2920, borc: 0, firmaId: null, no: "A1" }, "alış kaydı oluştu (hedef araç, peşin · nakit)");
  d.esit(k.items, [{ urunId: "u3", ad: "Örnek Kola 250 ml", adet: 5, birimFiyat: 500 }, { urunId: "u9", ad: "Örnek Sade Soda A", adet: 2, birimFiyat: 210 }], "alış kaydının kalemleri doğru");
  d.dogru(!!k.id && S(b).purchases.every((x) => x.id), "alış kaydında benzersiz id var");
  d.esit([urun(b, "u9").alis, urun(b, "u9").adetAlis, urun(b, "u3").alis], ["210", 210 / 24, 500], "alış fiyatı yalnız `alis` yazılan kalemde değişti (koli → adet fiyatı da)");
  d.esit((S(b).fiyatGecmisi || []).map((g) => [g.urunId, g.alan, g.eski, g.yeni]), [["u9", "alis", 200, 210]], "alış fiyatı değişimi fiyat geçmişine işlendi");
  await b.dur();
}

/* ---------- 3) Yeni alanlar: firma (yoksa açılır), fatura no, tarih, fişteki toplam, veresiye + peşinat ---------- */
{
  const b = await yeniBulut();
  const g = { hedef: "dukkan", firma: "Deneme Toptan", faturaNo: "F-77", tarih: "2026-10-05", toplam: 3200, odeme: "veresiye", odenen: 1000, odemeTuru: "havale", kalemler: [{ urun: "Örnek Kola", adet: 5, alis: 600 }] };
  const prova = await arac(b.url, ["alim", JSON.stringify(g)]);
  d.dogru(/FİŞ TOPLAMI : 3\.200,00 ₺/.test(prova.stdout) && /kalemlerin toplamı 3\.000,00 ₺ · fark 200,00 ₺/.test(prova.stdout), "prova fişteki toplamı esas alıyor, kalem toplamıyla farkı gösteriyor");
  d.dogru(/YENİ FİRMA açılacak/.test(prova.stdout) && /VERESİYE — firmaya borç 2\.200,00 ₺/.test(prova.stdout), "prova yeni firmayı ve kalan borcu gösteriyor");
  d.esit(S(b).firmalar.length, 0, "prova firma açmadı");
  const r = await arac(b.url, ["alim", JSON.stringify(g), "--kaydet"]);
  const k = S(b).purchases[0], f = S(b).firmalar[0];
  d.dogru(r.kod === 0 && f && f.ad === "Deneme Toptan" && k.firmaId === f.id, "firma açıldı ve alışa bağlandı");
  d.esit({ hedef: k.hedef, no: k.no, toplam: k.toplam, kalemToplam: k.kalemToplam, odeme: k.odeme, borc: k.borc, gun: k.tarih.slice(0, 10), tur: k.odemeTuru },
    { hedef: "dukkan", no: "F-77", toplam: 3200, kalemToplam: 3000, odeme: "veresiye", borc: 3200, gun: "2026-10-05" }, "kayıt: dükkan, fatura no, tarih, fişteki toplam, veresiye");
  d.esit(S(b).firmaPayments.map((p) => [p.firmaId, p.tutar, p.odemeTuru, p.alisId]), [[f.id, 1000, "havale", k.id]], "peşin verilen kısım firma ödemesine ödeme türüyle yazıldı (borç 2.200 kalır)");
  d.esit([urun(b, "u3").stok, urun(b, "u3").aracStok], [17, -4], "stok DÜKKAN havuzuna eklendi");

  const hata = await arac(b.url, ["alim", JSON.stringify({ odeme: "veresiye", kalemler: [{ urun: "Örnek Kola", adet: 1 }] })]);
  d.dogru(hata.kod === 1 && /firma/i.test(hata.stderr), "veresiye alımda firma yoksa reddediyor");

  /* sil-alim: stok aynı havuzdan geri alınır */
  const sil = await arac(b.url, ["sil-alim", "F-77", "--kaydet"]);
  d.dogru(sil.kod === 0 && S(b).purchases.length === 0 && S(b).firmaPayments.length === 0, "sil-alim kaydı ve peşinatını kaldırdı");
  d.esit([urun(b, "u3").stok, urun(b, "u3").aracStok], [12, -4], "sil-alim stoğu girdiği havuzdan (dükkan) geri aldı");
  await b.dur();
}

/* ---------- 4) Sayım: mutlak değer yazar, farkı stok hareketine işler; listede olmayan değişmez ---------- */
{
  const b = await yeniBulut(), once = kopya(S(b));
  const g = JSON.stringify({ arac: { "Örnek Kola": 6, "Örnek Soda": 0 }, dukkan: { "Küp Şeker": 12 } });
  const yok = await arac(b.url, ["sayim", g], { arac: tabanArac() || undefined });
  if (tabanArac()) d.dogru(/Bilinmeyen komut: sayim/.test(yok.stdout), "taban (YOKTU): sayım komutu yoktu");
  const prova = await arac(b.url, ["sayim", g]);
  d.dogru(/\| Örnek Kola 250 ml \| -4 \| \*\*6\*\* \| \+10 \|/.test(prova.stdout) && /\| Örnek Küp Şeker \| -7 \| \*\*12\*\* \| \+19 \|/.test(prova.stdout), "prova eski → yeni tablosunu basıyor");
  d.dogru(/Değişmeyen \(sayılan = kayıtlı\): Örnek Soda/.test(prova.stdout), "prova değişmeyeni ayrı söylüyor");
  d.esit(S(b), once, "sayım provası hiçbir şey yazmadı");
  const r = await arac(b.url, ["sayim", g, "--kaydet"]);
  d.dogru(r.kod === 0, "sayım kaydedildi");
  d.esit([urun(b, "u3").aracStok, urun(b, "u5").stok, urun(b, "u3").stok, urun(b, "u5").aracStok], [6, 12, 12, 15], "sayılan miktar mutlak değer olarak yazıldı; diğer havuza dokunulmadı");
  d.esit(S(b).products.filter((p) => !["u3", "u5"].includes(p.id)).map((p) => [p.stok, p.aracStok]), once.products.filter((p) => !["u3", "u5"].includes(p.id)).map((p) => [p.stok, p.aracStok]), "listede olmayan ürünler değişmedi");
  d.esit(S(b).stokHareket.map((h) => [h.urunId, h.miktar, h.tur, h.havuz]).sort(), [["u3", 10, "Sayım Düzeltme (Araç)", "arac"], ["u5", 19, "Sayım Düzeltme", "dukkan"]], "farklar stok hareketine \"Sayım Düzeltme\" olarak işlendi");
  d.dogru(S(b).stokHareket.every((h) => h.id) && new Set(S(b).stokHareket.map((h) => h.id)).size === 2, "stok hareketlerinin id'si benzersiz");
  const cift = await arac(b.url, ["sayim", JSON.stringify({ arac: { "Örnek": 3 } })]);
  d.dogru(cift.kod === 1 && /tek degil/.test(cift.stderr), "belirsiz ürün adında kendi seçmiyor, adayları listeliyor");
  await b.dur();
}

/* ---------- 5) Eksi stok: listele, onayla sıfırla ---------- */
{
  const b = await yeniBulut(), once = kopya(S(b));
  const liste = await arac(b.url, ["eksi-stok"]);
  d.dogru(/dükkan 1 ürün \(-7\) · araç 1 ürün \(-4\)/.test(liste.stdout), "eksi-stok iki havuzu toplamlarıyla listeliyor");
  const prova = await arac(b.url, ["eksi-stok", "--sifirla"]);
  d.dogru(/PROVA/.test(prova.stdout) && /\| Örnek Küp Şeker \| Dükkan \| -7 \| \*\*0\*\* \|/.test(prova.stdout), "sıfırlama provası ne olacağını gösteriyor");
  d.esit(S(b), once, "sıfırlama provası hiçbir şey yazmadı");
  await arac(b.url, ["eksi-stok", "--sifirla", "--kaydet"]);
  d.esit([urun(b, "u5").stok, urun(b, "u3").aracStok, S(b).products.filter((p) => p.stok < 0 || p.aracStok < 0).length], [0, 0, 0], "eksi stoklar 0 oldu");
  d.esit(S(b).stokHareket.map((h) => [h.urunId, h.miktar, h.tur]).sort(), [["u3", 4, "Eksi Stok Sıfırlama (Araç)"], ["u5", 7, "Eksi Stok Sıfırlama"]], "sıfırlama stok hareketine işlendi");
  d.dogru(/Eksi stok yok/.test((await arac(b.url, ["eksi-stok"])).stdout), "sıfırlamadan sonra eksi stok kalmadı");
  await b.dur();
}

/* ---------- 6) Dükkan ↔ araç aktarma: bir havuzdan düşen diğerine eklenir ---------- */
{
  const b = await yeniBulut(), once = kopya(S(b));
  const prova = await arac(b.url, ["aktar", "Örnek Kola", "3"]);
  d.dogru(/\| 3 \| Örnek Kola 250 ml \| 12 → 9 \| -4 → -1 \|/.test(prova.stdout), "aktarma provası iki havuzu da gösteriyor");
  d.esit(S(b), once, "aktarma provası hiçbir şey yazmadı");
  await arac(b.url, ["aktar", "Örnek Kola", "3", "--kaydet"]);
  d.esit([urun(b, "u3").stok, urun(b, "u3").aracStok], [9, -1], "dükkandan düştü, araca eklendi (toplam aynı)");
  await arac(b.url, ["aktar", JSON.stringify({ yon: "dukkana", kalemler: [{ urun: "Örnek Bardak Su", adet: 5 }] }), "--kaydet"]);
  d.esit([urun(b, "u1").stok, urun(b, "u1").aracStok], [45, 15], "ters yön (araçtan dükkana) da çalışıyor");
  d.esit(S(b).aracHareket.map((h) => [h.urunId, h.adet, h.yon]), [["u3", 3, "yukleme"], ["u1", 5, "bosaltma"]], "aktarma araç hareketine işlendi");
  await b.dur();
}

/* ---------- 7) Kritik öneri + alınacaklar (satış hızından) ---------- */
{
  const st = stokStore();
  st.products.find((p) => p.id === "u1").stok = 1; st.products.find((p) => p.id === "u1").aracStok = 1;   // haftada 2,5 satılıyor; 2 haftalık = 5; elde 2 → 3 al
  st.products.find((p) => p.id === "u5").aracStok = 2;                                                    // haftada 1,67; elde −7+2 (eksi → 0 sayılır) → 4 al
  const b = await yeniBulut(st), once = kopya(S(b));
  const al = await arac(b.url, ["alinacaklar"]);
  d.dogru(/\| \*\*3\*\* Koli \| Örnek Bardak Su 200 ml \| 2,5 \| 1 \| 1 \| 210,00 ₺ \|/.test(al.stdout), "alınacaklar: 2 haftalık satış (5) − eldeki (2) = 3 koli, tutarıyla");
  d.dogru(/\| \*\*4\*\* Adet \| Örnek Küp Şeker ⚠ \| 1,7 \| -7 \| 2 \|/.test(al.stdout), "alınacaklar: eksi stok 0 sayılıp öneri hesaplanıyor ve ⚠ ile işaretleniyor");
  d.dogru(/Bu liste güvenilir DEĞİL/.test(al.stdout), "eksi stok varken listenin güvenilmez olduğu açıkça yazıyor");
  d.dogru(!/Örnek Kola/.test(al.stdout), "yeterli stoğu olan ürün listede yok");
  const metin = await arac(b.url, ["alinacaklar", "--metin"]);
  d.dogru(/• 3 Koli Örnek Bardak Su 200 ml/.test(metin.stdout) && !/\|/.test(metin.stdout), "--metin paylaşılabilir düz liste veriyor");
  const al3 = await arac(b.url, ["alinacaklar", "--hedef=3"]);
  d.dogru(/\| \*\*6\*\* Koli \| Örnek Bardak Su 200 ml/.test(al3.stdout), "--hedef=3: 3 haftalık satış (7,5) − eldeki (2) → 6");

  const ko = await arac(b.url, ["kritik-oner"]);
  d.dogru(/\| Örnek Küp Şeker \| 1,7 \| — \| \*\*2\*\* \| yazılacak \|/.test(ko.stdout) && /\| Örnek Bardak Su 200 ml \| 2,5 \| 5 \| \*\*3\*\* \| elle girilmiş, dokunulmaz \|/.test(ko.stdout), "kritik-oner: haftalık satış kadar seviye öneriyor; elle girilmişe dokunmuyor");
  d.esit(S(b), once, "kritik-oner provası hiçbir şey yazmadı");
  await arac(b.url, ["kritik-oner", "--kaydet"]);
  d.esit(["u1", "u2", "u3", "u4", "u5", "u6"].map((id) => urun(b, id).kritik), [5, 1, 1, 1, 2, ""], "öneriler boş olanlara yazıldı (u1'in 5'i korundu, satışı olmayan boş kaldı)");
  await arac(b.url, ["kritik-oner", "--hepsi", "--kaydet"]);
  d.esit(urun(b, "u1").kritik, 3, "--hepsi elle girilmişi de önerilenle değiştirdi");
  const dr = await arac(b.url, ["durum"]);
  d.dogru(/Satis 5 · Musteri 4 · Urun 10/.test(dr.stdout) && /eksi dukkan 1 urun · eksi arac 1 urun · azalan 2/.test(dr.stdout), "durum eski satırları koruyor, stok özetini ekliyor (azalan: dükkan+araç toplamına göre)");
  await b.dur();
}
d.bitir();
