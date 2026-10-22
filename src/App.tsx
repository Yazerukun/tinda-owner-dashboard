import React, { useState, useEffect } from 'react'
import { getToken, clearToken, request, getApiBase, getActiveCloudGateway, subscribeGatewayChange, type ActiveCloudGateway } from './api'
import { LoginPage } from './pages/LoginPage'
import { OverviewPage } from './pages/OverviewPage'
import { BranchDetailPage } from './pages/BranchDetailPage'
import { AnnouncementBanner } from './pages/AnnouncementBanner'
import { DownloadModal } from './pages/DownloadModal'
import { CommunityChatModal } from './pages/CommunityChatModal'
import { DirectPinModal } from './pages/DirectPinModal'
import { triggerHaptic } from './utils'
import type { BranchDetailResponse } from './types'
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
  const [activeGateway, setActiveGateway] = useState<ActiveCloudGateway>(getActiveCloudGateway())

  useEffect(() => {
    return subscribeGatewayChange((gw) => setActiveGateway(gw))
  }, [])
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [showChatModal, setShowChatModal] = useState(false)
  const [pairingNotice, setPairingNotice] = useState<{ status: 'success' | 'error' | 'loading'; message: string } | null>(null)

  const today = getLocalToday()
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)

  // Direct Store Portal state (Zero-Pairing with 4-Digit PIN)
  const [directStoreQuery, setDirectStoreQuery] = useState<string | null>(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      return p.get('store') || p.get('s') || p.get('portal') || null
    } catch {
      return null
    }
  })
  const [directStoreMeta, setDirectStoreMeta] = useState<{
    id: string
    branch_name: string
    slug: string | null
    has_pin: boolean
  } | null>(null)
  const [directPortalData, setDirectPortalData] = useState<BranchDetailResponse | null>(null)
  const [directPinError, setDirectPinError] = useState<string | null>(null)
  const [directPinLoading, setDirectPinLoading] = useState(false)
  const [portalUnlocked, setPortalUnlocked] = useState(false)

  // Check if URL has ?store=slug
  useEffect(() => {
    if (!directStoreQuery) return

    const lookupStore = async () => {
      try {
        setDirectPinLoading(true)
        const base = getApiBase()
        const res = await fetch(`${base}/api/portal/lookup?store=${encodeURIComponent(directStoreQuery)}`)
        const text = await res.text()
        let data: any
        try {
          data = JSON.parse(text)
        } catch {
          throw new Error(text || `Server error (${res.status})`)
        }
        if (data.ok && data.store) {
          setDirectStoreMeta(data.store)
          // If store does not have a PIN configured, unlock immediately!
          if (!data.store.has_pin) {
            void executeDirectUnlock('')
          }
        } else {
          setDirectPinError(data.error || 'Store not found.')
        }
      } catch (e: any) {
        setDirectPinError(e.message || 'Failed to connect to server.')
      } finally {
        setDirectPinLoading(false)
      }
    }

    void lookupStore()
  }, [directStoreQuery])

  const executeDirectUnlock = async (pinEntered: string) => {
    if (!directStoreQuery) return
    setDirectPinLoading(true)
    setDirectPinError(null)

    try {
      const base = getApiBase()
      const res = await fetch(`${base}/api/portal/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: directStoreQuery,
          pin: pinEntered,
          from: fromDate,
          to: toDate
        })
      })
      const text = await res.text()
      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(text || `Server error (${res.status})`)
      }

      if (data.ok) {
        triggerHaptic('success')
        setDirectPortalData(data)
        setPortalUnlocked(true)
      } else {
        triggerHaptic('error')
        setDirectPinError(data.error || 'Invalid 4-Digit Security PIN.')
      }
    } catch (e: any) {
      setDirectPinError(e.message || 'Network error while unlocking.')
    } finally {
      setDirectPinLoading(false)
    }
  }

  // Refresh direct portal telemetry when date range changes
  useEffect(() => {
    if (portalUnlocked && directStoreQuery) {
      void executeDirectUnlock('')
    }
  }, [fromDate, toDate])

  // Regular account pairing logic
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
    setPortalUnlocked(false)
    setDirectStoreQuery(null)
    setDirectPortalData(null)
  }

  // If viewing via Direct Store Portal mode
  if (directStoreQuery) {
    if (!portalUnlocked && directStoreMeta) {
      return (
        <DirectPinModal
          storeName={directStoreMeta.branch_name}
          error={directPinError}
          loading={directPinLoading}
          onUnlock={executeDirectUnlock}
          onCancel={() => {
            setDirectStoreQuery(null)
            window.history.replaceState({}, '', window.location.pathname)
          }}
        />
      )
    }

    if (portalUnlocked && directPortalData) {
      return (
        <div className="app-container">
          <header className="app-header">
            <div className="brand">
              <div className="brand-icon-box">🏪</div>
              <div className="brand-title-wrap">
                <div className="brand-name">
                  <span>{directPortalData.store.branch_name}</span>
                  <span className="brand-badge">Direct Portal</span>
                </div>
                <div className="brand-subtext">Live Owner Telemetry • PIN Protected</div>
              </div>
            </div>

            <div className="header-right">
              <button
                onClick={() => executeDirectUnlock('')}
                className="btn btn-secondary btn-sm header-action-btn"
                title="Refresh Live Sales"
              >
                🔄 Refresh
              </button>
              <button
                onClick={handleLogout}
                className="btn btn-secondary btn-sm"
                title="Exit Direct Portal"
              >
                Exit Portal
              </button>
            </div>
          </header>

          {(directPortalData as any)._notice && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: 12,
              padding: '10px 16px',
              margin: '12px 16px 0',
              fontSize: '0.82rem',
              color: '#fcd34d',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span>⚡</span>
              <span>{(directPortalData as any)._notice}</span>
            </div>
          )}

          <main>
            <BranchDetailPage
              storeId={directPortalData.store.id}
              from={fromDate}
              to={toDate}
              onDateChange={(f, t) => {
                setFromDate(f)
                setToDate(t)
              }}
              onBack={() => {}}
              portalData={directPortalData}
              onRefreshPortal={() => executeDirectUnlock('')}
            />
          </main>
        </div>
      )
    }
  }

  if (!token) {
    return <LoginPage onLoginSuccess={() => setSessionToken(getToken())} />
  }

  return (
    <div className="app-container">
      {/* Top Apple Chrome Header */}
      <header className="app-header">
        <div className="brand" onClick={() => setSelectedBranch(null)}>
          <div className="brand-icon-box">🏪</div>
          <div className="brand-title-wrap">
            <div className="brand-name">
              <span>TINDA POS</span>
              <span className="brand-badge">Cloud</span>
            </div>
            <div className="brand-subtext">Executive Sales Telemetry • v1.0.54</div>
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
            📥 v1.0.54 App
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

          <div className="live-beacon" title={activeGateway === 'supabase' ? 'Dual-Cloud Failover Active (Supabase PostgreSQL)' : 'Primary Cloud Active (Cloudflare D1)'}>
            <span className="beacon-dot" style={{ backgroundColor: activeGateway === 'supabase' ? '#38bdf8' : '#10b981' }} />
            <span>{activeGateway === 'supabase' ? 'Supabase Cloud' : 'Cloudflare D1'}</span>
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
