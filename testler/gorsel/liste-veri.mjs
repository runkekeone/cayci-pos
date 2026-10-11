// Liste ekranlarının (müşteriler, ürünler, müşteri detayı, rapor satış listesi) görüntü ve denemeleri için
// UYDURMA veri: 40 müşteri, 130 ürün. Gerçek müşteri bilgisi içermez. Sahte bulutla kullanılır.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { panelAc, bekle } from "../ortak/panel.mjs";
import { ornekStore, ornekSatirlar } from "../ortak/ornek-store.mjs";

export { bekle };
export const EKRAN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../ekran/g-liste");

const p2 = (x) => String(x).padStart(2, "0");
export const gunStr = (d) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
/** n gün önce, verilen saatte (yerel) — ISO metni. */
export function gun(n = 0, saat = 11, dk = 0) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(saat, dk, 0, 0); return d.toISOString(); }

const AD1 = ["Akasya", "Bahar", "Çınaraltı", "Dostlar", "Emek", "Fidan", "Gülistan", "Huzur", "Ihlamur", "İnci", "Kardelen", "Lale", "Menekşe", "Nilüfer", "Orkide", "Öğretmenler", "Papatya", "Reyhan", "Sardunya", "Şirin", "Turna", "Uğur", "Ülkü", "Vadi", "Yayla", "Zambak", "Işık", "Çamlık", "Şelale", "Güneşli", "Özlem", "Ilgaz", "Gökkuşağı"];
const AD2 = ["Kıraathanesi", "Çay Evi", "Kahvesi", "Lokali", "Büfe", "Çay Bahçesi", "Kafe", "Çay Ocağı"];

