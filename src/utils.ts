import type { SaleRow, ShiftRow } from './types'
import { formatPesos } from './api'

/**
 * Trigger subtle physical tactile haptics on mobile devices
 */
export function triggerHaptic(type: 'light' | 'medium' | 'success' | 'error' = 'light') {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (type === 'light') navigator.vibrate(8)
      else if (type === 'medium') navigator.vibrate(15)
      else if (type === 'success') navigator.vibrate([10, 30, 10])
      else if (type === 'error') navigator.vibrate([30, 40, 30])
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

/**
 * Return today's date formatted as YYYY-MM-DD in local time
 */
export function getLocalToday(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Add or subtract days from a YYYY-MM-DD string in local time safely
 */
export function addDays(dateStr: string, days: number): string {
  if (!dateStr) return getLocalToday()
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 12, 0, 0)
  dt.setDate(dt.getDate() + days)
  const year = dt.getFullYear()
  const month = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format YYYY-MM-DD into human-readable date, e.g. "Wednesday, October 8, 2026"
 */
export function formatHumanDate(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 12, 0, 0)
  return dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

/**
 * Format a date range into human-readable text
 */
export function formatHumanRange(fromStr: string, toStr: string): string {
  if (!fromStr || !toStr) return ''
  if (fromStr === toStr) return formatHumanDate(fromStr)
  const [y1, m1, d1] = fromStr.split('-').map(Number)
  const [y2, m2, d2] = toStr.split('-').map(Number)
  const dt1 = new Date(y1, m1 - 1, d1, 12, 0, 0)
  const dt2 = new Date(y2, m2 - 1, d2, 12, 0, 0)
  return `${dt1.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${dt2.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

/**
 * Calculate difference in days between target date and today
 */
export function getDaysAgo(dateStr: string, referenceToday?: string): number {
  if (!dateStr) return 0
  const todayStr = referenceToday || getLocalToday()
  const [y1, m1, d1] = dateStr.split('-').map(Number)
  const [y2, m2, d2] = todayStr.split('-').map(Number)
  const dt1 = new Date(y1, m1 - 1, d1, 12, 0, 0).getTime()
  const dt2 = new Date(y2, m2 - 1, d2, 12, 0, 0).getTime()
  return Math.round((dt2 - dt1) / (1000 * 60 * 60 * 24))
}

