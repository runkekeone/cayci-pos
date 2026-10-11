// LİMİT ve VADE: açık hesaba yazan satışta limit onayı (kabul/ret, parçalı ödemenin açık kısmı),
// borcun yaşı (ilk giren ilk kapanır), vadesi geçenler, hatırlatma, aracın fiş uyarısı ve tahsilat-listesi.
// Çalıştır: node testler/para/limit-vade.mjs
import { denetci } from "../ortak/panel.mjs";
import { ortam, git, ornekStore, satis, gun, tl, tabanVar, bekle } from "./ortak.mjs";

const d = denetci("para/limit-vade");

/** Örnek veri + vade durumları. Her müşterinin beklenen sonucu yanında yazılı (elle hesap). */
function senaryo() {
  const st = ornekStore();
  const m = (id, ad, ek = {}) => { st.customers.push({ id, ad, telefon: "", acilis: 0, limit: 0, vade: "", ozelFiyatlar: {}, ...ek }); return id; };
  const ac = (n, mid, tutar, gunOnce) => { const s = satis(st, n, mid, [["u1", 1, tutar]], { acik: tutar }, gun(gunOnce)); st.sales.push(s); return s; };
  const ode = (id, mid, tutar, gunOnce, ek = {}) => st.payments.push({ id, musteriId: mid, tutar, not: "", tarih: gun(gunOnce), ...ek });
  // v1 kısmi ödemeler: 1000 (60g) + 500 (20g) borç, 300 + 400 ödeme → en eskiden 300 kalır (60g) + 500 (20g)
  m("v1", "Kısmi Ödeyen"); ac(21, "v1", 1000, 60); ac(22, "v1", 500, 20); ode("o1", "v1", 300, 50); ode("o2", "v1", 400, 10);
  // v2 avans: önce 1000 ödedi, sonra 400 açık aldı → bakiye −600, açık kalem yok
  m("v2", "Avanslı Müşteri"); ode("o3", "v2", 1000, 40); ac(23, "v2", 400, 5);
  // v3 fazla ödeme tahsilatı: 45 gün önceki 800 borç, bugünkü peşin satışta 800 fazla verip kapattı
  m("v3", "Fazla Ödeyen"); ac(24, "v3", 800, 45);
  const f = satis(st, 25, "v3", [["u2", 1]], { nakit: 170 }, gun(0, 9)); st.sales.push(f);
  ode("o4", "v3", 800, 0, { not: "Satış üstü fazla ödeme → borca sayıldı (Belge " + f.belgeNo + ")" });
  // v4 iade: 900 borç (50g), aracın iade fişi (açık −900) ile kapandı
  m("v4", "İadeli Müşteri"); ac(26, "v4", 900, 50);
  st.sales.push(satis(st, 27, "v4", [["u1", -9, 100]], { acik: -900 }, gun(2), { odemeAdi: "İade" }));
  // v5 elle yazılan borç: 50 gün önce −350 (borç ekleme) → 350 açık, 50 günlük
  m("v5", "Elle Borçlu"); ode("o5", "v5", -350, 50, { odemeTuru: "duzeltme", not: "Manuel borç ekleme" });
  // v6 kendi vadesi 7 gün: 250 borç 10 günlük → 3 gün gecikmiş
  m("v6", "Kısa Vadeli", { vade: 7 }); ac(28, "v6", 250, 10);
  // v7 sadece açılış borcu: kart 90 gün önce açılmış (kimliğin sonu = açılış anı) → 700, 60 gün gecikmiş
  const kartAni = Date.now() - 90 * 86400000;
  st.customers.push({ id: "id7" + kartAni.toString(36), ad: "Sadece Açılış", telefon: "05550000007", acilis: 700, limit: 0, vade: "", ozelFiyatlar: {} });
  // v8 eksi açılış (alacaklı başladı): −300 açılış, 500 borç (40g) → 200 açık, 10 gün gecikmiş
  m("v8", "Eksi Açılış", { acilis: -300 }); ac(29, "v8", 500, 40);
  st.counters.sale = 29;
  return st;
}
const st = senaryo();
const v7id = st.customers.find((c) => c.ad === "Sadece Açılış").id;
const ozet = (y) => ({ borc: y.borc, acik: y.acik.map((a) => [a.tutar, a.gun]), gecikmis: y.gecikmis, tutar: y.gecikmisTutar, gun: y.gecikmeGun, vade: y.vade });
const BEKLENEN = {
  m1: { borc: 0, acik: [], gecikmis: false, tutar: 0, gun: 0, vade: 30 },
  m2: { borc: 2100, acik: [[2100, 35]], gecikmis: true, tutar: 2100, gun: 20, vade: 15 },           // açılış 500 + 2600 − 1000: açılış ve satışın 500'ü kapandı
  m3: { borc: 440, acik: [[440, 20]], gecikmis: false, tutar: 0, gun: 0, vade: 30 },
  v1: { borc: 800, acik: [[300, 60], [500, 20]], gecikmis: true, tutar: 300, gun: 30, vade: 30 },
  v2: { borc: -600, acik: [], gecikmis: false, tutar: 0, gun: 0, vade: 30 },
  v3: { borc: 0, acik: [], gecikmis: false, tutar: 0, gun: 0, vade: 30 },
  v4: { borc: 0, acik: [], gecikmis: false, tutar: 0, gun: 0, vade: 30 },
  v5: { borc: 350, acik: [[350, 50]], gecikmis: true, tutar: 350, gun: 20, vade: 30 },
  v6: { borc: 250, acik: [[250, 10]], gecikmis: true, tutar: 250, gun: 3, vade: 7 },
  [v7id]: { borc: 700, acik: [[700, 90]], gecikmis: true, tutar: 700, gun: 60, vade: 30 },
  v8: { borc: 200, acik: [[200, 40]], gecikmis: true, tutar: 200, gun: 10, vade: 30 },
};

