import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Uygulama iki yerde çalışıyor, yolları farklı:
 *
 * - GitHub Pages: depo adının altında yayınlanır -> /cayci-pos/
 * - APK (Capacitor): dosyalar telefonun kendi içinden açılır -> göreli yol
 *
 * APK derlemesi için: APK=1 npm run build
 */
const APK = process.env.APK === '1'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? (APK ? './' : '/cayci-pos/') : '/',
  plugins: [react()],
}))
