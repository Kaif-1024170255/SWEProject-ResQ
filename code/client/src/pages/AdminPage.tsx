import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConsoleLayout from '../components/ConsoleLayout';
import CategoryManagementPanel from '../components/CategoryManagementPanel';
import IncidentManagementPanel from '../components/IncidentManagementPanel';
import OrganizationDirectory from '../components/OrganizationDirectory';
import { OrganizationProfileModal } from '../components/OrganizationProfileModal';

export default function AdminPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'console' | 'incidents' | 'categories' | 'organizations'>('console');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Bar with Navigation / Session context */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-line pb-4 mb-6 gap-4">
        <div>
          <div className="font-mono text-xs text-slate tracking-wide mb-1">
            resQ / CENTRAL DISPATCH / ADMIN DESK
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink">
            {activeTab === 'incidents'
              ? 'Major Incidents & Cluster Command'
              : activeTab === 'categories'
              ? 'Emergency Category Management'
              : activeTab === 'organizations'
              ? 'Civil Defense & Organizations Directory'
              : 'Central Dispatch Desk'}
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
            to="/organizations"
            className="font-mono text-xs text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper"
          >
            Organizations
          </Link>

          <Link
            to="/analytics"
            className="font-mono text-xs text-rust border border-rust/30 bg-rust-faint px-3 py-1.5 rounded-[3px] hover:bg-rust/10 font-semibold"
          >
            Analytics
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

      {/* Admin Role Guidance Banner */}
      <div className="p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 font-mono text-xs font-semibold text-rust">
            <span className="w-1.5 h-1.5 bg-rust inline-block"></span>
            <span>ROLE MODE: CENTRAL DISPATCH ADMIN</span>
          </div>
          <p className="text-xs text-slate font-sans">
            Full administrative authority enabled: verify unverified incident reports, manage emergency categories, group requests under incidents, inspect precise survivor coordinates, and audit all dispatch threads.
          </p>
        </div>
      </div>

      {/* Admin Subnav Tab Switcher */}
      <div className="flex border border-slate-line bg-paper-raised p-1 font-mono text-xs mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('console')}
          className={`flex-1 sm:flex-initial sm:px-6 py-2 text-center font-semibold uppercase cursor-pointer transition-colors ${
            activeTab === 'console'
              ? 'bg-ink text-white shadow-xs'
              : 'text-slate hover:text-ink'
          }`}
        >
          Dispatch Console (Map & Rail)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('incidents')}
          className={`flex-1 sm:flex-initial sm:px-6 py-2 text-center font-semibold uppercase cursor-pointer transition-colors ${
            activeTab === 'incidents'
              ? 'bg-ink text-white shadow-xs'
              : 'text-slate hover:text-ink'
          }`}
        >
          Major Incidents
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`flex-1 sm:flex-initial sm:px-6 py-2 text-center font-semibold uppercase cursor-pointer transition-colors ${
            activeTab === 'categories'
              ? 'bg-ink text-white shadow-xs'
              : 'text-slate hover:text-ink'
          }`}
        >
          Category Management
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('organizations')}
          className={`flex-1 sm:flex-initial sm:px-6 py-2 text-center font-semibold uppercase cursor-pointer transition-colors ${
            activeTab === 'organizations'
              ? 'bg-ink text-white shadow-xs'
              : 'text-slate hover:text-ink'
          }`}
        >
          Organizations Directory
        </button>
      </div>

      {/* Main View Display */}
      {activeTab === 'incidents' ? (
        <IncidentManagementPanel />
      ) : activeTab === 'categories' ? (
        <CategoryManagementPanel />
      ) : activeTab === 'organizations' ? (
        <OrganizationDirectory
          canRegister={true}
          onRegisterClick={() => setIsProfileModalOpen(true)}
        />
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
