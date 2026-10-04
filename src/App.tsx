import React, { useState } from 'react'
import { getToken, clearToken } from './api'
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

  const today = getLocalToday()
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)

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

      {/* Main Content Area */}
      <main>
        {selectedBranch ? (
          <BranchDetailPage
            storeId={selectedBranch}
            from={fromDate}
            to={toDate}
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
