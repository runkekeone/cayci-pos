# -*- coding: utf-8 -*-
# Tek link, telefonla giriş: her müşterinin hesap sayfası kendi telefon numarasından
# türetilen anahtarla AES-GCM ile şifrelenip sayfaya gömülür. Sayfa kaynağında düz metin
# müşteri verisi yoktur; numarayı bilmeyen başkasının hesabını açamaz.
# Kullanım: python3 portal_gen.py store.json cikti.html
import json, sys, re, os, subprocess, tempfile, base64, hashlib

STORE, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
ITER = 150000
st = json.load(open(STORE, encoding="utf-8"))

aktif = {s["musteriId"] for s in st["sales"]} | {p["musteriId"] for p in st["payments"]}
salt = os.urandom(16)
kayit, css, atlanan, goren = {}, None, [], {}
for c in st["customers"]:
    tel = re.sub(r"\D", "", c.get("telefon") or "")[-10:]
    if c["id"] not in aktif: continue
    if len(tel) != 10 or not tel.startswith("5"):
        atlanan.append(c["ad"] + " (telefon yok)"); continue
    if tel in goren:
        atlanan.append(f'{c["ad"]} (numara {goren[tel]} ile aynı)'); continue
    goren[tel] = c["ad"]
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as t: tmp = t.name
    subprocess.run([sys.executable, os.path.join(HERE, "hesap_gen.py"), STORE, c["ad"], tmp], check=True, capture_output=True)
    h = open(tmp, encoding="utf-8").read(); os.unlink(tmp)
    if css is None: css = re.search(r"<style>(.*?)</style>", h, re.S).group(1)
    govde = re.search(r'<main class="sayfa">(.*)</main>', h, re.S).group(1)
    kayit[tel] = govde

sb = base64.b64encode(salt).decode()
enc = subprocess.run(["node", os.path.join(HERE, "enc.cjs")], input=json.dumps({"salt": sb, "iter": ITER, "items": [{"tel": t, "html": h} for t, h in kayit.items()]}),
                     capture_output=True, text=True, check=True).stdout
veri = json.dumps({"s": sb, "i": ITER, "k": json.loads(enc)}, separators=(",", ":"))

PORTAL_CSS = """
.giris { max-width:420px; margin:0 auto; padding-inline:16px; padding-block:48px 40px; display:grid; gap:18px }
.giris h1 { font-size:30px }
.giris p { margin:0; color:var(--soluk); font-size:15px; max-width:34ch }
.giris form { display:grid; gap:10px; margin-top:6px }
.giris label { font-size:10.5px; letter-spacing:.09em; text-transform:uppercase; color:var(--soluk); font-weight:600 }
.giris input { font:inherit; font-family:var(--f-rakam); font-size:22px; letter-spacing:.04em; padding:12px 14px;
  border:1.5px solid var(--cizgi); border-radius:8px; background:var(--bg); color:var(--fg); font-variant-numeric:tabular-nums; width:100%; box-sizing:border-box }
.giris input:focus { outline:none; border-color:var(--murekkep) }
.giris button, .cikis { font:inherit; font-weight:600; cursor:pointer; border-radius:8px }
.giris button { padding:13px 16px; border:0; background:var(--murekkep); color:#fff; font-size:16px }
.giris button:disabled { opacity:.6; cursor:wait }
.giris button:focus-visible, .cikis:focus-visible { outline:2px solid var(--fg); outline-offset:2px }
.hata { color:var(--borc) !important; font-size:14px !important; min-height:1.4em }
.ust { display:flex; justify-content:space-between; align-items:flex-start; gap:12px }
.cikis { padding:7px 12px; border:1px solid var(--cizgi); background:var(--bg); color:var(--soluk); font-size:13px; white-space:nowrap }
"""

page = f"""<title>Özgür Ticaret Cari Hesap</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap">
<style>{css}{PORTAL_CSS}</style>
<section class="giris" id="giris">
  <div class="firma">Özgür Ticaret</div>
  <h1>Cari hesabınız</h1>
  <p>Bize kayıtlı telefon numaranızı girin; bıraktığımız ürünleri, ödemelerinizi ve kalan bakiyenizi görün.</p>
  <form id="form" novalidate>
    <label for="tel">Telefon numarası</label>
    <input id="tel" name="tel" type="tel" inputmode="numeric" autocomplete="tel" placeholder="05__ ___ __ __" maxlength="16">
    <button id="btn" type="submit">Hesabımı göster</button>
    <p class="hata" id="hata" role="alert"></p>
  </form>
</section>
<main class="sayfa" id="hesap" hidden></main>
<script>
const V = {veri};
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = a => Array.from(a, x => x.toString(16).padStart(2, "0")).join("");
function normal(t) {{ const d = (t || "").replace(/\\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; }}
async function ac(tel) {{
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(tel), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({{name:"PBKDF2", hash:"SHA-256", salt:b64(V.s), iterations:V.i}}, base, 384));
  const kayit = V.k[hex(bits.slice(32))];
  if (!kayit) return null;
  const raw = b64(kayit);
  const key = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({{name:"AES-GCM", iv:raw.slice(0, 12)}}, key, raw.slice(12));
  return new TextDecoder().decode(pt);
}}
const giris = document.getElementById("giris"), hesap = document.getElementById("hesap");
const hata = document.getElementById("hata"), btn = document.getElementById("btn"), inp = document.getElementById("tel");
function goster(h) {{
  hesap.innerHTML = h;
  const ust = hesap.querySelector("div");
  if (ust) {{ const w = document.createElement("div"); w.className = "ust"; ust.replaceWith(w); w.append(ust);
    const c = document.createElement("button"); c.className = "cikis"; c.type = "button"; c.textContent = "Çıkış";
    c.onclick = () => {{ try {{ localStorage.removeItem("tel"); }} catch (e) {{}} hesap.hidden = true; hesap.innerHTML = ""; giris.hidden = false; inp.value = ""; inp.focus(); }};
    w.append(c); }}
  giris.hidden = true; hesap.hidden = false; window.scrollTo(0, 0);
}}
async function dene(t, sessiz) {{
  const tel = normal(t);
  if (!tel || tel[0] !== "5") {{ if (!sessiz) hata.textContent = "Numarayı 05xx xxx xx xx şeklinde, 11 hane olarak girin."; return; }}
  btn.disabled = true; btn.textContent = "Açılıyor…"; hata.textContent = "";
  try {{
    const h = await ac(tel);
    if (h) {{ goster(h); try {{ localStorage.setItem("tel", tel); }} catch (e) {{}} }}
    else if (!sessiz) hata.textContent = "Bu numaraya kayıtlı hesap bulunamadı. Numarayı kontrol edin ya da bizi arayın.";
  }} catch (e) {{ if (!sessiz) hata.textContent = "Hesap açılamadı. Sayfayı yenileyip tekrar deneyin."; }}
  btn.disabled = false; btn.textContent = "Hesabımı göster";
}}
document.getElementById("form").addEventListener("submit", e => {{ e.preventDefault(); dene(inp.value); }});
let kayitli = null; try {{ kayitli = localStorage.getItem("tel"); }} catch (e) {{}}
if (kayitli) dene(kayitli, true);
</script>
"""
open(OUT, "w", encoding="utf-8").write(page)
print("hesap:", len(kayit))
print("atlanan:", "; ".join(atlanan) or "-")
