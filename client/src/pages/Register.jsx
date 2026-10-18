import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Mode: 'form' | 'qr'
  const [activeTab, setActiveTab] = useState('form');

  // Form state
  const initialRole = searchParams.get('role') || 'client';
  const [form, setForm] = useState({
    role: initialRole,
    email: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    website: '',
    adminSecret: '',
  });
  const [loading, setLoading] = useState(false);

  // QR Code state
  const [qrData, setQrData] = useState(null);
  const [qrRole, setQrRole] = useState(initialRole);
  const [loadingQr, setLoadingQr] = useState(false);

  useEffect(() => {
    if (activeTab === 'qr') {
      fetchRegisterQr(qrRole);
    }
  }, [activeTab, qrRole]);

  const fetchRegisterQr = async (role) => {
    setLoadingQr(true);
    try {
      const { data } = await api.get(`/auth/register-qr?role=${role}`);
      setQrData(data);
    } catch (err) {
      toast.error('Failed to load registration QR code');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (form.role === 'business' && !form.businessName.trim()) {
      toast.error('Please enter your Business / Store name');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        email: form.email,
        password: form.password,
        role: form.role,
        businessName: form.businessName,
        website: form.website,
        adminSecret: form.adminSecret,
      };

      const { data } = await api.post('/auth/register', payload);

      toast.success('Account created! Now setup your authenticator app');
      navigate('/setup-2fa', {
        state: {
          qrCode: data.qrCode,
          manualKey: data.manualKey,
          otpauthUrl: data.otpauthUrl,
          email: form.email,
          role: data.role,
        },
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/70 px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-3 shadow-md shadow-indigo-200">
            <span className="text-white text-2xl">💳</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Create your PayGateway Account</h1>
          <p className="text-gray-500 text-sm mt-1">Multi-portal payment system with TOTP authenticator</p>
        </div>

        {/* Tab Selector: Form vs Mobile QR Code */}
        <div className="flex bg-gray-100/90 p-1 rounded-2xl mb-5 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'form' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            ✍️ Standard Registration
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'qr' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            📱 Scan QR to Register on Mobile
          </button>
        </div>

        {/* TAB 1: Mobile QR Code Registration */}
        {activeTab === 'qr' && (
          <div className="card shadow-md text-center space-y-5 animate-in fade-in duration-200">
            <div>
              <h2 className="text-base font-bold text-gray-900">Mobile Onboarding QR Code</h2>
              <p className="text-xs text-gray-500 mt-1">
                Scan this QR code with your smartphone camera to open registration directly on your mobile device.
              </p>
            </div>

            {/* Role picker for QR generation */}
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setQrRole('client')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  qrRole === 'client'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs'
                    : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}
              >
                👤 Client Onboarding
              </button>
              <button
                type="button"
                onClick={() => setQrRole('business')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  qrRole === 'business'
                    ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-xs'
                    : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}
              >
                🏢 Business Merchant Onboarding
              </button>
            </div>

            {/* QR display */}
            <div className="flex flex-col items-center justify-center py-2">
              {loadingQr ? (
                <div className="w-56 h-56 flex items-center justify-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                </div>
              ) : qrData?.qrCode ? (
                <div className="p-3 bg-white border-2 border-indigo-100 rounded-2xl shadow-inner">
                  <img src={qrData.qrCode} alt="Registration QR Code" className="w-56 h-56 rounded-lg" />
                </div>
              ) : null}
            </div>

            <div className="bg-indigo-50/80 rounded-xl p-3 text-left">
              <p className="text-xs font-semibold text-indigo-800">✨ How it works:</p>
              <ol className="text-xs text-indigo-700 list-decimal list-inside space-y-1 mt-1">
                <li>Open your phone's default camera app</li>
                <li>Point at the QR code above</li>
                <li>Tap the link notification that appears to complete signup on your phone</li>
              </ol>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setActiveTab('form')}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Or register right here in this browser →
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Standard Registration Form */}
        {activeTab === 'form' && (
          <div className="card shadow-md">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Portal / Role selector */}
              <div>
                <label className="label">Select Account Type / Portal Access</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, role: 'client' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      form.role === 'client'
                        ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-gray-900">👤 Client Account</span>
                      {form.role === 'client' && <span className="text-emerald-600 text-xs font-bold">✓</span>}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">Make payments, checkout, view receipts</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, role: 'business' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      form.role === 'business'
                        ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-gray-900">🏢 Business Portal</span>
                      {form.role === 'business' && <span className="text-blue-600 text-xs font-bold">✓</span>}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">Payment links, QR codes, sales metrics</p>
                  </button>
                </div>

                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, role: form.role === 'admin' ? 'client' : 'admin' })}
                    className="text-[11px] text-gray-400 hover:text-purple-600 transition-colors"
                  >
                    {form.role === 'admin' ? 'Switch back to standard' : 'Need Admin portal access?'}
                  </button>
                </div>
              </div>

              {/* Business specific fields */}
              {form.role === 'business' && (
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3.5 space-y-3">
                  <p className="text-xs font-bold text-blue-900">🏢 Merchant Business Profile</p>
                  <div>
                    <label className="label">Business / Company Name *</label>
                    <input
                      type="text"
                      name="businessName"
                      value={form.businessName}
                      onChange={handleChange}
                      className="input-field bg-white"
                      placeholder="e.g. Apex Digital Corp"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Website (Optional)</label>
                    <input
                      type="url"
                      name="website"
                      value={form.website}
                      onChange={handleChange}
                      className="input-field bg-white"
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
              )}

              {/* Admin secret field */}
              {form.role === 'admin' && (
                <div className="bg-purple-50/60 border border-purple-200 rounded-xl p-3.5 space-y-2">
                  <p className="text-xs font-bold text-purple-900">🛡️ Admin Security Verification</p>
                  <p className="text-[11px] text-purple-700">Enter the system master admin key to provision an administrator:</p>
                  <input
                    type="password"
                    name="adminSecret"
                    value={form.adminSecret}
                    onChange={handleChange}
                    className="input-field bg-white"
                    placeholder="Enter Admin Master Secret"
                    required
                  />
                </div>
              )}

              {/* Email */}
              <div>
                <label className="label">Email address</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="name@example.com"
                  required
                />
              </div>

              {/* Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="Min 8 characters"
                    required
                  />
                </div>
                <div>
                  <label className="label">Confirm</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="Repeat password"
                    required
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary mt-2">
                {loading ? 'Creating account...' : `Register as ${form.role.toUpperCase()}`}
              </button>
            </form>

            <p className="text-center text-xs text-gray-500 mt-5">
              Already have an account?{' '}
              <Link to="/login" className="text-indigo-600 font-semibold hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        )}

        <div className="text-center mt-6">
          <p className="text-xs text-gray-400">
            🔒 All accounts are protected by 2FA Authenticator & Stripe test mode
          </p>
        </div>
      </div>
    </div>
  );
}
