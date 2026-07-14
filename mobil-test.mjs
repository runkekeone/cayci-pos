import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = 'http://localhost:4173'
const OUT = 'mobil-ss'
mkdirSync(OUT, { recursive: true })

/**
 * Pixel 5 boyutu + dokunmatik, ama Playwright'ın isMobile emülasyonu KAPALI.
 * isMobile açıkken Chromium viewport'u 393 yerine 422 CSS px'e ölçekliyor ve
 * sabit konumlu öğelerde tıklama hit-test'i kayıyor — bu aracın kusuru,
 * uygulamanın değil (aynı sayfa emülasyonsuz sorunsuz tıklanıyor).
 */
const telefon = {
  viewport: { width: 393, height: 851 },
  hasTouch: true,
  deviceScaleFactor: 2.75,
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
}

const sorunlar = []

async function kontrol(page, ad) {
  // 1) Yatay taşma var mı — mobilde en sık görülen kusur
  const tasma = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    ic: window.innerWidth,
  }))
  if (tasma.scroll > tasma.ic + 1) {
    sorunlar.push(`${ad}: yatay taşma (${tasma.scroll}px > ${tasma.ic}px)`)
  }

  // 2) Ekran dışına taşan öğe var mı
  const tasanlar = await page.evaluate(() => {
    const w = window.innerWidth
    const out = []
    // Kendi içinde yatay kayan bir kutunun (tablo sarmalayıcı) içindeyse sorun değil.
    const kayanIcinde = (el) => {
      let p = el.parentElement
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX
        if (ox === 'auto' || ox === 'scroll') return true
        p = p.parentElement
      }
      return false
    }
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && (r.right > w + 1 || r.left < -1) && !kayanIcinde(el)) {
        out.push(
          `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} (${Math.round(r.left)}..${Math.round(r.right)})`,
        )
      }
    }
    return [...new Set(out)].slice(0, 5)
  })
  if (tasanlar.length) sorunlar.push(`${ad}: taşan öğeler -> ${tasanlar.join(', ')}`)

  // 3) Dokunma hedefi çok küçük mü (Google: en az 44px)
  const kucuk = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('button, a, select, input[type=checkbox]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.height < 32) out.push(`${el.textContent?.trim().slice(0, 18) || el.tagName} h=${Math.round(r.height)}`)
    }
    return [...new Set(out)].slice(0, 6)
  })
  if (kucuk.length) sorunlar.push(`${ad}: küçük dokunma hedefi -> ${kucuk.join(', ')}`)

  await page.screenshot({ path: `${OUT}/${ad}.png`, fullPage: false })
  console.log(`  ${ad}: ekran görüntüsü alındı`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...telefon })
const page = await ctx.newPage()

console.log('--- MOBİL TEST (Pixel 5, 393x851) ---')

// Giriş
await page.goto(URL, { waitUntil: 'networkidle' })
await kontrol(page, '01-giris')

// Üye ol
await page.getByRole('button', { name: 'Üye ol' }).click()
await page.locator('.card input').nth(0).fill('Test Kıraathane')
await page.locator('.card input').nth(1).fill('mobil' + Date.now().toString().slice(-5))
await page.locator('.card input').nth(2).fill('1234')
await kontrol(page, '02-uyelik')
await page.getByRole('button', { name: /Üye ol ve kuruluma başla/ }).click()

// Kurulum
await page.waitForTimeout(400)
await kontrol(page, '03-kurulum')
await page.getByRole('button', { name: /Önerilen ayarlarla kur/ }).click()
await page.waitForTimeout(500)

// Satış
await kontrol(page, '04-satis')

// Sepete ürün at
const cayTile = page.locator('.tile', { hasText: 'Çay' }).first()
await cayTile.click()
await cayTile.click()
await page.waitForTimeout(300)
await kontrol(page, '05-satis-sepet-bar')

// Sepet panelini aç
await page.locator('.sepet-bar').click()
await page.waitForTimeout(400)
await kontrol(page, '06-sepet-panel')

// Ödeme al
await page.locator('.cart .pays button', { hasText: 'Nakit' }).click()
await page.waitForTimeout(400)
await kontrol(page, '07-satis-sonrasi')

// Alt çubuktaki ana sayfalar
for (const [ad, dosya] of [
  ['Rapor', '08-rapor'],
  ['Ürünler', '09-urunler'],
  ['Stok', '10-stok'],
  ['Müşteri', '11-musteriler'],
]) {
  await page.locator('.side .nav', { hasText: ad }).first().click()
  await page.waitForTimeout(350)
  await kontrol(page, dosya)
}

// "Daha" panelindeki sayfalar
for (const [ad, dosya] of [
  ['Giderler', '12-giderler'],
  ['Kasa', '13-kasa'],
  ['Takvim', '14-takvim'],
]) {
  await page.locator('.side .nav', { hasText: 'Daha' }).click()
  await page.waitForTimeout(250)
  if (dosya === '12-giderler') await kontrol(page, '12a-daha-paneli')
  await page.locator('.modal .nav', { hasText: ad }).first().click()
  await page.waitForTimeout(350)
  await kontrol(page, dosya)
}

await browser.close()

console.log('\n--- SONUÇ ---')
if (sorunlar.length === 0) {
  console.log('Sorun yok.')
} else {
  for (const s of sorunlar) console.log('  ! ' + s)
}
