import { useState, useCallback, useEffect } from 'react'
import * as api from '../api/hackrf.js'

export function useHackRF(addLog) {
  const [deviceStatus, setDeviceStatus] = useState('disconnected') // disconnected | idle | rx | tx
  const [rxRunning, setRxRunning] = useState(false)
  const [txRunning, setTxRunning] = useState(false)
  const [deviceInfo, setDeviceInfo] = useState({
    detected: false,
    connected: false,
    mode: 'idle',
    serial: '',
    firmware: '',
    board: 'HackRF One',
    hardwareRevision: '',
    lastError: ''
  })

  const applyDeviceInfo = useCallback((info) => {
    setDeviceInfo(prev => ({ ...prev, ...info }))
    setRxRunning(info.mode === 'rx')
    setTxRunning(info.mode === 'tx')

    if (!info.connected) {
      setDeviceStatus('disconnected')
      return
    }

    if (info.mode === 'rx') {
      setDeviceStatus('rx')
      return
    }

    if (info.mode === 'tx') {
      setDeviceStatus('tx')
      return
    }

    setDeviceStatus('idle')
  }, [])

  const refreshDevice = useCallback(async (silent = false) => {
    try {
      const info = await api.getDeviceInfo()
      applyDeviceInfo(info)
      if (!silent && !info.detected && info.lastError) {
        addLog('warn', info.lastError)
      }
      return info
    } catch (err) {
      if (!silent) {
        addLog('error', `Device query failed: ${err.message}`)
      }
      throw err
    }
  }, [addLog, applyDeviceInfo])

  useEffect(() => {
    refreshDevice(true).catch(() => {})
    const intervalId = window.setInterval(() => {
      refreshDevice(true).catch(() => {})
    }, 3000)

    return () => window.clearInterval(intervalId)
  }, [refreshDevice])

  const connect = useCallback(async () => {
    try {
      const info = await api.connectDevice()
      applyDeviceInfo(info)
      addLog('info', `Device connected — serial: ${info.serial || 'unknown'}, fw: ${info.firmware || 'unknown'}`)
    } catch (err) {
      addLog('error', `Connect failed: ${err.message}`)
    }
  }, [addLog, applyDeviceInfo])

  const disconnect = useCallback(async () => {
    try {
      const info = await api.disconnectDevice()
      applyDeviceInfo(info)
      addLog('warn', 'Device disconnected')
    } catch (err) {
      addLog('error', `Disconnect failed: ${err.message}`)
    }
  }, [addLog, applyDeviceInfo])

  const startRX = useCallback(async (params) => {
    try {
      const res = await api.startRX(params)
      if (res.ok) {
        setRxRunning(true)
        setDeviceStatus('rx')
        setDeviceInfo(prev => ({ ...prev, connected: true, mode: 'rx' }))
        addLog(
          'info',
          `RX started — ${(params.frequency / 1e6).toFixed(3)} MHz, ${params.modulation}, SR: ${(params.sampleRate / 1e6).toFixed(1)} Msps, BW filter: ${(res.effectiveBandwidth / 1e6).toFixed(2)} MHz`
        )
        return res
      }
    } catch (err) {
      addLog('error', `RX start failed: ${err.message}`)
    }
  }, [addLog])

  const stopRX = useCallback(async () => {
    try {
      const info = await api.stopRX()
      setRxRunning(false)
      setDeviceInfo(prev => ({ ...prev, mode: info.mode || 'idle' }))
      setDeviceStatus(info.mode === 'tx' ? 'tx' : 'idle')
      addLog('info', 'RX stopped')
    } catch (err) {
      addLog('error', `RX stop failed: ${err.message}`)
    }
  }, [addLog])

  const startTX = useCallback(async (params) => {
    try {
      const res = await api.startTX(params)
      if (res.ok) {
        setTxRunning(true)
        setDeviceStatus('tx')
        setDeviceInfo(prev => ({ ...prev, connected: true, mode: 'tx' }))
        addLog(
          'warn',
          `TX STARTED — ${(params.frequency / 1e6).toFixed(3)} MHz, ${params.modulation}, gain: ${params.txGain} dB, source: ${res.sourceKind}`
        )
        return res
      }
    } catch (err) {
      addLog('error', `TX start failed: ${err.message}`)
    }
  }, [addLog])

  const stopTX = useCallback(async () => {
    try {
      const info = await api.stopTX()
      setTxRunning(false)
      setDeviceInfo(prev => ({ ...prev, mode: info.mode || 'idle' }))
      setDeviceStatus(info.mode === 'rx' ? 'rx' : 'idle')
      addLog('info', 'TX stopped')
    } catch (err) {
      addLog('error', `TX stop failed: ${err.message}`)
    }
  }, [addLog])

  return { deviceStatus, deviceInfo, rxRunning, txRunning, connect, disconnect, startRX, stopRX, startTX, stopTX }
}
