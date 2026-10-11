// Senaryo 4: okuma HATASI "bulut boş" sayılmaz; hata varken buluta hiçbir şey itilmez.
//   ESKİ: kvGet hata olunca da null dönüyor → "bulutta kayıt yok" sanılıp eldeki store buluta yazılıyor:
//         a) yeni telefonda tohum katalog gerçek veriyi EZİYOR,  b) eski kopyası olan telefon aracın satışını SİLİYOR.
//   YENİ: okunamadıysa yazma yok; okuma düzelince bulut alınır. Bulut gerçekten boşsa da tohum katalog itilmez.
// Çalıştır: node testler/senkron/4-okuma-hatasi.mjs
import { senkronBulut, panel, yenidenAc, aracCalistir, satis, hazir, esitlendi, yokla, denetci, bekle, ornekStore, ornekSatirlar, ayni, bul, ESKI_MI, STORE } from "./yardimci.mjs";

const d = denetci("4-okuma-hatasi");
const ilk = ornekStore();

console.log("— a) yeni telefon (yalnız tohum katalog) + okuma hatası");
{
  const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
  bulut.ayar.okumaHatasi = -1;                                  // bütün okumalar 500
  const p = await panel(bulut);
  try {
    await bekle(3500);
    if (!ESKI_MI) { await p.page.evaluate(() => esitle()); await yokla(p.page); await bekle(500); }
    d.esit(bulut.storeYazmalari().length, 0, "okuma hata verirken buluta HİÇBİR yazma gitmedi");
    d.dogru(ayni(bulut.store(), ilk), "buluttaki gerçek veri olduğu gibi duruyor (tohum katalog ezmedi)");
    d.esit(bulut.store().sales.length, 5, "5 satış yerinde");
    bulut.ayar.okumaHatasi = 0;                                 // okuma düzeldi
    if (!ESKI_MI) await yokla(p.page);
    await p.page.waitForFunction(() => store.customers.length === 4, null, { timeout: 15000 }).then(() => d.dogru(true, "okuma düzelince panel buluttaki veriyi aldı"), () => d.dogru(false, "okuma düzelince panel buluttaki veriyi aldı"));
    d.esit(bulut.storeYazmalari().length, 0, "…ve yine hiçbir şey yazmadı (yalnız okudu)");
  } finally { await p.kapat(); await bulut.dur(); }
}

console.log("— b) eski kopyası olan telefon + okuma hatası (araç bu arada satış yazmış)");
{
  const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
  const p = await panel(bulut);
  try {
    await hazir(p.page);
    await p.page.close();                                       // uygulama kapandı; telefonda 5 satışlık kopya var
    const a = await aracCalistir(bulut, ["satis", JSON.stringify({ musteri: "Örnek Çay Ocağı", kalemler: [{ urun: "Örnek Çay 5 kg", adet: 1 }], odeme: "acik" }), "--kaydet"]);
    d.dogru(a.kod === 0 && bulut.store().sales.length === 6, "araç 6. satışı yazdı");
    const aracSonrasi = JSON.parse(JSON.stringify(bulut.store()));
    const once = bulut.storeYazmalari().length;
    bulut.ayar.okumaHatasi = -1;
    const y = await yenidenAc(p);                               // okuma hata verirken yeniden açılış
    await bekle(3500);
    if (!ESKI_MI) { await y.page.evaluate(() => esitle()); await bekle(500); }
    d.esit(bulut.storeYazmalari().length - once, 0, "okuma hata verirken telefon eski kopyasını buluta İTMEDİ");
    d.dogru(ayni(bulut.store(), aracSonrasi), "aracın satışı bulutta duruyor");
    d.esit(await y.page.evaluate(() => store.sales.length), 5, "telefon eldeki (eski) veriyle açık kaldı, kilitlenmedi");
    // hata sürerken telefonda satış yapılır → yine yazma yok, kayıt telefonda bekler
    const ps = await satis(y.page, "u1", "nakit", null, 1);
    await bekle(2500);
    d.esit(bulut.storeYazmalari().length - once, 0, "hata sürerken yapılan satış da körlemesine yazılmadı");
    if (!ESKI_MI) d.dogru(await y.page.evaluate(() => esBekleyenVar()), "satış telefonda gönderilmeyi bekliyor");
    bulut.ayar.okumaHatasi = 0;
    if (!ESKI_MI) await y.page.evaluate(() => { _esDurum.sonraki = 0; return esitle(); });
    await esitlendi(y.page);
    const s = bulut.store();
    d.dogru(!!bul(s.sales, aracSonrasi.sales[5].id) && !!bul(s.sales, ps.id), "okuma düzelince: aracın satışı da telefonun satışı da bulutta");
    d.esit(s.sales.length, 7, "toplam 7 satış");
    d.esit(y.hatalar, [], "sayfada betik hatası yok");
  } finally { await p.kapat(); await bulut.dur(); }
}

console.log("— c) bulut GERÇEKTEN boş (kayıt yok)");
{
  const bulut = await senkronBulut({ satirlar: [] });
  const p = await panel(bulut);
  try {
    await bekle(3000);
    if (!ESKI_MI) { await hazir(p.page); await yokla(p.page); await bekle(400); }
    // Açılışta tohum katalogdaki eski grup adları temiz kategorilere çevrilir (kategoriGocKontrol); bu bir
    // değişiklik olduğu için boş buluta kayıt OLUŞTURULABİLİR — ama yalnız düz eklemeyle (insert): kayıt
    // aslında varsa (ör. yetki yüzünden görünmüyorsa) ekleme reddedilir, üstüne yazılamaz.
    if (!ESKI_MI) d.dogru(bulut.storeYazmalari().every((y) => y.yontem === "POST" && !/merge-duplicates/.test(y.prefer)), "boş bulutta tohum katalog upsert ile değil, yalnız düz eklemeyle oluşturuluyor");
    const ps = await satis(p.page, await p.page.evaluate(() => store.products[0].id), "nakit", null, 1);
    await esitlendi(p.page);
    const s = bulut.store();
    d.dogru(!!s && !!bul(s.sales, ps.id), "gerçek bir kayıt girilince bulut kaydı oluşturuldu");
    if (!ESKI_MI) d.dogru(bulut.storeYazmalari().every((y) => (y.yontem === "POST" && !/merge-duplicates/.test(y.prefer)) || (y.yontem === "PATCH" && y.kosullu)), "oluşturma düz ekleme ile (var olanın üstüne yazamaz), sonrası koşullu");
    d.esit(p.hatalar, [], "sayfada betik hatası yok");
  } finally { await p.kapat(); await bulut.dur(); }
}
d.bitir();
