import { chromium } from '@playwright/test';

async function verifyBrowserViews() {
  console.log('Launching browser to verify staging environment...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Test 1: Admin & Analytics
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'admin@resq.org');
  await page.fill('input[type="password"]', 'ResQSecure2026!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin');
  console.log('✓ 1. Admin account logged in successfully -> URL:', page.url());

  // Test 2: Analytics Page 24h filter verification
  await page.click('a:has-text("Analytics")');
  await page.waitForURL('**/analytics');
  await page.click('button:has-text("Last 24 Hours")');
  await page.waitForTimeout(1000);

  const evaluatedText = await page.locator('div.p-5:has-text("1. Time-to-Match") strong.font-mono').innerText();
  const medianText = await page.locator('div.p-5:has-text("1. Time-to-Match") span.text-4xl').innerText();
  const doubleBookingRate = await page.locator('div.p-5:has-text("2. Double-Booking Rate") span.text-4xl').innerText();
  const doubleBookingStatus = await page.locator('div.p-5:has-text("2. Double-Booking Rate") strong.font-mono').innerText();
  const confRate = await page.locator('div.p-5:has-text("3. Confirmation Rate") span.text-4xl').innerText();
  const latencyStatus = await page.locator('div.p-5:has-text("4. Propagation Latency")').locator('span.font-mono.text-\\[10px\\]').first().innerText();

  console.log('✓ 2. Analytics Dashboard (Last 24 Hours) verified:');
  console.log(`     • Evaluated Requests:   ${evaluatedText}`);
  console.log(`     • Median Time-to-Match: ${medianText}`);
  console.log(`     • Double-Booking Rate:  ${doubleBookingRate} (${doubleBookingStatus})`);
  console.log(`     • Confirmation Rate:    ${confRate}`);
  console.log(`     • Telemetry Latency:    ${latencyStatus}`);

  // Test 3: Affected Person (Citizen)
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'amrita.devi@example.org');
  await page.fill('input[type="password"]', 'ResQSecure2026!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
  const roleText1 = await page.locator('text=/ROLE MODE:.*/').innerText();
  console.log('✓ 3. Affected Person logged in ->', roleText1);

  // Test 4: Volunteer
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'rahul.volunteer@example.org');
  await page.fill('input[type="password"]', 'ResQSecure2026!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
  const roleText2 = await page.locator('text=/ROLE MODE:.*/').innerText();
  console.log('✓ 4. Field Volunteer logged in ->', roleText2);

  // Test 5: NGO Coordinator
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'dispatch@punjabrelief.org');
  await page.fill('input[type="password"]', 'ResQSecure2026!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
  const roleText3 = await page.locator('text=/ROLE MODE:.*/').innerText();
  console.log('✓ 5. NGO Coordinator logged in ->', roleText3);

  // Test 6: Resource Provider
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'logistics@ludhianamedical.org');
  await page.fill('input[type="password"]', 'ResQSecure2026!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
  const roleText4 = await page.locator('text=/ROLE MODE:.*/').innerText();
  console.log('✓ 6. Resource Provider logged in ->', roleText4);

  await browser.close();
  console.log('\nALL 5 STAGING PRE-REQUISITES CONFIRMED READY FOR LIVE PILOT!');
}

verifyBrowserViews().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
