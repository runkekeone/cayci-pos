// KASA: tek hesap fonksiyonu. Karışık bir günde (nakit/kart/havale/iade/düzeltme/peşin alım; yeni alanlı ve
// eski alansız kayıtlar birlikte) Anasayfa = Dükkan = Günlük Rapor = gün sonu = aracın rapor/kasa rakamı.
// Çalıştır: node testler/para/kasa.mjs
import { denetci } from "../ortak/panel.mjs";
import { ortam, git, statlar, mdDeger, karisikGun, bugunStr, tl, tlArac, tabanVar, bekle } from "./ortak.mjs";

const d = denetci("para/kasa");
const { st, beklenen: B } = karisikGun();
const bugun = bugunStr();

/* ---- 1) Taban sürüm: aynı gün, üç ekran üç ayrı (ve yanlış) rakam ---- */
if (tabanVar) {
  const t = await ortam(JSON.parse(JSON.stringify(st)), { taban: true });
  try {
    await git(t.page, "anasayfa"); const ana = (await statlar(t.page))["Nakit Kasa"];
    await git(t.page, "rapor-gunluk"); const gunluk = (await statlar(t.page))["Nakit Kasa Raporu"];
    d.esit(ana, tl(B.tabanAnasayfa), "TABAN Anasayfa nakit kasa yanlıştı: bütün tahsilat (kart/havale/iade/düzeltme) nakit sayılıyordu");
    d.esit(gunluk, tl(B.tabanGunluk), "TABAN Günlük Rapor başka bir rakam veriyordu (aynı gün, iki ekran tutmuyordu)");
    const r = await t.tabanArac(["rapor", bugun]);
    d.dogru(mdDeger(r.cikti, "Nakit kasa") !== tlArac(B.nakitKasa), "TABAN aracın raporu da doğru kasayı vermiyordu (" + mdDeger(r.cikti, "Nakit kasa") + ")");
  } finally { await t.kapat(); }
} else console.log("  (taban klasörü yok — taban karşılaştırması atlandı)");

