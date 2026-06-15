import React from 'react'

const STATUS_META = {
  disconnected: { label: 'DISCONNECTED', cls: 'status-disconnected' },
  idle:         { label: 'IDLE',         cls: 'status-idle' },
  rx:           { label: 'RX ACTIVE',    cls: 'status-rx' },
  tx:           { label: 'TX ACTIVE',    cls: 'status-tx' },
}

export default function DeviceStatus({ status, deviceInfo = {}, onConnect, onDisconnect }) {
  const meta = STATUS_META[status] || STATUS_META.disconnected
  const connected = status !== 'disconnected'

  return (
    <header className="device-header">
      <div className="brand">
        <span className="brand-icon">◈</span>
        <span className="brand-title">HackRF One</span>
        <span className="brand-sub">SDR Control Panel</span>
      </div>

      <div className="device-status-group">
        <div className="status-stack">
          <div className={`status-badge ${meta.cls}`}>
            <span className="status-dot" />
            {meta.label}
          </div>
          <div className="device-meta">
            <span>USB {deviceInfo.detected ? 'DETECTED' : 'MISSING'}</span>
            <span>{deviceInfo.serial ? `SN ${deviceInfo.serial.slice(-8)}` : 'SN --'}</span>
            <span>{deviceInfo.firmware ? `FW ${deviceInfo.firmware}` : 'FW --'}</span>
          </div>
        </div>
        <button
          className={connected ? 'btn btn-danger' : 'btn btn-connect'}
          onClick={connected ? onDisconnect : onConnect}
        >
          {connected ? 'Disconnect' : 'Connect Device'}
        </button>
      </div>
    </header>
  )
}
