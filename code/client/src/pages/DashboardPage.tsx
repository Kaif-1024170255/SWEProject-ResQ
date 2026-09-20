import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConsoleLayout from '../components/ConsoleLayout';
import DepotInventoryDashboard from '../components/DepotInventoryDashboard';
import { OrganizationProfileModal } from '../components/OrganizationProfileModal';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [activeView, setActiveView] = useState<'depot' | 'console'>('depot');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const getRoleChipColor = (role?: string) => {
    switch (role) {
      case 'volunteer':
        return 'border-l-teal text-teal';
      case 'affected_person':
        return 'border-l-amber text-amber';
      case 'ngo':
      case 'resource_provider':
        return 'border-l-ink text-ink';
      default:
        return 'border-l-slate text-slate';
    }
  };

  const isInventoryRole = user?.role === 'resource_provider' || user?.role === 'ngo';

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Bar with Navigation / Session context */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-line pb-4 mb-6 gap-4">
        <div>
          <div className="font-mono text-xs text-slate tracking-wide mb-1">
            resQ / {isInventoryRole && activeView === 'depot' ? 'DEPOT OPERATIONS' : 'FIELD OPERATIONS'} / CONSOLE
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink">
            {isInventoryRole && activeView === 'depot' ? 'Depot & Inventory Dashboard' : 'Operations Console'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user && (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 font-mono text-xs font-semibold px-2.5 py-1.5 bg-paper-raised border border-slate-line border-l-[3px] ${getRoleChipColor(
                  user.role
                )}`}
              >
                <span className="w-1.5 h-1.5 bg-current inline-block"></span>
                {user.role.toUpperCase()}
              </span>
              <span className="font-mono text-xs text-slate hidden md:inline">
                {user.name}
              </span>
            </div>
          )}

          <Link
            to="/organizations"
            className="font-mono text-xs text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper"
          >
            Organizations
          </Link>

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

      {/* Role-specific Context Guidance Banner */}
      {user && (
        <div
          className={`p-3 bg-paper-raised border border-slate-line border-l-[3px] ${getRoleChipColor(
            user.role
          )} mb-6 flex flex-wrap items-center justify-between gap-3`}
        >
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 font-mono text-xs font-semibold">
              <span className="w-1.5 h-1.5 bg-current inline-block"></span>
              <span>
                ROLE MODE:{' '}
                {user.role === 'affected_person'
                  ? 'AFFECTED PERSON (CITIZEN)'
                  : user.role === 'volunteer'
                  ? 'VOLUNTEER RESPONDER'
                  : user.role === 'ngo'
                  ? 'NGO RELIEF COORDINATOR'
                  : user.role === 'resource_provider'
                  ? 'RESOURCE PROVIDER'
                  : user.role.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate font-sans">
              {user.role === 'affected_person' &&
                'You are logged in as a citizen requester. You can submit new crisis reports, track your request status, and communicate with responders once assigned.'}
              {user.role === 'volunteer' &&
                'You are logged in as a field volunteer responder. You can claim verified requests on the rail/map, access unredacted contact numbers once claimed, and mark tickets resolved on scene.'}
              {user.role === 'ngo' &&
                'You are logged in as an NGO relief coordinator. Manage your relief supplies in the depot ledger, or switch to the dispatch console to claim tickets and coordinate relief.'}
              {user.role === 'resource_provider' &&
                'You are logged in as a resource and logistics provider. Register and manage warehouse stock in your depot ledger, or switch to the dispatch console to allocate supplies towards crisis requirements.'}
            </p>
          </div>

          {user.role === 'affected_person' && (
            <div className="flex items-center gap-2">
              <Link
                to="/submit"
                className="font-mono text-xs px-2.5 py-1 bg-rust text-white rounded-[3px] hover:opacity-90"
              >
                Submit New Request
              </Link>
              <Link
                to="/track"
                className="font-mono text-xs px-2.5 py-1 bg-white border border-slate-line text-ink rounded-[3px] hover:bg-paper"
              >
                Track My Requests
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Role-specific Tab Switcher for Resource Providers and NGOs */}
      {isInventoryRole && (
        <div className="flex flex-wrap items-center justify-between border border-slate-line bg-paper-raised p-1 font-mono text-xs mb-4 gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveView('depot')}
              className={`px-4 sm:px-6 py-2 text-center font-semibold uppercase cursor-pointer transition-colors ${
                activeView === 'depot'
                  ? 'bg-ink text-white shadow-xs'
                  : 'text-slate hover:text-ink'
              }`}
            >
              Depot & Inventory
            </button>
            <button
              type="button"
              onClick={() => setActiveView('console')}
              className={`px-4 sm:px-6 py-2 text-center font-semibold uppercase cursor-pointer transition-colors ${
                activeView === 'console'
                  ? 'bg-ink text-white shadow-xs'
                  : 'text-slate hover:text-ink'
              }`}
            >
              Dispatch Console (Map & Rail)
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsProfileModalOpen(true)}
            className="px-3 py-1.5 border border-slate-line text-ink hover:border-ink hover:bg-paper font-semibold uppercase cursor-pointer transition-colors"
          >
            ⚙ Org Profile
          </button>
        </div>
      )}

      {/* Primary Dashboard Area */}
      {isInventoryRole && activeView === 'depot' ? (
        <DepotInventoryDashboard />
      ) : (
        <ConsoleLayout />
      )}

      {/* Organization Profile Modal */}
      {isProfileModalOpen && (
        <OrganizationProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          onSuccess={() => {}}
        />
      )}
    </div>
  );
}
