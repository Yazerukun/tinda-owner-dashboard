// Default API URL points to live Cloudflare Worker
const DEFAULT_API_URL = ((import.meta as any).env?.VITE_API_URL as string) || 'https://tinda-sync.yomikaze-md.workers.dev'

export function getApiBase(): string {
  return localStorage.getItem('tinda_api_url') || DEFAULT_API_URL
}

export function setApiBase(url: string): void {
  localStorage.setItem('tinda_api_url', url.replace(/\/+$/, ''))
}

export function getToken(): string | null {
  return localStorage.getItem('tinda_owner_token')
}

export function setToken(token: string): void {
  localStorage.setItem('tinda_owner_token', token)
}

export function clearToken(): void {
  localStorage.removeItem('tinda_owner_token')
}

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBase()
  const token = getToken()
  const headers = new Headers(options.headers || {})
  
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  
  const res = await fetch(`${base}${endpoint}`, {
    ...options,
    headers,
  })
  
  const data = await res.json().catch(() => ({ ok: false, error: 'Network error or invalid JSON response' }))
  
  if (!res.ok || (data && data.ok === false)) {
    if (res.status === 401 && (data.code === 'SESSION_EXPIRED' || data.code === 'UNAUTHORIZED')) {
      clearToken()
      window.location.reload()
    }
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  
  return data as T
}

export function formatPesos(centavos: number | null | undefined): string {
  const c = centavos ?? 0
  return '₱' + (c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  try {
    const cleanIso = iso.includes(' ') && !iso.includes('T') ? iso.replace(' ', 'T') : iso
    const d = new Date(cleanIso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch {
    return iso
  }
}
