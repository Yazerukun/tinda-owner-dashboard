import React, { useState, useEffect } from 'react'
import { getToken, clearToken, request } from './api'
import { LoginPage } from './pages/LoginPage'
import { OverviewPage } from './pages/OverviewPage'
import { BranchDetailPage } from './pages/BranchDetailPage'
import { AnnouncementBanner } from './pages/AnnouncementBanner'
import { DownloadModal } from './pages/DownloadModal'
import { CommunityChatModal } from './pages/CommunityChatModal'
import { triggerHaptic } from './utils'
import './styles.css'

function getLocalToday(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const App: React.FC = () => {
  const [token, setSessionToken] = useState<string | null>(getToken())
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [showChatModal, setShowChatModal] = useState(false)
  const [pairingNotice, setPairingNotice] = useState<{ status: 'success' | 'error' | 'loading'; message: string } | null>(null)

  const today = getLocalToday()
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)

  useEffect(() => {
    if (!token) return

    const params = new URLSearchParams(window.location.search)
    const sid = params.get('sid') || params.get('store_id')
    const key = params.get('key') || params.get('sync_key')
    const name = params.get('name') || params.get('branch_name') || 'Store Branch'

    const executeLink = async (storeIdToLink: string, syncKeyToLink: string, branchNameToLink: string) => {
      setPairingNotice({ status: 'loading', message: `Pairing "${branchNameToLink}" to your owner account...` })
      try {
        const res = await request<any>('/api/owner/branch/link', {
          method: 'POST',
          body: JSON.stringify({
            store_id: storeIdToLink.trim().toLowerCase(),
            sync_key: syncKeyToLink.trim(),
            branch_name: branchNameToLink.trim()
          })
        })
        setPairingNotice({ status: 'success', message: res.message || `🎉 Successfully linked "${branchNameToLink}"!` })
        setSelectedBranch(storeIdToLink.trim().toLowerCase())
        window.history.replaceState({}, '', window.location.pathname)
      } catch (err: any) {
        setPairingNotice({ status: 'error', message: err.message || 'Failed to auto-link store.' })
      }
    }

    if (sid && key) {
      void executeLink(sid, key, name)
    } else {
      const pendingRaw = sessionStorage.getItem('tinda_pending_link')
      if (pendingRaw) {
        try {
          const { sid: pSid, key: pKey, name: pName } = JSON.parse(pendingRaw)
          sessionStorage.removeItem('tinda_pending_link')
          void executeLink(pSid, pKey, pName)
        } catch {}
      }
    }
  }, [token])

  const handleLogout = () => {
    triggerHaptic('light')
    clearToken()
    setSessionToken(null)
    setSelectedBranch(null)
  }

  if (!token) {
    return <LoginPage onLoginSuccess={() => setSessionToken(getToken())} />
  }

  return (
    <div className="app-container">
      {/* Top Apple Chrome Header */}
      <header className="app-header">
        <div className="brand" onClick={() => setSelectedBranch(null)}>
          <div className="brand-icon-box">
            🏪
          </div>
          <div className="brand-title-wrap">
            <div className="brand-name">
              <span>TINDA POS</span>
              <span className="brand-badge">Cloud</span>
            </div>
            <div className="brand-subtext">Executive Sales Telemetry • v3.0.2</div>
          </div>
        </div>

        <div className="header-right">
          <button
            onClick={() => {
              triggerHaptic('light')
              setShowDownloadModal(true)
            }}
            className="btn btn-secondary btn-sm header-action-btn"
            title="Download TINDA POS Desktop Release"
          >
            📥 v3.0.2 App
          </button>

          <button
            onClick={() => {
              triggerHaptic('light')
              setShowChatModal(true)
            }}
            className="btn btn-secondary btn-sm header-action-btn"
            title="Live Store Broadcast & Cashier Chat"
          >
            💬 Broadcast
          </button>

          <div className="live-beacon">
            <span className="beacon-dot" />
            <span>Connected</span>
          </div>

          <button onClick={handleLogout} className="btn btn-secondary btn-sm" title="Sign out of owner dashboard">
            Sign Out
          </button>
        </div>
      </header>

      {/* Live System Announcements Banner */}
      <AnnouncementBanner onOpenDownload={() => setShowDownloadModal(true)} />

      {pairingNotice && (
        <div
          style={{
            maxWidth: 1200,
            margin: '12px auto 0',
            padding: '12px 20px',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background:
              pairingNotice.status === 'success'
                ? 'rgba(16, 185, 129, 0.15)'
                : pairingNotice.status === 'error'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(14, 165, 233, 0.15)',
            border:
              pairingNotice.status === 'success'
                ? '1px solid rgba(16, 185, 129, 0.4)'
                : pairingNotice.status === 'error'
                ? '1px solid rgba(239, 68, 68, 0.4)'
                : '1px solid rgba(14, 165, 233, 0.4)',
            color:
              pairingNotice.status === 'success'
                ? '#34d399'
                : pairingNotice.status === 'error'
                ? '#f87171'
                : '#38bdf8',
            fontSize: '0.88rem',
            fontWeight: 700
          }}
        >
          <span>{pairingNotice.message}</span>
          <button
            onClick={() => setPairingNotice(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 16,
              marginLeft: 12
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main>
        {selectedBranch ? (
          <BranchDetailPage
            storeId={selectedBranch}
            from={fromDate}
            to={toDate}
            onDateChange={(f, t) => {
              setFromDate(f)
              setToDate(t)
            }}
            onBack={() => setSelectedBranch(null)}
          />
        ) : (
          <OverviewPage
            from={fromDate}
            to={toDate}
            onSelectBranch={(storeId) => setSelectedBranch(storeId)}
            onDateChange={(f, t) => {
              setFromDate(f)
              setToDate(t)
            }}
          />
        )}
      </main>

      {showDownloadModal && (
        <DownloadModal onClose={() => setShowDownloadModal(false)} />
      )}

      {showChatModal && (
        <CommunityChatModal onClose={() => setShowChatModal(false)} />
      )}
    </div>
  )
}

export default App
