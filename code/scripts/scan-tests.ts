import fs from 'fs';
import path from 'path';
import ts from '../server/node_modules/typescript/lib/typescript.js';

interface ScannedTest {
  file: string;
  line: number;
  ancestorTitles: string[];
  title: string;
  fullTitle: string;
}

function scanVitestFile(filePath: string, relativePath: string): ScannedTest[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  const tests: ScannedTest[] = [];
  const describeStack: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      let funcName = '';

      if (ts.isIdentifier(expr)) {
        funcName = expr.text;
      } else if (ts.isPropertyAccessExpression(expr)) {
        funcName = `${expr.expression.getText(sourceFile)}.${expr.name.text}`;
      }

      if (funcName === 'describe' || funcName === 'describe.only' || funcName === 'describe.skip') {
        const titleArg = node.arguments[0];
        let title = '';
        if (titleArg && (ts.isStringLiteral(titleArg) || ts.isNoSubstitutionTemplateLiteral(titleArg))) {
          title = titleArg.text;
        }
        describeStack.push(title);
        ts.forEachChild(node, visit);
        describeStack.pop();
        return;
      }

      if (
        funcName === 'it' ||
        funcName === 'test' ||
        funcName === 'it.only' ||
        funcName === 'test.only' ||
        funcName === 'it.skip' ||
        funcName === 'test.skip'
      ) {
        const titleArg = node.arguments[0];
        let title = '';
        if (titleArg && (ts.isStringLiteral(titleArg) || ts.isNoSubstitutionTemplateLiteral(titleArg))) {
          title = titleArg.text;
        }
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const lineNum = line + 1;
        const ancestors = [...describeStack];
        const fullTitle = ancestors.length > 0 ? `${ancestors.join(' > ')} > ${title}` : title;

        tests.push({
          file: relativePath.replace(/\\/g, '/'),
          line: lineNum,
          ancestorTitles: ancestors,
          title,
          fullTitle,
        });
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return tests;
}

const projectRoot = path.resolve(__dirname, '..');
const serverTestsDir = path.join(projectRoot, 'server', 'tests');
const serverFiles = fs.readdirSync(serverTestsDir).filter((f) => f.endsWith('.test.ts'));
const allVitestTests: ScannedTest[] = [];

for (const f of serverFiles.sort()) {
  const fullPath = path.join(serverTestsDir, f);
  const relPath = `server/tests/${f}`;
  allVitestTests.push(...scanVitestFile(fullPath, relPath));
}

console.log(`Scanned ${serverFiles.length} server test files, found ${allVitestTests.length} tests.`);
fs.writeFileSync(path.join(projectRoot, 'scanned-vitest-tests.json'), JSON.stringify(allVitestTests, null, 2));
