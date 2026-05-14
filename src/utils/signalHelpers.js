// Maps raw API signal object to the frontend signal shape.
// Used by both loadTodaySignals and the 30s polling merge.
export function mapSignal(s) {
  return {
    type: 'signal',
    signal: s.status === 'active' ? 'detected' : s.status === 'in_market' ? 'entry' : 'exit',
    signal_id: s.signal_id,
    data: {
      ...s,
      index: s.index_name,
      direction: s.direction,
      strike: s.strike,
      spot_price: s.spot_price,
      entry_price: s.entry_price,
      target_price: s.target_price,
      sl_price: s.sl_price,
      target_points: s.target_points,
      stop_loss_points: s.sl_points,
      exit_price: s.exit_price,
      pnl: s.pnl,
      pnl_percentage: s.pnl_percentage,
      exit_reason: s.exit_reason,
      estimated_symbol: s.estimated_symbol,
      status: s.status,
      my_order: s.my_order,
      // AI enrichment fields
      ai_confidence: s.ai_confidence,
      ai_target_pts: s.ai_target_pts,
      ai_sl_pts: s.ai_sl_pts,
      ai_narration: s.ai_narration,
      ai_risk_factors: s.ai_risk_factors || [],
    },
    timestamp: s.signal_time,
    receivedAt: s.signal_time,
    id: s.signal_id,
  }
}

// Merge loaded signals with existing ones — prevents reverting WS-updated closed trades
export function mergeSignals(prev, loaded) {
  if (prev.length === 0) return loaded

  const merged = [...loaded]
  const closedStates = ['target_hit', 'sl_hit', 'manual_exit', 'expired']

  prev.forEach(existingSignal => {
    const existingIdx = merged.findIndex(m =>
      m.signal_id && existingSignal.signal_id && m.signal_id === existingSignal.signal_id
    )

    if (existingIdx !== -1) {
      const existingStatus = existingSignal.data?.status || ''
      const loadedStatus = merged[existingIdx].data?.status || ''

      // If existing is closed but API says it's still active/in_market, keep the closed state
      if (closedStates.includes(existingStatus) && !closedStates.includes(loadedStatus)) {
        merged[existingIdx] = existingSignal
      }
    } else {
      const existingStatus = existingSignal.data?.status || ''
      if (closedStates.includes(existingStatus)) {
        merged.push(existingSignal)
      }
    }
  })

  return merged
}
