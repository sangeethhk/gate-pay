import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
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
      iconColor: '#2563eb',
    },
    invalid: { color: '#ef4444', iconColor: '#ef4444' },
  },
};

// ─── UPI PAYMENT SECTION FOR MERCHANT LINK ──────────────────────────────────
function UpiPayLinkSection({ link, amountRupees, onPaid }) {
  const [payerUpiId, setPayerUpiId] = useState('');
  const [upiSession, setUpiSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleInitiate = async () => {
    const amountCents = Math.round(parseFloat(amountRupees) * 100);
    if (isNaN(amountCents) || amountCents < 50) {
      toast.error('Minimum amount is ₹0.50');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/payments/upi/initiate', {
        amount: amountCents,
        payerUpiId: payerUpiId.trim() || undefined,
        businessId: link.business_id,
        paymentLinkId: link.id,
        description: link.title,
      });

      setUpiSession(data);
      toast.success('UPI Payment initiated! Scan QR or tap to open UPI app.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to initiate UPI payment');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const { data } = await api.post('/payments/upi/verify', {
        refId: upiSession.refId,
        payerUpiId: upiSession.payerUpiId,
      });

      toast.success('Payment Received! Bank Reference Confirmed ✅');
      onPaid(data.transaction);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to verify UPI payment');
    } finally {
      setVerifying(false);
    }
  };

  if (upiSession) {
    return (
      <div className="text-center space-y-4 animate-in fade-in duration-200">
        <div className="p-3 bg-white border-2 border-indigo-100 rounded-2xl shadow-inner inline-block">
          <img src={upiSession.upiQrCode} alt="UPI QR Code" className="w-52 h-52 mx-auto rounded-lg" />
        </div>

        <div className="bg-indigo-50/70 rounded-xl p-3 text-xs text-left space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Merchant UPI:</span>
            <span className="font-mono text-indigo-700 font-semibold">{upiSession.payeeUpi}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Amount:</span>
            <span className="font-bold text-gray-900">₹{upiSession.amountRupees}</span>
          </div>
        </div>

        <div className="space-y-2">
          <a
            href={upiSession.upiIntentUri}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl block transition-all shadow-sm"
          >
            📲 Open in Google Pay / PhonePe / Paytm
          </a>

          <button
            onClick={handleVerify}
            disabled={verifying}
            className="btn-primary text-xs"
          >
            {verifying ? 'Verifying with Bank...' : '✓ I Have Paid / Verify Payment'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Your UPI ID / VPA (Optional)</label>
        <input
          type="text"
          value={payerUpiId}
          onChange={(e) => setPayerUpiId(e.target.value)}
          className="input-field font-mono text-xs"
          placeholder="yourname@oksbi or mobile@paytm"
        />
        <p className="text-[11px] text-gray-400 mt-1">
          Or leave blank to scan the merchant's UPI QR code.
        </p>
      </div>

      <button
        type="button"
        onClick={handleInitiate}
        disabled={loading}
        className="btn-primary text-xs bg-emerald-600 hover:bg-emerald-700"
      >
        {loading ? 'Generating UPI QR...' : `Pay ₹${parseFloat(amountRupees || 0).toFixed(2)} with UPI`}
      </button>
    </div>
  );
}

// ─── CARD PAYMENT SECTION FOR MERCHANT LINK ─────────────────────────────────
function CardPayLinkSection({ link, amount, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);

  const handleCardPay = async (e) => {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents) || amountCents < 50) {
      toast.error('Minimum amount is $0.50 / ₹0.50');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/payments/initiate', {
        amount: amountCents,
        currency: link.currency || 'usd',
        description: link.title,
        businessId: link.business_id,
        paymentLinkId: link.id,
      });

      if (stripe && elements && !data.isTestEngine) {
        const cardEl = elements.getElement(CardElement);
        if (cardEl) {
          const { error } = await stripe.confirmCardPayment(data.clientSecret, {
            payment_method: { card: cardEl },
          });
          if (error) {
            toast.error(error.message);
            setLoading(false);
            return;
          }
        }
      }

      const { data: confirmed } = await api.post('/payments/confirm', {
        paymentIntentId: data.paymentIntentId,
      });

      toast.success('Card payment confirmed!');
      onPaid(confirmed.transaction);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Payment failed. Ensure you are signed in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleCardPay} className="space-y-3">
      <div>
        <label className="label">Credit / Debit Card</label>
        <div className="input-field py-3 bg-white">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Test card: 4242 4242 4242 4242</p>
      </div>

      <button type="submit" disabled={loading} className="btn-primary text-xs">
        {loading ? 'Processing...' : 'Confirm Card Payment'}
      </button>
    </form>
  );
}

