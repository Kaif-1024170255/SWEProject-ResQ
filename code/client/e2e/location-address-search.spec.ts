import { test, expect } from '@playwright/test';

test.describe('Additive Address Search on LocationPicker and Incident Management', () => {
  test('Search address, pick from dropdown, submit request with privacy protection', async ({ page, request }) => {
    // 1. Navigate to /submit
    await page.goto('/submit');
    await page.waitForLoadState('networkidle');

    // 2. Verify all three location picking methods are visible
    const searchInput = page.locator('input[placeholder*="Type address, sector, or landmark"]');
    await expect(searchInput).toBeVisible();

    const gpsButton = page.locator('button:has-text("Use current location")');
    await expect(gpsButton).toBeVisible();

    const leafletMap = page.locator('.leaflet-container');
    await expect(leafletMap).toBeVisible();

    // 3. Type query into address search input
    await searchInput.fill('Civil Lines, Ludhiana');

    // 4. Autocomplete dropdown appears with matching results from Nominatim proxy
    const dropdownResult = page.locator('button:has-text("Civil Lines")').first();
    await expect(dropdownResult).toBeVisible({ timeout: 15000 });

    // 5. Click the candidate to select it
    await dropdownResult.click();

    // Verify search input reflects the selected location
    const selectedValue = await searchInput.inputValue();
    expect(selectedValue.toLowerCase()).toContain('civil lines');

    // Coordinates display updates
    const coordsDisplay = page.locator('text=/COORDINATES: \\d+\\.\\d+, \\d+\\.\\d+/');
    await expect(coordsDisplay).toBeVisible();

    // 6. Fill out the situation description
    await page.locator('textarea').fill('Test emergency with text address search verification. Urgent aid needed.');
    
    // 7. Submit request
    await page.locator('button[type="submit"]:has-text("Submit emergency request")').click();

    // 8. Confirm success screen
    await expect(page.locator('text=REQUEST LOGGED')).toBeVisible({ timeout: 15000 });
    const idElem = page.locator('text=/REQ-\\d{4}-\\d{6}/').first();
    await expect(idElem).toBeVisible();
    const idText = await idElem.innerText();
    const match = idText.match(/REQ-\d{4}-\d{6}/);
    expect(match).toBeTruthy();
    const requestId = match![0];

    // 9. Privacy Verification (Public unauthenticated access):
    // Check both GET /api/requests and GET /api/requests/:id
    const publicListRes = await request.get('/api/requests');
    expect(publicListRes.ok()).toBeTruthy();
    const publicListData = await publicListRes.json();
    const foundInList = publicListData.requests.find((r: any) => r.requestId === requestId);
    expect(foundInList).toBeDefined();
    expect(foundInList.location.address).toBeUndefined();

    const publicDetailRes = await request.get(`/api/requests/${encodeURIComponent(requestId)}`);
    expect(publicDetailRes.ok()).toBeTruthy();
    const publicDetailData = await publicDetailRes.json();
    expect(publicDetailData.isPreciseLocationRevealed).toBe(false);
    expect(publicDetailData.request.location.address).toBeUndefined();

    // 10. Authenticated Verification (Admin access):
    // Log in as admin and verify address is present in detailed view
    const adminLoginRes = await request.post('/api/auth/login', {
      data: {
        email: 'admin@resq.org',
        password: 'ResQSecure2026!',
      },
    });
    expect(adminLoginRes.ok()).toBeTruthy();
    const { token: adminToken } = await adminLoginRes.json();

    const authRes = await request.get(`/api/requests/${encodeURIComponent(requestId)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(authRes.ok()).toBeTruthy();
    const authData = await authRes.json();
    expect(authData.isPreciseLocationRevealed).toBe(true);
    expect(authData.request.location.address).toBeDefined();
    expect(authData.request.location.address.toLowerCase()).toContain('civil lines');
  });

  test('Incident creation address search recenters perimeter map', async ({ page }) => {
    // 1. Log in as admin
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@resq.org');
    await page.locator('input[type="password"]').fill('ResQSecure2026!');
    await page.locator('button[type="submit"]:has-text("Log in")').click();
    await page.waitForURL('**/admin**', { timeout: 15000 });

    // 2. Open Major Incidents Tab
    const incidentsTab = page.locator('button:has-text("Major Incidents")');
    await expect(incidentsTab).toBeVisible();
    await incidentsTab.click();

    // 3. Open "+ Declare Major Incident" drawer
    const declareBtn = page.locator('button:has-text("Declare Major Incident")');
    await expect(declareBtn).toBeVisible();
    await declareBtn.click();

    // 4. Verify geocode address search bar is visible in incident drawer
    const incidentLocSearch = page.locator('input[placeholder*="Search address, landmark, or sector to center perimeter"]');
    await expect(incidentLocSearch).toBeVisible();

    // 5. Search for a location
    await incidentLocSearch.fill('Model Town, Ludhiana');

    // 6. Autocomplete dropdown appears
    const resultItem = page.locator('button:has-text("Model Town")').first();
    await expect(resultItem).toBeVisible({ timeout: 15000 });
    await resultItem.click();

    // Verify center coordinates readout updated
    const centerDisplay = page.locator('text=/Center: \\d+\\.\\d+, \\d+\\.\\d+/');
    await expect(centerDisplay).toBeVisible();
  });
});
