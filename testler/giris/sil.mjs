// "Tüm Verileri Sil" korumaları: şifre + yazılı onay + önce yedek; yedek alınamazsa silme.
// Çalıştır: node testler/giris/sil.mjs
import { panelAc, denetci, bekle } from "../ortak/panel.mjs";
import { ornekSatirlar } from "../ortak/ornek-store.mjs";
import { kilitliBulut, TOPTANCI } from "./sahte-kilit.mjs";
import { oturumluPanelAc, girisEkraniVar, tabanPaneli } from "./yardimci.mjs";

const d = denetci("sil");
const buluttaMusteri = (bulut) => bulut.deger("babuco:store").customers.length;

// ---------- ÖNCE: iki "Tamam" yetiyordu, şifre ve yedek yoktu ----------
{
  const bulut = await kilitliBulut({ satirlar: ornekSatirlar() });
  const taban = tabanPaneli();
  const p = await panelAc({ oturumsuz: true, bulutUrl: bulut.url, panelDizin: taban.dizin, yol: "#/profilim" });
  try {
    await p.page.waitForFunction(() => window.app.getStore().customers.length === 4);
    await p.page.click("li[data-ptab='3']");
    await p.page.click("#wipeBtn");
    await bekle(1800);
    d.dogru(buluttaMusteri(bulut) === 0 && !bulut.kv.has("babuco:yedek:silme-oncesi") && [...bulut.kv.keys()].every((k) => !k.startsWith("babuco:yedek")),
      "ÖNCE (eski sürüm): iki 'Tamam' ile buluttaki bütün müşteriler silindi, şifre sorulmadı, yedek alınmadı");
  } finally { await p.kapat(); await bulut.dur(); taban.sil(); }
}

// ---------- ŞİMDİ ----------
for (const kip of ["kilitsiz", "kilitli"]) {
  console.log("\n— " + kip + " —");
  const bulut = await kilitliBulut({ satirlar: ornekSatirlar(), kilit: kip === "kilitli" });
  const p = await oturumluPanelAc({ bulutUrl: bulut.url, oturum: await bulut.girisYap(TOPTANCI), yol: "#/profilim" });
  const { page } = p;
  const dene = async (sifre, onay) => {
    if (!(await page.$(".gs-sil-kap"))) { await page.click("li[data-ptab='3']"); await page.click("#wipeBtn"); await page.waitForSelector(".gs-sil-kap #gsSifre"); }
    await page.fill("#gsSifre", sifre); await page.fill("#gsOnay", onay);
    await page.click(".gs-sil-kap .ok");
    await page.waitForFunction(() => !document.querySelector(".gs-sil-kap") || (document.getElementById("gsMesaj").textContent !== "Kontrol ediliyor…" && document.getElementById("gsMesaj").textContent !== ""), null, { timeout: 10000 });
    return page.evaluate(() => { const m = document.getElementById("gsMesaj"); return m ? m.textContent : "(pencere kapandı)"; });
  };
  const yerinde = async (ne) => { await bekle(1500); d.dogru(buluttaMusteri(bulut) === 4 && (await page.evaluate(() => window.app.getStore().customers.length)) === 4, ne); };
  try {
    await page.waitForFunction(() => window.app.getStore().customers.length === 4);
    // düğmeye basmak tek başına hiçbir şey silmez; eski "Tamam / Tamam" yolu yok
    await page.click("li[data-ptab='3']"); await page.click("#wipeBtn");
    await page.waitForSelector(".gs-sil-kap #gsSifre");
    d.esit(p.diyaloglar.length, 0, kip + ": eski 'Emin misiniz?' onayı yok; şifre isteyen pencere açıldı");
    await yerinde(kip + ": pencere açılınca hiçbir şey silinmedi");

    d.esit(await dene(TOPTANCI.sifre, "evet"), "Onay kutusuna SİL yaz.", kip + ": onay sözcüğü yanlışsa silmez");
    d.esit(await dene("", "SİL"), "Şifreni yaz.", kip + ": şifre boşsa silmez");
    d.esit(await dene("yanlis-sifre", "SİL"), "Şifre yanlış. Hiçbir şey silinmedi.", kip + ": şifre yanlışsa silmez");
    await yerinde(kip + ": yanlış şifreden sonra veri yerinde");

    // yedek alınamıyor → silme
    await page.evaluate(() => { window.yedekAl = async () => false; });
    d.esit(await dene(TOPTANCI.sifre, "SİL"), "Yedek alınamadı. Hiçbir şey silinmedi.", kip + ": yedekAl false dönerse silmez");
    await page.evaluate(() => { window.yedekAl = async () => { throw new Error("patladı"); }; });
    d.esit(await dene(TOPTANCI.sifre, "SİL"), "Yedek alınamadı. Hiçbir şey silinmedi.", kip + ": yedekAl hata verirse silmez");
    await yerinde(kip + ": yedek alınamayınca veri yerinde");

    // internet yok → silme
    await page.evaluate(() => { window.__cagri = []; window.yedekAl = async (etiket) => { window.__cagri.push(etiket); return kvSet("babuco:yedek:" + etiket, JSON.parse(JSON.stringify(store)), new Date().toISOString()); }; });
    bulut.kapat();
    d.esit(await dene(TOPTANCI.sifre, "SİL"), "Şifre doğrulanamadı (bağlantı sorunu). Hiçbir şey silinmedi.", kip + ": internet yokken silmez");
    bulut.ac();
    await yerinde(kip + ": internet kesikken veri yerinde");
    d.esit(await page.evaluate(() => window.__cagri), [], kip + ": şifre doğrulanmadan yedek/silme adımına geçilmedi");

    // her şey tamam → önce yedek, sonra silme
    d.esit(await dene(TOPTANCI.sifre, "sil"), "(pencere kapandı)", kip + ": doğru şifre + SİL + yedek alındı → silindi");
    d.esit(await page.evaluate(() => window.__cagri), ["silme-oncesi"], kip + ": silmeden önce yedekAl('silme-oncesi') çağrıldı");
    d.esit(bulut.deger("babuco:yedek:silme-oncesi").customers.length, 4, kip + ": yedekte 4 müşteri duruyor (yedek silmeden ÖNCE alınmış)");
    await bekle(1800);
    d.esit(await page.evaluate(() => window.app.getStore().customers.length), 0, kip + ": panelde müşteri kalmadı");
    d.esit(buluttaMusteri(bulut), 0, kip + ": silme buluta da işlendi");
    d.dogru(!(await girisEkraniVar(page)) && (await page.evaluate(() => oturumKayitli())), kip + ": şifre doğrulaması açık oturumu bozmadı");
    d.esit(p.hatalar, [], kip + ": betik hatası yok");
  } finally { await p.kapat(); await bulut.dur(); }
}

d.bitir();
