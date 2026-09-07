import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, AuthUser } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
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
    }
  };

  return (
    <div className="max-w-[480px] mx-auto px-4 py-16">
      {/* Header Context */}
      <div className="font-mono text-xs text-slate tracking-wide mb-1">
        resQ / DISPATCH DESK
      </div>
      <h1 className="text-2xl font-bold text-ink mb-2">
        Log in to resQ
      </h1>
      <p className="text-slate text-sm mb-4">
        Sign in to access your emergency requests and dispatch view.
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

      {/* Login Form Container */}
      <div className="bg-paper-raised border border-slate-line p-6">
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
              {isSubmitting ? 'Verifying credentials...' : 'Log in'}
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

      {/* Quick Demo Credentials Panel */}
      <div className="mt-6 bg-paper-raised border border-slate-line p-4">
        <div className="font-mono text-xs text-slate uppercase tracking-wider mb-2">
          Demo Accounts (Click to Fill)
        </div>
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => {
              setEmail('admin@resq.org');
              setPassword('ResQSecure2026!');
            }}
            className="w-full text-left px-2.5 py-1.5 border border-slate-line border-l-[3px] border-l-rust hover:bg-paper font-mono text-xs flex justify-between items-center cursor-pointer"
          >
            <span className="font-semibold text-ink">ADMIN</span>
            <span className="text-slate">admin@resq.org</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('rahul.volunteer@example.org');
              setPassword('ResQSecure2026!');
            }}
            className="w-full text-left px-2.5 py-1.5 border border-slate-line border-l-[3px] border-l-teal hover:bg-paper font-mono text-xs flex justify-between items-center cursor-pointer"
          >
            <span className="font-semibold text-ink">VOLUNTEER</span>
            <span className="text-slate">rahul.volunteer@example.org</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('amrita.devi@example.org');
              setPassword('ResQSecure2026!');
            }}
            className="w-full text-left px-2.5 py-1.5 border border-slate-line border-l-[3px] border-l-amber hover:bg-paper font-mono text-xs flex justify-between items-center cursor-pointer"
          >
            <span className="font-semibold text-ink">AFFECTED PERSON</span>
            <span className="text-slate">amrita.devi@example.org</span>
          </button>
        </div>
        <div className="mt-2 text-[11px] text-slate font-mono">
          Default password: <span className="text-ink font-semibold">ResQSecure2026!</span>
        </div>
      </div>
    </div>
  );
}
