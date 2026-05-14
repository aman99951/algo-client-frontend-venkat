import { useState, useEffect, useCallback } from 'react';
import { Coins, ChevronDown, Zap, ShoppingCart, History, X } from 'lucide-react';

import { API_BASE } from '../config';

/**
 * CreditBadge — Top-right credit balance display for subscriber portal.
 *
 * Shows:
 *   - Current credit balance with coin icon
 *   - Dropdown with balance details + quick actions
 *   - Low balance warning (< 50 credits = 5 trades)
 *
 * Props:
 *   apiKey  — subscriber's API key for auth
 *   onBuyClick — callback to open the CreditStore modal
 */
export default function CreditBadge({ apiKey, onBuyClick }) {
  const [balance, setBalance] = useState(null);
  const [tradesRemaining, setTradesRemaining] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchBalance = useCallback(async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${API_BASE}/api/credits/balance?api_key=${apiKey}`);
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
        setTradesRemaining(data.trades_remaining);
      }
    } catch (err) {
      console.warn('Credit balance fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchBalance();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchBalance, 60000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  // Listen for custom credit update events (fired after trade/purchase)
  useEffect(() => {
    const handler = () => fetchBalance();
    window.addEventListener('credit-update', handler);
    return () => window.removeEventListener('credit-update', handler);
  }, [fetchBalance]);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/20 text-xs text-blue-300 animate-pulse">
        <Coins className="w-3.5 h-3.5" />
        <span>...</span>
      </div>
    );
  }

  if (balance === null) {
    return (
      <button
        onClick={() => fetchBalance()}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/20 text-xs text-yellow-300 hover:bg-yellow-500/25 transition"
        title="Credit balance unavailable — tap to retry"
      >
        <Coins className="w-3.5 h-3.5" />
        <span>Credits</span>
      </button>
    );
  }

  const isLow = balance < 50;
  const isEmpty = balance < 10;

  return (
    <div className="relative">
      {/* Badge Button */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
          isEmpty
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
            : isLow
            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25'
        }`}
      >
        <Coins className="w-3.5 h-3.5" />
        <span>{balance.toLocaleString()}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <>
          {/* Overlay to close */}
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />

          <div className="absolute right-0 top-full mt-2 w-64 bg-[#1a1f3a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
            {/* Balance Header */}
            <div className="p-4 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-b border-white/5">
              <div className="text-xs text-gray-400 mb-1">Available Credits</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{balance.toLocaleString()}</span>
                <span className="text-xs text-gray-400">credits</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                ≈ {tradesRemaining} trades remaining
              </div>
              {isEmpty && (
                <div className="mt-2 px-2 py-1 bg-red-500/20 border border-red-500/30 rounded text-xs text-red-400">
                  ⚠️ Insufficient credits for trading
                </div>
              )}
              {isLow && !isEmpty && (
                <div className="mt-2 px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded text-xs text-yellow-400">
                  ⚡ Low balance — consider buying credits
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-2">
              <button
                onClick={() => {
                  setShowDropdown(false);
                  onBuyClick?.();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition text-left"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Buy Credits</div>
                  <div className="text-xs text-gray-400">Starting from ₹500</div>
                </div>
              </button>
            </div>

            {/* Credits per trade info */}
            <div className="px-4 py-3 bg-white/2 border-t border-white/5">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>10 credits per trade</span>
                <span>1000 free on signup</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

