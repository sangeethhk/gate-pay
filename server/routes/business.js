const express = require('express');
const QRCode = require('qrcode');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Enforce business or admin role for all business endpoints
router.use(verifyToken);
router.use(requireRole(['business', 'admin']));

// ─── GET /api/business/profile ───────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  try {
    const result = await query(
      `SELECT b.*, u.email
       FROM businesses b
       JOIN users u ON u.id = b.user_id
       WHERE b.user_id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      // Auto-create empty profile with API keys & Razorpay keys
      const apiKey = `pg_live_${crypto.randomBytes(16).toString('hex')}`;
      const apiSecret = `sec_live_${crypto.randomBytes(24).toString('hex')}`;
      const rzpKeyId = `rzp_live_${crypto.randomBytes(7).toString('hex')}`;
      const rzpKeySecret = `rzp_sec_${crypto.randomBytes(16).toString('hex')}`;
      const webhookSecret = `whsec_${crypto.randomBytes(16).toString('hex')}`;

      const insert = await query(
        `INSERT INTO businesses (user_id, name, description, upi_id, api_key, api_secret, rzp_key_id, rzp_key_secret, webhook_secret)
         VALUES ($1, $2, 'Merchant Business', $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [req.user.id, `${req.user.email.split('@')[0]} Store`, `${req.user.email.split('@')[0]}@okaxis`, apiKey, apiSecret, rzpKeyId, rzpKeySecret, webhookSecret]
      );
      return res.json({ profile: insert.rows[0] });
    }

    let profile = result.rows[0];

    // If profile exists but has missing keys, generate them now
    let needsUpdate = false;
    let apiKey = profile.api_key;
    let apiSecret = profile.api_secret;
    let rzpKeyId = profile.rzp_key_id;
    let rzpKeySecret = profile.rzp_key_secret;
    let webhookSecret = profile.webhook_secret;

    if (!apiKey) {
      apiKey = `pg_live_${crypto.randomBytes(16).toString('hex')}`;
      apiSecret = `sec_live_${crypto.randomBytes(24).toString('hex')}`;
      needsUpdate = true;
    }
    if (!rzpKeyId) {
      rzpKeyId = `rzp_live_${crypto.randomBytes(7).toString('hex')}`;
      rzpKeySecret = `rzp_sec_${crypto.randomBytes(16).toString('hex')}`;
      needsUpdate = true;
    }
    if (!webhookSecret) {
      webhookSecret = `whsec_${crypto.randomBytes(16).toString('hex')}`;
      needsUpdate = true;
    }

    if (needsUpdate) {
      const updated = await query(
        `UPDATE businesses
         SET api_key = $1, api_secret = $2, rzp_key_id = $3, rzp_key_secret = $4, webhook_secret = $5
         WHERE id = $6
         RETURNING *`,
        [apiKey, apiSecret, rzpKeyId, rzpKeySecret, webhookSecret, profile.id]
      );
      profile = updated.rows[0];
    }

    res.json({ profile });
  } catch (err) {
    console.error('Business profile error:', err);
    res.status(500).json({ error: 'Failed to fetch business profile' });
  }
});

// ─── POST /api/business/regenerate-api-key ──────────────────────────────────
router.post('/regenerate-api-key', async (req, res) => {
  try {
    const apiKey = `pg_live_${crypto.randomBytes(16).toString('hex')}`;
    const apiSecret = `sec_live_${crypto.randomBytes(24).toString('hex')}`;

    const result = await query(
      `UPDATE businesses
       SET api_key = $1, api_secret = $2
       WHERE user_id = $3
       RETURNING api_key, api_secret`,
      [apiKey, apiSecret, req.user.id]
    );

    res.json({
      message: 'New API Key & Secret generated successfully!',
      apiKey: result.rows[0].api_key,
      apiSecret: result.rows[0].api_secret,
    });
  } catch (err) {
    console.error('Regenerate API key error:', err);
    res.status(500).json({ error: 'Failed to regenerate API keys' });
  }
});

// ─── GET /api/business/api-orders ───────────────────────────────────────────
router.get('/api-orders', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM checkout_sessions
       WHERE business_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.user.id]
    );

    res.json({ orders: result.rows });
  } catch (err) {
    console.error('Fetch API orders error:', err);
    res.status(500).json({ error: 'Failed to fetch API orders' });
  }
});

