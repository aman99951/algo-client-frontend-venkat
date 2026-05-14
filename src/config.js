// API/WS base URLs are configured strictly from env.
export const API_BASE = import.meta.env.VITE_API_URL
export const WS_BASE = import.meta.env.VITE_WS_URL

// Status badge config
export const STATUS_CONFIG = {
  active:      { label: 'ACTIVE',      color: 'bg-yellow-500/20 text-yellow-400', border: 'border-yellow-500', icon: '🔔', pulse: true },
  in_market:   { label: 'IN MARKET',   color: 'bg-blue-500/20 text-blue-400',     border: 'border-blue-500',   icon: '📊', pulse: true },
  target_hit:  { label: 'TARGET HIT',  color: 'bg-green-500/20 text-green-400',   border: 'border-green-500',  icon: '🎯', pulse: false },
  sl_hit:      { label: 'SL HIT',      color: 'bg-red-500/20 text-red-400',       border: 'border-red-500',    icon: '🛑', pulse: false },
  manual_exit: { label: 'EXITED',      color: 'bg-gray-500/20 text-gray-400',     border: 'border-gray-500',   icon: '🔄', pulse: false },
  expired:     { label: 'EXPIRED',     color: 'bg-gray-500/20 text-gray-500',     border: 'border-gray-600',   icon: '⏰', pulse: false },
}

// Stance styles for Market Pulse
export const STANCE_STYLES = {
  green:  { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', bar: 'bg-green-500' },
  blue:   { bg: 'bg-blue-500/10',  border: 'border-blue-500/30',  text: 'text-blue-400',  bar: 'bg-blue-500' },
  amber:  { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', bar: 'bg-amber-500' },
  red:    { bg: 'bg-red-500/10',   border: 'border-red-500/30',   text: 'text-red-400',   bar: 'bg-red-500' },
  gray:   { bg: 'bg-gray-500/10',  border: 'border-gray-500/30',  text: 'text-gray-400',  bar: 'bg-gray-500' },
}

// News/Sentiment badge configs
export const SENTIMENT_BADGE = {
  bullish: { bg: 'bg-green-500/20', text: 'text-green-400', icon: '📈' },
  bearish: { bg: 'bg-red-500/20', text: 'text-red-400', icon: '📉' },
  neutral: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: '➖' },
  mixed:   { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: '⚖️' },
}

export const IMPACT_BADGE = {
  high:   { bg: 'bg-red-500/15', text: 'text-red-400', label: 'HIGH' },
  medium: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'MED' },
}

export const CATEGORY_ICONS = {
  macro: '🏛️', earnings: '💰', policy: '📋', global: '🌍', sector: '🏭', fii_dii: '💹',
}

// Lot sizes for standard indices
export const LOT_SIZES = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20, BANKEX: 30 }

// Index slots order
export const INDEX_SLOTS = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'BANKEX']
