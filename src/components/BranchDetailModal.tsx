import React, { useEffect, useState } from 'react'
import { X, Store, Receipt, RefreshCw, ShoppingBag, User, Clock, CheckCircle2 } from 'lucide-react'
import { fetchBranchDetail, money, formatTime } from '../api'
import type { BranchDetailResponse, SaleRecord } from '../types'

interface Props {
  storeId: string
  from: string
  to: string
  onClose: () => void
}

export function BranchDetailModal({ storeId, from, to, onClose }: Props): React.JSX.Element {
  const [data, setData] = useState<BranchDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null)

  const loadDetails = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchBranchDetail(storeId, from, to)
      setData(res)
      if (res.sales && res.sales.length > 0) {
        setSelectedSale(res.sales[0])
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load branch details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetails()
  }, [storeId, from, to])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 md:p-6 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="flex flex-col h-[90vh] w-full max-w-5xl rounded-2xl border border-white/10 bg-[#0f1318] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-black/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-500 text-white shadow-md shadow-brand-500/20">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  {data?.branch.branch_name ?? 'Branch Sales & Receipts'}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Detailed transaction records and customer receipts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadDetails}
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-brand-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Branch Quick KPI Bar */}
        <div className="grid shrink-0 grid-cols-2 md:grid-cols-5 gap-3 border-b border-white/[0.06] bg-black/20 p-4">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Total Sales</div>
            <div className="mt-1 font-mono text-xl font-black text-emerald-400">
              {money(data?.branch.total_sales_c)}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Orders</div>
            <div className="mt-1 font-mono text-xl font-bold text-white">
              {data?.branch.transaction_count ?? 0}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Cash</div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-400">
              {money(data?.branch.cash_c)}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">GCash / Maya</div>
            <div className="mt-1 font-mono text-xl font-bold text-sky-400">
              {money((data?.branch.gcash_c ?? 0) + (data?.branch.maya_c ?? 0))}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Utang Sold</div>
            <div className="mt-1 font-mono text-xl font-bold text-amber-400">
              {money(data?.branch.utang_c)}
            </div>
          </div>
        </div>

        {/* Modal Main Content: Left side Transaction list, Right side Receipt detail */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Transactions List */}
          <div className="w-full md:w-1/2 border-r border-white/[0.08] overflow-y-auto p-4 space-y-2">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Receipts ({data?.sales?.length ?? 0})
              </span>
              <span className="text-[11px] text-slate-500">Click to preview receipt</span>
            </div>

            {loading && !data && (
              <div className="py-12 text-center text-slate-400 text-xs">
                Loading receipts from cloud...
              </div>
            )}

            {!loading && (!data?.sales || data.sales.length === 0) && (
              <div className="py-12 text-center rounded-xl border border-dashed border-white/10 p-6 text-slate-400 text-xs">
                No transactions recorded for this branch yet.
              </div>
            )}

            {data?.sales?.map((sale) => {
              const isSelected = selectedSale?.id === sale.id
              return (
                <div
                  key={sale.id}
                  onClick={() => setSelectedSale(sale)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition ${
                    isSelected
                      ? 'border-brand-500/50 bg-brand-500/10 shadow-md shadow-brand-500/10'
                      : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-200">
                      {sale.transaction_no || `#TX-${sale.id}`}
                    </span>
                    <span className="font-mono text-sm font-black text-emerald-400">
                      {money(sale.total_c)}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3 w-3 text-slate-500" />
                      <span>{sale.cashier_name || 'Cashier'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      <Clock className="h-3 w-3 text-slate-500" />
                      <span>{formatTime(sale.sold_at || sale.created_at)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Receipt Preview Panel */}
          <div className="w-full md:w-1/2 bg-black/40 overflow-y-auto p-4 md:p-6">
            {selectedSale ? (
              <div className="rounded-2xl border border-white/10 bg-[#090b0e] p-5 shadow-xl font-mono text-xs text-slate-300">
                <div className="text-center border-b border-dashed border-white/20 pb-4">
                  <div className="text-sm font-black text-white uppercase tracking-wider">
                    {data?.branch.branch_name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">Official Sales Slip</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{selectedSale.transaction_no}</div>
                  <div className="text-[10px] text-slate-500">{new Date(selectedSale.sold_at || selectedSale.created_at).toLocaleString()}</div>
                </div>

                <div className="py-3 border-b border-dashed border-white/20 space-y-2">
                  <div className="flex justify-between text-[11px] text-slate-400 uppercase font-semibold">
                    <span>Item</span>
                    <span>Subtotal</span>
                  </div>

                  {selectedSale.items && selectedSale.items.length > 0 ? (
                    selectedSale.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-start text-xs">
                        <div>
                          <div className="text-slate-100 font-sans">{it.product_name}</div>
                          <div className="text-[10px] text-slate-400">
                            {it.qty} {it.unit_name || 'pc'} @ {money(it.unit_price_c)}
                          </div>
                        </div>
                        <div className="font-bold text-slate-200">{money(it.subtotal_c)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-2 text-slate-500 text-[11px] italic">
                      Standard transaction checkout
                    </div>
                  )}
                </div>

                <div className="pt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span>{money(selectedSale.subtotal_c)}</span>
                  </div>
                  {selectedSale.discount_c > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span>Discount</span>
                      <span>-{money(selectedSale.discount_c)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-black text-emerald-400 pt-1 border-t border-white/10">
                    <span>TOTAL</span>
                    <span>{money(selectedSale.total_c)}</span>
                  </div>

                  {/* Payment Breakdown */}
                  <div className="mt-3 pt-2 border-t border-dashed border-white/20 space-y-1 text-[11px]">
                    {selectedSale.cash_c > 0 && (
                      <div className="flex justify-between text-slate-400">
                        <span>Paid Cash:</span>
                        <span className="text-slate-200">{money(selectedSale.cash_c)}</span>
                      </div>
                    )}
                    {selectedSale.gcash_c > 0 && (
                      <div className="flex justify-between text-sky-400">
                        <span>Paid GCash:</span>
                        <span>{money(selectedSale.gcash_c)}</span>
                      </div>
                    )}
                    {selectedSale.maya_c > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Paid Maya:</span>
                        <span>{money(selectedSale.maya_c)}</span>
                      </div>
                    )}
                    {selectedSale.utang_c > 0 && (
                      <div className="flex justify-between text-amber-400">
                        <span>Charged to Utang:</span>
                        <span>{money(selectedSale.utang_c)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500 text-xs">
                Select a receipt on the left to preview details.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
