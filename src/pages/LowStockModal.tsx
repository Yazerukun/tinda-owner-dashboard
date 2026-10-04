import React, { useState } from 'react'
import type { LowStockItemRow } from '../types'
import { formatDateTime } from '../api'
import { triggerHaptic } from '../utils'

interface Props {
  branchName: string
  items: LowStockItemRow[]
  onClose: () => void
  onJumpToTable: () => void
}

export const LowStockModal: React.FC<Props> = ({ branchName, items, onClose, onJumpToTable }) => {
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  const filtered = items.filter((it) =>
    it.product_name.toLowerCase().includes(search.toLowerCase())
  )

  const handleCopy = () => {
    triggerHaptic('success')
    const lines = [
      `📦 RESTOCK ORDER - ${branchName.toUpperCase()}`,
      `Date: ${new Date().toLocaleDateString('en-PH')}`,
      `---------------------------------`,
      ...items.map(
        (it, idx) => `${idx + 1}. ${it.product_name} - Remaining: ${it.quantity_after} ${it.unit}`
      ),
      `---------------------------------`,
      `Please confirm order availability and delivery schedule.`
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 650, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>⚠️</span>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Low Stock Items Alert</span>
                <span className="badge" style={{ background: 'rgba(244,63,94,0.2)', color: '#fda4af' }}>
                  {items.length} Needs Restocking
                </span>
              </h3>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {branchName} • Items approaching critical zero balance (≤ 10 units)
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

        {/* Search & Actions Bar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input-field"
            style={{ flex: 1, minWidth: 200, padding: '7px 12px', fontSize: '0.82rem' }}
            placeholder="Search low stock product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button onClick={handleCopy} className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}>
            {copied ? '✓ Copied for Supplier!' : '📋 Copy Supplier Order'}
          </button>
        </div>

        {/* Items List Scrollable */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingRight: 4,
            marginBottom: 14
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              No products found matching "{search}".
            </div>
          ) : (
            filtered.map((it, idx) => {
              const isOut = it.quantity_after <= 0
              return (
                <div
                  key={idx}
                  style={{
                    background: isOut ? 'rgba(244, 63, 94, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                    border: `1px solid ${isOut ? 'rgba(244, 63, 94, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.product_name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      Last moved: {formatDateTime(it.moved_at)}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="tabular-nums" style={{ fontSize: '1.05rem', fontWeight: 800, color: isOut ? 'var(--accent-rose)' : '#fbbf24' }}>
                      {it.quantity_after} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{it.unit}</span>
                    </div>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 4,
                        marginTop: 2,
                        background: isOut ? 'rgba(244, 63, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        color: isOut ? '#fca5a5' : '#fde047'
                      }}
                    >
                      {isOut ? 'OUT OF STOCK' : 'CRITICAL LOW'}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: 10 }}>
          <button
            onClick={() => {
              triggerHaptic('light')
              onJumpToTable()
            }}
            className="btn btn-secondary btn-sm"
          >
            📜 Jump to Full Inventory Table
          </button>
          <button onClick={onClose} className="btn btn-secondary btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
