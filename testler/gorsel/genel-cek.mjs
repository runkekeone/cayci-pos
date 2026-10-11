// Genel ajan: görüntü betiği (uydurma veri, sahte bulut). Çalışma kopyasının kökünden:
//   CIKTI=.../ekran/g-genel node testler/gorsel/genel-cek.mjs [ad-süzgeci]
// Her görüntü 390 px; GENIS=360 ile 360 px. Canlı veriye istek yok.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const DEPO = process.cwd();
const al = (p) => import(pathToFileURL(path.join(DEPO, p)).href);
const { sahteBulut } = await al("testler/ortak/sahte-bulut.mjs");
const { panelAc, bekle } = await al("testler/ortak/panel.mjs");
const { ornekStore, ornekSatirlar } = await al("testler/ortak/ornek-store.mjs");
const GENIS = Number(process.env.GENIS) || 390;
const CIKTI = process.env.CIKTI || path.resolve(DEPO, "../ekran/g-genel");
const EK = GENIS === 390 ? "" : "-" + GENIS;
const SUZ = process.argv[2] || "";
fs.mkdirSync(CIKTI, { recursive: true });

export function genelStore(sec = {}) {
  const st = ornekStore();
  const urun = (id, ad, grup, satis, alis, stok, arac) => ({ id, ad, grup, birim: "Koli", satis, alis, stok, aracStok: arac, kritik: 3, kdv: 1, barkod: "", gorunur: true });
  st.products.push(urun("u11", "Örnek Ayran 200 ml", "Ayran", 260, 200, 14, 6), urun("u12", "Örnek Gazoz 250 ml", "Gazoz", 350, 270, 9, 4),
    urun("u13", "Örnek Meyve Suyu Vişne", "Meyve Suyu", 600, 470, 7, 3), urun("u14", "Örnek Meyve Suyu Şeftali Büyük Boy Cam Şişe 1 Litre", "Meyve Suyu", 600, 470, 2, 0),
    urun("u19", "Örnek Bulaşık Deterjanı 5 L", "Temizlik", 320, 240, 1, 0));
  const mus = (id, ad, tel, acilis, limit) => ({ id, ad, telefon: tel, acilis, limit, vade: "", ozelFiyatlar: {} });
  st.customers.push(mus("m5", "Kardeşler Kıraathanesi Merkez Şube", "05550000005", 4200, 3000), mus("m6", "Yıldız Çay Evi", "05550000006", 0, 0),
    mus("m7", "Köy Yardımlaşma ve Dayanışma Derneği Lokali Yeni Mahalle Şubesi", "", 12650, 10000), mus("m8", "Bilardo Salonu", "05550000008", 880, 0));
  const simdi = new Date();
  const gunSaat = (gunOnce, saat) => { const d = new Date(simdi); d.setDate(d.getDate() - gunOnce); d.setHours(saat, 15, 0, 0); return d.toISOString(); };
  const gunStr = (iso) => { const d = new Date(iso); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  let n = 5;
  const satis = (musteriId, kalemler, odeme, tarih, carpan = 1) => { n++; const items = kalemler.map(([id, adet]) => { const p = st.products.find((x) => x.id === id); return { urunId: id, ad: p.ad, barkod: "", kdv: 1, fiyat: p.satis * carpan, adet, iskyuzde: 0, alis: p.alis * carpan }; }); const toplam = items.reduce((a, i) => a + i.fiyat * i.adet, 0); st.sales.push({ id: "s" + n, belgeNo: simdi.getFullYear() + "-" + String(n).padStart(6, "0"), musteriId, personelId: null, not: "", odemeAdi: null, items, brut: toplam, iskonto: 0, toplam, maliyet: items.reduce((a, i) => a + i.alis * i.adet, 0), komisyon: 0, odeme: { nakit: 0, pos: 0, acik: 0, ...odeme(toplam) }, tarih, servisGun: gunStr(tarih), hafta: "", stokKaynak: "arac" }); };
  if (sec.vadesiz) { st.sales = []; st.payments = []; st.customers.forEach((c) => { c.acilis = 0; }); }
  if (!sec.satissiz) {
    const c = sec.buyuk ? 137 : 1;
    satis("m5", [["u1", 10], ["u3", 2], ["u11", 3]], (t) => ({ nakit: 1500 * c, acik: t - 1500 * c }), gunSaat(0, 9), c);
    satis("m6", [["u2", 5], ["u12", 1]], (t) => ({ nakit: t }), gunSaat(0, 10), c);
    satis("m7", [["u4", 2], ["u5", 20], ["u13", 2]], (t) => ({ acik: t }), gunSaat(0, 11), c);
    satis("m8", [["u1", 6]], (t) => ({ pos: t }), gunSaat(0, 13), c);
    satis(null, [["u1", 8], ["u2", 1]], (t) => ({ nakit: t - 0.5, acik: 0 }), gunSaat(0, 14), c);
    st.sales[st.sales.length - 1].toplam -= 0.5; st.sales[st.sales.length - 1].iskonto = 0.5;   // kuruşlu tutar
    st.payments.push({ id: "t9", musteriId: "m5", tutar: 1000, not: "", odemeTuru: "nakit", tarih: gunSaat(0, 9) });
    st.expenses.push({ id: "g9", tutar: 900, not: "mazot", kategori: "Yakıt", tur: "Yakıt", odeme: "Nakit", tarih: gunSaat(0, 8) });
  }
  if (!sec.dunsuz) satis("m6", [["u1", 20], ["u2", 30]], (t) => ({ nakit: t }), gunSaat(1, 12));
  st.counters.sale = n;
  if (!sec.siparissiz) st.gelenSiparisler.push({ id: "gs1", orderId: "ord-1", dealer: "Yıldız Çay Evi", dealerTel: "05550000006", not: "", tarih: gunSaat(0, 8), alindi: gunSaat(0, 8), durum: "yeni", items: [{ urunId: "u1", ad: "Örnek Bardak Su 200 ml", birim: "Koli", adet: 5, fiyat: 100 }], brut: 500, iskonto: 0, toplam: 500, odemeTuru: "bakiye", pesinNakit: 0, pesinKart: 0, bakiyeTutar: 500, minPesinOran: 0, minPesinTutar: 0, teklifNo: "", fisNo: "", teslimTarih: "", teslimSaat: "", saleId: "" });
  return st;
}

export async function ac(st, sec = {}) {
  const bulut = await sahteBulut({ satirlar: ornekSatirlar(st) });
  const p = await panelAc({ bulutUrl: bulut.url, genislik: sec.genislik || GENIS, diyalog: (d) => d.dismiss().catch(() => {}) });
  await p.page.waitForFunction((k) => store.customers.length === k, st.customers.length, { timeout: 15000 });
  const git = async (yol) => { await p.page.evaluate((y) => { document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()); document.body.classList.remove("nav-open"); if (location.hash === "#/" + y) render(); else location.hash = "#/" + y; }, yol); await bekle(350); await p.page.evaluate(() => window.scrollTo(0, 0)); };
  const cek = async (ad, tam) => { if (SUZ && !ad.includes(SUZ)) return; await bekle(300); await p.page.screenshot({ path: path.join(CIKTI, ad + EK + ".png"), fullPage: !!tam }); console.log("  " + ad + EK); };
  return { ...p, bulut, git, cek, kapat: async () => { await p.kapat(); await bulut.dur(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hatalar = [];
  // 1) dolu gün
  {
    const t = await ac(genelStore()); const { page, git, cek } = t;
    try {
      await git("anasayfa"); await cek("a1-anasayfa"); await cek("a1-anasayfa-tam", true);
      await page.click(".gg-ayrinti-btn"); await cek("a2-anasayfa-ayrinti-acik", true);
      await page.click(".gg-ayrinti-btn");
      await git("rapor-gunluk"); await cek("b1-gunluk-rapor"); await cek("b1-gunluk-rapor-tam", true);
      await page.click(".gg-ayrinti-btn"); await cek("b2-gunluk-rapor-ayrinti", true); await page.click(".gg-ayrinti-btn");
      await git("anasayfa"); await page.click("#hamburger"); await cek("c1-menu");
      for (const [i, ad] of [[2, "rota"], [5, "urunler"], [6, "raporlar"], [7, "diger"]]) { await page.click(`.menu-item[data-idx="${i}"] > a.parent`); await cek("c2-menu-" + ad, ad === "diger"); }
      await page.evaluate(() => document.getElementById("navScrim").click());
      await git("anasayfa"); await page.click("#userBtn"); await cek("d1-kullanici-menusu"); await page.click("#userBtn");
      await page.click("#bellBtn"); await cek("d2-zil"); await page.click("#bellBtn");
      for (const yol of ["rota", "satis", "dukkan", "rapor-gunluk"]) { await git(yol); await cek("e-altmenu-" + yol); }
      await git("anasayfa");
      await page.evaluate(() => { selectedCustomerId = "m5"; }); await git("musteri-detay"); await cek("f1-altsayfa-geri-var");
      await git("musteriler"); await cek("f2-kok-geri-yok");
      for (const yol of ["dukkan", "rota", "harita", "giderler", "gelirler", "alis-faturalari", "alis-olustur", "stok-sayimi", "fiyat-bakim", "toplu-zam", "alinacaklar", "cay-ocagi", "profilim", "arac-yukleme", "duyurular", "servis-raporlari", "urun-iade", "talepler", "firmalar", "urun-ekle", "servisciler", "musteri-analiz", "rapor-urunsel"]) { await git(yol); await cek("g-" + yol, true); }
      await page.evaluate(() => { const s = store.sales.find((x) => x.musteriId === "m5"); openSale(s.id); }); await bekle(300); await cek("g-satis-detay", true);
      await git("anasayfa"); await page.evaluate(() => { const b = document.querySelector("[data-saleview]"); b.click(); }); await cek("h1-irsaliye-penceresi");
      await git("giderler"); await page.evaluate(() => giderEkleModal()); await cek("h2-gider-penceresi");
      await git("cay-ocagi"); await page.evaluate(() => cayOrderModal(store.gelenSiparisler[0])); await cek("h3-siparis-penceresi");
      await git("anasayfa"); await page.evaluate(() => openOdemeAl("m5")); await cek("h4-odeme-al");
      await git("anasayfa"); await page.evaluate(() => fisGonderModal(store.sales.find((x) => x.musteriId === "m5"))); await cek("h5-fis-gonder");
      // çevrimdışı şeridi
      await git("anasayfa"); await page.evaluate(() => { _esDurum.cevrimdisi = true; _esDurum.hata = ""; esSeritCiz(); }); await cek("i1-cevrimdisi-seridi");
      await page.evaluate(() => { _esDurum.cevrimdisi = false; _esDurum.hata = "Buluta yazılamadı"; _esDurum.hataSayisi = 5; esSeritCiz(); }); await cek("i2-hata-seridi");
      if (t.hatalar.length) hatalar.push(...t.hatalar);
    } finally { await t.kapat(); }
  }
  // 2) satışsız gün (dün satış var), sipariş yok
  { const t = await ac(genelStore({ satissiz: true, siparissiz: true })); try { await t.git("anasayfa"); await t.cek("a3-anasayfa-satissiz", true); await t.git("rapor-gunluk"); await t.cek("b3-gunluk-rapor-bos", true); hatalar.push(...t.hatalar); } finally { await t.kapat(); } }
  // 3) vadesi geçen yok, dün satış yok
  { const t = await ac(genelStore({ vadesiz: true, dunsuz: true, siparissiz: true })); try { await t.git("anasayfa"); await t.cek("a4-anasayfa-vadesiz", true); hatalar.push(...t.hatalar); } finally { await t.kapat(); } }
  // 4) büyük rakamlar (milyon)
  { const t = await ac(genelStore({ buyuk: true })); try { await t.git("anasayfa"); await t.page.click(".gg-ayrinti-btn"); await t.cek("a5-anasayfa-buyuk-rakam", true); await t.git("rapor-gunluk"); await t.page.click(".gg-ayrinti-btn"); await t.cek("b4-gunluk-rapor-buyuk-rakam", true); hatalar.push(...t.hatalar); } finally { await t.kapat(); } }
  console.log("betik hatası:", JSON.stringify(hatalar));
  process.exit(0);
}
