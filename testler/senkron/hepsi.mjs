// Eşitleme denemelerinin tümünü sırayla çalıştırır, sonunda özet basar.
// Çalıştır: node testler/senkron/hepsi.mjs
import { spawn } from "node:child_process";
import path from "node:path";

const DIZIN = import.meta.dirname;
const DOSYALAR = ["birim.mjs", "1-arac-ve-panel.mjs", "2-iki-telefon.mjs", "3-ayni-belge-no.mjs", "4-okuma-hatasi.mjs", "5-cevrimdisi.mjs",
  "6-erken-kapanma.mjs", "7-yedek.mjs", "8-arac-yedek.mjs", "9-uc-durumlar.mjs", "10-kabuk.mjs", "../ortak/duman.mjs"];
const calistir = (dosya) => new Promise((coz) => {
  const c = spawn(process.execPath, [path.join(DIZIN, dosya)], { env: process.env });
  let cikti = "";
  c.stdout.on("data", (x) => (cikti += x)); c.stderr.on("data", (x) => (cikti += x));
  c.on("close", (kod) => coz({ dosya, kod, cikti }));
});
let gecen = 0, kalan = 0;
const satirlar = [];
for (const dosya of DOSYALAR) {
  const r = await calistir(dosya);
  const m = /(\d+) geçti, (\d+) kaldı/.exec(r.cikti);
  const g = m ? Number(m[1]) : 0, k = m ? Number(m[2]) : 1;
  gecen += g; kalan += r.kod === 0 ? k : Math.max(k, 1);
  satirlar.push((r.kod === 0 && k === 0 ? "  ✓ " : "  ✗ ") + dosya.padEnd(26) + (m ? g + " geçti, " + k + " kaldı" : "ÇALIŞMADI (çıkış " + r.kod + ")"));
  console.log(satirlar[satirlar.length - 1]);
  if (r.kod !== 0 || k) console.log(r.cikti.split("\n").filter((l) => !/^\s*✓/.test(l)).join("\n"));
}
console.log("\nTOPLAM: " + gecen + " geçti, " + kalan + " kaldı");
process.exit(kalan ? 1 : 0);
