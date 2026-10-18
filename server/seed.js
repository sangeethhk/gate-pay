/**
 * seed.js — Creates the first admin user.
 * Run once: node seed.js
 *
 * Uses ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_SECRET from .env
 * ADMIN_SECRET must match what's in .env to prevent unauthorized seeding.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { pool, query } = require('./db');

async function seed() {
  const email    = process.env.ADMIN_EMAIL    || 'admin@paygateway.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const secret   = process.env.ADMIN_SECRET;

  if (!secret) {
    console.error('❌ ADMIN_SECRET not set in .env — aborting for safety.');
    process.exit(1);
  }

  try {
    // Check if admin already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      console.log('ℹ️  Admin user already exists:', email);
      await pool.end();
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const totpSecret = speakeasy.generateSecret({
      name: `PayGateway Admin (${email})`,
      issuer: 'PayGateway',
      length: 20,
    });

    const result = await query(
      `INSERT INTO users (email, password, totp_secret, role, is_verified)
       VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id`,
      [email, hashedPassword, totpSecret.base32]
    );

    // Print QR code for admin 2FA setup
    const qrText = await QRCode.toString(totpSecret.otpauth_url, { type: 'terminal', small: true });

    console.log('\n✅ Admin user created!');
    console.log('   Email:    ', email);
    console.log('   Password: ', password);
    console.log('   User ID:  ', result.rows[0].id);
    console.log('\n📱 Scan this QR code with Google Authenticator:\n');
    console.log(qrText);
    console.log('   Manual key:', totpSecret.base32);
    console.log('\n⚠️  Change the password after first login!\n');

    await pool.end();
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
