# 🛡️ Commercial Distribution, White-Label & AppSec Guide
**ApexPay / PayGateway Enterprise FinTech Engine**
*Commercial Turnkey Edition for CodeCanyon, Gumroad, and Enterprise White-Label Distribution*

---

## 📑 Table of Contents
1. [Executive Architecture & System Topology](#1-executive-architecture--system-topology)
2. [Zero-Trust Security & PCI-DSS Scope Boundaries](#2-zero-trust-security--pci-dss-scope-boundaries)
3. [Transaction State Machine & Idempotency Engine](#3-transaction-state-machine--idempotency-engine)
4. [5-Minute Buyer Quickstart & Onboarding](#4-5-minute-buyer-quickstart--onboarding)
5. [Pre-Flight Health Check & Automated Audit](#5-pre-flight-health-check--automated-audit)
6. [Webhook Ingress & Cryptographic Signature Verification](#6-webhook-ingress--cryptographic-signature-verification)
7. [Production Deployment Guide (Docker, Cloud, NGINX)](#7-production-deployment-guide)
8. [White-Label Customization & Brand Configuration](#8-white-label-customization--brand-configuration)

---

## 1. Executive Architecture & System Topology

PayGateway is engineered as an enterprise-grade, high-throughput payment infrastructure package. It delivers a dual-engine architecture:
- **Engine A: Standard Drop-in Checkout (`checkout.js`) & REST API:** 100% wire-compatible with the standard Razorpay v1 REST specification (`/v1/orders`, `/v1/payments`, `/v1/refunds`, `/v1/customers`), allowing drop-in replacement in any existing WooCommerce, Shopify, Magento, or custom web application.
- **Engine B: Native Indian NPCI UPI Dynamic QR Engine:** Dynamic UPI intents with an active 5-minute countdown clock, real-time expiration overlay, and bank UTR reconciliation.
- **Engine C: Fallback Card Processing:** Stripe integration for international credit/debit card processing and simulated PCI-safe tokenization.

```
+-----------------------------------------------------------------------------------+
|                              COMMERCIAL TOPOLOGY                                  |
+-----------------------------------------------------------------------------------+
       ▲                                     ▲                               ▲
       │                                     │                               │
[Client Portal]                     [Business Portal]               [Super Admin Portal]
(/client)                            (/business)                     (/admin)
  - UPI / Card Checkout                - API Key & Secret Generator    - Global Financial Ledger
  - Spending Analytics                 - Dynamic QR Code Generator     - User & Role Access Control
  - Digital Receipts                   - Webhook Config & Logs         - Merchant Suspension Switch
       │                                     │                               │
       +─────────────────────────────────────┼───────────────────────────────+
                                             │
                                             ▼
                             +───────────────────────────────+
                             |    Express Security Ingress   |
                             |  - Helmet & CORS Isolation    |
                             |  - Rate Limiter (Brute-Force) |
                             |  - Schema Validator (env.js)  |
                             |  - Atomic Idempotency Filter  |
                             +───────────────────────────────+
                                             │
                      +──────────────────────┴──────────────────────+
                      ▼                                             ▼
         [Razorpay v1 REST Engine]                     [Developer Gateway API]
           - POST /v1/orders                             - POST /api/v1/checkout/sessions
           - POST /v1/payments/:id/capture               - GET  /api/v1/public/session/:id
           - POST /v1/payments/:id/refund                - POST /api/v1/public/confirm-upi
           - POST /v1/customers                          - GET  /sdk/paygateway.js
                      │                                             │
                      +──────────────────────┬──────────────────────+
                                             │
                                             ▼
                             +───────────────────────────────+
                             | PostgreSQL ACID Storage Engine|
                             |  - Row-Level Locking (Locks)  |
                             |  - Minor Currency Units (Int) |
                             |  - Immutable Audit Ledgers    |
                             +───────────────────────────────+
```

---

## 2. Zero-Trust Security & PCI-DSS Scope Boundaries

### PCI-DSS Scope Isolation (SAQ-A / Non-Scope)
- **Zero Raw Card Data (PAN/CVV):** This codebase **never** stores, logs, or transmits raw Primary Account Numbers (PAN), CVVs, or Cardholder PINs.
- Stored card records retain only `card_network` (e.g. `Visa`, `MasterCard`) and `card_last4` (masked 4-digits) for customer reference.
- Any direct card processing is offloaded to PCI-DSS Level 1 compliant gateway providers (such as Stripe) using client-side iframe tokens.

### Race Condition & Double-Spend Defense
- In standard payment gateways, concurrent webhook retries or parallel user refund clicks can execute duplicate balance deductions.
- In PayGateway, all balance-mutating endpoints (`/payments/:id/refund`, `/payments/:id/capture`, `/checkout/process`, and session confirmations) enforce **PostgreSQL Row-Level Locks (`SELECT ... FOR UPDATE`) inside atomic transactions (`BEGIN ... COMMIT`)**.
- If two identical refund requests arrive in the same millisecond:
  1. Request A acquires an exclusive lock on the payment record.
  2. Request B is suspended at the database row level until Request A finishes.
  3. When Request B acquires the row, the refundable balance (`amount - amount_refunded`) has already decremented, and Request B is rejected safely with `BAD_REQUEST_ERROR`.

### Personally Identifiable Information (PII) Scrubbing
- All exceptions pass through `server/middleware/errorHandler.js`.
- The recursive sanitizer automatically scrubs sensitive keys before logging:
  `['password', 'totp_secret', 'token', 'cvv', 'cvc', 'pan', 'card_number', 'secret', 'api_secret']`
- In `production` mode, raw database error strings or internal stack traces are suppressed, preventing infrastructure leakage.

---

## 3. Transaction State Machine & Idempotency Engine

### State Machine Lifecycle
Every financial transaction follows an immutable unidirectional progression:

```
[CREATED] ──(Customer Scans / Enters Card)──► [PENDING]
                                                  │
                 ┌────────────────────────────────┴────────────────────────────────┐
                 ▼                                                                 ▼
            [SUCCESS / CAPTURED]                                               [FAILED]
                 │
                 ├──(Merchant Issues Partial Refund)──► [PARTIAL_REFUND]
                 │
                 └──(Merchant Issues Full Refund)─────► [REFUNDED]
```

### Database Idempotency Locks
Clients and external systems can provide an `Idempotency-Key` or `X-Idempotency-Key` header with any mutating HTTP request (`POST`, `PUT`, `PATCH`).
- When received, PayGateway verifies if this key exists in the `idempotency_keys` table.
- If present, PayGateway replays the cached status code and response payload with header `X-Cache-Lookup: HIT`, completely bypassing second execution.
- If new, the transaction executes atomically, and the output is cached on success.

---

## 4. 5-Minute Buyer Quickstart & Onboarding

### System Requirements
- Node.js `v18.0.0` or higher
- PostgreSQL `v13.0` or higher (Self-hosted or cloud managed: Supabase, Neon, AWS RDS)
- Modern browser supporting Web Cryptography

### Step 1: Install Dependencies
```bash
# In repository root
npm run install:all
```

### Step 2: Configure Environment Variables
Copy `.env.example` into `server/.env`:
```bash
cp server/.env.example server/.env
```
Open `server/.env` and configure:
```env
PORT=5000
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/dbname
DATABASE_SSL=true
JWT_SECRET=generate_a_64_char_random_hex_string
JWT_PREAUTH_SECRET=generate_a_another_64_char_random_hex_string
CLIENT_ORIGIN=https://pay.yourdomain.com
```

### Step 3: Run Database Migrations & Initial Seed
```bash
npm run migrate
```
This automatically applies all schema migrations (including `orders`, `payments`, `refunds`, `checkout_sessions`, and `idempotency_keys`).

### Step 4: Verify Deployment Health
```bash
npm run healthcheck
```
If all checks pass with green output, launch the platform:
```bash
npm run dev
# Or for production:
npm run server
```

---

## 5. Pre-Flight Health Check & Automated Audit

Buyers can run the automated self-test utility at any time:
```bash
cd server
npm run healthcheck
```

### Checks Performed:
| Verification Target | Purpose | Pass Criteria |
| :--- | :--- | :--- |
| **DATABASE_URL** | Validates connection string presence | String exists and parses |
| **JWT_SECRET** | Prevents insecure default keys | Entropy >= 16 chars, no placeholder |
| **2FA Pre-Auth Secret** | Protects 2FA authentication flow | Entropy >= 16 chars |
| **HMAC SHA-256 Engine** | Verifies cryptographic hashing hardware | SHA-256 output matches 64 chars |
| **PostgreSQL Connection** | Measures network latency to database | Query execution succeeds |
| **Schema Integrity** | Verifies existence of all 10 core tables | 10/10 tables present |
| **Ledger Row Health** | Queries live counts of users, merchants, payments | Query returns non-null |

---

## 6. Webhook Ingress & Cryptographic Signature Verification

Every payment event dispatches an asynchronous webhook to the merchant's configured URL. The payload signature is computed using **HMAC SHA-256** and transmitted in the `X-Razorpay-Signature` header.

### Sample Webhook Payload
```json
{
  "entity": "event",
  "account_id": "acc_10",
  "event": "payment.captured",
  "contains": ["payment"],
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_98a7f23c91a0",
        "order_id": "order_4c831b0a8e12",
        "amount": 49900,
        "currency": "INR",
        "status": "captured",
        "method": "upi",
        "vpa": "customer@okhdfcbank",
        "utr": "528193029104"
      }
    }
  },
  "created_at": 1776510000
}
```

### Signature Verification Examples:

#### Node.js / Express
```javascript
const crypto = require('crypto');

function verifyWebhook(req, webhookSecret) {
  const signature = req.headers['x-razorpay-signature'];
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

#### Python / FastAPI
```python
import hmac
import hashlib

def verify_webhook(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
```

#### PHP (WooCommerce / Custom)
```php
function verify_webhook($raw_payload, $received_sig, $webhook_secret) {
    $expected = hash_hmac('sha256', $raw_payload, $webhook_secret);
    return hash_equals($expected, $received_sig);
}
```

---

## 7. Production Deployment Guide

### Deployment Option A: Docker & Docker Compose
Create a `docker-compose.yml` for turnkey hosting:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: paygateway
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: StrongProductionPassword
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  api:
    build: ./server
    ports:
      - "5000:5000"
    environment:
      PORT: 5000
      NODE_ENV: production
      DATABASE_URL: postgres://postgres:StrongProductionPassword@postgres:5432/paygateway
      JWT_SECRET: super_secure_random_key_here
      CLIENT_ORIGIN: https://checkout.yourdomain.com
    depends_on:
      - postgres

volumes:
  pgdata:
```

### Deployment Option B: NGINX Reverse Proxy with SSL
```nginx
server {
    listen 80;
    server_name pay.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pay.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/pay.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pay.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

### Deployment Option C: Render.com (1-Click Blueprint or Web Service)
1. Push this repository to GitHub or GitLab.
2. In [Render Dashboard](https://dashboard.render.com), click **New +** > **Blueprint**.
3. Connect your repository — Render automatically detects `render.yaml`, preconfiguring:
   - **Root Directory:** `server`
   - **Build Command:** `npm install && npm run build` (auto-runs migrations)
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
4. Set your `DATABASE_URL` in the Render Environment Variables tab (using your Supabase or managed Postgres connection string).
5. Click **Apply** — Render will build and deploy the backend with free SSL at `https://<service-name>.onrender.com`.

---

## 8. White-Label Customization & Brand Configuration

Buyers who purchase this script can rebrand it in 3 easy steps:
1. **Brand Names & Logos:** Change `PayGateway` in `client/src/components/Navbar.jsx` and `server/public/checkout.js`.
2. **Default Currencies:** Change `INR` or `USD` default values in `server/routes/apiGateway.js` and `server/routes/razorpay.js`.
3. **Receipt Themes:** Customize primary accents in `client/tailwind.config.js` (`colors.primary = '#4f46e5'`).

---
*PayGateway Enterprise FinTech Suite — Built for Security, Concurrency, and Commercial Publishing.*
