// Günlük satış raporu — bulut (Supabase kv) ya da elde bir JSON yedeği üzerinden.
//
// Neden ayrı betik: rapor ekranı yalnız uygulamanın kendi state'ini biliyor.
// Toptancı paneli (babuco) kv tablosuna "babuco:store" anahtarıyla kendi
// store'unu yedekliyor ve alan adları bu repodakilerle birebir aynı değil.
// Bu yüzden satış listesi ve alan adları ÇALIŞMA ANINDA keşfedilir; şema
// değişse de betik çalışmaya devam eder.
//
// Kullanım:
//   node scripts/gun-raporu.mjs anahtarlar
//   node scripts/gun-raporu.mjs kesif  --anahtar babuco:store
//   node scripts/gun-raporu.mjs rapor 2026-09-07 --anahtar babuco:store
//   node scripts/gun-raporu.mjs rapor 2026-09-07 --dosya yedek.json
//
// Not: bulut modunda ağ gerekir. Claude Code web oturumunda supabase.co
// adresi egress politikasıyla kapalı — o yüzden bu betik kendi bilgisayarında
// çalıştırılmak üzere yazıldı.

import { readFile } from 'node:fs/promises'

const URL = process.env.VITE_SUPABASE_URL ?? 'https://zchubpqbvbhcuxclirur.supabase.co'
const KEY = process.env.VITE_SUPABASE_KEY ?? 'sb_publishable_m5HEx3mFrjDJHBe0qfUznQ_tXkoESp3'

// ---- argüman ayrıştırma ----
const argv = process.argv.slice(2)
const komut = argv[0] ?? 'yardim'
const konum = argv.slice(1).filter((a) => !a.startsWith('--'))
function opsiyon(ad, varsayilan) {
  const i = argv.indexOf('--' + ad)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : varsayilan
}

// ---- veri kaynağı ----
async function kvOku(anahtar) {
  const { createClient } = await import('@supabase/supabase-js')
  const c = createClient(URL, KEY, { auth: { persistSession: false } })
  const { data, error } = await c.from('kv').select('value, updated_at').eq('key', anahtar).maybeSingle()
  if (error) throw new Error(`kv okunamadı (${anahtar}): ${error.message}`)
  if (!data) throw new Error(`kv'de "${anahtar}" anahtarı yok. Önce: node scripts/gun-raporu.mjs anahtarlar`)
  return { value: data.value, updatedAt: data.updated_at }
}

async function kvAnahtarlar() {
  const { createClient } = await import('@supabase/supabase-js')
  const c = createClient(URL, KEY, { auth: { persistSession: false } })
  const { data, error } = await c.from('kv').select('key, updated_at').order('updated_at', { ascending: false })
  if (error) throw new Error(`kv listelenemedi: ${error.message}`)
  return data ?? []
}

async function veriGetir() {
  const dosya = opsiyon('dosya')
  if (dosya) return { value: JSON.parse(await readFile(dosya, 'utf8')), updatedAt: null }
  return kvOku(opsiyon('anahtar', 'babuco:store'))
}

// ---- şema keşfi ----
// Bir kaydın hangi alanının ne olduğunu ada bakarak seçer. İlk eşleşen kazanır.
const ALAN = {
  tarih: ['bizDay', 'date', 'tarih', 'gun', 'createdAt', 'created_at', 'ts', 'zaman'],
  tutar: ['total', 'tutar', 'toplam', 'net', 'genelToplam'],
  odeme: ['payment', 'odeme', 'odemeTipi', 'odeme_tipi', 'tahsilat'],
  musteri: ['customerName', 'musteri', 'musteriAd', 'cari', 'customerId', 'musteriId', 'cariId'],
  kalemler: ['lines', 'kalemler', 'urunler', 'items', 'satirlar'],
  maliyet: ['cost', 'maliyet', 'alis', 'alisToplam'],
}
const KALEM = {
  ad: ['name', 'ad', 'urun', 'urunAd', 'baslik'],
  adet: ['qty', 'adet', 'miktar', 'quantity'],
  fiyat: ['unitPrice', 'fiyat', 'birimFiyat', 'satis', 'price'],
  maliyet: ['unitCost', 'alis', 'maliyet', 'cost'],
}

function alan(kayit, adaylar) {
  for (const a of adaylar) if (kayit != null && kayit[a] != null) return kayit[a]
  return undefined
}

