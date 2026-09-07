import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import ConsoleMap from './ConsoleMap';
import ConsoleRail from './ConsoleRail';
import StatusChip from './StatusChip';
import { DispatchRequest } from './DispatchLog';

interface ConsoleLayoutProps {
  onDataRefresh?: () => void;
}

export default function ConsoleLayout({ onDataRefresh }: ConsoleLayoutProps) {
  const { user, token } = useAuth();

  const [allRequests, setAllRequests] = useState<DispatchRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters shared across map and rail
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Synchronized selection between map and rail
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // Action processing state
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Mobile view toggle: 'map' or 'rail'
  const [mobileTab, setMobileTab] = useState<'map' | 'rail'>('map');

  // Fetch all requests
  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/requests', { headers });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to retrieve emergency requests.');
      }

      setAllRequests(data.requests || []);
      if (onDataRefresh) {
        onDataRefresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect to dispatch API.');
    } finally {
      setIsLoading(false);
    }
  }, [token, onDataRefresh]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Filter out closed requests for active operations console, and apply filters
  const nonClosedRequests = useMemo(() => {
    return allRequests.filter((req) => req.status !== 'closed');
  }, [allRequests]);

  const activeFilteredRequests = useMemo(() => {
    return nonClosedRequests.filter((req) => {
      const matchStatus =
        statusFilter === 'all' || req.status === statusFilter;
      const matchCategory =
        categoryFilter === 'all' || req.category === categoryFilter;
      return matchStatus && matchCategory;
    });
  }, [nonClosedRequests, statusFilter, categoryFilter]);

  // Find selected request object
  const selectedRequest = useMemo(() => {
    return (
      activeFilteredRequests.find((r) => r.requestId === selectedRequestId) ||
      allRequests.find((r) => r.requestId === selectedRequestId) ||
      null
    );
  }, [activeFilteredRequests, allRequests, selectedRequestId]);

  // Action dispatcher
  const handleAction = async (id: string, action: 'verify' | 'claim' | 'resolve') => {
    setActionError(null);
    setActionInProgressId(id);

    try {
      let body: Record<string, any> = {};
      if (action === 'verify') {
        body = { note: 'Verified by central dispatcher' };
      } else if (action === 'claim') {
        body = { note: `Claimed by ${user?.name || 'responder'}` };
      } else if (action === 'resolve') {
        body = { note: `Resolution reported by ${user?.name || 'responder'}` };
      }

      const res = await fetch(`/api/requests/${id}/${action}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action} request`);
      }

      // Refresh list to update status and coordinates
      await fetchRequests();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : `Error performing ${action}`);
    } finally {
      setActionInProgressId(null);
    }
  };

  const isAdmin = user?.role === 'admin';
  const isResponder =
    user?.role === 'volunteer' ||
    user?.role === 'ngo' ||
    user?.role === 'resource_provider';

  return (
    <div className="space-y-3">
      {/* Action error banner */}
      {actionError && (
        <div className="p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
          ACTION ERROR: {actionError}
        </div>
      )}

      {/* API connection error */}
      {error && (
        <div className="p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
          DISPATCH API ERROR: {error}
        </div>
      )}

      {/* Mobile Tab Switcher (< 768px viewports) */}
      <div className="md:hidden flex border border-slate-line bg-paper-raised p-1 font-mono text-xs">
        <button
          type="button"
          onClick={() => setMobileTab('map')}
          className={`flex-1 py-2 text-center font-semibold uppercase cursor-pointer transition-colors ${
            mobileTab === 'map'
              ? 'bg-ink text-white shadow-sm'
              : 'text-slate hover:text-ink'
          }`}
        >
          Map View ({activeFilteredRequests.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('rail')}
          className={`flex-1 py-2 text-center font-semibold uppercase cursor-pointer transition-colors ${
            mobileTab === 'rail'
              ? 'bg-ink text-white shadow-sm'
              : 'text-slate hover:text-ink'
          }`}
        >
          Dispatch Rail ({activeFilteredRequests.length})
        </button>
      </div>

      {/* Main Console Box (Map + Rail Layout per DESIGN_SYSTEM.md §07) */}
      <div className="border border-slate-line bg-paper-raised overflow-hidden shadow-xs">
        {/* Desktop View: Side-by-side grid */}
        <div className="hidden md:grid md:grid-cols-[380px_1fr] h-[640px]">
          {/* Left Rail */}
          <ConsoleRail
            requests={activeFilteredRequests}
            selectedRequestId={selectedRequestId}
            onSelectRequest={setSelectedRequestId}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            onAction={handleAction}
            actionInProgressId={actionInProgressId}
            onRefresh={fetchRequests}
            isLoading={isLoading}
          />

          {/* Right Map Pane */}
          <div className="h-full relative">
            <ConsoleMap
              requests={activeFilteredRequests}
              selectedRequestId={selectedRequestId}
              onSelectRequest={setSelectedRequestId}
              onAction={handleAction}
              actionInProgressId={actionInProgressId}
            />
          </div>
        </div>

        {/* Mobile View: Render active tab */}
        <div className="md:hidden">
          {mobileTab === 'map' ? (
            <div className="relative h-[500px]">
              <ConsoleMap
                requests={activeFilteredRequests}
                selectedRequestId={selectedRequestId}
                onSelectRequest={setSelectedRequestId}
                onAction={handleAction}
                actionInProgressId={actionInProgressId}
              />

              {/* Floating mobile bottom detail sheet when pin selected */}
              {selectedRequest && (
                <div className="absolute bottom-2 left-2 right-2 z-[1000] bg-paper-raised border border-slate-line p-3.5 shadow-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-ink">
                      {selectedRequest.requestId}
                    </span>
                    <button
                      onClick={() => setSelectedRequestId(null)}
                      className="font-mono text-xs text-slate hover:text-ink px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusChip status={selectedRequest.status} className="text-[10px] py-0.5 px-2" />
                    <span className="font-mono text-[10px] text-slate uppercase">
                      {selectedRequest.category}
                    </span>
                  </div>

                  <p className="text-xs text-ink line-clamp-2">
                    {selectedRequest.description}
                  </p>

                  {/* Contextual Action Button */}
                  <div className="pt-1">
                    {selectedRequest.status === 'unverified' && isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleAction(selectedRequest.requestId, 'verify')}
                        disabled={actionInProgressId === selectedRequest.requestId}
                        className="w-full bg-ink text-white font-sans text-xs font-semibold py-2 px-3 rounded-[3px] hover:bg-ink-soft cursor-pointer"
                      >
                        {actionInProgressId === selectedRequest.requestId ? 'Verifying...' : 'Verify'}
                      </button>
                    )}

                    {selectedRequest.status === 'verified' && isResponder && (
                      <button
                        type="button"
                        onClick={() => handleAction(selectedRequest.requestId, 'claim')}
                        disabled={actionInProgressId === selectedRequest.requestId}
                        className="w-full bg-ink text-white font-sans text-xs font-semibold py-2 px-3 rounded-[3px] hover:bg-ink-soft cursor-pointer"
                      >
                        {actionInProgressId === selectedRequest.requestId
                          ? 'Claiming...'
                          : 'Claim this request'}
                      </button>
                    )}

                    {selectedRequest.status === 'in_progress' &&
                      (isAdmin || (user && selectedRequest.claimedBy?._id === user.id)) && (
                        <button
                          type="button"
                          onClick={() => handleAction(selectedRequest.requestId, 'resolve')}
                          disabled={actionInProgressId === selectedRequest.requestId}
                          className="w-full bg-transparent text-ink font-sans text-xs font-semibold py-2 px-3 rounded-[3px] border border-ink hover:bg-paper cursor-pointer"
                        >
                          {actionInProgressId === selectedRequest.requestId
                            ? 'Resolving...'
                            : 'Mark resolved'}
                        </button>
                      )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-[520px]">
              <ConsoleRail
                requests={activeFilteredRequests}
                selectedRequestId={selectedRequestId}
                onSelectRequest={(id) => {
                  setSelectedRequestId(id);
                  if (id) {
                    setMobileTab('map'); // Switch to map when request selected in rail
                  }
                }}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                categoryFilter={categoryFilter}
                setCategoryFilter={setCategoryFilter}
                onAction={handleAction}
                actionInProgressId={actionInProgressId}
                onRefresh={fetchRequests}
                isLoading={isLoading}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
