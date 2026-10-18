require('dotenv').config();
const jwt = require('jsonwebtoken');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const screenshotDir = path.resolve(__dirname, '../../screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  // 1. Login / 2FA screen
  console.log('Capturing Login screen...');
  const page1 = await browser.newPage();
  await page1.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page1.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
  await page1.screenshot({ path: path.join(screenshotDir, '05-login-2fa.png') });
  await page1.close();

  // Helper to set auth state
  async function capturePortal(route, userPayload, filename) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    const token = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '1d' });

    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate((tok, usr) => {
      localStorage.setItem('accessToken', tok);
      localStorage.setItem('refreshToken', tok);
      localStorage.setItem('user', JSON.stringify(usr));
    }, token, userPayload);

    await page.goto(`http://localhost:5173${route}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(screenshotDir, filename) });
    await page.close();
  }

  // 2. Admin Portal
  console.log('Capturing Admin portal...');
  await capturePortal('/admin', { id: 3, email: 'admin@paygateway.com', role: 'admin' }, '01-admin-portal.png');

  // 3. Business Portal
  console.log('Capturing Business portal...');
  await capturePortal('/business', { id: 4, email: 'sangeeth6363@gmail.com', role: 'business', businessName: 'Apex Audio' }, '02-business-portal.png');

  // 4. Client Portal
  console.log('Capturing Client portal...');
  await capturePortal('/client', { id: 2, email: 'test@gmail.com', role: 'client' }, '03-client-portal.png');

  // 5. Demo Store Checkout
  console.log('Capturing Demo Store & Checkout...');
  const pageDemo = await browser.newPage();
  await pageDemo.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await pageDemo.goto('http://localhost:5000/demo', { waitUntil: 'networkidle0' });
  const payBtn = await pageDemo.$('#pay-button');
  if (payBtn) {
    await payBtn.click();
    await new Promise(r => setTimeout(r, 2000));
  }
  await pageDemo.screenshot({ path: path.join(screenshotDir, '04-demo-store-checkout.png') });
  await pageDemo.close();

  await browser.close();
  console.log('All screenshots captured successfully!');
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
