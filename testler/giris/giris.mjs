// Panelde giriş: oturumsuz açılış, yanlış/doğru şifre, kalıcı oturum, çıkış, oturum düşmesi.
// Çalıştır: node testler/giris/giris.mjs
import { panelAc, denetci, bekle } from "../ortak/panel.mjs";
import { ornekSatirlar } from "../ortak/ornek-store.mjs";
import { kilitliBulut, TOPTANCI, YABANCI } from "./sahte-kilit.mjs";
import { girisFormu, girisEkraniVar, panelGorunuyor, tabanPaneli, OTURUM_ANAHTAR } from "./yardimci.mjs";

const d = denetci("giris");
const musteriSayisi = (page) => page.evaluate(() => window.app.getStore().customers.length);
const veriIstekleri = (bulut) => bulut.istekler.filter((i) => i.yol.startsWith("/rest/v1/")).length;

// ---------- ÖNCE: eski panel girişsiz açılıyor, bütün müşteriler ekranda ----------
{
  const bulut = await kilitliBulut({ satirlar: ornekSatirlar() });
  const taban = tabanPaneli();
  const p = await panelAc({ bulutUrl: bulut.url, panelDizin: taban.dizin });
  try {
    await p.page.waitForFunction(() => window.app.getStore().customers.length === 4, null, { timeout: 10000 });
    d.dogru(await panelGorunuyor(p.page), "ÖNCE (eski sürüm): şifre sormadan açılıyor, 4 müşteri ekranda");
  } finally { await p.kapat(); await bulut.dur(); taban.sil(); }
}

