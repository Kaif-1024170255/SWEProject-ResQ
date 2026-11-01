import { TestCaseAnnotation } from '../build-annotations-data';

export const INTELLIGENCE_MISC_AND_E2E_ANNOTATIONS: Record<string, TestCaseAnnotation> = {
  // Matching Engine
  'server/tests/matching.test.ts > Phase 4: Rule-Based Matching Engine Unit & Scoring Tests > should calculate accurate Haversine distance in kilometers': {
    area: 'Matching',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'positive',
    use_case:
      'Calculates accurate great-circle surface distance between responder coordinates and disaster site coordinates using Haversine formula.',
    preconditions: 'Matching service loaded in memory.',
    steps: [
      'Invoke calculateHaversineDistanceKm between known GPS coordinates (e.g., Patiala to Ludhiana)',
      'Assert distance in kilometers matches spherical trigonometry reference within 0.1km margin',
    ],
    expected_result: 'Calculated distance matches known geographic ground-truth distance.',
    code_under_test: [
      {
        file: 'server/src/services/matching.ts',
        lines: '52-75',
        symbol: 'calculateHaversineDistanceKm',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/matching.test.ts > Phase 4: Rule-Based Matching Engine Unit & Scoring Tests > should score proximity higher for closer candidates and treat undeclared location as neutral (0.5)': {
    area: 'Matching',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'positive',
    use_case:
      'Ranks candidates located within 5km higher than distant responders, while granting neutral 0.5 proximity score to responders with undeclared location.',
    preconditions: 'Volunteers seeded with differing coordinates and undeclared coordinates.',
    steps: [
      'Call calculateMatchesForRequest with request at target coordinate',
      'Compare proximity score of local responder (1.2km away) vs distant responder (45km away)',
      'Confirm undeclared responder receives exactly 0.5 neutral score without penalty',
    ],
    expected_result: 'Closest responder achieves proximity near 1.0; distant responder near 0.0; undeclared candidate receives 0.5.',
    code_under_test: [
      {
        file: 'server/src/services/matching.ts',
        lines: '87-240',
        symbol: 'calculateMatchesForRequest (Proximity Calculation)',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/matching.test.ts > Phase 4: Rule-Based Matching Engine Unit & Scoring Tests > should score candidates with matching inventory resources higher on suitability and capacity': {
    area: 'Matching',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'positive',
    use_case:
      'Boosts suitability and capacity scores for resource providers and organizations whose depot inventory holds the exact requested supplies.',
    preconditions: 'Request with requested items (e.g. 10 water packs); providers with 0 vs 20 water packs.',
    steps: [
      'Invoke calculateMatchesForRequest against the request',
      'Inspect suitability and capacity factor breakdown for provider holding 20 water packs',
      'Compare against provider holding 0 water packs',
    ],
    expected_result: 'Equipped provider achieves 1.0 suitability and 1.0 capacity, ranking at the top.',
    code_under_test: [
      {
        file: 'server/src/services/matching.ts',
        lines: '87-240',
        symbol: 'calculateMatchesForRequest (Suitability & Capacity Calculation)',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/matching.test.ts > Phase 4: Rule-Based Matching Engine Unit & Scoring Tests > should score undeclared availability neutrally (0.5) without penalizing candidate': {
    area: 'Matching',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'positive',
    use_case:
      'Prevents active volunteers from being unfairly disqualified from match recommendations when their availability flag is unconfigured.',
    preconditions: 'Volunteer with undefined availability status seeded.',
    steps: [
      'Invoke calculateMatchesForRequest for verified request',
      'Assert availability factor for candidate is 0.5',
      'Verify candidate overall score is computed properly without NaN or rejection',
    ],
    expected_result: 'Candidate receives neutral 0.5 availability factor and valid overall match score.',
    code_under_test: [
      {
        file: 'server/src/services/matching.ts',
        lines: '87-240',
        symbol: 'calculateMatchesForRequest (Availability Neutral Handling)',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/matching.test.ts > Phase 4: Matching API Endpoints & Zero Auto-Assignment > GET /api/requests/:id/matches: blocks unauthorized roles and returns ranked matches for admins/dispatchers': {
    area: 'Matching',
    type: 'integration',
    roles: 'admin, volunteer, affected_person',
    polarity: 'positive',
    use_case:
      'Permits administrators to query ranked candidates for an emergency ticket while strictly blocking unauthorized volunteers or citizens.',
    preconditions: 'Verified request and responder candidates exist in database.',
    steps: [
      'Send GET /api/requests/:id/matches as affected_person and verify 403 Forbidden',
      'Send GET /api/requests/:id/matches as volunteer and verify 403 Forbidden',
      'Send GET /api/requests/:id/matches as admin and verify 200 OK with sorted candidates array',
    ],
    expected_result: 'HTTP 403 for unauthorized roles; HTTP 200 with ranked candidate list and factor breakdowns for admin.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '1557-1585',
        symbol: 'GET /api/requests/:id/matches',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/matching.test.ts > Phase 4: Matching API Endpoints & Zero Auto-Assignment > POST /api/requests/:id/invite: dispatches an invitation notification without auto-claiming or changing ticket status': {
    area: 'Matching',
    type: 'integration',
    roles: 'admin, volunteer',
    polarity: 'positive',
    use_case:
      'Dispatches an in-app match invitation notification to a responder without unilaterally assigning them or changing the ticket out of verified state.',
    preconditions: 'Verified request and responder candidate seeded.',
    steps: [
      'Send POST /api/requests/:id/invite with candidateId as admin',
      'Assert response status 200 OK with invited candidate details',
      'Check request in database and confirm status remains verified (not claimed)',
      'Verify notification document created for candidate with type "match_invite"',
    ],
    expected_result: 'HTTP 200 OK; notification created for responder; zero auto-assignment occurs.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '1587-1640',
        symbol: 'POST /api/requests/:id/invite',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  // Analytics
  'server/tests/analytics.test.ts > Phase 4: Analytics Dashboard Proposal Metrics Service > Metric 1: Time-to-Match should accurately compute median and mean minutes between verification and assignment': {
    area: 'Analytics',
    type: 'integration',
    roles: 'automated / admin',
    polarity: 'positive',
    use_case:
      'Calculates the project core evaluation metric: median and mean minutes elapsed between ticket verification and responder assignment.',
    preconditions: 'Requests with known timestamps in StatusHistory for verified and in_progress seeded.',
    steps: [
      'Seed request 1 with 10-minute interval, request 2 with 20-minute interval, request 3 with 30-minute interval',
      'Invoke computeProposalMetrics for 7d range',
      'Assert timeToMatch.medianMinutes equals 20.0 and meanMinutes equals 20.0',
    ],
    expected_result: 'Accurate median and mean minutes calculated from verified-to-claimed timestamps.',
    code_under_test: [
      {
        file: 'server/src/services/analytics.ts',
        lines: '52-289',
        symbol: 'getAnalyticsSummary',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/analytics.test.ts > Phase 4: Analytics Dashboard Proposal Metrics Service > Metric 2: Double-Booking Rate should confirm 0% on clean state and detect concurrent conflicts when simulated': {
    area: 'Analytics',
    type: 'integration',
    roles: 'automated / admin',
    polarity: 'positive',
    use_case:
      'Evaluates Proposal Metric 2 by validating that zero conflicting concurrent assignments exist (0% double-booking target).',
    preconditions: 'Clean state requests with single active assignments seeded; simulated conflict injected.',
    steps: [
      'Compute metrics on clean database and assert doubleBookingRate is 0.0%',
      'Inject simulated duplicate active assignment on single ticket',
      'Recompute metrics and verify double-booking conflict is detected with non-zero percentage',
    ],
    expected_result: '0.0% double-booking rate on clean state; conflict properly detected upon simulation.',
    code_under_test: [
      {
        file: 'server/src/services/analytics.ts',
        lines: '52-289',
        symbol: 'getAnalyticsSummary',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/analytics.test.ts > Phase 4: Analytics Dashboard Proposal Metrics Service > Metric 3: Confirmation Rate should compute percentage of resolved requests that reached closed via requester confirmation': {
    area: 'Analytics',
    type: 'integration',
    roles: 'automated / admin',
    polarity: 'positive',
    use_case:
      'Measures the fraction of resolved disaster requests that were confirmed as successfully satisfied by the affected citizen.',
    preconditions: 'Requests in resolved status and closed status seeded.',
    steps: [
      'Seed 2 resolved tickets and 2 closed tickets confirmed by requester',
      'Invoke computeProposalMetrics',
      'Assert confirmationRate equals 50.0%',
    ],
    expected_result: 'Confirmation rate correctly computed as percentage of resolved tickets reaching closed.',
    code_under_test: [
      {
        file: 'server/src/services/analytics.ts',
        lines: '52-289',
        symbol: 'getAnalyticsSummary',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/analytics.test.ts > Phase 4: Analytics Dashboard Proposal Metrics Service > Metric 4: Propagation Latency telemetry should record samples and compute median and p95 metrics': {
    area: 'Analytics',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'positive',
    use_case:
      'Records WebSocket broadcast delivery latency samples and calculates real-time median and 95th-percentile propagation times.',
    preconditions: 'Latency telemetry buffer reset.',
    steps: [
      'Record series of latency duration samples (e.g. 10ms, 15ms, 20ms, 25ms, 100ms)',
      'Invoke getLatencySummary',
      'Assert median and p95 calculations match statistical expectations',
    ],
    expected_result: 'Accurate median and p95 latency telemetry returned.',
    code_under_test: [
      {
        file: 'server/src/socket/index.ts',
        lines: '30-50',
        symbol: 'recordTelemetrySample',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/analytics.test.ts > Phase 4: Analytics API Authorization & Security > GET /api/analytics should enforce strict role restrictions (admin only)': {
    area: 'Analytics',
    type: 'integration',
    roles: 'admin, volunteer, affected_person, resource_provider',
    polarity: 'positive',
    use_case:
      'Guarantees system analytics and operational metrics are protected behind admin-only role guards.',
    preconditions: 'Users across all roles registered with auth tokens.',
    steps: [
      'Send GET /api/analytics unauthenticated and verify 401 Unauthorized',
      'Send GET /api/analytics as affected_person and verify 403 Forbidden',
      'Send GET /api/analytics as volunteer and verify 403 Forbidden',
      'Send GET /api/analytics as admin and verify 200 OK with full analytics payload',
    ],
    expected_result: 'Non-admin callers rejected with 401/403; admin caller receives 200 OK with metrics.',
    code_under_test: [
      {
        file: 'server/src/routes/analytics.ts',
        lines: '15-40',
        symbol: 'GET /api/analytics (Admin Role Check)',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  // AI Classification
  'server/tests/classification.test.ts > Phase 4: AI & Heuristic Classification Service > should accurately classify medical emergencies with high/critical urgency using heuristic rules': {
    area: 'AI classification',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'positive',
    use_case:
      'Uses rule-based heuristic fallback to classify medical trauma and cardiac distress texts when AI network service is unavailable.',
    preconditions: 'Classification service initialized.',
    steps: [
      'Pass text "Elderly person having severe chest pain and difficulty breathing" to classifyEmergencyText',
      'Assert suggested category is "medical" and urgency is "high" or "critical"',
    ],
    expected_result: 'Identified as medical category with critical urgency rating.',
    code_under_test: [
      {
        file: 'server/src/services/classification.ts',
        lines: '160-190',
        symbol: 'classifyHeuristic',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/classification.test.ts > Phase 4: AI & Heuristic Classification Service > should accurately classify flood rescue emergencies with critical urgency': {
    area: 'AI classification',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'positive',
    use_case:
      'Detects rising floodwaters and trapped victims, categorizing them as rescue with critical urgency.',
    preconditions: 'Classification service loaded.',
    steps: [
      'Pass text "Family trapped on rooftop due to rising flood waters, need boat" to classifyEmergencyText',
      'Assert category is "rescue" and urgency is "critical"',
    ],
    expected_result: 'Identified as rescue category with critical urgency.',
    code_under_test: [
      {
        file: 'server/src/services/classification.ts',
        lines: '160-190',
        symbol: 'classifyHeuristic',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/classification.test.ts > Phase 4: AI & Heuristic Classification Service > should accurately classify shelter displacement requirements': {
    area: 'AI classification',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'positive',
    use_case:
      'Identifies displaced families lacking accommodation, categorizing them as shelter.',
    preconditions: 'Classification service loaded.',
    steps: [
      'Pass text "Our house collapsed in earthquake, 4 people sleeping outside in cold" to classifyEmergencyText',
      'Assert category is "shelter"',
    ],
    expected_result: 'Identified as shelter category.',
    code_under_test: [
      {
        file: 'server/src/services/classification.ts',
        lines: '160-190',
        symbol: 'classifyHeuristic',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/classification.test.ts > Phase 4: AI & Heuristic Classification Service > should accurately classify clean water and food supply requirements': {
    area: 'AI classification',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'positive',
    use_case:
      'Identifies basic sustenance shortages, categorizing them as supplies or food.',
    preconditions: 'Classification service loaded.',
    steps: [
      'Pass text "Need drinking water and dry rations for 20 stranded villagers" to classifyEmergencyText',
      'Assert category is "supplies"',
    ],
    expected_result: 'Identified as supplies category.',
    code_under_test: [
      {
        file: 'server/src/services/classification.ts',
        lines: '160-190',
        symbol: 'classifyHeuristic',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/classification.test.ts > Phase 4: AI & Heuristic Classification Service > POST /api/classification/suggest: should return 200 with suggestion for valid emergency text': {
    area: 'AI classification',
    type: 'integration',
    roles: 'public / unauthenticated',
    polarity: 'positive',
    use_case:
      'Provides real-time non-blocking category suggestions to citizens typing their emergency descriptions on the intake form.',
    preconditions: 'Classification endpoint mounted.',
    steps: [
      'Send POST /api/classification/suggest with text "Severe flooding in ground floor, family stranded"',
      'Assert status 200 OK',
      'Assert body contains suggestion object with category and urgency',
    ],
    expected_result: 'HTTP 200 OK with suggested category and urgency string.',
    code_under_test: [
      {
        file: 'server/src/routes/classification.ts',
        lines: '11-49',
        symbol: 'POST /api/classification/suggest',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/classification.test.ts > Phase 4: AI & Heuristic Classification Service > POST /api/classification/suggest: should return suggestion: null for empty or too short text': {
    area: 'AI classification',
    type: 'integration',
    roles: 'public / unauthenticated',
    polarity: 'positive',
    use_case:
      'Returns null suggestion without executing AI or heuristic models when input text is fewer than minimum required characters.',
    preconditions: 'Classification endpoint mounted.',
    steps: [
      'Send POST /api/classification/suggest with text "help"',
      'Assert status 200 OK',
      'Assert body contains { suggestion: null }',
    ],
    expected_result: 'HTTP 200 OK with suggestion: null.',
    code_under_test: [
      {
        file: 'server/src/routes/classification.ts',
        lines: '11-49',
        symbol: 'POST /api/classification/suggest',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/classification.test.ts > Phase 4: AI & Heuristic Classification Service > POST /api/classification/suggest: should gracefully disable when ENABLE_AI_CLASSIFICATION=false': {
    area: 'AI classification',
    type: 'integration',
    roles: 'public / unauthenticated',
    polarity: 'positive',
    use_case:
      'Allows operators to completely disable AI inference via environment variable without crashing the API or blocking requests.',
    preconditions: 'Environment variable ENABLE_AI_CLASSIFICATION toggled to false.',
    steps: [
      'Set ENABLE_AI_CLASSIFICATION=false',
      'Send POST /api/classification/suggest with emergency text',
      'Assert response status 200 OK with { suggestion: null, disabled: true }',
    ],
    expected_result: 'HTTP 200 OK with graceful disabled response payload.',
    code_under_test: [
      {
        file: 'server/src/routes/classification.ts',
        lines: '11-49',
        symbol: 'POST /api/classification/suggest',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  'server/tests/classification.test.ts > Phase 4: AI & Heuristic Classification Service > Decoupled guarantee: Request submission succeeds completely whether classification service is enabled or disabled': {
    area: 'AI classification',
    type: 'integration',
    roles: 'public / affected_person',
    polarity: 'positive',
    use_case:
      'Guarantees core emergency intake is fully decoupled and never fails even if the classification service crashes or is offline.',
    preconditions: 'Emergency submission route mounted.',
    steps: [
      'Disable classification service',
      'Submit emergency ticket via POST /api/requests',
      'Assert response status 201 Created and ticket is properly saved',
    ],
    expected_result: 'HTTP 201 Created; core disaster reporting succeeds unconditionally.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '104-179',
        symbol: 'POST /api/requests (Decoupled Resilient Submission)',
      },
    ],
    phase_introduced: 'Phase 4',
  },

  // Health
  'server/tests/health.test.ts > GET /api/health > should return status 200 with { status: "ok" }': {
    area: 'Seed data and health',
    type: 'unit',
    roles: 'public / unauthenticated',
    polarity: 'positive',
    use_case:
      'Enables automated uptime monitoring and load-balancer health probes to verify API process readiness.',
    preconditions: 'Express server running.',
    steps: [
      'Send GET /api/health',
      'Assert response status 200 OK',
      'Assert JSON body equals { status: "ok" }',
    ],
    expected_result: 'HTTP 200 OK with status: "ok".',
    code_under_test: [
      {
        file: 'server/src/app.ts',
        lines: '30-32',
        symbol: 'GET /api/health',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  // Models
  'server/tests/models.test.ts > User Model > should create a valid user with a recognized role': {
    area: 'Authentication and roles',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'positive',
    use_case:
      'Validates that User documents can be created across all recognized system roles (admin, volunteer, affected_person, etc.).',
    preconditions: 'Mongoose connection established.',
    steps: [
      'Instantiate User model with valid email, passwordHash, and role "volunteer"',
      'Save document to database',
      'Assert saved document has valid _id and matches role',
    ],
    expected_result: 'User document successfully persisted in database.',
    code_under_test: [
      {
        file: 'server/src/models/User.ts',
        lines: '67-115',
        symbol: 'userSchema',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/models.test.ts > User Model > should reject invalid user roles': {
    area: 'Authentication and roles',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'negative',
    use_case:
      'Enforces Mongoose enum validation preventing users from being created with arbitrary or invalid role strings.',
    preconditions: 'Mongoose User schema initialized.',
    steps: [
      'Attempt to create User with role "super_hero"',
      'Assert save operation throws Mongoose ValidationError on role field',
    ],
    expected_result: 'ValidationError thrown rejecting unrecognized role.',
    code_under_test: [
      {
        file: 'server/src/models/User.ts',
        lines: '67-115',
        symbol: 'userSchema (Role Enum Validator)',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/models.test.ts > User Model > should enforce unique email addresses': {
    area: 'Authentication and roles',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'negative',
    use_case:
      'Prevents duplicate account creation by enforcing unique database indexes on user email addresses.',
    preconditions: 'User indexes synchronized with MongoDB.',
    steps: [
      'Create and save user with email test@example.com',
      'Attempt to save second user with identical email test@example.com',
      'Assert MongoDB duplicate key error (code 11000) is thrown',
    ],
    expected_result: 'Duplicate key error thrown preventing duplicate emails.',
    code_under_test: [
      {
        file: 'server/src/models/User.ts',
        lines: '67-115',
        symbol: 'userSchema (Unique Email Index)',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/models.test.ts > Request Model > should auto-generate a formatted requestId and auto-fuzz public coordinates': {
    area: 'Privacy and location',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'positive',
    use_case:
      'Verifies the pre-save hook on the Request model automatically generates REQ-YYYY-NNNNNN IDs and fuzzed public coordinates.',
    preconditions: 'Request model loaded.',
    steps: [
      'Create Request with precise coordinates [75.85, 30.90]',
      'Save document without explicit requestId or publicCoordinates',
      'Assert requestId matches regex ^REQ-\\d{4}-\\d{6}$',
      'Assert publicCoordinates are offset between 200m and 400m from preciseCoordinates',
    ],
    expected_result: 'Auto-generated formatted ID and fuzzed public coordinates on document save.',
    code_under_test: [
      {
        file: 'server/src/models/Request.ts',
        lines: '247-277',
        symbol: 'requestSchema pre-save hook',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/models.test.ts > Request Model > should calculate fuzzed coordinates helper directly within 200m to 400m': {
    area: 'Privacy and location',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'positive',
    use_case:
      'Directly tests the coordinate obfuscation helper to verify the displacement distance is mathematically constrained between 200m and 400m.',
    preconditions: 'calculateFuzzedCoordinates utility loaded.',
    steps: [
      'Invoke calculateFuzzedCoordinates([75.85, 30.90])',
      'Calculate distance between original and fuzzed coordinates using Haversine formula',
      'Assert distance is >= 0.2km and <= 0.4km',
    ],
    expected_result: 'Displacement is strictly between 200 and 400 meters.',
    code_under_test: [
      {
        file: 'server/src/models/Request.ts',
        lines: '71-98',
        symbol: 'calculateFuzzedCoordinates',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/models.test.ts > Request Model > should allow anonymous bystander submissions with contact phone': {
    area: 'Request lifecycle',
    type: 'unit',
    roles: 'public / unauthenticated',
    polarity: 'positive',
    use_case:
      'Ensures bystanders can submit emergency requests without logging in, providing an emergency callback phone number.',
    preconditions: 'Request schema loaded.',
    steps: [
      'Create Request without requester ID, containing contactPhone "+919876543210"',
      'Save document to database',
      'Assert document is saved successfully without validation error',
    ],
    expected_result: 'Anonymous bystander request saved with contactPhone.',
    code_under_test: [
      {
        file: 'server/src/models/Request.ts',
        lines: '161-245',
        symbol: 'requestSchema (Anonymous Submissions)',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/models.test.ts > Request Model > should reject invalid category': {
    area: 'Request lifecycle',
    type: 'unit',
    roles: 'automated / internal',
    polarity: 'negative',
    use_case:
      'Protects database schema integrity by rejecting unrecognized emergency category strings in Request model validation.',
    preconditions: 'Request schema loaded.',
    steps: [
      'Instantiate Request with category "invalid_cat"',
      'Assert validation throws error on category enum constraint',
    ],
    expected_result: 'Mongoose ValidationError thrown for invalid category.',
    code_under_test: [
      {
        file: 'server/src/models/Request.ts',
        lines: '161-245',
        symbol: 'requestSchema (Category Validator)',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  'server/tests/models.test.ts > Seed Script > should successfully seed sample users across all roles and sample requests': {
    area: 'Seed data and health',
    type: 'integration',
    roles: 'automated / admin',
    polarity: 'positive',
    use_case:
      'Validates that the database seeding routine populates all user roles, categories, and initial crisis tickets without errors.',
    preconditions: 'Clean test database connected.',
    steps: [
      'Invoke seedDatabase function',
      'Query User collection and verify count >= 5 across all roles',
      'Query Request collection and verify seeded tickets exist in initial states',
    ],
    expected_result: 'All collections seeded with valid demo accounts and requests.',
    code_under_test: [
      {
        file: 'server/src/seed.ts',
        lines: '41-280',
        symbol: 'seedDatabase',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  // Seed tests
  'server/tests/seed.test.ts > Seed Script & End-to-End Phase 1 Integration Validation > should seed all collections with the rich expanded dataset': {
    area: 'Seed data and health',
    type: 'integration',
    roles: 'automated / admin',
    polarity: 'positive',
    use_case:
      'Verifies the expanded Phase 2-4 seeder populates organizations, inventory depots, categories, and incidents.',
    preconditions: 'Clean test database.',
    steps: [
      'Execute seedDatabase',
      'Assert Organization, Resource, ResourceInventory, and EmergencyCategory collections are populated',
    ],
    expected_result: 'All expanded database collections populated with rich prototype data.',
    code_under_test: [
      {
        file: 'server/src/seed.ts',
        lines: '41-280',
        symbol: 'seedDatabase (Expanded Seeding)',
      },
    ],
    phase_introduced: 'Phase 2',
  },

  'server/tests/seed.test.ts > Seed Script & End-to-End Phase 1 Integration Validation > manually executes the full Phase 1 demo scenario: submit -> verify -> claim -> resolve -> confirm': {
    area: 'Request lifecycle',
    type: 'integration',
    roles: 'affected_person, admin, volunteer',
    polarity: 'positive',
    use_case:
      'Executes the entire end-to-end REST lifecycle sequence across multiple actors from intake to final citizen confirmation.',
    preconditions: 'Seeded test database.',
    steps: [
      'Citizen submits emergency ticket via POST /api/requests',
      'Admin verifies ticket via PATCH /api/requests/:id/verify',
      'Volunteer claims ticket via PATCH /api/requests/:id/claim',
      'Volunteer resolves ticket via PATCH /api/requests/:id/resolve',
      'Citizen confirms satisfaction via PATCH /api/requests/:id/confirm',
      'Assert ticket reaches closed status',
    ],
    expected_result: 'Ticket smoothly transitions through all 5 lifecycle phases to closed.',
    code_under_test: [
      {
        file: 'server/src/routes/requests.ts',
        lines: '104-750',
        symbol: 'Request Lifecycle Handlers (submit, verify, claim, resolve, confirm)',
      },
    ],
    phase_introduced: 'Phase 1',
  },

  // Playwright E2E Specs
  'client/e2e/core-lifecycle-concurrency.spec.ts > ResQ Phase 5: Multi-Context Concurrent Core Crisis Lifecycle > Full core scenario with independent concurrent browser contexts, real-time sync, comms isolation, and resolution confirmation': {
    area: 'End-to-end scenarios',
    type: 'e2e',
    roles: 'affected_person, admin, volunteer, resource_provider',
    polarity: 'positive',
    use_case:
      'Simulates real-world crisis operations across 4 concurrent browser contexts verifying live status changes, isolated chat threads, and citizen closure.',
    preconditions: 'Backend API server and Vite client running; test database seeded.',
    steps: [
      'Context A (Citizen): Navigates to /submit, waits for AI suggestion, and submits emergency request',
      'Context B (Admin): Logs in, views dispatch console, and verifies request',
      'Context C (Volunteer): Finds verified ticket, verifies matching panel, and claims ticket',
      'Context A: Observes live transition to in_progress without refreshing page',
      'Context C & A: Exchange messages in request thread; Context D (Resource Provider) verifies thread isolation',
      'Context C: Marks ticket as resolved',
      'Context A: Sees live resolved state and clicks confirm resolution to reach closed',
    ],
    expected_result: 'Full concurrent lifecycle successfully completed with real-time updates and strict privacy isolation.',
    code_under_test: [
      {
        file: 'client/src/pages/SubmitRequestPage.tsx',
        lines: '1-542',
        symbol: 'SubmitRequestPage',
      },
      {
        file: 'client/src/pages/DashboardPage.tsx',
        lines: '1-199',
        symbol: 'DashboardPage',
      },
      {
        file: 'client/src/pages/TrackRequestPage.tsx',
        lines: '1-585',
        symbol: 'TrackRequestPage',
      },
    ],
    phase_introduced: 'Phase 5',
  },

  'client/e2e/focused-edge-cases.spec.ts > ResQ Phase 5: Focused Edge-Case Coverage & Defect Prevention > Phase 3B Permission Enforcement: Unauthorized roles never see forbidden actions': {
    area: 'End-to-end scenarios',
    type: 'e2e',
    roles: 'resource_provider, volunteer, admin',
    polarity: 'positive',
    use_case:
      'Verifies the UI dynamically hides unauthorized action buttons: providers cannot claim tickets and admins cannot verify their own reports.',
    preconditions: 'Seeded users with distinct roles logged into separate sessions.',
    steps: [
      'Log in as resource_provider and confirm "Claim this request" button is absent',
      'Log in as volunteer and confirm "Claim this request" button IS present',
      'Log in as admin, submit emergency request, and verify UI disables self-verification',
    ],
    expected_result: 'UI strictly complies with Phase 3B RBAC rules hiding forbidden action controls.',
    code_under_test: [
      {
        file: 'client/src/pages/DashboardPage.tsx',
        lines: '1-199',
        symbol: 'DashboardPage (Action Buttons & Guards)',
      },
    ],
    phase_introduced: 'Phase 5',
  },

  'client/e2e/focused-edge-cases.spec.ts > ResQ Phase 5: Focused Edge-Case Coverage & Defect Prevention > Matching & Direct Invitation: Multi-factor breakdown and real in-app notification dispatch': {
    area: 'End-to-end scenarios',
    type: 'e2e',
    roles: 'admin, volunteer',
    polarity: 'positive',
    use_case:
      'Tests dispatch matching panel breakdown (proximity, suitability, capacity, availability) and verifies invite dispatch to responder.',
    preconditions: 'Verified emergency ticket with candidate responder exists.',
    steps: [
      'Admin opens verified ticket and inspects matching factor breakdown list',
      'Admin clicks "Invite Responder" for top candidate',
      'Candidate logs into independent session and verifies real in-app notification is received',
    ],
    expected_result: 'Matching factor elements rendered accurately; invitation notification received by responder.',
    code_under_test: [
      {
        file: 'client/src/components/SuggestedMatchesPanel.tsx',
        lines: '1-249',
        symbol: 'SuggestedMatchesPanel',
      },
      {
        file: 'client/src/components/NotificationList.tsx',
        lines: '1-320',
        symbol: 'NotificationList',
      },
    ],
    phase_introduced: 'Phase 5',
  },

  'client/e2e/focused-edge-cases.spec.ts > ResQ Phase 5: Focused Edge-Case Coverage & Defect Prevention > AI Classification: Suggestion apply, dismiss, and uninterrupted submission during simulated outage': {
    area: 'End-to-end scenarios',
    type: 'e2e',
    roles: 'affected_person',
    polarity: 'positive',
    use_case:
      'Validates AI suggestion chip interaction (dismiss and apply) and proves emergency intake continues uninterrupted during AI service outages.',
    preconditions: 'Submit page open in browser.',
    steps: [
      'Type emergency description and observe AI suggestion chip appear',
      'Click dismiss (x) and verify chip disappears',
      'Retrigger suggestion and click apply, verifying category dropdown updates',
      'Simulate 503 outage on classification API and submit request successfully',
    ],
    expected_result: 'Suggestion chip applies and dismisses smoothly; emergency request successfully submits during outage.',
    code_under_test: [
      {
        file: 'client/src/pages/SubmitRequestPage.tsx',
        lines: '1-542',
        symbol: 'SubmitRequestPage (AI Suggestion Integration)',
      },
    ],
    phase_introduced: 'Phase 5',
  },

  'client/e2e/focused-edge-cases.spec.ts > ResQ Phase 5: Focused Edge-Case Coverage & Defect Prevention > Analytics Dashboard: Non-zero metrics readout and dynamic date-range filtering': {
    area: 'End-to-end scenarios',
    type: 'e2e',
    roles: 'admin',
    polarity: 'positive',
    use_case:
      'Validates admin analytics dashboard readout of Proposal Metrics (Time-to-Match, Double-Booking, Confirmation, Latency) and date range filtering.',
    preconditions: 'Admin logged in; test tickets exist with lifecycle history.',
    steps: [
      'Navigate to /analytics as admin',
      'Confirm non-zero metric values for Time-to-Match and Double-Booking Rate',
      'Toggle date range filter between "7 Days", "Last 24 Hours", and "All Time"',
      'Confirm ticket sample count dynamically updates',
    ],
    expected_result: 'Analytics metrics render accurately and dynamic date filtering updates live readouts.',
    code_under_test: [
      {
        file: 'client/src/pages/AnalyticsPage.tsx',
        lines: '1-540',
        symbol: 'AnalyticsPage',
      },
    ],
    phase_introduced: 'Phase 5',
  },

  'client/e2e/location-address-search.spec.ts > Additive Address Search on LocationPicker and Incident Management > Search address, pick from dropdown, submit request with privacy protection': {
    area: 'End-to-end scenarios',
    type: 'e2e',
    roles: 'affected_person',
    polarity: 'positive',
    use_case:
      'Verifies the text address search debounced dropdown on /submit moves the map pin and submits with proper privacy fuzzing.',
    preconditions: 'Submit request page loaded.',
    steps: [
      'Type address into search input on location step',
      'Wait for debounced dropdown and select matching address candidate',
      'Confirm map pin moves to selected coordinate',
      'Submit emergency request and query API to confirm coordinates are fuzzed for public',
    ],
    expected_result: 'Pin moves accurately to searched address; public coordinates are obfuscated on save.',
    code_under_test: [
      {
        file: 'client/src/components/LocationPicker.tsx',
        lines: '1-310',
        symbol: 'LocationPicker (Address Search Input)',
      },
      {
        file: 'client/src/pages/SubmitRequestPage.tsx',
        lines: '1-542',
        symbol: 'SubmitRequestPage',
      },
    ],
    phase_introduced: 'Phase 5 (Location Address Search)',
  },

  'client/e2e/location-address-search.spec.ts > Additive Address Search on LocationPicker and Incident Management > Incident creation address search recenters perimeter map': {
    area: 'End-to-end scenarios',
    type: 'e2e',
    roles: 'admin',
    polarity: 'positive',
    use_case:
      'Tests text address search within the Incident Creation dialog, ensuring candidate selection recenters the disaster perimeter map.',
    preconditions: 'Admin logged in on Incidents management page.',
    steps: [
      'Open Incident creation modal',
      'Type landmark into address search bar',
      'Select candidate from dropdown',
      'Verify incident perimeter map center shifts to target coordinates',
    ],
    expected_result: 'Perimeter map shifts to match selected address candidate.',
    code_under_test: [
      {
        file: 'client/src/pages/AdminPage.tsx',
        lines: '1-170',
        symbol: 'AdminPage',
      },
      {
        file: 'client/src/components/IncidentManagementPanel.tsx',
        lines: '1-991',
        symbol: 'IncidentManagementPanel (Address Search)',
      },
    ],
    phase_introduced: 'Phase 5 (Location Address Search)',
  },
};
