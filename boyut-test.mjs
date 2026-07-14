import { chromium } from 'playwright'

const URL = 'http://localhost:4173'

const BOYUTLAR = [
  { ad: 'iPhone SE (küçük)', w: 375, h: 667 },
  { ad: 'Android küçük', w: 360, h: 640 },
  { ad: 'iPhone 14 Pro', w: 393, h: 852 },
  { ad: 'iPhone 14 Pro Max', w: 430, h: 932 },
  { ad: 'Tablet dikey', w: 768, h: 1024 },
  { ad: 'Masaüstü', w: 1440, h: 900 },
]

const browser = await chromium.launch()
let hata = 0

for (const b of BOYUTLAR) {
  const ctx = await browser.newContext({
    viewport: { width: b.w, height: b.h },
    hasTouch: b.w < 900,
  })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })

  // üye ol + kur
  await page.getByRole('button', { name: 'Üye ol' }).click()
  await page.locator('.card input').nth(0).fill('B')
  await page.locator('.card input').nth(1).fill('b' + Date.now().toString().slice(-7) + b.w)
  await page.locator('.card input').nth(2).fill('1234')
  await page.getByRole('button', { name: /Üye ol ve kuruluma başla/ }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Önerilen ayarlarla kur/ }).click()
  await page.waitForTimeout(500)

  // satış yap
  await page.locator('.tile', { hasText: 'Çay' }).first().click()

  const sonuc = await page.evaluate(() => {
    const tasma = document.documentElement.scrollWidth > window.innerWidth + 1
    // sepet erişilebilir mi: masaüstünde panel görünür, mobilde çubuk var
    const bar = document.querySelector('.sepet-bar')
    const cart = document.querySelector('.cart')
    const cs = getComputedStyle(cart)
    const barGorunur = bar && getComputedStyle(bar).display !== 'none'
    const cartGorunur = cs.visibility !== 'hidden' && cs.display !== 'none'
    // alt çubuk / yan menü var mı
    const side = document.querySelector('.side')
    const ss = getComputedStyle(side)
    return {
      tasma,
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      sepeteUlasilir: barGorunur || cartGorunur,
      menuPozisyon: ss.position,
    }
  })

  const ok = !sonuc.tasma && sonuc.sepeteUlasilir
  if (!ok) hata++
  console.log(
    `${b.ad.padEnd(20)} ${String(b.w).padStart(4)}x${b.h}  ` +
      `taşma=${sonuc.tasma ? 'VAR (' + sonuc.scrollW + ')' : 'yok'}  ` +
      `sepet=${sonuc.sepeteUlasilir ? 'erişilebilir' : 'ERİŞİLEMEZ'}  ` +
      `menü=${sonuc.menuPozisyon}  ${ok ? '✓' : '✗'}`,
  )

  await page.screenshot({ path: `mobil-ss/boyut-${b.w}.png` })
  await ctx.close()
}

await browser.close()
console.log(hata === 0 ? '\nTüm boyutlar temiz.' : `\n${hata} boyutta sorun var.`)
