import React, { useState } from 'react'
import { X, Store, KeyRound, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react'
import { linkBranch } from '../api'

interface Props {
  onClose: () => void
  onLinked: () => void
}

export function BranchLinkModal({ onClose, onLinked }: Props): React.JSX.Element {
  const [storeId, setStoreId] = useState('')
  const [syncKey, setSyncKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await linkBranch(storeId, syncKey)
      setSuccess(res.message || 'Branch successfully linked!')
      setTimeout(() => {
        onLinked()
        onClose()
      }, 900)
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to link branch')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#10141a] p-6 shadow-2xl shadow-emerald-950/30"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Link Branch / Server</h2>
              <p className="text-[12px] text-slate-400">Connect a store to your Sales Monitor</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.08] hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/30 p-3 text-[12px] text-slate-300 leading-relaxed">
          Open your <strong className="text-white">TINDA POS Desktop</strong> on the branch PC, go to{' '}
          <strong className="text-brand-400">Settings → Cloud Dashboard (VIP)</strong>, and copy your{' '}
          <span className="text-slate-100 font-mono">Store ID</span> and{' '}
          <span className="text-slate-100 font-mono">Sync Key</span>.
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Store ID (UUID)
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Sync Key (Secret)
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={syncKey}
                onChange={(e) => setSyncKey(e.target.value)}
                placeholder="e.g. tinda_1234567890abcdef..."
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[0.08] hover:text-white transition active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-500/25 hover:from-brand-500 hover:to-emerald-400 transition active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Linking Branch...' : (
                <>
                  <span>Link Branch</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
