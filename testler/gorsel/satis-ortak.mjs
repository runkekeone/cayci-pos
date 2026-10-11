// Satış ekranı görsel denemelerinin ortak yardımcıları. Hepsi sahte bulutla çalışır; veri UYDURMADIR.
import fs from "node:fs";
import path from "node:path";
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { panelAc, bekle, denetci, DEPO } from "../ortak/panel.mjs";
import { ornekStore, ornekSatirlar } from "../ortak/ornek-store.mjs";

export { bekle, denetci };
export const EKRAN = process.env.CIKTI || path.resolve(DEPO, "../ekran/g-satis");

const gun = (n, saat = 11) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(saat, 0, 0, 0); return d.toISOString(); };
const gunStr = (iso) => { const d = new Date(iso); const p = (x) => String(x).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };

export const UZUN_URUN = "Örnek Maden Suyu Sade Cam Şişe 200 ml 24'lü Ekonomik Koli (Depozitolu, İadeli)";
export const UZUN_MUSTERI = "Yukarı Mahalle Emekliler Dayanışma ve Yardımlaşma Derneği Lokali Çay Ocağı";

/** Örnek veri + satış ekranının uç durumları için ekler (çok ürün, uzun adlar, limit aşmış + gecikmiş müşteri). */
export function gsStore() {
  const st = ornekStore();
  const urun = (id, ad, grup, satis, alis, stok, arac, ek) => ({ id, ad, grup, birim: "Koli", satis, alis, stok, aracStok: arac, kritik: 3, kdv: 1, barkod: "", gorunur: true, ...(ek || {}) });
  st.products.push(
    urun("u11", "Örnek Ayran 200 ml", "Ayran", 260, 200, 14, 6), urun("u12", "Örnek Gazoz 250 ml", "Gazoz", 350, 270, 9, 4),
    urun("u13", "Örnek Meyve Suyu Vişne", "Meyve Suyu", 600, 470, 7, 3), urun("u14", "Örnek Meyve Suyu Şeftali", "Meyve Suyu", 600, 470, 2, 0),
    urun("u15", "Örnek Toz İçecek Portakal", "Toz İçecekler", 75, 50, 30, 12), urun("u16", "Örnek Oyun Kağıdı", "Oyun Kağıtları", 95, 60, 40, 10),
    urun("u17", "Örnek Çay Bardağı 6'lı", "Servis & Bardak", 180, 130, 6, 0), urun("u18", "Örnek Peçete 100'lü", "Kağıt & Hijyen", 45, 30, 60, 20),
    urun("u19", "Örnek Bulaşık Deterjanı 5 L", "Temizlik", 320, 240, 1, 0), urun("u20", "Örnek Süt Tozu 1 kg", "Şeker & Gıda", 410, 330, 5, 2),
    urun("u21", UZUN_URUN, "Sodalar", 285, 210, 18, 1), urun("u22", "Örnek Limonlu Soda", "Sodalar", 250, 190, 22, 9),
    urun("u23", "Örnek Elmalı Soda", "Sodalar", 250, 190, 11, 3), urun("u24", "Örnek Kahve 100 gr", "Kahve & Yan Ürünler", 145, 110, 16, 5),
    urun("u25", "Örnek Okey Takımı", "Okey & Oyun", 1250, 980, 3, 1), urun("u26", "Örnek Plastik Sandalye", "Mobilya & Dış Mekan", 123456.5, 100000, 4, 0),
    urun("u27", "Örnek Büyük Su 5 L", "Su", 55, 38, 80, 30), urun("u28", "Örnek Damacana 19 L", "Su", 120, 85, 25, 8),
    urun("u29", "Örnek Su 1,5 L", "Su", 210, 150, 33, 12), urun("u30", "Örnek Su 330 ml Cam", "Su", 310, 240, 6, 2));
  const mus = (id, ad, tel, acilis, limit, ek) => ({ id, ad, telefon: tel, acilis, limit, vade: "", ozelFiyatlar: {}, ...(ek || {}) });
  st.customers.push(
    mus("m5", "Kardeşler Kıraathanesi Merkez Şube", "05550000005", 0, 3000, { vade: 15 }),
    mus("m6", UZUN_MUSTERI, "", 0, 0),
    mus("m7", "Bilardo Salonu", "05550000007", 880, 0));
  // m5: 45 gün önce 4.760 ₺ veresiye → limit (3.000) aşılmış + vadesi (15 gün) geçmiş
  const eski = gun(45);
  const p = (id) => st.products.find((x) => x.id === id);
  const kalem = (id, adet) => ({ urunId: id, ad: p(id).ad, barkod: "", kdv: 1, fiyat: p(id).satis, adet, iskyuzde: 0, alis: p(id).alis });
  const s6 = [kalem("u4", 2), kalem("u1", 2), kalem("u3", 1)];   // 4000 + 200 + 640 = 4840
  const t6 = s6.reduce((a, i) => a + i.fiyat * i.adet, 0);
  st.sales.push({ id: "s6", belgeNo: new Date().getFullYear() + "-000006", musteriId: "m5", personelId: null, not: "", odemeAdi: null, items: s6, brut: t6, iskonto: 0, toplam: t6, maliyet: 0, komisyon: 0, odeme: { nakit: 80, pos: 0, acik: t6 - 80 }, tarih: eski, servisGun: gunStr(eski), hafta: "", stokKaynak: "arac" });
  st.counters.sale = 6;
  st.rotalar.push({ id: "r1", ad: "Deneme Rotası", musteriIds: ["m1", "m2"] });
  return st;
}

/** Sahte bulut + panel (telefon boyutu). diyalog: (d) => … verilmezse hepsi "Tamam". */
export async function gsAc(a = {}) {
  const store = a.store || gsStore();
  const bulut = await sahteBulut({ satirlar: ornekSatirlar(store) });
  const p = await panelAc({ bulutUrl: bulut.url, genislik: a.genislik || 390, yukseklik: a.yukseklik || 844, diyalog: a.diyalog, storageState: a.storageState, panelDizin: a.panelDizin });
  const page = p.page;
  await page.waitForFunction((n) => window.app.getStore().customers.length === n, store.customers.length, { timeout: 15000 });
  await bekle(150);
  const git = async (yol) => {
    await page.evaluate((y) => { document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()); if (location.hash === "#/" + y) window.app.render(); else location.hash = "#/" + y; }, yol);
    await bekle(300); await page.evaluate(() => window.scrollTo(0, 0));
  };
  const cek = async (klasor, ad, tam) => {
    const dizin = path.join(EKRAN, klasor); fs.mkdirSync(dizin, { recursive: true });
    await bekle(250); await page.screenshot({ path: path.join(dizin, ad + ".png"), fullPage: !!tam });
    console.log("  " + klasor + "/" + ad);
  };
  return { bulut, p, page, git, cek, deger: () => bulut.deger("babuco:store"), kapat: async () => { await p.kapat(); await bulut.dur(); } };
}

/** Sayfada yatay taşma var mı (belge genişliği − pencere genişliği). */
export const tasma = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