// ─── MAIN PAY LINK PAGE ─────────────────────────────────────────────────────
export default function PayLink() {
  const { slug } = useParams();
  const [link, setLink] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [method, setMethod] = useState('upi'); // 'upi' | 'card'
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLink = async () => {
      try {
        const { data } = await api.get(`/payments/link/${slug}`);
        setLink(data.link);
        if (data.link.amount) {
          setCustomAmount((data.link.amount / 100).toFixed(2));
        } else {
          setCustomAmount('100.00');
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Payment link not found');
      } finally {
        setLoading(false);
      }
    };
    fetchLink();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="card max-w-md w-full text-center space-y-3 py-10 shadow-md">
          <span className="text-4xl block">⚠️</span>
          <h2 className="text-xl font-bold text-gray-900">Payment Link Unavailable</h2>
          <p className="text-xs text-gray-500">{error || 'This payment link does not exist.'}</p>
          <Link to="/" className="btn-secondary inline-block text-xs">
            Return to Homepage
          </Link>
        </div>
      </div>
    );
  }

  if (receipt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50/60 via-white to-purple-50/60 px-4 py-12">
        <div className="card max-w-md w-full text-center space-y-4 shadow-xl">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-3xl">
            ✅
          </div>
          <h3 className="text-xl font-black text-gray-900">Payment Succeeded!</h3>
          <p className="text-xs text-gray-500">Thank you for your business with {link.business_name}.</p>

          <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Merchant</span>
              <span className="font-semibold text-gray-900">{link.business_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Item</span>
              <span className="font-semibold text-gray-900">{link.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Amount Paid</span>
              <span className="font-extrabold text-emerald-600 text-sm">
                {receipt.currency === 'inr' ? '₹' : '$'}
                {(receipt.amount / 100).toFixed(2)}
              </span>
            </div>
            {receipt.utr_number && (
              <div className="flex justify-between">
                <span className="text-gray-500">Bank UTR</span>
                <span className="font-mono text-emerald-700 font-bold">{receipt.utr_number}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Ref ID</span>
              <span className="font-mono text-[10px] text-gray-500 select-all">{receipt.stripe_payment_id}</span>
            </div>
          </div>

          <Link to="/client" className="btn-primary block text-center text-xs">
            Return to Client Portal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50/60 via-white to-purple-50/60 px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        {/* Merchant Info */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-600 text-white rounded-2xl shadow-md text-xl">
            🏢
          </div>
          <h2 className="text-sm font-semibold text-indigo-600">{link.business_name}</h2>
          <h1 className="text-2xl font-black text-gray-900">{link.title}</h1>
          {link.description && <p className="text-xs text-gray-500 max-w-xs mx-auto">{link.description}</p>}
        </div>

        {/* Amount */}
        <div className="card shadow-md space-y-4">
          <div>
            <label className="label">Amount to Pay</label>
            {link.amount ? (
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 flex justify-between items-center">
                <span className="text-xs font-semibold text-indigo-900">Fixed Total:</span>
                <span className="text-2xl font-black text-indigo-900">
                  {link.currency === 'inr' ? '₹' : '$'}
                  {(link.amount / 100).toFixed(2)} {link.currency.toUpperCase()}
                </span>
              </div>
            ) : (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                  {link.currency === 'inr' ? '₹' : '$'}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.50"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="input-field pl-8 font-bold text-lg"
                  placeholder="100.00"
                  required
                />
              </div>
            )}
          </div>

          {/* Payment Method Switcher */}
          <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner">
            <button
              type="button"
              onClick={() => setMethod('upi')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                method === 'upi' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              📱 UPI / UPI ID / QR
            </button>
            <button
              type="button"
              onClick={() => setMethod('card')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                method === 'card' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              💳 Card
            </button>
          </div>

          {method === 'upi' ? (
            <UpiPayLinkSection
              link={link}
              amountRupees={customAmount}
              onPaid={(tx) => setReceipt(tx)}
            />
          ) : (
            <Elements stripe={stripePromise}>
              <CardPayLinkSection
                link={link}
                amount={customAmount}
                onPaid={(tx) => setReceipt(tx)}
              />
            </Elements>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400">
          🛡️ PayGateway Secured Checkout • NPCI UPI & SSL Protection
        </p>
      </div>
    </div>
  );
}
