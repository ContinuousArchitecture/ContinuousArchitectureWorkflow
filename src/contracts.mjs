import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { loadYamlFile } from './infra/yaml.mjs';

const SUPPORTED_SCOPES = new Set(['collection', 'each']);
const SUPPORTED_OPERATORS = new Set([
  'containsAll',
  'regex',
  'greaterThan',
  'lessThanOrEqual',
  'percentageLessThanOrEqual',
]);

export function generateDesignReports({ governanceRoot, targetRoot, outputRoot } = {}) {
  const roots = resolveRoots({ governanceRoot, targetRoot, outputRoot });
  const adapterPath = path.join(roots.governanceRoot, '.calinter', 'archi-adapter.yml');
  const rulesPath = path.join(roots.governanceRoot, '.calinter', 'archi-rules.yml');
  const qualityPath = path.join(roots.governanceRoot, '.calinter', 'archi-quality.yml');
  const catalogPath = path.join(roots.outputRoot, 'reports', 'catalog.json');
  const ruleResultsPath = path.join(roots.outputRoot, 'reports', 'rule-results.json');
  const qualityScorePath = path.join(roots.outputRoot, 'reports', 'quality-score.json');
  const quickchartPath = path.join(roots.outputRoot, 'reports', 'quickchart-radar.json');

  const adapterConfig = loadYamlFile(adapterPath);
  const rulesConfig = loadYamlFile(rulesPath);
  const qualityConfig = loadYamlFile(qualityPath);
  const sourcePath = resolveTargetArchimatePath(roots.targetRoot, adapterConfig);
  const xmlText = fs.readFileSync(sourcePath, 'utf8');
  const catalog = buildCatalogFromAdapter(adapterConfig, xmlText, sourcePath, roots.targetRoot);

  writeJsonFile(catalogPath, catalog);

  const ruleResults = buildRuleResults(rulesConfig, catalog);
  const qualityScore = buildQualityScore(qualityConfig, ruleResults);
  const quickchart = buildQuickchartRadar(qualityScore);
  const contractCheck = buildContractConsistencyCheck({
    rulesConfig,
    qualityConfig,
    catalog,
    ruleResults,
    qualityScore,
    quickchart,
  });

  const allRuleResults = [...ruleResults, contractCheck.result];
  const finalQualityScore = buildQualityScore(qualityConfig, ruleResults);
  const finalQuickchart = buildQuickchartRadar(finalQualityScore);

  writeJsonFile(ruleResultsPath, {
    metadata: {
      source: relativeToRoot(roots.targetRoot, sourcePath),
      generatedAt: new Date().toISOString(),
    },
    rules: allRuleResults,
  });

  writeJsonFile(qualityScorePath, finalQualityScore);
  writeJsonFile(quickchartPath, finalQuickchart);

  if (!contractCheck.ok) {
    throw new Error(`Contrato inconsistente: ${contractCheck.message}`);
  }

  return {
    governanceRoot: roots.governanceRoot,
    targetRoot: roots.targetRoot,
    outputRoot: roots.outputRoot,
    sourcePath,
    adapterConfig,
    rulesConfig,
    qualityConfig,
    catalog,
    ruleResults: allRuleResults,
    qualityScore: finalQualityScore,
    quickchart: finalQuickchart,
  };
}

function resolveRoots({ governanceRoot, targetRoot, outputRoot } = {}) {
  const defaultGovernanceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return {
    governanceRoot: path.resolve(governanceRoot ?? defaultGovernanceRoot),
    targetRoot: path.resolve(targetRoot ?? defaultGovernanceRoot),
    outputRoot: path.resolve(outputRoot ?? defaultGovernanceRoot),
  };
}

function resolveTargetArchimatePath(targetRoot) {
  const folder = path.join(targetRoot, 'artifact', 'source');
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error(`No se encontró artifact/source en ${targetRoot}.`);
  }

  const candidates = fs.readdirSync(folder)
    .filter((entry) => entry.toLowerCase().endsWith('.archimate'))
    .sort((left, right) => left.localeCompare(right));

  if (candidates.length === 0) {
    throw new Error(`No se encontró ningún archivo .archimate en ${folder}.`);
  }

  const preferred = candidates.find((entry) => entry.toLowerCase() === 'design.archimate') ?? candidates[0];
  return path.join(folder, preferred);
}

