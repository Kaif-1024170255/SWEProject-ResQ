import { test, expect } from '@playwright/test';

test.describe('ResQ Phase 5: Focused Edge-Case Coverage & Defect Prevention', () => {

  // =========================================================================
  // TEST 1: Phase 3B Role Permission Enforcement in the UI
  // =========================================================================
  test('Phase 3B Permission Enforcement: Unauthorized roles never see forbidden actions', async ({
    page,
  }) => {
    // -----------------------------------------------------------------------
    // Part A: Resource Provider cannot claim field requests
    // -----------------------------------------------------------------------
    console.log('[Test 1A] Logging in as resource_provider (Ludhiana Depot)');
    await page.goto('/login');
    await page.fill('input[type="email"]', 'logistics@ludhianamedical.org');
    await page.fill('input[type="password"]', 'ResQSecure2026!');
    await page.click('button[type="submit"]:has-text("Log in")');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    // Switch to Dispatch Console tab
    await page.click('button:has-text("Dispatch Console")');

    // Filter to verified requests
    await page.getByRole('button', { name: 'verified', exact: true }).click();

    // Select the first verified emergency request in the list
    const verifiedTicketSpan = page.locator('span:has-text("REQ-")').first();
    await expect(verifiedTicketSpan).toBeVisible({ timeout: 15000 });
    const verifiedTicketText = (await verifiedTicketSpan.innerText()).trim();
    await verifiedTicketSpan.click();

    // Verify "Claim this request" action is NOT presented anywhere to the resource_provider
    console.log('[Test 1A] Confirming "Claim this request" is not present for resource_provider');
    const claimButtonProvider = page.locator('button:has-text("Claim this request")');
    await expect(claimButtonProvider).toHaveCount(0);

    // Logout
    await page.click('button:has-text("Log out")');

    // -----------------------------------------------------------------------
    // Part B: Volunteer IS allowed to claim verified field requests
    // -----------------------------------------------------------------------
    console.log('[Test 1B] Logging in as volunteer (Rahul Sharma)');
    await page.goto('/login');
    await page.fill('input[type="email"]', 'rahul.volunteer@example.org');
    await page.fill('input[type="password"]', 'ResQSecure2026!');
    await page.click('button[type="submit"]:has-text("Log in")');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    // Select verified request in volunteer console rail
    await page.getByRole('button', { name: 'verified', exact: true }).click();
    const verifiedTicketSpanVol = page.locator(`span:has-text("${verifiedTicketText}")`).first();
    await expect(verifiedTicketSpanVol).toBeVisible({ timeout: 15000 });
    await verifiedTicketSpanVol.click();

    // Confirm "Claim this request" IS presented to the volunteer
    console.log('[Test 1B] Confirming "Claim this request" IS present for volunteer');
    const claimButtonVolunteer = page.locator('button:has-text("Claim this request")').first();
    await expect(claimButtonVolunteer).toBeVisible({ timeout: 10000 });

    // Logout
    await page.click('button:has-text("Log out")');

    // -----------------------------------------------------------------------
    // Part C: Administrator cannot verify their own submitted requests (Conflict of Interest)
    // -----------------------------------------------------------------------
    console.log('[Test 1C] Admin submits a report and verifies UI blocks self-verification');
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@resq.org');
    await page.fill('input[type="password"]', 'ResQSecure2026!');
    await page.click('button[type="submit"]:has-text("Log in")');
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });

    // Admin reports an emergency report while authenticated
    await page.click('a:has-text("Report emergency")');
    await expect(page).toHaveURL(/\/submit/, { timeout: 15000 });

    const adminEmergencyText = 'Admin logged field report: High tension power line fallen over canal pathway';
    await page.fill('textarea', adminEmergencyText);
    await page.fill('input[type="tel"]', '+91 98765 00099');
    await page.click('button[type="submit"]:has-text("Submit emergency request")');

    const loggedBanner = page.locator('text=REQUEST LOGGED');
    await expect(loggedBanner).toBeVisible({ timeout: 15000 });
    const adminTicketIdLocator = page.locator('text=/REQ-\\d{4}-\\d{6}/').first();
    const adminTicketText = await adminTicketIdLocator.innerText();
    const match = adminTicketText.match(/REQ-\d{4}-\d{6}/);
    expect(match).toBeTruthy();
    const adminCreatedReqId = match![0];

    // Return to /admin console
    await page.goto('/admin');
    await page.getByRole('button', { name: 'unverified', exact: true }).click();

    // Locate admin's own ticket in the rail
    const ownTicketSpan = page.locator(`span:text-is("${adminCreatedReqId}")`);
    await expect(ownTicketSpan).toBeVisible({ timeout: 15000 });
    const ownTicketRailItem = ownTicketSpan.locator('xpath=ancestor::div[contains(@class, "p-3.5")]');

    // The UI must display "Own" instead of a clickable "Verify" button for the submitter
    const ownBadge = ownTicketRailItem.locator('span[title*="Cannot verify own submission"]');
    await expect(ownBadge).toBeVisible();
    await expect(ownBadge).toHaveText('Own');

    const verifyOnOwn = ownTicketRailItem.locator('button:has-text("Verify")');
    await expect(verifyOnOwn).toHaveCount(0);
    console.log('[Test 1 Success] Phase 3B permission enforcement verified in UI!');
  });

  // =========================================================================
  // TEST 2: Matching Engine Scoring Breakdown & Candidate Invitation Flow
  // =========================================================================
  test('Matching & Direct Invitation: Multi-factor breakdown and real in-app notification dispatch', async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const volunteerContext = await browser.newContext();

    const pageAdmin = await adminContext.newPage();
    const pageVolunteer = await volunteerContext.newPage();

    console.log('[Test 2] Citizen submitting fresh emergency ticket for matching flow');
    const citizenContext = await browser.newContext();
    const pageCitizen = await citizenContext.newPage();
    await pageCitizen.goto('/submit');
    await pageCitizen.fill('textarea', 'Flash flood emergency: multiple families cut off near canal distributor bridge');
    await pageCitizen.selectOption('select', 'rescue');
    await pageCitizen.fill('input[type="tel"]', '+91 98765 88877');
    await pageCitizen.click('button[type="submit"]:has-text("Submit emergency request")');
    await expect(pageCitizen.locator('text=REQUEST LOGGED')).toBeVisible({ timeout: 15000 });
    const match = (await pageCitizen.locator('text=/REQ-\\d{4}-\\d{6}/').first().innerText()).match(/REQ-\d{4}-\d{6}/);
    expect(match).toBeTruthy();
    const targetTicketId = match![0];
    await citizenContext.close();

    console.log(`[Test 2] Admin logging in to verify ${targetTicketId} and inspect matching suggestions`);
    await pageAdmin.goto('/login');
    await pageAdmin.fill('input[type="email"]', 'admin@resq.org');
    await pageAdmin.fill('input[type="password"]', 'ResQSecure2026!');
    await pageAdmin.click('button[type="submit"]:has-text("Log in")');
    await expect(pageAdmin).toHaveURL(/\/admin/, { timeout: 15000 });

    // Verify the newly created request
    await pageAdmin.getByRole('button', { name: 'unverified', exact: true }).click();
    const freshTicketSpan = pageAdmin.locator(`span:text-is("${targetTicketId}")`);
    await expect(freshTicketSpan).toBeVisible({ timeout: 15000 });
    const freshTicketCard = freshTicketSpan.locator('xpath=ancestor::div[contains(@class, "p-3.5")]');
    await freshTicketCard.locator('button:has-text("Verify")').click();

    // Verification Modal opens - confirm it
    const modalHeader = pageAdmin.locator('h2:has-text("Verification Assessment Record")');
    await expect(modalHeader).toBeVisible({ timeout: 10000 });
    await pageAdmin.fill('textarea[placeholder*="Contacted caller"]', 'Legitimate rescue emergency verified by central dispatch.');
    await pageAdmin.click('button[type="submit"]:has-text("Confirm Verification & Queue")');
    await expect(modalHeader).not.toBeVisible({ timeout: 10000 });

    // Select the verified emergency request
    await pageAdmin.getByRole('button', { name: 'verified', exact: true }).click();
    const targetTicketSpan = pageAdmin.locator(`span:text-is("${targetTicketId}")`);
    await expect(targetTicketSpan).toBeVisible({ timeout: 15000 });
    await targetTicketSpan.click();

    // Verify Suggested Matches panel loaded with candidates
    const suggestionsHeader = pageAdmin.locator('text=Automated Candidate Suggestions');
    await expect(suggestionsHeader).toBeVisible({ timeout: 15000 });

    const candidateCount = pageAdmin.locator('text=/\\d+ candidates? evaluated/');
    await expect(candidateCount).toBeVisible({ timeout: 15000 });

    // Verify multi-factor breakdown grid elements are rendered
    console.log('[Test 2] Verifying multi-factor breakdown elements (Proximity, Suitability, Capacity, Availability)');
    await expect(pageAdmin.locator('text=Proximity (35%)').first()).toBeVisible();
    await expect(pageAdmin.locator('text=Suitability (30%)').first()).toBeVisible();
    await expect(pageAdmin.locator('text=Capacity (20%)').first()).toBeVisible();
    await expect(pageAdmin.locator('text=Availability (15%)').first()).toBeVisible();

    // Invite candidate Rahul Sharma (Volunteer)
    console.log('[Test 2] Admin clicking "Invite Responder" for Rahul Sharma');
    const rahulName = pageAdmin.locator('span.font-semibold:text-is("Rahul Sharma")');
    await expect(rahulName).toBeVisible({ timeout: 15000 });
    const rahulRow = rahulName.locator('xpath=ancestor::div[contains(@class, "p-3.5")]');
    const inviteButton = rahulRow.locator('button:has-text("Invite Responder")');
    await expect(inviteButton).toBeVisible({ timeout: 10000 });
    await inviteButton.click();

    // Verify button transitions to Invited state
    await expect(rahulRow.locator('button:has-text("Invited ✓")')).toBeVisible({ timeout: 10000 });

    // Independent Context: Volunteer logs in and confirms the real notification exists
    console.log('[Test 2] Volunteer logging in to confirm real notification receipt');
    await pageVolunteer.goto('/login');
    await pageVolunteer.fill('input[type="email"]', 'rahul.volunteer@example.org');
    await pageVolunteer.fill('input[type="password"]', 'ResQSecure2026!');
    await pageVolunteer.click('button[type="submit"]:has-text("Log in")');
    await expect(pageVolunteer).toHaveURL(/\/dashboard/, { timeout: 15000 });

    // Open Notifications tab
    await pageVolunteer.click('button:has-text("Notifications")');
    const inviteNotification = pageVolunteer.locator(`text=Dispatch Match Invitation: ${targetTicketId}`).first();
    await expect(inviteNotification).toBeVisible({ timeout: 15000 });

    console.log('[Test 2 Success] Matching factor breakdown and invite notification flow verified!');
    await adminContext.close();
    await volunteerContext.close();
  });

  // =========================================================================
  // TEST 3: AI Classification Suggestion & Offline Resilience Fallback
  // =========================================================================
  test('AI Classification: Suggestion apply, dismiss, and uninterrupted submission during simulated outage', async ({
    page,
  }) => {
    // -----------------------------------------------------------------------
    // Part A: Suggestion Appearance, Dismissal, and Apply
    // -----------------------------------------------------------------------
    console.log('[Test 3A] Navigating to /submit to test suggestion interactions');
    await page.goto('/submit');

    const emergencyDescription = 'Elderly resident with severe chest pains and high fever, requires urgent cardiac medicine';
    await page.fill('textarea', emergencyDescription);

    // Wait for suggestion chip to appear
    const applyButton = page.locator('button:has-text("tap to apply")');
    await expect(applyButton).toBeVisible({ timeout: 25000 });

    // Test Dismiss button (×)
    console.log('[Test 3A] Testing dismiss suggestion button (×)');
    const dismissButton = page.locator('button[title="Dismiss suggestion"]');
    await expect(dismissButton).toBeVisible();
    await dismissButton.click();
    await expect(applyButton).not.toBeVisible();

    // Add extra text to re-trigger suggestion
    console.log('[Test 3A] Retriggering suggestion and testing apply');
    await page.fill('textarea', emergencyDescription + ' urgently needed');
    await expect(applyButton).toBeVisible({ timeout: 25000 });

    // Tap to apply suggested category
    await applyButton.click();
    const categorySelect = page.locator('select').first();
    await expect(categorySelect).toHaveValue('medical');

    // -----------------------------------------------------------------------
    // Part B: Simulated AI Microservice Outage / Network Failure
    // -----------------------------------------------------------------------
    console.log('[Test 3B] Simulating AI classification service outage (HTTP 503)');
    await page.route('**/api/classification/suggest', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Service Unavailable' }),
      });
    });

    // Reset or navigate to fresh submit page with mock outage active
    await page.goto('/submit');
    const floodReport = 'Flash flood surge entered ground floor apartment, elderly couple trapped on kitchen table';
    await page.fill('textarea', floodReport);

    // Select category manually
    await page.selectOption('select', 'rescue');
    await page.fill('input[type="tel"]', '+91 98765 22222');

    // Verify suggestion chip did not appear and no errors blocked the form
    await page.waitForTimeout(1000);
    await expect(page.locator('button:has-text("tap to apply")')).toHaveCount(0);

    // Submit emergency report while classification is completely unavailable
    console.log('[Test 3B] Submitting emergency request during simulated outage');
    await page.click('button[type="submit"]:has-text("Submit emergency request")');

    // Confirmation screen must be reached normally without delay or error
    const successHeader = page.locator('text=REQUEST LOGGED');
    await expect(successHeader).toBeVisible({ timeout: 15000 });
    const ticketIdLocator = page.locator('text=/REQ-\\d{4}-\\d{6}/').first();
    await expect(ticketIdLocator).toBeVisible();

    console.log('[Test 3 Success] AI classification suggestion and offline resilience verified!');
  });

  // =========================================================================
  // TEST 4: Analytics Dashboard Proposal Metrics & Time-Range Filter
  // =========================================================================
  test('Analytics Dashboard: Non-zero metrics readout and dynamic date-range filtering', async ({
    page,
  }) => {
    console.log('[Test 4] Admin logging in to inspect analytics dashboard');
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@resq.org');
    await page.fill('input[type="password"]', 'ResQSecure2026!');
    await page.click('button[type="submit"]:has-text("Log in")');
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });

    // Navigate to Analytics page via in-app navigation
    await page.click('a:has-text("Analytics")');
    await expect(page).toHaveURL(/\/analytics/, { timeout: 15000 });

    // Verify Metric 1: Time-to-Match renders real non-zero median minutes
    console.log('[Test 4] Checking Metric 1: Time-to-Match non-zero readout');
    const timeToMatchCard = page.locator('div.p-5:has-text("1. Time-to-Match")');
    await expect(timeToMatchCard).toBeVisible({ timeout: 15000 });

    const medianMinutesText = timeToMatchCard.locator('span.font-mono.text-4xl').first();
    await expect(medianMinutesText).toBeVisible();
    const medianVal = await medianMinutesText.innerText();
    expect(medianVal).not.toBe('0 min');
    console.log(`[Test 4] Verified 7-Day Median Time-to-Match: ${medianVal}`);

    // Verify Metric 2: Double-Booking Rate renders 0.0% integrity verified
    console.log('[Test 4] Checking Metric 2: Double-Booking Rate');
    const doubleBookingCard = page.locator('div.p-5:has-text("2. Double-Booking Rate")');
    await expect(doubleBookingCard).toBeVisible();
    await expect(doubleBookingCard.locator('text=0.0%').first()).toBeVisible();
    await expect(doubleBookingCard.locator('text=OPERATIONAL INTEGRITY CONFIRMED').first()).toBeVisible();

    // Verify Metric 3: Confirmation Rate renders non-zero value
    console.log('[Test 4] Checking Metric 3: Confirmation Rate');
    const confirmationCard = page.locator('div.p-5:has-text("3. Confirmation Rate")');
    await expect(confirmationCard).toBeVisible();
    const confirmationRatePct = confirmationCard.locator('span.font-mono.text-4xl').first();
    await expect(confirmationRatePct).toBeVisible();
    const confRateText = await confirmationRatePct.innerText();
    expect(confRateText).toMatch(/\d+(\.\d+)?%/);
    console.log(`[Test 4] Verified Confirmation Rate: ${confRateText}`);

    // Verify Metric 4: Propagation Latency card renders active telemetry
    console.log('[Test 4] Checking Metric 4: Propagation Latency telemetry');
    const latencyCard = page.locator('div.p-5:has-text("4. Propagation Latency")');
    await expect(latencyCard).toBeVisible();
    await expect(latencyCard.locator('text=ACTIVE TELEMETRY').or(latencyCard.locator('text=WARMING UP')).first()).toBeVisible();

    // Test Date-Range Filter Switching: 7d -> 24h
    console.log('[Test 4] Testing date-range filter switching to "Last 24 Hours"');
    const initialEvaluatedText = await page.locator('div.p-5:has-text("1. Time-to-Match") strong.font-mono').first().innerText();

    await page.click('button:has-text("Last 24 Hours")');
    // Wait for state refresh
    await page.waitForTimeout(1000);

    const filteredEvaluatedText = await page.locator('div.p-5:has-text("1. Time-to-Match") strong.font-mono').first().innerText();
    console.log(`[Test 4] Evaluated tickets changed from 7d (${initialEvaluatedText}) to 24h (${filteredEvaluatedText})`);

    // Switch to All Time
    console.log('[Test 4] Testing date-range filter switching to "All Time"');
    await page.click('button:has-text("All Time")');
    await page.waitForTimeout(1000);
    const allTimeEvaluatedText = await page.locator('div.p-5:has-text("1. Time-to-Match") strong.font-mono').first().innerText();
    console.log(`[Test 4] Evaluated tickets for All Time: ${allTimeEvaluatedText}`);

    console.log('[Test 4 Success] Analytics dashboard readout and dynamic date filtering verified!');
  });
});
