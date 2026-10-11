// Giriş denemeleri için yardımcılar (ortak altyapıyı değiştirmeden sarmalar).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { panelAc, statikSunucu, DEPO, PANEL_DIZIN } from "../ortak/panel.mjs";

export const OTURUM_ANAHTAR = "babuco:oturum";
export const TABAN_COMMIT = "5180190";          // bu düzeltmelerden önceki hâl ("önce bozuktu" karşılaştırması için)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** Sunucuya hiç sormadan geçerli sayılan (süresi uzak gelecekte) uydurma oturum kaydı.
 *  Giriş bilmeyen ortak sahte bulutla çalışan denemeler bununla "girişli" açılır. */
export function sahteOturum(eposta = "deneme@ornek.test") {
  const simdi = Math.floor(Date.now() / 1000), bitis = simdi + 10 * 365 * 86400;
  const kullanici = { id: "00000000-0000-4000-8000-0000000000aa", aud: "authenticated", role: "authenticated", email: eposta, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  return {
    access_token: b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub: kullanici.id, email: eposta, role: "authenticated", aud: "authenticated", iat: simdi, exp: bitis }) + ".sahte-imza",
    token_type: "bearer", expires_in: bitis - simdi, expires_at: bitis, refresh_token: "sahte-yenileme", user: kullanici,
  };
}

/**
 * panelAc'ın girişli hâli: cihazda saklı oturum varmış gibi açar (giriş ekranı çıkmaz).
 * @param {object} a  panelAc seçenekleri + { oturum?: object }  (oturum verilmezse sahteOturum())
 *                    Kilit bilen sahte bulutta gerçek jeton gerekir: oturum = await bulut.girisYap()
 */
export async function oturumluPanelAc(a) {
  const sunucu = a.panelUrl ? null : await statikSunucu(a.panelDizin || PANEL_DIZIN);
  const panelUrl = a.panelUrl || sunucu.url;
  const depolama = { cookies: [], origins: [{ origin: panelUrl, localStorage: [{ name: OTURUM_ANAHTAR, value: JSON.stringify(a.oturum || sahteOturum()) }, ...(a.yerel || [])] }] };
  const p = await panelAc({ ...a, panelUrl, storageState: depolama });
  const kapat = p.kapat;
  p.kapat = async () => { await kapat(); if (sunucu) await sunucu.dur(); };
  return p;
}

/** Giriş ekranını doldurup gönderir. Kapı açılana (ya da hata mesajı çıkana) kadar bekler; mesajı döndürür ("" = girdi). */
export async function girisFormu(page, eposta, sifre) {
  await page.waitForSelector("#giris-kapi #gkEposta");
  await page.fill("#gkEposta", eposta);
  await page.fill("#gkSifre", sifre);
  await page.click("#gkGir");
  await page.waitForFunction(() => !document.getElementById("giris-kapi") || (document.getElementById("gkMesaj").textContent && !document.getElementById("gkGir").disabled), null, { timeout: 10000 });
  return page.evaluate(() => (document.getElementById("gkMesaj") || { textContent: "" }).textContent);
}

export const girisEkraniVar = (page) => page.evaluate(() => !!document.getElementById("giris-kapi") && document.documentElement.classList.contains("giris-kilit"));
/** Panelin gövdesi (menü, içerik) ekranda görünüyor mu? */
export const panelGorunuyor = (page) => page.evaluate(() => { const l = document.querySelector(".layout"); return !!l && getComputedStyle(l).display !== "none"; });

/** Bu düzeltmelerden önceki paneli (taban commit) geçici bir klasöre çıkarır — "önce bozuktu" denemeleri için. */
export function tabanPaneli() {
  const hedef = fs.mkdtempSync(path.join(os.tmpdir(), "babuco-taban-"));
  const dosyalar = execFileSync("git", ["ls-tree", "-r", "--name-only", TABAN_COMMIT, "public/toptanci/"], { cwd: DEPO, encoding: "utf8" }).split("\n").filter(Boolean);
  for (const d of dosyalar) {
    const cikti = path.join(hedef, path.relative("public/toptanci", d));
    fs.mkdirSync(path.dirname(cikti), { recursive: true });
    fs.writeFileSync(cikti, execFileSync("git", ["show", TABAN_COMMIT + ":" + d], { cwd: DEPO, maxBuffer: 64 * 1024 * 1024 }));
  }
  return { dizin: hedef, sil: () => fs.rmSync(hedef, { recursive: true, force: true }) };
}

/** Geçici klasör (araç oturum dosyası vb. için); gerçek tools/.babuco-oturum.json'a dokunulmasın. */
export function geciciKlasor(on = "babuco-giris-") {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), on));
  return { dizin: d, sil: () => fs.rmSync(d, { recursive: true, force: true }) };
}