/* ---- Taban: limit girili olsa da hiçbir şey sorulmuyordu; araç fişinde uyarı yoktu ---- */
if (tabanVar) {
  const t = await ortam(JSON.parse(JSON.stringify(st)), { taban: true });
  try {
    await t.page.evaluate(() => { pos.carts[pos.active].musteriId = "m2"; window.app.addToCart("u4"); window.app.finalizeSale("acik"); });
    await bekle(200);
    d.dogru(!t.p.diyaloglar.some((x) => /LİMİT/i.test(x.mesaj)), "TABAN: limiti 3.000 olan müşteriye borcu 4.100'e çıkaran satışta hiç soru sorulmuyordu");
    d.esit(await t.page.evaluate(() => window.app.customerBorc("m2")), 4100, "TABAN: satış sessizce yazılıyordu (borç 4.100)");
    d.dogru(await t.page.evaluate(() => typeof borcYas === "undefined"), "TABAN: vade hiçbir yerde hesaplanmıyordu");
  } finally { await t.kapat(); }
  const t2 = await ortam(JSON.parse(JSON.stringify(st)), { taban: true });
  try {
    const fis = await t2.tabanArac(["satis", JSON.stringify({ musteri: "Örnek Çay Ocağı", kalemler: [{ urun: "Örnek Çay 5 kg", adet: 1 }, { urun: "Örnek Soda", adet: 2 }], odeme: "acik", stokKaynak: "arac" })]);
    d.dogru(fis.kod === 0 && !/Borç uyarısı|limit/i.test(fis.cikti) && !/eksiye/i.test(fis.cikti), "TABAN araç fişi: limit aşımı, gecikmiş borç ve eksi stok için tek satır uyarı yoktu");
    const tl0 = await t2.tabanArac(["tahsilat-listesi"]);
    d.dogru(!/Gecikme|gecikmiş/i.test(tl0.cikti), "TABAN tahsilat-listesi gecikmeyi göstermiyordu");
  } finally { await t2.kapat(); }
} else console.log("  (taban klasörü yok — taban karşılaştırması atlandı)");

