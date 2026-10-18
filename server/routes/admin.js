const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Enforce admin role for all admin routes
router.use(verifyToken);
router.use(requireRole(['admin']));

// ─── GET /api/admin/stats ────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [txStats, userStats, bizStats, rzpStats] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::INTEGER AS "totalTransactions",
          COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount END), 0)::INTEGER AS "totalVolume",
          COUNT(*) FILTER (WHERE status = 'succeeded')::INTEGER AS "succeededCount",
          COUNT(*) FILTER (WHERE status = 'pending')::INTEGER   AS "pendingCount",
          COUNT(*) FILTER (WHERE status = 'failed')::INTEGER    AS "failedCount"
        FROM transactions
      `),
      query(`
        SELECT
          COUNT(*)::INTEGER AS "totalUsers",
          COUNT(*) FILTER (WHERE role = 'client')::INTEGER   AS "clientCount",
          COUNT(*) FILTER (WHERE role = 'business')::INTEGER AS "businessCount",
          COUNT(*) FILTER (WHERE role = 'admin')::INTEGER    AS "adminCount",
          COUNT(*) FILTER (WHERE is_active = FALSE)::INTEGER AS "suspendedCount"
        FROM users
      `),
      query(`SELECT COUNT(*)::INTEGER AS "totalBusinesses" FROM businesses`),
      query(`
        SELECT
          COUNT(*)::INTEGER AS "totalRzpPayments",
          COALESCE(SUM(CASE WHEN status = 'captured' THEN amount END), 0)::INTEGER AS "totalRzpVolume",
          COALESCE(SUM(fee + tax), 0)::INTEGER AS "totalRzpFees",
          COALESCE(SUM(amount_refunded), 0)::INTEGER AS "totalRzpRefunded"
        FROM payments
      `),
    ]);

    res.json({
      transactions: txStats.rows[0],
      users: userStats.rows[0],
      businesses: bizStats.rows[0],
      razorpay: rzpStats.rows[0],
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch platform metrics' });
  }
});

// ─── GET /api/admin/users ────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const role  = req.query.role;
    const search = req.query.search ? `%${req.query.search.trim().toLowerCase()}%` : null;

    let whereConditions = [];
    let params = [];

    if (role && ['admin', 'business', 'client'].includes(role)) {
      params.push(role);
      whereConditions.push(`u.role = $${params.length}`);
    }

    if (search) {
      params.push(search);
      whereConditions.push(`LOWER(u.email) LIKE $${params.length}`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const dataQuery = `
      SELECT u.id, u.email, u.role, u.is_active, u.is_verified, u.created_at,
             b.name AS business_name,
             COUNT(t.id)::INTEGER AS transaction_count,
             COALESCE(SUM(CASE WHEN t.status = 'succeeded' THEN t.amount END), 0)::INTEGER AS total_spent
      FROM users u
      LEFT JOIN businesses b ON b.user_id = u.id
      LEFT JOIN transactions t ON t.user_id = u.id
      ${whereClause}
      GROUP BY u.id, b.name
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countQuery = `
      SELECT COUNT(*)::INTEGER AS total
      FROM users u
      ${whereClause}
    `;

    const [dataRes, countRes] = await Promise.all([
      query(dataQuery, [...params, limit, offset]),
      query(countQuery, params),
    ]);

    res.json({
      users: dataRes.rows,
      pagination: {
        page,
        limit,
        total: countRes.rows[0].total,
        totalPages: Math.ceil(countRes.rows[0].total / limit),
      },
    });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ─── PATCH /api/admin/users/:id/status ───────────────────────────────────────
router.patch('/users/:id/status', async (req, res) => {
  const targetId = parseInt(req.params.id);

  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'Cannot deactivate your own admin account' });
  }

  try {
    const result = await query(
      `UPDATE users
       SET is_active = NOT is_active
       WHERE id = $1
       RETURNING id, email, role, is_active`,
      [targetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: `User account is now ${result.rows[0].is_active ? 'Active' : 'Suspended'}`,
      user: result.rows[0],
    });
  } catch (err) {
    console.error('Update user status error:', err);
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
});

// ─── PATCH /api/admin/users/:id/role ─────────────────────────────────────────
router.patch(
  '/users/:id/role',
  [body('role').isIn(['client', 'business', 'admin']).withMessage('Invalid role')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const targetId = parseInt(req.params.id);
    const { role } = req.body;

    if (targetId === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot demote your own admin account' });
    }

    try {
      const result = await query(
        `UPDATE users
         SET role = $1
         WHERE id = $2
         RETURNING id, email, role`,
        [role, targetId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // If promoted to business, ensure a business record exists
      if (role === 'business') {
        const bCheck = await query('SELECT id FROM businesses WHERE user_id = $1', [targetId]);
        if (bCheck.rows.length === 0) {
          await query(
            `INSERT INTO businesses (user_id, name, description)
             VALUES ($1, $2, 'Merchant Business')`,
            [targetId, `${result.rows[0].email.split('@')[0]} Store`]
          );
        }
      }

      res.json({
        message: `Role changed to ${role}`,
        user: result.rows[0],
      });
    } catch (err) {
      console.error('Update role error:', err);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  }
);

// ─── GET /api/admin/transactions ─────────────────────────────────────────────
router.get('/transactions', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT t.*,
                u.email AS customer_email,
                b.name  AS merchant_name,
                bu.email AS merchant_email,
                pl.title AS link_title
         FROM transactions t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN users bu ON bu.id = t.business_id
         LEFT JOIN businesses b ON b.user_id = t.business_id
         LEFT JOIN payment_links pl ON pl.id = t.payment_link_id
         ORDER BY t.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query('SELECT COUNT(*)::INTEGER AS total FROM transactions'),
    ]);

    res.json({
      transactions: dataRes.rows,
      pagination: {
        page,
        limit,
        total: countRes.rows[0].total,
        totalPages: Math.ceil(countRes.rows[0].total / limit),
      },
    });
  } catch (err) {
    console.error('Admin transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;
