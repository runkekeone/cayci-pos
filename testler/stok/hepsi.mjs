// Stok ajanının bütün denemelerini (ve ortak duman testini) sırayla çalıştırır.
// Çalıştır: node testler/stok/hepsi.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { DEPO } from "../ortak/panel.mjs";

const DOSYALAR = ["testler/ortak/duman.mjs", "testler/stok/ortak-blok.mjs", "testler/stok/arac-stok.mjs", "testler/stok/arac-fiyat.mjs", "testler/stok/arac-siparis.mjs",
  "testler/stok/panel-stok.mjs", "testler/stok/panel-fiyat.mjs", "testler/stok/panel-siparis.mjs", "testler/stok/ekranlar.mjs"];
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
