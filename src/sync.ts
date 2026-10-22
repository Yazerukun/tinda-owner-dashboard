import type { D1Database } from '@cloudflare/workers-types'
import { SUPABASE_CONFIG } from './auth'

// ---------------------------------------------------------------------------
// Sync handlers — process incoming events from TINDA-POS
// ---------------------------------------------------------------------------

export interface SalePayload {
  local_sale_id: number
  transaction_no: string
  cashier_name: string | null
  customer_name: string | null
  subtotal_c: number
  discount_c: number
  total_c: number
  status: string
  cash_c: number
  gcash_c: number
  maya_c: number
  utang_c: number
  local_shift_id: number | null
  sold_at: string
  items: {
    product_name: string
    unit_name: string
    qty: number
    unit_price_c: number
    subtotal_c: number
  }[]
}

export interface StockPayload {
  local_movement_id: number
  product_name: string
  movement_type: string
  quantity_change: number
  quantity_before: number
  quantity_after: number
  unit: string
  reference: string | null
  reason: string | null
  moved_at: string
}

export interface ShiftPayload {
  local_shift_id: number
  cashier_name: string
  shift_date: string
  opened_at: string
  closed_at: string
  gross_sales_c: number
  cash_c: number
  gcash_c: number
  maya_c: number
  utang_c: number
  refund_total_c: number
  void_count: number
  transaction_count: number
  expenses_c: number
  net_sales_c: number
}

export async function syncSaleToSupabase(storeId: string, p: SalePayload): Promise<void> {
  const normId = storeId.trim().toLowerCase()
  const supaHeaders = {
    apikey: SUPABASE_CONFIG.anonKey,
    Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation'
  }

  const saleRes = await fetch(
    `${SUPABASE_CONFIG.url}/rest/v1/sales?on_conflict=store_id,local_sale_id`,
    {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify({
        store_id: normId,
        local_sale_id: p.local_sale_id,
        transaction_no: p.transaction_no,
        cashier_name: p.cashier_name || null,
        customer_name: p.customer_name || null,
        subtotal_c: p.subtotal_c || 0,
        discount_c: p.discount_c || 0,
        total_c: p.total_c || 0,
        status: p.status || 'COMPLETED',
        cash_c: p.cash_c || 0,
        gcash_c: p.gcash_c || 0,
        maya_c: p.maya_c || 0,
        utang_c: p.utang_c || 0,
        local_shift_id: p.local_shift_id || null,
        sold_at: p.sold_at || new Date().toISOString(),
        synced_at: new Date().toISOString()
      })
    }
  )

  if (saleRes.ok && Array.isArray(p.items) && p.items.length > 0) {
    const inserted = (await saleRes.json().catch(() => [])) as Array<{ id: number }>
    const saleId = inserted?.[0]?.id
    if (saleId) {
      await fetch(`${SUPABASE_CONFIG.url}/rest/v1/sale_items`, {
        method: 'POST',
        headers: { ...supaHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(
          p.items.map((it) => ({
            sale_id: saleId,
            product_name: it.product_name,
            unit_name: it.unit_name || 'piece',
            qty: it.qty || 1,
            unit_price_c: it.unit_price_c || 0,
            subtotal_c: it.subtotal_c || 0
          }))
        )
      }).catch(() => {})
    }
  }

  // Update store last_sale_at & last_sync_at in Supabase
  await fetch(`${SUPABASE_CONFIG.url}/rest/v1/stores?id=eq.${encodeURIComponent(normId)}`, {
    method: 'PATCH',
    headers: { ...supaHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      last_sale_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString()
    })
  }).catch(() => {})
}

