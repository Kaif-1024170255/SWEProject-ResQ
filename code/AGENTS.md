PROJECT: ResQ — a crisis coordination platform connecting affected people,
volunteers, NGOs, resource providers, and administrators around a shared,
real-time view of emergency requests. This is a college capstone prototype,
due as a working demo this week.

TECH STACK — DO NOT DEVIATE, AND DO NOT USE ANYTHING PAID:
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend: Node.js + Express + TypeScript
- Database: MongoDB (MongoDB Atlas free M0 tier)
- Auth: JWT + bcrypt, hand-rolled — no paid auth vendor (no Auth0, no Clerk, no Firebase Auth)
- Maps: react-leaflet + OpenStreetMap tiles — no Google Maps, no Mapbox (both require billing)
- Geocoding (only if needed): OSM Nominatim public API, respecting its 1 request/second
  rate limit and requiring a descriptive User-Agent header — not a paid geocoding service
- Real-time (only once core CRUD works): Socket.IO, self-hosted — no paid pub/sub service
- Testing: Vitest or Jest, Supertest
- Hosting/deployment (only when explicitly asked for): free tiers only, e.g. Vercel/Netlify
  for the frontend, Render free web service for the backend, MongoDB Atlas free cluster.
  Before using any specific paid-adjacent platform, tell me its current free-tier limits
  and ask me to confirm before proceeding.

DESIGN — READ BEFORE STYLING ANYTHING:
- Read DESIGN_SYSTEM.md and open design-reference.html in the project root before writing
  any UI code. Match its colors, type, spacing, and component patterns exactly.
- Do not default to a generic AI-generated look: no purple/indigo gradients, no identical
  rounded cards with soft shadows, no tracked-out uppercase eyebrow labels, no arrow (→)
  suffixes on buttons. If you're about to design a screen the design file doesn't cover,
  stop and ask me rather than improvising a new visual direction.

WHEN TO ASK ME FOR HELP — DO NOT GUESS OR WORK AROUND THESE:
- Creating any third-party account (MongoDB Atlas, Vercel, Render, GitHub, etc.) — ask me
  to create the account and hand you the credentials/connection string/API key.
- Any .env values, secrets, connection strings, or API keys — never invent placeholder
  values and silently continue; ask me for the real value or tell me exactly what to
  generate and paste in.
- Anything that would exceed a free tier's limits, or any service where you're not certain
  a free tier exists — stop and ask before adding it.
- Deployment: pushing to GitHub, connecting a repo to a hosting platform, or configuring
  DNS/custom domains — ask me to do the account-linking steps that need my login.
- Testing on a real device/browser for things you can't verify yourself (e.g., browser
  geolocation permission prompts, camera/photo upload on mobile) — ask me to test and
  report back what I see.
- Any product/content decision not covered by DESIGN_SYSTEM.md (e.g., final wording of a
  specific error message, the exact list of request categories) — propose an option and
  ask me to confirm rather than deciding silently.
- If you get stuck for more than one attempt on the same error, stop and explain what
  you tried and what's failing, instead of continuing to guess.

WORKFLOW:
- Work in small, demoable slices. After each prompt below, the app should still run.
- Write unit tests for backend logic as you go (Vitest/Jest + Supertest), not at the end.
- Use TypeScript strictly — no `any` unless you explain why in a comment.
- Commit-sized changes: don't restructure unrelated code while implementing a feature.

CURRENT TASK: Expanding the database schema with additional entities
(Organization, Resource, ResourceInventory, RequestResource,
RequestAssignment, Verification, Notification, Message, Evidence, Incident,
EmergencyCategory) ahead of Phase 2, plus a public home page. This happens
on top of a WORKING Phase 1 prototype — the #1 priority is not breaking it.

NON-DISRUPTION RULES:
- Every change must be additive. Do not remove or restructure an existing
  field on User or Request unless a prompt below explicitly says to, and
  even then, confirm the migration approach with me first.
- After every single prompt in this list, run the full existing test suite
  (all Phase 1 tests) before moving to the next prompt. If anything that
  passed before now fails, stop and fix it before continuing.
- Existing REST endpoints (auth, submit, verify, claim, resolve, confirm)
  must keep working with their current request/response shapes. New fields
  may be ADDED to responses; existing fields must not be removed or renamed
  without asking me first.
- Follow the MongoDB/Mongoose design note from the source spec: small value
  objects (like Location, StatusHistoryEntry) stay embedded in Request as
  they already are; independently managed concepts (Organization, Resource,
  Assignment, Incident, etc.) become their own collections.

