import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, AuthUser } from '../context/AuthContext';

interface DemoAccount {
  role: string;
  roleBadge: string;
  name: string;
  email: string;
  borderClass: string;
  badgeClass: string;
  description: string;
  capabilities: string[];
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'admin',
    roleBadge: 'ADMIN',
    name: 'Central Dispatch Admin',
    email: 'admin@resq.org',
    borderClass: 'border-l-rust',
    badgeClass: 'text-rust',
    description: 'Dispatch Commander with top-level system authority.',
    capabilities: [
      'Verify unverified emergency requests',
      'Manage Emergency Categories & Priority levels',
      'Group related requests under Incidents',
      'View unredacted coordinates & contact details',
    ],
  },
  {
    role: 'volunteer',
    roleBadge: 'VOLUNTEER',
    name: 'Rahul Sharma',
    email: 'rahul.volunteer@example.org',
    borderClass: 'border-l-teal',
    badgeClass: 'text-teal',
    description: 'First responder operating on the ground in disaster sectors.',
    capabilities: [
      'View operations rail & live incident map',
      'Claim verified emergency requests',
      'Mark claimed requests as resolved on scene',
      'Post field messages & upload photo evidence',
    ],
  },
  {
    role: 'ngo',
    roleBadge: 'NGO COORDINATOR',
    name: 'Punjab Relief Network',
    email: 'dispatch@punjabrelief.org',
    borderClass: 'border-l-ink',
    badgeClass: 'text-ink',
    description: 'Relief organization coordinating multi-responder operations.',
    capabilities: [
      'Coordinate team-wide crisis responses',
      'Claim high-load logistics & rescue missions',
      'Assign relief inventory & resources to requests',
      'Coordinate via request communication thread',
    ],
  },
  {
    role: 'resource_provider',
    roleBadge: 'RESOURCE PROVIDER',
    name: 'Ludhiana Medical Supplies Depot',
    email: 'logistics@ludhianamedical.org',
    borderClass: 'border-l-ink',
    badgeClass: 'text-ink',
    description: 'Depot & logistics provider supplying materials, medical gear, and power.',
    capabilities: [
      'Claim supply & equipment requests',
      'Track stock allocation and supply delivery',
      'Upload delivery receipts as supporting evidence',
      'Mark logistics requests as resolved',
    ],
  },
  {
    role: 'affected_person',
    roleBadge: 'AFFECTED PERSON',
    name: 'Amrita Devi',
    email: 'amrita.devi@example.org',
    borderClass: 'border-l-amber',
    badgeClass: 'text-amber',
    description: 'Citizen experiencing an emergency seeking assistance.',
    capabilities: [
      'Submit emergency crisis requests without prior account',
      'Track live request progress through 5-stage lifecycle',
      'Communicate directly with assigned responders via comms log',
      'Confirm resolution once help is received to close ticket',
    ],
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickLoginRole, setQuickLoginRole] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);

  const authenticateWith = async (loginEmail: string, loginPassword: string) => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Verify email and password.');
      }

      const user = data.user as AuthUser;
      login(data.token, user);

      // Role-aware redirect
      if (user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to connect to authentication service.');
      }
    } finally {
      setIsSubmitting(false);
      setQuickLoginRole(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await authenticateWith(email, password);
  };

  const handleQuickLogin = async (demoAccount: DemoAccount) => {
    setEmail(demoAccount.email);
    setPassword('ResQSecure2026!');
    setQuickLoginRole(demoAccount.role);
    setFormFeedback(null);
    await authenticateWith(demoAccount.email, 'ResQSecure2026!');
  };

  const handleFillForm = (demoAccount: DemoAccount) => {
    setEmail(demoAccount.email);
    setPassword('ResQSecure2026!');
    setFormFeedback(`Filled ${demoAccount.roleBadge} credentials (${demoAccount.email}) into login form above.`);
    // Smooth scroll to top form
    const formElement = document.getElementById('login-form-card');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="max-w-[620px] mx-auto px-4 py-12">
      {/* Header Context */}
      <div className="font-mono text-xs text-slate tracking-wide mb-1">
        resQ / OPERATIONS ACCESS / AUTH
      </div>
      <h1 className="text-2xl font-bold text-ink mb-2">
        Log in to resQ
      </h1>
      <p className="text-slate text-sm mb-4">
        Sign in with an operational role to access your emergency requests and dispatch desk.
      </p>

      {/* Direct link to public emergency report map */}
      <div className="mb-6 p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust flex items-center justify-between">
        <div>
          <div className="font-mono text-xs font-semibold text-rust uppercase">Need Immediate Emergency Help?</div>
          <div className="text-xs text-slate">Report an incident directly on the map without logging in.</div>
        </div>
        <Link
          to="/submit"
          className="ml-3 shrink-0 font-sans text-xs font-semibold px-3 py-1.5 bg-rust text-white rounded-[3px] hover:opacity-90"
        >
          Submit Request
        </Link>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust">
          <div className="flex items-center gap-2 font-mono text-xs text-rust font-semibold">
            <span className="w-1.5 h-1.5 bg-rust inline-block"></span>
            AUTH ERROR: {errorMessage}
          </div>
        </div>
      )}

      {/* Form Feedback Banner (When "Fill Form" is clicked) */}
      {formFeedback && (
        <div className="mb-4 p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-teal flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs text-teal font-semibold">
            <span className="w-1.5 h-1.5 bg-teal inline-block"></span>
            FORM POPULATED: {formFeedback}
          </div>
          <button
            type="button"
            onClick={() => setFormFeedback(null)}
            className="font-mono text-[11px] text-slate hover:text-ink cursor-pointer ml-3 shrink-0"
          >
            [dismiss]
          </button>
        </div>
      )}

      {/* Login Form Container */}
      <div id="login-form-card" className="bg-paper-raised border border-slate-line p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. operator@example.org"
              className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3 py-2 text-sm text-ink outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3 py-2 text-sm text-ink outline-none"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-ink text-white font-sans text-sm font-semibold px-5 py-2.5 rounded-[3px] border border-transparent hover:bg-ink-soft disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting && !quickLoginRole ? 'Verifying credentials...' : 'Log in'}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-line flex items-center justify-between text-xs text-slate">
          <span>Need an account?</span>
          <Link
            to="/register"
            className="font-semibold text-ink hover:underline font-mono"
          >
            Create account
          </Link>
        </div>
      </div>

      {/* Quick Demo Credentials Panel for ALL 5 Roles */}
      <div className="mt-6 bg-paper-raised border border-slate-line p-5">
        <div className="flex items-center justify-between border-b border-slate-line pb-2 mb-3">
          <div className="font-mono text-xs text-ink font-semibold uppercase tracking-wider">
            Demo Accounts By Role
          </div>
          <div className="font-mono text-[11px] text-slate">
            Password: <span className="text-ink font-semibold">ResQSecure2026!</span>
          </div>
        </div>

        {/* Clear Explanation of Buttons */}
        <div className="mb-4 p-2.5 bg-paper border border-slate-line text-[11px] text-slate space-y-1 font-mono">
          <div className="text-ink font-semibold">HOW THESE DEMO CONTROLS WORK:</div>
          <div>
            <span className="text-ink font-semibold">• Quick Login:</span> Authenticates immediately with 1 click and opens that role's interface (/admin or /dashboard).
          </div>
          <div>
            <span className="text-ink font-semibold">• Fill Form:</span> Populates the email and password inputs above and scrolls up so you can inspect credentials or test manual submission.
          </div>
        </div>

        <div className="space-y-3">
          {DEMO_ACCOUNTS.map((acc) => {
            const isLoggingIn = isSubmitting && quickLoginRole === acc.role;
            return (
              <div
                key={acc.role}
                className={`p-3 bg-white border border-slate-line border-l-[4px] ${acc.borderClass} space-y-2`}
              >
                {/* Header: Consistent 2-column layout that prevents wrapping mismatches */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-line/50 pb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-mono text-xs font-bold uppercase tracking-wide ${acc.badgeClass}`}>
                        [{acc.roleBadge}]
                      </span>
                      <span className="text-xs text-ink font-medium">
                        {acc.name}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate mt-0.5 truncate">
                      {acc.email}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleFillForm(acc)}
                      title="Populate email and password in the login form above"
                      className="font-mono text-[11px] text-slate hover:text-ink px-2.5 py-1 border border-slate-line rounded-[3px] hover:bg-paper cursor-pointer bg-white"
                    >
                      Fill Form
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleQuickLogin(acc)}
                      title="Log in immediately as this role"
                      className="font-mono text-[11px] font-semibold px-2.5 py-1 bg-ink text-white rounded-[3px] hover:bg-ink-soft disabled:opacity-50 cursor-pointer"
                    >
                      {isLoggingIn ? 'Logging in...' : 'Quick Login'}
                    </button>
                  </div>
                </div>

                <div className="text-xs text-ink-soft">
                  {acc.description}
                </div>

                {/* Role capabilities bullet summary */}
                <div className="pt-1">
                  <div className="font-mono text-[10px] text-slate uppercase tracking-wider mb-1">
                    Role Capabilities:
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate font-sans">
                    {acc.capabilities.map((cap, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-slate-line font-mono select-none">•</span>
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
