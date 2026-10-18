import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function Navbar() {
  const { user, logout, isAdmin, isBusiness } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {}
    logout();
    toast.success('Signed out successfully');
    navigate('/login');
  };

  const roleBadgeColor = {
    admin: 'bg-purple-100 text-purple-700 border-purple-200',
    business: 'bg-blue-100 text-blue-700 border-blue-200',
    client: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  }[user?.role || 'client'];

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Portal Nav */}
          <div className="flex items-center gap-6">
            <Link to={isAdmin ? '/admin' : isBusiness ? '/business' : '/client'} className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-tr from-indigo-600 to-indigo-500 rounded-xl flex items-center justify-center shadow-xs">
                <span className="text-white text-lg">💳</span>
              </div>
              <span className="font-extrabold text-gray-900 text-lg tracking-tight">PayGateway</span>
            </Link>

            {/* Portal Switcher Tabs */}
            <nav className="hidden md:flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl">
              <Link
                to="/client"
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  location.pathname === '/client' || location.pathname === '/dashboard'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                👤 Client Portal
              </Link>

              {isBusiness && (
                <Link
                  to="/business"
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    location.pathname === '/business'
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  🏢 Business Portal
                </Link>
              )}

              {isAdmin && (
                <Link
                  to="/admin"
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    location.pathname === '/admin'
                      ? 'bg-white text-purple-600 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  👑 Admin Portal
                </Link>
              )}
            </nav>
          </div>

          {/* User actions */}
          <div className="flex items-center gap-3">
            {/* Quick Action Button */}
            <Link
              to="/checkout"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors"
            >
              <span>+</span>
              <span>Quick Pay</span>
            </Link>

            {/* User role badge & email */}
            <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
              <span
                className={`px-2 py-0.5 text-[11px] font-bold uppercase rounded-md border tracking-wider ${roleBadgeColor}`}
              >
                {user?.role}
              </span>
              <span className="text-xs text-gray-600 font-medium hidden lg:inline-block max-w-[140px] truncate">
                {user?.email}
              </span>
            </div>

            {/* Sign out */}
            <button
              onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign out"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Portal Navigation */}
        <div className="flex md:hidden border-t border-gray-100 py-2 gap-2 overflow-x-auto">
          <Link
            to="/client"
            className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
              location.pathname === '/client' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            Client
          </Link>
          {isBusiness && (
            <Link
              to="/business"
              className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                location.pathname === '/business' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Business
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/admin"
              className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                location.pathname === '/admin' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Admin
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
