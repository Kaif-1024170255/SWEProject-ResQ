import fs from 'fs';
import path from 'path';

const annotations: Record<string, any> = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../docs/test-case-annotations.json'), 'utf8')
);

// Map of route path to test cases
const endpointTests: Record<string, { positive: string[]; negative: string[] }> = {};

for (const [key, test] of Object.entries(annotations)) {
  for (const c of test.code_under_test) {
    if (c.symbol && (c.symbol.includes('GET') || c.symbol.includes('POST') || c.symbol.includes('PATCH') || c.symbol.includes('DELETE'))) {
      const match = c.symbol.match(/^(GET|POST|PATCH|PUT|DELETE)\s+([^\s(]+)/);
      if (match) {
        const ep = `${match[1]} ${match[2]}`;
        if (!endpointTests[ep]) {
          endpointTests[ep] = { positive: [], negative: [] };
        }
        if (test.polarity === 'positive') {
          endpointTests[ep].positive.push(key);
        } else {
          endpointTests[ep].negative.push(key);
        }
      }
    }
  }
}

console.log('Exercised endpoints:', Object.keys(endpointTests).length);
for (const [ep, data] of Object.entries(endpointTests)) {
  console.log(`${ep.padEnd(40)}: Pos: ${data.positive.length}, Neg: ${data.negative.length}`);
}