/** Store içindeki nesne dizilerini gez; satış kaydına en çok benzeyeni seç. */
function satisDizisiBul(store) {
  const adaylar = []
  const gez = (dugum, yol, derinlik) => {
    if (derinlik > 3 || dugum == null || typeof dugum !== 'object') return
    if (Array.isArray(dugum)) {
      const ornek = dugum.find((x) => x && typeof x === 'object')
      if (ornek) adaylar.push({ yol, dizi: dugum, puan: puanla(ornek, yol) })
      return
    }
    for (const [k, v] of Object.entries(dugum)) gez(v, yol ? `${yol}.${k}` : k, derinlik + 1)
  }
  gez(store, '', 0)
  adaylar.sort((a, b) => b.puan - a.puan)
  return adaylar
}

function puanla(ornek, yol) {
  let p = 0
  if (alan(ornek, ALAN.tarih) != null) p += 3
  if (alan(ornek, ALAN.tutar) != null) p += 3
  if (alan(ornek, ALAN.kalemler) != null) p += 2
  if (alan(ornek, ALAN.odeme) != null) p += 1
  if (/satis|satış|sale|fis|fiş|siparis|sipariş|hareket/i.test(yol)) p += 3
  if (/urun|product|stok|musteri|customer|gider|expense/i.test(yol)) p -= 2
  return p
}

// ---- normalize ----
function gunuAl(deger) {
  if (typeof deger !== 'string') {
    if (typeof deger === 'number') return new Date(deger).toISOString().slice(0, 10)
    return ''
  }
  // "2026-09-07", "2026-09-07T10:11:00Z", "07.09.2026" hepsini karşıla
  const iso = deger.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const tr = deger.match(/^(\d{2})[./](\d{2})[./](\d{4})/)
  if (tr) return `${tr[3]}-${tr[2]}-${tr[1]}`
  return ''
}

function normalize(kayit) {
  const kalemlerHam = alan(kayit, ALAN.kalemler)
  return {
    gun: gunuAl(alan(kayit, ALAN.tarih)),
    tutar: Number(alan(kayit, ALAN.tutar)) || 0,
    maliyet: Number(alan(kayit, ALAN.maliyet)) || 0,
    odeme: String(alan(kayit, ALAN.odeme) ?? 'bilinmiyor'),
    musteri: alan(kayit, ALAN.musteri),
    kalemler: Array.isArray(kalemlerHam)
      ? kalemlerHam.map((l) => ({
          ad: String(alan(l, KALEM.ad) ?? '—'),
          adet: Number(alan(l, KALEM.adet)) || 0,
          fiyat: Number(alan(l, KALEM.fiyat)) || 0,
          maliyet: Number(alan(l, KALEM.maliyet)) || 0,
        }))
      : [],
    ham: kayit,
  }
}

// ---- biçim ----
const para = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n)

function baslik(metin) {
  console.log('\n' + metin)
  console.log('─'.repeat(metin.length))
}

// ---- komutlar ----
async function komutAnahtarlar() {
  const satirlar = await kvAnahtarlar()
  baslik(`kv tablosundaki anahtarlar (${satirlar.length})`)
  for (const r of satirlar) console.log(`  ${r.key}   (güncelleme: ${r.updated_at})`)
}

async function komutKesif() {
  const { value, updatedAt } = await veriGetir()
  baslik('Store yapısı')
  if (updatedAt) console.log(`son güncelleme: ${updatedAt}`)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      const tip = Array.isArray(v) ? `dizi[${v.length}]` : v === null ? 'null' : typeof v
      console.log(`  ${k}: ${tip}`)
    }
  }
  const adaylar = satisDizisiBul(value).slice(0, 5)
  baslik('Satış listesi adayları (puana göre)')
  for (const a of adaylar) {
    const ornek = a.dizi.find((x) => x && typeof x === 'object')
    console.log(`  ${a.yol || '(kök)'}  kayıt=${a.dizi.length}  puan=${a.puan}`)
    console.log(`    alanlar: ${Object.keys(ornek).join(', ')}`)
    const n = normalize(ornek)
    console.log(`    okunan → gün=${n.gun || '?'} tutar=${n.tutar} ödeme=${n.odeme} kalem=${n.kalemler.length}`)
  }
  console.log('\nDoğru liste en üstteki değilse: rapor komutuna --yol <yol> ver.')
}

