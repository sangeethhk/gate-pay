import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useEffect } from 'react';

export default function Setup2FA() {
  const { state } = useLocation();
  const navigate = useNavigate();

  // Redirect if arrived without QR data (e.g., direct URL access)
  useEffect(() => {
    if (!state?.qrCode) navigate('/register');
  }, [state, navigate]);

  if (!state?.qrCode) return null;

  const { qrCode, manualKey, email } = state;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-green-500 rounded-2xl mb-4 shadow-lg">
            <span className="text-white text-2xl">🔐</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Set Up 2FA</h1>
          <p className="text-gray-500 mt-1">Scan this QR code with your authenticator app</p>
        </div>

        <div className="card shadow-md text-center space-y-6">
          {/* Step instructions */}
          <div className="bg-indigo-50 rounded-xl p-4 text-left">
            <p className="text-sm font-semibold text-indigo-700 mb-2">📱 Setup Instructions:</p>
            <ol className="text-sm text-indigo-600 space-y-1 list-decimal list-inside">
              <li>Install <strong>Google Authenticator</strong> or <strong>Authy</strong></li>
              <li>Open the app and tap "Add Account"</li>
              <li>Tap "Scan QR Code" and scan below</li>
              <li>Click "Continue to Login" when done</li>
            </ol>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center">
            <div className="p-3 bg-white border-2 border-gray-200 rounded-2xl shadow-inner inline-block">
              <img
                src={qrCode}
                alt="2FA QR Code"
                className="w-52 h-52"
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">Account: {email}</p>
          </div>

          {/* Manual key fallback */}
          <div>
            <p className="text-xs text-gray-500 mb-2">
              Can't scan? Enter this key manually:
            </p>
            <div className="bg-gray-100 rounded-xl px-4 py-3 font-mono text-sm text-gray-700 tracking-widest break-all select-all">
              {manualKey}
            </div>
            <p className="text-xs text-gray-400 mt-1">Tap to select all and copy</p>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-left">
            <p className="text-xs text-amber-700">
              ⚠️ <strong>Important:</strong> Save this QR code or key in a safe place. 
              You'll need it to log in. If you lose it, you'll be locked out of your account.
            </p>
          </div>

          <Link to="/login" className="btn-primary block">
            ✅ I've scanned it — Continue to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
