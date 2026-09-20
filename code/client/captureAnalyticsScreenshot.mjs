import { chromium } from '@playwright/test';
import path from 'path';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();

  // Login as admin
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'admin@resq.org');
  await page.fill('input[type="password"]', 'ResQSecure2026!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin');

  // Go to Analytics
  await page.click('a:has-text("Analytics")');
  await page.waitForURL('**/analytics');

  // Wait 1.5s for charts and telemetry to render
  await page.waitForTimeout(1500);

  // Filter to 24h
  await page.click('button:has-text("Last 24 Hours")');
  await page.waitForTimeout(1000);

  const screenshotPath = path.resolve(process.cwd(), '../pilot_analytics_snapshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Analytics screenshot saved to:', screenshotPath);

  await browser.close();
}

capture().catch(err => {
  console.error('Failed to capture screenshot:', err);
  process.exit(1);
});
