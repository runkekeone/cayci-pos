// GİDER: iki kayıt biçimi (panel tur+odeme / araç kategori+not) tek biçim okunur; tek dokunuş türler;
// gün sonunda "bugün gider girmedin" hatırlatması; araçta gidersiz gün/ay işareti; aylık sabit giderler.
// Çalıştır: node testler/para/gider.mjs
import { denetci } from "../ortak/panel.mjs";
import { ortam, git, statlar, ornekStore, satis, gun, bugunStr, tl, tlArac, tabanVar, bekle } from "./ortak.mjs";

const d = denetci("para/gider");
const bugun = bugunStr(), ay = bugun.slice(0, 7);
/** Bugün 2 satış (ciro 1.340, maliyet 940, kâr 400), bugün hiç gider yok. Eski kayıtlar iki biçimde. */
function senaryo() {
  const st = ornekStore();
  st.sales.push(satis(st, 41, "m1", [["u1", 10, 100]], { nakit: 1000 }, gun(0, 9)), satis(st, 42, null, [["u2", 2]], { nakit: 340 }, gun(0, 10)));
  st.counters.sale = 42;
  st.expenses.push({ id: "g2", tur: "Kira", not: "depo", tutar: 900, odeme: "Havale", tarih: gun(3, 15) });   // panel biçimi (ornekStore'daki g1 araç biçimi)
  return st;
}
const kapatModal = (page) => page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));

/* ---- Taban ---- */
if (tabanVar) {
  const t = await ortam(senaryo(), { taban: true });
  try {
    await git(t.page, "giderler");
    const tablo = await t.page.evaluate(() => [...document.querySelectorAll("tbody tr")].map((tr) => tr.children[1].innerText.trim()));
    d.dogru(tablo.includes("-") && !tablo.includes("Yemek"), "TABAN Giderler: aracın yazdığı giderin türü görünmüyordu (\"-\")");
    await t.page.evaluate(() => servisBitir()); await bekle(150);
    d.dogru(await t.page.evaluate(() => store.servisRaporlari.length === 1 && !/gider var mı/i.test(document.body.innerText)), "TABAN: satış olan günde hiç gider yokken gün sonu hiçbir şey sormadan kapanıyordu");
    const r = await t.tabanArac(["rapor", bugun]), a0 = await t.tabanArac(["aylik"]);
    d.dogru(!/gider yaz/i.test(r.cikti) && !/⚠/.test(a0.cikti), "TABAN araç: gidersiz gün/ay için hiçbir uyarı yoktu");
  } finally { await t.kapat(); }
}

