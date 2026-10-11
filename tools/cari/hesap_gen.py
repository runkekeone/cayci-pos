# -*- coding: utf-8 -*-
# Müşteriye gönderilecek tek kişilik hesap özeti sayfası (statik anlık görüntü).
# Kullanım: python3 hesap_gen.py store.json "<müşteri tam adı>" cikti.html
import json, sys, html, re
from datetime import datetime, timezone, timedelta

STORE, MUSTERI, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
st = json.load(open(STORE, encoding="utf-8"))
TR = timezone(timedelta(hours=3))
c = [x for x in st["customers"] if x["ad"] == MUSTERI]
assert len(c) == 1, "musteri tek degil"
c = c[0]; cid = c["id"]
GK = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]


def tl(n):
    n = round(float(n), 2)
    s = f"{abs(n):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if s.endswith(",00"): s = s[:-3]
    return ("−" if n < 0 else "") + s + " ₺"


def gun(iso): return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(TR).date()


KISA = [(r"Toz İçecek", "toz içecek"), (r"Bardak Su|Pet Şişe Su", "su"), (r"Küp Şeker", "şeker"),
        (r"Ayran", "ayran"), (r"Oyun Kağıdı", "oyun kağıdı"), (r"Çıkma Kağıt", "çıkma kağıt"),
        (r"Yazboz", "yazboz"), (r"Çay 5 kg|Daldem Çay", "çay"), (r"Sade Soda", "sade soda"),
        (r"Soda$", "meyveli soda"), (r"Coca-Cola", "kola"), (r"Fanta", "fanta"), (r"Gazoz", "gazoz"),
        (r"Granül Kahve", "granül kahve"), (r"Süt Tozu", "süt tozu"), (r"Kalem", "kalem")]


def kisa(ad):
    for pat, k in KISA:
        if re.search(pat, ad, re.I): return k
    m = re.match(r"Aroma (\S+)", ad)
    return m.group(1).lower() if m else ad


def ozet(kalem):
    say = {}
    for adet, ad, f in kalem:
        k = kisa(ad); say[k] = say.get(k, 0) + adet
    return ", ".join(f"{v:g} {k}" for k, v in sorted(say.items(), key=lambda x: -abs(x[1])))


def yeni(): return {"kalem": [], "tutar": 0.0, "odenen": 0.0, "duz": 0.0, "not": []}


days = {}
for s in st["sales"]:
    if s.get("musteriId") != cid: continue
    d = days.setdefault(gun(s["tarih"]), yeni())
    for it in s["items"]:
        d["kalem"].append((it["adet"], it["ad"], float(it["fiyat"])))
    d["tutar"] += float(s["toplam"])
    o = s["odeme"]
    d["odenen"] += float(o.get("nakit") or 0) + float(o.get("pos") or 0)
    if s.get("odemeAdi") == "İade": d["not"].append("İade")
    elif s.get("odemeAdi") == "Havale": d["not"].append("Havale ile ödendi")
    elif float(o.get("pos") or 0) > 0: d["not"].append("Kartla ödendi")
    if float(s.get("iskonto") or 0): d["not"].append(f"{tl(s['iskonto'])} iskonto")
    n = (s.get("not") or "").strip()
    if n and not re.search(r"iskonto", n, re.I): d["not"].append(n)
for p in st["payments"]:
    if p.get("musteriId") != cid: continue
    d = days.setdefault(gun(p["tarih"]), yeni())
    n = (p.get("not") or "").strip()
    if "düzeltme" in n.lower():
        d["duz"] += float(p["tutar"]); d["not"].append("Hesap düzeltmesi"); continue
    d["odenen"] += float(p["tutar"])
    if "fazla ödeme" in n: d["not"].append(f"{tl(p['tutar'])} eski borca sayıldı")
    elif re.search(r"havale|eft|iban", n, re.I): d["not"].append(f"{tl(p['tutar'])} havale")
    elif n and not re.fullmatch(r"(nakit|saha)?\s*(tahsilat|ödeme)?", n, re.I):
        d["not"].append(re.sub(r"\s*\(Belge [^)]*\)", "", n))

acilis = float(c.get("acilis") or 0)
bak = acilis
rows = []
for k in sorted(days):
    d = days[k]
    bak = bak + d["tutar"] - d["odenen"] - d["duz"]
    rows.append((k, d, round(bak, 2)))
