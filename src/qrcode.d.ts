// qrcode paketinin resmi tip tanımı yok (@types/qrcode kurulu değil).
// Kullandığımız tek fonksiyon toDataURL — minimal ambient tanım.
declare module 'qrcode' {
  interface QrToDataURLOptions {
    margin?: number
    width?: number
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  }
  const QRCode: {
    toDataURL(text: string, options?: QrToDataURLOptions): Promise<string>
  }
  export default QRCode
}
