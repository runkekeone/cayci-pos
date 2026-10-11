// Senaryo 9: uç durumlar.
//   a) eski panel sürümünden ilk geçiş (telefonda taban yok): bulut alınır; eski sürümün gönderemediği kayıt varsa eklenir, hiçbir şey ezilmez
//   b) "Tüm verileri sil" (store baştan kurulur) → bulut boşalır, diğer telefon da boşalır, diğer cihazların sayaçları korunur
//   c) telefonun hafızası (localStorage) doldu → satış yine buluta gider, kullanıcı uyarılır
//   d) önbellekte kalmış ESKİ panel sürümü körlemesine üstüne yazdı → yeni panel fark edip uyarır
//   e) telefondaki günlük silindi / kimlik karıştı → yeni kayıtlar "zaten işlenmiş" sanılıp atılmaz
//   f) gerçek boyutta veri (≈400 KB): kaydetme ve eşitleme süresi
// Çalıştır: node testler/senkron/9-uc-durumlar.mjs
import { statikSunucu, PANEL_DIZIN } from "../ortak/panel.mjs";
import { senkronBulut, panel, yenidenAc, satis, hazir, esitlendi, yokla, kosul, denetci, bekle, ornekStore, ornekSatirlar, borc, bul, ayni, jsonbSira, STORE } from "./yardimci.mjs";

const d = denetci("9-uc-durumlar");
const ilk = ornekStore();
const klon = (x) => JSON.parse(JSON.stringify(x));
const sunucu = await statikSunucu(PANEL_DIZIN);
// Eski panelin telefonda bıraktığı hâl: yalnız iki anahtar — çalışan store ve "son yazdığım/aldığım zaman".
const eskiTelefon = (store, ts) => ({ cookies: [], origins: [{ origin: sunucu.url, localStorage: [{ name: "benimpos-app-v1", value: JSON.stringify(store) }, { name: "babuco:store:ts", value: ts }] }] });

console.log("— a) eski sürümden geçiş");
{
  const zaman = new Date(Date.now() - 3600_000).toISOString();
  // a1: telefondaki kopya eski (3 satış), bulut daha yeni → bulut alınır, yazma yok
  let bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk, zaman) });
  let p = await panel(bulut, { panelUrl: sunucu.url, storageState: eskiTelefon({ ...klon(ilk), sales: ilk.sales.slice(0, 3) }, new Date(Date.now() - 7200_000).toISOString()) });
  try {
    await hazir(p.page);
    d.esit([await p.page.evaluate(() => store.sales.length), bulut.storeYazmalari().length], [5, 0], "a1: telefondaki eski kopya yerine bulut alındı, buluta bir şey yazılmadı");
    const ps = await satis(p.page, "u1", "nakit", null, 1); await esitlendi(p.page);
    d.dogru(!!bul(bulut.store().sales, ps.id) && bulut.storeYazmalari().every((y) => y.yontem === "PATCH" && y.kosullu), "a1: geçişten sonraki ilk satış koşullu yazıldı");
  } finally { await p.kapat(); await bulut.dur(); }

  // a2: eski sürüm bir satışı gönderememiş (telefon "benimki daha yeni" diyor), bulut o zamandan beri değişmemiş
  bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk, zaman) });
  const yerel = klon(ilk);
  yerel.counters.sale = 6;
  yerel.sales.push({ id: "eskiSurumSatisi", belgeNo: new Date().getFullYear() + "-000006", musteriId: "m4", items: [{ urunId: "u5", ad: "Örnek Küp Şeker", adet: 3, fiyat: 60, kdv: 1, iskyuzde: 0 }], brut: 180, iskonto: 0, toplam: 180, maliyet: 157.5, komisyon: 0, odeme: { nakit: 0, pos: 0, acik: 180 }, tarih: new Date().toISOString(), stokKaynak: "dukkan" });
  yerel.products.find((x) => x.id === "u5").stok -= 3;
  yerel.customers = yerel.customers.filter((c) => c.id !== "m3");        // telefonda m3 yok (taban bilinmediği için "silindi" SAYILMAMALI)
  p = await panel(bulut, { panelUrl: sunucu.url, storageState: eskiTelefon(yerel, new Date(Date.now() - 60_000).toISOString()) });
  try {
    await hazir(p.page); await esitlendi(p.page);
    const s = bulut.store();
    d.dogru(!!bul(s.sales, "eskiSurumSatisi"), "a2: eski sürümün gönderemediği satış buluta eklendi");
    d.esit(borc(s, "m4"), 180, "a2: m4 borcu 180 ₺ oldu");
    d.dogru(!!bul(s.customers, "m3") && s.sales.length === 6 && s.payments.length === 2, "a2: bulutta olup telefonda olmayan hiçbir kayıt silinmedi");
    d.esit(bul(s.products, "u5").stok, bul(ilk.products, "u5").stok, "a2 (BİLİNEN EKSİK): o satışın stok düşümü kurtarılamıyor — taban olmadan stok farkı hesaplanamaz");
    d.dogru(bulut.storeYazmalari().every((y) => y.yontem === "PATCH" && y.kosullu), "a2: yazma koşullu");
  } finally { await p.kapat(); await bulut.dur(); }
}

