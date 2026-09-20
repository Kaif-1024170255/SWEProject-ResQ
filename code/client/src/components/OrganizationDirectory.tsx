import { useState, useEffect, useCallback } from 'react';

export interface OrganizationItem {
  _id: string;
  name: string;
  type: 'ngo' | 'government' | 'hospital' | 'supplier' | 'community_group';
  registrationNumber?: string;
  contactEmail?: string;
  contactPhone?: string;
  operatingRegion?: string;
  address?: string;
  isVerified: boolean;
  primaryContact?: {
    _id: string;
    name: string;
    email?: string;
    role: string;
  };
  createdAt: string;
}

interface OrganizationDirectoryProps {
  onRegisterClick?: () => void;
  canRegister?: boolean;
}

export default function OrganizationDirectory({
  onRegisterClick,
  canRegister = false,
}: OrganizationDirectoryProps) {
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedType, setSelectedType] = useState<string>('all');
  const [regionQuery, setRegionQuery] = useState<string>('');
  const [nameSearch, setNameSearch] = useState<string>('');

  const fetchOrganizations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedType !== 'all') {
        params.append('type', selectedType);
      }
      if (regionQuery.trim()) {
        params.append('operatingRegion', regionQuery.trim());
      }

      const queryString = params.toString();
      const url = `/api/organizations${queryString ? `?${queryString}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load organizations directory');
      }

      setOrganizations(data.organizations || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching organizations');
    } finally {
      setIsLoading(false);
    }
  }, [selectedType, regionQuery]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  // Client-side quick search by name
  const filteredOrganizations = organizations.filter((org) => {
    if (!nameSearch.trim()) return true;
    const q = nameSearch.toLowerCase();
    return (
      org.name.toLowerCase().includes(q) ||
      (org.registrationNumber && org.registrationNumber.toLowerCase().includes(q)) ||
      (org.contactEmail && org.contactEmail.toLowerCase().includes(q)) ||
      (org.operatingRegion && org.operatingRegion.toLowerCase().includes(q))
    );
  });

  const getTypeChip = (type: string) => {
    switch (type) {
      case 'hospital':
        return (
          <span className="font-mono text-[10px] uppercase font-semibold px-2 py-0.5 border border-rust/40 bg-rust/10 text-rust">
            Hospital / Medical
          </span>
        );
      case 'government':
        return (
          <span className="font-mono text-[10px] uppercase font-semibold px-2 py-0.5 border border-ink/40 bg-paper text-ink">
            Government
          </span>
        );
      case 'supplier':
        return (
          <span className="font-mono text-[10px] uppercase font-semibold px-2 py-0.5 border border-amber-line bg-amber-soft/40 text-ink">
            Supplier / Depot
          </span>
        );
      case 'ngo':
        return (
          <span className="font-mono text-[10px] uppercase font-semibold px-2 py-0.5 border border-pine/40 bg-[#EAF2ED] text-pine">
            NGO Partner
          </span>
        );
      case 'community_group':
      default:
        return (
          <span className="font-mono text-[10px] uppercase font-semibold px-2 py-0.5 border border-slate-line bg-paper text-slate">
            Community Group
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Directory Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-line">
        <div>
          <div className="font-mono text-xs text-slate uppercase tracking-wider">
            Crisis Operations Network
          </div>
          <h2 className="text-xl font-bold text-ink">Registered Organizations Directory</h2>
        </div>

        <div className="flex items-center gap-2">
          {canRegister && onRegisterClick && (
            <button
              type="button"
              onClick={onRegisterClick}
              className="bg-ink text-white hover:bg-ink-soft font-sans text-xs font-semibold px-3.5 py-1.5 rounded-[3px] cursor-pointer"
            >
              + Register / Edit My Organization
            </button>
          )}

          <button
            type="button"
            onClick={fetchOrganizations}
            disabled={isLoading}
            className="font-mono text-xs text-slate hover:text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper cursor-pointer"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
          DIRECTORY ERROR: {error}
        </div>
      )}

      {/* Filter Controls Bar (Type Pills + Region + Keyword Search) */}
      <div className="bg-paper-raised border border-slate-line p-3 space-y-3">
        {/* Type Filter Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          <span className="text-slate uppercase mr-1">Type:</span>
          {[
            { id: 'all', label: 'ALL TYPES' },
            { id: 'ngo', label: 'NGO' },
            { id: 'government', label: 'GOVERNMENT' },
            { id: 'hospital', label: 'HOSPITAL' },
            { id: 'supplier', label: 'SUPPLIER' },
            { id: 'community_group', label: 'COMMUNITY' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedType(tab.id)}
              className={`px-2.5 py-1 border transition-colors cursor-pointer uppercase ${
                selectedType === tab.id
                  ? 'bg-ink text-white border-ink font-semibold'
                  : 'bg-paper text-slate border-slate-line hover:text-ink hover:border-slate'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Inputs: Region & Keyword */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-line">
          <div>
            <label className="block font-mono text-[10px] text-slate uppercase font-semibold mb-1">
              Filter by Operating Region
            </label>
            <input
              type="text"
              value={regionQuery}
              onChange={(e) => setRegionQuery(e.target.value)}
              placeholder="Filter by zone (e.g. Ludhiana, Punjab)..."
              className="w-full bg-paper border border-slate-line p-1.5 text-ink font-sans text-xs rounded-[3px] focus:outline-none focus:border-ink placeholder:text-slate/60"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] text-slate uppercase font-semibold mb-1">
              Search by Name / Reg / Contact
            </label>
            <input
              type="text"
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              placeholder="Search directory keywords..."
              className="w-full bg-paper border border-slate-line p-1.5 text-ink font-sans text-xs rounded-[3px] focus:outline-none focus:border-ink placeholder:text-slate/60"
            />
          </div>
        </div>
      </div>

      {/* Dense Ledger List matching §06 Field Ops Ledger */}
      <div className="border border-slate-line bg-paper-raised">
        <div className="p-3 border-b border-slate-line flex items-center justify-between font-mono text-xs text-slate">
          <span>
            SHOWING <strong className="text-ink">{filteredOrganizations.length}</strong> REGISTERED ORGANIZATIONS
          </span>
          <span className="text-[11px]">SORT: RECENTLY REGISTERED</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center font-mono text-xs text-slate">
            Loading organizations directory...
          </div>
        ) : filteredOrganizations.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs text-slate space-y-1">
            <div>NO ORGANIZATIONS MATCH THE SELECTED FILTERS</div>
            <div className="text-[11px] text-slate/70">
              Try adjusting the entity type or operating region filters.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-line">
            {filteredOrganizations.map((org) => (
              <div
                key={org._id}
                className="p-4 hover:bg-paper/80 transition-colors text-xs font-sans space-y-2"
              >
                {/* Header Row: Name, Verification Badge, Type */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-ink text-sm">{org.name}</span>
                    {getTypeChip(org.type)}
                    {org.isVerified ? (
                      <span className="font-mono text-[10px] uppercase font-semibold px-1.5 py-0.5 border border-pine bg-[#EAF2ED] text-pine">
                        ✓ Verified Entity
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 border border-slate-line text-slate bg-paper">
                        Unverified
                      </span>
                    )}
                  </div>

                  <span className="font-mono text-[11px] text-slate">
                    Registered: {new Date(org.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Meta Grid: Region, Reg Number, Address */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] text-slate pt-1 border-t border-slate-line/50">
                  <div>
                    <span className="text-slate/70 uppercase">Operating Region: </span>
                    <strong className="text-ink font-sans">{org.operatingRegion || 'Unspecified'}</strong>
                  </div>

                  <div>
                    <span className="text-slate/70 uppercase">Reg / DARPAN ID: </span>
                    <strong className="text-ink">{org.registrationNumber || 'Not recorded'}</strong>
                  </div>

                  <div>
                    <span className="text-slate/70 uppercase">Depot / HQ: </span>
                    <span className="text-ink font-sans">{org.address || 'Address unlisted'}</span>
                  </div>
                </div>

                {/* Contact & Primary Representative Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[11px] text-slate">
                  <div className="flex flex-wrap items-center gap-3">
                    {org.contactPhone && (
                      <div>
                        <span>Phone: </span>
                        <a
                          href={`tel:${org.contactPhone}`}
                          className="text-ink underline hover:text-rust"
                        >
                          {org.contactPhone}
                        </a>
                      </div>
                    )}

                    {org.contactEmail && (
                      <div>
                        <span>Email: </span>
                        <a
                          href={`mailto:${org.contactEmail}`}
                          className="text-ink underline hover:text-rust"
                        >
                          {org.contactEmail}
                        </a>
                      </div>
                    )}
                  </div>

                  {org.primaryContact && (
                    <div className="text-[10px] text-slate">
                      Coordinator:{' '}
                      <strong className="text-ink">{org.primaryContact.name}</strong> ({org.primaryContact.role})
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
