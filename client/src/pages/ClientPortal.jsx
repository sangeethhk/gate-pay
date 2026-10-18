import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
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

export default function ClientPortal() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [loadingTx, setLoadingTx] = useState(true);

  // Receipt Modal
  const [activeReceipt, setActiveReceipt] = useState(null);

  useEffect(() => {
    fetchStats();
    fetchTransactions(1);
  }, []);

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/payments/stats');
      setStats(data);
    } catch {}
  };

  const fetchTransactions = async (p) => {
    setLoadingTx(true);
    try {
      const { data } = await api.get(`/payments/history?page=${p}&limit=8`);
      setTransactions(data.transactions);
      setPagination(data.pagination);
      setPage(p);
    } catch (err) {
      toast.error('Failed to load transaction history');
    } finally {
      setLoadingTx(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/60 pb-16">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Welcome Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-6 sm:p-8 text-white shadow-lg shadow-emerald-900/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold">
              <span>👤</span>
              <span>Client Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Hello, {user?.email?.split('@')[0]}
            </h1>
            <p className="text-emerald-100 text-sm max-w-lg">
              Manage your personal payments, inspect receipts, and checkout with merchants securely.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/checkout"
              className="px-5 py-2.5 bg-white text-emerald-800 hover:bg-emerald-50 font-bold text-sm rounded-xl transition-all shadow-sm"
            >
              💳 Direct Card Payment
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card shadow-xs border-emerald-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Spent</p>
            <p className="text-2xl font-black text-gray-900 mt-2">
              {formatAmount(stats?.totalPaid || 0)}
            </p>
            <p className="text-[11px] text-emerald-600 font-medium mt-1">✓ Lifetime payments settled</p>
          </div>

          <div className="card shadow-xs">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Transactions</p>
            <p className="text-2xl font-black text-gray-900 mt-2">{stats?.totalTransactions || 0}</p>
            <p className="text-[11px] text-gray-500 mt-1">Processed orders</p>
          </div>

          <div className="card shadow-xs">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pending</p>
            <p className="text-2xl font-black text-amber-500 mt-2">{stats?.pendingCount || 0}</p>
            <p className="text-[11px] text-amber-600 mt-1">Awaiting confirmation</p>
          </div>

          <div className="card shadow-xs">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">2FA Security</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              <p className="text-lg font-bold text-gray-900">Protected</p>
            </div>
            <p className="text-[11px] text-emerald-600 mt-1">Google Authenticator active</p>
          </div>
        </div>

        {/* Transaction History Section */}
        <div className="card shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-gray-900 text-lg">My Payment History</h2>
              <p className="text-xs text-gray-500 mt-0.5">All incoming and outgoing personal checkout transactions</p>
            </div>
            <Link to="/checkout" className="text-xs font-bold text-emerald-700 hover:underline">
              + New Payment
            </Link>
          </div>

          {loadingTx ? (
            <div className="py-16 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-16 text-gray-400 space-y-2">
              <span className="text-4xl block">💳</span>
              <p className="font-semibold text-gray-700">No payment records yet</p>
              <p className="text-xs max-w-sm mx-auto">Make your first test payment using our secure Stripe card form.</p>
              <div className="pt-3">
                <Link to="/checkout" className="btn-primary w-auto inline-block px-5 py-2 text-xs">
                  Make a Payment
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="pb-3 pr-4 font-semibold">Date</th>
                      <th className="pb-3 pr-4 font-semibold">Merchant / Item</th>
                      <th className="pb-3 pr-4 font-semibold">Amount</th>
                      <th className="pb-3 pr-4 font-semibold">Status</th>
                      <th className="pb-3 text-right font-semibold">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="py-3.5 pr-4 text-xs text-gray-500 whitespace-nowrap">
                          {formatDate(tx.created_at)}
                        </td>
                        <td className="py-3.5 pr-4">
                          <p className="font-semibold text-gray-900 text-xs truncate max-w-xs">
                            {tx.merchant_name ? `🏢 ${tx.merchant_name}` : tx.description || 'Payment'}
                          </p>
                          {tx.link_title && (
                            <span className="text-[10px] text-gray-400">Via link: {tx.link_title}</span>
                          )}
                        </td>
                        <td className="py-3.5 pr-4 font-bold text-gray-900 whitespace-nowrap text-xs">
                          {formatAmount(tx.amount, tx.currency)}
                        </td>
                        <td className="py-3.5 pr-4 whitespace-nowrap space-x-1.5">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                            tx.payment_method === 'upi' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {tx.payment_method === 'upi' ? '📱 UPI' : '💳 Card'}
                          </span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${STATUS_BADGE[tx.status]}`}>
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => setActiveReceipt(tx)}
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg"
                          >
                            View Receipt
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-2">
                  <p className="text-xs text-gray-400">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} transactions)
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchTransactions(page - 1)}
                      disabled={page <= 1}
                      className="px-3 py-1.5 text-xs font-semibold border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                    >
                      ← Prev
                    </button>
                    <button
                      onClick={() => fetchTransactions(page + 1)}
                      disabled={page >= pagination.totalPages}
                      className="px-3 py-1.5 text-xs font-semibold border rounded-lg disabled:opacity-40 hover:bg-gray-50"
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

      {/* Receipt Modal */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧾</span>
                <h3 className="font-bold text-gray-900 text-base">Payment Receipt</h3>
              </div>
              <button
                onClick={() => setActiveReceipt(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Amount Settled</span>
                <span className="font-extrabold text-gray-900 text-sm">
                  {formatAmount(activeReceipt.amount, activeReceipt.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${STATUS_BADGE[activeReceipt.status]}`}>
                  {activeReceipt.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Method</span>
                <span className="font-bold text-indigo-700 uppercase">
                  {activeReceipt.payment_method === 'upi' ? '📱 UPI (VPA / QR)' : '💳 Card'}
                </span>
              </div>
              {activeReceipt.utr_number && (
                <div className="flex justify-between">
                  <span className="text-gray-500">12-Digit Bank UTR</span>
                  <span className="font-mono text-emerald-700 font-bold">{activeReceipt.utr_number}</span>
                </div>
              )}
              {activeReceipt.upi_id && (
                <div className="flex justify-between">
                  <span className="text-gray-500">UPI ID / VPA</span>
                  <span className="font-mono text-gray-800 font-semibold">{activeReceipt.upi_id}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Merchant</span>
                <span className="font-semibold text-gray-800">
                  {activeReceipt.merchant_name || 'PayGateway Direct'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Description</span>
                <span className="text-gray-700">{activeReceipt.description || 'Standard Payment'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="text-gray-700">{formatDate(activeReceipt.created_at)}</span>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <span className="text-gray-500 block mb-0.5">Reference ID:</span>
                <span className="font-mono text-[10px] text-gray-600 break-all select-all">
                  {activeReceipt.stripe_payment_id}
                </span>
              </div>
            </div>

            <button onClick={() => setActiveReceipt(null)} className="btn-secondary text-xs">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
