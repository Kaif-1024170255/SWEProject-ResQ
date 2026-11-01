const fs = require('fs');
const path = require('path');
const routesDir = path.resolve(__dirname, '../server/src/routes');
const files = fs.readdirSync(routesDir);
const routes = [];

files.forEach(f => {
  if (!f.endsWith('.ts')) return;
  const content = fs.readFileSync(path.join(routesDir, f), 'utf8');
  // Match router.<method>(... '<path>'
  const regex = /router\.(get|post|patch|put|delete)\s*\(\s*['"]([^'"]+)['"]/gs;
  let match;
  while ((match = regex.exec(content)) !== null) {
    // calculate line number
    const line = content.substring(0, match.index).split('\n').length;
    routes.push({ file: f, method: match[1].toUpperCase(), path: match[2], line });
  }
});

console.log('Total routes found:', routes.length);
routes.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
routes.forEach(r => console.log(r.method.padEnd(6), (r.file + ' ' + r.path).padEnd(45), 'line ' + r.line));
