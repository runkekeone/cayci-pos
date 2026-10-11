// Veritabanı kilidi AÇIKKEN (kilit.sql çalıştırılmış gibi) cari sayfa + patron görünümü.
//  (c) oturumsuz tarayıcı müşteri sayfasını okuyabilir; babuco:store'u ve sırrı okuyamaz; babuco:cari:*'a yazamaz
//  (j) patron: oturumsuz giriş ister · yetkili hesap liste + hesap görür · hiçbir yazma isteği gitmez ·
//      yetkisiz hesap veri alamaz · panelde açık oturum varsa yeniden sormaz
// Çalıştır: node testler/cari/kilit.mjs
import os from "node:os";
import path from "node:path";
import { aracCalistir, denetci } from "../ortak/panel.mjs";
import { kilitliBulut, TOPTANCI, YABANCI, sinif } from "../giris/sahte-kilit.mjs";
import { cariStore, satirlar, borc, para, cariAnahtarlar, hesapCoz, goruntu, sayfaAc, hesapOku, telefonlaGir, linkOlustur, SIR_ANAHTAR, ONEK } from "./yardimci.mjs";

const d = denetci("cari-kilit");
const s0 = cariStore();
s0.customers.find((c) => c.id === "m3").limit = 100;                 // borcu 440 → "limit aşıldı" işareti
const bulut = await kilitliBulut({ satirlar: satirlar(s0), kilit: true });
const store = () => bulut.deger("babuco:store");
const oturumDosya = path.join(os.tmpdir(), "babuco-cari-" + process.pid + ".json");
const girisli = { env: { BABUCO_EPOSTA: TOPTANCI.eposta, BABUCO_SIFRE: TOPTANCI.sifre, BABUCO_OTURUM_DOSYA: oturumDosya } };

