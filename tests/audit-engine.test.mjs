import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The web bundle is a native browser ES module; this import also works when the
// containing repository has no package.json declaring `"type": "module"`.
const source = await readFile(new URL('../dist/modules/audit-engine.js', import.meta.url), 'utf8');
const { RULES, SAMPLE_DOCUMENTS, analyzeDocument } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

test('detects all actionable non-empty rules and returns real counts', () => {
  const report = analyzeDocument(
    'R501P S60 Pro Max\n参数为 65W。\n新品  现已发布。\nClean clean spaces.\n适用范围（以说明为准)。\n服务说明, 请查阅资料。\n完美解决所有问题。\n{{产品链接}}',
    { filename: 'copy.txt', projectName: 'R501P-S60 Pro Max' },
  );
  const detected = new Set(report.findings.map(finding => finding.ruleId));
  for (const rule of RULES.filter(rule => rule.id !== 'empty-document')) {
    assert.ok(detected.has(rule.id), `Expected a finding for ${rule.id}`);
  }
  assert.equal(report.summary.errors, 1);
  assert.equal(report.summary.warnings, report.findings.length - 1);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.summary.totalRules, RULES.length);
  assert.equal(report.metadata.filename, 'copy.txt');
  assert.equal(report.rules.find(rule => rule.id === 'placeholders').status, 'failed');
  assert.equal(report.rules.reduce((sum, rule) => sum + rule.count, 0), report.findings.length);
  assert.equal(new Set(report.findings.map(finding => finding.id)).size, report.findings.length);
});

test('clean project copy passes, including Chinese punctuation and spaced units', () => {
  const document = SAMPLE_DOCUMENTS.find(item => item.projectName === 'E2 Station');
  const report = analyzeDocument(document.text, { projectName: document.projectName });
  assert.deepEqual(report.findings, []);
  assert.equal(report.summary.passed, RULES.length);
  assert.ok(report.wordCount > 20);
});

test('empty and whitespace-only documents produce a single blocking finding', () => {
  for (const value of ['', '\n  \t', null, undefined]) {
    const report = analyzeDocument(value);
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].ruleId, 'empty-document');
    assert.equal(report.findings[0].severity, 'error');
    assert.equal(report.lineCount, 0);
    assert.equal(report.wordCount, 0);
  }
});

test('line numbers remain correct for Windows and classic Mac newlines', () => {
  const report = analyzeDocument('第一行。\r\n第二行。\rTODO\r\n数值为 12W。');
  assert.equal(report.findings.find(finding => finding.ruleId === 'placeholders').line, 3);
  assert.equal(report.findings.find(finding => finding.ruleId === 'unit-spacing').line, 4);
  assert.equal(report.lineCount, 4);
});

test('HTML, script tags, and template expressions are analyzed as inert text', () => {
  delete globalThis.__auditEngineExecuted;
  const hostile = '<script>globalThis.__auditEngineExecuted = true</script>\n<img src=x onerror=alert(1)> {{payload}}';
  const report = analyzeDocument(hostile);
  assert.equal(globalThis.__auditEngineExecuted, undefined);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].line, 2);
  assert.equal(report.findings[0].excerpt, '<img src=x onerror=alert(1)> {{payload}}');
  assert.equal(report.charCount, [...hostile].length);
});

test('project consistency only checks variants of a supplied name', () => {
  const text = 'R521P 与 R501P-S60 Pro Max 可按需选择。\nE2 station';
  assert.deepEqual(analyzeDocument(text).findings, []);
  assert.deepEqual(analyzeDocument(text, { projectName: 'R521P' }).findings, []);
  const report = analyzeDocument(text, { projectName: 'E2 Station' });
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].ruleId, 'project-name');
  assert.equal(report.findings[0].line, 2);
  assert.equal(analyzeDocument('推荐r521p。', { projectName: 'R521P' }).findings[0].ruleId, 'project-name');
});

test('product identifiers, percentages, URLs, indentation, and code do not trigger formatting findings', () => {
  const text = [
    '  R501P-S60 Pro Max 支持常规使用。',
    '电池电量：100%。参考：https://example.com/path',
    '| 项目  | 数值  |',
    '```javascript',
    'const amount = "65W"; // TODO',
    '```',
    '请参阅说明书（最新版）。',
  ].join('\n');
  assert.deepEqual(analyzeDocument(text, { projectName: 'R501P-S60 Pro Max' }).findings, []);
});

test('reports are deterministic and expose no claim of legal compliance', () => {
  const document = SAMPLE_DOCUMENTS[0];
  const first = analyzeDocument(document.text, document);
  const second = analyzeDocument(document.text, document);
  assert.deepEqual(first, second);
  const marketing = first.findings.find(finding => finding.ruleId === 'absolute-claims');
  assert.ok(marketing);
  assert.equal(marketing.severity, 'warning');
  assert.match(marketing.suggestion, /仅为文案提示/);
});

test('Unicode character counts and Chinese/English word counts are explicit', () => {
  const report = analyzeDocument('中文 Hello world 😀');
  assert.equal(report.charCount, 16);
  assert.equal(report.wordCount, 4);
  assert.equal(report.lineCount, 1);
  assert.equal(analyzeDocument('中文Hello世界').wordCount, 5);
});

test('adjacent whitespace runs each receive a finding', () => {
  const report = analyzeDocument('one  two   three');
  assert.equal(report.findings.filter(finding => finding.ruleId === 'extra-spaces').length, 2);
});

test('unit spacing handles Chinese adjacency and grouped numbers', () => {
  const report = analyzeDocument('功率为65W，容量为3,000mAh。');
  const matches = report.findings.filter(finding => finding.ruleId === 'unit-spacing');
  assert.equal(matches.length, 2);
  assert.match(matches[0].suggestion, /65 W/);
  assert.match(matches[1].suggestion, /3,000 mAh/);
});

test('enabled rules control executed checks, findings and totals',()=>{
  const result=analyzeDocument('TODO 65W 完美解决所有问题',{enabledRules:['unit-spacing']});
  assert.equal(result.summary.totalRules,1);
  assert.deepEqual(result.rules.map(r=>r.id),['unit-spacing']);
  assert.ok(result.findings.length>0);
  assert.ok(result.findings.every(f=>f.ruleId==='unit-spacing'));
  const none=analyzeDocument('TODO',{enabledRules:[]});
  assert.equal(none.summary.totalRules,0);assert.deepEqual(none.findings,[]);
});
