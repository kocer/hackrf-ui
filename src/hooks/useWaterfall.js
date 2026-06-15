import { useEffect, useRef, useCallback } from 'react'

const FFT_SIZE = 1024
const NOISE_FLOOR = -110  // dBm
const PEAK = -20          // dBm

/** Generate plausible mock FFT frame */
function mockFrame(centerFreq, running) {
  const bins = new Float32Array(FFT_SIZE)
  if (!running) {
    bins.fill(NOISE_FLOOR + (Math.random() * 4 - 2))
    return bins
  }
  // noise floor
  for (let i = 0; i < FFT_SIZE; i++) {
    bins[i] = NOISE_FLOOR + (Math.random() * 6 - 3)
  }
  // simulate 2-3 signals
  const signals = [
    { bin: Math.floor(FFT_SIZE * 0.25), width: 8, amp: 35 },
    { bin: Math.floor(FFT_SIZE * 0.5),  width: 20, amp: 55 },
    { bin: Math.floor(FFT_SIZE * 0.72), width: 5, amp: 28 },
  ]
  for (const s of signals) {
    for (let d = -s.width; d <= s.width; d++) {
      const idx = s.bin + d
      if (idx >= 0 && idx < FFT_SIZE) {
        const gauss = Math.exp(-(d * d) / (2 * (s.width / 2.5) ** 2))
        bins[idx] = Math.max(bins[idx], NOISE_FLOOR + s.amp * gauss + (Math.random() * 3))
      }
    }
  }
  return bins
}

/** dBm → 0..1 */
function normalize(v) {
  return Math.max(0, Math.min(1, (v - NOISE_FLOOR) / (PEAK - NOISE_FLOOR)))
}

/** 0..1 → CSS color (viridis-like) */
function colormap(t) {
  // dark purple → cyan → yellow → white
  if (t < 0.25) {
    const f = t / 0.25
    return `rgb(${Math.round(20 + f * 20)},${Math.round(10 + f * 50)},${Math.round(80 + f * 100)})`
  } else if (t < 0.5) {
    const f = (t - 0.25) / 0.25
    return `rgb(${Math.round(40 + f * 20)},${Math.round(60 + f * 140)},${Math.round(180 + f * 20)})`
  } else if (t < 0.75) {
    const f = (t - 0.5) / 0.25
    return `rgb(${Math.round(60 + f * 180)},${Math.round(200 + f * 55)},${Math.round(200 - f * 150)})`
  } else {
    const f = (t - 0.75) / 0.25
    return `rgb(${Math.round(240 + f * 15)},${Math.round(255)},${Math.round(50 + f * 50)})`
  }
}

export function useWaterfall(canvasRef, binsRef, running, centerFreq) {
  const animRef = useRef(null)

  const draw = useCallback((ctx, width, height) => {
    const bins = binsRef.current || mockFrame(centerFreq, running)

    // Scroll waterfall down by 1px
    const imgData = ctx.getImageData(0, 0, width, height - 1)
    ctx.putImageData(imgData, 0, 1)

    // Draw new top row
    const rowData = ctx.createImageData(width, 1)
    for (let x = 0; x < width; x++) {
      const binIdx = Math.floor((x / width) * FFT_SIZE)
      const val = bins[binIdx] ?? NOISE_FLOOR
      const color = colormap(normalize(val))
      const m = color.match(/\d+/g)
      const i = x * 4
      rowData.data[i]     = parseInt(m[0])
      rowData.data[i + 1] = parseInt(m[1])
      rowData.data[i + 2] = parseInt(m[2])
      rowData.data[i + 3] = 255
    }
    ctx.putImageData(rowData, 0, 0)
  }, [running, centerFreq])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let frameCount = 0

    const loop = () => {
      frameCount++
      // throttle to ~20 fps for waterfall
      if (frameCount % 3 === 0) {
        draw(ctx, canvas.width, canvas.height)
      }
      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(animRef.current)
    }
  }, [canvasRef, draw])
}
