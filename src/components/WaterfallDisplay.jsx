import React, { useRef, useEffect, useState } from 'react'
import { useWaterfall } from '../hooks/useWaterfall.js'
import { openSpectrumSocket } from '../api/hackrf.js'

const SPECTRUM_HEIGHT = 100
const WATERFALL_HEIGHT = 180
const NOISE_FLOOR = -110
const PEAK = -20
const FFT_SIZE = 1024

function normalize(v) {
  return Math.max(0, Math.min(1, (v - NOISE_FLOOR) / (PEAK - NOISE_FLOOR)))
}

function mockSpectrum(running) {
  const bins = new Float32Array(FFT_SIZE)
  bins.fill(NOISE_FLOOR + (Math.random() * 4 - 2))
  if (!running) return bins

  const signals = [
    { bin: Math.floor(FFT_SIZE * 0.25), width: 8,  amp: 35 },
    { bin: Math.floor(FFT_SIZE * 0.5),  width: 20, amp: 55 },
    { bin: Math.floor(FFT_SIZE * 0.72), width: 5,  amp: 28 },
  ]
  for (const s of signals) {
    for (let d = -s.width; d <= s.width; d++) {
      const idx = s.bin + d
      if (idx >= 0 && idx < FFT_SIZE) {
        const g = Math.exp(-(d * d) / (2 * (s.width / 2.5) ** 2))
        bins[idx] = Math.max(bins[idx], NOISE_FLOOR + s.amp * g + (Math.random() * 2))
      }
    }
  }
  return bins
}

function colormap(t) {
  if (t < 0.2)  return [Math.round(10 + t/0.2*30), Math.round(5 + t/0.2*20), Math.round(60 + t/0.2*80)]
  if (t < 0.45) { const f=(t-0.2)/0.25; return [Math.round(40+f*10), Math.round(25+f*160), Math.round(140+f*60)] }
  if (t < 0.7)  { const f=(t-0.45)/0.25; return [Math.round(50+f*180), Math.round(185+f*60), Math.round(200-f*120)] }
  { const f=(t-0.7)/0.3; return [Math.round(230+f*25), 245, Math.round(80-f*60)] }
}

export default function WaterfallDisplay({ running, centerFreq, sampleRate = 2e6 }) {
  const specCanvasRef = useRef(null)
  const wtfCanvasRef  = useRef(null)
  const animRef       = useRef(null)
  const wsRef         = useRef(null)
  const latestBinsRef = useRef(null)
  const [feedState, setFeedState] = useState('idle')

  useWaterfall(wtfCanvasRef, latestBinsRef, running, centerFreq)

  useEffect(() => {
    latestBinsRef.current = null

    if (!running) {
      setFeedState('idle')
      return undefined
    }

    setFeedState('link')
    const ws = openSpectrumSocket((data) => {
      latestBinsRef.current = data
      setFeedState('live')
    })
    wsRef.current = ws
    ws.onerror = () => setFeedState(prev => (prev === 'live' ? prev : 'mock'))
    ws.onclose = () => setFeedState(prev => (prev === 'live' ? prev : 'mock'))

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [running, centerFreq, sampleRate])

  // draw spectrum (top line chart)
  useEffect(() => {
    const canvas = specCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let fc = 0

    const loop = () => {
      fc++
      if (fc % 2 === 0) {
        const bins = latestBinsRef.current || mockSpectrum(running)
        const { width, height } = canvas
        ctx.clearRect(0, 0, width, height)

        // grid lines
        ctx.strokeStyle = '#1e2a3a'
        ctx.lineWidth = 1
        for (let db = NOISE_FLOOR; db <= PEAK; db += 10) {
          const y = height - ((db - NOISE_FLOOR) / (PEAK - NOISE_FLOOR)) * height
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
        }

        // spectrum fill
        const grad = ctx.createLinearGradient(0, 0, 0, height)
        grad.addColorStop(0, 'rgba(0,220,180,0.8)')
        grad.addColorStop(1, 'rgba(0,100,80,0.1)')
        ctx.fillStyle = grad
        ctx.strokeStyle = '#00ddb4'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, height)
        for (let x = 0; x < width; x++) {
          const binIdx = Math.floor((x / width) * FFT_SIZE)
          const v = normalize(bins[binIdx])
          ctx.lineTo(x, height - v * height)
        }
        ctx.lineTo(width, height)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        for (let x = 0; x < width; x++) {
          const binIdx = Math.floor((x / width) * FFT_SIZE)
          const v = normalize(bins[binIdx])
          x === 0 ? ctx.moveTo(x, height - v * height) : ctx.lineTo(x, height - v * height)
        }
        ctx.stroke()

        // dB labels
        ctx.fillStyle = '#3a5068'
        ctx.font = '9px JetBrains Mono'
        for (let db = NOISE_FLOOR; db <= PEAK; db += 10) {
          const y = height - ((db - NOISE_FLOOR) / (PEAK - NOISE_FLOOR)) * height
          ctx.fillText(`${db}`, 3, y - 2)
        }
      }
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  // freq axis labels below waterfall
  const halfSR = sampleRate / 2
  const freqLabels = [-halfSR, -halfSR/2, 0, halfSR/2, halfSR].map(offset => ({
    label: `${((centerFreq + offset) / 1e6).toFixed(2)}`,
    pct: ((offset + halfSR) / sampleRate) * 100
  }))

  return (
    <div className="waterfall-container">
      <div className="panel-section-label">SPECTRUM / WATERFALL</div>

      <canvas
        ref={specCanvasRef}
        className="spectrum-canvas"
        width={1024}
        height={SPECTRUM_HEIGHT}
      />
      <canvas
        ref={wtfCanvasRef}
        className="waterfall-canvas"
        width={1024}
        height={WATERFALL_HEIGHT}
      />

      {/* Freq axis */}
      <div className="freq-axis">
        {freqLabels.map((l, i) => (
          <span key={i} className="freq-axis-label" style={{ left: `${l.pct}%` }}>
            {l.label}
          </span>
        ))}
        <span className="freq-axis-unit">MHz</span>
      </div>

      {/* Signal info bar */}
      <div className="signal-info-bar">
        <span>CF: <strong>{(centerFreq / 1e6).toFixed(4)} MHz</strong></span>
        <span>SR: <strong>{(sampleRate / 1e6).toFixed(1)} Msps</strong></span>
        <span>Floor: <strong>{NOISE_FLOOR} dBm</strong></span>
        <span>FFT: <strong>{feedState === 'live' ? 'LIVE' : feedState === 'link' ? 'LINKING' : feedState === 'mock' ? 'SIM' : 'IDLE'}</strong></span>
        <span className={`signal-state ${running ? 'active' : ''}`}>
          {running ? '● STREAMING' : '○ IDLE'}
        </span>
      </div>
    </div>
  )
}