// ─── POST /api/business/regenerate-rzp-keys ──────────────────────────────────
router.post('/regenerate-rzp-keys', async (req, res) => {
  try {
    const rzpKeyId = `rzp_live_${crypto.randomBytes(7).toString('hex')}`;
    const rzpKeySecret = `rzp_sec_${crypto.randomBytes(16).toString('hex')}`;

    const result = await query(
      `UPDATE businesses
       SET rzp_key_id = $1, rzp_key_secret = $2
       WHERE user_id = $3
       RETURNING rzp_key_id, rzp_key_secret`,
      [rzpKeyId, rzpKeySecret, req.user.id]
    );

    res.json({
      message: 'New Razorpay Key ID & Key Secret generated successfully!',
      rzpKeyId: result.rows[0].rzp_key_id,
      rzpKeySecret: result.rows[0].rzp_key_secret,
    });
  } catch (err) {
    console.error('Regenerate Razorpay keys error:', err);
    res.status(500).json({ error: 'Failed to regenerate Razorpay credentials' });
  }
});

// ─── POST /api/business/webhook-config ───────────────────────────────────────
router.post('/webhook-config', async (req, res) => {
  const { webhookUrl, regenerateSecret = false } = req.body;

  try {
    let updateSql = `UPDATE businesses SET webhook_url = $1 WHERE user_id = $2 RETURNING webhook_url, webhook_secret`;
    let params = [webhookUrl || '', req.user.id];

    if (regenerateSecret) {
      const newSecret = `whsec_${crypto.randomBytes(16).toString('hex')}`;
      updateSql = `UPDATE businesses SET webhook_url = $1, webhook_secret = $2 WHERE user_id = $3 RETURNING webhook_url, webhook_secret`;
      params = [webhookUrl || '', newSecret, req.user.id];
    }

    const result = await query(updateSql, params);
    res.json({
      message: 'Webhook configuration saved successfully!',
      webhookUrl: result.rows[0].webhook_url,
      webhookSecret: result.rows[0].webhook_secret,
    });
  } catch (err) {
    console.error('Webhook config error:', err);
    res.status(500).json({ error: 'Failed to save webhook configuration' });
  }
});

// ─── GET /api/business/razorpay/data ─────────────────────────────────────────
router.get('/razorpay/data', async (req, res) => {
  try {
    const [ordersRes, paymentsRes, refundsRes, settlementsRes, webhooksRes] = await Promise.all([
      query(`SELECT * FROM orders WHERE business_id = $1 ORDER BY created_at DESC LIMIT 40`, [req.user.id]),
      query(`SELECT * FROM payments WHERE business_id = $1 ORDER BY created_at DESC LIMIT 40`, [req.user.id]),
      query(`SELECT * FROM refunds WHERE business_id = $1 ORDER BY created_at DESC LIMIT 40`, [req.user.id]),
      query(`SELECT * FROM settlements WHERE business_id = $1 ORDER BY created_at DESC LIMIT 40`, [req.user.id]),
      query(`SELECT * FROM webhook_deliveries WHERE business_id = $1 ORDER BY created_at DESC LIMIT 40`, [req.user.id]),
    ]);

    // Calculate analytics
    const payments = paymentsRes.rows;
    let totalCaptured = 0;
    let totalFees = 0;
    let totalRefunded = 0;

    payments.forEach((p) => {
      if (p.status === 'captured') {
        totalCaptured += p.amount;
        totalFees += (p.fee || 0) + (p.tax || 0);
      }
      totalRefunded += p.amount_refunded || 0;
    });

    res.json({
      orders: ordersRes.rows,
      payments: paymentsRes.rows,
      refunds: refundsRes.rows,
      settlements: settlementsRes.rows,
      webhooks: webhooksRes.rows,
      stats: {
        totalCaptured,
        totalFees,
        totalRefunded,
        netRevenue: totalCaptured - totalFees - totalRefunded,
        totalOrders: ordersRes.rows.length,
        totalPayments: paymentsRes.rows.length,
      },
    });
  } catch (err) {
    console.error('Razorpay data fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch Razorpay telemetry' });
  }
});

