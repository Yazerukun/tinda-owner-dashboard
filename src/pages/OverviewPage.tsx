import React, { useEffect, useState, useMemo } from 'react'
import { request, formatPesos, formatDateTime } from '../api'
import type { OverallSummary } from '../types'
import { LinkBranchModal } from './LinkBranchModal'
import {
  triggerHaptic,
  getLocalToday,
  addDays,
  formatHumanDate,
  formatHumanRange,
  getDaysAgo
} from '../utils'

interface Props {
  from: string
  to: string
  onSelectBranch: (storeId: string) => void
  onDateChange: (from: string, to: string) => void
}

export const OverviewPage: React.FC<Props> = ({ from, to, onSelectBranch, onDateChange }) => {
  const [data, setData] = useState<OverallSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [autoRefreshSecs, setAutoRefreshSecs] = useState(60)
  const [searchQuery, setSearchQuery] = useState('')
  const [activePreset, setActivePreset] = useState<'today' | 'yesterday' | '7days' | 'month' | 'custom'>('today')
  const [customSubMode, setCustomSubMode] = useState<'single' | 'range'>(from === to ? 'single' : 'range')
  const [customFrom, setCustomFrom] = useState(from)
  const [customTo, setCustomTo] = useState(to)

  const loadSummary = async () => {
    try {
      const res = await request<OverallSummary>(`/api/owner/summary?from=${from}&to=${to}`)
      setData(res)
    } catch (err) {
      console.error('Failed to load summary', err)
    } finally {
      setLoading(false)
    }
  }

  // Initial & on date change
  useEffect(() => {
    loadSummary()
  }, [from, to])

  // Synchronize activePreset state with from/to
  useEffect(() => {
    setCustomFrom(from)
    setCustomTo(to)

    const today = getLocalToday()
    const yesterday = addDays(today, -1)
    const past7 = addDays(today, -6)
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    if (from === to) {
      setCustomSubMode('single')
      if (from === today) {
        setActivePreset('today')
      } else if (from === yesterday) {
        setActivePreset('yesterday')
      } else {
        // Specific past date like 2026-10-08
        setActivePreset('custom')
      }
    } else {
      setCustomSubMode('range')
      if (from === past7 && to === today) {
        setActivePreset('7days')
      } else if (from === monthStart && to === today) {
        setActivePreset('month')
      } else {
        setActivePreset('custom')
      }
    }
  }, [from, to])

  // Auto-refresh countdown every 60s (pauses automatically when tab is inactive)
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) {
        return // Paused while tab is backgrounded
      }
      setAutoRefreshSecs((prev) => {
        if (prev <= 1) {
          loadSummary()
          return 60
        }
        return prev - 1
      })
    }, 1000)

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadSummary()
        setAutoRefreshSecs(60)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [from, to])

  const setPreset = (preset: 'today' | 'yesterday' | '7days' | 'month' | 'custom') => {
    triggerHaptic('light')
    setActivePreset(preset)
    const today = getLocalToday()

    if (preset === 'today') {
      onDateChange(today, today)
    } else if (preset === 'yesterday') {
      const y = addDays(today, -1)
      onDateChange(y, y)
    } else if (preset === '7days') {
      const past = addDays(today, -6)
      onDateChange(past, today)
    } else if (preset === 'month') {
      const now = new Date()
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      onDateChange(start, today)
    } else if (preset === 'custom') {
      // If toggling into custom, preserve current view
      if (from === to) {
        setCustomSubMode('single')
      }
    }
  }

  const handleApplyCustom = () => {
    if (!customFrom || !customTo || customFrom > customTo) return
    triggerHaptic('light')
    onDateChange(customFrom, customTo)
  }

  const handleSingleDateSelect = (selectedDate: string) => {
    if (!selectedDate) return
    triggerHaptic('light')
    onDateChange(selectedDate, selectedDate)
  }

  const handlePrevDay = () => {
    triggerHaptic('light')
    const baseDate = from === to ? from : to
    const prev = addDays(baseDate, -1)
    onDateChange(prev, prev)
  }

  const handleNextDay = () => {
    triggerHaptic('light')
    const today = getLocalToday()
    const baseDate = from === to ? from : to
    if (baseDate >= today) return
    const next = addDays(baseDate, 1)
    if (next <= today) {
      onDateChange(next, next)
    }
  }

  const handleGoToday = () => {
    triggerHaptic('light')
    const today = getLocalToday()
    onDateChange(today, today)
  }

  // Filter branches by search query
  const filteredBranches = useMemo(() => {
    if (!data?.branches) return []
    if (!searchQuery.trim()) return data.branches
    const q = searchQuery.toLowerCase()
    return data.branches.filter(
      (b) => b.branch_name.toLowerCase().includes(q) || b.store_id.toLowerCase().includes(q)
    )
  }, [data?.branches, searchQuery])

  // Computed metrics
  const totalSales = data?.total_sales_c ?? 0
  const txnCount = data?.transaction_count ?? 0
  const avgBasket = txnCount > 0 ? Math.round(totalSales / txnCount) : 0

  const cash = data?.cash_c ?? 0
  const gcash = data?.gcash_c ?? 0
  const maya = data?.maya_c ?? 0
  const utang = data?.utang_c ?? 0
  const totalPaid = cash + gcash + maya + utang || 1

  const pctCash = ((cash / totalPaid) * 100).toFixed(1)
  const pctGcash = ((gcash / totalPaid) * 100).toFixed(1)
  const pctMaya = ((maya / totalPaid) * 100).toFixed(1)
  const pctUtang = ((utang / totalPaid) * 100).toFixed(1)

  const today = getLocalToday()
  const isHistorical = from < today || (from !== to && to < today)
  const isSingleDay = from === to
  const daysAgo = getDaysAgo(from, today)

  return (
    <div>
      {/* Cupertino Filter Bar */}
      <div className="filter-bar">
        <div className="segmented-control">
          <button
            className={`segment-btn ${activePreset === 'today' ? 'active' : ''}`}
            onClick={() => setPreset('today')}
          >
            Today
          </button>
          <button
            className={`segment-btn ${activePreset === 'yesterday' ? 'active' : ''}`}
            onClick={() => setPreset('yesterday')}
          >
            Yesterday
          </button>
          <button
            className={`segment-btn ${activePreset === '7days' ? 'active' : ''}`}
            onClick={() => setPreset('7days')}
          >
            Last 7 Days
          </button>
          <button
            className={`segment-btn ${activePreset === 'month' ? 'active' : ''}`}
            onClick={() => setPreset('month')}
          >
            This Month
          </button>
          <button
            className={`segment-btn ${activePreset === 'custom' ? 'active' : ''}`}
            onClick={() => setPreset('custom')}
          >
            📅 Specific Date
          </button>
        </div>

        <div className="filter-actions">
          <div className="refresh-chip">
            Auto-sync in <strong>{autoRefreshSecs}s</strong>
          </div>
          <button
            onClick={() => {
              triggerHaptic('light')
              setLoading(true)
              loadSummary()
            }}
            className="btn btn-secondary btn-sm"
            title="Refresh now"
          >
            {loading ? '↻ Syncing...' : '↻ Refresh'}
          </button>
          <button
            onClick={() => {
              triggerHaptic('light')
              setShowLinkModal(true)
            }}
            className="btn btn-primary btn-sm"
          >
            + Link Store / PC
          </button>
        </div>
      </div>

      {/* Custom Date / Specific Day Strip */}
      {activePreset === 'custom' && (
        <div className="custom-date-strip">
          <div className="custom-strip-header">
            <div className="custom-sub-tabs">
              <button
                type="button"
                className={`custom-sub-tab ${customSubMode === 'single' ? 'active' : ''}`}
                onClick={() => {
                  triggerHaptic('light')
                  setCustomSubMode('single')
                  if (from !== to) {
                    onDateChange(to, to)
                  }
                }}
              >
                🗓️ Specific Day
              </button>
              <button
                type="button"
                className={`custom-sub-tab ${customSubMode === 'range' ? 'active' : ''}`}
                onClick={() => {
                  triggerHaptic('light')
                  setCustomSubMode('range')
                }}
              >
                📆 Date Range
              </button>
            </div>

            <div className="custom-strip-info">
              {customSubMode === 'single' ? (
                <span>Showing: <strong style={{ color: '#fff' }}>{formatHumanDate(from)}</strong></span>
              ) : (
                <span>Period: <strong style={{ color: '#fff' }}>{from}</strong> to <strong style={{ color: '#fff' }}>{to}</strong></span>
              )}
            </div>
          </div>

          {customSubMode === 'single' ? (
            <div className="single-date-controls">
              <div className="custom-date-group">
                <label className="custom-date-label">Pick Date:</label>
                <input
                  type="date"
                  value={from}
                  max={today}
                  onChange={(e) => handleSingleDateSelect(e.target.value)}
                  className="custom-date-input"
                  aria-label="Pick Specific Date"
                />
              </div>

              <div className="day-stepper-group">
                <button
                  type="button"
                  className="btn-stepper"
                  onClick={handlePrevDay}
                  title="Go to previous day"
                >
                  ◀ Prev Day
                </button>
                <button
                  type="button"
                  className="btn-stepper"
                  disabled={from >= today}
                  onClick={handleNextDay}
                  title="Go to next day"
                >
                  Next Day ▶
                </button>
              </div>

              {from !== today && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleGoToday}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  ⚡ Today
                </button>
              )}
            </div>
          ) : (
            <div className="range-date-controls">
              <div className="custom-date-group">
                <label className="custom-date-label">From:</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="custom-date-input"
                />
              </div>
              <div className="custom-date-group">
                <label className="custom-date-label">To:</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={today}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="custom-date-input"
                />
              </div>
              <button
                type="button"
                onClick={handleApplyCustom}
                className="btn btn-primary btn-sm"
                disabled={!customFrom || !customTo || customFrom > customTo}
              >
                Apply Range
              </button>
            </div>
          )}
        </div>
      )}

      {/* Apple Cupertino Historical Date Banner */}
      {isHistorical && (
        <div className="historical-banner">
          <div className="historical-banner-content">
            <div className="historical-badge-pill">
              <span className="historical-dot" />
              📜 Historical Telemetry
            </div>
            <div className="historical-text-wrap">
              <div className="historical-title">
                {isSingleDay ? (
                  <>Viewing Historical Date: <strong>{formatHumanDate(from)}</strong></>
                ) : (
                  <>Viewing Historical Period: <strong>{formatHumanRange(from, to)}</strong></>
                )}
              </div>
              <div className="historical-subtitle">
                {isSingleDay ? (
                  from === addDays(today, -1) ? (
                    'Yesterday · Sales, tender breakdown & branch figures reflect this day only'
                  ) : (
                    `${daysAgo} days ago (${from}) · Sales, tender breakdown & branch figures reflect this day only`
                  )
                ) : (
                  `Historical range (${from} to ${to}) · Aggregated figures for this period`
                )}
              </div>
            </div>
          </div>

          <div className="historical-banner-actions">
            {isSingleDay && (
              <div className="stepper-action-group">
                <button
                  type="button"
                  className="btn-stepper-banner"
                  onClick={handlePrevDay}
                  title="Step to Previous Day"
                >
                  ◀ Prev Day
                </button>
                <button
                  type="button"
                  className="btn-stepper-banner"
                  disabled={from >= today}
                  onClick={handleNextDay}
                  title="Step to Next Day"
                >
                  Next Day ▶
                </button>
              </div>
            )}
            <button
              type="button"
              className="btn-return-today"
              onClick={handleGoToday}
              title="Return to Today's Live Sales"
            >
              ⚡ Return to Today
            </button>
          </div>
        </div>
      )}

      {/* Bento Hero Grid */}
      <div className="bento-hero-grid">
        {/* Main Revenue Card */}
        <div className="card">
          <div className="stat-header">
            <div className="stat-label">
              <span>💎 Realized Net Sales</span>
            </div>
            <span className="badge badge-live" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              100% POS Synced
            </span>
          </div>

          <div className="stat-value" style={{ color: '#34d399' }}>
            {formatPesos(totalSales)}
          </div>

          <div className="stat-sub">
            Gross: <strong style={{ color: '#fff' }}>{formatPesos(data?.gross_sales_c ?? totalSales)}</strong>
            {(data?.discount_c ?? 0) > 0 && (
              <> · Disc: <strong style={{ color: '#f59e0b' }}>-{formatPesos(data?.discount_c ?? 0)}</strong></>
            )}
            {(data?.void_count ?? 0) > 0 && (
              <> · <span style={{ color: '#f87171' }}>{data?.void_count} voids excluded</span></>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Transactions
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 2 }} className="tabular-nums">
                {txnCount.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Avg Basket (AOV)
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 2, color: 'var(--accent-emerald)' }} className="tabular-nums">
                {formatPesos(avgBasket)}
              </div>
            </div>
          </div>
        </div>

        {/* Payment Methods Breakdown Card */}
        <div className="card">
          <div className="stat-header">
            <div className="stat-label">
              <span>💳 Tender Breakdown</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              100% Reconciled
            </div>
          </div>

          {/* Visual Percentage Bar */}
          <div className="payment-meter-wrap">
            <div className="payment-bar">
              {cash > 0 && <div className="meter-segment meter-cash" style={{ width: `${pctCash}%` }} title={`Cash: ${pctCash}%`} />}
              {gcash > 0 && <div className="meter-segment meter-gcash" style={{ width: `${pctGcash}%` }} title={`GCash: ${pctGcash}%`} />}
              {maya > 0 && <div className="meter-segment meter-maya" style={{ width: `${pctMaya}%` }} title={`Maya: ${pctMaya}%`} />}
              {utang > 0 && <div className="meter-segment meter-utang" style={{ width: `${pctUtang}%` }} title={`Utang: ${pctUtang}%`} />}
            </div>

            <div className="payment-chips">
              <div className="payment-chip">
                <div className="payment-chip-name">
                  <span style={{ color: 'var(--accent-emerald)' }}>●</span> Cash
                </div>
                <div className="payment-chip-amt tabular-nums">{formatPesos(cash)}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{pctCash}%</div>
              </div>

              <div className="payment-chip">
                <div className="payment-chip-name">
                  <span style={{ color: 'var(--accent-cyan)' }}>●</span> GCash
                </div>
                <div className="payment-chip-amt tabular-nums" style={{ color: '#38bdf8' }}>{formatPesos(gcash)}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{pctGcash}%</div>
              </div>

              <div className="payment-chip">
                <div className="payment-chip-name">
                  <span style={{ color: '#34d399' }}>●</span> Maya
                </div>
                <div className="payment-chip-amt tabular-nums" style={{ color: '#34d399' }}>{formatPesos(maya)}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{pctMaya}%</div>
              </div>

              <div className="payment-chip">
                <div className="payment-chip-name">
                  <span style={{ color: 'var(--accent-amber)' }}>●</span> Utang
                </div>
                <div className="payment-chip-amt tabular-nums" style={{ color: '#fbbf24' }}>{formatPesos(utang)}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{pctUtang}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Branch Comparative Benchmark (if > 1 branch) */}
      {data?.branches && data.branches.length > 1 && totalSales > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="stat-header">
            <div className="stat-label">
              <span>⚖️ Store Contribution Benchmark</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              Comparative Performance
            </div>
          </div>

          <div style={{ height: 10, borderRadius: 99, background: 'rgba(255,255,255,0.06)', display: 'flex', overflow: 'hidden', marginBottom: 12 }}>
            {data.branches.map((b, idx) => {
              const pct = ((b.total_sales_c / totalSales) * 100).toFixed(1)
              const colors = ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899']
              const color = colors[idx % colors.length]
              return (
                <div
                  key={b.store_id}
                  style={{ width: `${pct}%`, backgroundColor: color, height: '100%' }}
                  title={`${b.branch_name}: ${pct}% (${formatPesos(b.total_sales_c)})`}
                />
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {data.branches.map((b, idx) => {
              const pct = ((b.total_sales_c / totalSales) * 100).toFixed(1)
              const colors = ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899']
              const color = colors[idx % colors.length]
              return (
                <div key={b.store_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />
                  <span style={{ fontWeight: 600 }}>{b.branch_name}:</span>
                  <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>{pct}% ({formatPesos(b.total_sales_c)})</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Connected Branches Section */}
      <div className="section-header">
        <div className="section-title">
          Connected Store Branches & Terminals ({data?.branches.length || 0})
        </div>

        {data?.branches && data.branches.length > 2 && (
          <div style={{ width: 220 }}>
            <input
              type="text"
              className="input-field"
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              placeholder="Search branch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {!data?.branches || data.branches.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon">🏬</div>
          <h3 className="empty-state-title">No Stores or PCs Connected Yet</h3>
          <p className="empty-state-desc">
            Link your first TINDA POS terminal or PC to start monitoring live sales, real-time stock deductions, and cashier shift audits remotely.
          </p>
          <button
            onClick={() => {
              triggerHaptic('light')
              setShowLinkModal(true)
            }}
            className="btn btn-primary"
          >
            + Link Your First Branch / PC
          </button>
        </div>
      ) : (
        <div className="branch-list">
          {filteredBranches.map((b) => (
            <div
              key={b.store_id}
              className="branch-card"
              onClick={() => {
                triggerHaptic('light')
                onSelectBranch(b.store_id)
              }}
            >
              <div className="branch-info-left">
                <div className="branch-store-icon">
                  🏪
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="branch-name">{b.branch_name}</span>
                    <span className="badge badge-live">
                      <span className="beacon-dot" style={{ width: 5, height: 5 }} /> Live
                    </span>
                  </div>
                  <div className="branch-meta">
                    <span>Last sale: {formatDateTime(b.last_sale_at)}</span>
                    <span>•</span>
                    <span className="tabular-nums">{b.transaction_count} sales</span>
                  </div>
                </div>
              </div>

              <div className="branch-revenue-box">
                <div className="branch-revenue tabular-nums" style={{ color: '#34d399' }}>
                  {formatPesos(b.total_sales_c)}
                </div>
                <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Net Sales
                </div>
                <div className="branch-view-cta">
                  <span>View Branch Analytics</span>
                  <span>→</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showLinkModal && (
        <LinkBranchModal
          onClose={() => setShowLinkModal(false)}
          onLinked={() => {
            loadSummary()
          }}
        />
      )}
    </div>
  )
}