/* ---- Vade yaşlandırma ---- */
const mesajlar = [];
let limitKabul = false, parcali = ["0", "0"], pi = 0;
const o = await ortam(st, { diyalogKarar: (dlg) => {
  mesajlar.push(dlg.message());
  if (dlg.type() === "prompt") return parcali[pi++ % 2];
  if (/LİMİTİ AŞILIYOR/.test(dlg.message())) return limitKabul;
  return false;                                  // "irsaliye yazdırılsın mı", "fiyatı kaydet" → hayır
} });
try {
  const page = o.page;
  for (const id of Object.keys(BEKLENEN)) {
    const y = await page.evaluate((i) => borcYas(i), id);
    d.esit(ozet(y), BEKLENEN[id], "vade " + st.customers.find((c) => c.id === id).ad + ": " + JSON.stringify(BEKLENEN[id].acik) + (BEKLENEN[id].gecikmis ? " → " + BEKLENEN[id].gun + " gün gecikmiş" : " → gecikme yok"));
  }
  const fark = await page.evaluate(() => store.customers.filter((c) => Math.abs(borcYas(c.id).borc - customerBorc(c.id)) > 0.001).map((c) => c.ad));
  d.esit(fark, [], "yaşlandırmadaki bakiye her müşteride customerBorc ile aynı (kuruşu kuruşuna)");
  d.esit(await page.evaluate(() => [borcYas("m4").borc, borcYas("m4").gecikmis, borcYas("yok")]), [0, false, null], "hiç hareketi olmayan / olmayan müşteri bozmuyor");

  // genel vade ayarlanabilir: 10 gün yapılınca 20 günlük borcu olan da gecikmiş olur
  await page.evaluate(() => { store.settings.varsayilanVade = 10; });
  d.esit(ozet(await page.evaluate(() => borcYas("m3"))), { borc: 440, acik: [[440, 20]], gecikmis: true, tutar: 440, gun: 10, vade: 10 }, "genel vade 10 güne çekilince vadesi yazılmamış müşteri ona göre değerlendiriliyor");
  d.esit((await page.evaluate(() => borcYas("m2"))).vade, 15, "kendi vadesi yazılı müşteri genel ayardan etkilenmiyor");
  await page.evaluate(() => { delete store.settings.varsayilanVade; });

  /* ---- Görünürlük ---- */
  await git(page, "anasayfa");
  const kart = await page.evaluate(() => (document.querySelector(".pv-kart") || {}).innerText || "");
  d.dogru(/Vadesi geçenler \(6\)/.test(kart), "Anasayfa: 'Vadesi geçenler (6)' kartı var");
  d.dogru(kart.replace(/ /g, " ").includes(tl(2100 + 300 + 350 + 250 + 700 + 200)), "Anasayfa: gecikmiş toplam " + tl(3900));
  const ilk = await page.evaluate(() => (document.querySelector(".pv-satir") || {}).innerText || "");
  d.dogru(/Örnek Çay Ocağı/.test(ilk) && /20 gün gecikmiş/.test(ilk), "Anasayfa: en büyük gecikme en üstte (Örnek Çay Ocağı, 20 gün)");
  const olcu = await page.evaluate(() => [...document.querySelectorAll(".pv-btn")].map((b) => Math.round(b.getBoundingClientRect().height)));
  d.dogru(olcu.length >= 10 && olcu.every((h) => h >= 44), "Anasayfa: Hatırlat / Ödeme Al düğmeleri en az 44 px");
  d.dogru(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Anasayfa 390 px'e sığıyor (yana kayma yok)");

  // hatırlatma: hazır kibar metin + WhatsApp adresi; kendiliğinden gönderim yok
  await page.evaluate(() => { window.__acilan = []; window.open = (u) => { window.__acilan.push(u); return null; }; });
  await page.click('.pv-kart [data-hatirlat="m2"]');
  const metin = await page.inputValue("#htMetin");
  d.dogru(/Merhaba Örnek Çay Ocağı/.test(metin) && metin.replace(/ /g, " ").includes(tl(2100)) && /20 gündür/.test(metin) && /Teşekkür/.test(metin), "hatırlatma metni: selam, tutar, kaç gündür, teşekkür");
  d.esit(await page.evaluate(() => window.__acilan.length), 0, "pencere açılınca hiçbir şey gönderilmiyor/açılmıyor");
  await page.click("#htGonder");
  const url = await page.evaluate(() => window.__acilan[0] || "");
  d.dogru(url.startsWith("https://wa.me/905550000002?text=") && decodeURIComponent(url.split("text=")[1]).startsWith("Merhaba Örnek Çay Ocağı"), "düğme WhatsApp'ı müşterinin numarası ve hazır metinle açıyor");
  await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));

  await git(page, "musteriler");
  const satir = await page.evaluate(() => [...document.querySelectorAll("#glMusKart .gl-satir")].map((r) => r.querySelector(".gl-sol").innerText.replace(/\s+/g, " ").trim()));
  d.dogru(satir.some((x) => /Örnek Çay Ocağı.*20 gün gecikmiş/.test(x)) && satir.some((x) => /Kısa Vadeli.*3 gün gecikmiş/.test(x)) && !satir.some((x) => /Sınama Derneği.*gecikmiş/.test(x)), "Müşteri listesi: gecikenler işaretli, gecikmeyen işaretsiz");
  await page.evaluate(() => { selectedCustomerId = "m2"; }); await git(page, "musteri-detay");
  const durum = await page.evaluate(() => (document.querySelector(".gl-ozet") || {}).innerText || "");
  d.dogru(/Borç limiti/.test(durum) && /kalan/.test(durum) && /15 gün/.test(durum) && /20 gündür gecikmiş/.test(durum) && /Nazik Hatırlatma/.test(durum), "Müşteri detayı: limit, kalan, vade, gecikme ve hatırlatma düğmesi");

  /* ---- Satış ekranı + limit onayı ---- */
  await page.evaluate(() => { pos.carts[pos.active] = { items: [], musteriId: "m2", iskonto: 0, odenen: 0 }; });
  await git(page, "satis");
  let cl = await page.evaluate(() => document.getElementById("custLimit").innerText.replace(/ /g, " "));
  d.dogru(cl.includes("Borç: " + tl(2100)) && cl.includes("Limit: " + tl(3000)) && cl.includes("Kalan: " + tl(900)) && /20 gündür gecikmiş/.test(cl), "Satış ekranı: borç, limit, KALAN limit ve gecikme uyarısı görünüyor");
  await page.evaluate(() => window.app.addToCart("u4"));       // 2.000 ₺
  cl = await page.evaluate(() => document.getElementById("custLimit").innerText.replace(/ /g, " "));
  d.dogru(cl.includes("limit " + tl(1100) + " aşılır"), "Satış ekranı: sepet borca yazılırsa limitin ne kadar aşılacağını söylüyor");

  const say = () => page.evaluate(() => store.sales.length);
  const once = await say();
  // RET: satış yazılmaz, sepet durur
  limitKabul = false; mesajlar.length = 0;
  await page.evaluate(() => window.app.finalizeSale("acik")); await bekle(150);
  const soru = mesajlar.find((x) => /LİMİTİ AŞILIYOR/.test(x)) || "";
  d.dogru(soru.replace(/ /g, " ").includes(tl(2100)) && soru.replace(/ /g, " ").includes(tl(2000)) && soru.replace(/ /g, " ").includes(tl(4100)) && soru.replace(/ /g, " ").includes(tl(3000)) && soru.replace(/ /g, " ").includes(tl(1100)), "limit sorusu tutarları gösteriyor: şimdiki borç, yazılacak, yeni borç, limit, aşım");
  d.esit([await say(), await page.evaluate(() => pos.carts[pos.active].items.length), await page.evaluate(() => window.app.customerBorc("m2"))], [once, 1, 2100], "RET: satış kaydedilmedi, sepet yerinde, borç değişmedi");
  // nakit satışta soru yok (borca yazmıyor)
  mesajlar.length = 0;
  await page.evaluate(() => { pos.carts[1] = { items: [], musteriId: "m2", iskonto: 0, odenen: 0 }; pos.active = 1; window.app.addToCart("u2"); window.app.finalizeSale("nakit"); }); await bekle(150);
  d.dogru(!mesajlar.some((x) => /LİMİT/.test(x)) && (await say()) === once + 1, "nakit satışta limit sorulmuyor (borca yazmıyor)");
  await page.evaluate(() => { document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()); pos.active = 0; });
  // PARÇALI: 2.000'in 1.500'ü nakit → açık 500 → 2.600 ≤ 3.000: soru yok
  mesajlar.length = 0; parcali = ["1500", "0"]; pi = 0;
  await page.evaluate(() => window.app.finalizeSale("parcali")); await bekle(150);
  d.dogru(!mesajlar.some((x) => /LİMİT/.test(x)) && (await page.evaluate(() => window.app.customerBorc("m2"))) === 2600, "parçalı: açık kısım (500) limiti aşmıyorsa soru yok, borç 2.600");
  await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));
  // PARÇALI: 2.000'in 500'ü nakit → açık 1.500 → 4.100 > 3.000: soru var; KABUL → yazılır
  await page.evaluate(() => { pos.carts[pos.active].musteriId = "m2"; window.app.addToCart("u4"); });
  mesajlar.length = 0; parcali = ["500", "0"]; pi = 0; limitKabul = true;
  await page.evaluate(() => window.app.finalizeSale("parcali")); await bekle(150);
  const soru2 = (mesajlar.find((x) => /LİMİTİ AŞILIYOR/.test(x)) || "").replace(/ /g, " ");
  d.dogru(soru2.includes("Bu satıştan borca yazılacak: " + tl(1500)) && soru2.includes(tl(4100)), "parçalı: yalnız AÇIK kısım (1.500) hesaba katılıyor");
  const son = await page.evaluate(() => store.sales[store.sales.length - 1]);
  d.esit([son.odeme, await page.evaluate(() => window.app.customerBorc("m2"))], [{ nakit: 500, pos: 0, acik: 1500 }, 4100], "KABUL: satış yazıldı (nakit 500 + açık 1.500), borç 4.100");
  await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));
  // limiti olmayan müşteri: soru yok
  mesajlar.length = 0;
  await page.evaluate(() => { pos.carts[pos.active].musteriId = "m1"; window.app.addToCart("u4"); window.app.finalizeSale("acik"); }); await bekle(150);
  d.dogru(!mesajlar.some((x) => /LİMİT/.test(x)) && (await page.evaluate(() => window.app.customerBorc("m1"))) === 2000, "limiti yazılmamış müşteride soru yok");
  await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));
  await git(page, "musteriler");
  d.dogru((await page.evaluate(() => document.querySelector("#glMusKart").innerText)).includes("limit aşıldı"), "Müşteri listesi: limiti aşan işaretli");
  d.esit(o.p.hatalar, [], "sayfada betik hatası yok");
} finally { await o.kapat(); }

