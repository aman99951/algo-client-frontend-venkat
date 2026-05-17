import { useState, useEffect } from 'react';
import { X, Coins, Star, Zap, Crown, Rocket, Check, Shield, Clock, TrendingUp } from 'lucide-react';

import { API_BASE } from '../config';

/**
 * CreditStore — Full-screen modal for purchasing credit packages.
 *
 * Features:
 *   - 4-tier package grid (Starter/Pro/Elite/Ultra)
 *   - "Most Popular" badge on Pro tier (anchoring)
 *   - Razorpay checkout integration
 *   - Transaction history tab
 *   - Responsive design
 *
 * Props:
 *   apiKey   — subscriber's API key
 *   isOpen   — controlled visibility
 *   onClose  — callback to close modal
 */
export default function CreditStore({ apiKey, isOpen, onClose }) {
  const [packages, setPackages] = useState([]);
  const [history, setHistory] = useState([]);
  const [balance, setBalance] = useState(0);
  const [activeTab, setActiveTab] = useState('packages'); // 'packages' | 'history'
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(null); // package id being purchased
  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (!isOpen || !apiKey) return;
    // Auto-reconcile any paid-but-uncredited purchases, then fetch data
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
      // Step 1: Create Razorpay order
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

      // Step 2: Open Razorpay checkout
      const options = {
        key: orderData.key_id,
        amount: orderData.amount * 100,
        currency: orderData.currency,
        name: 'TradeVault',
        description: `${pkg.name} — ${pkg.total_credits.toLocaleString()} Credits`,
        order_id: orderData.order_id,
        handler: async function (response) {
          // Step 3: Verify payment — try up to 2 times
          const verifyPayload = {
            api_key: apiKey,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          };

          let verifySuccess = false;
          let lastError = null;

          // Attempt 1: Normal verify
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
            // Wait before retry
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
          }

          if (verifySuccess) return;

          // Attempt 2: Recovery endpoint
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
          color: '#3b82f6',
        },
        modal: {
          ondismiss: function () {
            setPurchasing(null);
          },
        },
      };

      if (typeof window.Razorpay === 'undefined') {
        // Load Razorpay script dynamically
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
    starter: { bg: 'from-blue-50 to-blue-100/50', border: 'border-blue-200', text: 'text-blue-600', btn: 'bg-blue-600 hover:bg-blue-700' },
    pro: { bg: 'from-purple-50 to-purple-100/50', border: 'border-purple-300', text: 'text-purple-600', btn: 'bg-purple-600 hover:bg-purple-700' },
    elite: { bg: 'from-amber-50 to-amber-100/50', border: 'border-amber-200', text: 'text-amber-600', btn: 'bg-amber-600 hover:bg-amber-700' },
    ultra: { bg: 'from-emerald-50 to-emerald-100/50', border: 'border-emerald-200', text: 'text-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto bg-white border border-gray-200 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Coins className="w-6 h-6 text-amber-500" />
              Credit Store
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">
              Current balance: <span className="text-gray-900 font-semibold">{balance.toLocaleString()}</span> credits
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4">
          <button
            onClick={() => setActiveTab('packages')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'packages' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Buy Credits
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
              activeTab === 'history' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            History
          </button>
        </div>

        {/* Content */}
        {activeTab === 'packages' ? (
          <div className="p-6">
            {/* Trust indicators */}
            <div className="flex flex-wrap gap-4 mb-6 text-xs text-gray-600">
              <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-green-500" /> Secure Razorpay Payments</span>
              <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-amber-500" /> Instant Credit</span>
              <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-blue-500" /> No Expiry</span>
            </div>

            {/* Package Grid */}
            {loading ? (
              <div className="text-center py-12 text-gray-500">Loading packages...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {packages.map((pkg) => {
                  const colors = tierColors[pkg.slug] || tierColors.starter;
                  const Icon = tierIcons[pkg.slug] || Zap;
                  return (
                    <div
                      key={pkg.id}
                      className={`relative bg-gradient-to-b ${colors.bg} border ${colors.border} rounded-xl p-5 flex flex-col transition-all hover:scale-[1.02] hover:shadow-lg ${
                        pkg.is_popular ? 'ring-2 ring-purple-400' : ''
                      }`}
                    >
                      {/* Popular Badge */}
                      {pkg.is_popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-purple-600 rounded-full text-xs font-bold text-white uppercase tracking-wider">
                          Most Popular
                        </div>
                      )}

                      {/* Icon + Name */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center ${colors.text}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-gray-900">{pkg.name}</h3>
                          {pkg.savings_pct > 0 && (
                            <span className="text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                              SAVE {pkg.savings_pct}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="mb-4">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold text-gray-900">₹{pkg.price_inr.toLocaleString()}</span>
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {pkg.total_credits.toLocaleString()} credits
                        </div>
                      </div>

                      {/* Features */}
                      <div className="flex-1 space-y-2 mb-4 text-xs">
                    <div className="flex items-center gap-2 text-gray-700">
                      <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                      <span>{pkg.trades} trades</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-700">
                      <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                      <span>₹{pkg.per_trade_cost} per trade</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-700">
                      <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                      <span>No expiry</span>
                    </div>
                        {pkg.bonus_credits > 0 && (
                          <div className="flex items-center gap-2 text-amber-600">
                            <Star className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>+{pkg.bonus_credits} bonus</span>
                          </div>
                        )}
                      </div>

                      {/* Buy Button */}
                      <button
                        onClick={() => handlePurchase(pkg)}
                        disabled={purchasing === pkg.id}
                        className={`w-full py-2.5 rounded-lg text-sm font-semibold text-white transition ${colors.btn} disabled:opacity-50`}
                      >
                        {purchasing === pkg.id ? 'Processing...' : 'Buy Now'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Info */}
            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">How it works</h4>
              <ul className="text-xs text-gray-600 space-y-1.5">
                <li>• <strong>10 credits</strong> are consumed per executed trade</li>
                <li>• Credits are deducted when a trade closes (SL/Target/Manual exit)</li>
                <li>• New users get <strong>1,000 free credits</strong> (100 trades)</li>
                <li>• Higher packages offer lower per-trade costs (up to 50% savings)</li>
                <li>• Credits never expire — use them at your own pace</li>
                <li>• Payments are processed securely via <strong>Razorpay</strong> (UPI/Cards/Netbanking)</li>
              </ul>
            </div>
          </div>
        ) : (
          /* History Tab */
          <div className="p-6">
            {history.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-50 text-gray-400" />
                <p>No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        entry.type === 'credit' ? 'bg-green-50' : 'bg-red-50'
                      }`}>
                        {entry.type === 'credit'
                          ? <TrendingUp className="w-4 h-4 text-green-500" />
                          : <Coins className="w-4 h-4 text-red-500" />
                        }
                      </div>
                      <div>
                        <div className="text-sm text-gray-900">{entry.description || entry.reason}</div>
                        <div className="text-xs text-gray-600">
                          {entry.created_at ? new Date(entry.created_at.endsWith?.('Z') ? entry.created_at : entry.created_at + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold ${
                        entry.type === 'credit' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {entry.type === 'credit' ? '+' : '−'}{entry.amount}
                      </div>
                      <div className="text-xs text-gray-600">bal: {entry.balance_after}</div>
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