/** 40 müşteri (4 örnek + 36 yeni): uzun adlı, borçlu/borçsuz, gecikmiş, limiti aşmış, telefonsuz karışık; 130 ürün. */
export function listeStore() {
  const st = ornekStore();
  let n = st.counters.sale;
  const satis = (musteriId, kalemler, odeme, tarih) => {
    n++;
    const items = kalemler.map(([id, adet]) => { const p = st.products.find((x) => x.id === id); return { urunId: id, ad: p.ad, barkod: "", kdv: p.kdv, fiyat: p.satis, adet, iskyuzde: 0, alis: p.alis }; });
    const toplam = items.reduce((a, i) => a + i.fiyat * i.adet, 0);
    const d = new Date(tarih);
    st.sales.push({ id: "s" + n, belgeNo: d.getFullYear() + "-" + String(n).padStart(6, "0"), musteriId, personelId: null, not: "", odemeAdi: null, items, brut: toplam, iskonto: 0, toplam, maliyet: items.reduce((a, i) => a + i.alis * i.adet, 0), komisyon: 0, odeme: { nakit: 0, pos: 0, acik: 0, ...odeme(toplam) }, tarih, servisGun: gunStr(d), hafta: "", stokKaynak: "arac" });
    return st.sales[st.sales.length - 1];
  };
  const mus = (id, ad, ek = {}) => { st.customers.push({ id, ad, telefon: "0555000" + String(1000 + st.customers.length), acilis: 0, limit: 0, vade: "", ozelFiyatlar: {}, ...ek }); };

  // --- özel durumlu müşteriler ---
  mus("m5", "Kardeşler Kıraathanesi Merkez Şube", { acilis: 4200, limit: 3000 });                      // limit aşılmış
  mus("m6", "Yıldız Çay Evi");                                                                           // borçsuz
  mus("m7", "Köy Yardımlaşma ve Dayanışma Derneği Lokali Merkez Şubesi", { telefon: "", limit: 10000 }); // çok uzun ad, telefonsuz
  mus("m8", "Bilardo Salonu", { acilis: 880 });
  mus("m9", "Büyük Hesap Toptan Gıda Pazarlama", { acilis: 1234567.5, limit: 1000000, vade: 30 });       // büyük tutar
  mus("m10", "Kısa Vadeli Kahve", { vade: 7, limit: 5000 });                                             // gecikmiş (aşağıdaki satışla)
  mus("m11", "Çok Alışverişli Çay Bahçesi");                                                             // 25 alışveriş
  mus("m12", "Fazla Ödeyen Büfe", { acilis: -150 });                                                     // alacaklı
  // --- kalan 28 müşteri: karışık ---
  for (let i = 0; i < 28; i++) {
    const ad = AD1[i % AD1.length] + " " + AD2[(i * 3) % AD2.length];
    const ek = {};
    if (i % 4 === 0) ek.acilis = 350 + i * 135;            // borçlu
    if (i % 7 === 3) ek.telefon = "";                       // telefonsuz
    if (i % 9 === 4) { ek.acilis = 2600 + i * 10; ek.limit = 2000; } // limit aşmış
    mus("m" + (13 + i), ad, ek);
  }

  // --- 130 ürün (6 örnek + 124 yeni) ---
  const GRUP = [["Su", "Koli", 110], ["Gazlı İçecek", "Koli", 620], ["Meyve Suyu", "Koli", 600], ["Çaylar", "Adet", 1900], ["Şeker & Gıda", "Adet", 75], ["Sodalar", "Koli", 240], ["Toz İçecekler", "Adet", 75], ["Oyun Kağıtları", "Adet", 95], ["Servis & Bardak", "Koli", 180], ["Kağıt & Hijyen", "Koli", 320], ["Temizlik", "Adet", 260]];
  const CESIT = ["Limon", "Portakal", "Vişne", "Şeftali", "Kayısı", "Elma", "Nane", "Kuşburnu", "Ihlamur", "Sade", "Çilek", "Karışık"];
  for (let i = 0; i < 124; i++) {
    const g = GRUP[i % GRUP.length], c = CESIT[(i * 5) % CESIT.length];
    const satisF = g[2] + (i % 6) * 5, id = "u" + (7 + i);
    const p = { id, ad: `Örnek ${g[0].split(" ")[0]} ${c} ${200 + (i % 5) * 50} ml No ${i + 1}`, grup: g[0], birim: g[1], satis: satisF, alis: Math.round(satisF * 0.78), stok: 6 + (i * 7) % 40, aracStok: (i * 3) % 14, kritik: i % 3 === 0 ? 5 : "", kdv: 1, barkod: i % 10 === 0 ? "869000000" + String(1000 + i) : "", gorunur: true };
    if (i === 3) { p.stok = -4; p.aracStok = 2; }                                  // eksi dükkan stoğu
    if (i === 8) { p.stok = 3; p.aracStok = -6; }                                  // eksi araç stoğu
    if (i === 12) { p.stok = 2; p.aracStok = 1; p.kritik = 10; }                   // kritik (azaldı)
    if (i === 15) { p.stok = 0; p.aracStok = 0; p.kritik = 5; }                    // bitti
    if (i === 20) p.ad = "Örnek Çok Uzun Adlı Bulaşık Deterjanı Limon Kokulu Ekonomik Aile Boyu Paket 5 L × 4'lü Koli";
    if (i === 21) { p.ad = "Örnek Pahalı Çay Makinesi Çift Demlikli"; p.satis = 1234567.5; p.grup = ""; }
    st.products.push(p);
  }

  // --- geçmiş satışlar ---
  satis("m5", [["u1", 10], ["u3", 2]], (t) => ({ nakit: 1500, acik: t - 1500 }), gun(12, 10));
  satis("m10", [["u4", 1], ["u5", 5]], (t) => ({ acik: t }), gun(25, 9));                   // vade 7 → 18 gün gecikmiş
  satis("m7", [["u4", 2], ["u5", 20]], (t) => ({ acik: t }), gun(4, 11));
  for (let i = 0; i < 25; i++) satis("m11", [["u1", 2 + (i % 4)], ["u2", 1]], (t) => (i % 3 === 0 ? { acik: t } : i % 3 === 1 ? { nakit: t } : { pos: t }), gun(3 + i * 7, 9 + (i % 6), 10));
  // --- bugünün satışları (günlük rapor) ---
  satis("m5", [["u1", 10], ["u3", 2]], (t) => ({ nakit: 1500, acik: t - 1500 }), gun(0, 9, 15));
  satis("m6", [["u2", 5]], (t) => ({ nakit: t }), gun(0, 10, 5));
  satis("m7", [["u4", 2], ["u5", 20]], (t) => ({ acik: t }), gun(0, 11, 40));
  satis("m8", [["u1", 6]], (t) => ({ pos: t }), gun(0, 13, 20));
  satis(null, [["u2", 2]], (t) => ({ nakit: t }), gun(0, 14, 0));
  satis("m9", [["u4", 600], ["u3", 55]], (t) => ({ acik: t }), gun(0, 15, 30));              // büyük tutar
  st.counters.sale = n;

  st.payments.push(
    { id: "t9", musteriId: "m5", tutar: 1000, not: "", odemeTuru: "nakit", tarih: gun(2, 9) },
    { id: "t10", musteriId: "m5", tutar: 500, not: "kartla ödedi", odemeTuru: "kart", tarih: gun(8, 9) },
    { id: "t11", musteriId: "m5", tutar: -300, not: "Manuel borç ekleme", odemeTuru: "duzeltme", tarih: gun(9, 9) },
    { id: "t12", musteriId: "m11", tutar: 400, not: "", odemeTuru: "havale", tarih: gun(1, 9) });
  st.tsiparisler.push({ id: "ts1", musteriId: "m5", tarih: gun(6, 12), not: "", kalemler: [{ urunId: "u1", ad: "Örnek Bardak Su 200 ml", adet: 50, fiyat: 100 }], toplamTutar: 5000, hareketler: [{ id: "h1", tarih: gun(5, 12), teslim: [{ urunId: "u1", adet: 20 }], odeme: 2000 }] });
  st.expenses.push({ id: "g9", tutar: 900, not: "mazot", kategori: "Yakıt", tur: "Yakıt", odeme: "Nakit", tarih: gun(0, 8) });
  // ortak tablo denemeleri: 1 gider zaten var (tek kayıt) → çok kayıt için 24 gelir
  for (let i = 0; i < 24; i++) st.incomes.push({ id: "gl" + i, tutar: 100 + i * 10, not: "örnek gelir " + (i + 1) + (i === 5 ? " ışıklı tabela kirası" : ""), tur: "Diğer", odeme: "Nakit", tarih: gun(i, 10) });
  return st;
}

/** Sahte bulut + panel (390 px; genislik verilirse o). Dönen: { page, git, kapat, hatalar, diyaloglar } */
export async function listeAc(store = listeStore(), sec = {}) {
  const bulut = await sahteBulut({ satirlar: ornekSatirlar(store) });
  const p = await panelAc({ bulutUrl: bulut.url, genislik: sec.genislik, yukseklik: sec.yukseklik, diyalog: sec.diyalog });
  const { page } = p;
  await page.waitForFunction((n) => store.customers.length === n, store.customers.length, { timeout: 15000 });
  const git = async (yol) => { await page.evaluate((y) => { document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()); if (location.hash === "#/" + y) render(); else location.hash = "#/" + y; }, yol); await bekle(350); await page.evaluate(() => window.scrollTo(0, 0)); };
  return { page, git, bulut, hatalar: p.hatalar, diyaloglar: p.diyaloglar, kapat: async () => { await p.kapat(); await bulut.dur(); } };
}
