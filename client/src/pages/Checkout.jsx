import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import toast from 'react-hot-toast';
import api from '../api/axios';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_sample');

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '15px',
      color: '#1f2937',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      '::placeholder': { color: '#9ca3af' },
      iconColor: '#4f46e5',
    },
    invalid: { color: '#ef4444', iconColor: '#ef4444' },
  },
};

// ─── 1. UPI PAYMENT FORM COMPONENT ──────────────────────────────────────────
function UpiPaymentForm() {
  const [amount, setAmount] = useState('100.00');
  const [payerUpiId, setPayerUpiId] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  // Active UPI session state
  const [upiSession, setUpiSession] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const handleInitiateUpi = async (e) => {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents) || amountCents < 50) {
      toast.error('Enter a valid amount (minimum ₹0.50)');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/payments/upi/initiate', {
        amount: amountCents,
        payerUpiId: payerUpiId.trim() || undefined,
        description: description || 'Direct UPI Checkout',
      });

      setUpiSession(data);
      toast.success('UPI Payment initiated! Scan QR or confirm below.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to initiate UPI payment');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyUpi = async () => {
    if (!upiSession) return;
    setVerifying(true);
    try {
      const { data } = await api.post('/payments/upi/verify', {
        refId: upiSession.refId,
        payerUpiId: upiSession.payerUpiId,
      });

      setReceipt(data.transaction);
      toast.success('UPI Payment Confirmed! 🚀');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to confirm UPI payment');
    } finally {
      setVerifying(false);
    }
  };

  if (receipt) {
    return (
      <div className="text-center space-y-4 animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-3xl">
          ✅
        </div>
        <div>
          <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full uppercase">
            UPI Succeeded
          </span>
          <h3 className="text-xl font-black text-gray-900 mt-1">₹{(receipt.amount / 100).toFixed(2)} Paid</h3>
          <p className="text-xs text-gray-500">NPCI / Bank reference confirmed</p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Method</span>
            <span className="font-bold text-indigo-700">UPI (Unified Payments Interface)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Payer / Payee UPI ID</span>
            <span className="font-semibold text-gray-900">{receipt.upi_id || 'Direct UPI VPA'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">12-Digit Bank UTR</span>
            <span className="font-mono text-emerald-700 font-bold">{receipt.utr_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Reference ID</span>
            <span className="font-mono text-[10px] text-gray-500">{receipt.stripe_payment_id}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setReceipt(null);
              setUpiSession(null);
            }}
            className="btn-secondary text-xs"
          >
            New Payment
          </button>
          <Link to="/client" className="btn-primary text-xs flex items-center justify-center">
            View My Payments
          </Link>
        </div>
      </div>
    );
  }

  if (upiSession) {
    return (
      <div className="text-center space-y-4 animate-in fade-in duration-200">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-xs font-bold text-gray-700">Scan & Pay with any UPI App</span>
          <span className="text-xs font-extrabold text-indigo-600">₹{upiSession.amountRupees}</span>
        </div>

        {/* UPI QR Code */}
        <div className="p-3 bg-white border-2 border-indigo-100 rounded-2xl shadow-inner inline-block">
          <img src={upiSession.upiQrCode} alt="UPI QR Code" className="w-56 h-56 mx-auto rounded-lg" />
        </div>

        <div className="flex justify-center items-center gap-2 text-xs font-semibold text-gray-600">
          <span>GPay</span> • <span>PhonePe</span> • <span>Paytm</span> • <span>BHIM</span> • <span>Cred</span>
        </div>

        <div className="bg-indigo-50/70 rounded-xl p-3 text-xs text-left space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Receiving Merchant:</span>
            <span className="font-bold text-gray-900">{upiSession.payeeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Merchant UPI ID:</span>
            <span className="font-mono text-indigo-700 font-semibold">{upiSession.payeeUpi}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Ref ID:</span>
            <span className="font-mono text-[10px] text-gray-500">{upiSession.refId}</span>
          </div>
        </div>

        {/* Mobile tap intent */}
        <div className="space-y-2">
          <a
            href={upiSession.upiIntentUri}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl block transition-all shadow-sm"
          >
            📲 Open in UPI App (GPay / PhonePe / Paytm)
          </a>

          <button
            onClick={handleVerifyUpi}
            disabled={verifying}
            className="btn-primary text-xs"
          >
            {verifying ? 'Verifying with Bank...' : '✓ I Have Paid / Verify UPI Payment'}
          </button>

          <button
            onClick={() => setUpiSession(null)}
            className="text-xs text-gray-400 hover:text-gray-600 block mx-auto mt-2"
          >
            ← Change Amount / Edit UPI ID
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleInitiateUpi} className="space-y-4">
      <div>
        <label className="label">Amount (INR ₹)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
          <input
            type="number"
            step="0.01"
            min="0.50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-field pl-8 font-bold text-base"
            placeholder="100.00"
            required
          />
        </div>
      </div>

      <div>
        <label className="label">Your UPI ID / VPA (Optional)</label>
        <input
          type="text"
          value={payerUpiId}
          onChange={(e) => setPayerUpiId(e.target.value)}
          className="input-field font-mono text-xs"
          placeholder="e.g. yourname@oksbi or mobile@paytm"
        />
        <p className="text-[11px] text-gray-400 mt-1">
          Leave blank to scan the UPI QR code with any UPI app on your phone.
        </p>
      </div>

      <div>
        <label className="label">Payment Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input-field text-xs"
          placeholder="e.g. Service payment, Order #456"
        />
      </div>

      <button type="submit" disabled={loading} className="btn-primary mt-2">
        {loading ? 'Generating UPI Session...' : `Pay ₹${parseFloat(amount || 0).toFixed(2)} via UPI`}
      </button>

      <div className="flex items-center justify-center gap-2 pt-2 text-[11px] text-gray-400">
        <span>⚡ Instant settlement</span> • <span>NPCI UPI Certified</span>
      </div>
    </form>
  );
}

