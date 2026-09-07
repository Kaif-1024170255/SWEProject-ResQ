import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import StatusChip from './StatusChip';

export interface DispatchRequest {
  _id: string;
  requestId: string;
  category: 'medical' | 'shelter' | 'supplies' | 'rescue' | 'other';
  description: string;
  location: {
    publicLat: number;
    publicLng: number;
    preciseLat?: number;
    preciseLng?: number;
  };
  status: 'unverified' | 'verified' | 'in_progress' | 'resolved' | 'closed';
  contactPhone?: string;
  createdBy?: {
    _id: string;
    name: string;
    role: string;
  };
  claimedBy?: {
    _id: string;
    name: string;
    role: string;
  };
  statusHistory?: Array<{
    status: string;
    changedAt: string;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface DispatchLogProps {
  requests: DispatchRequest[];
  onRefresh: () => void;
  isLoading?: boolean;
}

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function DispatchLog({ requests, onRefresh, isLoading }: DispatchLogProps) {
  const { user, token } = useAuth();
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('all');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const filteredRequests = requests.filter((req) => {
    const statusMatch =
      activeStatusFilter === 'all' || req.status === activeStatusFilter;
    const categoryMatch =
      activeCategoryFilter === 'all' || req.category === activeCategoryFilter;
    return statusMatch && categoryMatch;
  });

  const handleVerify = async (id: string) => {
    setActionError(null);
    setProcessingId(id);
    try {
      const res = await fetch(`/api/requests/${id}/verify`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note: 'Verified by central dispatcher' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to verify request');
      onRefresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Error executing verify');
    } finally {
      setProcessingId(null);
    }
  };

  const handleClaim = async (id: string) => {
    setActionError(null);
    setProcessingId(id);
    try {
      const res = await fetch(`/api/requests/${id}/claim`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note: `Claimed by ${user?.name || 'responder'}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to claim request');
      onRefresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Error executing claim');
    } finally {
      setProcessingId(null);
    }
  };

  const handleResolve = async (id: string) => {
    setActionError(null);
    setProcessingId(id);
    try {
      const res = await fetch(`/api/requests/${id}/resolve`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note: `Resolution reported by ${user?.name || 'responder'}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resolve request');
      onRefresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Error executing resolve');
    } finally {
      setProcessingId(null);
    }
  };

  const isResponder =
    user?.role === 'volunteer' ||
    user?.role === 'ngo' ||
    user?.role === 'resource_provider';
  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-4">
      {/* Error alert if transition failed */}
      {actionError && (
        <div className="p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
          TRANSITION ERROR: {actionError}
        </div>
      )}

      {/* Filter Tabs matching §06 / §07 Field Ops Ledger */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-line">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          <span className="text-slate uppercase mr-1">Status:</span>
          {['all', 'unverified', 'verified', 'in_progress', 'resolved', 'closed'].map((status) => (
            <button
              key={status}
              onClick={() => setActiveStatusFilter(status)}
              className={`px-2.5 py-1 border transition-colors cursor-pointer uppercase ${
                activeStatusFilter === status
                  ? 'bg-ink text-white border-ink font-semibold'
                  : 'bg-paper-raised text-slate border-slate-line hover:border-ink'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate uppercase">Category:</span>
          <select
            value={activeCategoryFilter}
            onChange={(e) => setActiveCategoryFilter(e.target.value)}
            className="bg-paper-raised border border-slate-line px-2 py-1 text-ink font-sans text-xs outline-none"
          >
            <option value="all">ALL CATEGORIES</option>
            <option value="medical">Medical</option>
            <option value="rescue">Rescue</option>
            <option value="supplies">Supplies</option>
            <option value="shelter">Shelter</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Ledger Container matching DESIGN_SYSTEM.md §06 */}
      <div className="border border-slate-line bg-paper-raised">
        <div className="p-3 bg-paper border-b border-slate-line flex items-center justify-between font-mono text-xs text-slate">
          <div className="uppercase tracking-wider">
            Dispatch Ledger ({filteredRequests.length} {filteredRequests.length === 1 ? 'entry' : 'entries'})
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="hover:text-ink cursor-pointer uppercase tracking-wider text-[11px]"
          >
            {isLoading ? 'Updating...' : 'Refresh Log'}
          </button>
        </div>

        {filteredRequests.length === 0 ? (
          <div className="p-10 text-center text-slate font-sans text-sm">
            No emergency requests match the current filters.
          </div>
        ) : (
          <div className="divide-y divide-slate-line">
            {filteredRequests.map((req) => {
              const isClaimant =
                user && req.claimedBy && req.claimedBy._id === user.id;
              const isExpanded = selectedRequestId === req.requestId;
              const isBusy = processingId === req.requestId;

              return (
                <div key={req._id} className="transition-colors hover:bg-[#F9FAF9]">
                  {/* Dense row matching §06 grid */}
                  <div className="p-4 grid grid-cols-1 md:grid-cols-[110px_1fr_150px_auto] gap-3 items-center">
                    {/* Column 1: Request ID */}
                    <div className="font-mono text-xs text-slate font-semibold flex items-center gap-2">
                      <button
                        onClick={() =>
                          setSelectedRequestId(isExpanded ? null : req.requestId)
                        }
                        className="text-ink hover:underline font-mono text-xs"
                      >
                        {req.requestId}
                      </button>
                    </div>

                    {/* Column 2: Category & Description */}
                    <div>
                      <span className="block text-[11px] font-mono text-slate uppercase tracking-wider mb-0.5">
                        {req.category}
                        {req.claimedBy && (
                          <span className="ml-2 text-teal">
                            · Claimed by {req.claimedBy.name}
                          </span>
                        )}
                      </span>
                      <div className="text-ink text-sm leading-snug">
                        {req.description}
                      </div>
                    </div>

                    {/* Column 3: Status Chip */}
                    <div>
                      <StatusChip status={req.status} />
                    </div>

                    {/* Column 4: Contextual Action Buttons & Timestamp */}
                    <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0">
                      <span className="font-mono text-xs text-slate">
                        {formatRelativeTime(req.createdAt)}
                      </span>

                      {/* Action buttons based on status and role */}
                      {req.status === 'unverified' && isAdmin && (
                        <button
                          onClick={() => handleVerify(req.requestId)}
                          disabled={isBusy}
                          className="bg-ink text-white font-sans text-xs font-semibold px-3 py-1.5 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
                        >
                          {isBusy ? 'Verifying...' : 'Verify'}
                        </button>
                      )}

                      {req.status === 'verified' && isResponder && (
                        <button
                          onClick={() => handleClaim(req.requestId)}
                          disabled={isBusy}
                          className="bg-ink text-white font-sans text-xs font-semibold px-3 py-1.5 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
                        >
                          {isBusy ? 'Claiming...' : 'Claim this request'}
                        </button>
                      )}

                      {req.status === 'in_progress' && (isClaimant || isAdmin) && (
                        <button
                          onClick={() => handleResolve(req.requestId)}
                          disabled={isBusy}
                          className="bg-transparent text-ink font-sans text-xs font-semibold px-3 py-1.5 rounded-[3px] border border-ink hover:bg-paper cursor-pointer disabled:opacity-50"
                        >
                          {isBusy ? 'Resolving...' : 'Mark resolved'}
                        </button>
                      )}

                      {req.status === 'resolved' && (
                        <span className="font-mono text-[11px] text-slate italic">
                          Awaiting requester confirm
                        </span>
                      )}

                      <button
                        onClick={() =>
                          setSelectedRequestId(isExpanded ? null : req.requestId)
                        }
                        className="text-xs text-slate hover:text-ink font-mono underline"
                      >
                        {isExpanded ? 'Hide' : 'Details'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Operational Detail Pane */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 bg-paper border-t border-slate-line text-xs font-sans space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
                        <div>
                          <div className="text-slate uppercase text-[10px] mb-1">
                            Coordinates
                          </div>
                          {req.location.preciseLat !== undefined ? (
                            <div className="text-rust font-semibold">
                              PRECISE: {req.location.preciseLat.toFixed(6)},{' '}
                              {req.location.preciseLng?.toFixed(6)}
                            </div>
                          ) : (
                            <div className="text-slate">
                              PUBLIC (FUZZED): {req.location.publicLat.toFixed(6)},{' '}
                              {req.location.publicLng.toFixed(6)}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-slate uppercase text-[10px] mb-1">
                            Contact Phone
                          </div>
                          <div className="text-ink font-semibold">
                            {req.contactPhone || 'None specified (Bystander report)'}
                          </div>
                        </div>

                        <div>
                          <div className="text-slate uppercase text-[10px] mb-1">
                            Claim Status
                          </div>
                          <div className="text-ink">
                            {req.claimedBy
                              ? `${req.claimedBy.name} (${req.claimedBy.role})`
                              : 'Unassigned'}
                          </div>
                        </div>
                      </div>

                      {/* Status History Timeline */}
                      {req.statusHistory && req.statusHistory.length > 0 && (
                        <div className="pt-2 border-t border-slate-line">
                          <div className="font-mono text-[10px] text-slate uppercase mb-1.5">
                            Status Audit History
                          </div>
                          <div className="space-y-1">
                            {req.statusHistory.map((h, i) => (
                              <div
                                key={i}
                                className="font-mono text-[11px] flex items-center gap-3 text-slate"
                              >
                                <span className="text-ink uppercase font-semibold">
                                  {h.status}
                                </span>
                                <span>{new Date(h.changedAt).toLocaleString()}</span>
                                {h.note && <span>— {h.note}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
