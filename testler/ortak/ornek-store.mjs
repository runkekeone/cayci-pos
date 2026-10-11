// Uydurma örnek veri — gerçek müşteri bilgisi İÇERMEZ (depo herkese açık).
// Panelin store biçimiyle aynı: denemeler bununla başlar.
const gun = (n, saat = 11) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(saat, 0, 0, 0); return d.toISOString(); };
const gunStr = (iso) => { const d = new Date(iso); const p = (x) => String(x).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };

export function ornekStore() {
  const products = [
    { id: "u1", ad: "Örnek Bardak Su 200 ml", grup: "Su", birim: "Koli", satis: 100, alis: 70, stok: 40, aracStok: 20, kritik: 5, kdv: 1, barkod: "", gorunur: true },
    { id: "u2", ad: "Örnek Pet Su 500 ml", grup: "Su", birim: "Koli", satis: 170, alis: 120, stok: 30, aracStok: 10, kritik: "", kdv: 1, barkod: "", gorunur: true },
    { id: "u3", ad: "Örnek Kola 250 ml", grup: "Gazlı İçecek", birim: "Koli", satis: 640, alis: 500, stok: 12, aracStok: 6, kritik: "", kdv: 10, barkod: "", gorunur: true },
    { id: "u4", ad: "Örnek Çay 5 kg", grup: "Çaylar", birim: "Adet", satis: 2000, alis: 1750, stok: 8, aracStok: 2, kritik: "", kdv: 1, barkod: "", gorunur: true },
    { id: "u5", ad: "Örnek Küp Şeker", grup: "Şeker & Gıda", birim: "Adet", satis: 60, alis: 52.5, stok: 50, aracStok: 15, kritik: "", kdv: 1, barkod: "", gorunur: true },
    { id: "u6", ad: "Örnek Soda", grup: "Sodalar", birim: "Koli", satis: 240, alis: 180, stok: 0, aracStok: 0, kritik: "", kdv: 10, barkod: "", gorunur: true },
  ];
  const customers = [
    { id: "m1", ad: "Deneme Kıraathanesi", telefon: "05550000001", acilis: 0, limit: 0, vade: "", ozelFiyatlar: { u1: 90 } },
    { id: "m2", ad: "Örnek Çay Ocağı", telefon: "05550000002", acilis: 500, limit: 3000, vade: 15, ozelFiyatlar: {} },
    { id: "m3", ad: "Sınama Derneği", telefon: "", acilis: 0, limit: 0, vade: "", ozelFiyatlar: { u3: 620, u5: 55 } },
    { id: "m4", ad: "Yeni Müşteri", telefon: "05550000004", acilis: 0, limit: 0, vade: "", ozelFiyatlar: {} },
  ];
  const satis = (n, belge, musteriId, kalemler, odeme, gunOnce) => {
    const items = kalemler.map(([urunId, adet, fiyat]) => { const p = products.find((x) => x.id === urunId); return { urunId, ad: p.ad, barkod: "", kdv: p.kdv, fiyat: fiyat == null ? p.satis : fiyat, adet, iskyuzde: 0 }; });
    const toplam = items.reduce((a, i) => a + i.fiyat * i.adet, 0);
    const maliyet = items.reduce((a, i) => a + products.find((x) => x.id === i.urunId).alis * i.adet, 0);
    const o = { nakit: 0, pos: 0, acik: 0, ...odeme };
    const tarih = gun(gunOnce);
    return { id: "s" + n, belgeNo: new Date().getFullYear() + "-" + String(n).padStart(6, "0"), musteriId, personelId: null, not: "", odemeAdi: null, items, brut: toplam, iskonto: 0, toplam, maliyet, komisyon: 0, odeme: o, tarih, servisGun: gunStr(tarih), hafta: "", stokKaynak: "arac" };
  };
  const sales = [
    satis(1, 1, "m1", [["u1", 10, 90], ["u3", 1]], { nakit: 1540 }, 40),
    satis(2, 2, "m2", [["u4", 1], ["u5", 10]], { acik: 2600 }, 35),
    satis(3, 3, "m3", [["u3", 2, 620]], { nakit: 600, acik: 640 }, 20),
    satis(4, 4, "m2", [["u1", 5]], { pos: 500 }, 3),
    satis(5, 5, null, [["u2", 2]], { nakit: 340 }, 1),
  ];
  const payments = [
    { id: "t1", musteriId: "m2", tutar: 1000, not: "Saha tahsilat (nakit)", tarih: gun(30) },
    { id: "t2", musteriId: "m3", tutar: 200, not: "Saha tahsilat (pos)", tarih: gun(10) },
  ];
  return {
    products, customers, sales, payments, tsiparisler: [],
    groups: [], firmalar: [], purchases: [], firmaPayments: [],
    expenses: [{ id: "g1", tutar: 250, not: "öğle yemeği", kategori: "Yemek", tarih: gun(3) }], incomes: [], personeller: [], gorevler: [],
    odemeTipleri: [], stokSayimlari: [], efaturalar: [], iadeler: [],
    stokHareket: [], altUrunler: [], varyantlar: [], gelenSiparisler: [],
    duyurular: [], gorusmeler: [], rotalar: [], talepler: [], ziyaretler: [], aracHareket: [], servisRaporlari: [], dukkanNotlari: [],
    settings: { firmaAdi: "DENEME TİCARET", firmaNo: "U000000000", eposta: "", ad: "", soyad: "", ilce: "", fisBaslik: "", fisAdres: "", fisTel: "", fisAltbilgi: "Teşekkür ederiz" },
    counters: { sale: 5, purchase: 0, sayim: 0, efatura: 0, seq: 100, tsiparis: 0 },
  };
}

/** Sahte bulutun başlangıç satırları. */
export function ornekSatirlar(store = ornekStore(), zaman = new Date(Date.now() - 3600_000).toISOString()) {
  return [{ key: "babuco:store", value: store, updated_at: zaman }];
}

/** Beklenen borç (panelin customerBorc formülü) — denemelerde karşılaştırma için. */
export function borc(store, id) {
  const c = store.customers.find((x) => x.id === id); if (!c) return 0;
  let b = Number(c.acilis) || 0;
  store.sales.forEach((s) => { if (s.musteriId === id) b += Number(s.odeme.acik) || 0; });
  store.payments.forEach((p) => { if (p.musteriId === id) b -= Number(p.tutar) || 0; });
  return Math.round(b * 100) / 100;
}
