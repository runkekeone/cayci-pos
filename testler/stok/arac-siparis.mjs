// ARAÇ — gelen sipariş: bekleyen uyarısı (satis fişini bozmadan), siparisler ayrıntısı,
// araçtan onay / dağıtım / teslim (satışlı) / kapatma (satışsız) ve durumun `siparisler` tablosuna yazılması.
// Çalıştır: node testler/stok/arac-siparis.mjs
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { denetci } from "../ortak/panel.mjs";
import { borc } from "../ortak/ornek-store.mjs";
import { arac, tabanArac, stokStore, satirlar, siparisSatiri, kopya, gun } from "./yardimci.mjs";

const d = denetci("arac-siparis");
const SIP = () => [siparisSatiri("ord-aaa11", { gunOnce: 3 }), siparisSatiri("ord-bbb22", { ad: "Yepyeni Ocak", tel: "05551112233", gunOnce: 0, odeme: "nakit" })];
const yeniBulut = (store = stokStore(), siparisler = SIP(), ek = {}) => sahteBulut({ satirlar: satirlar(store), siparisler, ...ek });
const S = (b) => b.deger("babuco:store");
const tablo = (b, id) => b.tablolar.siparisler.get(id);
const urun = (b, id) => S(b).products.find((p) => p.id === id);
const SATIS = JSON.stringify({ musteri: "Deneme Kıraathanesi", kalemler: [{ urun: "Örnek Bardak Su", adet: 3 }, { urun: "Örnek Kola", adet: 1, fiyat: 650 }], odeme: { nakit: 500 }, stokKaynak: "arac", tarih: "2026-10-10T09:30:00" });

