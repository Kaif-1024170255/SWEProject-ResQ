import { TestCaseAnnotation } from '../build-annotations-data';

export const REQUESTS_AND_PRIVACY_ANNOTATIONS: Record<string, TestCaseAnnotation> = {
  'server/tests/geocode.test.ts > GET /api/geocode (OSM Nominatim Proxy) > should return 400 when query parameter "q" is missing or empty': {
    area: 'Privacy and location',
    type: 'integration',
    roles: 'public / unauthenticated',
    polarity: 'negative',
    use_case:
      'Prevents unnecessary external Nominatim proxy requests and rejects empty address lookups when a client omits the search text query.',
    preconditions: 'Geocode router is mounted at /api/geocode with rate limiting and in-memory cache.',
    steps: [
      'Send GET /api/geocode with missing query parameter',
      'Send GET /api/geocode?q=',
      'Assert response status is 400 and contains validation error message',
    ],
    expected_result: 'HTTP 400 Bad Request with an informative error stating query parameter "q" is required.',
    code_under_test: [
      {
        file: 'server/src/routes/geocode.ts',
        lines: '56-65',
        symbol: 'GET /api/geocode (Query Validation)',
      },
    ],
    phase_introduced: 'Phase 5 (Location Address Search)',
  },

  'server/tests/geocode.test.ts > GET /api/geocode (OSM Nominatim Proxy) > should return 400 when query parameter "q" is only whitespace': {
    area: 'Privacy and location',
    type: 'integration',
    roles: 'public / unauthenticated',
    polarity: 'negative',
    use_case:
      'Rejects address queries containing only whitespace characters to protect upstream OSM Nominatim API quota.',
    preconditions: 'Geocode router is mounted at /api/geocode.',
    steps: [
      'Send GET /api/geocode?q=%20%20%20',
      'Assert response status is 400 Bad Request',
    ],
    expected_result: 'HTTP 400 Bad Request indicating that non-empty text is required.',
    code_under_test: [
      {
        file: 'server/src/routes/geocode.ts',
        lines: '56-65',
        symbol: 'GET /api/geocode (Whitespace Query Validation)',
      },
    ],
    phase_introduced: 'Phase 5 (Location Address Search)',
  },

  'server/tests/geocode.test.ts > GET /api/geocode (OSM Nominatim Proxy) > should return 200 with matching candidates for a real query and cache subsequent queries': {
    area: 'Privacy and location',
    type: 'integration',
    roles: 'public / unauthenticated',
    polarity: 'positive',
    use_case:
      'Provides human-readable address lookups with latitude and longitude coordinates through a server-side cached Nominatim proxy.',
    preconditions: 'OSM Nominatim API endpoint is reachable or cached in memory.',
    steps: [
      'Send GET /api/geocode?q=Thapar+University',
      'Assert HTTP 200 with candidates array containing display_name, lat, and lng',
      'Send identical request immediately and verify cached response without secondary upstream call',
    ],
    expected_result: 'HTTP 200 with candidates array and sub-second cached response on repeat query.',
    code_under_test: [
      {
        file: 'server/src/routes/geocode.ts',
        lines: '66-159',
        symbol: 'GET /api/geocode (Nominatim Proxy & In-Memory Cache)',
      },
    ],
    phase_introduced: 'Phase 5 (Location Address Search)',
  },

  'server/tests/requests.test.ts > POST /api/requests (Emergency Request Submission) > should accept a public emergency request and return requestId and confirmation': {
    area: 'Request lifecycle',
    type: 'integration',
    roles: 'public / affected_person',
    polarity: 'positive',
    use_case:
      'Allows citizens in distress to submit emergency relief requests anonymously or with phone contact, generating a tracking code.',
    preconditions: 'Emergency categories and database indexes initialized.',
    steps: [
      'Send POST /api/requests with category, title, description, and precise coordinates',
      'Assert response status 201 Created',
      'Verify formatted requestId (REQ-YYYY-NNNNNN) and confirmationCode are returned',
    ],
    expected_result: 'HTTP 201 Created with persisted unverified ticket and tracking confirmation code.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '104-179',
        symbol: 'POST /api/requests (Emergency Request Submission)',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/requests.test.ts > POST /api/requests (Emergency Request Submission) > should reject submission with missing category': {
    area: 'Request lifecycle',
    type: 'integration',
    roles: 'public / affected_person',
    polarity: 'negative',
    use_case:
      'Protects intake integrity by rejecting emergency request submissions that fail to provide an emergency category.',
    preconditions: 'MongoDB test server running.',
    steps: [
      'Send POST /api/requests with title and coordinates but omitting category',
      'Assert response status 400 Bad Request',
      'Assert error payload contains validation message for category',
    ],
    expected_result: 'HTTP 400 Bad Request with field validation failure.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '104-125',
        symbol: 'POST /api/requests (Payload Validation)',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/requests.test.ts > POST /api/requests (Emergency Request Submission) > should reject submission with invalid category': {
    area: 'Request lifecycle',
    type: 'integration',
    roles: 'public / affected_person',
    polarity: 'negative',
    use_case:
      'Prevents garbage intake by rejecting emergency requests specifying unknown or unrecognized disaster category strings.',
    preconditions: 'Recognized categories loaded in database.',
    steps: [
      'Send POST /api/requests with category set to "alien_invasion"',
      'Assert response status 400 Bad Request',
    ],
    expected_result: 'HTTP 400 Bad Request with invalid category notification.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '104-125',
        symbol: 'POST /api/requests (Category Taxonomy Validation)',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/requests.test.ts > POST /api/requests (Emergency Request Submission) > should reject submission with invalid coordinates': {
    area: 'Privacy and location',
    type: 'integration',
    roles: 'public / affected_person',
    polarity: 'negative',
    use_case:
      'Rejects submissions with invalid latitude (outside [-90, 90]) or longitude (outside [-180, 180]) to prevent geospatial query corruption.',
    preconditions: 'MongoDB test database connected.',
    steps: [
      'Send POST /api/requests with latitude: 200 and longitude: -300',
      'Assert response status 400 Bad Request',
      'Assert validation failure message for coordinates',
    ],
    expected_result: 'HTTP 400 Bad Request indicating invalid geographical coordinates.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '104-135',
        symbol: 'POST /api/requests (Geographic Coordinate Range Check)',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/requests.test.ts > GET /api/requests (Public Requests List) > should NEVER leak precise coordinates in public list': {
    area: 'Privacy and location',
    type: 'integration',
    roles: 'public / unauthenticated',
    polarity: 'positive',
    use_case:
      'Guarantees victim privacy by ensuring public listing endpoints fuzz coordinates and redact precise GPS points and phone numbers.',
    preconditions: 'Test requests created with precise coordinates.',
    steps: [
      'Send unauthenticated GET /api/requests',
      'Assert response status 200 OK',
      'Inspect all returned items to ensure location.preciseCoordinates and contactPhone are undefined',
      'Assert location.publicCoordinates contains fuzzed offsets',
    ],
    expected_result: 'HTTP 200 OK with strict redaction of victim coordinates and contact info.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '181-212',
        symbol: 'GET /api/requests (Public Requests List Sanitization)',
      },
      {
        file: 'server/src/utils/sanitize.ts',
        lines: '6-24',
        symbol: 'sanitizeRequest',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/requests.test.ts > GET /api/requests (Public Requests List) > should filter requests by status': {
    area: 'Request lifecycle',
    type: 'integration',
    roles: 'public / unauthenticated',
    polarity: 'positive',
    use_case:
      'Allows dispatchers, volunteers, and the public to filter request listings by operational status (e.g., unverified vs. in_progress).',
    preconditions: 'Requests with mixed statuses seeded in test database.',
    steps: [
      'Send GET /api/requests?status=in_progress',
      'Assert response status 200 OK',
      'Verify all returned items match the requested status',
    ],
    expected_result: 'HTTP 200 OK with accurately filtered array of requests.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '181-212',
        symbol: 'GET /api/requests (Query Parameter Status Filter)',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/requests.test.ts > GET /api/requests/:id (Privacy Rules for Single Request) > should hide precise coordinates from unauthenticated public request': {
    area: 'Privacy and location',
    type: 'integration',
    roles: 'public / unauthenticated',
    polarity: 'positive',
    use_case:
      'Prevents unauthenticated public visitors from viewing exact victim coordinates when opening a single request by ID.',
    preconditions: 'Request document seeded with precise location.',
    steps: [
      'Send unauthenticated GET /api/requests/:id',
      'Assert response status 200 OK',
      'Verify preciseCoordinates and contactPhone are absent',
      'Verify publicCoordinates are present',
    ],
    expected_result: 'HTTP 200 OK with coordinates fuzzed to public level.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '214-270',
        symbol: 'GET /api/requests/:id (Unauthenticated Redaction)',
      },
      {
        file: 'server/src/utils/sanitize.ts',
        lines: '6-24',
        symbol: 'sanitizeRequest',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/requests.test.ts > GET /api/requests/:id (Privacy Rules for Single Request) > should hide precise coordinates from unrelated volunteer': {
    area: 'Privacy and location',
    type: 'integration',
    roles: 'volunteer (unassigned)',
    polarity: 'positive',
    use_case:
      'Prevents authenticated volunteers who have not claimed the ticket from accessing the victim exact physical location.',
    preconditions: 'Request document created; volunteer authenticated with JWT.',
    steps: [
      'Send GET /api/requests/:id with Bearer token of an unassigned volunteer',
      'Assert response status 200 OK',
      'Confirm preciseCoordinates are stripped from response body',
    ],
    expected_result: 'HTTP 200 OK with preciseCoordinates hidden from unrelated volunteers.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '214-270',
        symbol: 'GET /api/requests/:id (Unassigned Volunteer Sanitization)',
      },
      {
        file: 'server/src/utils/sanitize.ts',
        lines: '6-24',
        symbol: 'sanitizeRequest',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/requests.test.ts > GET /api/requests/:id (Privacy Rules for Single Request) > should reveal precise coordinates to administrator': {
    area: 'Privacy and location',
    type: 'integration',
    roles: 'admin',
    polarity: 'positive',
    use_case:
      'Enables crisis dispatchers and administrators to inspect precise GPS coordinates and victim phone for routing and dispatch.',
    preconditions: 'Admin user authenticated with valid JWT; request seeded.',
    steps: [
      'Send GET /api/requests/:id with Bearer token of an administrator',
      'Assert response status 200 OK',
      'Assert location.preciseCoordinates contains exact latitude and longitude numbers',
    ],
    expected_result: 'HTTP 200 OK with full un-redacted location data exposed to admin.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '214-270',
        symbol: 'GET /api/requests/:id (Admin Full Clearance)',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/requests.test.ts > GET /api/requests/:id (Privacy Rules for Single Request) > should reveal precise coordinates to claimant': {
    area: 'Privacy and location',
    type: 'integration',
    roles: 'volunteer (claimant)',
    polarity: 'positive',
    use_case:
      'Reveals precise GPS coordinates to the specific volunteer who claimed the emergency ticket so they can navigate to the scene.',
    preconditions: 'Request claimed by volunteer; volunteer token generated.',
    steps: [
      'Send GET /api/requests/:id with Bearer token of the active claimant volunteer',
      'Assert response status 200 OK',
      'Assert location.preciseCoordinates is present and matches stored data',
    ],
    expected_result: 'HTTP 200 OK revealing full precise coordinates to the assigned claimant.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '214-270',
        symbol: 'GET /api/requests/:id (Claimant Clearance)',
      },
    ],
    phase_introduced: 'Phase 1',
  },
};
