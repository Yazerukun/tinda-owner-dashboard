import React, { useState, useEffect, useRef } from 'react'
import { request, formatDateTime } from '../api'
import type { GlobalChatMessage } from '../types'
import { triggerHaptic } from '../utils'

interface Props {
  onClose: () => void
}

export const CommunityChatModal: React.FC<Props> = ({ onClose }) => {
  const [messages, setMessages] = useState<GlobalChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [senderName, setSenderName] = useState(() => localStorage.getItem('tinda_owner_name') || 'Owner')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const loadMessages = async () => {
    try {
      const res = await request<{ ok: boolean; messages: GlobalChatMessage[] }>('/api/chat/messages?limit=60')
      if (res && res.messages) {
        setMessages(res.messages)
      }
    } catch (err: any) {
      console.error('Failed to load chat messages', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMessages()
    const interval = setInterval(loadMessages, 8000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = newMessage.trim()
    if (!text || isSending) return

    setIsSending(true)
    setError(null)
    triggerHaptic('light')

    try {
      localStorage.setItem('tinda_owner_name', senderName.trim())
      await request('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          text,
          store_id: 'cloud_owner',
          store_name: 'Owner Executive Dashboard',
          sender_name: senderName.trim() || 'Owner',
          role: 'OWNER',
          is_vip: 1
        })
      })
      setNewMessage('')
      await loadMessages()
      triggerHaptic('success')
    } catch (err: any) {
      setError(err.message || 'Failed to send broadcast message')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 600, height: '85vh', display: 'flex', flexDirection: 'column', padding: '20px 20px 16px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>💬</span>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Live Broadcast & Chat</span>
                <span className="badge badge-live">Live Cloud</span>
              </h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Direct communication between Store Cashiers and Executive Dashboard
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

        {/* Sender Name Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.78rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Posting as:</span>
          <input
            type="text"
            className="input-field"
            style={{ padding: '4px 10px', fontSize: '0.78rem', width: 140 }}
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Owner Name"
          />
          <span className="badge badge-muted" style={{ color: 'var(--accent-amber)', fontSize: '0.7rem' }}>
            👑 Owner Role
          </span>
        </div>

        {/* Chat message scroll area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            paddingRight: 6,
            marginBottom: 14
          }}
        >
          {loading && messages.length === 0 ? (
            <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
              Loading live broadcast feed...
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
              No messages posted yet. Be the first to send a store broadcast!
            </div>
          ) : (
            messages.map((m) => {
              const isOwner = m.role === 'OWNER' || m.is_dev === 1
              return (
                <div
                  key={m.id}
                  style={{
                    background: isOwner ? 'rgba(14, 165, 233, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${isOwner ? 'rgba(56, 189, 248, 0.3)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    alignSelf: 'stretch'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.82rem', color: isOwner ? '#38bdf8' : '#fff' }}>
                        {m.sender_name}
                      </span>
                      {m.is_dev === 1 && (
                        <span className="badge" style={{ background: '#6366f1', color: '#fff', fontSize: '0.65rem' }}>
                          DEV
                        </span>
                      )}
                      {m.role === 'OWNER' && (
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontSize: '0.65rem' }}>
                          OWNER
                        </span>
                      )}
                      {m.store_name && m.store_name !== 'Owner Executive Dashboard' && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          • {m.store_name}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }} className="tabular-nums">
                      {formatDateTime(m.created_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.84rem', color: '#e2e8f0', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                    {m.text}
                  </div>
                </div>
              )
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {error && (
          <div style={{ fontSize: '0.75rem', color: 'var(--accent-rose)', marginBottom: 8 }}>
            {error}
          </div>
        )}

        {/* Input bar */}
        <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            className="input-field"
            placeholder="Type a broadcast message to all store branches..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={isSending}
            maxLength={400}
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            disabled={isSending || !newMessage.trim()}
            className="btn btn-primary"
            style={{ padding: '0 18px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>{isSending ? 'Sending...' : 'Send'}</span>
            <span>➤</span>
          </button>
        </form>
      </div>
    </div>
  )
}
