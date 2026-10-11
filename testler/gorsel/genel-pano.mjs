// Görüntüleri yan yana tek panoda toplar (gözle bakmak için). node testler/gorsel/genel-pano.mjs <çıktı.png> <görüntü...>
import path from "node:path";
import fs from "node:fs";
const { chromium } = await import("playwright");
const [cikti, ...dosyalar] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 400 * dosyalar.length + 10, height: 900 } });
await p.setContent(`<body style="margin:0;display:flex;gap:10px;align-items:flex-start;background:#888">${dosyalar.map((d) => `<div><div style="font:12px sans-serif;color:#fff;padding:2px 4px">${path.basename(d)}</div><img src="data:image/png;base64,${fs.readFileSync(d).toString("base64")}" style="display:block;width:390px"></div>`).join("")}</body>`);
await p.waitForLoadState("networkidle");
await p.screenshot({ path: cikti, fullPage: true });
await b.close();
