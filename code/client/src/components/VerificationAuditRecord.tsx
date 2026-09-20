import { useEffect, useState } from 'react';

interface VerificationData {
  _id: string;
  result: 'verified_legitimate' | 'duplicate' | 'unfounded' | 'spam_or_hoax' | 'unreachable' | 'needs_more_info';
  method: 'phone_call' | 'field_visit' | 'third_party_ngo' | 'cross_reference' | 'trusted_contact' | 'other';
  remarks?: string;
  priorityAssessment?: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  verifiedBy?: {
    _id: string;
    name: string;
    email?: string;
    role: string;
  };
}

interface VerificationAuditRecordProps {
  requestId: string;
  compact?: boolean;
}

export function VerificationAuditRecord({ requestId, compact = false }: VerificationAuditRecordProps) {
  const [verification, setVerification] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchVerification() {
      try {
        const res = await fetch(`/api/requests/${requestId}/verification`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.verification) {
            setVerification(data.verification);
          }
        } else {
          if (isMounted) setVerification(null);
        }
      } catch {
        if (isMounted) setVerification(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (requestId) {
      setLoading(true);
      fetchVerification();
    }

    return () => {
      isMounted = false;
    };
  }, [requestId]);

  if (loading || !verification) {
    return null;
  }

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'verified_legitimate':
        return (
          <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 border border-pine bg-[#EAF2ED] text-pine">
            Verified Legitimate
          </span>
        );
      case 'duplicate':
        return (
          <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 border border-amber-line bg-amber-soft/40 text-ink">
            Duplicate Report
          </span>
        );
      case 'unfounded':
      case 'spam_or_hoax':
        return (
          <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 border border-rust bg-rust/10 text-rust">
            Unfounded Report
          </span>
        );
      default:
        return (
          <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 border border-slate-line bg-paper text-slate">
            {result.replace(/_/g, ' ')}
          </span>
        );
    }
  };

  const formatMethod = (method: string) => {
    return method.replace(/_/g, ' ').toUpperCase();
  };

  const getPriorityBadge = (p?: string) => {
    if (!p) return null;
    const isCritical = p === 'critical';
    const isHigh = p === 'high';
    return (
      <span
        className={`font-mono text-[10px] uppercase px-1.5 py-0.5 border ${
          isCritical
            ? 'border-rust bg-rust text-white font-bold'
            : isHigh
            ? 'border-amber-line bg-amber-soft text-ink font-semibold'
            : 'border-slate-line bg-paper text-slate'
        }`}
      >
        Priority: {p}
      </span>
    );
  };

  return (
    <div className={`p-3 bg-paper border border-slate-line ${compact ? 'space-y-1.5' : 'space-y-2'}`}>
      {/* Title / Audit Header */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-line pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-slate uppercase font-semibold">
            Verification Audit
          </span>
          {getResultBadge(verification.result)}
        </div>
        <span className="font-mono text-[10px] text-slate">
          {new Date(verification.timestamp).toLocaleString()}
        </span>
      </div>

      {/* Meta Specs: Method, Priority, Verifier */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate">
        <span>
          Method: <strong className="text-ink font-mono">{formatMethod(verification.method)}</strong>
        </span>
        {verification.priorityAssessment && (
          <>
            <span className="text-slate-line">•</span>
            {getPriorityBadge(verification.priorityAssessment)}
          </>
        )}
        {verification.verifiedBy && (
          <>
            <span className="text-slate-line">•</span>
            <span>
              By: <strong className="text-ink">{verification.verifiedBy.name}</strong> ({verification.verifiedBy.role})
            </span>
          </>
        )}
      </div>

      {/* Verifier Remarks */}
      {verification.remarks && (
        <div className="p-2 bg-paper-raised border-l-2 border-slate-line text-xs text-ink font-sans leading-relaxed">
          <span className="font-mono text-[10px] text-slate uppercase font-semibold mr-1.5">Remarks:</span>
          {verification.remarks}
        </div>
      )}
    </div>
  );
}