guncel = rows[-1][2] if rows else acilis


def sayi(n):
    return tl(n).replace(" ₺", "") if n else '<span class="yok">—</span>'


def satir(k, d, b):
    detay = "".join(
        f'<li><span>{adet:g}</span><span>{html.escape(ad)}</span><span>{tl(f)}</span><span>{tl(adet * f)}</span></li>'
        for adet, ad, f in d["kalem"]) or '<li class="sadece"><span></span><span>Bu gün sadece ödeme alındı.</span></li>'
    icerik = html.escape(ozet(d["kalem"])) if d["kalem"] else "<em>Ödeme</em>"
    notlar = html.escape(" · ".join(dict.fromkeys(d["not"])))
    tarih = "%02d.%02d" % (k.day, k.month)
    notsatir = f'<p class="tamnot">Not: {notlar}</p>' if notlar else ''
    return (f'<details class="sv"><summary>'
            f'<span class="c-t"><b>{tarih}</b><small>{GK[k.weekday()]}</small></span>'
            f'<span class="c-i" title="{icerik}">{icerik}</span>'
            f'<span class="c-n">{sayi(d["tutar"])}</span>'
            f'<span class="c-n od">{sayi(d["odenen"])}</span>'
            f'<span class="c-n bk">{tl(b).replace(" ₺", "")}</span>'
            f'<span class="c-not" title="{notlar}">{notlar}</span>'
            f'</summary><div class="acik"><ul class="detay">{detay}</ul>{notsatir}</div></details>')


son = next(((k, d["odenen"]) for k, d, b in reversed(rows) if d["odenen"] > 0), None)
son_txt = ("%02d.%02d.%d · %s" % (son[0].day, son[0].month, son[0].year, tl(son[1]))) if son else "—"
simdi = datetime.now(TR).strftime("%d.%m.%Y %H:%M")
satirlar = "\n".join(satir(k, d, b) for k, d, b in reversed(rows))
ad = html.escape(c["ad"])
acilis_html = f'<p class="not">Hesap açılış bakiyesi: {tl(acilis)}</p>' if acilis else ""
sifir = " sifir" if abs(guncel) < 0.005 else ""

