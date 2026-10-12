import React, { useState } from 'react'
import { request, setToken, getApiBase, setApiBase } from '../api'

interface Props {
  onLoginSuccess: () => void
}

export const LoginPage: React.FC<Props> = ({ onLoginSuccess }) => {
  const [isSetup, setIsSetup] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [apiUrl, setApiUrlState] = useState(getApiBase())
  const [showConfig, setShowConfig] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [pendingStore] = useState<{ sid: string; key: string; name: string } | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const sid = params.get('sid') || params.get('store_id')
      const key = params.get('key') || params.get('sync_key')
      const name = params.get('name') || params.get('branch_name') || 'Store Branch'
      if (sid && key) {
        const p = { sid: sid.trim().toLowerCase(), key: key.trim(), name: name.trim() }
        sessionStorage.setItem('tinda_pending_link', JSON.stringify(p))
        return p
      }
      const saved = sessionStorage.getItem('tinda_pending_link')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    setApiBase(apiUrl)

    try {
      const endpoint = isSetup ? '/api/owner/setup' : '/api/owner/login'
      const payload: any = { username, password }
      if (isSetup && fullName.trim()) {
        payload.full_name = fullName.trim()
      }

      const res = await request<{ ok: boolean; token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      })

      if (res.token) {
        setToken(res.token)
        onLoginSuccess()
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="card login-card">
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            className="brand-icon-box"
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 16px',
              fontSize: 28,
              boxShadow: '0 8px 24px rgba(14, 165, 233, 0.4)'
            }}
          >
            🏪
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
            TINDA POS
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
            Owner Cloud Executive
          </div>
        </div>

        {pendingStore && (
          <div
            style={{
              background: 'rgba(14, 165, 233, 0.12)',
              border: '1px solid rgba(14, 165, 233, 0.4)',
              borderRadius: 14,
              padding: '12px 16px',
              marginBottom: 20,
              textAlign: 'center',
              boxShadow: '0 4px 16px rgba(14, 165, 233, 0.15)'
            }}
          >
            <span style={{ fontSize: 24, display: 'block', marginBottom: 4 }}>📲</span>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#38bdf8' }}>
              Auto-Pairing: &quot;{pendingStore.name}&quot;
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Log in or register below to instantly connect this store terminal to your account!
            </div>
          </div>
        )}

        {/* Tab switch between Sign In and Setup */}
        <div className="segmented-control" style={{ width: '100%', display: 'flex', marginBottom: 20 }}>
          <button
            type="button"
            className={`segment-btn ${!isSetup ? 'active' : ''}`}
            style={{ flex: 1, textAlign: 'center', padding: '8px' }}
            onClick={() => {
              setIsSetup(false)
              setError(null)
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`segment-btn ${isSetup ? 'active' : ''}`}
            style={{ flex: 1, textAlign: 'center', padding: '8px' }}
            onClick={() => {
              setIsSetup(true)
              setError(null)
            }}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(244, 63, 94, 0.14)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.82rem',
              color: '#fca5a5',
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSetup && (
            <div className="input-group">
              <label className="input-label">Full Name (Owner / Proprietor)</label>
              <input
                type="text"
                className="input-field"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Boss Juan Dela Cruz"
              />
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Username</label>
            <input
              type="text"
              required
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              type="password"
              required
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '13px', marginTop: 12, fontSize: '0.92rem' }}
          >
            {loading ? 'Authenticating...' : isSetup ? 'Initialize Owner Account' : 'Access Executive Cloud'}
          </button>
        </form>

        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              fontSize: '0.74rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>⚙️</span>
            <span>Cloudflare Worker Settings</span>
          </button>
        </div>

        {showConfig && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: '1px solid var(--border-subtle)',
              animation: 'modal-fade-in 0.2s ease'
            }}
          >
            <label className="input-label">Sync Worker API URL</label>
            <input
              type="text"
              className="input-field"
              style={{ fontSize: '0.78rem' }}
              value={apiUrl}
              onChange={(e) => setApiUrlState(e.target.value)}
              placeholder="https://tinda-sync.yomikaze-md.workers.dev"
            />
          </div>
        )}
      </div>
    </div>
  )
}
