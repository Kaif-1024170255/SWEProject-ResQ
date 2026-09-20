import { useState, useEffect, FormEvent } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LifecycleStrip from '../components/LifecycleStrip';
import StatusChip from '../components/StatusChip';
import RequestCommsLog from '../components/RequestCommsLog';
import EvidenceAttachmentList from '../components/EvidenceAttachmentList';
import ResourceFulfillmentDisplay from '../components/ResourceFulfillmentDisplay';
import { VerificationAuditRecord } from '../components/VerificationAuditRecord';
import { subscribeToPublic } from '../services/socket';

interface RequestDetails {
  _id: string;
  requestId: string;
  category: string;
  description: string;
  status: 'unverified' | 'verified' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
  location: {
    publicLat: number;
    publicLng: number;
    preciseLat?: number;
    preciseLng?: number;
  };
  contactPhone?: string;
  createdBy?: {
    _id?: string;
    name?: string;
    role?: string;
  } | string;
  createdAt: string;
  updatedAt: string;
  claimedBy?: {
    name: string;
    role: string;
  };
  statusHistory?: Array<{
    status: string;
    changedAt: string;
    note?: string;
  }>;
}

export default function TrackRequestPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { id: routeId } = useParams();
  const { token, user } = useAuth();

  const [searchId, setSearchId] = useState(routeId || searchParams.get('id') || '');
  const [requestData, setRequestData] = useState<RequestDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [confirmPhone, setConfirmPhone] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmSuccessMsg, setConfirmSuccessMsg] = useState<string | null>(null);

  // Cancellation / withdrawal state
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelPhone, setCancelPhone] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const fetchRequest = async (reqId: string) => {
    if (!reqId.trim()) return;
    setIsLoading(true);
    setErrorMessage(null);
    setConfirmSuccessMsg(null);

    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/requests/${encodeURIComponent(reqId.trim())}`, {
        headers,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Emergency request not found.');
      }

      setRequestData(data.request);
    } catch (err: unknown) {
      setRequestData(null);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Could not retrieve request. Check the tracking identifier.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const targetId = routeId || searchParams.get('id');
    if (targetId) {
      setSearchId(targetId);
      fetchRequest(targetId);
    }
  }, [routeId, searchParams]);

  // Real-time synchronization for currently tracked request
  useEffect(() => {
    if (!requestData?.requestId) return;

    const sub = subscribeToPublic<{ request: RequestDetails }>(
      'request:updated',
      (payload) => {
        if (
          payload?.request &&
          payload.request.requestId === requestData.requestId
        ) {
          setRequestData((prev) => (prev ? { ...prev, ...payload.request } : prev));
        }
      }
    );

    return () => sub.unsubscribe();
  }, [requestData?.requestId]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!searchId.trim()) return;
    setSearchParams({ id: searchId.trim() });
    fetchRequest(searchId);
  };

  const handleConfirmResolution = async (e: FormEvent) => {
    e.preventDefault();
    if (!requestData) return;

    setIsConfirming(true);
    setErrorMessage(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/requests/${requestData.requestId}/confirm`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          contactPhone: confirmPhone.trim() || undefined,
          note: 'Resolution verified by requester',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to confirm resolution.');
      }

      setConfirmSuccessMsg(data.message);
      // Refresh request data to show closed status
      fetchRequest(requestData.requestId);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to confirm resolution.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancelRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!requestData) return;

    setIsCancelling(true);
    setCancelError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const phone = cancelPhone.trim() || confirmPhone.trim() || requestData.contactPhone;
      const payload: Record<string, string> = {};
      if (phone) payload.contactPhone = phone;
      if (cancelReason.trim()) payload.reason = cancelReason.trim();

      const res = await fetch(`/api/requests/${encodeURIComponent(requestData.requestId)}/cancel`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to withdraw emergency request.');
      }

      setShowCancelModal(false);
      setConfirmSuccessMsg('Request has been withdrawn.');
      fetchRequest(requestData.requestId);
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : 'Error withdrawing request.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="max-w-[840px] mx-auto px-4 sm:px-8 py-12">
      {/* Header Context */}
      <div className="flex items-center justify-between border-b border-slate-line pb-4 mb-8">
        <div>
          <div className="font-mono text-xs text-slate tracking-wide mb-1">
            resQ / PUBLIC VERIFICATION DESK
          </div>
          <h1 className="text-3xl font-bold text-ink">
            Track Emergency Request
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/submit"
            className="font-mono text-xs text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper"
          >
            Submit new request
          </Link>
          {user ? (
            <Link
              to="/dashboard"
              className="font-mono text-xs text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper"
            >
              Console
            </Link>
          ) : (
            <Link
              to="/login"
              className="font-mono text-xs text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper"
            >
              Responder login
            </Link>
          )}
        </div>
      </div>

      {/* Lookup Form */}
      <div className="bg-paper-raised border border-slate-line p-6 mb-8">
        <form onSubmit={handleSearchSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono mb-1.5">
              Request Identifier
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="e.g. REQ-2026-004821"
                className="flex-1 bg-white border border-slate-line focus:border-ink rounded-[3px] font-mono px-3 py-2 text-sm text-ink outline-none uppercase"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="bg-ink text-white font-sans text-xs font-semibold px-5 py-2.5 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Searching...' : 'Check status'}
              </button>
            </div>
            <div className="font-mono text-[11px] text-slate mt-1">
              Enter the exact tracking ID provided when the request was submitted.
            </div>
          </div>
        </form>
      </div>

      {/* Error notification */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust">
          <div className="font-mono text-xs text-rust font-semibold">
            STATUS INQUIRY ERROR: {errorMessage}
          </div>
        </div>
      )}

      {/* Success notification */}
      {confirmSuccessMsg && (
        <div className="mb-6 p-4 bg-paper-raised border border-slate-line border-l-[3px] border-l-teal">
          <div className="font-mono text-xs text-teal font-semibold">
            {confirmSuccessMsg}
          </div>
        </div>
      )}

      {/* Request Details View */}
      {requestData && (
        <div className="space-y-8">
          {/* 5-Stage Lifecycle Indicator per DESIGN_SYSTEM.md §05 */}
          <div>
            <div className="font-mono text-xs text-slate uppercase tracking-wider mb-2">
              Lifecycle Progression
            </div>
            <LifecycleStrip currentStatus={requestData.status} />
          </div>

          {/* Details Card */}
          <div className="bg-paper-raised border border-slate-line p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-line pb-4">
              <div>
                <span className="font-mono text-xs text-slate uppercase">Tracking Identifier</span>
                <div className="font-mono text-2xl font-bold text-ink">
                  {requestData.requestId}
                </div>
              </div>
              <div>
                <StatusChip status={requestData.status} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="text-slate uppercase block mb-1">Category</span>
                <span className="text-ink font-semibold uppercase">{requestData.category}</span>
              </div>
              <div>
                <span className="text-slate uppercase block mb-1">Submitted Timestamp</span>
                <span className="text-ink">{new Date(requestData.createdAt).toLocaleString()}</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-mono text-slate uppercase block mb-1.5">
                Situation Description
              </span>
              <p className="p-3 bg-paper border border-slate-line text-sm text-ink leading-relaxed">
                {requestData.description}
              </p>
            </div>

            {/* If request is in_progress and has a claimant */}
            {requestData.status === 'in_progress' && requestData.claimedBy && (
              <div className="p-3 bg-paper border border-slate-line border-l-[3px] border-l-ink text-xs font-mono">
                <span className="text-ink font-semibold">Active Response Unit: </span>
                <span className="text-slate">
                  This request has been claimed by {requestData.claimedBy.name} ({requestData.claimedBy.role}). Assistance is en route or in progress.
                </span>
              </div>
            )}

            {/* Requester Action: Confirm Resolution if Resolved */}
            {requestData.status === 'resolved' && (
              <div className="p-6 bg-paper-raised border border-slate-line border-l-[3px] border-l-teal space-y-4">
                <div>
                  <div className="font-mono text-xs text-teal font-semibold uppercase">
                    Assistance Reported Complete
                  </div>
                  <h3 className="text-base font-bold text-ink mt-1">
                    Confirm assistance received
                  </h3>
                  <p className="text-slate text-xs mt-1 leading-relaxed">
                    Responders have marked this emergency request as resolved. If your situation is safe and help was delivered, please confirm to close this request in the dispatch registry.
                  </p>
                </div>

                <form onSubmit={handleConfirmResolution} className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-mono text-slate uppercase mb-1">
                      Contact Phone Number (Used during submission, if applicable)
                    </label>
                    <input
                      type="tel"
                      value={confirmPhone}
                      onChange={(e) => setConfirmPhone(e.target.value)}
                      placeholder="e.g. +91 98765 00000"
                      className="w-full sm:w-80 bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3 py-1.5 text-xs text-ink outline-none"
                    />
                    <div className="font-mono text-[10px] text-slate mt-1">
                      Required for anonymous reports to verify you are the original requester.
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isConfirming}
                    className="bg-ink text-white font-sans text-xs font-semibold px-5 py-2.5 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
                  >
                    {isConfirming ? 'Closing request...' : 'Confirm resolution'}
                  </button>
                </form>
              </div>
            )}

            {/* Requester Action: Withdraw / Cancel Request */}
            {(requestData.status === 'unverified' ||
              requestData.status === 'verified' ||
              requestData.status === 'in_progress' ||
              (user?.role === 'admin' && requestData.status !== 'closed' && requestData.status !== 'cancelled')) && (
              <div className="p-4 bg-paper-raised border border-slate-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-xs font-semibold text-ink uppercase">
                    Assistance No Longer Required?
                  </div>
                  <p className="text-slate text-xs mt-0.5 leading-relaxed">
                    If you evacuated safely, secured private aid, or no longer need emergency assistance, you can withdraw this ticket so response teams can focus on active operations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="bg-paper text-rust border border-rust hover:bg-rust/10 font-sans text-xs font-semibold px-4 py-2 rounded-[3px] cursor-pointer whitespace-nowrap self-start sm:self-auto"
                >
                  Withdraw this request
                </button>
              </div>
            )}

            {/* Closed Notice */}
            {requestData.status === 'closed' && (
              <div className="p-4 bg-paper border border-slate-line border-l-[3px] border-l-slate">
                <div className="font-mono text-xs text-slate font-semibold">
                  CLOSED ARCHIVE: This emergency request has been fully resolved and confirmed by the requester.
                </div>
              </div>
            )}

            {/* Cancelled Notice */}
            {requestData.status === 'cancelled' && (
              <div className="p-4 bg-paper border border-slate-line border-l-[3px] border-l-rust">
                <div className="font-mono text-xs text-rust font-semibold">
                  WITHDRAWN / CANCELLED: This emergency request was withdrawn and is closed on the active dispatch registry.
                </div>
              </div>
            )}

            {/* Structured Verification Audit Record */}
            {requestData.status !== 'unverified' && (
              <div className="pt-4 border-t border-slate-line">
                <VerificationAuditRecord requestId={requestData.requestId} />
              </div>
            )}

            {/* Status History Timeline */}
            {requestData.statusHistory && requestData.statusHistory.length > 0 && (
              <div className="pt-4 border-t border-slate-line">
                <div className="font-mono text-xs text-slate uppercase tracking-wider mb-2">
                  Lifecycle Transition History
                </div>
                <div className="space-y-2">
                  {requestData.statusHistory.map((entry, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-paper border border-slate-line font-mono text-xs flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <StatusChip status={entry.status} className="py-0.5 px-2 text-[10px]" />
                        {entry.note && <span className="text-slate font-sans text-xs">{entry.note}</span>}
                      </div>
                      <div className="text-slate text-[11px]">
                        {new Date(entry.changedAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resource Allocation & Fulfillment Progress */}
            <div className="pt-4 border-t border-slate-line">
              <ResourceFulfillmentDisplay
                requestId={requestData.requestId}
                contactPhone={confirmPhone || requestData.contactPhone}
              />
            </div>

            {/* Communications Log (Triage & Field Ops) */}
            <div className="pt-4 border-t border-slate-line">
              <RequestCommsLog
                requestId={requestData.requestId}
                requestStatus={requestData.status}
                defaultContactPhone={confirmPhone || requestData.contactPhone}
                requestCreatedById={
                  typeof requestData.createdBy === 'object'
                    ? requestData.createdBy?._id
                    : requestData.createdBy
                }
              />
            </div>

            {/* Supporting Evidence & Documents */}
            <div className="pt-4 border-t border-slate-line">
              <EvidenceAttachmentList requestId={requestData.requestId} />
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal / Cancellation Confirmation Modal */}
      {showCancelModal && requestData && (
        <div className="fixed inset-0 z-[2000] bg-ink/60 flex items-center justify-center p-4">
          <div className="bg-paper-raised border border-slate-line max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-line pb-3">
              <div className="font-mono text-xs font-bold text-ink uppercase">
                Withdraw Emergency Ticket [{requestData.requestId}]
              </div>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="font-mono text-xs text-slate hover:text-ink cursor-pointer"
              >
                ✕
              </button>
            </div>

            {cancelError && (
              <div className="p-2.5 bg-paper border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
                {cancelError}
              </div>
            )}

            <form onSubmit={handleCancelRequest} className="space-y-3 text-xs font-sans">
              <p className="text-slate leading-relaxed">
                Are you sure you want to withdraw this emergency request? This will stand down active dispatching, remove the pin from the live operations map, and release any reserved supplies.
              </p>

              {!token && (
                <div>
                  <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                    Contact Phone Number (Used during submission)
                  </label>
                  <input
                    type="tel"
                    value={cancelPhone}
                    onChange={(e) => setCancelPhone(e.target.value)}
                    placeholder="e.g. +91 98765 00000"
                    className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] p-2 text-xs text-ink outline-none font-sans"
                  />
                  <div className="font-mono text-[10px] text-slate mt-1">
                    Required for anonymous reports to verify you are the original requester.
                  </div>
                </div>
              )}

              <div>
                <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                  Reason for Withdrawal (Optional)
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Evacuated safely, family arrived, water receded"
                  className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] p-2 text-xs text-ink outline-none font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-line">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  disabled={isCancelling}
                  className="px-3 py-1.5 border border-slate-line font-mono text-xs text-slate hover:text-ink cursor-pointer disabled:opacity-50"
                >
                  Keep Request Active
                </button>
                <button
                  type="submit"
                  disabled={isCancelling}
                  className="bg-rust text-white font-sans text-xs font-semibold px-4 py-1.5 rounded-[3px] hover:bg-rust/90 cursor-pointer disabled:opacity-50"
                >
                  {isCancelling ? 'Withdrawing...' : 'Confirm Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
