import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const STATUS_BADGE = {
  succeeded: 'bg-green-100 text-green-700',
  pending:   'bg-yellow-100 text-yellow-700',
  failed:    'bg-red-100 text-red-700',
};

const formatAmount = (amount, currency) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);

const formatDate = (iso) =>
  new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [loadingTx, setLoadingTx] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchTransactions(1);
  }, []);

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/payments/stats');
      setStats(data);
    } catch {
      // Stats are non-critical
    }
  };

  const fetchTransactions = async (p) => {
    setLoadingTx(true);
    try {
      const { data } = await api.get(`/payments/history?page=${p}&limit=8`);
      setTransactions(data.transactions);
      setPagination(data.pagination);
      setPage(p);
    } catch (err) {
      toast.error('Failed to load transactions');
    } finally {
      setLoadingTx(false);
    }
  };

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try { await api.post('/auth/logout', { refreshToken }); } catch {}
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Nav */}
      <nav className="bg-white border-b border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-lg">💳</span>
          </div>
          <span className="font-bold text-gray-900 text-lg">PayGateway</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500 hidden sm:block">{user?.email}</span>
          <Link to="/checkout" className="btn-primary w-auto px-5 py-2 text-sm">
            + New Payment
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-red-500 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Welcome */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Good day, {user?.email?.split('@')[0]} 👋
          </h2>
          <p className="text-gray-500 text-sm mt-1">Here's your payment overview</p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card text-center">
              <p className="text-2xl font-bold text-gray-900">
                {formatAmount(stats.totalPaid || 0, 'usd')}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total Paid</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.totalTransactions}</p>
              <p className="text-xs text-gray-500 mt-1">Transactions</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-yellow-500">{stats.pendingCount}</p>
              <p className="text-xs text-gray-500 mt-1">Pending</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-red-500">{stats.failedCount}</p>
              <p className="text-xs text-gray-500 mt-1">Failed</p>
            </div>
          </div>
        )}

        {/* Transaction Table */}
        <div className="card shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900">Transaction History</h3>
            <Link to="/checkout" className="text-sm text-indigo-600 hover:underline font-medium">
              + Make a payment
            </Link>
          </div>

          {loadingTx ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">💳</p>
              <p className="font-medium">No transactions yet</p>
              <p className="text-sm mt-1">Make your first payment to see it here</p>
              <Link to="/checkout" className="btn-primary w-auto inline-block px-6 py-2 mt-4 text-sm">
                Make a Payment
              </Link>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="pb-3 pr-4">Date</th>
                      <th className="pb-3 pr-4">Description</th>
                      <th className="pb-3 pr-4">Amount</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                          {formatDate(tx.created_at)}
                        </td>
                        <td className="py-3 pr-4 text-gray-700 max-w-[160px] truncate">
                          {tx.description || '—'}
                        </td>
                        <td className="py-3 pr-4 font-semibold text-gray-900 whitespace-nowrap">
                          {formatAmount(tx.amount, tx.currency)}
                        </td>
                        <td className="py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[tx.status] || 'bg-gray-100 text-gray-600'}`}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400">
                    Page {pagination.page} of {pagination.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchTransactions(page - 1)}
                      disabled={page <= 1}
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                    >
                      ← Prev
                    </button>
                    <button
                      onClick={() => fetchTransactions(page + 1)}
                      disabled={page >= pagination.totalPages}
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
