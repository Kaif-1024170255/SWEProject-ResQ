import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, AuthUser } from '../context/AuthContext';
import { ServerColdStartNotice, useColdStartDelay } from '../components/ServerColdStartNotice';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isWakingServer = useColdStartDelay(isSubmitting, 2000);

  const authenticateWith = async (loginEmail: string, loginPassword: string) => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginEmail.toLowerCase().trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify your email and password.');
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email address and password.');
      return;
    }
    await authenticateWith(email, password);
  };

  return (
    <div className="max-w-[480px] mx-auto px-4 py-12 sm:py-16">
      {/* Header Context */}
      <div className="font-mono text-xs text-slate tracking-wide mb-1">
        resQ / OPERATIONS ACCESS / AUTH
      </div>
      <h1 className="text-2xl font-bold text-ink mb-2">
        Log in to resQ
      </h1>
      <p className="text-slate text-sm mb-6">
        Sign in with your operational credentials to access your emergency requests and dispatch desk.
      </p>

      {/* Immediate emergency report banner for citizens */}
      <div className="mb-6 p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-xs font-semibold text-rust uppercase">
            Need Immediate Emergency Help?
          </div>
          <div className="text-xs text-slate mt-0.5">
            Report an incident directly on the map without logging in.
          </div>
        </div>
        <Link
          to="/submit"
          className="shrink-0 font-sans text-xs font-semibold px-3 py-1.5 min-h-[36px] inline-flex items-center bg-rust text-white rounded-[3px] hover:opacity-90"
        >
          Submit Request
        </Link>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="mb-6 p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust"
        >
          <div className="flex items-start gap-2 font-mono text-xs text-rust font-semibold">
            <span className="w-1.5 h-1.5 bg-rust inline-block mt-1 shrink-0"></span>
            <span>AUTH ERROR: {errorMessage}</span>
          </div>
        </div>
      )}

      {/* Login Form Container */}
      <div id="login-form-card" className="bg-paper-raised border border-slate-line p-6 sm:p-8 rounded-[3px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono mb-1.5"
            >
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. operator@resq.org"
              className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3.5 py-2.5 text-sm text-ink outline-none transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="font-mono text-[11px] text-slate hover:text-ink cursor-pointer focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                [{showPassword ? 'Hide' : 'Show'}]
              </button>
            </div>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3.5 py-2.5 text-sm text-ink outline-none transition-colors pr-10"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-ink text-white font-sans text-sm font-semibold px-5 py-2.5 min-h-[42px] inline-flex items-center justify-center rounded-[3px] border border-transparent hover:bg-ink-soft disabled:opacity-50 cursor-pointer transition-colors"
            >
              {isSubmitting ? 'Verifying credentials...' : 'Log in'}
            </button>
          </div>

          {isWakingServer && (
            <div className="pt-1">
              <ServerColdStartNotice />
            </div>
          )}
        </form>

        <div className="mt-6 pt-4 border-t border-slate-line flex flex-wrap items-center justify-between gap-2 text-xs text-slate">
          <span>Need an account?</span>
          <Link
            to="/register"
            className="font-semibold text-ink hover:underline font-mono"
          >
            Create account
          </Link>
        </div>
      </div>

      {/* Quick Navigation Help */}
      <div className="mt-6 text-center text-xs text-slate">
        Looking for a previously filed emergency?{' '}
        <Link to="/track" className="text-ink underline hover:text-ink-soft font-mono">
          Track request by ID
        </Link>
      </div>
    </div>
  );
}
