const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');

const router = express.Router();

// ─── Helpers: ID Generators Matching Razorpay Standards ──────────────────────
const generateId = (prefix) => {
  const randomChars = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${randomChars}`;
};

// ─── Helper: Asynchronous Webhook Dispatcher ─────────────────────────────────
const dispatchWebhook = async (merchant, eventName, entityType, entityData) => {
  if (!merchant.webhook_url) return;

  const webhookSecret = merchant.webhook_secret || merchant.rzp_key_secret || 'whsec_default';
  const timestamp = Math.floor(Date.now() / 1000);

  const payload = {
    entity: 'event',
    account_id: `acc_${merchant.id}`,
    event: eventName,
    contains: [entityType],
    payload: {
      [entityType]: {
        entity: entityData,
      },
    },
    created_at: timestamp,
  };

  const payloadString = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', webhookSecret).update(payloadString).digest('hex');

  try {
    const response = await fetch(merchant.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': signature,
        'X-Razorpay-Event-Id': `evt_${crypto.randomBytes(8).toString('hex')}`,
        'User-Agent': 'Razorpay-Webhook-Engine/v1.0',
      },
      body: payloadString,
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    await query(
      `INSERT INTO webhook_deliveries (business_id, event, payload, signature, response_status, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [merchant.user_id, eventName, payload, signature, response.status, response.ok ? 'delivered' : 'failed']
    );
  } catch (err) {
    console.warn(`Webhook dispatch to ${merchant.webhook_url} failed:`, err.message);
    await query(
      `INSERT INTO webhook_deliveries (business_id, event, payload, signature, response_status, status)
       VALUES ($1, $2, $3, $4, 0, 'failed')`,
      [merchant.user_id, eventName, payload, signature]
    );
  }
};

// ─── Middleware: Razorpay Authentication (Basic Auth / Headers) ─────────────
const authenticateRazorpay = async (req, res, next) => {
  let keyId = '';
  let keySecret = '';

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Basic ')) {
    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString('ascii');
    const parts = credentials.split(':');
    keyId = parts[0];
    keySecret = parts[1] || '';
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    keyId = authHeader.split(' ')[1];
  } else {
    keyId = req.headers['x-razorpay-key'] || req.headers['x-api-key'] || '';
    keySecret = req.headers['x-razorpay-secret'] || '';
  }

  if (!keyId) {
    return res.status(401).json({
      error: {
        code: 'BAD_REQUEST_ERROR',
        description: 'Authentication failed. Provide your Razorpay Key ID via HTTP Basic Auth or X-Razorpay-Key header.',
      },
    });
  }

  try {
    const result = await query(
      `SELECT b.*, u.email AS merchant_email, u.id AS merchant_user_id
       FROM businesses b
       JOIN users u ON u.id = b.user_id
       WHERE (b.rzp_key_id = $1 OR b.api_key = $1) AND b.is_active = TRUE`,
      [keyId.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED_ERROR',
          description: 'The Key ID provided is invalid or does not exist.',
        },
      });
    }

    const merchant = result.rows[0];

    // If keySecret is provided, verify it matches
    if (keySecret) {
      const validSecret = merchant.rzp_key_secret || merchant.api_secret;
      if (validSecret && keySecret.trim() !== validSecret.trim()) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED_ERROR',
            description: 'The Key Secret provided is invalid.',
          },
        });
      }
    }

    req.merchant = merchant;
    next();
  } catch (err) {
    console.error('Razorpay auth error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', description: 'Internal server error' } });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ORDERS API
// ═══════════════════════════════════════════════════════════════════════════════

