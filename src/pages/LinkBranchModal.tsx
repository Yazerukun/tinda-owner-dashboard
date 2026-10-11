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
  const [notice, setNotice] = useState<string | null>(null)

  const handleStoreIdChange = (val: string) => {
    setError(null)
    setNotice(null)
    const clean = val.trim()

    // 1-Click Link Code auto-splitter (uuid:tinda_xxx or uuid|tinda_xxx)
    if (clean.includes(':') || clean.includes('|')) {
      const parts = clean.split(/[:|]/)
      if (parts.length >= 2) {
        setStoreId(parts[0].trim())
        setSyncKey(parts[1].trim())
        setNotice('✅ 1-Click Link Code detected! Store ID and Sync Key filled automatically.')
        return
      }
    }

    // Auto-swap if user pastes secret sync key (starts with tinda_) into Store ID box
    if (clean.toLowerCase().startsWith('tinda_')) {
      setSyncKey(clean)
      setNotice('💡 Detected Sync Key! Placed in the secret Sync Key field below.')
      return
    }

    setStoreId(val)
  }

  const handleSyncKeyChange = (val: string) => {
    setError(null)
    setNotice(null)
    const clean = val.trim()

    // 1-Click Link Code auto-splitter
    if (clean.includes(':') || clean.includes('|')) {
      const parts = clean.split(/[:|]/)
      if (parts.length >= 2) {
        setStoreId(parts[0].trim())
        setSyncKey(parts[1].trim())
        setNotice('✅ 1-Click Link Code detected! Store ID and Sync Key filled automatically.')
        return
      }
    }

    // Detect UUID in sync key box when storeId is empty
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean) && !storeId) {
      setStoreId(clean)
      setNotice('💡 Detected Store UUID! Placed in Store ID field above.')
      return
    }

    setSyncKey(val)
  }

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)

    let finalStoreId = storeId.trim()
    let finalSyncKey = syncKey.trim()

    // Safeguard: swap if user reversed them
    if (finalStoreId.toLowerCase().startsWith('tinda_') && !finalSyncKey.toLowerCase().startsWith('tinda_')) {
      const temp = finalStoreId
      finalStoreId = finalSyncKey
      finalSyncKey = temp
    }

    if (!finalStoreId || !finalSyncKey) {
      setError('Please provide both Store ID and Sync Key.')
      setLoading(false)
      return
    }

    try {
      await request('/api/owner/branch/link', {
        method: 'POST',
        body: JSON.stringify({
          store_id: finalStoreId.toLowerCase(),
          sync_key: finalSyncKey,
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

        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
          On your TINDA POS PC, open <strong>Settings</strong> → <strong>Live Cloud Sync Integration</strong>. Click <strong>Copy 1-Click Link Code</strong> (or copy Store ID & Sync Key separately) and paste below.
        </p>

        {notice && (
          <div
            style={{
              background: 'rgba(14, 165, 233, 0.12)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
              color: '#7dd3fc',
              marginBottom: 16
            }}
          >
            {notice}
          </div>
        )}

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
            <label className="input-label">Store ID (or Paste 1-Click Link Code here)</label>
            <input
              type="text"
              required
              className="input-field"
              value={storeId}
              onChange={(e) => handleStoreIdChange(e.target.value)}
              placeholder="e.g. 07c9823f-3f3a-41a3-b8b7-74c692931bb8"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Branch Sync Key (Secret Token)</label>
            <input
              type="text"
              required
              className="input-field"
              value={syncKey}
              onChange={(e) => handleSyncKeyChange(e.target.value)}
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
