// stdin: {salt(b64), iter, items:[{tel, html}]}  ->  stdout: {anahtar-id-hex: b64(iv+ct+tag)}
const crypto = require("crypto");
let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
  const j = JSON.parse(s), salt = Buffer.from(j.salt, "base64"), out = {};
  for (const it of j.items) {
    const dk = crypto.pbkdf2Sync(it.tel, salt, j.iter, 48, "sha256");
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", dk.subarray(0, 32), iv);
    const ct = Buffer.concat([c.update(it.html, "utf8"), c.final(), c.getAuthTag()]);
    out[dk.subarray(32).toString("hex")] = Buffer.concat([iv, ct]).toString("base64");
  }
  process.stdout.write(JSON.stringify(out));
});
