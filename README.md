# 💳 PayGateway — Multi-Portal Payment Gateway with 2FA, UPI, & Developer API

A complete, production-grade payment gateway application built with **React**, **Node.js (Express)**, **Indian UPI (Dynamic QR & NPCI URI)**, **Stripe & Mock Card Processing**, **TOTP Two-Factor Authenticator (Google Authenticator / Authy)**, and **PostgreSQL (Supabase)**.

---

## 📸 Application Screenshots

| **👑 Admin Control Center** | **🏢 Merchant Business Portal** |
|:---:|:---:|
| ![Admin Portal](screenshots/01-admin-portal.png) | ![Business Portal](screenshots/02-business-portal.png) |
| *Platform telemetry, account management, & user roles* | *Gross revenue analytics, payment links, & developer API keys* |

| **⚡ Dynamic UPI QR Checkout** | **👤 Client Personal Portal** |
|:---:|:---:|
| ![Dynamic UPI QR Checkout](screenshots/04-dynamic-upi-qr-checkout.png) | ![Client Portal](screenshots/03-client-portal.png) |
| *Auto-generated NPCI UPI QR for GPay, PhonePe, & Paytm* | *Spending summary, lifetime history, & 2FA protection* |

| **🔐 Secure Authentication & TOTP 2FA** |
|:---:|
| ![Authentication & TOTP 2FA](screenshots/05-login-2fa.png) |
| *Hardware-grade Google Authenticator / Authy two-factor protection* |

---

## 🏛️ 3 Specialized Portals & Access Control

### 1. 👤 Client Portal (`/client`)
- **Access:** Clients, Businesses, Admins
- **Dual Payment Engine:** Instant UPI (dynamic QR + UTR confirmation) and Credit/Debit Card checkout
- **Personal Spending Metrics:** Total settled payments, transaction counts, pending authorizations
- **Transaction History:** Paginated list of purchases with interactive digital receipts (including UPI UTR & method badges)
- **Security Indicator:** TOTP Authenticator status (active & protected)

### 2. 🏢 Business / Merchant Portal (`/business`)
- **Access:** Merchants with `business` or `admin` role
- **Revenue Analytics:** Gross revenue collected, completed sales count, active payment links, API sessions
- **Payment Link & Dynamic QR Code Generator:**
  - Create fixed-price or customer-entered payment links
  - **Auto-generated UPI QR Codes:** Download or print QR codes for physical counters or digital invoices
  - Instant toggle (Live / Paused) and link deletion
- **Developer API & Website Integration (New!):**
  - **Live API Key & Secret:** Secure merchant keys for external websites
  - **1-Line Embeddable Checkout SDK:** Drop-in button/modal for any website or HTML page
  - **Server-to-Server REST API:** Create checkout sessions from Node.js, Python, PHP, or cURL
  - **API Orders Audit Log:** Monitor transactions initiated from external websites with session IDs, customer emails, and live payment status
- **Merchant Profile Management:** Business name, website, and UPI VPA ID (e.g. `yourname@okhdfcbank`)

### 3. 👑 Admin Portal (`/admin`)
- **Access:** Strictly restricted to users with `admin` role (via middleware & JWT)
- **Global Financial Telemetry:** System-wide transaction volume, total processed count, payment method breakdown
- **User & Role Access Management:**
  - Live search across all platform accounts
  - Filter by role (`client`, `business`, `admin`)
  - **Instant Role Reassignment:** Promote or demote users between Client, Business, and Admin
  - **Account Suspend / Activate:** Instantly revoke or restore user platform access
- **Global Transaction Audit Stream:** Complete system-wide ledger of every customer, merchant, amount, payment method (UPI / Card), UTR, and timestamp

---

## 🔌 Developer API for External Websites

Businesses can integrate PayGateway directly into their own e-commerce websites, landing pages, or mobile apps using two easy methods:

### Method A: 1-Line Drop-in JavaScript SDK

Add this script to your website's `<head>` or before `</body>`:

```html
<!-- 1. Include PayGateway SDK -->
<script src="http://localhost:5000/sdk/paygateway.js"></script>

<!-- 2. Add Pay Button -->
<button onclick="payNow()">Pay Now ₹499</button>

<script>
function payNow() {
  PayGateway.checkout({
    apiKey: "YOUR_MERCHANT_API_KEY", // Found in Business Portal > Developer API
    amount: 499,                     // Amount in ₹ (Rupees)
    currency: "INR",
    orderId: "ORD_" + Date.now(),
    description: "T-Shirt Order",
    customerEmail: "buyer@example.com",
    customerName: "Ananya Roy",
    mode: "modal", // 'modal' for popup overlay, or 'redirect' for full-page
    callbackUrl: "https://yourwebsite.com/payment-success"
  });
}
</script>
```