/* ---- Panel ---- */
const o = await ortam(senaryo());
try {
  const page = o.page;
  await git(page, "anasayfa");
  d.dogru(/Bugün satış var ama hiç gider yazılmadı/.test(await page.evaluate(() => document.body.innerText)), "Anasayfa: satış var, gider yok → tek satır hatırlatma");
  await git(page, "giderler");
  const liste = await page.evaluate(() => [...document.querySelectorAll(".pg-satir .pg-mid b")].map((x) => x.textContent));
  d.dogru(liste.includes("Yemek") && liste.includes("Kira"), "Giderler: iki biçim de türüyle görünüyor (kategori || tur)");
  const chip = await page.evaluate(() => [...document.querySelectorAll(".pg-chip")].map((b) => [b.dataset.gkat, Math.round(b.getBoundingClientRect().height), Math.round(b.getBoundingClientRect().width)]));
  d.esit(chip.map((x) => x[0]), ["Yakıt", "Yemek", "Araç Bakım", "Otopark / Köprü", "Telefon", "Diğer"], "Giderler: sık kullanılan türler tek dokunuşluk düğme");
  d.dogru(chip.every((x) => x[1] >= 44 && x[2] >= 44), "tür düğmeleri en az 44×44 px");
  d.dogru(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Giderler 390 px'e sığıyor");
  // Yakıt'a dokun → tutar → kaydet
  await page.click('[data-gkat="Yakıt"]'); await page.fill("#gdTutar", "350"); await page.click(".modal-overlay .modal-foot .btn.ok"); await bekle(150);
  let e = await page.evaluate(() => store.expenses[store.expenses.length - 1]);
  d.esit([e.kategori, e.tur, e.tutar, e.odeme, e.tarih.slice(0, 4) > "2000"], ["Yakıt", "Yakıt", 350, "Nakit", true], "Yakıt gideri tek biçimle yazıldı (kategori + tur + odeme)");
  // Diğer → serbest tür, kartla
  await page.click('[data-gkat="Diğer"]'); await page.fill("#gdTur", "Kırtasiye"); await page.fill("#gdTutar", "80"); await page.click('[data-ptur="kart"]'); await page.click(".modal-overlay .modal-foot .btn.ok"); await bekle(150);
  e = await page.evaluate(() => store.expenses[store.expenses.length - 1]);
  d.esit([e.kategori, e.tutar, e.odeme], ["Kırtasiye", 80, "POS"], "Diğer: türü yazılır; kartla ödenen gider odeme=POS");
  const k = await page.evaluate((g) => kasaHesap(g, g), bugun);
  d.esit([k.nakitKasa, k.giderIsletme, k.netKar, k.giderEksik], [1340 - 350, 430, 400 - 430, false], "kasa: nakit gider (350) kasadan düştü, kartla ödenen (80) düşmedi; net kâr ikisini de düşüyor");

  // aylık sabit gider
  await page.click('[data-act="sabitekle"]'); await page.fill('.modal-overlay [data-k="ad"]', "Telefon"); await page.fill('.modal-overlay [data-k="tutar"]', "450"); await page.click(".modal-overlay .modal-foot .btn.ok"); await bekle(150);
  d.esit(await page.evaluate(() => store.sabitGiderler.map((g) => [g.ad, g.tutar, g.baslangic, typeof g.id])), [["Telefon", 450, ay, "string"]], "sabit gider listeye yazıldı (bu aydan itibaren, kendi id'siyle)");
  const oz = await page.evaluate((a) => { const x = ayOzet(a); return [x.sabit, kurus(x.netKar - x.net)]; }, ay);
  d.esit(oz, [450, 450], "sabit gider bu ayın net kârından düşülüyor");
  const oncekiAy = await page.evaluate(() => { const dt = new Date(); dt.setDate(0); return ayOzet(localDateStr(dt).slice(0, 7)).sabit; });
  d.esit(oncekiAy, 0, "geçmiş ay geriye dönük değişmiyor");
  d.dogru(/Aylık sabit giderler/.test(await page.evaluate(() => document.body.innerText)) && (await page.evaluate(() => document.body.innerText.replace(/ /g, " "))).includes("−" + tl(450)), "Giderler ekranı 'Bu ay — ne kaldı?' kutusunda sabit gideri gösteriyor");
  d.esit(o.p.hatalar, [], "sayfada betik hatası yok");
} finally { await o.kapat(); }

/* ---- Gün sonu hatırlatması ---- */
const g = await ortam(senaryo());
try {
  const page = g.page;
  await page.evaluate(() => servisBitir()); await bekle(150);
  d.dogru(await page.evaluate(() => /Bugün gider var mı\?/.test(document.body.innerText) && /hiç gider yazılmadı/.test(document.body.innerText) && store.servisRaporlari.length === 0), "gün sonu: satış var, gider yok → önce soruyor, günü kapatmıyor");
  d.dogru((await page.evaluate(() => [...document.querySelectorAll(".modal-overlay .pg-chip, .modal-overlay #ghBitir")].map((b) => Math.round(b.getBoundingClientRect().height)))).every((h) => h >= 44), "hatırlatma penceresindeki düğmeler en az 44 px");
  // oradan hızlıca yaz: Yemek 120
  await page.click('.modal-overlay [data-gkat="Yemek"]'); await page.fill("#gdTutar", "120"); await page.click(".modal-overlay .modal-foot .btn.ok"); await bekle(200);
  d.dogru(await page.evaluate(() => /Bugün yazılan giderler/.test(document.body.innerText) && /Tamam, günü bitir/.test(document.body.innerText)), "gider yazılınca hatırlatma geri geliyor, yazılanı gösteriyor");
  await page.click("#ghBitir"); await bekle(200);
  const r = await page.evaluate(() => store.servisRaporlari[store.servisRaporlari.length - 1]);
  d.esit([r.gider, r.kar, r.netKar, r.nakitKasa], [120, 400, 280, 1220], "gün kapandı: gider 120 rapora girdi (kâr 400, net 280, nakit kasa 1.220)");
  // ikinci gün sonu: gider artık var → sormaz
  await kapatModal(page);
  await page.evaluate(() => servisBitir()); await bekle(150);
  d.dogru(await page.evaluate(() => store.servisRaporlari.length === 2 && !/Bugün gider var mı\?/.test(document.body.innerText)), "gider yazılmış günde bir daha sormuyor");
  d.esit(g.p.hatalar, [], "sayfada betik hatası yok");
} finally { await g.kapat(); }
const g2 = await ortam(senaryo());
try {
  await g2.page.evaluate(() => servisBitir()); await bekle(150);
  await g2.page.click("#ghBitir"); await bekle(200);
  d.esit(await g2.page.evaluate(() => [store.servisRaporlari.length, store.servisRaporlari[0].gider, store.expenses.filter((e) => isToday(e.tarih)).length]), [1, 0, 0], "\"Gider yok, günü bitir\": gün gidersiz kapanır, uydurma kayıt yazılmaz");
} finally { await g2.kapat(); }
const g3 = await ortam(ornekStore());   // bugün satış yok
try {
  await g3.page.evaluate(() => servisBitir()); await bekle(150);
  d.dogru(await g3.page.evaluate(() => store.servisRaporlari.length === 1 && !/Bugün gider var mı\?/.test(document.body.innerText)), "satış olmayan günde hatırlatma çıkmıyor");
} finally { await g3.kapat(); }

/* ---- Araç ---- */
const a = await ortam(senaryo());
try {
  const st = () => a.bulut.deger("babuco:store");
  const r0 = await a.arac(["rapor", bugun]), k0 = await a.arac(["kasa", bugun]);
  const uy = (c) => c.split(/\r?\n/).filter((l) => /hiç gider yazılmamış/.test(l)).length;
  d.esit([uy(r0.cikti), uy(k0.cikti)], [1, 1], "araç rapor ve kasa: satış olan gidersiz günü TEK satırla belirtiyor");
  d.dogru(/- Yemek — 250,00 ₺/.test((await a.arac(["rapor", gun(3).slice(0, 10)])).cikti) && /- Kira — 900,00 ₺ · Havale/.test((await a.arac(["rapor", gun(3).slice(0, 10)])).cikti), "araç rapor: iki biçimdeki gider de türüyle listeleniyor");
  const p = await a.arac(["gider", "200", "mazot"]);
  d.dogru(/Gider: 200,00 ₺ · mazot · Yakıt/.test(p.cikti) && /PROVA/.test(p.cikti) && st().expenses.length === 2, "gider \"mazot\": türü kendisi tanıyor (Yakıt); --kaydet'siz yazmıyor");
  await a.arac(["gider", "200", "mazot", "--kaydet"]);
  const e = st().expenses[st().expenses.length - 1];
  d.esit([e.kategori, e.tur, e.not, e.odeme, e.tutar], ["Yakıt", "Yakıt", "mazot", "Nakit", 200], "araç gideri panelle aynı biçimde yazıldı (kategori + tur + odeme)");
  await a.arac(["gider", "75", "öğle arası", "Yemek", "--kart", "--kaydet"]);
  d.esit([st().expenses.slice(-1)[0].kategori, st().expenses.slice(-1)[0].odeme], ["Yemek", "POS"], "gider --kart: kartla ödenen gider (kasadan çıkmaz)");
  await a.arac(["gider", "60", "kargo", "--kaydet"]);
  d.esit(st().expenses.slice(-1)[0].kategori, "Genel", "tanınmayan gider eskisi gibi \"Genel\"");
  const r1 = await a.arac(["rapor", bugun]);
  d.esit(uy(r1.cikti), 0, "gider yazılınca uyarı satırı kalkıyor");

  // aylik: gidersiz/eksik ay işareti + sabit gider
  const ayRow = (c, m) => c.split(/\r?\n/).find((l) => l.startsWith("| " + m + " |")) || "";
  const ay0 = await a.arac(["aylik"]);
  const baslik = ay0.cikti.split(/\r?\n/).find((l) => l.startsWith("| Ay |"));
  d.esit(baslik, "| Ay | Servis günü | Satış | Ciro | Ürün kârı | Marj | Gider | Net kâr | Gün başı |", "aylik tablosu: sabit gider/komisyon yokken sütunlar eskisiyle aynı");
  const eskiAylar = ay0.cikti.split(/\r?\n/).filter((l) => /^⚠ \d{4}-\d{2}: /.test(l));
  d.dogru(eskiAylar.length >= 1 && eskiAylar.every((l) => /gider yaz|gider yok/.test(l)), "aylik: gideri boş/eksik aylar ⚠ ile işaretli (" + eskiAylar.length + " satır)");
  await a.arac(["sabit-gider", "ekle", "Telefon", "450", "--kaydet"]);
  d.esit(st().sabitGiderler.map((x) => [x.ad, x.tutar, x.baslangic]), [["Telefon", 450, ay]], "sabit-gider ekle --kaydet: listeye yazıldı");
  const ay1 = await a.arac(["aylik"]);
  d.dogru(/\| Sabit \|/.test(ay1.cikti) && /Aylık sabit giderler: Telefon 450,00 ₺/.test(ay1.cikti), "aylik: sabit gider varken 'Sabit' sütunu ve dipnot geliyor");
  const net = (c) => ayRow(c, ay).split("|").slice(-3)[0].replace(/\*/g, "").trim();
  const sayi = (t) => Number(t.replace(/[^\d,-]/g, "").replace(",", "."));
  d.esit(Math.round((sayi(net(ay0.cikti)) - sayi(net(ay1.cikti))) * 100) / 100, 450, "aylik: bu ayın net kârı sabit gider kadar (450) azaldı");
  // panel ile araç aynı ay için aynı net kârı veriyor
  const pn = await ortam(st());
  try { d.esit(tlArac(await pn.page.evaluate((m) => ayOzet(m).net, ay)), net(ay1.cikti), "panelin 'Bu ay net kalan'ı ile aracın aylik net kârı AYNI"); } finally { await pn.kapat(); }
  await a.arac(["sabit-gider", "sil", "Telefon", "--kaydet"]);
  d.esit(st().sabitGiderler.length, 0, "sabit-gider sil --kaydet");
} finally { await a.kapat(); }
d.bitir();
