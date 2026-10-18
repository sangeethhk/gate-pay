import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Verify2FA() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef([]);
  const email = location.state?.email || '';

  useEffect(() => {
    // Focus first input on mount
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index, value) => {
    if (!/^\d?$/.test(value)) return; // Only digits
    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);
    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newDigits = [...digits];
    pasted.split('').forEach((ch, i) => { newDigits[i] = ch; });
    setDigits(newDigits);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = digits.join('');
    if (token.length !== 6) {
      toast.error('Enter all 6 digits');
      return;
    }

    const preAuthToken = sessionStorage.getItem('preAuthToken');
    if (!preAuthToken) {
      toast.error('Session expired. Please log in again.');
      navigate('/login');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post(
        '/auth/verify-2fa',
        { token },
        { headers: { Authorization: `Bearer ${preAuthToken}` } }
      );

      sessionStorage.removeItem('preAuthToken');
      login(data.user, data.accessToken, data.refreshToken);
      toast.success(`Welcome! Logged in as ${data.user.role.toUpperCase()} ✅`);
      if (data.user.role === 'admin') {
        navigate('/admin');
      } else if (data.user.role === 'business') {
        navigate('/business');
      } else {
        navigate('/client');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid code');
      setDigits(Array(6).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white text-2xl">🔑</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Two-Factor Auth</h1>
          <p className="text-gray-500 mt-1">
            Enter the 6-digit code from your authenticator app
          </p>
          {email && (
            <p className="text-sm text-indigo-600 font-medium mt-1">{email}</p>
          )}
        </div>

        <div className="card shadow-md">
          <form onSubmit={handleSubmit}>
            {/* OTP Input Grid */}
            <div className="flex gap-3 justify-center mb-6" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (inputRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className={`w-12 h-14 text-center text-xl font-bold border-2 rounded-xl
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all
                    ${digit ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white'}`}
                />
              ))}
            </div>

            <p className="text-center text-xs text-gray-400 mb-4">
              💡 You can paste your 6-digit code directly
            </p>

            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Verifying...
                </span>
              ) : (
                'Verify & Sign In'
              )}
            </button>
          </form>

          <button
            onClick={() => navigate('/login')}
            className="btn-secondary mt-3"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
