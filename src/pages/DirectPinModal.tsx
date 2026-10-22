import React, { useState } from 'react'
import { triggerHaptic } from '../utils'

interface Props {
  storeName: string
  error: string | null
  loading: boolean
  onUnlock: (pin: string) => void
  onCancel?: () => void
}

export const DirectPinModal: React.FC<Props> = ({
  storeName,
  error,
  loading,
  onUnlock,
  onCancel
}) => {
  const [pin, setPin] = useState('')

  const handleKeyPress = (digit: string) => {
    if (loading) return
    triggerHaptic('light')
    if (pin.length < 4) {
      const nextPin = pin + digit
      setPin(nextPin)
      if (nextPin.length === 4) {
        onUnlock(nextPin)
      }
    }
  }

  const handleDelete = () => {
    if (loading) return
    triggerHaptic('light')
    setPin((prev) => prev.slice(0, -1))
  }

  const handleClear = () => {
    if (loading) return
    triggerHaptic('light')
    setPin('')
  }

  return (
    <div className="pin-portal-overlay">
      <div className="pin-portal-card">
        {/* Apple Store Icon Header */}
        <div className="pin-store-badge">
          <span className="pin-store-icon">🏪</span>
        </div>

        <h2 className="pin-store-title">{storeName}</h2>
        <p className="pin-store-subtitle">Enter 4-Digit Owner Security PIN</p>

        {/* PIN Dots Display */}
        <div className="pin-dots-row">
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < pin.length
            return (
              <div
                key={idx}
                className={`pin-dot ${filled ? 'filled' : ''} ${error ? 'error' : ''}`}
              />
            )
          })}
        </div>

        {error && <div className="pin-error-message">⚠️ {error}</div>}

        {/* Numeric Keypad (Apple Cupertino Style) */}
        <div className="pin-keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={loading}
              onClick={() => handleKeyPress(digit)}
              className="pin-key-btn"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            disabled={loading || pin.length === 0}
            onClick={handleClear}
            className="pin-key-btn pin-key-text"
          >
            Clear
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleKeyPress('0')}
            className="pin-key-btn"
          >
            0
          </button>

          <button
            type="button"
            disabled={loading || pin.length === 0}
            onClick={handleDelete}
            className="pin-key-btn pin-key-text"
          >
            ⌫
          </button>
        </div>

        {onCancel && (
          <button type="button" onClick={onCancel} className="pin-cancel-btn">
            Switch to Regular Account Login
          </button>
        )}
      </div>
    </div>
  )
}