// POST /v1/orders — Create a Razorpay Order
router.post('/orders', authenticateRazorpay, async (req, res) => {
  const { amount, currency = 'INR', receipt = `rcpt_${Date.now()}`, notes = {}, partial_payment = false } = req.body;

  if (!amount || isNaN(amount) || amount < 100) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST_ERROR',
        description: 'Amount must be passed as an integer in paise (minimum 100 paise = ₹1.00)',
      },
    });
  }

  const orderId = generateId('order');
  const amountInt = parseInt(amount, 10);
  const curr = currency.toUpperCase();

  try {
    const result = await query(
      `INSERT INTO orders (id, business_id, amount, amount_paid, amount_due, currency, receipt, status, notes)
       VALUES ($1, $2, $3, 0, $3, $4, $5, 'created', $6)
       RETURNING *`,
      [orderId, req.merchant.user_id, amountInt, curr, receipt, JSON.stringify(notes)]
    );

    const order = result.rows[0];

    const response = {
      id: order.id,
      entity: 'order',
      amount: order.amount,
      amount_paid: order.amount_paid,
      amount_due: order.amount_due,
      currency: order.currency,
      receipt: order.receipt,
      offer_id: null,
      status: order.status,
      attempts: order.attempts,
      notes: typeof order.notes === 'string' ? JSON.parse(order.notes) : order.notes,
      created_at: Math.floor(new Date(order.created_at).getTime() / 1000),
    };

    res.status(201).json(response);
  } catch (err) {
    console.error('Create Razorpay order error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', description: 'Failed to create order' } });
  }
});

// GET /v1/orders — List Orders
router.get('/orders', authenticateRazorpay, async (req, res) => {
  const count = parseInt(req.query.count, 10) || 20;
  const skip = parseInt(req.query.skip, 10) || 0;

  try {
    const result = await query(
      `SELECT * FROM orders
       WHERE business_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.merchant.user_id, count, skip]
    );

    const items = result.rows.map((order) => ({
      id: order.id,
      entity: 'order',
      amount: order.amount,
      amount_paid: order.amount_paid,
      amount_due: order.amount_due,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status,
      attempts: order.attempts,
      notes: typeof order.notes === 'string' ? JSON.parse(order.notes) : order.notes,
      created_at: Math.floor(new Date(order.created_at).getTime() / 1000),
    }));

    res.json({
      entity: 'collection',
      count: items.length,
      items,
    });
  } catch (err) {
    console.error('List Razorpay orders error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', description: 'Failed to fetch orders' } });
  }
});

// GET /v1/orders/:id — Fetch Single Order
router.get('/orders/:id', authenticateRazorpay, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM orders WHERE id = $1 AND business_id = $2`,
      [req.params.id, req.merchant.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'BAD_REQUEST_ERROR', description: `Order ${req.params.id} does not exist` },
      });
    }

    const order = result.rows[0];
    res.json({
      id: order.id,
      entity: 'order',
      amount: order.amount,
      amount_paid: order.amount_paid,
      amount_due: order.amount_due,
      currency: order.currency,
      receipt: order.receipt,
      offer_id: null,
      status: order.status,
      attempts: order.attempts,
      notes: typeof order.notes === 'string' ? JSON.parse(order.notes) : order.notes,
      created_at: Math.floor(new Date(order.created_at).getTime() / 1000),
    });
  } catch (err) {
    console.error('Fetch order error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', description: 'Failed to fetch order' } });
  }
});

