import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env'
import {
  validateSyncKey, ensureStore, extractBearer,
  createOwnerSession, validateOwnerSession,
  findOwnerByUsername, createOwnerUser, ownerCount, verifyOwnerPassword,
  hashSyncKey, authenticateOrRegisterStore
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ok = (c: any, data: unknown) =>
  c.json({ ok: true, ...((typeof data === 'object' && data !== null) ? data : { data }) })

const err = (c: any, status: number, message: string, code = 'ERROR') =>
  c.json({ ok: false, error: message, code }, status)

function dayQ(v: string | undefined): string {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  return new Date().toISOString().slice(0, 10)
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

  const existing = await findOwnerByUsername(c.env.DB, String(username))
  if (existing) {
    return err(c, 409, 'Username already taken. Please choose another username or sign in.', 'USERNAME_TAKEN')
  }

  const ownerId = await createOwnerUser(c.env.DB, String(username), String(password))
  const token = await createOwnerSession(c.env.DB, ownerId)
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

  const owner = await findOwnerByUsername(c.env.DB, String(username))
  if (!owner) return err(c, 401, 'Invalid username or password.', 'INVALID_CREDENTIALS')

  const valid = await verifyOwnerPassword(owner, String(password))
  if (!valid) return err(c, 401, 'Invalid username or password.', 'INVALID_CREDENTIALS')

  const token = await createOwnerSession(c.env.DB, owner.id)
  return c.json({ ok: true, token, expiresIn: 86400 })
})

// ---------------------------------------------------------------------------
// Owner Dashboard Endpoints (require valid owner session token)
// ---------------------------------------------------------------------------

async function requireOwner(c: any, next: () => Promise<void>) {
  const token = extractBearer(c.req.header('Authorization'))
  const ownerId = await validateOwnerSession(c.env.DB, token)
  if (!ownerId) return err(c, 401, 'Session expired. Please login again.', 'SESSION_EXPIRED')
  c.set('owner_id', ownerId)
  await next()
}

/** GET /api/owner/summary?from=YYYY-MM-DD&to=YYYY-MM-DD */
app.get('/api/owner/summary', requireOwner, async (c) => {
  const ownerId: number = c.get('owner_id')
  const from = dayQ(c.req.query('from'))
  const to = dayQ(c.req.query('to'))
  const summary = await getOverallSummary(c.env.DB, ownerId, from, to)
  return c.json({ ok: true, from, to, ...summary })
})

/** GET /api/owner/branches */
app.get('/api/owner/branches', requireOwner, async (c) => {
  const ownerId: number = c.get('owner_id')
  const branches = await getLinkedBranches(c.env.DB, ownerId)
  return c.json({ ok: true, branches: branches.results })
})

/** GET /api/owner/branch/:store_id?from=YYYY-MM-DD&to=YYYY-MM-DD */
app.get('/api/owner/branch/:store_id', requireOwner, async (c) => {
  const ownerId: number = c.get('owner_id')
  const storeId = String(c.req.param('store_id') ?? '').trim().toLowerCase()
  const from = dayQ(c.req.query('from'))
  const to = dayQ(c.req.query('to'))
  const detail = await getBranchDetail(c.env.DB, ownerId, storeId, from, to)
  if (!detail) return err(c, 404, 'Branch not found or not linked to your account.', 'NOT_FOUND')
  return c.json({ ok: true, from, to, ...detail })
})

/** POST /api/sync/ping & /api/sync/register — ping & auto-register from TINDA-POS desktop */
const handleSyncPing = async (c: any) => {
  let body: any
  try { body = await c.req.json() } catch { return err(c, 400, 'Invalid JSON.', 'BAD_REQUEST') }
  const storeId = String(body.store_id ?? '').trim().toLowerCase()
  const syncKey = String(body.sync_key ?? '').trim()
  const branchName = String(body.branch_name ?? '').trim() || 'My Store'
  if (!storeId || !syncKey) return err(c, 400, 'store_id and sync_key required.', 'BAD_REQUEST')

  const auth = await authenticateOrRegisterStore(c.env.DB, storeId, branchName, syncKey, c.env.SESSION_SECRET)
  if (!auth.ok) return err(c, 401, 'Invalid sync credentials.', 'UNAUTHORIZED')

  return c.json({ ok: true, status: 'connected', store_id: storeId, branch_name: auth.branchName || branchName })
}
app.post('/api/sync/ping', handleSyncPing)
app.post('/api/sync/register', handleSyncPing)

/** POST /api/owner/branch/link — link a TINDA-POS store to owner account */
app.post('/api/owner/branch/link', requireOwner, async (c) => {
  const ownerId: number = c.get('owner_id')
  let body: any
  try { body = await c.req.json() } catch { return err(c, 400, 'Invalid JSON.', 'BAD_REQUEST') }

  const storeId = String(body.store_id ?? '').trim().toLowerCase()
  const syncKey = String(body.sync_key ?? '').trim()
  const branchName = String(body.branch_name ?? '').trim() || 'My Store'

  if (!storeId || !syncKey) return err(c, 400, 'Store ID and Sync Key are required.', 'VALIDATION_ERROR')

  // Check if store already exists in DB
  const existingStore = await c.env.DB.prepare(
    'SELECT id, branch_name, sync_key_hash, owner_user_id FROM stores WHERE LOWER(id) = ?'
  ).bind(storeId).first<{ id: string; branch_name: string; sync_key_hash: string; owner_user_id: number | null }>()

  const expectedKeyHash = await hashSyncKey(syncKey, c.env.SESSION_SECRET)

  if (existingStore) {
    // If store already has a sync key hash, verify it matches
    if (existingStore.sync_key_hash !== expectedKeyHash) {
      if (existingStore.owner_user_id === ownerId) {
        // Owner is updating their existing branch's sync key
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
    // Update owner_user_id to current owner, ensure id is lowercase, and backfill last_sale_at if missing
    await c.env.DB.prepare(
      `UPDATE stores
       SET owner_user_id = ?, id = LOWER(id),
           last_sale_at = COALESCE(last_sale_at, (SELECT MAX(sold_at) FROM sales WHERE LOWER(store_id) = LOWER(stores.id)))
       WHERE LOWER(id) = ?`
    ).bind(ownerId, storeId).run()

    return c.json({ ok: true, message: `Branch "${existingStore.branch_name}" linked successfully!` })
  } else {
    // Store does not exist in Cloudflare D1 yet!
    // Auto-create/pre-register the store associated directly with this owner!
    await c.env.DB.prepare(
      `INSERT INTO stores (id, branch_name, sync_key_hash, owner_user_id, last_sale_at, last_sync_at)
       VALUES (?, ?, ?, ?, (SELECT MAX(sold_at) FROM sales WHERE LOWER(store_id) = LOWER(?)), datetime('now'))`
    ).bind(storeId, branchName, expectedKeyHash, ownerId, storeId).run()

    return c.json({ ok: true, message: `Branch "${branchName}" registered and linked to your account!` })
  }
})

/** DELETE /api/owner/branch/:store_id — unlink a branch */
app.delete('/api/owner/branch/:store_id', requireOwner, async (c) => {
  const ownerId: number = c.get('owner_id')
  const storeId = String(c.req.param('store_id') ?? '').trim().toLowerCase()
  await c.env.DB.prepare(
    `UPDATE stores SET owner_user_id = NULL WHERE LOWER(id) = ? AND owner_user_id = ?`
  ).bind(storeId, ownerId).run()
  return c.json({ ok: true, message: 'Branch unlinked.' })
})

export default app