console.log("— b) tüm verileri sil");
{
  const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
  const A = await panel(bulut), B = await panel(bulut, { browser: A.browser });
  try {
    await hazir(A.page); await hazir(B.page);
    await satis(B.page, "u1", "nakit", null, 1); await esitlendi(B.page);       // B'nin yama sayacı bulutta: esitleme[B] = 1
    const bKimlik = await B.page.evaluate(() => _esCihaz);
    await yokla(A.page); await esitlendi(A.page);
    // Profil → "Tüm Verileri Sil" düğmesinin yaptığı (app.js, mountProfilim):
    await A.page.evaluate(() => { localStorage.removeItem(STORE_KEY); store = emptyStore(); saveStore(); });
    await esitlendi(A.page);
    const s = bulut.store();
    d.esit([s.sales.length, s.customers.length, s.payments.length, s.products.length], [0, 0, 0, 0], "bulut boşaldı");
    d.esit((s.esitleme || {})[bKimlik], 1, "diğer telefonun yama sayacı silinmedi");
    await yokla(B.page); await esitlendi(B.page);
    d.esit(await B.page.evaluate(() => [store.sales.length, store.customers.length]), [0, 0], "diğer telefon da boş hâli aldı");
    d.dogru(!(await B.page.evaluate(() => !!_esGunluk.ezilme)), "…ve bunu \"eski sürüm ezdi\" diye yanlış yorumlamadı");
    d.esit(A.hatalar.concat(B.hatalar), [], "sayfalarda betik hatası yok");
  } catch (e) { d.dogru(false, "b yarıda kesildi: " + e.message); }
  finally { await B.kapat(); await A.kapat(); await bulut.dur(); }
}

console.log("— c) telefonun hafızası doldu");
{
  const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
  const p = await panel(bulut);
  try {
    await hazir(p.page);
    await p.page.evaluate(() => {
      const asil = Storage.prototype.setItem;
      window.__dolu = true;
      Storage.prototype.setItem = function (k, v) { if (window.__dolu && (k === "benimpos-app-v1" || k === "babuco:store:gunluk")) throw new DOMException("kota doldu", "QuotaExceededError"); return asil.call(this, k, v); };
    });
    const ps = await satis(p.page, "u2", "acik", "m1", 1).catch((e) => ({ hata: String(e) }));
    d.dogru(!ps.hata, "hafıza doluyken satış ekranı hata vermeden tamamlandı" + (ps.hata ? " → " + ps.hata.slice(0, 120) : ""));
    await kosul(() => !!ps.id && !!bul(bulut.store().sales, ps.id), 10000, "satışın buluta gitmesi").then(() => d.dogru(true, "satış telefona yazılamasa da buluta gitti"), () => d.dogru(false, "satış telefona yazılamasa da buluta gitti"));
    const serit = await p.page.evaluate(() => { const e = document.getElementById("es-serit"); return e ? e.textContent : ""; });
    d.dogru(/hafızası doldu/.test(serit), "kullanıcı uyarıldı: \"" + serit.replace(/\s+/g, " ").trim().slice(0, 90) + "…\"");
    await p.page.evaluate(() => { window.__dolu = false; });
    await satis(p.page, "u2", "nakit", null, 1); await esitlendi(p.page);
    d.dogru(await p.page.evaluate(() => !document.getElementById("es-serit") && JSON.parse(localStorage.getItem("benimpos-app-v1")).sales.length === 7), "yer açılınca uyarı kalktı, telefondaki kopya güncel");
    d.esit(p.hatalar, [], "sayfada betik hatası yok");
  } catch (e) { d.dogru(false, "c yarıda kesildi: " + e.message); }
  finally { await p.kapat(); await bulut.dur(); }
}