try {
  console.log("— sınıflandırma + kilitli yayın");
  d.esit([sinif("babuco:cari:h:abc"), sinif("babuco:cari:t:abc"), sinif(SIR_ANAHTAR), sinif("babuco:cari"), sinif("babuco:store")], ["acik", "acik", "ozel", "ozel", "ozel"], "babuco:cari:* açık (herkes okur, yetkili yazar); sır ve store özel");
  const oturumsuz = await aracCalistir(bulut.url, ["cari-yayinla", "--kaydet"], { env: { BABUCO_OTURUM_DOSYA: oturumDosya + ".yok" } });
  d.dogru(oturumsuz.kod !== 0 && /kilitli/i.test(oturumsuz.cikti) && cariAnahtarlar(bulut).length === 0, "oturumsuz araç kilitli veritabanında yayın yapamıyor");
  const yayin = await aracCalistir(bulut.url, ["cari-yayinla", "--kaydet"], girisli);
  d.dogru(yayin.kod === 0 && /4 müşteri · 7 kayıt yazıldı/.test(yayin.cikti), "girişli araç kilitli veritabanında yayınladı");
  const tah = await aracCalistir(bulut.url, ["tahsilat", "Deneme Kıraathanesi", "0.01", "--kaydet"], girisli);
  d.dogru(tah.kod === 0 && !/UYARI/.test(tah.cikti), "girişli araç kayıttan sonra cari kaydını uyarısız güncelledi");

  console.log("— (c) oturumsuz tarayıcı");
  const s = await sayfaAc({ bulutUrl: bulut.url });
  d.esit(await telefonlaGir(s.page, "05550000002"), "", "oturumsuz müşteri telefonla hesabını açtı");
  let e = await hesapOku(s.page);
  d.esit([e.ad, e.bakiye], ["Örnek Çay Ocağı", para(borc(store(), "m2"))], "hesap ve bakiye doğru");
  const disaridan = await s.page.evaluate(async ({ onek, sirAnahtar }) => {
    const bas = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };
    const oku = async (q) => { const r = await fetch(SB_URL + "/rest/v1/kv?" + q, { headers: bas }); return { durum: r.status, govde: await r.text() }; };
    const hepsi = JSON.parse((await oku("select=key")).govde).map((x) => x.key);
    const hedef = hepsi.find((k) => k.indexOf(onek + "h:") === 0);
    const yaz = await fetch(SB_URL + "/rest/v1/kv?on_conflict=key", { method: "POST", headers: Object.assign({ Prefer: "resolution=merge-duplicates" }, bas), body: JSON.stringify({ key: hedef, value: { v: 1, o: "x", d: "sahte" }, updated_at: new Date().toISOString() }) });
    const yeni = await fetch(SB_URL + "/rest/v1/kv?on_conflict=key", { method: "POST", headers: Object.assign({ Prefer: "resolution=merge-duplicates" }, bas), body: JSON.stringify({ key: onek + "h:sahte", value: {}, updated_at: new Date().toISOString() }) });
    const yama = await fetch(SB_URL + "/rest/v1/kv?key=eq." + encodeURIComponent(hedef), { method: "PATCH", headers: Object.assign({ Prefer: "return=representation" }, bas), body: JSON.stringify({ value: { d: "sahte" } }) });
    const sil = await fetch(SB_URL + "/rest/v1/kv?key=like." + encodeURIComponent(onek + "*"), { method: "DELETE", headers: Object.assign({ Prefer: "return=representation" }, bas) });
    return { hepsi, store: await oku("key=eq.babuco:store&select=value"), sir: await oku("key=eq." + sirAnahtar + "&select=value"), yaz: yaz.status, yeni: yeni.status, yama: [yama.status, await yama.text()], sil: [sil.status, await sil.text()] };
  }, { onek: ONEK, sirAnahtar: SIR_ANAHTAR });
  d.esit(disaridan.store.govde, "[]", "oturumsuz tarayıcı babuco:store'u okuyamıyor");
  d.esit(disaridan.sir.govde, "[]", "oturumsuz tarayıcı cari kodlarının sırrını okuyamıyor");
  d.dogru(disaridan.hepsi.filter((k) => k.indexOf(ONEK) === 0).length === 7 && disaridan.hepsi.every((k) => k.indexOf(ONEK) === 0 || k === "babuco:katalog"), "oturumsuz tarayıcının görebildiği satırlar: 7 şifreli cari satırı + ürün kataloğu (store, sır, yedek yok)");
  d.esit([disaridan.yaz, disaridan.yeni], [401, 401], "oturumsuz: var olan cari satırının üstüne de, yeni cari satırı da yazılamıyor");
  d.esit([disaridan.yama[1], disaridan.sil[1]], ["[]", "[]"], "oturumsuz: güncelleme ve silme hiçbir satıra dokunmuyor");
  const yabanci = await bulut.girisYap(YABANCI);
  const y1 = await bulut.istek("/rest/v1/kv?on_conflict=key", { method: "POST", jeton: yabanci.access_token, headers: { Prefer: "resolution=merge-duplicates" }, body: { key: ONEK + "h:sahte", value: {}, updated_at: new Date().toISOString() } });
  d.esit(y1.durum, 403, "giriş yapmış ama izinsiz hesap da cari satırı yazamıyor");
  d.esit(cariAnahtarlar(bulut).length, 7, "bütün bu denemelerden sonra cari satırları yerinde (7)");
  e = await (async () => { await s.page.reload(); return hesapOku(s.page); })();
  d.esit(e.bakiye, para(borc(store(), "m2")), "müşterinin hesabı bozulmadı");
  await s.kapat();

  console.log("— (j) patron: oturumsuz");
  const once = { cari: JSON.stringify(goruntu(bulut)), store: JSON.stringify(store()) };
  const p = await sayfaAc({ bulutUrl: bulut.url, hash: "#patron" });
  await p.page.waitForSelector("#patronGiris");
  d.dogru(!/Kıraathanesi|Çay Ocağı|Derneği|₺/.test(await p.page.innerText("#kok")) && p.istekler.length === 0, "oturumsuz: giriş ekranı; ekranda veri yok, veri isteği gitmedi");
  const gir = async (page, eposta, sifre) => {
    await page.fill("#pEposta", eposta); await page.fill("#pSifre", sifre); await page.click("#pGir");
    await page.waitForFunction(() => document.getElementById("toplamAlacak") || (document.getElementById("hata") && document.getElementById("hata").textContent && !document.getElementById("pGir").disabled), null, { timeout: 15000 });
    return page.evaluate(() => (document.getElementById("hata") || { textContent: "" }).textContent);
  };
  d.dogru(/yanlış/.test(await gir(p.page, TOPTANCI.eposta, "olmayan-sifre")), "yanlış şifre: 'E-posta ya da şifre yanlış'");
  d.dogru(/izni yok/.test(await gir(p.page, YABANCI.eposta, YABANCI.sifre)), "yetkisiz hesap: 'görme izni yok'");
  d.dogru(!/Kıraathanesi|Çay Ocağı|Derneği|₺/.test(await p.page.innerText("#kok")) && !(await p.page.evaluate(() => localStorage.getItem("babuco:oturum"))), "yetkisiz hesap: ekranda veri yok, oturumu saklanmadı");

  console.log("— (j) patron: yetkili hesap");
  d.esit(await gir(p.page, TOPTANCI.eposta, TOPTANCI.sifre), "", "yetkili hesap girdi");
  const S = store();
  const liste = await p.page.evaluate(() => ({ toplam: document.getElementById("toplamAlacak").textContent, satirlar: Array.from(document.querySelectorAll(".musteri"), (b) => b.innerText.replace(/\s*\n\s*/g, " | ")) }));
  const beklenenToplam = S.customers.reduce((a, c) => a + Math.max(0, borc(S, c.id)), 0);
  d.esit(liste.toplam, para(beklenenToplam), "toplam alacak üstte ve doğru (" + para(beklenenToplam) + ")");
  d.esit(liste.satirlar.map((x) => x.split(" | ")[0]), S.customers.slice().sort((a, b) => borc(S, b.id) - borc(S, a.id)).map((c) => c.ad), "bütün müşteriler borca göre sıralı (en borçlu üstte)");
  d.dogru(/gündür gecikmiş/.test(liste.satirlar[0]) && /limit aşıldı/.test(liste.satirlar[1]) && !/gecikmiş|limit/.test(liste.satirlar[2] + liste.satirlar[3]), "gecikme ve limit işaretleri doğru müşterilerde");
  await p.page.fill("#ara", "sınama");
  d.esit(await p.page.locator(".musteri").count(), 1, "arama listeyi süzüyor");
  await p.page.fill("#ara", "");
  await p.page.click('.musteri[data-id="m2"]');
  await p.page.waitForSelector("#waGonder");
  const patronHesap = await hesapOku(p.page);
  const link = await linkOlustur(bulut, "m2");
  const wa = await p.page.getAttribute("#waGonder", "href");
  d.dogru(wa.startsWith("https://wa.me/905550000002?text=") && decodeURIComponent(wa.split("text=")[1]).endsWith(link), "'Linkini gönder (WhatsApp)': doğru numara, metnin sonunda müşterinin kişisel linki");
  await p.context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await p.page.click("#kopyala");
  await p.page.waitForFunction(() => /Kopyalandı/.test(document.getElementById("kopyala").textContent));
  d.esit(await p.page.evaluate(() => navigator.clipboard.readText()), link, "'Linki kopyala' müşterinin kişisel linkini panoya koydu");
  // müşterinin kendi gördüğüyle aynı mı
  const m = await sayfaAc({ bulutUrl: bulut.url, hash: link.slice(link.indexOf("#")), browser: p.browser, sunucu: p.sunucu });
  const musteriHesap = await hesapOku(m.page);
  const govde = (page) => page.evaluate(() => (document.querySelectorAll("details.sv").forEach((x) => { x.open = true; }), Array.from(document.querySelectorAll("#bakiyeTutar, .tablo"), (x) => x.innerText).join("\n")));
  d.dogru(patronHesap.bakiye === musteriHesap.bakiye && patronHesap.ad === musteriHesap.ad && (await govde(p.page)) === (await govde(m.page)) && (await govde(m.page)).length > 200, "patronun gördüğü hesap, müşterinin gördüğünün aynısı (bakiye + bütün hareketler)");
  await m.kapat();
  await p.page.click("#geri");
  await p.page.waitForSelector("#toplamAlacak");
  d.dogru(true, "'‹ Müşteriler' listeye döndü");

  // yeniden açınca sormaz; jetonun süresi dolunca kendisi yeniler
  await p.page.reload();
  await p.page.waitForSelector("#toplamAlacak");
  d.dogru(true, "sayfa yeniden açılınca giriş sorulmadı");
  bulut.jetonlariEskit();
  const yenilemeOnce = bulut.sayac.yenileme;
  await p.page.goto(p.url + "#patron&m=m3");
  e = await hesapOku(p.page);
  d.dogru(e.ad === "Sınama Derneği" && bulut.sayac.yenileme === yenilemeOnce + 1, "süresi dolan jeton yenilendi; #patron&m=<id> doğrudan o müşteriyi açtı");
  d.dogru(p.istekler.every((x) => x.yol.indexOf("/rest/v1/") !== 0 || x.yontem === "GET") && p.istekler.filter((x) => x.yontem !== "GET").every((x) => x.yol === "/auth/v1/token"), "patron sayfasından veri tablosuna yalnız okuma isteği gitti (GET); yazma yok");
  d.dogru(JSON.stringify(goruntu(bulut)) === once.cari && JSON.stringify(store()) === once.store, "patron oturumu boyunca bulutta hiçbir satır değişmedi");
  d.esit(p.hatalar, [], "sayfada betik hatası yok");
  // patron sayfası panelin oturum kaydını kullanıyor/yeniliyor: panel aynı kayıtla açılmaya devam etmeli
  const panel = await p.context.newPage();
  await panel.goto(p.sunucu.url + "/toptanci/index.html");
  await panel.waitForFunction(() => window.app && window.app.getStore().customers.length === 4, null, { timeout: 20000 });
  d.dogru(!(await panel.$("#giris-kapi")), "patron sayfasında girilen ve yenilenen oturumla panel de şifre sormadan açılıyor (oturum kaydı bozulmadı)");
  await panel.close();
  await p.kapat();

  console.log("— (j) panelde açık oturum varsa sormaz; yetkisiz oturum veri alamaz");
  const p2 = await sayfaAc({ bulutUrl: bulut.url, hash: "#patron", oturum: await bulut.girisYap(TOPTANCI) });
  await p2.page.waitForSelector("#toplamAlacak");
  d.dogru(!(await p2.page.$("#patronGiris")), "panelin oturumu varken patron sayfası şifre sormadan açıldı");
  await p2.kapat();
  const p3 = await sayfaAc({ bulutUrl: bulut.url, hash: "#patron", oturum: await bulut.girisYap(YABANCI) });
  await p3.page.waitForSelector("#patronGiris");
  d.dogru(/izni yok/.test(await p3.page.innerText("#kok")) && !/Kıraathanesi|Çay Ocağı|₺/.test(await p3.page.innerText("#kok")), "yetkisiz hesabın oturumuyla: sade ret, veri yok");
  await p3.kapat();
} finally {
  await bulut.dur();
}
d.bitir();
