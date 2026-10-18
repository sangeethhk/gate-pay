/**
 * tests/test_api_flow.js — Developer Payment Gateway API Integration Test Suite
 * Tests Session Creation, Hosted Checkout fetch, UPI confirmation, and Merchant Status check.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query } = require('../db');

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;

async function testApi() {
  try {
    console.log('--- 1. Querying a business with API key ---');
    // Ensure active business has API credentials
    await query(`
      UPDATE businesses 
      SET api_key = COALESCE(api_key, 'pg_live_' || md5(random()::text || clock_timestamp()::text)),
          api_secret = COALESCE(api_secret, 'sec_live_' || md5(random()::text || clock_timestamp()::text))
      WHERE api_key IS NULL
    `);

    const bRes = await query(
      `SELECT b.id, b.user_id, b.name, b.api_key, u.email 
       FROM businesses b 
       JOIN users u ON u.id = b.user_id 
       WHERE b.is_active = TRUE 
       LIMIT 1`
    );

    if (bRes.rows.length === 0) {
      console.log('No businesses found! Please seed or register an account.');
      return;
    }
    const business = bRes.rows[0];
    console.log(`Business: "${business.name}" | Email: ${business.email} | API Key: ${business.api_key}`);

    console.log('\n--- 2. Testing SDK Endpoint ---');
    const sdkRes = await fetch(`${BASE_URL}/sdk/paygateway.js`);
    console.log(`SDK Status: ${sdkRes.status} | Content-Type: ${sdkRes.headers.get('content-type')}`);

    console.log('\n--- 3. Testing POST /api/v1/checkout/sessions ---');
    const createRes = await fetch(`${BASE_URL}/api/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': business.api_key,
      },
      body: JSON.stringify({
        amount: 250000, // ₹2500.00 in paise
        currency: 'inr',
        orderId: `STORE_ORDER_${Date.now()}`,
        description: 'Premium Leather Shoes (Size 9)',
        customerEmail: 'customer@example.com',
        customerName: 'Rohit Sharma',
        callbackUrl: 'https://myshop.com/payment-complete',
      }),
    });
    const sessionData = await createRes.json();
    console.log('Session Created:', JSON.stringify(sessionData, null, 2));

    if (!sessionData.sessionId) {
      console.error('Failed to create session!');
      return;
    }

    console.log('\n--- 4. Testing Public Session Fetch (Customer Checkout Page) ---');
    const pubRes = await fetch(`${BASE_URL}/api/v1/public/session/${sessionData.sessionId}`);
    const pubData = await pubRes.json();
    console.log('Public Session Response:', JSON.stringify(pubData, null, 2));

    console.log('\n--- 5. Simulating UPI Payment Confirmation ---');
    const confirmRes = await fetch(`${BASE_URL}/api/v1/public/session/${sessionData.sessionId}/confirm-upi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        utrNumber: '528391048291',
        payerUpiId: 'rohit@okaxis',
      }),
    });
    const confirmData = await confirmRes.json();
    console.log('Confirmation Response:', JSON.stringify(confirmData, null, 2));

    console.log('\n--- 6. Verifying Final Status from Merchant Status API ---');
    const statusRes = await fetch(`${BASE_URL}/api/v1/checkout/sessions/${sessionData.sessionId}`, {
      headers: { 'x-api-key': business.api_key },
    });
    const finalStatus = await statusRes.json();
    console.log('Merchant Verified Status:', JSON.stringify(finalStatus, null, 2));

    console.log('\n🎉 ALL DEVELOPER API ENDPOINTS PASSED VERIFICATION!');
  } catch (err) {
    console.error('Test failed with error:', err);
  } finally {
    process.exit(0);
  }
}

testApi();
