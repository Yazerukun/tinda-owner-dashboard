// Default API URL points to live Cloudflare Worker
const DEFAULT_API_URL = ((import.meta as any).env?.VITE_API_URL as string) || 'https://tinda-sync.yomikaze-md.workers.dev'

// Secondary High-Availability Cloud: Supabase Managed PostgreSQL Engine
export const SUPABASE_CONFIG = {
  url: 'https://qeruenpmscoxwycniklr.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlcnVlbnBtc2NveHd5Y25pa2xyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MTAxNTAsImV4cCI6MjEwODE4NjE1MH0.flHZBS2LbR4Plc6Ta3kmubxpn9yvj8TBNCJ_k_rxWMg'
}

export type ActiveCloudGateway = 'cloudflare' | 'supabase'
let currentActiveGateway: ActiveCloudGateway = 'cloudflare'
const gatewayListeners = new Set<(gw: ActiveCloudGateway) => void>()

export function getActiveCloudGateway(): ActiveCloudGateway {
  return currentActiveGateway
}

function setActiveGateway(gw: ActiveCloudGateway): void {
  if (currentActiveGateway !== gw) {
    currentActiveGateway = gw
    for (const listener of gatewayListeners) {
      try {
        listener(gw)
      } catch {}
    }
  }
}

export function subscribeGatewayChange(listener: (gw: ActiveCloudGateway) => void): () => void {
  gatewayListeners.add(listener)
  listener(currentActiveGateway)
  return () => {
    gatewayListeners.delete(listener)
  }
}

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

/**
 * Autonomous Dual-Cloud Fallback:
 * If the primary Cloudflare Worker endpoint fails or hits daily row limits,
 * seamlessly query Supabase Managed PostgreSQL REST API without breaking the UI.
 */
