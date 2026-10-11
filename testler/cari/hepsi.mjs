// Canlı cari sayfa denemelerinin hepsini sırayla çalıştırır.
// Çalıştır: node testler/cari/hepsi.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { DEPO } from "../ortak/panel.mjs";

const DOSYALAR = ["testler/cari/ortak-blok.mjs", "testler/cari/arac.mjs", "testler/cari/panel.mjs", "testler/cari/kilit.mjs", "testler/cari/ekran.mjs"];
let kalan = 0;
for (const f of DOSYALAR) {
  const r = await new Promise((coz) => { const c = spawn(process.execPath, [path.join(DEPO, f)], { cwd: DEPO }); let o = ""; c.stdout.on("data", (x) => (o += x)); c.stderr.on("data", (x) => (o += x)); c.on("close", (kod) => coz({ kod, o })); });
  const ozet = (r.o.trim().split("\n").filter((s) => /\d+ geçti, \d+ kaldı/.test(s)).pop() || "ÖZET YOK").trim();
  const basarisiz = r.kod !== 0 || !/, 0 kaldı/.test(ozet);
  if (basarisiz) { kalan++; console.log(r.o.split("\n").filter((s) => /✗|beklenen|gelen|Error/.test(s)).join("\n")); }
  console.log((basarisiz ? "✗ " : "✓ ") + f.padEnd(36) + ozet);
}
console.log(kalan ? "\n" + kalan + " dosyada hata var" : "\nhepsi geçti");
process.exitCode = kalan ? 1 : 0;