async function komutRapor() {
  const tarih = gunuAl(konum[0] ?? '')
  if (!tarih) throw new Error('Tarih ver: node scripts/gun-raporu.mjs rapor 2026-09-07')
  const { value, updatedAt } = await veriGetir()

  const adaylar = satisDizisiBul(value)
  const yolSecim = opsiyon('yol')
  const secilen = yolSecim ? adaylar.find((a) => a.yol === yolSecim) : adaylar[0]
  if (!secilen) throw new Error(`Satış listesi bulunamadı${yolSecim ? ` (--yol ${yolSecim})` : ''}. Önce: kesif`)

  const hepsi = secilen.dizi.filter((x) => x && typeof x === 'object').map(normalize)
  const gunun = hepsi.filter((s) => s.gun === tarih)

  baslik(`${tarih} günlük rapor`)
  console.log(`kaynak: ${opsiyon('dosya') ?? opsiyon('anahtar', 'babuco:store')} → ${secilen.yol || '(kök)'}`)
  if (updatedAt) console.log(`verinin son güncellemesi: ${updatedAt}`)
  console.log(`toplam kayıt: ${hepsi.length}, bu güne ait: ${gunun.length}`)

  if (gunun.length === 0) {
    const gunler = [...new Set(hepsi.map((s) => s.gun).filter(Boolean))].sort().slice(-10)
    console.log(`\nBu tarihte kayıt yok. Veride bulunan son günler: ${gunler.join(', ') || '—'}`)
    return
  }

  const ciro = gunun.reduce((n, s) => n + s.tutar, 0)
  const maliyet = gunun.reduce((n, s) => n + (s.maliyet || s.kalemler.reduce((m, l) => m + l.maliyet * l.adet, 0)), 0)

  baslik('Özet')
  console.log(`  ciro          : ${para(ciro)}`)
  console.log(`  fiş sayısı    : ${gunun.length}`)
  console.log(`  ortalama fiş  : ${para(ciro / gunun.length)}`)
  if (maliyet > 0) {
    console.log(`  maliyet       : ${para(maliyet)}`)
    console.log(`  brüt kâr      : ${para(ciro - maliyet)}  (%${((1 - maliyet / ciro) * 100).toFixed(1)})`)
  }

  const grupla = (kayitlar, anahtarAl, tutarAl) => {
    const m = new Map()
    for (const k of kayitlar) {
      const a = anahtarAl(k)
      if (a == null || a === '') continue
      m.set(String(a), (m.get(String(a)) ?? 0) + tutarAl(k))
    }
    return [...m.entries()].sort((x, y) => y[1] - x[1])
  }

  const odemeler = grupla(gunun, (s) => s.odeme, (s) => s.tutar)
  if (odemeler.length) {
    baslik('Ödeme tipine göre')
    for (const [ad, t] of odemeler) console.log(`  ${ad.padEnd(14)} ${para(t)}`)
  }

  const musteriler = grupla(gunun, (s) => s.musteri, (s) => s.tutar)
  if (musteriler.length) {
    baslik('Müşteriye göre')
    for (const [ad, t] of musteriler.slice(0, 15)) console.log(`  ${ad.padEnd(24)} ${para(t)}`)
  }

  const kalemler = gunun.flatMap((s) => s.kalemler)
  if (kalemler.length) {
    const urunAdet = grupla(kalemler, (l) => l.ad, (l) => l.adet)
    const urunTutar = new Map(grupla(kalemler, (l) => l.ad, (l) => l.adet * l.fiyat))
    baslik('Ürünlere göre')
    for (const [ad, adet] of urunAdet.slice(0, 25)) {
      console.log(`  ${ad.padEnd(28)} ${String(adet).padStart(6)} adet   ${para(urunTutar.get(ad) ?? 0)}`)
    }
  }
  console.log('')
}

const komutlar = {
  anahtarlar: komutAnahtarlar,
  kesif: komutKesif,
  rapor: komutRapor,
  yardim: async () => {
    console.log(`Günlük satış raporu

  node scripts/gun-raporu.mjs anahtarlar                      kv'deki anahtarları listele
  node scripts/gun-raporu.mjs kesif --anahtar babuco:store    store yapısını çöz
  node scripts/gun-raporu.mjs rapor 2026-09-07                günlük raporu yaz
  node scripts/gun-raporu.mjs rapor 2026-09-07 --dosya y.json bulut yerine dosyadan oku

Seçenekler: --anahtar <kv anahtarı>  --dosya <json>  --yol <satış listesi yolu>`)
  },
}

try {
  await (komutlar[komut] ?? komutlar.yardim)()
} catch (e) {
  console.error('HATA:', e.message)
  process.exit(1)
}
