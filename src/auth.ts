import type { Env } from './env'

// ---------------------------------------------------------------------------
// Crypto helpers (Web Crypto API — works in CF Workers)
// ---------------------------------------------------------------------------

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function pbkdf2Hash(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100_000, hash: 'SHA-256' },
    key, 256
  )
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomSalt(): string { return randomHex(16) }

/** Hash a sync_key against the Worker secret for storage */
export async function hashSyncKey(syncKey: string, secret: string): Promise<string> {
  return sha256(syncKey + ':' + secret)
}

// ---------------------------------------------------------------------------
// Sync-key auth (TINDA-POS → Worker)
// ---------------------------------------------------------------------------

export async function authenticateOrRegisterStore(
  db: D1Database,
  storeId: string,
  branchName: string,
  syncKey: string,
  secret: string
): Promise<{ ok: boolean; branchName?: string }> {
  const normId = storeId.trim().toLowerCase()
  const keyHash = await hashSyncKey(syncKey.trim(), secret)

  const existing = await db.prepare(
    'SELECT id, branch_name, sync_key_hash FROM stores WHERE LOWER(id) = ?'
  ).bind(normId).first<{ id: string; branch_name: string; sync_key_hash: string }>()

  if (!existing) {
    await db.prepare(
      `INSERT INTO stores (id, branch_name, sync_key_hash, last_sync_at) VALUES (?, ?, ?, datetime('now'))`
    ).bind(normId, branchName.trim() || 'My Store', keyHash).run()
    return { ok: true, branchName: branchName.trim() || 'My Store' }
  }

  if (existing.sync_key_hash !== keyHash) {
    return { ok: false }
  }

  await db.prepare(
    `UPDATE stores SET branch_name = ?, last_sync_at = datetime('now'), id = LOWER(id) WHERE LOWER(id) = ?`
  ).bind(branchName.trim() || existing.branch_name, normId).run()

  return { ok: true, branchName: existing.branch_name }
}

export async function validateSyncKey(
  db: D1Database,
  storeId: string,
  syncKey: string,
  secret: string
): Promise<{ ok: boolean; branchName?: string }> {
  const normId = storeId.trim().toLowerCase()
  const expected = await hashSyncKey(syncKey.trim(), secret)
  const row = await db.prepare('SELECT branch_name FROM stores WHERE LOWER(id) = ? AND sync_key_hash = ?')
    .bind(normId, expected)
    .first<{ branch_name: string }>()
  if (!row) return { ok: false }
  return { ok: true, branchName: row.branch_name }
}

/** Auto-register a store on first sync if it doesn't exist yet */
export async function ensureStore(
  db: D1Database,
  storeId: string,
  branchName: string,
  syncKey: string,
  secret: string
): Promise<void> {
  await authenticateOrRegisterStore(db, storeId, branchName, syncKey, secret)
}

// ---------------------------------------------------------------------------
// Owner session auth (owner browser → Worker)
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function createOwnerSession(db: D1Database, ownerId: number): Promise<string> {
  const rawToken = randomHex(32)
  const tokenHash = await sha256(rawToken)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await db.prepare(
    `INSERT INTO owner_sessions (owner_user_id, token_hash, expires_at) VALUES (?, ?, ?)`
  ).bind(ownerId, tokenHash, expiresAt).run()
  return rawToken
}

export async function validateOwnerSession(
  db: D1Database,
  rawToken: string | null
): Promise<number | null> {
  if (!rawToken) return null
  const tokenHash = await sha256(rawToken)
  const row = await db.prepare(
    `SELECT owner_user_id, expires_at FROM owner_sessions WHERE token_hash = ?`
  ).bind(tokenHash).first<{ owner_user_id: number; expires_at: string }>()
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare('DELETE FROM owner_sessions WHERE token_hash = ?').bind(tokenHash).run()
    return null
  }
  return row.owner_user_id
}

export function extractBearer(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7).trim() || null
}

// ---------------------------------------------------------------------------
// Owner account helpers
// ---------------------------------------------------------------------------

export async function findOwnerByUsername(
  db: D1Database, username: string
): Promise<{ id: number; password_hash: string; password_salt: string } | null> {
  return db.prepare('SELECT id, password_hash, password_salt FROM owner_users WHERE username = ?')
    .bind(username.trim().toLowerCase())
    .first<{ id: number; password_hash: string; password_salt: string }>()
}

export async function createOwnerUser(
  db: D1Database, username: string, password: string
): Promise<number> {
  const salt = randomSalt()
  const hash = await pbkdf2Hash(password, salt)
  const res = await db.prepare(
    `INSERT INTO owner_users (username, password_hash, password_salt) VALUES (?, ?, ?)`
  ).bind(username.trim().toLowerCase(), hash, salt).run()
  return Number(res.meta.last_row_id)
}

export async function ownerCount(db: D1Database): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM owner_users').first<{ n: number }>()
  return r?.n ?? 0
}

export async function verifyOwnerPassword(
  stored: { password_hash: string; password_salt: string },
  password: string
): Promise<boolean> {
  const hash = await pbkdf2Hash(password, stored.password_salt)
  return hash === stored.password_hash
}
