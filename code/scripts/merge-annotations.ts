import fs from 'fs';
import path from 'path';
import { authAndLifecycleAnnotations } from './annotations/auth-and-lifecycle';
import { resourcesAndOrgsAnnotations } from './annotations/resources-and-orgs';
import { commsAndRealtimeAnnotations } from './annotations/comms-and-realtime';
import { REQUESTS_AND_PRIVACY_ANNOTATIONS } from './annotations/requests-and-privacy';
import { INTELLIGENCE_MISC_AND_E2E_ANNOTATIONS } from './annotations/intelligence-misc-and-e2e';

const allAnnotations: Record<string, any> = {
  ...authAndLifecycleAnnotations,
  ...resourcesAndOrgsAnnotations,
  ...commsAndRealtimeAnnotations,
  ...REQUESTS_AND_PRIVACY_ANNOTATIONS,
  ...INTELLIGENCE_MISC_AND_E2E_ANNOTATIONS,
};

const keysPath = path.resolve(__dirname, '../all-test-keys.json');
const keysData: Array<{ key: string; file: string; line: number; fullTitle: string }> = JSON.parse(
  fs.readFileSync(keysPath, 'utf8')
);

console.log(`Discovered keys in all-test-keys.json: ${keysData.length}`);
console.log(`Total annotations gathered: ${Object.keys(allAnnotations).length}`);

let missingAnnotations = 0;
for (const item of keysData) {
  if (!allAnnotations[item.key]) {
    console.error(`MISSING ANNOTATION: ${item.key}`);
    missingAnnotations++;
  }
}

let orphanAnnotations = 0;
const keySet = new Set(keysData.map((k) => k.key));
for (const key of Object.keys(allAnnotations)) {
  if (!keySet.has(key)) {
    console.error(`ORPHAN ANNOTATION: ${key}`);
    orphanAnnotations++;
  }
}

if (missingAnnotations > 0 || orphanAnnotations > 0) {
  console.error(
    `FAILED: ${missingAnnotations} missing annotations, ${orphanAnnotations} orphan annotations.`
  );
  process.exit(1);
}

// Ensure docs directory exists
const docsDir = path.resolve(__dirname, '../docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const outputPath = path.join(docsDir, 'test-case-annotations.json');
fs.writeFileSync(outputPath, JSON.stringify(allAnnotations, null, 2), 'utf8');
console.log(`Successfully merged ${Object.keys(allAnnotations).length} annotations into ${outputPath}`);
