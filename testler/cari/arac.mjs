// Araç (tools/babuco.cjs) → canlı müşteri sayfası.
//  (a) araçla satış → müşteri sayfası telefonla ve kişisel linkle yeni fişi ve doğru bakiyeyi gösterir
//  (d) yanlış telefon / bozuk link hiçbir veri vermez
//  (e) yayınlanan kayıtların çözülmüş içeriğinde alış, maliyet, kâr, limit, not, başka müşteri yok
//  (f) yalnız hesabı değişen müşterinin kaydı yeniden yazılır
//  (g) telefonu değişen / silinen müşterinin eski kaydı kalmaz
//  + yayın başarısız olursa satış kaydı etkilenmez; cari-yayinla / cari-link; satış fişinin çıktısına ek satır girmez
// Çalıştır: node testler/cari/arac.mjs
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { aracCalistir, denetci } from "../ortak/panel.mjs";
import { cariStore, satirlar, borc, para, cariAnahtarlar, hesapCoz, telCoz, goruntu, degisenler, sayfaAc, yerelLink, hesapOku, telefonlaGir, linkOlustur, GIZLI, ONEK, SIR_ANAHTAR } from "./yardimci.mjs";

const d = denetci("cari-arac");
let kes = false;                                                     // true: cari satırlarına yazma istekleri 500 döner
const bulut = await sahteBulut({ satirlar: satirlar(), once: (req, res, ctx) => {
  if (kes && req.method === "POST" && ctx.url.pathname === "/rest/v1/kv" && ctx.govde.toString().includes(ONEK)) { ctx.yanit(500, { message: "zorlanmis hata" }); return true; }
  return false;
} });
const store = () => bulut.deger("babuco:store");
const arac = (...a) => aracCalistir(bulut.url, a);
const yil = new Date().getFullYear();

