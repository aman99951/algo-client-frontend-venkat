import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Coins, ChevronDown, ShoppingCart, X, RefreshCw } from 'lucide-react';

import { API_BASE } from '../config';

export default function CreditBadge({ apiKey, onBuyClick }) {
  const [balance, setBalance] = useState(null);
  const [tradesRemaining, setTradesRemaining] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs animate-pulse" style={{background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.2)', color: '#d4a843'}}>
        <Coins className="w-3 h-3" />
        <span>...</span>
      </div>
    );
  }

  if (balance === null) {
    return (
      <button
        onClick={() => { if (!loading) fetchBalance() }}
        disabled={loading}
        className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition disabled:opacity-50"
        style={{background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.25)', color: '#d4a843'}}
        title="Credit balance unavailable — tap to retry"
      >
        <Coins className={`w-3 h-3 ${loading ? 'animate-pulse' : ''}`} />
        <span>{loading ? 'Loading...' : 'Credits'}</span>
      </button>
    );
  }

  const isLow = balance < 50;
  const isEmpty = balance < 10;

  let badgeStyle
  if (isEmpty) {
    badgeStyle = {background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444'}
  } else if (isLow) {
    badgeStyle = {background: 'rgba(212,168,67,0.12)', border: '1px solid rgba(212,168,67,0.25)', color: '#d4a843'}
  } else {
    badgeStyle = {background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e'}
  }

  return (
    <>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold transition-all ${isEmpty ? 'animate-pulse' : ''}`}
        style={badgeStyle}
      >
        <Coins className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        <span className="sm:inline">{balance.toLocaleString()}</span>
        <ChevronDown className={`w-2.5 h-2.5 sm:w-3 sm:h-3 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && createPortal(
        <>
          <div className="fixed left-0 right-0" style={{top: '48px', bottom: 0, zIndex: 90}} onClick={() => setShowDropdown(false)} />
          <div className="fixed right-4" style={{top: '60px', zIndex: 95}}>
            <div className="w-[calc(100vw-32px)] max-w-sm rounded-xl shadow-2xl overflow-hidden" style={{background: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)'}}>
              <div className="p-4 border-b" style={{background: 'rgba(212,168,67,0.08)', borderColor: 'rgba(212,168,67,0.15)'}}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{color: '#a09880'}}>Available Credits</span>
                  <button onClick={() => setShowDropdown(false)}
                    className="p-1 rounded-lg transition" style={{color: '#6b6580'}}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold" style={{color: '#f0e6d0'}}>{balance.toLocaleString()}</span>
                  <span className="text-xs" style={{color: '#6b6580'}}>credits</span>
                </div>
                <div className="text-xs mt-1" style={{color: '#6b6580'}}>
                  ≈ {tradesRemaining} trades remaining
                </div>
                {isEmpty && (
                  <div className="mt-2 px-2 py-1 rounded text-xs" style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444'}}>
                    Insufficient credits for trading
                  </div>
                )}
                {isLow && !isEmpty && (
                  <div className="mt-2 px-2 py-1 rounded text-xs" style={{background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.2)', color: '#d4a843'}}>
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
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-left"
                  style={{color: '#a09880'}}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,168,67,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{background: 'rgba(212,168,67,0.12)'}}>
                    <ShoppingCart className="w-4 h-4" style={{color: '#d4a843'}} />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{color: '#f0e6d0'}}>Buy Credits</div>
                    <div className="text-xs" style={{color: '#6b6580'}}>Starting from ₹500</div>
                  </div>
                </button>
                <button
                  onClick={() => { setRefreshing(true); fetchBalance().finally(() => setRefreshing(false)) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-left mt-1"
                  style={{color: '#a09880', cursor: 'pointer'}}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,168,67,0.08)'; e.currentTarget.style.color = '#f0e6d0' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a09880' }}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{background: 'rgba(212,168,67,0.12)'}}>
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} style={{color: '#d4a843'}} />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{color: '#f0e6d0'}}>Refresh Balance</div>
                    <div className="text-xs" style={{color: '#6b6580'}}>Check latest credits</div>
                  </div>
                </button>
              </div>

              <div className="px-4 py-3 border-t" style={{background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)'}}>
                <div className="flex items-center justify-between text-xs" style={{color: '#6b6580'}}>
                  <span>10 credits per trade</span>
                  <span>1000 free on signup</span>
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
