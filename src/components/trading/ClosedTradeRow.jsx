import React from 'react'
import { STATUS_CONFIG } from '../../config'

function ClosedTradeRow({ signal }) {
  const data = signal.data || {}
  const status = data.status || 'manual_exit'
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.manual_exit

  const index = data.index || data.index_name || ''
  const direction = data.direction || ''
  const estimatedSymbol = data.estimated_symbol || ''
  const hasOrder = data.my_order && typeof data.my_order === 'object' && Object.keys(data.my_order).length > 0
  const rawStrike = data.strike
  const strike = (() => {
    if (rawStrike && rawStrike !== 0) return rawStrike
    if (!estimatedSymbol) return ''
    const m = estimatedSymbol.match(/(\d{4,6})\s*(?:CE|PE)$/i)
    return m ? m[1] : ''
  })()
  const entryPrice = data.entry_price
  const exitPrice = data.exit_price
  const pnl = data.pnl || 0

  const signalTime = signal.timestamp || signal.receivedAt
  const timeStr = signalTime
    ? new Date(typeof signalTime === 'string' && !signalTime.endsWith('Z') && !signalTime.includes('+') ? signalTime + 'Z' : signalTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    : '—'

  const fmtPrice = (v) => v != null ? `₹${Number(v).toFixed(2)}` : '—'

  return (
    <tr className="hover:bg-gray-50 transition" title={estimatedSymbol || undefined}>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="text-xs text-gray-600 font-mono">{timeStr}</span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div>
          <span className="text-xs font-semibold text-gray-700">{index} {strike}</span>
          {hasOrder && (
            <span className="ml-1 text-xs bg-blue-50 text-blue-600 px-1 py-0.5 rounded font-bold">MY</span>
          )}
          {estimatedSymbol && (
            <div className="text-xs font-mono text-gray-500 truncate max-w-[120px]">{estimatedSymbol}</div>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
          direction === 'CE' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
        }`}>{direction || '—'}</span>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <span className="text-xs font-mono text-gray-600">{fmtPrice(entryPrice)}</span>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <span className="text-xs font-mono text-gray-600">{fmtPrice(exitPrice)}</span>
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <span className={`text-xs font-mono font-bold ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {pnl !== 0 ? `₹${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}` : '—'}
        </span>
      </td>
    </tr>
  )
}

export default ClosedTradeRow
