import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
  Request as RequestModel,
  RequestAssignment,
  Verification,
  Notification,
  Message,
  ResourceInventory,
} from '../src/models';
import { getAnalyticsSummary } from '../src/services/analytics';

dotenv.config();

async function runExport() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI is required for data export.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    const dateStr = new Date().toISOString().slice(0, 10);
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `pilot-results-${dateStr}.json`;
    const outputPath = path.resolve(__dirname, '../../', filename);

    console.log(`Connecting to MongoDB and exporting pilot session records...`);

    const [
      requests,
      assignments,
      verifications,
      notifications,
      messages,
      inventories,
      analyticsSnapshot,
    ] = await Promise.all([
      RequestModel.find({}).lean(),
      RequestAssignment.find({}).lean(),
      Verification.find({}).lean(),
      Notification.find({}).lean(),
      Message.find({}).lean(),
      ResourceInventory.find({}).lean(),
      getAnalyticsSummary('24h'),
    ]);

    const exportPayload = {
      exportMetadata: {
        title: 'ResQ Pilot Validation Live Session Export',
        exportedAt: new Date().toISOString(),
        totalRequests: requests.length,
        totalAssignments: assignments.length,
        totalVerifications: verifications.length,
        totalNotifications: notifications.length,
        totalMessages: messages.length,
      },
      analyticsSnapshot,
      collections: {
        requests,
        requestassignments: assignments,
        verifications,
        notifications,
        messages,
        resourceinventories: inventories,
      },
    };

    fs.writeFileSync(outputPath, JSON.stringify(exportPayload, null, 2), 'utf-8');

    console.log(`\n======================================================`);
    console.log(`PILOT DATA EXPORT SUCCESSFUL`);
    console.log(`======================================================`);
    console.log(` • Output File:      ${filename}`);
    console.log(` • Full Path:        ${outputPath}`);
    console.log(` • Requests:         ${requests.length}`);
    console.log(` • Assignments:      ${assignments.length}`);
    console.log(` • Verifications:    ${verifications.length}`);
    console.log(` • Notifications:    ${notifications.length}`);
    console.log(` • Messages:         ${messages.length}`);
    console.log(` • 24h Evaluated:    ${analyticsSnapshot.timeToMatch.totalEvaluated}`);
    console.log(` • Median TTM:       ${analyticsSnapshot.timeToMatch.medianMinutes} min`);
    console.log(` • Double-Booking:   ${analyticsSnapshot.doubleBookingRate.ratePercentage}% (${analyticsSnapshot.doubleBookingRate.status})`);
    console.log(` • Confirmation:     ${analyticsSnapshot.confirmationRate.ratePercentage}%`);
    console.log(` • Latency (P95):    ${analyticsSnapshot.propagationLatency.p95Ms} ms`);
    console.log(`======================================================\n`);
  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runExport();
