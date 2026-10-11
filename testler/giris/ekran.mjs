// 390 px ekran görüntüleri (göz kontrolü için). Çalıştır: node testler/giris/ekran.mjs [klasör]
import fs from "node:fs";
import path from "node:path";
import { panelAc, bekle, DEPO } from "../ortak/panel.mjs";
import { ornekSatirlar } from "../ortak/ornek-store.mjs";
import { kilitliBulut, TOPTANCI } from "./sahte-kilit.mjs";
import { girisFormu } from "./yardimci.mjs";

const hedef = process.argv[2] || path.resolve(DEPO, "../ekran/giris");
fs.mkdirSync(hedef, { recursive: true });
const bulut = await kilitliBulut({ satirlar: ornekSatirlar(), kilit: true });
const p = await panelAc({ bulutUrl: bulut.url });
const { page } = p;
const cek = (ad) => page.screenshot({ path: path.join(hedef, ad + ".png") });
try {
  await bekle(800);
  await cek("1-giris-bos");
  await girisFormu(page, TOPTANCI.eposta, "yanlis");
  await cek("2-giris-yanlis-sifre");
  await page.fill("#gkSifre", TOPTANCI.sifre); await page.click("#gkGoster");
  await cek("3-giris-sifre-gorunur");
  await page.setViewportSize({ width: 320, height: 568 });
  await cek("4-giris-kucuk-telefon");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("#gkGoster");
  await girisFormu(page, TOPTANCI.eposta, TOPTANCI.sifre);
  await page.waitForFunction(() => window.app.getStore().customers.length === 4);
  await bekle(500);
  await cek("5-giristen-sonra");
  await page.click("#userBtn"); await bekle(200);
  await cek("6-ust-menu-cikis");
  await page.click("#userBtn");
  await page.evaluate(() => navigate("profilim")); await bekle(300);
  await page.click("li[data-ptab='3']"); await bekle(200);
  await cek("7-profil-verilerimi-sil");
  await page.click("#wipeBtn"); await bekle(300);
  await page.fill("#gsSifre", "yanlis"); await page.fill("#gsOnay", "SİL");
  await page.click(".gs-sil-kap .ok"); await bekle(800);
  await cek("8-sil-penceresi-yanlis-sifre");
  bulut.oturumlariDusur();
  await page.keyboard.press("Escape");
  await page.evaluate(() => { kvGet("babuco:store"); }); await page.waitForSelector("#giris-kapi"); await bekle(300);
  await cek("9-oturum-dustu");
  console.log("Görüntüler: " + hedef);
} finally { await p.kapat(); await bulut.dur(); }
process.exit(0);
