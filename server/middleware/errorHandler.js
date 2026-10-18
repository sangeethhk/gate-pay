/**
 * middleware/errorHandler.js — Unified FinTech Error Handler & PII Scrubber
 * Standardizes error responses into clean JSON schemas and strips sensitive customer/card data.
 */

const PII_FIELDS = ['password', 'totp_secret', 'token', 'cvv', 'cvc', 'pan', 'card_number', 'secret', 'api_secret'];

function scrubPII(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const scrubbed = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of Object.keys(scrubbed)) {
    if (PII_FIELDS.includes(key.toLowerCase())) {
      scrubbed[key] = '[REDACTED]';
    } else if (typeof scrubbed[key] === 'object') {
      scrubbed[key] = scrubPII(scrubbed[key]);
    }
  }
  return scrubbed;
}

const errorHandler = (err, req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';
  const statusCode = err.status || err.statusCode || 500;

  // Log error safely without leaking credentials
  const safeLog = {
    method: req.method,
    url: req.originalUrl,
    status: statusCode,
    message: err.message,
    timestamp: new Date().toISOString(),
  };

  if (!isProd) {
    safeLog.stack = err.stack;
  }
  console.error('⚠️ [API ERROR]', JSON.stringify(safeLog));

  // Determine standard error code
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  let description = err.message || 'An unexpected error occurred. Please contact support.';

  if (statusCode === 404) {
    errorCode = 'RESOURCE_NOT_FOUND';
  } else if (statusCode === 401) {
    errorCode = 'UNAUTHORIZED_ACCESS';
  } else if (statusCode === 403) {
    errorCode = 'FORBIDDEN_OPERATION';
  } else if (statusCode === 400 || statusCode === 422) {
    errorCode = 'VALIDATION_ERROR';
  }

  // Prevent internal SQL syntax or connection strings from leaking in production
  if (isProd && statusCode === 500) {
    description = 'Internal payment gateway error. Transaction aborted.';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      description,
      timestamp: Math.floor(Date.now() / 1000),
      reference: req.id || undefined,
    },
  });
};

module.exports = {
  errorHandler,
  scrubPII,
};