RECONCILE, DON'T DUPLICATE:
- StatusHistory already exists on Request from Phase 1 and remains the
  general lifecycle audit trail (every transition still appends to it,
  unchanged). The new Verification entity is a more detailed record
  specific to the verify step (verifier, result, remarks) — it supplements
  StatusHistory, it does not replace or duplicate it. If it's unclear how a
  new entity should relate to something already built, propose the
  relationship to me in plain language and wait for confirmation before
  writing code against it.

STILL FREE ONLY:
- Evidence file storage: local disk storage for this prototype stage is
  fine. Do not wire up a paid or unconfirmed cloud storage provider — if
  Cloudflare R2 or Supabase Storage's free tier is wanted later, ask me
  first and confirm current free-tier terms before adding it.
- Notifications are in-app only (a Notification document + a read/unread
  flag). Do not add email or SMS delivery — that would pull in an external
  paid service — unless I explicitly ask for it later.

WHEN TO ASK ME FOR HELP (in addition to existing lists):
- Any ambiguity in how an entity relates to something already built (e.g.
  whether RequestAssignment replaces part of what "claim" already does, or
  sits alongside it) — propose your understanding and wait for confirmation.
- Whether Request.category should become a reference to the new
  EmergencyCategory collection or stay a plain string that's validated
  against it — this changes existing data shape, so confirm before choosing.
- The routing decision for the home page (does it take over "/", pushing the
  console to a new path like "/console"? or does it live at a separate path
  like "/home" or "/about"?) — this affects every existing bookmark/flow, so
  ask before deciding.
- Anything that would require re-seeding or migrating existing local data in
  a way that isn't purely additive.

DESIGN — HOME PAGE AND NEW UI STILL FOLLOW DESIGN_SYSTEM.md:
- The home page must look like an extension of the dispatch console, not a
  generic startup landing page. No hero gradients, no big rounded CTA pills,
  no "Trusted by" logo rows, no testimonial carousels.
- Reuse existing components as illustrations: show the actual 5-stage
  lifecycle strip component, the actual status chip component, etc., rather
  than inventing new marketing-style graphics.
- New list/detail UI (resource inventory, organization profile, incident
  grouping, notification list, evidence attachments) follows the existing
  dispatch-log row pattern (dense, bordered rows, monospace for IDs/counts/
  timestamps) — not cards with shadows, not a gallery grid.

---

PHASE 3 SCOPE: Real-time propagation only. The data
models this phase pushes events for — RequestResource, RequestAssignment,
ResourceInventory, Verification, Notification, Message — already exist from
the DB expansion work. Do NOT create new schemas for missions, contributions,
or messaging in this phase; if something here seems to need a new field or
model, stop and check whether it already exists before adding one.

Deployment and CI/CD remain OUT OF SCOPE (Phase 6, last). Do not set up
hosting, GitHub Actions, or a production database connection while working
through this list.

REAL-TIME STACK — STILL FREE ONLY:
- Socket.IO, self-hosted on the same Express server. No paid real-time/pub-sub
  vendor (no Pusher, Ably, or PubNub).
- The database remains the single source of truth. Every socket event is
  broadcast AFTER a successful database write, never before, and never as a
  substitute for one. If the socket layer goes down, REST endpoints and page
  refreshes must still reflect correct state.

DO NOT BREAK ANYTHING ALREADY BUILT:
- Every existing REST endpoint (auth, submit, verify, claim, resolve,
  confirm, resource assignment, messaging, notifications) must keep working
  exactly as before, including for clients with JavaScript or WebSockets
  disabled. Real-time is an enhancement layer, not a replacement.
- Run the full existing test suite before and after each prompt below. If
  anything that passed before now fails, fix it before moving on.

DESIGN — STILL FOLLOW DESIGN_SYSTEM.md:
- No new visual components should be needed in this phase — everything here
  is about making already-styled UI (status chips, the dispatch log, the
  resource-allocation display, the comms log, the notification list) update
  live instead of on refresh. If a genuinely new UI element turns out to be
  needed, propose it consistent with DESIGN_SYSTEM.md and ask before building.

WHEN TO ASK ME FOR HELP (in addition to existing lists):
- Testing real-time behavior across multiple simultaneous sessions — ask me
  to open two or three browser windows/tabs logged in as different roles and
  confirm what each one shows, since you can't observe multiple live browser
  sessions yourself.
