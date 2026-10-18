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

export default function AdminPortal() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Tabs: 'users' | 'transactions'
  const [activeTab, setActiveTab] = useState('users');

  // Filters
  const [roleFilter, setRoleFilter] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers(1);
    } else if (activeTab === 'transactions') {
      fetchTransactions(1);
    }
  }, [activeTab, roleFilter]);

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/admin/stats');
      setStats(data);
    } catch {
      toast.error('Failed to load system metrics');
    }
  };

  const fetchUsers = async (p = 1) => {
    setLoading(true);
    try {
      let url = `/admin/users?page=${p}&limit=12`;
      if (roleFilter) url += `&role=${roleFilter}`;
      if (searchEmail) url += `&search=${encodeURIComponent(searchEmail)}`;
      const { data } = await api.get(url);
      setUsers(data.users);
      setPagination(data.pagination);
      setPage(p);
    } catch (err) {
      toast.error('Failed to load platform users');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (p = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/transactions?page=${p}&limit=15`);
      setTransactions(data.transactions);
      setPagination(data.pagination);
      setPage(p);
    } catch (err) {
      toast.error('Failed to load global transaction audit log');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (user) => {
    try {
      const { data } = await api.patch(`/admin/users/${user.id}/status`);
      toast.success(data.message);
      setUsers(users.map((u) => (u.id === user.id ? { ...u, is_active: data.user.is_active } : u)));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to toggle status');
    }
  };

  const handleChangeRole = async (user, newRole) => {
    if (user.role === newRole) return;
    try {
      const { data } = await api.patch(`/admin/users/${user.id}/role`, { role: newRole });
      toast.success(data.message);
      setUsers(users.map((u) => (u.id === user.id ? { ...u, role: data.user.role } : u)));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update role');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/60 pb-16">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Banner */}
        <div className="bg-gradient-to-r from-purple-800 via-indigo-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-purple-950/15 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold">
              <span>👑</span>
              <span>Platform Administration & Access Control</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">System Control Center</h1>
            <p className="text-purple-200 text-sm max-w-lg">
              Manage multi-tenant user roles, inspect global transactions, and control platform access.
            </p>
          </div>
        </div>

        {/* Global Telemetry Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card shadow-xs border-purple-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Platform Volume</p>
            <p className="text-2xl font-black text-gray-900 mt-2">
              {formatAmount(stats?.transactions?.totalVolume || 0)}
            </p>
            <p className="text-[11px] text-purple-600 font-medium mt-1">Across all users & merchants</p>
          </div>

          <div className="card shadow-xs">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Accounts</p>
            <p className="text-2xl font-black text-gray-900 mt-2">{stats?.users?.totalUsers || 0}</p>
            <div className="flex gap-2 text-[10px] text-gray-500 mt-1">
              <span>{stats?.users?.clientCount || 0} Clients</span>
              <span>•</span>
              <span className="text-blue-600 font-semibold">{stats?.users?.businessCount || 0} Businesses</span>
              <span>•</span>
              <span className="text-purple-600 font-semibold">{stats?.users?.adminCount || 0} Admins</span>
            </div>
          </div>

          <div className="card shadow-xs">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Successful Transactions</p>
            <p className="text-2xl font-black text-emerald-600 mt-2">
              {stats?.transactions?.succeededCount || 0}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              Out of {stats?.transactions?.totalTransactions || 0} initiated
            </p>
          </div>

          <div className="card shadow-xs">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Suspended Accounts</p>
            <p className="text-2xl font-black text-rose-500 mt-2">
              {stats?.users?.suspendedCount || 0}
            </p>
            <p className="text-[11px] text-rose-600 mt-1">Access revoked by admin</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 gap-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'users'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            👥 User & Role Access Management
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'transactions'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            📜 Global Transaction Audit Log
          </button>
        </div>

        {/* TAB 1: User Management */}
        {activeTab === 'users' && (
          <div className="card shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              {/* Search & Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search user email..."
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchUsers(1)}
                  className="input-field text-xs py-2 px-3 w-60"
                />
                <button
                  onClick={() => fetchUsers(1)}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl"
                >
                  Search
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Filter Role:</span>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="input-field text-xs py-1.5 px-3 w-36"
                >
                  <option value="">All Roles</option>
                  <option value="client">Clients Only</option>
                  <option value="business">Businesses Only</option>
                  <option value="admin">Admins Only</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="py-16 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="pb-3 pr-4 font-semibold">User / Email</th>
                      <th className="pb-3 pr-4 font-semibold">Current Role</th>
                      <th className="pb-3 pr-4 font-semibold">Total Spent / Processed</th>
                      <th className="pb-3 pr-4 font-semibold">Status</th>
                      <th className="pb-3 pr-4 font-semibold">Registered</th>
                      <th className="pb-3 text-right font-semibold">Manage Role & Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="py-3.5 pr-4">
                          <p className="font-semibold text-gray-900 text-xs">{u.email}</p>
                          {u.business_name && (
                            <span className="text-[11px] text-blue-600 font-medium">🏢 {u.business_name}</span>
                          )}
                        </td>
                        <td className="py-3.5 pr-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 text-[11px] font-bold uppercase rounded border ${
                              u.role === 'admin'
                                ? 'bg-purple-100 text-purple-700 border-purple-200'
                                : u.role === 'business'
                                ? 'bg-blue-100 text-blue-700 border-blue-200'
                                : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3.5 pr-4 font-bold text-gray-900 text-xs whitespace-nowrap">
                          {formatAmount(u.total_spent)}
                        </td>
                        <td className="py-3.5 pr-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                              u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {u.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td className="py-3.5 pr-4 text-xs text-gray-500 whitespace-nowrap">
                          {formatDate(u.created_at)}
                        </td>
                        <td className="py-3.5 text-right whitespace-nowrap space-x-2">
                          {/* Role changer */}
                          <select
                            value={u.role}
                            onChange={(e) => handleChangeRole(u, e.target.value)}
                            className="text-xs border rounded-lg px-2 py-1 bg-white text-gray-700"
                          >
                            <option value="client">Client</option>
                            <option value="business">Business</option>
                            <option value="admin">Admin</option>
                          </select>

                          {/* Suspend / Unsuspend */}
                          <button
                            onClick={() => handleToggleStatus(u)}
                            className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                              u.is_active
                                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {u.is_active ? 'Suspend' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Global Transaction Audit Log */}
        {activeTab === 'transactions' && (
          <div className="card shadow-xs">
            <h3 className="font-bold text-gray-900 text-base mb-1">Live Transaction Audit Stream</h3>
            <p className="text-xs text-gray-500 mb-5">Platform-wide financial audit records across all merchants and clients</p>

            {transactions.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p>No transactions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="pb-3 pr-4 font-semibold">Date</th>
                      <th className="pb-3 pr-4 font-semibold">Customer</th>
                      <th className="pb-3 pr-4 font-semibold">Merchant / Product</th>
                      <th className="pb-3 pr-4 font-semibold">Amount</th>
                      <th className="pb-3 pr-4 font-semibold">Status</th>
                      <th className="pb-3 font-semibold">Stripe ID</th>
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
                        <td className="py-3.5 pr-4 text-xs text-gray-700">
                          {tx.merchant_name ? `🏢 ${tx.merchant_name}` : 'Direct'}
                          {tx.link_title && <span className="text-gray-400 block text-[10px]">({tx.link_title})</span>}
                        </td>
                        <td className="py-3.5 pr-4 font-bold text-gray-900 text-xs whitespace-nowrap">
                          {formatAmount(tx.amount, tx.currency)}
                        </td>
                        <td className="py-3.5 pr-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 text-[11px] font-bold rounded ${STATUS_BADGE[tx.status]}`}>
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3.5 font-mono text-[10px] text-gray-400 break-all select-all">
                          {tx.stripe_payment_id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
