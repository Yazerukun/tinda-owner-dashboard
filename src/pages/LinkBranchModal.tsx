import React, { useState } from 'react'
import { request } from '../api'

interface Props {
  onClose: () => void
  onLinked: () => void
}

export const LinkBranchModal: React.FC<Props> = ({ onClose, onLinked }) => {
  const [storeId, setStoreId] = useState('')
  const [syncKey, setSyncKey] = useState('')
  const [branchName, setBranchName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await request('/api/owner/branch/link', {
        method: 'POST',
        body: JSON.stringify({
          store_id: storeId.trim().toLowerCase(),
          sync_key: syncKey.trim(),
          branch_name: branchName.trim() || undefined
        })
      })
      onLinked()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to link branch. Check that the Store ID and Sync Key are correct.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🏪</span>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Link Branch / Store PC
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: 'var(--text-secondary)',
              width: 30,
              height: 30,
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              fontSize: 16
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
          On your TINDA POS PC (v1.0.54), open the left sidebar: click <strong>Settings</strong> (under <strong>System</strong>) → <strong>Cloud Sync Dashboard</strong>. Copy the generated Store ID and secret Sync Key below to link this branch.
        </p>

        {error && (
          <div
            style={{
              background: 'rgba(244, 63, 94, 0.14)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
              color: '#fca5a5',
              marginBottom: 16
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLink}>
          <div className="input-group">
            <label className="input-label">Branch / Store Name (Optional)</label>
            <input
              type="text"
              className="input-field"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="e.g. TRES MARIAS STORE"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Store ID (UUID)</label>
            <input
              type="text"
              required
              className="input-field"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              placeholder="e.g. 07c9823f-3f3a-41a3-b8b7-74c692931bb8"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Sync Secret Key</label>
            <input
              type="text"
              required
              className="input-field"
              value={syncKey}
              onChange={(e) => setSyncKey(e.target.value)}
              placeholder="e.g. tinda_9a295f3d5047..."
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ flex: 1.2 }}
            >
              {loading ? 'Connecting...' : 'Connect Branch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
