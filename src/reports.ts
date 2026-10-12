import type { D1Database } from '@cloudflare/workers-types'

// ---------------------------------------------------------------------------
// Owner dashboard report queries
// ---------------------------------------------------------------------------

const n = (v: number | null | undefined) => v ?? 0

export interface BranchSummary {
  store_id: string
  branch_name: string
  last_sale_at: string | null
  last_sync_at: string | null
  total_sales_c: number
  cash_c: number
  gcash_c: number
  maya_c: number
  utang_c: number
  transaction_count: number
}

export interface OverallSummary {
  total_sales_c: number
  cash_c: number
  gcash_c: number
  maya_c: number
  utang_c: number
  transaction_count: number
  branches: BranchSummary[]
}

/** All-branches summary for the date range */
export async function getOverallSummary(
  db: D1Database,
  ownerUserId: number,
  from: string,
  to: string
): Promise<OverallSummary> {
  const startDate = from <= to ? from : to
  const endDate = from <= to ? to : from

  // Get stores owned by this user
  const stores = await db.prepare(
    `SELECT id, branch_name,
            COALESCE(last_sale_at, (SELECT MAX(sold_at) FROM sales WHERE LOWER(store_id) = LOWER(stores.id))) AS last_sale_at,
            last_sync_at
     FROM stores
     WHERE owner_user_id = ?
        OR LOWER(id) IN (SELECT LOWER(store_id) FROM store_owners WHERE owner_user_id = ?)`
  ).bind(ownerUserId, ownerUserId).all<{ id: string; branch_name: string; last_sale_at: string | null; last_sync_at: string | null }>()

  if (!stores.results.length) {
    return { total_sales_c: 0, cash_c: 0, gcash_c: 0, maya_c: 0, utang_c: 0, transaction_count: 0, branches: [] }
  }

  const storeIds = stores.results.map((s) => s.id.trim().toLowerCase())
  const placeholders = storeIds.map(() => '?').join(',')

  // Aggregate per store using substr(sold_at, 1, 10) for robust cross-format matching
  const perStore = await db.prepare(
    `SELECT LOWER(store_id) AS store_id,
       SUM(total_c) AS total_sales_c,
       SUM(cash_c)  AS cash_c,
       SUM(gcash_c) AS gcash_c,
       SUM(maya_c)  AS maya_c,
       SUM(utang_c) AS utang_c,
       COUNT(*)     AS transaction_count
     FROM sales
     WHERE LOWER(store_id) IN (${placeholders})
       AND status = 'COMPLETED'
       AND substr(sold_at, 1, 10) BETWEEN ? AND ?
     GROUP BY LOWER(store_id)`
  ).bind(...storeIds, startDate, endDate).all<{
    store_id: string; total_sales_c: number | null; cash_c: number | null;
    gcash_c: number | null; maya_c: number | null; utang_c: number | null; transaction_count: number | null
  }>()

  const byStore = new Map(perStore.results.map((r) => [r.store_id.toLowerCase(), r]))

  const branches: BranchSummary[] = stores.results.map((s) => {
    const sId = s.id.trim().toLowerCase()
    const r = byStore.get(sId)
    return {
      store_id: sId,
      branch_name: s.branch_name,
      last_sale_at: s.last_sale_at,
      last_sync_at: s.last_sync_at,
      total_sales_c: n(r?.total_sales_c),
      cash_c: n(r?.cash_c),
      gcash_c: n(r?.gcash_c),
      maya_c: n(r?.maya_c),
      utang_c: n(r?.utang_c),
      transaction_count: n(r?.transaction_count),
    }
  })

  return {
    total_sales_c: branches.reduce((s, b) => s + b.total_sales_c, 0),
    cash_c: branches.reduce((s, b) => s + b.cash_c, 0),
    gcash_c: branches.reduce((s, b) => s + b.gcash_c, 0),
    maya_c: branches.reduce((s, b) => s + b.maya_c, 0),
    utang_c: branches.reduce((s, b) => s + b.utang_c, 0),
    transaction_count: branches.reduce((s, b) => s + b.transaction_count, 0),
    branches,
  }
}