console.log("— d) eski panel sürümü körlemesine üstüne yazdı");
{
  const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
  const p = await panel(bulut);
  try {
    await hazir(p.page);
    const ps = await satis(p.page, "u1", "nakit", null, 1); await esitlendi(p.page);
    d.dogru(!!bul(bulut.store().sales, ps.id), "yeni panel satışını gönderdi, onay aldı");
    // önbellekte kalmış eski sürüm: kendi (eski) kopyasını upsert eder — bunu engelleyemeyiz
    const satir = bulut.satir(STORE);
    satir.value = jsonbSira(klon(ilk)); satir.updated_at = new Date(Date.now() + 2000).toISOString().replace("Z", "+00:00");
    await yokla(p.page); await bekle(600); await esitlendi(p.page);
    d.dogru(!bul(bulut.store().sales, ps.id), "(beklenen kayıp) eski sürümün ezdiği satış bulutta yok — yeni panel bunu geri GETİREMEZ");
    const bildirim = await p.page.evaluate(() => [...document.querySelectorAll(".es-bildirim")].map((x) => x.textContent).join(" | "));
    d.dogru(/eski bir uygulama sürümüyle ezilmiş/.test(bildirim), "ama fark edip kullanıcıyı uyardı: \"" + bildirim.slice(0, 80) + "…\"");
    await p.page.evaluate(() => { location.hash = "#/profilim"; });
    await p.page.waitForSelector('li[data-ptab="2"]'); await p.page.click('li[data-ptab="2"]');
    await p.page.waitForSelector("#yedekDurum");
    d.dogru(/ezildi/.test(await p.page.evaluate(() => document.getElementById("yedekDurum").textContent)), "Yedekleme ekranında da yazıyor (geri dönülebilecek yedekler orada)");
  } catch (e) { d.dogru(false, "d yarıda kesildi: " + e.message); }
  finally { await p.kapat(); await bulut.dur(); }
}

console.log("— e) telefondaki günlük kayboldu");
{
  const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
  const p = await panel(bulut);
  try {
    await hazir(p.page);
    await satis(p.page, "u1", "nakit", null, 1); await esitlendi(p.page);
    await satis(p.page, "u1", "nakit", null, 1); await esitlendi(p.page);       // esitleme[cihaz] = 2
    await p.page.evaluate(() => localStorage.removeItem("babuco:store:gunluk"));  // günlük gitti, kimlik duruyor
    await p.page.close();
    const y = await yenidenAc(p);
    const ps = await satis(y.page, "u3", "acik", "m2", 1);                        // yeni günlükte 1 numaralı yama
    await hazir(y.page); await esitlendi(y.page);
    const s = bulut.store();
    d.dogru(!!bul(s.sales, ps.id), "günlük sıfırlandıktan sonraki satış atılmadı, buluta gitti");
    d.esit([s.sales.length, bul(s.products, "u3").stok, borc(s, "m2")], [8, bul(ilk.products, "u3").stok - 1, borc(ilk, "m2") + 640], "satış sayısı, stok ve borç doğru");
  } catch (e) { d.dogru(false, "e yarıda kesildi: " + e.message); }
  finally { await p.kapat(); await bulut.dur(); }
}

