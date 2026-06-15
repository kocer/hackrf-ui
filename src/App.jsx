import React, { useState, useCallback } from 'react'
import DeviceStatus   from './components/DeviceStatus.jsx'
import RXPanel        from './components/RXPanel.jsx'
import TXPanel        from './components/TXPanel.jsx'
import LogPanel       from './components/LogPanel.jsx'
import PresetSelector from './components/PresetSelector.jsx'
import { useHackRF }  from './hooks/useHackRF.js'

function timestamp() {
  return new Date().toTimeString().slice(0, 8)
}

export default function App() {
  const [logs, setLogs] = useState([
    { ts: timestamp(), level: 'info', msg: 'HackRF UI initialized — connect device to begin' }
  ])

  const addLog = useCallback((level, msg) => {
    setLogs(prev => [...prev.slice(-199), { ts: timestamp(), level, msg }])
  }, [])

  const clearLogs = () => setLogs([])

  const {
    deviceStatus,
    deviceInfo,
    rxRunning, txRunning,
    connect, disconnect,
    startRX, stopRX,
    startTX, stopTX
  } = useHackRF(addLog)

  const handlePreset = (preset) => {
    addLog('info', `Preset loaded: "${preset.label}" (${preset.tag})`)
    // Presets are advisory — panels read their own state;
    // To wire presets into panels, lift RX/TX state here and pass as props.
    // HOOK: setRxParams(preset.params) / setTxParams(preset.params)
  }

  const deviceDisabled = deviceStatus === 'disconnected'
  const txDisabled = deviceDisabled || rxRunning
  const rxDisabled = deviceDisabled || txRunning

  return (
    <div className="app">
      <DeviceStatus
        status={deviceStatus}
        deviceInfo={deviceInfo}
        onConnect={connect}
        onDisconnect={disconnect}
      />

      <PresetSelector onSelect={handlePreset} />

      <main className="panels-grid">
        <RXPanel
          running={rxRunning}
          disabled={rxDisabled}
          onStart={startRX}
          onStop={stopRX}
        />
        <TXPanel
          running={txRunning}
          disabled={txDisabled}
          onStart={startTX}
          onStop={stopTX}
        />
      </main>

      <LogPanel logs={logs} onClear={clearLogs} />
    </div>
  )
}
