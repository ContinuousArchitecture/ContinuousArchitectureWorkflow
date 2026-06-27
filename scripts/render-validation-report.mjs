import fs from 'node:fs';

// Renderiza el resumen consolidado para el workflow llamador.
// Este script no valida nada por sí mismo; solo da formato a las salidas de
// los validadores reutilizables para el GitHub Step Summary.
const structureReport = JSON.parse(process.env.STRUCTURE_REPORT ?? '{}');
const sourceReport = JSON.parse(process.env.SOURCE_REPORT ?? '{}');
const summaryFile = process.env.GITHUB_STEP_SUMMARY;

// Construye un resumen Markdown compacto con estados y observaciones.
const lines = [];
lines.push('| Check | Status |');
lines.push('|---|---|');
lines.push(`| Repository structure | \`${structureReport.status ?? 'UNKNOWN'}\` |`);
lines.push(`| Archimate source | \`${sourceReport.status ?? 'UNKNOWN'}\` |`);
lines.push('');
lines.push(`- Structure: \`${structureReport.status ?? 'UNKNOWN'}\``);
for (const item of structureReport.observations ?? []) {
  lines.push(`  - ${item}`);
}
lines.push(`- Source: \`${sourceReport.status ?? 'UNKNOWN'}\``);
for (const item of sourceReport.observations ?? []) {
  lines.push(`  - ${item}`);
}

if (summaryFile) {
  fs.writeFileSync(summaryFile, `${lines.join('\n')}\n`, 'utf8');
}

// El workflow llamador usa este estado para decidir si el run aprueba.
const overall = structureReport.status === 'PASS' && sourceReport.status === 'PASS' ? 'PASS' : 'FAIL';
process.stdout.write(`${overall}\n`);
