import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'sample-repo');
const enginePath = path.join(repoRoot, 'src', 'engine.mjs');
const tempSummary = path.join(os.tmpdir(), 'calinter-summary.md');

assertFixtureExists(fixtureRoot);
runEngine(enginePath, ['--mode', 'validate', '--repo-root', fixtureRoot]);
runEngine(enginePath, ['--mode', 'summary', '--repo-root', fixtureRoot], {
  GITHUB_STEP_SUMMARY: tempSummary,
});

const qualityScore = readJson(path.join(repoRoot, 'reports', 'quality-score.json'));
const quickchart = readJson(path.join(repoRoot, 'reports', 'quickchart-radar.json'));
const catalog = readJson(path.join(repoRoot, 'reports', 'catalog.json'));
const ruleResults = readJson(path.join(repoRoot, 'reports', 'rule-results.json'));

printReport(ruleResults, qualityScore, quickchart);

if (qualityScore.status !== 'incomplete') {
  throw new Error(`Expected quality-score.json to be incomplete, got '${qualityScore.status}'.`);
}

if (quickchart.partial !== true) {
  throw new Error('Expected quickchart-radar.json to be partial.');
}

if (catalog.metadata?.source !== 'artifact/source/design.archimate') {
  throw new Error(`Expected catalog.json source to be artifact/source/design.archimate, got '${catalog.metadata?.source}'.`);
}

if (!fs.existsSync(tempSummary)) {
  throw new Error('Expected summary markdown to be generated.');
}

console.log('CALinter local tests passed.');

function assertFixtureExists(fixturePath) {
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Missing fixture repo: ${fixturePath}`);
  }
}

function runEngine(engine, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [engine, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.status !== 0) {
    throw new Error([
      `Engine command failed: node ${args.join(' ')}`,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ].filter(Boolean).join('\n'));
  }

  return result;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function printReport(ruleResults, qualityScore, quickchart) {
  const rules = ruleResults.rules ?? [];
  const counts = rules.reduce((acc, rule) => {
    const key = String(rule.status ?? 'unknown').toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const unsupported = rules.filter((rule) => rule.status === 'notImplemented').map((rule) => rule.ruleId);
  const incompleteDimensions = (qualityScore.dimensions ?? []).filter((dimension) => dimension.status === 'incomplete').map((dimension) => dimension.label);

  console.log('CALinter local test report');
  console.log('Rules: .calinter/archi-rules.yml');
  console.log('Quality: .calinter/archi-quality.yml');
  console.log(`Dimensions: ${(qualityScore.dimensions ?? []).map((dimension) => dimension.label).join(', ')}`);
  console.log(`Rule results: pass=${counts.pass ?? 0}, warning=${counts.warning ?? 0}, incomplete=${counts.notimplemented ?? 0}`);
  console.log(`Quality status: ${qualityScore.status} (${qualityScore.partial ? 'partial' : 'complete'})`);
  console.log(`Radar: ${quickchart.partial ? 'partial' : 'complete'} ${quickchart.omittedDimensions?.length ? `omitted=${quickchart.omittedDimensions.join(', ')}` : ''}`.trim());

  if (unsupported.length > 0) {
    console.log(`Not implemented: ${unsupported.join(', ')}`);
  }

  if (incompleteDimensions.length > 0) {
    console.log(`Incomplete dimensions: ${incompleteDimensions.join(', ')}`);
  }

  console.log('');
}
