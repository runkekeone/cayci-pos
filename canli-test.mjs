import { chromium } from 'playwright'

const URL = 'https://runkekeone.github.io/cayci-pos/'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 393, height: 851 },
  hasTouch: true,
})
const page = await ctx.newPage()

await page.goto(URL, { waitUntil: 'networkidle' })

// Uygulama açıldı mı?
const girisVar = await page.locator('text=Çay Ocağı POS').first().isVisible()

// Service worker kaydoldu mu? (kurulabilirlik ve çevrimdışı çalışma için şart)
const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'destek yok'
  const kayit = await navigator.serviceWorker.getRegistration()
  return kayit ? 'kayıtlı: ' + kayit.scope : 'kayıt yok'
})

// Manifest okunabiliyor mu?
const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel=manifest]')
  const r = await fetch(link.href)
  const m = await r.json()
  return { ad: m.name, mod: m.display, baslangic: m.start_url }
})

// Güvenli bağlam mı? (HTTPS)
const guvenli = await page.evaluate(() => window.isSecureContext)

console.log('Giriş ekranı açıldı :', girisVar ? 'evet' : 'HAYIR')
console.log('HTTPS güvenli bağlam:', guvenli ? 'evet' : 'HAYIR')
console.log('Service worker      :', sw)
console.log('Manifest            :', JSON.stringify(manifest))

await page.screenshot({ path: 'mobil-ss/canli-giris.png' })
await browser.close()
