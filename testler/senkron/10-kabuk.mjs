// Senaryo 10: çevrimdışı kabuk (public/toptanci/sw.js) — uygulama KAPALIYKEN internet giderse de açılabilsin.
//   · Panel bir kez internetle açılır (dosyalar saklanır), sonra hem sayfa sunucusu hem bulut erişilmez olur.
//   · Panel yeniden açılır: sayfa saklanan kopyadan gelir, veriler telefonda, satış yapılır.
//   · İnternet gelince satış buluta gider. İnternet varken yeni sürüm yayınlanmışsa ESKİ kopya değil YENİSİ gelir.
// Güvenlik: service worker devredeyken tarayıcının istek yönlendirmesi atlanabilir; bu yüzden tarayıcı
// "127.0.0.1 dışındaki hiçbir adresi çözemez" kuralıyla açılır → gerçek buluta gitmesi imkânsız.
// Çalıştır: node testler/senkron/10-kabuk.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { statikSunucu, PANEL_DIZIN } from "../ortak/panel.mjs";
import { senkronBulut, panel, yenidenAc, satis, hazir, esitlendi, yokla, baglantiKes, baglantiAc, kosul, denetci, bekle, ornekStore, ornekSatirlar, bul } from "./yardimci.mjs";

const d = denetci("10-kabuk");
const { chromium } = await import("playwright");
const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"] });
const ilk = ornekStore();
const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk) });
const dizin = process.env.SENKRON_PANEL ? path.resolve(process.env.SENKRON_PANEL) : PANEL_DIZIN;
let sunucu = await statikSunucu(dizin);
const port = Number(new URL(sunucu.url).port), adres = sunucu.url;
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "babuco-kabuk-"));
const swIzni = { cookies: [], origins: [{ origin: adres, localStorage: [{ name: "babuco:sw-dene", value: "1" }] }] };
let p = null, q = null;
try {
  // --- kabuksuz (bugünkü durum): sayfa sunucusuna erişilemezse panel hiç açılmaz ---
  q = await panel(bulut, { browser, panelUrl: adres });
  await hazir(q.page);
  d.esit(await q.page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), false, "deneme/geliştirme adresinde kabuk kendiliğinden KURULMAZ (diğer denemeleri etkilemez)");
  await q.page.close();

  // --- kabuklu ---
  p = await panel(bulut, { browser, panelUrl: adres, storageState: swIzni });
  await hazir(p.page);
  const saklananSayisi = (page) => page.evaluate(async () => {
    const k = await navigator.serviceWorker.getRegistration();
    if (!k || !k.active) return 0;
    return (await (await caches.open("toptanci-kabuk-v1")).keys()).length;
  });
  await kosul(async () => (await saklananSayisi(p.page)) >= 10, 20000, "kabuk dosyalarının saklanması");
  const saklanan = await p.page.evaluate(async () => (await (await caches.open("toptanci-kabuk-v1")).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search));
  d.dogru(["/index.html", "/app.js", "/styles.css", "/seed.js", "/vendor/supabase.js", "/stil-senkron.css"].every((f) => saklanan.some((s) => s.split("?")[0] === f)), "panelin dosyaları saklandı (" + saklanan.length + " dosya)");
  const s1 = await satis(p.page, "u1", "nakit", null, 1);
  await esitlendi(p.page);
  d.dogru(!!bul(bulut.store().sales, s1.id), "kabuk devredeyken bulut eşitlemesi normal çalışıyor");
  await p.page.close();

  // --- her şey erişilmez: sayfa sunucusu kapalı + telefonun interneti yok ---
  await sunucu.dur();
  await baglantiKes(p);
  const kabuksuz = await q.context.newPage();
  const acilamadi = await kabuksuz.goto(adres + "/index.html", { timeout: 8000 }).then(() => false, () => true);
  d.dogru(acilamadi, "kabuk yokken: internet/sunucu yoksa panel AÇILAMIYOR (bugünkü durum)");
  await kabuksuz.close();

  const y = await yenidenAc(p);
  d.dogru(true, "kabuk varken: panel internetsiz AÇILDI");
  await yokla(y.page);
  d.esit(await y.page.evaluate(() => [store.sales.length, store.customers.length, !!document.getElementById("net-kapi"), !!document.getElementById("es-serit")]), [6, 4, false, true], "veriler telefonda, kilit yok, \"İnternet yok\" şeridi var");
  const s2 = await satis(y.page, "u2", "acik", "m1", 1);
  await bekle(1300);
  d.dogru(await y.page.evaluate(() => esBekleyenVar()) && !bul(bulut.store().sales, s2.id), "internetsiz satış yapıldı, telefonda bekliyor");
  await y.page.close();

  // --- internet geldi; bu arada YENİ SÜRÜM yayınlanmış ---
  fs.cpSync(dizin, gecici, { recursive: true });
  fs.appendFileSync(path.join(gecici, "app.js"), "\nwindow.__yeniSurum = true;\n");
  sunucu = await statikSunucu(gecici, port);
  baglantiAc(p);
  const z = await yenidenAc(p);
  d.esit(await z.page.evaluate(() => window.__yeniSurum === true), true, "internet varken saklanan eski kopya değil, YENİ sürüm yüklendi (önce-ağ)");
  await hazir(z.page); await esitlendi(z.page);
  d.dogru(!!bul(bulut.store().sales, s2.id), "internetsiz yapılan satış buluta gitti");
  d.esit(bulut.store().sales.length, ilk.sales.length + 2, "toplam satış: 5 + 2");

  // yeni sürüm de saklandı mı: tekrar internetsiz aç
  await kosul(() => z.page.evaluate(async () => { const r = await (await caches.open("toptanci-kabuk-v1")).match(location.origin + "/app.js?v=" + new URL(document.querySelector('script[src^="app.js"]').src).searchParams.get("v")); return !!r && (await r.text()).includes("__yeniSurum"); }), 15000, "yeni sürümün saklanması");
  await z.page.close();
  await sunucu.dur(); sunucu = null;
  await baglantiKes(p);
  const w = await yenidenAc(p);
  d.esit(await w.page.evaluate(() => [window.__yeniSurum === true, store.sales.length]), [true, 7], "sonraki internetsiz açılışta saklanan kopya artık yeni sürüm");
  d.esit(y.hatalar.concat(z.hatalar, w.hatalar), [], "sayfalarda betik hatası yok");
} catch (e) { d.dogru(false, "senaryo yarıda kesildi: " + e.message); }
finally {
  if (p) await p.context.close().catch(() => {});
  if (q) await q.context.close().catch(() => {});
  await browser.close();
  if (sunucu) await sunucu.dur();
  await bulut.dur();
  fs.rmSync(gecici, { recursive: true, force: true });
}
d.bitir();
