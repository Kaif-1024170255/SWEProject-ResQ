import { useAuth } from '../context/AuthContext';
import StatusChip from './StatusChip';
import { DispatchRequest } from './DispatchLog';

interface ConsoleRailProps {
  requests: DispatchRequest[];
  selectedRequestId: string | null;
  onSelectRequest: (id: string | null) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  categoryFilter: string;
  setCategoryFilter: (category: string) => void;
  onAction: (id: string, action: 'verify' | 'claim' | 'resolve') => void;
  actionInProgressId: string | null;
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

export default function ConsoleRail({
  requests,
  selectedRequestId,
  onSelectRequest,
  statusFilter,
  setStatusFilter,
  categoryFilter,
  setCategoryFilter,
  onAction,
  actionInProgressId,
  onRefresh,
  isLoading,
}: ConsoleRailProps) {
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const isResponder =
    user?.role === 'volunteer' ||
    user?.role === 'ngo';

  return (
    <div className="flex flex-col h-full border-r border-slate-line bg-paper-raised overflow-hidden">
      {/* Rail Head matching design-reference.html §07 */}
      <div className="p-3.5 border-b border-slate-line flex items-center justify-between bg-paper shrink-0">
        <div className="font-mono text-xs font-semibold text-slate uppercase tracking-wider">
          Active Dispatch · {requests.length} {requests.length === 1 ? 'Request' : 'Requests'}
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="text-[11px] font-mono text-slate hover:text-ink cursor-pointer uppercase disabled:opacity-50"
        >
          {isLoading ? 'Syncing...' : 'Refresh'}
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3 border-b border-slate-line space-y-2 bg-paper-raised shrink-0">
        {/* Category select */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-slate uppercase">Category</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white border border-slate-line px-2 py-1 text-xs text-ink font-sans outline-none rounded-[2px]"
          >
            <option value="all">ALL CATEGORIES</option>
            <option value="medical">Medical</option>
            <option value="rescue">Rescue</option>
            <option value="supplies">Supplies</option>
            <option value="shelter">Shelter</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Status Pills */}
        <div className="flex flex-wrap gap-1 pt-1">
          {['all', 'unverified', 'verified', 'in_progress', 'resolved'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2 py-0.5 text-[11px] font-mono border rounded-[2px] cursor-pointer uppercase transition-colors ${
                statusFilter === st
                  ? 'bg-ink text-white border-ink font-semibold'
                  : 'bg-paper text-slate border-slate-line hover:border-slate'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Request Items Rail List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-line">
        {requests.length === 0 ? (
          <div className="p-8 text-center text-slate font-sans text-xs">
            No active requests match the selected filters.
          </div>
        ) : (
          requests.map((req) => {
            const isSelected = req.requestId === selectedRequestId;
            const isClaimant = user && req.claimedBy && req.claimedBy._id === user.id;
            const isBusy = actionInProgressId === req.requestId;

            return (
              <div
                key={req._id}
                onClick={() => onSelectRequest(isSelected ? null : req.requestId)}
                className={`p-3.5 transition-colors cursor-pointer text-left ${
                  isSelected
                    ? 'bg-[#EEF1EE] border-l-[3px] border-l-ink'
                    : 'hover:bg-paper/70'
                }`}
              >
                {/* Header row: ID, Category & Timestamp */}
                <div className="flex items-center justify-between font-mono text-xs mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-ink">{req.requestId}</span>
                    <span className="text-[10px] text-slate uppercase bg-paper px-1.5 py-0.5 border border-slate-line">
                      {req.category}
                    </span>
                  </div>
                  <span className="text-slate text-[11px]">
                    {formatRelativeTime(req.createdAt)}
                  </span>
                </div>

                {/* Description Preview */}
                <div className="text-xs text-ink line-clamp-2 leading-relaxed mb-2">
                  {req.description}
                </div>

                {/* Claim status indicator if active */}
                {req.claimedBy && (
                  <div className="text-[11px] font-mono text-teal mb-2">
                    Claimed by: {req.claimedBy.name}
                  </div>
                )}

                {/* Status Chip + Contextual Action Row */}
                <div className="flex items-center justify-between pt-1 gap-2">
                  <StatusChip status={req.status} className="text-[10px] py-0.5 px-2" />

                  <div onClick={(e) => e.stopPropagation()}>
                    {req.status === 'unverified' && isAdmin && (
                      user && req.createdBy && req.createdBy._id === user.id ? (
                        <span className="font-mono text-[10px] text-slate italic px-1" title="Cannot verify own submission">
                          Own
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAction(req.requestId, 'verify')}
                          disabled={isBusy}
                          className="bg-ink text-white font-sans text-xs font-semibold px-2.5 py-1 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
                        >
                          {isBusy ? '...' : 'Verify'}
                        </button>
                      )
                    )}

                    {req.status === 'verified' && isResponder && (
                      <button
                        type="button"
                        onClick={() => onAction(req.requestId, 'claim')}
                        disabled={isBusy}
                        className="bg-ink text-white font-sans text-xs font-semibold px-2.5 py-1 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
                      >
                        {isBusy ? '...' : 'Claim this request'}
                      </button>
                    )}

                    {req.status === 'in_progress' && (isClaimant || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => onAction(req.requestId, 'resolve')}
                        disabled={isBusy}
                        className="bg-transparent text-ink font-sans text-xs font-semibold px-2.5 py-1 rounded-[3px] border border-ink hover:bg-paper cursor-pointer disabled:opacity-50"
                      >
                        {isBusy ? '...' : 'Mark resolved'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
