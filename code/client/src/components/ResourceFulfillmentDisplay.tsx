import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeToRequest, onReconnect } from '../services/socket';

export interface ResourceItemRequirement {
  _id: string;
  resource: {
    _id: string;
    name: string;
    category?: string;
    unit?: string;
  };
  quantityRequested: number;
  quantityAllocated: number;
  status: 'pending' | 'partially_allocated' | 'fully_allocated';
}

interface ResourceFulfillmentDisplayProps {
  requestId: string;
  className?: string;
  compact?: boolean;
  contactPhone?: string;
}

export default function ResourceFulfillmentDisplay({
  requestId,
  className = '',
  compact = false,
  contactPhone,
}: ResourceFulfillmentDisplayProps) {
  const { user, token } = useAuth();

  const [resources, setResources] = useState<ResourceItemRequirement[]>([]);
  const [allocationStatus, setAllocationStatus] = useState<string>('unallocated');
  const [totalRequired, setTotalRequired] = useState<number>(0);
  const [totalAllocated, setTotalAllocated] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Quick allocation contribution state
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [selectedResourceId, setSelectedResourceId] = useState<string>('');
  const [contributeQty, setContributeQty] = useState<string>('');
  const [contributeNotes, setContributeNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Request additional supplies state (for citizens updating their request)
  const [isRequestSupplyOpen, setIsRequestSupplyOpen] = useState<boolean>(false);
  const [catalogResources, setCatalogResources] = useState<
    Array<{ _id: string; name: string; category: string; unit: string }>
  >([]);
  const [targetReqResourceId, setTargetReqResourceId] = useState<string>('');
  const [reqSupplyQty, setReqSupplyQty] = useState<string>('5');
  const [isRequestingSupply, setIsRequestingSupply] = useState<boolean>(false);
  const [requestSupplyError, setRequestSupplyError] = useState<string | null>(null);
  const [requestSupplySuccess, setRequestSupplySuccess] = useState<string | null>(null);

  const canContribute =
    user?.role === 'resource_provider' ||
    user?.role === 'ngo';

  // Load catalog resources for the request supplies picker
  useEffect(() => {
    fetch('/api/resources')
      .then((res) => res.json())
      .then((data) => {
        if (data.resources && Array.isArray(data.resources)) {
          setCatalogResources(data.resources);
          if (data.resources.length > 0) {
            setTargetReqResourceId(data.resources[0]._id);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Fetch allocation data via REST
  const fetchAllocation = useCallback(async () => {
    if (!requestId) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/allocation`);
      if (!res.ok) {
        // Fallback check to /resources if allocation endpoint returns 404
        const resList = await fetch(`/api/requests/${requestId}/resources`);
        if (resList.ok) {
          const listData = await resList.json();
          const items: ResourceItemRequirement[] = listData.resources || [];
          setResources(items);
          const reqSum = items.reduce((acc, r) => acc + r.quantityRequested, 0);
          const allocSum = items.reduce((acc, r) => acc + r.quantityAllocated, 0);
          setTotalRequired(reqSum);
          setTotalAllocated(allocSum);
          setAllocationStatus(
            items.length === 0
              ? 'unallocated'
              : allocSum >= reqSum
              ? 'fully_allocated'
              : allocSum > 0
              ? 'partially_allocated'
              : 'unallocated'
          );
          if (items.length > 0 && !selectedResourceId) {
            setSelectedResourceId(items[0].resource._id);
          }
          return;
        }
        throw new Error('Could not load resource fulfillment status');
      }

      const data = await res.json();
      setAllocationStatus(data.allocationStatus || 'unallocated');
      setTotalRequired(data.totalRequired || 0);
      setTotalAllocated(data.totalAllocated || 0);
      const items: ResourceItemRequirement[] = data.resources || [];
      setResources(items);

      if (items.length > 0 && !selectedResourceId) {
        setSelectedResourceId(items[0].resource._id);
      }
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Error fetching allocation');
    } finally {
      setIsLoading(false);
    }
  }, [requestId, selectedResourceId]);

  useEffect(() => {
    fetchAllocation();

    // 1. Subscribe to real-time allocation updates for this request room
    const subAlloc = subscribeToRequest<any>(
      requestId,
      'allocation:updated',
      (payload) => {
        if (!payload) return;

        // Immediate in-memory state update from broadcast payload
        if (payload.resources && Array.isArray(payload.resources)) {
          setResources(payload.resources);
        } else if (payload.requestResource) {
          setResources((prev) => {
            const exists = prev.some((r) => r._id === payload.requestResource._id);
            if (exists) {
              return prev.map((r) =>
                r._id === payload.requestResource._id ? { ...r, ...payload.requestResource } : r
              );
            }
            return [...prev, payload.requestResource];
          });
        }

        if (typeof payload.overallAllocation === 'string') {
          setAllocationStatus(payload.overallAllocation);
        }
        if (typeof payload.totalRequired === 'number') {
          setTotalRequired(payload.totalRequired);
        }
        if (typeof payload.totalAllocated === 'number') {
          setTotalAllocated(payload.totalAllocated);
        }

        // Authoritative background synchronization
        fetchAllocation();
      }
    );

    // 2. Resync via REST if connection drops and reconnects
    const subReconnect = onReconnect(() => {
      fetchAllocation();
    });

    return () => {
      subAlloc.unsubscribe();
      subReconnect.unsubscribe();
    };
  }, [requestId, fetchAllocation]);

  // Handle contribution submission
  const handleContribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedResourceId || !contributeQty) return;

    const qty = Number(contributeQty);
    if (isNaN(qty) || qty <= 0) {
      setSubmitError('Quantity must be a positive number');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const res = await fetch(`/api/requests/${requestId}/allocate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resourceId: selectedResourceId,
          quantity: qty,
          notes: contributeNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to allocate resource');
      }

      setSubmitSuccess(data.message || `Successfully allocated ${qty} units.`);
      setContributeQty('');
      setContributeNotes('');
      setIsFormOpen(false);

      // Re-fetch immediately to confirm
      await fetchAllocation();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error contributing resource');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle citizen requesting additional supplies for this emergency request
  const handleRequestSupply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetReqResourceId || !reqSupplyQty) return;

    const qty = Number(reqSupplyQty);
    if (isNaN(qty) || qty <= 0) {
      setRequestSupplyError('Quantity must be a positive integer.');
      return;
    }

    setIsRequestingSupply(true);
    setRequestSupplyError(null);
    setRequestSupplySuccess(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/requests/${encodeURIComponent(requestId)}/resources`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resourceId: targetReqResourceId,
          quantityRequested: qty,
          contactPhone: contactPhone || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to attach supply requirement.');
      }

      setRequestSupplySuccess('Additional supply requirement logged for this request.');
      setIsRequestSupplyOpen(false);
      setReqSupplyQty('5');

      // Refresh allocation data
      await fetchAllocation();
    } catch (err: unknown) {
      setRequestSupplyError(err instanceof Error ? err.message : 'Error attaching supply requirement.');
    } finally {
      setIsRequestingSupply(false);
    }
  };

  const getStatusBadge = () => {
    if (resources.length === 0) {
      return (
        <span className="font-mono text-[10px] bg-paper-raised text-slate border border-slate-line px-1.5 py-0.5">
          NO REQUIREMENTS LOGGED
        </span>
      );
    }
    switch (allocationStatus) {
      case 'fully_allocated':
        return (
          <span className="font-mono text-[10px] bg-teal/10 text-teal border border-teal/40 px-1.5 py-0.5 font-semibold">
            FULLY ALLOCATED
          </span>
        );
      case 'partially_allocated':
        return (
          <span className="font-mono text-[10px] bg-amber/10 text-amber border border-amber/40 px-1.5 py-0.5 font-semibold">
            PARTIALLY ALLOCATED
          </span>
        );
      default:
        return (
          <span className="font-mono text-[10px] bg-rust/10 text-rust border border-rust/40 px-1.5 py-0.5 font-semibold">
            UNALLOCATED
          </span>
        );
    }
  };

  return (
    <div className={`bg-paper border border-slate-line ${compact ? 'p-2 space-y-2 text-xs' : 'p-3 space-y-2.5'} ${className}`}>
      {/* Header & Status Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-line pb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold text-ink uppercase tracking-wider">
            Supply Allocation & Fulfillment
          </span>
          {isLoading && (
            <span className="font-mono text-[10px] text-slate animate-pulse">Syncing...</span>
          )}
        </div>
        <div>{getStatusBadge()}</div>
      </div>

      {fetchError && (
        <div className="p-2 bg-paper-raised border border-rust/30 font-mono text-[11px] text-rust">
          {fetchError}
        </div>
      )}

      {submitSuccess && (
        <div className="p-2 bg-teal/10 border border-teal/40 font-mono text-[11px] text-teal font-medium">
          {submitSuccess}
        </div>
      )}

      {/* Aggregate metric */}
      {resources.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between font-mono text-xs text-ink">
            <span className="text-slate">Overall Fulfillment:</span>
            <span className="font-semibold">
              {totalAllocated} of {totalRequired} total units received
            </span>
          </div>

          {/* Itemized breakdown per required resource */}
          <div className="space-y-2 divide-y divide-slate-line/50 pt-1">
            {resources.map((item) => {
              const unit = item.resource?.unit || 'units';
              const percent = Math.min(
                100,
                Math.round((item.quantityAllocated / Math.max(1, item.quantityRequested)) * 100)
              );
              const isComplete = item.quantityAllocated >= item.quantityRequested;

              return (
                <div key={item._id} className="pt-2 first:pt-0 space-y-1">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-medium text-ink">
                      {item.resource?.name || 'Supply item'}
                    </span>
                    <span className="text-slate">
                      <strong className="text-ink">{item.quantityAllocated}</strong> of{' '}
                      {item.quantityRequested} {unit} received ({percent}%)
                    </span>
                  </div>

                  {/* Visual progress bar */}
                  <div className="w-full bg-paper-raised border border-slate-line h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isComplete ? 'bg-teal' : 'bg-ink'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="font-mono text-[11px] text-slate py-1">
          No specific material resources requested for this report.
        </div>
      )}

      {/* Citizen / Requester: Request Additional Supplies for this Ticket */}
      {!compact && (
        <div className="pt-2 border-t border-slate-line">
          {requestSupplySuccess && (
            <div className="p-2 mb-2 bg-teal/10 border border-teal/40 font-mono text-[11px] text-teal font-medium">
              {requestSupplySuccess}
            </div>
          )}

          {!isRequestSupplyOpen ? (
            <button
              type="button"
              onClick={() => {
                setIsRequestSupplyOpen(true);
                setRequestSupplySuccess(null);
                setRequestSupplyError(null);
              }}
              className="w-full font-mono text-[11px] text-ink border border-slate-line bg-paper-raised hover:bg-white hover:border-ink py-1.5 px-2 rounded-[2px] transition-colors cursor-pointer uppercase text-center"
            >
              + Request Additional Supplies For This Report
            </button>
          ) : (
            <form
              onSubmit={handleRequestSupply}
              className="p-2.5 bg-paper-raised border border-slate-line space-y-2 font-mono text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink uppercase text-[10px]">
                  Add Material Need To Emergency Report
                </span>
                <button
                  type="button"
                  onClick={() => setIsRequestSupplyOpen(false)}
                  className="text-slate hover:text-ink text-[11px] cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {requestSupplyError && (
                <div className="p-1.5 bg-rust/10 border border-rust/40 text-rust text-[10px]">
                  {requestSupplyError}
                </div>
              )}

              <div>
                <label className="block text-[10px] text-slate uppercase mb-1">
                  Required Resource Type
                </label>
                <select
                  value={targetReqResourceId}
                  onChange={(e) => setTargetReqResourceId(e.target.value)}
                  required
                  className="w-full bg-white border border-slate-line focus:border-ink p-1.5 text-xs text-ink outline-none"
                >
                  {catalogResources.map((res) => (
                    <option key={res._id} value={res._id}>
                      {res.name} [{res.category.toUpperCase()}] ({res.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate uppercase mb-1">
                  Quantity Required
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={reqSupplyQty}
                  onChange={(e) => setReqSupplyQty(e.target.value)}
                  className="w-full bg-white border border-slate-line focus:border-ink p-1.5 text-xs text-ink outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isRequestingSupply}
                className="w-full bg-ink text-white font-sans text-xs font-semibold py-1.5 rounded-[2px] hover:bg-ink-soft cursor-pointer disabled:opacity-50 mt-1"
              >
                {isRequestingSupply ? 'Logging requirement...' : 'Attach Supply Requirement'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Responder / Resource Provider Quick Allocate Action */}
      {canContribute && resources.length > 0 && (
        <div className="pt-2 border-t border-slate-line">
          {!isFormOpen ? (
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(true);
                setSubmitSuccess(null);
                setSubmitError(null);
              }}
              className="w-full font-mono text-[11px] font-semibold text-ink border border-slate-line bg-paper-raised hover:bg-white hover:border-ink py-1.5 px-2 rounded-[2px] transition-colors cursor-pointer uppercase text-center"
            >
              + Contribute Supply Units
            </button>
          ) : (
            <form onSubmit={handleContribute} className="p-2.5 bg-paper-raised border border-slate-line space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink uppercase text-[10px]">
                  Allocate Resource to Mission
                </span>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="text-slate hover:text-ink text-[11px] cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {submitError && (
                <div className="p-1.5 bg-rust/10 border border-rust/40 text-rust text-[10px]">
                  {submitError}
                </div>
              )}

              <div>
                <label className="block text-[10px] text-slate uppercase mb-1">
                  Target Supply Requirement
                </label>
                <select
                  value={selectedResourceId}
                  onChange={(e) => setSelectedResourceId(e.target.value)}
                  required
                  className="w-full bg-white border border-slate-line focus:border-ink p-1.5 text-xs text-ink outline-none"
                >
                  {resources.map((item) => (
                    <option key={item.resource._id} value={item.resource._id}>
                      {item.resource.name} (Need: {Math.max(0, item.quantityRequested - item.quantityAllocated)} {item.resource.unit || 'units'} left)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <div className="w-1/3">
                  <label className="block text-[10px] text-slate uppercase mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={contributeQty}
                    onChange={(e) => setContributeQty(e.target.value)}
                    placeholder="e.g. 2"
                    className="w-full bg-white border border-slate-line focus:border-ink p-1.5 text-xs text-ink outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-slate uppercase mb-1">Note (Optional)</label>
                  <input
                    type="text"
                    value={contributeNotes}
                    onChange={(e) => setContributeNotes(e.target.value)}
                    placeholder="Depot batch # or delivery ETA"
                    className="w-full bg-white border border-slate-line focus:border-ink p-1.5 text-xs text-ink outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-ink text-white font-sans text-xs font-semibold py-1.5 rounded-[2px] hover:bg-ink-soft cursor-pointer disabled:opacity-50 mt-1"
              >
                {isSubmitting ? 'Allocating...' : 'Confirm Supply Allocation'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
