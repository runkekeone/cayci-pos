// Değişen ekranların 390 px görüntüsü + "sayfa hatasız açılıyor, yana taşmıyor" denetimi.
// Çalıştır: node testler/stok/ekranlar.mjs      (görüntüler: _wt/ekran/stok/, depo dışı)
// Ayrıca ESKİ (yeni alanları olmayan) veriyle her ekranın açıldığını sınar.
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { panelAc, denetci, bekle } from "../ortak/panel.mjs";
import { ornekStore } from "../ortak/ornek-store.mjs";
import { stokStore, satirlar, siparisSatiri, ekran, gun } from "./yardimci.mjs";

const d = denetci("ekranlar");

async function gez(etiket, store, siparisler, sayfalar) {
  const bulut = await sahteBulut({ satirlar: satirlar(store), siparisler });
  const p = await panelAc({ bulutUrl: bulut.url });
  try {
    await p.page.waitForFunction((n) => window.app.getStore().customers.length === n, store.customers.length, { timeout: 10000 });
    await bekle(700);                                     // sipariş çekme + ilk çizim
    for (const s of sayfalar) {
      await p.page.evaluate((r) => { location.hash = "#/" + r; }, s.yol);
      await bekle(250);
      if (s.once) { await s.once(p.page); await bekle(250); }
      const durum = await p.page.evaluate(() => ({
        hata: !!document.querySelector("#content pre"),
        tasma: document.documentElement.scrollWidth - window.innerWidth,
        icTasma: [...document.querySelectorAll("#content *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && !e.closest(".table-wrap, .cat-tabs, .line-table, .stk-secliste"); }).length,
        bos: document.getElementById("content").innerText.trim().length < 10,
      }));
      d.dogru(!durum.hata && !durum.bos, etiket + " · " + s.yol + ": ekran hatasız açıldı");
      d.dogru(durum.tasma <= 0 && durum.icTasma === 0, etiket + " · " + s.yol + ": 390 px'te yana taşma yok" + (durum.tasma > 0 || durum.icTasma ? " (taşan: " + durum.tasma + " px, " + durum.icTasma + " öğe)" : ""));
      if (s.ad) await ekran(p.page, s.ad);
      if (s.tam) { await p.page.screenshot({ path: (await import("node:path")).join((await import("./yardimci.mjs")).EKRAN, s.ad + "-tam.png"), fullPage: true }).catch(() => {}); }
      if (s.sonra) await s.sonra(p.page);
    }
    d.esit(p.hatalar, [], etiket + ": sayfada betik hatası yok");
  } finally { await p.kapat(); await bulut.dur(); }
}

/* --- 1) yeni veriyle: eksi stok, özel fiyat, bekleyen sipariş --- */
const s1 = stokStore();
s1.purchases.push({ id: "a1", no: "ESKI-1", firmaId: null, items: [{ urunId: "u1", ad: "Örnek Bardak Su 200 ml", adet: 10, birimFiyat: 70 }], toplam: 700, odeme: "pesin", borc: 0, tarih: gun(12) });
s1.firmalar.push({ id: "f1", ad: "Deneme Toptan", telefon: "" });
s1.products.find((x) => x.id === "u1").stok = 1; s1.products.find((x) => x.id === "u1").aracStok = 1;   // azalan → alınacaklar + zil
s1.fiyatGecmisi = [{ id: "g1", urunId: "u3", ad: "Örnek Kola 250 ml", alan: "alis", eski: 480, yeni: 500, kaynak: "Alış A1", tarih: gun(5) }];
const sip = [siparisSatiri("ord-aaa11", { gunOnce: 3 }), siparisSatiri("ord-bbb22", { ad: "Yepyeni Ocak", tel: "05551112233", gunOnce: 0 })];
const alisDoldur = async (page) => {
  await page.click('[data-sec="aHedef"] [data-v="arac"]');
  await page.selectOption('[data-ar="0"][data-fld="urunId"]', "u3");
  await page.fill('[data-ar="0"][data-fld="adet"]', "5");
  await page.fill('[data-ar="0"][data-fld="birimFiyat"]', "600");
  await page.fill("#aFisToplam", "3200");
};
await gez("yeni veri", s1, sip, [
  { yol: "alis-olustur", ad: "alis-faturasi", once: alisDoldur, tam: true },
  { yol: "alis-faturalari", ad: "alis-listesi" },
  { yol: "stok-sayimi", ad: "stok-sayimi" },
  { yol: "stok-sayimi", once: async (page) => { await page.click('[data-act="sayArac"]'); await bekle(300); await page.click('[data-sayarti="0"]'); await page.fill('[data-say="2"]', "6"); }, ad: "stok-sayimi-detay", tam: true },
  { yol: "toplu-zam", ad: "toplu-zam", once: async (page) => { await page.selectOption("#zGrup", "Toz İçecekler"); await bekle(200); await page.fill("#zDeger", "10"); await page.selectOption("#zYuv", "5"); await page.click('[data-sec="zOzel"] [data-v="ayni"]'); await page.click("#zOnizle"); await bekle(500); }, tam: true },
  { yol: "fiyat-bakim", ad: "fiyat-kontrol", tam: true },
  { yol: "fiyat-gecmisi", ad: "fiyat-gecmisi" },
  { yol: "alinacaklar", ad: "alinacaklar", tam: true },
  { yol: "cay-ocagi", ad: "siparis-seridi" },
  { yol: "urun-iade", ad: "iade", once: async (page) => { await page.selectOption("#iMus", "m3"); await page.selectOption("#iUrun", "u3"); } },
  { yol: "urunler" }, { yol: "urun-ekle" }, { yol: "arac-yukleme", ad: "arac-stogu" }, { yol: "firmalar" }, { yol: "anasayfa" }, { yol: "dukkan" },
  { yol: "rapor-stokhareket" },
  { yol: "anasayfa", ad: "zil", once: async (page) => { await page.click("#bellBtn"); } },
]);

/* --- 2) ESKİ veriyle: yeni alanların hiçbiri yok (hedef, odemeTuru, havuz, fiyatGecmisi, sipSilinenler...) --- */
const s2 = ornekStore();
s2.purchases.push({ id: "a1", no: "A1", firmaId: null, items: [{ urunId: "u1", ad: "Örnek Bardak Su 200 ml", adet: 10, birimFiyat: 70 }], toplam: 700, odeme: "pesin", borc: 0, tarih: gun(12) });
s2.stokSayimlari.push({ id: "y1", kod: "STC000001", ad: "Sayım 1", durum: "kapali", items: [{ urunId: "u1", sistem: 40, sayilan: "38" }, { urunId: "u2", sistem: 30, sayilan: "" }], tarih: gun(9) });
s2.stokSayimlari.push({ id: "y2", kod: "STC000002", ad: "Sayım 2", durum: "acik", items: s2.products.map((p) => ({ urunId: p.id, sistem: p.stok, sayilan: "" })), tarih: gun(1) });
s2.iadeler.push({ id: "i1", urunId: "u1", ad: "Örnek Bardak Su 200 ml", adet: 1, tutar: 100, musteriId: "m1", tarih: gun(4) });
s2.gelenSiparisler.push({ id: "o1", orderId: "", dealer: "Örnek Çay Ocağı", dealerTel: "05550000002", not: "", tarih: gun(6), alindi: gun(6), durum: "yeni", items: [{ ad: "Örnek Bardak Su 200 ml", birim: "Koli", adet: 2, fiyat: 100 }], toplam: 200, teklifNo: "", fisNo: "", teslimTarih: "", teslimSaat: "", saleId: "" });
delete s2.settings.marjEsik;
await gez("eski veri", s2, [], [
  { yol: "alis-faturalari" }, { yol: "alis-olustur" }, { yol: "stok-sayimi" },
  { yol: "stok-sayimi", once: async (page) => { await page.click('[data-sayim="y1"]'); } },
  { yol: "stok-sayimi", once: async (page) => { await page.click('[data-sayim="y2"]'); } },
  { yol: "toplu-zam" }, { yol: "fiyat-bakim" }, { yol: "fiyat-gecmisi" }, { yol: "alinacaklar" }, { yol: "cay-ocagi" },
  { yol: "cay-ocagi", once: async (page) => { await page.click('[data-cayopen="o1"]'); }, sonra: async (page) => { await page.click(".modal .x"); } },
  { yol: "urun-iade" }, { yol: "urunler" }, { yol: "arac-yukleme" }, { yol: "firmalar" }, { yol: "anasayfa" }, { yol: "rota" },
]);
d.bitir();
