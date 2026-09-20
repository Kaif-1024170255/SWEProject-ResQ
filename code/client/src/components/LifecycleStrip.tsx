
export type LifecycleStageKey =
  | 'unverified'
  | 'verified'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

export interface LifecycleStage {
  num: string;
  key: LifecycleStageKey;
  label: string;
}

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  { num: '01', key: 'unverified', label: 'Unverified' },
  { num: '02', key: 'verified', label: 'Verified' },
  { num: '03', key: 'in_progress', label: 'In Progress' },
  { num: '04', key: 'resolved', label: 'Resolved' },
  { num: '05', key: 'closed', label: 'Closed' },
];

interface LifecycleStripProps {
  currentStatus: LifecycleStageKey;
  onSelectStage?: (stage: LifecycleStageKey) => void;
  interactive?: boolean;
}

export default function LifecycleStrip({
  currentStatus,
  onSelectStage,
  interactive = false,
}: LifecycleStripProps) {
  if (currentStatus === 'cancelled') {
    return (
      <div className="border border-slate-line bg-paper-raised p-3 flex items-center justify-between border-l-[3px] border-l-rust">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-rust uppercase">[CANCELLED]</span>
          <span className="text-xs text-ink">This emergency request was withdrawn / cancelled before completion.</span>
        </div>
        <span className="font-mono text-[11px] text-slate uppercase">TERMINAL ARCHIVE</span>
      </div>
    );
  }

  const currentIndex = LIFECYCLE_STAGES.findIndex((s) => s.key === currentStatus);

  return (
    <div className="flex border border-slate-line bg-paper-raised overflow-x-auto">
      {LIFECYCLE_STAGES.map((stage, idx) => {
        const isCurrent = stage.key === currentStatus;
        const isPassed = currentIndex !== -1 && idx < currentIndex;

        return (
          <button
            key={stage.key}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onSelectStage?.(stage.key)}
            className={`flex-1 min-w-[110px] p-3 sm:p-4 text-left border-r border-slate-line last:border-r-0 transition-colors ${
              interactive ? 'cursor-pointer hover:bg-paper' : 'cursor-default'
            } ${
              isCurrent
                ? 'bg-teal-bg border-b-2 border-b-teal'
                : isPassed
                ? 'bg-[#F2F5F3]'
                : 'bg-paper-raised opacity-75'
            }`}
          >
            <div
              className={`font-mono text-[11px] ${
                isCurrent ? 'text-teal font-bold' : isPassed ? 'text-ink' : 'text-slate'
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
          </button>
        );
      })}
    </div>
  );
}
