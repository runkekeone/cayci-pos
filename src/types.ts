// Temel birimler. Alışlar kg/lt/paket ile girilse de her şey burada saklanır.
export type Unit = 'g' | 'ml' | 'adet'

export interface RecipeLine {
  itemId: string
  /** Tarifin tamamı (bir parti) için gereken miktar, temel birimde. */
  qty: number
}

export interface Recipe {
  lines: RecipeLine[]
  /** Bir partiden kaç porsiyon/adet çıkar. Demlik: 119 g çay -> 25 bardak. */
  yield: number
}

/**
 * Ürün çeşidi. Aynı üründen çıkar ama tarifi/fiyatı biraz oynar.
 * Duble çay 2 kat çay çeker, açık çay az çeker, şekersiz çayda şeker düşmez,
 * "kuşburnu" oraletiyle "elma" oraletinin maliyeti aynıdır — sadece adı değişir.
 */
export interface Variant {
  id: string
  name: string
  /** Satış fiyatına eklenir (eksi de olabilir). */
  priceDelta?: number
  /** Tarif miktarlarını çarpar. Duble 2, açık 0.6. */
  factor?: number
  /** Bu kalemler tarifden düşülmesin. Şekersiz çay -> şeker. */
  skip?: string[]
}

export interface Item {
  id: string
  name: string
  /** Temel birim: g | ml | adet. Hesaplar hep bunda döner. */
  unit: Unit
  /** Kullanıcının aldığı/gördüğü birim: kg, lt, cc, koli... Sadece gösterim ve giriş içindir. */
  buyUnit: string
  /**
   * Bir alış biriminde kaç temel birim var — sabit çevrimle bulunamayan kalemler için.
   * 1 kg küp şeker = 405 küp, 1 koli soda = 24 adet. Kullanıcı alışta girer.
   * Sadece unit === 'adet' iken anlamlı.
   */
  packSize?: number
  category: string
  icon: string
  /** Satış ekranında çıkar mı. */
  sellable: boolean
  price?: number
  /** Tarifli ürünün kendi stoğu tutulmaz; satışta içindekiler düşer. */
  recipe?: Recipe
  /** Çeşitleri. Sadece "detaylı satış" modunda sorulur. */
  variants?: Variant[]
  stock: number
  minStock?: number
  /** Son alış: maliyet bundan hesaplanır (ortalama yok). */
  lastCost?: { total: number; qty: number }
}

export interface Purchase {
  id: string
  date: string
  itemId: string
  qty: number
  total: number
  supplier?: string
  /** Kasadan nakit mi ödendi — beklenen kasadan düşülür. Eski kayıtlarda yok (undefined = bilinmiyor). */
  paidCash?: boolean
  bizDay?: string
}

export interface SaleLine {
  itemId: string
  name: string
  qty: number
  unitPrice: number
  unitCost: number
  variantId?: string
  variantName?: string
  /** İkram/zayi satırı: fiyatı 0, stok masa kapanınca düşer, gelir oluşturmaz. */
  waste?: 'ikram' | 'fire'
}

export type Payment = 'nakit' | 'kart' | 'veresiye'

/** Parçalı ödemenin bir parçası. Veresiye parçası mutlaka bir müşteriye yazılır. */
export interface PaymentPart {
  payment: Payment
  amount: number
  customerId?: string
}

export interface Sale {
  id: string
  date: string
  lines: SaleLine[]
  total: number
  cost: number
  /** Tek ödemede kullanılır. Parçalı ödemede ilk parçanın tipi yazılır. */
  payment: Payment
  /** Hesap bölündüyse parçalar burada. Raporlar önce buraya bakar. */
  payments?: PaymentPart[]
  customerId?: string
  /** Bu satışta kazandırılan sadakat puanı (1 puan = 1 TL). */
  puanKazanilan?: number
  /** Bu satışta harcanan puan (TL). */
  puanKullanilan?: number
  /** Bu satışta müşterinin bakiyesine eklenen tutar. */
  bakiyeBirakilan?: number
  /** Puan/bakiye hangi müşteriye işlendi (nakit satışta bile olabilir; customerId sadece veresiye). */
  puanMusteriId?: string
  tableId?: string
  /** Kapanış anındaki masa adı (Masa 1, "Bahçe" vb.). Hızlı satışta boş. */
  tableName?: string
  /** Ait olduğu iş günü oturumu (YYYY-MM-DD). Gece yarısını aşan gün için takvim gününden farklı olabilir. */
  bizDay?: string
}

export interface Table {
  id: string
  name: string
  lines: SaleLine[]
  openedAt?: string
  /** Masaya oturan müşteri (detaylı mod). Veresiyede varsayılan olarak seçilir. */
  customerId?: string
}