// ─── POST /api/business/razorpay/refund ──────────────────────────────────────
router.post('/razorpay/refund', async (req, res) => {
  const { paymentId, amount, reason } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: 'Payment ID is required' });
  }

  try {
    const pResult = await query(
      `SELECT * FROM payments WHERE id = $1 AND business_id = $2`,
      [paymentId, req.user.id]
    );

    if (pResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = pResult.rows[0];
    const refundAmount = amount ? parseInt(amount, 10) : payment.amount - payment.amount_refunded;

    if (refundAmount <= 0 || refundAmount > (payment.amount - payment.amount_refunded)) {
      return res.status(400).json({ error: 'Invalid refund amount requested' });
    }

    const refundId = `rfnd_${crypto.randomBytes(8).toString('hex')}`;
    await query(
      `INSERT INTO refunds (id, payment_id, business_id, amount, currency, status, notes)
       VALUES ($1, $2, $3, $4, $5, 'processed', $6)`,
      [refundId, payment.id, req.user.id, refundAmount, payment.currency, JSON.stringify({ reason: reason || 'Merchant initiated' })]
    );

    const newRefunded = payment.amount_refunded + refundAmount;
    const newStatus = newRefunded >= payment.amount ? 'refunded' : payment.status;

    await query(
      `UPDATE payments SET amount_refunded = $1, status = $2, refund_status = 'full' WHERE id = $3`,
      [newRefunded, newStatus, payment.id]
    );

    res.json({ message: 'Refund processed successfully', refundId });
  } catch (err) {
    console.error('Process refund error:', err);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

// ─── POST /api/business/razorpay/settle ──────────────────────────────────────
router.post('/razorpay/settle', async (req, res) => {
  try {
    const unSettled = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE business_id = $1 AND status = 'captured'`,
      [req.user.id]
    );

    const amount = parseInt(unSettled.rows[0].total, 10);
    const fees = 0;
    const tax = 0;

    if (amount <= 0) {
      return res.status(400).json({ error: 'No captured funds available for settlement' });
    }

    const settleId = `setl_${crypto.randomBytes(8).toString('hex')}`;
    const utr = `${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    await query(
      `INSERT INTO settlements (id, business_id, amount, fees, tax, utr, status)
       VALUES ($1, $2, $3, 0, 0, $4, 'processed')`,
      [settleId, req.user.id, amount, utr]
    );

    res.json({
      message: 'Settlement created and credited to merchant account (0% fee, full payout)!',
      settlementId: settleId,
      amountSettled: amount,
      utr,
    });
  } catch (err) {
    console.error('Settlement error:', err);
    res.status(500).json({ error: 'Failed to process settlement' });
  }
});

// ─── PUT /api/business/profile ───────────────────────────────────────────────
router.put(
  '/profile',
  [
    body('name').trim().notEmpty().withMessage('Business name is required'),
    body('website').optional().trim(),
    body('description').optional().trim(),
    body('upi_id').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, website, description, upi_id } = req.body;

    try {
      const result = await query(
        `UPDATE businesses
         SET name = $1, website = $2, description = $3, upi_id = $4
         WHERE user_id = $5
         RETURNING *`,
        [name, website || '', description || '', upi_id || '', req.user.id]
      );

      res.json({
        message: 'Profile updated successfully',
        profile: result.rows[0],
      });
    } catch (err) {
      console.error('Update profile error:', err);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }
);

// ─── GET /api/business/stats ─────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;

    const statsRes = await query(
      `SELECT
         COUNT(*)::INTEGER                                                  AS "totalTransactions",
         COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount END), 0)::INTEGER AS "totalRevenue",
         COUNT(*) FILTER (WHERE status = 'pending')::INTEGER                AS "pendingCount",
         COUNT(*) FILTER (WHERE status = 'failed')::INTEGER                 AS "failedCount"
       FROM transactions
       WHERE business_id = $1`,
      [userId]
    );

    const linksRes = await query(
      `SELECT COUNT(*)::INTEGER AS "activeLinks" FROM payment_links WHERE business_id = $1 AND is_active = TRUE`,
      [userId]
    );

    res.json({
      ...statsRes.rows[0],
      activeLinks: linksRes.rows[0].activeLinks,
    });
  } catch (err) {
    console.error('Business stats error:', err);
    res.status(500).json({ error: 'Failed to fetch business stats' });
  }
});

