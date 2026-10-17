import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env'
import {
  validateSyncKey, ensureStore, extractBearer,
  createOwnerSession, validateOwnerSession,
  findOwnerByUsername, createOwnerUser, ownerCount, verifyOwnerPassword,
  hashSyncKey, authenticateOrRegisterStore, sha256
} from './auth'
import { syncSale, syncStock, syncShift } from './sync'
import { getOverallSummary, getBranchDetail, getLinkedBranches } from './reports'

const app = new Hono<{
  Bindings: Env
  Variables: {
    owner_id: number
    store_id: string
    body: any
  }
}>()

// ---------------------------------------------------------------------------
// CORS — allow dashboard origin
// ---------------------------------------------------------------------------
app.use('*', cors({
  origin: (origin) => {
    const allowed = [
      'https://tinda-owner-dashboard.pages.dev',
      'https://yazerukun.github.io',
      'http://localhost:5174',
      'http://localhost:4173',
    ]
    return allowed.some((a) => origin?.startsWith(a.replace(/\/+$/, ''))) ? origin : 'https://tinda-owner-dashboard.pages.dev'
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// Global Error & Not Found shields — guarantee 100% valid JSON even during uncaught exceptions or D1 quota limits
app.onError((err, c) => {
  console.error('[UNCAUGHT_WORKER_ERROR]', err)
  const isD1Quota = String(err?.message || '').includes('daily row read limit')
  const userMessage = isD1Quota
    ? 'Cloudflare D1 daily free limit reached. Please upgrade to Workers Paid ($5/mo) or wait until midnight UTC.'
    : (err?.message || 'Internal Server Error')

  return c.json({
    ok: false,
    error: userMessage,
    code: isD1Quota ? 'D1_QUOTA_EXCEEDED' : 'INTERNAL_SERVER_ERROR'
  }, 500)
})

app.notFound((c) => {
  return c.json({
    ok: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND'
  }, 404)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ok = (c: any, data: unknown) =>
  c.json({ ok: true, ...((typeof data === 'object' && data !== null) ? data : { data }) })

const err = (c: any, status: number, message: string, code = 'ERROR') =>
  c.json({ ok: false, error: message, code }, status)

function dayQ(v: string | undefined): string {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/', (c) => c.json({ ok: true, service: 'tinda-sync', version: '1.0.0' }))

// ---------------------------------------------------------------------------
// TINDA-POS Sync Endpoints (authenticated by sync_key)
// ---------------------------------------------------------------------------

/** Middleware: extract + validate store sync key */
async function requireSyncKey(c: any, next: () => Promise<void>) {
  const body = await c.req.json().catch(() => null)
  if (!body) return err(c, 400, 'Invalid JSON body.', 'BAD_REQUEST')

  const store_id = String((body as any).store_id ?? '').trim().toLowerCase()
  const sync_key = String((body as any).sync_key ?? '').trim()
  const branch_name = String((body as any).branch_name ?? 'Unknown Branch').trim()
  if (!store_id || !sync_key) {
    return err(c, 400, 'store_id and sync_key are required.', 'BAD_REQUEST')
  }

  const auth = await authenticateOrRegisterStore(c.env.DB, store_id, branch_name, sync_key, c.env.SESSION_SECRET)
  if (!auth.ok) return err(c, 401, 'Invalid sync credentials.', 'UNAUTHORIZED')

  c.set('store_id', store_id)
  c.set('body', body)
  await next()
}

/** POST /api/sync/sale — individual sale */
app.post('/api/sync/sale', async (c) => {
  let body: any
  try { body = await c.req.json() } catch { return err(c, 400, 'Invalid JSON.', 'BAD_REQUEST') }

  const rawStoreId = String(body.store_id ?? '').trim().toLowerCase()
  const sync_key = String(body.sync_key ?? '').trim()
  const branch_name = String(body.branch_name ?? '').trim() || 'Unknown'
  const { data } = body
  if (!rawStoreId || !sync_key || !data) return err(c, 400, 'store_id, sync_key, data required.', 'BAD_REQUEST')

  const auth = await authenticateOrRegisterStore(c.env.DB, rawStoreId, branch_name, sync_key, c.env.SESSION_SECRET)
  if (!auth.ok) return err(c, 401, 'Invalid sync credentials.', 'UNAUTHORIZED')

  await syncSale(c.env.DB, rawStoreId, data)

  // Invalidate any stale cached snapshots for this store and date in R2 so dashboard fetches fresh data
  if (c.env.SNAPSHOTS) {
    const today = dayQ(undefined)
    const saleDate = typeof data.sold_at === 'string' && data.sold_at.length >= 10 ? data.sold_at.slice(0, 10) : today
    c.executionCtx.waitUntil(
      (async () => {
        try {
          if (!c.env.SNAPSHOTS) return
          await Promise.allSettled([
            c.env.SNAPSHOTS.delete(`portal_${rawStoreId}_${today}_${today}.json`),
            c.env.SNAPSHOTS.delete(`portal_${rawStoreId}_${saleDate}_${saleDate}.json`),
            c.env.SNAPSHOTS.delete(`branch_${rawStoreId}_${today}_${today}.json`),
            c.env.SNAPSHOTS.delete(`branch_${rawStoreId}_${saleDate}_${saleDate}.json`)
          ])
        } catch (e) {
          console.warn('R2 snapshot invalidation failed:', e)
        }
      })()
    )
  }

  return c.json({ ok: true, received: 'sale' })
})

/** POST /api/sync/stock — stock movement */
app.post('/api/sync/stock', async (c) => {
  let body: any
  try { body = await c.req.json() } catch { return err(c, 400, 'Invalid JSON.', 'BAD_REQUEST') }

  const rawStoreId = String(body.store_id ?? '').trim().toLowerCase()
  const sync_key = String(body.sync_key ?? '').trim()
  const branch_name = String(body.branch_name ?? '').trim() || 'Unknown'
  const { data } = body
  if (!rawStoreId || !sync_key || !data) return err(c, 400, 'store_id, sync_key, data required.', 'BAD_REQUEST')

  const auth = await authenticateOrRegisterStore(c.env.DB, rawStoreId, branch_name, sync_key, c.env.SESSION_SECRET)
  if (!auth.ok) return err(c, 401, 'Invalid sync credentials.', 'UNAUTHORIZED')

  await syncStock(c.env.DB, rawStoreId, data)
  return c.json({ ok: true, received: 'stock_movement' })
})

/** POST /api/sync/shift — shift close summary */
app.post('/api/sync/shift', async (c) => {
  let body: any
  try { body = await c.req.json() } catch { return err(c, 400, 'Invalid JSON.', 'BAD_REQUEST') }

  const rawStoreId = String(body.store_id ?? '').trim().toLowerCase()
  const sync_key = String(body.sync_key ?? '').trim()
  const branch_name = String(body.branch_name ?? '').trim() || 'Unknown'
  const { data } = body
  if (!rawStoreId || !sync_key || !data) return err(c, 400, 'store_id, sync_key, data required.', 'BAD_REQUEST')

  const auth = await authenticateOrRegisterStore(c.env.DB, rawStoreId, branch_name, sync_key, c.env.SESSION_SECRET)
  if (!auth.ok) return err(c, 401, 'Invalid sync credentials.', 'UNAUTHORIZED')

  await syncShift(c.env.DB, rawStoreId, data)
  return c.json({ ok: true, received: 'shift' })
})

// ---------------------------------------------------------------------------
// Owner Auth Endpoints
// ---------------------------------------------------------------------------

/** POST /api/owner/setup & /api/owner/register — owner account creation */
const handleOwnerSetup = async (c: any) => {
  let body: any
  try { body = await c.req.json() } catch { return err(c, 400, 'Invalid JSON.', 'BAD_REQUEST') }

  const { username, password } = body
  if (!username || !password || String(password).length < 8) {
    return err(c, 400, 'username and password (min 8 chars) required.', 'VALIDATION_ERROR')
  }

  const existing = await findOwnerByUsername(c.env.DB, String(username), c.env.SNAPSHOTS)
  if (existing) {
    return err(c, 409, 'Username already taken. Please choose another username or sign in.', 'USERNAME_TAKEN')
  }

  const ownerId = await createOwnerUser(c.env.DB, String(username), String(password), c.env.SNAPSHOTS)
  const token = await createOwnerSession(c.env.DB, ownerId, String(username), c.env.SESSION_SECRET)
  return c.json({ ok: true, token, message: 'Owner account created.' })
}

app.post('/api/owner/setup', handleOwnerSetup)
app.post('/api/owner/register', handleOwnerSetup)

/** POST /api/owner/login */
app.post('/api/owner/login', async (c) => {
  let body: any
  try { body = await c.req.json() } catch { return err(c, 400, 'Invalid JSON.', 'BAD_REQUEST') }

  const { username, password } = body
  if (!username || !password) return err(c, 400, 'username and password required.', 'VALIDATION_ERROR')

  try {
    const owner = await findOwnerByUsername(c.env.DB, String(username), c.env.SNAPSHOTS)
    if (!owner) return err(c, 401, 'Invalid username or password.', 'INVALID_CREDENTIALS')

    const valid = await verifyOwnerPassword(owner, String(password))
    if (!valid) return err(c, 401, 'Invalid username or password.', 'INVALID_CREDENTIALS')

    const token = await createOwnerSession(c.env.DB, owner.id, owner.username || String(username), c.env.SESSION_SECRET)
    return c.json({ ok: true, token, expiresIn: 86400 })
  } catch (authErr: any) {
    console.error('Login error:', authErr)
    const isD1Limit = String(authErr?.message || '').includes('daily row read limit')
    if (isD1Limit) {
      return err(c, 503, 'Cloudflare D1 daily free limit reached. System is switching to R2 edge auth — please retry in a few seconds.', 'D1_QUOTA_EXCEEDED')
    }
    return err(c, 500, authErr?.message || 'Login failed.', 'SERVER_ERROR')
  }
})

// ---------------------------------------------------------------------------
// Owner Dashboard Endpoints (require valid owner session token)
// ---------------------------------------------------------------------------

async function requireOwner(c: any, next: () => Promise<void>) {
  const token = extractBearer(c.req.header('Authorization'))
  const ownerId = await validateOwnerSession(c.env.DB, token, c.env.SESSION_SECRET)
  if (!ownerId) return err(c, 401, 'Session expired. Please login again.', 'SESSION_EXPIRED')
  c.set('owner_id', ownerId)
  await next()
}

/** GET /api/owner/summary?from=YYYY-MM-DD&to=YYYY-MM-DD */
app.get('/api/owner/summary', requireOwner, async (c) => {
  const ownerId: number = c.get('owner_id')
  const from = dayQ(c.req.query('from'))
  const to = dayQ(c.req.query('to'))
  const cacheKey = `summary_${ownerId}_${from}_${to}.json`

  // 1. Fetch from D1 as authoritative source of truth

  // 2. Fetch from D1 with fallback
  try {
    const summary = await getOverallSummary(c.env.DB, ownerId, from, to)
    const payload = { ok: true, from, to, ...summary }

    // Save to R2 cache asynchronously
    if (c.env.SNAPSHOTS) {
      c.executionCtx.waitUntil(
        c.env.SNAPSHOTS.put(cacheKey, JSON.stringify(payload), {
          httpMetadata: { contentType: 'application/json' }
        }).catch(() => {})
      )
    }

    return c.json(payload)
  } catch (err: any) {
    if (c.env.SNAPSHOTS) {
      try {
        const fb = await c.env.SNAPSHOTS.get(cacheKey)
        if (fb) return c.json(await fb.json())
      } catch {}
    }
    // If D1 limit is exceeded and no summary cache exists, return resilient empty summary with notice
    const isD1Limit = String(err?.message || '').includes('daily row read limit')
    if (isD1Limit) {
      return c.json({
        ok: true,
        from,
        to,
        total_sales_c: 0,
        cash_c: 0,
        gcash_c: 0,
        maya_c: 0,
        utang_c: 0,
        transaction_count: 0,
        branches: [],
        _notice: 'Cloudflare D1 daily free limit reached (5M rows read). Live database resumes at 12:00 AM UTC.'
      })
    }
    throw err
  }
})

/** GET /api/owner/branches */
app.get('/api/owner/branches', requireOwner, async (c) => {
  const ownerId: number = c.get('owner_id')
  const cacheKey = `branches_${ownerId}.json`

  // 1. Fetch from D1 as authoritative source of truth

  try {
    const branches = await getLinkedBranches(c.env.DB, ownerId)
    const payload = { ok: true, branches: branches.results }

    if (c.env.SNAPSHOTS) {
      c.executionCtx.waitUntil(
        c.env.SNAPSHOTS.put(cacheKey, JSON.stringify(payload), {
          httpMetadata: { contentType: 'application/json' }
        }).catch(() => {})
      )
    }

    return c.json(payload)
  } catch (e: any) {
    if (c.env.SNAPSHOTS) {
      try {
        const fb = await c.env.SNAPSHOTS.get(cacheKey)
        if (fb) return c.json(await fb.json())
      } catch {}
    }
    const isD1Limit = String(e?.message || '').includes('daily row read limit')
    if (isD1Limit) {
      return c.json({
        ok: true,
        branches: [],
        _notice: 'D1 limit reached. Live sync will reset at 12:00 AM UTC.'
      })
    }
    throw e
  }
})

/** GET /api/owner/branch/:store_id?from=YYYY-MM-DD&to=YYYY-MM-DD */
app.get('/api/owner/branch/:store_id', requireOwner, async (c) => {
  const ownerId: number = c.get('owner_id')
  const storeId = String(c.req.param('store_id') ?? '').trim().toLowerCase()
  const from = dayQ(c.req.query('from'))
  const to = dayQ(c.req.query('to'))
  const cacheKey = `branch_${storeId}_${from}_${to}.json`

  // 1. Fetch from D1 as authoritative source of truth

  try {
    const detail = await getBranchDetail(c.env.DB, ownerId, storeId, from, to)
    if (!detail) return err(c, 404, 'Branch not found or not linked to your account.', 'NOT_FOUND')
    const payload = { ok: true, ...detail }

    if (c.env.SNAPSHOTS) {
      c.executionCtx.waitUntil(
        c.env.SNAPSHOTS.put(cacheKey, JSON.stringify(payload), {
          httpMetadata: { contentType: 'application/json' }
        }).catch(() => {})
      )
    }

    return c.json(payload)
  } catch (e: any) {
    if (c.env.SNAPSHOTS) {
      try {
        const fb = await c.env.SNAPSHOTS.get(cacheKey)
        if (fb) return c.json(await fb.json())
      } catch {}
    }
    const isD1Limit = String(e?.message || '').includes('daily row read limit')
    if (isD1Limit) {
      return c.json({
        ok: true,
        from,
        to,
        store: { id: storeId, branch_name: storeId, last_sale_at: null, last_sync_at: null },
        periodFinancials: {
          total_sales_c: 0,
          cash_c: 0,
          gcash_c: 0,
          maya_c: 0,
          utang_c: 0,
          transaction_count: 0,
          void_count: 0,
          void_total_c: 0
        },
        sales: [],
        stockMovements: [],
        shifts: [],
        topProducts: [],
        dailyTotals: [],
        hourlyTotals: [],
        lowStockItems: [],
        _notice: 'D1 limit reached. Live sync will reset at 12:00 AM UTC.'
      })
    }
    throw e
  }
})

/** POST /api/sync/ping & /api/sync/register — ping & auto-register from TINDA-POS desktop */
const handleSyncPing = async (c: any) => {
  let body: any
  try { body = await c.req.json() } catch { return err(c, 400, 'Invalid JSON.', 'BAD_REQUEST') }
  const storeId = String(body.store_id ?? '').trim().toLowerCase()
  const syncKey = String(body.sync_key ?? '').trim()
  const branchName = String(body.branch_name ?? '').trim() || 'My Store'
  const portalPin = body.portal_pin ? String(body.portal_pin).trim() : undefined
  const portalSlug = body.portal_slug ? String(body.portal_slug).trim() : undefined
  if (!storeId || !syncKey) return err(c, 400, 'store_id and sync_key required.', 'BAD_REQUEST')

  const auth = await authenticateOrRegisterStore(
    c.env.DB,
    storeId,
    branchName,
    syncKey,
    c.env.SESSION_SECRET,
    portalPin,
    portalSlug
  )
  if (!auth.ok) return err(c, 401, 'Invalid sync credentials.', 'UNAUTHORIZED')

  return c.json({
    ok: true,
    status: 'connected',
    store_id: storeId,
    branch_name: auth.branchName || branchName,
    slug: auth.slug
  })
}
app.post('/api/sync/ping', handleSyncPing)
app.post('/api/sync/register', handleSyncPing)

/** GET /api/announcements — community & release updates */
app.get('/api/announcements', async (c) => {
  const defaultAnnouncements = [
    {
      id: 'ann_v25',
      title: 'TINDA POS v2.2.17 & Cloudflare R2 Sync Active',
      message: 'Seamless offline/online sync with Cloudflare R2 high-speed snapshot caching is now operational.',
      author: 'TINDA Engineering',
      version_target: 'v2.2.17',
      is_pinned: 1,
      created_at: new Date().toISOString()
    }
  ]
  return c.json({ ok: true, announcements: defaultAnnouncements })
})

/** POST /api/owner/branch/link — link a TINDA-POS store to owner account */
app.post('/api/owner/branch/link', requireOwner, async (c) => {
  const ownerId: number = c.get('owner_id')
  let body: any
  try { body = await c.req.json() } catch { return err(c, 400, 'Invalid JSON.', 'BAD_REQUEST') }

  const storeId = String(body.store_id ?? '').trim().toLowerCase()
  const syncKey = String(body.sync_key ?? '').trim()
  const branchName = String(body.branch_name ?? '').trim() || 'My Store'

  if (!storeId || !syncKey) return err(c, 400, 'Store ID and Sync Key are required.', 'VALIDATION_ERROR')

  const expectedKeyHash = await hashSyncKey(syncKey, c.env.SESSION_SECRET)

  // 1. Check if owner exists in D1, if not create dummy/shadow record to satisfy FOREIGN KEY constraint
  try {
    const existingOwner = await c.env.DB.prepare('SELECT id FROM owner_users WHERE id = ?').bind(ownerId).first()
    if (!existingOwner) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO owner_users (id, username, password_hash, password_salt) VALUES (?, ?, ?, ?)`
      ).bind(ownerId, `owner_${ownerId}`, 'shadow_hash', 'shadow_salt').run()
    }
  } catch (ownerErr) {
    console.warn('Owner shadow insert skipped or failed:', ownerErr)
  }

  // 2. Perform link in D1 if available
  let linkedName = branchName
  try {
    const existingStore = await c.env.DB.prepare(
      'SELECT id, branch_name, sync_key_hash, owner_user_id FROM stores WHERE LOWER(id) = ?'
    ).bind(storeId).first<{ id: string; branch_name: string; sync_key_hash: string; owner_user_id: number | null }>()

    if (existingStore) {
      linkedName = existingStore.branch_name || branchName
      // If store already has a sync key hash, verify it matches
      if (existingStore.sync_key_hash !== expectedKeyHash) {
        if (existingStore.owner_user_id === ownerId) {
          await c.env.DB.prepare(
            `UPDATE stores
             SET sync_key_hash = ?, branch_name = ?,
                 last_sale_at = COALESCE(last_sale_at, (SELECT MAX(sold_at) FROM sales WHERE LOWER(store_id) = LOWER(stores.id)))
             WHERE LOWER(id) = ?`
          ).bind(expectedKeyHash, branchName, storeId).run()
          return c.json({ ok: true, message: `Branch "${branchName}" sync key updated successfully!` })
        }
        return err(c, 401, 'Invalid Sync Key for this Store ID. Please verify the Sync Key in Settings.', 'INVALID_CREDENTIALS')
      }

      await c.env.DB.prepare(
        `UPDATE stores
         SET owner_user_id = ?, id = LOWER(id),
             last_sale_at = COALESCE(last_sale_at, (SELECT MAX(sold_at) FROM sales WHERE LOWER(store_id) = LOWER(stores.id)))
         WHERE LOWER(id) = ?`
      ).bind(ownerId, storeId).run()
    } else {
      await c.env.DB.prepare(
        `INSERT INTO stores (id, branch_name, sync_key_hash, owner_user_id, last_sale_at, last_sync_at)
         VALUES (?, ?, ?, ?, (SELECT MAX(sold_at) FROM sales WHERE LOWER(store_id) = LOWER(?)), datetime('now'))`
      ).bind(storeId, branchName, expectedKeyHash, ownerId, storeId).run()
    }

    // Try store_owners table, ignore errors if constraint fails
    try {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO store_owners (store_id, owner_user_id) VALUES (?, ?)`
      ).bind(storeId, ownerId).run()
    } catch {}

  } catch (d1Err: any) {
    console.warn('D1 store link failed (quota or constraint):', d1Err)
  }

  // 3. Cache link in R2 so owner branches list always has it
  if (c.env.SNAPSHOTS) {
    try {
      const branchCacheKey = `branches_${ownerId}.json`
      let list: any = { ok: true, branches: [] }
      const existingBranches = await c.env.SNAPSHOTS.get(branchCacheKey)
      if (existingBranches) {
        list = await existingBranches.json()
      }
      const branchesArr = Array.isArray(list.branches) ? list.branches : []
      if (!branchesArr.some((b: any) => b.store_id.toLowerCase() === storeId.toLowerCase())) {
        branchesArr.push({
          id: storeId,
          store_id: storeId,
          branch_name: linkedName,
          last_sale_at: new Date().toISOString(),
          last_sync_at: new Date().toISOString(),
          total_sales_c: 0,
          cash_c: 0,
          gcash_c: 0,
          maya_c: 0,
          utang_c: 0,
          transaction_count: 0
        })
      }
      await c.env.SNAPSHOTS.put(branchCacheKey, JSON.stringify({ ok: true, branches: branchesArr }), {
        httpMetadata: { contentType: 'application/json' }
      })
    } catch (r2Err) {
      console.warn('R2 branch cache update failed:', r2Err)
    }
  }

  return c.json({ ok: true, message: `Branch "${linkedName}" linked successfully to your account!` })
})

// ---------------------------------------------------------------------------
// Direct Store Portal (Zero-Pairing 4-Digit PIN Access)
// ---------------------------------------------------------------------------

/** GET /api/portal/lookup?store=:storeIdOrSlug */
app.get('/api/portal/lookup', async (c) => {
  const q = String(c.req.query('store') || c.req.query('id') || '').trim().toLowerCase()
  if (!q) return err(c, 400, 'Store identifier required.', 'VALIDATION_ERROR')

  const store = await c.env.DB.prepare(
    `SELECT id, branch_name, slug, (pin_hash IS NOT NULL) AS has_pin, last_sale_at, last_sync_at
     FROM stores
     WHERE LOWER(id) = ? OR LOWER(slug) = ?`
  ).bind(q, q).first<{
    id: string
    branch_name: string
    slug: string | null
    has_pin: number
    last_sale_at: string | null
    last_sync_at: string | null
  }>()

  if (!store) {
    return err(c, 404, 'Store not found. Please verify the store link or sync from POS first.', 'NOT_FOUND')
  }

  return c.json({
    ok: true,
    store: {
      id: store.id,
      branch_name: store.branch_name,
      slug: store.slug,
      has_pin: Boolean(store.has_pin),
      last_sale_at: store.last_sale_at,
      last_sync_at: store.last_sync_at
    }
  })
})

/** POST /api/portal/unlock — verify 4-digit PIN and return branch telemetry */
app.post('/api/portal/unlock', async (c) => {
  try {
    let body: any
    try { body = await c.req.json() } catch { return err(c, 400, 'Invalid JSON.', 'BAD_REQUEST') }

  const q = String(body.store || body.id || '').trim().toLowerCase()
  const pin = String(body.pin || '').trim()
  const from = dayQ(body.from)
  const to = dayQ(body.to)

  if (!q) return err(c, 400, 'Store identifier required.', 'VALIDATION_ERROR')

  const store = await c.env.DB.prepare(
    `SELECT id, branch_name, pin_hash, slug, last_sale_at, last_sync_at
     FROM stores
     WHERE LOWER(id) = ? OR LOWER(slug) = ?`
  ).bind(q, q).first<{
    id: string
    branch_name: string
    pin_hash: string | null
    slug: string | null
    last_sale_at: string | null
    last_sync_at: string | null
  }>()

  if (!store) {
    return err(c, 404, 'Store not found.', 'NOT_FOUND')
  }

  // If store has a PIN configured, verify it
  if (store.pin_hash) {
    if (!pin) {
      return err(c, 401, '4-Digit Security PIN is required to unlock this store dashboard.', 'PIN_REQUIRED')
    }
    const enteredHash = await sha256(pin + ':' + c.env.SESSION_SECRET)
    if (enteredHash !== store.pin_hash) {
      return err(c, 401, 'Incorrect PIN. Please enter the correct 4-digit Owner PIN.', 'INVALID_PIN')
    }
  }

  const normStoreId = store.id.trim().toLowerCase()
  const startDate = from <= to ? from : to
  const endDate = from <= to ? to : from
  const cacheKey = `portal_${normStoreId}_${startDate}_${endDate}.json`

  // 1. D1 SQL Query (authoritative source of truth)
  let periodFinancials: any = null
  let sales: any = { results: [] }
  let stockMovements: any = { results: [] }
  let shifts: any = { results: [] }
  let topProducts: any = { results: [] }
  let dailyTotals: any = { results: [] }
  let hourlyTotals: any = { results: [] }
  let lowStockItems: any = { results: [] }

  try {
    periodFinancials = await c.env.DB.prepare(
      `SELECT
       COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_c ELSE 0 END), 0) AS total_sales_c,
       COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN cash_c ELSE 0 END), 0)  AS cash_c,
       COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN gcash_c ELSE 0 END), 0) AS gcash_c,
       COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN maya_c ELSE 0 END), 0)  AS maya_c,
       COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN utang_c ELSE 0 END), 0) AS utang_c,
       COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS transaction_count,
       COUNT(CASE WHEN status = 'VOIDED' THEN 1 END)    AS void_count,
       COALESCE(SUM(CASE WHEN status = 'VOIDED' THEN total_c ELSE 0 END), 0)    AS void_total_c
     FROM sales
     WHERE LOWER(store_id) = ? AND substr(sold_at, 1, 10) BETWEEN ? AND ?`
  ).bind(normStoreId, startDate, endDate).first<any>()

  // Recent sales (up to 300)
  sales = await c.env.DB.prepare(
    `SELECT s.id, s.transaction_no, s.cashier_name, s.customer_name,
            s.total_c, s.cash_c, s.gcash_c, s.maya_c, s.utang_c,
            s.status, s.sold_at,
            GROUP_CONCAT(si.product_name || ' ×' || si.qty, ', ') AS items_summary
     FROM sales s
     LEFT JOIN sale_items si ON si.sale_id = s.id
     WHERE LOWER(s.store_id) = ? AND substr(s.sold_at, 1, 10) BETWEEN ? AND ?
     GROUP BY s.id
     ORDER BY s.sold_at DESC LIMIT 300`
  ).bind(normStoreId, startDate, endDate).all<any>()

  // Stock movements
  stockMovements = await c.env.DB.prepare(
    `SELECT product_name, movement_type, quantity_change, quantity_before, quantity_after,
            unit, reference, reason, moved_at
     FROM stock_movements
     WHERE LOWER(store_id) = ? AND substr(moved_at, 1, 10) BETWEEN ? AND ?
     ORDER BY moved_at DESC LIMIT 200`
  ).bind(normStoreId, startDate, endDate).all<any>()

  // Shifts
  shifts = await c.env.DB.prepare(
    `SELECT cashier_name, shift_date, opened_at, closed_at,
            gross_sales_c, cash_c, gcash_c, maya_c, utang_c,
            refund_total_c, void_count, transaction_count, expenses_c, net_sales_c
     FROM shift_snapshots
     WHERE LOWER(store_id) = ? AND substr(shift_date, 1, 10) BETWEEN ? AND ?
     ORDER BY shift_date DESC, closed_at DESC LIMIT 50`
  ).bind(normStoreId, startDate, endDate).all<any>()

  // Top products
  topProducts = await c.env.DB.prepare(
    `SELECT si.product_name,
            SUM(si.qty) AS total_qty,
            SUM(si.subtotal_c) AS total_c,
            COUNT(DISTINCT s.id) AS sale_count
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE LOWER(s.store_id) = ? AND s.status = 'COMPLETED' AND substr(s.sold_at, 1, 10) BETWEEN ? AND ?
     GROUP BY si.product_name
     ORDER BY total_c DESC LIMIT 10`
  ).bind(normStoreId, startDate, endDate).all<any>()

  // Daily totals
  dailyTotals = await c.env.DB.prepare(
    `SELECT substr(sold_at, 1, 10) AS day,
            SUM(total_c) AS total_c,
            COUNT(*) AS count
     FROM sales
     WHERE LOWER(store_id) = ? AND status = 'COMPLETED' AND substr(sold_at, 1, 10) BETWEEN ? AND ?
     GROUP BY day ORDER BY day`
  ).bind(normStoreId, startDate, endDate).all<any>()

  // Hourly velocity totals
  hourlyTotals = await c.env.DB.prepare(
    `SELECT CAST(substr(sold_at, 12, 2) AS INTEGER) AS hour,
            SUM(total_c) AS total_c,
            COUNT(*) AS count
     FROM sales
     WHERE LOWER(store_id) = ? AND status = 'COMPLETED' AND substr(sold_at, 1, 10) BETWEEN ? AND ?
     GROUP BY hour ORDER BY hour`
  ).bind(normStoreId, startDate, endDate).all<any>()

  // Low stock alert radar
  lowStockItems = await c.env.DB.prepare(
    `SELECT sm.product_name, sm.unit, sm.quantity_after, sm.moved_at
     FROM stock_movements sm
     INNER JOIN (
       SELECT product_name, MAX(moved_at) as max_moved
       FROM stock_movements
       WHERE LOWER(store_id) = ?
       GROUP BY product_name
     ) latest ON sm.product_name = latest.product_name AND sm.moved_at = latest.max_moved
     WHERE LOWER(sm.store_id) = ? AND sm.quantity_after <= 10
       ORDER BY sm.quantity_after ASC
       LIMIT 40`
  ).bind(normStoreId, normStoreId).all<any>()
  } catch (d1Err: any) {
    console.error('D1 query error in portal/unlock:', d1Err)
    // If D1 failed, check if we have an older snapshot in R2 as defensive fallback
    if (c.env.SNAPSHOTS) {
      try {
        const fallbackObj = await c.env.SNAPSHOTS.get(cacheKey)
        if (fallbackObj) {
          const fb: any = await fallbackObj.json()
          if (fb && typeof fb === 'object') {
            return c.json({ ...fb, _notice: 'Served from resilient edge cache' })
          }
        }
      } catch {}
    }

    // Defensive fallback: If D1 limit is reached and no R2 snapshot exists yet, return empty structured telemetry with store header
    return c.json({
      ok: true,
      from: startDate,
      to: endDate,
      store: {
        id: store.id,
        branch_name: store.branch_name,
        slug: store.slug,
        last_sale_at: store.last_sale_at,
        last_sync_at: store.last_sync_at
      },
      periodFinancials: {
        total_sales_c: 0,
        cash_c: 0,
        gcash_c: 0,
        maya_c: 0,
        utang_c: 0,
        transaction_count: 0,
        void_count: 0,
        void_total_c: 0
      },
      sales: [],
      stockMovements: [],
      shifts: [],
      topProducts: [],
      dailyTotals: [],
      hourlyTotals: [],
      lowStockItems: [],
      _notice: 'Live database sync limit reached (5M rows/day). Displaying resilient dashboard mode until 12:00 AM UTC.'
    })
  }

  const payload = {
    ok: true,
    from: startDate,
    to: endDate,
    store: {
      id: store.id,
      branch_name: store.branch_name,
      slug: store.slug,
      last_sale_at: store.last_sale_at,
      last_sync_at: store.last_sync_at
    },
    periodFinancials: periodFinancials || {
      total_sales_c: 0,
      cash_c: 0,
      gcash_c: 0,
      maya_c: 0,
      utang_c: 0,
      transaction_count: 0,
      void_count: 0,
      void_total_c: 0
    },
    sales: sales.results || [],
    stockMovements: stockMovements.results || [],
    shifts: shifts.results || [],
    topProducts: topProducts.results || [],
    dailyTotals: dailyTotals.results || [],
    hourlyTotals: hourlyTotals.results || [],
    lowStockItems: lowStockItems.results || [],
  }

  // 3. CACHE AT THE EDGE: Save to R2 asynchronously
  if (c.env.SNAPSHOTS) {
    c.executionCtx.waitUntil(
      c.env.SNAPSHOTS.put(cacheKey, JSON.stringify(payload), {
        httpMetadata: { contentType: 'application/json' }
      }).catch((e: any) => console.warn('Failed to write R2 snapshot:', e))
    )
  }

  return c.json(payload)
  } catch (e: any) {
    console.error('Portal unlock error:', e)
    const isD1Limit = String(e?.message || '').includes('daily row read limit')
    const userMsg = isD1Limit
      ? 'Cloudflare D1 daily limit reached (5M rows). Edge caching is active — will reset at 12:00 AM UTC.'
      : ('Portal unlock failed: ' + (e?.message || String(e)))
    return err(c, 500, userMsg, isD1Limit ? 'D1_QUOTA_EXCEEDED' : 'SERVER_ERROR')
  }
})

export default app

