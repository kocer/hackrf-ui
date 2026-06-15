import React, { useState, useRef } from 'react'
import FrequencyInput from './FrequencyInput.jsx'

const MODULATIONS = ['AM', 'FM', 'NFM', 'WFM', 'USB', 'LSB', 'CW']
const SAMPLE_RATES = [
  { label: '2 Msps',  value: 2e6  },
  { label: '4 Msps',  value: 4e6  },
  { label: '8 Msps',  value: 8e6  },
  { label: '10 Msps', value: 10e6 },
]
const BANDWIDTHS = [
  { label: '200 kHz', value: 200e3  },
  { label: '600 kHz', value: 600e3  },
  { label: '1.75 MHz', value: 1.75e6 },
  { label: '2.5 MHz', value: 2.5e6  },
]
const ACCEPTED_FORMATS = '.wav,.iq,.cs8,.cf32,.cf64,.sc16'

function formatDuration(secs) {
  if (!secs) return '--:--'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024**2) return `${(n/1024).toFixed(1)} KB`
  return `${(n/1024**2).toFixed(2)} MB`
}

export default function TXPanel({ running, onStart, onStop, disabled }) {
  const [freq,       setFreq]       = useState(100.0e6)
  const [mod,        setMod]        = useState('FM')
  const [sampleRate, setSampleRate] = useState(2e6)
  const [bandwidth,  setBandwidth]  = useState(1.75e6)
  const [txGain,     setTxGain]     = useState(0)
  const [file,       setFile]       = useState(null)
  const [pttActive,  setPttActive]  = useState(false)
  const [showWarn,   setShowWarn]   = useState(false)
  const fileRef = useRef(null)

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile({
      name:  f.name,
      size:  f.size,
      raw:   f,
      // estimate duration for IQ files (cs8 = 2 bytes/sample)
      duration: f.name.endsWith('.wav') ? null : (f.size / 2 / sampleRate)
    })
  }

  const handleStart = () => {
    if (!file) return
    setShowWarn(true)
  }

  const confirmStart = () => {
    setShowWarn(false)
    onStart({ frequency: freq, modulation: mod, sampleRate, bandwidth, txGain, file: file.raw })
  }

  return (
    <section className="panel tx-panel">
      <div className="panel-header">
        <span className="panel-tag tx-tag">TX</span>
        <span className="panel-title">Transmit</span>
        <span className={`panel-status ${running ? 'running tx-running' : ''}`}>
          {running ? 'TRANSMITTING' : 'IDLE'}
        </span>
      </div>

      <div className="panel-body">
        <div className="controls-grid">
          <FrequencyInput value={freq} onChange={setFreq} label="TX Frequency" />

          <div className="field-group">
            <label className="field-label">Modulation</label>
            <div className="pill-group">
              {MODULATIONS.map(m => (
                <button
                  key={m}
                  className={`pill ${mod === m ? 'active tx-active' : ''}`}
                  onClick={() => setMod(m)}
                  type="button"
                  disabled={running}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="field-row-2">
            <div className="field-group">
              <label className="field-label">Sample Rate</label>
              <select
                className="input select"
                value={sampleRate}
                onChange={e => setSampleRate(Number(e.target.value))}
                disabled={running}
              >
                {SAMPLE_RATES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Bandwidth</label>
              <select
                className="input select"
                value={bandwidth}
                onChange={e => setBandwidth(Number(e.target.value))}
                disabled={running}
              >
                {BANDWIDTHS.map(b => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">TX Gain: <strong>{txGain} dB</strong></label>
            <input
              type="range" min={0} max={47} step={1}
              value={txGain}
              onChange={e => setTxGain(Number(e.target.value))}
              className="slider tx-slider"
              disabled={running}
            />
            <div className="slider-ticks">
              <span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>47</span>
            </div>
            {txGain > 30 && (
              <span className="field-warn">⚠ High TX gain — verify regulatory compliance</span>
            )}
          </div>

          {/* File upload */}
          <div className="field-group">
            <label className="field-label">Source File</label>
            <div
              className={`file-drop-zone ${file ? 'has-file' : ''}`}
              onClick={() => !running && fileRef.current?.click()}
            >
              {file ? (
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-meta">
                    {formatBytes(file.size)}
                    {file.duration && ` · ~${formatDuration(file.duration)}`}
                  </span>
                  {!running && (
                    <button
                      className="file-clear"
                      onClick={e => { e.stopPropagation(); setFile(null) }}
                    >✕</button>
                  )}
                </div>
              ) : (
                <div className="file-placeholder">
                  <span className="file-icon">⊕</span>
                  <span>Drop or click to load file</span>
                  <span className="file-formats">.wav · .iq · .cs8 · .cf32 · .sc16</span>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_FORMATS}
              className="hidden-file-input"
              onChange={handleFile}
            />
          </div>
        </div>

        {/* PTT + Actions */}
        <div className="action-row tx-action-row">
          <button
            className={`btn btn-ptt ${pttActive ? 'ptt-on' : ''}`}
            onMouseDown={() => setPttActive(true)}
            onMouseUp={() => setPttActive(false)}
            onTouchStart={() => setPttActive(true)}
            onTouchEnd={() => setPttActive(false)}
            disabled={!running}
            title="Push-To-Talk"
          >
            {pttActive ? '● PTT' : '○ PTT'}
          </button>

          <button
            className="btn btn-tx btn-large"
            onClick={handleStart}
            disabled={running || disabled || !file}
            title={!file ? 'Load a source file first' : ''}
          >
            ▶ Start TX
          </button>
          <button
            className="btn btn-stop btn-large"
            onClick={onStop}
            disabled={!running}
          >
            ■ Stop TX
          </button>
        </div>

        {/* TX confirm dialog */}
        {showWarn && (
          <div className="tx-warn-overlay">
            <div className="tx-warn-dialog">
              <div className="tx-warn-icon">⚠</div>
              <h3>Confirm Transmission</h3>
              <p>
                You are about to transmit on <strong>{(freq/1e6).toFixed(4)} MHz</strong> using <strong>{mod}</strong>.
              </p>
              <p className="tx-warn-legal">
                Ensure you have proper authorization to transmit on this frequency.
                Unauthorized radio transmissions may violate local regulations.
              </p>
              <div className="tx-warn-actions">
                <button className="btn btn-ghost" onClick={() => setShowWarn(false)}>Cancel</button>
                <button className="btn btn-tx" onClick={confirmStart}>Confirm &amp; Transmit</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
