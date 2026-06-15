import React, { useState, useEffect } from 'react'

const UNITS = ['Hz', 'kHz', 'MHz']
const MULTIPLIERS = { Hz: 1, kHz: 1e3, MHz: 1e6 }

// HackRF: 1 MHz – 6 GHz
const FREQ_MIN_HZ = 1e6
const FREQ_MAX_HZ = 6e9

export default function FrequencyInput({ value, onChange, label = 'Frequency' }) {
  const [unit, setUnit] = useState('MHz')
  const [raw, setRaw] = useState('')
  const [error, setError] = useState('')

  // sync external Hz value → display
  useEffect(() => {
    if (value != null) {
      const display = value / MULTIPLIERS[unit]
      setRaw(display % 1 === 0 ? String(display) : display.toFixed(6).replace(/0+$/, ''))
    }
  }, [value, unit])

  const validate = (numHz) => {
    if (isNaN(numHz)) return 'Invalid number'
    if (numHz < FREQ_MIN_HZ) return `Min 1 MHz (HackRF lower limit)`
    if (numHz > FREQ_MAX_HZ) return `Max 6 GHz (HackRF upper limit)`
    return ''
  }

  const handleChange = (e) => {
    const v = e.target.value
    setRaw(v)
    const numHz = parseFloat(v) * MULTIPLIERS[unit]
    const err = validate(numHz)
    setError(err)
    if (!err) onChange(numHz)
  }

  const handleUnit = (u) => {
    const prevMult = MULTIPLIERS[unit]
    const newMult  = MULTIPLIERS[u]
    const hz = parseFloat(raw) * prevMult
    setUnit(u)
    if (!isNaN(hz)) {
      const converted = hz / newMult
      setRaw(converted % 1 === 0 ? String(converted) : converted.toFixed(6).replace(/0+$/, ''))
    }
  }

  return (
    <div className="field-group">
      <label className="field-label">{label}</label>
      <div className={`freq-input-row ${error ? 'input-error' : ''}`}>
        <input
          type="number"
          className="input freq-value"
          value={raw}
          onChange={handleChange}
          placeholder="0"
          step="any"
        />
        <div className="unit-toggle">
          {UNITS.map(u => (
            <button
              key={u}
              className={`unit-btn ${unit === u ? 'active' : ''}`}
              onClick={() => handleUnit(u)}
              type="button"
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      {error && <span className="field-error">{error}</span>}
      {!error && value > 0 && (
        <span className="field-hint">{(value / 1e6).toFixed(6)} MHz</span>
      )}
    </div>
  )
}
