import { useState, useEffect, FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import StatusChip from '../components/StatusChip';

interface RequestDetails {
  _id: string;
  requestId: string;
  category: string;
  description: string;
  location: {
    publicLat: number;
    publicLng: number;
    preciseLat?: number;
    preciseLng?: number;
  };
  status: 'unverified' | 'verified' | 'in_progress' | 'resolved' | 'closed';
  contactPhone?: string;
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

const LIFECYCLE_STAGES = [
  { num: '01', key: 'unverified', label: 'Unverified' },
  { num: '02', key: 'verified', label: 'Verified' },
  { num: '03', key: 'in_progress', label: 'In Progress' },
  { num: '04', key: 'resolved', label: 'Resolved' },
  { num: '05', key: 'closed', label: 'Closed' },
];

export default function TrackRequestPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, user } = useAuth();

  const [searchId, setSearchId] = useState(searchParams.get('id') || '');
  const [requestData, setRequestData] = useState<RequestDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [confirmPhone, setConfirmPhone] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmSuccessMsg, setConfirmSuccessMsg] = useState<string | null>(null);

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
    const idFromQuery = searchParams.get('id');
    if (idFromQuery) {
      setSearchId(idFromQuery);
      fetchRequest(idFromQuery);
    }
  }, [searchParams]);

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

  const getStageIndex = (status: string) => {
    return LIFECYCLE_STAGES.findIndex((s) => s.key === status);
  };

  const currentStageIndex = requestData ? getStageIndex(requestData.status) : -1;

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
            <div className="flex border border-slate-line bg-paper-raised">
              {LIFECYCLE_STAGES.map((stage, idx) => {
                const isCurrent = stage.key === requestData.status;
                const isPassed = idx < currentStageIndex;

                return (
                  <div
                    key={stage.key}
                    className={`flex-1 p-3 sm:p-4 border-r border-slate-line last:border-r-0 transition-colors ${
                      isCurrent
                        ? 'bg-teal-bg'
                        : isPassed
                        ? 'bg-[#F2F5F3]'
                        : 'bg-paper-raised opacity-70'
                    }`}
                  >
                    <div
                      className={`font-mono text-[11px] ${
                        isCurrent ? 'text-teal font-bold' : 'text-slate'
                      }`}
                    >
                      {stage.num}
                    </div>
                    <div
                      className={`text-xs sm:text-sm font-semibold mt-1 ${
                        isCurrent ? 'text-teal' : isPassed ? 'text-ink' : 'text-slate'
                      }`}
                    >
                      {stage.label}
                    </div>
                  </div>
                );
              })}
            </div>
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

            {/* Closed Notice */}
            {requestData.status === 'closed' && (
              <div className="p-4 bg-paper border border-slate-line border-l-[3px] border-l-slate">
                <div className="font-mono text-xs text-slate font-semibold">
                  CLOSED ARCHIVE: This emergency request has been fully resolved and confirmed by the requester.
                </div>
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
          </div>
        </div>
      )}
    </div>
  );
}
