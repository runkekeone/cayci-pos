// Stok denemelerinin ortak yardımcıları (testler/ortak'a dokunmadan, onun üstüne sarmalayıcı).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { ARAC, DEPO } from "../ortak/panel.mjs";
import { ornekStore } from "../ortak/ornek-store.mjs";

export const TABAN = "5180190c28ca523b9990428001d4ed208ff5fce9";   // düzeltmelerden önceki sürüm

/** Aracı sahte buluta karşı çalıştırır; stdout ve stderr AYRI döner (fişin bozulmadığını sınamak için). */
export function arac(bulutUrl, argumanlar, secenek = {}) {
  if (!bulutUrl || !/^http:\/\/127\.0\.0\.1:/.test(bulutUrl)) throw new Error("arac: yalniz sahte bulut adresiyle calisir.");
  return new Promise((coz) => {
    const c = spawn(process.execPath, [secenek.arac || ARAC, ...argumanlar], {
      cwd: secenek.cwd || DEPO,
      env: { ...process.env, BABUCO_SB_URL: bulutUrl, BABUCO_SB_KEY: "sahte", ...(secenek.env || {}) },
    });
    let stdout = "", stderr = "";
    c.stdout.on("data", (d) => (stdout += d)); c.stderr.on("data", (d) => (stderr += d));
    c.on("close", (kod) => coz({ kod, stdout, stderr, cikti: stdout + stderr }));
  });
}

/** Taban sürümden bir dosyayı (ya da klasörü) geçici klasöre çıkarır. git yoksa / commit yoksa null döner. */
let _tabanKok = null;
export function tabanCikar(yollar) {
  try {
    if (!_tabanKok) _tabanKok = fs.mkdtempSync(path.join(os.tmpdir(), "babuco-taban-"));
    for (const y of yollar) {
      const dosyalar = execFileSync("git", ["ls-tree", "-r", "--name-only", TABAN, y], { cwd: DEPO, encoding: "utf8" }).split("\n").filter(Boolean);
      for (const d of dosyalar) {
        const hedef = path.join(_tabanKok, d);
        if (fs.existsSync(hedef)) continue;
        fs.mkdirSync(path.dirname(hedef), { recursive: true });
        fs.writeFileSync(hedef, execFileSync("git", ["show", TABAN + ":" + d], { cwd: DEPO, maxBuffer: 64 * 1024 * 1024 }));
      }
    }
    return _tabanKok;
  } catch (e) { console.log("  (taban sürüm çıkarılamadı, 'önce' karşılaştırması atlanıyor: " + String(e.message).split("\n")[0] + ")"); return null; }
}
/** Taban sürümün aracı (geçici klasörde; kendi yedek klasörüne yazar). */
export function tabanArac() { const k = tabanCikar(["tools/babuco.cjs"]); return k ? path.join(k, "tools/babuco.cjs") : null; }
/** Taban sürümün panel klasörü. */
export function tabanPanel() { const k = tabanCikar(["public/toptanci"]); return k ? path.join(k, "public/toptanci") : null; }

const gun = (n, saat = 11) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(saat, 0, 0, 0); return d.toISOString(); };
export { gun };

/**
 * Stok denemeleri için uydurma veri: ornekStore + fiyat ailesi olan ürünler, eksi stoklar, özel fiyatlar.
 *   u7,u8  "Toz İçecek" ailesi (ikisi de 75 ₺)      u9 / u10 "Sade Soda" ama fiyatı farklı (285 / 315) → ayrı aile
 *   u3 araç stoğu −4, u5 dükkan stoğu −7 (eksi)
 */
export function stokStore() {
  const s = ornekStore();
  s.products.push(
    { id: "u7", ad: "Örnek Toz İçecek Kuşburnu", grup: "Toz İçecekler", altKategori: "Toz İçecek", birim: "Adet", satis: 75, alis: 50, stok: 20, aracStok: 10, kritik: "", kdv: 1, barkod: "", gorunur: true },
    { id: "u8", ad: "Örnek Toz İçecek Nane Limon", grup: "Toz İçecekler", altKategori: "Toz İçecek", birim: "Adet", satis: 75, alis: 50, stok: 20, aracStok: 10, kritik: "", kdv: 1, barkod: "", gorunur: true },
    { id: "u9", ad: "Örnek Sade Soda A", grup: "Sodalar", altKategori: "Sade Soda", birim: "Koli", birimIciAdet: 24, satis: "285", alis: "200", adetAlis: 200 / 24, adetSatis: 285 / 24, stok: 5, aracStok: 3, kritik: "", kdv: 10, barkod: "", gorunur: true },
    { id: "u10", ad: "Örnek Sade Soda B", grup: "Sodalar", altKategori: "Sade Soda", birim: "Koli", birimIciAdet: 24, satis: "315", alis: "230", adetAlis: 230 / 24, adetSatis: 315 / 24, stok: 5, aracStok: 3, kritik: "", kdv: 10, barkod: "", gorunur: true },
  );
  s.products.find((p) => p.id === "u3").aracStok = -4;
  s.products.find((p) => p.id === "u5").stok = -7;
  s.customers.find((c) => c.id === "m1").ozelFiyatlar = { u1: 90, u7: 80, u8: 80 };
  s.customers.find((c) => c.id === "m2").ozelFiyatlar = { u7: 80, u8: 80, u9: 300 };
  s.customers.find((c) => c.id === "m4").ozelFiyatlar = { u4: 1800 };
  return s;
}
/** siparisler tablosu satırı (çay ocağı uygulamasının yazdığı biçimde). */
export function siparisSatiri(id, a = {}) {
  const tarih = a.tarih || gun(a.gunOnce == null ? 3 : a.gunOnce, 14);
  return {
    id, toptanci: "babuco", cay_ocagi: a.ad || "Örnek Çay Ocağı", cay_tel: a.tel === undefined ? "05550000002" : a.tel,
    durum: a.durum || "yeni", created_at: tarih, updated_at: tarih,
    payload: { id, date: tarih, note: a.not || "", paymentType: a.odeme || "bakiye", from: { name: a.ad || "Örnek Çay Ocağı", phone: a.tel === undefined ? "05550000002" : a.tel },
      lines: a.lines || [{ catalogItemId: "b-u1", name: "Örnek Bardak Su 200 ml", birim: "Koli", qty: 4, unitPrice: 100 }, { catalogItemId: "b-u3", name: "Örnek Kola 250 ml", birim: "Koli", qty: 1, unitPrice: 640 }] },
  };
}
export const satirlar = (store, zaman = new Date(Date.now() - 3600_000).toISOString()) => [{ key: "babuco:store", value: store, updated_at: zaman }];
export const EKRAN = path.resolve(DEPO, "../ekran/stok");
export async function ekran(page, ad) { try { fs.mkdirSync(EKRAN, { recursive: true }); await page.screenshot({ path: path.join(EKRAN, ad + ".png"), fullPage: false }); } catch (e) { /* ekran klasörü yoksa geç */ } }
export const kopya = (o) => JSON.parse(JSON.stringify(o));
