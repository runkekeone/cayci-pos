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
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // kayıt olmazsa uygulama yine çalışır, sadece çevrimdışı açılmaz
    })
  })
}
