const jwt = require('jsonwebtoken');
const { query } = require('../db');

/**
 * Middleware: Verify full JWT access token.
 * Attaches decoded user payload to req.user and verifies active status.
 */
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user is still active in DB
    const userRes = await query('SELECT id, email, role, is_active FROM users WHERE id = $1', [decoded.id]);
    const user = userRes.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact support.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

/**
 * Middleware: Require one or more specific roles.
 * Usage: requireRole(['admin']), requireRole(['business', 'admin']), etc.
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Requires one of [${roles.join(', ')}] role. Current role: ${req.user.role}`,
      });
    }

    next();
  };
};

/**
 * Middleware: Verify pre-auth JWT (issued after password check, before 2FA).
 * Attaches decoded payload to req.preAuth.
 */
const verifyPreAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Pre-auth token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_PREAUTH_SECRET);
    req.preAuth = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired pre-auth token' });
  }
};

module.exports = { verifyToken, requireRole, verifyPreAuth };
