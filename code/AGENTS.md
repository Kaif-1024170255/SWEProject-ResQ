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