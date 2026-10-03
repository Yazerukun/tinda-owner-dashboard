import React, { useEffect, useState, useMemo } from 'react'
import { request, formatPesos, formatDateTime } from '../api'
import type { OverallSummary } from '../types'
import { LinkBranchModal } from './LinkBranchModal'
import { triggerHaptic } from '../utils'

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

  // Auto-refresh countdown every 60s
  useEffect(() => {
    const timer = setInterval(() => {
      setAutoRefreshSecs((prev) => {
        if (prev <= 1) {
          loadSummary()
          return 60
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [from, to])

  const setPreset = (preset: 'today' | 'yesterday' | '7days' | 'month') => {
    triggerHaptic('light')
    setActivePreset(preset)
    const now = new Date()
    const fmt = (d: Date) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    if (preset === 'today') {
      const t = fmt(now)
      onDateChange(t, t)
    } else if (preset === 'yesterday') {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const t = fmt(y)
      onDateChange(t, t)
    } else if (preset === '7days') {
      const past = new Date(now)
      past.setDate(past.getDate() - 6)
      onDateChange(fmt(past), fmt(now))
    } else if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      onDateChange(fmt(start), fmt(now))
    }
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

      {/* Bento Hero Grid */}
      <div className="bento-hero-grid">
        {/* Main Revenue Card */}
        <div className="card">
          <div className="stat-header">
            <div className="stat-label">
              <span>💎 Realized Gross Revenue</span>
            </div>
            <span className="badge badge-live">Live Cloud Sync</span>
          </div>

          <div className="stat-value" style={{ color: '#38bdf8' }}>
            {formatPesos(totalSales)}
          </div>

          <div className="stat-sub">
            Across <strong>{data?.branches.length || 0}</strong> active branch POS terminals
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
                <div className="branch-revenue tabular-nums">
                  {formatPesos(b.total_sales_c)}
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
