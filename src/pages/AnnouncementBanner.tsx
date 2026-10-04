import React, { useState, useEffect } from 'react'
import { request } from '../api'
import type { LiveAnnouncement } from '../types'
import { triggerHaptic } from '../utils'

interface Props {
  onOpenDownload: () => void
}

export const AnnouncementBanner: React.FC<Props> = ({ onOpenDownload }) => {
  const [announcements, setAnnouncements] = useState<LiveAnnouncement[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const res = await request<{ ok: boolean; announcements: LiveAnnouncement[] }>('/api/announcements')
        if (res && res.announcements) {
          setAnnouncements(res.announcements)
        }
      } catch (err) {
        console.error('Failed to load announcements', err)
      }
    }
    fetchAnnouncements()
  }, [])

  const activeAnnouncements = announcements.filter((a) => !dismissed.includes(a.id))
  if (activeAnnouncements.length === 0) return null

  const top = activeAnnouncements[0]

  return (
    <div
      style={{
        background: 'linear-gradient(90deg, rgba(14, 165, 233, 0.2), rgba(99, 102, 241, 0.2))',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
        <span style={{ fontSize: 18 }}>📢</span>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#fff' }}>
              {top.title}
            </span>
            {top.version_target && (
              <span className="badge badge-live" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                {top.version_target}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.76rem', color: '#cbd5e1', marginTop: 2 }}>
            {top.message}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => {
            triggerHaptic('light')
            onOpenDownload()
          }}
          className="btn btn-primary btn-sm"
          style={{ padding: '4px 12px', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <span>📥 Get Update</span>
        </button>
        <button
          onClick={() => {
            triggerHaptic('light')
            setDismissed((prev) => [...prev, top.id])
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: 4,
            fontSize: 16
          }}
          title="Dismiss banner"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
