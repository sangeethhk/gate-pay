const express = require('express');
const QRCode = require('qrcode');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const crypto = require('crypto');

const router = express.Router();

// ─── Middleware: Authenticate External Merchant API Key ─────────────────────
const authenticateApiKey = async (req, res, next) => {
  const apiKey =
    req.headers['x-api-key'] ||
    (req.headers['authorization'] && req.headers['authorization'].replace('Bearer ', ''));

  if (!apiKey) {
    return res.status(401).json({
      error: 'API key is required. Pass via x-api-key header or Authorization: Bearer <api_key>',
    });
  }

  try {
    const result = await query(
      `SELECT b.*, u.email AS merchant_email, u.id AS merchant_user_id
       FROM businesses b
       JOIN users u ON u.id = b.user_id
       WHERE b.api_key = $1 AND b.is_active = TRUE`,
      [apiKey.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid or inactive API key. Check your API credentials in the Business Portal.',
      });
    }

    req.merchant = result.rows[0];
    next();
  } catch (err) {
    console.error('API key auth error:', err);
    res.status(500).json({ error: 'Failed to authenticate API request' });
  }
};

// ─── 1. POST /api/v1/checkout/sessions (External Website API) ───────────────
// External website calls this to create a payment checkout session for a customer
router.post(
  '/checkout/sessions',
  authenticateApiKey,
  [
    body('amount').isInt({ min: 50 }).withMessage('Amount must be at least 50 (paise/cents)'),
    body('currency').optional().isIn(['inr', 'usd', 'eur', 'gbp']),
    body('orderId').optional().trim(),
    body('description').optional().trim(),
    body('customerEmail').optional().isEmail(),
    body('customerName').optional().trim(),
    body('callbackUrl').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      amount,
      currency = 'inr',
      orderId = `ORD-${Date.now()}`,
      description = 'Website Order',
      customerEmail = '',
      customerName = '',
      callbackUrl = '',
    } = req.body;

    const merchant = req.merchant;
    const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

    try {
      // Generate unique session ID: cs_live_<hex>
      const sessionId = `cs_${crypto.randomBytes(16).toString('hex')}`;

      // Insert checkout session
      await query(
        `INSERT INTO checkout_sessions
           (session_id, business_id, amount, currency, order_id, customer_email, customer_name, description, callback_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
        [sessionId, merchant.user_id, amount, currency, orderId, customerEmail, customerName, description, callbackUrl]
      );

      // Hosted checkout page URL
      const checkoutUrl = `${clientOrigin}/checkout/session/${sessionId}`;

      // Generate UPI Intent and QR code
      const payeeUpi = merchant.upi_id || 'paygateway.merchant@upi';
      const amountRupees = (amount / 100).toFixed(2);
      const upiIntentUri = `upi://pay?pa=${encodeURIComponent(payeeUpi)}&pn=${encodeURIComponent(
        merchant.name
      )}&am=${amountRupees}&cu=INR&tn=${encodeURIComponent(description)}&tr=${sessionId}`;

      const upiQrCode = await QRCode.toDataURL(upiIntentUri, {
        width: 250,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      });

      res.status(201).json({
        sessionId,
        checkoutUrl,
        amount,
        amountFormatted: currency === 'inr' ? `₹${amountRupees}` : `$${amountRupees}`,
        currency,
        orderId,
        status: 'pending',
        upiIntentUri,
        upiQrCode,
        receiverUpi: payeeUpi,
        expiresIn: '30 minutes',
      });
    } catch (err) {
      console.error('Create checkout session error:', err);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  }
);

// ─── 2. GET /api/v1/checkout/sessions/:sessionId (Status Check API) ─────────
// External website polls this or calls it on return to verify payment status
router.get('/checkout/sessions/:sessionId', authenticateApiKey, async (req, res) => {
  try {
    const result = await query(
      `SELECT cs.*, b.name AS merchant_name
       FROM checkout_sessions cs
       JOIN businesses b ON b.user_id = cs.business_id
       WHERE cs.session_id = $1 AND cs.business_id = $2`,
      [req.params.sessionId, req.merchant.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checkout session not found' });
    }

    const session = result.rows[0];

    res.json({
      sessionId: session.session_id,
      orderId: session.order_id,
      amount: session.amount,
      currency: session.currency,
      status: session.status,
      paymentMethod: session.payment_method,
      utrNumber: session.utr_number,
      customerEmail: session.customer_email,
      createdAt: session.created_at,
    });
  } catch (err) {
    console.error('Session status error:', err);
    res.status(500).json({ error: 'Failed to retrieve session status' });
  }
});

// ─── 3. PUBLIC ENDPOINT: GET /api/v1/public/session/:sessionId ──────────────
// The customer's browser loads this when opening /checkout/session/:sessionId
router.get('/public/session/:sessionId', async (req, res) => {
  try {
    const result = await query(
      `SELECT cs.*, b.name AS merchant_name, b.website AS merchant_website, b.upi_id AS merchant_upi
       FROM checkout_sessions cs
       JOIN businesses b ON b.user_id = cs.business_id
       WHERE cs.session_id = $1`,
      [req.params.sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired checkout session' });
    }

    const session = result.rows[0];
    const payeeUpi = session.merchant_upi || 'paygateway.merchant@upi';
    const amountRupees = (session.amount / 100).toFixed(2);

    const upiIntentUri = `upi://pay?pa=${encodeURIComponent(payeeUpi)}&pn=${encodeURIComponent(
      session.merchant_name
    )}&am=${amountRupees}&cu=INR&tn=${encodeURIComponent(session.description || 'Order Payment')}&tr=${session.session_id}`;

    const upiQrCode = await QRCode.toDataURL(upiIntentUri, {
      width: 260,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    res.json({
      session: {
        sessionId: session.session_id,
        amount: session.amount,
        currency: session.currency,
        orderId: session.order_id,
        description: session.description,
        customerEmail: session.customer_email,
        callbackUrl: session.callback_url,
        status: session.status,
        merchantName: session.merchant_name,
        merchantWebsite: session.merchant_website,
        payeeUpi,
        upiIntentUri,
        upiQrCode,
        utrNumber: session.utr_number,
      },
    });
  } catch (err) {
    console.error('Public session error:', err);
    res.status(500).json({ error: 'Failed to fetch session details' });
  }
});

// ─── 4. PUBLIC ENDPOINT: POST /api/v1/public/session/:sessionId/confirm-upi ──
// Customer verifies their UPI payment on the hosted checkout page (Atomic & Idempotent)
router.post('/public/session/:sessionId/confirm-upi', async (req, res) => {
  const { sessionId } = req.params;
  const payerUpiId = req.body.payerUpiId || '';
  let utrNumber = req.body.utrNumber;

  if (!utrNumber || utrNumber.length < 8) {
    utrNumber = `${Math.floor(100000000000 + Math.random() * 900000000000)}`;
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const sessionRes = await client.query(
      'SELECT * FROM checkout_sessions WHERE session_id = $1 FOR UPDATE',
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionRes.rows[0];

    // Idempotent guard: if already succeeded, do not create duplicate transactions
    if (session.status === 'succeeded') {
      await client.query('COMMIT');
      return res.json({
        message: 'Payment already completed successfully!',
        status: 'succeeded',
        utrNumber: session.utr_number || utrNumber,
        callbackUrl: session.callback_url,
      });
    }

    // Update session status
    await client.query(
      `UPDATE checkout_sessions
       SET status = 'succeeded', payment_method = 'upi', utr_number = $1, upi_id = $2
       WHERE session_id = $3`,
      [utrNumber, payerUpiId || session.upi_id || 'customer@upi', sessionId]
    );

    // Also record in central transactions ledger table
    await client.query(
      `INSERT INTO transactions
         (user_id, business_id, stripe_payment_id, amount, currency, status, description, payment_method, upi_id, utr_number)
       VALUES ($1, $2, $3, $4, $5, 'succeeded', $6, 'upi', $7, $8)`,
      [
        session.business_id, // credit to business owner
        session.business_id,
        sessionId,
        session.amount,
        session.currency,
        session.description || `Website Checkout: ${session.order_id}`,
        payerUpiId || 'customer@upi',
        utrNumber,
      ]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Payment completed successfully!',
      status: 'succeeded',
      utrNumber,
      callbackUrl: session.callback_url,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Confirm UPI session error:', err);
    res.status(500).json({ error: 'Failed to confirm UPI payment' });
  } finally {
    client.release();
  }
});

// ─── 5. PUBLIC ENDPOINT: POST /api/v1/public/session/:sessionId/confirm-card ─
// Customer completes card payment on the hosted checkout page (Atomic & Idempotent)
router.post('/public/session/:sessionId/confirm-card', async (req, res) => {
  const { sessionId } = req.params;
  const refId = `CARD-${Date.now()}`;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const sessionRes = await client.query(
      'SELECT * FROM checkout_sessions WHERE session_id = $1 FOR UPDATE',
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionRes.rows[0];

    // Idempotent guard
    if (session.status === 'succeeded') {
      await client.query('COMMIT');
      return res.json({
        message: 'Card payment already confirmed!',
        status: 'succeeded',
        referenceId: session.stripe_payment_id || refId,
        callbackUrl: session.callback_url,
      });
    }

    await client.query(
      `UPDATE checkout_sessions
       SET status = 'succeeded', payment_method = 'card'
       WHERE session_id = $1`,
      [sessionId]
    );

    await client.query(
      `INSERT INTO transactions
         (user_id, business_id, stripe_payment_id, amount, currency, status, description, payment_method)
       VALUES ($1, $2, $3, $4, $5, 'succeeded', $6, 'card')`,
      [
        session.business_id,
        session.business_id,
        refId,
        session.amount,
        session.currency,
        session.description || `Card Checkout: ${session.order_id}`,
      ]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Card payment confirmed!',
      status: 'succeeded',
      referenceId: refId,
      callbackUrl: session.callback_url,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Confirm card session error:', err);
    res.status(500).json({ error: 'Failed to confirm card payment' });
  } finally {
    client.release();
  }
});

module.exports = router;
