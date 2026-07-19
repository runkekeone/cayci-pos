/**
 * Basit yerel kullanıcı katmanı.
 *
 * DİKKAT: Sunucu yok. Kullanıcılar ve parolalar bu cihazın localStorage'ında
 * düz metin durur. Bu gerçek bir güvenlik katmanı DEĞİL — sadece "hangi
 * işletmenin verisi gösterilecek" ayrımıdır. Gerçek üyelik gerektiğinde
 * (mobil sürüm) bu dosya bir API çağrısıyla değiştirilecek; uygulamanın geri
 * kalanı sadece login/logout/currentUser arayüzünü kullandığı için gerisi
 * değişmez.
 */

import { cloudGet, cloudSet } from './lib/cloud'

export type Role = 'admin' | 'uye'

export interface User {
  id: string
  username: string
  password: string
  role: Role
  businessName: string
  createdAt: string
}

const USERS_KEY = 'cayci-pos:users'
const USERS_TS_KEY = 'cayci-pos:users:ts'
const SESSION_KEY = 'cayci-pos:session'

/** Şimdilik 1 admin tanımlı, kapasite 3. */
export const MAX_ADMIN = 3

const ILK_ADMIN: User = {
  id: 'admin-1',
  username: 'admin',
  password: 'admin',
  role: 'admin',
  businessName: 'Yönetim',
  createdAt: '2026-01-01',
}

export function getUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (raw) return JSON.parse(raw) as User[]
  } catch {
    // bozuk kayıt
  }
  const init = [ILK_ADMIN]
  localStorage.setItem(USERS_KEY, JSON.stringify(init))
  return init
}

function saveUsers(users: User[]) {
  const ts = new Date().toISOString()
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
  localStorage.setItem(USERS_TS_KEY, ts)
  // buluta it (çevrimdışıysa sessizce başarısız olur; sonraki senkron düzeltir)
  void cloudSet(USERS_KEY, users, ts)
}

/**
 * Uygulama açılışında çağrılır: bulut kullanıcı listesini yerelle karşılaştırır.
 * Bulut daha yeniyse benimser (başka cihazda açılan hesapla giriş için); yerel
 * daha yeni ya da bulut boşsa yereli buluta iter. Çevrimdışıysa hiçbir şey yapmaz.
 */
export async function syncUsers(): Promise<void> {
  const localTs = localStorage.getItem(USERS_TS_KEY) ?? ''
  const cloud = await cloudGet(USERS_KEY)
  if (cloud && Array.isArray(cloud.value) && (!localTs || cloud.updatedAt > localTs)) {
    localStorage.setItem(USERS_KEY, JSON.stringify(cloud.value))
    localStorage.setItem(USERS_TS_KEY, cloud.updatedAt)
  } else if (!cloud || (localTs && localTs > cloud.updatedAt)) {
    const ts = localTs || new Date().toISOString()
    localStorage.setItem(USERS_TS_KEY, ts)
    await cloudSet(USERS_KEY, getUsers(), ts)
  }
}

export function adminCount(): number {
  return getUsers().filter((u) => u.role === 'admin').length
}

export function login(username: string, password: string): User | { error: string } {
  const u = getUsers().find(
    (x) => x.username.toLowerCase() === username.trim().toLowerCase() && x.password === password,
  )
  if (!u) return { error: 'Kullanıcı adı veya parola hatalı.' }
  localStorage.setItem(SESSION_KEY, u.id)
  return u
}

export function register(
  username: string,
  password: string,
  businessName: string,
): User | { error: string } {
  const users = getUsers()
  if (users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())) {
    return { error: 'Bu kullanıcı adı alınmış.' }
  }
  if (username.trim().length < 3) return { error: 'Kullanıcı adı en az 3 karakter olmalı.' }
  if (password.length < 4) return { error: 'Parola en az 4 karakter olmalı.' }
  if (!businessName.trim()) return { error: 'İşletme adı gerekli.' }

  const u: User = {
    id: 'u-' + Math.random().toString(36).slice(2, 10),
    username: username.trim(),
    password,
    role: 'uye',
    businessName: businessName.trim(),
    createdAt: new Date().toISOString(),
  }
  saveUsers([...users, u])
  localStorage.setItem(SESSION_KEY, u.id)
  return u
}

/** Yeni admin tanımlama. Kapasite dolduysa reddeder. */
export function addAdmin(username: string, password: string): User | { error: string } {
  if (adminCount() >= MAX_ADMIN) return { error: `En fazla ${MAX_ADMIN} admin olabilir.` }
  const users = getUsers()
  if (users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())) {
    return { error: 'Bu kullanıcı adı alınmış.' }
  }
  const u: User = {
    id: 'admin-' + Math.random().toString(36).slice(2, 8),
    username: username.trim(),
    password,
    role: 'admin',
    businessName: 'Yönetim',
    createdAt: new Date().toISOString(),
  }
  saveUsers([...users, u])
  return u
}

export function currentUser(): User | null {
  const id = localStorage.getItem(SESSION_KEY)
  if (!id) return null
  return getUsers().find((u) => u.id === id) ?? null
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

/** Her kullanıcının verisi ayrı anahtarda durur. */
export function dataKey(userId: string): string {
  return `cayci-pos:data:${userId}`
}
