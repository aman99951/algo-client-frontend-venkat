import React from 'react'
import { STATUS_CONFIG } from '../../config'

function ClosedOrderRow({ order, brokerPositionsMap = {} }) {
  const status = order.status || 'manual_exit'
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.manual_exit

  const signalId = order.signal_id || ''
  const parts = signalId.split('_')
  const index = parts[0] || ''
  const direction = parts[1] || ''
  const symbol = order.symbol || ''
  const strikeMatch = symbol.match(/(\d{4,6})\s*(?:CE|PE)$/i)
  const strike = strikeMatch ? strikeMatch[1] : ''

  const brokerPos = brokerPositionsMap[symbol.toUpperCase()]
  let entryPrice = order.entry_price
  let exitPrice = order.exit_price
  let pnl = order.pnl || 0

  if (brokerPos) {
    if (brokerPos.buy_price > 0) entryPrice = brokerPos.buy_price
    if (brokerPos.is_closed && brokerPos.sell_price > 0) exitPrice = brokerPos.sell_price
    pnl = brokerPos.is_closed ? (brokerPos.realised || brokerPos.pnl || 0) : (brokerPos.pnl || 0)
  } else {
    const LOT = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20, BANKEX: 30 }
    const lotSize = order.quantity || LOT[index] || 30
    if (exitPrice == null && entryPrice != null && pnl !== 0) {
      exitPrice = Math.round((entryPrice + pnl / lotSize) * 100) / 100
    }
  }

  const timeStr = order.created_at
    ? new Date(order.created_at.endsWith('Z') ? order.created_at : order.created_at + 'Z')
        .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    : '—'

  const fmtPrice = (v) => v != null ? `₹${Number(v).toFixed(2)}` : '—'

  return (
    <tr className="hover:bg-[#1a2744]/30 transition" title={symbol || undefined}>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="text-xs text-gray-400 font-mono">{timeStr}</span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div>
          <span className="text-xs font-semibold text-gray-300">{index} {strike}</span>
          <span className="ml-1 text-[8px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded font-bold">MY</span>
          {symbol && (
            <div className="text-[9px] font-mono text-gray-600 truncate max-w-[120px]">{symbol}</div>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
          direction === 'CE' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
        }`}>{direction || '—'}</span>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <span className="text-xs font-mono text-gray-400">{fmtPrice(entryPrice)}</span>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <span className="text-xs font-mono text-gray-400">{fmtPrice(exitPrice)}</span>
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <span className={`text-xs font-mono font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {pnl !== 0 ? `₹${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}` : '—'}
        </span>
      </td>
    </tr>
  )
}

export default ClosedOrderRow
