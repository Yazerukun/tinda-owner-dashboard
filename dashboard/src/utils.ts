import type { SaleRow, ShiftRow } from './types'
import { formatPesos } from './api'

/**
 * Trigger subtle physical tactile haptics on mobile devices
 */
export function triggerHaptic(type: 'light' | 'medium' | 'success' = 'light') {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (type === 'light') navigator.vibrate(8)
      else if (type === 'medium') navigator.vibrate(15)
      else if (type === 'success') navigator.vibrate([10, 30, 10])
    } catch {
      // Ignore vibration errors if not supported
    }
  }
}

/**
 * Download a CSV file generated in memory
 */
function downloadCsv(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.setAttribute('download', filename)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Export Sales Transactions to CSV
 */
export function exportSalesToCsv(sales: SaleRow[], branchName: string, dateRange: string) {
  const headers = [
    'Transaction No',
    'Date & Time',
    'Cashier',
    'Customer',
    'Items Summary',
    'Cash (PHP)',
    'GCash (PHP)',
    'Maya (PHP)',
    'Utang (PHP)',
    'Total Amount (PHP)',
    'Status'
  ]

  const rows = sales.map((s) => [
    `"${s.transaction_no}"`,
    `"${s.sold_at}"`,
    `"${s.cashier_name || 'Cashier'}"`,
    `"${s.customer_name || ''}"`,
    `"${(s.items_summary || '').replace(/"/g, '""')}"`,
    (s.cash_c / 100).toFixed(2),
    (s.gcash_c / 100).toFixed(2),
    (s.maya_c / 100).toFixed(2),
    (s.utang_c / 100).toFixed(2),
    (s.total_c / 100).toFixed(2),
    `"${s.status}"`
  ])

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
  const cleanBranch = branchName.replace(/[^a-zA-Z0-9]/g, '_')
  downloadCsv(csv, `TINDA_Sales_${cleanBranch}_${dateRange}.csv`)
}

/**
 * Export Cashier Shift Closings to CSV
 */
export function exportShiftsToCsv(shifts: ShiftRow[], branchName: string, dateRange: string) {
  const headers = [
    'Cashier',
    'Shift Date',
    'Opened At',
    'Closed At',
    'Transactions',
    'Gross Sales (PHP)',
    'Cash (PHP)',
    'GCash (PHP)',
    'Maya (PHP)',
    'Utang (PHP)',
    'Expenses (PHP)',
    'Net Sales (PHP)',
    'Void Count',
    'Refund Total (PHP)'
  ]

  const rows = shifts.map((s) => [
    `"${s.cashier_name}"`,
    `"${s.shift_date}"`,
    `"${s.opened_at}"`,
    `"${s.closed_at}"`,
    s.transaction_count,
    (s.gross_sales_c / 100).toFixed(2),
    (s.cash_c / 100).toFixed(2),
    (s.gcash_c / 100).toFixed(2),
    (s.maya_c / 100).toFixed(2),
    (s.utang_c / 100).toFixed(2),
    (s.expenses_c / 100).toFixed(2),
    (s.net_sales_c / 100).toFixed(2),
    s.void_count,
    (s.refund_total_c / 100).toFixed(2)
  ])

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
  const cleanBranch = branchName.replace(/[^a-zA-Z0-9]/g, '_')
  downloadCsv(csv, `TINDA_Shifts_${cleanBranch}_${dateRange}.csv`)
}
