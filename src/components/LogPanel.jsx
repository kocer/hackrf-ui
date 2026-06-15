import React, { useEffect, useRef } from 'react'

const LEVEL_STYLE = {
  info:  { cls: 'log-info',  prefix: '[INFO]' },
  warn:  { cls: 'log-warn',  prefix: '[WARN]' },
  error: { cls: 'log-error', prefix: '[ERR ]' },
}

export default function LogPanel({ logs, onClear }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="log-panel">
      <div className="log-header">
        <span className="log-title">EVENT LOG</span>
        <button className="btn btn-ghost btn-xs" onClick={onClear}>Clear</button>
      </div>
      <div className="log-body">
        {logs.length === 0 && (
          <span className="log-empty">— no events —</span>
        )}
        {logs.map((entry, i) => {
          const meta = LEVEL_STYLE[entry.level] || LEVEL_STYLE.info
          return (
            <div key={i} className={`log-entry ${meta.cls}`}>
              <span className="log-ts">{entry.ts}</span>
              <span className="log-prefix">{meta.prefix}</span>
              <span className="log-msg">{entry.msg}</span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
