import type { CatalogItem, Item, Unit, Variant } from './types'
import { alisToBase, uid } from './lib/units'

/**
 * TOPTANCI KATALOGU.
 * Kullanıcının Excel fiyat listelerinden (kahvehane katalog + temizlik) üretildi.
 * Koli fiyatı + adet fiyatı + koli içi adet (packSize). Fiyatlar 2026-07-15 taslağı;
 * toptancı panelinden güncellenebilir. Faz 2'de buluttan otomatik güncellenecek.
 */
export const TOPTANCI_KATALOG: CatalogItem[] = [
  { id: "k-caykur-tiryaki-cay-0", name: "Caykur Tiryaki Cay", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 2760, adetPrice: 230, active: true },
  { id: "k-caykur-rize-turist-cay-1", name: "Caykur Rize Turist Cay", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 2400, adetPrice: 200, active: true },
  { id: "k-dogus-karadeniz-cay-2", name: "Dogus Karadeniz Cay", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 2280, adetPrice: 190, active: true },
  { id: "k-lipton-yellow-label-bardak-poset-3", name: "Lipton Yellow Label Bardak Poset", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1140, adetPrice: 95, active: true },
  { id: "k-dogadan-ihlamur-4", name: "Dogadan Ihlamur", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 840, adetPrice: 70, active: true },
  { id: "k-dogadan-ada-cayi-5", name: "Dogadan Ada Cayi", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 780, adetPrice: 65, active: true },
  { id: "k-kurukahveci-mehmet-efendi-turk-kahve-6", name: "Kurukahveci Mehmet Efendi Turk Kahvesi", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1020, adetPrice: 85, active: true },
  { id: "k-hisar-turk-kahvesi-7", name: "Hisar Turk Kahvesi", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1800, adetPrice: 150, active: true },
  { id: "k-jacobs-monarch-filtre-kahve-8", name: "Jacobs Monarch Filtre Kahve", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 2640, adetPrice: 220, active: true },
  { id: "k-kent-boringer-salep-9", name: "Kent Boringer Salep", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "koli", packSize: 10, koliPrice: 1450, adetPrice: 145, active: true },
  { id: "k-fo-sicak-cikolata-10", name: "Fo Sicak Cikolata", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "koli", packSize: 10, koliPrice: 1320, adetPrice: 132, active: true },
  { id: "k-torku-kup-seker-11", name: "Torku Kup Seker", category: "Tatlandirici", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 960, adetPrice: 80, active: true },
  { id: "k-irmak-kup-seker-12", name: "Irmak Kup Seker", category: "Tatlandirici", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 1320, adetPrice: 330, active: true },
  { id: "k-torku-toz-seker-13", name: "Torku Toz Seker", category: "Tatlandirici", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 1020, adetPrice: 255, active: true },
  { id: "k-canderel-tablet-tatlandirici-14", name: "Canderel Tablet Tatlandirici", category: "Tatlandirici", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1440, adetPrice: 120, active: true },
  { id: "k-pasabahce-ince-belli-cay-bardagi-15", name: "Pasabahce Ince Belli Cay Bardagi", category: "Sarf", unit: 'adet', buyUnit: "koli", packSize: 8, koliPrice: 1280, adetPrice: 160, active: true },
  { id: "k-pasabahce-cay-tabagi-16", name: "Pasabahce Cay Tabagi", category: "Sarf", unit: 'adet', buyUnit: "koli", packSize: 8, koliPrice: 960, adetPrice: 120, active: true },
  { id: "k-kutahya-porselen-turk-kahvesi-fincan-17", name: "Kutahya Porselen Turk Kahvesi Fincani", category: "Sarf", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 1680, adetPrice: 420, active: true },
  { id: "k-huhtamaki-karton-bardak-18", name: "Huhtamaki Karton Bardak", category: "Sarf", unit: 'adet', buyUnit: "koli", packSize: 20, koliPrice: 1900, adetPrice: 95, active: true },
  { id: "k-tahta-karistirici-19", name: "Tahta Karistirici", category: "Sarf", unit: 'adet', buyUnit: "koli", packSize: 10, koliPrice: 650, adetPrice: 65, active: true },
  { id: "k-koroplast-pipet-20", name: "Koroplast Pipet", category: "Sarf", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 720, adetPrice: 30, active: true },
  { id: "k-selpak-professional-dispenser-pecete-21", name: "Selpak Professional Dispenser Pecete", category: "Sarf", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 1440, adetPrice: 60, active: true },
  { id: "k-sirma-su-22", name: "Sirma Su", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 240, adetPrice: 10, active: true },
  { id: "k-erikli-su-23", name: "Erikli Su", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 300, adetPrice: 12.5, active: true },
  { id: "k-beypazari-sade-soda-24", name: "Beypazari Sade Soda", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 300, adetPrice: 12.5, active: true },
  { id: "k-kizilay-sade-soda-25", name: "Kizilay Sade Soda", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 288, adetPrice: 12, active: true },
  { id: "k-beypazari-limonlu-soda-26", name: "Beypazari Limonlu Soda", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 360, adetPrice: 15, active: true },
  { id: "k-coca-cola-27", name: "Coca-Cola", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 720, adetPrice: 30, active: true },
  { id: "k-pepsi-28", name: "Pepsi", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 660, adetPrice: 27.5, active: true },
  { id: "k-uludag-gazoz-29", name: "Uludag Gazoz", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 600, adetPrice: 25, active: true },
  { id: "k-cappy-karisik-meyve-suyu-30", name: "Cappy Karisik Meyve Suyu", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 27, koliPrice: 675, adetPrice: 25, active: true },
  { id: "k-sutas-ayran-31", name: "Sutas Ayran", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 20, koliPrice: 320, adetPrice: 16, active: true },
  { id: "k-red-bull-32", name: "Red Bull", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 1200, adetPrice: 50, active: true },
  { id: "k-ulker-biskuvi-cesitleri-33", name: "Ulker Biskuvi Cesitleri", category: "Atistirmalik", unit: 'adet', buyUnit: "koli", packSize: 2436, koliPrice: 720, adetPrice: 30, active: true },
  { id: "k-eti-crax-34", name: "Eti Crax", category: "Atistirmalik", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 600, adetPrice: 25, active: true },
  { id: "k-ulker-cikolatali-gofret-35", name: "Ulker Cikolatalı Gofret", category: "Atistirmalik", unit: 'adet', buyUnit: "koli", packSize: 36, koliPrice: 1320, adetPrice: 36.67, active: true },
  { id: "k-eti-karam-36", name: "Eti Karam", category: "Atistirmalik", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 1320, adetPrice: 55, active: true },
  { id: "k-tadim-siyah-cekirdek-37", name: "Tadim Siyah Cekirdek", category: "Atistirmalik", unit: 'adet', buyUnit: "koli", packSize: 20, koliPrice: 900, adetPrice: 45, active: true },
  { id: "k-koska-sade-lokum-38", name: "Koska Sade Lokum", category: "Atistirmalik", unit: 'adet', buyUnit: "koli", packSize: 6, koliPrice: 900, adetPrice: 150, active: true },
  { id: "k-taze-limon-39", name: "Taze limon", category: "Mutfak sarf", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 450, adetPrice: 450, active: true },
  { id: "k-sutas-uht-sut-40", name: "Sutas UHT Sut", category: "Mutfak sarf", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 480, adetPrice: 40, active: true },
  { id: "k-billur-tuz-41", name: "Billur Tuz", category: "Mutfak sarf", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 240, adetPrice: 20, active: true },
  { id: "k-karabiber-pul-biber-42", name: "Karabiber / Pul biber", category: "Mutfak sarf", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 360, adetPrice: 30, active: true },
  { id: "k-elektrikli-cay-kazani-43", name: "Elektrikli Cay Kazani", category: "Cay ocagi", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 8500, adetPrice: 8500, active: true },
  { id: "k-dogalgazli-cay-ocagi-44", name: "Dogalgazli Cay Ocagi", category: "Cay ocagi", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 18500, adetPrice: 18500, active: true },
  { id: "k-korkmaz-buyuk-boy-caydanlik-45", name: "Korkmaz Buyuk Boy Caydanlik", category: "Cay ocagi", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1800, adetPrice: 1800, active: true },
  { id: "k-paslanmaz-demlik-46", name: "Paslanmaz Demlik", category: "Cay ocagi", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 850, adetPrice: 850, active: true },
  { id: "k-metal-cay-suzgeci-47", name: "Metal Cay Suzgeci", category: "Cay ocagi", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 360, adetPrice: 30, active: true },
  { id: "k-paslanmaz-cay-kasigi-48", name: "Paslanmaz Cay Kasigi", category: "Cay ocagi", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 480, adetPrice: 40, active: true },
  { id: "k-ugur-mesrubat-dolabi-49", name: "Ugur Mesrubat Dolabi", category: "Sogutma", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 28000, adetPrice: 28000, active: true },
  { id: "k-arcelik-buzdolabi-50", name: "Arcelik Buzdolabi", category: "Sogutma", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 24000, adetPrice: 24000, active: true },
  { id: "k-ugur-derin-dondurucu-51", name: "Ugur Derin Dondurucu", category: "Sogutma", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 19000, adetPrice: 19000, active: true },
  { id: "k-set-ustu-ocak-52", name: "Set ustu ocak", category: "Mutfak", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 2500, adetPrice: 2500, active: true },
  { id: "k-aygaz-ipragaz-tup-53", name: "Aygaz / Ipragaz Tup", category: "Mutfak", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 950, adetPrice: 950, active: true },
  { id: "k-sanayi-tipi-tost-makinesi-54", name: "Sanayi Tipi Tost Makinesi", category: "Mutfak", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 9500, adetPrice: 9500, active: true },
  { id: "k-samsung-arcelik-mikrodalga-55", name: "Samsung / Arcelik Mikrodalga", category: "Mutfak", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 4200, adetPrice: 4200, active: true },
  { id: "k-aritma-cihazi-56", name: "Aritma Cihazi", category: "Mutfak", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 6500, adetPrice: 6500, active: true },
  { id: "k-kahvehane-masasi-57", name: "Kahvehane Masasi", category: "Mobilya", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1800, adetPrice: 1800, active: true },
  { id: "k-metal-ahsap-sandalye-58", name: "Metal/Ahsap Sandalye", category: "Mobilya", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 650, adetPrice: 650, active: true },
  { id: "k-plastik-metal-tabure-59", name: "Plastik/metal tabure", category: "Mobilya", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 300, adetPrice: 300, active: true },
  { id: "k-pvc-masa-ortusu-60", name: "PVC Masa Ortusu", category: "Mobilya", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1800, adetPrice: 1800, active: true },
  { id: "k-servis-tezgahi-61", name: "Servis Tezgahi", category: "Mobilya", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 18000, adetPrice: 18000, active: true },
  { id: "k-metal-raf-62", name: "Metal Raf", category: "Mobilya", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 3200, adetPrice: 3200, active: true },
  { id: "k-okey-takimi-63", name: "Okey Takimi", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 650, adetPrice: 650, active: true },
  { id: "k-okey-tasi-yedek-64", name: "Okey Tasi Yedek", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 220, adetPrice: 220, active: true },
  { id: "k-okey-istakasi-65", name: "Okey Istakasi", category: "Oyun", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 320, adetPrice: 80, active: true },
  { id: "k-bicycle-copag-piatnik-iskambil-66", name: "Bicycle / Copag / Piatnik Iskambil", category: "Oyun", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 720, adetPrice: 60, active: true },
  { id: "k-orta-boy-tavla-67", name: "Orta Boy Tavla", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 850, adetPrice: 850, active: true },
  { id: "k-satranc-dama-takimi-68", name: "Satranc Dama Takimi", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 380, adetPrice: 380, active: true },
  { id: "k-paslanmaz-cay-tepsisi-69", name: "Paslanmaz Cay Tepsisi", category: "Servis", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 450, adetPrice: 450, active: true },
  { id: "k-porselen-servis-tabagi-70", name: "Porselen Servis Tabagi", category: "Servis", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 960, adetPrice: 240, active: true },
  { id: "k-cam-sekerdanlik-71", name: "Cam Sekerdanlik", category: "Servis", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 720, adetPrice: 60, active: true },
  { id: "k-metal-pleksi-pecetelik-72", name: "Metal/Pleksi Pecetelik", category: "Servis", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1440, adetPrice: 120, active: true },
  { id: "k-cam-baharatlik-73", name: "Cam Baharatlik", category: "Servis", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 360, adetPrice: 30, active: true },
  { id: "k-masa-ortusu-mandali-74", name: "Masa Ortusu Mandali", category: "Servis", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 1800, adetPrice: 75, active: true },
  { id: "k-bulasik-bardak-sepeti-75", name: "Bulasik Bardak Sepeti", category: "Servis", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 650, adetPrice: 650, active: true },
  { id: "k-penguen-celik-termos-76", name: "Penguen Celik Termos", category: "Servis", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 950, adetPrice: 950, active: true },
  { id: "k-ingenico-profilo-yazar-kasa-pos-77", name: "Ingenico / Profilo Yazar Kasa POS", category: "Kasa", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 18500, adetPrice: 18500, active: true },
  { id: "k-banka-pos-cihazi-78", name: "Banka POS Cihazi", category: "Kasa", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 2500, adetPrice: 2500, active: true },
  { id: "k-metal-para-cekmecesi-79", name: "Metal Para Cekmecesi", category: "Kasa", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1650, adetPrice: 1650, active: true },
  { id: "k-adisyon-fisi-80", name: "Adisyon Fisi", category: "Kirtasiye", unit: 'adet', buyUnit: "koli", packSize: 20, koliPrice: 900, adetPrice: 45, active: true },
  { id: "k-tukenmez-kalem-81", name: "Tukenmez Kalem", category: "Kirtasiye", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 250, adetPrice: 250, active: true },
  { id: "k-cari-hesap-defteri-82", name: "Cari Hesap Defteri", category: "Kirtasiye", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 180, adetPrice: 180, active: true },
  { id: "k-termal-pos-yazar-kasa-rulosu-83", name: "Termal POS/Yazar Kasa Rulosu", category: "Kirtasiye", unit: 'adet', buyUnit: "koli", packSize: 100, koliPrice: 18500, adetPrice: 185, active: true },
  { id: "k-4-kanalli-kamera-seti-84", name: "4 Kanalli Kamera Seti", category: "Guvenlik", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 9500, adetPrice: 9500, active: true },
  { id: "k-kuru-kimyevi-tozlu-yangin-tupu-85", name: "Kuru Kimyevi Tozlu Yangin Tupu", category: "Guvenlik", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 950, adetPrice: 950, active: true },
  { id: "k-ilk-yardim-cantasi-86", name: "Ilk Yardim Cantasi", category: "Guvenlik", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 650, adetPrice: 650, active: true },
  { id: "k-3-lu-uzatma-kablosu-87", name: "3'lu Uzatma Kablosu", category: "Teknik", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 350, adetPrice: 350, active: true },
  { id: "k-akim-korumali-coklu-priz-88", name: "Akım Korumali Coklu Priz", category: "Teknik", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 450, adetPrice: 450, active: true },
  { id: "k-led-ampul-89", name: "LED Ampul", category: "Teknik", unit: 'adet', buyUnit: "koli", packSize: 10, koliPrice: 650, adetPrice: 65, active: true },
  { id: "k-raid-detan-sinek-ilaci-90", name: "Raid / Detan Sinek Ilaci", category: "Teknik", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1020, adetPrice: 85, active: true },
  { id: "k-servis-onlugu-91", name: "Servis Onlugu", category: "Personel sarf", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 250, adetPrice: 250, active: true },
  { id: "k-tek-kullanimlik-bone-92", name: "Tek Kullanimlik Bone", category: "Personel sarf", unit: 'adet', buyUnit: "koli", packSize: 10, koliPrice: 600, adetPrice: 60, active: true },
  { id: "k-cerrahi-maske-93", name: "Cerrahi Maske", category: "Personel sarf", unit: 'adet', buyUnit: "koli", packSize: 40, koliPrice: 1200, adetPrice: 30, active: true },
  { id: "k-nitril-eldiven-94", name: "Nitril Eldiven", category: "Personel sarf", unit: 'adet', buyUnit: "koli", packSize: 10, koliPrice: 2250, adetPrice: 225, active: true },
  { id: "k-metal-kulluk-95", name: "Metal Kulluk", category: "Bahce/on", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 540, adetPrice: 45, active: true },
  { id: "k-bahce-semsiyesi-96", name: "Bahce Semsiyesi", category: "Bahce/on", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 4500, adetPrice: 4500, active: true },
  { id: "k-plastik-metal-bahce-masasi-97", name: "Plastik/metal bahce masasi", category: "Bahce/on", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1800, adetPrice: 1800, active: true },
  { id: "k-plastik-metal-bahce-sandalyesi-98", name: "Plastik/metal bahce sandalyesi", category: "Bahce/on", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 650, adetPrice: 650, active: true },
  { id: "k-kapi-onu-paspasi-99", name: "Kapi Onu Paspasi", category: "Bahce/on", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 350, adetPrice: 350, active: true },
  { id: "k-ni-ldem-fi-li-z-cay-5kg-100", name: "NİLDEM FİLİZ ÇAY 5KG", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1250, adetPrice: 1250, cost: 975, barcode: "00001157273", active: true },
  { id: "k-aroma-seftali-meyve-suyu-101", name: "AROMA ŞEFTALİ MEYVE SUYU", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 555, adetPrice: 23.13, cost: 460, barcode: "00001171433", active: true },
  { id: "k-sariyer-kola-102", name: "SARIYER KOLA", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 590, adetPrice: 24.58, cost: 450, barcode: "00001175540", active: true },
  { id: "k-elma-toz-i-cecek-103", name: "ELMA TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 40, adetPrice: 40, cost: 25, barcode: "00001227751", active: true },
  { id: "k-kokel-granul-kahve-200-gr-104", name: "KÖKEL GRANÜL KAHVE 200 GR", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 190, adetPrice: 190, cost: 115, barcode: "00001294420", active: true },
  { id: "k-bi-c-tukenmez-kalem-105", name: "BİC TÜKENMEZ KALEM", category: "Kirtasiye", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 371.25, adetPrice: 371.25, cost: 135, barcode: "00001328540", active: true },
  { id: "k-sirma-elmali-soda-106", name: "Sirma Elmali Soda", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 230, adetPrice: 9.58, cost: 175, barcode: "00001408802", active: true },
  { id: "k-sirma-karadut-soda-107", name: "Sirma Karadut Soda", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 220, adetPrice: 9.17, cost: 175, barcode: "00001465610", active: true },
  { id: "k-okey-istaka-108", name: "OKEY ISTAKA", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 500, adetPrice: 500, cost: 250, barcode: "00001731980", active: true },
  { id: "k-karacalar-fi-li-z-cay-5kg-109", name: "KARACALAR FİLİZ ÇAY 5KG", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1200, adetPrice: 1200, cost: 875, barcode: "00001879973", active: true },
  { id: "k-i-ce-tea-di-di-110", name: "İCE TEA DİDİ", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 475, adetPrice: 19.79, cost: 370, barcode: "00002014570", active: true },
  { id: "k-mi-ston-gold-cay-5kg-111", name: "MİSTON GOLD ÇAY 5KG", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1550, adetPrice: 1550, cost: 1350, barcode: "00002041427", active: true },
  { id: "k-sahlep-toz-i-cecek-112", name: "SAHLEP TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 40, adetPrice: 40, cost: 25, barcode: "00002169066", active: true },
  { id: "k-nurcay-fi-li-z-cay-5-kg-113", name: "NURÇAY FİLİZ ÇAY 5 KG", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1500, adetPrice: 1500, cost: 1220, barcode: "00002264338", active: true },
  { id: "k-mi-ston-ozel-harman-5-kg-cay-114", name: "MİSTON ÖZEL HARMAN 5 KG ÇAY", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1800, adetPrice: 1800, cost: 1550, barcode: "00002396336", active: true },
  { id: "k-mi-ston-fi-li-z-cay-5-kg-115", name: "MİSTON FİLİZ ÇAY 5 KG", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1500, adetPrice: 1500, cost: 1355, barcode: "00002401824", active: true },
  { id: "k-okey-tasi-116", name: "OKEY TAŞI", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 525, adetPrice: 525, cost: 350, barcode: "00002425930", active: true },
  { id: "k-kokteyl-toz-i-cecek-117", name: "KOKTEYL TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 40, adetPrice: 40, cost: 25, barcode: "00002455439", active: true },
  { id: "k-doganay-salgam-118", name: "DOĞANAY ŞALGAM", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 300, adetPrice: 12.5, cost: 280, barcode: "00002531130", active: true },
  { id: "k-mrlami-n-cay-tabagi-l-119", name: "MRLAMİN ÇAY TABAĞI L", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 30, adetPrice: 30, cost: 22.5, barcode: "00002751240", active: true },
  { id: "k-1-80-cuha-120", name: "1.80 ÇUHA", category: "Mobilya", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 700, adetPrice: 700, cost: 450, barcode: "00002832030", active: true },
  { id: "k-kizilay-limonlu-soda-121", name: "Kizilay Limonlu Soda", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 265, adetPrice: 11.04, cost: 220, barcode: "00002866933", active: true },
  { id: "k-sariyer-fanta-122", name: "SARIYER FANTA", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 590, adetPrice: 24.58, cost: 385, barcode: "00003207170", active: true },
  { id: "k-kakao-toz-i-cecek-123", name: "KAKAO TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 40, adetPrice: 40, cost: 30, barcode: "00003443011", active: true },
  { id: "k-muz-toz-i-cecek-124", name: "MUZ TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 50, adetPrice: 50, cost: 26, barcode: "00003504950", active: true },
  { id: "k-numarali-yazboz-125", name: "NUMARALI YAZBOZ", category: "Kirtasiye", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 20, adetPrice: 20, cost: 10, barcode: "00003561550", active: true },
  { id: "k-yazboz-126", name: "YAZBOZ", category: "Kirtasiye", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 250, adetPrice: 250, cost: 125, barcode: "00003684320", active: true },
  { id: "k-cuha-127", name: "ÇUHA", category: "Mobilya", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 900, adetPrice: 900, cost: 425, barcode: "00003716232", active: true },
  { id: "k-hosgun-oyun-kagidi-128", name: "HOŞGÜN OYUN KAĞIDI", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 95, adetPrice: 95, cost: 45, barcode: "00003752390", active: true },
  { id: "k-limonlu-soda-129", name: "Limonlu Soda", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 190, adetPrice: 7.92, cost: 165, barcode: "00003791470", active: true },
  { id: "k-bardak-li-monata-130", name: "BARDAK LİMONATA", category: "Servis", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 250, adetPrice: 250, cost: 135, barcode: "00003849120", active: true },
  { id: "k-karadut-toz-i-cecek-131", name: "KARADUT TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 40, adetPrice: 40, cost: 25, barcode: "00003900524", active: true },
  { id: "k-kizilay-a30-extra-oyun-kagidi-132", name: "KIZILAY A30 EXTRA OYUN KAĞIDI", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 380, adetPrice: 380, cost: 335, barcode: "0000396490", active: true },
  { id: "k-kardem-sargili-seker-5-kg-133", name: "KARDEM SARGILI ŞEKER 5 KG", category: "Tatlandirici", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 350, adetPrice: 350, cost: 280, barcode: "00003987630", active: true },
  { id: "k-fanta-200ml-cam-si-se-dep-134", name: "FANTA 200ML CAM ŞİŞE DEP.", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 500, adetPrice: 20.83, cost: 384.03, barcode: "00003998021", active: true },
  { id: "k-ihlamur-toz-i-cecek-135", name: "IHLAMUR TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 40, adetPrice: 40, cost: 25, barcode: "00004088857", active: true },
  { id: "k-kokel-3-u-1-arada-500gr-136", name: "KÖKEL 3 Ü 1 ARADA 500GR", category: "Kontrol Edilecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 130, adetPrice: 130, cost: 75, barcode: "00004259230", active: true },
  { id: "k-nane-li-mon-toz-i-cecek-137", name: "NANE LİMON TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 40, adetPrice: 40, cost: 25, barcode: "00004472654", active: true },
  { id: "k-kardem-kup-seker-1-kg-138", name: "KARDEM KÜP ŞEKER 1 KG", category: "Tatlandirici", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 60, adetPrice: 60, cost: 49, barcode: "00004497900", active: true },
  { id: "k-demli-k-cay-139", name: "DEMLİK ÇAY", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1550, adetPrice: 1550, cost: 1300, barcode: "00005025850", active: true },
  { id: "k-kusburnu-toz-i-cecek-140", name: "KUŞBURNU TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 40, adetPrice: 40, cost: 25, barcode: "00005272538", active: true },
  { id: "k-sirma-limonlu-soda-141", name: "Sirma Limonlu Soda", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 265, adetPrice: 11.04, cost: 215, barcode: "00005334049", active: true },
  { id: "k-yazboz-kiskaci-142", name: "YAZBOZ KISKACI", category: "Mobilya", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 10, adetPrice: 10, cost: 5, barcode: "00005453321", active: true },
  { id: "k-hungary-a30-oyun-kagidi-143", name: "HUNGARY A30 OYUN KAĞIDI", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 405, adetPrice: 405, cost: 335, barcode: "00005676806", active: true },
  { id: "k-gunes-melami-n-cay-tabagi-144", name: "GÜNEŞ MELAMİN ÇAY TABAĞI", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 25, adetPrice: 25, cost: 20, barcode: "00005698720", active: true },
  { id: "k-nescafe-tekli-paket-145", name: "NESCAFE TEKLİ PAKET", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 9.5, adetPrice: 9.5, cost: 7, barcode: "00005758860", active: true },
  { id: "k-cay-ekonomi-k-146", name: "ÇAY EKONOMİK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1100, adetPrice: 1100, cost: 875, barcode: "00005805440", active: true },
  { id: "k-star-okey-takimi-147", name: "STAR OKEY TAKIMI", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1200, adetPrice: 1200, cost: 725, barcode: "00005849370", active: true },
  { id: "k-meyveli-soda-148", name: "Meyveli Soda", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 170, adetPrice: 7.08, cost: 135, barcode: "00006313830", active: true },
  { id: "k-tarcin-toz-i-cecek-149", name: "TARÇIN TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 40, adetPrice: 40, cost: 25, barcode: "00006353651", active: true },
  { id: "k-camlica-portakalli-gazoz-150", name: "ÇAMLICA PORTAKALLI GAZOZ", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 390, adetPrice: 16.25, cost: 300, barcode: "00006486280", active: true },
  { id: "k-hedef-okey-takimi-151", name: "HEDEF OKEY TAKIMI", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1200, adetPrice: 1200, cost: 725, barcode: "00006494490", active: true },
  { id: "k-mavi-zade-200-ml-bardak-su-152", name: "MAVİZADE 200 ML BARDAK SU", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 60, koliPrice: 115, adetPrice: 1.92, cost: 85, barcode: "00006687490", active: true },
  { id: "k-sutas-kalar-153", name: "SÜTAŞ KALAR", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 20, koliPrice: 400, adetPrice: 20, cost: 350, barcode: "00006772510", active: true },
  { id: "k-porselen-cay-tabagi-154", name: "PORSELEN ÇAY TABAĞI", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 55, adetPrice: 55, cost: 35, barcode: "00006824760", active: true },
  { id: "k-angora-a30-oyun-kagidi-155", name: "ANGORA A30 OYUN KAĞIDI", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 405, adetPrice: 405, cost: 335, barcode: "00006854362", active: true },
  { id: "k-aroma-vi-sne-meyve-suyu-156", name: "AROMA VİŞNE MEYVE SUYU", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 555, adetPrice: 23.13, cost: 460, barcode: "00006859560", active: true },
  { id: "k-sirma-sade-soda-157", name: "Sirma Sade Soda", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 200, adetPrice: 8.33, cost: 150, barcode: "00006972777", active: true },
  { id: "k-masa-ortusu-2-158", name: "MASA ÖRTÜSÜ 2", category: "Mobilya", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 170, adetPrice: 170, cost: 125, barcode: "00007040260", active: true },
  { id: "k-nescafe-3-u1-arada-tek-kul-159", name: "NESCAFE 3 Ü1 ARADA TEK KUL.", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 6.5, adetPrice: 6.5, cost: 6.25, barcode: "00007125910", active: true },
  { id: "k-turk-kahvesi-160", name: "TÜRK KAHVESİ", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 75, adetPrice: 75, cost: 55, barcode: "00007305820", active: true },
  { id: "k-pasabahce-cay-bardagi-90ml-161", name: "PAŞABAHÇE ÇAY BARDAĞI 90ML", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 130, adetPrice: 130, cost: 100, barcode: "00007336020", active: true },
  { id: "k-kokel-sut-tozu-300-gr-162", name: "KÖKEL SÜT TOZU 300 GR", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 130, adetPrice: 130, cost: 75, barcode: "00007500770", active: true },
  { id: "k-kalem-ekonomi-k-163", name: "KALEM EKONOMİK", category: "Kirtasiye", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 200, adetPrice: 200, cost: 125, barcode: "00007544900", active: true },
  { id: "k-kardelen-cay-164", name: "KARDELEN ÇAY", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1650, adetPrice: 1650, cost: 1220, barcode: "00007624730", active: true },
  { id: "k-zar-165", name: "ZAR", category: "Oyun", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 15, adetPrice: 15, cost: 7.5, barcode: "00007661360", active: true },
  { id: "k-cay-luks-166", name: "ÇAY LÜKS", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1300, adetPrice: 1300, cost: 990, barcode: "00007748140", active: true },
  { id: "k-di-di-i-ce-tea-seftali-167", name: "DİDİ İCE TEA ŞEFTALİ", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 420, adetPrice: 17.5, cost: 300, barcode: "00007864460", active: true },
  { id: "k-ki-vi-toz-i-cecek-168", name: "KİVİ TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 40, adetPrice: 40, cost: 25, barcode: "00007873253", active: true },
  { id: "k-coca-cola-200-ml-cam-si-se-dep-169", name: "COCA COLA 200 ML CAM ŞİŞE DEP", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 625, adetPrice: 26.04, cost: 485, barcode: "00007922650", active: true },
  { id: "k-sutas-si-se-ayran-200ml-dep-170", name: "SÜTAŞ ŞİŞE AYRAN 200ML DEP.", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 20, koliPrice: 360, adetPrice: 18, cost: 210, barcode: "00008133520", active: true },
  { id: "k-masa-ortusu-171", name: "MASA ÖRTÜSÜ", category: "Mobilya", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 200, adetPrice: 200, cost: 120, barcode: "00008137022", active: true },
  { id: "k-capri-sun-172", name: "CAPRİSUN", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 350, adetPrice: 14.58, cost: 200, barcode: "00008489530", active: true },
  { id: "k-portakal-toz-i-cecek-173", name: "PORTAKAL TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 40, adetPrice: 40, cost: 25, barcode: "00008519509", active: true },
  { id: "k-mavi-zade-300-ml-bardak-su-174", name: "MAVİZADE 300 ML BARDAK SU", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 60, koliPrice: 115, adetPrice: 1.92, cost: 75, barcode: "00008552310", active: true },
  { id: "k-pensan-tukenmez-kalem-175", name: "PENSAN TÜKENMEZ KALEM", category: "Kirtasiye", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 450, adetPrice: 450, cost: 225, barcode: "00008568944", active: true },
  { id: "k-cikma-kagit-176", name: "ÇIKMA KAĞIT", category: "Kirtasiye", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 25, adetPrice: 25, cost: 17.5, barcode: "00008762890", active: true },
  { id: "k-sutas-pet-si-se-ayran-175ml-177", name: "SÜTAŞ PET ŞİŞE AYRAN 175ML", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 20, koliPrice: 200, adetPrice: 10, cost: 128, barcode: "00009180730", active: true },
  { id: "k-cay-kasigi-178", name: "ÇAY KAŞIĞI", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 250, adetPrice: 250, cost: 125, barcode: "00009195820", active: true },
  { id: "k-melami-n-cay-tabagi-179", name: "MELAMİN ÇAY TABAĞI", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 25, adetPrice: 25, cost: 17.5, barcode: "00009197636", active: true },
  { id: "k-si-ri-n-fi-li-z-cay-5-kg-180", name: "ŞİRİN FİLİZ ÇAY 5 KG", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 1300, adetPrice: 1300, cost: 975, barcode: "00009378675", active: true },
  { id: "k-cobanpinar-200-181", name: "ÇOBANPINAR 200", category: "Kontrol Edilecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 60, adetPrice: 60, cost: 55, barcode: "00009453990", active: true },
  { id: "k-masa-ortusu-kiskaci-182", name: "MASA ÖRTÜSÜ KISKACI", category: "Mobilya", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 15, adetPrice: 15, cost: 5, barcode: "00009555395", active: true },
  { id: "k-camlica-gazoz-183", name: "ÇAMLICA GAZOZ", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 355, adetPrice: 14.79, cost: 285, barcode: "00009639010", active: true },
  { id: "k-mavi-zade-500ml-pet-si-se-su-184", name: "MAVİZADE 500ML PET ŞİŞE SU", category: "Mesrubat", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 115, adetPrice: 4.79, cost: 85, barcode: "00009893720", active: true },
  { id: "k-li-mon-toz-i-cecek-185", name: "LİMON TOZ İÇECEK", category: "Cay ve sicak icecek", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 40, adetPrice: 40, cost: 25, barcode: "00009948202", active: true },
  { id: "k-dag-esintisi-camasir-suyu-186", name: "Dag Esintisi Camasir Suyu", category: "Genel temizlik", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 900, adetPrice: 75, active: true },
  { id: "k-yogun-kivamli-camasir-suyu-187", name: "Yogun Kivamli Camasir Suyu", category: "Genel temizlik", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 960, adetPrice: 240, active: true },
  { id: "k-camasir-suyu-klasik-188", name: "Camasir Suyu Klasik", category: "Genel temizlik", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 760, adetPrice: 190, active: true },
  { id: "k-yuzey-temizleyici-189", name: "Yuzey Temizleyici", category: "Genel temizlik", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 1040, adetPrice: 260, active: true },
  { id: "k-yuzey-temizleyici-lavanta-190", name: "Yuzey Temizleyici Lavanta", category: "Genel temizlik", unit: 'adet', buyUnit: "koli", packSize: 6, koliPrice: 990, adetPrice: 165, active: true },
  { id: "k-krem-temizleyici-limon-191", name: "Krem Temizleyici Limon", category: "Genel temizlik", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 720, adetPrice: 60, active: true },
  { id: "k-yag-cozucu-192", name: "Yag Cozucu", category: "Genel temizlik", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1320, adetPrice: 110, active: true },
  { id: "k-yag-cozucu-sprey-193", name: "Yag Cozucu Sprey", category: "Genel temizlik", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1020, adetPrice: 85, active: true },
  { id: "k-kirec-cozucu-194", name: "Kirec Cozucu", category: "Genel temizlik", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1140, adetPrice: 95, active: true },
  { id: "k-kirec-ve-pas-cozucu-195", name: "Kirec ve Pas Cozucu", category: "Genel temizlik", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1260, adetPrice: 105, active: true },
  { id: "k-elde-bulasik-deterjani-limon-196", name: "Elde Bulasik Deterjani Limon", category: "Bulasik", unit: 'adet', buyUnit: "koli", packSize: 9, koliPrice: 1260, adetPrice: 140, active: true },
  { id: "k-bulasik-makinesi-tableti-197", name: "Bulasik Makinesi Tableti", category: "Bulasik", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 2800, adetPrice: 700, active: true },
  { id: "k-bulasik-makinesi-parlatici-198", name: "Bulasik Makinesi Parlatici", category: "Bulasik", unit: 'adet', buyUnit: "koli", packSize: 6, koliPrice: 900, adetPrice: 150, active: true },
  { id: "k-bulasik-makinesi-tuzu-199", name: "Bulasik Makinesi Tuzu", category: "Bulasik", unit: 'adet', buyUnit: "koli", packSize: 8, koliPrice: 720, adetPrice: 90, active: true },
  { id: "k-limon-kolonyasi-200", name: "Limon Kolonyasi", category: "Dezenfektan", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1800, adetPrice: 150, active: true },
  { id: "k-el-dezenfektani-201", name: "El Dezenfektani", category: "Dezenfektan", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 2200, adetPrice: 550, active: true },
  { id: "k-tuvalet-kagidi-202", name: "Tuvalet Kagidi", category: "Tuvalet", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 1960, adetPrice: 490, active: true },
  { id: "k-tuvalet-kagidi-mini-jumbo-203", name: "Tuvalet Kagidi Mini Jumbo", category: "Tuvalet", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 850, adetPrice: 850, active: true },
  { id: "k-z-katlama-kagit-havlu-204", name: "Z Katlama Kagit Havlu", category: "Tuvalet", unit: 'adet', buyUnit: "adet", packSize: 1, koliPrice: 920, adetPrice: 920, active: true },
  { id: "k-kagit-havlu-205", name: "Kagit Havlu", category: "Tuvalet", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 1680, adetPrice: 420, active: true },
  { id: "k-sivi-sabun-206", name: "Sivi Sabun", category: "Tuvalet", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 880, adetPrice: 220, active: true },
  { id: "k-antibakteriyel-sivi-sabun-207", name: "Antibakteriyel Sivi Sabun", category: "Tuvalet", unit: 'adet', buyUnit: "koli", packSize: 6, koliPrice: 1260, adetPrice: 210, active: true },
  { id: "k-oda-kokusu-sprey-208", name: "Oda Kokusu Sprey", category: "Tuvalet", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1440, adetPrice: 120, active: true },
  { id: "k-cop-poseti-buyuk-boy-209", name: "Cop Poseti Buyuk Boy", category: "Ekipman", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 1440, adetPrice: 60, active: true },
  { id: "k-cop-poseti-jumbo-boy-210", name: "Cop Poseti Jumbo Boy", category: "Ekipman", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 2040, adetPrice: 85, active: true },
  { id: "k-temizlik-bezi-211", name: "Temizlik Bezi", category: "Ekipman", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 960, adetPrice: 80, active: true },
  { id: "k-oluklu-bulasik-sungeri-212", name: "Oluklu Bulasik Sungeri", category: "Ekipman", unit: 'adet', buyUnit: "koli", packSize: 24, koliPrice: 840, adetPrice: 35, active: true },
  { id: "k-mop-yedek-213", name: "Mop Yedek", category: "Ekipman", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1440, adetPrice: 120, active: true },
  { id: "k-paspas-seti-214", name: "Paspas Seti", category: "Ekipman", unit: 'adet', buyUnit: "koli", packSize: 4, koliPrice: 1800, adetPrice: 450, active: true },
  { id: "k-lateks-temizlik-eldiveni-215", name: "Lateks Temizlik Eldiveni", category: "Ekipman", unit: 'adet', buyUnit: "koli", packSize: 12, koliPrice: 1320, adetPrice: 110, active: true },
]

/**
 * ÇEŞİTLER. Sadece "detaylı satış" modunda sorulur, hızlı satışta karşına çıkmaz.
 *
 * factor: tarif miktarını çarpar (duble 2 kat çay çeker, açık az çeker)
 * skip:   o kalem tarifden düşmez (şekersiz çayda şeker eksilmez)
 * priceDelta: satış fiyatına eklenir
 */
export const CAY_CESITLERI: Variant[] = [
  { id: 'normal', name: 'Normal' },
  { id: 'acik', name: 'Açık', factor: 0.6 },
  { id: 'koyu', name: 'Koyu', factor: 1.4 },
  { id: 'duble', name: 'Duble', factor: 2, priceDelta: 15 },
  { id: 'sekersiz', name: 'Şekersiz', skip: ['seker'] },
  { id: 'limonlu', name: 'Limonlu' },
]

export const ORALET_CESITLERI: Variant[] = [
  'Oralet',
  'Kuşburnu',
  'Elma',
  'Kivi',
  'Karadut',
  'Limon',
  'Nane-Limon',
  'Kakao',
  'Sahlep',
  'Muz',
  'Tarçın',
  'Kokteyl',
].map((n) => ({ id: n.toLowerCase().replace(/[^a-z]/g, ''), name: n }))

export const MEYVE_SUYU_CESITLERI: Variant[] = [
  'Şeftali',
  'Vişne',
  'Portakal',
  'Kayısı',
  'Karışık',
  'Nar',
].map((n) => ({ id: n.toLowerCase().replace(/[^a-z]/g, ''), name: n }))

export const SODA_CESITLERI: Variant[] = ['Elma', 'Limon', 'Karışık meyveli', 'Şeftali'].map((n) => ({
  id: n.toLowerCase().replace(/[^a-z]/g, ''),
  name: n,
}))

// Türk kahvesi: şeker miktarı çeşide göre. Sade = şeker düşmez.
export const KAHVE_CESITLERI: Variant[] = [
  { id: 'kahve-sade', name: 'Sade', skip: ['seker'] },
  { id: 'kahve-orta', name: 'Orta' },
  { id: 'kahve-sekerli', name: 'Şekerli' },
]

export const TOST_CESITLERI: Variant[] = [
  { id: 'tost-sade', name: 'Sade' },
  { id: 'tost-karisik', name: 'Karışık' },
  { id: 'tost-kavurmali', name: 'Kavurmalı' },
]

/**
 * HAZIR KATALOG — gerçek bir kıraathanenin sattığı kalemler ve tarifleri.
 *
 * Tarifler ve fiyatlar sahadan alındı. Kurulumda "önerilen ayarlar" seçilirse
 * bunlar olduğu gibi kurulur; kullanıcı sonradan hepsini değiştirebilir.
 *
 * Maliyet daima SON ALIŞ fiyatından hesaplanır — ortalama alınmaz.
 * Tüp gaz bilerek dışarıda: kullanıcı istemedi.
 */

export interface HamTanim {
  id: string
  name: string
  icon: string
  unit: Unit
  buyUnit: string
  /** Alış birimi adet değilse: içinde kaç adet var. 1 kg şeker = 405 küp. */
  packSize?: number
  buyQty: number
  buyTotal: number
}

export const HAMMADDELER: HamTanim[] = [
  { id: 'cay', name: 'Çay (dökme)', icon: '🌿', unit: 'g', buyUnit: 'kg', buyQty: 5, buyTotal: 1500 },
  {
    id: 'seker',
    name: 'Küp şeker',
    icon: '🍬',
    unit: 'adet',
    buyUnit: 'kg',
    packSize: 405, // 1 kg = 405 küp
    buyQty: 1,
    buyTotal: 60,
  },
  { id: 'kahve-toz', name: 'Türk kahvesi (toz)', icon: '🫘', unit: 'g', buyUnit: 'kg', buyQty: 1, buyTotal: 320 },
  { id: 'nescafe-toz', name: 'Nescafe (toz)', icon: '🥄', unit: 'g', buyUnit: 'g', buyQty: 200, buyTotal: 180 },
  { id: 'sut-tozu', name: 'Süt tozu / krema', icon: '🥛', unit: 'g', buyUnit: 'g', buyQty: 500, buyTotal: 150 },
  { id: 'oralet-toz', name: 'Oralet (toz)', icon: '🍋', unit: 'g', buyUnit: 'kg', buyQty: 1, buyTotal: 250 },
  {
    id: 'uclubir-poset',
    name: "3'ü 1 arada poşeti",
    icon: '📦',
    unit: 'adet',
    buyUnit: 'paket',
    packSize: 48,
    buyQty: 1,
    buyTotal: 240,
  },
  { id: 'ekmek', name: 'Ekmek', icon: '🍞', unit: 'adet', buyUnit: 'adet', buyQty: 20, buyTotal: 100 },
  { id: 'kasar', name: 'Kaşar peyniri', icon: '🧀', unit: 'g', buyUnit: 'kg', buyQty: 2, buyTotal: 500 },
]

export interface UrunTanim {
  id: string
  name: string
  icon: string
  category: string
  price: number
  /** Tarifli ürün. Miktarlar BİR PARTİ içindir, temel birimde. */
  recipe?: { yield: number; lines: { itemId: string; qty: number }[] }
  /** Al-sat ürün: aldığın gibi satarsın. */
  alsat?: { buyUnit: string; packSize?: number; buyQty: number; buyTotal: number }
  /** Bu ürün seçilirse gereken kalemler — hammadde veya başka ürün olabilir. */
  needs?: string[]
  variants?: Variant[]
}

export const URUNLER: UrunTanim[] = [
  // ---------- SICAK (tarifli) ----------
  {
    id: 'cay-bardak',
    name: 'Çay',
    icon: '🍵',
    category: 'Sıcak',
    price: 20,
    // Demlik: 125 g çay -> 25 bardak. Bardak başı 2 küp şeker (25 x 2 = 50).
    recipe: {
      yield: 25,
      lines: [
        { itemId: 'cay', qty: 125 },
        { itemId: 'seker', qty: 50 },
      ],
    },
    needs: ['cay', 'seker'],
    variants: CAY_CESITLERI,
  },
  {
    id: 'turk-kahvesi',
    name: 'Türk Kahvesi',
    icon: '☕',
    category: 'Sıcak',
    price: 60,
    // Yanında verilen bardak su, sattığımız ürünün kendisi — tarifin içinde ürün var.
    recipe: {
      yield: 1,
      lines: [
        { itemId: 'kahve-toz', qty: 7 },
        { itemId: 'seker', qty: 1 },
        { itemId: 'bardak-su', qty: 1 },
      ],
    },
    needs: ['kahve-toz', 'seker', 'bardak-su'],
    variants: KAHVE_CESITLERI,
  },
  {
    id: 'nescafe',
    name: 'Nescafe',
    icon: '🍶',
    category: 'Sıcak',
    price: 60,
    recipe: {
      yield: 1,
      lines: [
        { itemId: 'nescafe-toz', qty: 2 },
        { itemId: 'sut-tozu', qty: 8 },
      ],
    },
    needs: ['nescafe-toz', 'sut-tozu'],
  },
  {
    id: 'uclubir',
    name: "3'ü 1 Arada",
    icon: '🥤',
    category: 'Sıcak',
    price: 20,
    recipe: { yield: 1, lines: [{ itemId: 'uclubir-poset', qty: 1 }] },
    needs: ['uclubir-poset'],
  },
  {
    id: 'oralet',
    name: 'Oralet',
    icon: '🍋',
    category: 'Sıcak',
    price: 20,
    recipe: { yield: 1, lines: [{ itemId: 'oralet-toz', qty: 15 }] },
    needs: ['oralet-toz'],
    variants: ORALET_CESITLERI,
  },

  // ---------- YİYECEK (tarifli) ----------
  {
    id: 'tost',
    name: 'Kaşarlı Tost',
    icon: '🥪',
    category: 'Yiyecek',
    price: 100,
    // 1 tost = yarım ekmek + 60 g kaşar
    recipe: {
      yield: 1,
      lines: [
        { itemId: 'ekmek', qty: 0.5 },
        { itemId: 'kasar', qty: 60 },
      ],
    },
    needs: ['ekmek', 'kasar'],
    variants: TOST_CESITLERI,
  },

  // ---------- SOĞUK (al-sat) ----------
  {
    id: 'bardak-su',
    name: 'Bardak Su',
    icon: '🥛',
    category: 'Soğuk',
    price: 20,
    alsat: { buyUnit: 'koli', packSize: 40, buyQty: 1, buyTotal: 120 },
  },
  {
    id: 'pet-su',
    name: 'Pet Su',
    icon: '💧',
    category: 'Soğuk',
    price: 20,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 140 },
  },
  {
    id: 'sade-soda',
    name: 'Sade Soda',
    icon: '🫧',
    category: 'Soğuk',
    price: 20,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 260 },
  },
  {
    id: 'meyveli-soda',
    name: 'Meyveli Soda',
    icon: '🍊',
    category: 'Soğuk',
    price: 40,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 320 },
    variants: SODA_CESITLERI,
  },
  {
    id: 'gazoz',
    name: 'Gazoz',
    icon: '🍾',
    category: 'Soğuk',
    price: 60,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 375 },
  },
  {
    id: 'kola',
    name: 'Kola',
    icon: '🥤',
    category: 'Soğuk',
    price: 60,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 625 },
  },
  {
    id: 'fanta',
    name: 'Fanta',
    icon: '🍹',
    category: 'Soğuk',
    price: 60,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 625 },
  },
  {
    id: 'ayran',
    name: 'Ayran',
    icon: '🥛',
    category: 'Soğuk',
    price: 40,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 380 },
  },
  {
    id: 'meyve-suyu',
    name: 'Meyve Suyu',
    icon: '🧃',
    category: 'Soğuk',
    price: 60,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 600 },
    variants: MEYVE_SUYU_CESITLERI,
  },
  {
    id: 'enerji',
    name: 'Enerji İçeceği',
    icon: '⚡',
    category: 'Soğuk',
    price: 100,
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 900 },
  },
  {
    id: 'bardak-limonata',
    name: 'Bardak Limonata',
    icon: '🍋',
    category: 'Soğuk',
    price: 20,
    alsat: { buyUnit: 'koli', packSize: 40, buyQty: 1, buyTotal: 280 },
  },

  // ---------- ATIŞTIRMALIK (al-sat) ----------
  // Satış fiyatları adet maliyetine %40 kâr eklenip yuvarlandı.
  {
    id: 'gofret',
    name: 'Çikolatalı Gofret',
    icon: '🍫',
    category: 'Atıştırmalık',
    price: 15, // 10,83 x 1,40 = 15,17 -> 15
    alsat: { buyUnit: 'koli', packSize: 36, buyQty: 1, buyTotal: 390 },
  },
  {
    id: 'kraker',
    name: 'Susamlı Kraker',
    icon: '🥨',
    category: 'Atıştırmalık',
    price: 20, // 13,76 x 1,40 = 19,27 -> 20
    alsat: { buyUnit: 'koli', packSize: 17, buyQty: 1, buyTotal: 234 },
  },
  {
    id: 'ikram-cikolata',
    name: 'İkram Çikolatalı',
    icon: '🍪',
    category: 'Atıştırmalık',
    price: 30, // 20,83 x 1,40 = 29,17 -> 30
    alsat: { buyUnit: 'koli', packSize: 24, buyQty: 1, buyTotal: 500 },
  },
]

/** Kurulumda varsayılan seçili gelenler: hepsi. Liste zaten dar. */
export const VARSAYILAN_SECILI = URUNLER.map((u) => u.id)

// Sadece işletmenin temel hizmet giderleri (aylık bazda). Sarf malzemeleri
// (peçete, deterjan, çöp poşeti vb.) ürün olarak girilir — miktar/maliyet takibi için.
export const VARSAYILAN_AYLIK_GIDER = [
  { name: 'Kira', amount: 15000 },
  { name: 'Elektrik', amount: 3000 },
  { name: 'Su', amount: 600 },
  { name: 'Doğalgaz', amount: 1500 },
  { name: 'İnternet', amount: 500 },
  { name: 'Vergi / muhasebe', amount: 2000 },
]

export const VARSAYILAN_GUNLUK_GIDER = [{ name: 'Eleman yevmiyesi', amount: 1000 }]

/**
 * Seçilen ürün id'lerinden Item listesi kurar.
 * Tarifin gerektirdiği hammaddeyi de, başka ürünü de (kahvenin yanındaki su gibi)
 * kendiliğinden ekler — eksik hammaddeyle ürün kurulamaz.
 */
export function urunleriKur(
  secili: string[],
  hamAlis: Record<string, { qty: number; total: number; packSize?: number }> = {},
  urunFiyat: Record<string, number> = {},
  alsatAlis: Record<string, { qty: number; total: number; packSize?: number }> = {},
): Item[] {
  // Tarifi olan ürün başka bir ürünü gerektiriyorsa (kahve -> bardak su) onu da seçime kat.
  const tamSecim = new Set(secili)
  for (const id of secili) {
    const u = URUNLER.find((x) => x.id === id)
    for (const n of u?.needs ?? []) {
      if (URUNLER.some((x) => x.id === n)) tamSecim.add(n)
    }
  }

  const gerekenHam = new Set<string>()
  for (const id of tamSecim) {
    const u = URUNLER.find((x) => x.id === id)
    for (const n of u?.needs ?? []) {
      if (HAMMADDELER.some((h) => h.id === n)) gerekenHam.add(n)
    }
  }

  const items: Item[] = []

  for (const hamId of gerekenHam) {
    const h = HAMMADDELER.find((x) => x.id === hamId)!
    const alis = hamAlis[hamId] ?? { qty: h.buyQty, total: h.buyTotal, packSize: h.packSize }
    const packSize = alis.packSize ?? h.packSize
    const base = alisToBase(alis.qty, h.unit, h.buyUnit, packSize)
    items.push({
      id: h.id,
      name: h.name,
      unit: h.unit,
      buyUnit: h.buyUnit,
      packSize,
      category: 'Hammadde',
      icon: h.icon,
      sellable: false,
      stock: base,
      minStock: Math.round(base * 0.2),
      lastCost: { total: alis.total, qty: base },
    })
  }

  for (const id of tamSecim) {
    const u = URUNLER.find((x) => x.id === id)
    if (!u) continue

    if (u.alsat) {
      const alis = alsatAlis[id] ?? {
        qty: u.alsat.buyQty,
        total: u.alsat.buyTotal,
        packSize: u.alsat.packSize,
      }
      const packSize = alis.packSize ?? u.alsat.packSize
      const base = alisToBase(alis.qty, 'adet', u.alsat.buyUnit, packSize)
      items.push({
        id: u.id,
        name: u.name,
        unit: 'adet',
        buyUnit: u.alsat.buyUnit,
        packSize,
        category: u.category,
        icon: u.icon,
        sellable: true,
        price: urunFiyat[id] ?? u.price,
        variants: u.variants,
        stock: base,
        minStock: Math.max(1, Math.round(base * 0.25)),
        lastCost: { total: alis.total, qty: base },
      })
      continue
    }

    items.push({
      id: u.id,
      name: u.name,
      unit: 'adet',
      buyUnit: 'adet',
      category: u.category,
      icon: u.icon,
      sellable: true,
      price: urunFiyat[id] ?? u.price,
      variants: u.variants,
      stock: 0,
      recipe: u.recipe ? { yield: u.recipe.yield, lines: u.recipe.lines.map((l) => ({ ...l })) } : undefined,
    })
  }

  return items
}

export function varsayilanGiderler() {
  return [
    ...VARSAYILAN_AYLIK_GIDER.map((g) => ({
      id: uid(),
      date: '',
      name: g.name,
      amount: g.amount,
      kind: 'aylik' as const,
      paidCash: false,
    })),
    ...VARSAYILAN_GUNLUK_GIDER.map((g) => ({
      id: uid(),
      date: '',
      name: g.name,
      amount: g.amount,
      kind: 'gunluk-sabit' as const,
      paidCash: true,
    })),
  ]
}
