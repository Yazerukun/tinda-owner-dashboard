import type { D1Database } from '@cloudflare/workers-types'

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

export async function syncSale(db: D1Database, storeId: string, p: SalePayload): Promise<void> {
  const normId = storeId.trim().toLowerCase()
  // Upsert sale
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

  // Insert items if it's a new sale (last_row_id > 0 means INSERT happened)
  if (saleId > 0 && p.items?.length) {
    const stmts = p.items.map((it) =>
      db.prepare(
        `INSERT INTO sale_items (sale_id, product_name, unit_name, qty, unit_price_c, subtotal_c)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(saleId, it.product_name, it.unit_name, it.qty, it.unit_price_c, it.subtotal_c)
    )
    await db.batch(stmts)
  }

  // Update store last_sale_at & last_sync_at
  await db.prepare(
    `UPDATE stores SET last_sale_at = datetime('now'), last_sync_at = datetime('now') WHERE LOWER(id) = ?`
  ).bind(normId).run()
}

export async function syncStock(db: D1Database, storeId: string, p: StockPayload): Promise<void> {
  const normId = storeId.trim().toLowerCase()
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
}

export async function syncShift(db: D1Database, storeId: string, p: ShiftPayload): Promise<void> {
  const normId = storeId.trim().toLowerCase()
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
}