/* ---- 2) Yeni sürüm ---- */
const o = await ortam(st);
try {
  const k = await o.page.evaluate((g) => kasaHesap(g, g), bugun);
  ["satisNakit", "satisPos", "satisAcik", "ciro", "maliyet", "komisyon", "tahNakit", "tahKart", "tahHavale", "iade", "duzeltme",
    "giderNakit", "giderDiger", "giderMal", "gelirNakit", "gelirDiger", "firmaNakit", "firmaDiger", "alimNakit", "alimDiger",
    "nakitKasa", "kartHavale", "urunKar", "giderIsletme", "gelir", "netKar"].forEach((a) => d.esit(k[a], B[a], "kasaHesap." + a + " = " + B[a]));

  // eski (alansız) kayıtların türü nottan çıkıyor
  const turler = await o.page.evaluate(() => Object.fromEntries(store.payments.filter((p) => /^k\d+$/.test(p.id)).map((p) => [p.id, tahsilatTuru(p)])));
  d.esit(turler, { k1: "nakit", k2: "kart", k3: "havale", k4: "iade", k5: "duzeltme", k6: "kart", k7: "havale", k8: "iade", k9: "duzeltme", k10: "nakit", k11: "nakit" }, "tahsilat türü: alan varsa alandan, yoksa nottan (düzeltme > iade > kart > havale > nakit)");
  const ornek = await o.page.evaluate(() => ["karton bardak parası", "posta ücreti", "Kartla ödedi", "POS'tan çekildi", "kredi kartı", "IBAN'a attı", "EFT", "Eftal bey verdi", "elden", "İADE edildi", "bakiye duzeltme"].map((n) => tahsilatTuru({ not: n, tutar: 10 })));
  d.esit(ornek, ["nakit", "nakit", "kart", "kart", "kart", "havale", "havale", "nakit", "nakit", "iade", "duzeltme"], "nottan çıkarım yanlış eşleşmiyor (karton/posta/Eftal nakit kalır)");

  // üç ekran aynı rakamı gösteriyor
  await git(o.page, "anasayfa"); const ana = await statlar(o.page);
  d.esit(ana["Nakit Kasa"], tl(B.nakitKasa), "Anasayfa nakit kasa " + tl(B.nakitKasa));
  d.esit(ana["Kart / Havale ile Gelen"], tl(B.kartHavale), "Anasayfa kart/havale ayrı satırda " + tl(B.kartHavale));
  d.esit(ana["Kâr (bugün)"], tl(B.urunKar), "Anasayfa kâr = ciro − maliyet");
  d.esit(ana["Kart (POS) Komisyonu"], tl(B.komisyon), "Anasayfa POS komisyonu ayrı satır");
  d.esit(ana["Net Kâr (gider sonrası)"], tl(B.netKar), "Anasayfa net kâr komisyon ve gider düşülmüş");
  await git(o.page, "dukkan");
  const dk = await o.page.evaluate(() => [...document.querySelectorAll(".dk-kbox")].map((x) => x.textContent.replace(/ /g, " ")));
  d.dogru(dk.some((x) => x.includes("Nakit Kasa") && x.includes(tl(B.nakitKasa))), "Dükkan nakit kasa aynı: " + tl(B.nakitKasa));
  await git(o.page, "rapor-gunluk"); const gr = await statlar(o.page);
  d.esit(gr["Nakit Kasa Raporu"], tl(B.nakitKasa), "Günlük Rapor nakit kasa aynı");
  d.esit(gr["Alınan Ödemeler"], tl(B.tahNakit + B.tahKart + B.tahHavale), "Günlük Rapor alınan ödemeler = gerçek para (iade/düzeltme hariç)");
  d.esit(gr["İade / Düzeltme (kasaya girmez)"], tl(B.iade + B.duzeltme), "Günlük Rapor iade/düzeltme ayrı gösteriliyor");
  d.esit(gr["Peşin Mal Alımı"], tl(B.alimNakit + B.alimDiger), "Günlük Rapor peşin mal alımı satırı");
  d.esit(gr["Kâr"], tl(B.urunKar), "Günlük Rapor kâr");
  d.esit(gr["Net Kâr (gider sonrası)"], tl(B.netKar), "Günlük Rapor net kâr");

  // araç: aynı gün, aynı rakam
  const j = await o.arac(["kasa", bugun, "--json"]);
  const ka = JSON.parse(j.cikti);
  d.esit(ka, k, "araç kasaHesap çıktısı panelinkiyle BİREBİR aynı (bütün alanlar)");
  const r = await o.arac(["rapor", bugun]);
  d.esit(mdDeger(r.cikti, "Nakit kasa"), tlArac(B.nakitKasa), "araç rapor: Nakit kasa");
  d.esit(mdDeger(r.cikti, "Kart / havale ile gelen"), tlArac(B.kartHavale), "araç rapor: kart/havale ayrı satır");
  d.esit(mdDeger(r.cikti, "Kâr"), tlArac(B.urunKar), "araç rapor: Kâr panelle aynı");
  d.esit(mdDeger(r.cikti, "POS komisyonu"), tlArac(B.komisyon), "araç rapor: POS komisyonu ayrı satır");
  d.esit(mdDeger(r.cikti, "Net kâr (gider sonrası)"), tlArac(B.netKar), "araç rapor: net kâr panelle aynı");
  const ks = await o.arac(["kasa", bugun]);
  d.esit(mdDeger(ks.cikti, "Nakit (elde)"), tlArac(B.nakitKasa), "araç kasa: Nakit (elde) = panelin nakit kasası");
  d.esit(mdDeger(ks.cikti, "Pos (hesaba geçecek)").split(" · ")[0], tlArac(B.satisPos + B.tahKart), "araç kasa: pos satırı satış + kart tahsilatı");
  d.esit(mdDeger(ks.cikti, "Nakit (hesaba yatan)"), tlArac(B.tahHavale), "araç kasa: havale tahsilatı 'hesaba yatan'da");
  d.esit(mdDeger(ks.cikti, "Net kâr (gider sonrası)"), tlArac(B.netKar), "araç kasa: net kâr panelle aynı");
  d.dogru(/Kasaya sayılmayan kayıtlar/.test(ks.cikti) && /Bakiye düzeltme/.test(ks.cikti) && /Ürün iadesi/.test(ks.cikti), "araç kasa: iade ve düzeltme 'kasaya sayılmayan' olarak listeleniyor");
  // --hesaba: nakdini bankaya yatıran müşteri elde kalandan düşer (kullanıcının şablonu, anlamı korunur)
  const kh = await o.arac(["kasa", bugun, "--hesaba=deneme kıraathanesi"]);
  d.esit(mdDeger(kh.cikti, "Nakit (elde)"), tlArac(B.nakitKasa - 1070), "araç kasa --hesaba: o müşterinin 1.000 + 70 fazla ödemesi elden düşüyor");
  d.esit(mdDeger(kh.cikti, "Günün toplam tahsilatı"), mdDeger(ks.cikti, "Günün toplam tahsilatı"), "--hesaba toplam tahsilatı değiştirmiyor");

  // gün sonu (servisBitir) aynı fonksiyonu kullanıyor; kâr diğer ekranlarla aynı, komisyon ayrı
  o.karar.fn = () => true;
  await o.page.evaluate(() => servisBitir({ giderSoruldu: true }));
  await bekle(200);
  const sr = await o.page.evaluate(() => store.servisRaporlari[store.servisRaporlari.length - 1]);
  d.esit([sr.nakitKasa, sr.kartHavale, sr.kar, sr.komisyon, sr.netKar], [B.nakitKasa, B.kartHavale, B.urunKar, B.komisyon, B.netKar], "gün sonu raporu: kasa, kâr, komisyon, net — hepsi aynı kaynaktan");
  const modal = await o.page.evaluate(() => (document.querySelector(".modal-overlay .rapor-grid") || {}).textContent || "");
  d.dogru(modal.replace(/ /g, " ").includes(tl(B.nakitKasa)) && /Net Kâr/.test(modal), "gün sonu penceresi nakit kasayı ve net kârı gösteriyor");
  d.esit(o.p.hatalar, [], "sayfada betik hatası yok");
} finally { await o.kapat(); }
d.bitir();
