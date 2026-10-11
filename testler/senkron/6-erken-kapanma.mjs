// Senaryo 6: satış yapılır, 1 sn'lik bekleme dolmadan uygulama kapanır.
//   ESKİ: yazma zamanlayıcıda kalır, hiç gitmez; araç o arada yazınca telefon sonraki açılışta bulutu alır → satış KAYBOLUR.
//   YENİ: kayıt telefondaki günlükte durur; sonraki açılışta buluttaki hâlle birleştirilerek gider.
// 6b: yazma buluta ULAŞIR ama yanıtı gelmeden bağlantı kopar ("gitti mi gitmedi mi?").
//   YENİ: tekrar denemede aynı yama ikinci kez uygulanmaz → stok iki kez düşmez, satış iki kez yazılmaz.
// 6c: sayfa gizlenince (uygulama arka plana alınınca) bekleyen yazma 1 sn beklemeden hemen gider.
// Çalıştır: node testler/senkron/6-erken-kapanma.mjs
import { senkronBulut, panel, yenidenAc, aracCalistir, satis, hazir, esitlendi, yokla, kosul, denetci, bekle, ornekStore, ornekSatirlar, borc, bul, ESKI_MI } from "./yardimci.mjs";

const d = denetci("6-erken-kapanma");
const ilk = ornekStore();

console.log("— 6a) 1 sn dolmadan kapanma");
{
  const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
  const p = await panel(bulut);
  try {
    await hazir(p.page);
    bulut.durum.gecikmeMs = 3000;                              // kapanırken yapılan son deneme de yetişmesin
    const ps = await satis(p.page, "u4", "acik", "m2", 1);     // 2000 ₺ açık hesap
    await p.page.close({ runBeforeUnload: false });            // hemen kapandı (≈ birkaç ms sonra)
    await bekle(3600);
    bulut.durum.gecikmeMs = 0;
    d.dogru(!bul(bulut.store().sales, ps.id), "kapanış anında satış buluta gitmemişti");
    const a = await aracCalistir(bulut, ["tahsilat", "Örnek Çay Ocağı", "250", "--kaydet"]);
    d.dogru(a.kod === 0, "araç o arada tahsilat yazdı (bulut artık telefondakinden yeni)");

    const y = await yenidenAc(p);
    await hazir(y.page); await esitlendi(y.page);
    const s = bulut.store();
    d.dogru(!!bul(s.sales, ps.id), "sonraki açılışta satış buluta gitti");
    d.dogru(s.payments.some((x) => x.musteriId === "m2" && x.tutar === 250), "aracın tahsilatı da duruyor");
    d.esit(bul(s.products, "u4").stok, bul(ilk.products, "u4").stok - 1, "stok tam bir kez düştü");
    d.esit(borc(s, "m2"), borc(ilk, "m2") + 2000 - 250, "m2 borcu: +2000 satış −250 tahsilat");
    d.esit(await y.page.evaluate(() => customerBorc("m2")), borc(s, "m2"), "telefondaki borç da aynı");
    d.esit(y.hatalar, [], "sayfada betik hatası yok");
  } catch (e) { d.dogru(false, "6a yarıda kesildi: " + e.message); }
  finally { await p.kapat(); await bulut.dur(); }
}

if (!ESKI_MI) {
  console.log("— 6b) yazma ulaştı, yanıtı kayboldu");
  {
    const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
    const p = await panel(bulut);
    try {
      await hazir(p.page);
      bulut.ayar.yanitKaybi = 1;                                 // ilk yazma işlenecek ama yanıt gelmeyecek
      const ps = await satis(p.page, "u3", "acik", "m3", 2);     // m3 özel fiyat 620 → 1240
      await kosul(() => !!bul(bulut.store().sales, ps.id), 10000, "yazmanın buluta ulaşması");
      d.dogru(true, "yazma buluta ulaştı (ama panel yanıt alamadı)");
      await bekle(300);
      d.dogru(await p.page.evaluate(() => esBekleyenVar()), "panel kaydı hâlâ \"gönderilmedi\" sanıyor");
      const s1 = await satis(p.page, "u3", "nakit", null, 1);    // üstüne bir satış daha
      await yokla(p.page); await esitlendi(p.page);
      const s = bulut.store();
      d.esit(s.sales.filter((x) => x.id === ps.id).length, 1, "ilk satış bulutta TEK kayıt (iki kez yazılmadı)");
      d.dogru(!!bul(s.sales, s1.id), "ikinci satış da bulutta");
      d.esit(bul(s.products, "u3").stok, bul(ilk.products, "u3").stok - 2 - 1, "stok iki kez düşmedi (12 −2 −1 = 9)");
      d.esit(borc(s, "m3"), borc(ilk, "m3") + 1240, "m3 borcu bir kez arttı");
      d.esit(await p.page.evaluate(() => [findProduct("u3").stok, store.sales.length]), [9, 7], "telefondaki stok ve satış sayısı da doğru");

      // aynı durum + uygulama kapanıp açılırsa (yanıt hiç işlenmeden)
      bulut.ayar.yanitKaybi = 1;
      const s2 = await satis(p.page, "u5", "acik", "m1", 4);     // 4 × 60 = 240
      await kosul(() => !!bul(bulut.store().sales, s2.id), 10000, "ikinci kayıp yanıtlı yazma");
      await p.page.close();
      const y = await yenidenAc(p);
      await hazir(y.page); await esitlendi(y.page);
      const t = bulut.store();
      d.esit([t.sales.filter((x) => x.id === s2.id).length, bul(t.products, "u5").stok, borc(t, "m1")], [1, bul(ilk.products, "u5").stok - 4, borc(ilk, "m1") + 240], "kapanıp açılınca da: tek kayıt, stok bir kez düşmüş, borç bir kez artmış");
      d.esit(await y.page.evaluate(() => [findProduct("u5").stok, esBekleyenVar()]), [bul(ilk.products, "u5").stok - 4, false], "telefon da aynı hâlde, bekleyen yok");
      d.esit(p.hatalar.concat(y.hatalar), [], "sayfalarda betik hatası yok");
    } catch (e) { d.dogru(false, "6b yarıda kesildi: " + e.message); }
    finally { await p.kapat(); await bulut.dur(); }
  }

  console.log("— 6c) uygulama arka plana alınınca hemen gönder");
  {
    const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
    const p = await panel(bulut);
    try {
      await hazir(p.page);
      const t0 = Date.now();
      const ps = await satis(p.page, "u1", "nakit", null, 1);
      await p.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
      await kosul(() => !!bul(bulut.store().sales, ps.id), 5000, "satışın buluta gitmesi");
      const sure = Date.now() - t0;
      d.dogru(sure < 900, "ekrandan çıkınca satış 1 sn beklemeden gitti (" + sure + " ms)");
    } catch (e) { d.dogru(false, "6c yarıda kesildi: " + e.message); }
    finally { await p.kapat(); await bulut.dur(); }
  }
}
d.bitir();
