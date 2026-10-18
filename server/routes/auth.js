const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { verifyPreAuth, verifyToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// ─── Helpers: generate JWTs ───────────────────────────────────────────────────

const generateAccessToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

const generateRefreshToken = (user) =>
  jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

const generatePreAuthToken = (userId) =>
  jwt.sign(
    { userId, step: 'pre-auth' },
    process.env.JWT_PREAUTH_SECRET,
    { expiresIn: '10m' }
  );

// ─── GET /api/auth/register-qr ───────────────────────────────────────────────
// Generates a QR Code for mobile registration (users can scan on their phone)
router.get('/register-qr', async (req, res) => {
  try {
    const role = req.query.role || 'client';
    const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
    const registerUrl = `${clientOrigin}/register?role=${encodeURIComponent(role)}`;

    const qrCodeDataUrl = await QRCode.toDataURL(registerUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#1e1b4b', light: '#ffffff' },
    });

    res.json({
      registerUrl,
      qrCode: qrCodeDataUrl,
      role,
    });
  } catch (err) {
    console.error('Register QR error:', err);
    res.status(500).json({ error: 'Failed to generate registration QR code' });
  }
});

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post(
  '/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('role')
      .optional()
      .isIn(['client', 'business', 'admin'])
      .withMessage('Role must be client, business, or admin'),
    body('businessName')
      .optional()
      .trim()
      .isLength({ max: 100 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, role = 'client', businessName, website, description, adminSecret } = req.body;

    // Safety: only allow admin registration if matching ADMIN_SECRET
    if (role === 'admin') {
      if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ error: 'Unauthorized: valid admin secret is required to register an admin' });
      }
    }

    try {
      // Check if user already exists
      const existing = await query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Generate TOTP secret
      const secret = speakeasy.generateSecret({
        name: `PayGateway [${role.toUpperCase()}] (${email})`,
        issuer: 'PayGateway',
        length: 20,
      });

      // Insert user
      const result = await query(
        `INSERT INTO users (email, password, totp_secret, role, is_verified, is_active)
         VALUES ($1, $2, $3, $4, FALSE, TRUE)
         RETURNING id, email, role`,
        [email, hashedPassword, secret.base32, role]
      );
      const user = result.rows[0];

      // If business role, create business profile record
      let businessProfile = null;
      if (role === 'business') {
        const bName = businessName && businessName.trim() ? businessName.trim() : `${email.split('@')[0]} Enterprises`;
        const bRes = await query(
          `INSERT INTO businesses (user_id, name, description, website)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [user.id, bName, description || 'Official Merchant Business Profile', website || '']
        );
        businessProfile = bRes.rows[0];
      }

      // Generate 2FA QR code as Data URL
      const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url, {
        width: 256,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      });

      res.status(201).json({
        message: 'Account created! Scan the QR code with your Authenticator app (Google Authenticator / Authy).',
        userId: user.id,
        role: user.role,
        business: businessProfile,
        qrCode: qrCodeDataUrl,
        otpauthUrl: secret.otpauth_url,
        manualKey: secret.base32,
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  }
);

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const result = await query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      const user = result.rows[0];

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (!user.is_active) {
        return res.status(403).json({ error: 'Account has been deactivated. Please contact an administrator.' });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Password OK — issue pre-auth token, require 2FA next
      const preAuthToken = generatePreAuthToken(user.id);

      res.json({
        message: 'Password verified. Enter your 2FA code to continue.',
        preAuthToken,
        requires2FA: true,
        role: user.role,
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  }
);

// ─── POST /api/auth/verify-2fa ───────────────────────────────────────────────
router.post(
  '/verify-2fa',
  authLimiter,
  verifyPreAuth,
  [body('token').isLength({ min: 6, max: 6 }).isNumeric().withMessage('6-digit code required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token } = req.body;
    const userId = req.preAuth.userId;

    try {
      const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = result.rows[0];

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.is_active) {
        return res.status(403).json({ error: 'Account is deactivated' });
      }

      // Verify TOTP
      const verified = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: 'base32',
        token,
        window: 1,
      });

      if (!verified) {
        return res.status(401).json({ error: 'Invalid or expired 2FA code' });
      }

      if (!user.is_verified) {
        await query('UPDATE users SET is_verified = TRUE WHERE id = $1', [userId]);
      }

      // Fetch business profile if business role
      let businessProfile = null;
      if (user.role === 'business') {
        const bRes = await query('SELECT * FROM businesses WHERE user_id = $1', [userId]);
        businessProfile = bRes.rows[0] || null;
      }

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Save refresh token
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [userId, refreshToken, expiresAt]
      );

      res.json({
        message: 'Authentication successful!',
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          business: businessProfile,
        },
      });
    } catch (err) {
      console.error('Verify 2FA error:', err);
      res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
  }
);

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const userRes = await query(
      'SELECT id, email, role, is_active, is_verified, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let business = null;
    if (user.role === 'business') {
      const bRes = await query('SELECT * FROM businesses WHERE user_id = $1', [user.id]);
      business = bRes.rows[0] || null;
    }

    res.json({
      user: {
        ...user,
        business,
      },
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    const storedResult = await query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2',
      [refreshToken, decoded.id]
    );
    const storedToken = storedResult.rows[0];

    if (!storedToken || new Date(storedToken.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }

    const userResult = await query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const user = userResult.rows[0];

    if (!user || !user.is_active) {
      return res.status(403).json({ error: 'User account disabled' });
    }

    const newAccessToken = generateAccessToken(user);

    res.json({ accessToken: newAccessToken });
  } catch {
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    try {
      await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    } catch { /* Non-critical */ }
  }
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
