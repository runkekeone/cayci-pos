import { useEffect } from 'react'
import type { State } from '../types'

/**
 * Tema ve yazı boyutu — CSS'e <html> üstündeki data- niteliğiyle bildirilir.
 *
 *   data-tema="koyu" | "acik"   → renk token'ları
 *   data-yazi="buyuk"           → tabanı 16px'e çıkarır
 *
 * 'sistem' seçiliyse nitelik yazılmaz; CSS prefers-color-scheme'e düşer, yani
 * telefon akşam koyuya geçtiğinde uygulama da geçer.
 */
export function useTema(settings: State['settings'] | undefined) {
  // settings tanımsız olabiliyor (eski şemadan yedek geri yüklendiğinde);
  // burada patlarsa tüm uygulama beyaz ekrana düşer.
  const tema = settings?.tema ?? 'sistem'
  const buyuk = settings?.buyukYazi ?? false

  useEffect(() => {
    const kok = document.documentElement
    if (tema === 'sistem') delete kok.dataset.tema
    else kok.dataset.tema = tema

    if (buyuk) kok.dataset.yazi = 'buyuk'
    else delete kok.dataset.yazi

    // Adres çubuğu / durum çubuğu da temayla uyumlu olsun (APK ve Chrome).
    const meta = document.querySelector('meta[name="theme-color"]')
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const renkYaz = () => {
      if (!meta) return
      const koyuMu = tema === 'koyu' || (tema === 'sistem' && mq.matches)
      // Açıkta mevcut marka rengi korunur; koyuda uygulamanın kendi zemini
      // (--bg ile aynı değer olmalı, yoksa çubukla sayfa arasında şerit görünür).
      meta.setAttribute('content', koyuMu ? '#14120e' : '#a3562a')
    }
    renkYaz()

    // "Sistem" modunda telefon akşam koyuya geçince CSS dönüyordu ama adres
    // çubuğu açık renkte kalıyordu — sistem değişimini de dinliyoruz.
    if (tema !== 'sistem') return
    mq.addEventListener('change', renkYaz)
    return () => mq.removeEventListener('change', renkYaz)
  }, [tema, buyuk])
}
