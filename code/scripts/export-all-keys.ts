import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(__dirname, '..');
const vitestScanned = JSON.parse(fs.readFileSync(path.join(projectRoot, 'scanned-vitest-tests.json'), 'utf8'));

interface TestKeyItem {
  key: string;
  file: string;
  line: number;
  fullTitle: string;
}

const allKeys: TestKeyItem[] = [];

for (const t of vitestScanned) {
  const key = `${t.file} > ${t.fullTitle}`;
  allKeys.push({
    key,
    file: t.file,
    line: t.line,
    fullTitle: t.fullTitle,
  });
}

// Add the 7 Playwright tests
const playwrightTests = [
  {
    file: 'client/e2e/core-lifecycle-concurrency.spec.ts',
    line: 4,
    fullTitle:
      'ResQ Phase 5: Multi-Context Concurrent Core Crisis Lifecycle > Full core scenario with independent concurrent browser contexts, real-time sync, comms isolation, and resolution confirmation',
  },
  {
    file: 'client/e2e/focused-edge-cases.spec.ts',
    line: 8,
    fullTitle:
      'ResQ Phase 5: Focused Edge-Case Coverage & Defect Prevention > Phase 3B Permission Enforcement: Unauthorized roles never see forbidden actions',
  },
  {
    file: 'client/e2e/focused-edge-cases.spec.ts',
    line: 114,
    fullTitle:
      'ResQ Phase 5: Focused Edge-Case Coverage & Defect Prevention > Matching & Direct Invitation: Multi-factor breakdown and real in-app notification dispatch',
  },
  {
    file: 'client/e2e/focused-edge-cases.spec.ts',
    line: 211,
    fullTitle:
      'ResQ Phase 5: Focused Edge-Case Coverage & Defect Prevention > AI Classification: Suggestion apply, dismiss, and uninterrupted submission during simulated outage',
  },
  {
    file: 'client/e2e/focused-edge-cases.spec.ts',
    line: 285,
    fullTitle:
      'ResQ Phase 5: Focused Edge-Case Coverage & Defect Prevention > Analytics Dashboard: Non-zero metrics readout and dynamic date-range filtering',
  },
  {
    file: 'client/e2e/location-address-search.spec.ts',
    line: 4,
    fullTitle:
      'Additive Address Search on LocationPicker and Incident Management > Search address, pick from dropdown, submit request with privacy protection',
  },
  {
    file: 'client/e2e/location-address-search.spec.ts',
    line: 88,
    fullTitle:
      'Additive Address Search on LocationPicker and Incident Management > Incident creation address search recenters perimeter map',
  },
];

for (const pt of playwrightTests) {
  const key = `${pt.file} > ${pt.fullTitle}`;
  allKeys.push({
    key,
    file: pt.file,
    line: pt.line,
    fullTitle: pt.fullTitle,
  });
}

console.log(`Total tests: ${allKeys.length}`);
fs.writeFileSync(path.join(projectRoot, 'all-test-keys.json'), JSON.stringify(allKeys, null, 2));