// ---------- ŞİMDİ ----------
for (const kip of ["kilitsiz", "kilitli"]) {
  console.log("\n— veritabanı " + kip + " —");
  const bulut = await kilitliBulut({ satirlar: ornekSatirlar(), kilit: kip === "kilitli" });
  const p = await panelAc({ bulutUrl: bulut.url });
  const { page } = p;
  try {
    // 1) oturumsuz açılış
    await bekle(1200);
    d.dogru(await girisEkraniVar(page), kip + ": oturumsuz açılışta giriş ekranı var");
    d.dogru(!(await panelGorunuyor(page)), kip + ": panelin gövdesi görünmüyor");
    d.esit(await musteriSayisi(page), 0, kip + ": hiçbir müşteri yüklenmedi");
    d.esit(veriIstekleri(bulut), 0, kip + ": giriş yapılmadan buluta tek bir veri isteği gitmedi");
    d.dogru(await page.evaluate(() => !/kay[ıi]t ol|üye ol|hesap oluştur/i.test(document.getElementById("giris-kapi").textContent)), kip + ": giriş ekranında kayıt olma yok");

    // 2) boş + yanlış şifre + internet yok
    await page.click("#gkGir");
    d.esit(await page.textContent("#gkMesaj"), "E-posta ve şifreni yaz.", kip + ": boş bırakınca sade uyarı");
    d.esit(await girisFormu(page, TOPTANCI.eposta, "yanlis"), "E-posta ya da şifre yanlış.", kip + ": yanlış şifre mesajı");
    d.dogru(await girisEkraniVar(page) && (await musteriSayisi(page)) === 0 && veriIstekleri(bulut) === 0, kip + ": yanlış şifreden sonra hâlâ veri yok");
    bulut.kapat();
    d.esit(await girisFormu(page, TOPTANCI.eposta, TOPTANCI.sifre), "Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.", kip + ": internet yokken sade mesaj");
    bulut.ac();
    bulut.durum.girisHata = 429;
    d.esit(await girisFormu(page, TOPTANCI.eposta, TOPTANCI.sifre), "Çok fazla deneme yapıldı. Birkaç dakika bekleyip tekrar dene.", kip + ": çok deneme mesajı");
    bulut.durum.girisHata = null;

    // 3) doğru şifre
    d.esit(await girisFormu(page, TOPTANCI.eposta, TOPTANCI.sifre), "", kip + ": doğru şifreyle giriş ekranı kapandı");
    await page.waitForFunction(() => window.app.getStore().customers.length === 4, null, { timeout: 10000 });
    d.dogru(await panelGorunuyor(page), kip + ": girişten sonra veri geldi (4 müşteri) ve panel görünüyor");
    d.dogru(!bulut.istekler.some((i) => i.yol.includes("signup")), kip + ": kayıt (signup) isteği hiç yok");

    // 4) satış buluta gidiyor
    const onceki = bulut.deger("babuco:store").sales.length;
    await page.evaluate(() => { window.app.addToCart("u2"); window.app.finalizeSale("nakit"); });
    await bekle(1800);
    d.esit(bulut.deger("babuco:store").sales.length, onceki + 1, kip + ": girişli panel satışı buluta yazdı");
    if (kip === "kilitli") d.dogru(bulut.istekler.filter((i) => i.yol === "/rest/v1/kv" && i.yontem === "POST").every((i) => i.rol === "authenticated"), "kilitli: kv yazımları kullanıcının oturumuyla gitti");

    // 5) sayfa yenilenince tekrar sormaz
    await page.reload();
    await page.waitForFunction(() => window.app && window.app.getStore().customers.length === 4, null, { timeout: 10000 });
    d.dogru(!(await girisEkraniVar(page)) && (await panelGorunuyor(page)), kip + ": sayfa yenilenince tekrar şifre sormadı");
    d.esit(bulut.sayac.giris, 1, kip + ": yenilemede yeniden giriş isteği atılmadı");

    // 6) internet yokken de (saklı oturumla) açılır
    bulut.kapat();
    await page.reload();
    await page.waitForFunction(() => window.app && typeof girisKapisi === "function");
    const kapi = await page.evaluate(() => Promise.race([girisKapisi().then(() => "acik"), new Promise((r) => setTimeout(() => r("kapali"), 800))]));
    d.dogru(kapi === "acik" && !(await girisEkraniVar(page)) && (await musteriSayisi(page)) === 4, kip + ": internet yokken saklı oturumla açıldı, yerel veri duruyor");
    bulut.ac();
    await page.reload();
    await page.waitForFunction(() => window.app && window.app.getStore().customers.length === 4);

    // 7) erişim jetonunun süresi dolarsa sessizce yenilenir
    bulut.jetonlariEskit();
    const okundu = await page.evaluate(() => kvGet("babuco:store").then((r) => !!(r && r.value && r.value.customers.length === 4)));
    d.dogru(okundu && bulut.sayac.yenileme >= 1 && !(await girisEkraniVar(page)), kip + ": süresi dolan jeton kendiliğinden yenilendi, şifre sorulmadı");

    // 8) oturum iptal edilirse: giriş ekranı gelir, bulut "boş" sanılıp üstüne yazılmaz
    const buluttaki = JSON.stringify(bulut.deger("babuco:store"));
    bulut.oturumlariDusur();
    await page.evaluate(() => { window.__hyd = bulutHydrate().then(() => "bitti"); });
    await page.waitForSelector("#giris-kapi", { timeout: 10000 });
    await bekle(1500);
    d.esit(await page.textContent("#gkMesaj"), "Oturumun kapanmış. Yeniden giriş yap.", kip + ": oturum iptal edilince giriş ekranına döndü");
    d.dogru(!(await panelGorunuyor(page)), kip + ": oturum düşünce panel gizlendi");
    d.dogru(JSON.stringify(bulut.deger("babuco:store")) === buluttaki, kip + ": oturum düşünce buluttaki veri DEĞİŞMEDİ (boş sanılıp yazılmadı)");
    d.dogru(await page.evaluate((a) => !!localStorage.getItem("benimpos-app-v1") && !localStorage.getItem(a), OTURUM_ANAHTAR), kip + ": kendiliğinden düşen oturumda yerel kopya silinmedi");
    d.esit(await girisFormu(page, TOPTANCI.eposta, TOPTANCI.sifre), "", kip + ": yeniden giriş yapıldı");
    d.esit(await page.evaluate(() => window.__hyd), "bitti", kip + ": bekleyen bulut isteği girişten sonra tamamlandı");
    d.dogru(JSON.stringify(bulut.deger("babuco:store")) === buluttaki && (await musteriSayisi(page)) === 4, kip + ": yeniden girişten sonra veri yerinde");

    // 9) çıkış: önce buluta gitmemiş iş varsa uyarır
    await page.evaluate(() => { window.app.getStore().customers[0].ad = "Değişti ama gitmedi"; });
    let soru = 0;
    const iptalEdenDiyalog = async (dl) => { soru++; if (soru === 2) await dl.dismiss(); else await dl.accept(); };
    page.removeAllListeners("dialog"); page.on("dialog", iptalEdenDiyalog);
    await page.click("#userBtn"); await page.click("#userDropdown a:has-text('Çıkış Yap')");
    await page.waitForFunction(() => true); await bekle(3500);
    d.dogru(soru === 2 && !(await girisEkraniVar(page)) && (await page.evaluate((a) => !!localStorage.getItem(a), OTURUM_ANAHTAR)), kip + ": buluta gitmemiş değişiklik varken çıkış ikinci kez sordu; vazgeçince çıkmadı");
    await page.evaluate(() => { window.app.saveStore(); });
    await bekle(1800);

    // 10) çıkış
    page.removeAllListeners("dialog"); soru = 0; page.on("dialog", async (dl) => { soru++; await dl.accept(); });
    await page.click("#userBtn"); await page.click("#userDropdown a:has-text('Çıkış Yap')");
    await page.waitForSelector("#giris-kapi", { timeout: 10000 });
    await page.waitForFunction(() => window.app && typeof window.app.getStore === "function");
    d.esit(soru, 1, kip + ": her şey buluttayken çıkış tek soruyla bitti");
    d.dogru(await girisEkraniVar(page) && !(await panelGorunuyor(page)), kip + ": çıkıştan sonra giriş ekranı");
    d.esit(await page.evaluate(() => Object.keys(localStorage).filter((k) => k === "benimpos-app-v1" || k === "servis-v1" || k.startsWith("babuco:"))), [], kip + ": çıkışta bu cihazdaki veri kopyası ve oturum silindi");
    d.esit(await musteriSayisi(page), 0, kip + ": çıkıştan sonra bellekte müşteri yok");
    d.esit(bulut.deger("babuco:store").customers.length, 4, kip + ": çıkış buluttaki veriye dokunmadı");
    const istekOnce = veriIstekleri(bulut);
    await bekle(1500);
    d.esit(veriIstekleri(bulut), istekOnce, kip + ": çıkıştan sonra buluta veri isteği gitmiyor");
    d.esit(p.hatalar, [], kip + ": sayfada betik hatası yok");
  } finally { await p.kapat(); await bulut.dur(); }
}

