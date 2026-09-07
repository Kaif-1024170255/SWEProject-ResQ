import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, UserRole, AuthUser } from '../context/AuthContext';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('volunteer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create account.');
      }

      const user = data.user as AuthUser;
      login(data.token, user);

      // Redirect to dashboard (new registrations cannot be admin)
      navigate('/dashboard');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to connect to registration service.');
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
        Create a resQ account
      </h1>
      <p className="text-slate text-sm mb-6">
        Register your profile to submit or coordinate crisis response requests.
      </p>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust">
          <div className="flex items-center gap-2 font-mono text-xs text-rust font-semibold">
            <span className="w-1.5 h-1.5 bg-rust inline-block"></span>
            REGISTRATION ERROR: {errorMessage}
          </div>
        </div>
      )}

      {/* Registration Form Container */}
      <div className="bg-paper-raised border border-slate-line p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono mb-1.5">
              Full Name or Organization
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rahul Sharma or Red Cross Branch"
              className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3 py-2 text-sm text-ink outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. rahul@example.org"
              className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3 py-2 text-sm text-ink outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono mb-1.5">
              Password (minimum 8 characters)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3 py-2 text-sm text-ink outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono mb-1.5">
              Operational Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3 py-2 text-sm text-ink outline-none"
            >
              <option value="affected_person">Affected Person (Requesting Aid)</option>
              <option value="volunteer">Volunteer (Field Responder)</option>
              <option value="ngo">NGO / Relief Organization</option>
              <option value="resource_provider">Resource / Supply Provider</option>
            </select>
            <p className="mt-1 font-mono text-[11px] text-slate">
              Administrator roles are provisioned by central dispatch, not self-registered.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-ink text-white font-sans text-sm font-semibold px-5 py-2.5 rounded-[3px] border border-transparent hover:bg-ink-soft disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-line flex items-center justify-between text-xs text-slate">
          <span>Already registered?</span>
          <Link
            to="/login"
            className="font-semibold text-ink hover:underline font-mono"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
