import { test, expect } from '@playwright/test';

test.describe('ResQ Phase 5: Multi-Context Concurrent Core Crisis Lifecycle', () => {
  test('Full core scenario with independent concurrent browser contexts, real-time sync, comms isolation, and resolution confirmation', async ({
    browser,
  }) => {
    // -------------------------------------------------------------------------
    // Create 4 isolated browser contexts simulating genuinely concurrent users
    // -------------------------------------------------------------------------
    const contextCitizen = await browser.newContext();
    const contextAdmin = await browser.newContext();
    const contextVolunteer = await browser.newContext();
    const contextUnrelated = await browser.newContext();

    const pageCitizen = await contextCitizen.newPage();
    const pageAdmin = await contextAdmin.newPage();
    const pageVolunteer = await contextVolunteer.newPage();
    const pageUnrelated = await contextUnrelated.newPage();

    // -------------------------------------------------------------------------
    // STEP 1: Context A (Citizen / Bystander) submits emergency request
    // -------------------------------------------------------------------------
    console.log('[E2E Step 1] Citizen navigating to /submit');
    await pageCitizen.goto('/submit');

    // Fill in descriptive emergency details to trigger AI classification suggestion
    const emergencyDescription = 'Elderly resident with severe chest pains and high fever, requires urgent cardiac medicine, ground floor waterlogged';
    await pageCitizen.fill('textarea', emergencyDescription);

    // Wait for debounced Gemini / Heuristic suggestion chip to appear
    console.log('[E2E Step 1] Waiting for AI suggestion chip');
    const suggestionChip = pageCitizen.locator('button:has-text("tap to apply")');
    await expect(suggestionChip).toBeVisible({ timeout: 25000 });

    // Tap to apply suggested category
    await suggestionChip.click();

    // Verify category dropdown was updated to medical
    const categorySelect = pageCitizen.locator('select').first();
    await expect(categorySelect).toHaveValue('medical');

    // Fill contact phone
    const contactPhone = '+91 98765 43210';
    await pageCitizen.fill('input[type="tel"]', contactPhone);

    // Submit emergency report
    console.log('[E2E Step 1] Submitting emergency request');
    await pageCitizen.click('button[type="submit"]:has-text("Submit emergency request")');

    // Verify submission success state and extract generated Request ID
    const successHeader = pageCitizen.locator('text=REQUEST LOGGED');
    await expect(successHeader).toBeVisible({ timeout: 15000 });

    const ticketIdLocator = pageCitizen.locator('text=/REQ-\\d{4}-\\d{6}/').first();
    await expect(ticketIdLocator).toBeVisible();
    const ticketIdText = await ticketIdLocator.innerText();
    const match = ticketIdText.match(/REQ-\d{4}-\d{6}/);
    expect(match).toBeTruthy();
    const requestId = match![0];
    console.log(`[E2E Step 1] Successfully created emergency request: ${requestId}`);

    // Navigate citizen to live tracking page and leave it open WITHOUT refreshing
    await pageCitizen.click('text=Track this request');
    const unverifiedChip = pageCitizen.locator('text=UNVERIFIED').first();
    await expect(unverifiedChip).toBeVisible({ timeout: 15000 });

    // -------------------------------------------------------------------------
    // STEP 2: Context B (Admin) verifies the new request
    // -------------------------------------------------------------------------
    console.log('[E2E Step 2] Admin logging in on independent context');
    await pageAdmin.goto('/login');
    await pageAdmin.fill('input[type="email"]', 'admin@resq.org');
    await pageAdmin.fill('input[type="password"]', 'ResQSecure2026!');
    await pageAdmin.click('button[type="submit"]:has-text("Log in")');
    await expect(pageAdmin).toHaveURL(/\/admin/, { timeout: 15000 });

    console.log(`[E2E Step 2] Admin verifying request ${requestId}`);
    // Locate the verify button directly on the rail item for this request
    const adminVerifyButton = pageAdmin.locator(`div:has-text("${requestId}")`).locator('button:has-text("Verify")').first();
    await expect(adminVerifyButton).toBeVisible({ timeout: 25000 });
    await adminVerifyButton.click();

    // Verification Modal opens
    const modalHeader = pageAdmin.locator('h2:has-text("Verification Assessment Record")');
    await expect(modalHeader).toBeVisible({ timeout: 10000 });

    // Fill verification remarks
    await pageAdmin.fill('textarea[placeholder*="Contacted caller"]', 'Legitimate medical emergency verified by district coordinator.');
    await pageAdmin.click('button[type="submit"]:has-text("Confirm Verification & Queue")');
    await expect(modalHeader).not.toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------------------
    // STEP 3: Context C (Volunteer) discovers verified request, checks Suggested Matches, and claims it
    // -------------------------------------------------------------------------
    console.log('[E2E Step 3] Field Volunteer logging in on independent context');
    await pageVolunteer.goto('/login');
    await pageVolunteer.fill('input[type="email"]', 'rahul.volunteer@example.org');
    await pageVolunteer.fill('input[type="password"]', 'ResQSecure2026!');
    await pageVolunteer.click('button[type="submit"]:has-text("Log in")');
    await expect(pageVolunteer).toHaveURL(/\/dashboard/, { timeout: 15000 });

    console.log(`[E2E Step 3] Volunteer finding verified request ${requestId}`);
    // Select verified request by clicking its ID text in the rail to open inspection drawer
    const volunteerIdSpan = pageVolunteer.locator(`span:has-text("${requestId}")`).first();
    await expect(volunteerIdSpan).toBeVisible({ timeout: 25000 });
    await volunteerIdSpan.click();

    // Confirm the Suggested Matches panel populated inside the inspection drawer
    console.log('[E2E Step 3] Verifying Suggested Matches panel is populated');
    const suggestedMatchesHeader = pageVolunteer.locator('text=Automated Candidate Suggestions');
    await expect(suggestedMatchesHeader).toBeVisible({ timeout: 15000 });

    // Claim the request
    console.log('[E2E Step 3] Claiming request as volunteer');
    const claimButton = pageVolunteer.locator('button:has-text("Claim this request")').first();
    await expect(claimButton).toBeVisible({ timeout: 10000 });
    await claimButton.click();

    // Verify claim succeeded on volunteer console
    await expect(pageVolunteer.locator('text=IN PROGRESS').or(pageVolunteer.locator('text=IN_PROGRESS')).first()).toBeVisible({ timeout: 15000 });

    // -------------------------------------------------------------------------
    // STEP 4: Context A (Citizen) sees request update live to in_progress (NO REFRESH)
    // -------------------------------------------------------------------------
    console.log('[E2E Step 4] Verifying Citizen received live in_progress update without refresh');
    await expect(pageCitizen.locator('text=IN PROGRESS').or(pageCitizen.locator('text=IN_PROGRESS')).first()).toBeVisible({ timeout: 20000 });

    // -------------------------------------------------------------------------
    // STEP 5: Notification & Comms Isolation Check (Context C vs Context D)
    // -------------------------------------------------------------------------
    // Notification check on Context C (Volunteer)
    console.log('[E2E Step 5] Checking notifications on Context C (Volunteer)');
    await pageVolunteer.click('button:has-text("Notifications")');
    await expect(pageVolunteer.locator('text=REQ-2026-004795').first()).toBeVisible({ timeout: 15000 });

    // Context D (Unrelated Supplier): Login and verify Notification & Comms ISOLATION
    console.log('[E2E Step 5] Context D (Unrelated Supplier) verifying notification isolation');
    await pageUnrelated.goto('/login');
    await pageUnrelated.fill('input[type="email"]', 'logistics@ludhianamedical.org');
    await pageUnrelated.fill('input[type="password"]', 'ResQSecure2026!');
    await pageUnrelated.click('button[type="submit"]:has-text("Log in")');
    await expect(pageUnrelated).toHaveURL(/\/dashboard/, { timeout: 15000 });

    // Switch Context D (resource_provider) from Depot tab to Dispatch Console tab
    await pageUnrelated.click('button:has-text("Dispatch Console")');

    // Open notifications on Context D - confirm volunteer's notification is NOT visible
    await pageUnrelated.click('button:has-text("Notifications")');
    const unrelatedNotif = pageUnrelated.locator('text=REQ-2026-004795');
    await expect(unrelatedNotif).toHaveCount(0);

    // Context A (Citizen): authorize into private comms channel with registered phone
    console.log('[E2E Step 5] Citizen authenticates comms channel with registered contact phone');
    const citizenPhoneInput = pageCitizen.locator('input[placeholder*="registered with request"]');
    if (await citizenPhoneInput.isVisible()) {
      await citizenPhoneInput.fill(contactPhone);
      await pageCitizen.locator('button:has-text("Refresh")').first().click();
    }

    // Volunteer opens tracking / comms details for this request
    console.log('[E2E Step 5] Context C (Volunteer) sending message in request comms thread');
    await pageVolunteer.goto(`/track?id=${requestId}`);

    const volunteerMessage = 'Loaded emergency cardiac medicine at Sector 4 depot. En route now, ETA 10 minutes.';
    const commsTextarea = pageVolunteer.locator('textarea[placeholder*="operational update"]').or(pageVolunteer.locator('textarea[placeholder*="Transmit message"]')).first();
    await expect(commsTextarea).toBeVisible({ timeout: 15000 });
    await commsTextarea.fill(volunteerMessage);
    await pageVolunteer.click('button[type="submit"]:has-text("Transmit message")');

    // Context A (Citizen): live message receipt without refresh
    console.log('[E2E Step 5] Verifying Citizen received live message without refresh');
    await expect(pageCitizen.locator(`text=${volunteerMessage}`).first()).toBeVisible({ timeout: 20000 });

    // Citizen replies in the comms thread
    const citizenReply = 'Thank you Rahul, we are on the first floor terrace waiting with medical records.';
    const citizenCommsTextarea = pageCitizen.locator('textarea[placeholder*="operational update"]').or(pageCitizen.locator('textarea[placeholder*="Transmit message"]')).or(pageCitizen.locator('textarea')).first();
    await citizenCommsTextarea.fill(citizenReply);
    await pageCitizen.click('button[type="submit"]:has-text("Transmit message")');
    await expect(pageCitizen.locator(`text=${citizenReply}`).first()).toBeVisible({ timeout: 15000 });

    // Context C (Volunteer): sees citizen's reply live without refresh
    await expect(pageVolunteer.locator(`text=${citizenReply}`).first()).toBeVisible({ timeout: 20000 });

    // Context D attempts to access unrelated request comms
    console.log('[E2E Step 5] Context D verifying comms isolation');
    await pageUnrelated.goto(`/track?id=${requestId}`);
    const privateMessageOnD = pageUnrelated.locator(`text=${volunteerMessage}`);
    await expect(privateMessageOnD).toHaveCount(0);

    // -------------------------------------------------------------------------
    // STEP 6: Status Progression to Resolved & Requester Confirms to Close
    // -------------------------------------------------------------------------
    console.log('[E2E Step 6] Context C (Volunteer) marks request as resolved');
    await pageVolunteer.goto('/dashboard');
    const resolveButton = pageVolunteer.locator(`div:has-text("${requestId}")`).locator('button:has-text("Mark resolved")').first();
    await expect(resolveButton).toBeVisible({ timeout: 25000 });
    await resolveButton.click();

    // Context A (Citizen - Live Check): Status updates to RESOLVED without reload
    console.log('[E2E Step 6] Verifying Citizen sees live RESOLVED status without reload');
    await expect(pageCitizen.locator('text=RESOLVED').first()).toBeVisible({ timeout: 20000 });

    // Citizen confirms resolution to close ticket
    console.log('[E2E Step 6] Citizen confirms resolution');
    const confirmPhoneInput = pageCitizen.locator('input[placeholder*="+91 98765"]');
    if (await confirmPhoneInput.isVisible()) {
      await confirmPhoneInput.fill(contactPhone);
    }

    await pageCitizen.click('button[type="submit"]:has-text("Confirm resolution")');

    // Verify final state is CLOSED
    console.log('[E2E Step 6] Verifying final CLOSED state');
    await expect(pageCitizen.locator('text=CLOSED').first()).toBeVisible({ timeout: 20000 });
    console.log('[E2E Success] Core lifecycle concurrency test completed with 100% assertions satisfied!');

    // Clean up all contexts
    await contextCitizen.close();
    await contextAdmin.close();
    await contextVolunteer.close();
    await contextUnrelated.close();
  });
});