export async function syncSale(db: D1Database, storeId: string, p: SalePayload): Promise<void> {
  const normId = storeId.trim().toLowerCase()
  
  // 1. Try D1 Write
  try {
    const res = await db.prepare(
      `INSERT INTO sales
         (store_id, local_sale_id, transaction_no, cashier_name, customer_name,
          subtotal_c, discount_c, total_c, status,
          cash_c, gcash_c, maya_c, utang_c, local_shift_id, sold_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(store_id, local_sale_id) DO UPDATE SET
         status = excluded.status,
         total_c = excluded.total_c,
         cash_c = excluded.cash_c,
         gcash_c = excluded.gcash_c,
         maya_c = excluded.maya_c,
         utang_c = excluded.utang_c,
         synced_at = datetime('now')`
    ).bind(
      normId, p.local_sale_id, p.transaction_no, p.cashier_name ?? null,
      p.customer_name ?? null, p.subtotal_c, p.discount_c, p.total_c, p.status,
      p.cash_c, p.gcash_c, p.maya_c, p.utang_c, p.local_shift_id ?? null, p.sold_at
    ).run()

    const saleId = Number(res.meta.last_row_id)
    if (saleId > 0 && p.items?.length) {
      const stmts = p.items.map((it) =>
        db.prepare(
          `INSERT INTO sale_items (sale_id, product_name, unit_name, qty, unit_price_c, subtotal_c)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(saleId, it.product_name, it.unit_name, it.qty, it.unit_price_c, it.subtotal_c)
      )
      await db.batch(stmts)
    }

    await db.prepare(
      `UPDATE stores SET last_sale_at = datetime('now'), last_sync_at = datetime('now') WHERE LOWER(id) = ?`
    ).bind(normId).run()
  } catch (d1Err) {
    console.warn('[SyncSale] D1 write error (quota limit or network), continuing to Supabase:', d1Err)
  }

  // 2. High-Availability Mirror to Supabase (always ensures real-time cloud dashboard visibility)
  await syncSaleToSupabase(normId, p).catch((e) => console.warn('[SyncSale] Supabase mirror error:', e))
}

export async function syncStock(db: D1Database, storeId: string, p: StockPayload): Promise<void> {
  const normId = storeId.trim().toLowerCase()
  try {
    await db.prepare(
      `INSERT INTO stock_movements
         (store_id, local_movement_id, product_name, movement_type,
          quantity_change, quantity_before, quantity_after, unit,
          reference, reason, moved_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(store_id, local_movement_id) DO NOTHING`
    ).bind(
      normId, p.local_movement_id, p.product_name, p.movement_type,
      p.quantity_change, p.quantity_before, p.quantity_after, p.unit,
      p.reference ?? null, p.reason ?? null, p.moved_at
    ).run()

    await db.prepare(
      `UPDATE stores SET last_sync_at = datetime('now') WHERE LOWER(id) = ?`
    ).bind(normId).run()
  } catch (d1Err) {
    console.warn('[SyncStock] D1 write error:', d1Err)
  }

  // Mirror to Supabase
  try {
    const supaHeaders = {
      apikey: SUPABASE_CONFIG.anonKey,
      Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    }
    await fetch(`${SUPABASE_CONFIG.url}/rest/v1/stock_movements?on_conflict=store_id,local_movement_id`, {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify({
        store_id: normId,
        local_movement_id: p.local_movement_id,
        product_name: p.product_name,
        movement_type: p.movement_type,
        quantity_change: p.quantity_change,
        quantity_before: p.quantity_before,
        quantity_after: p.quantity_after,
        unit: p.unit || 'piece',
        reference: p.reference || null,
        reason: p.reason || null,
        moved_at: p.moved_at || new Date().toISOString(),
        synced_at: new Date().toISOString()
      })
    })
  } catch {}
}

export async function syncShift(db: D1Database, storeId: string, p: ShiftPayload): Promise<void> {
  const normId = storeId.trim().toLowerCase()
  try {
    await db.prepare(
      `INSERT INTO shift_snapshots
         (store_id, local_shift_id, cashier_name, shift_date, opened_at, closed_at,
          gross_sales_c, cash_c, gcash_c, maya_c, utang_c,
          refund_total_c, void_count, transaction_count, expenses_c, net_sales_c)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(store_id, local_shift_id) DO UPDATE SET
         net_sales_c = excluded.net_sales_c,
         synced_at = datetime('now')`
    ).bind(
      normId, p.local_shift_id, p.cashier_name, p.shift_date, p.opened_at, p.closed_at,
      p.gross_sales_c, p.cash_c, p.gcash_c, p.maya_c, p.utang_c,
      p.refund_total_c, p.void_count, p.transaction_count, p.expenses_c, p.net_sales_c
    ).run()

    await db.prepare(
      `UPDATE stores SET last_sync_at = datetime('now') WHERE LOWER(id) = ?`
    ).bind(normId).run()
  } catch (d1Err) {
    console.warn('[SyncShift] D1 write error:', d1Err)
  }

  // Mirror to Supabase
  try {
    const supaHeaders = {
      apikey: SUPABASE_CONFIG.anonKey,
      Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    }
    await fetch(`${SUPABASE_CONFIG.url}/rest/v1/shift_snapshots?on_conflict=store_id,local_shift_id`, {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify({
        store_id: normId,
        local_shift_id: p.local_shift_id,
        cashier_name: p.cashier_name,
        shift_date: p.shift_date,
        opened_at: p.opened_at,
        closed_at: p.closed_at,
        gross_sales_c: p.gross_sales_c || 0,
        cash_c: p.cash_c || 0,
        gcash_c: p.gcash_c || 0,
        maya_c: p.maya_c || 0,
        utang_c: p.utang_c || 0,
        refund_total_c: p.refund_total_c || 0,
        void_count: p.void_count || 0,
        transaction_count: p.transaction_count || 0,
        expenses_c: p.expenses_c || 0,
        net_sales_c: p.net_sales_c || 0,
        synced_at: new Date().toISOString()
      })
    })
  } catch {}
}
