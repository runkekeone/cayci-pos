// Değişen ekranların 390 px görüntüsünü alır → _wt/ekran/para/*.png (depo dışı). Gözle bakmak için.
// Çalıştır: node testler/para/ekran.mjs
import fs from "node:fs";
import path from "node:path";
import { ortam, git, karisikGun, ekran, EKRAN, bekle, bugunStr } from "./ortak.mjs";

const { st } = karisikGun();
// vade kartı dolsun: birkaç gecikmiş müşteri
st.customers.push({ id: "v1", ad: "Kısmi Ödeyen Kıraathane", telefon: "05550000011", acilis: 0, limit: 0, vade: "", ozelFiyatlar: {} });
st.sales.find((s) => s.id === "s3").tarih = new Date(Date.now() - 48 * 86400000).toISOString();
const o = await ortam(st, { diyalogKarar: () => false });
const { page } = o;
const tam = async (ad) => { fs.mkdirSync(EKRAN, { recursive: true }); await page.screenshot({ path: path.join(EKRAN, ad + ".png"), fullPage: true }); };
try {
  await git(page, "anasayfa"); await tam("01-anasayfa");
  await page.click('.pv-kart [data-hatirlat="m2"]'); await bekle(150); await ekran(page, "02-hatirlatma");
  await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));
  await page.evaluate(() => openOdemeAl("m2")); await bekle(150); await page.click('[data-ptur="havale"]'); await ekran(page, "03-odeme-al");
  await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));
  await page.evaluate(() => { pos.carts[pos.active] = { items: [], musteriId: "m2", iskonto: 0, odenen: 0 }; });
  await git(page, "satis"); await page.evaluate(() => { window.app.addToCart("u4"); document.getElementById("custLimit").scrollIntoView({ block: "center" }); }); await bekle(150); await ekran(page, "04-satis-limit");
  await git(page, "rapor-gunluk"); await tam("05-gunluk-rapor");
  await git(page, "dukkan"); await tam("06-dukkan");
  await git(page, "giderler"); await tam("07-giderler");
  await page.click('[data-gkat="Yakıt"]'); await bekle(150); await ekran(page, "08-gider-ekle");
  await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach((x) => x.remove()));
  await git(page, "musteriler"); await ekran(page, "09-musteriler");
  await page.evaluate(() => { selectedCustomerId = "m2"; }); await git(page, "musteri-detay"); await tam("10-musteri-detay");
  // gün sonu: gider hatırlatması (bugünün işletme giderleri silinip) + rapor
  await page.evaluate(() => { store.expenses = store.expenses.filter((e) => !isToday(e.tarih)); servis.aktif = true; });
  await git(page, "rota");
  await page.evaluate(() => servisBitir()); await bekle(200); await ekran(page, "11-gun-sonu-gider");
  await page.click("#ghBitir"); await bekle(250); await ekran(page, "12-gun-sonu-rapor");
  // limit sorusunun metni (tarayıcı penceresi ekran görüntüsüne girmez → metin olarak)
  const soru = await page.evaluate(() => limitUyariMetni("m2", 2000));
  fs.writeFileSync(path.join(EKRAN, "limit-sorusu.txt"), soru);
  const a1 = await o.arac(["kasa", bugunStr()]), a2 = await o.arac(["rapor", bugunStr()]), a3 = await o.arac(["tahsilat-listesi"]), a4 = await o.arac(["aylik"]);
  fs.writeFileSync(path.join(EKRAN, "arac-ciktilari.md"), [a1.cikti, a2.cikti, a3.cikti, a4.cikti].join("\n\n---\n\n"));
  console.log("görüntüler: " + EKRAN + "\nbetik hatası: " + JSON.stringify(o.p.hatalar));
} finally { await o.kapat(); }
setTimeout(() => process.exit(), 300).unref();
