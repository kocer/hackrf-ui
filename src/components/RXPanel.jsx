import React, { useState } from 'react'
import FrequencyInput from './FrequencyInput.jsx'
import WaterfallDisplay from './WaterfallDisplay.jsx'

const MODULATIONS = ['AM', 'FM', 'NFM', 'WFM', 'USB', 'LSB', 'CW']
const SAMPLE_RATES = [
  { label: '2 Msps',  value: 2e6  },
  { label: '4 Msps',  value: 4e6  },
  { label: '8 Msps',  value: 8e6  },
  { label: '10 Msps', value: 10e6 },
  { label: '20 Msps', value: 20e6 },
]
const BANDWIDTHS = [
  { label: '200 kHz', value: 200e3 },
  { label: '600 kHz', value: 600e3 },
  { label: '1.75 MHz', value: 1.75e6 },
  { label: '2.5 MHz', value: 2.5e6 },
  { label: '5 MHz',  value: 5e6  },
]

export default function RXPanel({ running, onStart, onStop, disabled }) {
  const [freq,       setFreq]       = useState(100.0e6)  // 100 MHz default
  const [mod,        setMod]        = useState('WFM')
  const [sampleRate, setSampleRate] = useState(2e6)
  const [bandwidth,  setBandwidth]  = useState(1.75e6)
  const [lnaGain,    setLnaGain]    = useState(16)
  const [vgaGain,    setVgaGain]    = useState(20)
  const [freqValid,  setFreqValid]  = useState(true)

  const handleFreqChange = (hz) => {
    setFreqValid(true)
    setFreq(hz)
  }

  const handleStart = () => {
    if (!freqValid || freq <= 0) return
    onStart({ frequency: freq, modulation: mod, sampleRate, bandwidth, lnaGain, vgaGain })
  }

  return (
    <section className="panel rx-panel">
      <div className="panel-header">
        <span className="panel-tag rx-tag">RX</span>
        <span className="panel-title">Receive</span>
        <span className={`panel-status ${running ? 'running' : ''}`}>
          {running ? 'ACTIVE' : 'IDLE'}
        </span>
      </div>

      <div className="panel-body">
        {/* Controls row */}
        <div className="controls-grid">
          <FrequencyInput value={freq} onChange={handleFreqChange} label="Center Frequency" />

          <div className="field-group">
            <label className="field-label">Modulation</label>
            <div className="pill-group">
              {MODULATIONS.map(m => (
                <button
                  key={m}
                  className={`pill ${mod === m ? 'active' : ''}`}
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

          {/* Gain sliders */}
          <div className="field-row-2">
            <div className="field-group">
              <label className="field-label">LNA Gain: <strong>{lnaGain} dB</strong></label>
              <input
                type="range" min={0} max={40} step={8}
                value={lnaGain}
                onChange={e => setLnaGain(Number(e.target.value))}
                className="slider"
                disabled={running}
              />
              <div className="slider-ticks"><span>0</span><span>8</span><span>16</span><span>24</span><span>32</span><span>40</span></div>
            </div>
            <div className="field-group">
              <label className="field-label">VGA Gain: <strong>{vgaGain} dB</strong></label>
              <input
                type="range" min={0} max={62} step={2}
                value={vgaGain}
                onChange={e => setVgaGain(Number(e.target.value))}
                className="slider"
                disabled={running}
              />
              <div className="slider-ticks"><span>0</span><span>16</span><span>32</span><span>48</span><span>62</span></div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="action-row">
          <button
            className="btn btn-rx btn-large"
            onClick={handleStart}
            disabled={running || disabled}
          >
            ▶ Start RX
          </button>
          <button
            className="btn btn-stop btn-large"
            onClick={onStop}
            disabled={!running}
          >
            ■ Stop RX
          </button>
        </div>

        {/* Waterfall */}
        <WaterfallDisplay
          running={running}
          centerFreq={freq}
          sampleRate={sampleRate}
        />
      </div>
    </section>
  )
}
