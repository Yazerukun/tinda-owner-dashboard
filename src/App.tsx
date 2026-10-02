import React, { useEffect, useState, useRef } from 'react'
import {
  Tv,
  Clock,
  TrendingUp,
  Receipt,
  Banknote,
  Smartphone,
  Wallet,
  Store,
  RefreshCw,
  Plus,
  LogOut,
  ChevronRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react'
import {
  getToken,
  clearToken,
  fetchSummary,
  money,
  formatTime
} from './api'
import type { SummaryResponse } from './types'
import { LoginScreen } from './components/LoginScreen'
import { BranchLinkModal } from './components/BranchLinkModal'
import { BranchDetailModal } from './components/BranchDetailModal'

export default function App(): React.JSX.Element {
  const [token, setTokenState] = useState<string | null>(getToken())
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState<Date>(new Date())
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(30)

  // Date filters
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | '7days' | 'month'>('today')
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(() => {
    const today = new Date().toISOString().slice(0, 10)
    return { from: today, to: today }
  })

  // Modals
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false)
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)

  // Live clock
  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(clock)
  }, [])

  // Auto-refresh countdown
  useEffect(() => {
    if (!token) return
    const interval = setInterval(() => {
      setAutoRefreshSec((prev) => {
        if (prev <= 1) {
          loadData(true)
          return 30
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [token, dateRange])

  const loadData = async (silent = false): Promise<void> => {
    if (!token) return
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await fetchSummary(dateRange.from, dateRange.to)
      setData(res)
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load sales data')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      loadData()
      setAutoRefreshSec(30)
    }
  }, [token, dateRange])

  const handleFilterChange = (filter: 'today' | 'yesterday' | '7days' | 'month'): void => {
    setDateFilter(filter)
    const now = new Date()
    const fmt = (d: Date): string => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    if (filter === 'today') {
      const t = fmt(now)
      setDateRange({ from: t, to: t })
    } else if (filter === 'yesterday') {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const t = fmt(y)
      setDateRange({ from: t, to: t })
    } else if (filter === '7days') {
      const p = new Date(now)
      p.setDate(p.getDate() - 6)
      setDateRange({ from: fmt(p), to: fmt(now) })
    } else if (filter === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1)
      setDateRange({ from: fmt(m), to: fmt(now) })
    }
  }

  const handleLogout = (): void => {
    clearToken()
    setTokenState(null)
  }

  if (!token) {
    return <LoginScreen onLoginSuccess={() => setTokenState(getToken())} />
  }

  const timeFormatted = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateFormatted = currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#090b0e] text-slate-100 flex flex-col font-sans select-none">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#090b0e]/90 px-4 md:px-8 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-500 text-white shadow-lg shadow-brand-500/20">
            <Tv className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight text-white">
                TINDA POS
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE MONITOR
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Multi-Branch Sales & Real-Time Cashier Tracking
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 md:gap-4">
          <div className="hidden sm:block text-right">
            <div className="flex items-center justify-end gap-1.5 font-mono text-xs font-bold text-slate-200">
              <Clock className="h-3.5 w-3.5 text-brand-400" />
              <span>{timeFormatted}</span>
            </div>
            <div className="text-[10px] text-slate-400">{dateFormatted}</div>
          </div>

          <div className="flex items-center gap-2 border-l border-white/[0.08] pl-2 md:pl-4">
            <button
              onClick={() => loadData()}
              disabled={loading}
              title="Refresh Data"
              className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-slate-300 hover:bg-white/[0.08] hover:text-white transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-brand-400' : ''}`} />
              <span className="hidden md:inline font-mono text-[11px] text-slate-400">{autoRefreshSec}s</span>
            </button>

            <button
              onClick={() => setShowLinkModal(true)}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-500 px-3.5 text-xs font-bold text-white shadow-md shadow-brand-500/20 hover:from-brand-500 hover:to-emerald-400 transition active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Link Branch</span>
            </button>

            <button
              onClick={handleLogout}
              title="Logout"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 transition"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Date Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-[#10141a] p-3 shadow-sm">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => handleFilterChange('today')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                dateFilter === 'today'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handleFilterChange('yesterday')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                dateFilter === 'yesterday'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => handleFilterChange('7days')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                dateFilter === '7days'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => handleFilterChange('month')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                dateFilter === 'month'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              This Month
            </button>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-slate-400 px-1 font-mono">
            <span>Range: {dateRange.from} {dateRange.from !== dateRange.to ? `to ${dateRange.to}` : ''}</span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Consolidated Total Sales KPI Grid */}
        <section className="grid grid-cols-2 md:grid-cols-6 gap-3 md:gap-4">
          {/* Main Giant Total Sales Card */}
          <div className="col-span-2 md:col-span-2 rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/40 to-black/60 p-5 md:p-6 shadow-xl shadow-emerald-950/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <TrendingUp className="h-24 w-24 text-emerald-400" />
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                👑 All Branches Total
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <div className="mt-2 font-mono text-3xl md:text-4xl font-black text-emerald-400 tracking-tight">
              {money(data?.total_sales_c ?? 0)}
            </div>
            <div className="mt-1.5 text-xs text-slate-400">
              Consolidated across <strong className="text-white">{data?.branches?.length ?? 0}</strong> active branch{(data?.branches?.length ?? 0) === 1 ? '' : 'es'}
            </div>
          </div>

          {/* Transactions Count */}
          <div className="rounded-3xl border border-white/[0.08] bg-[#10141a] p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Orders</span>
              <Receipt className="h-4 w-4 text-brand-400" />
            </div>
            <div className="mt-2 font-mono text-2xl font-black text-white">
              {(data?.transaction_count ?? 0).toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Completed</div>
          </div>

          {/* Cash Sales */}
          <div className="rounded-3xl border border-white/[0.08] bg-[#10141a] p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Cash</span>
              <Banknote className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 font-mono text-2xl font-black text-emerald-400">
              {money(data?.cash_c ?? 0)}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Drawer Cash</div>
          </div>

          {/* GCash / Maya E-Wallets */}
          <div className="rounded-3xl border border-white/[0.08] bg-[#10141a] p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">E-Wallets</span>
              <Smartphone className="h-4 w-4 text-sky-400" />
            </div>
            <div className="mt-2 font-mono text-2xl font-black text-sky-400">
              {money((data?.gcash_c ?? 0) + (data?.maya_c ?? 0))}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">GCash & Maya</div>
          </div>

          {/* Utang Sales */}
          <div className="rounded-3xl border border-white/[0.08] bg-[#10141a] p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Utang Sold</span>
              <Wallet className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 font-mono text-2xl font-black text-amber-400">
              {money(data?.utang_c ?? 0)}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Customer Credit</div>
          </div>
        </section>

        {/* Branch List Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Store Branches & Servers
              </h2>
              <p className="text-xs text-slate-400">
                Click any branch to inspect individual transactions and cashier slips
              </p>
            </div>
            <button
              onClick={() => setShowLinkModal(true)}
              className="text-xs font-semibold text-brand-400 hover:text-brand-300 transition flex items-center gap-1"
            >
              <span>+ Add Branch</span>
            </button>
          </div>

          {/* Empty State if no branches linked */}
          {(!data?.branches || data.branches.length === 0) && (
            <div className="rounded-3xl border border-dashed border-white/10 bg-[#10141a]/50 p-10 md:p-14 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
                <Store className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-base font-bold text-white">No Branches Linked Yet</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                Connect your TINDA POS terminal by copying its Store ID and Sync Key from the Settings menu.
              </p>
              <button
                onClick={() => setShowLinkModal(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-500/20 hover:from-brand-500 hover:to-emerald-400 transition"
              >
                <Plus className="h-4 w-4" />
                <span>Link Your First Branch</span>
              </button>
            </div>
          )}

          {/* Branch Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.branches?.map((branch) => (
              <div
                key={branch.store_id}
                onClick={() => setSelectedBranchId(branch.store_id)}
                className="group cursor-pointer rounded-3xl border border-white/[0.08] bg-[#10141a] p-5 hover:border-brand-500/40 hover:bg-[#131922] transition-all shadow-md hover:shadow-xl hover:shadow-brand-950/20 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white group-hover:text-brand-400 transition">
                        {branch.branch_name || 'Branch Terminal'}
                      </h3>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span>Last sale: {formatTime(branch.last_sale_at)}</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live
                    </span>
                  </div>

                  {/* Branch Total Sales */}
                  <div className="mt-4 pt-3 border-t border-white/[0.06]">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Branch Revenue
                    </div>
                    <div className="mt-1 font-mono text-2xl font-black text-emerald-400">
                      {money(branch.total_sales_c)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {branch.transaction_count} transaction{branch.transaction_count === 1 ? '' : 's'}
                    </div>
                  </div>

                  {/* Breakdown Pills */}
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                    <div className="rounded-xl border border-white/[0.06] bg-black/30 p-1.5">
                      <span className="text-slate-400 block text-[9px]">CASH</span>
                      <span className="font-bold text-slate-200">{money(branch.cash_c)}</span>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-black/30 p-1.5">
                      <span className="text-sky-400 block text-[9px]">E-WALLET</span>
                      <span className="font-bold text-sky-300">{money(branch.gcash_c + branch.maya_c)}</span>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-black/30 p-1.5">
                      <span className="text-amber-400 block text-[9px]">UTANG</span>
                      <span className="font-bold text-amber-300">{money(branch.utang_c)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-semibold text-brand-400 group-hover:text-brand-300 transition">
                  <span>View Receipts & Breakdown</span>
                  <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Modals */}
      {showLinkModal && (
        <BranchLinkModal
          onClose={() => setShowLinkModal(false)}
          onLinked={() => loadData()}
        />
      )}

      {selectedBranchId && (
        <BranchDetailModal
          storeId={selectedBranchId}
          from={dateRange.from}
          to={dateRange.to}
          onClose={() => setSelectedBranchId(null)}
        />
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-white/[0.06] bg-black/40 py-4 text-center text-[11px] text-slate-500">
        <div className="flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
          <span>TINDA POS Multi-Branch Sales Engine • Protected by VIP Pro License</span>
        </div>
      </footer>
    </div>
  )
}
