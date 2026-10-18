/**
 * scripts/backfill_rzp.js — Maintenance Script
 * Generates Razorpay API credentials and webhook secrets for legacy merchant accounts.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query } = require('../db');

(async () => {
  try {
    const res = await query(`
      UPDATE businesses 
      SET rzp_key_id = COALESCE(rzp_key_id, 'rzp_live_' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 14)),
          rzp_key_secret = COALESCE(rzp_key_secret, 'rzp_sec_' || md5(random()::text || clock_timestamp()::text)),
          webhook_secret = COALESCE(webhook_secret, 'whsec_' || md5(random()::text || clock_timestamp()::text))
      RETURNING id, name, rzp_key_id, rzp_key_secret, webhook_secret
    `);
    console.log('✅ Backfilled businesses:', JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Backfill error:', err);
  } finally {
    process.exit(0);
  }
})();