// GET /v1/orders/:id/payments — Fetch Payments for an Order
router.get('/orders/:id/payments', authenticateRazorpay, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM payments WHERE order_id = $1 AND business_id = $2 ORDER BY created_at DESC`,
      [req.params.id, req.merchant.user_id]
    );

    const items = result.rows.map((p) => formatPaymentEntity(p));
    res.json({ entity: 'collection', count: items.length, items });
  } catch (err) {
    console.error('Fetch order payments error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', description: 'Failed to fetch order payments' } });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PAYMENTS API
// ═══════════════════════════════════════════════════════════════════════════════

const formatPaymentEntity = (p) => ({
  id: p.id,
  entity: 'payment',
  amount: p.amount,
  currency: p.currency,
  status: p.status,
  order_id: p.order_id,
  invoice_id: null,
  international: false,
  method: p.method,
  amount_refunded: p.amount_refunded,
  refund_status: p.refund_status,
  captured: p.captured,
  description: p.description,
  card_id: p.card_network ? `card_${p.id}` : null,
  bank: p.bank,
  wallet: p.wallet,
  vpa: p.vpa,
  email: p.email,
  contact: p.contact,
  notes: typeof p.notes === 'string' ? JSON.parse(p.notes) : p.notes,
  fee: p.fee,
  tax: p.tax,
  error_code: p.error_code,
  error_description: p.error_description,
  acquirer_data: {
    rrn: p.utr,
    upi_transaction_id: p.utr,
  },
  created_at: Math.floor(new Date(p.created_at).getTime() / 1000),
});

// GET /v1/payments — List Payments
router.get('/payments', authenticateRazorpay, async (req, res) => {
  const count = parseInt(req.query.count, 10) || 20;
  const skip = parseInt(req.query.skip, 10) || 0;

  try {
    const result = await query(
      `SELECT * FROM payments
       WHERE business_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.merchant.user_id, count, skip]
    );

    const items = result.rows.map(formatPaymentEntity);
    res.json({ entity: 'collection', count: items.length, items });
  } catch (err) {
    console.error('List payments error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', description: 'Failed to list payments' } });
  }
});

// GET /v1/payments/:id — Fetch Single Payment
router.get('/payments/:id', authenticateRazorpay, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM payments WHERE id = $1 AND business_id = $2`,
      [req.params.id, req.merchant.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'BAD_REQUEST_ERROR', description: `Payment ${req.params.id} does not exist` },
      });
    }

    res.json(formatPaymentEntity(result.rows[0]));
  } catch (err) {
    console.error('Fetch payment error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', description: 'Failed to fetch payment' } });
  }
});

// POST /v1/payments/:id/capture — Capture Payment (Concurrency & Idempotency Hardened)
router.post('/payments/:id/capture', authenticateRazorpay, async (req, res) => {
  const { amount, currency = 'INR' } = req.body;
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT * FROM payments WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [req.params.id, req.merchant.user_id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: { code: 'BAD_REQUEST_ERROR', description: 'Payment not found' },
      });
    }

    const payment = result.rows[0];
    if (payment.status === 'captured') {
      await client.query('COMMIT');
      return res.json(formatPaymentEntity(payment));
    }

    const updated = await client.query(
      `UPDATE payments SET status = 'captured', captured = TRUE WHERE id = $1 RETURNING *`,
      [payment.id]
    );

    await client.query('COMMIT');

    const capturedPayment = updated.rows[0];
    dispatchWebhook(req.merchant, 'payment.captured', 'payment', formatPaymentEntity(capturedPayment));

    res.json(formatPaymentEntity(capturedPayment));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Capture payment error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', description: 'Failed to capture payment' } });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. REFUNDS API
// ═══════════════════════════════════════════════════════════════════════════════

// POST /v1/payments/:id/refund & POST /v1/refunds — Initiate Refund (Race Condition Hardened)
router.post(['/payments/:id/refund', '/refunds'], authenticateRazorpay, async (req, res) => {
  const paymentId = req.params.id || req.body.payment_id;
  const { amount, notes = {}, speed = 'normal', receipt = `rfnd_rcpt_${Date.now()}` } = req.body;

  if (!paymentId) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST_ERROR', description: 'payment_id is required' },
    });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Acquire exclusive row-level lock on payment record to prevent race conditions & double refunding
    const pResult = await client.query(
      `SELECT * FROM payments WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [paymentId, req.merchant.user_id]
    );

    if (pResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: { code: 'BAD_REQUEST_ERROR', description: 'Payment does not exist' },
      });
    }

    const payment = pResult.rows[0];
    const refundableAmount = payment.amount - payment.amount_refunded;
    const refundAmount = amount ? parseInt(amount, 10) : refundableAmount;

    if (refundAmount <= 0 || refundAmount > refundableAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'The refund amount exceeds the refundable amount for this payment',
        },
      });
    }

    const refundId = generateId('rfnd');

    // Create refund record
    const rResult = await client.query(
      `INSERT INTO refunds (id, payment_id, business_id, amount, currency, status, speed, receipt, notes)
       VALUES ($1, $2, $3, $4, $5, 'processed', $6, $7, $8)
       RETURNING *`,
      [refundId, payment.id, req.merchant.user_id, refundAmount, payment.currency, speed, receipt, JSON.stringify(notes)]
    );

    // Update payment record atomically
    const newRefunded = payment.amount_refunded + refundAmount;
    const newStatus = newRefunded >= payment.amount ? 'refunded' : payment.status;
    const newRefundStatus = newRefunded >= payment.amount ? 'full' : 'partial';

    await client.query(
      `UPDATE payments
       SET amount_refunded = $1, status = $2, refund_status = $3
       WHERE id = $4`,
      [newRefunded, newStatus, newRefundStatus, payment.id]
    );

    await client.query('COMMIT');

    const refund = rResult.rows[0];
    const refundEntity = {
      id: refund.id,
      entity: 'refund',
      amount: refund.amount,
      currency: refund.currency,
      payment_id: refund.payment_id,
      notes: typeof refund.notes === 'string' ? JSON.parse(refund.notes) : refund.notes,
      receipt: refund.receipt,
      speed_processed: refund.speed,
      status: refund.status,
      created_at: Math.floor(new Date(refund.created_at).getTime() / 1000),
    };

    dispatchWebhook(req.merchant, 'refund.processed', 'refund', refundEntity);

    res.status(201).json(refundEntity);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Refund creation error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', description: 'Failed to process refund' } });
  } finally {
    client.release();
  }
});