CSS = """
/* Beyaz zemin, tek tema. Üstte bakiye; altında servis başına TEK SATIR (taşan metin … ile kesilir), dokununca kalemler ve tam not açılır */
:root {
  color-scheme: light;
  --bg:#ffffff; --fg:#1a1f24; --soluk:#6b7680; --cizgi:#e6e9ec; --zemin2:#f6f8f9;
  --murekkep:#1d5a7a; --borc:#b0392a; --odeme:#2c7552;
  --f-govde:"Barlow",system-ui,sans-serif; --f-rakam:"Barlow Semi Condensed","Barlow",system-ui,sans-serif;
  /* telefon: not sütunu işaret (•), tam not satır açılınca; geniş ekranda not metni sütunda */
  --kolon: 3.7em minmax(0,1fr) 3.9em 3.9em 4.4em .7em;
}
body { background:var(--bg); color:var(--fg); font-family:var(--f-govde); font-size:14px; line-height:1.4 }
.sayfa { max-width:900px; margin:0 auto; padding-inline:16px; padding-block:20px 40px; display:grid; gap:18px }
.firma { font-family:var(--f-rakam); font-weight:600; letter-spacing:.1em; text-transform:uppercase; font-size:11px; color:var(--murekkep) }
h1 { margin:4px 0 0; font-family:var(--f-rakam); font-weight:700; font-size:24px; line-height:1.15; text-wrap:balance }
.bakiye { display:flex; flex-wrap:wrap; align-items:flex-end; gap:10px 28px; padding-bottom:14px; border-bottom:2px solid var(--fg) }
.etiket { display:block; font-size:10.5px; letter-spacing:.09em; text-transform:uppercase; color:var(--soluk); margin-bottom:3px }
.tutar { font-family:var(--f-rakam); font-weight:700; font-size:38px; line-height:1; color:var(--borc); font-variant-numeric:tabular-nums }
.tutar.sifir { color:var(--odeme) }
.kucuk { font-size:13px; font-variant-numeric:tabular-nums; white-space:nowrap }
.bas, summary { display:grid; grid-template-columns:var(--kolon); column-gap:6px; align-items:center }
.bas > *, summary > * { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0 }
.bas { font-family:var(--f-rakam); letter-spacing:.03em !important; font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--soluk); font-weight:600; padding:0 2px 8px; border-bottom:1px solid var(--fg) }
.bas .r, .c-n { text-align:right }
.c-bnot { font-size:0 }
@media (min-width:640px) { .c-bnot { font-size:inherit } }
.sv { border-bottom:1px solid var(--cizgi) }
summary { list-style:none; cursor:pointer; padding:0 2px; height:44px; font-size:14px; font-family:var(--f-rakam) }
summary::-webkit-details-marker { display:none }
summary:hover, .sv[open] > summary { background:var(--zemin2) }
summary:focus-visible { outline:2px solid var(--murekkep); outline-offset:-2px }
.c-t { font-variant-numeric:tabular-nums }
.c-t::before { content:"›"; display:inline-block; width:.7em; color:var(--soluk); transition:transform .15s }
.sv[open] .c-t::before { transform:rotate(90deg) }
.c-t b { font-family:var(--f-rakam); font-weight:600; font-size:15px }
.c-t small { display:none; color:var(--soluk); font-size:12px; margin-left:5px }
.c-i em { color:var(--soluk); font-style:normal }
.c-n { font-variant-numeric:tabular-nums }
.c-n.od { color:var(--odeme) }
.c-n.bk { font-family:var(--f-rakam); font-weight:700; font-size:15px }
.yok { color:#c3cad0 }
.c-not { font-size:0; text-align:center }
.c-not:not(:empty)::after { content:"•"; font-size:16px; line-height:1; color:var(--murekkep) }
.acik { background:var(--zemin2); padding:4px 8px 12px }
.detay { list-style:none; margin:0; padding:0; display:grid; gap:2px; font-size:13px }
.detay li { display:grid; grid-template-columns:1.8em minmax(0,1fr) 4.6em 5.2em; gap:7px; font-variant-numeric:tabular-nums }
.detay li > * { white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.detay li span:first-child { text-align:right; font-weight:600 }
.detay li span:nth-child(3), .detay li span:nth-child(4) { text-align:right }
.detay li span:nth-child(3), .detay li.sadece { color:var(--soluk) }
.tamnot { margin:6px 0 0; font-size:12.5px; color:var(--soluk) }
.not { font-size:12px; color:var(--soluk); margin:0 }
@media (min-width:640px) {
  :root { --kolon: 5.4rem minmax(10rem,1fr) 5rem 5rem 5.4rem minmax(7rem,.8fr) }
  .bas, summary { column-gap:12px } .bas { padding-inline:10px } summary { padding-inline:10px; font-size:14px }
  .c-t small { display:inline }
  .c-not { font-size:12.5px; color:var(--soluk); text-align:left }
  .c-not:not(:empty)::after { content:none }
  .acik { padding-left:calc(5.4rem + 22px) }
}
@media (prefers-reduced-motion: reduce) { .c-t::before { transition:none } }
"""

page = f"""<title>{ad} · Cari Hesap</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap">
<style>{CSS}</style>
<main class="sayfa">
  <div>
    <div class="firma">Özgür Ticaret · Cari hesap özeti</div>
    <h1>{ad}</h1>
  </div>
  <section class="bakiye" aria-label="Güncel bakiye">
    <div><span class="etiket">Güncel bakiye</span><span class="tutar{sifir}">{tl(guncel)}</span></div>
    <div class="kucuk"><span class="etiket">Son ödeme</span>{son_txt}</div>
    <div class="kucuk"><span class="etiket">Güncelleme</span>{simdi}</div>
  </section>
  <div class="tablo">
    <div class="bas"><span>Tarih</span><span>İçerik</span><span class="r">Tutar</span><span class="r">Ödenen</span><span class="r">Bakiye</span><span class="c-bnot">Not</span></div>
    {satirlar}
  </div>
  {acilis_html}
  <p class="not">Tutarlar Türk lirasıdır. Ürünleri görmek için satıra dokunun; • işaretli satırlarda not var. Bir hata görürseniz lütfen bize bildirin.</p>
</main>
"""
open(OUT, "w", encoding="utf-8").write(page)
print("bakiye", guncel, "servis", len(rows))
