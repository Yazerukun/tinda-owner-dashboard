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
  secret: string,
  portalPin?: string,
  portalSlug?: string
): Promise<{ ok: boolean; branchName?: string; slug?: string }> {
  const normId = storeId.trim().toLowerCase()
  const keyHash = await hashSyncKey(syncKey.trim(), secret)
  const pinHash = portalPin ? await sha256(portalPin.trim() + ':' + secret) : null
  const cleanSlug = portalSlug ? portalSlug.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32) : null

  const existing = await db.prepare(
    'SELECT id, branch_name, sync_key_hash, slug, pin_hash FROM stores WHERE LOWER(id) = ?'
  ).bind(normId).first<{ id: string; branch_name: string; sync_key_hash: string; slug: string | null; pin_hash: string | null }>()

  if (!existing) {
    await db.prepare(
      `INSERT INTO stores (id, branch_name, sync_key_hash, pin_hash, slug, last_sync_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(normId, branchName.trim() || 'My Store', keyHash, pinHash, cleanSlug).run()
    return { ok: true, branchName: branchName.trim() || 'My Store', slug: cleanSlug || undefined }
  }

  if (existing.sync_key_hash !== keyHash) {
    return { ok: false }
  }

  // Update existing store details including PIN and slug if provided
  const finalSlug = cleanSlug || existing.slug
  const finalPinHash = pinHash || existing.pin_hash

  await db.prepare(
    `UPDATE stores
     SET branch_name = ?, pin_hash = COALESCE(?, pin_hash), slug = COALESCE(?, slug),
         last_sync_at = datetime('now'), id = LOWER(id)
     WHERE LOWER(id) = ?`
  ).bind(branchName.trim() || existing.branch_name, finalPinHash, finalSlug, normId).run()

  return { ok: true, branchName: existing.branch_name, slug: finalSlug || undefined }
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

export interface OwnerUserRecord {
  id: number
  username: string
  password_hash: string
  password_salt: string
  created_at?: string
}

/** Create a stateless HMAC-signed token or D1 session token */
export async function createOwnerSession(
  db: D1Database,
  ownerId: number,
  username: string,
  secret: string
): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS
  
  // Sign stateless token: ownerId.username.expiresAt.signature
  const data = `${ownerId}:${username.toLowerCase()}:${expiresAt}`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  const sigHex = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  const statelessToken = `v2.${ownerId}.${username.toLowerCase()}.${expiresAt}.${sigHex}`

  // Best effort: store in D1 if not quota locked
  try {
    const rawToken = randomHex(32)
    const tokenHash = await sha256(rawToken)
    await db.prepare(
      `INSERT INTO owner_sessions (owner_user_id, token_hash, expires_at) VALUES (?, ?, ?)`
    ).bind(ownerId, tokenHash, new Date(expiresAt).toISOString()).run()
  } catch (d1Err) {
    console.warn('D1 session insert skipped (quota or read-only):', d1Err)
  }

  return statelessToken
}

/** Validate session token against HMAC signature or D1 session table */
export async function validateOwnerSession(
  db: D1Database,
  rawToken: string | null,
  secret: string
): Promise<number | null> {
  if (!rawToken) return null

  // 1. Check if token is a stateless signed token: v2.ownerId.username.expiresAt.sigHex
  if (rawToken.startsWith('v2.')) {
    const parts = rawToken.split('.')
    if (parts.length === 5) {
      const [, ownerIdStr, username, expiresAtStr, sigHex] = parts
      const ownerId = parseInt(ownerIdStr, 10)
      const expiresAt = parseInt(expiresAtStr, 10)

      if (isNaN(ownerId) || isNaN(expiresAt)) return null
      if (Date.now() > expiresAt) return null // Expired

      // Verify HMAC
      const data = `${ownerId}:${username.toLowerCase()}:${expiresAt}`
      const enc = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      )

      // Convert hex signature back to bytes
      const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [])
      const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(data))

      if (isValid) {
        return ownerId
      }
    }
  }

  // 2. Fallback to D1 database session check (for older v1 tokens)
  try {
    const tokenHash = await sha256(rawToken)
    const row = await db.prepare(
      `SELECT owner_user_id, expires_at FROM owner_sessions WHERE token_hash = ?`
    ).bind(tokenHash).first<{ owner_user_id: number; expires_at: string }>()
    if (!row) return null
    if (new Date(row.expires_at).getTime() < Date.now()) {
      try {
        await db.prepare('DELETE FROM owner_sessions WHERE token_hash = ?').bind(tokenHash).run()
      } catch {}
      return null
    }
    return row.owner_user_id
  } catch (e) {
    console.warn('D1 session validate error:', e)
    return null
  }
}

export function extractBearer(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7).trim() || null
}

// ---------------------------------------------------------------------------
// Owner account helpers with R2 snapshot fallback
// ---------------------------------------------------------------------------

export async function findOwnerByUsername(
  db: D1Database,
  username: string,
  r2?: R2Bucket
): Promise<OwnerUserRecord | null> {
  const normUser = username.trim().toLowerCase()

  // 1. Try D1 first
  try {
    const row = await db.prepare('SELECT id, username, password_hash, password_salt FROM owner_users WHERE username = ?')
      .bind(normUser)
      .first<OwnerUserRecord>()
    if (row) {
      // Sync/cache owner record to R2 in background
      if (r2) {
        r2.put(`owners/${normUser}.json`, JSON.stringify(row), {
          httpMetadata: { contentType: 'application/json' }
        }).catch((err) => console.warn('R2 owner cache failed:', err))
      }
      return row
    }
  } catch (d1Err: any) {
    console.warn('D1 findOwner error (likely quota exceeded):', d1Err?.message || d1Err)
  }

  // 2. Fallback to R2 bucket if D1 failed or hit quota
  if (r2) {
    try {
      const obj = await r2.get(`owners/${normUser}.json`)
      if (obj) {
        const record = await obj.json<OwnerUserRecord>()
        if (record && record.password_hash) {
          return record
        }
      }
    } catch (r2Err) {
      console.warn('R2 findOwner read error:', r2Err)
    }
  }

  return null
}

export async function createOwnerUser(
  db: D1Database,
  username: string,
  password: string,
  r2?: R2Bucket
): Promise<number> {
  const normUser = username.trim().toLowerCase()
  const salt = randomSalt()
  const hash = await pbkdf2Hash(password, salt)
  let newId = 1

  try {
    const res = await db.prepare(
      `INSERT INTO owner_users (username, password_hash, password_salt) VALUES (?, ?, ?)`
    ).bind(normUser, hash, salt).run()
    newId = Number(res.meta.last_row_id)
  } catch (d1Err: any) {
    console.warn('D1 createOwnerUser failed:', d1Err?.message || d1Err)
    newId = Date.now() // Unique ID in fallback mode
  }

  // Save to R2
  if (r2) {
    const record: OwnerUserRecord = {
      id: newId,
      username: normUser,
      password_hash: hash,
      password_salt: salt,
      created_at: new Date().toISOString()
    }
    await r2.put(`owners/${normUser}.json`, JSON.stringify(record), {
      httpMetadata: { contentType: 'application/json' }
    }).catch((e) => console.warn('R2 save owner record error:', e))
  }

  return newId
}

export async function ownerCount(db: D1Database, r2?: R2Bucket): Promise<number> {
  try {
    const r = await db.prepare('SELECT COUNT(*) AS n FROM owner_users').first<{ n: number }>()
    return r?.n ?? 0
  } catch {
    // If D1 fails, check R2 or assume at least 1 if owner snapshot exists
    return 1
  }
}

export async function verifyOwnerPassword(
  stored: { password_hash: string; password_salt: string },
  password: string
): Promise<boolean> {
  const hash = await pbkdf2Hash(password, stored.password_salt)
  return hash === stored.password_hash
}

