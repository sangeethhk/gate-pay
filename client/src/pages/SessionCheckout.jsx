import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';

export default function SessionCheckout() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [method, setMethod] = useState('upi'); // 'upi' | 'card'
  const [payerUpiId, setPayerUpiId] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);

  // Card fields (for session card payment)
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('123');

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      const { data } = await api.get(`/v1/public/session/${sessionId}`);
      setSession(data.session);
      if (data.session.status === 'succeeded') {
        setReceipt({
          status: 'succeeded',
          utrNumber: data.session.utrNumber,
          callbackUrl: data.session.callbackUrl,
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired checkout session');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmUpi = async () => {
    setProcessing(true);
    try {
      const { data } = await api.post(`/v1/public/session/${sessionId}/confirm-upi`, {
        payerUpiId: payerUpiId.trim() || undefined,
      });

      setReceipt(data);
      toast.success('UPI Payment confirmed! 🎉');

      // Auto redirect if callbackUrl exists
      if (data.callbackUrl) {
        setTimeout(() => {
          window.location.href = `${data.callbackUrl}?sessionId=${sessionId}&status=succeeded&utr=${data.utrNumber}`;
        }, 3000);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to verify UPI payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmCard = async (e) => {
    e.preventDefault();
    setProcessing(true);
    try {
      const { data } = await api.post(`/v1/public/session/${sessionId}/confirm-card`, {
        cardNumber,
        cardExpiry,
        cardCvc,
      });

      setReceipt(data);
      toast.success('Card payment confirmed! 🎉');

      if (data.callbackUrl) {
        setTimeout(() => {
          window.location.href = `${data.callbackUrl}?sessionId=${sessionId}&status=succeeded&ref=${data.referenceId}`;
        }, 3000);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to process card payment');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="card max-w-md w-full text-center space-y-3 py-10 shadow-md">
          <span className="text-4xl block">⚠️</span>
          <h2 className="text-xl font-bold text-gray-900">Checkout Session Expired</h2>
          <p className="text-xs text-gray-500">{error || 'This checkout session could not be found.'}</p>
          <Link to="/" className="btn-secondary inline-block text-xs">
            Return to Homepage
          </Link>
        </div>
      </div>
    );
  }

  // Success view
  if (receipt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/60 px-4 py-12">
        <div className="card max-w-md w-full text-center space-y-4 shadow-xl animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-3xl">
            ✅
          </div>
          <div>
            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full uppercase">
              Paid Succeeded
            </span>
            <h2 className="text-2xl font-black text-gray-900 mt-1">Payment Completed!</h2>
            <p className="text-xs text-gray-500">Thank you for your order with {session.merchantName}.</p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Merchant</span>
              <span className="font-semibold text-gray-900">{session.merchantName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Order Reference</span>
              <span className="font-bold text-indigo-700">{session.orderId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Amount Paid</span>
              <span className="font-extrabold text-emerald-600 text-sm">
                {session.currency === 'inr' ? '₹' : '$'}
                {(session.amount / 100).toFixed(2)} {session.currency.toUpperCase()}
              </span>
            </div>
            {receipt.utrNumber && (
              <div className="flex justify-between">
                <span className="text-gray-500">Bank UTR</span>
                <span className="font-mono text-emerald-700 font-bold">{receipt.utrNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Session ID</span>
              <span className="font-mono text-[10px] text-gray-400 break-all">{sessionId}</span>
            </div>
          </div>

          {receipt.callbackUrl ? (
            <div className="space-y-2 pt-2">
              <a
                href={`${receipt.callbackUrl}?sessionId=${sessionId}&status=succeeded&utr=${receipt.utrNumber || ''}`}
                className="btn-primary block text-center text-xs"
              >
                Return to {session.merchantName} →
              </a>
              <p className="text-[11px] text-gray-400">Redirecting automatically in 3 seconds...</p>
            </div>
          ) : (
            <Link to="/" className="btn-secondary block text-center text-xs">
              Done
            </Link>
          )}
        </div>
      </div>
    );
  }

  const amountFormatted =
    session.currency === 'inr'
      ? `₹${(session.amount / 100).toFixed(2)}`
      : `$${(session.amount / 100).toFixed(2)}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50/60 via-white to-purple-50/60 px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        {/* Merchant & Order Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-600 text-white rounded-2xl shadow-md text-xl mb-1">
            🛒
          </div>
          <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{session.merchantName}</p>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">{session.description || 'Order Checkout'}</h1>
          <p className="text-xs text-gray-400 font-mono">Order ID: {session.orderId}</p>
        </div>

        <div className="card shadow-lg border-indigo-100 space-y-4">
          {/* Price Bar */}
          <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3 flex justify-between items-center">
            <span className="text-xs font-semibold text-indigo-900">Total Payable:</span>
            <span className="text-2xl font-black text-indigo-900">
              {amountFormatted} <span className="text-xs uppercase text-indigo-600">{session.currency}</span>
            </span>
          </div>

          {/* Payment Method Selector */}
          <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner">
            <button
              type="button"
              onClick={() => setMethod('upi')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                method === 'upi' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              📱 UPI / GPay / PhonePe
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

          {/* METHOD 1: UPI PAYMENT */}
          {method === 'upi' && (
            <div className="space-y-4 text-center">
              <div className="p-3 bg-white border-2 border-indigo-100 rounded-2xl shadow-inner inline-block">
                <img src={session.upiQrCode} alt="UPI QR" className="w-52 h-52 mx-auto rounded-lg" />
              </div>

              <div className="flex justify-center items-center gap-2 text-xs font-semibold text-gray-600">
                <span>GPay</span> • <span>PhonePe</span> • <span>Paytm</span> • <span>BHIM</span>
              </div>

              <div className="bg-indigo-50/60 rounded-xl p-3 text-xs text-left space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Merchant UPI:</span>
                  <span className="font-mono text-indigo-700 font-bold">{session.payeeUpi}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount:</span>
                  <span className="font-bold text-gray-900">{amountFormatted}</span>
                </div>
              </div>

              {/* Mobile intent button */}
              <a
                href={session.upiIntentUri}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl block transition-all shadow-sm"
              >
                📲 Tap to Pay in UPI App (Mobile)
              </a>

              <div className="text-left space-y-1">
                <label className="text-[11px] font-semibold text-gray-600">Your UPI ID (Optional verification):</label>
                <input
                  type="text"
                  value={payerUpiId}
                  onChange={(e) => setPayerUpiId(e.target.value)}
                  placeholder="e.g. customer@okhdfcbank"
                  className="input-field text-xs font-mono"
                />
              </div>

              <button
                onClick={handleConfirmUpi}
                disabled={processing}
                className="btn-primary text-xs"
              >
                {processing ? 'Verifying with Bank...' : '✓ I Have Paid / Verify UPI Payment'}
              </button>
            </div>
          )}

          {/* METHOD 2: CARD PAYMENT */}
          {method === 'card' && (
            <form onSubmit={handleConfirmCard} className="space-y-3">
              <div>
                <label className="label">Card Number</label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  className="input-field font-mono text-xs"
                  placeholder="4242 4242 4242 4242"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Expiry</label>
                  <input
                    type="text"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    className="input-field font-mono text-xs"
                    placeholder="MM/YY"
                    required
                  />
                </div>
                <div>
                  <label className="label">CVC</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value)}
                    className="input-field font-mono text-xs"
                    placeholder="123"
                    required
                  />
                </div>
              </div>

              <p className="text-[11px] text-gray-400">
                🔒 Safe Test Card enabled: <span className="font-mono">4242 4242 4242 4242</span>
              </p>

              <button type="submit" disabled={processing} className="btn-primary text-xs">
                {processing ? 'Processing Card...' : `Pay ${amountFormatted}`}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400">
          🛡️ Powered by PayGateway API • 256-Bit Bank Level Encryption
        </p>
      </div>
    </div>
  );
}
