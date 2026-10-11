// "ÖNCE" görüntüleri: satış ekranının yeniden düzenlenmeden önceki hâli (yalnız durum kurup görüntü alır).
// ESKİ paneli açar: taban kopyası (_wt/g-taban, yalnız okunur) varsa oradan; yoksa çalışmaz (bu kopyada ekran artık yeni).
// Çalıştır: node testler/gorsel/satis-once.mjs   → _wt/ekran/g-satis/once/*.png
import fs from "node:fs";
import path from "node:path";
import { DEPO } from "../ortak/panel.mjs";
import { gsAc, bekle } from "./satis-ortak.mjs";

const TABAN_PANEL = process.env.TABAN_PANEL || path.resolve(DEPO, "../g-taban/public/toptanci");
if (!fs.existsSync(path.join(TABAN_PANEL, "app.js"))) { console.log("taban kopyası yok (" + TABAN_PANEL + ") — önce görüntüleri alınamaz"); process.exit(0); }
const o = await gsAc({ panelDizin: TABAN_PANEL, diyalog: (d) => d.dismiss().catch(() => {}) });
const { page, git, cek } = o;
const K = "once";
const sepet = (musteriId, urunler) => page.evaluate(([m, u]) => { pos.carts[pos.active] = newCart(); activeCart().musteriId = m; u.forEach((x) => addToCart(x)); }, [musteriId, urunler]);
try {
  await git("satis"); await cek(K, "01-bos-sepet"); await cek(K, "01b-bos-sepet-tam", true);
  await sepet(null, ["u1"]); await git("satis"); await cek(K, "02-bir-urun");
  await sepet("m5", ["u1", "u1", "u2", "u3", "u4", "u5", "u11", "u12", "u13", "u15", "u16", "u18", "u21", "u26"]); await git("satis");
  await cek(K, "03-on-iki-urun-limitli"); await cek(K, "03b-on-iki-urun-tam", true);
  await sepet("m6", ["u21", "u26", "u26", "u26", "u26", "u26", "u26", "u26", "u26", "u26", "u26"]); await git("satis"); await cek(K, "04-uzun-ad-buyuk-tutar"); await cek(K, "04b-uzun-ad-tam", true);
  await page.evaluate(() => { const r = document.querySelector(".ades-row"); if (r) r.click(); }); await cek(K, "05-satir-penceresi");
  await sepet(null, []); await page.evaluate(() => { pos.cat = "Su"; }); await git("satis"); await cek(K, "06-kategori-secili", true);
  await page.evaluate(() => { pos.cat = "ANA"; pos.q = "zzz"; }); await git("satis"); await cek(K, "07-arama-bos", true);
  await page.evaluate(() => { pos.q = ""; }); await git("satis");
  await page.setViewportSize({ width: 360, height: 780 }); await sepet("m5", ["u1", "u3", "u4"]); await git("satis"); await cek(K, "08-360px"); await cek(K, "08b-360px-tam", true);
  await page.setViewportSize({ width: 390, height: 844 });
  // rota sihirbazı: satış adımı
  await page.evaluate(() => { pos.carts[pos.active] = newCart(); servisBaslat(["m1", "m2"]); }); await bekle(400);
  await page.evaluate(() => { servis.stokBitti = true; servis.adim = "urun"; activeCart().musteriId = servis.acik; render(); }); await bekle(300);
  await page.evaluate(() => { addToCart("u1"); addToCart("u3"); servisSepetGuncelle(); }); await cek(K, "09-rota-urun-adimi", true);
  await page.evaluate(() => { servis.adim = "odeme"; render(); }); await cek(K, "10-rota-odeme-adimi");
  console.log("betik hatası:", JSON.stringify(o.p.hatalar));
} finally { await o.kapat(); }
process.exit(0);