function buildCatalogFromAdapter(adapterConfig, xmlText, sourcePath, targetRoot) {
  const $ = cheerio.load(xmlText, { xmlMode: true, decodeEntities: true });
  const rootNode = $.root().children().first().get(0);
  if (!rootNode) {
    throw new Error(`No se pudo leer el XML de ${sourcePath}.`);
  }

  const collections = {};
  for (const [collectionName, extractor] of Object.entries(adapterConfig.extractors ?? {})) {
    const nodes = selectExtractorNodes(rootNode, collectionName, extractor);
    collections[collectionName] = nodes.map((node) => buildRecord(collectionName, node, rootNode));
  }

  return {
    metadata: {
      source: relativeToRoot(targetRoot, sourcePath),
      adapterVersion: String(adapterConfig.archi_adapter_dsl ?? 'unknown'),
      format: String(adapterConfig.input?.format ?? 'archi-native'),
      generatedAt: new Date().toISOString(),
      modelId: readAttr(rootNode, 'id') ?? null,
      modelName: readAttr(rootNode, 'name') ?? null,
    },
    folders: collections.folders ?? [],
    elements: collections.elements ?? [],
    relationships: collections.relationships ?? [],
    views: collections.views ?? [],
    diagramObjects: collections.diagramObjects ?? [],
    diagramConnections: collections.diagramConnections ?? [],
  };
}

function selectExtractorNodes(rootNode, collectionName) {
  const allNodes = collectNodes(rootNode);

  switch (collectionName) {
    case 'folders':
      return allNodes.filter((node) => node.name === 'folder');
    case 'elements':
      return allNodes.filter((node) => isBusinessElement(node));
    case 'relationships':
      return allNodes.filter((node) => isRelationshipElement(node));
    case 'views':
      return allNodes.filter((node) => isViewElement(node));
    case 'diagramObjects':
      return allNodes.filter((node) => hasAttr(node, 'archimateElement'));
    case 'diagramConnections':
      return allNodes.filter((node) => hasAttr(node, 'archimateRelationship') || hasAttr(node, 'relationship'));
    default:
      return [];
  }
}

function buildRecord(collectionName, node, rootNode) {
  const record = {
    collection: collectionName,
    id: readAttr(node, 'id') ?? null,
    name: readAttr(node, 'name') ?? null,
    type: readAttr(node, 'xsi:type') ?? null,
  };

  if (collectionName === 'folders') {
    record.parentId = readAttr(findAncestorFolder(node), 'id') ?? null;
    record.parentName = readAttr(findAncestorFolder(node), 'name') ?? null;
    record.type = readAttr(node, 'type') ?? null;
    record.path = buildFolderPath(node);
    return record;
  }

  if (collectionName === 'elements' || collectionName === 'relationships' || collectionName === 'views') {
    const folder = findAncestorFolder(node);
    record.folderId = readAttr(folder, 'id') ?? null;
    record.folderName = readAttr(folder, 'name') ?? null;
  }

  if (collectionName === 'relationships') {
    record.source = readAttr(node, 'source') ?? null;
    record.target = readAttr(node, 'target') ?? null;
  }

  if (collectionName === 'views') {
    record.elementCount = countDescendants(node, (descendant) => hasAttr(descendant, 'archimateElement'));
    record.connectionCount = countDescendants(node, (descendant) => hasAttr(descendant, 'archimateRelationship') || hasAttr(descendant, 'relationship'));
  }

  if (collectionName === 'diagramObjects') {
    const view = findAncestorView(node, rootNode);
    record.viewId = readAttr(view, 'id') ?? null;
    record.elementRef = readAttr(node, 'archimateElement') ?? null;
    record.x = toNumberOrString(readAttr(node, 'x'));
    record.y = toNumberOrString(readAttr(node, 'y'));
    record.width = toNumberOrString(readAttr(node, 'width'));
    record.height = toNumberOrString(readAttr(node, 'height'));
  }

  if (collectionName === 'diagramConnections') {
    const view = findAncestorView(node, rootNode);
    record.viewId = readAttr(view, 'id') ?? null;
    record.relationshipRef = readAttr(node, 'archimateRelationship') ?? readAttr(node, 'relationship') ?? null;
    record.source = readAttr(node, 'source') ?? null;
    record.target = readAttr(node, 'target') ?? null;
    record.bendpoints = collectBendpoints(node);
  }

  return record;
}