- If reconnect/offline handling for Socket.IO starts pulling in significant
  extra complexity (queuing missed events, etc.), stop and ask whether a
  simpler "refresh to resync" fallback is acceptable for this prototype stage.
- Any ambiguity about which existing model an event should be broadcast from,
  or how to compute a per-recipient-safe payload (e.g. the same privacy
  redaction rules from Phase 1 apply to real-time payloads too — never
  broadcast precise coordinates or contact info to someone unauthorized to
  see them) — propose an approach and confirm before building it.

---

PHASE 2B SCOPE: Frontend-only work closing gaps left after the Phase 2
database expansion. The following backend endpoints are CONFIRMED ALREADY
BUILT AND WORKING — use them as-is, do not recreate or modify them:

- POST /api/resources, GET /api/resources
- GET /api/inventory, POST /api/inventory/:id/reserve, POST /api/inventory/:id/release
- POST /api/requests/:id/resources, GET /api/requests/:id/resources
- GET /api/categories, POST /api/categories, PATCH /api/categories/:id
- POST /api/incidents, POST /api/incidents/:id/requests, GET /api/incidents/:id/requests
- PATCH /api/requests/:id/verify (accepts result, remarks, method, priorityAssessment)
- POST /api/organizations, GET /api/organizations

If a screen below seems to need a field or endpoint that isn't in this list,
stop and confirm with me whether it actually exists under a different name
before adding anything new to the backend.

DESIGN — STILL FOLLOW DESIGN_SYSTEM.md:
- Every new screen in this list follows the existing patterns already in use
  elsewhere in the app: dense bordered rows for lists (not cards with
  shadows), the existing status-chip style for any state indicator, plain
  active-voice button labels, monospace for IDs/quantities/timestamps.
- Don't introduce a new visual language for these screens just because
  they're new — a depot dashboard, an incident list, and an organization
  directory should all still look like they belong to the same dispatch
  console as everything else.

REAL-TIME IS OPTIONAL HERE:
- These six features do not have Socket.IO events wired yet, and this list
  does not require adding them — plain REST fetch-on-load/fetch-on-action is
  fine for this pass. If a screen would clearly benefit from a live update
  (e.g. inventory levels while a dispatcher is actively allocating), you may
  propose adding a socket event consistent with the Phase 3 pattern, but ask
  before doing so rather than expanding scope unilaterally.

WHEN TO ASK ME FOR HELP (in addition to existing lists):
- Any UI/UX decision not covered by DESIGN_SYSTEM.md (e.g. how a bounding
  radius is drawn on the map for an incident, what fields belong on an
  organization profile beyond what the backend already stores) — propose an
  option and ask rather than deciding silently.
- If a backend endpoint's actual response shape doesn't match what's
  described in this list closely enough to build against confidently, stop
  and tell me what you found rather than guessing the missing pieces.

---