/* ---- Araç ---- */
const a = await ortam(senaryo());
try {
  const girdi = { musteri: "Örnek Çay Ocağı", kalemler: [{ urun: "Örnek Çay 5 kg", adet: 1 }, { urun: "Örnek Soda", adet: 2 }], odeme: "acik", stokKaynak: "arac" };
  const fis = await a.arac(["satis", JSON.stringify(girdi)]);
  const uy = fis.cikti.split(/\r?\n/).filter((l) => /Borç uyarısı/.test(l));
  d.dogru(uy.length === 1 && /limit 3\.000,00 ₺ aşılıyor/.test(uy[0]) && /yeni bakiye 4\.580,00 ₺/.test(uy[0]) && /vadesi geçmiş 2\.100,00 ₺/.test(uy[0]) && /20 gündür/.test(uy[0]), "araç fişi: TEK uyarı satırı — limit aşımı + vadesi geçmiş borç");
  d.dogru(/Stok eksiye düşüyor.*Örnek Soda 0 → -2/.test(fis.cikti), "araç fişi: eksiye düşen stok için kısa not");
  d.dogru(/^### 🧾 FİŞ — Örnek Çay Ocağı/.test(fis.cikti.trim()) && /\| \*\*Bakiye\*\* \| 2\.100,00 → \*\*4\.580,00 ₺\*\* \|/.test(fis.cikti) && /\*\*KAYDEDİLMEDİ\*\* — onayını bekliyorum/.test(fis.cikti), "araç fişinin yapısı aynı (başlık, bakiye satırı, onay satırı)");
  const temiz = await a.arac(["satis", JSON.stringify({ musteri: "Deneme Kıraathanesi", kalemler: [{ urun: "Örnek Pet Su", adet: 1 }], odeme: "nakit", stokKaynak: "arac" })]);
  d.dogru(!/Borç uyarısı|eksiye/.test(temiz.cikti), "sorunsuz satışta fişe hiçbir satır eklenmiyor");
  const nakit = await a.arac(["satis", JSON.stringify({ ...girdi, kalemler: [girdi.kalemler[0]], odeme: "nakit" })]);
  d.dogru(/Borç uyarısı.*vadesi geçmiş/.test(nakit.cikti) && !/aşılıyor/.test(nakit.cikti), "peşin satışta limit uyarısı yok ama vadesi geçmiş borç hatırlatılıyor");

  const liste = await a.arac(["tahsilat-listesi"]);
  const sat = (ad) => liste.cikti.split(/\r?\n/).find((l) => l.includes("| " + ad + " |")) || "";
  d.dogru(/\| Gecikme \|/.test(liste.cikti) && /⏰ 2\.100,00 ₺ · 20 gün/.test(sat("Örnek Çay Ocağı")) && /⏰ 300,00 ₺ · 30 gün/.test(sat("Kısmi Ödeyen")) && / — \|$/.test(sat("Sınama Derneği")), "tahsilat-listesi: gecikme sütunu (tutar · gün), gecikmeyende —");
  d.dogru(/VADESİ GEÇMİŞ: 3\.900,00 ₺\*\* · 6 müşteri/.test(liste.cikti), "tahsilat-listesi: vadesi geçmiş toplamı panelle aynı (3.900 ₺, 6 müşteri)");

  const l0 = await a.arac(["limit"]);
  d.dogru(/Genel vade.*30 gün/.test(l0.cikti) && /Örnek Çay Ocağı \| 2\.100,00 ₺ \| 3\.000,00 ₺ \| 900,00 ₺ \| 15 \|/.test(l0.cikti), "limit: limiti/vadesi yazılı müşteriler ve genel vade listeleniyor");
  const l1 = await a.arac(["limit", "Sınama Derneği", "400", "--vade=10"]);
  d.dogru(/PROVA/.test(l1.cikti) && a.bulut.deger("babuco:store").customers.find((c) => c.id === "m3").limit === 0, "limit: --kaydet'siz hiçbir şey yazılmıyor");
  const l2 = await a.arac(["limit", "Sınama Derneği", "400", "--vade=10", "--kaydet"]);
  const m3 = a.bulut.deger("babuco:store").customers.find((c) => c.id === "m3");
  d.esit([l2.kod, m3.limit, m3.vade], [0, 400, 10], "limit --kaydet: limit 400, vade 10 yazıldı");
  d.dogru(/şimdiki borcu bu limitin 40,00 ₺ üstünde/.test(l2.cikti), "limit: yeni limit şimdiki borcun altındaysa söylüyor");
  const l3 = await a.arac(["limit", "--genel-vade=45", "--kaydet"]);
  d.esit([l3.kod, a.bulut.deger("babuco:store").settings.varsayilanVade], [0, 45], "limit --genel-vade=45 --kaydet: genel vade yazıldı");
  const liste2 = await a.arac(["tahsilat-listesi"]);
  d.dogru(/⏰ 440,00 ₺ · 10 gün · ⛔ limit 400,00 ₺/.test(liste2.cikti) && !/Kısmi Ödeyen.*⏰ 300,00 ₺ · 30 gün/.test(liste2.cikti), "ayar değişince liste de değişiyor (m3 gecikmiş + limit aşmış; v1 artık 45 güne göre)");
} finally { await a.kapat(); }
d.bitir();
