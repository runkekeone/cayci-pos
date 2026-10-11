// Cari sayfanın ekran görüntüleri (390 ve 360 px) → ../ekran/cari/  (depo dışında; gözle bakmak için).
// Çalıştır: node testler/cari/ekran.mjs
import fs from "node:fs";
import path from "node:path";
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { aracCalistir, sahteOturum, denetci, DEPO, statikSunucu } from "../ortak/panel.mjs";
import { cariStore, satirlar, sayfaAc, hesapOku, telefonlaGir, linkOlustur, hesapCoz, EKRAN_DIZIN } from "./yardimci.mjs";

const d = denetci("cari-ekran");
fs.mkdirSync(EKRAN_DIZIN, { recursive: true });
const gun = (n, saat = 11) => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(saat, 0, 0, 0); return x.toISOString(); };

// Uydurma veri: uzun adlı + çok fişli + büyük tutarlı bir müşteri
const st = cariStore();
const m3 = st.customers.find((c) => c.id === "m3");
m3.ad = "Sınama Gençlik ve Spor Kulübü Derneği Lokali"; m3.limit = 5000;
for (let i = 0; i < 12; i++) {
  const no = 20 + i, buyuk = i === 11;
  st.sales.push({ id: "c" + no, belgeNo: new Date().getFullYear() + "-0000" + no, musteriId: "m3", personelId: null, not: "", odemeAdi: null,
    items: [{ urunId: "u1", ad: "Örnek Bardak Su 200 ml", barkod: "", kdv: 1, fiyat: 100, adet: buyuk ? 1200 : 6 + i, iskyuzde: 0, alis: 70 }, { urunId: "u5", ad: "Örnek Küp Şeker", barkod: "", kdv: 1, fiyat: 60, adet: 3, iskyuzde: 0, alis: 52.5 },
      { urunId: "u3", ad: "Örnek Kola 250 ml Kutu 24'lü Koli (uzun adlı ürün denemesi)", barkod: "", kdv: 10, fiyat: 640, adet: 1, iskyuzde: 0, alis: 500 }],
    brut: 0, iskonto: 0, toplam: (buyuk ? 120000 : (6 + i) * 100) + 180 + 640, maliyet: 0, komisyon: 0,
    odeme: { nakit: i % 3 === 0 ? 500 : 0, pos: 0, acik: (buyuk ? 120000 : (6 + i) * 100) + 820 - (i % 3 === 0 ? 500 : 0) }, tarih: gun(60 - i * 5, 10 + (i % 5)), servisGun: "", hafta: "", stokKaynak: "arac" });
  if (i % 4 === 1) st.payments.push({ id: "cp" + i, musteriId: "m3", tutar: 1500, odemeTuru: i % 8 === 1 ? "kart" : "nakit", not: "", tarih: gun(58 - i * 5, 15) });
}
const bulut = await sahteBulut({ satirlar: satirlar(st) });
const sunucu = await statikSunucu(path.join(DEPO, "public"));
const { chromium } = await import("playwright");
const browser = await chromium.launch();
const cek = async (page, ad, w, tam = true) => { await page.screenshot({ path: path.join(EKRAN_DIZIN, ad + "-" + w + ".png"), fullPage: tam }); };
/** Yatay taşma var mı? (sayfa gövdesi ekrandan geniş mi) */
const tasma = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

