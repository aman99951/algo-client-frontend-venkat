import React, { useState, useEffect } from 'react'
import { Target, TrendingUp, TrendingDown, ShieldAlert, AlertCircle, CheckCircle2 } from 'lucide-react'

import { API_BASE } from '../config'

/**
 * Daily Profit Target & Stop Loss Control
 * 
 * Features:
 * - Separate Stop Loss slider (range: -500 to -15000, step: 500, default: -2500)
 * - Separate Profit Target slider (range: +500 to +15000, step: 500, default: +2500)
 * - Real-time P&L display with visual progress bar
 * - Backend sync every 5 seconds
 * - Compact mode for top-right corner display
 */
function ProfitTargetControl({ apiKey, sessionId, compact = false, brokerPnlData = null }) {
  // Profit target settings
  const [stopLoss, setStopLoss] = useState(-2500)
  const [profitTarget, setProfitTarget] = useState(2500)
  const [profitTargetEnabled, setProfitTargetEnabled] = useState(true)
  
  // Current state
  const [currentPnL, setCurrentPnL] = useState(0)
  const [realizedPnL, setRealizedPnL] = useState(0)
  const [unrealizedPnL, setUnrealizedPnL] = useState(0)
  const [targetReached, setTargetReached] = useState(false)
  const [targetReachedAt, setTargetReachedAt] = useState(null)
  const [tradeCount, setTradeCount] = useState({ total: 0, wins: 0, losses: 0 })
  
  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // BROKER P&L OVERRIDE: When brokerPnlData prop changes, use it directly
  useEffect(() => {
    if (brokerPnlData?.success && brokerPnlData?.total_pnl != null) {
      setCurrentPnL(brokerPnlData.total_pnl)
      setRealizedPnL(brokerPnlData.total_realised || brokerPnlData.total_pnl)
      setUnrealizedPnL(brokerPnlData.total_unrealised || 0)
    }
  }, [brokerPnlData])

  // Fetch current settings and today's P&L
  const fetchData = async () => {
    if (!apiKey || !sessionId) return
    
    try {
      // Fetch settings
      const settingsRes = await fetch(
        `${API_BASE}/api/profit-target/settings?session_id=${sessionId}`,
        { headers: { 'X-API-Key': apiKey } }
      )
      
      if (settingsRes.ok) {
        const settings = await settingsRes.json()
        setProfitTarget(settings.daily_profit_target || 2500)
        setProfitTargetEnabled(settings.profit_target_enabled !== false)
        // Use separate stop loss value from backend (defaults to negative of profit target)
        setStopLoss(settings.daily_stop_loss != null ? settings.daily_stop_loss : -(settings.daily_profit_target || 2500))
      }
      
      // Fetch today's P&L — prefer broker actual from user-stats (SubscriberOrders)
      // over profit-target/today (which reads from admin Trade table, empty for subscribers)
      try {
        // Try user-stats endpoint FIRST — it returns broker actual P&L from SubscriberOrders
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
            // Use broker actual P&L when there are real trades
            if (brokerTrades > 0 || brokerPnl !== 0) {
              setCurrentPnL(brokerPnl)
              setRealizedPnL(brokerPnl)
              setUnrealizedPnL(0)
              setTradeCount({
                total: brokerTrades + (s.active_count || 0),
                wins: s.wins || 0,
                losses: s.losses || 0
              })
              // Check if target reached
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
        
        // Fallback: profit-target/today (Trade table — works for admin bot)
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

  // Initial load and polling every 5 seconds
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [apiKey, sessionId])

  // Save settings to backend
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
        // Update with server response
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

  // Handle profit target change
  const handleProfitTargetChange = (value) => {
    const numValue = parseInt(value)
    setProfitTarget(Math.max(500, Math.min(numValue, 15000)))
  }

  // Handle stop loss change (independent slider)
  const handleStopLossChange = (value) => {
    const numValue = parseInt(value)
    // Clamp between -15000 and -500
    setStopLoss(Math.max(-15000, Math.min(numValue, -500)))
  }

  // Calculate progress percentage
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
    ? 'bg-green-500'
    : currentPnL <= stopLoss
    ? 'bg-red-500'
    : isPositive
    ? 'bg-blue-500'
    : 'bg-amber-500'

  if (loading) {
    return compact ? (
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="text-xs text-gray-500">Loading...</div>
      </div>
    ) : (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-center text-gray-500">Loading profit target...</div>
      </div>
    )
  }

  // Compact mode for top-right corner
  if (compact) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-bold text-gray-700">Daily P&L</span>
          </div>
          <div className={`text-xs px-2 py-0.5 rounded ${
            profitTargetEnabled ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
          }`}>
            {profitTargetEnabled ? 'ON' : 'OFF'}
          </div>
        </div>

        {/* Current P&L */}
        <div className={`text-2xl font-bold mb-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? '+' : ''}₹{currentPnL.toFixed(2)}
        </div>

        {/* Progress Bar */}
        <div className="mb-2">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${progressColor} transition-all duration-300`}
              style={{
                width: `${Math.abs(progressPct)}%`,
                marginLeft: progressPct < 0 ? `${100 - Math.abs(progressPct)}%` : '0'
              }}
            />
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex justify-between text-xs text-gray-600 mb-2">
          <span className="text-red-500">SL: -₹{Math.abs(stopLoss)}</span>
          <span className="text-green-500">TP: +₹{profitTarget}</span>
          <span>{tradeCount.wins}W {tradeCount.losses}L</span>
        </div>

        {/* Status Alerts */}
        {targetReached && (
          <div className="bg-green-50 border border-green-200 rounded px-2 py-1 text-xs text-green-600">
            🎯 Target Reached!
          </div>
        )}
        
        {currentPnL <= stopLoss && !targetReached && (
          <div className="bg-red-50 border border-red-200 rounded px-2 py-1 text-xs text-red-600">
            ⛔ Stop Loss Hit
          </div>
        )}
      </div>
    )
  }

  // Full mode — compact widget
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 shadow-sm">
      {/* Header row with P&L */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-50 rounded-lg">
            <Target className="w-4 h-4 text-purple-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Daily Profit Target</h3>
            <p className="text-xs text-gray-600">Set daily stop loss & profit target</p>
          </div>
        </div>
        
        <button
          onClick={() => setProfitTargetEnabled(!profitTargetEnabled)}
          className={`px-2 py-0.5 rounded text-xs font-medium transition ${
            profitTargetEnabled
              ? 'bg-green-50 text-green-600 border border-green-200'
              : 'bg-gray-100 text-gray-500 border border-gray-200'
          }`}
        >
          {profitTargetEnabled ? 'ENABLED' : 'DISABLED'}
        </button>
      </div>

      {/* Compact P&L + Progress */}
      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
        <div className="flex items-baseline justify-between mb-1">
          <div className="flex items-baseline gap-3">
            <span className="text-xs text-gray-600">Today's P&L</span>
            <span className={`text-2xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? '+' : ''}₹{currentPnL.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Trades: {tradeCount.total}</span>
            <span className="text-green-500">Wins: {tradeCount.wins}</span>
            <span className="text-red-500">Losses: {tradeCount.losses}</span>
          </div>
        </div>
        
        <div className="flex gap-3 text-xs mb-2">
          <span className="text-gray-500">Realized: <span className={realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}>₹{realizedPnL.toFixed(2)}</span></span>
          <span className="text-gray-500">Unrealized: <span className={unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}>₹{unrealizedPnL.toFixed(2)}</span></span>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${progressColor} transition-all duration-300`}
            style={{
              width: `${Math.abs(progressPct)}%`,
              marginLeft: progressPct < 0 ? `${100 - Math.abs(progressPct)}%` : '0'
            }}
          />
        </div>
        <div className="flex justify-between mt-0.5 text-xs text-gray-500">
          <span>₹{stopLoss}</span>
          <span>₹0</span>
          <span>₹{profitTarget}</span>
        </div>

        {/* Status Messages */}
        {targetReached && (
          <div className="mt-2 bg-green-50 border border-green-200 rounded px-2 py-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            <span className="text-xs font-semibold text-green-600">Target Reached — no new entries today</span>
          </div>
        )}
        
        {currentPnL <= stopLoss && !targetReached && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded px-2 py-1 flex items-center gap-1.5">
            <ShieldAlert className="w-3 h-3 text-red-500" />
            <span className="text-xs font-semibold text-red-600">Stop Loss Hit — no new entries today</span>
          </div>
        )}
      </div>

      {/* Sliders — compact two-column layout */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-100">
        {/* Stop Loss Slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-600">
              <TrendingDown className="w-3.5 h-3.5 inline mr-1 text-red-500" />
              Stop Loss Limit
            </label>
            <span className="text-sm font-bold text-red-500">-₹{Math.abs(stopLoss)}</span>
          </div>
          
          <input
            type="range"
            min="-15000"
            max="-500"
            step="500"
            value={stopLoss}
            onChange={(e) => handleStopLossChange(e.target.value)}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-red"
            disabled={!profitTargetEnabled}
          />
          
          <div className="flex justify-between mt-0.5 text-xs text-gray-500">
            <span className="text-red-500">-₹15,000</span>
            <span>-₹10,000</span>
            <span>-₹5,000</span>
            <span>-₹500</span>
          </div>
        </div>

        {/* Profit Target Slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-600">
              <TrendingUp className="w-3.5 h-3.5 inline mr-1 text-green-500" />
              Profit Target
            </label>
            <span className="text-sm font-bold text-green-500">+₹{profitTarget}</span>
          </div>
          
          <input
            type="range"
            min="500"
            max="15000"
            step="500"
            value={profitTarget}
            onChange={(e) => handleProfitTargetChange(e.target.value)}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-green"
            disabled={!profitTargetEnabled}
          />
          
          <div className="flex justify-between mt-0.5 text-xs text-gray-500">
            <span>₹500</span>
            <span>₹5,000</span>
            <span>₹10,000</span>
            <span className="text-green-600">₹15,000</span>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={saveSettings}
          disabled={saving || !profitTargetEnabled}
          className={`w-full py-1.5 rounded-lg font-medium text-xs transition ${
            saving || !profitTargetEnabled
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
          }`}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {error && (
          <div className="text-xs text-red-500 text-center">{error}</div>
        )}
      </div>
    </div>
  )
}

export default ProfitTargetControl
