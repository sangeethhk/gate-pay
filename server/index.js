// Validate runtime environment schema before application bootstrap
const env = require('./config/env');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { testConnection } = require('./db');
const idempotency = require('./middleware/idempotency');
const { errorHandler } = require('./middleware/errorHandler');

const path = require('path');
const authRoutes       = require('./routes/auth');
const paymentRoutes    = require('./routes/payments');
const businessRoutes   = require('./routes/business');
const adminRoutes      = require('./routes/admin');
const apiGatewayRoutes = require('./routes/apiGateway');
const razorpayRoutes   = require('./routes/razorpay');

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ──────────────────────────────────────────────────────

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: '*', // Allow external websites to call the payment gateway API
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(idempotency);

// ─── Embeddable JavaScript SDK for External Websites ────────────────────────
app.get('/sdk/paygateway.js', (req, res) => {
  const origin = req.protocol + '://' + req.get('host');
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
(function(window) {
  'use strict';
  window.PayGateway = {
    checkout: function(options) {
      if (!options || !options.apiKey) {
        console.error('PayGateway: apiKey is required');
        return;
      }

      var amount = options.amount || 100;
      var currency = options.currency || 'INR';

      fetch('${origin}/api/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': options.apiKey
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          orderId: options.orderId || ('ORD_' + Date.now()),
          description: options.description || 'Website Checkout',
          customerEmail: options.customerEmail || '',
          customerName: options.customerName || '',
          callbackUrl: options.callbackUrl || window.location.href
        })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.checkoutUrl) {
          if (options.mode === 'modal') {
            // Open in popup modal iframe
            var overlay = document.createElement('div');
            overlay.id = 'pg-overlay';
            overlay.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = '<div style="position:relative;width:95%;max-width:440px;height:650px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);"><button onclick="document.body.removeChild(document.getElementById(\\'pg-overlay\\'))" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:18px;cursor:pointer;z-index:10;">✕</button><iframe src="' + data.checkoutUrl + '" style="width:100%;height:100%;border:none;"></iframe></div>';
            document.body.appendChild(overlay);
          } else {
            // Redirect
            window.location.href = data.checkoutUrl;
          }
        } else {
          alert(data.error || 'Failed to initiate payment');
        }
      })
      .catch(function(err) {
        console.error('PayGateway Error:', err);
        alert('Payment gateway connection error');
      });
    }
  };
})(window);
  `);
});

// ─── Razorpay Drop-in Standard Checkout SDK & Real-World Demo Store ─────────
app.get(['/v1/checkout.js', '/checkout.js'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout.js'));
});

app.get(['/demo', '/store'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'demo_store.html'));
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth',     authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/v1',       apiGatewayRoutes);
app.use('/v1',           razorpayRoutes); // Standard Razorpay v1 REST API
app.use('/api/razorpay/v1', razorpayRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      description: `Endpoint ${req.method} ${req.originalUrl} not found`,
      timestamp: Math.floor(Date.now() / 1000),
    },
  });
});

// ─── Unified FinTech Error Handler & PII Scrubber ────────────────────────────
app.use(errorHandler);

// ─── Start: connect to DB first, then listen ─────────────────────────────────

(async () => {
  await testConnection(); // Will exit(1) if DB unreachable
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Health: http://localhost:${PORT}/api/health`);
  });
})();
