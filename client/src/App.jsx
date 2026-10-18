import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Register from './pages/Register';
import Setup2FA from './pages/Setup2FA';
import Login from './pages/Login';
import Verify2FA from './pages/Verify2FA';
import ClientPortal from './pages/ClientPortal';
import BusinessPortal from './pages/BusinessPortal';
import AdminPortal from './pages/AdminPortal';
import Checkout from './pages/Checkout';
import PayLink from './pages/PayLink';
import SessionCheckout from './pages/SessionCheckout';

// Protected route wrapper with optional role checking
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading, getDefaultRoute } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If user lacks permission for this portal, redirect to their home portal
    return <Navigate to={getDefaultRoute(user.role)} replace />;
  }

  return children;
};

// Smart home redirector
const HomeRedirect = () => {
  const { user, loading, getDefaultRoute } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getDefaultRoute(user.role)} replace />;
};

const AppRoutes = () => (
  <Routes>
    {/* Smart Root & Dashboard */}
    <Route path="/" element={<HomeRedirect />} />
    <Route path="/dashboard" element={<HomeRedirect />} />

    {/* Auth & Onboarding */}
    <Route path="/register" element={<Register />} />
    <Route path="/setup-2fa" element={<Setup2FA />} />
    <Route path="/login" element={<Login />} />
    <Route path="/verify-2fa" element={<Verify2FA />} />

    {/* 1. Client Portal */}
    <Route
      path="/client"
      element={
        <ProtectedRoute>
          <ClientPortal />
        </ProtectedRoute>
      }
    />

    {/* 2. Business Merchant Portal */}
    <Route
      path="/business"
      element={
        <ProtectedRoute allowedRoles={['business', 'admin']}>
          <BusinessPortal />
        </ProtectedRoute>
      }
    />

    {/* 3. Admin Portal */}
    <Route
      path="/admin"
      element={
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminPortal />
        </ProtectedRoute>
      }
    />

    {/* Direct Checkout */}
    <Route
      path="/checkout"
      element={
        <ProtectedRoute>
          <Checkout />
        </ProtectedRoute>
      }
    />

    {/* Public Merchant QR / Payment Link Hosted Page */}
    <Route path="/pay/:slug" element={<PayLink />} />

    {/* External Website Hosted API Checkout Session */}
    <Route path="/checkout/session/:sessionId" element={<SessionCheckout />} />

    {/* Catch-all */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { borderRadius: '12px', fontSize: '13px' },
          }}
        />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
