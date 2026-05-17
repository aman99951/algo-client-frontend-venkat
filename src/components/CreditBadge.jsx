import { useState, useEffect, useCallback } from 'react';
import { Coins, ChevronDown, Zap, ShoppingCart, History, X } from 'lucide-react';

import { API_BASE } from '../config';

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
    const interval = setInterval(fetchBalance, 60000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  useEffect(() => {
    const handler = () => fetchBalance();
    window.addEventListener('credit-update', handler);
    return () => window.removeEventListener('credit-update', handler);
  }, [fetchBalance]);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs text-blue-600 animate-pulse">
        <Coins className="w-3.5 h-3.5" />
        <span>...</span>
      </div>
    );
  }

  if (balance === null) {
    return (
      <button
        onClick={() => { if (!loading) fetchBalance() }}
        disabled={loading}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs text-amber-600 hover:bg-amber-100 transition disabled:opacity-50"
        title="Credit balance unavailable — tap to retry"
      >
        <Coins className={`w-3.5 h-3.5 ${loading ? 'animate-pulse' : ''}`} />
        <span>{loading ? 'Loading...' : 'Credits'}</span>
      </button>
    );
  }

  const isLow = balance < 50;
  const isEmpty = balance < 10;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
          isEmpty
            ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse'
            : isLow
            ? 'bg-amber-50 text-amber-600 border border-amber-200'
            : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
        }`}
      >
        <Coins className="w-3.5 h-3.5" />
        <span>{balance.toLocaleString()}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />

          <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-100">
              <div className="text-xs text-gray-600 mb-1">Available Credits</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">{balance.toLocaleString()}</span>
                <span className="text-xs text-gray-500">credits</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                ≈ {tradesRemaining} trades remaining
              </div>
              {isEmpty && (
                <div className="mt-2 px-2 py-1 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                  Insufficient credits for trading
                </div>
              )}
              {isLow && !isEmpty && (
                <div className="mt-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-600">
                  Low balance — consider buying credits
                </div>
              )}
            </div>

            <div className="p-2">
              <button
                onClick={() => {
                  setShowDropdown(false);
                  onBuyClick?.();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition text-left"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Buy Credits</div>
                  <div className="text-xs text-gray-600">Starting from ₹500</div>
                </div>
              </button>
            </div>

            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
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