try {
  console.log("— ilk yayın");
  const prova = await arac("cari-yayinla");
  d.dogru(prova.kod === 0 && /ilk yayın/.test(prova.cikti) && cariAnahtarlar(bulut).length === 0 && !bulut.deger(SIR_ANAHTAR), "--kaydet'siz cari-yayinla hiçbir şey yazmaz (sır da oluşmaz)");
  const linkYok = await arac("cari-link", "Deneme");
  d.dogru(linkYok.kod !== 0 && /henuz yayinlanmamis/.test(linkYok.cikti), "yayından önce cari-link açık bir hata verir");
  const ilk = await arac("cari-yayinla", "--kaydet");
  d.dogru(ilk.kod === 0 && /4 müşteri · 7 kayıt yazıldı/.test(ilk.cikti), "cari-yayinla --kaydet: 4 hesap + 3 telefon kaydı yazıldı");
  d.dogru(/Sınama Derneği \(cep telefonu kayıtlı değil\)/.test(ilk.cikti), "telefonu olmayan müşteri 'telefonla giremez' listesinde");
  d.esit([cariAnahtarlar(bulut, "h").length, cariAnahtarlar(bulut, "t").length], [4, 3], "bulutta 4 hesap, 3 telefon satırı");
  const tekrar = await arac("cari-yayinla", "--kaydet");
  d.dogru(/0 kayıt yazıldı · 0 eski kayıt silindi/.test(tekrar.cikti), "değişiklik yokken yeniden yayın hiçbir satırı yazmaz");

  console.log("— (e) kayıtlarda yalnız izinli alanlar");
  const TEPE = ["v", "firma", "ad", "acilis", "bakiye", "f", "o"], FIS = ["no", "t", "top", "nakit", "kart", "acik", "k", "isk", "iade", "havale"], ODE = ["t", "tutar", "tur", "fis"];
  const s0 = store();
  for (const c of s0.customers) {
    const k = await hesapCoz(bulut, c.id), h = k.hesap;
    const fazla = Object.keys(h).filter((x) => !TEPE.includes(x)).concat(...h.f.map((x) => Object.keys(x).filter((y) => !FIS.includes(y))), ...h.o.map((x) => Object.keys(x).filter((y) => !ODE.includes(y))));
    d.esit(fazla, [], c.ad + ": kayıtta izinli alanlar dışında alan yok");
    d.dogru(!/alis|maliyet|kar\b|kâr|komisyon|limit|vade|"not"|telefon|adres|urunId|musteriId/i.test(k.metin), c.ad + ": alış, maliyet, kâr, komisyon, limit, vade, not, telefon alan adı yok");
    d.dogru(!GIZLI.some((g) => k.metin.includes(g)) && !k.metin.includes("Gizli Sokak") && !k.metin.includes("havale attı") && !k.metin.includes("Manuel borç"), c.ad + ": satış/ödeme/müşteri notlarının metni yok");
    d.dogru(!s0.customers.some((x) => x.id !== c.id && (k.metin.includes(x.ad) || (x.telefon && k.metin.includes(x.telefon)))) && !(c.telefon && k.metin.includes(c.telefon)), c.ad + ": başka müşterinin adı / telefon numarası yok");
    d.esit(h.bakiye, borc(s0, c.id), c.ad + ": kayıttaki bakiye = panelin borç formülü");
  }
  const m2 = (await hesapCoz(bulut, "m2")).metin;
  d.dogru(!/1750|52[.,]5|3210|1180/.test(m2), "Örnek Çay Ocağı: alış fiyatları (1750, 52,5), maliyet (1180), limit (3210) rakam olarak da yok");
  d.esit((await hesapCoz(bulut, "m2")).hesap.o.map((x) => x.tur), ["nakit", "nakit", "duzeltme", "duzeltme", "havale"], "ödeme türleri (nottan çıkarılan dahil) yalnız tür adı olarak girdi");
  d.esit(Object.keys((await telCoz(bulut, "05550000002")).icerik).sort(), ["k", "v"], "telefon kaydında yalnız kod var");
  const herkeseAcik = JSON.stringify(cariAnahtarlar(bulut).map((k) => bulut.satir(k)));
  d.dogru(!s0.customers.some((c) => herkeseAcik.includes(c.ad) || (c.telefon && herkeseAcik.includes(c.telefon))), "satırların şifresiz kısmında (anahtar, özet) müşteri adı / telefonu yok");

  console.log("— (a) araçla satış → sayfa");
  const once = goruntu(bulut), borcOnce = borc(store(), "m1");
  const satis = await arac("satis", JSON.stringify({ musteri: "Deneme Kıraathanesi", kalemler: [{ urun: "Örnek Bardak Su", adet: 10 }, { urun: "Örnek Kola", adet: 2 }], odeme: { nakit: 1000 }, stokKaynak: "arac" }), "--kaydet");
  d.dogru(satis.kod === 0 && /KAYDEDILDI - Belge/.test(satis.cikti), "satış kaydedildi");
  d.dogru(!/cari|wa\.me|UYARI/i.test(satis.cikti), "satış fişinin çıktısına cari/WhatsApp satırı eklenmedi");
  const yeniFis = store().sales[store().sales.length - 1].belgeNo, beklenen = borc(store(), "m1");
  d.esit(beklenen, borcOnce + 900 + 1280 - 1000, "bakiye 1.180 arttı (2.180 satış − 1.000 nakit)");
  const fark = degisenler(once, goruntu(bulut));
  d.esit(fark, { yazilan: [(await hesapCoz(bulut, "m1")).key], silinen: [] }, "(f) yalnız satış yapılan müşterinin hesap satırı yeniden yazıldı");

  const s = await sayfaAc({ bulutUrl: bulut.url });
  d.esit(await telefonlaGir(s.page, "0555 000 00 01"), "", "telefon numarasıyla girildi");
  let e = await hesapOku(s.page);
  d.esit([e.ad, e.etiket, e.bakiye], ["Deneme Kıraathanesi", "Kalan borcunuz", para(beklenen)], "telefonla: ad ve bakiye doğru (" + para(beklenen) + ")");
  d.dogru(e.fisler.includes(yeniFis) && e.fisler.length === 2, "telefonla: yeni fiş listede (" + yeniFis + ")");
  await s.page.evaluate((no) => { document.querySelector(`.fisb[data-no="${no}"]`).closest("details").open = true; }, yeniFis);
  const fisMetni = await s.page.locator(`.fisb[data-no="${yeniFis}"]`).innerText();
  d.dogru(/10\s+Örnek Bardak Su 200 ml\s+90\s+900/.test(fisMetni) && /2\s+Örnek Kola 250 ml\s+640\s+1\.280/.test(fisMetni) && /Toplam ₺2\.180,00/.test(fisMetni), "fiş açılınca kalemler, adet, fiyat (müşterinin özel fiyatı 90), tutar ve toplam görünüyor");
  d.dogru(/ödenen \(nakit\) ₺1\.000,00/.test(fisMetni) && /bu fişten kalan ₺1\.180,00/.test(fisMetni), "fişte ödenen ve kalan görünüyor");
  d.dogru(s.istekler.every((x) => x.yontem === "GET" && x.yol === "/rest/v1/kv" && x.sorgu.includes(ONEK)) && s.istekler.length === 2, "müşteri sayfası yalnız 2 okuma yaptı (telefon kaydı + hesap), ikisi de babuco:cari:*");
  await s.kapat();

  const link = await linkOlustur(bulut, "m1");
  const cl = await arac("cari-link", "Deneme Kıraathanesi");
  d.dogru(cl.kod === 0 && cl.cikti.includes(link) && /^https:\/\/runkekeone\.github\.io\/cayci-pos\/cari\/#k=[A-Za-z0-9_-]{22}$/.test(link), "cari-link kişisel linki veriyor (kod # kısmında)");
  const wa = (cl.cikti.match(/https:\/\/wa\.me\/\S+/) || [""])[0];
  d.dogru(wa.startsWith("https://wa.me/905550000001?text=") && decodeURIComponent(wa.split("text=")[1]).includes(link) && /Merhaba Deneme Kıraathanesi/.test(decodeURIComponent(wa.split("text=")[1])), "cari-link: WhatsApp bağlantısı doğru numaraya, metinde link var");
  const cl3 = await arac("cari-link", "Sınama");
  d.dogru(/TELEFON KAYITLI DEĞİL/.test(cl3.cikti) && /https:\/\/wa\.me\/\?text=/.test(cl3.cikti) && /yalnız bu linkle girer/.test(cl3.cikti), "telefonsuz müşteride cari-link bunu söylüyor, link yine veriliyor");

  const s2 = await sayfaAc({ bulutUrl: bulut.url, hash: link.slice(link.indexOf("#")) });
  e = await hesapOku(s2.page);
  d.esit([e.ad, e.bakiye, e.fisler.includes(yeniFis)], ["Deneme Kıraathanesi", para(beklenen), true], "kişisel linkle: telefon yazmadan açıldı, yeni fiş ve bakiye doğru");
  d.esit(s2.istekler.length, 1, "kişisel linkle tek okuma yapıldı");
  // canlılık: sayfa açıkken tahsilat girilir; sayfa yeniden açılınca yeni bakiye görünür
  const tah = await arac("tahsilat", "Deneme Kıraathanesi", "180", "--kaydet");
  d.dogru(tah.kod === 0 && !/cari|wa\.me/i.test(tah.cikti), "tahsilat kaydedildi (çıktısına ek satır girmedi)");
  await s2.page.reload();
  e = await hesapOku(s2.page);
  d.esit(e.bakiye, para(beklenen - 180), "sayfa yenilenince tahsilattan sonraki bakiye görünüyor (canlı)");
  d.dogru(/Ödeme alındı/.test(e.metin) && /−₺180,00/.test(e.metin), "tahsilat 'Ödeme alındı −₺180,00' diye görünüyor");
  d.esit(s2.hatalar, [], "sayfada betik hatası yok");
  await s2.kapat();

  // telefonsuz müşteri kişisel linkle girer
  const l3 = await linkOlustur(bulut, "m3");
  const s3 = await sayfaAc({ bulutUrl: bulut.url, hash: l3.slice(l3.indexOf("#")) });
  e = await hesapOku(s3.page);
  d.esit([e.ad, e.bakiye], ["Sınama Derneği", para(borc(store(), "m3"))], "telefonu kayıtlı olmayan müşteri kişisel linkle hesabını görüyor");
  await s3.kapat();

  console.log("— (d) yanlış telefon / bozuk link");
  const y = await sayfaAc({ bulutUrl: bulut.url });
  d.dogru(/kayıtlı hesap bulunamadı/.test(await telefonlaGir(y.page, "05559999999")), "kayıtlı olmayan numara: 'hesap bulunamadı'");
  d.dogru(/11 hane/.test(await telefonlaGir(y.page, "0212 555")), "eksik numara: biçim uyarısı, istek gitmedi");
  d.dogru(!(await y.page.$("#bakiyeTutar")) && !/Kıraathanesi|Çay Ocağı|Derneği|₺/.test(await y.page.innerText("#kok")), "ekranda hiçbir müşteri verisi yok");
  await y.kapat();
  const bozukKod = link.slice(link.indexOf("#")).replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  for (const [ad, hash] of [["son harfi değişmiş kod", bozukKod], ["kısa kod", "#k=abc"], ["tuhaf içerik", "#k=<script>alert(1)</script>"]]) {
    const b = await sayfaAc({ bulutUrl: bulut.url, hash });
    await b.page.waitForSelector("#giris");
    const metin = await b.page.innerText("#kok");
    d.dogru(!(await b.page.$("#bakiyeTutar")) && !/Kıraathanesi|₺/.test(metin) && /link/i.test(metin), "bozuk link (" + ad + "): veri yok, giriş ekranı + açıklama");
    d.esit(b.hatalar, [], "bozuk link (" + ad + "): betik hatası yok");
    await b.kapat();
  }

  console.log("— (g) telefonu değişen / silinen müşteri");
  const eskiTel = (await telCoz(bulut, "05550000004")).key, eskiHesap4 = (await hesapCoz(bulut, "m4")).key;
  let st = store(); st.customers.find((c) => c.id === "m4").telefon = "0555 000 00 44";
  bulut.kv.get("babuco:store").value = st;
  let g1 = goruntu(bulut);
  let r = await arac("cari-yayinla", "--kaydet");
  let f = degisenler(g1, goruntu(bulut));
  d.dogru(/1 kayıt yazıldı · 1 eski kayıt silindi/.test(r.cikti) && f.silinen.length === 1 && f.silinen[0] === eskiTel && !bulut.deger(eskiTel), "telefon değişince eski telefon kaydı silindi, yenisi yazıldı");
  d.dogru(!!(await telCoz(bulut, "05550000044")) && (await hesapCoz(bulut, "m4")).key === eskiHesap4, "yeni numara kayıtlı; müşterinin kodu (kişisel linki) değişmedi");
  const t = await sayfaAc({ bulutUrl: bulut.url });
  d.dogru(/bulunamadı/.test(await telefonlaGir(t.page, "05550000004")), "eski numarayla artık girilemiyor");
  d.esit(await telefonlaGir(t.page, "05550000044"), "", "yeni numarayla giriliyor");
  await t.kapat();
  // telefon silinir
  st = store(); st.customers.find((c) => c.id === "m4").telefon = ""; bulut.kv.get("babuco:store").value = st;
  r = await arac("cari-yayinla", "--kaydet");
  d.dogru(/0 kayıt yazıldı · 1 eski kayıt silindi/.test(r.cikti) && cariAnahtarlar(bulut, "t").length === 2, "telefon silinince telefon kaydı da silindi");
  // müşteri silinir (panelin yaptığı gibi: yalnız müşteri kartı kalkar)
  const l4 = await linkOlustur(bulut, "m4");
  st = store(); st.customers = st.customers.filter((c) => c.id !== "m4"); bulut.kv.get("babuco:store").value = st;
  r = await arac("cari-yayinla", "--kaydet");
  d.dogru(/3 müşteri · 0 kayıt yazıldı · 1 eski kayıt silindi/.test(r.cikti) && !bulut.deger(eskiHesap4), "müşteri silinince hesap satırı da silindi");
  const sil = await sayfaAc({ bulutUrl: bulut.url, hash: l4.slice(l4.indexOf("#")) });
  await sil.page.waitForSelector("#giris");
  d.dogru(/artık geçerli değil/.test(await sil.page.innerText("#kok")), "silinen müşterinin eski linki veri vermiyor");
  await sil.kapat();
  // aynı numara iki müşteride: ikincisi telefonla giremez, raporlanır
  st = store(); st.customers.find((c) => c.id === "m3").telefon = "05550000001"; bulut.kv.get("babuco:store").value = st;
  r = await arac("cari-yayinla", "--kaydet");
  d.dogru(/Sınama Derneği \(numarası "Deneme Kıraathanesi" ile aynı\)/.test(r.cikti) && (await telCoz(bulut, "05550000001")).icerik.k === (await linkOlustur(bulut, "m1")).split("#k=")[1], "aynı numara iki müşteride: numara ilk müşteride kalır, ikincisi raporlanır");

  console.log("— yayın başarısız olursa kayıt etkilenmez");
  kes = true;
  const satisSayisi = store().sales.length, g2 = goruntu(bulut);
  const s5 = await arac("satis", JSON.stringify({ musteri: "Örnek Çay Ocağı", kalemler: [{ urun: "Örnek Soda", adet: 1 }], odeme: "acik", stokKaynak: "arac" }), "--kaydet");
  d.dogru(s5.kod === 0 && /KAYDEDILDI - Belge/.test(s5.cikti) && store().sales.length === satisSayisi + 1, "cari yayını düşse de satış kaydedildi (çıkış kodu 0)");
  d.dogru(/UYARI: musteri cari sayfasi guncellenemedi/.test(s5.cikti), "yayın hatası uyarı olarak bildirildi");
  d.esit(degisenler(g2, goruntu(bulut)), { yazilan: [], silinen: [] }, "o sırada cari satırları değişmedi (eski hâl duruyor)");
  kes = false;
  const s6 = await arac("tahsilat", "Deneme Kıraathanesi", "50", "--kaydet");
  const f2 = degisenler(g2, goruntu(bulut));
  d.dogru(s6.kod === 0 && f2.yazilan.length === 2 && f2.yazilan.includes((await hesapCoz(bulut, "m2")).key) && f2.yazilan.includes((await hesapCoz(bulut, "m1")).key), "sonraki yazmada kaçan müşterinin kaydı da güncellendi (kendiliğinden toparladı)");
  d.esit((await hesapCoz(bulut, "m2")).hesap.bakiye, borc(store(), "m2"), "toparlanan kayıtta bakiye doğru");

  console.log("— kodları yenileme (--yeni-sir)");
  const eskiLink = await linkOlustur(bulut, "m1");
  r = await arac("cari-yayinla", "--yeni-sir", "--kaydet");
  d.dogru(r.kod === 0 && (await linkOlustur(bulut, "m1")) !== eskiLink && cariAnahtarlar(bulut, "h").length === 3, "--yeni-sir: kodlar değişti, eski hesap satırları silindi (3 müşteri = 3 satır)");
  const es = await sayfaAc({ bulutUrl: bulut.url, hash: eskiLink.slice(eskiLink.indexOf("#")) });
  await es.page.waitForSelector("#giris");
  d.dogru(!(await es.page.$("#bakiyeTutar")), "eski link artık açılmıyor");
  d.esit(await telefonlaGir(es.page, "05550000001"), "", "telefonla giriş yeni sırla da çalışıyor");
  await es.kapat();
} finally {
  await bulut.dur();
}
d.bitir();
