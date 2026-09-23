/**
 * Çizgi ikonlar — emoji yerine. Tek renk (currentColor), 24'lük ızgara,
 * dosya/istek yok: eski telefonda da anında çizilir ve her temada aynı görünür.
 */
const YOLLAR = {
  ev: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  kamyon: 'M2 6h11v10H2zM13 9h4l4 4v3h-8zM6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  arti: 'M12 5v14M5 12h14',
  hediye: 'M4 11h16v10H4zM2.5 7h19v4h-19zM12 7v14M12 7S10.5 3 8 3.5 7 7 12 7zM12 7s1.5-4 4-3.5S17 7 12 7z',
  grafik: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  ara: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  kapat: 'M6 6l12 12M18 6 6 18',
  kisi: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  kisiler: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 4.2a3.5 3.5 0 0 1 0 6.6M18 14.8c2.4.6 4 2.3 4 5.2',
  saat: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  dikkat: 'M12 3 2 20h20zM12 10v4M12 17.5v.01',
  ay: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  kalem: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  fis: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  goz: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cop: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  geri: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  asagi: 'M6 9l6 6 6-6',
  yukari: 'M6 15l6-6 6 6',
  sag: 'M9 6l6 6-6 6',
  sol: 'M15 6l-6 6 6 6',
  kutu: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9',
  para: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01',
  kart: 'M2 5h20v14H2zM2 10h20M6 15h4',
  defter: 'M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2zM5 17a2 2 0 0 1 2-2h12M9 7h6',
  takvim: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  ayar: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  cikis: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3',
  indir: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  yukle: 'M12 21V9M7 14l5-5 5 5M4 3h16',
  paylas: 'M12 3v13M7 8l5-5 5 5M5 12v8h14v-8',
  yazici: 'M6 9V3h12v6M6 18H3v-8h18v8h-3M6 14h12v7H6z',
  tik: 'M4 12.5 9.5 18 20 6',
  bol: 'M12 3v18M5 8h4M15 16h4M5 16h4M15 8h4',
  gunes: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  telefon: 'M7 2h10v20H7zM11 18h2',
  menu: 'M4 7h16M4 12h16M4 17h16',
  dukkan: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6',
  izgara: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  sepet: 'M3 4h2l2.2 11h10.6L20 7H6.2M9 20h.01M17 20h.01',
} as const

export type IkonAd = keyof typeof YOLLAR

export function Ikon({ ad, boy = 20, kalinlik = 1.8 }: { ad: IkonAd; boy?: number; kalinlik?: number }) {
  return (
    <svg
      className="ikon"
      width={boy}
      height={boy}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={kalinlik}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={YOLLAR[ad]} />
    </svg>
  )
}