/** Per-branch detail: recent sales + stock movements + shift history */
export async function getBranchDetail(
  db: D1Database,
  ownerUserId: number,
  storeId: string,
  from: string,
  to: string
) {
  const normStoreId = storeId.trim().toLowerCase()
  const startDate = from <= to ? from : to
  const endDate = from <= to ? to : from

  // Verify ownership
  const store = await db.prepare(
    `SELECT id, branch_name,
            COALESCE(last_sale_at, (SELECT MAX(sold_at) FROM sales WHERE LOWER(store_id) = LOWER(stores.id))) AS last_sale_at,
            last_sync_at
     FROM stores
     WHERE LOWER(id) = ? AND (
       owner_user_id = ?
       OR LOWER(id) IN (SELECT LOWER(store_id) FROM store_owners WHERE owner_user_id = ?)
     )`
  ).bind(normStoreId, ownerUserId, ownerUserId).first<{ id: string; branch_name: string; last_sale_at: string | null; last_sync_at: string | null }>()
  if (!store) return null

  store.id = store.id.trim().toLowerCase()

  // Period Financials: exact aggregate query across entire date range (prevents LIMIT truncation)
  const periodFinancials = await db.prepare(
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
  ).bind(normStoreId, startDate, endDate).first<{
    total_sales_c: number
    cash_c: number
    gcash_c: number
    maya_c: number
    utang_c: number
    transaction_count: number
    void_count: number
    void_total_c: number
  }>()

  // Recent sales (up to 300) — filtered by day substring
  const sales = await db.prepare(
    `SELECT s.id, s.transaction_no, s.cashier_name, s.customer_name,
            s.total_c, s.cash_c, s.gcash_c, s.maya_c, s.utang_c,
            s.status, s.sold_at,
            GROUP_CONCAT(si.product_name || ' ×' || si.qty, ', ') AS items_summary
     FROM sales s
     LEFT JOIN sale_items si ON si.sale_id = s.id
     WHERE LOWER(s.store_id) = ? AND substr(s.sold_at, 1, 10) BETWEEN ? AND ?
     GROUP BY s.id
     ORDER BY s.sold_at DESC LIMIT 300`
  ).bind(normStoreId, startDate, endDate).all<{
    id: number; transaction_no: string; cashier_name: string | null; customer_name: string | null;
    total_c: number; cash_c: number; gcash_c: number; maya_c: number; utang_c: number;
    status: string; sold_at: string; items_summary: string | null
  }>()

  // Stock movements (max 200) — filtered by day substring
  const stockMovements = await db.prepare(
    `SELECT product_name, movement_type, quantity_change, quantity_before, quantity_after,
            unit, reference, reason, moved_at
     FROM stock_movements
     WHERE LOWER(store_id) = ? AND substr(moved_at, 1, 10) BETWEEN ? AND ?
     ORDER BY moved_at DESC LIMIT 200`
  ).bind(normStoreId, startDate, endDate).all<{
    product_name: string; movement_type: string; quantity_change: number;
    quantity_before: number; quantity_after: number; unit: string;
    reference: string | null; reason: string | null; moved_at: string
  }>()

  // Shift history
  const shifts = await db.prepare(
    `SELECT cashier_name, shift_date, opened_at, closed_at,
            gross_sales_c, cash_c, gcash_c, maya_c, utang_c,
            refund_total_c, void_count, transaction_count, expenses_c, net_sales_c
     FROM shift_snapshots
     WHERE LOWER(store_id) = ? AND substr(shift_date, 1, 10) BETWEEN ? AND ?
     ORDER BY shift_date DESC, closed_at DESC LIMIT 50`
  ).bind(normStoreId, startDate, endDate).all<{
    cashier_name: string; shift_date: string; opened_at: string; closed_at: string;
    gross_sales_c: number; cash_c: number; gcash_c: number; maya_c: number; utang_c: number;
    refund_total_c: number; void_count: number; transaction_count: number;
    expenses_c: number; net_sales_c: number
  }>()

  // Top products in range
  const topProducts = await db.prepare(
    `SELECT si.product_name,
            SUM(si.qty) AS total_qty,
            SUM(si.subtotal_c) AS total_c,
            COUNT(DISTINCT s.id) AS sale_count
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE LOWER(s.store_id) = ? AND s.status = 'COMPLETED' AND substr(s.sold_at, 1, 10) BETWEEN ? AND ?
     GROUP BY si.product_name
     ORDER BY total_c DESC LIMIT 10`
  ).bind(normStoreId, startDate, endDate).all<{
    product_name: string; total_qty: number; total_c: number; sale_count: number
  }>()

  // Daily totals for chart
  const dailyTotals = await db.prepare(
    `SELECT substr(sold_at, 1, 10) AS day,
            SUM(total_c) AS total_c,
            COUNT(*) AS count
     FROM sales
     WHERE LOWER(store_id) = ? AND status = 'COMPLETED' AND substr(sold_at, 1, 10) BETWEEN ? AND ?
     GROUP BY day ORDER BY day`
  ).bind(normStoreId, startDate, endDate).all<{ day: string; total_c: number; count: number }>()

  // Hourly velocity totals for peak rush hour heatmap
  const hourlyTotals = await db.prepare(
    `SELECT CAST(substr(sold_at, 12, 2) AS INTEGER) AS hour,
            SUM(total_c) AS total_c,
            COUNT(*) AS count
     FROM sales
     WHERE LOWER(store_id) = ? AND status = 'COMPLETED' AND substr(sold_at, 1, 10) BETWEEN ? AND ?
     GROUP BY hour ORDER BY hour`
  ).bind(normStoreId, startDate, endDate).all<{ hour: number; total_c: number; count: number }>()

  // Latest stock status for low stock alert radar (qty <= 10)
  const lowStockItems = await db.prepare(
    `SELECT sm.product_name, sm.unit, sm.quantity_after, sm.moved_at
     FROM stock_movements sm
     INNER JOIN (
       SELECT product_name, MAX(moved_at) as max_moved
       FROM stock_movements
       WHERE LOWER(store_id) = ?
       GROUP BY product_name
     ) latest ON sm.product_name = latest.product_name AND sm.moved_at = latest.max_moved
     WHERE LOWER(sm.store_id) = ? AND sm.quantity_after <= 10
     GROUP BY sm.product_name
     ORDER BY sm.quantity_after ASC
     LIMIT 40`
  ).bind(normStoreId, normStoreId).all<{ product_name: string; unit: string; quantity_after: number; moved_at: string }>()

  return {
    from: startDate,
    to: endDate,
    store,
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
    sales: sales.results,
    stockMovements: stockMovements.results,
    shifts: shifts.results,
    topProducts: topProducts.results,
    dailyTotals: dailyTotals.results,
    hourlyTotals: hourlyTotals.results,
    lowStockItems: lowStockItems.results,
  }
}

/** List all stores linked to this owner */
export async function getLinkedBranches(db: D1Database, ownerUserId: number) {
  return db.prepare(
    `SELECT id, branch_name,
            COALESCE(last_sale_at, (SELECT MAX(sold_at) FROM sales WHERE LOWER(store_id) = LOWER(stores.id))) AS last_sale_at,
            last_sync_at, created_at
     FROM stores
     WHERE owner_user_id = ?
        OR LOWER(id) IN (SELECT LOWER(store_id) FROM store_owners WHERE owner_user_id = ?)
     ORDER BY branch_name`
  ).bind(ownerUserId, ownerUserId).all<{ id: string; branch_name: string; last_sale_at: string | null; last_sync_at: string | null; created_at: string }>()
}
