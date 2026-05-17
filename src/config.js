// API/WS base URLs are configured strictly from env.
export const API_BASE = import.meta.env.VITE_API_URL
export const WS_BASE = import.meta.env.VITE_WS_URL

// Status badge config
export const STATUS_CONFIG = {
  active:      { label: 'ACTIVE',      color: 'bg-yellow-50 text-yellow-700', border: 'border-yellow-300', icon: '🔔', pulse: true },
  in_market:   { label: 'IN MARKET',   color: 'bg-blue-50 text-blue-700',     border: 'border-blue-300',   icon: '📊', pulse: true },
  target_hit:  { label: 'TARGET HIT',  color: 'bg-green-50 text-green-700',   border: 'border-green-300',  icon: '🎯', pulse: false },
  sl_hit:      { label: 'SL HIT',      color: 'bg-red-50 text-red-700',       border: 'border-red-300',    icon: '🛑', pulse: false },
  manual_exit: { label: 'EXITED',      color: 'bg-gray-200 text-gray-700',     border: 'border-gray-300',   icon: '🔄', pulse: false },
  expired:     { label: 'EXPIRED',     color: 'bg-gray-200 text-gray-600',     border: 'border-gray-300',   icon: '⏰', pulse: false },
}

// Stance styles for Market Pulse
export const STANCE_STYLES = {
  green:  { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600', bar: 'bg-green-500' },
  blue:   { bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-600',  bar: 'bg-blue-500' },
  amber:  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', bar: 'bg-amber-500' },
  red:    { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-600',   bar: 'bg-red-500' },
  gray:   { bg: 'bg-gray-100',  border: 'border-gray-200',  text: 'text-gray-600',  bar: 'bg-gray-500' },
}

// News/Sentiment badge configs
export const SENTIMENT_BADGE = {
  bullish: { bg: 'bg-green-50', text: 'text-green-600', icon: '📈' },
  bearish: { bg: 'bg-red-50', text: 'text-red-600', icon: '📉' },
  neutral: { bg: 'bg-gray-100', text: 'text-gray-700', icon: '➖' },
  mixed:   { bg: 'bg-amber-50', text: 'text-amber-600', icon: '⚖️' },
}

export const IMPACT_BADGE = {
  high:   { bg: 'bg-red-50', text: 'text-red-700', label: 'HIGH' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'MED' },
}

export const CATEGORY_ICONS = {
  macro: '🏛️', earnings: '💰', policy: '📋', global: '🌍', sector: '🏭', fii_dii: '💹',
}

// Lot sizes for standard indices
export const LOT_SIZES = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20, BANKEX: 30 }

// Index slots order
export const INDEX_SLOTS = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'BANKEX']