console.log("— f) gerçek boyutta veri");
{
  const buyuk = klon(ilk);
  for (let i = 0; i < 260; i++) buyuk.products.push({ id: "bu" + i, ad: "Büyük Ürün " + i + " 250 ml Cam Şişe", grup: "Su", altKategori: "Deneme", birim: "Koli", satis: 100 + i, alis: 70 + i, stok: 50, aracStok: 10, kritik: "", kdv: 1, barkod: "869000000" + i, gorunur: true });
  for (let i = 0; i < 140; i++) buyuk.customers.push({ id: "bm" + i, ad: "Büyük Müşteri " + i, telefon: "0555100" + String(i).padStart(4, "0"), acilis: 0, limit: 0, vade: "", ozelFiyatlar: { bu1: 95, bu2: 96, bu3: 97 } });
  for (let i = 0; i < 1100; i++) buyuk.sales.push({ id: "bs" + i, belgeNo: "2026-" + String(1000 + i), musteriId: "bm" + (i % 140), personelId: null, not: "", odemeAdi: null, items: [0, 1, 2].map((k) => ({ urunId: "bu" + ((i + k) % 260), ad: "Büyük Ürün " + ((i + k) % 260) + " 250 ml Cam Şişe", barkod: "", kdv: 1, fiyat: 100, adet: 2, iskyuzde: 0 })), brut: 600, iskonto: 0, toplam: 600, maliyet: 420, komisyon: 0, odeme: { nakit: 0, pos: 0, acik: 600 }, tarih: new Date(Date.now() - i * 3600_000).toISOString(), servisGun: "2026-09-01", hafta: "2026-H36", stokKaynak: "arac" });
  for (let i = 0; i < 900; i++) buyuk.payments.push({ id: "bt" + i, musteriId: "bm" + (i % 140), tutar: 500, not: "Saha tahsilat (nakit)", tarih: new Date(Date.now() - i * 5400_000).toISOString() });
  buyuk.counters.sale = 2100;
  const boyut = JSON.stringify(buyuk).length;
  const bulut = await senkronBulut({ satirlar: ornekSatirlar(buyuk) });
  const p = await panel(bulut);
  try {
    await hazir(p.page, 30000);
    const olcum = await p.page.evaluate(() => {
      const sureler = [];
      for (let i = 0; i < 5; i++) { findProduct("bu" + i).stok -= 1; const t = performance.now(); yerelKaydet(); sureler.push(performance.now() - t); }
      return { enUzun: Math.max(...sureler), ort: sureler.reduce((a, b) => a + b, 0) / sureler.length, gunluk: (localStorage.getItem("babuco:store:gunluk") || "").length };
    });
    const t0 = Date.now();
    const ps = await satis(p.page, "bu7", "acik", "bm3", 2); await esitlendi(p.page, 30000);
    const esitlemeMs = Date.now() - t0;
    console.log("      store " + Math.round(boyut / 1024) + " KB · yerel kaydetme ort. " + olcum.ort.toFixed(1) + " ms (en uzun " + olcum.enUzun.toFixed(1) + " ms) · günlük " + olcum.gunluk + " bayt · satış + eşitleme " + esitlemeMs + " ms (1 sn bekleme dahil)");
    d.dogru(boyut > 380_000, "deneme verisi gerçek boyutta (" + Math.round(boyut / 1024) + " KB)");
    d.dogru(olcum.enUzun < 400, "her kayıtta yerel kaydetme (fark çıkarma dahil) 400 ms'nin altında");
    d.dogru(olcum.gunluk < 20_000, "bekleyen değişiklik günlüğü küçük (telefonda ikinci bir tam kopya tutulmuyor)");
    d.dogru(!!bul(bulut.store().sales, ps.id) && bul(bulut.store().products, "bu7").stok === 48, "büyük veride satış doğru eşitlendi");
    d.esit(p.hatalar, [], "sayfada betik hatası yok");
  } catch (e) { d.dogru(false, "f yarıda kesildi: " + e.message); }
  finally { await p.kapat(); await bulut.dur(); }
}
await sunucu.dur();
d.bitir();
