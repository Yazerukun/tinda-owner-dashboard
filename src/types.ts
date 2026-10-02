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

export interface SummaryResponse {
  ok: boolean
  from: string
  to: string
  total_sales_c: number
  cash_c: number
  gcash_c: number
  maya_c: number
  utang_c: number
  transaction_count: number
  branches: BranchSummary[]
  error?: string
}

export interface SaleItem {
  product_name: string
  unit_name: string
  qty: number
  unit_price_c: number
  subtotal_c: number
}

export interface SaleRecord {
  id: number
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
  sold_at: string
  created_at: string
  items: SaleItem[]
}

export interface ShiftRecord {
  id: number
  local_shift_id: number
  cashier_name: string | null
  opened_at: string
  closed_at: string | null
  starting_cash_c: number
  expected_cash_c: number
  actual_cash_c: number
  variance_c: number
}

export interface BranchDetailResponse {
  ok: boolean
  branch: BranchSummary
  sales: SaleRecord[]
  shifts: ShiftRecord[]
  error?: string
}