// ---------- kilitliyken izin listesinde olmayan hesap ----------
{
  console.log("\n— izin listesinde olmayan hesap —");
  const bulut = await kilitliBulut({ satirlar: ornekSatirlar(), kilit: true });
  const once = JSON.stringify(bulut.deger("babuco:store"));
  const p = await panelAc({ bulutUrl: bulut.url });
  try {
    d.esit(await girisFormu(p.page, YABANCI.eposta, YABANCI.sifre), "Bu hesabın panele girme izni yok.", "izinsiz hesap: sade ret mesajı");
    await bekle(1500);
    d.dogru(await girisEkraniVar(p.page) && (await musteriSayisi(p.page)) === 0, "izinsiz hesap: içeri alınmadı, veri yok");
    d.dogru(JSON.stringify(bulut.deger("babuco:store")) === once, "izinsiz hesap: buluttaki veri değişmedi");
    d.dogru(await p.page.evaluate((a) => !localStorage.getItem(a), OTURUM_ANAHTAR), "izinsiz hesabın oturumu cihazda bırakılmadı");
    d.esit(p.hatalar, [], "izinsiz hesap: betik hatası yok");
  } finally { await p.kapat(); await bulut.dur(); }
}

// ---------- kilit kurulmadan önce eski politika yalnız oturumsuz role izin veriyorsa ----------
{
  console.log("\n— kilit öncesi: eski politika yalnız oturumsuz role açık —");
  const bulut = await kilitliBulut({ satirlar: ornekSatirlar(), oncekiDuzen: "yalniz-anon" });
  const p = await panelAc({ bulutUrl: bulut.url });
  try {
    d.esit(await girisFormu(p.page, TOPTANCI.eposta, TOPTANCI.sifre), "", "eski düzen: giriş yapıldı");
    await p.page.waitForFunction(() => window.app.getStore().customers.length === 4, null, { timeout: 10000 });
    const onceki = bulut.deger("babuco:store").sales.length;
    await p.page.evaluate(() => { window.app.addToCart("u2"); window.app.finalizeSale("nakit"); });
    await bekle(1800);
    d.esit(bulut.deger("babuco:store").sales.length, onceki + 1, "eski düzen: veri geldi ve satış yazıldı (herkese açık anahtara düşerek)");
    // panel açıkken kilit kurulursa: bir sonraki istek kullanıcının oturumuyla sürer
    bulut.kilitle();
    await p.page.evaluate(() => { window.app.addToCart("u1"); window.app.finalizeSale("nakit"); });
    await bekle(1800);
    d.esit(bulut.deger("babuco:store").sales.length, onceki + 2, "panel açıkken kilit kuruldu: yazma kesintisiz sürdü");
    d.esit(await p.page.evaluate(() => bulutYetkiliMi()), true, "bulutYetkiliMi(): yetkili hesapta true");
    d.esit(p.hatalar, [], "eski düzen: betik hatası yok");
  } finally { await p.kapat(); await bulut.dur(); }
}

d.bitir();