function buildFolderPath(node) {
  const names = [];
  let current = node;

  while (current) {
    if (current.name === 'folder') {
      const name = readAttr(current, 'name');
      if (name) {
        names.unshift(name);
      }
    }

    current = current.parent;
  }

  return `/${names.join('/')}`;
}

function findAncestorFolder(node) {
  let current = node?.parent;
  while (current) {
    if (current.name === 'folder') {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function findAncestorView(node, rootNode) {
  let current = node?.parent;
  while (current) {
    if (current !== rootNode && isViewElement(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function isBusinessElement(node) {
  if (node?.name !== 'element' || !hasAttr(node, 'id') || !hasAttr(node, 'xsi:type')) {
    return false;
  }

  const type = String(readAttr(node, 'xsi:type') ?? '');
  if (type.includes('Relationship') || type.includes('Diagram') || type.includes('View')) {
    return false;
  }

  return /Business|Application|Technology|Motivation|Strategy|Implementation|Deliverable|Assessment|Driver|Stakeholder|Requirement|Meaning|Principle|Value/i.test(type);
}

function isRelationshipElement(node) {
  if (node?.name !== 'element' || !hasAttr(node, 'xsi:type')) {
    return false;
  }

  return String(readAttr(node, 'xsi:type') ?? '').includes('Relationship');
}

function isViewElement(node) {
  if (node?.name !== 'element' || !hasAttr(node, 'xsi:type')) {
    return false;
  }

  const type = String(readAttr(node, 'xsi:type') ?? '');
  return type.includes('Diagram') || type.includes('View');
}

function collectNodes(rootNode) {
  const out = [];
  const visit = (node) => {
    if (!node || node.type !== 'tag') {
      return;
    }

    out.push(node);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  visit(rootNode);
  return out;
}

function countDescendants(node, predicate) {
  let count = 0;
  const visit = (current) => {
    for (const child of current.children ?? []) {
      if (child?.type !== 'tag') {
        continue;
      }

      if (predicate(child)) {
        count += 1;
      }

      visit(child);
    }
  };

  visit(node);
  return count;
}

function collectBendpoints(node) {
  const points = [];
  const visit = (current) => {
    for (const child of current.children ?? []) {
      if (child?.type !== 'tag') {
        continue;
      }

      if (child.name === 'bendpoint') {
        points.push({
          startX: toNumberOrString(readAttr(child, 'startX')),
          startY: toNumberOrString(readAttr(child, 'startY')),
          endX: toNumberOrString(readAttr(child, 'endX')),
          endY: toNumberOrString(readAttr(child, 'endY')),
        });
      }

      visit(child);
    }
  };

  visit(node);
  return points;
}

function buildRuleResults(rulesConfig, catalog) {
  const results = [];
  for (const [ruleId, rule] of Object.entries(rulesConfig.rules ?? {})) {
    if (ruleId === 'contract_consistency_check') {
      continue;
    }

    results.push(evaluateYamlRule(ruleId, rule, catalog));
  }

  return results;
}

function evaluateYamlRule(ruleId, rule, catalog) {
  const scope = String(rule?.scope ?? '').trim();
  const operator = String(rule?.assert?.operator ?? '').trim();
  const dimension = String(rule?.dimension ?? '');
  const severity = String(rule?.severity ?? 'error');

  if (!SUPPORTED_SCOPES.has(scope) || !SUPPORTED_OPERATORS.has(operator)) {
    return notImplemented(ruleId, rule, 'unsupported-scope-or-operator');
  }

  if (operator === 'percentageLessThanOrEqual') {
    return evaluatePercentageRule(ruleId, rule, catalog);
  }

  const items = applyFilter(selectItems(rule.source, catalog), rule.source?.filter);

  if (scope === 'collection') {
    return evaluateCollectionRule(ruleId, rule, items, operator);
  }

  if (scope === 'each') {
    return evaluateEachRule(ruleId, rule, items, operator);
  }

  return notImplemented(ruleId, rule, 'unsupported-scope');
}

function selectItems(source, catalog) {
  const collections = source?.collections ?? (source?.collection ? [source.collection] : []);
  return collections.flatMap((collection) => (catalog[collection] ?? []).map((item) => ({ ...item, collection })));
}

function applyFilter(items, filter) {
  if (!filter) {
    return items;
  }

  return items.filter((item) => matchesCondition(item, filter));
}

function evaluateCollectionRule(ruleId, rule, items, operator) {
  const field = rule.assert?.field ?? 'name';
  const values = items.map((item) => String(readValue(item, field) ?? ''));
  const targets = (rule.assert?.values ?? []).map((value) => String(value));

  if (operator === 'containsAll') {
    const missing = targets.filter((value) => !values.includes(value));
    const matched = targets.length - missing.length;
    const ok = missing.length === 0;

    return {
      ruleId,
      dimension: rule.dimension,
      severity: rule.severity,
      scope: rule.scope,
      includeInQualityScore: true,
      includeInRadar: true,
      status: ok ? 'pass' : severityToStatus(rule.severity),
      score: targets.length > 0 ? Math.round((matched / targets.length) * 100) : (ok ? 100 : 0),
      evaluated: values.length,
      passed: matched,
      failed: missing.length,
      findings: ok ? [] : [{ id: `${ruleId}-missing`, message: `Faltan valores: ${missing.join(', ')}` }],
      evidence: [{ collection: rule.source?.collection, recordIds: items.map((item) => item.id).filter(Boolean) }],
    };
  }

  return notImplemented(ruleId, rule, 'unsupported-collection-operator');
}

function evaluateEachRule(ruleId, rule, items, operator) {
  const field = rule.assert?.field ?? 'name';
  const threshold = Number(rule.assert?.value);
  const regex = operator === 'regex' ? new RegExp(rule.assert?.pattern ?? '') : null;

  const failures = [];
  let passed = 0;

  for (const item of items) {
    const value = readValue(item, field);
    let ok = true;

    if (operator === 'regex') {
      ok = regex ? regex.test(String(value ?? '')) : false;
    } else if (operator === 'greaterThan') {
      ok = Number(value) > threshold;
    } else if (operator === 'lessThanOrEqual') {
      ok = Number(value) <= threshold;
    } else {
      return notImplemented(ruleId, rule, 'unsupported-each-operator');
    }

    if (ok) {
      passed += 1;
      continue;
    }

    failures.push({
      id: `${ruleId}-${item.id ?? failures.length + 1}`,
      collection: item.collection,
      recordId: item.id,
      field,
      value,
      message: rule.failureMessage,
    });
  }

  const failed = failures.length;
  const total = items.length;
  const status = failed === 0 ? 'pass' : severityToStatus(rule.severity);

  return {
    ruleId,
    dimension: rule.dimension,
    severity: rule.severity,
    scope: rule.scope,
    includeInQualityScore: true,
    includeInRadar: true,
    status,
    score: total > 0 ? Math.round((passed / total) * 100) : 0,
    evaluated: total,
    passed,
    failed,
    findings: failures,
    evidence: [{ collection: rule.source?.collection, recordIds: items.map((item) => item.id).filter(Boolean) }],
  };
}

function evaluatePercentageRule(ruleId, rule, catalog) {
  const items = selectItems(rule.source, catalog);
  const numerator = items.filter((item) => matchesCondition(item, rule.metric?.numerator));
  const denominator = rule.metric?.denominator?.count === 'all' ? items.length : items.length;
  const ratio = denominator > 0 ? (numerator.length / denominator) * 100 : 0;
  const threshold = Number(rule.assert?.value ?? rule.assert?.threshold ?? 0);
  const pass = ratio <= threshold;

  return {
    ruleId,
    dimension: rule.dimension,
    severity: rule.severity,
    scope: rule.scope,
    includeInQualityScore: true,
    includeInRadar: true,
    status: pass ? 'pass' : severityToStatus(rule.severity),
    score: Math.max(0, Math.round(100 - ratio)),
    evaluated: denominator,
    passed: numerator.length,
    failed: Math.max(0, denominator - numerator.length),
    findings: pass ? [] : [{ id: `${ruleId}-ratio`, ratio, threshold }],
    evidence: [{ collection: rule.source?.collection, associationCount: numerator.length, totalCount: denominator }],
  };
}

function buildQualityScore(qualityConfig, ruleResults) {
  const ruleResultsById = new Map(ruleResults.map((result) => [result.ruleId, result]));
  const dimensions = [];
  let partial = false;

  for (const [dimensionId, dimension] of Object.entries(qualityConfig.qualityModel?.dimensions ?? {})) {
    const rules = [];
    let weightTotal = 0;
    let weightedScore = 0;
    let includedRules = 0;
    let hasCriticalFailure = false;
    let dimensionPartial = false;

    for (const ruleRef of dimension.rules ?? []) {
      const result = ruleResultsById.get(ruleRef.id);
      if (!result) {
        dimensionPartial = true;
        partial = true;
        continue;
      }

      const includeInScore = result.includeInQualityScore !== false && result.status !== 'notImplemented';
      const score = includeInScore ? Number(result.score) : null;

      rules.push({
        ruleId: ruleRef.id,
        weight: Number(ruleRef.weight) || 0,
        score,
        status: result.status,
        includeInQualityScore: result.includeInQualityScore !== false,
      });

      if (includeInScore && Number.isFinite(score)) {
        const weight = Number(ruleRef.weight) || 0;
        weightTotal += weight;
        weightedScore += score * weight;
        includedRules += 1;
      } else if (result.status === 'notImplemented') {
        dimensionPartial = true;
        partial = true;
      }

      if (result.status === 'fail' && isCriticalSeverity(result.severity, qualityConfig)) {
        hasCriticalFailure = true;
      }
    }

    const score = weightTotal > 0 ? Math.round(weightedScore / weightTotal) : null;
    const status = hasCriticalFailure
      ? 'fail'
      : (dimensionPartial ? 'incomplete' : (score >= Number(dimension.target ?? 0) ? 'pass' : 'warning'));

    if (dimensionPartial) {
      partial = true;
    }

    dimensions.push({
      id: dimensionId,
      label: dimension.label,
      target: Number(dimension.target) || 0,
      score,
      status,
      weightTotal,
      includedRules,
      rules,
    });
  }

  const numericScores = dimensions.map((dimension) => dimension.score).filter((score) => Number.isFinite(score));
  const overallScore = numericScores.length > 0
    ? Math.round(numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length)
    : null;
  const status = dimensions.some((dimension) => dimension.status === 'fail')
    ? 'fail'
    : (partial ? 'incomplete' : (dimensions.some((dimension) => dimension.status === 'warning') ? 'warning' : 'pass'));

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      version: '0.0.3',
    },
    overallScore,
    status,
    partial,
    radarOrder: dimensions.map((dimension) => dimension.label),
    dimensions,
  };
}

function buildQuickchartRadar(qualityScore) {
  const includedDimensions = (qualityScore.dimensions ?? []).filter((dimension) => Number.isFinite(dimension.score));
  return {
    type: 'radar',
    status: qualityScore.partial ? 'partial' : 'complete',
    partial: Boolean(qualityScore.partial),
    omittedDimensions: (qualityScore.dimensions ?? []).filter((dimension) => !Number.isFinite(dimension.score)).map((dimension) => dimension.label),
    data: {
      labels: includedDimensions.map((dimension) => dimension.label),
      datasets: [
        {
          label: 'Evaluado',
          data: includedDimensions.map((dimension) => dimension.score),
          backgroundColor: 'rgba(34, 197, 94, 0.20)',
          borderColor: '#22c55e',
          pointBackgroundColor: '#22c55e',
          borderWidth: 2,
        },
        {
          label: 'Objetivo',
          data: includedDimensions.map((dimension) => dimension.target),
          backgroundColor: 'rgba(156, 163, 175, 0.10)',
          borderColor: '#9ca3af',
          pointBackgroundColor: '#9ca3af',
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
        },
        title: {
          display: true,
          text: 'Calidad del diseño',
        },
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
          },
        },
      },
    },
  };
}

function buildContractConsistencyCheck({ rulesConfig, qualityConfig, catalog, ruleResults, qualityScore, quickchart }) {
  const definedRules = new Set(Object.keys(rulesConfig.rules ?? {}));
  const qualityRules = Object.values(qualityConfig.qualityModel?.dimensions ?? {}).flatMap((dimension) => (dimension.rules ?? []).map((rule) => rule.id));
  const resultRuleIds = new Set(ruleResults.map((rule) => rule.ruleId));
  const messages = [];

  for (const ruleId of qualityRules) {
    if (!definedRules.has(ruleId)) {
      messages.push(`quality.yml referencia la regla inexistente '${ruleId}'.`);
    }

    if (!resultRuleIds.has(ruleId)) {
      messages.push(`rule-results.json no incluye la regla '${ruleId}'.`);
    }
  }

  for (const dimension of qualityScore.dimensions ?? []) {
    for (const rule of dimension.rules ?? []) {
      if (!resultRuleIds.has(rule.ruleId)) {
        messages.push(`quality-score.json usa la regla '${rule.ruleId}' sin resultado en rule-results.json.`);
      }
    }
  }

  const expectedQualityScore = buildQualityScore(qualityConfig, ruleResults);
  if (!qualityScoresMatch(qualityScore, expectedQualityScore)) {
    messages.push('quality-score.json no se puede recalcular desde rule-results.json.');
  }

  const expectedQuickchart = buildQuickchartRadar(expectedQualityScore);
  if (!quickchartsMatch(quickchart, expectedQuickchart)) {
    messages.push('quickchart-radar.json no coincide con quality-score.json.');
  }

  if (resultRuleIds.has('referencias_rotas_regla') && (ruleResults.find((rule) => rule.ruleId === 'referencias_rotas_regla')?.status === 'pass')) {
    const broken = validateCatalogReferences(catalog);
    if (!broken.ok) {
      messages.push(broken.message);
    }
  }

  return {
    ok: messages.length === 0,
    message: messages.join(' '),
    result: {
      ruleId: 'contract_consistency_check',
      dimension: 'Gobierno',
      severity: 'error',
      scope: 'system',
      includeInQualityScore: false,
      includeInRadar: false,
      status: messages.length === 0 ? 'pass' : 'fail',
      score: messages.length === 0 ? 100 : 0,
      evaluated: 5,
      passed: messages.length === 0 ? 5 : 0,
      failed: messages.length === 0 ? 0 : 5,
      findings: messages.length === 0 ? [] : messages.map((message, index) => ({ id: `contract-${index + 1}`, message })),
      evidence: [{ collections: ['rules', 'qualityScore', 'quickchart', 'catalog'] }],
      reason: messages.length === 0 ? undefined : 'contract-inconsistency',
    },
  };
}

function validateCatalogReferences(catalog) {
  const elementIds = new Set((catalog.elements ?? []).map((element) => element.id));
  const relationshipIds = new Set((catalog.relationships ?? []).map((relationship) => relationship.id));
  const brokenReferences = [];

  for (const object of catalog.diagramObjects ?? []) {
    if (!elementIds.has(object.elementRef)) {
      brokenReferences.push(`diagramObject:${object.id}->${object.elementRef}`);
    }
  }

  for (const connection of catalog.diagramConnections ?? []) {
    if (!relationshipIds.has(connection.relationshipRef)) {
      brokenReferences.push(`diagramConnection:${connection.id}->${connection.relationshipRef}`);
    }
  }

  for (const relationship of catalog.relationships ?? []) {
    if (!elementIds.has(relationship.source)) {
      brokenReferences.push(`relationship:${relationship.id}.source->${relationship.source}`);
    }

    if (!elementIds.has(relationship.target)) {
      brokenReferences.push(`relationship:${relationship.id}.target->${relationship.target}`);
    }
  }

  if (brokenReferences.length > 0) {
    return { ok: false, message: `catalog.json contiene referencias rotas (${brokenReferences.join(', ')}).` };
  }

  return { ok: true, message: '' };
}

function quickchartsMatch(actual, expected) {
  return JSON.stringify(actual?.data?.labels ?? []) === JSON.stringify(expected?.data?.labels ?? [])
    && JSON.stringify(actual?.data?.datasets?.[0]?.data ?? []) === JSON.stringify(expected?.data?.datasets?.[0]?.data ?? [])
    && JSON.stringify(actual?.data?.datasets?.[1]?.data ?? []) === JSON.stringify(expected?.data?.datasets?.[1]?.data ?? [])
    && Boolean(actual?.partial) === Boolean(expected?.partial)
    && JSON.stringify(actual?.omittedDimensions ?? []) === JSON.stringify(expected?.omittedDimensions ?? []);
}

function qualityScoresMatch(actual, expected) {
  return JSON.stringify(actual?.radarOrder ?? []) === JSON.stringify(expected?.radarOrder ?? [])
    && String(actual?.status ?? '') === String(expected?.status ?? '')
    && Boolean(actual?.partial) === Boolean(expected?.partial)
    && Number(actual?.overallScore ?? NaN) === Number(expected?.overallScore ?? NaN)
    && JSON.stringify((actual?.dimensions ?? []).map((dimension) => ({
      id: dimension.id,
      label: dimension.label,
      target: dimension.target,
      score: dimension.score,
      status: dimension.status,
      weightTotal: dimension.weightTotal,
      rules: (dimension.rules ?? []).map((rule) => ({
        ruleId: rule.ruleId,
        weight: rule.weight,
        score: rule.score,
        status: rule.status,
        includeInQualityScore: rule.includeInQualityScore,
      })),
    }))) === JSON.stringify((expected?.dimensions ?? []).map((dimension) => ({
      id: dimension.id,
      label: dimension.label,
      target: dimension.target,
      score: dimension.score,
      status: dimension.status,
      weightTotal: dimension.weightTotal,
      rules: (dimension.rules ?? []).map((rule) => ({
        ruleId: rule.ruleId,
        weight: rule.weight,
        score: rule.score,
        status: rule.status,
        includeInQualityScore: rule.includeInQualityScore,
      })),
    })));
}

function notImplemented(ruleId, rule, reason) {
  return {
    ruleId,
    dimension: rule?.dimension,
    severity: rule?.severity,
    scope: rule?.scope,
    includeInQualityScore: false,
    includeInRadar: false,
    status: 'notImplemented',
    score: null,
    evaluated: 0,
    passed: 0,
    failed: 0,
    findings: [],
    evidence: [],
    reason,
  };
}

function severityToStatus(severity) {
  return String(severity ?? 'error').toLowerCase() === 'warning' ? 'warning' : 'fail';
}

function isCriticalSeverity(severity, qualityConfig) {
  const critical = qualityConfig.qualityModel?.statusPolicy?.criticalSeverities ?? ['error'];
  return critical.includes(String(severity ?? '').toLowerCase());
}

function matchesCondition(item, condition) {
  if (!condition) {
    return true;
  }

  const value = String(readValue(item, condition.field ?? condition.attribute ?? '') ?? '');

  if (condition.notEmpty) {
    return value.trim().length > 0;
  }

  if (condition.equals !== undefined) {
    return value === String(condition.equals);
  }

  if (condition.contains !== undefined) {
    return value.includes(String(condition.contains));
  }

  if (condition.notEquals !== undefined) {
    return value !== String(condition.notEquals);
  }

  return true;
}

function readValue(item, field) {
  if (!field) {
    return undefined;
  }

  if (field in item) {
    return item[field];
  }

  if (field.startsWith('attrs.')) {
    return item.attrs?.[field.slice('attrs.'.length)];
  }

  return item[field];
}

function readAttr(node, attr) {
  return node?.attribs?.[attr];
}

function hasAttr(node, attr) {
  return readAttr(node, attr) !== undefined;
}

function toNumberOrString(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const text = String(value);
  return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : text;
}

function relativeToRoot(root, target) {
  return path.relative(root, target).replace(/\\/g, '/');
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
