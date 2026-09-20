import {
  Request as RequestModel,
  RequestAssignment,
  Verification,
  ResourceInventory,
} from '../models';
import { getTelemetryStats, TelemetryStats } from '../socket';

export interface DailyTimeMatchMetric {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Sep 18"
  medianMinutes: number;
  count: number;
}

export interface TimeToMatchMetric {
  medianMinutes: number;
  meanMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  totalEvaluated: number;
  dailyTrend: DailyTimeMatchMetric[];
}

export interface DoubleBookingMetric {
  conflictCount: number;
  totalEvaluated: number;
  ratePercentage: number;
  status: 'INTEGRITY_VERIFIED' | 'CONFLICT_DETECTED';
  detail: string;
}

export interface ConfirmationRateMetric {
  totalResolved: number;
  confirmedClosed: number;
  pendingConfirmation: number;
  ratePercentage: number;
}

export interface AnalyticsDashboardData {
  timeRange: '24h' | '7d' | '30d' | 'all';
  generatedAt: string;
  timeToMatch: TimeToMatchMetric;
  doubleBookingRate: DoubleBookingMetric;
  confirmationRate: ConfirmationRateMetric;
  propagationLatency: TelemetryStats;
}

/**
 * Calculates analytics dashboard metrics across a selectable time window.
 */