// GET /v1/refunds — List Refunds
router.get('/refunds', authenticateRazorpay, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM refunds WHERE business_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [req.merchant.user_id]
    );

    const items = result.rows.map((r) => ({
      id: r.id,
      entity: 'refund',
      amount: r.amount,
      currency: r.currency,
      payment_id: r.payment_id,
      notes: typeof r.notes === 'string' ? JSON.parse(r.notes) : r.notes,
      receipt: r.receipt,
      speed_processed: r.speed,
      status: r.status,
      created_at: Math.floor(new Date(r.created_at).getTime() / 1000),
    }));

    res.json({ entity: 'collection', count: items.length, items });
  } catch (err) {
    console.error('List refunds error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', description: 'Failed to fetch refunds' } });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CUSTOMERS API
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/customers', authenticateRazorpay, async (req, res) => {
  const { name, email, contact, gstin = '', notes = {} } = req.body;
  const customerId = generateId('cust');

  try {
    const result = await query(
      `INSERT INTO customers (id, business_id, name, email, contact, gstin, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [customerId, req.merchant.user_id, name, email, contact, gstin, JSON.stringify(notes)]
    );

    const c = result.rows[0];
    res.status(201).json({
      id: c.id,
      entity: 'customer',
      name: c.name,
      email: c.email,
      contact: c.contact,
      gstin: c.gstin,
      notes: typeof c.notes === 'string' ? JSON.parse(c.notes) : c.notes,
      created_at: Math.floor(new Date(c.created_at).getTime() / 1000),
    });
  } catch (err) {
    console.error('Create customer error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', description: 'Failed to create customer' } });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. PUBLIC CHECKOUT MODAL SUPPORT (For Razorpay checkout.js Standard Checkout)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /v1/checkout/order-info/:orderId — Loads details for the Razorpay Checkout Modal
router.get('/checkout/order-info/:orderId', async (req, res) => {
  try {
    const result = await query(
      `SELECT o.*, b.name AS merchant_name, b.upi_id AS merchant_upi, b.website AS merchant_website,
              b.rzp_key_id, b.rzp_key_secret, b.api_secret
       FROM orders o
       JOIN businesses b ON b.user_id = o.business_id
       WHERE o.id = $1`,
      [req.params.orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found or invalid' });
    }

    const order = result.rows[0];
    const payeeUpi = order.merchant_upi || 'razorpay.merchant@upi';
    const amountRupees = (order.amount / 100).toFixed(2);

    const upiIntentUri = `upi://pay?pa=${encodeURIComponent(payeeUpi)}&pn=${encodeURIComponent(
      order.merchant_name
    )}&am=${amountRupees}&cu=INR&tn=${encodeURIComponent('Order ' + order.id)}&tr=${order.id}`;

    const upiQrCode = await QRCode.toDataURL(upiIntentUri, {
      width: 250,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    res.json({
      order: {
        id: order.id,
        amount: order.amount,
        amountFormatted: `₹${amountRupees}`,
        currency: order.currency,
        status: order.status,
        merchantName: order.merchant_name,
        merchantWebsite: order.merchant_website,
        payeeUpi,
        upiIntentUri,
        upiQrCode,
      },
    });
  } catch (err) {
    console.error('Order info error:', err);
    res.status(500).json({ error: 'Failed to retrieve order details' });
  }
});

// POST /v1/checkout/process — Process Payment from Modal & Return Razorpay Signature (Atomic & Idempotent)
router.post('/checkout/process', async (req, res) => {
  const {
    orderId,
    method = 'upi', // upi, card, netbanking, wallet
    email = 'customer@example.com',
    contact = '+919876543210',
    vpa = '',
    bank = '',
    wallet = '',
    cardLast4 = '4242',
    cardNetwork = 'Visa',
  } = req.body;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const oRes = await client.query(
      `SELECT o.*, b.rzp_key_secret, b.api_secret, b.webhook_secret, b.webhook_url, b.id AS business_record_id, b.user_id AS merchant_user_id
       FROM orders o
       JOIN businesses b ON b.user_id = o.business_id
       WHERE o.id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (oRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = oRes.rows[0];
    const secret = order.rzp_key_secret || order.api_secret || 'secret_key';

    // Idempotent guard: if order is already paid, return existing payment record without double charging
    if (order.status === 'paid') {
      const existingPaymentRes = await client.query(
        `SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [order.id]
      );

      if (existingPaymentRes.rows.length > 0) {
        await client.query('COMMIT');
        const payment = existingPaymentRes.rows[0];
        const paymentEntity = formatPaymentEntity(payment);
        const signaturePayload = `${order.id}|${payment.id}`;
        const razorpaySignature = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');

        return res.json({
          success: true,
          razorpay_payment_id: payment.id,
          razorpay_order_id: order.id,
          razorpay_signature: razorpaySignature,
          payment: paymentEntity,
        });
      }
    }

    const paymentId = generateId('pay');
    const utr = `${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    // Zero Fees & Zero Tax (100% direct settlement to merchant without deductions)
    const fee = 0;
    const tax = 0;

    // Insert payment
    const pRes = await client.query(
      `INSERT INTO payments
         (id, order_id, business_id, amount, currency, status, method, captured, vpa, email, contact, bank, wallet, utr, card_network, card_last4, fee, tax, notes)
       VALUES
         ($1, $2, $3, $4, $5, 'captured', $6, TRUE, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        paymentId,
        order.id,
        order.business_id,
        order.amount,
        order.currency,
        method,
        vpa || (method === 'upi' ? 'customer@okaxis' : null),
        email,
        contact,
        bank || null,
        wallet || null,
        utr,
        cardNetwork,
        cardLast4,
        fee,
        tax,
        order.notes || '{}',
      ]
    );

    // Update order to paid
    await client.query(
      `UPDATE orders
       SET amount_paid = amount, amount_due = 0, status = 'paid', attempts = attempts + 1
       WHERE id = $1`,
      [order.id]
    );

    await client.query('COMMIT');

    // Generate Official Razorpay HMAC-SHA256 Signature
    // Format: HMAC_SHA256(order_id + "|" + razorpay_payment_id, secret)
    const signaturePayload = `${order.id}|${paymentId}`;
    const razorpaySignature = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');

    const payment = pRes.rows[0];
    const paymentEntity = formatPaymentEntity(payment);

    // Fire webhooks asynchronously
    const merchantMock = {
      id: order.business_record_id,
      user_id: order.merchant_user_id,
      webhook_url: order.webhook_url,
      webhook_secret: order.webhook_secret || secret,
      rzp_key_secret: secret,
    };
    dispatchWebhook(merchantMock, 'payment.captured', 'payment', paymentEntity);
    dispatchWebhook(merchantMock, 'order.paid', 'order', {
      id: order.id,
      amount: order.amount,
      amount_paid: order.amount,
      status: 'paid',
    });

    res.json({
      success: true,
      razorpay_payment_id: paymentId,
      razorpay_order_id: order.id,
      razorpay_signature: razorpaySignature,
      payment: paymentEntity,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Process payment error:', err);
    res.status(500).json({ error: 'Failed to process payment' });
  } finally {
    client.release();
  }
});

// POST /v1/signature/verify — Utility endpoint to verify Razorpay signature
router.post('/signature/verify', (req, res) => {
  const { orderId, paymentId, signature, secret } = req.body;

  if (!orderId || !paymentId || !signature || !secret) {
    return res.status(400).json({
      valid: false,
      error: 'Missing parameters. Provide orderId, paymentId, signature, and secret.',
    });
  }

  const expected = crypto.createHmac('sha256', secret.trim()).update(`${orderId.trim()}|${paymentId.trim()}`).digest('hex');
  const isValid = expected === signature.trim();

  res.json({
    valid: isValid,
    expectedSignature: expected,
    providedSignature: signature.trim(),
  });
});

// GET /v1/demo-config — Public config for sample storefront testing
router.get('/demo-config', async (req, res) => {
  try {
    const result = await query(
      `SELECT name, rzp_key_id, upi_id FROM businesses WHERE rzp_key_id IS NOT NULL AND is_active = TRUE LIMIT 1`
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active merchant found' });
    }
    const b = result.rows[0];
    res.json({
      merchantName: b.name,
      keyId: b.rzp_key_id,
      upiId: b.upi_id,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch demo configuration' });
  }
});

// POST /v1/demo/create-order — Public helper for the demo storefront
router.post('/demo/create-order', async (req, res) => {
  const { amount = 149900, currency = 'INR', receipt = `APEX_${Date.now()}`, notes = {} } = req.body;
  try {
    const bRes = await query(`SELECT * FROM businesses WHERE rzp_key_id IS NOT NULL AND is_active = TRUE LIMIT 1`);
    if (bRes.rows.length === 0) return res.status(404).json({ error: 'No active merchant found' });
    const merchant = bRes.rows[0];

    const orderId = generateId('order');
    const amountInt = parseInt(amount, 10);
    const curr = currency.toUpperCase();

    const result = await query(
      `INSERT INTO orders (id, business_id, amount, amount_paid, amount_due, currency, receipt, status, notes)
       VALUES ($1, $2, $3, 0, $3, $4, $5, 'created', $6)
       RETURNING *`,
      [orderId, merchant.user_id, amountInt, curr, receipt, JSON.stringify(notes)]
    );

    const order = result.rows[0];
    res.status(201).json({
      id: order.id,
      entity: 'order',
      amount: order.amount,
      amount_paid: 0,
      amount_due: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status,
      notes: typeof order.notes === 'string' ? JSON.parse(order.notes) : order.notes,
      keyId: merchant.rzp_key_id,
      merchantName: merchant.name,
    });
  } catch (err) {
    console.error('Demo order error:', err);
    res.status(500).json({ error: 'Failed to create demo order' });
  }
});

module.exports = router;
