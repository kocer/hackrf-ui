const API_BASE = import.meta.env.VITE_HACKRF_API_BASE || 'http://127.0.0.1:8765'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options)
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() }

  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`)
  }

  return payload
}

export async function getDeviceInfo() {
  return request('/device')
}

export async function connectDevice() {
  return request('/device/connect', { method: 'POST' })
}

export async function disconnectDevice() {
  return request('/device/disconnect', { method: 'POST' })
}

export async function startRX(params) {
  return request('/rx/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
}

export async function stopRX() {
  return request('/rx/stop', { method: 'POST' })
}

export async function startTX(params) {
  const formData = new FormData()
  formData.append('frequency', String(params.frequency))
  formData.append('sampleRate', String(params.sampleRate))
  formData.append('bandwidth', String(params.bandwidth))
  formData.append('modulation', params.modulation)
  formData.append('txGain', String(params.txGain))
  formData.append('file', params.file)

  return request('/tx/start', {
    method: 'POST',
    body: formData
  })
}

export async function stopTX() {
  return request('/tx/stop', { method: 'POST' })
}

export function openSpectrumSocket(onData) {
  const wsBase = API_BASE.replace(/^http/, 'ws')
  const ws = new WebSocket(`${wsBase}/rx/fft`)
  ws.binaryType = 'arraybuffer'
  ws.onmessage = (event) => {
    onData(new Float32Array(event.data))
  }
  return ws
}
