(function (window) {
  'use strict';

  function Razorpay(options) {
    if (!(this instanceof Razorpay)) {
      return new Razorpay(options);
    }
    this.options = options || {};
    this.handlers = {};
  }

  Razorpay.prototype.on = function (event, callback) {
    this.handlers[event] = callback;
  };

  Razorpay.prototype.close = function () {
    var modal = document.getElementById('rzp-checkout-modal-container');
    if (modal && modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  };

  Razorpay.prototype.open = function () {
    var self = this;
    var opts = self.options;

    if (!opts.key && !opts.key_id) {
      alert('Razorpay Error: Key ID is required in options');
      return;
    }
    if (!opts.order_id) {
      alert('Razorpay Error: order_id is required in options');
      return;
    }

    // Determine gateway server origin
    var scriptTag = document.currentScript || document.querySelector('script[src*="checkout.js"]');
    var serverOrigin = 'http://localhost:5000';
    if (scriptTag && scriptTag.src) {
      try {
        var url = new URL(scriptTag.src);
        serverOrigin = url.origin;
      } catch (e) {}
    }

    var themeColor = (opts.theme && opts.theme.color) ? opts.theme.color : '#0f172a';
    var prefillName = (opts.prefill && opts.prefill.name) ? opts.prefill.name : '';
    var prefillEmail = (opts.prefill && opts.prefill.email) ? opts.prefill.email : '';
    var prefillContact = (opts.prefill && opts.prefill.contact) ? opts.prefill.contact : '';

    // Create Modal Backdrop
    var container = document.createElement('div');
    container.id = 'rzp-checkout-modal-container';
    container.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.75);backdrop-filter:blur(6px);z-index:9999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;box-sizing:border-box;';

    // Modal Inner Card
    container.innerHTML = `
      <div id="rzp-modal-card" style="position:relative;width:95%;max-width:560px;max-height:92vh;background:#ffffff;border-radius:24px;box-shadow:0 25px 60px -15px rgba(0,0,0,0.4);overflow:hidden;display:flex;flex-direction:column;animation:rzpFadeIn 0.25s ease-out;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg, ${themeColor}, #1e293b);color:#ffffff;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:bold;color:#38bdf8;">
              ⚡
            </div>
            <div>
              <div style="font-weight:700;font-size:17px;letter-spacing:-0.2px;">${opts.name || 'Merchant Checkout'}</div>
              <div style="font-size:12px;opacity:0.85;">${opts.description || 'Order ' + opts.order_id}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div id="rzp-header-amount" style="font-weight:800;font-size:22px;letter-spacing:-0.5px;">₹...</div>
            <div style="font-size:11px;opacity:0.8;display:flex;align-items:center;gap:4px;justify-content:flex-end;">
              <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#4ade80;"></span>
              Razorpay Secured
            </div>
          </div>
          <button id="rzp-close-btn" style="position:absolute;top:14px;right:16px;background:rgba(255,255,255,0.1);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>

        <!-- Sandbox Test Indicator -->
        <div style="background:#fef3c7;border-bottom:1px solid #fde68a;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#92400e;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-weight:bold;background:#f59e0b;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;">TEST MODE</span>
            <span>Razorpay Full Backend Model Simulator</span>
          </div>
          <button id="rzp-quick-pay-btn" style="background:#059669;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-weight:600;font-size:11px;cursor:pointer;">
            ⚡ 1-Click Instant Success
          </button>
        </div>

        <!-- Body Tabs & Content -->
        <div style="display:flex;flex:1;overflow:hidden;min-height:360px;">
          <!-- Method Sidebar -->
          <div style="width:160px;background:#f8fafc;border-right:1px solid #e2e8f0;padding:12px 8px;display:flex;flex-direction:column;gap:6px;">
            <button class="rzp-tab-btn" data-tab="upi" style="text-align:left;background:#ede9fe;color:#6d28d9;border:none;padding:10px 12px;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;">
              <span>📱</span> UPI / QR
            </button>
            <button class="rzp-tab-btn" data-tab="card" style="text-align:left;background:transparent;color:#475569;border:none;padding:10px 12px;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;">
              <span>💳</span> Cards
            </button>
            <button class="rzp-tab-btn" data-tab="netbanking" style="text-align:left;background:transparent;color:#475569;border:none;padding:10px 12px;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;">
              <span>🏛️</span> Netbanking
            </button>
            <button class="rzp-tab-btn" data-tab="wallet" style="text-align:left;background:transparent;color:#475569;border:none;padding:10px 12px;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;">
              <span>👛</span> Wallets
            </button>
          </div>

          <!-- Tab Panels -->
          <div style="flex:1;padding:20px;overflow-y:auto;background:#ffffff;">
            <!-- UPI Panel -->
            <div id="rzp-panel-upi" class="rzp-panel" style="display:block;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div style="font-weight:700;color:#0f172a;font-size:14px;">Scan with Any UPI App</div>
                <!-- 5 Min Countdown Timer Badge -->
                <div id="rzp-qr-timer-badge" style="display:inline-flex;align-items:center;gap:6px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-size:11px;font-weight:700;padding:3px 10px;border-radius:100px;transition:all 0.3s;">
                  <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;animation:rzpPulse 1.2s infinite;"></span>
                  <span>Expires in <strong id="rzp-timer-digits" style="font-family:monospace;font-size:12px;letter-spacing:0.5px;">05:00</strong></span>
                </div>
              </div>

              <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:14px;">
                <div style="position:relative;background:#ffffff;padding:8px;border-radius:16px;border:2px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.05);display:inline-block;overflow:hidden;">
                  <img id="rzp-upi-qr" src="" alt="UPI QR" style="width:165px;height:165px;display:block;" />
                  <!-- 5 Min Expired Blur Overlay -->
                  <div id="rzp-qr-expired-overlay" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.95);backdrop-filter:blur(4px);flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:12px;z-index:2;">
                    <div style="font-size:26px;margin-bottom:4px;">⏳</div>
                    <div style="font-weight:800;font-size:13px;color:#991b1b;">QR Code Expired</div>
                    <div style="font-size:10px;color:#64748b;margin:3px 0 10px;line-height:1.3;">5-minute payment session ended for security</div>
                    <button id="rzp-refresh-qr-btn" type="button" style="background:#2563eb;color:#fff;border:none;padding:6px 14px;border-radius:8px;font-weight:700;font-size:11px;cursor:pointer;box-shadow:0 2px 6px rgba(37,99,235,0.3);">
                      🔄 Refresh QR Code
                    </button>
                  </div>
                </div>
                <div style="font-size:11px;color:#64748b;margin-top:6px;display:flex;align-items:center;gap:4px;">
                  <span>Google Pay</span> • <span>PhonePe</span> • <span>Paytm</span> • <span>BHIM</span> • <span>Cred</span>
                </div>
              </div>

              <div style="border-top:1px dashed #cbd5e1;padding-top:12px;margin-top:10px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#334155;margin-bottom:4px;">Or Pay via UPI VPA / ID</label>
                <div style="display:flex;gap:8px;">
                  <input type="text" id="rzp-upi-id" placeholder="username@okhdfcbank" value="${prefillContact ? prefillContact + '@upi' : 'user@okaxis'}" style="flex:1;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;" />
                  <button id="rzp-pay-upi-btn" style="background:#2563eb;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">Pay</button>
                </div>
              </div>
            </div>

            <!-- Card Panel -->
            <div id="rzp-panel-card" class="rzp-panel" style="display:none;">
              <div style="font-weight:700;color:#0f172a;font-size:15px;margin-bottom:14px;">Enter Card Details</div>
              <div style="display:flex;flex-direction:column;gap:12px;">
                <div>
                  <label style="display:block;font-size:12px;font-weight:600;color:#334155;margin-bottom:4px;">Card Number</label>
                  <input type="text" id="rzp-card-num" value="4242 4242 4242 4242" placeholder="4242 •••• •••• 4242" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:monospace;" />
                </div>
                <div style="display:flex;gap:12px;">
                  <div style="flex:1;">
                    <label style="display:block;font-size:12px;font-weight:600;color:#334155;margin-bottom:4px;">Expiry</label>
                    <input type="text" id="rzp-card-exp" value="12/30" placeholder="MM/YY" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;" />
                  </div>
                  <div style="flex:1;">
                    <label style="display:block;font-size:12px;font-weight:600;color:#334155;margin-bottom:4px;">CVV</label>
                    <input type="password" id="rzp-card-cvv" value="123" placeholder="123" maxlength="4" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;" />
                  </div>
                </div>
                <div>
                  <label style="display:block;font-size:12px;font-weight:600;color:#334155;margin-bottom:4px;">Cardholder Name</label>
                  <input type="text" id="rzp-card-name" value="${prefillName || 'Rohit Sharma'}" placeholder="Name on card" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;" />
                </div>
                <button id="rzp-pay-card-btn" style="background:#2563eb;color:#fff;border:none;padding:12px;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;margin-top:6px;">
                  Pay Now
                </button>
              </div>
            </div>

            <!-- Netbanking Panel -->
            <div id="rzp-panel-netbanking" class="rzp-panel" style="display:none;">
              <div style="font-weight:700;color:#0f172a;font-size:15px;margin-bottom:12px;">Popular Indian Banks</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
                <button class="rzp-bank-opt" data-bank="HDFC Bank" style="border:1px solid #cbd5e1;background:#f8fafc;padding:10px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-align:left;">🏛️ HDFC Bank</button>
                <button class="rzp-bank-opt" data-bank="ICICI Bank" style="border:1px solid #cbd5e1;background:#f8fafc;padding:10px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-align:left;">🏛️ ICICI Bank</button>
                <button class="rzp-bank-opt" data-bank="State Bank of India" style="border:1px solid #cbd5e1;background:#f8fafc;padding:10px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-align:left;">🏛️ State Bank</button>
                <button class="rzp-bank-opt" data-bank="Axis Bank" style="border:1px solid #cbd5e1;background:#f8fafc;padding:10px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-align:left;">🏛️ Axis Bank</button>
                <button class="rzp-bank-opt" data-bank="Kotak Mahindra" style="border:1px solid #cbd5e1;background:#f8fafc;padding:10px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-align:left;">🏛️ Kotak Bank</button>
                <button class="rzp-bank-opt" data-bank="Punjab National Bank" style="border:1px solid #cbd5e1;background:#f8fafc;padding:10px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-align:left;">🏛️ PNB</button>
              </div>
              <button id="rzp-pay-bank-btn" style="width:100%;background:#2563eb;color:#fff;border:none;padding:11px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">
                Pay with Netbanking
              </button>
            </div>

            <!-- Wallet Panel -->
            <div id="rzp-panel-wallet" class="rzp-panel" style="display:none;">
              <div style="font-weight:700;color:#0f172a;font-size:15px;margin-bottom:12px;">Select Wallet</div>
              <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
                <label style="display:flex;align-items:center;gap:10px;border:1px solid #cbd5e1;padding:10px 14px;border-radius:8px;cursor:pointer;">
                  <input type="radio" name="rzp_wallet" value="Paytm" checked />
                  <span style="font-weight:600;font-size:13px;color:#1e293b;">Paytm Wallet</span>
                </label>
                <label style="display:flex;align-items:center;gap:10px;border:1px solid #cbd5e1;padding:10px 14px;border-radius:8px;cursor:pointer;">
                  <input type="radio" name="rzp_wallet" value="PhonePe" />
                  <span style="font-weight:600;font-size:13px;color:#1e293b;">PhonePe Wallet</span>
                </label>
                <label style="display:flex;align-items:center;gap:10px;border:1px solid #cbd5e1;padding:10px 14px;border-radius:8px;cursor:pointer;">
                  <input type="radio" name="rzp_wallet" value="Mobikwik" />
                  <span style="font-weight:600;font-size:13px;color:#1e293b;">Mobikwik</span>
                </label>
              </div>
              <button id="rzp-pay-wallet-btn" style="width:100%;background:#2563eb;color:#fff;border:none;padding:11px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">
                Pay with Wallet
              </button>
            </div>
          </div>
        </div>

        <!-- Processing Overlay (Hidden initially) -->
        <div id="rzp-processing-overlay" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.95);flex-direction:column;align-items:center;justify-content:center;z-index:100;">
          <div style="width:48px;height:48px;border:4px solid #e2e8f0;border-top-color:#2563eb;border-radius:50%;animation:rzpSpin 0.8s linear infinite;margin-bottom:14px;"></div>
          <div style="font-weight:700;font-size:16px;color:#0f172a;">Processing Payment...</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">Communicating with Razorpay Acquirer & NPCI</div>
        </div>
      </div>
      <style>
        @keyframes rzpFadeIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        @keyframes rzpSpin { to { transform: rotate(360deg); } }
        @keyframes rzpPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.4; } }
      </style>
    `;

    document.body.appendChild(container);

    // 5 Min (300 sec) Timer for UPI QR Code
    var qrSecondsRemaining = 300;
    var qrInterval = null;

    function renderTimerDigits() {
      var mins = Math.floor(qrSecondsRemaining / 60);
      var secs = qrSecondsRemaining % 60;
      var str = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
      var el = document.getElementById('rzp-timer-digits');
      if (el) el.innerText = str;

      var badge = document.getElementById('rzp-qr-timer-badge');
      if (badge) {
        if (qrSecondsRemaining <= 60) {
          badge.style.background = '#fef2f2';
          badge.style.borderColor = '#fecaca';
          badge.style.color = '#991b1b';
        } else if (qrSecondsRemaining <= 120) {
          badge.style.background = '#fffbeb';
          badge.style.borderColor = '#fde68a';
          badge.style.color = '#92400e';
        } else {
          badge.style.background = '#f0fdf4';
          badge.style.borderColor = '#bbf7d0';
          badge.style.color = '#166534';
        }
      }
    }

    function startQrCountdown() {
      if (qrInterval) clearInterval(qrInterval);
      qrSecondsRemaining = 300;
      renderTimerDigits();
      var expiredOverlay = document.getElementById('rzp-qr-expired-overlay');
      if (expiredOverlay) expiredOverlay.style.display = 'none';

      qrInterval = setInterval(function () {
        qrSecondsRemaining--;
        if (qrSecondsRemaining <= 0) {
          clearInterval(qrInterval);
          if (expiredOverlay) expiredOverlay.style.display = 'flex';
          var el = document.getElementById('rzp-timer-digits');
          if (el) el.innerText = '00:00 (Expired)';
        } else {
          renderTimerDigits();
        }
      }, 1000);
    }

    // Close button logic
    document.getElementById('rzp-close-btn').onclick = function () {
      if (qrInterval) clearInterval(qrInterval);
      self.close();
      if (self.handlers['modal.ondismiss']) {
        self.handlers['modal.ondismiss']();
      }
    };

    // Tab switching logic
    var tabBtns = container.querySelectorAll('.rzp-tab-btn');
    var panels = container.querySelectorAll('.rzp-panel');
    tabBtns.forEach(function (btn) {
      btn.onclick = function () {
        var tab = btn.getAttribute('data-tab');
        tabBtns.forEach(function (b) {
          b.style.background = 'transparent';
          b.style.color = '#475569';
        });
        btn.style.background = '#ede9fe';
        btn.style.color = '#6d28d9';

        panels.forEach(function (p) {
          p.style.display = 'none';
        });
        var activePanel = document.getElementById('rzp-panel-' + tab);
        if (activePanel) activePanel.style.display = 'block';
      };
    });

    // Netbanking bank options selection
    var selectedBank = 'HDFC Bank';
    var bankOpts = container.querySelectorAll('.rzp-bank-opt');
    bankOpts.forEach(function (opt) {
      opt.onclick = function () {
        bankOpts.forEach(function (o) {
          o.style.borderColor = '#cbd5e1';
          o.style.background = '#f8fafc';
        });
        opt.style.borderColor = '#2563eb';
        opt.style.background = '#eff6ff';
        selectedBank = opt.getAttribute('data-bank');
      };
    });

    // Fetch order details & dynamic UPI QR from backend
    function loadOrderDetails() {
      fetch(serverOrigin + '/v1/checkout/order-info/' + opts.order_id)
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data.order) {
            var order = data.order;
            document.getElementById('rzp-header-amount').innerText = order.amountFormatted || ('₹' + (order.amount / 100));
            if (order.upiQrCode) {
              document.getElementById('rzp-upi-qr').src = order.upiQrCode;
              startQrCountdown();
            }
          }
        })
        .catch(function (err) {
          console.warn('Could not load order info:', err);
        });
    }

    loadOrderDetails();

    // Refresh QR code on click
    var refreshBtn = document.getElementById('rzp-refresh-qr-btn');
    if (refreshBtn) {
      refreshBtn.onclick = function () {
        loadOrderDetails();
      };
    }

    // Payment execution helper
    function executePayment(payload) {
      var overlay = document.getElementById('rzp-processing-overlay');
      if (overlay) overlay.style.display = 'flex';

      payload.orderId = opts.order_id;
      payload.email = prefillEmail || opts.customer_email || 'customer@example.com';
      payload.contact = prefillContact || opts.customer_contact || '+919876543210';

      fetch(serverOrigin + '/v1/checkout/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (res) {
          if (res.success) {
            self.close();
            if (typeof opts.handler === 'function') {
              opts.handler({
                razorpay_payment_id: res.razorpay_payment_id,
                razorpay_order_id: res.razorpay_order_id,
                razorpay_signature: res.razorpay_signature,
              });
            }
          } else {
            if (overlay) overlay.style.display = 'none';
            alert(res.error || 'Payment failed');
            if (self.handlers['payment.failed']) {
              self.handlers['payment.failed']({
                error: {
                  code: 'PAYMENT_FAILED',
                  description: res.error || 'Payment transaction failed',
                },
              });
            }
          }
        })
        .catch(function (err) {
          if (overlay) overlay.style.display = 'none';
          alert('Failed to connect to Razorpay server');
        });
    }

    // Bind Payment Buttons
    document.getElementById('rzp-quick-pay-btn').onclick = function () {
      executePayment({ method: 'upi', vpa: 'instant.simulator@okaxis' });
    };

    document.getElementById('rzp-pay-upi-btn').onclick = function () {
      var vpa = document.getElementById('rzp-upi-id').value;
      executePayment({ method: 'upi', vpa: vpa });
    };

    document.getElementById('rzp-pay-card-btn').onclick = function () {
      var cardNum = document.getElementById('rzp-card-num').value;
      executePayment({
        method: 'card',
        cardLast4: cardNum.slice(-4) || '4242',
        cardNetwork: 'Visa',
      });
    };

    document.getElementById('rzp-pay-bank-btn').onclick = function () {
      executePayment({ method: 'netbanking', bank: selectedBank });
    };

    document.getElementById('rzp-pay-wallet-btn').onclick = function () {
      var checked = container.querySelector('input[name="rzp_wallet"]:checked');
      var walletName = checked ? checked.value : 'Paytm';
      executePayment({ method: 'wallet', wallet: walletName });
    };
  };

  window.Razorpay = Razorpay;
})(window);
