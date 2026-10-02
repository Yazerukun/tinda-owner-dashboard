import type { SummaryResponse, BranchDetailResponse } from './types'

const DEFAULT_API_URL = 'https://tinda-sync.yomikaze-md.workers.dev'

export function getApiUrl(): string {
  return localStorage.getItem('tinda_api_url') || DEFAULT_API_URL
}

export function setApiUrl(url: string): void {
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

export function money(cents: number | null | undefined): string {
  const val = (cents ?? 0) / 100
  return '₱ ' + val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Never'
  try {
    const fixed = isoString.includes(' ') && !isoString.includes('T') ? isoString.replace(' ', 'T') : isoString
    const d = new Date(fixed)
    if (isNaN(d.getTime())) return isoString
    
    // Relative time calculation
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diffSec < 60) return 'Just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return isoString
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiUrl()
  const token = getToken()
  const headers = new Headers(options.headers || {})

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  })

  const data = await res.json().catch(() => ({
    ok: false,
    error: 'Network error or invalid server response'
  }))

  if (!res.ok || data.ok === false) {
    if (res.status === 401 && (data.code === 'SESSION_EXPIRED' || data.code === 'UNAUTHORIZED')) {
      clearToken()
      window.location.reload()
    }
    throw new Error(data.error || `Request failed (${res.status})`)
  }

  return data as T
}

export async function loginOwner(username: string, password: string): Promise<{ ok: boolean; token: string }> {
  const res = await request<{ ok: boolean; token: string }>('/api/owner/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  })
  if (res.token) setToken(res.token)
  return res
}

export async function setupOwner(username: string, password: string): Promise<{ ok: boolean; token: string }> {
  const res = await request<{ ok: boolean; token: string }>('/api/owner/setup', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  })
  if (res.token) setToken(res.token)
  return res
}

export async function linkBranch(storeId: string, syncKey: string): Promise<{ ok: boolean; message: string }> {
  return request<{ ok: boolean; message: string }>('/api/owner/branch/link', {
    method: 'POST',
    body: JSON.stringify({ store_id: storeId.trim(), sync_key: syncKey.trim() })
  })
}

export async function fetchSummary(from: string, to: string): Promise<SummaryResponse> {
  return request<SummaryResponse>(`/api/owner/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
}

export async function fetchBranchDetail(storeId: string, from: string, to: string): Promise<BranchDetailResponse> {
  return request<BranchDetailResponse>(`/api/owner/branch/${encodeURIComponent(storeId)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
}
