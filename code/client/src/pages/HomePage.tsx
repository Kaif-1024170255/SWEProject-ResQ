import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LifecycleStrip, { LifecycleStageKey, LIFECYCLE_STAGES } from '../components/LifecycleStrip';

const FAILURE_MODES = [
  {
    code: 'FM-01',
    name: 'Duplicated Effort',
    problem:
      'Multiple independent volunteer groups and NGOs converge on the same high-visibility location with identical supplies, while quieter pockets only three streets away receive zero assistance.',
    solution:
      'ResQ provides a unified dispatch log with real-time claims. Once a request is claimed by an authenticated responder, other units see it in-progress immediately.',
  },
  {
    code: 'FM-02',
    name: 'Fragmented Visibility',
    problem:
      'Information gets trapped in closed WhatsApp groups, personal spreadsheets, and social feeds with no common operational picture across civil defense, NGOs, and spontaneous volunteers.',
    solution:
      'A single synchronized live ledger and map console displaying unverified, verified, and in-progress requests across municipal sectors.',
  },
  {
    code: 'FM-03',
    name: 'Unmatched Partial Resources',
    problem:
      'A community shelter needing 100 dry rations and 10 water purification filters goes unserved because no single provider can fulfill the entire request in isolation.',
    solution:
      'Item-level resource requirements that allow multiple providers to allocate partial quantities against a single emergency until fully fulfilled.',
  },
  {
    code: 'FM-04',
    name: 'Absence of an Accountability Loop',
    problem:
      'Calls for help are forwarded without confirmation. No one knows if someone arrived, if the rescue succeeded, or whether the victim is safe.',
    solution:
      'Enforced 5-stage lifecycle: requests cannot close until marked resolved by the responder and formally confirmed by the citizen who needed help.',
  },
  {
    code: 'FM-05',
    name: 'Vulnerability Exposure',
    problem:
      'Broadcasting personal phone numbers and exact GPS coordinates on public social feeds exposes vulnerable families to extortion, harassment, and looters during disasters.',
    solution:
      'Dual-layer location privacy: public coordinates are fuzzed by ~500m on open maps. Exact house numbers and direct phone lines are revealed only to the verified responder who claims the task.',
  },
];

const STAGE_DETAILS: Record<
  LifecycleStageKey,
  {
    summary: string;
    whoActs: string;
    privacy: string;
    keyOutput: string;
  }
> = {
  unverified: {
    summary:
      'Public distress report registered by a citizen or bystander. Awaiting formal dispatch review.',
    whoActs: 'Affected citizen, community coordinator, or bystander reporting via phone or web form.',
    privacy: 'Exact coordinates and contact phone are fully hidden. Map shows a fuzzed approximate marker.',
    keyOutput: 'Unique tracking code (REQ-YYYY-NNNNNN) issued immediately for tracking.',
  },
  verified: {
    summary:
      'Dispatcher or field liaison has contacted the site or cross-checked the report to confirm genuine urgency.',
    whoActs: 'Central dispatch administrator or authorized district coordinator.',
    privacy: 'Sensitive caller details remain restricted. Request is now visible on the active dispatch board.',
    keyOutput: 'Inspection audit record with remarks and priority level created in the verification ledger.',
  },
  in_progress: {
    summary:
      'An authenticated responder has claimed responsibility and is actively preparing or en route with resources.',
    whoActs: 'Field volunteer or NGO response team with matching transport and capacity.',
    privacy: 'Exact GPS coordinates and caller phone number are unlocked exclusively for the assigned claimant.',
    keyOutput: 'RequestAssignment record created; time-to-match metric calculated; two-way comms channel opened.',
  },
  resolved: {
    summary:
      'Responder has completed on-scene assistance, evacuated victims, or handed over requested emergency supplies.',
    whoActs: 'The assigned claimant upon completing the field task.',
    privacy: 'Comms log remains open for closing coordination and handover instructions.',
    keyOutput: 'Detailed resolution notes and timestamp appended to the permanent audit trail.',
  },
  closed: {
    summary:
      'The affected citizen confirms safe delivery and satisfactory resolution, completing the loop.',
    whoActs: 'The original requester (verified via SMS/phone challenge or account login) or senior admin.',
    privacy: 'Request archived from active responder map; permanent immutable log preserved for disaster debriefing.',
    keyOutput: 'Lifecycle audit completed with full transition timestamps and responder attribution.',
  },
  cancelled: {
    summary:
      'The affected citizen or central dispatcher withdrew the request before completion (e.g. self-evacuated or resolved independently).',
    whoActs: 'Original requester (authenticated or phone-verified) or administrator.',
    privacy: 'Request pin immediately removed from active dispatch map and rail; reserved inventory released back to depot.',
    keyOutput: 'Status history recorded with withdrawal rationale; standing missions and assignments stood down.',
  },
};

