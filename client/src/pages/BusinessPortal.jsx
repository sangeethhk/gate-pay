import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import Navbar from '../components/Navbar';

const STATUS_BADGE = {
  succeeded: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  pending:   'bg-amber-100 text-amber-800 border border-amber-200',
  failed:    'bg-rose-100 text-rose-800 border border-rose-200',
};

const formatAmount = (amount, currency = 'usd') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format((amount || 0) / 100);

const formatDate = (iso) =>
  new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export default function BusinessPortal() {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [links, setLinks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [apiOrders, setApiOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Tab: 'links' | 'sales' | 'profile' | 'api'
  const [activeTab, setActiveTab] = useState('links');
  const [snippetLanguage, setSnippetLanguage] = useState('js'); // 'js' | 'curl' | 'node'

  // Create Link Modal / Form
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLink, setNewLink] = useState({
    title: '',
    description: '',
    amount: '',
    currency: 'usd',
  });
  const [submittingLink, setSubmittingLink] = useState(false);

  // Active QR View Modal
  const [selectedQr, setSelectedQr] = useState(null);

  // Edit Profile Form
  const [editProfile, setEditProfile] = useState({ name: '', website: '', description: '', upi_id: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);

  // ─── Razorpay Full Model State ──────────────────────────────────────────────
  const [razorpayData, setRazorpayData] = useState({
    orders: [],
    payments: [],
    refunds: [],
    settlements: [],
    webhooks: [],
    stats: {},
  });
  const [loadingRzp, setLoadingRzp] = useState(false);
  const [showRzpSecret, setShowRzpSecret] = useState(false);
  const [regeneratingRzpKey, setRegeneratingRzpKey] = useState(false);
  const [webhookUrlInput, setWebhookUrlInput] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testOrderAmount, setTestOrderAmount] = useState(499);
  const [lastRazorpayPayment, setLastRazorpayPayment] = useState(null);
  const [rzpSubTab, setRzpSubTab] = useState('overview'); // 'overview' | 'orders' | 'payments' | 'refunds' | 'settlements' | 'webhooks' | 'verifier'
  const [sigTool, setSigTool] = useState({ orderId: '', paymentId: '', secret: '', signature: '', result: null });
  const [refundModal, setRefundModal] = useState({ open: false, payment: null, amount: '', reason: '', loading: false });
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    loadAllData();

    // Dynamically inject Razorpay Checkout SDK script
    if (!document.getElementById('rzp-checkout-script')) {
      const script = document.createElement('script');
      script.id = 'rzp-checkout-script';
      script.src = 'http://localhost:5000/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [profRes, statsRes, linksRes, txRes] = await Promise.all([
        api.get('/business/profile'),
        api.get('/business/stats'),
        api.get('/business/payment-links'),
        api.get('/business/transactions?limit=15'),
      ]);
      setProfile(profRes.data.profile);
      setWebhookUrlInput(profRes.data.profile.webhook_url || '');
      setEditProfile({
        name: profRes.data.profile.name || '',
        website: profRes.data.profile.website || '',
        description: profRes.data.profile.description || '',
        upi_id: profRes.data.profile.upi_id || '',
      });
      setStats(statsRes.data);
      setLinks(linksRes.data.links);
      setTransactions(txRes.data.transactions);
    } catch (err) {
      toast.error('Failed to load business merchant data');
    } finally {
      setLoading(false);
    }
  };

  const loadRazorpayData = async () => {
    setLoadingRzp(true);
    try {
      const res = await api.get('/business/razorpay/data');
      setRazorpayData(res.data);
    } catch (err) {
      toast.error('Failed to load Razorpay telemetry');
    } finally {
      setLoadingRzp(false);
    }
  };

  const handleLaunchRazorpayModal = async () => {
    if (!window.Razorpay) {
      toast.error('Razorpay SDK is initializing, please try again in a moment...');
      return;
    }
    try {
      const toastId = toast.loading('Creating Razorpay order on server...');
      const basicAuth = btoa(`${profile.rzp_key_id}:${profile.rzp_key_secret}`);
      const orderRes = await fetch('http://localhost:5000/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify({
          amount: Math.round(Number(testOrderAmount) * 100),
          currency: 'INR',
          receipt: `demo_${Date.now()}`,
          notes: { source: 'Business Portal Sandbox Demo' },
        }),
      });
      const order = await orderRes.json();
      toast.dismiss(toastId);

      if (!order.id) {
        toast.error(order.error?.description || 'Failed to create order');
        return;
      }

      const rzp = new window.Razorpay({
        key: profile.rzp_key_id,
        amount: order.amount,
        currency: order.currency,
        name: profile.name || 'Merchant Store',
        description: `Order ${order.id} (Razorpay Demo)`,
        order_id: order.id,
        handler: function (response) {
          toast.success(`🎉 Payment Captured! Payment ID: ${response.razorpay_payment_id}`);
          setLastRazorpayPayment(response);
          loadRazorpayData();
        },
        prefill: {
          name: 'Ananya Sharma',
          email: 'ananya@example.com',
          contact: '+919876543210',
        },
        theme: { color: '#0f172a' },
      });
      rzp.open();
    } catch (err) {
      toast.error('Failed to start Razorpay checkout');
    }
  };

  const handleRegenerateRzpKeys = async () => {
    if (!window.confirm('Regenerate Razorpay credentials? Existing website integrations will need the new Key ID & Secret.')) return;
    setRegeneratingRzpKey(true);
    try {
      const res = await api.post('/business/regenerate-rzp-keys');
      setProfile({
        ...profile,
        rzp_key_id: res.data.rzpKeyId,
        rzp_key_secret: res.data.rzpKeySecret,
      });
      toast.success('New Razorpay credentials generated!');
    } catch (err) {
      toast.error('Failed to regenerate credentials');
    } finally {
      setRegeneratingRzpKey(false);
    }
  };

  const handleSaveWebhook = async (regenerateSecret = false) => {
    setSavingWebhook(true);
    try {
      const res = await api.post('/business/webhook-config', {
        webhookUrl: webhookUrlInput,
        regenerateSecret,
      });
      setProfile({
        ...profile,
        webhook_url: res.data.webhookUrl,
        webhook_secret: res.data.webhookSecret,
      });
      toast.success(res.data.message);
    } catch (err) {
      toast.error('Failed to update webhook config');
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleVerifySignature = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:5000/v1/signature/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: sigTool.orderId,
          paymentId: sigTool.paymentId,
          signature: sigTool.signature,
          secret: sigTool.secret || profile?.rzp_key_secret,
        }),
      });
      const data = await res.json();
      setSigTool((prev) => ({ ...prev, result: data }));
    } catch (err) {
      toast.error('Signature verification API call failed');
    }
  };

  const handleProcessRefund = async (e) => {
    e.preventDefault();
    if (!refundModal.payment) return;
    setRefundModal((prev) => ({ ...prev, loading: true }));
    try {
      const res = await api.post('/business/razorpay/refund', {
        paymentId: refundModal.payment.id,
        amount: refundModal.amount ? Math.round(Number(refundModal.amount) * 100) : undefined,
        reason: refundModal.reason,
      });
      toast.success(res.data.message);
      setRefundModal({ open: false, payment: null, amount: '', reason: '', loading: false });
      loadRazorpayData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to process refund');
      setRefundModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleSettleBalance = async () => {
    setSettling(true);
    try {
      const res = await api.post('/business/razorpay/settle');
      toast.success(`🎉 Settlement complete! ₹${(res.data.amountSettled / 100).toFixed(2)} transferred. UTR: ${res.data.utr}`);
      loadRazorpayData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No funds available to settle');
    } finally {
      setSettling(false);
    }
  };

  const handleCreateLink = async (e) => {
    e.preventDefault();
    if (!newLink.title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    setSubmittingLink(true);
    try {
      const payload = {
        title: newLink.title.trim(),
        description: newLink.description.trim(),
        currency: newLink.currency,
        amount: newLink.amount ? Math.round(parseFloat(newLink.amount) * 100) : null,
      };

      const { data } = await api.post('/business/payment-links', payload);
      toast.success('Payment link & QR code generated! 🎉');
      setLinks([data.link, ...links]);
      setShowCreateModal(false);
      setNewLink({ title: '', description: '', amount: '', currency: 'usd' });
      setSelectedQr(data.link); // show the QR right away
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create payment link');
    } finally {
      setSubmittingLink(false);
    }
  };

  const handleToggleLink = async (id) => {
    try {
      const { data } = await api.patch(`/business/payment-links/${id}/toggle`);
      setLinks(links.map((l) => (l.id === id ? { ...l, is_active: data.link.is_active } : l)));
      toast.success(`Link ${data.link.is_active ? 'activated' : 'paused'}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDeleteLink = async (id) => {
    if (!window.confirm('Are you sure you want to delete this payment link?')) return;
    try {
      await api.delete(`/business/payment-links/${id}`);
      setLinks(links.filter((l) => l.id !== id));
      toast.success('Payment link deleted');
    } catch {
      toast.error('Failed to delete payment link');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { data } = await api.put('/business/profile', editProfile);
      setProfile(data.profile);
      toast.success('Business profile updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'api') {
      fetchApiOrders();
    }
  }, [activeTab]);

  const fetchApiOrders = async () => {
    try {
      const { data } = await api.get('/business/api-orders');
      setApiOrders(data.orders || []);
    } catch {}
  };

  const handleRegenerateApiKey = async () => {
    if (
      !window.confirm(
        'Regenerate API Key? Any external website or app using your old API key will stop functioning until updated.'
      )
    )
      return;
    setRegeneratingKey(true);
    try {
      const { data } = await api.post('/business/regenerate-api-key');
      setProfile((prev) => ({ ...prev, api_key: data.apiKey, api_secret: data.apiSecret }));
      toast.success('New API Key generated successfully! 🎉');
    } catch {
      toast.error('Failed to regenerate API key');
    } finally {
      setRegeneratingKey(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/60 pb-16">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-950/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold">
              <span>🏢</span>
              <span>Merchant Business Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {profile?.name || 'My Merchant Store'}
            </h1>
            <p className="text-blue-100 text-sm max-w-lg">
              {profile?.description || 'Accept payments, generate dynamic QR codes, and track customer purchases.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2.5 bg-white text-blue-900 hover:bg-blue-50 font-bold text-sm rounded-xl transition-all shadow-sm flex items-center gap-2"
            >
              <span>+</span>
              <span>New Payment Link & QR</span>
            </button>
          </div>
        </div>

        {/* Financial Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card shadow-xs border-blue-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gross Revenue</p>
            <p className="text-2xl font-black text-gray-900 mt-2">
              {formatAmount(stats?.totalRevenue || 0)}
            </p>
            <p className="text-[11px] text-emerald-600 font-medium mt-1">✓ Processed through Stripe</p>
          </div>

          <div className="card shadow-xs">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Inbound Sales</p>
            <p className="text-2xl font-black text-gray-900 mt-2">{stats?.totalTransactions || 0}</p>
            <p className="text-[11px] text-gray-500 mt-1">Paid customer orders</p>
          </div>

          <div className="card shadow-xs">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Payment Links</p>
            <p className="text-2xl font-black text-blue-600 mt-2">{stats?.activeLinks || 0}</p>
            <p className="text-[11px] text-blue-600 mt-1">Live QR codes in circulation</p>
          </div>

          <div className="card shadow-xs">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pending Orders</p>
            <p className="text-2xl font-black text-amber-500 mt-2">{stats?.pendingCount || 0}</p>
            <p className="text-[11px] text-amber-600 mt-1">Checkouts in progress</p>
          </div>
        </div>

        {/* Portal Tabs */}
        <div className="flex border-b border-gray-200 gap-6">
          <button
            onClick={() => setActiveTab('links')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'links'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            🔗 Payment Links & QR Codes ({links.length})
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'sales'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            📊 Inbound Customer Sales ({transactions.length})
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'profile'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            ⚙️ Business Settings
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'api'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            🔌 Developer API & Integration
          </button>
          <button
            onClick={() => {
              setActiveTab('razorpay');
              loadRazorpayData();
            }}
            className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'razorpay'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <span className="text-base">⚡</span> Razorpay Full Model
          </button>
        </div>

        {/* TAB 1: Payment Links & QR Codes */}
        {activeTab === 'links' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Payment Links & Counter QR Codes</h3>
                <p className="text-xs text-gray-500">
                  Customers can scan these QR codes in person or open the link to pay securely.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary w-auto text-xs py-2 px-4 bg-blue-600 hover:bg-blue-700"
              >
                + Create Link / QR
              </button>
            </div>

            {loading ? (
              <div className="py-16 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : links.length === 0 ? (
              <div className="card text-center py-16 text-gray-400 space-y-3">
                <span className="text-4xl block">📱</span>
                <p className="font-bold text-gray-700">No payment links created yet</p>
                <p className="text-xs max-w-sm mx-auto">
                  Create a payment link for a product, invoice, or invoice amount to generate an instant QR code.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary w-auto px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 inline-block"
                >
                  Create First Link & QR
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {links.map((link) => (
                  <div key={link.id} className="card shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-extrabold text-gray-900 text-sm">{link.title}</h4>
                          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                            {link.description || 'Quick merchant checkout link'}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            link.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {link.is_active ? 'Live' : 'Paused'}
                        </span>
                      </div>

                      {/* Pricing Tag */}
                      <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-medium">Price:</span>
                        <span className="font-extrabold text-gray-900 text-base">
                          {link.amount ? formatAmount(link.amount, link.currency) : 'Customer specified'}
                        </span>
                      </div>

                      {/* Quick QR display */}
                      <div className="flex items-center gap-3 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100/60">
                        <img src={link.qrCode} alt="Link QR" className="w-14 h-14 rounded-lg border bg-white" />
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold text-blue-900">Scan to Pay</p>
                          <button
                            onClick={() => setSelectedQr(link)}
                            className="text-xs font-bold text-blue-600 hover:underline block"
                          >
                            View Large QR Code ↗
                          </button>
                        </div>
                      </div>

                      <div className="text-[11px] text-gray-400 flex justify-between">
                        <span>{link.total_payments || 0} payments collected</span>
                        <span className="font-semibold text-gray-700">{formatAmount(link.revenue || 0)}</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100 mt-4 flex items-center justify-between gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(link.payUrl);
                          toast.success('Payment URL copied to clipboard!');
                        }}
                        className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1"
                      >
                        📋 Copy Link
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleLink(link.id)}
                          className="text-xs font-semibold text-blue-600 hover:underline"
                        >
                          {link.is_active ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleDeleteLink(link.id)}
                          className="text-xs font-semibold text-rose-500 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Inbound Customer Sales */}
        {activeTab === 'sales' && (
          <div className="card shadow-xs">
            <h3 className="font-bold text-gray-900 text-base mb-1">Customer Payments Received</h3>
            <p className="text-xs text-gray-500 mb-5">Transactions paid to your business via direct payments or QR code links</p>

            {transactions.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="font-semibold text-gray-700">No customer sales recorded yet</p>
                <p className="text-xs mt-1">When customers scan your QR code and complete checkout, transactions will appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="pb-3 pr-4 font-semibold">Date</th>
                      <th className="pb-3 pr-4 font-semibold">Customer</th>
                      <th className="pb-3 pr-4 font-semibold">Product / Link</th>
                      <th className="pb-3 pr-4 font-semibold">Amount</th>
                      <th className="pb-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="py-3.5 pr-4 text-xs text-gray-500 whitespace-nowrap">
                          {formatDate(tx.created_at)}
                        </td>
                        <td className="py-3.5 pr-4 font-semibold text-gray-900 text-xs">
                          {tx.customer_email}
                        </td>
                        <td className="py-3.5 pr-4 text-xs text-gray-600">
                          {tx.link_title || tx.description || 'Direct Payment'}
                        </td>
                        <td className="py-3.5 pr-4 font-bold text-gray-900 text-xs">
                          {formatAmount(tx.amount, tx.currency)}
                        </td>
                        <td className="py-3.5">
                          <span className={`px-2 py-0.5 text-[11px] font-bold rounded ${STATUS_BADGE[tx.status]}`}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Business Settings */}
        {activeTab === 'profile' && (
          <div className="card shadow-xs max-w-2xl">
            <h3 className="font-bold text-gray-900 text-base mb-1">Merchant Profile Settings</h3>
            <p className="text-xs text-gray-500 mb-5">These details appear on your public checkout page and QR codes</p>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="label">Business Name *</label>
                <input
                  type="text"
                  value={editProfile.name}
                  onChange={(e) => setEditProfile({ ...editProfile, name: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="label">Website</label>
                <input
                  type="url"
                  value={editProfile.website}
                  onChange={(e) => setEditProfile({ ...editProfile, website: e.target.value })}
                  className="input-field"
                  placeholder="https://yourstore.com"
                />
              </div>

              <div>
                <label className="label">Receiving UPI ID / VPA (Optional)</label>
                <input
                  type="text"
                  value={editProfile.upi_id || ''}
                  onChange={(e) => setEditProfile({ ...editProfile, upi_id: e.target.value })}
                  className="input-field font-mono text-xs"
                  placeholder="e.g. yourstore@okaxis or 9876543210@paytm"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Customers paying via UPI ID or scanning your counter QR code will settle to this VPA.
                </p>
              </div>

              <div>
                <label className="label">Store Description / Tagline</label>
                <textarea
                  rows={3}
                  value={editProfile.description}
                  onChange={(e) => setEditProfile({ ...editProfile, description: e.target.value })}
                  className="input-field"
                  placeholder="Describe your goods or services..."
                />
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="btn-primary w-auto px-6 py-2.5 text-xs bg-blue-600 hover:bg-blue-700"
              >
                {savingProfile ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: Developer API & Website Integration */}
        {activeTab === 'api' && (
          <div className="space-y-6 max-w-5xl">
            {/* API Credentials Card */}
            <div className="card shadow-xs border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🔑</span>
                    <h3 className="font-extrabold text-gray-900 text-base">Website Payment API Credentials</h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Use these credentials to accept payments on your custom website, Shopify, WordPress, or mobile app.
                  </p>
                </div>
                <button
                  onClick={handleRegenerateApiKey}
                  disabled={regeneratingKey}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors w-fit"
                >
                  {regeneratingKey ? 'Regenerating...' : '⚠️ Regenerate API Keys'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                <div>
                  <label className="label">Live Merchant API Key (Public / Client-side safe)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={profile?.api_key || 'Generating...'}
                      className="input-field bg-gray-50 font-mono text-xs select-all text-indigo-900 font-bold"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(profile?.api_key || '');
                        toast.success('API Key copied to clipboard!');
                      }}
                      className="px-3 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl whitespace-nowrap"
                    >
                      📋 Copy
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label">API Secret (Keep private on your server)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      readOnly
                      value={profile?.api_secret || 'sec_live_********************'}
                      className="input-field bg-gray-50 font-mono text-xs select-all text-gray-600"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(profile?.api_secret || '');
                        toast.success('API Secret copied!');
                      }}
                      className="px-3 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl whitespace-nowrap"
                    >
                      📋 Copy
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-6 text-xs text-gray-500">
                <div>
                  <span className="font-semibold text-gray-700">API Endpoint Base:</span>{' '}
                  <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-indigo-600">
                    http://localhost:5000/api/v1
                  </code>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Supported Currencies:</span> INR (₹), USD ($), EUR (€), GBP (£)
                </div>
              </div>
            </div>

            {/* Code Integration Walkthrough */}
            <div className="card shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <h4 className="font-extrabold text-gray-900 text-sm">Add Payment to Your Website in 30 Seconds</h4>
                  <p className="text-xs text-gray-500">Choose your preferred integration method</p>
                </div>

                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button
                    onClick={() => setSnippetLanguage('js')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      snippetLanguage === 'js' ? 'bg-white text-indigo-700 shadow-xs' : 'text-gray-500'
                    }`}
                  >
                    🌟 1-Line Drop-In SDK
                  </button>
                  <button
                    onClick={() => setSnippetLanguage('node')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      snippetLanguage === 'node' ? 'bg-white text-indigo-700 shadow-xs' : 'text-gray-500'
                    }`}
                  >
                    Node.js / Express
                  </button>
                  <button
                    onClick={() => setSnippetLanguage('curl')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      snippetLanguage === 'curl' ? 'bg-white text-indigo-700 shadow-xs' : 'text-gray-500'
                    }`}
                  >
                    cURL REST API
                  </button>
                </div>
              </div>

              {/* SNIPPET 1: Drop-In JavaScript SDK */}
              {snippetLanguage === 'js' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-600">
                    Paste this snippet directly into any HTML page, WordPress, or e-commerce site to display an instant <strong>Pay with UPI / Card</strong> checkout modal:
                  </p>
                  <div className="relative">
                    <pre className="bg-slate-900 text-slate-100 rounded-2xl p-4 text-xs font-mono overflow-x-auto">
{`<!-- 1. Include PayGateway JavaScript SDK -->
<script src="http://localhost:5000/sdk/paygateway.js"></script>

<!-- 2. Pay Button (Triggers UPI QR & Card Checkout) -->
<button onclick="payWithPayGateway()" style="padding:12px 24px;background:#4f46e5;color:#fff;border-radius:12px;border:none;font-weight:bold;cursor:pointer;">
  Pay ₹499 with UPI / Card
</button>

<script>
function payWithPayGateway() {
  PayGateway.checkout({
    apiKey: "${profile?.api_key || 'pg_live_your_api_key'}",
    amount: 499.00,
    currency: "INR",
    orderId: "ORDER_" + Date.now(),
    description: "Website Purchase - T-Shirt",
    customerEmail: "customer@example.com",
    mode: "modal", // "modal" popup or "redirect"
    callbackUrl: window.location.href,
  });
}
</script>`}
                    </pre>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`<!-- Include PayGateway SDK -->\n<script src="http://localhost:5000/sdk/paygateway.js"></script>\n<button onclick="PayGateway.checkout({ apiKey: '${profile?.api_key}', amount: 499, currency: 'INR', description: 'Website Order' })">Pay ₹499 with UPI / Card</button>`);
                        toast.success('HTML snippet copied to clipboard!');
                      }}
                      className="absolute top-3 right-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
                    >
                      📋 Copy Snippet
                    </button>
                  </div>
                </div>
              )}

              {/* SNIPPET 2: Node.js Backend */}
              {snippetLanguage === 'node' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-600">
                    Create a checkout session from your Node.js / Express backend server:
                  </p>
                  <div className="relative">
                    <pre className="bg-slate-900 text-slate-100 rounded-2xl p-4 text-xs font-mono overflow-x-auto">
{`// server.js (Node.js backend)
const response = await fetch("http://localhost:5000/api/v1/checkout/sessions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "${profile?.api_key || 'pg_live_your_api_key'}"
  },
  body: JSON.stringify({
    amount: 150000,                  // ₹1,500.00 (in paise)
    currency: "inr",
    orderId: "ORDER_9941",
    description: "Annual Subscription",
    customerEmail: "john@example.com",
    callbackUrl: "https://yourwebsite.com/orders/success"
  })
});

const session = await response.json();
console.log("Redirect customer to:", session.checkoutUrl);
console.log("UPI Intent URI:", session.upiIntentUri);`}
                    </pre>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`const res = await fetch("http://localhost:5000/api/v1/checkout/sessions", {\n  method: "POST",\n  headers: { "Content-Type": "application/json", "x-api-key": "${profile?.api_key}" },\n  body: JSON.stringify({ amount: 50000, currency: "inr", orderId: "ORD_123" })\n});\nconst data = await res.json();\nconsole.log(data.checkoutUrl);`);
                        toast.success('Node.js code copied!');
                      }}
                      className="absolute top-3 right-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
                    >
                      📋 Copy Code
                    </button>
                  </div>
                </div>
              )}

              {/* SNIPPET 3: cURL Command */}
              {snippetLanguage === 'curl' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-600">
                    Test your API key right from your terminal with cURL:
                  </p>
                  <div className="relative">
                    <pre className="bg-slate-900 text-slate-100 rounded-2xl p-4 text-xs font-mono overflow-x-auto">
{`curl -X POST http://localhost:5000/api/v1/checkout/sessions \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${profile?.api_key || 'pg_live_your_api_key'}" \\
  -d '{
    "amount": 25000,
    "currency": "inr",
    "orderId": "CLI_TEST_01",
    "description": "Terminal API Test"
  }'`}
                    </pre>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`curl -X POST http://localhost:5000/api/v1/checkout/sessions -H "Content-Type: application/json" -H "x-api-key: ${profile?.api_key}" -d '{"amount": 25000, "currency": "inr", "orderId": "TEST_01"}'`);
                        toast.success('cURL command copied!');
                      }}
                      className="absolute top-3 right-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
                    >
                      📋 Copy cURL
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* API Orders Table */}
            <div className="card shadow-xs">
              <h4 className="font-extrabold text-gray-900 text-sm mb-1">External Website API Orders ({apiOrders.length})</h4>
              <p className="text-xs text-gray-500 mb-4">
                Real-time stream of checkouts created from your connected websites and applications
              </p>

              {apiOrders.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <span className="text-3xl block mb-2">⚡</span>
                  <p className="font-semibold text-gray-700">No API orders yet</p>
                  <p className="text-xs mt-1">
                    Use your API key above to initiate your first checkout session from your website.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                        <th className="pb-3 pr-4 font-semibold">Date</th>
                        <th className="pb-3 pr-4 font-semibold">Order ID</th>
                        <th className="pb-3 pr-4 font-semibold">Customer</th>
                        <th className="pb-3 pr-4 font-semibold">Amount</th>
                        <th className="pb-3 pr-4 font-semibold">Method</th>
                        <th className="pb-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {apiOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="py-3.5 pr-4 text-xs text-gray-500 whitespace-nowrap">
                            {formatDate(ord.created_at)}
                          </td>
                          <td className="py-3.5 pr-4 font-mono text-xs font-semibold text-indigo-700">
                            {ord.order_id}
                          </td>
                          <td className="py-3.5 pr-4 text-xs text-gray-700">
                            {ord.customer_email || '—'}
                          </td>
                          <td className="py-3.5 pr-4 font-bold text-gray-900 text-xs">
                            {formatAmount(ord.amount, ord.currency)}
                          </td>
                          <td className="py-3.5 pr-4 text-xs font-semibold text-gray-600">
                            {ord.payment_method === 'upi' ? '📱 UPI' : ord.payment_method === 'card' ? '💳 Card' : '—'}
                          </td>
                          <td className="py-3.5">
                            <span className={`px-2 py-0.5 text-[11px] font-bold rounded ${STATUS_BADGE[ord.status]}`}>
                              {ord.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: Razorpay Full Model & Sandbox */}
        {activeTab === 'razorpay' && (
          <div className="space-y-6">
            {/* Header Banner */}
            <div className="card bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden border border-indigo-900/50">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-400/40">
                      Razorpay Full Architecture
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      ● Active & 100% Compatible
                    </span>
                  </div>
                  <h3 className="text-xl md:text-2xl font-black tracking-tight text-white">
                    Razorpay Standard Checkout & REST API Engine
                  </h3>
                  <p className="text-xs text-indigo-200 mt-1 max-w-2xl leading-relaxed">
                    Complete Razorpay drop-in replacement. Supports standard <code className="text-amber-300">order_...</code>, <code className="text-sky-300">pay_...</code>, and <code className="text-emerald-300">rfnd_...</code> entities, HMAC-SHA256 signatures, webhook event dispatcher, and the iconic <code className="text-pink-300">new Razorpay(options).open()</code> checkout popup.
                  </p>
                </div>
                <button
                  onClick={loadRazorpayData}
                  disabled={loadingRzp}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white transition-all shadow-md shrink-0"
                >
                  {loadingRzp ? 'Syncing...' : '🔄 Sync Telemetry'}
                </button>
              </div>
            </div>

            {/* Credentials & Webhook Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* API Credentials Card */}
              <div className="card space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">🔑 Razorpay API Credentials</h4>
                    <p className="text-xs text-gray-500">Pass via HTTP Basic Auth or headers for Orders & Payments</p>
                  </div>
                  <button
                    onClick={handleRegenerateRzpKeys}
                    disabled={regeneratingRzpKey}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                  >
                    {regeneratingRzpKey ? 'Regenerating...' : '🔄 Regenerate'}
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="label">Key ID (Public)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={profile?.rzp_key_id || 'Generating...'}
                        className="input-field font-mono text-xs bg-gray-50 select-all"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(profile?.rzp_key_id || '');
                          toast.success('Key ID copied!');
                        }}
                        className="btn-secondary text-xs px-3"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="label mb-0">Key Secret (Private)</label>
                      <button
                        onClick={() => setShowRzpSecret(!showRzpSecret)}
                        className="text-[11px] text-gray-500 hover:text-gray-800 font-semibold"
                      >
                        {showRzpSecret ? 'Hide' : 'Reveal'}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type={showRzpSecret ? 'text' : 'password'}
                        readOnly
                        value={profile?.rzp_key_secret || '••••••••••••••••'}
                        className="input-field font-mono text-xs bg-gray-50"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(profile?.rzp_key_secret || '');
                          toast.success('Key Secret copied!');
                        }}
                        className="btn-secondary text-xs px-3"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Webhook Configuration Card */}
              <div className="card space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">🔔 Webhook Notifications & Signature</h4>
                    <p className="text-xs text-gray-500">Instant POST events signed with HMAC-SHA256</p>
                  </div>
                  <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded">
                    X-Razorpay-Signature
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="label">Webhook Endpoint URL</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={webhookUrlInput}
                        onChange={(e) => setWebhookUrlInput(e.target.value)}
                        placeholder="https://yourstore.com/api/razorpay/webhook"
                        className="input-field text-xs font-mono"
                      />
                      <button
                        onClick={() => handleSaveWebhook(false)}
                        disabled={savingWebhook}
                        className="btn-primary text-xs bg-indigo-600 hover:bg-indigo-700 px-4"
                      >
                        {savingWebhook ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="label mb-0">Webhook Secret</label>
                      <button
                        onClick={() => handleSaveWebhook(true)}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
                      >
                        Regenerate Secret
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={profile?.webhook_secret || 'whsec_...'}
                        className="input-field font-mono text-xs bg-gray-50 select-all"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(profile?.webhook_secret || '');
                          toast.success('Webhook secret copied!');
                        }}
                        className="btn-secondary text-xs px-3"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Live Checkout Sandbox */}
            <div className="card bg-linear-to-b from-indigo-50/50 to-white border-2 border-indigo-100 p-6 space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                    <span>🚀</span> Interactive Live Razorpay Checkout Modal
                  </h4>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Test the complete user experience! This creates a real <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono text-indigo-700">order_...</code> on your backend and executes <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono text-indigo-700">new Razorpay(options).open()</code>.
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className="flex items-center bg-white border border-gray-300 rounded-xl px-3 py-1.5 shadow-xs">
                    <span className="text-gray-500 font-bold text-sm mr-1">₹</span>
                    <input
                      type="number"
                      min="1"
                      value={testOrderAmount}
                      onChange={(e) => setTestOrderAmount(e.target.value)}
                      className="w-20 font-bold text-sm focus:outline-hidden"
                    />
                  </div>

                  <button
                    onClick={handleLaunchRazorpayModal}
                    className="btn-primary w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 px-5 shadow-md flex items-center justify-center gap-2"
                  >
                    <span>⚡</span> Launch Razorpay Checkout
                  </button>
                </div>
              </div>

              {/* Last Checkout Success Alert */}
              {lastRazorpayPayment && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl animate-in fade-in duration-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-700 font-bold text-sm">✅ Payment Completed & Verified:</span>
                      <span className="font-mono text-xs text-emerald-900 bg-emerald-100/80 px-2 py-0.5 rounded">
                        {lastRazorpayPayment.razorpay_payment_id}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-200/60 px-2 py-0.5 rounded-full">
                      Signature Verified
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono text-gray-700 bg-white p-3 rounded-xl border border-emerald-100">
                    <div>
                      <span className="text-gray-400">Order ID: </span>
                      <span className="font-bold">{lastRazorpayPayment.razorpay_order_id}</span>
                    </div>
                    <div className="truncate">
                      <span className="text-gray-400">HMAC-SHA256: </span>
                      <span className="font-bold text-indigo-700">{lastRazorpayPayment.razorpay_signature}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Financial Telemetry Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card shadow-xs">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gross Captured</p>
                <p className="text-2xl font-black text-gray-900 mt-2">
                  ₹{((razorpayData.stats?.totalCaptured || 0) / 100).toFixed(2)}
                </p>
                <p className="text-[11px] text-emerald-600 mt-1">Total settled transactions</p>
              </div>

              <div className="card shadow-xs">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Platform Fee</p>
                <p className="text-2xl font-black text-emerald-600 mt-2">
                  ₹0.00
                </p>
                <p className="text-[11px] text-emerald-600 mt-1">0% Free — Zero deduction</p>
              </div>

              <div className="card shadow-xs">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Refunded</p>
                <p className="text-2xl font-black text-rose-500 mt-2">
                  ₹{((razorpayData.stats?.totalRefunded || 0) / 100).toFixed(2)}
                </p>
                <p className="text-[11px] text-rose-600 mt-1">Reversed to customer</p>
              </div>

              <div className="card shadow-xs">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Net Settled</p>
                <p className="text-2xl font-black text-emerald-600 mt-2">
                  ₹{((razorpayData.stats?.netRevenue || 0) / 100).toFixed(2)}
                </p>
                <p className="text-[11px] text-emerald-600 mt-1">Available for payout</p>
              </div>
            </div>

            {/* Sub-Tabs: Orders, Payments, Refunds, Settlements, Webhooks, Verifier */}
            <div className="space-y-4">
              <div className="flex border-b border-gray-200 gap-4 overflow-x-auto pb-1">
                {[
                  { id: 'orders', label: `📦 Orders (${razorpayData.orders.length})` },
                  { id: 'payments', label: `💳 Payments (${razorpayData.payments.length})` },
                  { id: 'refunds', label: `🔄 Refunds (${razorpayData.refunds.length})` },
                  { id: 'settlements', label: `🏛️ Settlements (${razorpayData.settlements.length})` },
                  { id: 'webhooks', label: `🔔 Webhooks (${razorpayData.webhooks.length})` },
                  { id: 'verifier', label: '🛡️ Signature Verifier' },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setRzpSubTab(st.id)}
                    className={`pb-2.5 text-xs font-bold transition-all whitespace-nowrap border-b-2 ${
                      rzpSubTab === st.id
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Sub-Tab 1: Orders */}
              {rzpSubTab === 'orders' && (
                <div className="card overflow-x-auto">
                  {razorpayData.orders.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <span className="text-3xl block">📦</span>
                      <p className="font-bold text-sm text-gray-600 mt-2">No Razorpay orders created yet</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Orders created via POST /v1/orders will appear here automatically.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="pb-3">Order ID</th>
                          <th className="pb-3">Receipt</th>
                          <th className="pb-3">Amount</th>
                          <th className="pb-3">Paid</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-mono">
                        {razorpayData.orders.map((ord) => (
                          <tr key={ord.id} className="hover:bg-gray-50/80">
                            <td className="py-3 font-bold text-indigo-700">{ord.id}</td>
                            <td className="py-3 text-gray-600">{ord.receipt || '—'}</td>
                            <td className="py-3 font-bold text-gray-900">₹{(ord.amount / 100).toFixed(2)}</td>
                            <td className="py-3 text-emerald-600">₹{(ord.amount_paid / 100).toFixed(2)}</td>
                            <td className="py-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  ord.status === 'paid'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {ord.status}
                              </span>
                            </td>
                            <td className="py-3 text-gray-400 font-sans">{formatDate(ord.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Sub-Tab 2: Payments */}
              {rzpSubTab === 'payments' && (
                <div className="card overflow-x-auto">
                  {razorpayData.payments.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <span className="text-3xl block">💳</span>
                      <p className="font-bold text-sm text-gray-600 mt-2">No captured payments yet</p>
                      <p className="text-xs text-gray-400 mt-1">Launch the Sandbox Checkout to make a test payment.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="pb-3">Payment ID</th>
                          <th className="pb-3">Order ID</th>
                          <th className="pb-3">Amount</th>
                          <th className="pb-3">Method</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-mono">
                        {razorpayData.payments.map((p) => (
                          <tr key={p.id} className="hover:bg-gray-50/80">
                            <td className="py-3 font-bold text-gray-900">{p.id}</td>
                            <td className="py-3 text-indigo-600">{p.order_id || '—'}</td>
                            <td className="py-3 font-bold text-emerald-700">₹{(p.amount / 100).toFixed(2)}</td>
                            <td className="py-3 uppercase text-[11px] font-semibold text-gray-600">{p.method}</td>
                            <td className="py-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  p.status === 'captured'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : p.status === 'refunded'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>
                            <td className="py-3 font-sans">
                              {p.status === 'captured' && (
                                <button
                                  onClick={() =>
                                    setRefundModal({
                                      open: true,
                                      payment: p,
                                      amount: (p.amount / 100).toString(),
                                      reason: 'Customer return',
                                      loading: false,
                                    })
                                  }
                                  className="text-xs text-rose-600 hover:text-rose-800 font-bold underline"
                                >
                                  Refund
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Sub-Tab 3: Refunds */}
              {rzpSubTab === 'refunds' && (
                <div className="card overflow-x-auto">
                  {razorpayData.refunds.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <span className="text-3xl block">🔄</span>
                      <p className="font-bold text-sm text-gray-600 mt-2">No refunds issued</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="pb-3">Refund ID</th>
                          <th className="pb-3">Payment ID</th>
                          <th className="pb-3">Amount</th>
                          <th className="pb-3">Speed</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-mono">
                        {razorpayData.refunds.map((r) => (
                          <tr key={r.id} className="hover:bg-gray-50/80">
                            <td className="py-3 font-bold text-rose-600">{r.id}</td>
                            <td className="py-3 text-gray-600">{r.payment_id}</td>
                            <td className="py-3 font-bold text-rose-700">₹{(r.amount / 100).toFixed(2)}</td>
                            <td className="py-3 capitalize text-gray-600">{r.speed}</td>
                            <td className="py-3">
                              <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[10px] font-bold">
                                {r.status}
                              </span>
                            </td>
                            <td className="py-3 text-gray-400 font-sans">{formatDate(r.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Sub-Tab 4: Settlements */}
              {rzpSubTab === 'settlements' && (
                <div className="space-y-4">
                  <div className="card bg-linear-to-r from-emerald-50 to-white border border-emerald-200 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h4 className="font-bold text-emerald-950 text-sm">🏛️ Instant Merchant Settlement</h4>
                      <p className="text-xs text-emerald-800 mt-0.5">
                        Transfer settled funds directly to your linked bank account or UPI VPA (
                        {profile?.upi_id || '9400213739@superyes'}).
                      </p>
                    </div>
                    <button
                      onClick={handleSettleBalance}
                      disabled={settling}
                      className="btn-primary w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-4 shadow-sm"
                    >
                      {settling ? 'Processing Payout...' : '⚡ Settle Funds Now'}
                    </button>
                  </div>

                  <div className="card overflow-x-auto">
                    {razorpayData.settlements.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <span className="text-3xl block">🏛️</span>
                        <p className="font-bold text-sm text-gray-600 mt-2">No past settlements yet</p>
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                            <th className="pb-3">Settlement ID</th>
                            <th className="pb-3">Net Transferred</th>
                            <th className="pb-3">Bank UTR</th>
                            <th className="pb-3">Status</th>
                            <th className="pb-3">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-mono">
                          {razorpayData.settlements.map((s) => (
                            <tr key={s.id} className="hover:bg-gray-50/80">
                              <td className="py-3 font-bold text-indigo-700">{s.id}</td>
                              <td className="py-3 font-bold text-emerald-700">₹{(s.amount / 100).toFixed(2)}</td>
                              <td className="py-3 text-gray-800">{s.utr}</td>
                              <td className="py-3">
                                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">
                                  {s.status}
                                </span>
                              </td>
                              <td className="py-3 text-gray-400 font-sans">{formatDate(s.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* Sub-Tab 5: Webhooks Log */}
              {rzpSubTab === 'webhooks' && (
                <div className="card overflow-x-auto">
                  {razorpayData.webhooks.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <span className="text-3xl block">🔔</span>
                      <p className="font-bold text-sm text-gray-600 mt-2">No webhook deliveries logged</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Configure a Webhook URL above, and all payment events will be logged here.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="pb-3">Event</th>
                          <th className="pb-3">Signature (HMAC-SHA256)</th>
                          <th className="pb-3">Response Code</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3">Dispatched At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-mono text-[11px]">
                        {razorpayData.webhooks.map((w) => (
                          <tr key={w.id} className="hover:bg-gray-50/80">
                            <td className="py-3 font-bold text-indigo-700">{w.event}</td>
                            <td className="py-3 text-gray-500 truncate max-w-xs">{w.signature}</td>
                            <td className="py-3 font-bold text-gray-900">{w.response_status || '—'}</td>
                            <td className="py-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  w.status === 'delivered'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {w.status}
                              </span>
                            </td>
                            <td className="py-3 text-gray-400 font-sans">{formatDate(w.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Sub-Tab 6: Signature Verifier Diagnostic Tool */}
              {rzpSubTab === 'verifier' && (
                <div className="card max-w-2xl mx-auto space-y-4">
                  <div>
                    <h4 className="font-bold text-gray-900 text-base">🛡️ Official Razorpay Signature Verifier</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Verify any <code className="font-mono text-indigo-700">razorpay_signature</code> returned by the checkout modal.
                      Formula: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-gray-800">HMAC_SHA256(order_id + "|" + payment_id, secret)</code>.
                    </p>
                  </div>

                  <form onSubmit={handleVerifySignature} className="space-y-3">
                    <div>
                      <label className="label">Order ID (razorpay_order_id)</label>
                      <input
                        type="text"
                        placeholder="order_f593113392bf018b"
                        value={sigTool.orderId}
                        onChange={(e) => setSigTool({ ...sigTool, orderId: e.target.value })}
                        className="input-field text-xs font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Payment ID (razorpay_payment_id)</label>
                      <input
                        type="text"
                        placeholder="pay_eeca06f3da0d2cc9"
                        value={sigTool.paymentId}
                        onChange={(e) => setSigTool({ ...sigTool, paymentId: e.target.value })}
                        className="input-field text-xs font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Key Secret</label>
                      <input
                        type="text"
                        placeholder={profile?.rzp_key_secret || 'Your Razorpay Key Secret'}
                        value={sigTool.secret}
                        onChange={(e) => setSigTool({ ...sigTool, secret: e.target.value })}
                        className="input-field text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="label">Received Signature (razorpay_signature)</label>
                      <input
                        type="text"
                        placeholder="766236380e8faa8bff7d30922b925375f7b6a82e47b37dc69669fa701a69874d"
                        value={sigTool.signature}
                        onChange={(e) => setSigTool({ ...sigTool, signature: e.target.value })}
                        className="input-field text-xs font-mono"
                        required
                      />
                    </div>

                    <button type="submit" className="btn-primary w-full bg-indigo-600 hover:bg-indigo-700 text-xs py-2.5">
                      Verify Signature Authenticity
                    </button>
                  </form>

                  {sigTool.result && (
                    <div
                      className={`p-4 rounded-2xl border text-xs font-mono space-y-1.5 ${
                        sigTool.result.valid
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                          : 'bg-rose-50 border-rose-300 text-rose-950'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1.5 text-sm">
                        <span>{sigTool.result.valid ? '✅ VALID SIGNATURE' : '❌ INVALID SIGNATURE'}</span>
                      </div>
                      <div>Expected: {sigTool.result.expectedSignature}</div>
                      <div>Provided: {sigTool.result.providedSignature}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* REFUND MODAL */}
      {refundModal.open && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-bold text-gray-900 text-sm">Issue Refund</span>
              <button onClick={() => setRefundModal({ open: false, payment: null, amount: '', reason: '', loading: false })} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <p className="text-xs text-gray-500">
              Payment ID: <span className="font-mono font-bold text-gray-800">{refundModal.payment?.id}</span>
            </p>

            <form onSubmit={handleProcessRefund} className="space-y-3">
              <div>
                <label className="label">Refund Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={refundModal.amount}
                  onChange={(e) => setRefundModal({ ...refundModal, amount: e.target.value })}
                  className="input-field text-xs font-mono"
                  placeholder="e.g. 200"
                  required
                />
              </div>

              <div>
                <label className="label">Reason (Optional)</label>
                <input
                  type="text"
                  value={refundModal.reason}
                  onChange={(e) => setRefundModal({ ...refundModal, reason: e.target.value })}
                  className="input-field text-xs"
                  placeholder="Customer cancellation"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRefundModal({ open: false, payment: null, amount: '', reason: '', loading: false })}
                  className="btn-secondary text-xs flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={refundModal.loading}
                  className="btn-primary text-xs bg-rose-600 hover:bg-rose-700 text-white flex-1"
                >
                  {refundModal.loading ? 'Refunding...' : 'Confirm Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE PAYMENT LINK MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-900 text-base">Generate Payment Link & QR Code</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleCreateLink} className="space-y-4">
              <div>
                <label className="label">Product or Invoice Title *</label>
                <input
                  type="text"
                  value={newLink.title}
                  onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
                  className="input-field"
                  placeholder="e.g. Website Consulting / Monthly Retainer"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Fixed Price (Optional)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.50"
                    value={newLink.amount}
                    onChange={(e) => setNewLink({ ...newLink, amount: e.target.value })}
                    className="input-field"
                    placeholder="Leave blank for any"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Blank = Client chooses amount</p>
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select
                    value={newLink.currency}
                    onChange={(e) => setNewLink({ ...newLink, currency: e.target.value })}
                    className="input-field"
                  >
                    <option value="usd">USD ($)</option>
                    <option value="eur">EUR (€)</option>
                    <option value="gbp">GBP (£)</option>
                    <option value="inr">INR (₹)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Description / Instructions</label>
                <textarea
                  rows={2}
                  value={newLink.description}
                  onChange={(e) => setNewLink({ ...newLink, description: e.target.value })}
                  className="input-field"
                  placeholder="Notes for the customer..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingLink}
                  className="btn-primary text-xs bg-blue-600 hover:bg-blue-700"
                >
                  {submittingLink ? 'Generating...' : 'Generate Link & QR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LARGE QR CODE MODAL */}
      {selectedQr && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-bold text-gray-900 text-sm">{selectedQr.title}</span>
              <button onClick={() => setSelectedQr(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <p className="text-xs text-gray-500">
              Customers can scan this QR code with their mobile phone camera to pay instantly.
            </p>

            <div className="p-3 bg-white border-2 border-gray-200 rounded-2xl inline-block shadow-inner">
              <img src={selectedQr.qrCode} alt="Payment QR Code" className="w-56 h-56 mx-auto rounded-lg" />
            </div>

            <div className="bg-gray-50 p-3 rounded-xl space-y-1">
              <p className="font-bold text-gray-900 text-sm">
                {selectedQr.amount ? formatAmount(selectedQr.amount, selectedQr.currency) : 'Customer Entered Amount'}
              </p>
              <p className="text-[11px] text-gray-500 font-mono break-all">{selectedQr.payUrl}</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedQr.payUrl);
                  toast.success('Link copied!');
                }}
                className="btn-secondary text-xs"
              >
                Copy URL
              </button>
              <a
                href={selectedQr.qrCode}
                download={`${selectedQr.slug}-qr.png`}
                className="btn-primary text-xs bg-blue-600 hover:bg-blue-700 flex items-center justify-center"
              >
                Download QR
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
