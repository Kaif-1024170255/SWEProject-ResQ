import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface VerificationModalProps {
  requestId: string;
  category?: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function VerificationModal({
  requestId,
  category,
  description,
  isOpen,
  onClose,
  onSuccess,
}: VerificationModalProps) {
  const { token } = useAuth();
  const [result, setResult] = useState<'verified_legitimate' | 'duplicate' | 'unfounded'>('verified_legitimate');
  const [method, setMethod] = useState<'phone_call' | 'field_visit' | 'third_party_ngo' | 'cross_reference'>('phone_call');
  const [priorityAssessment, setPriorityAssessment] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/requests/${requestId}/verify`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          result,
          method,
          priorityAssessment,
          remarks: remarks.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit verification assessment');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error submitting verification');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-ink/60 flex items-center justify-center p-4">
      <div className="bg-paper-raised border border-slate-line max-w-lg w-full p-5 space-y-4 shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-line pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-ink">{requestId}</span>
              {category && (
                <span className="font-mono text-[10px] text-slate uppercase bg-paper px-1.5 py-0.5 border border-slate-line">
                  {category}
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-ink mt-1">Verification Assessment Record</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs text-slate hover:text-ink px-2 py-0.5 border border-slate-line rounded-[3px] hover:bg-paper cursor-pointer"
          >
            ✕
          </button>
        </div>

        {description && (
          <div className="p-2.5 bg-paper border border-slate-line text-xs text-slate leading-relaxed line-clamp-2">
            <span className="font-mono text-[10px] uppercase text-ink font-semibold mr-1">Report:</span>
            {description}
          </div>
        )}

        {error && (
          <div className="p-2.5 bg-paper border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-sans">
          {/* Verification Result */}
          <div>
            <label className="block font-mono text-[11px] text-slate uppercase font-semibold mb-1">
              Verification Result *
            </label>
            <div className="space-y-1.5">
              <label
                className={`flex items-start gap-2.5 p-2 border cursor-pointer ${
                  result === 'verified_legitimate'
                    ? 'border-pine bg-[#EAF2ED]'
                    : 'border-slate-line hover:bg-paper'
                }`}
              >
                <input
                  type="radio"
                  name="verificationResult"
                  value="verified_legitimate"
                  checked={result === 'verified_legitimate'}
                  onChange={() => setResult('verified_legitimate')}
                  className="mt-0.5 accent-pine"
                />
                <div>
                  <div className="font-semibold text-ink">Verified Legitimate</div>
                  <div className="text-[11px] text-slate">
                    Authentic crisis demand. Transitions status to <span className="font-mono font-semibold text-pine">VERIFIED</span> and queues for responder claim.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-2 border cursor-pointer ${
                  result === 'duplicate'
                    ? 'border-amber-line bg-amber-soft/20'
                    : 'border-slate-line hover:bg-paper'
                }`}
              >
                <input
                  type="radio"
                  name="verificationResult"
                  value="duplicate"
                  checked={result === 'duplicate'}
                  onChange={() => setResult('duplicate')}
                  className="mt-0.5 accent-amber-glow"
                />
                <div>
                  <div className="font-semibold text-ink">Duplicate Report</div>
                  <div className="text-[11px] text-slate">
                    Redundant request already logged. Immediately archives to <span className="font-mono font-semibold text-slate">CLOSED</span> with audit trail.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-2 border cursor-pointer ${
                  result === 'unfounded'
                    ? 'border-rust bg-rust/10'
                    : 'border-slate-line hover:bg-paper'
                }`}
              >
                <input
                  type="radio"
                  name="verificationResult"
                  value="unfounded"
                  checked={result === 'unfounded'}
                  onChange={() => setResult('unfounded')}
                  className="mt-0.5 accent-rust"
                />
                <div>
                  <div className="font-semibold text-ink">Unfounded / Hoax</div>
                  <div className="text-[11px] text-slate">
                    Spam, false report, or unserviceable. Immediately archives to <span className="font-mono font-semibold text-rust">CLOSED</span> with audit trail.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Verification Method & Priority Assessment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[11px] text-slate uppercase font-semibold mb-1">
                Investigation Method *
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as any)}
                className="w-full bg-paper border border-slate-line p-2 text-ink font-sans rounded-[3px] focus:outline-none focus:border-ink"
              >
                <option value="phone_call">Phone Call to Contact</option>
                <option value="field_visit">On-site Field Visit</option>
                <option value="third_party_ngo">Third-Party NGO Partner</option>
                <option value="cross_reference">Cross-Reference Logs</option>
              </select>
            </div>

            <div>
              <label className="block font-mono text-[11px] text-slate uppercase font-semibold mb-1">
                Priority Assessment *
              </label>
              <select
                value={priorityAssessment}
                onChange={(e) => setPriorityAssessment(e.target.value as any)}
                className="w-full bg-paper border border-slate-line p-2 text-ink font-sans rounded-[3px] focus:outline-none focus:border-ink"
              >
                <option value="critical">Critical (Immediate life hazard)</option>
                <option value="high">High (Time sensitive / Urgent)</option>
                <option value="medium">Medium (Moderate urgency)</option>
                <option value="low">Low (Routine relief supply)</option>
              </select>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block font-mono text-[11px] text-slate uppercase font-semibold mb-1">
              Field Notes / Verifier Remarks
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Contacted caller Mrs. Kaur; verified medical prescription and urgent dialysis appointment needed by 4 PM."
              rows={3}
              className="w-full bg-paper border border-slate-line p-2 text-ink font-sans rounded-[3px] focus:outline-none focus:border-ink resize-none placeholder:text-slate/60 text-xs"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-line">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 border border-slate-line text-slate hover:text-ink font-mono text-xs rounded-[3px] hover:bg-paper cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-4 py-1.5 font-mono text-xs font-semibold text-white rounded-[3px] cursor-pointer ${
                result === 'verified_legitimate'
                  ? 'bg-ink hover:bg-ink-soft'
                  : result === 'duplicate'
                  ? 'bg-amber-line hover:bg-ink text-ink hover:text-white'
                  : 'bg-rust hover:bg-rust/90'
              }`}
            >
              {isSubmitting
                ? 'Recording...'
                : result === 'verified_legitimate'
                ? 'Confirm Verification & Queue'
                : `Archive as ${result === 'duplicate' ? 'Duplicate' : 'Unfounded'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
