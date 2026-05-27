import React, { useState, useEffect } from 'react'
import { Target, TrendingUp, TrendingDown, ShieldAlert, CheckCircle2 } from 'lucide-react'

import { API_BASE } from '../config'

function ProfitTargetControl({ apiKey, sessionId, compact = false, brokerPnlData = null }) {
  const [stopLoss, setStopLoss] = useState(-2500)
  const [profitTarget, setProfitTarget] = useState(2500)
  const [profitTargetEnabled, setProfitTargetEnabled] = useState(true)

  const [currentPnL, setCurrentPnL] = useState(0)
  const [realizedPnL, setRealizedPnL] = useState(0)
  const [unrealizedPnL, setUnrealizedPnL] = useState(0)
  const [targetReached, setTargetReached] = useState(false)
  const [targetReachedAt, setTargetReachedAt] = useState(null)
  const [tradeCount, setTradeCount] = useState({ total: 0, wins: 0, losses: 0 })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (brokerPnlData?.success && brokerPnlData?.total_pnl != null) {
      setCurrentPnL(brokerPnlData.total_pnl)
      setRealizedPnL(brokerPnlData.total_realised || brokerPnlData.total_pnl)
      setUnrealizedPnL(brokerPnlData.total_unrealised || 0)
    }
  }, [brokerPnlData])

  const fetchData = async () => {
    if (!apiKey || !sessionId) return

    try {
      const settingsRes = await fetch(
        `${API_BASE}/api/profit-target/settings?session_id=${sessionId}`,
        { headers: { 'X-API-Key': apiKey } }
      )

      if (settingsRes.ok) {
        const settings = await settingsRes.json()
        setProfitTarget(settings.daily_profit_target || 2500)
        setProfitTargetEnabled(settings.profit_target_enabled !== false)
        setStopLoss(settings.daily_stop_loss != null ? settings.daily_stop_loss : -(settings.daily_profit_target || 2500))
      }

      try {
        const statsRes = await fetch(
          `${API_BASE}/api/signals/user-stats?api_key=${apiKey}`,
          { headers: { 'X-API-Key': apiKey } }
        )

        if (statsRes.ok) {
          const statsData = await statsRes.json()
          if (statsData.success && statsData.stats) {
            const s = statsData.stats
            const brokerPnl = s.total_pnl || 0
            const brokerTrades = s.total_closed || 0
            if (brokerTrades > 0 || brokerPnl !== 0) {
              setCurrentPnL(brokerPnl)
              setRealizedPnL(brokerPnl)
              setUnrealizedPnL(0)
              setTradeCount({
                total: brokerTrades + (s.active_count || 0),
                wins: s.wins || 0,
                losses: s.losses || 0
              })
              if (profitTargetEnabled && brokerPnl >= profitTarget) {
                setTargetReached(true)
              } else if (profitTargetEnabled && brokerPnl <= stopLoss) {
                setTargetReached(true)
              }
            }
          }
        }
      } catch (statsErr) {
        console.debug('User stats not available, falling back to profit-target:', statsErr.message)

        try {
          const todayRes = await fetch(
            `${API_BASE}/api/profit-target/today?session_id=${sessionId}`,
            { headers: { 'X-API-Key': apiKey } }
          )

          if (todayRes.ok) {
            const data = await todayRes.json()
            setCurrentPnL(data.total_pnl || 0)
            setRealizedPnL(data.realized_pnl || 0)
            setUnrealizedPnL(data.unrealized_pnl || 0)
            setTargetReached(data.target_reached || false)
            setTargetReachedAt(data.target_reached_at)
            setTradeCount({
              total: data.total_trades || 0,
              wins: data.winning_trades || 0,
              losses: data.losing_trades || 0
            })
          }
        } catch (todayErr) {
          console.debug('Today P&L not available yet:', todayErr.message)
        }
      }

      setLoading(false)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch profit target data:', err)
      setError('Failed to load data')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [apiKey, sessionId])

  const saveSettings = async () => {
    if (!apiKey || !sessionId) return

    setSaving(true)
    try {
      const res = await fetch(
        `${API_BASE}/api/profit-target/settings?session_id=${sessionId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          },
          body: JSON.stringify({
            daily_profit_target: profitTarget,
            daily_stop_loss: stopLoss,
            profit_target_enabled: profitTargetEnabled
          })
        }
      )

      if (res.ok) {
        const data = await res.json()
        if (data.daily_profit_target != null) setProfitTarget(data.daily_profit_target)
        if (data.daily_stop_loss != null) setStopLoss(data.daily_stop_loss)
        if (data.profit_target_enabled != null) setProfitTargetEnabled(data.profit_target_enabled)
        setError(null)
      } else {
        const errData = await res.json()
        setError(errData.detail || 'Failed to save settings')
      }
    } catch (err) {
      console.error('Failed to save settings:', err)
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleProfitTargetChange = (value) => {
    const numValue = parseInt(value)
    setProfitTarget(Math.max(500, Math.min(numValue, 15000)))
  }

  const handleStopLossChange = (value) => {
    const numValue = parseInt(value)
    setStopLoss(Math.max(-15000, Math.min(numValue, -500)))
  }

  const getProgressPercentage = () => {
    if (currentPnL >= profitTarget) return 100
    if (currentPnL <= stopLoss) return -100

    if (currentPnL >= 0) {
      return (currentPnL / profitTarget) * 100
    } else {
      return (currentPnL / Math.abs(stopLoss)) * 100
    }
  }

  const progressPct = getProgressPercentage()
  const isPositive = currentPnL >= 0
  const progressColor = targetReached
    ? '#22c55e'
    : currentPnL <= stopLoss
    ? '#ef4444'
    : isPositive
    ? '#22c55e'
    : '#d4a843'

  if (loading) {
    return compact ? (
      <div style={{background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px'}}>
        <div className="text-xs" style={{color: '#6b6580'}}>Loading...</div>
      </div>
    ) : (
      <div style={{background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px'}}>
        <div className="text-center text-xs" style={{color: '#6b6580'}}>Loading profit target...</div>
      </div>
    )
  }

  if (compact) {
    return (
      <div style={{background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px'}}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4" style={{color: '#d4a843'}} />
            <span className="text-xs font-bold" style={{color: '#f0e6d0'}}>Daily P&L</span>
          </div>
          <div className="text-xs px-2 py-0.5 rounded" style={profitTargetEnabled ? {background: 'rgba(34,197,94,0.1)', color: '#22c55e'} : {background: 'rgba(255,255,255,0.05)', color: '#6b6580'}}>
            {profitTargetEnabled ? 'ON' : 'OFF'}
          </div>
        </div>

        <div className="text-2xl font-bold mb-1" style={{color: isPositive ? '#22c55e' : '#ef4444'}}>
          {isPositive ? '+' : ''}₹{currentPnL.toFixed(2)}
        </div>

        <div className="mb-2">
          <div className="h-1.5 rounded-full overflow-hidden" style={{background: 'rgba(255,255,255,0.05)'}}>
            <div
              className="h-full transition-all duration-300 rounded-full"
              style={{
                width: `${Math.abs(progressPct)}%`,
                marginLeft: progressPct < 0 ? `${100 - Math.abs(progressPct)}%` : '0',
                background: progressColor
              }}
            />
          </div>
        </div>

        <div className="flex justify-between text-xs mb-2">
          <span style={{color: '#ef4444'}}>SL: -₹{Math.abs(stopLoss)}</span>
          <span style={{color: '#a09880'}}>{tradeCount.wins}W {tradeCount.losses}L</span>
          <span style={{color: '#22c55e'}}>TP: +₹{profitTarget}</span>
        </div>

        {targetReached && (
          <div style={{background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', padding: '4px 8px'}}>
            <span className="text-xs font-semibold" style={{color: '#22c55e'}}>🎯 Target Reached!</span>
          </div>
        )}

        {currentPnL <= stopLoss && !targetReached && (
          <div style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '4px 8px'}}>
            <span className="text-xs font-semibold" style={{color: '#ef4444'}}>⛔ Stop Loss Hit</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px'}}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div style={{background: 'rgba(212,168,67,0.12)', borderRadius: '8px', padding: '6px'}}>
            <Target className="w-4 h-4" style={{color: '#d4a843'}} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{color: '#f0e6d0'}}>Daily Profit Target</h3>
            <p className="text-xs" style={{color: '#a09880'}}>Set daily stop loss & profit target</p>
          </div>
        </div>

        <button
          onClick={() => setProfitTargetEnabled(!profitTargetEnabled)}
          className="px-2.5 py-1 rounded text-xs font-semibold transition"
          style={profitTargetEnabled ? {background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)'} : {background: 'rgba(255,255,255,0.05)', color: '#6b6580', border: '1px solid rgba(255,255,255,0.1)'}}
        >
          {profitTargetEnabled ? 'ENABLED' : 'DISABLED'}
        </button>
      </div>

      {/* P&L Panel */}
      <div style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px'}} className="mb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-baseline gap-3">
            <span className="text-xs" style={{color: '#6b6580'}}>Today's P&L</span>
            <span className="text-2xl font-bold" style={{color: isPositive ? '#22c55e' : '#ef4444'}}>
              {isPositive ? '+' : ''}₹{currentPnL.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span style={{color: '#a09880'}}>Trades: {tradeCount.total}</span>
            <span style={{color: '#22c55e'}}>W: {tradeCount.wins}</span>
            <span style={{color: '#ef4444'}}>L: {tradeCount.losses}</span>
          </div>
        </div>

        <div className="flex gap-4 text-xs mt-1">
          <span style={{color: '#6b6580'}}>Realized: <span style={{color: realizedPnL >= 0 ? '#22c55e' : '#ef4444'}}>₹{realizedPnL.toFixed(2)}</span></span>
          <span style={{color: '#6b6580'}}>Unrealized: <span style={{color: unrealizedPnL >= 0 ? '#22c55e' : '#ef4444'}}>₹{unrealizedPnL.toFixed(2)}</span></span>
        </div>

        {/* Progress Bar */}
        <div className="mt-2">
          <div className="h-2 rounded-full overflow-hidden" style={{background: 'rgba(255,255,255,0.05)'}}>
            <div
              className="h-full transition-all duration-500 rounded-full"
              style={{
                width: `${Math.abs(progressPct)}%`,
                marginLeft: progressPct < 0 ? `${100 - Math.abs(progressPct)}%` : '0',
                background: `linear-gradient(90deg, ${isPositive ? '#22c55e' : '#ef4444'}, ${progressColor})`,
                boxShadow: `0 0 8px ${progressColor}40`
              }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs">
            <span style={{color: '#ef4444'}}>-₹{Math.abs(stopLoss)}</span>
            <span style={{color: '#6b6580'}}>₹0</span>
            <span style={{color: '#22c55e'}}>+₹{profitTarget}</span>
          </div>
        </div>

        {/* Status Alerts */}
        {targetReached && (
          <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded" style={{background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)'}}>
            <CheckCircle2 className="w-3.5 h-3.5" style={{color: '#22c55e'}} />
            <span className="text-xs font-semibold" style={{color: '#22c55e'}}>Target Reached — no new entries today</span>
          </div>
        )}

        {currentPnL <= stopLoss && !targetReached && (
          <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded" style={{background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)'}}>
            <ShieldAlert className="w-3.5 h-3.5" style={{color: '#ef4444'}} />
            <span className="text-xs font-semibold" style={{color: '#ef4444'}}>Stop Loss Hit — no new entries today</span>
          </div>
        )}
      </div>

      {/* Stop Loss Slider */}
      <div style={{background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: '8px', padding: '10px 12px'}} className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium" style={{color: '#a09880'}}>
            <TrendingDown className="w-3.5 h-3.5 inline mr-1" style={{color: '#ef4444'}} />
            Stop Loss Limit
          </label>
          <span className="text-sm font-bold" style={{color: '#ef4444'}}>-₹{Math.abs(stopLoss).toLocaleString()}</span>
        </div>

        <input
          type="range"
          min="-15000"
          max="-500"
          step="500"
          value={stopLoss}
          onChange={(e) => handleStopLossChange(e.target.value)}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
          style={{background: 'rgba(239,68,68,0.15)'}}
          disabled={!profitTargetEnabled}
        />

        <div className="flex justify-between mt-0.5 text-xs" style={{color: '#6b6580'}}>
          <span style={{color: '#ef4444'}}>-₹15K</span>
          <span>-₹10K</span>
          <span>-₹5K</span>
          <span>-₹500</span>
        </div>
      </div>

      {/* Profit Target Slider */}
      <div style={{background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)', borderRadius: '8px', padding: '10px 12px'}} className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium" style={{color: '#a09880'}}>
            <TrendingUp className="w-3.5 h-3.5 inline mr-1" style={{color: '#22c55e'}} />
            Profit Target
          </label>
          <span className="text-sm font-bold" style={{color: '#22c55e'}}>+₹{profitTarget.toLocaleString()}</span>
        </div>

        <input
          type="range"
          min="500"
          max="15000"
          step="500"
          value={profitTarget}
          onChange={(e) => handleProfitTargetChange(e.target.value)}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
          style={{background: 'rgba(34,197,94,0.15)'}}
          disabled={!profitTargetEnabled}
        />

        <div className="flex justify-between mt-0.5 text-xs" style={{color: '#6b6580'}}>
          <span>₹500</span>
          <span>₹5K</span>
          <span>₹10K</span>
          <span style={{color: '#22c55e'}}>₹15K</span>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={saveSettings}
        disabled={saving || !profitTargetEnabled}
        className="w-full py-2 rounded-lg font-semibold text-xs transition"
        style={saving || !profitTargetEnabled ? {background: 'rgba(255,255,255,0.05)', color: '#6b6580', cursor: 'not-allowed'} : {background: 'linear-gradient(135deg, #d4a843, #b8922e)', color: '#000'}}
      >
        {saving ? 'Saving...' : saving === null ? '' : 'Save Settings'}
      </button>

      {error && (
        <div className="text-xs text-center mt-1" style={{color: '#ef4444'}}>{error}</div>
      )}
    </div>
  )
}

export default ProfitTargetControl
