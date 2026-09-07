# resQ — Crisis Coordination Platform

resQ is an operations tool connecting affected people, volunteers, NGOs, resource providers, and administrators around a shared, real-time dispatch view of emergency requests.

## Architecture

- **Client (`/client`)**: React + Vite + TypeScript + Tailwind CSS configured with the "Field Ops Ledger" design system tokens.
- **Server (`/server`)**: Node.js + Express + TypeScript, with Vitest + Supertest testing, and environment variable configuration.

---

## Prerequisites

- **Node.js**: v18+ (tested with v24.x)
- **npm**: v9+ (tested with v11.x)

---

## Local Development Setup

### 1. Server Setup (`/server`)

1. Open a terminal and navigate to the `server` directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your local `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```
   *(Ensure `PORT=5000` is set. Leave `MONGODB_URI` and `JWT_SECRET` ready for when database integration is configured).*

4. Run unit and integration tests:
   ```bash
   npm test
   ```

5. Start the server in development mode (with hot reloading via `tsx`):
   ```bash
   npm run dev
   ```
   The backend service will run on `http://localhost:5000`. You can verify the health check endpoint:
   ```bash
   curl http://localhost:5000/api/health
   # Returns: {"status":"ok"}
   ```

---

### 2. Client Setup (`/client`)

1. Open a second terminal and navigate to the `client` directory:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The client will run on `http://localhost:5173`.
   
   *Note: Vite is configured with a proxy for `/api` requests to automatically forward to `http://localhost:5000`.*

4. Build for production:
   ```bash
   npm run build
   ```

---

## Design System

The application strictly follows the **Field Ops Ledger** design specification:
- **Design reference file**: [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)
- **Visual reference file**: Open [`design-reference.html`](design-reference.html) in your browser.
- **Tailwind Tokens**:
  - `bg-paper` (`#EEF0EE`), `bg-paper-raised` (`#FFFFFF`)
  - `text-ink` (`#14213D`), `text-slate` (`#5B6670`)
  - Status tokens: `amber` (`#D98E2B`), `teal` (`#1F7A6C`), `rust` (`#B23A2F`)
  - Typography: `font-sans` (**Public Sans**), `font-mono` (**IBM Plex Mono**)
