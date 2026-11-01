const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const annotationsPath = path.join(projectRoot, 'docs', 'test-case-annotations.json');
const annotations = JSON.parse(fs.readFileSync(annotationsPath, 'utf8'));

const errors = [];

for (const [testKey, test] of Object.entries(annotations)) {
  test.code_under_test.forEach((cut, cIdx) => {
    const filePath = path.join(projectRoot, cut.file);
    if (!fs.existsSync(filePath)) {
      errors.push({ testKey, cIdx, cut, issue: 'FILE_MISSING' });
      return;
    }
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    const m = cut.lines.match(/^(\d+)-(\d+)$/);
    if (!m) {
      errors.push({ testKey, cIdx, cut, issue: 'INVALID_RANGE' });
      return;
    }
    const start = parseInt(m[1], 10);
    const end = parseInt(m[2], 10);
    if (start < 1 || end > lines.length || start > end) {
      errors.push({ testKey, cIdx, cut, issue: 'RANGE_OUT_OF_BOUNDS', max: lines.length });
      return;
    }
    const slice = lines.slice(start - 1, end).join('\n');

    // Route matching or symbol matching
    const rMatch = cut.symbol.match(/^(GET|POST|PATCH|PUT|DELETE)\s+([^\s(]+)/i);
    let found = false;
    if (rMatch) {
      const method = rMatch[1].toLowerCase();
      const p = rMatch[2]; // e.g. /api/auth/register or /api/requests/:id/verify
      const parts = p.split('/').filter(Boolean);
      const endpoint = parts.length > 2 ? '/' + parts.slice(2).join('/') : (parts[1] ? '/' + parts[1] : '/');
      const last = parts[parts.length - 1];

      // Check if router.<method> or app.<method> or method path appears in slice
      if (
        slice.toLowerCase().includes('.' + method) ||
        slice.toLowerCase().includes('router.' + method) ||
        slice.toLowerCase().includes(p.toLowerCase()) ||
        (last && slice.toLowerCase().includes('/' + last.toLowerCase()))
      ) {
        found = true;
      }
    } else {
      const base = cut.symbol.split('(')[0].trim();
      const word = (base.match(/^[a-zA-Z0-9_$]+/) || [''])[0];
      if (word && slice.toLowerCase().includes(word.toLowerCase())) {
        found = true;
      }
    }

    if (!found) {
      errors.push({ testKey, cIdx, cut, issue: 'SYMBOL_NOT_IN_RANGE' });
    }
  });
}

console.log('Total issues:', errors.length);
errors.forEach((e, idx) => {
  console.log(`${idx + 1}. [${e.issue}] ${e.cut.file}:${e.cut.lines} [${e.cut.symbol}] (max: ${e.max || ''}) in "${e.testKey}"`);
});