---

### Method B: Backend REST API

Create checkout sessions from your backend server:

#### 1. Create a Checkout Session
- **Endpoint:** `POST /api/v1/checkout/sessions`
- **Header:** `x-api-key: YOUR_MERCHANT_API_KEY` (or `Authorization: Bearer YOUR_MERCHANT_API_KEY`)
- **Body:**
```json
{
  "amount": 250000,
  "currency": "inr",
  "orderId": "SHOP_INV_1029",
  "description": "Annual Premium Subscription",
  "customerEmail": "customer@example.com",
  "customerName": "Rahul Verma",
  "callbackUrl": "https://myshop.com/orders/success"
}
```

**Response:**
```json
{
  "sessionId": "cs_7796fee84e2649faec15d6b0e5cf8240",
  "checkoutUrl": "http://localhost:5173/checkout/session/cs_7796fee84e2649faec15d6b0e5cf8240",
  "amount": 250000,
  "amountFormatted": "₹2500.00",
  "currency": "inr",
  "orderId": "SHOP_INV_1029",
  "status": "pending",
  "upiIntentUri": "upi://pay?pa=merchant@okaxis&pn=Merchant+Store&am=2500.00&cu=INR&tn=Annual+Premium+Subscription&tr=cs_7796fee84e2649faec15d6b0e5cf8240",
  "upiQrCode": "data:image/png;base64,...",
  "receiverUpi": "merchant@okaxis",
  "expiresIn": "30 minutes"
}
```

*Redirect your customer to `checkoutUrl` to complete payment via UPI QR or Card.*

#### 2. Check Session Status
- **Endpoint:** `GET /api/v1/checkout/sessions/:sessionId`
- **Header:** `x-api-key: YOUR_MERCHANT_API_KEY`

**Response:**
```json
{
  "sessionId": "cs_7796fee84e2649faec15d6b0e5cf8240",
  "orderId": "SHOP_INV_1029",
  "amount": 250000,
  "currency": "inr",
  "status": "succeeded",
  "paymentMethod": "upi",
  "utrNumber": "528391048291",
  "customerEmail": "customer@example.com",
  "createdAt": "2026-10-18T07:30:20.371Z"
}
```

---

## 📱 QR Code & Payment Options

1. **Scan-to-Register (Mobile Onboarding):**
   - Click **"📱 Scan QR to Register on Mobile"** on the registration page
   - Point your phone camera at the screen to register on mobile instantly
2. **Scan-to-Setup 2FA:**
   - Scan the TOTP QR code during signup using **Google Authenticator** or **Authy**
3. **Dynamic UPI QR Code Payment:**
   - Works across all portals and checkout sessions
   - Scannable by any UPI app: Google Pay, PhonePe, Paytm, BHIM, Cred, or bank UPI apps
   - Instant UTR confirmation with 1-click fallback
4. **Credit / Debit Card Checkout:**
   - Supports Stripe test cards & instant test processing engine
   - Test Card: `4242 4242 4242 4242`, Expiry: Any future date, CVC: Any 3 digits, ZIP: Any 5 digits

---

## 🚀 Default Credentials

### Admin Login
- **Email:** `admin@paygateway.com`
- **Password:** `Admin@123456`
- **2FA Key:** `NZKHWTCSIAVD6V2MERMFC52VLNVTSUSR`
- **Role:** `admin`

---

## 💻 Running the Application

### Start Development Server
```bash
# In project root:
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
npx concurrently --names "SERVER,CLIENT" --prefix-colors "blue,green" "cd server && npm run dev" "cd client && npm run dev"
```

- **Frontend Client:** http://localhost:5173
- **Backend API:** http://localhost:5000
- **Health Check:** http://localhost:5000/api/health
- **Public JS SDK:** http://localhost:5000/sdk/paygateway.js
- **Razorpay Checkout SDK:** http://localhost:5000/v1/checkout.js

---

## ⚡ Full Razorpay Backend Model & Standard Checkout Engine

![E-Commerce Checkout Integration](screenshots/04-demo-store-checkout.png)

PayGateway includes a complete, 100% compliant **Razorpay Backend Model** and drop-in **Standard Checkout SDK** (`checkout.js`). Any application, e-commerce plugin (WooCommerce, Shopify, Magento), or custom backend built for Razorpay can drop in this gateway simply by pointing to `http://localhost:5000/v1` and using their merchant Key ID and Secret!