async function resolveViaSupabase<T>(endpoint: string): Promise<T> {
  const supaHeaders = {
    apikey: SUPABASE_CONFIG.anonKey,
    Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
    'Content-Type': 'application/json'
  }

  // 1. Overview Summary: /api/owner/summary?from=...&to=...
  if (endpoint.startsWith('/api/owner/summary')) {
    const urlObj = new URL('http://dummy' + endpoint)
    const from = urlObj.searchParams.get('from') || ''
    const to = urlObj.searchParams.get('to') || ''

    // Fetch all registered branches/stores
    const storesRes = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/stores?select=*`, { headers: supaHeaders })
    const stores = (storesRes.ok ? await storesRes.json() : []) as any[]

    // Fetch sales within date window
    let salesQuery = `${SUPABASE_CONFIG.url}/rest/v1/sales?select=id,store_id,subtotal_c,discount_c,total_c,cash_c,gcash_c,maya_c,utang_c,status,sold_at&order=sold_at.desc&limit=1000`
    if (from) salesQuery += `&sold_at=gte.${from}T00:00:00`
    if (to) salesQuery += `&sold_at=lte.${to}T23:59:59`

    const salesRes = await fetch(salesQuery, { headers: supaHeaders })
    const sales = (salesRes.ok ? await salesRes.json() : []) as any[]

    let totalSalesC = 0
    let grossSalesC = 0
    let discountC = 0
    let cashC = 0
    let gcashC = 0
    let mayaC = 0
    let utangC = 0
    let voidCount = 0
    let voidTotalC = 0
    let completedTxCount = 0

    const branchMap = new Map<string, any>()
    for (const s of stores) {
      branchMap.set(s.id, {
        store_id: s.id,
        branch_name: s.branch_name,
        last_sale_at: s.last_sale_at,
        last_sync_at: s.last_sync_at,
        total_sales_c: 0,
        gross_sales_c: 0,
        discount_c: 0,
        cash_c: 0,
        gcash_c: 0,
        maya_c: 0,
        utang_c: 0,
        void_count: 0,
        void_total_c: 0,
        transaction_count: 0
      })
    }

    for (const sale of sales) {
      const isVoid = sale.status === 'VOIDED'
      const isCompleted = sale.status === 'COMPLETED'
      const branch = branchMap.get(sale.store_id)

      if (isVoid) {
        voidCount++
        voidTotalC += sale.total_c || 0
        if (branch) {
          branch.void_count++
          branch.void_total_c += sale.total_c || 0
        }
      } else if (isCompleted) {
        completedTxCount++
        const tot = sale.total_c || 0
        const gross = sale.subtotal_c || tot
        const disc = sale.discount_c || 0
        const cash = sale.cash_c || 0
        const gcash = sale.gcash_c || 0
        const maya = sale.maya_c || 0
        const utang = sale.utang_c || 0

        totalSalesC += tot
        grossSalesC += gross
        discountC += disc
        cashC += cash
        gcashC += gcash
        mayaC += maya
        utangC += utang

        if (branch) {
          branch.total_sales_c += tot
          branch.gross_sales_c += gross
          branch.discount_c += disc
          branch.cash_c += cash
          branch.gcash_c += gcash
          branch.maya_c += maya
          branch.utang_c += utang
          branch.transaction_count++
        }
      }
    }

    setActiveGateway('supabase')
    return {
      from: from || new Date().toISOString().slice(0, 10),
      to: to || new Date().toISOString().slice(0, 10),
      total_sales_c: totalSalesC,
      gross_sales_c: grossSalesC,
      discount_c: discountC,
      cash_c: cashC,
      gcash_c: gcashC,
      maya_c: mayaC,
      utang_c: utangC,
      transaction_count: completedTxCount,
      void_count: voidCount,
      void_total_c: voidTotalC,
      branches: Array.from(branchMap.values())
    } as T
  }

  // 2. Branch Details: /api/owner/branch/:storeId
  if (endpoint.includes('/api/owner/branch/')) {
    const parts = endpoint.split('?')[0].split('/')
    const storeId = parts[parts.length - 1]
    const urlObj = new URL('http://dummy' + endpoint)
    const from = urlObj.searchParams.get('from') || ''
    const to = urlObj.searchParams.get('to') || ''

    // Fetch store
    const storeRes = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/stores?id=eq.${storeId}&select=*`, { headers: supaHeaders })
    const storeArr = (storeRes.ok ? await storeRes.json() : []) as any[]
    const store = storeArr[0] || { id: storeId, branch_name: 'Store', last_sale_at: null, last_sync_at: null }

    // Fetch sales for this store
    let salesQuery = `${SUPABASE_CONFIG.url}/rest/v1/sales?store_id=eq.${storeId}&select=*&order=sold_at.desc&limit=200`
    if (from) salesQuery += `&sold_at=gte.${from}T00:00:00`
    if (to) salesQuery += `&sold_at=lte.${to}T23:59:59`
    const salesRes = await fetch(salesQuery, { headers: supaHeaders })
    const sales = (salesRes.ok ? await salesRes.json() : []) as any[]

    // Fetch shifts
    const shiftsRes = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/shift_snapshots?store_id=eq.${storeId}&select=*&order=closed_at.desc&limit=20`, { headers: supaHeaders })
    const shifts = (shiftsRes.ok ? await shiftsRes.json() : []) as any[]

    // Fetch stock movements
    const movementsRes = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/stock_movements?store_id=eq.${storeId}&select=*&order=moved_at.desc&limit=30`, { headers: supaHeaders })
    const movements = (movementsRes.ok ? await movementsRes.json() : []) as any[]

    let totSales = 0
    let cash = 0
    let gcash = 0
    let maya = 0
    let utang = 0
    let txCount = 0
    let voidCount = 0
    let voidTotal = 0

    const dailyMap = new Map<string, { total_c: number; count: number }>()

    for (const s of sales) {
      if (s.status === 'COMPLETED') {
        totSales += s.total_c || 0
        cash += s.cash_c || 0
        gcash += s.gcash_c || 0
        maya += s.maya_c || 0
        utang += s.utang_c || 0
        txCount++

        const dayStr = (s.sold_at || '').slice(0, 10)
        if (dayStr) {
          const cur = dailyMap.get(dayStr) || { total_c: 0, count: 0 }
          cur.total_c += s.total_c || 0
          cur.count++
          dailyMap.set(dayStr, cur)
        }
      } else if (s.status === 'VOIDED') {
        voidCount++
        voidTotal += s.total_c || 0
      }
    }

    const dailyTotals = Array.from(dailyMap.entries()).map(([day, val]) => ({
      day,
      total_c: val.total_c,
      count: val.count
    }))

    setActiveGateway('supabase')
    const branchDetail: any = {
      from: from || new Date().toISOString().slice(0, 10),
      to: to || new Date().toISOString().slice(0, 10),
      store,
      periodFinancials: {
        total_sales_c: totSales,
        gross_sales_c: totSales,
        discount_c: 0,
        cash_c: cash,
        gcash_c: gcash,
        maya_c: maya,
        utang_c: utang,
        transaction_count: txCount,
        void_count: voidCount,
        void_total_c: voidTotal
      },
      sales: sales.map((s) => ({
        id: s.id,
        transaction_no: s.transaction_no,
        cashier_name: s.cashier_name,
        customer_name: s.customer_name,
        subtotal_c: s.subtotal_c,
        discount_c: s.discount_c,
        total_c: s.total_c,
        cash_c: s.cash_c,
        gcash_c: s.gcash_c,
        maya_c: s.maya_c,
        utang_c: s.utang_c,
        status: s.status,
        sold_at: s.sold_at,
        items_summary: null
      })),
      stockMovements: movements,
      shifts,
      topProducts: [],
      dailyTotals
    }

    return branchDetail as T
  }

  if (endpoint.startsWith('/api/announcements')) {
    setActiveGateway('supabase')
    return { ok: true, announcements: [] } as T
  }

  if (endpoint.startsWith('/api/chat/messages')) {
    setActiveGateway('supabase')
    return { ok: true, messages: [] } as T
  }

  throw new Error(`Endpoint ${endpoint} not available on secondary failover.`)
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

  let primaryFailed = false
  let failureReason = ''

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4500) // 4.5s timeout for primary gateway

    const res = await fetch(`${base}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal
    })
    clearTimeout(timeout)

    let text = ''
    try {
      text = await res.text()
    } catch {
      throw new Error('Network connection failed.')
    }

    let data: any = null
    try {
      data = JSON.parse(text)
    } catch {
      // Non-JSON response
      if (res.status >= 500) {
        primaryFailed = true
        failureReason = `Cloudflare Server Error (${res.status})`
      } else if (res.status === 404) {
        throw new Error(`Service endpoint not found (${endpoint}).`)
      } else {
        throw new Error(text.trim() || `Network request failed (${res.status}).`)
      }
    }

    if (!primaryFailed) {
      if (res.ok && (!data || data.ok !== false)) {
        setActiveGateway('cloudflare')
        return data as T
      }

      if (res.status === 401 && (data?.code === 'SESSION_EXPIRED' || data?.code === 'UNAUTHORIZED')) {
        clearToken()
        window.location.reload()
        throw new Error('Session expired.')
      }

      if (res.status >= 500 || data?.ok === false) {
        primaryFailed = true
        failureReason = data?.error || `Request failed (${res.status})`
      } else {
        throw new Error(data?.error || `Request failed (${res.status})`)
      }
    }
  } catch (err: any) {
    primaryFailed = true
    failureReason = err.message || 'Primary Cloudflare connection timeout'
  }

  // 🛡️ PRIMARY FAILED: INITIATE AUTONOMOUS SUPABASE FAILOVER
  if (primaryFailed) {
    console.warn(`[DualCloud] Primary gateway failure (${failureReason}). Attempting Supabase failover for ${endpoint}...`)
    try {
      const fallbackData = await resolveViaSupabase<T>(endpoint)
      console.log(`[DualCloud] ⚡ Successfully resolved ${endpoint} via Supabase Secondary Cloud!`)
      return fallbackData
    } catch (fallbackErr: any) {
      console.error(`[DualCloud] Secondary failover failed:`, fallbackErr.message)
      throw new Error(`Unable to connect to Primary Cloud (${failureReason}) and Secondary Cloud (${fallbackErr.message}).`)
    }
  }

  throw new Error('Unexpected request resolution error.')
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
