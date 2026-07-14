import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * GitHub Pages uygulamayı kök dizinde değil, depo adının altında yayınlar:
 *   https://<kullanıcı>.github.io/cayci-pos/
 * Bu yüzden tüm dosya yolları bu ön ekle üretilmeli. Yerelde geliştirirken
 * (npm run dev) kök dizin kullanılır.
 */
const TABAN = '/cayci-pos/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? TABAN : '/',
  plugins: [react()],
}))
