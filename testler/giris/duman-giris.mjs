// Ortak duman denemesinin (testler/ortak/duman.mjs) GİRİŞLİ eşdeğeri.
// Panel artık oturumsuz veri göstermediği için ortak deneme tek başına geçmez; fark yalnız panelin
// "cihazda oturum var" hâlinde açılması (oturumluPanelAc). Çalıştır: node testler/giris/duman-giris.mjs
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { aracCalistir, denetci, bekle } from "../ortak/panel.mjs";
import { ornekStore, ornekSatirlar } from "../ortak/ornek-store.mjs";
import { oturumluPanelAc } from "./yardimci.mjs";

const d = denetci("duman-giris");
const bulut = await sahteBulut({ satirlar: ornekSatirlar() });
const p = await oturumluPanelAc({ bulutUrl: bulut.url });
try {
  await p.page.waitForFunction(() => window.app.getStore().customers.length === 4, null, { timeout: 10000 });
  d.dogru(true, "panel açıldı ve veriyi sahte buluttan çekti");

  const onceki = bulut.deger("babuco:store").sales.length;
  await p.page.evaluate(() => { window.app.addToCart("u2"); window.app.finalizeSale("nakit"); });
  await bekle(1800);                                     // panel buluta 1 sn gecikmeyle yazar
  const sonra = bulut.deger("babuco:store");
  d.esit(sonra.sales.length, onceki + 1, "satış sahte buluta yazıldı");
  d.esit(sonra.sales[sonra.sales.length - 1].odeme, { nakit: 170, pos: 0, acik: 0 }, "satışın ödeme kırılımı doğru");
  d.esit(sonra.products.find((x) => x.id === "u2").stok, ornekStore().products.find((x) => x.id === "u2").stok - 1, "dükkan stoğu 1 düştü");

  const a = await aracCalistir(bulut.url, ["durum"]);
  d.dogru(a.kod === 0 && /Satis 6/.test(a.cikti), "araç aynı sahte buluttan okuyor (Satis 6)");
  d.esit(p.hatalar, [], "sayfada betik hatası yok");
} finally {
  await p.kapat();
  await bulut.dur();
}
d.bitir();
