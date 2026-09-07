import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConsoleLayout from '../components/ConsoleLayout';

export default function AdminPage() {
  const { user, logout } = useAuth();

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Bar with Navigation / Session context */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-line pb-4 mb-6 gap-4">
        <div>
          <div className="font-mono text-xs text-slate tracking-wide mb-1">
            resQ / CENTRAL DISPATCH / ADMIN DESK
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink">
            Central Dispatch Desk
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold px-2.5 py-1.5 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust text-rust">
                <span className="w-1.5 h-1.5 bg-rust inline-block"></span>
                ADMIN
              </span>
              <span className="font-mono text-xs text-slate hidden md:inline">
                {user.name}
              </span>
            </div>
          )}

          <Link
            to="/track"
            className="font-mono text-xs text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper"
          >
            Track request
          </Link>

          <Link
            to="/submit"
            className="bg-ink text-white font-sans text-xs font-semibold px-3.5 py-1.5 rounded-[3px] hover:bg-ink-soft cursor-pointer"
          >
            Report emergency
          </Link>

          <button
            onClick={logout}
            className="bg-transparent text-ink font-sans text-xs font-semibold px-3.5 py-1.5 rounded-[3px] border border-slate-line hover:border-ink cursor-pointer"
          >
            Log out
          </button>
        </div>
      </div>

      {/* Primary Map + Rail Console per DESIGN_SYSTEM.md §07 ("One board, five roles") */}
      <ConsoleLayout />
    </div>
  );
}
