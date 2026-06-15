import React from 'react'

export const PRESETS = [
  {
    id: 'fm-broadcast',
    label: 'FM Broadcast',
    tag: 'RX',
    params: { frequency: 100.0e6, modulation: 'WFM', sampleRate: 2e6, bandwidth: 1.75e6, lnaGain: 24, vgaGain: 28 }
  },
  {
    id: 'am-broadcast',
    label: 'AM Broadcast',
    tag: 'RX',
    params: { frequency: 1000e3, modulation: 'AM', sampleRate: 2e6, bandwidth: 200e3, lnaGain: 32, vgaGain: 30 }
  },
  {
    id: 'narrowband-voice',
    label: 'Narrowband Voice',
    tag: 'RX',
    params: { frequency: 446.0e6, modulation: 'NFM', sampleRate: 2e6, bandwidth: 200e3, lnaGain: 16, vgaGain: 20 }
  },
  {
    id: 'usb-shortwave',
    label: 'SW USB',
    tag: 'RX',
    params: { frequency: 14.200e6, modulation: 'USB', sampleRate: 2e6, bandwidth: 200e3, lnaGain: 32, vgaGain: 32 }
  },
  {
    id: 'cw-morse',
    label: 'CW / Morse',
    tag: 'RX',
    params: { frequency: 14.050e6, modulation: 'CW', sampleRate: 2e6, bandwidth: 200e3, lnaGain: 24, vgaGain: 24 }
  },
  {
    id: 'ism-433',
    label: 'ISM 433 MHz',
    tag: 'RX',
    params: { frequency: 433.92e6, modulation: 'NFM', sampleRate: 4e6, bandwidth: 1.75e6, lnaGain: 16, vgaGain: 20 }
  },
  {
    id: 'tx-fm-test',
    label: 'FM TX Test',
    tag: 'TX',
    params: { frequency: 100.0e6, modulation: 'FM', sampleRate: 2e6, bandwidth: 1.75e6, txGain: 0 }
  },
  {
    id: 'tx-am-test',
    label: 'AM TX Test',
    tag: 'TX',
    params: { frequency: 1000e3, modulation: 'AM', sampleRate: 2e6, bandwidth: 200e3, txGain: 0 }
  },
]

export default function PresetSelector({ onSelect }) {
  return (
    <div className="preset-bar">
      <span className="preset-label">PRESETS</span>
      <div className="preset-list">
        {PRESETS.map(p => (
          <button
            key={p.id}
            className={`preset-btn preset-${p.tag.toLowerCase()}`}
            onClick={() => onSelect(p)}
            title={`${p.tag}: ${JSON.stringify(p.params)}`}
          >
            <span className={`preset-tag preset-tag-${p.tag.toLowerCase()}`}>{p.tag}</span>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
