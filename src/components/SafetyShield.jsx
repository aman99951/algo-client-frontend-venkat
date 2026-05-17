import React, { useState } from 'react'
import { ShieldCheck, AlertTriangle, Zap, Clock, Link2, Activity, ChevronDown, ChevronUp } from 'lucide-react'

/**
 * SafetyShield — Real-time protection status for each trading index.
 *
 * Displays:
 *  • Trend Freshness (pullback/consolidation/momentum decay detection)
 *  • Consecutive Loss Counter + Circuit Breaker status
 *  • Post-loss Extended Cooldown timer
 *  • Cross-index Correlation Halt
 *
 * Props:
 *  - marketPulseData: { indices: [...] } from the market-pulse API (includes `safety` object)
 */

// Overall shield status: derive from safety object
function getShieldStatus(safety) {
  if (!safety) return { level: 'ok', label: 'Protected', color: 'green', icon: '🛡️' }

  if (safety.loss_streak_halted || safety.cross_index_halted) {
    return { level: 'critical', label: 'HALTED', color: 'red', icon: '🛑' }
  }
  if (!safety.trend_fresh || safety.cooldown_active || safety.consecutive_losses >= 2) {
    return { level: 'warning', label: 'Caution', color: 'amber', icon: '⚠️' }
  }
  if (safety.consecutive_losses === 1) {
    return { level: 'alert', label: 'Monitoring', color: 'yellow', icon: '👁️' }
  }
  return { level: 'ok', label: 'Protected', color: 'green', icon: '🛡️' }
}

const STATUS_STYLES = {
  green:  { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600', pill: 'bg-green-50 text-green-600' },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-600', pill: 'bg-yellow-50 text-yellow-600' },
  amber:  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', pill: 'bg-amber-50 text-amber-600' },
  red:    { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', pill: 'bg-red-50 text-red-600' },
}

function LossStreakBar({ losses, max }) {
  const pct = Math.min(100, (losses / max) * 100)
  const barColor = losses >= max ? 'bg-red-500' : losses >= 2 ? 'bg-amber-500' : losses >= 1 ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-gray-500">{losses}/{max}</span>
    </div>
  )
}

function SafetyItem({ icon: Icon, label, status, statusColor, detail }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3 text-gray-500" />
        <span className="text-xs text-gray-600">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {detail && <span className="text-xs text-gray-500 max-w-[120px] truncate" title={detail}>{detail}</span>}
        <span className={`text-xs font-semibold ${statusColor}`}>{status}</span>
      </div>
    </div>
  )
}

function IndexSafetyCard({ idx }) {
  const safety = idx.safety || {}
  const shield = getShieldStatus(safety)
  const s = STATUS_STYLES[shield.color] || STATUS_STYLES.green

  return (
    <div className={`${s.bg} rounded-lg p-3 border ${s.border}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">{idx.index}</span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${s.pill}`}>
            {shield.icon} {shield.label}
          </span>
        </div>
      </div>

      {/* Safety checks */}
      <div className="space-y-0.5">
        {/* Trend Freshness */}
        <SafetyItem
          icon={Activity}
          label="Trend Freshness"
          status={safety.trend_fresh ? '✓ Fresh' : '✗ Stale'}
          statusColor={safety.trend_fresh ? 'text-green-500' : 'text-amber-500'}
          detail={!safety.trend_fresh ? safety.trend_freshness_reason : ''}
        />

        {/* Loss Streak */}
        <div className="py-1">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-gray-500" />
              <span className="text-xs text-gray-600">Loss Streak</span>
            </div>
            <span className={`text-xs font-semibold ${
              safety.loss_streak_halted ? 'text-red-600' :
              safety.consecutive_losses >= 2 ? 'text-amber-600' :
              safety.consecutive_losses >= 1 ? 'text-yellow-600' : 'text-green-600'
            }`}>
              {safety.loss_streak_halted ? '🛑 BREAKER' :
               safety.consecutive_losses > 0 ? `${safety.consecutive_losses} losses` : '✓ Clear'}
            </span>
          </div>
          <LossStreakBar losses={safety.consecutive_losses || 0} max={safety.max_consecutive_losses || 3} />
        </div>

        {/* Cooldown */}
        <SafetyItem
          icon={Clock}
          label="Post-Loss Cooldown"
          status={safety.cooldown_active ? `${safety.cooldown_minutes}m` : '✓ Off'}
          statusColor={safety.cooldown_active ? 'text-amber-500' : 'text-green-500'}
        />

        {/* Cross-Index */}
        <SafetyItem
          icon={Link2}
          label="Cross-Index Guard"
          status={safety.cross_index_halted ? '⛔ Halted' : '✓ OK'}
          statusColor={safety.cross_index_halted ? 'text-red-600' : 'text-green-500'}
          detail={safety.cross_index_halted ? safety.cross_halt_source : ''}
        />
      </div>
    </div>
  )
}

export default function SafetyShield({ marketPulseData }) {
  const [collapsed, setCollapsed] = useState(false)

  const indices = marketPulseData?.indices || []
  if (!indices.length) return null

  // Check if any index has safety data
  const hasSafetyData = indices.some(idx => idx.safety)
  if (!hasSafetyData) return null

  // Overall status: worst across all indices
  const allStatuses = indices.map(idx => getShieldStatus(idx.safety))
  const hasCritical = allStatuses.some(s => s.level === 'critical')
  const hasWarning = allStatuses.some(s => s.level === 'warning')
  const overallColor = hasCritical ? 'text-red-500' : hasWarning ? 'text-amber-500' : 'text-green-500'
  const overallLabel = hasCritical ? 'Action Required' : hasWarning ? 'Caution Active' : 'All Systems Protected'

  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2 bg-white rounded-t-xl border border-gray-200 hover:bg-gray-50 transition"
      >
        <span className="text-xs font-semibold flex items-center gap-2 text-gray-600">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
          Safety Shield
          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
            hasCritical ? 'bg-red-50 text-red-600' :
            hasWarning ? 'bg-amber-50 text-amber-600' :
            'bg-green-50 text-green-600'
          }`}>
            {overallLabel}
          </span>
        </span>
        <span className="text-gray-500 text-xs">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
          {indices.map(idx => (
            <IndexSafetyCard key={idx.index} idx={idx} />
          ))}
        </div>
      )}
    </div>
  )
}