const SYSTEM_ROLES = [
  {
    role: 'Affected Person',
    tag: 'CITIZEN',
    description:
      'Submits distress requests with or without an account. Obtains a permanent tracking code, receives real-time status notifications, messages the assigned responder directly once claimed, and confirms final resolution.',
    permissions: 'Submit emergency, track status, view assigned responder name, send thread messages, confirm closure.',
  },
  {
    role: 'Volunteer',
    tag: 'FIELD RESPONDER',
    description:
      'Dispatched on the ground to deliver supplies, clear routes, or conduct local evacuations. Searches the map and rail by sector, claims requests matching capacity, accesses precise victim locations, and logs on-scene resolution.',
    permissions: 'Browse verified requests, claim tasks, view unmasked GPS & phone, post in comms log, mark resolved.',
  },
  {
    role: 'NGO (Non-Governmental Org)',
    tag: 'OPERATIONAL UNIT',
    description:
      'Coordinates organized field units and specialized operations. Registers organizational details, claims complex multipoint emergencies, deploys team members, and tracks relief distribution.',
    permissions: 'Claim multi-unit emergencies, register organizational inventory, assign team members, coordinate logistics.',
  },
  {
    role: 'Resource Provider',
    tag: 'SUPPLY LOGISTICS',
    description:
      'Warehouses and manages emergency equipment, medical stock, water purification assets, and rescue boats. Registers catalog items, monitors inventory levels, and allocates stock against request requirements.',
    permissions: 'Register resources, manage depot inventory, reserve and release quantities, track supply allocation.',
  },
  {
    role: 'Central Dispatch Admin',
    tag: 'SYSTEM CONTROLLER',
    description:
      'Oversees the entire disaster theater. Verifies incoming reports with inspection remarks, adjusts category priority levels, groups related requests under major incident clusters, and balances regional response capacity.',
    permissions: 'Verify requests, manage emergency categories, create and group incidents, review audit logs.',
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [selectedStage, setSelectedStage] = useState<LifecycleStageKey>('verified');

  const consolePath = user?.role === 'admin' ? '/admin' : '/dashboard';

  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      {/* Top Ledger Header */}
      <header className="bg-paper-raised border-b border-slate-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="font-bold text-xl text-ink tracking-tight">
              ResQ
            </Link>
            <span className="font-mono text-[11px] text-teal border border-teal/40 bg-teal-bg px-2 py-0.5 rounded-[3px]">
              CRISIS COORDINATION PLATFORM
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            <Link
              to="/track"
              className="font-mono text-slate hover:text-ink px-2.5 py-1.5 border border-slate-line rounded-[3px] hover:bg-paper"
            >
              Track request
            </Link>
            <Link
              to="/submit"
              className="font-sans font-semibold text-white bg-rust hover:bg-rust/90 px-3 py-1.5 rounded-[3px]"
            >
              Report an emergency
            </Link>

            {user ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-line">
                <span className="hidden sm:inline font-mono text-xs text-slate">
                  {user.name} ({user.role})
                </span>
                <button
                  onClick={() => navigate(consolePath)}
                  className="font-sans font-semibold text-white bg-ink hover:bg-ink-soft px-3 py-1.5 rounded-[3px] cursor-pointer"
                >
                  Open console
                </button>
                <button
                  onClick={logout}
                  className="font-mono text-slate hover:text-ink px-2 py-1 cursor-pointer"
                  title="Sign out"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="font-sans font-semibold text-ink bg-paper border border-slate-line hover:bg-paper-raised px-3 py-1.5 rounded-[3px]"
              >
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Active Session Notice for Logged-in Responders */}
      {user && (
        <div className="bg-teal-bg border-b border-teal/30 px-4 py-2.5">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="font-mono text-teal">
              ACTIVE SESSION: Logged in as <strong className="font-semibold">{user.name}</strong> [{user.role}]. Dispatch operations ready.
            </div>
            <button
              onClick={() => navigate(consolePath)}
              className="font-sans font-semibold text-teal underline hover:text-teal/80 cursor-pointer"
            >
              Go to dispatch console
            </button>
          </div>
        </div>
      )}

      {/* Main Content Ledger */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-12">
        {/* Section 1: Overview and Purpose */}
        <section className="bg-paper-raised border border-slate-line p-6 sm:p-8 space-y-4">
          <div className="font-mono text-xs text-slate uppercase tracking-wider">
            Operational Overview
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink leading-tight">
            A shared, real-time emergency dispatch ledger connecting affected citizens, field volunteers, NGOs, and resource providers.
          </h1>
          <p className="text-slate text-sm sm:text-base leading-relaxed max-w-4xl">
            During disasters, coordination failure kills more effectively than supply shortages. ResQ replaces fragmented group chats, unverified social media pleas, and isolated spreadsheets with an accountable, synchronized ledger. Every request is verified, every responder claim is recorded, and no emergency closes without confirmation from the person who needed help.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <Link
              to="/submit"
              className="bg-rust text-white font-sans text-xs font-semibold px-4 py-2.5 rounded-[3px] hover:bg-rust/90"
            >
              Report an emergency
            </Link>
            <Link
              to="/track"
              className="bg-paper border border-slate-line text-ink font-sans text-xs font-semibold px-4 py-2.5 rounded-[3px] hover:bg-paper-raised"
            >
              Track request by ID
            </Link>
            {!user && (
              <Link
                to="/login"
                className="bg-ink text-white font-sans text-xs font-semibold px-4 py-2.5 rounded-[3px] hover:bg-ink-soft"
              >
                Log in to console
              </Link>
            )}
          </div>
        </section>

        {/* Section 2: The Five Failure Modes of Ad-Hoc Crisis Coordination */}
        <section className="space-y-4">
          <div className="border-b border-slate-line pb-2">
            <div className="font-mono text-xs text-slate uppercase tracking-wider">
              System Architecture & Core Motivation
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-ink">
              The Five Failure Modes ResQ Solves
            </h2>
          </div>

          <div className="border border-slate-line divide-y divide-slate-line bg-paper-raised">
            {FAILURE_MODES.map((fm) => (
              <div key={fm.code} className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-3">
                  <span className="font-mono text-[11px] text-rust font-semibold">
                    {fm.code}
                  </span>
                  <h3 className="text-sm sm:text-base font-bold text-ink mt-0.5">
                    {fm.name}
                  </h3>
                </div>
                <div className="md:col-span-5 text-xs sm:text-sm text-slate leading-relaxed">
                  <div className="font-mono text-[11px] uppercase text-slate mb-1">
                    The Failure Under Pressure
                  </div>
                  {fm.problem}
                </div>
                <div className="md:col-span-4 text-xs sm:text-sm text-ink bg-paper p-3 rounded-[3px] border border-slate-line leading-relaxed">
                  <div className="font-mono text-[11px] uppercase text-teal font-semibold mb-1">
                    How ResQ Solves It
                  </div>
                  {fm.solution}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: 5-Stage Operational Lifecycle */}
        <section className="space-y-4">
          <div className="border-b border-slate-line pb-2">
            <div className="font-mono text-xs text-slate uppercase tracking-wider">
              Enforced State Machine
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-ink">
              How It Works: The 5-Stage Lifecycle Strip
            </h2>
            <p className="text-xs sm:text-sm text-slate mt-1">
              Select any stage below to examine its operational rules, participant permissions, and privacy guarantees.
            </p>
          </div>

          {/* Real Reusable Lifecycle Strip Component */}
          <div>
            <LifecycleStrip
              currentStatus={selectedStage}
              interactive={true}
              onSelectStage={(stage) => setSelectedStage(stage)}
            />
          </div>

          {/* Interactive Stage Inspector Card */}
          <div className="bg-paper-raised border border-slate-line p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-line pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-teal font-bold px-2 py-0.5 bg-teal-bg rounded-[3px] border border-teal/30 uppercase">
                  STAGE {LIFECYCLE_STAGES.find((s) => s.key === selectedStage)?.num}
                </span>
                <span className="font-bold text-base text-ink">
                  {LIFECYCLE_STAGES.find((s) => s.key === selectedStage)?.label}
                </span>
              </div>
              <span className="font-mono text-xs text-slate">
                Click other stages above to view operational transitions
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
              <div className="space-y-1">
                <div className="font-mono text-[11px] uppercase text-slate font-semibold">
                  Stage Purpose & Description
                </div>
                <p className="text-ink leading-relaxed">
                  {STAGE_DETAILS[selectedStage].summary}
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-mono text-[11px] uppercase text-slate font-semibold">
                  Authorized Actors
                </div>
                <p className="text-slate leading-relaxed">
                  {STAGE_DETAILS[selectedStage].whoActs}
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-mono text-[11px] uppercase text-slate font-semibold">
                  Privacy & Data Exposure Guard
                </div>
                <p className="text-slate leading-relaxed">
                  {STAGE_DETAILS[selectedStage].privacy}
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-mono text-[11px] uppercase text-teal font-semibold">
                  System Audit Record
                </div>
                <p className="text-ink font-mono text-xs leading-relaxed">
                  {STAGE_DETAILS[selectedStage].keyOutput}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Who Uses ResQ (The 5 Roles) */}
        <section className="space-y-4">
          <div className="border-b border-slate-line pb-2">
            <div className="font-mono text-xs text-slate uppercase tracking-wider">
              Participant Matrix
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-ink">
              Who Uses ResQ & What Each Role Can Do
            </h2>
          </div>

          <div className="border border-slate-line divide-y divide-slate-line bg-paper-raised">
            {SYSTEM_ROLES.map((r) => (
              <div key={r.role} className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-3">
                  <span className="font-mono text-[11px] text-slate uppercase tracking-wider">
                    {r.tag}
                  </span>
                  <h3 className="text-sm sm:text-base font-bold text-ink mt-0.5">
                    {r.role}
                  </h3>
                </div>
                <div className="md:col-span-5 text-xs sm:text-sm text-slate leading-relaxed">
                  {r.description}
                </div>
                <div className="md:col-span-4 text-xs text-ink bg-paper p-3 rounded-[3px] border border-slate-line font-mono">
                  <span className="text-slate block text-[11px] uppercase mb-1">
                    System Capabilities
                  </span>
                  {r.permissions}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 5: Plain-Language Resource Coordination */}
        <section className="bg-paper-raised border border-slate-line p-6 sm:p-8 space-y-4">
          <div className="border-b border-slate-line pb-2">
            <div className="font-mono text-xs text-slate uppercase tracking-wider">
              Logistics Coordination Model
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-ink">
              How Resources and Organizations Work Together
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs sm:text-sm leading-relaxed text-slate">
            <div className="space-y-2">
              <div className="font-mono text-[11px] text-ink font-bold uppercase">
                1. Organization & Inventory
              </div>
              <p>
                NGOs, hospitals, and supply depots register as verified organizations. Each organization catalogs its critical assets — rescue rafts, trauma kits, clean water filters, generators — with staging locations and available quantities.
              </p>
            </div>

            <div className="space-y-2">
              <div className="font-mono text-[11px] text-ink font-bold uppercase">
                2. Split Fulfillment Across Providers
              </div>
              <p>
                When a field request requires more supplies or equipment than any single provider holds, the request itemizes the requirement. Two different suppliers can partially contribute their stock until the overall emergency quota is fulfilled.
              </p>
            </div>

            <div className="space-y-2">
              <div className="font-mono text-[11px] text-ink font-bold uppercase">
                3. Timestamped Time-to-Match Metrics
              </div>
              <p>
                When a volunteer claims a task, ResQ records an assignment with the assigned resource and exact timestamp. This allows administrators to measure Time-to-Match from initial verification to first deployment, identifying bottlenecks without delay.
              </p>
            </div>
          </div>
        </section>

        {/* Section 6: Closing Actions */}
        <section className="bg-paper border border-slate-line p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="font-mono text-xs text-slate uppercase tracking-wider">
                Get Started
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-ink">
                Access the Emergency Operations Network
              </h2>
              <p className="text-xs sm:text-sm text-slate mt-1 max-w-xl">
                Submit an urgent request for immediate field assistance, track an ongoing request by tracking ID, or log in as an authenticated responder.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/submit"
                className="bg-rust text-white font-sans text-xs font-semibold px-5 py-3 rounded-[3px] hover:bg-rust/90 text-center"
              >
                Report an emergency
              </Link>
              <Link
                to="/login"
                className="bg-ink text-white font-sans text-xs font-semibold px-5 py-3 rounded-[3px] hover:bg-ink-soft text-center"
              >
                Log in
              </Link>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-line flex flex-wrap items-center justify-between gap-3 text-xs text-slate font-mono">
            <div>
              Have an existing tracking ID?{' '}
              <Link to="/track" className="text-ink underline hover:text-ink-soft">
                Check request status
              </Link>
            </div>
            <div>
              Platform build: <span className="text-ink">v1.2.0-field</span> (Phase 2 Expanded Schema)
            </div>
          </div>
        </section>
      </main>

      {/* Ledger Footer */}
      <footer className="border-t border-slate-line bg-paper-raised mt-12 py-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate">
          <div>
            ResQ Crisis Coordination Ledger — Capstone Operations Prototype
          </div>
          <div>
            Built with React, TypeScript, Leaflet, Node.js, and MongoDB
          </div>
        </div>
      </footer>
    </div>
  );
}
