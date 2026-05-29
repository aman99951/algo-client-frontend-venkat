import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Bell, Wifi, WifiOff, Settings, TrendingUp, TrendingDown,
  Key, ExternalLink, RefreshCw, Volume2, VolumeX, Send,
  LogIn, UserPlus, LogOut, Copy, Check, AlertCircle, Eye, EyeOff,
  Zap, ShieldCheck, Target, Activity, BarChart3, Clock, X,
  Power, Unplug, Link2, ToggleLeft, ToggleRight, Radio,
  Newspaper, Sun, CloudRain, Moon, Coins
} from 'lucide-react'
import ProfitTargetControl from './components/ProfitTargetControl'
import SafetyShield from './components/SafetyShield'
import CreditBadge from './components/CreditBadge'
import CreditStore from './components/CreditStore'

// API/WS base URLs are configured from env; local fallback points to backend dev server.
const API_BASE = import.meta.env.VITE_API_URL

// Status badge config
const STATUS_CONFIG = {
  active:      { label: 'ACTIVE',      color: '', border: 'border-amber-200', icon: '🔔', pulse: true, badge: { bg: 'rgba(212,168,67,0.12)', text: '#d4a843' } },
  in_market:   { label: 'IN MARKET',   color: '', border: 'border-blue-200',   icon: '📊', pulse: true, badge: { bg: 'rgba(99,102,241,0.12)', text: '#818cf8' } },
  target_hit:  { label: 'TARGET HIT',  color: '', border: 'border-emerald-200',  icon: '🎯', pulse: false, badge: { bg: 'rgba(34,197,94,0.12)', text: '#22c55e' } },
  sl_hit:      { label: 'SL HIT',      color: '', border: 'border-red-200',    icon: '🛑', pulse: false, badge: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' } },
  manual_exit: { label: 'EXITED',      color: '', border: 'border-gray-200',   icon: '🔄', pulse: false, badge: { bg: 'rgba(255,255,255,0.06)', text: '#a09880' } },
  expired:     { label: 'EXPIRED',     color: '', border: 'border-gray-200',   icon: '⏰', pulse: false, badge: { bg: 'rgba(255,255,255,0.04)', text: '#6b6580' } },
}

function App() {
  // Auth state
  const [authView, setAuthView] = useState('login')
  const [resetToken, setResetToken] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('tv_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      localStorage.removeItem('tv_user')
      return null
    }
  })
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('tv_api_key') || '')

  // Signal state
  const [isConnected, setIsConnected] = useState(false)
  const [signals, setSignals] = useState([])
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [zerodhaStatus, setZerodhaStatus] = useState(null)
  const [autoTriggerConfigs, setAutoTriggerConfigs] = useState([])
  const [showAutoTrigger, setShowAutoTrigger] = useState(false)
  const [showProfitTarget, setShowProfitTarget] = useState(false)
  const [loadingSignals, setLoadingSignals] = useState(false)
  const [showBrokerModal, setShowBrokerModal] = useState(false)
  const [pendingRequestToken, setPendingRequestToken] = useState('')
  const [tradeMode, setTradeMode] = useState(() => localStorage.getItem('tv_trade_mode') || 'manual')
  const [disconnecting, setDisconnecting] = useState(false)
  const [connectingBroker, setConnectingBroker] = useState(false)
  const [marketPulseData, setMarketPulseData] = useState(null) // for current index prices
  const [newsData, setNewsData] = useState(null) // Unified news data (sentiment + headlines + outlook)
  const [moodData, setMoodData] = useState(null) // Composite market mood (news + regime + VIX)
  const [pnlLocked, setPnlLocked] = useState(() => localStorage.getItem('tv_pnl_locked') === 'true') // P&L auto-lock state (persisted)
  const [pnlOverrideUntil, setPnlOverrideUntil] = useState(null) // When set, P&L auto-lock is suppressed until this time
  const [pnlLimit, setPnlLimit] = useState(() => {
    const saved = localStorage.getItem('tv_pnl_limit')
    return saved ? parseFloat(saved) : 2500
  }) // User-configurable P&L limit (default ₹2500)
  const [pnlLimitSaving, setPnlLimitSaving] = useState(false)
  const [showFundsModal, setShowFundsModal] = useState(false) // Funds check modal
  const [fundsStatus, setFundsStatus] = useState(null) // {available, required, sufficient, indices}

  // Upstox state
  const [upstoxStatus, setUpstoxStatus] = useState(null)
  const [showUpstoxModal, setShowUpstoxModal] = useState(false)
  const [pendingUpstoxCode, setPendingUpstoxCode] = useState('')
  const [showCreditStore, setShowCreditStore] = useState(false)

  // AliceBlue state
  const [aliceBlueStatus, setAliceBlueStatus] = useState(null)
  const [showAliceBlueModal, setShowAliceBlueModal] = useState(false)

  // Broker account info (name + available balance)
  const [brokerAccountInfo, setBrokerAccountInfo] = useState(null)

  // CENTRALIZED BACKEND STATS - Single source of truth when broker connected
  const [backendStats, setBackendStats] = useState(null)
  const backendStatsRef = useRef(null)  // For interval access
  const [backendClosedOrders, setBackendClosedOrders] = useState([])  // Closed orders from backend
  const [brokerPnlData, setBrokerPnlData] = useState(null)  // Raw kite.positions() P&L
  const [paperStats, setPaperStats] = useState(null)  // Bot paper-trade stats for comparison

  // Dashboard meta: telegram subscribers + credit balances
  const [telegramSubscribers, setTelegramSubscribers] = useState(null)
  const [creditBalance, setCreditBalance] = useState(null)
  const [dashboardCreditBalance, setDashboardCreditBalance] = useState(null)

  // Broker credentials for client-side order placement (sessionStorage = cleared on tab close)
  const [brokerCreds, setBrokerCreds] = useState(() => {
    try {
      const saved = sessionStorage.getItem('tv_broker_creds')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })

  const reconnectTimeoutRef = useRef(null)
  const reconnectAttemptRef = useRef(0)
  const pollIntervalRef = useRef(null)
  const nextSinceRef = useRef(null)
  const audioRef = useRef(null)

  // If user is logged in and has API key, show dashboard
  useEffect(() => {
    if (user && apiKey) {
      setAuthView('dashboard')

      // Handle Zerodha OAuth return
      const params = new URLSearchParams(window.location.search)
      const zerodhaResult = params.get('zerodha')
      const incomingRequestToken = params.get('request_token')
      if (incomingRequestToken) {
        // User came back from Zerodha callback with request token
        setPendingRequestToken(incomingRequestToken)
        setShowBrokerModal(true)
        window.history.replaceState({}, '', window.location.pathname)
      } else if (zerodhaResult === 'success') {
        const zUser = params.get('user')
        alert(`✅ Zerodha connected successfully! User: ${zUser}`)
        window.history.replaceState({}, '', window.location.pathname)
        fetch(`${API_BASE}/api/signals/zerodha/status?api_key=${apiKey}`)
          .then(r => r.json())
          .then(setZerodhaStatus)
      } else if (zerodhaResult === 'error') {
        const reason = params.get('reason') || 'Unknown error'
        alert(`❌ Zerodha connection failed: ${reason}`)
        window.history.replaceState({}, '', window.location.pathname)
      }

      // Handle Upstox OAuth return
      const upstoxCode = params.get('upstox_code')
      if (upstoxCode) {
        setPendingUpstoxCode(upstoxCode)
        setShowUpstoxModal(true)
        window.history.replaceState({}, '', window.location.pathname)
      }
    } else if (!user) {
      // Check for password reset link params
      const params = new URLSearchParams(window.location.search)
      const rt = params.get('reset_token')
      const re = params.get('reset_email')
      if (rt && re) {
        setResetToken(rt)
        setResetEmail(re)
        setAuthView('reset-password')
        window.history.replaceState({}, '', window.location.pathname)
      } else {
        setAuthView('login')
      }
    }
  }, [user, apiKey])

  // Persist user
  useEffect(() => {
    if (user) {
      localStorage.setItem('tv_user', JSON.stringify(user))
    } else {
      localStorage.removeItem('tv_user')
    }
  }, [user])

  // Play notification sound
  const playSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.play().catch(() => {})
    }
  }, [soundEnabled])

  // ─── Load today's signals from REST API ───────────────────────────

  const loadTodaySignals = useCallback(async () => {
    if (!apiKey) return
    setLoadingSignals(true)
    try {
      // Trigger server-side sync first (fire-and-forget, don't block)
      // After market hours (IST 15:30+), also expire stale signals
      const istHour = new Date().getUTCHours() + 5 + (new Date().getUTCMinutes() + 30 >= 60 ? 1 : 0)
      const expireFlag = istHour >= 16 ? '&expire_stale=true' : ''
      fetch(`${API_BASE}/api/signals/sync-signals?api_key=${apiKey}${expireFlag}`, { method: 'POST' }).catch(() => {})

      const res = await fetch(`${API_BASE}/api/signals/today?api_key=${apiKey}`)
      if (res.ok) {
        const data = await res.json()
        const loaded = (data.signals || []).map(s => ({
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
        }))
        setSignals(loaded)
      }
    } catch (err) {
      console.error('Failed to load today signals:', err)
    } finally {
      setLoadingSignals(false)
    }
  }, [apiKey])

  // Load today's signals on mount and when API key changes
  useEffect(() => {
    if (apiKey && authView === 'dashboard') {
      loadTodaySignals()
    }
  }, [apiKey, authView, loadTodaySignals])

  // ─── 30-second polling safety net ─────────────────────────────────
  // Catches silent WS stalls (mobile network switch, TCP half-open).
  // Only fetches when dashboard is visible; never interferes with orders.
  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (apiKey && authView === 'dashboard') {
      let pollCount = 0
      pollIntervalRef.current = setInterval(() => {
        pollCount++
        // Silent background sync — no loading spinner, no UI disruption
        fetch(`${API_BASE}/api/signals/today?api_key=${apiKey}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (!data?.signals) return
            const loaded = data.signals.map(s => ({
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
            }))
            
            // Merge with existing signals to prevent reverting WebSocket-updated closed trades
            setSignals(prev => {
              // If no previous signals, just use loaded
              if (prev.length === 0) return loaded
              
              const merged = [...loaded]
              const closedStates = ['target_hit', 'sl_hit', 'manual_exit', 'expired']
              
              // Check each existing signal
              prev.forEach(existingSignal => {
                const existingIdx = merged.findIndex(m => 
                  m.signal_id && existingSignal.signal_id && m.signal_id === existingSignal.signal_id
                )
                
                if (existingIdx !== -1) {
                  const existingStatus = existingSignal.data?.status || ''
                  const loadedStatus = merged[existingIdx].data?.status || ''
                  
                  // If existing is closed but API says it's still active/in_market, keep the closed state
                  // (WebSocket is faster than DB writes — don't revert WebSocket updates)
                  if (closedStates.includes(existingStatus) && !closedStates.includes(loadedStatus)) {
                    merged[existingIdx] = existingSignal
                  }
                } else {
                  // Signal exists in prev but not in API response
                  // Keep it if it's closed (it might have just exited)
                  const existingStatus = existingSignal.data?.status || ''
                  if (closedStates.includes(existingStatus)) {
                    merged.push(existingSignal)
                  }
                }
              })
              
              return merged
            })
          })
          .catch(() => {})  // silent — WS handles primary updates

        // Every 2 minutes (4 polls), sync GTT status from Zerodha
        // to detect target/SL hits and update closed trades
        if (zerodhaStatus?.is_connected && pollCount % 4 === 0) {
          fetch(`${API_BASE}/api/signals/sync-gtt-status?api_key=${apiKey}`, { method: 'POST' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data?.updated?.length > 0) {
                console.log('GTT sync: updated', data.updated.length, 'orders')
              }
            })
            .catch(() => {})  // silent

          // Also sync actual broker fill prices & P&L from kite.positions()
          fetch(`${API_BASE}/api/signals/sync-actual-prices?api_key=${apiKey}`, { method: 'POST' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data?.positions_synced > 0 || data?.updated > 0) {
                console.log('Price sync: updated', data.updated, 'orders,', data.positions_synced, 'from positions')
              }
            })
            .catch(() => {})  // silent
        }
      }, 30000)  // every 30 seconds
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [apiKey, authView, zerodhaStatus?.is_connected])

  // ─── Load auto-trigger configs ────────────────────────────────────

  const loadAutoTriggerConfigs = useCallback(async () => {
    if (!apiKey) return
    try {
      const res = await fetch(`${API_BASE}/api/signals/auto-trigger?api_key=${apiKey}`)
      if (res.ok) {
        const data = await res.json()
        setAutoTriggerConfigs(data.configs || [])
      }
    } catch (err) {
      console.error('Failed to load auto-trigger configs:', err)
    }
  }, [apiKey])

  useEffect(() => {
    if (apiKey) loadAutoTriggerConfigs()
  }, [apiKey, loadAutoTriggerConfigs])

  // Show browser notification
  const showNotification = useCallback((data) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    const signal = data.signal
    const signalData = data.data || {}

    let title = ''
    let body = ''

    if (signal === 'detected') {
      title = `🔔 Signal: ${signalData.index} ${signalData.direction}`
      body = `Strike: ${signalData.strike}\nTarget: +${signalData.target_points || 30} pts | SL: -${signalData.stop_loss_points || 20} pts`
    } else if (signal === 'entry') {
      title = `📊 IN MARKET: ${signalData.symbol || signalData.index}`
      body = `Entry: ₹${signalData.entry_price?.toFixed(2)} | Target: ₹${signalData.target_price?.toFixed(2)} | SL: ₹${signalData.sl_price?.toFixed(2)}`
    } else if (signal === 'exit') {
      const pnl = signalData.pnl || 0
      const status = pnl >= 0 ? '🎯 TARGET HIT' : '🛑 SL HIT'
      title = `${status}: ${signalData.symbol || signalData.index}`
      body = `P&L: ₹${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`
    }

    new Notification(title, { body, icon: '/favicon.svg', tag: data.signal_id || Date.now() })
  }, [])

  // ─── Signal polling (replaces WebSocket) ──────────────────────────

  const pollSignals = useCallback(async () => {
    if (!apiKey) return

    try {
      const url = `${API_BASE}/api/signals/poll?api_key=${apiKey}${nextSinceRef.current ? `&since=${nextSinceRef.current}` : ''}`
      const res = await fetch(url)
      if (!res.ok) return

      const { signals: newSignals, next_since } = await res.json()
      nextSinceRef.current = next_since

      if (newSignals?.length) {
        newSignals.forEach(data => {
          const signalId = data.signal_id || data.data?.signal_id || ''
          const signalType = data.signal
          const status = data.data?.status || signalType

          setSignals(prev => {
            let existingIdx = prev.findIndex(s =>
              s.signal_id && signalId && s.signal_id === signalId
            )

            if (existingIdx === -1 && (signalType === 'exit' || signalType === 'entry') && !signalId) {
              const msgIndex = data.data?.index || ''
              const msgOption = data.data?.option_type || data.data?.direction || ''
              existingIdx = prev.findIndex(s => {
                const sIndex = s.data?.index || s.data?.index_name || ''
                const sDir = s.data?.option_type || s.data?.direction || ''
                const sStatus = s.data?.status || ''
                return sIndex === msgIndex && sDir === msgOption &&
                  (signalType === 'exit' ? sStatus === 'in_market' : sStatus === 'active')
              })
            }

            if (existingIdx !== -1) {
              const updated = [...prev]
              updated[existingIdx] = {
                ...updated[existingIdx],
                signal: signalType,
                data: { ...updated[existingIdx].data, ...data.data, status },
                timestamp: data.timestamp || updated[existingIdx].timestamp,
              }
              return updated
            }

            if (signalType === 'exit' && !signalId) {
              return prev
            }

            return [{
              ...data,
              signal_id: signalId,
              id: signalId || Date.now(),
              receivedAt: new Date().toISOString()
            }, ...prev]
          })

          playSound()
          showNotification(data)
        })

        setIsConnected(true)
        setConnectionStatus('connected')
      }
    } catch (err) {
      console.error('Poll signals error:', err)
      setIsConnected(false)
      setConnectionStatus('disconnected')
    }
  }, [apiKey, playSound, showNotification])

  // Connect polling when API key is set
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('tv_api_key', apiKey)
      pollSignals()
      const interval = setInterval(pollSignals, 5000)
      pollIntervalRef.current = interval
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [apiKey, pollSignals])

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Connect when API key is set
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('tv_api_key', apiKey)
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [apiKey])

  // Check Zerodha status
  useEffect(() => {
    if (!apiKey) return

    fetch(`${API_BASE}/api/signals/zerodha/status?api_key=${apiKey}`)
      .then(res => res.json())
      .then(data => {
        setZerodhaStatus(data)
        // Sync user's P&L limit from backend
        if (data?.daily_pnl_limit) {
          setPnlLimit(data.daily_pnl_limit)
          localStorage.setItem('tv_pnl_limit', String(data.daily_pnl_limit))
        }
        // CRITICAL FIX: Sync tradeMode from backend auto_trade_enabled
        // Prevents UI showing "Auto-trading" when backend has disabled it
        if (data?.is_connected) {
          const backendMode = data.auto_trade_enabled ? 'auto' : 'manual'
          const frontendMode = localStorage.getItem('tv_trade_mode') || 'manual'
          if (backendMode !== frontendMode) {
            console.log(`🔄 Syncing tradeMode: frontend=${frontendMode}, backend=${backendMode} → using backend`)
            setTradeMode(backendMode)
            localStorage.setItem('tv_trade_mode', backendMode)
            // If backend disabled auto-trading, set P&L lock flag
            if (backendMode === 'manual' && frontendMode === 'auto') {
              setPnlLocked(true)
            }
          }
        }
      })
      .catch(() => setZerodhaStatus(null))

    // Check Upstox status
    fetch(`${API_BASE}/api/signals/upstox/status?api_key=${apiKey}`)
      .then(res => res.json())
      .then(data => {
        setUpstoxStatus(data)
        // Sync P&L limit from Upstox (if connected and Zerodha is not)
        if (data?.is_connected && data?.daily_pnl_limit && !zerodhaStatus?.is_connected) {
          setPnlLimit(data.daily_pnl_limit)
          localStorage.setItem('tv_pnl_limit', String(data.daily_pnl_limit))
        }
      })
      .catch(() => setUpstoxStatus(null))

    // Check AliceBlue status
    fetch(`${API_BASE}/api/signals/aliceblue/status?api_key=${apiKey}`)
      .then(res => res.json())
      .then(data => {
        setAliceBlueStatus(data)
        // Sync P&L limit from AliceBlue (if connected and Zerodha is not)
        if (data?.is_connected && data?.daily_pnl_limit && !zerodhaStatus?.is_connected) {
          setPnlLimit(data.daily_pnl_limit)
          localStorage.setItem('tv_pnl_limit', String(data.daily_pnl_limit))
        }
        // Sync tradeMode from AliceBlue auto_trade_enabled (when AliceBlue is the connected broker)
        if (data?.is_connected && data?.auto_trade_enabled !== undefined) {
          const backendMode = data.auto_trade_enabled ? 'auto' : 'manual'
          const frontendMode = localStorage.getItem('tv_trade_mode') || 'manual'
          if (backendMode !== frontendMode) {
            console.log(`🔄 Syncing tradeMode from AliceBlue: frontend=${frontendMode}, backend=${backendMode} → using backend`)
            setTradeMode(backendMode)
            localStorage.setItem('tv_trade_mode', backendMode)
          }
        }
      })
      .catch(() => setAliceBlueStatus(null))
  }, [apiKey])

  // ─── CENTRALIZED STATS POLLING ────────────────────────────────────
  // Fetch stats from backend (single source of truth) for ALL users.
  // Backend handles both broker mode (SubscriberOrders) and paper mode
  // (SignalTracker) — always returns accurate stats.
  const isBrokerConnected = zerodhaStatus?.is_connected || upstoxStatus?.is_connected || aliceBlueStatus?.is_connected

  // Fetch broker account info (name + balance) when connection changes
  useEffect(() => {
    if (!apiKey || !isBrokerConnected) {
      setBrokerAccountInfo(null)
      return
    }
    const fetchAccountInfo = () => {
      fetch(`${API_BASE}/api/signals/broker/account-info?api_key=${apiKey}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.connected) setBrokerAccountInfo(data) })
        .catch(() => {})
    }
    fetchAccountInfo()
    // Refresh balance every 60s while broker is connected
    const interval = setInterval(fetchAccountInfo, 60000)
    return () => clearInterval(interval)
  }, [apiKey, isBrokerConnected])

  // Determine which broker is currently connected (only one at a time)
  const connectedBroker = zerodhaStatus?.is_connected
    ? { name: 'Zerodha', userId: zerodhaStatus.zerodha_user_id, color: 'green', icon: '✅' }
    : upstoxStatus?.is_connected
      ? { name: 'Upstox', userId: upstoxStatus.upstox_user_id, color: 'orange', icon: '🟠' }
      : aliceBlueStatus?.is_connected
        ? { name: 'AliceBlue', userId: aliceBlueStatus.aliceblue_user_id, color: 'purple', icon: '🟣' }
        : null

  const fetchBackendStats = useCallback(async () => {
    if (!apiKey) {
      setBackendStats(null)
      setBackendClosedOrders([])
      setBrokerPnlData(null)
      return
    }
    try {
      // Broker connected: fetch stats + orders + broker-pnl in parallel
      // Paper mode: fetch stats only (no SubscriberOrders)
      const fetches = [
        fetch(`${API_BASE}/api/signals/user-stats?api_key=${apiKey}`)
      ]
      if (isBrokerConnected) {
        fetches.push(fetch(`${API_BASE}/api/signals/my-orders?api_key=${apiKey}`))
        fetches.push(fetch(`${API_BASE}/api/signals/broker-pnl?api_key=${apiKey}`))
      }

      const responses = await Promise.all(fetches)

      // Stats response
      if (responses[0].ok) {
        const data = await responses[0].json()
        if (data.success && data.stats) {
          setBackendStats(data.stats)
          backendStatsRef.current = data.stats
        }
        // Store paper stats for broker vs paper P&L comparison
        if (data.paper_stats) {
          setPaperStats(data.paper_stats)
        }
      }

      // Orders response (broker mode only)
      if (isBrokerConnected && responses[1]?.ok) {
        const data = await responses[1].json()
        if (data.orders) {
          // Filter to today's closed orders only
          const today = new Date().toISOString().slice(0, 10)
          const closedToday = data.orders.filter(o => {
            const isToday = (o.created_at || '').slice(0, 10) === today
            const isClosed = ['target_hit', 'sl_hit', 'manual_exit', 'closed', 'exited'].includes(o.status)
            if (!isToday || !isClosed) return false
            // Filter ghost orders (entry ≈ exit, pnl ≈ 0) — but NOT real broker orders
            const ep = o.entry_price || 0
            const xp = o.exit_price || 0
            const pnl = o.pnl || 0
            if (!o.order_id && ep && xp && Math.abs(ep - xp) < 0.01 && Math.abs(pnl) < 0.01) return false
            return true
          })
          setBackendClosedOrders(closedToday)
        }
      }

      // Broker P&L response — raw kite.positions() (single source of truth)
      if (isBrokerConnected && responses[2]?.ok) {
        const data = await responses[2].json()
        if (data.success) {
          setBrokerPnlData(data)
        }
      }
    } catch (err) {
      console.warn('[Stats] Failed to fetch backend stats:', err)
    }
  }, [apiKey, isBrokerConnected])

  // Poll backend stats every 30s for ALL users (not just broker connected)
  useEffect(() => {
    if (!apiKey) {
      setBackendStats(null)
      return
    }
    
    // Fetch immediately
    fetchBackendStats()
    
    // Poll every 30 seconds
    const interval = setInterval(fetchBackendStats, 30000)
    return () => clearInterval(interval)
  }, [apiKey, fetchBackendStats])

  // ─── FETCH DASHBOARD META (telegram subscribers + dashboard credits) ──
  const fetchDashboardMeta = useCallback(async () => {
    if (!apiKey) return
    const headers = { 'X-API-Key': apiKey }
    try {
      const [subRes, balRes, dashCredRes] = await Promise.all([
        fetch(`${API_BASE}/api/telegram/subscribers?session_id=${apiKey}`, { headers }),
        fetch(`${API_BASE}/api/credits/balance?api_key=${apiKey}`),
        fetch(`${API_BASE}/api/dashboard/credits/balance?session_id=${apiKey}`, { headers }),
      ])
      if (subRes.ok) {
        const data = await subRes.json()
        setTelegramSubscribers(data)
      }
      if (balRes.ok) {
        const data = await balRes.json()
        setCreditBalance(data)
      }
      if (dashCredRes.ok) {
        const data = await dashCredRes.json()
        setDashboardCreditBalance(data)
      }
    } catch (err) {
      console.warn('[DashboardMeta] Failed to fetch:', err)
    }
  }, [apiKey])

  // Poll dashboard meta every 60s
  useEffect(() => {
    if (!apiKey) {
      setTelegramSubscribers(null)
      setCreditBalance(null)
      setDashboardCreditBalance(null)
      return
    }
    fetchDashboardMeta()
    const interval = setInterval(fetchDashboardMeta, 60000)
    return () => clearInterval(interval)
  }, [apiKey, fetchDashboardMeta])

  // ─── UNIFIED NEWS DATA POLLING ────────────────────────────────────
  // Single endpoint fetches news + sentiment + outlook together
  // Replaces separate polling in NewsMoodBar and MarketNewsWidget
  const fetchNewsData = useCallback(async () => {
    if (!apiKey) return
    try {
      const res = await fetch(`${API_BASE}/api/signals/news-data?api_key=${apiKey}`)
      if (res.ok) {
        const data = await res.json()
        setNewsData(data)
      }
    } catch (err) {
      console.warn('[News] Failed to fetch news data:', err)
    }
  }, [apiKey])

  useEffect(() => {
    if (!apiKey) return
    fetchNewsData()
    const interval = setInterval(fetchNewsData, 120000) // Poll every 2 min
    return () => clearInterval(interval)
  }, [apiKey, fetchNewsData])

  // ─── COMPOSITE MARKET MOOD POLLING ────────────────────────────────
  // Fetches composite mood (news + regime + RSI + momentum + VIX)
  const fetchMoodData = useCallback(async () => {
    if (!apiKey) return
    try {
      const res = await fetch(`${API_BASE}/api/signals/market-mood?api_key=${apiKey}`)
      if (res.ok) {
        const data = await res.json()
        setMoodData(data)
      }
    } catch (err) {
      console.warn('[Mood] Failed to fetch market mood:', err)
    }
  }, [apiKey])

  useEffect(() => {
    if (!apiKey) return
    fetchMoodData()
    const interval = setInterval(fetchMoodData, 90000) // Poll every 90s
    return () => clearInterval(interval)
  }, [apiKey, fetchMoodData])

  // ─── Place Order ──────────────────────────────────────────────────
  // If broker credentials are available, place directly via thin proxy
  // (order goes: Client → Railway proxy → Kite API).
  // Railway does ZERO processing — just forwards bytes.
  // If no broker creds, falls back to server-side placement.

  const placeOrder = async (signalId, signalData = null) => {
    try {
      // Find the signal data for building the Kite order
      const sig = signalData || signals.find(s => s.signal_id === signalId)
      const d = sig?.data || sig || {}

      // CLIENT-SIDE placement (preferred — uses thin proxy)
      if (brokerCreds?.kite_api_key && brokerCreds?.access_token && zerodhaStatus?.is_connected) {
        const entryPrice = d.entry_price || d.spot_price || 0
        const targetPrice = d.target_price || (entryPrice + (d.target_points || 30))
        const slPrice = d.sl_price || (entryPrice - (d.stop_loss_points || 20))
        const symbol = d.estimated_symbol || `${d.index || d.index_name || ''}${d.strike || ''}${d.direction || ''}`
        // SENSEX trades on BFO (BSE F&O), NIFTY/BANKNIFTY on NFO
        const indexUpper = (d.index || d.index_name || '').toUpperCase()
        const exchange = indexUpper === 'SENSEX' ? 'BFO' : 'NFO'
        const productType = 'MIS'

        if (!symbol || !entryPrice) {
          return { success: false, message: 'Signal data incomplete — cannot build order' }
        }

        const res = await fetch(`${API_BASE}/api/signals/proxy/kite-order?api_key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kite_api_key: brokerCreds.kite_api_key,
            access_token: brokerCreds.access_token,
            tradingsymbol: symbol,
            exchange: exchange,
            transaction_type: 'BUY',
            quantity: 1,
            product: productType,
            entry_price: entryPrice,
            target_price: targetPrice,
            stop_loss_price: slPrice,
          })
        })
        const data = await res.json()

        if (data.success) {
          // Update local signal state
          setSignals(prev => prev.map(s => {
            if (s.signal_id === signalId) {
              return { ...s, data: { ...s.data, my_order: { status: 'placed', order_id: data.trigger_id, source: 'client_direct' } } }
            }
            return s
          }))
          return { success: true, message: `✅ GTT-OCO placed on Kite (ID: ${data.trigger_id})` }
        } else {
          // If access token expired, clear creds so next attempt uses server-side
          if (data.kite_status === 403 || (data.error && data.error.includes('token'))) {
            setBrokerCreds(null)
            sessionStorage.removeItem('tv_broker_creds')
          }
          return { success: false, message: data.error || 'Kite order failed' }
        }
      }

      // FALLBACK: Server-side placement (when no broker creds stored in browser)
      const res = await fetch(`${API_BASE}/api/signals/place-order?api_key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_id: signalId, quantity: 1 })
      })
      const data = await res.json()
      if (data.success) {
        setSignals(prev => prev.map(s => {
          if (s.signal_id === signalId) {
            return { ...s, data: { ...s.data, my_order: { status: data.status || 'placed', order_id: data.order_id } } }
          }
          return s
        }))
        return { success: true, message: data.message }
      } else {
        return { success: false, message: data.detail || data.error || 'Order placement failed' }
      }
    } catch (err) {
      return { success: false, message: 'Network error — try again' }
    }
  }

  // ─── Update auto-trigger ──────────────────────────────────────────

  const updateAutoTrigger = async (indexName, isEnabled, lotSize = 1, maxOrders = 5) => {
    try {
      const res = await fetch(`${API_BASE}/api/signals/auto-trigger?api_key=${apiKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index_name: indexName, is_enabled: isEnabled, lot_size: lotSize, max_orders_per_day: maxOrders })
      })
      if (res.ok) {
        await loadAutoTriggerConfigs()
        return true
      }
    } catch {}
    return false
  }

  // Logout
  const handleLogout = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    setUser(null)
    setApiKey('')
    setSignals([])
    setIsConnected(false)
    setConnectionStatus('disconnected')
    localStorage.removeItem('tv_api_key')
    localStorage.removeItem('tv_user')
    setBrokerCreds(null)
    sessionStorage.removeItem('tv_broker_creds')
    setAuthView('login')
  }

  // Login success handler
  const handleAuthSuccess = (userData, key) => {
    setUser(userData)
    if (key) {
      setApiKey(key)
      localStorage.setItem('tv_api_key', key)
    }
    setAuthView('dashboard')
  }

  // Telegram
  const openTelegram = () => {
    const botUrl = 'https://t.me/TradeVaultSignalBot?start=' + (apiKey ? apiKey.substring(0, 12) : '')
    window.open(botUrl, '_blank')
  }

  // Zerodha
  const connectZerodha = async () => {
    if (zerodhaStatus?.is_connected) return
    // Single broker at a time — check if another broker is already connected
    if (upstoxStatus?.is_connected) {
      alert('You are currently connected to Upstox. Please disconnect Upstox first before connecting Zerodha.')
      return
    }
    if (aliceBlueStatus?.is_connected) {
      alert('You are currently connected to AliceBlue. Please disconnect AliceBlue first before connecting Zerodha.')
      return
    }
    // Always show the modal — lets user enter/update credentials
    setShowBrokerModal(true)
  }

  const saveKiteCredentials = async (kiteApiKey, kiteApiSecret) => {
    try {
      const res = await fetch(`${API_BASE}/api/signals/zerodha/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, kite_api_key: kiteApiKey, kite_api_secret: kiteApiSecret })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to save credentials')
      // Return login URL so modal can open it in a new tab
      const urlRes = await fetch(`${API_BASE}/api/signals/zerodha/login-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey })
      })
      const urlData = await urlRes.json()
      if (!urlRes.ok) throw new Error(urlData.detail || 'Failed to get login URL')
      return { ...data, login_url: urlData.login_url }
    } catch (e) {
      throw e // re-throw so the modal can display it
    }
  }

  const exchangeRequestToken = async (requestToken) => {
    try {
      const res = await fetch(`${API_BASE}/api/signals/zerodha/exchange-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, request_token: requestToken })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to generate access token')

      // Store broker credentials for client-side order placement
      // This way orders go directly from client → Kite (via thin proxy)
      // instead of Railway doing all the heavy lifting
      if (data.kite_api_key && data.access_token) {
        const creds = {
          kite_api_key: data.kite_api_key,
          access_token: data.access_token,
          zerodha_user_id: data.zerodha_user_id,
          connected_at: new Date().toISOString(),
        }
        setBrokerCreds(creds)
        sessionStorage.setItem('tv_broker_creds', JSON.stringify(creds))
      }

      // Refresh Zerodha status + sync trade mode
      try {
        const st = await fetch(`${API_BASE}/api/signals/zerodha/status?api_key=${apiKey}`).then(r => r.json())
        setZerodhaStatus(st)
        // Sync tradeMode immediately after broker connects (prevents needing hard refresh)
        if (st?.is_connected && st?.auto_trade_enabled !== undefined) {
          const backendMode = st.auto_trade_enabled ? 'auto' : 'manual'
          setTradeMode(backendMode)
          localStorage.setItem('tv_trade_mode', backendMode)
        }
      } catch {}
      return data
    } catch (e) {
      throw e
    }
  }

  const startZerodhaOAuth = async () => {
    // No longer used — login URL opens in new tab from modal
  }

  const disconnectZerodha = async () => {
    if (!confirm('Disconnect Zerodha broker? Auto-trading will stop.')) return
    setDisconnecting(true)
    try {
      const res = await fetch(`${API_BASE}/api/signals/zerodha/disconnect?api_key=${apiKey}`, { method: 'DELETE' })
      if (res.ok) {
        setZerodhaStatus(prev => ({ ...prev, is_connected: false, zerodha_user_id: null, auto_trade_enabled: false }))
        setTradeMode('manual')
        localStorage.setItem('tv_trade_mode', 'manual')
        // Clear broker credentials on disconnect
        setBrokerCreds(null)
        setBrokerAccountInfo(null)
        sessionStorage.removeItem('tv_broker_creds')
      }
    } catch {} finally { setDisconnecting(false) }
  }

  // Upstox
  const connectUpstox = async () => {
    if (upstoxStatus?.is_connected) return
    // Single broker at a time
    if (zerodhaStatus?.is_connected) {
      alert('You are currently connected to Zerodha. Please disconnect Zerodha first before connecting Upstox.')
      return
    }
    if (aliceBlueStatus?.is_connected) {
      alert('You are currently connected to AliceBlue. Please disconnect AliceBlue first before connecting Upstox.')
      return
    }
    setShowUpstoxModal(true)
  }

  const saveUpstoxCredentials = async (upstoxApiKey, upstoxApiSecret) => {
    const res = await fetch(`${API_BASE}/api/signals/upstox/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, upstox_api_key: upstoxApiKey, upstox_api_secret: upstoxApiSecret })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Failed to save Upstox credentials')
    // Get login URL
    const urlRes = await fetch(`${API_BASE}/api/signals/upstox/login-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, redirect_url: `${API_BASE}/api/signals/upstox/callback` })
    })
    const urlData = await urlRes.json()
    if (!urlRes.ok) throw new Error(urlData.detail || 'Failed to get Upstox login URL')
    return { ...data, login_url: urlData.login_url, redirect_uri: urlData.redirect_uri }
  }

  const exchangeUpstoxCode = async (code) => {
    const res = await fetch(`${API_BASE}/api/signals/upstox/exchange-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, code, redirect_url: `${API_BASE}/api/signals/upstox/callback` })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Failed to exchange Upstox code')
    // Refresh Upstox status + sync trade mode
    try {
      const st = await fetch(`${API_BASE}/api/signals/upstox/status?api_key=${apiKey}`).then(r => r.json())
      setUpstoxStatus(st)
      if (st?.is_connected && st?.auto_trade_enabled !== undefined) {
        const backendMode = st.auto_trade_enabled ? 'auto' : 'manual'
        setTradeMode(backendMode)
        localStorage.setItem('tv_trade_mode', backendMode)
      }
    } catch {}
    return data
  }

  const disconnectUpstox = async () => {
    if (!confirm('Disconnect Upstox broker? Auto-trading via Upstox will stop.')) return
    setDisconnecting(true)
    try {
      const res = await fetch(`${API_BASE}/api/signals/upstox/disconnect?api_key=${apiKey}`, { method: 'DELETE' })
      if (res.ok) {
        setUpstoxStatus(prev => ({ ...prev, is_connected: false, upstox_user_id: null, auto_trade_enabled: false }))
        setBrokerAccountInfo(null)
      }
    } catch {} finally { setDisconnecting(false) }
  }

  // AliceBlue
  const connectAliceBlue = async () => {
    if (aliceBlueStatus?.is_connected) return
    // Single broker at a time
    if (zerodhaStatus?.is_connected) {
      alert('You are currently connected to Zerodha. Please disconnect Zerodha first before connecting AliceBlue.')
      return
    }
    if (upstoxStatus?.is_connected) {
      alert('You are currently connected to Upstox. Please disconnect Upstox first before connecting AliceBlue.')
      return
    }
    setShowAliceBlueModal(true)
  }

  const saveAliceBlueCredentials = async (abUserId, abApiSecret, abAuthCode) => {
    const body = {
      api_key: apiKey,
      aliceblue_user_id: abUserId,
      aliceblue_api_secret: abApiSecret,
    }
    if (abAuthCode) body.aliceblue_auth_code = abAuthCode

    const res = await fetch(`${API_BASE}/api/signals/aliceblue/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Failed to connect AliceBlue')
    // Refresh status + sync trade mode
    try {
      const st = await fetch(`${API_BASE}/api/signals/aliceblue/status?api_key=${apiKey}`).then(r => r.json())
      setAliceBlueStatus(st)
      if (st?.is_connected && st?.auto_trade_enabled !== undefined) {
        const backendMode = st.auto_trade_enabled ? 'auto' : 'manual'
        setTradeMode(backendMode)
        localStorage.setItem('tv_trade_mode', backendMode)
      }
    } catch {}
    return data
  }

  const disconnectAliceBlue = async () => {
    if (!confirm('Disconnect AliceBlue broker? Auto-trading via AliceBlue will stop.')) return
    setDisconnecting(true)
    try {
      const res = await fetch(`${API_BASE}/api/signals/aliceblue/disconnect?api_key=${apiKey}`, { method: 'DELETE' })
      if (res.ok) {
        setAliceBlueStatus(prev => ({ ...prev, is_connected: false, aliceblue_user_id: null, auto_trade_enabled: false }))
        setBrokerAccountInfo(null)
      }
    } catch {} finally { setDisconnecting(false) }
  }

  const toggleTradeMode = async (mode) => {
    // If switching to auto and P&L locked, ask for user confirmation to override
    if (mode === 'auto' && pnlLocked) {
      const confirmed = window.confirm(
        `⚠️ P&L limit (±₹${pnlLimit.toFixed(0)}) was reached.\n\n` +
        `Your current P&L: ₹${stats.dayPnl >= 0 ? '+' : ''}${stats.dayPnl.toFixed(0)}\n\n` +
        `Are you sure you want to override the lock and resume auto-trading?\n` +
        `The P&L limit will still trigger again if the new threshold is hit.`
      )
      if (!confirmed) return
      
      // Call broker-agnostic override endpoint to re-enable auto_trade for ALL connected brokers
      try {
        const res = await fetch(`${API_BASE}/api/signals/override-pnl-lock?api_key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) {
          alert('Failed to override P&L lock on server. Please try again.')
          return
        }
        const overrideData = await res.json()
        if (overrideData.override_until) {
          setPnlOverrideUntil(new Date(overrideData.override_until))
        }
      } catch {
        alert('Network error. Please try again.')
        return
      }
      
      // Clear the local lock
      setPnlLocked(false)
    }
    
    // If switching to auto, check funds sufficiency
    if (mode === 'auto' && zerodhaStatus?.is_connected) {
      const fundsOk = await checkFundsSufficiency()
      if (!fundsOk) {
        return // Modal will show, user can proceed from there
      }
    }
    
    setTradeMode(mode)
    localStorage.setItem('tv_trade_mode', mode)
    // Sync auto-trade setting with ALL connected brokers
    const autoEnabled = mode === 'auto'
    if (zerodhaStatus?.is_connected) {
      try {
        await fetch(`${API_BASE}/api/signals/zerodha/auto-trade?api_key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_trade_enabled: autoEnabled })
        })
        // Optimistically sync local state so sync effects don't re-lock
        setZerodhaStatus(prev => ({ ...prev, auto_trade_enabled: autoEnabled }))
      } catch {}
    }
    if (aliceBlueStatus?.is_connected) {
      try {
        await fetch(`${API_BASE}/api/signals/aliceblue/auto-trade?api_key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_trade_enabled: autoEnabled })
        })
        setAliceBlueStatus(prev => ({ ...prev, auto_trade_enabled: autoEnabled }))
      } catch {}
    }
    if (upstoxStatus?.is_connected) {
      try {
        await fetch(`${API_BASE}/api/signals/upstox/auto-trade?api_key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_trade_enabled: autoEnabled })
        })
        setUpstoxStatus(prev => ({ ...prev, auto_trade_enabled: autoEnabled }))
      } catch {}
    }
  }

  // Internal function to force mode switch (used by funds modal)
  const forceTradeMode = async (mode) => {
    setTradeMode(mode)
    localStorage.setItem('tv_trade_mode', mode)
    const autoEnabled = mode === 'auto'
    if (zerodhaStatus?.is_connected) {
      try {
        await fetch(`${API_BASE}/api/signals/zerodha/auto-trade?api_key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_trade_enabled: autoEnabled })
        })
        setZerodhaStatus(prev => ({ ...prev, auto_trade_enabled: autoEnabled }))
      } catch {}
    }
    if (aliceBlueStatus?.is_connected) {
      try {
        await fetch(`${API_BASE}/api/signals/aliceblue/auto-trade?api_key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_trade_enabled: autoEnabled })
        })
        setAliceBlueStatus(prev => ({ ...prev, auto_trade_enabled: autoEnabled }))
      } catch {}
    }
    if (upstoxStatus?.is_connected) {
      try {
        await fetch(`${API_BASE}/api/signals/upstox/auto-trade?api_key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_trade_enabled: autoEnabled })
        })
        setUpstoxStatus(prev => ({ ...prev, auto_trade_enabled: autoEnabled }))
      } catch {}
    }
  }

  // ─── Funds Sufficiency Check ───────────────────────────────────
  const checkFundsSufficiency = async () => {
    if (!zerodhaStatus?.is_connected || !brokerCreds?.session_id) {
      return true // Skip check if not connected
    }
    
    try {
      // Get available balance
      const marginRes = await fetch(`${API_BASE}/api/broker/margins?session_id=${brokerCreds.session_id}`)
      if (!marginRes.ok) throw new Error('Failed to fetch margins')
      const marginData = await marginRes.json()
      const availableBalance = marginData.available_cash || 0
      
      // Estimate required margin for active indices
      // Assuming ~₹300 per option * lot size + 20% buffer
      const LOT_SIZES = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20 }
      const OPTION_PRICE_EST = 300 // Conservative estimate
      const BUFFER = 1.2 // 20% safety buffer
      
      // Get unique active indices from autoTriggerConfigs or all 4
      const activeIndices = autoTriggerConfigs.length > 0 
        ? [...new Set(autoTriggerConfigs.map(c => c.index_name))]
        : ['NIFTY', 'BANKNIFTY', 'SENSEX']
      
      const requiredPerIndex = activeIndices.reduce((sum, idx) => {
        const lotSize = LOT_SIZES[idx] || 50
        return sum + (OPTION_PRICE_EST * lotSize)
      }, 0)
      
      const totalRequired = requiredPerIndex * BUFFER
      const sufficient = availableBalance >= totalRequired
      
      setFundsStatus({
        available: availableBalance,
        required: totalRequired,
        sufficient,
        indices: activeIndices
      })
      
      if (!sufficient) {
        setShowFundsModal(true)
        return false
      }
      
      return true
    } catch (err) {
      console.error('Funds check failed:', err)
      return true // Don't block on error
    }
  }

  // ── User Isolation: Calculate P&L based on broker connection ────────
  // If broker connected (Zerodha/Upstox): show ALL signals but calculate P&L from user's own orders only
  // If paper trading (no broker): show ALL system trades with system P&L
  // NOTE: isBrokerConnected is defined earlier (near stats polling).

  // Identify which signals have user's own orders (for P&L isolation)
  const userOrderSignals = React.useMemo(() => {
    if (!isBrokerConnected) return signals
    return signals.filter(s => {
      const myOrder = s.data?.my_order
      return myOrder && myOrder !== null && typeof myOrder === 'object' && Object.keys(myOrder).length > 0
    })
  }, [signals, isBrokerConnected])

  // ─── Market hours check — hide trades after midnight until 8:00 AM ───
  const [isTradeWindowOpen, setIsTradeWindowOpen] = useState(() => {
    const h = new Date().getHours()
    // Show trades from 8:00 AM (pre-market prep) to 11:59 PM
    return h >= 8 || h < 0 // always true until midnight logic below
  })

  useEffect(() => {
    const checkWindow = () => {
      const now = new Date()
      const h = now.getHours()
      const m = now.getMinutes()
      // Trade window: 8:00 AM to 11:59 PM (next midnight)
      const open = h >= 8
      setIsTradeWindowOpen(open)
    }
    checkWindow()
    const timer = setInterval(checkWindow, 60000) // check every minute
    return () => clearInterval(timer)
  }, [])

  // ─── Compute summary stats ───────────────────────────────────────

  const stats = React.useMemo(() => {
    // ══════════════════════════════════════════════════════════════════
    // CENTRALIZED STATS: Use backend stats (single source of truth)
    // Works for BOTH broker-connected AND paper-mode users.
    // Backend handles paper mode via SignalTracker fallback.
    // ══════════════════════════════════════════════════════════════════
    if (backendStats) {
      // BROKER P&L OVERRIDE: Use raw kite.positions() total when available
      // brokerPnlData comes directly from kite.positions() — most accurate
      const dayPnl = (brokerPnlData?.success && brokerPnlData?.total_pnl != null)
        ? brokerPnlData.total_pnl
        : (backendStats.total_pnl || 0)

      return {
        active: backendStats.active_count || 0,
        targetHit: backendStats.target_count || 0,
        slHit: backendStats.sl_count || 0,
        exited: backendStats.exited_count || 0,
        closed: backendStats.total_closed || 0,
        total: signals.length,
        dayPnl,
        wins: backendStats.wins || 0,
        losses: backendStats.losses || 0,
        hasUserOrders: isBrokerConnected,
        winRate: backendStats.win_rate || 0,  // Pre-computed win rate from backend
        fromBackend: true,  // Flag indicating stats come from centralized backend
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // FALLBACK: Frontend calculation only when backend stats unavailable
    // (e.g., first load before backend responds)
    // ══════════════════════════════════════════════════════════════════
    const statsSignals = signals

    // Deduplicate active by index — count unique indices with active/in_market status
    const activeByIdx = {}
    statsSignals.forEach(s => {
      const st = s.data?.status
      if (st !== 'active' && st !== 'in_market') return
      const idx = (s.data?.index || s.data?.index_name || '').toUpperCase()
      if (!activeByIdx[idx] || new Date(s.timestamp || s.receivedAt) > new Date(activeByIdx[idx].timestamp || activeByIdx[idx].receivedAt)) {
        activeByIdx[idx] = s
      }
    })
    const active = Object.keys(activeByIdx).length

    // Deduplicate closed signals for counts — one per index+direction+exit_price
    // ALSO filter out ghost signals (entry === exit, pnl === 0)
    const seenClosed = new Set()
    let targetHit = 0, slHit = 0, exited = 0
    for (const s of statsSignals) {
      const st = s.data?.status
      if (st !== 'target_hit' && st !== 'sl_hit' && st !== 'manual_exit') continue
      // Skip ghost signals: entry == exit price with no P&L
      const ep = s.data?.entry_price || 0
      const xp = s.data?.exit_price || 0
      const pnl = s.data?.pnl || 0
      if (ep && xp && Math.abs(ep - xp) < 0.01 && Math.abs(pnl) < 0.01) continue
      const key = `${s.data?.index_name}_${s.data?.direction}_${Math.round(s.data?.exit_price || 0)}`
      if (seenClosed.has(key)) continue
      seenClosed.add(key)
      if (st === 'target_hit') targetHit++
      else if (st === 'sl_hit') slHit++
      else exited++
    }
    const closed = targetHit + slHit + exited

    // P&L calculation — skip ghosts
    const seenTrades = new Set()
    let dayPnl = 0
    let wins = 0
    let losses = 0
    for (const s of statsSignals) {
      const pnl = s.data?.pnl || 0
      if (pnl === 0 && !s.data?.exit_price) continue  // still in market
      // Skip ghost signals
      const ep = s.data?.entry_price || 0
      const xp = s.data?.exit_price || 0
      if (ep && xp && Math.abs(ep - xp) < 0.01 && Math.abs(pnl) < 0.01) continue
      const key = `${s.data?.index_name}_${s.data?.direction}_${Math.round(s.data?.exit_price || 0)}`
      if (seenTrades.has(key)) continue
      seenTrades.add(key)
      dayPnl += pnl
      if (pnl > 0) wins++
      else if (pnl < 0) losses++
    }
    const hasUserOrders = false
    const totalSignals = signals.length
    const winRate = closed > 0 ? Math.round(targetHit / closed * 100) : 0
    return { active, targetHit, slHit, exited, closed, total: totalSignals, dayPnl, wins, losses, hasUserOrders, winRate, fromBackend: false }
  }, [signals, isBrokerConnected, backendStats, brokerPnlData])

  // ─── P&L Auto-Lock: Switch to manual when P&L reaches ±user limit ───
  // Triggers on BOTH profit target and loss limit.
  // MUST be after stats definition since it depends on stats.dayPnl
  // Respects pnlOverrideUntil — if user has overridden, don't re-lock.
  useEffect(() => {
    // Skip if user has active P&L override
    if (pnlOverrideUntil && new Date() < pnlOverrideUntil) return

    if (Math.abs(stats.dayPnl) >= pnlLimit && tradeMode === 'auto' && !pnlLocked) {
      setPnlLocked(true)
      setTradeMode('manual')
      localStorage.setItem('tv_trade_mode', 'manual')
      
      // Sync with ALL connected brokers
      if (zerodhaStatus?.is_connected) {
        fetch(`${API_BASE}/api/signals/zerodha/auto-trade?api_key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_trade_enabled: false })
        }).catch(() => {})
        setZerodhaStatus(prev => ({ ...prev, auto_trade_enabled: false }))
      }
      if (aliceBlueStatus?.is_connected) {
        fetch(`${API_BASE}/api/signals/aliceblue/auto-trade?api_key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_trade_enabled: false })
        }).catch(() => {})
        setAliceBlueStatus(prev => ({ ...prev, auto_trade_enabled: false }))
      }
      if (upstoxStatus?.is_connected) {
        fetch(`${API_BASE}/api/signals/upstox/auto-trade?api_key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_trade_enabled: false })
        }).catch(() => {})
        setUpstoxStatus(prev => ({ ...prev, auto_trade_enabled: false }))
      }
      
      // Show notification
      const reason = stats.dayPnl >= pnlLimit ? 'Profit Target' : 'Loss Limit'
      alert(`🔒 Auto-Trading Locked: ${reason} reached (₹${stats.dayPnl.toFixed(0)}). Switched to Manual mode.`)
    }
  }, [stats.dayPnl, tradeMode, pnlLocked, pnlOverrideUntil, zerodhaStatus, aliceBlueStatus, upstoxStatus, apiKey, pnlLimit])

  // Reset P&L lock when day starts fresh (P&L back to near zero)
  // MUST be after stats definition since it depends on stats.dayPnl
  useEffect(() => {
    if (pnlLocked && Math.abs(stats.dayPnl) < 100) {
      setPnlLocked(false)
    }
  }, [stats.dayPnl, pnlLocked])

  // Persist pnlLocked to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('tv_pnl_locked', String(pnlLocked))
  }, [pnlLocked])

  // Sync pnlLocked from backend: if auto_trade_enabled=false on server,
  // the server disabled it (P&L lock hit or manual mode).
  useEffect(() => {
    // Check ANY connected broker's auto_trade_enabled status
    const brokerAutoTradeDisabled = 
      (zerodhaStatus?.is_connected && zerodhaStatus?.auto_trade_enabled === false) ||
      (aliceBlueStatus?.is_connected && aliceBlueStatus?.auto_trade_enabled === false)
    if (brokerAutoTradeDisabled) {
      // Backend has auto_trade disabled — sync frontend state
      // Only set if not already locked to avoid re-triggering alert
      if (!pnlLocked && tradeMode === 'auto') {
        console.log('🔒 Backend auto_trade_enabled=false, setting pnlLocked=true')
        setPnlLocked(true)
        setTradeMode('manual')
        localStorage.setItem('tv_trade_mode', 'manual')
      }
    }
  }, [zerodhaStatus?.is_connected, zerodhaStatus?.auto_trade_enabled, aliceBlueStatus?.is_connected, aliceBlueStatus?.auto_trade_enabled, tradeMode, pnlLocked])

  // ─── Auth Views ───────────────────────────────────────────────────

  if (authView !== 'dashboard') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{background: '#0a0a0f'}}>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl" style={{background: 'linear-gradient(135deg, #d4a843, #b8922e)'}}>
                <TrendingUp className="w-7 h-7 text-black" />
              </div>
              <h1 className="text-3xl font-bold gold-text">TradeVault</h1>
            </div>
            <p style={{color: '#a09880'}}>Real-time Trading Signals</p>
          </div>

          {authView === 'login' ? (
            <LoginForm onSuccess={handleAuthSuccess} onSwitchToRegister={() => setAuthView('register')} onForgotPassword={() => setAuthView('forgot-password')} />
          ) : authView === 'register' ? (
            <RegisterForm onSuccess={handleAuthSuccess} onSwitchToLogin={() => setAuthView('login')} />
          ) : authView === 'forgot-password' ? (
            <ForgotPasswordForm onBackToLogin={() => setAuthView('login')} />
          ) : authView === 'reset-password' ? (
            <ResetPasswordForm token={resetToken} email={resetEmail} onBackToLogin={() => setAuthView('login')} />
          ) : null}
        </div>
      </div>
    )
  }

  // ─── Dashboard ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{background: '#0a0a0f', color: '#f0e6d0', overflowX: 'hidden'}}>
      {/* Audio element - gracefully handles missing file */}
      <audio ref={audioRef} src="/notification.mp3" preload="none" onError={(e) => e.target.remove()} />

      {/* Credit Store Modal */}
      <CreditStore apiKey={apiKey} isOpen={showCreditStore} onClose={() => setShowCreditStore(false)} />

      {/* Header */}
      <header className="sticky top-0 z-[100] glass shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
        <div className="w-full px-1 sm:px-6 lg:px-8 py-1.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <div className="p-1 sm:p-1.5 rounded-lg" style={{background: 'linear-gradient(135deg, #d4a843, #b8922e)'}}>
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
            </div>
            <h1 className="hidden sm:block text-base sm:text-xl font-bold gold-text leading-tight">TradeVault</h1>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-2 overflow-x-auto no-scrollbar">
            {/* Connection Status — tiny dot on mobile */}
            <div className="sm:hidden flex-shrink-0">
              <span className={`block w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} title={connectionStatus} />
            </div>
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border flex-shrink-0" style={{
              borderColor: isConnected ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
              color: isConnected ? '#22c55e' : '#ef4444',
              background: isConnected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'
            }}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{connectionStatus}</span>
            </div>

            {/* Broker Account Info — name + balance */}
            {brokerAccountInfo?.connected && (
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0" style={{background: 'rgba(212,168,67,0.1)', borderColor: 'rgba(212,168,67,0.3)', color: '#f0d68a'}}>
                <span className="font-semibold">{brokerAccountInfo.user_name || brokerAccountInfo.user_id}</span>
                <span style={{color: '#6b6580'}}>·</span>
                <span className="font-mono">₹{Number(brokerAccountInfo.available_balance).toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Credit Balance Badge */}
            <div className="flex-shrink-0"><CreditBadge apiKey={apiKey} onBuyClick={() => setShowCreditStore(true)} /></div>

            <button onClick={() => setSoundEnabled(!soundEnabled)}
              className="hidden sm:flex p-1.5 sm:p-2 rounded-lg transition flex-shrink-0" style={{color: '#a09880'}} 
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,168,67,0.1)'} 
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>

            <button onClick={() => { setShowProfitTarget(!showProfitTarget); setShowAutoTrigger(false); setShowSettings(false) }}
              className="p-1 sm:p-2 rounded-lg transition flex-shrink-0" title="Daily Profit Target"
              style={{color: showProfitTarget ? '#d4a843' : '#a09880', background: showProfitTarget ? 'rgba(212,168,67,0.1)' : 'transparent'}}
              onMouseEnter={e => { if(!showProfitTarget) e.currentTarget.style.background = 'rgba(212,168,67,0.08)' }} 
              onMouseLeave={e => { if(!showProfitTarget) e.currentTarget.style.background = 'transparent' }}>
              <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <button onClick={() => { setShowAutoTrigger(!showAutoTrigger); setShowSettings(false) }}
              className="p-1 sm:p-2 rounded-lg transition flex-shrink-0" title="Auto-Trigger Settings"
              style={{color: showAutoTrigger ? '#d4a843' : '#a09880', background: showAutoTrigger ? 'rgba(212,168,67,0.1)' : 'transparent'}}
              onMouseEnter={e => { if(!showAutoTrigger) e.currentTarget.style.background = 'rgba(212,168,67,0.08)' }} 
              onMouseLeave={e => { if(!showAutoTrigger) e.currentTarget.style.background = 'transparent' }}>
              <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <button onClick={() => { setShowSettings(!showSettings); setShowAutoTrigger(false) }}
              className="p-1 sm:p-2 rounded-lg transition flex-shrink-0" title="Settings"
              style={{color: showSettings ? '#d4a843' : '#a09880', background: showSettings ? 'rgba(212,168,67,0.1)' : 'transparent'}}
              onMouseEnter={e => { if(!showSettings) e.currentTarget.style.background = 'rgba(212,168,67,0.08)' }} 
              onMouseLeave={e => { if(!showSettings) e.currentTarget.style.background = 'transparent' }}>
              <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <button onClick={handleLogout}
              className="p-1 sm:p-2 rounded-lg transition flex-shrink-0" title="Logout"
              style={{color: '#ef4444'}}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'} 
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Top Bar Dropdowns ──────────────────────────────────── */}
      {(showAutoTrigger || showSettings || showProfitTarget) && (
        <>
          <div className="fixed left-0 right-0" style={{top: '48px', bottom: 0, zIndex: 90}} onClick={() => { setShowAutoTrigger(false); setShowSettings(false); setShowProfitTarget(false) }} />
          {showAutoTrigger && (
            <div className="fixed right-4" style={{top: '60px', zIndex: 95}}>
              <div className="w-[calc(100vw-32px)] max-w-sm rounded-xl shadow-2xl p-4" style={{background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)'}}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold flex items-center gap-2" style={{color: '#f0e6d0'}}>
                    <Zap className="w-4 h-4" style={{color: '#d4a843'}} />
                    Auto-Trigger Settings
                    {!isBrokerConnected && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{background: 'rgba(212,168,67,0.12)', color: '#d4a843', border: '1px solid rgba(212,168,67,0.25)'}}>Paper Mode</span>
                    )}
                  </h3>
                  <button onClick={() => setShowAutoTrigger(false)}
                    className="p-1 rounded-lg transition" style={{color: '#6b6580'}}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {['NIFTY', 'BANKNIFTY', 'SENSEX'].map(idx => {
                    const config = autoTriggerConfigs.find(c => c.index_name === idx) || { is_enabled: false, lot_size: 1, max_orders_per_day: 5, orders_placed_today: 0 }
                    return (
                      <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{color: '#f0e6d0'}}>{idx}</span>
                          {config.orders_placed_today > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)'}}>
                              {config.orders_placed_today}/{config.max_orders_per_day} today
                            </span>
                          )}
                        </div>
                        <button
                          onClick={async () => { await updateAutoTrigger(idx, !config.is_enabled, config.lot_size, config.max_orders_per_day) }}
                          className="relative w-12 h-6 rounded-full transition-colors"
                          style={{background: config.is_enabled ? '#d4a843' : 'rgba(255,255,255,0.15)'}}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform shadow-sm`} style={{background: '#1a1a24', transform: config.is_enabled ? 'translateX(24px)' : 'none'}} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          {showSettings && (
            <div className="fixed right-4" style={{top: '60px', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', zIndex: 95}}>
              <div className="w-[calc(100vw-32px)] max-w-sm rounded-xl shadow-2xl" style={{background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)'}}>
                <div className="flex items-center justify-between px-4 pt-4 pb-0">
                  <h3 className="text-sm font-bold flex items-center gap-2" style={{color: '#f0e6d0'}}>
                    <Settings className="w-4 h-4" style={{color: '#d4a843'}} /> Settings
                  </h3>
                  <button onClick={() => setShowSettings(false)}
                    className="p-1 rounded-lg transition" style={{color: '#6b6580'}}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <SettingsPanel
                  apiKey={apiKey}
                  user={user}
                  zerodhaStatus={zerodhaStatus}
                  upstoxStatus={upstoxStatus}
                  aliceBlueStatus={aliceBlueStatus}
                  onConnectTelegram={openTelegram}
                  onConnectZerodha={connectZerodha}
                  onConnectUpstox={connectUpstox}
                  onDisconnectUpstox={disconnectUpstox}
                  onConnectAliceBlue={connectAliceBlue}
                  onDisconnectAliceBlue={disconnectAliceBlue}
                  onRegenerateKey={async () => {
                    try {
                      const res = await fetch(`${API_BASE}/api/signals/regenerate-key`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: user.email, api_key: apiKey })
                      })
                      const data = await res.json()
                      if (data.api_key) {
                        setApiKey(data.api_key)
                        localStorage.setItem('tv_api_key', data.api_key)
                        alert('New API key generated! Check your email.')
                      } else {
                        alert(data.detail || 'Failed to regenerate key.')
                      }
                    } catch {
                      alert('Failed to regenerate key.')
                    }
                  }}
                />
              </div>
            </div>
          )}
          {showProfitTarget && (
            <div className="fixed right-4" style={{top: '60px', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', zIndex: 95}}>
              <div className="w-[calc(100vw-32px)] max-w-md rounded-xl shadow-2xl" style={{background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)'}}>
                <div className="flex items-center justify-between px-4 pt-4 pb-0">
                  <h3 className="text-sm font-bold flex items-center gap-2" style={{color: '#f0e6d0'}}>
                    <Target className="w-4 h-4" style={{color: '#d4a843'}} /> Daily Profit Target
                  </h3>
                  <button onClick={() => setShowProfitTarget(false)}
                    className="p-1 rounded-lg transition" style={{color: '#6b6580'}}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4">
                  <ProfitTargetControl apiKey={apiKey} sessionId={apiKey} brokerPnlData={brokerPnlData} />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <main className="w-full px-2 sm:px-6 lg:px-8 py-4 sm:py-6 mx-auto" style={{maxWidth:'100vw', overflowX:'hidden'}}>
        {/* ── Broker Connection Bar ───────────────────────────────── */}
        <div className="mb-6 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center gap-3" style={{
          background: isBrokerConnected ? 'rgba(34,197,94,0.08)' : 'var(--bg-card)',
          border: '1px solid',
          borderColor: isBrokerConnected ? 'rgba(34,197,94,0.2)' : 'var(--border)'
        }}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{
              background: isBrokerConnected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)'
            }}>
              {isBrokerConnected
                ? <Link2 className="w-5 h-5" style={{color: '#22c55e'}} />
                : <Unplug className="w-5 h-5" style={{color: '#6b6580'}} />
              }
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isBrokerConnected ? 'bg-green-500' : 'bg-gray-500'}`} style={{boxShadow: isBrokerConnected ? '0 0 6px #22c55e' : 'none'}} />
              <span className="text-xs font-medium" style={{color: isBrokerConnected ? '#22c55e' : '#6b6580'}}>
                {isBrokerConnected ? `${connectedBroker.name}` : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-1">
              <span className="text-xs font-medium" style={{color: '#a09880'}}>Trade Mode:</span>
              <div className="flex rounded-lg p-0.5 gap-0.5" style={{background: 'rgba(255,255,255,0.05)'}}>
                <button onClick={() => toggleTradeMode('manual')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
                    tradeMode === 'manual'
                      ? 'shadow-sm'
                      : ''
                  }`}
                  style={tradeMode === 'manual' ? {background: 'var(--bg-elevated)', color: '#f0e6d0', border: '1px solid rgba(212,168,67,0.2)'} : {color: '#6b6580'}}>
                  <ToggleLeft className="w-3.5 h-3.5" />
                  Manual Trade
                </button>
                <button onClick={() => {
                  if (!isBrokerConnected) {
                    alert('Connect a broker account first to enable auto-trading.')
                    return
                  }
                  toggleTradeMode('auto')
                }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
                    tradeMode === 'auto'
                      ? 'shadow-sm'
                      : pnlLocked
                      ? 'animate-pulse'
                      : ''
                  }`}
                  style={tradeMode === 'auto' ? {background: 'linear-gradient(135deg, #d4a843, #b8922e)', color: '#000'} : pnlLocked ? {background: 'rgba(212,168,67,0.15)', color: '#d4a843', border: '1px solid rgba(212,168,67,0.3)'} : {color: '#6b6580'}}>
                  <ToggleRight className="w-3.5 h-3.5" />
                  {pnlLocked && tradeMode !== 'auto' ? 'Resume Auto' : 'Auto Trade'}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isBrokerConnected ? (
              <button onClick={
                connectedBroker?.name === 'Upstox' ? disconnectUpstox
                : connectedBroker?.name === 'AliceBlue' ? disconnectAliceBlue
                : disconnectZerodha
              } disabled={disconnecting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-50" style={{borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444', background: 'rgba(239,68,68,0.08)'}}>
                <Power className="w-3.5 h-3.5" />
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            ) : (
              <button onClick={() => { setConnectingBroker(true); setShowSettings(true); setTimeout(() => setConnectingBroker(false), 1500) }}
                disabled={connectingBroker}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-black transition shadow-sm disabled:opacity-70" style={{background: 'linear-gradient(135deg, #d4a843, #b8922e)'}}>
                <Link2 className={`w-3.5 h-3.5 ${connectingBroker ? 'animate-pulse' : ''}`} />
                {connectingBroker ? 'Opening...' : 'Connect Broker'}
              </button>
            )}
          </div>
        </div>



        {/* ── Summary Bar — only during trade window ─────────────── */}
        {isTradeWindowOpen && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
          <StatCard label="Active" value={stats.active} icon={<Activity className="w-4 h-4" />} color="#6366f1" />
          <StatCard label="Target" value={stats.targetHit} icon={<Target className="w-4 h-4" />} color="#22c55e" />
          <StatCard label="SL Hit" value={stats.slHit} icon={<ShieldCheck className="w-4 h-4" />} color="#ef4444" />
          <StatCard label="Win Rate" value={stats.closed > 0 ? `${stats.winRate}%` : '—'}
            icon={<BarChart3 className="w-4 h-4" />}
            color={stats.winRate >= 50 ? '#22c55e' : '#d4a843'} />
          <StatCard label={stats.hasUserOrders ? 'My P&L' : 'Day P&L'} value={`₹${stats.dayPnl >= 0 ? '+' : ''}${stats.dayPnl.toFixed(0)}`}
            icon={<TrendingUp className="w-4 h-4" />}
            color={stats.dayPnl >= 0 ? '#22c55e' : '#ef4444'} />
        </div>
        )}

        {/* ── Broker vs Bot P&L comparison — shows when broker is connected ── */}
        {isTradeWindowOpen && isBrokerConnected && paperStats && paperStats.total_closed > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 p-3 rounded-xl" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider" style={{color: '#a09880'}}>Broker (Live)</span>
            <span className={`font-mono font-bold text-sm ${stats.dayPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              ₹{stats.dayPnl >= 0 ? '+' : ''}{stats.dayPnl.toFixed(0)}
            </span>
            <span className="text-xs" style={{color: '#6b6580'}}>({stats.closed} trades)</span>
          </div>
          <div className="w-px h-6" style={{background: 'var(--border)'}} />
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider" style={{color: '#a09880'}}>Bot (Paper)</span>
            <span className={`font-mono font-bold text-sm ${paperStats.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              ₹{paperStats.total_pnl >= 0 ? '+' : ''}{paperStats.total_pnl.toFixed(0)}
            </span>
            <span className="text-xs" style={{color: '#6b6580'}}>({paperStats.total_closed} trades)</span>
          </div>
        </div>
        )}

        {/* ── Broker Credentials Modal (Zerodha) ──────────────────── */}
        {showBrokerModal && (
          <BrokerCredentialsModal
            onClose={() => { setShowBrokerModal(false); setPendingRequestToken(''); }}
            onSave={saveKiteCredentials}
            onExchangeToken={exchangeRequestToken}
            initialRequestToken={pendingRequestToken}
          />
        )}

        {/* ── Upstox Credentials Modal ───────────────────────────── */}
        {showUpstoxModal && (
          <UpstoxCredentialsModal
            onClose={() => { setShowUpstoxModal(false); setPendingUpstoxCode(''); }}
            onSave={saveUpstoxCredentials}
            onExchangeCode={exchangeUpstoxCode}
            initialCode={pendingUpstoxCode}
          />
        )}

        {/* ── AliceBlue Credentials Modal ────────────────────────── */}
        {showAliceBlueModal && (
          <AliceBlueCredentialsModal
            onClose={() => setShowAliceBlueModal(false)}
            onSave={saveAliceBlueCredentials}
          />
        )}

        {/* ── Funds Sufficiency Modal ─────────────────────────────── */}
        {showFundsModal && fundsStatus && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{background: 'rgba(0,0,0,0.6)'}}>
            <div className="rounded-2xl shadow-xl max-w-md w-full p-6" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2" style={{color: '#f0e6d0'}}>
                  {fundsStatus.sufficient ? (
                    <><Check className="w-5 h-5" style={{color: '#22c55e'}} /><span style={{color: '#22c55e'}}>Funds Sufficient</span></>
                  ) : (
                    <><AlertCircle className="w-5 h-5" style={{color: '#d4a843'}} /><span style={{color: '#d4a843'}}>Low Balance Warning</span></>
                  )}
                </h3>
                <button onClick={() => setShowFundsModal(false)}
                  className="p-1 rounded-lg transition" style={{color: '#6b6580'}} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 mb-4">
                <div className="rounded-lg p-3" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}>
                  <div className="text-xs mb-1" style={{color: '#a09880'}}>Available Balance</div>
                  <div className="text-2xl font-bold" style={{color: '#f0e6d0'}}>
                    ₹{fundsStatus.available.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                </div>

                <div className="rounded-lg p-3" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}>
                  <div className="text-xs mb-1" style={{color: '#a09880'}}>Estimated Required (with buffer)</div>
                  <div className="text-xl font-semibold" style={{color: '#f0e6d0'}}>
                    ₹{fundsStatus.required.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs mt-1" style={{color: '#6b6580'}}>
                    For {fundsStatus.indices.join(', ')}
                  </div>
                </div>

                {!fundsStatus.sufficient && (
                  <div className="rounded-lg p-3" style={{background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)'}}>
                    <div className="text-xs flex items-start gap-2" style={{color: '#d4a843'}}>
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold mb-1">Insufficient Funds</div>
                        <div className="text-xs leading-relaxed" style={{color: '#a09880'}}>
                          You may not be able to take all signals. Consider adding funds or reducing active indices.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setShowFundsModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg font-semibold transition text-sm" style={{background: 'rgba(255,255,255,0.08)', color: '#a09880', border: '1px solid var(--border)'}} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
                  Cancel
                </button>
                <button id="funds-proceed-btn" onClick={async (e) => {
                  const btn = e.currentTarget
                  btn.disabled = true
                  btn.textContent = 'Switching...'
                  setShowFundsModal(false)
                  await forceTradeMode('auto')
                }}
                  className="flex-1 px-4 py-2.5 rounded-lg font-semibold transition text-sm text-white"
                  style={{background: fundsStatus.sufficient ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #d4a843, #b8922e)'}}>
                  {fundsStatus.sufficient ? 'Continue' : 'Proceed Anyway'}
                </button>
              </div>

              <p className="text-xs text-center mt-3" style={{color: '#6b6580'}}>
                Estimate based on ₹300/option × lot size. Actual margin may vary.
              </p>
            </div>
          </div>
        )}

        {/* ── Market Mood Bar — composite sentiment + real data ──── */}
        <NewsMoodBar newsData={newsData} moodData={moodData} />

        {/* ── Signal Board — Active Trades + Closed History ──────── */}
        {isTradeWindowOpen ? (
          <SignalBoard
            signals={signals}
            loadingSignals={loadingSignals}
            onRefresh={loadTodaySignals}
            onPlaceOrder={placeOrder}
            zerodhaConnected={isBrokerConnected}
            tradeMode={tradeMode}
            autoTriggerConfigs={autoTriggerConfigs}
            marketPulse={marketPulseData}
            isBrokerConnected={isBrokerConnected}
            backendStats={backendStats}
            backendClosedOrders={backendClosedOrders}
            brokerPnlData={brokerPnlData}
          />
        ) : (
          <div className="rounded-xl p-8 text-center" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
            <Moon className="w-10 h-10 mx-auto mb-3" style={{color: '#d4a843'}} />
            <h3 className="font-semibold text-lg mb-1" style={{color: '#f0e6d0'}}>Markets Closed</h3>
            <p className="text-sm" style={{color: '#a09880'}}>Trading signals will appear here when markets open at 9:15 AM</p>
            <p className="text-xs mt-2" style={{color: '#6b6580'}}>Market Pulse &amp; News widgets are available below</p>
          </div>
        )}

        {/* ── Market Pulse — independent regime display ───────────── */}
        <MarketPulse apiKey={apiKey} onDataUpdate={setMarketPulseData} />

        {/* ── Safety Shield — hidden from end-user view ─────────── */}
        {/* <SafetyShield marketPulseData={marketPulseData} /> */}

        {/* ── Market News — AI-curated market-impacting headlines ── */}
        <MarketNewsWidget newsData={newsData} apiKey={apiKey} onRefreshComplete={fetchNewsData} />
      </main>

      <footer className="mt-8 py-4 text-center text-xs" style={{color: '#6b6580'}}>
        TradeVault Signals
      </footer>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  MARKET PULSE — read-only regime indicator (independent of all logic)
// ═══════════════════════════════════════════════════════════════════════

const STANCE_STYLES = {
  green:  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', bar: 'bg-emerald-500' },
  blue:   { bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-600',  bar: 'bg-blue-500' },
  amber:  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', bar: 'bg-amber-500' },
  red:    { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-600',   bar: 'bg-red-500' },
  gray:   { bg: 'bg-gray-50',  border: 'border-gray-200',  text: 'text-gray-500',  bar: 'bg-gray-400' },
}

// ═══════════════════════════════════════════════════════════════════════
//  MARKET MOOD BAR — Composite mood from real data + news sentiment
//  (purely display, no trade logic — combines regime, RSI, VIX, news)
// ═══════════════════════════════════════════════════════════════════════

function NewsMoodBar({ newsData, moodData }) {
  const [expanded, setExpanded] = useState(false)

  // Prefer composite mood when available, fall back to news-only
  const hasComposite = moodData && moodData.composite_score !== undefined
  const sentiment = newsData?.sentiment || null

  if (!hasComposite && !sentiment) return null

  // ── Composite mood values ──
  const compositeScore = hasComposite ? moodData.composite_score : 0
  const moodLabel   = hasComposite ? moodData.mood_label : (sentiment?.bias || 'neutral')
  const moodBias    = hasComposite ? moodData.mood_bias : (sentiment?.bias || 'neutral')
  const breakdown   = hasComposite ? moodData.breakdown : null
  const vix         = breakdown?.vix || {}
  const newsBreak   = breakdown?.news || {}
  const highImpact  = newsBreak?.high_impact || sentiment?.high_impact || []

  const light = moodBias === 'bullish' ? 'green' : moodBias === 'bearish' ? 'red' : 'gray'
  const lightConfig = {
    green: { label: moodLabel, labelColor: '#22c55e', barBg: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)', barColor: '#22c55e' },
    red:   { label: moodLabel, labelColor: '#ef4444', barBg: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', barColor: '#ef4444' },
    gray:  { label: moodLabel, labelColor: '#a09880', barBg: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', barColor: '#6b6580' },
  }
  const lc = lightConfig[light]

  // Composite bar: map -100…+100 → 0…100%
  const displayScore = hasComposite ? compositeScore : (sentiment?.score || 0)
  const barPct = hasComposite
    ? Math.min(100, Math.max(0, ((compositeScore + 100) / 200) * 100))
    : Math.min(100, Math.max(0, ((displayScore + 30) / 60) * 100))

  const Chip = ({ label, score, icon }) => {
    const chipColor = score > 10 ? {color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)'} : score < -10 ? {color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)'} : {color: '#a09880', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)'}
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium" style={chipColor}>
        {icon && <span className="text-xs">{icon}</span>}
        {label}
        <span className="font-mono ml-0.5">{score > 0 ? '+' : ''}{Math.round(score)}</span>
      </span>
    )
  }

  return (
    <div className="rounded-xl mb-4 overflow-hidden" style={{background: lc.barBg, border: `1px solid ${lc.borderColor}`}}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-2.5 flex items-center gap-3 transition hover:bg-white/[0.02]"
      >
        <div className="flex gap-1.5 flex-shrink-0">
          <div className={`w-3 h-3 rounded-full transition-all duration-500 ${
            moodBias === 'bullish' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-emerald-200'
          }`} />
          <div className={`w-3 h-3 rounded-full transition-all duration-500 ${
            moodBias === 'neutral' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-amber-200'
          }`} />
          <div className={`w-3 h-3 rounded-full transition-all duration-500 ${
            moodBias === 'bearish' ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]' : 'bg-red-200'
          }`} />
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wider" style={{color: '#a09880'}}>
              {hasComposite ? 'Market Mood' : 'News Mood'}
            </span>
            <span className="text-xs font-bold" style={{color: lc.labelColor}}>{lc.label}</span>
            {vix.available && (
                <span className="text-xs px-1.5 py-0.5 rounded font-medium border" style={vix.value < 16 ? {background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.2)'} : vix.value < 20 ? {background: 'rgba(255,255,255,0.05)', color: '#a09880', borderColor: 'rgba(255,255,255,0.1)'} : {background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)'}}>
                VIX {vix.value}
              </span>
            )}
            {hasComposite && (
              <div className="hidden sm:flex items-center gap-1">
                <Chip label="News" score={newsBreak.score || 0} icon="📰" />
                <Chip label="Regime" score={breakdown?.regime?.score || 0} icon="📊" />
                <Chip label="RSI" score={breakdown?.rsi?.score || 0} icon="📈" />
              </div>
            )}
          </div>
          <div className="w-full h-1.5 rounded-full mt-1 overflow-hidden" style={{background: 'rgba(255,255,255,0.05)'}}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{width: `${barPct}%`, background: lc.barColor}}
            />
          </div>
        </div>

        {highImpact.length > 0 && (
          <div className="flex-shrink-0 hidden sm:flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background: '#ef4444'}} />
            <span className="text-xs font-medium" style={{color: '#ef4444'}}>{highImpact.length} Alert</span>
          </div>
        )}

          <div className="flex-shrink-0 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold" style={displayScore > 0 ? {background: 'rgba(34,197,94,0.1)', color: '#22c55e'} : displayScore < 0 ? {background: 'rgba(239,68,68,0.1)', color: '#ef4444'} : {background: 'rgba(255,255,255,0.05)', color: '#6b6580'}}>
          {displayScore > 0 ? '+' : ''}{hasComposite ? compositeScore.toFixed(0) : displayScore.toFixed(0)}
        </div>

        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} style={{color: '#6b6580'}}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && hasComposite && (
        <div className="px-3 pb-3 pt-1 space-y-2" style={{borderTop: '1px solid var(--border)'}}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'News', score: newsBreak.score || 0, weight: newsBreak.weight, icon: '📰',
                detail: `${newsBreak.bullish_count || 0}↑ ${newsBreak.bearish_count || 0}↓ ${newsBreak.neutral_count || 0}—` },
              { label: 'Regime', score: breakdown?.regime?.score || 0, weight: breakdown?.regime?.weight, icon: '📊',
                detail: moodData.indices?.map(i => `${i.index}: ${i.regime}`).join(', ') || 'N/A' },
              { label: 'RSI', score: breakdown?.rsi?.score || 0, weight: breakdown?.rsi?.weight, icon: '📈',
                detail: moodData.indices?.map(i => `${i.index}: ${i.rsi}`).join(', ') || 'N/A' },
              { label: 'Momentum', score: breakdown?.momentum?.score || 0, weight: breakdown?.momentum?.weight, icon: '🔄',
                detail: moodData.indices?.map(i => `${i.index}: ${i.momentum > 0 ? '+' : ''}${i.momentum?.toFixed(5)}`).join(', ') || 'N/A' },
            ].map(item => {
              const barW = Math.min(100, Math.max(0, ((item.score + 100) / 200) * 100))
              const barC = item.score > 10 ? 'bg-emerald-500' : item.score < -10 ? 'bg-red-500' : 'bg-gray-300'
              return (
                <div key={item.label} className="rounded-lg p-2" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{color: '#a09880'}}>{item.icon} {item.label} <span style={{color: '#6b6580'}}>({Math.round((item.weight || 0) * 100)}%)</span></span>
                    <span className="text-xs font-mono font-bold" style={item.score > 0 ? {color: '#22c55e'} : item.score < 0 ? {color: '#ef4444'} : {color: '#6b6580'}}>{item.score > 0 ? '+' : ''}{Math.round(item.score)}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{background: 'rgba(255,255,255,0.05)'}}>
                    <div className="h-full rounded-full transition-all duration-500" style={{width: `${barW}%`, background: barC === 'bg-emerald-500' ? '#22c55e' : barC === 'bg-red-500' ? '#ef4444' : '#6b6580'}} />
                  </div>
                  <div className="text-xs mt-1 truncate" style={{color: '#6b6580'}}>{item.detail}</div>
                </div>
              )
            })}
          </div>
          {vix.available && (
            <div className="rounded-lg p-2 flex items-center gap-3" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}>
              <span className="text-xs" style={{color: '#6b6580'}}>India VIX</span>
              <span className="text-xs font-bold" style={vix.value < 16 ? {color: '#22c55e'} : vix.value < 20 ? {color: '#d4a843'} : {color: '#ef4444'}}>{vix.value}</span>
              <span className="text-xs" style={{color: '#a09880'}}>{vix.label}</span>
              <span className="text-xs font-mono ml-auto" style={vix.score > 0 ? {color: '#22c55e'} : vix.score < 0 ? {color: '#ef4444'} : {color: '#6b6580'}}>Score: {vix.score > 0 ? '+' : ''}{vix.score}</span>
            </div>
          )}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs" style={{color: '#6b6580'}}>Sources:</span>
            {(moodData.data_sources || []).map((src, i) => (
              <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#a09880'}}>{src}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


function MarketPulse({ apiKey, onDataUpdate }) {
  const [pulseData, setPulseData] = useState(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!apiKey) return
    let cancelled = false

    const fetchPulse = () => {
      fetch(`${API_BASE}/api/signals/market-pulse?api_key=${apiKey}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!cancelled && data) {
            setPulseData(data)
            // Report data upward for use in trade cards
            if (onDataUpdate) onDataUpdate(data)
          }
        })
        .catch(() => {})  // silent — this is supplementary info
    }

    fetchPulse()
    const interval = setInterval(fetchPulse, 60000)  // refresh every 60s
    return () => { cancelled = true; clearInterval(interval) }
  }, [apiKey, onDataUpdate])

  if (!pulseData?.indices?.length) return null

  const now = new Date()
  const hour = now.getHours()
  const isMarketHours = hour >= 9 && hour < 16
  const timeLabel = isMarketHours ? 'Live' : hour >= 16 ? 'Post-Market' : 'Pre-Market'

  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-t-xl transition" 
        style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
      >
        <span className="text-xs font-semibold flex items-center gap-2" style={{color: '#f0e6d0'}}>
          <Activity className="w-3.5 h-3.5" style={{color: '#d4a843'}} />
          Market Pulse
          <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={isMarketHours ? {background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)'} : {background: 'rgba(255,255,255,0.05)', color: '#a09880', border: '1px solid rgba(255,255,255,0.1)'}}>
            {timeLabel}
          </span>
        </span>
        <span style={{color: '#6b6580'}} className="text-xs">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-b-xl" style={{background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: 'none'}}>
          {pulseData.indices.map((idx) => {
            const s = STANCE_STYLES[idx.stance_color] || STANCE_STYLES.gray
            const rsiColor = idx.rsi > 70 ? '#ef4444' : idx.rsi < 30 ? '#22c55e' : '#a09880'

            return (
              <div key={idx.index} className="rounded-lg p-3" style={{background: idx.stance_color === 'green' ? 'rgba(34,197,94,0.06)' : idx.stance_color === 'red' ? 'rgba(239,68,68,0.06)' : idx.stance_color === 'amber' ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.03)', border: '1px solid', borderColor: idx.stance_color === 'green' ? 'rgba(34,197,94,0.15)' : idx.stance_color === 'red' ? 'rgba(239,68,68,0.15)' : idx.stance_color === 'amber' ? 'rgba(212,168,67,0.2)' : 'var(--border)'}}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{color: '#f0e6d0'}}>{idx.index}</span>
                    {idx.price && (
                      <span className="text-xs font-mono" style={{color: '#a09880'}}>₹{idx.price.toLocaleString()}</span>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded text-xs font-bold" style={{background: idx.stance_color === 'green' ? 'rgba(34,197,94,0.1)' : idx.stance_color === 'red' ? 'rgba(239,68,68,0.1)' : idx.stance_color === 'amber' ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.05)', color: idx.stance_color === 'green' ? '#22c55e' : idx.stance_color === 'red' ? '#ef4444' : idx.stance_color === 'amber' ? '#d4a843' : '#a09880', border: '1px solid', borderColor: idx.stance_color === 'green' ? 'rgba(34,197,94,0.2)' : idx.stance_color === 'red' ? 'rgba(239,68,68,0.2)' : idx.stance_color === 'amber' ? 'rgba(212,168,67,0.25)' : 'var(--border)'}}>
                    {idx.stance_icon} {idx.stance}
                  </span>
                </div>

                <p className="text-xs mb-2" style={{color: '#a09880'}}>{idx.stance_desc}</p>

                <div className="flex items-center gap-3 text-xs">
                  {idx.rsi != null && (
                    <span style={{color: rsiColor}}>
                      RSI: <span className="font-mono font-bold">{idx.rsi}</span>
                    </span>
                  )}
                  {idx.volatility_pct != null && (
                    <span style={{color: '#a09880'}}>
                      Vol: <span className="font-mono">{idx.volatility_pct}%</span>
                    </span>
                  )}
                  {idx.bot_decision && (
                    <span className="ml-auto font-semibold" style={idx.bot_decision === 'WAIT' ? {color: '#a09880'} : idx.bot_decision === 'POSITION_OPEN' ? {color: '#6366f1'} : {color: '#d4a843'}}>
                      {idx.bot_decision}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  MARKET NEWS — AI-curated market-impacting headlines + outlook
// ═══════════════════════════════════════════════════════════════════════

const SENTIMENT_BADGE = {
  bullish: { bg: 'rgba(34,197,94,0.18)', text: '#4ade80', icon: '📈' },
  bearish: { bg: 'rgba(239,68,68,0.18)', text: '#f87171', icon: '📉' },
  neutral: { bg: 'rgba(255,255,255,0.08)', text: '#f0e6d0', icon: '➖' },
  mixed:   { bg: 'rgba(212,168,67,0.18)', text: '#f0d68a', icon: '⚖️' },
}

const IMPACT_BADGE = {
  high:   { bg: 'rgba(239,68,68,0.18)', text: '#f87171', label: 'HIGH' },
  medium: { bg: 'rgba(212,168,67,0.18)', text: '#f0d68a', label: 'MED' },
}

const CATEGORY_ICONS = {
  macro: '🏛️', earnings: '💰', policy: '📋', global: '🌍', sector: '🏭', fii_dii: '💹',
}

function MarketNewsWidget({ newsData: parentNewsData, apiKey, onRefreshComplete }) {
  const [collapsed, setCollapsed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showOutlook, setShowOutlook] = useState(false)

  // Use parent's unified news data (polled every 2 min from /news-data)
  const headlines = parentNewsData?.news || []
  const outlook = parentNewsData?.outlook || null

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetch(`${API_BASE}/api/signals/market-news/refresh?api_key=${apiKey}`, { method: 'POST' })
      // Wait for server to process, then immediately re-fetch fresh data
      await new Promise(r => setTimeout(r, 2000))
      if (onRefreshComplete) await onRefreshComplete()
    } catch {}
    setRefreshing(false)
  }

  const now = new Date()
  const hour = now.getHours()
  const hasOutlook = outlook && outlook.summary

  // Show outlook tab after 3 PM
  const showOutlookTab = hour >= 15 || hasOutlook

  if (!headlines.length && !hasOutlook) return null

  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-t-xl transition"
        style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
      >
        <span className="text-xs font-semibold flex items-center gap-2" style={{color: '#f0e6d0'}}>
          <Newspaper className="w-3.5 h-3.5" style={{color: '#d4a843'}} />
          Market News
          {headlines.length > 0 && (
            <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{background: 'rgba(212,168,67,0.15)', color: '#d4a843', border: '1px solid rgba(212,168,67,0.3)'}}>
              {headlines.length}
            </span>
          )}
        </span>
        <span style={{color: '#6b6580'}} className="text-xs">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className="rounded-b-xl p-3" style={{background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: 'none'}}>
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setShowOutlook(false)}
              className="px-3 py-1 rounded-lg text-xs font-semibold transition"
              style={!showOutlook ? {background: 'rgba(212,168,67,0.12)', color: '#d4a843', border: '1px solid rgba(212,168,67,0.25)'} : {color: '#6b6580'}}
              onMouseEnter={e => { if(showOutlook) e.currentTarget.style.color = '#a09880' }}
              onMouseLeave={e => { if(showOutlook) e.currentTarget.style.color = '#6b6580' }}
            >
              📰 Headlines
            </button>
            {showOutlookTab && (
              <button
                onClick={() => setShowOutlook(true)}
                className="px-3 py-1 rounded-lg text-xs font-semibold transition"
                style={showOutlook ? {background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)'} : {color: '#6b6580'}}
                onMouseEnter={e => { if(!showOutlook) e.currentTarget.style.color = '#a09880' }}
                onMouseLeave={e => { if(!showOutlook) e.currentTarget.style.color = '#6b6580' }}
              >
                🔮 Tomorrow's Outlook
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="ml-auto p-1 rounded transition"
              style={{color: '#6b6580'}}
              title="Refresh news"
              onMouseEnter={e => { if(!refreshing) e.currentTarget.style.background = 'rgba(212,168,67,0.1)'; e.currentTarget.style.color = '#d4a843' }}
              onMouseLeave={e => { if(!refreshing) e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b6580' }}
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {!showOutlook && (
            <div className="max-h-[400px] overflow-y-auto pr-1">
              {headlines.length === 0 ? (
                <p className="text-center text-xs py-4" style={{color: '#6b6580'}}>
                  No market-impacting news yet today. News updates every 2 min during market hours.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b uppercase tracking-wider font-semibold" style={{borderColor: 'var(--border)', color: '#d4a843'}}>
                      <th className="text-left py-2 pr-2 w-8"></th>
                      <th className="text-left py-2 px-2">Headline</th>
                      <th className="text-center py-2 px-2 w-14">Impact</th>
                      <th className="hidden sm:table-cell text-center py-2 px-2 w-20">Sentiment</th>
                      <th className="hidden md:table-cell text-left py-2 px-2 w-16">Source</th>
                      <th className="hidden md:table-cell text-right py-2 pl-2 w-16">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...headlines].sort((a, b) => {
                      const ta = a.published_at ? new Date(a.published_at.endsWith('Z') ? a.published_at : a.published_at + 'Z').getTime() : 0
                      const tb = b.published_at ? new Date(b.published_at.endsWith('Z') ? b.published_at : b.published_at + 'Z').getTime() : 0
                      return tb - ta
                    }).map((item, i) => {
                      const impact = IMPACT_BADGE[item.impact_level] || IMPACT_BADGE.medium
                      const sent = SENTIMENT_BADGE[item.sentiment] || SENTIMENT_BADGE.neutral
                      const catIcon = CATEGORY_ICONS[item.category] || '📰'

                      return (
                        <tr key={item.id || i} className="transition" style={{borderBottom: '1px solid var(--border)'}} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td className="py-2.5 pr-2 text-center text-sm">{catIcon}</td>
                          <td className="py-2.5 px-2">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium transition leading-tight block"
                              style={{color: '#e8dcc8'}}
                              onMouseEnter={e => e.currentTarget.style.color = '#d4a843'}
                              onMouseLeave={e => e.currentTarget.style.color = '#e8dcc8'}
                            >
                              {item.headline}
                              {item.ai_summary && (
                                <span className="font-normal block mt-0.5 italic" style={{color: '#6b6580'}}>— {item.ai_summary}</span>
                              )}
                            </a>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span className="px-1.5 py-0.5 rounded font-bold" style={{background: impact.bg, color: impact.text}}>
                              {impact.label}
                            </span>
                          </td>
                          <td className="hidden sm:table-cell py-2.5 px-2 text-center">
                            <span className="px-1.5 py-0.5 rounded font-bold" style={{background: sent.bg, color: sent.text}}>
                              {sent.icon} {item.sentiment}
                            </span>
                          </td>
                          <td className="hidden md:table-cell py-2.5 px-2" style={{color: '#a09880'}}>{item.source}</td>
                          <td className="hidden md:table-cell py-2.5 pl-2 text-right whitespace-nowrap" style={{color: '#a09880'}}>
                            {item.published_at
                              ? (() => {
                                  const ts = item.published_at.endsWith('Z') ? item.published_at : item.published_at + 'Z'
                                  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
                                })()
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {showOutlook && (
            <div>
              {hasOutlook ? (
                <div className="rounded-lg p-4" style={{background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)'}}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{SENTIMENT_BADGE[outlook.sentiment]?.icon || '📊'}</span>
                      <div>
                        <p className="text-sm font-bold" style={{color: '#f0e6d0'}}>Next-Day Outlook</p>
                        <p className="text-xs" style={{color: '#6b6580'}}>
                          Generated {outlook.generated_at ? new Date(outlook.generated_at.endsWith?.('Z') ? outlook.generated_at : outlook.generated_at + 'Z').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : ''}
                        </p>
                      </div>
                    </div>
                    {outlook.sentiment_score != null && (
                      <div className="text-center">
                        <p className={`text-xl font-bold font-mono ${
                          outlook.sentiment_score > 20 ? 'text-emerald-600' :
                          outlook.sentiment_score < -20 ? 'text-red-600' : 'text-amber-600'
                        }`}>
                          {outlook.sentiment_score > 0 ? '+' : ''}{outlook.sentiment_score}
                        </p>
                        <p className="text-xs text-gray-500">Sentiment Score</p>
                      </div>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed mb-3" style={{color: '#a09880'}}>{outlook.summary}</p>

                  {outlook.key_factors?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold mb-1" style={{color: '#a09880'}}>Key Factors</p>
                      <div className="flex flex-wrap gap-1.5">
                        {outlook.key_factors.map((f, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-xs" style={{background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)'}}>
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {outlook.sectors_to_watch?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1" style={{color: '#a09880'}}>Sectors to Watch</p>
                      <div className="flex flex-wrap gap-1.5">
                        {outlook.sectors_to_watch.map((s, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-xs" style={{background: 'rgba(212,168,67,0.1)', color: '#d4a843', border: '1px solid rgba(212,168,67,0.2)'}}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-xs py-6" style={{color: '#6b6580'}}>
                  Market outlook refreshes at 8:30 AM (before market open) with overnight developments.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  STAT CARD (summary bar)
// ═══════════════════════════════════════════════════════════════════════

function StatCard({ label, value, icon, color }) {
  return (
    <div className="rounded-xl p-2 sm:p-3 transition-all" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(212,168,67,0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}>
      <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
        <span className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{color}}>{icon}</span>
        <span className="text-[10px] sm:text-xs uppercase tracking-wide leading-tight" style={{color: '#a09880'}}>{label}</span>
      </div>
      <div className="text-sm sm:text-lg font-bold leading-tight" style={{color}}>{value}</div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  SIGNAL BOARD — Active trades (top) + Closed history (bottom)
// ═══════════════════════════════════════════════════════════════════════

const INDEX_SLOTS = ['NIFTY', 'BANKNIFTY', 'SENSEX']

function SignalBoard({ signals, loadingSignals, onRefresh, onPlaceOrder, zerodhaConnected, tradeMode, autoTriggerConfigs = [], marketPulse, isBrokerConnected = false, backendStats = null, backendClosedOrders = [], brokerPnlData = null }) {
  const [showClosed, setShowClosed] = useState(false)

  // Split signals into active vs closed
  const activeSignals = signals.filter(s => {
    const st = s.data?.status
    return st === 'active' || st === 'in_market'
  })
  const closedSignals = (() => {
    const all = signals.filter(s => {
      const st = s.data?.status
      if (st !== 'target_hit' && st !== 'sl_hit' && st !== 'manual_exit') return false
      // Filter out ghost signals: entry == exit price with no P&L
      const ep = s.data?.entry_price || 0
      const xp = s.data?.exit_price || 0
      const pnl = s.data?.pnl || 0
      if (ep && xp && Math.abs(ep - xp) < 0.01 && Math.abs(pnl) < 0.01) return false
      return true
    })
    // Deduplicate: keep only newest signal per index+direction+exit_price combo
    const seen = new Set()
    return all.filter(s => {
      const key = `${s.data?.index_name}_${s.data?.direction}_${Math.round(s.data?.exit_price || 0)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()

  // Group active trades by index — pick latest per index (max 4 slots)
  const activeByIndex = {}
  activeSignals.forEach(s => {
    const idx = (s.data?.index || s.data?.index_name || '').toUpperCase()
    // Keep the newest signal per index
    if (!activeByIndex[idx] || new Date(s.timestamp || s.receivedAt) > new Date(activeByIndex[idx].timestamp || activeByIndex[idx].receivedAt)) {
      activeByIndex[idx] = s
    }
  })

  // Closed trades stats for the header
  // Always use backend stats when available (works for both broker + paper mode)
  // This ensures Closed Trades header matches the top stats bar exactly
  const targetHits = backendStats ? (backendStats.target_count || 0)
    : closedSignals.filter(s => s.data?.status === 'target_hit').length
  const slHits = backendStats ? (backendStats.sl_count || 0)
    : closedSignals.filter(s => s.data?.status === 'sl_hit').length
  // BROKER P&L: Use raw kite.positions() total_pnl as single source of truth
  // Falls back to backendStats (which also has positions override) then to local signals
  const totalPnl = (brokerPnlData?.success && brokerPnlData?.total_pnl != null)
    ? brokerPnlData.total_pnl
    : backendStats ? (backendStats.total_pnl || 0)
    : closedSignals.reduce((sum, s) => sum + (s.data?.pnl || 0), 0)

  // Build broker positions lookup for ClosedOrderRow to use
  const brokerPositionsMap = useMemo(() => {
    if (!brokerPnlData?.positions) return {}
    const map = {}
    for (const p of brokerPnlData.positions) {
      if (p.tradingsymbol) map[p.tradingsymbol.toUpperCase()] = p
    }
    return map
  }, [brokerPnlData])

  // Use backend orders for table rows when broker connected
  const useBackendOrders = isBrokerConnected && backendClosedOrders.length > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold flex items-center gap-2" style={{color: '#f0e6d0'}}>
            <Radio className="w-5 h-5" style={{color: '#d4a843'}} /> Live Trades
          </h2>
          {isBrokerConnected && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold border" style={{background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.2)'}}>
              Broker Connected
            </span>
          )}
          {!isBrokerConnected && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold border" style={{background: 'rgba(99,102,241,0.1)', color: '#818cf8', borderColor: 'rgba(99,102,241,0.2)'}}>
              Paper Mode
            </span>
          )}
        </div>
        <button onClick={onRefresh}
          className="p-2 rounded-lg transition" title="Refresh"
          style={{color: '#a09880'}}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,168,67,0.1)'; e.currentTarget.style.color = '#d4a843' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a09880' }}>
          <RefreshCw className={`w-4 h-4 ${loadingSignals ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {INDEX_SLOTS.map(idx => {
          const signal = activeByIndex[idx]
          if (signal) {
            return (
              <ActiveTradeCard
                key={signal.signal_id || signal.id}
                signal={signal}
                onPlaceOrder={onPlaceOrder}
                zerodhaConnected={zerodhaConnected}
                tradeMode={tradeMode}
                autoTriggerConfigs={autoTriggerConfigs}
                marketPulse={marketPulse}
              />
            )
          }
          return (
            <div key={idx} className="rounded-xl border border-dashed p-4 flex flex-col items-center justify-center min-h-[100px] cursor-default transition" style={{borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)'}}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.2)'; e.currentTarget.style.background = 'rgba(212,168,67,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}>
              <span className="text-xs font-bold mb-1" style={{color: '#a09880'}}>{idx}</span>
              <span className="text-xs" style={{color: '#6b6580'}}>No active trade</span>
            </div>
          )
        })}
      </div>

      {signals.length === 0 && (
        <div className="rounded-xl p-8 text-center mb-4" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
          <Activity className="w-8 h-8 mx-auto mb-2" style={{color: '#6b6580'}} />
          <p className="text-sm font-medium" style={{color: '#a09880'}}>
            {loadingSignals ? 'Loading signals...' : 'No signals yet today'}
          </p>
          <p className="text-xs mt-1" style={{color: '#6b6580'}}>Signals appear here in real-time during market hours</p>
        </div>
      )}

      {(useBackendOrders ? backendClosedOrders.length > 0 : (closedSignals.length > 0 || (backendStats && backendStats.total_closed > 0))) && (
        <div className="rounded-xl overflow-hidden" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
          <button onClick={() => setShowClosed(!showClosed)}
            className="w-full flex items-center justify-between px-4 py-3 transition"
            style={{color: '#a09880'}}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span className="text-sm font-semibold flex items-center gap-2" style={{color: '#f0e6d0'}}>
              <Clock className="w-4 h-4" style={{color: '#6b6580'}} />
              Closed Trades
              <span className="text-xs px-1.5 py-0.5 rounded-full font-bold border" style={{background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.2)'}}>
                🎯 {targetHits}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded-full font-bold border" style={{background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)'}}>
                🛑 {slHits}
              </span>
              {totalPnl !== 0 && (
                <span className="text-xs font-mono font-bold ml-1" style={totalPnl >= 0 ? {color: '#22c55e'} : {color: '#ef4444'}}>
                  ₹{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(0)}
                </span>
              )}
            </span>
            <span className="text-xs" style={{color: '#6b6580'}}>{showClosed ? '▾ Hide' : `▸ Show (${useBackendOrders ? backendClosedOrders.length : closedSignals.length})`}</span>
          </button>

          {showClosed && (
            <div className="overflow-x-auto" style={{borderTop: '1px solid var(--border)'}}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{background: 'rgba(255,255,255,0.03)'}}>
                    <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs uppercase tracking-wider font-semibold whitespace-nowrap" style={{color: '#d4a843'}}>Time</th>
                    <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs uppercase tracking-wider font-semibold whitespace-nowrap" style={{color: '#d4a843'}}>Symbol</th>
                    <th className="hidden sm:table-cell px-3 py-2 text-center text-xs uppercase tracking-wider font-semibold whitespace-nowrap" style={{color: '#d4a843'}}>Type</th>
                    <th className="hidden sm:table-cell px-3 py-2 text-right text-xs uppercase tracking-wider font-semibold whitespace-nowrap" style={{color: '#d4a843'}}>Entry</th>
                    <th className="hidden sm:table-cell px-3 py-2 text-right text-xs uppercase tracking-wider font-semibold whitespace-nowrap" style={{color: '#d4a843'}}>Exit</th>
                    <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs uppercase tracking-wider font-semibold whitespace-nowrap" style={{color: '#d4a843'}}>Result</th>
                    <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs uppercase tracking-wider font-semibold whitespace-nowrap" style={{color: '#d4a843'}}>P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{borderColor: 'var(--border)'}}>
                  {useBackendOrders
                    ? backendClosedOrders.map(order => (
                        <ClosedOrderRow key={order.id} order={order} brokerPositionsMap={brokerPositionsMap} />
                      ))
                    : closedSignals.map(signal => (
                        <ClosedTradeRow key={signal.signal_id || signal.id} signal={signal} />
                      ))
                  }
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  ACTIVE TRADE CARD — redesigned for clarity
//  ┌─ Trade Mode Strip (LIVE / PAPER / AUTO) — colored top bar
//  ├─ Header: Index + Strike + Direction + Status
//  ├─ Price Row: Entry → Target → SL (compact inline)
//  ├─ AI Confidence: inline bar + expandable narration
//  └─ Footer: Time + Action button
// ═══════════════════════════════════════════════════════════════════════

function ActiveTradeCard({ signal, onPlaceOrder, zerodhaConnected, tradeMode, autoTriggerConfigs = [], marketPulse }) {
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderMsg, setOrderMsg] = useState(null)
  const [showNarration, setShowNarration] = useState(false)

  const data = signal.data || {}
  const status = data.status || 'active'
  const index = data.index || data.index_name || ''
  const direction = data.direction || ''
  const estimatedSymbol = data.estimated_symbol || ''
  // Extract strike from estimated_symbol if strike is 0 or missing
  // e.g. "SENSEX2621983800PE" → "83800", "NIFTY2621725850CE" → "25850"
  const rawStrike = data.strike
  const derivedStrike = (() => {
    if (rawStrike && rawStrike !== 0) return rawStrike
    if (!estimatedSymbol) return ''
    // Extract numeric strike: everything after the date/expiry portion, before CE/PE
    const m = estimatedSymbol.match(/(\d{4,6})\s*(?:CE|PE)$/i)
    return m ? m[1] : ''
  })()
  const entryPrice = data.entry_price
  const targetPrice = data.target_price || (entryPrice && data.target_points ? (entryPrice + data.target_points) : null)
  const slPrice = data.sl_price || (entryPrice && data.stop_loss_points ? (entryPrice - data.stop_loss_points) : null)
  const hasOrder = data.my_order != null && typeof data.my_order === 'object' && Object.keys(data.my_order || {}).length > 0
  const orderStatus = data.my_order?.status || ''
  const orderFailed = orderStatus === 'failed'
  const orderPlaced = hasOrder && !orderFailed

  // Current OPTION LTP from marketPulse (not index spot)
  const optionLTP = (() => {
    if (!marketPulse?.indices) return null
    const pulseIdx = marketPulse.indices.find(p => p.index?.toUpperCase() === index.toUpperCase())
    return pulseIdx?.position_current_ltp || null
  })()
  
  // Calculate unrealized P&L based on option entry vs current LTP
  const optionMove = optionLTP && entryPrice ? optionLTP - entryPrice : null
  // Option LTP up from entry = profit (green), down = loss (red)
  const optionMoveDirection = optionMove != null 
    ? (optionMove >= 0 ? 'up' : 'down')
    : null

  // Calculate actual P&L in rupees using lot size
  const LOT_SIZES = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20 }
  const lotSize = hasOrder && data.my_order?.quantity ? data.my_order.quantity : (LOT_SIZES[index.toUpperCase()] || 30)
  // For in-market trades: prefer broker_unrealised_pnl (from kite.positions), fallback to (LTP - entry) × qty
  const unrealizedPnl = data.broker_unrealised_pnl != null
    ? Math.round(data.broker_unrealised_pnl)
    : (optionMove != null ? Math.round(optionMove * lotSize) : null)
  // For closed trades: use broker pnl (from kite.positions, always correct)
  const closedPnl = data.pnl || null
  // Flag: is this from definitive broker positions data?
  const pnlFromBroker = data.pnl_source === 'broker_positions'

  const signalTime = signal.timestamp || signal.receivedAt
  const timeStr = signalTime
    ? new Date(typeof signalTime === 'string' && !signalTime.endsWith('Z') && !signalTime.includes('+') ? signalTime + 'Z' : signalTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    : '—'

  const fmtPrice = (v) => v != null ? `₹${Number(v).toFixed(2)}` : '—'

  const handlePlaceOrder = async () => {
    if (!signal.signal_id) return
    setOrderLoading(true)
    setOrderMsg(null)
    const result = await onPlaceOrder(signal.signal_id)
    setOrderMsg(result)
    setOrderLoading(false)
    setTimeout(() => setOrderMsg(null), 5000)
  }

  const indexAutoEnabled = autoTriggerConfigs.some(
    c => (c.index_name || '').toUpperCase() === index.toUpperCase() && c.is_enabled
  )
  const isLive = zerodhaConnected && orderPlaced
  const isAuto = tradeMode === 'auto' && status === 'in_market' && indexAutoEnabled
  const isPaper = !zerodhaConnected || (tradeMode === 'auto' && !indexAutoEnabled)

  let modeLabel, modeIcon, modeBg, modeBorder, modeText
  if (orderFailed) {
    modeLabel = 'ORDER FAILED'; modeIcon = '❌'; modeBg = 'bg-red-50'; modeBorder = 'border-red-200'; modeText = 'text-red-600'
  } else if (isLive) {
    modeLabel = 'LIVE ORDER';  modeIcon = '🟢'; modeBg = 'bg-emerald-50'; modeBorder = 'border-emerald-200'; modeText = 'text-emerald-600'
  } else if (isAuto && orderFailed) {
    modeLabel = 'ORDER FAILED'; modeIcon = '❌'; modeBg = 'bg-red-50'; modeBorder = 'border-red-200'; modeText = 'text-red-600'
  } else if (isAuto) {
    modeLabel = 'AUTO TRADE'; modeIcon = '⚡'; modeBg = 'bg-cyan-50'; modeBorder = 'border-cyan-200'; modeText = 'text-cyan-600'
  } else if (isPaper) {
    modeLabel = 'PAPER TRADE'; modeIcon = '📝'; modeBg = 'bg-gray-50'; modeBorder = 'border-gray-200'; modeText = 'text-gray-500'
  } else {
    modeLabel = 'SIGNAL';      modeIcon = '🔔'; modeBg = 'bg-amber-50'; modeBorder = 'border-amber-200'; modeText = 'text-amber-600'
  }

  const isCE = direction === 'CE'
  const dirColor = isCE ? 'text-emerald-600' : 'text-red-600'
  const dirBg = isCE ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'
  const cardAccent = isCE ? 'border-l-emerald-500' : 'border-l-red-500'

  const aiConf = data.ai_confidence
  const aiColor = aiConf >= 75 ? 'text-emerald-600' : aiConf >= 50 ? 'text-amber-600' : 'text-red-600'
  const aiBg = aiConf >= 75 ? 'bg-emerald-500' : aiConf >= 50 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="rounded-xl overflow-hidden relative" style={{background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `4px solid ${isCE ? '#22c55e' : '#ef4444'}`}}>

      <div className="flex items-center justify-between px-2 sm:px-3 py-1 sm:py-1.5" style={{borderBottom: '1px solid var(--border)', background: isLive ? 'rgba(34,197,94,0.08)' : orderFailed ? 'rgba(239,68,68,0.08)' : isAuto ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.03)'}}>
        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center gap-1" style={{color: isLive ? '#22c55e' : orderFailed ? '#ef4444' : isAuto ? '#d4a843' : '#a09880'}}>
          {modeIcon} {modeLabel}
        </span>
        {status === 'in_market' && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-blue-400"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
        )}
        {status === 'active' && (
          <span className="text-xs font-semibold animate-pulse" style={{color: '#d4a843'}}>WAITING...</span>
        )}
      </div>

      <div className="p-2 sm:p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
          <span className="text-sm sm:text-base font-bold leading-tight" style={{color: '#f0e6d0'}}>{index}</span>
          {derivedStrike && <span className="text-[10px] sm:text-xs font-mono" style={{color: '#a09880'}}>{derivedStrike}</span>}
          <span className="px-1.5 sm:px-2 py-0.5 rounded border text-[10px] sm:text-xs font-bold whitespace-nowrap" style={isCE ? {background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.2)'} : {background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)'}}>
            {isCE ? '▲' : '▼'} {direction}
          </span>
          {aiConf != null && (
            <span className="ml-auto text-[10px] sm:text-xs font-bold font-mono flex items-center gap-1" style={{color: aiColor === 'text-emerald-600' ? '#22c55e' : aiColor === 'text-amber-600' ? '#d4a843' : '#ef4444'}}>
              🧠 {aiConf}%
            </span>
          )}
        </div>
          {estimatedSymbol && (
            <div className="text-[10px] sm:text-xs font-mono mb-1.5 truncate" style={{color: '#6b6580'}} title={estimatedSymbol}>
              📋 {estimatedSymbol}
            </div>
          )}

        {optionLTP && (
          <div className="flex items-center gap-2 mb-1.5 text-[10px] sm:text-xs">
            <span style={{color: '#6b6580'}}>💹 LTP:</span>
            <span className="font-mono font-bold" style={{color: '#f0e6d0'}}>₹{optionLTP.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            {optionMove != null && (
              <span className="font-mono font-semibold" style={optionMoveDirection === 'up' ? {color: '#22c55e'} : {color: '#ef4444'}}>
                ({optionMove >= 0 ? '+' : ''}{optionMove.toFixed(2)})
              </span>
            )}
          </div>
        )}

        {status === 'in_market' && unrealizedPnl != null && (
          <div className="flex items-center justify-between mb-1.5 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-semibold" style={unrealizedPnl >= 0 ? {background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)'} : {background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)'}}>
            <span className="text-[10px] sm:text-xs" style={{color: '#a09880'}}>📊 Unrealized P&L</span>
            <span className="font-mono font-bold" style={unrealizedPnl >= 0 ? {color: '#22c55e'} : {color: '#ef4444'}}>
              ₹{unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toLocaleString('en-IN')}
            </span>
          </div>
        )}
        {status !== 'in_market' && status !== 'active' && closedPnl != null && closedPnl !== 0 && (
          <div className="flex items-center justify-between mb-1.5 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-semibold" style={closedPnl >= 0 ? {background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)'} : {background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)'}}>
            <span className="text-[10px] sm:text-xs" style={{color: '#a09880'}}>💰 P&L</span>
            <span className="font-mono font-bold" style={closedPnl >= 0 ? {color: '#22c55e'} : {color: '#ef4444'}}>
              ₹{closedPnl >= 0 ? '+' : ''}{Math.round(closedPnl).toLocaleString('en-IN')}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1 mb-2 text-[10px] sm:text-xs">
          <div className="flex-1 rounded-lg px-1 sm:px-2 py-1 sm:py-1.5 text-center" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}>
            <div className="text-[9px] sm:text-xs uppercase" style={{color: '#6b6580'}}>Entry</div>
            <div className="font-mono font-bold text-[11px] sm:text-sm" style={{color: '#f0e6d0'}}>{fmtPrice(entryPrice)}</div>
          </div>
          <span className="hidden sm:inline" style={{color: '#6b6580'}}>→</span>
          <div className="flex-1 rounded-lg px-1 sm:px-2 py-1 sm:py-1.5 text-center" style={{background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)'}}>
            <div className="text-[9px] sm:text-xs uppercase" style={{color: '#22c55e'}}>Target</div>
            <div className="font-mono font-bold text-[11px] sm:text-sm" style={{color: '#22c55e'}}>{fmtPrice(targetPrice)}</div>
          </div>
          <span className="hidden sm:inline" style={{color: '#6b6580'}}>|</span>
          <div className="flex-1 rounded-lg px-1 sm:px-2 py-1 sm:py-1.5 text-center" style={{background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)'}}>
            <div className="text-[9px] sm:text-xs uppercase" style={{color: '#ef4444'}}>SL</div>
            <div className="font-mono font-bold text-[11px] sm:text-sm" style={{color: '#ef4444'}}>{fmtPrice(slPrice)}</div>
          </div>
        </div>

        {aiConf != null && (
          <div className="mb-2">
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{background: 'rgba(255,255,255,0.05)'}}>
              <div className={`h-full rounded-full transition-all duration-500 ${aiBg}`}
                style={{ width: `${aiConf}%` }} />
            </div>
            {data.ai_narration && (
              <button onClick={() => setShowNarration(!showNarration)}
                className="text-xs mt-1 transition"
                style={{color: '#6b6580'}}
                onMouseEnter={e => e.currentTarget.style.color = '#a09880'}
                onMouseLeave={e => e.currentTarget.style.color = '#6b6580'}>
                {showNarration ? '▾ Hide AI insight' : '▸ View AI insight'}
              </button>
            )}
            {showNarration && data.ai_narration && (
              <p className="text-xs italic leading-relaxed mt-1 pl-2" style={{color: '#a09880', borderLeft: '2px solid rgba(212,168,67,0.3)'}}>
                {data.ai_narration}
              </p>
            )}
            {(data.ai_target_pts || data.ai_sl_pts) && entryPrice && showNarration && (
              <div className="flex items-center gap-3 mt-1 text-xs">
                {data.ai_target_pts && data.ai_target_pts !== data.target_points && (
                  <span style={{color: '#22c55e'}}>AI Target: {fmtPrice(entryPrice + data.ai_target_pts)}</span>
                )}
                {data.ai_sl_pts && data.ai_sl_pts !== data.sl_points && (
                  <span style={{color: '#ef4444'}}>AI SL: {fmtPrice(entryPrice - data.ai_sl_pts)}</span>
                )}
              </div>
            )}
            {data.ai_risk_factors?.length > 0 && (
              <div className="flex items-center gap-1 mt-1">
                {data.ai_risk_factors.slice(0, 3).map((risk, i) => (
                  <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{background: 'rgba(251,146,60,0.1)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.2)'}}>⚠ {risk}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {aiConf == null && (() => {
          const sigAge = signalTime ? (Date.now() - new Date(signalTime).getTime()) / 1000 : 999
          if (sigAge < 120) {
            return (
              <div className="mb-2">
              <span className="text-xs flex items-center gap-1.5" style={{color: '#6b6580'}}>
                🧠 <span className="animate-pulse">AI analyzing...</span>
              </span>
              </div>
            )
          }
          return null
        })()}

        <div className="flex items-center justify-between pt-2" style={{borderTop: '1px solid var(--border)'}}>
          <span className="text-xs flex items-center gap-1" style={{color: '#6b6580'}}>
            <Clock className="w-3 h-3" /> {timeStr}
          </span>

          {!hasOrder && (tradeMode === 'manual' || !indexAutoEnabled) && status === 'in_market' ? (
            <button onClick={handlePlaceOrder} disabled={orderLoading}
              className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-[11px] font-semibold transition disabled:opacity-50 text-black"
              style={{background: zerodhaConnected ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #6b6580, #4a4560)'}}>
              {orderLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : zerodhaConnected ? <Zap className="w-3 h-3" /> : <Target className="w-3 h-3" />}
              <span className="hidden sm:inline">{zerodhaConnected ? 'Place Live Order' : 'Paper Trade'}</span>
              <span className="sm:hidden">{zerodhaConnected ? 'Order' : 'Paper'}</span>
            </button>
          ) : orderFailed ? (
            <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-semibold" style={{background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)'}}
              title={data.my_order?.error_message || 'Order failed'}>
              ❌ <span className="hidden sm:inline">Order </span>Failed
            </span>
          ) : orderPlaced ? (
            <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-semibold" style={{background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)'}}>
              <Check className="w-3 h-3" /> <span className="hidden sm:inline">Live Order </span>Active
            </span>
          ) : isAuto ? (
            <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-semibold" style={{background: 'rgba(212,168,67,0.1)', color: '#d4a843', border: '1px solid rgba(212,168,67,0.2)'}}>
              ⚡ <span className="hidden sm:inline">Auto </span>Trading
            </span>
          ) : null}

          {orderMsg && (
            <span className="text-xs ml-2" style={orderMsg.success ? {color: '#22c55e'} : {color: '#ef4444'}}>
              {orderMsg.message?.substring(0, 25)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  CLOSED TRADE ROW — compact row for history table
// ═══════════════════════════════════════════════════════════════════════

function ClosedTradeRow({ signal }) {
  const data = signal.data || {}
  const status = data.status || 'manual_exit'
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.manual_exit

  const index = data.index || data.index_name || ''
  const direction = data.direction || ''
  const estimatedSymbol = data.estimated_symbol || ''
  const hasOrder = data.my_order && typeof data.my_order === 'object' && Object.keys(data.my_order).length > 0
  // Derive strike from estimated_symbol if strike is 0
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
    <tr className="transition" title={estimatedSymbol || undefined} style={{background: 'transparent'}} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <td className="px-2 sm:px-3 py-2.5 whitespace-nowrap">
        <span className="text-[10px] sm:text-xs font-mono" style={{color: '#a09880'}}>{timeStr}</span>
      </td>
      <td className="px-2 sm:px-3 py-2.5 whitespace-nowrap">
        <div>
          <span className="text-xs font-semibold" style={{color: '#f0e6d0'}}>{index} {strike}</span>
          {hasOrder && (
            <span className="ml-1 text-xs px-1 py-0.5 rounded font-bold border" style={{background: 'rgba(99,102,241,0.12)', color: '#818cf8', borderColor: 'rgba(99,102,241,0.25)'}}>MY</span>
          )}
          {estimatedSymbol && (
            <div className="text-[10px] sm:text-xs font-mono truncate max-w-[80px] sm:max-w-[120px]" style={{color: '#6b6580'}}>{estimatedSymbol}</div>
          )}
        </div>
      </td>
      <td className="hidden sm:table-cell px-3 py-2.5 text-center whitespace-nowrap">
        <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${
          direction === 'CE' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'
        }`}>{direction || '—'}</span>
      </td>
      <td className="hidden sm:table-cell px-3 py-2.5 text-right whitespace-nowrap">
        <span className="text-xs font-mono" style={{color: '#a09880'}}>{fmtPrice(entryPrice)}</span>
      </td>
      <td className="hidden sm:table-cell px-3 py-2.5 text-right whitespace-nowrap">
        <span className="text-xs font-mono" style={{color: '#a09880'}}>{fmtPrice(exitPrice)}</span>
      </td>
      <td className="px-2 sm:px-3 py-2.5 text-center whitespace-nowrap">
        <span className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold border" style={{background: cfg.badge.bg, color: cfg.badge.text, borderColor: 'transparent'}}>
          {cfg.icon} {cfg.label}
        </span>
      </td>
      <td className="px-2 sm:px-3 py-2.5 text-right whitespace-nowrap">
        <span className="text-[10px] sm:text-xs font-mono font-bold" style={{color: pnl >= 0 ? '#22c55e' : '#ef4444'}}>
          {pnl !== 0 ? `₹${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}` : '—'}
        </span>
      </td>
    </tr>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  CLOSED ORDER ROW — renders from backend SubscriberOrder data
//  (source of truth: correct entry, exit, status, pnl)
// ═══════════════════════════════════════════════════════════════════════

function ClosedOrderRow({ order, brokerPositionsMap = {} }) {
  const status = order.status || 'manual_exit'
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.manual_exit

  // Parse symbol to extract index, strike, direction
  // signal_id format: NIFTY_CE_20260218_0728 or BANKNIFTY_PE_20260218_0501
  const signalId = order.signal_id || ''
  const parts = signalId.split('_')
  const index = parts[0] || ''
  const direction = parts[1] || ''
  // symbol from broker e.g. NIFTY26FEB25750CE, SENSEX2621983500CE
  const symbol = order.symbol || ''
  // Extract strike from symbol: digits before CE/PE at end
  const strikeMatch = symbol.match(/(\d{4,6})\s*(?:CE|PE)$/i)
  const strike = strikeMatch ? strikeMatch[1] : ''

  // BROKER P&L OVERRIDE: Use raw kite.positions() data when available
  // This is the single source of truth — bypasses all SubscriberOrder issues
  const brokerPos = brokerPositionsMap[symbol.toUpperCase()]
  let entryPrice = order.entry_price
  let exitPrice = order.exit_price
  let pnl = order.pnl || 0

  if (brokerPos) {
    // Use broker's actual buy/sell prices and P&L
    if (brokerPos.buy_price > 0) entryPrice = brokerPos.buy_price
    if (brokerPos.is_closed && brokerPos.sell_price > 0) exitPrice = brokerPos.sell_price
    // Use realised P&L for closed positions, total pnl for open
    pnl = brokerPos.is_closed ? (brokerPos.realised || brokerPos.pnl || 0) : (brokerPos.pnl || 0)
  } else {
    // Fallback: compute exit_price from pnl when missing
    const LOT = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20 }
    const lotSize = order.quantity || LOT[index] || 30
    if (exitPrice == null && entryPrice != null && pnl !== 0) {
      exitPrice = Math.round((entryPrice + pnl / lotSize) * 100) / 100
    }
  }

  // Parse time from created_at (ISO string)
  const timeStr = order.created_at
    ? new Date(order.created_at.endsWith('Z') ? order.created_at : order.created_at + 'Z')
        .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    : '—'

  const fmtPrice = (v) => v != null ? `₹${Number(v).toFixed(2)}` : '—'

  return (
    <tr className="transition" title={symbol || undefined} style={{background: 'transparent'}} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <td className="px-2 sm:px-3 py-2.5 whitespace-nowrap">
        <span className="text-[10px] sm:text-xs font-mono" style={{color: '#a09880'}}>{timeStr}</span>
      </td>
      <td className="px-2 sm:px-3 py-2.5 whitespace-nowrap">
        <div>
          <span className="text-xs font-semibold" style={{color: '#f0e6d0'}}>{index} {strike}</span>
          <span className="ml-1 text-xs px-1 py-0.5 rounded font-bold border" style={{background: 'rgba(99,102,241,0.12)', color: '#818cf8', borderColor: 'rgba(99,102,241,0.25)'}}>MY</span>
          {symbol && (
            <div className="text-[10px] sm:text-xs font-mono truncate max-w-[80px] sm:max-w-[120px]" style={{color: '#6b6580'}}>{symbol}</div>
          )}
        </div>
      </td>
      <td className="hidden sm:table-cell px-3 py-2.5 text-center whitespace-nowrap">
        <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${
          direction === 'CE' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'
        }`}>{direction || '—'}</span>
      </td>
      <td className="hidden sm:table-cell px-3 py-2.5 text-right whitespace-nowrap">
        <span className="text-xs font-mono" style={{color: '#a09880'}}>{fmtPrice(entryPrice)}</span>
      </td>
      <td className="hidden sm:table-cell px-3 py-2.5 text-right whitespace-nowrap">
        <span className="text-xs font-mono" style={{color: '#a09880'}}>{fmtPrice(exitPrice)}</span>
      </td>
      <td className="px-2 sm:px-3 py-2.5 text-center whitespace-nowrap">
        <span className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold border ${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
      </td>
      <td className="px-2 sm:px-3 py-2.5 text-right whitespace-nowrap">
        <span className={`text-[10px] sm:text-xs font-mono font-bold ${pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {pnl !== 0 ? `₹${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}` : '—'}
        </span>
      </td>
    </tr>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  NETWORK HELPER — retry on transient failures (laptop wake, WiFi reconnect)
// ═══════════════════════════════════════════════════════════════════════

async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options)
      return res  // success — return even if HTTP 4xx/5xx (caller handles)
    } catch (err) {
      if (attempt < maxRetries) {
        // Wait 1s, 2s before retry — gives WiFi time to reconnect
        await new Promise(r => setTimeout(r, attempt * 1000))
      } else {
        throw err  // all retries exhausted
      }
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════
//  LOGIN FORM
// ═══════════════════════════════════════════════════════════════════════

function LoginForm({ onSuccess, onSwitchToRegister, onForgotPassword }) {
  const [tab, setTab] = useState('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleEmailLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_BASE}/api/signals/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || 'Login failed')
        setLoading(false)
        return
      }
      const firstKey = data.api_key || ''
      onSuccess(
        { user_id: data.user_id, email: data.email, full_name: data.full_name },
        firstKey
      )
    } catch {
      setError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  const [apiKeyLoggingIn, setApiKeyLoggingIn] = useState(false)
  const handleApiKeyLogin = async (e) => {
    e.preventDefault()
    if (!apiKeyInput.trim()) { setError('Enter an API key'); return }
    setError('')
    setApiKeyLoggingIn(true)
    try {
      const res = await fetch(`${API_BASE}/api/signals/zerodha/status?api_key=${apiKeyInput.trim()}`)
      if (res.ok || res.status === 404) {
        onSuccess({ email: 'api-key-user' }, apiKeyInput.trim())
      } else {
        setError('Invalid API key')
      }
    } catch {
      setError('Could not verify API key')
    } finally {
      setApiKeyLoggingIn(false)
    }
  }

  return (
    <div className="rounded-2xl shadow-xl p-6" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
      <div className="flex mb-6 rounded-lg p-1" style={{background: 'rgba(255,255,255,0.04)'}}>
        <button onClick={() => { setTab('email'); setError('') }}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition ${tab === 'email' ? 'shadow-sm' : ''}`}
          style={tab === 'email' ? {background: 'rgba(212,168,67,0.12)', color: '#d4a843'} : {color: '#a09880'}}>
          <LogIn className="w-4 h-4 inline mr-1" /> Email Login
        </button>
        <button onClick={() => { setTab('apikey'); setError('') }}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition ${tab === 'apikey' ? 'shadow-sm' : ''}`}
          style={tab === 'apikey' ? {background: 'rgba(212,168,67,0.12)', color: '#d4a843'} : {color: '#a09880'}}>
          <Key className="w-4 h-4 inline mr-1" /> API Key
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2" style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171'}}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {tab === 'email' ? (
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{color: '#a09880'}}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-4 py-3 rounded-lg border text-sm transition"
              style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
              placeholder="you@example.com"
              onFocus={e => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,168,67,0.3)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
          </div>
          <div>
            <label className="block text-sm mb-1" style={{color: '#a09880'}}>Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full px-4 py-3 rounded-lg border text-sm pr-10 transition"
                style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
                onFocus={e => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,168,67,0.3)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition"
                style={{color: '#6b6580'}} onMouseEnter={e => e.currentTarget.style.color = '#a09880'} onMouseLeave={e => e.currentTarget.style.color = '#6b6580'}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-lg font-medium transition disabled:opacity-50 text-black"
            style={{background: 'linear-gradient(135deg, #d4a843, #b8922e)'}}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleApiKeyLogin} className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{color: '#a09880'}}>API Key</label>
            <input type="text" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border font-mono text-sm transition"
              style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
              placeholder="tv_xxxxxxxxxxxxxxxx"
              onFocus={e => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,168,67,0.3)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
          </div>
          <button type="submit" disabled={apiKeyLoggingIn}
            className="w-full py-3 rounded-lg font-medium transition disabled:opacity-50 text-black"
            style={{background: 'linear-gradient(135deg, #d4a843, #b8922e)'}}>
            {apiKeyLoggingIn ? 'Connecting...' : 'Connect'}
          </button>
        </form>
      )}

      <div className="mt-4 text-center">
        <button onClick={onForgotPassword} className="text-xs transition" style={{color: '#6b6580'}} onMouseEnter={e => e.currentTarget.style.color = '#d4a843'} onMouseLeave={e => e.currentTarget.style.color = '#6b6580'}>
          Forgot your password?
        </button>
      </div>

      <div className="mt-3 text-center">
        <span className="text-sm" style={{color: '#6b6580'}}>Don't have an account? </span>
        <button onClick={onSwitchToRegister} className="text-sm font-medium transition" style={{color: '#d4a843'}} onMouseEnter={e => e.currentTarget.style.color = '#f0d68a'} onMouseLeave={e => e.currentTarget.style.color = '#d4a843'}>
          Register
        </button>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  FORGOT PASSWORD FORM
// ═══════════════════════════════════════════════════════════════════════

function ForgotPasswordForm({ onBackToLogin }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/signals/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, frontend_url: window.location.origin })
      })
      if (res.ok) {
        setSent(true)
      } else {
        const data = await res.json()
        setError(data.detail || 'Something went wrong')
      }
    } catch {
      setError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl shadow-xl p-6" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
      <h2 className="text-xl font-semibold mb-2" style={{color: '#f0e6d0'}}>Reset Password</h2>
      <p className="text-sm mb-6" style={{color: '#a09880'}}>
        Enter your email and we'll send you a link to reset your password.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2" style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171'}}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {sent ? (
        <div className="text-center py-6">
          <div className="text-4xl mb-3">📧</div>
          <p className="font-medium mb-2" style={{color: '#22c55e'}}>Check your email!</p>
          <p className="text-sm mb-6" style={{color: '#a09880'}}>
            If that email is registered, you'll receive a password reset link shortly.
            The link expires in 15 minutes.
          </p>
          <button onClick={onBackToLogin}
            className="text-sm font-medium transition" style={{color: '#d4a843'}} onMouseEnter={e => e.currentTarget.style.color = '#f0d68a'} onMouseLeave={e => e.currentTarget.style.color = '#d4a843'}>
            ← Back to Login
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{color: '#a09880'}}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-4 py-3 rounded-lg border text-sm transition"
              style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
              placeholder="you@example.com"
              onFocus={e => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,168,67,0.3)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-lg font-medium transition disabled:opacity-50 text-black"
            style={{background: 'linear-gradient(135deg, #d4a843, #b8922e)'}}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      )}

      {!sent && (
        <div className="mt-6 text-center">
          <button onClick={onBackToLogin} className="text-sm font-medium transition" style={{color: '#d4a843'}} onMouseEnter={e => e.currentTarget.style.color = '#f0d68a'} onMouseLeave={e => e.currentTarget.style.color = '#d4a843'}>
            ← Back to Login
          </button>
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  RESET PASSWORD FORM (from email link)
// ═══════════════════════════════════════════════════════════════════════

function ResetPasswordForm({ token, email, onBackToLogin }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/signals/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, new_password: newPassword })
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess(true)
      } else {
        setError(data.detail || 'Password reset failed')
      }
    } catch {
      setError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl shadow-xl p-6" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
      <h2 className="text-xl font-semibold mb-2" style={{color: '#f0e6d0'}}>Set New Password</h2>
      <p className="text-sm mb-6" style={{color: '#a09880'}}>
        Enter your new password for <strong style={{color: '#d4a843'}}>{email}</strong>
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2" style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171'}}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {success ? (
        <div className="text-center py-6">
          <div className="text-4xl mb-3">✅</div>
          <p className="font-medium mb-2" style={{color: '#22c55e'}}>Password reset successful!</p>
          <p className="text-sm mb-6" style={{color: '#a09880'}}>
            You can now log in with your new password.
          </p>
          <button onClick={onBackToLogin}
            className="w-full py-3 rounded-lg font-medium transition text-black"
            style={{background: 'linear-gradient(135deg, #d4a843, #b8922e)'}}>
            Go to Login
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{color: '#a09880'}}>New Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} required
                className="w-full px-4 py-3 rounded-lg border text-sm pr-10 transition"
                style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
                placeholder="Min 6 characters"
                onFocus={e => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,168,67,0.3)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition"
                style={{color: '#6b6580'}} onMouseEnter={e => e.currentTarget.style.color = '#a09880'} onMouseLeave={e => e.currentTarget.style.color = '#6b6580'}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1" style={{color: '#a09880'}}>Confirm Password</label>
            <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
              className="w-full px-4 py-3 rounded-lg border text-sm transition"
              style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
              placeholder="Re-enter password"
              onFocus={e => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,168,67,0.3)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-lg font-medium transition disabled:opacity-50 text-black"
            style={{background: 'linear-gradient(135deg, #d4a843, #b8922e)'}}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      )}

      {!success && (
        <div className="mt-6 text-center">
          <button onClick={onBackToLogin} className="text-sm font-medium transition" style={{color: '#d4a843'}} onMouseEnter={e => e.currentTarget.style.color = '#f0d68a'} onMouseLeave={e => e.currentTarget.style.color = '#d4a843'}>
            ← Back to Login
          </button>
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  REGISTER FORM
// ═══════════════════════════════════════════════════════════════════════

function RegisterForm({ onSuccess, onSwitchToLogin }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registeredKey, setRegisteredKey] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_BASE}/api/signals/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || 'Registration failed')
        setLoading(false)
        return
      }
      setRegisteredKey(data.api_key)
    } catch {
      setError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  const copyKey = () => {
    navigator.clipboard.writeText(registeredKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const proceedToDashboard = () => {
    onSuccess({ email, full_name: fullName }, registeredKey)
  }

  if (registeredKey) {
    return (
      <div className="rounded-2xl shadow-xl p-6" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
        <div className="text-center mb-4">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center" style={{background: 'rgba(34,197,94,0.1)'}}>
            <Check className="w-8 h-8" style={{color: '#22c55e'}} />
          </div>
          <h3 className="text-xl font-bold" style={{color: '#f0e6d0'}}>Registration Successful!</h3>
          <p className="text-sm mt-1" style={{color: '#a09880'}}>Save your API key — it's shown only once</p>
        </div>

        <div className="mb-4 p-3 rounded-lg" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}>
          <label className="block text-xs mb-1" style={{color: '#a09880'}}>Your API Key</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono break-all" style={{color: '#d4a843'}}>{registeredKey}</code>
            <button onClick={copyKey}
              className="p-2 rounded-lg transition flex-shrink-0" style={{color: '#6b6580'}} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {copied ? <Check className="w-4 h-4" style={{color: '#22c55e'}} /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="mb-4 p-3 rounded-lg text-xs flex items-center gap-2" style={{background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', color: '#d4a843'}}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          This key has also been emailed to you. Keep it safe!
        </div>

        <button onClick={proceedToDashboard}
          className="w-full py-3 rounded-lg font-medium transition text-black"
          style={{background: 'linear-gradient(135deg, #d4a843, #b8922e)'}}>
          Open Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl shadow-xl p-6" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{color: '#f0e6d0'}}>
        <UserPlus className="w-5 h-5" style={{color: '#d4a843'}} /> Create Account
      </h3>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2" style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171'}}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="block text-sm mb-1" style={{color: '#a09880'}}>Full Name</label>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
            className="w-full px-4 py-3 rounded-lg border text-sm transition"
            style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
            onFocus={e => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,168,67,0.3)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
        </div>
        <div>
          <label className="block text-sm mb-1" style={{color: '#a09880'}}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            className="w-full px-4 py-3 rounded-lg border text-sm transition"
            style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
            onFocus={e => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,168,67,0.3)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
        </div>
        <div>
          <label className="block text-sm mb-1" style={{color: '#a09880'}}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            className="w-full px-4 py-3 rounded-lg border text-sm transition"
            style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
            onFocus={e => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,168,67,0.3)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
        </div>
        <div>
          <label className="block text-sm mb-1" style={{color: '#a09880'}}>Confirm Password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
            className="w-full px-4 py-3 rounded-lg border text-sm transition"
            style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
            onFocus={e => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,168,67,0.3)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }} />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-lg font-medium transition disabled:opacity-50 text-black"
          style={{background: 'linear-gradient(135deg, #d4a843, #b8922e)'}}>
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <span className="text-sm" style={{color: '#6b6580'}}>Already have an account? </span>
        <button onClick={onSwitchToLogin} className="text-sm font-medium transition" style={{color: '#d4a843'}} onMouseEnter={e => e.currentTarget.style.color = '#f0d68a'} onMouseLeave={e => e.currentTarget.style.color = '#d4a843'}>
          Sign In
        </button>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  BROKER CREDENTIALS MODAL
// ═══════════════════════════════════════════════════════════════════════

function BrokerCredentialsModal({ onClose, onSave, onExchangeToken, initialRequestToken }) {
  const [step, setStep] = useState(initialRequestToken ? 2 : 1)
  const [kiteApiKey, setKiteApiKey] = useState('')
  const [kiteApiSecret, setKiteApiSecret] = useState('')
  const [requestToken, setRequestToken] = useState(initialRequestToken || '')
  const [loginUrl, setLoginUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [exchanging, setExchanging] = useState(false)
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [error, setError] = useState('')
  const [connectedUser, setConnectedUser] = useState('')

  const CALLBACK_URL = `${API_BASE}/api/signals/zerodha/callback`

  const handleSaveCredentials = async (e) => {
    e.preventDefault()
    setError('')
    if (!kiteApiKey.trim() || !kiteApiSecret.trim()) {
      setError('Both API Key and API Secret are required')
      return
    }
    setSaving(true)
    try {
      const result = await onSave(kiteApiKey.trim(), kiteApiSecret.trim())
      if (result?.login_url) {
        setLoginUrl(result.login_url)
        setStep(2)
      }
    } catch (err) {
      setError(err.message || 'Failed to save credentials')
    } finally {
      setSaving(false)
    }
  }

  const handleFetchLoginUrl = async () => {
    // Fallback: if loginUrl wasn't set (e.g. came via ?request_token= param), fetch it now
    setFetchingUrl(true)
    setError('')
    try {
      const result = await onSave(kiteApiKey.trim() || '', kiteApiSecret.trim() || '')
      if (result?.login_url) {
        setLoginUrl(result.login_url)
      }
    } catch (err) {
      setError('Please go back to Step 1 and enter your Kite credentials first.')
    } finally {
      setFetchingUrl(false)
    }
  }

  const handleExchangeToken = async (e) => {
    e.preventDefault()
    setError('')
    if (!requestToken.trim()) {
      setError('Please paste the request token from the Zerodha window')
      return
    }
    setExchanging(true)
    try {
      const result = await onExchangeToken(requestToken.trim())
      setConnectedUser(result?.zerodha_user_id || '')
      setStep(3)
    } catch (err) {
      setError(err.message || 'Failed to generate access token')
    } finally {
      setExchanging(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{color: '#f0e6d0'}}>
            <ExternalLink className="w-5 h-5" style={{color: '#22c55e'}} />
            Connect Zerodha
          </h2>
          <button onClick={onClose} className="p-1 rounded-full transition" style={{color: '#6b6580'}} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-5">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                s < step ? 'bg-emerald-500 border-emerald-500 text-white' :
                s === step ? 'border-blue-500 text-blue-600 bg-blue-50' :
                'border-gray-600 text-gray-500'
              }`}>{s < step ? '✓' : s}</div>
              {s < 3 && <div className={`flex-1 h-0.5 ${s < step ? 'bg-emerald-500' : ''}`} style={s >= step ? {background: 'rgba(255,255,255,0.1)'} : {}} />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-3 p-2 rounded-lg" style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)'}}>
            <p className="text-xs" style={{color: '#f87171'}}>❌ {error}</p>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="mb-4 space-y-2">
              <div className="rounded-lg p-3" style={{background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)'}}>
                <p className="text-xs font-semibold mb-2" style={{color: '#818cf8'}}>Step 1: Create Kite Connect App</p>
                <p className="text-xs" style={{color: '#a09880'}}>
                  Go to{' '}
                  <a href="https://developers.kite.trade" target="_blank" rel="noopener noreferrer"
                     className="underline" style={{color: '#818cf8'}}>
                    developers.kite.trade
                  </a>
                  {' '}→ Create a new app → Copy your <strong>API Key</strong> and <strong>API Secret</strong>.
                </p>
              </div>
              <div className="rounded-lg p-3" style={{background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)'}}>
                <p className="text-xs font-semibold mb-2" style={{color: '#d4a843'}}>Important: Set Redirect URL</p>
                <p className="text-xs mb-1" style={{color: '#a09880'}}>
                  In your Kite app settings, set the <strong>Redirect URL</strong> to:
                </p>
                <code className="block text-xs p-2 rounded break-all font-mono select-all border" style={{background: 'rgba(0,0,0,0.3)', color: '#d4a843', borderColor: 'rgba(212,168,67,0.2)'}}>
                  {CALLBACK_URL}
                </code>
              </div>
            </div>

            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div>
                <label className="block text-sm mb-1" style={{color: '#a09880'}}>Kite API Key</label>
                <input
                  type="text"
                  value={kiteApiKey}
                  onChange={e => setKiteApiKey(e.target.value)}
                  placeholder="e.g. bol7cc1v3l7jvhda"
                  required
                  className="w-full px-4 py-3 rounded-lg border font-mono text-sm transition"
                  style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
                  onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.boxShadow = '0 0 0 1px #22c55e' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{color: '#a09880'}}>Kite API Secret</label>
                <input
                  type="password"
                  value={kiteApiSecret}
                  onChange={e => setKiteApiSecret(e.target.value)}
                  placeholder="Your Kite API secret"
                  required
                  className="w-full px-4 py-3 rounded-lg border font-mono text-sm transition"
                  style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
                  onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.boxShadow = '0 0 0 1px #22c55e' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose}
                  className="flex-1 py-3 rounded-lg border transition text-sm" style={{borderColor: 'var(--border)', color: '#a09880', background: 'transparent'}} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-lg text-white font-semibold transition text-sm disabled:opacity-50" style={{background: 'linear-gradient(135deg, #22c55e, #16a34a)'}}>
                  {saving ? 'Saving...' : 'Save & Continue →'}
                </button>
              </div>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <div className="mb-4 space-y-3">
              <div className="rounded-lg p-3" style={{background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)'}}>
                <p className="text-xs font-semibold mb-2" style={{color: '#818cf8'}}>Step 2: Login to Zerodha</p>
                <p className="text-xs" style={{color: '#a09880'}}>
                  Click the button below to open the Zerodha login page in a <strong>new window</strong>.
                  After logging in, you'll see a <strong>request token</strong> — copy it.
                </p>
              </div>

              {loginUrl ? (
                <a href={loginUrl} target="_blank" rel="noopener noreferrer"
                  className="w-full py-3 rounded-lg text-white font-semibold transition text-sm flex items-center justify-center gap-2 no-underline" style={{background: 'linear-gradient(135deg, #6366f1, #4f46e5)'}}>
                  <ExternalLink className="w-4 h-4" />
                  Open Zerodha Login (New Tab)
                </a>
              ) : (
                <button onClick={handleFetchLoginUrl}
                  className="w-full py-3 rounded-lg text-white font-semibold transition text-sm flex items-center justify-center gap-2" style={{background: 'linear-gradient(135deg, #6366f1, #4f46e5)'}}>
                  <ExternalLink className="w-4 h-4" />
                  {fetchingUrl ? 'Loading...' : 'Get Zerodha Login Link'}
                </button>
              )}

              <div className="rounded-lg p-3" style={{background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)'}}>
                <p className="text-xs font-semibold mb-2" style={{color: '#d4a843'}}>Step 3: Paste Request Token</p>
                <p className="text-xs" style={{color: '#a09880'}}>
                  After Zerodha login, you'll see a page with the <strong>request token</strong>.
                  Copy it and paste it below.
                </p>
              </div>
            </div>

            <form onSubmit={handleExchangeToken} className="space-y-4">
              <div>
                <label className="block text-sm mb-1" style={{color: '#a09880'}}>Request Token</label>
                <input
                  type="text"
                  value={requestToken}
                  onChange={e => setRequestToken(e.target.value)}
                  placeholder="Paste request token from Zerodha window"
                  required
                  className="w-full px-4 py-3 rounded-lg border font-mono text-sm transition"
                  style={{background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: '#f0e6d0', outline: 'none'}}
                  onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.boxShadow = '0 0 0 1px #6366f1' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setStep(1); setError(''); }}
                  className="flex-1 py-3 rounded-lg border transition text-sm" style={{borderColor: 'var(--border)', color: '#a09880', background: 'transparent'}} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  ← Back
                </button>
                <button type="submit" disabled={exchanging || !requestToken.trim()}
                  className="flex-1 py-3 rounded-lg text-white font-semibold transition text-sm disabled:opacity-50" style={{background: 'linear-gradient(135deg, #22c55e, #16a34a)'}}>
                  {exchanging ? 'Connecting...' : 'Generate Access Token'}
                </button>
              </div>
            </form>
          </>
        )}

        {step === 3 && (
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{background: 'rgba(34,197,94,0.1)'}}>
              <Check className="w-8 h-8" style={{color: '#22c55e'}} />
            </div>
            <h3 className="text-lg font-bold mb-2" style={{color: '#22c55e'}}>Connected!</h3>
            <p className="text-sm mb-1" style={{color: '#a09880'}}>
              Zerodha account <strong style={{color: '#22c55e'}}>{connectedUser}</strong> is now linked.
            </p>
            <p className="text-xs mb-6" style={{color: '#6b6580'}}>
              Auto-trade signals will now place orders on your behalf.
            </p>
            <button onClick={onClose}
              className="w-full py-3 rounded-lg text-white font-semibold transition text-sm" style={{background: 'linear-gradient(135deg, #22c55e, #16a34a)'}}>
              Done
            </button>
          </div>
        )}

        <p className="mt-3 text-xs text-center" style={{color: '#6b6580'}}>
          Your credentials are encrypted (AES-256) and stored securely. They are only used for placing orders on your behalf.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  UPSTOX CREDENTIALS MODAL
// ═══════════════════════════════════════════════════════════════════════

function UpstoxCredentialsModal({ onClose, onSave, onExchangeCode, initialCode }) {
  const [step, setStep] = useState(1) // Always start at 1, will auto-advance if credentials exist
  const [upstoxApiKey, setUpstoxApiKey] = useState('')
  const [upstoxApiSecret, setUpstoxApiSecret] = useState('')
  const [code, setCode] = useState(initialCode || '')
  const [loginUrl, setLoginUrl] = useState('')
  const [redirectUri, setRedirectUri] = useState('')
  const [saving, setSaving] = useState(false)
  const [exchanging, setExchanging] = useState(false)
  const [error, setError] = useState('')
  const [connectedUser, setConnectedUser] = useState('')
  const [checkingCreds, setCheckingCreds] = useState(!!initialCode) // Show loading when checking

  // When initialCode is provided (from OAuth callback), check if credentials already exist
  useEffect(() => {
    if (!initialCode) return
    
    const checkExistingCreds = async () => {
      setCheckingCreds(true)
      try {
        // Try to get login URL - if it works, credentials exist on backend
        const apiKeyStored = localStorage.getItem('tv_api_key') || ''
        if (!apiKeyStored) {
          setError('Please log in first before connecting Upstox')
          setCheckingCreds(false)
          return
        }
        const urlRes = await fetch(`${API_BASE}/api/signals/upstox/login-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: apiKeyStored, redirect_url: `${API_BASE}/api/signals/upstox/callback` })
        })
        if (urlRes.ok) {
          const urlData = await urlRes.json()
          // Credentials exist! Skip to step 2 with the login URL
          setLoginUrl(urlData.login_url || '')
          setRedirectUri(urlData.redirect_uri || '')
          setStep(2)
        } else {
          // Credentials not found — need step 1 first
          setError('Upstox credentials not found. Please enter your API Key and Secret first (Step 1), then proceed.')
          setStep(1)
        }
      } catch (err) {
        setError('Could not verify Upstox credentials. Please enter them in Step 1.')
        setStep(1)
      } finally {
        setCheckingCreds(false)
      }
    }
    
    checkExistingCreds()
  }, [initialCode])

  const handleSaveCredentials = async (e) => {
    e.preventDefault()
    setError('')
    if (!upstoxApiKey.trim() || !upstoxApiSecret.trim()) {
      setError('Both API Key and API Secret are required')
      return
    }
    setSaving(true)
    try {
      const result = await onSave(upstoxApiKey.trim(), upstoxApiSecret.trim())
      if (result?.login_url) {
        setLoginUrl(result.login_url)
        setRedirectUri(result.redirect_uri || '')
        setStep(2)
      }
    } catch (err) {
      setError(err.message || 'Failed to save credentials')
    } finally {
      setSaving(false)
    }
  }

  const handleExchangeCode = async (e) => {
    e.preventDefault()
    setError('')
    if (!code.trim()) {
      setError('Please paste the authorization code from the Upstox window')
      return
    }
    setExchanging(true)
    try {
      const result = await onExchangeCode(code.trim())
      setConnectedUser(result?.upstox_user_id || '')
      setStep(3)
    } catch (err) {
      // If credentials not found, redirect to step 1
      const msg = err.message || 'Failed to exchange code'
      if (msg.toLowerCase().includes('credentials not found') || msg.toLowerCase().includes('save credentials')) {
        setError('Upstox credentials not found. Please enter your API Key and Secret first.')
        setStep(1)
      } else {
        setError(msg)
      }
    } finally {
      setExchanging(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{color: '#f0e6d0'}}>
            <Link2 className="w-5 h-5" style={{color: '#f97316'}} />
            Connect Upstox
          </h2>
          <button onClick={onClose} className="p-1 rounded-full transition" style={{color: '#6b6580'}} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-5">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                s < step ? 'bg-orange-500 border-orange-500 text-white' :
                s === step ? 'border-orange-500 text-orange-600 bg-orange-50' :
                'border-gray-300 text-gray-500'
              }`}>{s < step ? '✓' : s}</div>
              {s < 3 && <div className={`flex-1 h-0.5 ${s < step ? 'bg-orange-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">❌ {error}</p>
          </div>
        )}

        {checkingCreds && (
          <div className="text-center py-6">
            <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-600">Checking saved credentials...</p>
          </div>
        )}

        {!checkingCreds && step === 1 && (
          <>
            <div className="mb-4 space-y-2">
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-xs font-semibold text-orange-700 mb-2">Step 1: Create Upstox API App</p>
                <p className="text-xs text-orange-600/80">
                  Go to{' '}
                  <a href="https://account.upstox.com/developer/apps" target="_blank" rel="noopener noreferrer"
                     className="underline text-orange-600 hover:text-orange-700">
                    account.upstox.com/developer/apps
                  </a>
                  {' '}→ Create a new app → Copy your <strong>API Key</strong> and <strong>API Secret</strong>.
                </p>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs font-semibold text-amber-700 mb-2">Important: Set Redirect URL</p>
                <p className="text-xs text-amber-600/80 mb-1">
                  In your Upstox app settings, set the <strong>Redirect URL</strong> to:
                </p>
                <code className="block text-xs text-amber-700 bg-amber-50/50 p-2 rounded break-all font-mono select-all border border-amber-100">
                  {`${API_BASE}/api/signals/upstox/callback`}
                </code>
              </div>
            </div>

            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Upstox API Key</label>
                <input
                  type="text"
                  value={upstoxApiKey}
                  onChange={e => setUpstoxApiKey(e.target.value)}
                  placeholder="Your Upstox API key"
                  required
                  className="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono text-sm transition"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Upstox API Secret</label>
                <input
                  type="password"
                  value={upstoxApiSecret}
                  onChange={e => setUpstoxApiSecret(e.target.value)}
                  placeholder="Your Upstox API secret"
                  required
                  className="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono text-sm transition"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose}
                  className="flex-1 py-3 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold transition text-sm disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save & Continue →'}
                </button>
              </div>
            </form>
          </>
        )}

        {!checkingCreds && step === 2 && (
          <>
            <div className="mb-4 space-y-3">
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-xs font-semibold text-orange-700 mb-2">Step 2: Login to Upstox</p>
                <p className="text-xs text-orange-600/80">
                  Click the button below to open the Upstox login page. After logging in, you'll see an <strong>authorization code</strong> — copy it and paste it below.
                </p>
              </div>

              {loginUrl ? (
                <a href={loginUrl} target="_blank" rel="noopener noreferrer"
                  className="w-full py-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold transition text-sm flex items-center justify-center gap-2 no-underline">
                  <ExternalLink className="w-4 h-4" />
                  Open Upstox Login (New Tab)
                </a>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-600">Go back to Step 1 and enter your Upstox credentials first.</p>
                </div>
              )}
            </div>

            <form onSubmit={handleExchangeCode} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Authorization Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="Paste authorization code from Upstox"
                  required
                  className="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono text-sm transition"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setStep(1); setError(''); }}
                  className="flex-1 py-3 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition text-sm">
                  ← Back
                </button>
                <button type="submit" disabled={exchanging || !code.trim()}
                  className="flex-1 py-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold transition text-sm disabled:opacity-50">
                  {exchanging ? 'Connecting...' : 'Connect Upstox'}
                </button>
              </div>
            </form>
          </>
        )}

        {!checkingCreds && step === 3 && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-orange-500" />
            </div>
            <h3 className="text-lg font-bold text-orange-600 mb-2">Connected!</h3>
            <p className="text-sm text-gray-600 mb-1">
              Upstox account <strong className="text-orange-600">{connectedUser}</strong> is now linked.
            </p>
            <p className="text-xs text-gray-500 mb-6">
              You can now trade via TradeVault.
            </p>
            <button onClick={onClose}
              className="w-full py-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold transition text-sm">
              Done
            </button>
          </div>
        )}

        <p className="mt-3 text-xs text-gray-400 text-center">
          Your credentials are encrypted (AES-256) and stored securely. They are only used for placing orders on your behalf.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  ALICEBLUE CREDENTIALS MODAL
// ═══════════════════════════════════════════════════════════════════════

function AliceBlueCredentialsModal({ onClose, onSave }) {
  const [step, setStep] = useState(1)
  const [abUserId, setAbUserId] = useState('')
  const [abApiSecret, setAbApiSecret] = useState('')
  const [abAppCode, setAbAppCode] = useState('')
  const [abAuthCode, setAbAuthCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [connectedUser, setConnectedUser] = useState('')
  const [showOAuth, setShowOAuth] = useState(false)
  const [loginUrl, setLoginUrl] = useState('')

  const handleConnect = async (e) => {
    e.preventDefault()
    setError('')
    if (!abUserId.trim() || !abApiSecret.trim()) {
      setError('Both User ID and API Secret are required')
      return
    }
    setSaving(true)
    try {
      // If authCode is provided, use it (OAuth flow completion)
      const result = await onSave(
        abUserId.trim(),
        abApiSecret.trim(),
        abAuthCode.trim() || undefined
      )
      setConnectedUser(result?.aliceblue_user_id || abUserId.trim())
      setStep(2)
    } catch (err) {
      const msg = err.message || 'Failed to connect AliceBlue'
      setError(msg)
      // If legacy auth failed, suggest OAuth
      if (msg.includes('v2 API') || msg.includes('OAuth') || msg.includes('incompatible') || msg.includes('failed')) {
        setShowOAuth(true)
      }
    } finally {
      setSaving(false)
    }
  }

  const openAliceBlueLogin = () => {
    const code = abAppCode.trim() || abApiSecret.trim()
    if (!code) {
      setError('Enter your App Code (or API Secret) to generate login URL')
      return
    }
    const url = `https://ant.aliceblueonline.com/?appcode=${code}`
    setLoginUrl(url)
    window.open(url, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{color: '#f0e6d0'}}>
            <Link2 className="w-5 h-5" style={{color: '#a855f7'}} />
            Connect AliceBlue
          </h2>
          <button onClick={onClose} className="p-1 rounded-full transition" style={{color: '#6b6580'}} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">❌ {error}</p>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="mb-4 space-y-2">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-xs font-semibold text-purple-700 mb-2">AliceBlue v2 API Setup</p>
                <p className="text-xs text-purple-600/80">
                  Enter your credentials from{' '}
                  <a href="https://a3.aliceblueonline.com" target="_blank" rel="noopener noreferrer"
                     className="underline text-purple-600 hover:text-purple-700">
                    a3.aliceblueonline.com
                  </a>{' '}Developer Console.
                </p>
              </div>
            </div>

            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">AliceBlue User ID</label>
                <input
                  type="text"
                  value={abUserId}
                  onChange={e => setAbUserId(e.target.value.toUpperCase())}
                  placeholder="e.g., AB1234"
                  required
                  className="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 font-mono text-sm transition"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">API Secret</label>
                <input
                  type="password"
                  value={abApiSecret}
                  onChange={e => setAbApiSecret(e.target.value)}
                  placeholder="Your AliceBlue API secret"
                  required
                  className="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 font-mono text-sm transition"
                />
              </div>

              {showOAuth && (
                <div className="space-y-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-semibold text-amber-700">OAuth Login Required</p>
                  <p className="text-xs text-amber-600/80">
                    AliceBlue now requires OAuth login. Click below to open AliceBlue login page,
                    then paste the <strong>authCode</strong> from the redirect URL.
                  </p>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">App Code (optional — defaults to API Secret)</label>
                    <input
                      type="text"
                      value={abAppCode}
                      onChange={e => setAbAppCode(e.target.value)}
                      placeholder="Your AliceBlue App Code"
                      className="w-full px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono text-xs transition"
                    />
                  </div>
                  <button type="button" onClick={openAliceBlueLogin}
                    className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold transition text-xs">
                    🔐 Login to AliceBlue (opens new tab)
                  </button>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Auth Code (from redirect URL)</label>
                    <input
                      type="text"
                      value={abAuthCode}
                      onChange={e => setAbAuthCode(e.target.value)}
                      placeholder="Paste authCode from AliceBlue redirect"
                      className="w-full px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono text-xs transition"
                    />
                  </div>
                </div>
              )}

              {!showOAuth && (
                <button type="button" onClick={() => setShowOAuth(true)}
                  className="w-full text-xs text-purple-600 hover:text-purple-700 text-center py-1 transition">
                  Having trouble? Use OAuth login →
                </button>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose}
                  className="flex-1 py-3 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-semibold transition text-sm disabled:opacity-50">
                  {saving ? 'Connecting...' : (abAuthCode ? 'Connect with Auth Code' : 'Connect AliceBlue')}
                </button>
              </div>
            </form>
          </>
        )}

        {step === 2 && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-purple-500" />
            </div>
            <h3 className="text-lg font-bold text-purple-600 mb-2">Connected!</h3>
            <p className="text-sm text-gray-600 mb-1">
              AliceBlue account <strong className="text-purple-600">{connectedUser}</strong> is now linked.
            </p>
            <p className="text-xs text-gray-400 mb-6">
              You can now trade via AliceBlue from TradeVault.
            </p>
            <button onClick={onClose}
              className="w-full py-3 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-semibold transition text-sm">
              Done
            </button>
          </div>
        )}

        <p className="mt-3 text-xs text-gray-400 text-center">
          Your credentials are encrypted (AES-256) and stored securely. They are only used for placing orders on your behalf.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  SETTINGS PANEL
// ═══════════════════════════════════════════════════════════════════════

function SettingsPanel({ apiKey, user, zerodhaStatus, upstoxStatus, aliceBlueStatus, onConnectTelegram, onConnectZerodha, onConnectUpstox, onDisconnectUpstox, onConnectAliceBlue, onDisconnectAliceBlue, onRegenerateKey }) {
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const [regenLoading, setRegenLoading] = useState(false)

  const handleRegenerate = async () => {
    setRegenLoading(true)
    await onRegenerateKey()
    setRegenLoading(false)
  }

  const copyKey = () => {
    navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-4 space-y-4">

      {/* Broker Section */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{color: '#6b6580'}}>Broker:</div>
        <div className="grid grid-cols-1 gap-2">
          <button onClick={onConnectZerodha}
            className="flex items-center justify-between p-3 rounded-lg transition" style={zerodhaStatus?.is_connected ? {background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)'} : (upstoxStatus?.is_connected || aliceBlueStatus?.is_connected) ? {background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', opacity: 0.4, cursor: 'not-allowed'} : {background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}
            onMouseEnter={e => { if (!(upstoxStatus?.is_connected || aliceBlueStatus?.is_connected)) { e.currentTarget.style.background = 'rgba(212,168,67,0.08)'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.2)' }}}
            onMouseLeave={e => { if (!(upstoxStatus?.is_connected || aliceBlueStatus?.is_connected)) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'var(--border)' }}}>
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4" style={{color: zerodhaStatus?.is_connected ? '#22c55e' : '#6b6580'}} />
              <span className="text-sm font-medium" style={{color: '#f0e6d0'}}>Zerodha</span>
            </div>
            <span className="text-xs" style={{color: zerodhaStatus?.is_connected ? '#22c55e' : '#6b6580'}}>
              {zerodhaStatus?.is_connected ? 'Connected' : zerodhaStatus?.has_credentials ? 'Update' : 'Connect'}
            </span>
          </button>

          <button onClick={upstoxStatus?.is_connected ? onDisconnectUpstox : onConnectUpstox}
            className="flex items-center justify-between p-3 rounded-lg transition" style={upstoxStatus?.is_connected ? {background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)'} : (zerodhaStatus?.is_connected || aliceBlueStatus?.is_connected) ? {background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', opacity: 0.4, cursor: 'not-allowed'} : {background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}
            onMouseEnter={e => { if (!(zerodhaStatus?.is_connected || aliceBlueStatus?.is_connected)) { e.currentTarget.style.background = 'rgba(212,168,67,0.08)'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.2)' }}}
            onMouseLeave={e => { if (!(zerodhaStatus?.is_connected || aliceBlueStatus?.is_connected)) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'var(--border)' }}}>
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4" style={{color: upstoxStatus?.is_connected ? '#fb923c' : '#6b6580'}} />
              <span className="text-sm font-medium" style={{color: '#f0e6d0'}}>Upstox</span>
            </div>
            <span className="text-xs" style={{color: upstoxStatus?.is_connected ? '#fb923c' : '#6b6580'}}>
              {upstoxStatus?.is_connected ? 'Connected' : upstoxStatus?.has_credentials ? 'Update' : 'Connect'}
            </span>
          </button>

          <button onClick={aliceBlueStatus?.is_connected ? onDisconnectAliceBlue : onConnectAliceBlue}
            className="flex items-center justify-between p-3 rounded-lg transition" style={aliceBlueStatus?.is_connected ? {background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)'} : (zerodhaStatus?.is_connected || upstoxStatus?.is_connected) ? {background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', opacity: 0.4, cursor: 'not-allowed'} : {background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}
            onMouseEnter={e => { if (!(zerodhaStatus?.is_connected || upstoxStatus?.is_connected)) { e.currentTarget.style.background = 'rgba(212,168,67,0.08)'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.2)' }}}
            onMouseLeave={e => { if (!(zerodhaStatus?.is_connected || upstoxStatus?.is_connected)) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'var(--border)' }}}>
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4" style={{color: aliceBlueStatus?.is_connected ? '#a855f7' : '#6b6580'}} />
              <span className="text-sm font-medium" style={{color: '#f0e6d0'}}>AliceBlue</span>
            </div>
            <span className="text-xs" style={{color: aliceBlueStatus?.is_connected ? '#a855f7' : '#6b6580'}}>
              {aliceBlueStatus?.is_connected ? 'Connected' : aliceBlueStatus?.has_credentials ? 'Reconnect' : 'Connect'}
            </span>
          </button>
        </div>
      </div>

      {/* Alert Section */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{color: '#6b6580'}}>Alert:</div>
        <button onClick={onConnectTelegram}
          className="flex items-center justify-between w-full p-3 rounded-lg transition" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,168,67,0.08)'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.2)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4" style={{color: '#38bdf8'}} />
            <span className="text-sm font-medium" style={{color: '#f0e6d0'}}>Telegram</span>
          </div>
          <span className="text-xs" style={{color: '#6b6580'}}>Get signals on Telegram</span>
        </button>
      </div>

      {/* Profile Info Section */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{color: '#6b6580'}}>Profile Info:</div>
        <div className="p-3 rounded-lg mb-2" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}>
          <div className="text-xs" style={{color: '#6b6580'}}>Logged in as</div>
          <div className="font-medium" style={{color: '#f0e6d0'}}>{user?.full_name || user?.email}</div>
          <div className="text-xs" style={{color: '#a09880'}}>{user?.email}</div>
        </div>

        <div className="p-3 rounded-lg" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}>
          <div className="text-xs mb-1" style={{color: '#6b6580'}}>API Key</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono break-all" style={{color: '#d4a843'}}>
              {showKey ? apiKey : apiKey?.substring(0, 8) + '••••••••••'}
            </code>
            <button onClick={() => setShowKey(!showKey)} className="p-1 rounded transition" style={{color: '#6b6580'}}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button onClick={copyKey} className="p-1 rounded transition" style={{color: '#6b6580'}}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {copied ? <Check className="w-3.5 h-3.5" style={{color: '#22c55e'}} /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button onClick={handleRegenerate} disabled={regenLoading}
            className="mt-2 text-xs flex items-center gap-1 transition disabled:opacity-50" style={{color: '#d4a843'}}>
            <RefreshCw className={`w-3 h-3 ${regenLoading ? 'animate-spin' : ''}`} />
            {regenLoading ? 'Regenerating...' : 'Regenerate Key'}
          </button>
        </div>
      </div>

      {/* Rate Limiting Info */}
      <div className="p-3 rounded-lg" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)'}}>
        <p className="text-xs" style={{color: '#6b6580'}}>
          Only one broker can be connected at a time. Disconnect your current broker to switch.
          Orders are placed via your own API key. Auto-trigger orders fire within seconds of signal.
        </p>
      </div>
    </div>
  )
}


export default App
