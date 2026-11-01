import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(__dirname, '..');
const annotationsPath = path.join(projectRoot, 'docs', 'test-case-annotations.json');
const annotations = JSON.parse(fs.readFileSync(annotationsPath, 'utf8'));

interface CodeRangeCheckResult {
  testKey: string;
  file: string;
  lines: string;
  symbol: string;
  error?: string;
}

const errors: CodeRangeCheckResult[] = [];

// Helper to determine what pattern(s) to look for based on symbol and route
function extractSearchPatterns(symbol: string, targetFile: string): string[] {
  // If symbol is of form: METHOD /api/... (e.g. POST /api/auth/register or PATCH /api/requests/:id/verify)
  const routeMatch = symbol.match(/^(GET|POST|PATCH|PUT|DELETE)\s+([^\s(]+)/i);
  if (routeMatch) {
    const method = routeMatch[1].toLowerCase();
    const fullPath = routeMatch[2]; // e.g. /api/auth/register, /api/requests/:id/verify, /api/requests
    // Inside route files, the route path is relative to the mount point
    // e.g. in requests.ts mounted at /api/requests:
    // /api/requests -> '/'
    // /api/requests/:id -> '/:id'
    // /api/requests/:id/verify -> '/:id/verify'
    // in auth.ts mounted at /api/auth:
    // /api/auth/register -> '/register'
    // /api/auth/login -> '/login'
    // /api/auth/me -> '/me'
    const parts = fullPath.split('/').filter(Boolean); // ['api', 'auth', 'register']
    const relativeSubPath = '/' + parts.slice(2).join('/'); // '/register' or '/' or '/:id/verify'
    const lastPart = parts[parts.length - 1];

    const patterns = [
      `router.${method}`,
      `app.${method}`,
      relativeSubPath,
      lastPart ? `/${lastPart}` : '/',
      fullPath,
    ];
    return patterns;
  }

  // If symbol has parens or descriptive suffix e.g. "POST /api/requests (Emergency Request Submission)"
  // or "RequestSchema pre-save hook" -> look for symbol prefix or identifier
  const baseSymbol = symbol.split('(')[0].trim();
  const identMatch = baseSymbol.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
  if (identMatch) {
    return [identMatch[0], baseSymbol];
  }

  return [symbol, baseSymbol];
}

for (const [testKey, test] of Object.entries(annotations as Record<string, any>)) {
  for (const cut of test.code_under_test) {
    const filePath = path.join(projectRoot, cut.file);
    if (!fs.existsSync(filePath)) {
      errors.push({
        testKey,
        file: cut.file,
        lines: cut.lines,
        symbol: cut.symbol,
        error: `File does not exist: ${cut.file}`,
      });
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const totalLines = lines.length;

    const rangeMatch = cut.lines.match(/^(\d+)-(\d+)$/);
    if (!rangeMatch) {
      errors.push({
        testKey,
        file: cut.file,
        lines: cut.lines,
        symbol: cut.symbol,
        error: `Invalid line range format: ${cut.lines}`,
      });
      continue;
    }

    const startLine = parseInt(rangeMatch[1], 10);
    const endLine = parseInt(rangeMatch[2], 10);

    if (startLine < 1 || endLine > totalLines || startLine > endLine) {
      errors.push({
        testKey,
        file: cut.file,
        lines: cut.lines,
        symbol: cut.symbol,
        error: `Line range ${cut.lines} out of bounds (file has ${totalLines} lines)`,
      });
      continue;
    }

    const sliceContent = lines.slice(startLine - 1, endLine).join('\n');
    const searchPatterns = extractSearchPatterns(cut.symbol, cut.file);

    const found = searchPatterns.some((p) => sliceContent.toLowerCase().includes(p.toLowerCase()));
    if (!found) {
      errors.push({
        testKey,
        file: cut.file,
        lines: cut.lines,
        symbol: cut.symbol,
        error: `Symbol "${cut.symbol}" (patterns: ${searchPatterns.join(', ')}) not found in ${cut.file}:${cut.lines}`,
      });
    }
  }
}

console.log(`Total checks run: ${Object.keys(annotations).length} tests.`);
console.log(`Errors found: ${errors.length}`);
if (errors.length > 0) {
  console.log('Error details:');
  errors.forEach((e) => {
    console.log(`- [${e.file}:${e.lines}] "${e.symbol}" in "${e.testKey}": ${e.error}`);
  });
}
