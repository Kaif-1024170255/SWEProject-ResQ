import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface DailyTimeMatchMetric {
  date: string;
  label: string;
  medianMinutes: number;
  count: number;
}

interface TimeToMatchMetric {
  medianMinutes: number;
  meanMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  totalEvaluated: number;
  dailyTrend: DailyTimeMatchMetric[];
}

interface DoubleBookingMetric {
  conflictCount: number;
  totalEvaluated: number;
  ratePercentage: number;
  status: 'INTEGRITY_VERIFIED' | 'CONFLICT_DETECTED';
  detail: string;
}

interface ConfirmationRateMetric {
  totalResolved: number;
  confirmedClosed: number;
  pendingConfirmation: number;
  ratePercentage: number;
}

interface TelemetryStats {
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  sampleCount: number;
  lastRecordedAt?: string;
  status: 'active' | 'awaiting_telemetry';
}

interface AnalyticsDashboardData {
  timeRange: '24h' | '7d' | '30d' | 'all';
  generatedAt: string;
  timeToMatch: TimeToMatchMetric;
  doubleBookingRate: DoubleBookingMetric;
  confirmationRate: ConfirmationRateMetric;
  propagationLatency: TelemetryStats;
}

export default function AnalyticsPage() {
  const { token, user, logout } = useAuth();
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [data, setData] = useState<AnalyticsDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?timeRange=${timeRange}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load analytics (${res.status})`);
      }

      const json = await res.json();
      setData(json.data);
    } catch (err: any) {
      setError(err.message || 'Error fetching analytics summary');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange, token]);

  const formatMinutes = (mins: number) => {
    if (mins <= 0) return '0 min';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
      {/* Top Bar with Navigation & Session context */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-line pb-4 mb-6 gap-4">
        <div>
          <div className="font-mono text-xs text-slate tracking-wide mb-1">
            resQ / CENTRAL DISPATCH / PERFORMANCE ANALYTICS
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink">
            Proposal Metrics & Operations Readout
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold px-2.5 py-1.5 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust text-rust">
                <span className="w-1.5 h-1.5 bg-rust inline-block"></span>
                ADMIN
              </span>
              <span className="font-mono text-xs text-slate hidden md:inline">
                {user.name}
              </span>
            </div>
          )}

          <Link
            to="/admin"
            className="font-mono text-xs text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper"
          >
            Dispatch Console
          </Link>

          <Link
            to="/organizations"
            className="font-mono text-xs text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper"
          >
            Organizations
          </Link>

          <button
            onClick={fetchAnalytics}
            disabled={isLoading}
            className="font-mono text-xs text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper cursor-pointer disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh Readout'}
          </button>

          <button
            onClick={logout}
            className="bg-transparent text-ink font-sans text-xs font-semibold px-3.5 py-1.5 rounded-[3px] border border-slate-line hover:border-ink cursor-pointer"
          >
            Log out
          </button>
        </div>
      </div>

      {/* Date-Range Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-paper-raised border border-slate-line mb-6">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate uppercase tracking-wider">
            Evaluation Window:
          </span>
          <div className="inline-flex border border-slate-line bg-paper font-mono text-xs">
            {(
              [
                { key: '24h', label: 'Last 24 Hours' },
                { key: '7d', label: 'Last 7 Days' },
                { key: '30d', label: 'Last 30 Days' },
                { key: 'all', label: 'All Time' },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTimeRange(key)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer border-r last:border-r-0 border-slate-line ${
                  timeRange === key
                    ? 'bg-ink text-white'
                    : 'text-slate hover:text-ink hover:bg-paper-raised'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="font-mono text-[11px] text-slate">
          {data ? `Report generated: ${new Date(data.generatedAt).toLocaleTimeString()}` : 'Syncing telemetry...'}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rust-faint border border-rust-border text-rust font-mono text-xs mb-6">
          [ERROR] {error}
        </div>
      )}

      {/* Main 4 Proposal Metrics Dense Readout */}
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Metric 1: Time-to-Match */}
            <div className="border border-slate-line bg-paper-raised p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-line pb-2 mb-3">
                  <span className="font-mono text-xs text-slate uppercase tracking-wider font-semibold">
                    1. Time-to-Match
                  </span>
                  <span className="font-mono text-[10px] text-slate">
                    Verification → First Assignment
                  </span>
                </div>

                <div className="flex items-baseline gap-3 mb-2">
                  <span className="font-mono text-4xl font-bold text-ink">
                    {formatMinutes(data.timeToMatch.medianMinutes)}
                  </span>
                  <span className="font-mono text-xs text-slate uppercase">
                    (Median)
                  </span>
                </div>

                <p className="text-xs text-slate mb-4">
                  Aggregated time from ticket verification confirmation to responder assignment or claim across{' '}
                  <strong className="text-ink font-mono">{data.timeToMatch.totalEvaluated}</strong> ticket(s).
                </p>

                <div className="grid grid-cols-3 gap-2 font-mono text-xs py-2 border-y border-slate-line bg-paper px-3 mb-4">
                  <div>
                    <div className="text-[10px] text-slate uppercase">Mean</div>
                    <div className="font-semibold text-ink">
                      {formatMinutes(data.timeToMatch.meanMinutes)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate uppercase">Min</div>
                    <div className="font-semibold text-teal">
                      {formatMinutes(data.timeToMatch.minMinutes)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate uppercase">Max</div>
                    <div className="font-semibold text-rust">
                      {formatMinutes(data.timeToMatch.maxMinutes)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Simple Native SVG Trend Sparkline */}
              <div>
                <div className="font-mono text-[10px] text-slate uppercase mb-1 flex justify-between">
                  <span>Daily Median Trend</span>
                  <span>Minutes</span>
                </div>
                <div className="h-24 w-full bg-paper border border-slate-line p-2 flex items-end justify-between gap-1">
                  {data.timeToMatch.dailyTrend.map((d, idx) => {
                    const maxVal = Math.max(
                      ...data.timeToMatch.dailyTrend.map((t) => t.medianMinutes),
                      60
                    );
                    const barHeightPct = d.medianMinutes > 0
                      ? Math.max(15, Math.round((d.medianMinutes / maxVal) * 100))
                      : 4;

                    return (
                      <div
                        key={idx}
                        className="flex-1 flex flex-col items-center justify-end h-full group relative"
                      >
                        <div
                          style={{ height: `${barHeightPct}%` }}
                          className={`w-full transition-all ${
                            d.count > 0 ? 'bg-ink hover:bg-slate' : 'bg-slate-line'
                          }`}
                        ></div>
                        <span className="font-mono text-[9px] text-slate mt-1 truncate max-w-[36px]">
                          {d.label}
                        </span>

                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-ink text-white font-mono text-[10px] px-1.5 py-0.5 whitespace-nowrap shadow-xs pointer-events-none">
                          {d.label}: {d.medianMinutes}m ({d.count} req)
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Metric 2: Double-Booking Rate */}
            <div className="border border-slate-line bg-paper-raised p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-line pb-2 mb-3">
                  <span className="font-mono text-xs text-slate uppercase tracking-wider font-semibold">
                    2. Double-Booking Rate
                  </span>
                  <span
                    className={`font-mono text-[10px] font-semibold px-2 py-0.5 border ${
                      data.doubleBookingRate.conflictCount === 0
                        ? 'bg-teal-faint text-teal border-teal-border'
                        : 'bg-rust-faint text-rust border-rust-border'
                    }`}
                  >
                    {data.doubleBookingRate.status}
                  </span>
                </div>

                <div className="flex items-baseline gap-3 mb-2">
                  <span className="font-mono text-4xl font-bold text-teal">
                    {data.doubleBookingRate.ratePercentage.toFixed(1)}%
                  </span>
                  <span className="font-mono text-xs text-slate uppercase">
                    (Concurrency Integrity)
                  </span>
                </div>

                <p className="text-xs text-slate mb-4">
                  Continuous query validating whether any responder or inventory resource has been assigned to more than one simultaneously active emergency request.
                </p>

                <div className="p-3 bg-paper border border-slate-line font-mono text-xs space-y-1.5 mb-4">
                  <div className="flex justify-between">
                    <span className="text-slate">Active Assignments Evaluated:</span>
                    <span className="font-semibold text-ink">
                      {data.doubleBookingRate.totalEvaluated}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate">Detected Collision Overlaps:</span>
                    <span className="font-semibold text-teal">
                      {data.doubleBookingRate.conflictCount}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-line pt-1 text-[11px]">
                    <span className="text-slate">System Architecture Protection:</span>
                    <span className="text-ink">Self-Claim & Strict Locking</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-paper border-l-[3px] border-l-teal border-slate-line text-xs font-sans text-slate">
                <strong className="text-ink font-mono font-semibold block mb-0.5">
                  OPERATIONAL INTEGRITY CONFIRMED
                </strong>
                {data.doubleBookingRate.detail}
              </div>
            </div>

            {/* Metric 3: Confirmation Rate */}
            <div className="border border-slate-line bg-paper-raised p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-line pb-2 mb-3">
                  <span className="font-mono text-xs text-slate uppercase tracking-wider font-semibold">
                    3. Confirmation Rate
                  </span>
                  <span className="font-mono text-[10px] text-slate">
                    Resolved → Requester Confirmed
                  </span>
                </div>

                <div className="flex items-baseline gap-3 mb-2">
                  <span className="font-mono text-4xl font-bold text-ink">
                    {data.confirmationRate.ratePercentage.toFixed(1)}%
                  </span>
                  <span className="font-mono text-xs text-slate uppercase">
                    Confirmed Closed
                  </span>
                </div>

                <p className="text-xs text-slate mb-4">
                  Percentage of tickets that reached Resolved state and were subsequently confirmed and marked Closed by the affected citizen, versus tickets awaiting citizen confirmation.
                </p>

                <div className="p-3 bg-paper border border-slate-line font-mono text-xs space-y-2 mb-4">
                  <div className="flex justify-between">
                    <span className="text-slate">Total Resolved Tickets:</span>
                    <span className="font-semibold text-ink">
                      {data.confirmationRate.totalResolved}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate">Confirmed Closed by Citizen:</span>
                    <span className="font-semibold text-ink">
                      {data.confirmationRate.confirmedClosed}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate">Pending Citizen Confirmation:</span>
                    <span className="font-semibold text-amber">
                      {data.confirmationRate.pendingConfirmation}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div>
                <div className="font-mono text-[10px] text-slate uppercase mb-1 flex justify-between">
                  <span>Lifecycle Completion Progress</span>
                  <span>{data.confirmationRate.ratePercentage.toFixed(1)}%</span>
                </div>
                <div className="w-full h-3 bg-paper border border-slate-line overflow-hidden flex">
                  <div
                    style={{ width: `${data.confirmationRate.ratePercentage}%` }}
                    className="bg-ink h-full transition-all"
                    title="Confirmed Closed"
                  ></div>
                  <div
                    style={{
                      width: `${
                        100 - data.confirmationRate.ratePercentage
                      }%`,
                    }}
                    className="bg-amber/60 h-full transition-all"
                    title="Awaiting Requester Confirmation"
                  ></div>
                </div>
                <div className="flex justify-between font-mono text-[9px] text-slate mt-1">
                  <span>■ Closed ({data.confirmationRate.confirmedClosed})</span>
                  <span>■ Pending Confirmation ({data.confirmationRate.pendingConfirmation})</span>
                </div>
              </div>
            </div>

            {/* Metric 4: Propagation Latency */}
            <div className="border border-slate-line bg-paper-raised p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-line pb-2 mb-3">
                  <span className="font-mono text-xs text-slate uppercase tracking-wider font-semibold">
                    4. Propagation Latency
                  </span>
                  <span
                    className={`font-mono text-[10px] font-semibold px-2 py-0.5 border ${
                      data.propagationLatency.status === 'active'
                        ? 'bg-teal-faint text-teal border-teal-border'
                        : 'bg-paper text-slate border-slate-line'
                    }`}
                  >
                    {data.propagationLatency.status === 'active'
                      ? 'ACTIVE TELEMETRY'
                      : 'BENCHMARK BASELINE'}
                  </span>
                </div>

                <div className="flex items-baseline gap-3 mb-2">
                  <span className="font-mono text-4xl font-bold text-ink">
                    {data.propagationLatency.medianMs} ms
                  </span>
                  <span className="font-mono text-xs text-slate uppercase">
                    (Median Round-Trip Δ)
                  </span>
                </div>

                <p className="text-xs text-slate mb-4">
                  Continuous measurement of Socket.IO event transmission time from server broadcast to client browser receipt acknowledgement, eliminating device clock skew.
                </p>

                <div className="grid grid-cols-3 gap-2 font-mono text-xs py-2 border-y border-slate-line bg-paper px-3 mb-4">
                  <div>
                    <div className="text-[10px] text-slate uppercase">p95 Latency</div>
                    <div className="font-semibold text-ink">
                      {data.propagationLatency.p95Ms} ms
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate uppercase">Min Δ</div>
                    <div className="font-semibold text-teal">
                      {data.propagationLatency.minMs} ms
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate uppercase">Samples</div>
                    <div className="font-semibold text-ink">
                      {data.propagationLatency.sampleCount} ACKs
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-paper border border-slate-line text-xs font-sans text-slate space-y-1">
                <div className="font-mono text-[11px] text-ink font-semibold">
                  REAL-TIME PROPAGATION SPECIFICATION
                </div>
                <div>
                  Measured via lightweight <code className="font-mono text-[11px] text-ink">telemetry:ack</code> envelopes returned automatically by connected client web sockets upon broadcast arrival.
                </div>
              </div>
            </div>
          </div>

          {/* Operational Source Audit Breakdown */}
          <div className="border border-slate-line bg-paper-raised p-5">
            <h3 className="font-mono text-xs text-ink uppercase tracking-wider font-bold mb-3 border-b border-slate-line pb-2">
              Proposal Metrics Methodology & Data Sources
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-line text-slate uppercase text-[10px]">
                    <th className="py-2 pr-4">Metric</th>
                    <th className="py-2 pr-4">Database & Telemetry Source</th>
                    <th className="py-2 pr-4">Formula / Measurement Method</th>
                    <th className="py-2 pr-4">Target / Benchmark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-line text-slate">
                  <tr>
                    <td className="py-2 pr-4 font-semibold text-ink">Time-to-Match</td>
                    <td className="py-2 pr-4">Verification.timestamp → RequestAssignment.assignedAt</td>
                    <td className="py-2 pr-4">Median elapsed minutes between verified status and first responder claim</td>
                    <td className="py-2 pr-4 text-teal">&lt; 60 min</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-semibold text-ink">Double-Booking Rate</td>
                    <td className="py-2 pr-4">RequestAssignment (active) & ResourceInventory</td>
                    <td className="py-2 pr-4">Scan for overlapping active assignments on identical resource / personnel</td>
                    <td className="py-2 pr-4 text-teal">0.0% (strict invariant)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-semibold text-ink">Confirmation Rate</td>
                    <td className="py-2 pr-4">Request.status History (resolved vs closed)</td>
                    <td className="py-2 pr-4">Closed tickets confirmed by requester / total resolved tickets</td>
                    <td className="py-2 pr-4 text-teal">&gt; 70.0%</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-semibold text-ink">Propagation Latency</td>
                    <td className="py-2 pr-4">Socket.IO Server Emission vs telemetry:ack Receipt</td>
                    <td className="py-2 pr-4">Two-way RTT delta / 2 across active browser connections</td>
                    <td className="py-2 pr-4 text-teal">&lt; 100 ms</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