// ─── 2. CARD PAYMENT FORM COMPONENT ─────────────────────────────────────────
function CardPaymentForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [amount, setAmount] = useState('10.00');
  const [currency, setCurrency] = useState('usd');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents) || amountCents < 50) {
      toast.error('Minimum amount is $0.50 / ₹0.50');
      return;
    }

    setLoading(true);
    try {
      // 1. Create PaymentIntent on server
      const { data } = await api.post('/payments/initiate', {
        amount: amountCents,
        currency,
        description: description || 'Direct Card Payment',
      });

      // 2. If running real Stripe, confirm through Stripe.js
      if (stripe && elements && !data.isTestEngine) {
        const cardEl = elements.getElement(CardElement);
        if (cardEl) {
          const { error, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, {
            payment_method: { card: cardEl },
          });

          if (error) {
            toast.error(error.message);
            setLoading(false);
            return;
          }
        }
      }

      // 3. Confirm payment on server
      const { data: confirmed } = await api.post('/payments/confirm', {
        paymentIntentId: data.paymentIntentId,
      });

      setReceipt(confirmed.transaction);
      toast.success('Card payment confirmed! 🎉');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  if (receipt) {
    return (
      <div className="text-center space-y-4 animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-3xl">
          ✅
        </div>
        <h3 className="text-xl font-black text-gray-900">Card Payment Succeeded!</h3>
        <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Amount</span>
            <span className="font-extrabold text-gray-900 text-sm">
              ${(receipt.amount / 100).toFixed(2)} {receipt.currency.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Status</span>
            <span className="font-bold text-emerald-600 uppercase">Succeeded</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Payment Reference</span>
            <span className="font-mono text-[10px] text-gray-500 select-all">{receipt.stripe_payment_id}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setReceipt(null)} className="btn-secondary text-xs">
            Make Another
          </button>
          <Link to="/client" className="btn-primary text-xs flex items-center justify-center">
            View My Payments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount</label>
          <input
            type="number"
            step="0.01"
            min="0.50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-field"
            placeholder="10.00"
            required
          />
        </div>
        <div>
          <label className="label">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input-field">
            <option value="usd">USD ($)</option>
            <option value="inr">INR (₹)</option>
            <option value="eur">EUR (€)</option>
            <option value="gbp">GBP (£)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Card Details</label>
        <div className="input-field py-3.5 bg-white">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          🔒 Test card: <span className="font-mono font-semibold">4242 4242 4242 4242</span>
        </p>
      </div>

      <button type="submit" disabled={loading} className="btn-primary mt-2">
        {loading ? 'Processing...' : `Pay ${currency === 'inr' ? '₹' : '$'}${parseFloat(amount || 0).toFixed(2)}`}
      </button>
    </form>
  );
}

// ─── MAIN CHECKOUT PAGE ─────────────────────────────────────────────────────
export default function Checkout() {
  const [method, setMethod] = useState('upi'); // 'upi' | 'card'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/70 px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-3">
          <Link to="/client" className="text-gray-400 hover:text-gray-700 transition-colors text-xs font-semibold">
            ← Back to Portal
          </Link>
        </div>

        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-2 shadow-md shadow-indigo-200">
            <span className="text-white text-2xl">⚡</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Make a Payment</h1>
          <p className="text-gray-500 text-xs">Choose UPI ID, Scan QR, or Credit/Debit Card</p>
        </div>

        {/* Payment Method Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-2xl shadow-inner">
          <button
            type="button"
            onClick={() => setMethod('upi')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              method === 'upi' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <span>📱</span>
            <span>UPI / UPI ID / QR</span>
          </button>
          <button
            type="button"
            onClick={() => setMethod('card')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              method === 'card' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <span>💳</span>
            <span>Card (Stripe)</span>
          </button>
        </div>

        <div className="card shadow-md">
          {method === 'upi' ? (
            <UpiPaymentForm />
          ) : (
            <Elements stripe={stripePromise}>
              <CardPaymentForm />
            </Elements>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400">
          🔒 Payments secured with 2FA verification & SSL encryption
        </p>
      </div>
    </div>
  );
}