/* ---------- 1) Uyarı: satis fişinin stdout'u bozulmaz, uyarı stderr'e ve en sona düşer ---------- */
{
  const b = await yeniBulut(), once = kopya(S(b));
  const yeni = await arac(b.url, ["satis", SATIS]);
  d.dogru(yeni.kod === 0 && /^### 🧾 FİŞ — Deneme Kıraathanesi/.test(yeni.stdout), "satis provası fişi basıyor");
  d.dogru(!/SIPARIS|sipariş/i.test(yeni.stdout), "satis stdout'unda sipariş uyarısı YOK (fiş kullanıcıya aynen gösteriliyor)");
  d.dogru(/BEKLEYEN SIPARIS: 2 cay ocagi siparisi/.test(yeni.stderr) && /en eskisi 3 gün önce: Örnek Çay Ocağı/.test(yeni.stderr), "uyarı stderr'e düşüyor: kaç sipariş, en eskisi kim / ne zaman");
  const taban = tabanArac();
  if (taban) {
    const eski = await arac(b.url, ["satis", SATIS], { arac: taban });
    // Birleştirmeden sonra fişte para bölümünün "Stok eksiye düşüyor" notu da çıkar; o satır dışında aynı olmalı.
    const stokNotsuz = yeni.stdout.split("\n").filter((s) => !/^ℹ \*\*Stok eksiye düşüyor\*\*/.test(s)).join("\n");
    d.esit(stokNotsuz, eski.stdout, "satis stdout'u taban sürümle (stok notu dışında) HARFİ HARFİNE aynı");
    d.esit(eski.stderr, "", "taban (YOKTU): bekleyen sipariş için hiçbir uyarı yoktu");
    const eskiListe = await arac(b.url, ["siparisler"], { arac: taban });
    d.dogru(/Gelen siparis yok/.test(eskiListe.stdout), "taban (YANLIŞ): panel açılmadıysa tablodaki siparişleri hiç görmüyordu");
  }
  d.esit(S(b), once, "prova + uyarı hiçbir şey yazmadı");
  const kayit = await arac(b.url, ["satis", SATIS, "--kaydet"]);
  d.dogru(kayit.kod === 0 && /\*\*KAYDEDİLDİ\*\* — Belge 2026-000006/.test(kayit.stdout) && !/BEKLEYEN/.test(kayit.stdout) && /BEKLEYEN SIPARIS/.test(kayit.stderr), "--kaydet'te de fiş temiz, uyarı ayrı kanalda");
  const kapali = await arac(b.url, ["durum"], { env: { BABUCO_SIPARIS_UYARI: "0" } });
  d.esit(kapali.stderr, "", "BABUCO_SIPARIS_UYARI=0 uyarıyı kapatıyor");
  await b.dur();

  const bos = await yeniBulut(stokStore(), []);
  d.esit((await arac(bos.url, ["durum"])).stderr, "", "bekleyen sipariş yoksa uyarı da yok");
  await bos.dur();

  // Sipariş tablosu okunamıyorsa komutlar yine çalışır, gürültü çıkmaz.
  const bozuk = await yeniBulut(stokStore(), SIP(), { once: (req, res, c) => { if (c.url.pathname.endsWith("/siparisler")) { c.yanit(500, { message: "tablo yok" }); return true; } return false; } });
  const rb = await arac(bozuk.url, ["satis", SATIS]);
  d.dogru(rb.kod === 0 && rb.stderr === "" && rb.stdout === yeni.stdout, "sipariş tablosu okunamazsa satis aynen çalışıyor, hata basmıyor");
  const lb = await arac(bozuk.url, ["siparisler"]);
  d.dogru(lb.kod === 0 && /siparis tablosu okunamadi/.test(lb.stdout), "siparisler tabloyu okuyamadığını söylüyor (çökmeden)");
  await bozuk.dur();
}

/* ---------- 2) siparisler: kalemler, yaş, durum; panele düşmemiş olanları da gösterir ---------- */
{
  const st = stokStore();
  st.gelenSiparisler.push({ id: "o9", orderId: "ord-ccc33", dealer: "Sınama Derneği", dealerTel: "", not: "", tarih: gun(9), alindi: gun(9), durum: "teslim", items: [{ urunId: "u1", ad: "Örnek Bardak Su 200 ml", birim: "Koli", adet: 1, fiyat: 100 }], toplam: 100, odemeTuru: "bakiye", saleId: "s3" });
  const b = await yeniBulut(st, SIP().concat([siparisSatiri("ord-ccc33", { ad: "Sınama Derneği", tel: "", durum: "teslim", gunOnce: 9 })]));
  const r = (await arac(b.url, ["siparisler"])).stdout;
  d.dogru(/# Çay ocağı siparişleri — 2 açık \(2 yeni, onay bekliyor\)/.test(r), "başlık kaç sipariş beklediğini söylüyor");
  d.dogru(/### \[AAA11\] Örnek Çay Ocağı · 05550000002 — YENİ · 3 gün önce ⚠/.test(r), "sipariş başlığı: kod, bayi, durum, yaş (1 günü geçen işaretli)");
  d.dogru(/\| 4 Koli \| Örnek Bardak Su 200 ml \| 100,00 ₺ \| 400,00 ₺ \|/.test(r) && /\| \| \| \*\*TOPLAM\*\* \| \*\*1\.040,00 ₺\*\* \|/.test(r), "kalemler adet / ürün / fiyat / tutar ile, toplamıyla");
  d.dogru(/\[BBB22\] Yepyeni Ocak[^\n]*6 saat önce|\[BBB22\] Yepyeni Ocak[^\n]*saat önce/.test(r) && /Nakit indirimi \| −52,00 ₺/.test(r), "nakit seçilmiş siparişte %5 indirim (panelle aynı hesap)");
  d.dogru(/panele henüz düşmemiş \(tablodan okundu\)/.test(r), "panel kapalıyken gelmiş sipariş de listeleniyor");
  d.dogru(/## Kapananlar \(1[^\n]*\n\n- [^\n]*Sınama Derneği \| 100,00 ₺ \| durum: teslim \(satisa islendi\)/.test(r), "kapananlar tek satır (eski biçim)");
  d.dogru(/`siparis-teslim <kod>/.test(r) && /`siparis-kapat <kod>`/.test(r), "nasıl işleneceği yazıyor");
  await b.dur();
}

/* ---------- 3) Onayla → dağıtım: store + tablo ---------- */
{
  const b = await yeniBulut(), once = kopya(S(b));
  const prova = await arac(b.url, ["siparis-onayla", "AAA11"]);
  d.dogru(/durum: YENİ -> ONAYLANDI/.test(prova.stdout) && /PROVA/.test(prova.stdout), "onay provası");
  d.esit([S(b), tablo(b, "ord-aaa11").durum], [once, "yeni"], "prova ne store'a ne tabloya yazdı");
  const r = await arac(b.url, ["siparis-onayla", "AAA11", "--kaydet"]);
  const o = S(b).gelenSiparisler.find((x) => x.orderId === "ord-aaa11");
  d.dogru(r.kod === 0 && o && o.durum === "onay" && /^TKF-/.test(o.teklifNo) && /^id/.test(o.id), "sipariş store'a alındı ve onaylandı (teklif no verildi)");
  d.esit(tablo(b, "ord-aaa11").durum, "onay", "durum `siparisler` tablosuna yazıldı (çay ocağı \"onaylandı\" görür)");
  d.esit(S(b).gelenSiparisler.length, 1, "yalnız işlenen sipariş store'a alındı");
  await arac(b.url, ["siparis-dagitim", "AAA11", "Cuma", "10:00", "--kaydet"]);
  const o2 = S(b).gelenSiparisler[0];
  d.esit([o2.durum, o2.teslimTarih, o2.teslimSaat, /^FIS-/.test(o2.fisNo), tablo(b, "ord-aaa11").durum], ["dagitim", "Cuma", "10:00", true, "dagitim"], "dağıtıma alındı: gün/saat/fiş no + tabloda \"dagitim\"");
  d.dogru(/1 cay ocagi siparisi onay bekliyor/.test((await arac(b.url, ["durum"])).stderr), "onaylanan sipariş artık \"bekleyen\" sayılmıyor (2 → 1)");
  await b.dur();
}

/* ---------- 4) Teslim: satış oluşur, stok ve bakiye işlenir, tablo \"teslim\" olur ---------- */
{
  const b = await yeniBulut(), once = kopya(S(b));
  const prova = await arac(b.url, ["siparis-teslim", "AAA11"]);
  d.dogru(/### 🧾 SİPARİŞ TESLİM — Örnek Çay Ocağı  \[AAA11\]/.test(prova.stdout) && /\| \*\*Bakiye\*\* \| 2\.100,00 → \*\*3\.140,00 ₺\*\* \|/.test(prova.stdout) && /KAYDEDİLMEDİ/.test(prova.stdout), "teslim provası fiş gibi: kalemler, ödeme, bakiye");
  d.esit([S(b), tablo(b, "ord-aaa11").durum], [once, "yeni"], "teslim provası hiçbir şey yazmadı");
  const r = await arac(b.url, ["siparis-teslim", "AAA11", "--kaydet"]);
  const st = S(b), sale = st.sales[st.sales.length - 1], o = st.gelenSiparisler[0];
  d.dogru(r.kod === 0 && st.sales.length === 6 && /Belge 2026-000006/.test(r.stdout), "teslim bir satış oluşturdu");
  d.esit({ musteri: sale.musteriId, toplam: sale.toplam, maliyet: sale.maliyet, odeme: sale.odeme, kaynak: sale.stokKaynak, not: sale.not },
    { musteri: "m2", toplam: 1040, maliyet: 780, odeme: { nakit: 0, pos: 0, acik: 1040 }, kaynak: "arac", not: "Çay Ocağı siparişi · Örnek Çay Ocağı" }, "satış bayinin müşteri kartına (telefonla eşleşti), açık hesaba yazıldı");
  d.esit(sale.items.map((i) => [i.urunId, i.adet, i.fiyat, i.alis]), [["u1", 4, 100, 70], ["u3", 1, 640, 500]], "kalemler ürünlere bağlı (\"b-u1\" katalog kimliği çözüldü) ve satış anındaki alışı taşıyor");
  d.esit([urun(b, "u1").aracStok, urun(b, "u3").aracStok, urun(b, "u1").stok], [16, -5, 40], "stok araçtan düştü");
  d.esit(borc(st, "m2"), 3140, "bakiye 2.100 → 3.140");
  d.esit([o.durum, o.saleId, tablo(b, "ord-aaa11").durum], ["teslim", sale.id, "teslim"], "sipariş satışa bağlandı, tabloda \"teslim\"");
  const tekrar = await arac(b.url, ["siparis-teslim", "AAA11", "--kaydet"]);
  d.dogru(tekrar.kod === 1 && /zaten teslim/.test(tekrar.stderr) && S(b).sales.length === 6, "aynı sipariş ikinci kez teslim edilemiyor (çift satış yok)");

  // nakit + dükkandan + listede olmayan bayi → yeni müşteri kartı
  const r2 = await arac(b.url, ["siparis-teslim", "BBB22", "--dukkan", "--kaydet"]);
  const st2 = S(b), s2 = st2.sales[st2.sales.length - 1], yeniM = st2.customers.find((c) => c.ad === "Yepyeni Ocak");
  d.dogru(r2.kod === 0 && /YENİ MÜŞTERİ kartı açılacak/.test(r2.stdout) && yeniM && yeniM.cayOcagi === true && yeniM.telefon === "05551112233", "tanınmayan bayi için müşteri kartı açıldı");
  d.esit({ odeme: s2.odeme, iskonto: s2.iskonto, toplam: s2.toplam, kaynak: s2.stokKaynak, musteri: s2.musteriId === yeniM.id }, { odeme: { nakit: 988, pos: 0, acik: 0 }, iskonto: 52, toplam: 988, kaynak: "dukkan", musteri: true }, "nakit sipariş: %5 indirimli tutar nakit, stok dükkandan");
  d.esit([urun(b, "u1").stok, urun(b, "u1").aracStok], [36, 16], "--dukkan: dükkan stoğu düştü, araç değişmedi");
  d.esit((await arac(b.url, ["durum"])).stderr, "", "hepsi teslim edilince uyarı kalmadı");
  await b.dur();
}

/* ---------- 5) Kapat: satış AÇMADAN \"halledildi\" (zaten elle satışa girilmiş eski siparişler) ---------- */
{
  const st = stokStore();
  // m2'ye siparişten sonra (dün) elle bir fiş kesilmiş → büyük olasılıkla sipariş o fişle teslim edildi
  st.sales.push({ ...kopya(st.sales[3]), id: "s9", belgeNo: "2026-000009", tarih: gun(1) });
  const b = await yeniBulut(st), once = kopya(S(b));
  const liste = (await arac(b.url, ["siparisler"])).stdout;
  d.dogru(/ℹ Bu müşteriye siparişten sonra fiş kesilmiş: 2026-000009[^\n]*`siparis-kapat AAA11`/.test(liste), "siparisler: siparişten sonra kesilmiş fişi gösterip kapatmayı öneriyor");
  const prova = await arac(b.url, ["siparis-kapat", "--eski=1"]);
  d.dogru(/Satış AÇILMADAN kapatılacak siparişler \(1\)/.test(prova.stdout) && /\[AAA11\]/.test(prova.stdout) && !/\[BBB22\]/.test(prova.stdout), "--eski=1 yalnız 1 günden eski bekleyeni seçiyor");
  d.esit([S(b), tablo(b, "ord-aaa11").durum], [once, "yeni"], "kapatma provası hiçbir şey yazmadı");
  const r = await arac(b.url, ["siparis-kapat", "AAA11", "--not=Salı servisinde teslim edildi", "--kaydet"]);
  const s2 = S(b), o = s2.gelenSiparisler[0];
  d.dogru(r.kod === 0 && /1 sipariş kapatıldı/.test(r.stdout), "sipariş kapatıldı");
  d.esit({ durum: o.durum, elle: o.elleKapandi, not: o.kapanisNot, saleId: o.saleId }, { durum: "teslim", elle: true, not: "Salı servisinde teslim edildi", saleId: "" }, "sipariş \"teslim\" + satışsız kapatıldı işaretli");
  d.esit([s2.sales.length, s2.products.map((p) => [p.stok, p.aracStok]), borc(s2, "m2")], [once.sales.length, once.products.map((p) => [p.stok, p.aracStok]), borc(once, "m2")], "satış AÇILMADI; stok ve bakiye değişmedi");
  d.esit(tablo(b, "ord-aaa11").durum, "teslim", "tabloda \"teslim\" (çay ocağı teslim edildi görür)");
  d.dogru(/satış açılmadan kapatıldı: Salı servisinde teslim edildi/.test((await arac(b.url, ["siparisler"])).stdout), "siparisler kapanış notunu gösteriyor");
  const uyari = await arac(b.url, ["siparis-kapat", "BBB22"]);
  d.dogru(/siparişten sonra bu müşteriye kesilmiş fiş YOK/.test(uyari.stdout), "fişi olmayan siparişi kapatırken \"gerçekten teslim edildi mi\" diye uyarıyor");
  await b.dur();
}

/* ---------- 6) Tabloya yazılamazsa: panel kaydı tamam, eşitleme komutu sonradan iletir ---------- */
{
  let engel = true;
  const b = await yeniBulut(stokStore(), SIP(), { once: (req, res, c) => { if (engel && req.method === "PATCH" && c.url.pathname.endsWith("/siparisler")) { c.yanit(500, { message: "gecici hata" }); return true; } return false; } });
  const r = await arac(b.url, ["siparis-onayla", "AAA11", "--kaydet"]);
  d.dogru(r.kod === 0 && /İLETİLEMEDİ/.test(r.stdout) && /siparis-esitle --kaydet/.test(r.stdout), "tabloya yazılamayınca açıkça söylüyor ve ne yapılacağını yazıyor");
  d.esit([S(b).gelenSiparisler[0].durum, tablo(b, "ord-aaa11").durum], ["onay", "yeni"], "store kaydedildi, tablo eski kaldı");
  d.dogru(/çay ocağı hâlâ "yeni" görüyor/.test((await arac(b.url, ["siparisler"])).stdout), "siparisler uyuşmazlığı gösteriyor");
  engel = false;
  const e = await arac(b.url, ["siparis-esitle", "--kaydet"]);
  d.dogru(e.kod === 0 && tablo(b, "ord-aaa11").durum === "onay", "siparis-esitle durumu tabloya iletti");
  d.dogru(/yapılacak bir şey yok/.test((await arac(b.url, ["siparis-esitle"])).stdout), "eşitlenince yapılacak iş kalmıyor");
  await b.dur();
}
d.bitir();
