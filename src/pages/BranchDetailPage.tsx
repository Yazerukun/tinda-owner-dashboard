import React, { useEffect, useState, useMemo } from 'react'
import { request, formatPesos, formatDateTime } from '../api'
import type { BranchDetailResponse } from '../types'
import { exportSalesToCsv, exportShiftsToCsv, triggerHaptic } from '../utils'
import { LowStockModal } from './LowStockModal'

interface Props {
  storeId: string
  from: string
  to: string
  onBack: () => void
}

export const BranchDetailPage: React.FC<Props> = ({ storeId, from, to, onBack }) => {
  const [data, setData] = useState<BranchDetailResponse | null>(null)
  const [activeTab, setActiveTab] = useState<'sales' | 'stock' | 'restock' | 'items' | 'shifts'>('sales')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [salesSearch, setSalesSearch] = useState('')
  const [copiedId, setCopiedId] = useState(false)
  const [copiedRestock, setCopiedRestock] = useState(false)
  const [showLowStockModal, setShowLowStockModal] = useState(false)
  const [expandBannerItems, setExpandBannerItems] = useState(false)
  const [restockSearch, setRestockSearch] = useState('')

  const scrollToRestockTable = () => {
    setActiveTab('restock')
    setShowLowStockModal(false)
    setTimeout(() => {
      const el = document.getElementById('restock-table-section')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 80)
  }

  const loadData = async () => {
    try {
      setLoading(true)
      const res = await request<BranchDetailResponse>(`/api/owner/branch/${storeId}?from=${from}&to=${to}`)
      setData(res)
    } catch (err: any) {
      setError(err.message || 'Failed to load branch records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [storeId, from, to])

  const copyStoreId = () => {
    if (!data?.store.id) return
    triggerHaptic('light')
    navigator.clipboard.writeText(data.store.id)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  // Filtered sales
  const filteredSales = useMemo(() => {
    if (!data?.sales) return []
    if (!salesSearch.trim()) return data.sales
    const q = salesSearch.toLowerCase()
    return data.sales.filter(
      (s) =>
        s.transaction_no.toLowerCase().includes(q) ||
        (s.cashier_name && s.cashier_name.toLowerCase().includes(q)) ||
        (s.items_summary && s.items_summary.toLowerCase().includes(q))
    )
  }, [data?.sales, salesSearch])

  // Filter out voided transactions for financial totals & calculations
  const activeSales = useMemo(() => {
    if (!data?.sales) return []
    return data.sales.filter((s) => s.status !== 'VOIDED')
  }, [data?.sales])

  // Calculated totals (Active Sales Only - VOIDED excluded)
  const totalSalesC = useMemo(() => {
    return activeSales.reduce((acc, s) => acc + (s.total_c || 0), 0)
  }, [activeSales])

  // Payment method breakdown (Active Sales Only)
  const tenderMetrics = useMemo(() => {
    return activeSales.reduce(
      (acc, s) => {
        acc.cash += s.cash_c || 0
        acc.gcash += s.gcash_c || 0
        acc.maya += s.maya_c || 0
        acc.utang += s.utang_c || 0
        return acc
      },
      { cash: 0, gcash: 0, maya: 0, utang: 0 }
    )
  }, [activeSales])

  // Daily Trend Max for scaling bars
  const maxDailyC = useMemo(() => {
    if (!data?.dailyTotals || data.dailyTotals.length === 0) return 1
    return Math.max(...data.dailyTotals.map((d) => d.total_c), 1)
  }, [data?.dailyTotals])

  // Hourly Velocity Max for scaling bars
  const maxHourlyC = useMemo(() => {
    if (!data?.hourlyTotals || data.hourlyTotals.length === 0) return 1
    return Math.max(...data.hourlyTotals.map((h) => h.total_c), 1)
  }, [data?.hourlyTotals])

  // Low stock list
  const lowStock = data?.lowStockItems || []

  // Filtered low stock for table/search
  const filteredLowStock = useMemo(() => {
    if (!restockSearch.trim()) return lowStock
    const q = restockSearch.toLowerCase()
    return lowStock.filter((it) => it.product_name.toLowerCase().includes(q))
  }, [lowStock, restockSearch])

  // Copy Restock Order for Supplier
  const handleCopyRestock = () => {
    triggerHaptic('success')
    const storeName = data?.store.branch_name || 'Store'
    const lines = [
      `📦 RESTOCK ORDER - ${storeName.toUpperCase()}`,
      `Date: ${new Date().toLocaleDateString('en-PH')}`,
      `---------------------------------`,
      ...lowStock.map(
        (it, idx) => `${idx + 1}. ${it.product_name} - Remaining: ${it.quantity_after} ${it.unit}`
      ),
      `---------------------------------`,
      `Please confirm order availability and delivery schedule.`
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopiedRestock(true)
    setTimeout(() => setCopiedRestock(false), 2500)
  }

  if (loading && !data) {
    return (
      <div className="empty-state" style={{ minHeight: '60vh', display: 'grid', placeContent: 'center' }}>
        <div className="empty-state-icon">📡</div>
        <h3 className="empty-state-title">Retrieving Live Branch Records</h3>
        <p className="empty-state-desc">Connecting to Cloudflare D1 encrypted sync network...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ padding: '24px 0' }}>
        <button
          onClick={() => {
            triggerHaptic('light')
            onBack()
          }}
          className="btn btn-secondary btn-sm"
          style={{ marginBottom: 16 }}
        >
          ← Back to All Branches
        </button>
        <div className="card" style={{ borderLeft: '4px solid var(--accent-rose)', color: '#fca5a5' }}>
          <strong>Error loading branch:</strong> {error || 'Branch not found or unauthorized'}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Top Breadcrumb & Export Actions Bar */}
      <div className="detail-actions-bar">
        <button
          onClick={() => {
            triggerHaptic('light')
            onBack()
          }}
          className="btn btn-secondary btn-sm"
        >
          ← Back to Branches
        </button>

        <div className="detail-actions-scroll">
          <button
            onClick={() => {
              triggerHaptic('light')
              exportSalesToCsv(data.sales, data.store.branch_name, `${from}_to_${to}`)
            }}
            className="btn btn-secondary btn-sm"
            title="Download Sales CSV"
          >
            📥 Export Sales CSV
          </button>

          <button
            onClick={() => {
              triggerHaptic('light')
              exportShiftsToCsv(data.shifts, data.store.branch_name, `${from}_to_${to}`)
            }}
            className="btn btn-secondary btn-sm"
            title="Download Cashier Shifts CSV"
          >
            📋 Export Shifts CSV
          </button>

          <button
            onClick={() => {
              triggerHaptic('light')
              window.print()
            }}
            className="btn btn-secondary btn-sm"
            title="Print Daily Summary / Z-Reading"
          >
            🖨️ Print Summary
          </button>

          <button
            onClick={() => {
              triggerHaptic('light')
              loadData()
            }}
            className="btn btn-secondary btn-sm"
            title="Refresh records"
          >
            {loading ? '↻ Syncing...' : '↻ Sync'}
          </button>
        </div>
      </div>

      {/* Low Stock Urgent Radar Banner (if any item <= 10) */}
      {lowStock.length > 0 && (
        <div className="restock-banner">
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="restock-title">
              <span>⚠️ Low Stock Alert</span>
              <span className="badge" style={{ background: 'rgba(244,63,94,0.2)', color: '#fda4af' }}>
                {lowStock.length} Items Need Restocking
              </span>
            </div>
            <div className="restock-sub">
              Items approaching critical zero balance (≤ 10 units). Order now to prevent stockouts.
            </div>
          </div>

          <div className="restock-actions">
            <button
              onClick={() => {
                triggerHaptic('light')
                setShowLowStockModal(true)
              }}
              className="btn btn-secondary btn-sm"
              title="Open Low Stock Items List Dialog"
              style={{ fontWeight: 700, borderColor: '#fbbf24', color: '#fbbf24' }}
            >
              👁️ View Items ({lowStock.length})
            </button>
            <button
              onClick={() => {
                triggerHaptic('light')
                setExpandBannerItems(!expandBannerItems)
              }}
              className="btn btn-secondary btn-sm"
              title="Toggle inline quick preview"
            >
              {expandBannerItems ? '▲ Hide Preview' : '▼ Quick Preview'}
            </button>
            <button onClick={handleCopyRestock} className="btn btn-primary btn-sm">
              {copiedRestock ? '✓ Copied for Supplier!' : '📋 Copy Supplier Order'}
            </button>
          </div>

          {/* Expandable Inline Items Preview */}
          {expandBannerItems && (
            <div style={{ width: '100%', marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                {lowStock.map((it, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(0, 0, 0, 0.35)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      border: '1px solid rgba(255, 255, 255, 0.06)'
                    }}
                  >
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                      {it.product_name}
                    </span>
                    <span className="tabular-nums" style={{ fontSize: '0.85rem', fontWeight: 800, color: it.quantity_after <= 0 ? 'var(--accent-rose)' : '#fbbf24' }}>
                      {it.quantity_after} {it.unit}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  onClick={() => {
                    triggerHaptic('light')
                    scrollToRestockTable()
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Go to Full Low Stock Table Below ↓
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Branch Header Bento Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="brand-icon-box" style={{ width: 48, height: 48, fontSize: 24 }}>
              🏪
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {data.store.branch_name}
                </h1>
                <span className="badge badge-live">
                  <span className="beacon-dot" style={{ width: 5, height: 5 }} /> Live Sync
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <span>Last Sale: <strong style={{ color: '#fff' }}>{formatDateTime(data.store.last_sale_at)}</strong></span>
                <span>•</span>
                <span
                  onClick={copyStoreId}
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-cyan)' }}
                  title="Click to copy Store ID"
                >
                  <code>{data.store.id.slice(0, 8)}...</code>
                  <span>{copiedId ? '✓ Copied' : '📋'}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="branch-header-revenue">
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Period Revenue
            </div>
            <div className="stat-value tabular-nums" style={{ color: '#38bdf8' }}>
              {formatPesos(totalSalesC)}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {activeSales.length} active receipts {data.sales.length > activeSales.length ? `(${data.sales.length - activeSales.length} voided)` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 6 }}>
              <span className="badge badge-muted" style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)' }}>
                Cash: {formatPesos(tenderMetrics.cash)}
              </span>
              {tenderMetrics.gcash > 0 && (
                <span className="badge badge-muted" style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>
                  GCash: {formatPesos(tenderMetrics.gcash)}
                </span>
              )}
              {tenderMetrics.maya > 0 && (
                <span className="badge badge-muted" style={{ fontSize: '0.7rem', color: '#34d399' }}>
                  Maya: {formatPesos(tenderMetrics.maya)}
                </span>
              )}
              {tenderMetrics.utang > 0 && (
                <span className="badge badge-muted" style={{ fontSize: '0.7rem', color: 'var(--accent-amber)' }}>
                  Credit: {formatPesos(tenderMetrics.utang)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hourly Sales Velocity Heatmap (Peak Hours) */}
      {data.hourlyTotals && data.hourlyTotals.length > 0 && (
        <div className="card chart-card">
          <div className="stat-header">
            <div className="stat-label">
              <span>🕒 Hourly Sales Velocity (Peak Hours Heatmap)</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              Identifies Customer Rush Times
            </div>
          </div>

          <div className="hourly-grid">
            {data.hourlyTotals.map((h, idx) => {
              const heightPct = Math.max(Math.round((h.total_c / maxHourlyC) * 100), 8)
              const hourLabel = `${String(h.hour).padStart(2, '0')}:00`
              return (
                <div
                  key={idx}
                  className="hourly-bar-col"
                  title={`Hour ${hourLabel}: ${formatPesos(h.total_c)} (${h.count} transactions)`}
                >
                  <div className="hourly-bar-fill" style={{ height: `${heightPct}%` }} />
                  <div className="hourly-bar-label">{h.hour}h</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Daily Sales Trend Chart (if dailyTotals available) */}
      {data.dailyTotals && data.dailyTotals.length > 0 && (
        <div className="card chart-card">
          <div className="stat-header">
            <div className="stat-label">
              <span>📈 Daily Revenue Volume</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              {data.dailyTotals.length} Days Recorded
            </div>
          </div>

          <div className="chart-bars-wrap">
            {data.dailyTotals.map((d, idx) => {
              const heightPct = Math.max(Math.round((d.total_c / maxDailyC) * 100), 6)
              return (
                <div key={idx} className="chart-bar-col" title={`${d.day}: ${formatPesos(d.total_c)} (${d.count} sales)`}>
                  <div className="chart-bar-fill" style={{ height: `${heightPct}%` }} />
                  <div className="chart-bar-label">
                    {d.day.split('-').slice(1).join('/')}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Segmented Tab Navigation */}
      <div className="tabs-container">
        <button
          className={`tab-btn ${activeTab === 'sales' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('light')
            setActiveTab('sales')
          }}
        >
          💳 Sales Feed ({data.sales.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'restock' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('light')
            setActiveTab('restock')
          }}
        >
          ⚠️ Low Stock Radar ({lowStock.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('light')
            setActiveTab('stock')
          }}
        >
          📦 Stock Audit ({data.stockMovements.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'items' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('light')
            setActiveTab('items')
          }}
        >
          ⭐ Top Products ({data.topProducts.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'shifts' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('light')
            setActiveTab('shifts')
          }}
        >
          📋 Cashier Shifts ({data.shifts.length})
        </button>
      </div>

      {/* TAB 1: Sales Feed */}
      {activeTab === 'sales' && (
        <div>
          {data.sales.length > 3 && (
            <div style={{ marginBottom: 14 }}>
              <input
                type="text"
                className="input-field"
                placeholder="Search receipt #, cashier, or items..."
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
              />
            </div>
          )}

          <div className="table-glass-wrap">
            <div className="table-swipe-hint">👈 Swipe table for details 👉</div>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Receipt / Date</th>
                    <th>Cashier</th>
                    <th>Items Sold</th>
                    <th>Payment Method</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-secondary)' }}>
                        No transactions found matching this query or date range.
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((s) => {
                      const isVoided = s.status === 'VOIDED'
                      return (
                        <tr key={s.id} style={isVoided ? { opacity: 0.55, background: 'rgba(244,63,94,0.05)' } : undefined}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 700, color: isVoided ? '#94a3b8' : '#fff', textDecoration: isVoided ? 'line-through' : 'none' }} className="tabular-nums">
                                {s.transaction_no}
                              </span>
                              {isVoided && (
                                <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.25)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)', fontSize: '0.65rem', padding: '1px 5px', fontWeight: 800 }}>
                                  VOIDED
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                              {formatDateTime(s.sold_at)}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{s.cashier_name || 'Cashier'}</div>
                            {s.customer_name && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                Cust: {s.customer_name}
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: isVoided ? 'line-through' : 'none' }} title={s.items_summary || ''}>
                              {s.items_summary || '—'}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {isVoided ? (
                                <span className="badge badge-muted" style={{ color: '#f87171' }}>Reversed</span>
                              ) : (
                                <>
                                  {s.cash_c > 0 && <span className="badge badge-muted" style={{ color: 'var(--accent-emerald)' }}>Cash</span>}
                                  {s.gcash_c > 0 && <span className="badge badge-muted" style={{ color: 'var(--accent-cyan)' }}>GCash</span>}
                                  {s.maya_c > 0 && <span className="badge badge-muted" style={{ color: '#34d399' }}>Maya</span>}
                                  {s.utang_c > 0 && <span className="badge badge-muted" style={{ color: 'var(--accent-amber)' }}>Utang</span>}
                                </>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', color: isVoided ? '#94a3b8' : '#fff', textDecoration: isVoided ? 'line-through' : 'none' }} className="tabular-nums">
                            {formatPesos(s.total_c)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Low Stock Restock Radar */}
      {activeTab === 'restock' && (
        <div id="restock-table-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Items with remaining stock quantity ≤ 10 units ({filteredLowStock.length} shown)
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {lowStock.length > 3 && (
                <input
                  type="text"
                  className="input-field"
                  style={{ padding: '5px 10px', fontSize: '0.78rem', width: 180 }}
                  placeholder="Filter product..."
                  value={restockSearch}
                  onChange={(e) => setRestockSearch(e.target.value)}
                />
              )}
              <button
                onClick={() => {
                  triggerHaptic('light')
                  setShowLowStockModal(true)
                }}
                className="btn btn-secondary btn-sm"
              >
                📱 Dialog View
              </button>
              <button onClick={handleCopyRestock} className="btn btn-primary btn-sm">
                {copiedRestock ? '✓ Copied for Supplier!' : '📋 Copy Supplier Order'}
              </button>
            </div>
          </div>

          <div className="table-glass-wrap">
            <div className="table-swipe-hint">👈 Swipe table for details 👉</div>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Remaining Balance</th>
                    <th>Status</th>
                    <th>Last Movement</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLowStock.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-secondary)' }}>
                        {lowStock.length === 0
                          ? '🎉 Great news! All inventory items have healthy stock levels above 10 units.'
                          : `No items matching "${restockSearch}".`}
                      </td>
                    </tr>
                  ) : (
                    filteredLowStock.map((it, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: '#fff' }}>{it.product_name}</td>
                        <td className="tabular-nums" style={{ fontWeight: 800, fontSize: '1rem' }}>
                          {it.quantity_after} {it.unit}
                        </td>
                        <td>
                          {it.quantity_after <= 0 ? (
                            <span className="low-stock-critical">OUT OF STOCK</span>
                          ) : (
                            <span className="low-stock-warn">CRITICAL LOW</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {formatDateTime(it.moved_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Stock Audit Movements */}
      {activeTab === 'stock' && (
        <div className="table-glass-wrap">
          <div className="table-swipe-hint">👈 Swipe table for details 👉</div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Action</th>
                  <th>Quantity Flux</th>
                  <th>Balance Remaining</th>
                  <th>Timestamp & Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.stockMovements.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-secondary)' }}>
                      No inventory deductions or stock arrivals recorded in this window.
                    </td>
                  </tr>
                ) : (
                  data.stockMovements.map((m, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700, color: '#fff' }}>
                        {m.product_name}
                      </td>
                      <td>
                        <span className="badge badge-muted">
                          {m.movement_type}
                        </span>
                      </td>
                      <td>
                        {m.quantity_change > 0 ? (
                          <span className="stock-badge-in">
                            +{m.quantity_change} {m.unit}
                          </span>
                        ) : (
                          <span className="stock-badge-out">
                            {m.quantity_change} {m.unit}
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700 }} className="tabular-nums">
                          {m.quantity_after} {m.unit}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.78rem' }}>{formatDateTime(m.moved_at)}</div>
                        {m.reason && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                            {m.reason}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Top Products Leaderboard */}
      {activeTab === 'items' && (
        <div className="table-glass-wrap">
          <div className="table-swipe-hint">👈 Swipe table for details 👉</div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Rank</th>
                  <th>Item Name</th>
                  <th>Units Sold</th>
                  <th>Transaction Count</th>
                  <th style={{ textAlign: 'right' }}>Total Sales Contribution</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-secondary)' }}>
                      No sales data available to rank items.
                    </td>
                  </tr>
                ) : (
                  data.topProducts.map((p, idx) => {
                    const rankClass =
                      idx === 0 ? 'rank-gold' : idx === 1 ? 'rank-silver' : idx === 2 ? 'rank-bronze' : 'rank-other'
                    return (
                      <tr key={idx}>
                        <td>
                          <div className={`rank-chip ${rankClass}`}>
                            {idx + 1}
                          </div>
                        </td>
                        <td style={{ fontWeight: 700, color: '#fff' }}>
                          {p.product_name}
                        </td>
                        <td className="tabular-nums" style={{ fontWeight: 600 }}>
                          {p.total_qty.toLocaleString()}
                        </td>
                        <td className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                          {p.sale_count.toLocaleString()} orders
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#38bdf8' }} className="tabular-nums">
                          {formatPesos(p.total_c)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: Cashier Shifts & Accountability */}
      {activeTab === 'shifts' && (
        <div className="table-glass-wrap">
          <div className="table-swipe-hint">👈 Swipe table for details 👉</div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Cashier & Shift Date</th>
                  <th>Duration / Closed At</th>
                  <th>Transactions</th>
                  <th>Drawer Expenses</th>
                  <th>Audit Flags</th>
                  <th style={{ textAlign: 'right' }}>Reconciled Net Sales</th>
                </tr>
              </thead>
              <tbody>
                {data.shifts.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-secondary)' }}>
                      No shift register closings recorded for this date range.
                    </td>
                  </tr>
                ) : (
                  data.shifts.map((s, idx) => (
                    <tr key={idx}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#fff' }}>{s.cashier_name}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          Shift Date: {s.shift_date}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem' }}>{formatDateTime(s.closed_at)}</div>
                      </td>
                      <td className="tabular-nums">{s.transaction_count}</td>
                      <td className="tabular-nums" style={{ color: s.expenses_c > 0 ? 'var(--accent-rose)' : 'var(--text-secondary)' }}>
                        {formatPesos(s.expenses_c)}
                      </td>
                      <td>
                        {s.void_count > 0 ? (
                          <span className="anomaly-chip">
                            ⚠️ {s.void_count} Voids
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)' }}>✓ Clean Shift</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald)', fontSize: '0.95rem' }} className="tabular-nums">
                        {formatPesos(s.net_sales_c)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Low Stock Items Full Modal Dialog */}
      {showLowStockModal && (
        <LowStockModal
          branchName={data.store.branch_name}
          items={lowStock}
          onClose={() => setShowLowStockModal(false)}
          onJumpToTable={scrollToRestockTable}
        />
      )}
    </div>
  )
}
