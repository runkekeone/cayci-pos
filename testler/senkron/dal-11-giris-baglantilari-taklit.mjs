// NOT: Bu senaryo giriş bölümünü TAKLİT eder; yalnız duzeltme/senkron dalında tek başına geçer. Birleşik kodda yerini testler/ortak/butun.mjs aldı.
// Senaryo 11: giriş bölümüyle bağlantı noktaları (o bölümün kodu bu dalda yok; burada taklit edilir).
//   · girisKapisi() çözülmeden buluta HİÇ dokunulmaz; o sırada yapılan kayıt telefonda bekler, kapı açılınca gider.
//   · bulutYetkiliMi() false iken buluttan gelen boş yanıt "bulut boş" sayılmaz: yazma / yedek yok.
//   · "babuco:cikis": eşitleme durur; ardından store boşaltılsa bile bulut SİLİNMEZ, telefona kopya yazılmaz.
//     "babuco:giris": sıfırdan başlar, bulut alınır.
//   · bekleyenDegisiklikVar(), yedekAl() kesin true/false, "babuco:bulut-yazildi" olayı.
// Çalıştır: node testler/senkron/11-giris-baglantilari.mjs
import { statikSunucu, PANEL_DIZIN } from "../ortak/panel.mjs";
import { senkronBulut, panel, satis, hazir, esitlendi, yokla, baglantiKes, baglantiAc, denetci, bekle, ornekStore, ornekSatirlar, bul, ayni, STORE } from "./yardimci.mjs";

const d = denetci("11-giris-baglantilari");
const ilk = ornekStore();
const sunucu = await statikSunucu(PANEL_DIZIN);

console.log("— giriş kapısı");
{
  const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
  const p = await panel(bulut, { panelUrl: sunucu.url, storageState: { cookies: [], origins: [{ origin: sunucu.url, localStorage: [{ name: "deneme:kapi", value: "1" }] }] } });
  try {
    // Kapıyı taklit et: sayfa yeniden yüklenince girisKapisi tanımlı olsun ve elle açılana kadar beklesin.
    await p.context.addInitScript(() => { if (localStorage.getItem("deneme:kapi")) { window.girisKapisi = () => new Promise((ac) => { window.__kapiyiAc = ac; }); window.__yazildi = 0; window.addEventListener("babuco:bulut-yazildi", () => { window.__yazildi++; }); } });
    await p.page.reload();
    await p.page.waitForFunction(() => window.app && typeof window.__kapiyiAc === "function");
    const okumaOnce = bulut.ayar.okumalar, istekOnce = bulut.gunluk.length;
    const ps = await satis(p.page, "u1", "nakit", null, 1);
    await bekle(2500);
    d.esit([bulut.gunluk.length - istekOnce, bulut.ayar.okumalar - okumaOnce], [0, 0], "kapı açılmadan buluta tek istek bile gitmedi (okuma dahil)");
    d.esit(await p.page.evaluate(() => bekleyenDegisiklikVar()), true, "kapı kapalıyken yapılan kayıt bekliyor: bekleyenDegisiklikVar() = true");
    await p.page.evaluate(() => window.__kapiyiAc());
    await hazir(p.page); await esitlendi(p.page);
    d.dogru(!!bul(bulut.store().sales, ps.id) && bulut.store().sales.length === 6, "kapı açılınca bulut alındı ve bekleyen satış birleştirilerek gitti");
    d.esit(await p.page.evaluate(() => [bekleyenDegisiklikVar(), window.__yazildi >= 1]), [false, true], "gidince bekleyenDegisiklikVar() = false; \"babuco:bulut-yazildi\" olayı yayınlandı");
  } catch (e) { d.dogru(false, "kapı bölümü yarıda kesildi: " + e.message); }
  finally { await p.kapat(); await bulut.dur(); }
}