// ─── GET /api/business/payment-links ─────────────────────────────────────────
router.get('/payment-links', async (req, res) => {
  try {
    const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
    const result = await query(
      `SELECT pl.*,
              COUNT(t.id)::INTEGER AS total_payments,
              COALESCE(SUM(CASE WHEN t.status = 'succeeded' THEN t.amount END), 0)::INTEGER AS revenue
       FROM payment_links pl
       LEFT JOIN transactions t ON t.payment_link_id = pl.id
       WHERE pl.business_id = $1
       GROUP BY pl.id
       ORDER BY pl.created_at DESC`,
      [req.user.id]
    );

    // Attach full payment URL and QR code to each link
    const linksWithQr = await Promise.all(
      result.rows.map(async (link) => {
        const payUrl = `${clientOrigin}/pay/${link.slug}`;
        const qrCode = await QRCode.toDataURL(payUrl, {
          width: 200,
          margin: 1,
          color: { dark: '#1e1b4b', light: '#ffffff' },
        });
        return {
          ...link,
          payUrl,
          qrCode,
        };
      })
    );

    res.json({ links: linksWithQr });
  } catch (err) {
    console.error('Fetch payment links error:', err);
    res.status(500).json({ error: 'Failed to fetch payment links' });
  }
});

// ─── POST /api/business/payment-links ────────────────────────────────────────
router.post(
  '/payment-links',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('amount').optional({ nullable: true }).isInt({ min: 50 }).withMessage('Minimum amount is 50 cents'),
    body('currency').optional().isIn(['usd', 'eur', 'gbp', 'inr']),
    body('description').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description = '', amount = null, currency = 'usd' } = req.body;
    const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

    // Generate unique slug
    const randomHex = crypto.randomBytes(4).toString('hex');
    const slug = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)}-${randomHex}`;

    try {
      const result = await query(
        `INSERT INTO payment_links (business_id, title, description, amount, currency, slug, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         RETURNING *`,
        [req.user.id, title, description, amount, currency, slug]
      );

      const link = result.rows[0];
      const payUrl = `${clientOrigin}/pay/${link.slug}`;
      const qrCode = await QRCode.toDataURL(payUrl, {
        width: 250,
        margin: 2,
        color: { dark: '#1e1b4b', light: '#ffffff' },
      });

      res.status(201).json({
        message: 'Payment link & QR code created!',
        link: {
          ...link,
          payUrl,
          qrCode,
        },
      });
    } catch (err) {
      console.error('Create payment link error:', err);
      res.status(500).json({ error: 'Failed to create payment link' });
    }
  }
);

// ─── PATCH /api/business/payment-links/:id/toggle ───────────────────────────
router.patch('/payment-links/:id/toggle', async (req, res) => {
  try {
    const result = await query(
      `UPDATE payment_links
       SET is_active = NOT is_active
       WHERE id = $1 AND business_id = $2
       RETURNING *`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    res.json({ message: 'Status updated', link: result.rows[0] });
  } catch (err) {
    console.error('Toggle link error:', err);
    res.status(500).json({ error: 'Failed to toggle link status' });
  }
});

// ─── DELETE /api/business/payment-links/:id ──────────────────────────────────
router.delete('/payment-links/:id', async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM payment_links WHERE id = $1 AND business_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    res.json({ message: 'Payment link deleted' });
  } catch (err) {
    console.error('Delete link error:', err);
    res.status(500).json({ error: 'Failed to delete payment link' });
  }
});

// ─── GET /api/business/transactions ──────────────────────────────────────────
router.get('/transactions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT t.*, u.email AS customer_email, pl.title AS link_title
         FROM transactions t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN payment_links pl ON pl.id = t.payment_link_id
         WHERE t.business_id = $1
         ORDER BY t.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      ),
      query(
        'SELECT COUNT(*)::INTEGER AS total FROM transactions WHERE business_id = $1',
        [req.user.id]
      ),
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
    console.error('Business transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;
