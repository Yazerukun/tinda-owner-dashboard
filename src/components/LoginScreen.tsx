import React, { useState } from 'react'
import { Tv, KeyRound, Lock, User, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react'
import { loginOwner, setupOwner, linkBranch, setApiUrl, getApiUrl } from '../api'

interface Props {
  onLoginSuccess: () => void
}

export function LoginScreen({ onLoginSuccess }: Props): React.JSX.Element {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Quick Direct Store Pair mode
  const [quickMode, setQuickMode] = useState(false)
  const [storeId, setStoreId] = useState('')
  const [syncKey, setSyncKey] = useState('')

  const handleAccountAuth = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isRegister) {
        await setupOwner(username, password)
      } else {
        await loginOwner(username, password)
      }
      onLoginSuccess()
    } catch (err: unknown) {
      setError((err as Error).message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickPair = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Auto-generate session with secret key as credentials
      const generatedUser = 'store_' + storeId.slice(0, 8)
      try {
        await loginOwner(generatedUser, syncKey)
      } catch {
        // If not registered yet, setup auto account
        await setupOwner(generatedUser, syncKey)
      }
      // Link the branch automatically
      await linkBranch(storeId, syncKey)
      onLoginSuccess()
    } catch (err: unknown) {
      setError((err as Error).message || 'Quick connection failed. Check your Store ID and Sync Key.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#090b0e] p-4 text-slate-100">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#10141a] p-7 shadow-2xl shadow-emerald-950/20 backdrop-blur-xl">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-emerald-400 text-white shadow-xl shadow-brand-500/25">
            <Tv className="h-7 w-7" />
          </div>
          <h1 className="mt-3.5 text-2xl font-black tracking-tight text-white">
            TINDA POS
          </h1>
          <p className="mt-0.5 text-xs text-brand-400 font-semibold tracking-wide">
            Live Sales Monitor
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Real-time branch tracking for store owners
          </p>
        </div>

        {/* Tab Toggle: Quick Store Connect vs Owner Account */}
        <div className="mt-6 flex rounded-xl border border-white/[0.08] bg-black/40 p-1">
          <button
            type="button"
            onClick={() => { setQuickMode(false); setError(null) }}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              !quickMode
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Owner Login
          </button>
          <button
            type="button"
            onClick={() => { setQuickMode(true); setError(null) }}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              quickMode
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Quick Connect
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!quickMode ? (
          /* Standard Login / Register Form */
          <form onSubmit={handleAccountAuth} className="mt-5 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Username / PIN
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. admin or boss"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Password (min. 8 chars)
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-500 py-3 text-xs font-bold text-white shadow-lg shadow-brand-500/25 hover:from-brand-500 hover:to-emerald-400 transition active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                'Connecting...'
              ) : (
                <>
                  <span>{isRegister ? 'Create Monitor Account' : 'Sign In to Monitor'}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setIsRegister(!isRegister); setError(null) }}
                className="text-xs text-slate-400 hover:text-brand-400 transition"
              >
                {isRegister
                  ? 'Already have an account? Sign In'
                  : "First time here? Register as Owner"}
              </button>
            </div>
          </form>
        ) : (
          /* Quick Connect with Store ID & Sync Key */
          <form onSubmit={handleQuickPair} className="mt-5 space-y-4">
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-3 text-[11px] text-slate-300 leading-relaxed">
              💡 Direct connection: Copy the <strong className="text-white">Store ID</strong> and{' '}
              <strong className="text-white">Sync Key</strong> from your TINDA POS Desktop (Settings → Cloud Dashboard) to monitor this store immediately!
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Store ID (UUID)
              </label>
              <input
                type="text"
                required
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="e.g. 550e8400-e29b-41d4-..."
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-xs text-white placeholder-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Sync Key
              </label>
              <input
                type="text"
                required
                value={syncKey}
                onChange={(e) => setSyncKey(e.target.value)}
                placeholder="e.g. tinda_1234..."
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-xs text-white placeholder-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-500 py-3 text-xs font-bold text-white shadow-lg shadow-brand-500/25 hover:from-brand-500 hover:to-emerald-400 transition active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Connecting...' : (
                <>
                  <span>Connect & Launch Monitor</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Security badge footer */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 border-t border-white/[0.06] pt-4">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
          <span>VIP Pro End-to-End Encrypted Cloud</span>
        </div>
      </div>
    </div>
  )
}
