# ResQ Pilot Validation: Finalized Participant Operational Script

**Crisis Simulation Scenario**: Localized Monsoon Flash Flooding & Infrastructure Outages in Ludhiana / Sector 4.  
**Platform Access**: Direct Web Browser (Chrome, Safari, Edge, Firefox). No software installation or sign-up required for citizens.

---

## Participant Role Overview

| Role | Target Participants | Primary Responsibilities | Access Method |
| :--- | :---: | :--- | :--- |
| **Affected Person (Citizen)** | 4 | Submits distress requests, tests AI category suggestions, monitors live status without reload, authenticates comms via phone, confirms resolution. | `http://<host-ip>:5173/submit` (Public, no login) |
| **Field Volunteer** | 3 | Monitors verified dispatch rail, reviews multi-factor match recommendations, claims requests, sends on-scene comms, marks tickets resolved. | `http://<host-ip>:5173/login` (`rahul.volunteer@example.org`) |
| **NGO Coordinator** | 1 | Manages emergency depot inventory, verifies relief stockpiles, coordinates bulk allocations to verified requests. | `http://<host-ip>:5173/login` (`dispatch@punjabrelief.org`) |
| **Central Dispatch Admin** | 1 | Triages unverified reports, conducts phone/field verification, dispatches invitations, observes real-time latency & metrics. | `http://<host-ip>:5173/login` (`admin@resq.org`) |

---

## Role 1: Affected Person / Citizen Script (4 Participants)

> **Context**: You are a resident stranded or affected by flash flooding. You need urgent assistance or supplies.

### Step 1: Open the Emergency Portal
1. In your browser (phone or laptop), navigate to:
   ```
   http://<host-ip>:5173/submit
   ```
   *(Or click **"Report emergency"** on the home page).*
2. You do **not** need to create an account or password.

### Step 2: Fill Out Your Request
1. In the **"Describe the emergency situation"** box, type 1–2 plain sentences describing your simulated need. Examples:
   - *“Ground floor flooded with 3 feet of water near Civil Lines. Elderly diabetic resident needs insulin and dry rations.”*
   - *“Vehicle trapped in fast-moving water near canal breach. 3 passengers on car roof waving for help.”*
   - *“Community shelter has 15 families cut off without clean drinking water or chlorine tablets.”*
2. **AI Classification Suggestion**:
   - As you type, notice a small suggestion box appearing below the text:  
     `Suggested: Medical (88%) — tap to apply`
   - Tap the suggestion to apply it, or manually choose a category from the dropdown if you prefer.
3. Enter your **Contact Phone Number** (e.g. `98765 12345` or your actual mobile number). *Remember this number, as you will use it to unlock private chat later.*
4. Click the dark button: **"Submit emergency request"**.

### Step 3: Track Live Status (Do Not Refresh)
1. A green confirmation banner will appear with your unique Tracking ID (e.g. `REQ-2026-XXXXXX`).
2. Click **"Track this request"** to enter the live tracking view.
3. **Important**: Leave this browser tab open. **Do NOT refresh the page.**
4. Observe the top status indicator updating automatically in real time as responders work:
   - `UNVERIFIED` $\rightarrow$ `VERIFIED` $\rightarrow$ `IN PROGRESS`

### Step 4: Communicate with Your Responder
1. Once your request is claimed (`IN PROGRESS`), scroll down to the **Communications Log**.
2. In the phone verification prompt, type the **same phone number** you used during submission and click **"Authenticate"**.
3. When the responder sends a message, watch it appear live on your screen. Type a quick reply (e.g., *“We are on the second floor balcony”*) and click **"Send"**.

### Step 5: Confirm Resolution
1. When the responder marks your emergency resolved, your status chip turns teal: `RESOLVED`.
2. A green button labeled **"Confirm resolution"** will appear. Click it.
3. Verify that your status turns to `CLOSED`.

---

## Role 2: Field Volunteer Script (3 Participants)

> **Context**: You are a mobile responder equipped with a relief vehicle operating in the disaster zone.

### Step 1: Log In to the Operations Console
1. Navigate to:
   ```
   http://<host-ip>:5173/login
   ```