export async function getAnalyticsSummary(
  timeRange: '24h' | '7d' | '30d' | 'all' = '7d'
): Promise<AnalyticsDashboardData> {
  const now = Date.now();
  let startDate = new Date(0);

  if (timeRange === '24h') {
    startDate = new Date(now - 24 * 60 * 60 * 1000);
  } else if (timeRange === '7d') {
    startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
  } else if (timeRange === '30d') {
    startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
  }

  // -------------------------------------------------------------
  // 1. Time-to-Match Calculation
  // -------------------------------------------------------------
  const requests = await RequestModel.find({
    createdAt: { $gte: startDate },
  }).lean();

  const allVerifications = await Verification.find({}).lean();
  const allAssignments = await RequestAssignment.find({}).lean();

  // Build lookup maps
  const verificationsByReqId = new Map<string, Date>();
  for (const v of allVerifications) {
    const rId = v.request?.toString();
    if (rId && !verificationsByReqId.has(rId)) {
      verificationsByReqId.set(rId, new Date(v.timestamp || (v as any).createdAt));
    }
  }

  const assignmentsByReqId = new Map<string, Date>();
  for (const a of allAssignments) {
    const rId = a.request?.toString();
    if (rId) {
      const assignedTime = new Date(a.assignedAt || (a as any).createdAt);
      const existing = assignmentsByReqId.get(rId);
      if (!existing || assignedTime < existing) {
        assignmentsByReqId.set(rId, assignedTime);
      }
    }
  }

  const matchDurations: number[] = [];
  const dailyGroups = new Map<string, number[]>();

  for (const req of requests) {
    const reqMongoId = (req as any)._id.toString();

    // Determine verification timestamp
    let verifyTime: Date | undefined = verificationsByReqId.get(reqMongoId);
    if (!verifyTime && req.statusHistory) {
      const verifyEntry = req.statusHistory.find((h) => h.status === 'verified');
      if (verifyEntry) {
        verifyTime = new Date(verifyEntry.changedAt);
      }
    }

    // Determine match/assignment timestamp
    let matchTime: Date | undefined = assignmentsByReqId.get(reqMongoId);
    if (!matchTime && req.statusHistory) {
      const inProgressEntry = req.statusHistory.find((h) => h.status === 'in_progress');
      if (inProgressEntry) {
        matchTime = new Date(inProgressEntry.changedAt);
      }
    }

    if (verifyTime && matchTime) {
      const diffMs = matchTime.getTime() - verifyTime.getTime();
      const diffMins = Math.max(1, Math.round(diffMs / (60 * 1000)));

      matchDurations.push(diffMins);

      const dayKey = matchTime.toISOString().slice(0, 10);
      const group = dailyGroups.get(dayKey) || [];
      group.push(diffMins);
      dailyGroups.set(dayKey, group);
    }
  }

  matchDurations.sort((a, b) => a - b);
  const nMatches = matchDurations.length;

  let medianMinutes = 0;
  let meanMinutes = 0;
  let minMinutes = 0;
  let maxMinutes = 0;

  if (nMatches > 0) {
    medianMinutes = matchDurations[Math.floor(nMatches / 2)];
    meanMinutes = Math.round(
      matchDurations.reduce((acc, val) => acc + val, 0) / nMatches
    );
    minMinutes = matchDurations[0];
    maxMinutes = matchDurations[nMatches - 1];
  }

  // Build daily trend list (last 7 days or matching range)
  const daysToGenerate = timeRange === '24h' ? 1 : timeRange === '30d' ? 14 : 7;
  const dailyTrend: DailyTimeMatchMetric[] = [];
  for (let i = daysToGenerate - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const dayKey = d.toISOString().slice(0, 10);
    const monthName = d.toLocaleString('en-US', { month: 'short' });
    const dayNum = d.getDate();
    const label = `${monthName} ${dayNum}`;

    const values = dailyGroups.get(dayKey) || [];
    let dayMedian = 0;
    if (values.length > 0) {
      values.sort((a, b) => a - b);
      dayMedian = values[Math.floor(values.length / 2)];
    } else if (medianMinutes > 0 && i === 0) {
      dayMedian = medianMinutes;
    }

    dailyTrend.push({
      date: dayKey,
      label,
      medianMinutes: dayMedian,
      count: values.length,
    });
  }

  const timeToMatch: TimeToMatchMetric = {
    medianMinutes,
    meanMinutes,
    minMinutes,
    maxMinutes,
    totalEvaluated: nMatches,
    dailyTrend,
  };

  // -------------------------------------------------------------
  // 2. Double-Booking Rate (Integrity Query)
  // -------------------------------------------------------------
  // Active assignments that occupy field resources
  const activeAssignments = await RequestAssignment.find({
    status: { $in: ['assigned', 'accepted', 'en_route', 'on_scene'] },
  }).lean();

  let doubleBookingConflicts = 0;

  // Check 1: Check resource assignment exclusivity across active requests
  const resourceToActiveReq = new Map<string, string>();
  for (const a of activeAssignments) {
    if (a.resource) {
      const resId = a.resource.toString();
      const reqId = a.request.toString();
      if (resourceToActiveReq.has(resId) && resourceToActiveReq.get(resId) !== reqId) {
        doubleBookingConflicts++;
      } else {
        resourceToActiveReq.set(resId, reqId);
      }
    }
  }

  // Check 2: Check inventory quantity integrity (no negative stock or corrupt reserves)
  const invalidStockInventories = await ResourceInventory.find({
    $or: [{ quantityAvailable: { $lt: 0 } }, { quantityReserved: { $lt: 0 } }],
  }).countDocuments();

  doubleBookingConflicts += invalidStockInventories;

  const totalAssignmentsEvaluated = activeAssignments.length;
  const doubleBookingRate = totalAssignmentsEvaluated > 0
    ? Number(((doubleBookingConflicts / totalAssignmentsEvaluated) * 100).toFixed(2))
    : 0.0;

  const doubleBookingMetric: DoubleBookingMetric = {
    conflictCount: doubleBookingConflicts,
    totalEvaluated: totalAssignmentsEvaluated,
    ratePercentage: doubleBookingRate,
    status: doubleBookingConflicts === 0 ? 'INTEGRITY_VERIFIED' : 'CONFLICT_DETECTED',
    detail:
      doubleBookingConflicts === 0
        ? `0 conflicts across ${totalAssignmentsEvaluated} active assignments and inventories (concurrency safe)`
        : `${doubleBookingConflicts} simultaneous double-allocation conflict(s) detected`,
  };

  // -------------------------------------------------------------
  // 3. Confirmation Rate Calculation
  // -------------------------------------------------------------
  // Filter all requests that have reached 'resolved'
  const resolvedOrPastRequests = await RequestModel.find({
    createdAt: { $gte: startDate },
    $or: [
      { status: { $in: ['resolved', 'closed'] } },
      { 'statusHistory.status': 'resolved' },
    ],
  }).lean();

  let confirmedClosed = 0;
  let pendingConfirmation = 0;

  for (const req of resolvedOrPastRequests) {
    if (req.status === 'closed') {
      confirmedClosed++;
    } else if (req.status === 'resolved') {
      pendingConfirmation++;
    } else {
      // If status history reached resolved and now cancelled/closed
      const hasClosedHistory = req.statusHistory?.some((h) => h.status === 'closed');
      if (hasClosedHistory) {
        confirmedClosed++;
      }
    }
  }

  const totalResolved = confirmedClosed + pendingConfirmation;
  const confirmationPercentage =
    totalResolved > 0
      ? Number(((confirmedClosed / totalResolved) * 100).toFixed(1))
      : 0.0;

  const confirmationRate: ConfirmationRateMetric = {
    totalResolved,
    confirmedClosed,
    pendingConfirmation,
    ratePercentage: confirmationPercentage,
  };

  // -------------------------------------------------------------
  // 4. Propagation Latency Telemetry
  // -------------------------------------------------------------
  const propagationLatency = getTelemetryStats();

  return {
    timeRange,
    generatedAt: new Date().toISOString(),
    timeToMatch,
    doubleBookingRate: doubleBookingMetric,
    confirmationRate,
    propagationLatency,
  };
}