console.log("— yetki yokken boş yanıt");
{
  const bulut = await senkronBulut({ satirlar: [] });                 // yetkisiz istemcinin gördüğü: hiç satır yok
  const p = await panel(bulut, { panelUrl: sunucu.url, storageState: { cookies: [], origins: [{ origin: sunucu.url, localStorage: [{ name: "benimpos-app-v1", value: JSON.stringify(ilk) }, { name: "deneme:yetki", value: "yok" }] }] } });
  try {
    await p.context.addInitScript(() => { window.bulutYetkiliMi = () => localStorage.getItem("deneme:yetki") !== "yok"; });
    await p.page.reload();
    await p.page.waitForFunction(() => window.app && typeof bulutYetkiliMi === "function");
    // (ilk açılışta taklit henüz yoktu; o açılışın oluşturduğu kaydı kaldır → oturumu düşmüş istemcinin gördüğü gibi: satır yok)
    await bekle(1500); bulut.kv.delete(STORE); bulut.ayar.yazmalar.length = 0;
    await satis(p.page, "u1", "nakit", null, 1);
    await bekle(2500); await yokla(p.page); await bekle(500);
    d.esit(bulut.ayar.yazmalar.length, 0, "yetki yokken: telefonda gerçek veri + yeni satış olsa da buluta hiçbir şey yazılmadı (kayıt da yedek de)");
    d.esit(await p.page.evaluate(() => yedekAl("silme-oncesi")), false, "yetki yokken yedekAl() kesin false");
    d.esit(await p.page.evaluate(() => store.sales.length), 6, "telefondaki veri yerinde, bekliyor");
    await p.page.evaluate(() => { localStorage.setItem("deneme:yetki", "var"); window.dispatchEvent(new CustomEvent("babuco:giris")); });
    await esitlendi(p.page);
    d.esit((bulut.store() || { sales: [] }).sales.length, 6, "yetki gelince (\"babuco:giris\") bekleyenler gitti");
    d.esit(await p.page.evaluate(() => yedekAl("silme-oncesi")), true, "yetki varken yedekAl() kesin true");
    d.dogru(bulut.yedekAnahtarlari().some((k) => k.endsWith("-silme-oncesi")), "…ve yedek gerçekten bulutta");
  } catch (e) { d.dogru(false, "yetki bölümü yarıda kesildi: " + e.message); }
  finally { await p.kapat(); await bulut.dur(); }
}

console.log("— çıkış / yeniden giriş");
{
  const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
  const p = await panel(bulut);
  try {
    await hazir(p.page);
    const ps = await satis(p.page, "u1", "nakit", null, 1); await esitlendi(p.page);
    const onceki = JSON.parse(JSON.stringify(bulut.store()));
    const yazma = bulut.ayar.yazmalar.length;
    // çıkış: giriş bölümü olayı yayınlar, "babuco:" anahtarlarını ve çalışan kopyayı siler, store'u boşaltır
    await p.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("babuco:cikis"));
      Object.keys(localStorage).forEach((k) => { if (k.indexOf("babuco:") === 0 || k === STORE_KEY) localStorage.removeItem(k); });
      store = emptyStore(); saveStore(); render();
    });
    await bekle(2500); await yokla(p.page); await bekle(500);
    d.esit(bulut.ayar.yazmalar.length, yazma, "çıkıştan sonra store boşaltıldı ama buluta HİÇBİR şey yazılmadı");
    d.dogru(ayni(bulut.store(), onceki), "buluttaki veri olduğu gibi duruyor (boş store \"her şeyi sil\" diye gitmedi)");
    d.esit(await p.page.evaluate(() => [localStorage.getItem(STORE_KEY), localStorage.getItem("babuco:store:gunluk"), bekleyenDegisiklikVar()]), [null, null, false], "çıkıştan sonra telefona kopya / günlük yazılmadı");
    // yeniden giriş
    await p.page.evaluate(() => window.dispatchEvent(new CustomEvent("babuco:giris")));
    await hazir(p.page); await esitlendi(p.page);
    d.esit(await p.page.evaluate(() => [store.sales.length, store.customers.length]), [6, 4], "yeniden girişte bulut alındı (6 satış, 4 müşteri)");
    d.dogru(ayni(bulut.store(), onceki) && bulut.ayar.yazmalar.length === yazma, "girişte de buluta bir şey yazılmadı");
    const s2 = await satis(p.page, "u2", "nakit", null, 1); await esitlendi(p.page);
    d.dogru(!!bul(bulut.store().sales, s2.id) && !!bul(bulut.store().sales, ps.id) && bulut.store().sales.length === 7, "girişten sonra satış normal eşitleniyor, eski kayıtlar yerinde");
    d.esit(p.hatalar, [], "sayfada betik hatası yok");
  } catch (e) { d.dogru(false, "çıkış bölümü yarıda kesildi: " + e.message); }
  finally { await p.kapat(); await bulut.dur(); }
}
await sunucu.dur();
d.bitir();