### 1. Razorpay Entities & Identifiers
All entities follow official Razorpay formatting:
- **Orders:** `order_...` (e.g. `order_f593113392bf018b`)
- **Payments:** `pay_...` (e.g. `pay_eeca06f3da0d2cc9`)
- **Refunds:** `rfnd_...` (e.g. `rfnd_eaa20ac037839e6b`)
- **Customers:** `cust_...` (e.g. `cust_3351036922af62f8`)
- **Settlements:** `setl_...` (e.g. `setl_4a8b7c6d5e1f2a3b`)

---

### 2. Standard Drop-In Checkout SDK (`checkout.js`)

Drop this into any HTML or React/Vue website:

```html
<script src="http://localhost:5000/v1/checkout.js"></script>
<button id="rzp-button1">Pay ₹499</button>

<script>
var options = {
  "key": "rzp_live_YOUR_KEY_ID", // From Business Portal > Razorpay Full Model
  "amount": "49900",             // In paise (49900 = ₹499.00)
  "currency": "INR",
  "name": "Acme Store",
  "description": "Test Transaction",
  "order_id": "order_f593113392bf018b", // Generated via POST /v1/orders
  "handler": function (response) {
    console.log("Payment ID: ", response.razorpay_payment_id);
    console.log("Order ID:   ", response.razorpay_order_id);
    console.log("Signature:  ", response.razorpay_signature);
    
    // Verify signature on your backend server
    fetch("/api/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response)
    });
  },
  "prefill": {
    "name": "Ananya Sharma",
    "email": "ananya@example.com",
    "contact": "+919876543210"
  },
  "theme": { "color": "#0f172a" }
};

var rzp = new Razorpay(options);
document.getElementById('rzp-button1').onclick = function(e){
  rzp.open();
  e.preventDefault();
}
</script>
```

---

### 3. Server-to-Server Razorpay REST API

Authenticate using HTTP Basic Auth: `username = rzp_key_id`, `password = rzp_key_secret`.

#### A. Create an Order
```http
POST http://localhost:5000/v1/orders
Authorization: Basic <base64(rzp_key_id:rzp_key_secret)>
Content-Type: application/json

{
  "amount": 49900,
  "currency": "INR",
  "receipt": "rcpt_9921",
  "notes": { "product": "Keyboard" }
}
```

#### B. Fetch Payment Details
```http
GET http://localhost:5000/v1/payments/:payment_id
Authorization: Basic <base64(rzp_key_id:rzp_key_secret)>
```

#### C. Capture a Payment
```http
POST http://localhost:5000/v1/payments/:payment_id/capture
Authorization: Basic <base64(rzp_key_id:rzp_key_secret)>

{ "amount": 49900, "currency": "INR" }
```

#### D. Issue a Refund (Full or Partial)
```http
POST http://localhost:5000/v1/payments/:payment_id/refund
Authorization: Basic <base64(rzp_key_id:rzp_key_secret)>

{ "amount": 20000, "notes": { "reason": "Customer cancellation" } }
```

---

### 4. Official Razorpay HMAC-SHA256 Signature Verification

To verify that the payment is authentic and untampered:

```javascript
// Node.js Backend Signature Verification:
const crypto = require('crypto');

function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
  const generatedSignature = crypto
    .createHmac('sha256', secret)
    .update(orderId + '|' + paymentId)
    .digest('hex');

  return generatedSignature === signature;
}
```

---

### 5. Webhooks with `X-Razorpay-Signature`

Whenever payments are captured or refunded, PayGateway sends webhook events to your configured endpoint:
- **Events:** `payment.captured`, `order.paid`, `refund.processed`
- **Header:** `X-Razorpay-Signature: <hmac_sha256_of_payload_with_webhook_secret>`

---

## 🚀 Commercial Quickstart & Pre-Flight Audit

For buyers deploying this codebase commercially:

1. **Install Dependencies:**
   ```bash
   npm run install:all
   ```
2. **Configure Environment:**
   ```bash
   cp server/.env.example server/.env
   # Update your DATABASE_URL and high-entropy JWT secrets
   ```
3. **Execute Migrations:**
   ```bash
   npm run migrate
   ```
4. **Run Automated Pre-Flight Health Check:**
   ```bash
   npm run healthcheck
   ```
5. **Start Dev Servers:**
   ```bash
   npm run dev
   ```

*For complete enterprise white-label instructions, concurrency race-condition hardening details, and Docker/NGINX production deployment, refer to [`COMMERCIAL_DISTRIBUTION_GUIDE.md`](COMMERCIAL_DISTRIBUTION_GUIDE.md).*


