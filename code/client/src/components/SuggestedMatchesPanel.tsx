import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface MatchFactor {
  score: number;
  weight: number;
  weightedScore: number;
  explanation: string;
  metric?: string | number;
}

interface CandidateMatch {
  candidateId: string;
  candidateType: 'user' | 'organization';
  name: string;
  role: string;
  organizationName?: string;
  overallScore: number;
  distanceKm?: number;
  factors: {
    proximity: MatchFactor;
    suitability: MatchFactor;
    capacity: MatchFactor;
    availability: MatchFactor;
  };
  summary: string;
}

interface MatchingApiResponse {
  success: boolean;
  data?: {
    requestId: string;
    requestCategory: string;
    totalCandidatesEvaluated: number;
    matches: CandidateMatch[];
  };
  matches?: CandidateMatch[];
}

interface SuggestedMatchesPanelProps {
  requestId: string;
}

export default function SuggestedMatchesPanel({ requestId }: SuggestedMatchesPanelProps) {
  const { token, user } = useAuth();
  const [matches, setMatches] = useState<CandidateMatch[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Record<string, boolean>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const canInvite = user?.role === 'admin' || user?.role === 'ngo';

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetch(`/api/requests/${requestId}/matches`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load matching candidates (${res.status})`);
        }
        return res.json();
      })
      .then((data: MatchingApiResponse) => {
        if (isMounted) {
          const candidateList = data.data?.matches || data.matches || [];
          setMatches(candidateList);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Error fetching matches:', err);
          setError(err.message || 'Failed to load suggested matches');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [requestId, token]);

  const handleInvite = async (candidate: CandidateMatch) => {
    if (!canInvite) return;
    setInvitingId(candidate.candidateId);

    try {
      const res = await fetch(`/api/requests/${requestId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          candidateId: candidate.candidateId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to dispatch invitation');
      }

      setInvitedIds((prev) => ({ ...prev, [candidate.candidateId]: true }));
    } catch (err: any) {
      console.error('Invite error:', err);
      alert(err.message || 'Failed to send invitation');
    } finally {
      setInvitingId(null);
    }
  };

  return (
    <div className="border border-slate-line rounded-[3px] bg-white overflow-hidden text-xs font-sans">
      {/* Header Bar */}
      <div className="px-4 py-2.5 bg-paper border-b border-slate-line flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-slate uppercase tracking-wider font-semibold">
            Automated Candidate Suggestions
          </span>
          <span className="bg-amber-soft/30 text-amber font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold border border-amber/30">
            SUGGESTIONS ONLY · NO AUTO-ASSIGN
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate">
          {matches.length} candidate{matches.length === 1 ? '' : 's'} evaluated
        </span>
      </div>

      {/* Body Content */}
      {isLoading ? (
        <div className="p-6 text-center font-mono text-xs text-slate">
          Computing multi-factor candidate scores (proximity, suitability, capacity, availability)...
        </div>
      ) : error ? (
        <div className="p-4 text-center font-mono text-xs text-rust">
          {error}
        </div>
      ) : matches.length === 0 ? (
        <div className="p-6 text-center text-slate font-sans text-xs">
          No registered volunteers, NGOs, or resource providers meet threshold criteria for this request.
        </div>
      ) : (
        <div className="divide-y divide-slate-line">
          {matches.map((candidate, idx) => {
            const isInvited = !!invitedIds[candidate.candidateId];
            const isInviting = invitingId === candidate.candidateId;

            // Determine score tone
            const scoreColor =
              candidate.overallScore >= 0.75
                ? 'text-teal font-bold'
                : candidate.overallScore >= 0.5
                ? 'text-ink font-semibold'
                : 'text-slate';

            return (
              <div
                key={candidate.candidateId}
                className="p-3.5 hover:bg-[#F9FAF9] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                {/* Left: Rank, Name, Role, Score & Factor Breakdown */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-slate font-bold">
                      #{idx + 1}
                    </span>
                    <span className="font-semibold text-ink text-sm">
                      {candidate.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-line/60 text-slate">
                      {candidate.role.replace('_', ' ')}
                    </span>
                    {candidate.organizationName && (
                      <span className="text-[11px] text-slate truncate">
                        ({candidate.organizationName})
                      </span>
                    )}

                    <div className="ml-auto md:ml-2 flex items-center gap-1.5 font-mono text-xs">
                      <span className="text-slate uppercase text-[10px]">Score:</span>
                      <span className={scoreColor}>
                        {candidate.overallScore.toFixed(2)}
                      </span>
                      {candidate.distanceKm !== undefined && (
                        <span className="text-slate text-[11px]">
                          · {candidate.distanceKm}km
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Factor Details Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 font-mono text-[11px] text-slate">
                    <div>
                      <span className="text-[10px] uppercase text-slate/80 block">Proximity (35%)</span>
                      <span className="text-ink">{candidate.factors.proximity.explanation}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate/80 block">Suitability (30%)</span>
                      <span className="text-ink">{candidate.factors.suitability.explanation}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate/80 block">Capacity (20%)</span>
                      <span className="text-ink">{candidate.factors.capacity.explanation}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate/80 block">Availability (15%)</span>
                      <span className="text-ink">{candidate.factors.availability.explanation}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Invitation Action */}
                <div className="flex items-center justify-end shrink-0 pt-2 md:pt-0">
                  {canInvite && (
                    <button
                      onClick={() => handleInvite(candidate)}
                      disabled={isInvited || isInviting}
                      className={`font-sans text-xs font-semibold px-3 py-1.5 rounded-[3px] transition-colors cursor-pointer disabled:cursor-not-allowed ${
                        isInvited
                          ? 'bg-teal-soft/20 text-teal border border-teal/40'
                          : 'bg-ink text-white hover:bg-ink-soft disabled:opacity-50'
                      }`}
                    >
                      {isInviting
                        ? 'Inviting...'
                        : isInvited
                        ? 'Invited ✓'
                        : 'Invite Responder'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