2. Log in using your assigned volunteer credentials:
   - **Email**: `rahul.volunteer@example.org`
   - **Password**: `ResQSecure2026!`
3. You will land directly on the **Operations Console** (`/dashboard`).

### Step 2: Locate Verified Emergency Requests
1. On the left rail, click the filter button labeled **`verified`** (or browse the live map pins).
2. Click on an incoming verified emergency ticket.
3. The details drawer opens on the right side of the screen.

### Step 3: Review Match Scores & Claim Request
1. In the ticket details drawer, inspect the **Automated Candidate Suggestions** panel.
2. Note your calculated match score and the 4 contributing factors (**Proximity**, **Suitability**, **Capacity**, **Availability**).
3. Click the black button: **"Claim this request"**.
4. Notice that the ticket status immediately transitions to `IN PROGRESS` and displays your name as the assigned responder.

### Step 4: Coordinate via In-App Comms
1. Inside the ticket details drawer, click **"Open Comms Log & Evidence details"**.
2. Type an operational status update:  
   *“En route with requested first-aid kit and drinking water. ETA 7 minutes.”*
3. Click **"Transmit message"**.
4. Confirm that the citizen's reply appears in your chat thread without page reloads.

### Step 5: Mark the Request Resolved
1. Once aid has been delivered, locate the action buttons on the ticket drawer.
2. Click **"Mark resolved"**.
3. Verify the status updates to `RESOLVED`.

---

## Role 3: NGO Logistics Coordinator Script (1 Participant)

> **Context**: You manage emergency stockpiles and warehouse fulfillment for Punjab Relief Network.

### Step 1: Log In
1. Navigate to `http://<host-ip>:5173/login`.
2. Log in with:
   - **Email**: `dispatch@punjabrelief.org`
   - **Password**: `ResQSecure2026!`

### Step 2: Check & Register Warehouse Inventory
1. In the top navigation bar, click the **"Depot & Inventory"** tab.
2. Inspect current stock levels across resources (e.g. potable water, family emergency rations, blankets).
3. Click **"+ Register Resource Stock"** to register a new intake batch (e.g. 50 Heavy-Duty Tarpaulins).

### Step 3: Fulfill Material Resource Requests
1. Return to the **"Dispatch Console (Map & Rail)"**.
2. Select a verified ticket requiring material supplies.
3. Under **Supply Allocation & Fulfillment**, allocate items from your depot stock to meet the request demand.
4. Verify that inventory reserved counts update and status transitions toward `fully_allocated`.

---

## Role 4: Central Dispatch Admin Script (1 Participant)

> **Context**: You coordinate city-wide triage, conduct verification assessments, and monitor system health.

### Step 1: Log In
1. Navigate to `http://<host-ip>:5173/login`.
2. Log in with:
   - **Email**: `admin@resq.org`
   - **Password**: `ResQSecure2026!`
3. You will land on the **Admin Operations Console** (`/admin`).

### Step 2: Review & Verify Incoming Reports
1. Monitor the left rail for new reports in `UNVERIFIED` status (amber chip).
2. Click the **"Verify"** button on an incoming ticket.
3. In the **Verification Assessment Record** modal:
   - Select Method: **Phone Call Verification** or **Field Agent Assessment**.
   - Select Priority: **High** or **Critical**.
   - Remarks: *“Contacted caller by phone; verified 3 occupants trapped on roof.”*
   - Click **"Confirm Verification & Queue"**.

### Step 3: Invite Candidates via Recommendation Engine
1. Select the verified ticket and scroll to **Automated Candidate Suggestions**.
2. Inspect ranked responders. Click **"Invite Responder"** next to the top-ranked candidate.
3. Confirm an invitation notification is dispatched to that responder.

### Step 4: Live Analytics Telemetry Readout
1. In the top navigation bar, click **"Analytics"** (`/analytics`).
2. Keep this tab open on a secondary monitor or projector throughout the pilot.
3. Watch the 4 core metrics update live as transactions take place:
   - **Time-to-Match (TTM)**
   - **Double-Booking Prevention Rate**
   - **Citizen Confirmation Rate**
   - **Socket.IO Propagation Latency (Median & P95)**
