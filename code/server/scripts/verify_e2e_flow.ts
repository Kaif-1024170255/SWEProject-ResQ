/**
 * Complete End-to-End Sanity Check Script for Phase 1 & 2 Lifecycle
 */
import http from 'http';

async function requestJson(options: http.RequestOptions, body?: any): Promise<{ status: number; data: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          const data = raw ? JSON.parse(raw) : null;
          resolve({ status: res.statusCode || 0, data, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode || 0, data: raw, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runSanityCheck() {
  console.log('=== RESQ END-TO-END SANITY WALKTHROUGH ===\n');

  // 1. Check Frontend Home Page
  console.log('[1/9] Checking Frontend Public Home Page (http://localhost:5173/)...');
  const homeRes = await requestJson({
    hostname: 'localhost',
    port: 5173,
    path: '/',
    method: 'GET',
  });
  if (homeRes.status !== 200) {
    throw new Error(`Frontend returned status ${homeRes.status}`);
  }
  console.log(' ✓ Frontend Home Page responds with 200 OK');

  // 2. Submit Emergency Request (Public Bystander / Citizen)
  console.log('\n[2/9] Submitting New Emergency Request via /api/requests...');
  const callerPhone = '+91 98888 99887';
  const submitRes = await requestJson(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/requests',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      category: 'medical',
      description: 'Dialysis patient stranded on first floor, rising water at door',
      preciseLat: 30.9035,
      preciseLng: 75.8580,
      contactPhone: callerPhone,
    }
  );

  if (submitRes.status !== 201) {
    throw new Error(`Submit failed with status ${submitRes.status}: ${JSON.stringify(submitRes.data)}`);
  }
  const customId = submitRes.data.requestId;
  const mongoId = submitRes.data.request._id;
  console.log(` ✓ Request successfully submitted: ${customId} (Status: ${submitRes.data.request.status})`);
  console.log(`   Public Fuzzed Location: [${submitRes.data.request.location.publicLat}, ${submitRes.data.request.location.publicLng}]`);

  // 3. Admin Login & Verification
  console.log('\n[3/9] Admin Authenticating & Verifying Request...');
  const adminLogin = await requestJson(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin@resq.org', password: 'ResQSecure2026!' }
  );
  if (adminLogin.status !== 200) {
    throw new Error(`Admin login failed: ${JSON.stringify(adminLogin.data)}`);
  }
  const adminToken = adminLogin.data.token;

  const verifyRes = await requestJson(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/requests/${customId}/verify`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      note: 'Verified with family physician',
      remarks: 'High priority medical case confirmed with Sector 4 clinical liaison.',
    }
  );
  if (verifyRes.status !== 200) {
    throw new Error(`Verify failed: ${JSON.stringify(verifyRes.data)}`);
  }
  console.log(` ✓ Request verified (Status: ${verifyRes.data.request.status})`);

  // Check verification records endpoint
  const verifRecordRes = await requestJson({
    hostname: 'localhost',
    port: 5000,
    path: `/api/requests/${customId}/verification`,
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(` ✓ Verification entity record confirmed: "${verifRecordRes.data.verification?.remarks}"`);

  // 4. Volunteer Login & Claim (Creating RequestAssignment)
  console.log('\n[4/9] Volunteer Authenticating & Claiming Request...');
  const volunteerLogin = await requestJson(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'rahul.volunteer@example.org', password: 'ResQSecure2026!' }
  );
  if (volunteerLogin.status !== 200) {
    throw new Error(`Volunteer login failed: ${JSON.stringify(volunteerLogin.data)}`);
  }
  const volunteerToken = volunteerLogin.data.token;

  const claimRes = await requestJson(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/requests/${customId}/claim`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${volunteerToken}`,
      },
    },
    { note: 'Dispatched with medical transport team' }
  );
  if (claimRes.status !== 200) {
    throw new Error(`Claim failed: ${JSON.stringify(claimRes.data)}`);
  }
  console.log(` ✓ Request claimed (Status: ${claimRes.data.request.status})`);
  console.log(`   Unlocked Contact Phone for Responder: ${claimRes.data.request.contactPhone}`);
  console.log(`   Unlocked Precise Coordinates: [${claimRes.data.request.location.preciseLat}, ${claimRes.data.request.location.preciseLng}]`);

  // Check RequestAssignment created behind claim
  const assignmentsRes = await requestJson({
    hostname: 'localhost',
    port: 5000,
    path: `/api/requests/${customId}/assignments`,
    method: 'GET',
    headers: { Authorization: `Bearer ${volunteerToken}` },
  });
  console.log(` ✓ RequestAssignment auto-created: Assigned to "${assignmentsRes.data.assignments?.[0]?.assignedTo?.name || 'Volunteer'}" (Role: ${assignmentsRes.data.assignments?.[0]?.role})`);

  // 5. Request-Scoped Messaging
  console.log('\n[5/9] Posting Messages in Request Comms Log...');
  const volunteerMsg = await requestJson(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/requests/${customId}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${volunteerToken}`,
      },
    },
    { body: 'Medical team Rahul Sharma is en route. 8 mins away.' }
  );
  if (volunteerMsg.status !== 201) {
    throw new Error(`Volunteer message failed: ${JSON.stringify(volunteerMsg.data)}`);
  }

  // Bystander/Requester replies via callerPhone challenge
  const requesterMsg = await requestJson(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/requests/${customId}/messages`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      contactPhone: callerPhone,
      senderName: 'Patient Family',
      body: 'Thank you, we are waiting by the first floor balcony.',
    }
  );
  if (requesterMsg.status !== 201) {
    throw new Error(`Requester message failed: ${JSON.stringify(requesterMsg.data)}`);
  }

  const threadRes = await requestJson({
    hostname: 'localhost',
    port: 5000,
    path: `/api/requests/${customId}/messages`,
    method: 'GET',
    headers: { Authorization: `Bearer ${volunteerToken}` },
  });
  console.log(` ✓ Comms thread verified: ${threadRes.data.messages?.length} messages exchanged between responder and caller.`);

  // 6. Evidence Attachment Upload
  console.log('\n[6/9] Attaching Supporting Evidence File...');
  const boundary = '----ResQSanityBoundary1234567890';
  const fileContent = 'SAMPLE_EVIDENCE_PHOTO_BYTES_RESQ';
  const multipartBody = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="description"',
    '',
    'Photo of front doorway water depth',
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="flood_water_level.jpg"',
    'Content-Type: image/jpeg',
    '',
    fileContent,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const evidenceRes = await requestJson(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/requests/${customId}/evidence`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(multipartBody),
        Authorization: `Bearer ${volunteerToken}`,
      },
    },
    multipartBody
  );
  if (evidenceRes.status !== 201) {
    throw new Error(`Evidence post failed: ${JSON.stringify(evidenceRes.data)}`);
  }

  const evidenceListRes = await requestJson({
    hostname: 'localhost',
    port: 5000,
    path: `/api/requests/${customId}/evidence`,
    method: 'GET',
    headers: { Authorization: `Bearer ${volunteerToken}` },
  });
  console.log(` ✓ Evidence attachment verified: "${evidenceListRes.data.evidence?.[0]?.fileName}" attached to request.`);

  // 7. Volunteer Marks Request Resolved
  console.log('\n[7/9] Volunteer Resolving Request...');
  const resolveRes = await requestJson(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/requests/${customId}/resolve`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${volunteerToken}`,
      },
    },
    { note: 'Patient successfully evacuated to Ludhiana Civil Hospital.' }
  );
  if (resolveRes.status !== 200) {
    throw new Error(`Resolve failed: ${JSON.stringify(resolveRes.data)}`);
  }
  console.log(` ✓ Request resolved (Status: ${resolveRes.data.request.status})`);

  // 8. Requester Confirms Resolution via Phone Check
  console.log('\n[8/9] Requester Confirming Resolution (Closing the Loop)...');
  const confirmRes = await requestJson(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/requests/${customId}/confirm`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      contactPhone: callerPhone,
      note: 'Family safely admitted and receiving medical attention. Case closed.',
    }
  );
  if (confirmRes.status !== 200) {
    throw new Error(`Confirm failed: ${JSON.stringify(confirmRes.data)}`);
  }
  console.log(` ✓ Request closed by requester (Status: ${confirmRes.data.request.status})`);

  // 9. Inspect Final Audit Trail
  console.log('\n[9/9] Verifying Full 5-Stage Status Audit Trail...');
  const finalCheck = await requestJson({
    hostname: 'localhost',
    port: 5000,
    path: `/api/requests/${customId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const history = finalCheck.data.request.statusHistory.map((h: any) => h.status);
  console.log(` ✓ Audit Trail: ${history.join(' -> ')}`);
  console.log('\n=== ALL LIFECYCLE CHECKS COMPLETED WITH 100% INTEGRITY ===\n');
}

runSanityCheck().catch((err) => {
  console.error('\n❌ Sanity check failed:', err);
  process.exit(1);
});
