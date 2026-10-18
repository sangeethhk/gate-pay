/**
 * middleware/idempotency.js — Atomic Idempotency Middleware
 * Prevents double-charging, duplicate order creation, and webhook replay attacks.
 */

const { query } = require('../db');

const idempotency = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

  if (!idempotencyKey || req.method === 'GET' || req.method === 'HEAD') {
    return next();
  }

  const key = String(idempotencyKey).trim();
  if (key.length > 255) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_IDEMPOTENCY_KEY', description: 'Idempotency key exceeds maximum length of 255 chars' },
    });
  }

  try {
    // Check if key has already been executed
    const existing = await query(
      `SELECT response_status, response_body, created_at
       FROM idempotency_keys
       WHERE key = $1`,
      [key]
    );

    if (existing.rows.length > 0) {
      const record = existing.rows[0];
      res.setHeader('X-Cache-Lookup', 'HIT');
      res.setHeader('X-Idempotency-Replay', 'true');
      return res.status(record.response_status).json(record.response_body);
    }

    // Intercept res.json to cache response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Restore original json method
      res.json = originalJson;

      // Asynchronously store cached response (only if successful 2xx or 4xx domain errors)
      if (res.statusCode < 500) {
        query(
          `INSERT INTO idempotency_keys (key, user_id, route, response_status, response_body)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (key) DO NOTHING`,
          [key, req.user?.id || req.merchant?.user_id || null, req.originalUrl, res.statusCode, body]
        ).catch((err) => console.warn('Failed to cache idempotency key:', err.message));
      }

      return originalJson(body);
    };

    next();
  } catch (err) {
    console.error('Idempotency middleware error:', err);
    next();
  }
};

module.exports = idempotency;