PHASE 3B SCOPE: Fixing role/permission gaps identified in a security and
logic audit of existing Phase 1–3 functionality. This is remediation, not
new features (Prompt 5's cancellation flow is the one exception).

DEFINITION OF DONE — same standard as Phase 4:
Every permission change must ship with a test proving BOTH directions: the
role(s) now correctly blocked receive a rejection, AND the role(s) still
allowed continue to work exactly as before. A prompt that only adds a
restriction without a test proving legitimate use still works is incomplete.
Any accompanying UI change (a button that should now be hidden, a new
action that should now appear) must be personally verified in a running
browser session, not just inferred from the backend change.

DO NOT SILENTLY REDESIGN ANYTHING BIGGER THAN THE STATED FIX:
Four items in the audit (direct dispatch/assignment, org-level claim
ownership, NGO verification authority, and the citizen landing page) are
genuine product/design decisions that change something documented in
earlier phases, not simple bug fixes. These are handled in a dedicated
prompt (Prompt 7) that requires my confirmation before any code is written
for them. Do not fold a decision like this into an earlier "fix" prompt
just because it's related.

REGRESSION DISCIPLINE:
Run the full existing test suite after every prompt in this list. Since
this phase changes who is allowed to do what, a regression here often means
a role that SHOULD still work got blocked by an overly broad fix — check
for false positives (over-blocking), not just false negatives (under-
blocking).

---

PHASE 4 SCOPE: Rule-based matching engine, admin analytics dashboard, and an
optional AI classification microservice.

DEFINITION OF DONE — THIS OVERRIDES ANY IMPLICIT ASSUMPTION:
A prompt in this phase is only complete when BOTH of these are true:
  (a) automated tests pass, AND
  (b) you have personally navigated to the new screen in a running browser
      session and confirmed it renders real data and its actions work.
Passing tests alone is NOT sufficient — this is exactly the gap that caused
missing frontend work after the Phase 2 database expansion, and it must not
happen again. If a prompt describes an API endpoint, assume it also requires
a visible, clickable way to use that endpoint from the UI unless the prompt
explicitly says otherwise. If you reach the end of a prompt and realize you
only built the backend half, do not move to the next prompt — finish the
frontend half first.

DO NOT DUPLICATE EXISTING WORK:
- Matching draws on data that already exists: User, Resource,
  ResourceInventory, RequestResource, RequestAssignment, and Request/
  Location from Phases 1–2. Do not create new models to represent
  candidates, scores, or availability unless something genuinely isn't
  already captured — check first.
- Analytics reads from existing StatusHistory, Verification, and
  RequestAssignment records. Do not build a separate parallel logging system.

STILL FREE ONLY:
- If an AI classification microservice is built, it must use a free-tier or
  self-hosted approach. Before writing any code for it, tell me the specific
  provider/model you intend to use and its current free-tier limits, and
  wait for my confirmation — do not assume a paid API is acceptable just
  because a free trial exists, and do not guess at limits that may have
  changed since your training data.

DESIGN — STILL FOLLOW DESIGN_SYSTEM.md:
- The analytics dashboard is a dispatch-console readout, not a generic BI
  tool: dense tables and simple line/bar charts using the existing Ink/
  Paper/Slate/Amber/Teal/Rust tokens, monospace numbers, no colorful pie
  charts, no gradient "KPI card" tiles.
- Matching suggestions appear as a ranked list in the existing dense-row
  style, with the score and its contributing factors shown plainly (e.g.
  "Score: 0.82 — 1.2km away, resource match, available") — not a
  percentage badge with no explanation.
- The AI classification suggestion (if built) is a plain, dismissible hint
  next to the category field, not a modal or an animated "AI thinking"
  indicator.

WHEN TO ASK ME FOR HELP (in addition to existing lists):
- The AI classification provider/model choice (above) — always confirm
  before writing code against it.
- How rigorously to measure propagation latency for the analytics dashboard
  — this is the hardest of the four proposal metrics to measure accurately
  from the server side alone; propose an approach (see Prompt 2) and confirm
  before building it.
- Any case where matching, scoring, or analytics logic would require data
  that isn't currently being recorded — tell me what's missing rather than
  fabricating a placeholder value.

---

PHASE 5 SCOPE: Playwright end-to-end tests and real pilot validation. No new
features, no schema changes, no new endpoints. If a gap is discovered during
this phase, log it and ask me — do not silently patch application logic
while trying to make a test pass.

DEFINITION OF DONE — for Prompts 1 and 2 only:
An e2e test is not complete just because it passes once. Prove the test
actually detects failure: temporarily break the behavior it's supposed to
cover, confirm the test fails, then revert the break and confirm it passes
again. A test that would pass even with the feature broken is worse than no
test — it creates false confidence.

HONESTY REQUIREMENT — for Prompts 3 and 4:
Real pilot numbers get reported exactly as measured, even if they miss a
target from the original proposal (e.g. if median Time-to-Match comes out
to 18 minutes against a 15-minute target). Do not round favorably, exclude
inconvenient sessions as "outliers" without a stated reason, or present a
partial pilot as if it were complete. A missed target with an honest
explanation is a normal, defensible outcome in an evaluation report; a
fabricated or cherry-picked number is not.

WHEN TO ASK ME FOR HELP (in addition to existing lists):
- Recruiting and scheduling actual pilot participants — this is a real-world
  coordination task, not something you can do yourself. Tell me what you
  need (how many people, what roles, roughly how long a session takes) and
  let me arrange it.
- Running the pilot itself, if it requires multiple simultaneous real
  devices/browsers/people — you can prepare the script and the measurement
  tooling, but you can't be five concurrent humans.
- Any case where a real pilot result is ambiguous or surprising (e.g. a
  metric that's wildly different from what the analytics dashboard showed
  with seed data) — tell me what you found rather than adjusting the number
  or the measurement method to make it look more expected.
- If Playwright testing surfaces an actual bug (not a test-writing mistake),
  stop and tell me before fixing it — Phase 5 is for finding and reporting
  gaps, not silently absorbing new fix-work into a testing phase without my
  awareness of what was broken.

---