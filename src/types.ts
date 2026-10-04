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
  from: string
  to: string
  total_sales_c: number
  cash_c: number
  gcash_c: number
  maya_c: number
  utang_c: number
  transaction_count: number
  branches: BranchSummary[]
}

export interface SaleRow {
  id: number
  transaction_no: string
  cashier_name: string | null
  customer_name: string | null
  total_c: number
  cash_c: number
  gcash_c: number
  maya_c: number
  utang_c: number
  status: string
  sold_at: string
  items_summary: string | null
}

export interface StockMovementRow {
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

export interface ShiftRow {
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

export interface TopProductRow {
  product_name: string
  total_qty: number
  total_c: number
  sale_count: number
}

export interface DailyTotalRow {
  day: string
  total_c: number
  count: number
}

export interface HourlyTotalRow {
  hour: number
  total_c: number
  count: number
}

export interface LowStockItemRow {
  product_name: string
  unit: string
  quantity_after: number
  moved_at: string
}

export interface BranchDetailResponse {
  from: string
  to: string
  store: {
    id: string
    branch_name: string
    last_sale_at: string | null
    last_sync_at: string | null
  }
  sales: SaleRow[]
  stockMovements: StockMovementRow[]
  shifts: ShiftRow[]
  topProducts: TopProductRow[]
  dailyTotals: DailyTotalRow[]
  hourlyTotals?: HourlyTotalRow[]
  lowStockItems?: LowStockItemRow[]
}

export interface LiveAnnouncement {
  id: string
  title: string
  message: string
  author: string
  version_target: string | null
  is_pinned: number
  created_at: string
}

export interface GlobalChatMessage {
  id: string
  store_id: string
  store_name: string
  sender_name: string
  role: string
  text: string
  is_dev: number
  is_vip: number
  created_at: string
}
