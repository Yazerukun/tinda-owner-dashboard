import React from 'react'

interface Props {
  onClose: () => void
}

export const DownloadModal: React.FC<Props> = ({ onClose }) => {
  const version = 'v1.0.54'
  const releaseUrl = 'https://github.com/Yazerukun/TINDA-POS/releases/tag/v1.0.54'

  const downloadLinks = [
    {
      name: 'Windows Installer (Setup)',
      file: 'TindaPOS-Setup-1.0.54.exe',
      size: '107 MB',
      icon: '🪟',
      desc: 'Recommended for Windows 10/11 desktop PCs & POS touch terminals.',
      url: `https://github.com/Yazerukun/TINDA-POS/releases/download/${version}/TindaPOS-Setup-1.0.54.exe`
    },
    {
      name: 'Windows Portable (No Install)',
      file: 'TindaPOS-Portable-1.0.54.exe',
      size: '107 MB',
      icon: '💼',
      desc: 'Run directly from a USB flash drive or folder without administrator setup.',
      url: `https://github.com/Yazerukun/TINDA-POS/releases/download/${version}/TindaPOS-Portable-1.0.54.exe`
    },
    {
      name: 'Linux AppImage (Universal)',
      file: 'TindaPOS-1.0.54.AppImage',
      size: '130 MB',
      icon: '🐧',
      desc: 'Universal portable Linux executable for Omarchy, Ubuntu, Debian, and Arch.',
      url: `https://github.com/Yazerukun/TINDA-POS/releases/download/${version}/TindaPOS-1.0.54.AppImage`
    }
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="brand-icon-box" style={{ width: 40, height: 40, fontSize: 20 }}>
              🚀
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Download TINDA POS</span>
                <span className="badge badge-live" style={{ fontSize: '0.72rem' }}>{version}</span>
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Production Release • Oct 4, 2026
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: 'var(--text-secondary)',
              width: 32,
              height: 32,
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

        {/* Highlights banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(99, 102, 241, 0.1))',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
          marginBottom: 18
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#38bdf8', marginBottom: 4 }}>
            ✨ What's New in v1.0.54:
          </div>
          <ul style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', paddingLeft: 18, lineHeight: 1.5 }}>
            <li><strong style={{ color: '#fff' }}>Multi-Cashier Accounts:</strong> Role-based access (Owner, Supervisor, Cashier) with individual login PINs.</li>
            <li><strong style={{ color: '#fff' }}>Modern Categorized Sidebar:</strong> Quick navigation by Operations, Inventory & Financials, and System.</li>
            <li><strong style={{ color: '#fff' }}>Target Quota Shift Tracking:</strong> Live shift target status and reconciliation audits.</li>
            <li><strong style={{ color: '#fff' }}>VIP E-Wallet Hub:</strong> GCash & Maya Cash-In/Out with service fee profit tracking.</li>
          </ul>
        </div>

        {/* Download Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {downloadLinks.map((item, idx) => (
            <a
              key={idx}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                textDecoration: 'none',
                color: 'inherit',
                border: '1px solid var(--border-light)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-cyan)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-light)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>{item.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {item.desc}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 70 }}>
                <span className="badge badge-muted tabular-nums" style={{ fontSize: '0.72rem' }}>
                  {item.size}
                </span>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: 700, marginTop: 4 }}>
                  Download ↓
                </div>
              </div>
            </a>
          ))}
        </div>

        {/* Footer link to GitHub */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <a
            href={releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <span>🔗 View GitHub Release & Checksums</span>
            <span>↗</span>
          </a>
          <button onClick={onClose} className="btn btn-secondary btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
