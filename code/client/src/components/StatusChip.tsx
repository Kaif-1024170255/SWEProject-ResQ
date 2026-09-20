export type ChipStatus =
  | 'unverified'
  | 'verified'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled'
  | 'critical';

interface StatusChipProps {
  status: ChipStatus | string;
  className?: string;
}

export default function StatusChip({ status, className = '' }: StatusChipProps) {
  const normalized = status.toLowerCase();

  const getStyle = () => {
    switch (normalized) {
      case 'unverified':
        return {
          border: 'border-l-amber text-amber',
          dot: 'bg-amber',
          label: 'UNVERIFIED',
        };
      case 'verified':
        return {
          border: 'border-l-teal text-teal',
          dot: 'bg-teal',
          label: 'VERIFIED',
        };
      case 'in_progress':
        return {
          border: 'border-l-ink text-ink',
          dot: 'bg-ink',
          label: 'IN PROGRESS',
        };
      case 'resolved':
        return {
          border: 'border-l-teal text-teal',
          dot: 'bg-teal',
          label: 'RESOLVED',
        };
      case 'closed':
        return {
          border: 'border-l-slate text-slate',
          dot: 'bg-slate',
          label: 'CLOSED',
        };
      case 'cancelled':
        return {
          border: 'border-l-rust text-slate',
          dot: 'bg-rust',
          label: 'CANCELLED',
        };
      case 'critical':
        return {
          border: 'border-l-rust text-rust',
          dot: 'bg-rust',
          label: 'CRITICAL',
        };
      default:
        return {
          border: 'border-l-slate text-slate',
          dot: 'bg-slate',
          label: status.toUpperCase(),
        };
    }
  };

  const style = getStyle();

  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-xs font-semibold px-2.5 py-1.5 bg-paper-raised border border-slate-line border-l-[3px] ${style.border} ${className}`}
    >
      <span className={`w-1.5 h-1.5 ${style.dot} inline-block rounded-none`}></span>
      <span>{style.label}</span>
    </span>
  );
}