export interface Customer {
  id: string
  name: string
  phone?: string
  /** Pozitif = bize borçlu (veresiye). */
  balance: number
  /** Sadakat puanı. 1 puan = 1 TL. Gerçek alışverişte harcanabilir. */
  puan?: number
  /** Ayrı bırakılan bakiye borcu (veresiyeden bağımsız). Pozitif = müşteri borçlu. Puanla ödenemez. */
  bakiye?: number
}

export interface CustomerPayment {
  id: string
  date: string
  customerId: string
  amount: number
  method: 'nakit' | 'kart'
  bizDay?: string
}

export interface Expense {
  id: string
  /** Sadece 'gunluk' için dolu. Sabit giderlerde boş. */
  date: string
  name: string
  amount: number
  /**
   * aylik       = kira/elektrik gibi. 30'a bölünüp her günün kârından düşer.
   * gunluk-sabit = eleman yevmiyesi gibi. Her gün olduğu gibi düşer.
   * gunluk      = o gün bir kereliğine çıkan para.
   */
  kind: 'gunluk' | 'gunluk-sabit' | 'aylik'
  paidCash: boolean
}

export interface Waste {
  id: string
  date: string
  itemId: string
  name: string
  qty: number
  reason: 'fire' | 'ikram'
  cost: number
  bizDay?: string
}

export interface CashDay {
  /** YYYY-MM-DD */
  date: string
  /** Gün başı fiziki nakit (para üstü). */
  opening: number
  /** Gün sonu sayılan nakit. */
  counted?: number
  /** Gün başlatıldı — ISO zaman. Doluysa ve closedAt boşsa oturum AÇIK. */
  openedAt?: string
  /** Gün kapatıldı — ISO zaman. */
  closedAt?: string
}

export interface Business {
  name: string
  address: string
  phone: string
  owner: string
  openTime: string
  closeTime: string
}

// ---- Toptancı (B2B) katmanı ----

/** Toptancı katalog kalemi. Koli veya adet olarak sipariş edilir. */
export interface CatalogItem {
  id: string
  name: string
  brand?: string
  category: string
  /** İçindeki temel birim — çoğu HORECA kaleminde 'adet'. */
  unit: 'adet' | 'g' | 'ml'
  /** Sipariş birimi: koli / paket / adet. */
  buyUnit: string
  /** Bir alış biriminde kaç adet var (1 koli = 24 adet). */
  packSize: number
  /** Koli (alış birimi) fiyatı. */
  koliPrice: number
  /** Tek adet fiyatı. */
  adetPrice: number
  /** Toptancının koli alış maliyeti. Kâr marjı = koliPrice − cost. BenimPOS alış fiyatından. */
  cost?: number
  /** Ürün barkodu (BenimPOS kataloğundan gelenler için). */
  barcode?: string
  firmId?: string
  active: boolean
}

export interface OrderLine {
  catalogItemId: string
  name: string
  /** Sipariş edilen birim: 'koli' | 'adet'. */
  birim: 'koli' | 'adet'
  qty: number
  /** O birimin fiyatı (koliPrice veya adetPrice). */
  unitPrice: number
}

/** Kıraathanenin toptancıya geçtiği sipariş (giden). */
export interface Order {
  id: string
  date: string
  status: 'taslak' | 'gonderildi'
  lines: OrderLine[]
  note?: string
  gonderim?: 'qr' | 'whatsapp' | 'dosya' | 'bulut'
  /** Toptancı tarafındaki işlem durumu (buluttan çekilir): yeni|onay|dagitim|teslim. */
  durum?: string
  /** Gönderen kıraathane bilgisi — karşı tarafta bayi eşleşmesi için. */
  from?: { name: string; phone?: string }
}

/** Uygulamanın/toptancının verdiği sadakat ödülü. Kullanıcı düzenleyemez. fiyat = TL = puan (1 puan = 1 TL). */
export interface Hizmet {
  id: string
  ad: string
  ikon: string
  aciklama: string
  fiyat: number
}

export interface State {
  items: Item[]
  purchases: Purchase[]
  sales: Sale[]
  tables: Table[]
  customers: Customer[]
  payments: CustomerPayment[]
  expenses: Expense[]
  wastes: Waste[]
  cashDays: CashDay[]
  business: Business
  /** Kıraathanenin toptancıya geçtiği siparişler (giden). */
  orders?: Order[]
  /** Kurulum sihirbazı tamamlandı mı. Tamamlanmadan uygulamaya girilemez. */
  setupDone: boolean
  /** otoGun: açılış/kapanış saatine göre günü otomatik başlat/bitir. Şimdilik kapalı, ileride açılacak. */
  settings: { showImages: boolean; otoGun?: boolean; sarfTemizlendi?: boolean }
}