try {
  const y = await aracCalistir(bulut.url, ["cari-yayinla", "--kaydet"]);
  d.dogru(y.kod === 0, "örnek veri yayınlandı");
  const hash = async (id) => { const l = await linkOlustur(bulut, id); return l.slice(l.indexOf("#")); };
  for (const w of [390, 360]) {
    const ac = (a = {}) => sayfaAc({ bulutUrl: bulut.url, genislik: w, browser, sunucu, ...a });
    const tasmalar = [];
    const bak = async (page, ad, tam) => { await cek(page, ad, w, tam); const t = await tasma(page); if (t > 0) tasmalar.push(ad + " +" + t + "px"); };

    let s = await ac();
    await s.page.waitForSelector("#tel");
    await bak(s.page, "01-giris", false);
    await telefonlaGir(s.page, "05559999999");
    await bak(s.page, "02-giris-numara-bulunamadi", false);
    await telefonlaGir(s.page, "0212");
    await bak(s.page, "03-giris-eksik-numara", false);
    await telefonlaGir(s.page, "05550000002");
    await hesapOku(s.page);
    await bak(s.page, "04-hesap-borclu-iadeli");
    await s.page.evaluate(() => document.querySelectorAll("details.fis").forEach((x, i) => { if (i < 3) x.open = true; }));
    await bak(s.page, "05-acik-fis-iade-iskonto");
    await s.kapat();

    s = await ac({ hash: await hash("m1") });
    await hesapOku(s.page);
    await bak(s.page, "06-hesap-borcsuz");
    await s.kapat();

    s = await ac({ hash: await hash("m3") });
    await hesapOku(s.page);
    await bak(s.page, "07-hesap-cok-fisli-uzun-ad");
    await s.page.evaluate(() => { document.querySelector("details.fis").open = true; });
    await bak(s.page, "08-acik-fis-buyuk-tutar", false);
    await s.kapat();

    s = await ac({ hash: await hash("m4") });
    await hesapOku(s.page);
    await bak(s.page, "09-hesap-hareketsiz", false);
    await s.kapat();

    s = await ac({ hash: "#k=AAAAAAAAAAAAAAAAAAAAAA" });
    await s.page.waitForSelector("#giris");
    await bak(s.page, "10-hata-gecersiz-link", false);
    await s.kapat();

    // numarası kayıtlı ama hesabı yayınlanmamış: hesap satırı elle kaldırılır
    const k4 = (await hesapCoz(bulut, "m4")).key, yedek = bulut.kv.get(k4);
    bulut.kv.delete(k4);
    s = await ac();
    await telefonlaGir(s.page, "05550000004");
    await bak(s.page, "11-hata-yayinlanmamis", false);
    await s.kapat();
    bulut.kv.set(k4, yedek);

    bulut.durum.gecikmeMs = 2500;
    s = await ac({ hash: await hash("m2") });
    await s.page.waitForSelector("#durum");
    await bak(s.page, "12-yukleniyor", false);
    await s.kapat();
    bulut.durum.gecikmeMs = 0;

    bulut.kapat();
    s = await ac({ hash: await hash("m2") });
    await s.page.waitForSelector("#tekrar");
    await bak(s.page, "13-hata-internet-yok", false);
    bulut.ac();
    await s.page.click("#tekrar");
    await hesapOku(s.page);
    d.dogru(true, w + " px: 'Tekrar dene' bağlantı gelince hesabı açtı");
    await s.kapat();

    // patron
    s = await ac({ hash: "#patron" });
    await s.page.waitForSelector("#patronGiris");
    await bak(s.page, "20-patron-giris", false);
    await s.kapat();
    s = await ac({ hash: "#patron", oturum: sahteOturum() });
    await s.page.waitForSelector("#toplamAlacak");
    await bak(s.page, "21-patron-liste");
    await s.page.click('.musteri[data-id="m3"]');
    await s.page.waitForSelector("#waGonder");
    await bak(s.page, "22-patron-musteri", false);
    await s.page.goto(s.url + "#patron&m=m4");
    await s.page.waitForFunction(() => /Yeni Müşteri/.test(document.getElementById("kok").innerText));
    await bak(s.page, "23-patron-musteri-hareketsiz", false);
    d.esit(s.hatalar, [], w + " px: betik hatası yok");
    await s.kapat();
    d.esit(tasmalar, [], w + " px: hiçbir ekranda yatay taşma yok");
  }
  console.log("Görüntüler: " + EKRAN_DIZIN);
} finally {
  await browser.close(); await sunucu.dur(); await bulut.dur();
}
d.bitir();
