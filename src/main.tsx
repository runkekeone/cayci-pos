import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Çevrimdışı kabuk. Sadece derlenmiş sürümde — geliştirirken önbellek kafa karıştırır.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // BASE_URL: GitHub Pages'te "/cayci-pos/", yerelde "/"
    const taban = import.meta.env.BASE_URL
    navigator.serviceWorker.register(`${taban}sw.js`, { scope: taban }).catch(() => {
      // kayıt olmazsa uygulama yine çalışır, sadece çevrimdışı açılmaz
    })
  })
}
