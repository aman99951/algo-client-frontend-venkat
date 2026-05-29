import { useState, useEffect } from 'react';
import { X, Coins, Star, Zap, Crown, Rocket, Check, Shield, Clock, TrendingUp } from 'lucide-react';

import { API_BASE } from '../config';

export default function CreditStore({ apiKey, isOpen, onClose }) {
  const [packages, setPackages] = useState([]);
  const [history, setHistory] = useState([]);
  const [balance, setBalance] = useState(0);
  const [activeTab, setActiveTab] = useState('packages');
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(null);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (!isOpen || !apiKey) return;
    fetch(`${API_BASE}/api/credits/reconcile?api_key=${apiKey}`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.recovered_count > 0) {
          console.info(`CreditStore: reconciled ${data.recovered_count} purchase(s)`);
          window.dispatchEvent(new Event('credit-update'));
        }
      })
      .catch(() => {})
      .finally(() => fetchData());
  }, [isOpen, apiKey]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pkgRes, balRes, cfgRes, histRes] = await Promise.all([
        fetch(`${API_BASE}/api/credits/packages`),
        fetch(`${API_BASE}/api/credits/balance?api_key=${apiKey}`),
        fetch(`${API_BASE}/api/credits/config`),
        fetch(`${API_BASE}/api/credits/history?api_key=${apiKey}&limit=20`),
      ]);
      if (pkgRes.ok) setPackages(await pkgRes.json());
      if (balRes.ok) {
        const bal = await balRes.json();
        setBalance(bal.balance);
      }
      if (cfgRes.ok) setConfig(await cfgRes.json());
      if (histRes.ok) setHistory(await histRes.json());
    } catch (err) {
      console.error('CreditStore fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (pkg) => {
    setPurchasing(pkg.id);
    try {
      const orderRes = await fetch(`${API_BASE}/api/credits/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, package_id: pkg.id }),
      });
      if (!orderRes.ok) {
        alert('Failed to create payment order. Please try again.');
        return;
      }
      const orderData = await orderRes.json();

      const options = {
        key: orderData.key_id,
        amount: orderData.amount * 100,
        currency: orderData.currency,
        name: 'TradeVault',
        description: `${pkg.name} — ${pkg.total_credits.toLocaleString()} Credits`,
        order_id: orderData.order_id,
        handler: async function (response) {
          const verifyPayload = {
            api_key: apiKey,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          };

          let verifySuccess = false;
          let lastError = null;

          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const verifyRes = await fetch(`${API_BASE}/api/credits/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(verifyPayload),
              });
              if (verifyRes.ok) {
                const result = await verifyRes.json();
                setBalance(result.balance);
                window.dispatchEvent(new Event('credit-update'));
                alert(`✅ Payment verified! Balance: ${result.balance.toLocaleString()} credits`);
                fetchData();
                verifySuccess = true;
                break;
              } else {
                const errBody = await verifyRes.text().catch(() => 'Unknown error');
                console.error(`Verify attempt ${attempt} failed (HTTP ${verifyRes.status}):`, errBody);
                lastError = `HTTP ${verifyRes.status}: ${errBody}`;
              }
            } catch (err) {
              console.error(`Verify attempt ${attempt} network error:`, err);
              lastError = err.message || 'Network error';
            }
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
          }

          if (verifySuccess) return;

          console.warn('Verify failed, trying recovery endpoint...');
          try {
            const recoverRes = await fetch(`${API_BASE}/api/credits/recover`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                api_key: apiKey,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
              }),
            });
            if (recoverRes.ok) {
              const result = await recoverRes.json();
              setBalance(result.balance);
              window.dispatchEvent(new Event('credit-update'));
              alert(`✅ Credits recovered! New balance: ${result.balance.toLocaleString()}`);
              fetchData();
              return;
            }
          } catch (recoverErr) {
            console.error('Recovery also failed:', recoverErr);
          }

          alert(
            'Payment verification failed. Your payment is safe.\n\n' +
            'Payment ID: ' + response.razorpay_payment_id + '\n' +
            'Error: ' + (lastError || 'Unknown') + '\n\n' +
            'Please contact support with your Payment ID.'
          );
        },
        prefill: {},
        theme: {
          color: '#d4a843',
        },
        modal: {
          ondismiss: function () {
            setPurchasing(null);
          },
        },
      };

      if (typeof window.Razorpay === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => {
          const rzp = new window.Razorpay(options);
          rzp.open();
        };
        document.body.appendChild(script);
      } else {
        const rzp = new window.Razorpay(options);
        rzp.open();
      }
    } catch (err) {
      console.error('Purchase error:', err);
      alert('Something went wrong. Please try again.');
    } finally {
      setPurchasing(null);
    }
  };

  if (!isOpen) return null;

  const tierIcons = {
    starter: Zap,
    pro: Star,
    elite: Crown,
    ultra: Rocket,
  };

  const tierColors = {
    starter: { bg: 'rgba(212,168,67,0.06)', border: 'rgba(212,168,67,0.15)', text: '#d4a843', btn: 'rgba(212,168,67,0.9)', badge: 'rgba(212,168,67,0.12)' },
    pro: { bg: 'rgba(168,85,247,0.06)', border: 'rgba(168,85,247,0.2)', text: '#a855f7', btn: 'rgba(168,85,247,0.85)', badge: 'rgba(168,85,247,0.12)' },
    elite: { bg: 'rgba(212,168,67,0.08)', border: 'rgba(212,168,67,0.2)', text: '#d4a843', btn: 'rgba(212,168,67,0.9)', badge: 'rgba(212,168,67,0.15)' },
    ultra: { bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)', text: '#10b981', btn: 'rgba(16,185,129,0.85)', badge: 'rgba(16,185,129,0.12)' },
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0" style={{background: 'rgba(0,0,0,0.7)'}} onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto" style={{background: '#12121a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', boxShadow: '0 25px 80px rgba(0,0,0,0.6)'}}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4" style={{background: 'rgba(18,18,26,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2" style={{color: '#f0e6d0'}}>
              <Coins className="w-6 h-6" style={{color: '#d4a843'}} />
              Credit Store
            </h2>
            <p className="text-sm mt-0.5" style={{color: '#a09880'}}>
              Current balance: <span style={{color: '#f0e6d0', fontWeight: 600}}>{balance.toLocaleString()}</span> credits
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg transition" style={{color: '#6b6580'}}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4">
          <button
            onClick={() => setActiveTab('packages')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition"
            style={{
              background: activeTab === 'packages' ? '#d4a843' : 'rgba(255,255,255,0.04)',
              color: activeTab === 'packages' ? '#0a0a0f' : '#a09880'
            }}
          >
            Buy Credits
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5"
            style={{
              background: activeTab === 'history' ? '#d4a843' : 'rgba(255,255,255,0.04)',
              color: activeTab === 'history' ? '#0a0a0f' : '#a09880'
            }}
          >
            <Clock className="w-3.5 h-3.5" />
            History
          </button>
        </div>

        {/* Content */}
        {activeTab === 'packages' ? (
          <div className="p-6">
            {/* Trust indicators */}
            <div className="flex flex-wrap gap-4 mb-6 text-xs" style={{color: '#a09880'}}>
              <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" style={{color: '#10b981'}} /> Secure Razorpay Payments</span>
              <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5" style={{color: '#d4a843'}} /> Instant Credit</span>
              <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" style={{color: '#d4a843'}} /> No Expiry</span>
            </div>

            {/* Package Grid */}
            {loading ? (
              <div className="text-center py-12" style={{color: '#6b6580'}}>Loading packages...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {packages.map((pkg) => {
                  const colors = tierColors[pkg.slug] || tierColors.starter;
                  const Icon = tierIcons[pkg.slug] || Zap;
                  return (
                    <div
                      key={pkg.id}
                      className="relative rounded-xl p-5 flex flex-col transition-all hover:scale-[1.02]"
                      style={{
                        background: colors.bg,
                        border: `1px solid ${colors.border}`,
                        boxShadow: pkg.is_popular ? '0 0 0 2px #d4a843' : 'none'
                      }}
                    >
                      {/* Popular Badge */}
                      {pkg.is_popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider"
                          style={{background: '#d4a843', color: '#0a0a0f'}}>
                          Most Popular
                        </div>
                      )}

                      {/* Icon + Name */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background: 'rgba(255,255,255,0.06)'}}>
                          <Icon className="w-5 h-5" style={{color: colors.text}} />
                        </div>
                        <div>
                          <h3 className="text-base font-bold" style={{color: '#f0e6d0'}}>{pkg.name}</h3>
                          {pkg.savings_pct > 0 && (
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{background: 'rgba(16,185,129,0.12)', color: '#10b981'}}>
                              SAVE {pkg.savings_pct}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="mb-4">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold" style={{color: '#f0e6d0'}}>₹{pkg.price_inr.toLocaleString()}</span>
                        </div>
                        <div className="text-xs mt-0.5" style={{color: '#6b6580'}}>
                          {pkg.total_credits.toLocaleString()} credits
                        </div>
                      </div>

                      {/* Features */}
                      <div className="flex-1 space-y-2 mb-4 text-xs">
                        <div className="flex items-center gap-2" style={{color: '#a09880'}}>
                          <Check className="w-3.5 h-3.5 flex-shrink-0" style={{color: '#10b981'}} />
                          <span>{pkg.trades} trades</span>
                        </div>
                        <div className="flex items-center gap-2" style={{color: '#a09880'}}>
                          <Check className="w-3.5 h-3.5 flex-shrink-0" style={{color: '#10b981'}} />
                          <span>₹{pkg.per_trade_cost} per trade</span>
                        </div>
                        <div className="flex items-center gap-2" style={{color: '#a09880'}}>
                          <Check className="w-3.5 h-3.5 flex-shrink-0" style={{color: '#10b981'}} />
                          <span>No expiry</span>
                        </div>
                        {pkg.bonus_credits > 0 && (
                          <div className="flex items-center gap-2" style={{color: '#d4a843'}}>
                            <Star className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>+{pkg.bonus_credits} bonus</span>
                          </div>
                        )}
                      </div>

                      {/* Buy Button */}
                      <button
                        onClick={() => handlePurchase(pkg)}
                        disabled={purchasing === pkg.id}
                        className="w-full py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                        style={{
                          background: colors.btn,
                          color: '#0a0a0f',
                          opacity: purchasing === pkg.id ? 0.5 : 1
                        }}
                        onMouseEnter={e => { if (purchasing !== pkg.id) e.currentTarget.style.filter = 'brightness(1.15)' }}
                        onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                      >
                        {purchasing === pkg.id ? 'Processing...' : 'Buy Now'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Info */}
            <div className="mt-6 p-4 rounded-xl" style={{background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'}}>
              <h4 className="text-sm font-semibold mb-2" style={{color: '#f0e6d0'}}>How it works</h4>
              <ul className="text-xs space-y-1.5" style={{color: '#a09880'}}>
                <li>• <strong style={{color: '#f0e6d0'}}>10 credits</strong> are consumed per executed trade</li>
                <li>• Credits are deducted when a trade closes (SL/Target/Manual exit)</li>
                <li>• New users get <strong style={{color: '#f0e6d0'}}>1,000 free credits</strong> (100 trades)</li>
                <li>• Higher packages offer lower per-trade costs (up to 50% savings)</li>
                <li>• Credits never expire — use them at your own pace</li>
                <li>• Payments are processed securely via <strong style={{color: '#f0e6d0'}}>Razorpay</strong> (UPI/Cards/Netbanking)</li>
              </ul>
            </div>
          </div>
        ) : (
          /* History Tab */
          <div className="p-6">
            {history.length === 0 ? (
              <div className="text-center py-12" style={{color: '#6b6580'}}>
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" style={{color: '#6b6580'}} />
                <p>No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3 rounded-lg"
                    style={{background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'}}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{background: entry.type === 'credit' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'}}>
                        {entry.type === 'credit'
                          ? <TrendingUp className="w-4 h-4" style={{color: '#10b981'}} />
                          : <Coins className="w-4 h-4" style={{color: '#ef4444'}} />
                        }
                      </div>
                      <div>
                        <div className="text-sm" style={{color: '#f0e6d0'}}>{entry.description || entry.reason}</div>
                        <div className="text-xs" style={{color: '#6b6580'}}>
                          {entry.created_at ? new Date(entry.created_at.endsWith?.('Z') ? entry.created_at : entry.created_at + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold" style={{color: entry.type === 'credit' ? '#10b981' : '#ef4444'}}>
                        {entry.type === 'credit' ? '+' : '−'}{entry.amount}
                      </div>
                      <div className="text-xs" style={{color: '#6b6580'}}>bal: {entry.balance_after}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
