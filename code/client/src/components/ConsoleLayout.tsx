import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConsoleMap from './ConsoleMap';
import ConsoleRail from './ConsoleRail';
import NotificationList from './NotificationList';
import StatusChip from './StatusChip';
import ErrorBoundary from './ErrorBoundary';
import ResourceFulfillmentDisplay from './ResourceFulfillmentDisplay';
import { VerificationModal } from './VerificationModal';
import { VerificationAuditRecord } from './VerificationAuditRecord';
import SuggestedMatchesPanel from './SuggestedMatchesPanel';
import { DispatchRequest } from './DispatchLog';
import {
  subscribeToPublic,
  subscribeToRequest,
  subscribeToNotification,
  onReconnect,
} from '../services/socket';

interface ConsoleLayoutProps {
  onDataRefresh?: () => void;
}

export default function ConsoleLayout({ onDataRefresh }: ConsoleLayoutProps) {
  const { user, token } = useAuth();

  const [allRequests, setAllRequests] = useState<DispatchRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Console view switcher: 'dispatch' operations or 'notifications' ledger
  const [consoleView, setConsoleView] = useState<'dispatch' | 'notifications'>('dispatch');
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);

  // Filters shared across map and rail
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Viewport breakpoint state: only mount one Leaflet map instance at any time
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Synchronized selection between map and rail
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // Action processing state
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verifyingRequest, setVerifyingRequest] = useState<DispatchRequest | null>(null);

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

  // Fetch unread notification count for the console status tab
  const fetchUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.unreadCount === 'number') {
          setUnreadNotificationCount(data.unreadCount);
        }
      }
    } catch {
      // silent background failure
    }
  }, [token]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 15000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Real-time synchronization for operations console (map pins and rail rows)
  useEffect(() => {
    // 1. Listen for new requests submitted to the platform
    const subCreated = subscribeToPublic<{ request: DispatchRequest }>(
      'request:created',
      (payload) => {
        if (!payload?.request) return;
        const newReq = payload.request;
        setAllRequests((prev) => {
          const exists = prev.some(
            (r) =>
              r.requestId === newReq.requestId ||
              ((r as any)._id && (r as any)._id === (newReq as any)._id)
          );
          if (exists) {
            return prev.map((r) =>
              r.requestId === newReq.requestId ? { ...r, ...newReq } : r
            );
          }
          return [newReq, ...prev];
        });
      }
    );

    // 2. Listen for status transitions (verify, claim, resolve, confirm)
    const subUpdated = subscribeToPublic<{ request: DispatchRequest }>(
      'request:updated',
      (payload) => {
        if (!payload?.request) return;
        const updated = payload.request;
        setAllRequests((prev) =>
          prev.map((r) => {
            if (
              r.requestId === updated.requestId ||
              ((r as any)._id && (r as any)._id === (updated as any)._id)
            ) {
              return {
                ...r,
                ...updated,
                location: {
                  ...r.location,
                  ...updated.location,
                },
              };
            }
            return r;
          })
        );
      }
    );

    // 3. Listen for incoming notifications to update badge count immediately
    const subNotif = subscribeToNotification<{ notification: any }>(
      (payload) => {
        if (payload?.notification && !payload.notification.isRead) {
          setUnreadNotificationCount((prev) => prev + 1);
        }
        fetchUnreadCount();
      }
    );

    // 4. Handle disconnect / reconnect: resync list from REST API once to avoid missed events
    const subReconnect = onReconnect(() => {
      console.log('[ConsoleLayout] Socket reconnected. Resyncing request list via REST...');
      fetchRequests();
      fetchUnreadCount();
    });

    return () => {
      subCreated.unsubscribe();
      subUpdated.unsubscribe();
      subNotif.unsubscribe();
      subReconnect.unsubscribe();
    };
  }, [fetchRequests, fetchUnreadCount, token]);

  // Listen for request-scoped updates when a specific request is open in the detail drawer
  useEffect(() => {
    if (!selectedRequestId) return;

    const subReq = subscribeToRequest<{ request: DispatchRequest }>(
      selectedRequestId,
      'request:updated',
      (payload) => {
        if (!payload?.request) return;
        const updated = payload.request;
        setAllRequests((prev) =>
          prev.map((r) => {
            if (
              r.requestId === updated.requestId ||
              ((r as any)._id && (r as any)._id === (updated as any)._id)
            ) {
              return {
                ...r,
                ...updated,
                location: {
                  ...r.location,
                  ...updated.location,
                },
              };
            }
            return r;
          })
        );
      }
    );

    return () => {
      subReq.unsubscribe();
    };
  }, [selectedRequestId]);

  // Filter out closed and cancelled requests for active operations console, and apply filters
  const nonClosedRequests = useMemo(() => {
    return allRequests.filter((req) => req.status !== 'closed' && req.status !== 'cancelled');
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
    if (action === 'verify') {
      const targetReq = allRequests.find((r) => r.requestId === id);
      if (targetReq) {
        setVerifyingRequest(targetReq);
      }
      return;
    }

    setActionError(null);
    setActionInProgressId(id);

    try {
      let body: Record<string, any> = {};
      if (action === 'claim') {
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
    user?.role === 'ngo';

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

      {/* Primary Console Switcher */}
      <div className="flex border border-slate-line bg-paper-raised p-1 font-mono text-xs">
        <button
          type="button"
          onClick={() => setConsoleView('dispatch')}
          className={`flex-1 sm:flex-initial sm:px-6 py-2 text-center font-semibold uppercase cursor-pointer transition-colors ${
            consoleView === 'dispatch'
              ? 'bg-ink text-white shadow-xs'
              : 'text-slate hover:text-ink'
          }`}
        >
          Dispatch Desk
        </button>
        <button
          type="button"
          onClick={() => setConsoleView('notifications')}
          className={`flex-1 sm:flex-initial sm:px-6 py-2 text-center font-semibold uppercase cursor-pointer transition-colors flex items-center justify-center gap-2 ${
            consoleView === 'notifications'
              ? 'bg-ink text-white shadow-xs'
              : 'text-slate hover:text-ink'
          }`}
        >
          <span>Notifications</span>
          <span
            className={`font-mono text-[11px] px-1.5 py-0.5 border ${
              consoleView === 'notifications'
                ? 'bg-ink text-white border-white/30'
                : 'bg-paper text-ink border-slate-line'
            }`}
          >
            [{unreadNotificationCount < 10 ? `0${unreadNotificationCount}` : unreadNotificationCount}]
          </span>
        </button>
      </div>

      {consoleView === 'notifications' ? (
        <NotificationList
          onUnreadCountChange={setUnreadNotificationCount}
          onSelectRequest={(reqId) => {
            setSelectedRequestId(reqId);
            setConsoleView('dispatch');
          }}
        />
      ) : (
        <ErrorBoundary fallbackTitle="OPERATIONS CONSOLE COMPONENT ERROR">
          {isDesktop ? (
            /* Desktop View: Side-by-side grid (Only 1 map mounted) */
            <div className="border border-slate-line bg-paper-raised overflow-hidden shadow-xs">
              <div className="grid grid-cols-[380px_1fr] h-[640px]">
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

                  {/* Desktop Floating Inspection Drawer when a request is selected */}
                  {selectedRequest && (
                    <div className="absolute top-4 right-4 z-[1000] w-[360px] max-h-[600px] overflow-y-auto bg-paper-raised border border-slate-line p-4 shadow-md space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-line pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-ink">
                            {selectedRequest.requestId}
                          </span>
                          <span className="font-mono text-[10px] text-slate uppercase bg-paper px-1.5 py-0.5 border border-slate-line">
                            {selectedRequest.category}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedRequestId(null)}
                          className="font-mono text-xs text-slate hover:text-ink px-1.5 py-0.5 border border-slate-line rounded-[3px] hover:bg-paper cursor-pointer"
                          title="Close panel"
                        >
                          ✕
                        </button>
                      </div>

                      <div>
                        <StatusChip status={selectedRequest.status} className="text-[10px] py-0.5 px-2" />
                      </div>

                      <p className="text-xs text-ink line-clamp-3 leading-relaxed">
                        {selectedRequest.description}
                      </p>

                      {/* Display revealed caller contact / precise GPS if available */}
                      {selectedRequest.location && selectedRequest.location.preciseLat != null ? (
                        <div className="p-2 bg-paper border border-slate-line font-mono text-[11px] space-y-1">
                          <div className="text-rust font-semibold">
                            GPS: {Number(selectedRequest.location.preciseLat).toFixed(6)}, {Number(selectedRequest.location.preciseLng ?? 0).toFixed(6)}
                          </div>
                          {selectedRequest.contactPhone && (
                            <div className="text-ink">Phone: {selectedRequest.contactPhone}</div>
                          )}
                        </div>
                      ) : (
                        <div className="font-mono text-[11px] text-slate">
                          Location fuzzed (~300m) for citizen privacy
                        </div>
                      )}

                      {/* Verification Audit Record */}
                      {selectedRequest.status !== 'unverified' && (
                        <VerificationAuditRecord requestId={selectedRequest.requestId} compact />
                      )}

                      {/* Resource Allocation & Fulfillment Display */}
                      <ResourceFulfillmentDisplay requestId={selectedRequest.requestId} compact />

                      {/* Suggested Matches (Ranked Candidates) */}
                      {selectedRequest.status === 'verified' && (
                        <div className="pt-2 border-t border-slate-line">
                          <SuggestedMatchesPanel requestId={selectedRequest.requestId} />
                        </div>
                      )}

                      {/* Contextual Action Buttons */}
                      <div className="pt-2 border-t border-slate-line space-y-2">
                        {selectedRequest.status === 'unverified' && isAdmin && (
                          <button
                            type="button"
                            onClick={() => setVerifyingRequest(selectedRequest)}
                            className="w-full bg-ink text-white font-sans text-xs font-semibold py-2 px-3 rounded-[3px] hover:bg-ink-soft cursor-pointer"
                          >
                            Verify this report
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

                        {/* Direct link to Comms log & Evidence view */}
                        <Link
                          to={`/track?id=${encodeURIComponent(selectedRequest.requestId)}`}
                          className="block text-center font-mono text-[11px] text-slate hover:text-ink pt-1 underline"
                        >
                          Open Comms Log & Evidence details
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Mobile View: Render tab switcher and strictly ONLY active tab */
            <div className="space-y-2">
              <div className="flex border border-slate-line bg-paper-raised p-1 font-mono text-xs">
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

              <div className="border border-slate-line bg-paper-raised overflow-hidden shadow-xs">
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
                      <div className="absolute bottom-2 left-2 right-2 z-[1000] max-h-[380px] overflow-y-auto bg-paper-raised border border-slate-line p-3.5 shadow-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-ink">
                            {selectedRequest.requestId}
                          </span>
                          <button
                            type="button"
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

                        {/* Verification Audit Record */}
                        {selectedRequest.status !== 'unverified' && (
                          <VerificationAuditRecord requestId={selectedRequest.requestId} compact />
                        )}

                        {/* Resource Allocation & Fulfillment Display */}
                        <ResourceFulfillmentDisplay requestId={selectedRequest.requestId} compact />

                        {/* Suggested Matches (Ranked Candidates) */}
                        {selectedRequest.status === 'verified' && (
                          <div className="pt-2 border-t border-slate-line">
                            <SuggestedMatchesPanel requestId={selectedRequest.requestId} />
                          </div>
                        )}

                        <div className="pt-1 space-y-1">
                          {selectedRequest.status === 'unverified' && isAdmin && (
                            user &&
                            selectedRequest.createdBy &&
                            (typeof selectedRequest.createdBy === 'object'
                              ? selectedRequest.createdBy._id
                              : selectedRequest.createdBy) === user.id ? (
                              <div className="w-full text-center font-mono text-[11px] text-slate italic py-1.5 bg-paper border border-slate-line">
                                Own submission (Awaiting peer verify)
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setVerifyingRequest(selectedRequest)}
                                className="w-full bg-ink text-white font-sans text-xs font-semibold py-2 px-3 rounded-[3px] hover:bg-ink-soft cursor-pointer"
                              >
                                Verify this report
                              </button>
                            )
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

                          <Link
                            to={`/track?id=${encodeURIComponent(selectedRequest.requestId)}`}
                            className="block text-center font-mono text-[11px] text-slate hover:text-ink pt-1 underline"
                          >
                            Open Comms & Evidence
                          </Link>
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
                          setMobileTab('map');
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
          )}
        </ErrorBoundary>
      )}

      {verifyingRequest && (
        <VerificationModal
          requestId={verifyingRequest.requestId}
          category={verifyingRequest.category}
          description={verifyingRequest.description}
          isOpen={true}
          onClose={() => setVerifyingRequest(null)}
          onSuccess={async () => {
            await fetchRequests();
            if (onDataRefresh) onDataRefresh();
          }}
        />
      )}
    </div>
  );
}
