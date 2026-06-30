# CALinter

[English](README.md) | [Español](README.es.md)

CALinter es un linter de gobernanza reutilizable para repositorios de diseño ArchiMate.

Valida repositorios desde contratos YAML en `.calinter/` y escribe reportes de calidad en `reports/`.

## Cómo Funciona

1. `src/engine.mjs` recibe el repositorio objetivo vía `--repo-root`.
2. `src/contracts.mjs` lee los contratos de gobernanza de CALinter, el contrato del adaptador y el `.archimate` objetivo.
3. El adaptador construye `reports/catalog.json` desde el modelo real.
4. El motor evalúa las reglas YAML soportadas y emite `reports/rule-results.json`.
5. El modelo de calidad consume esos resultados y produce `reports/quality-score.json`.
6. El radar se genera desde el quality score en `reports/quickchart-radar.json`.
7. `contract_consistency_check` corre al final y bloquea el summary si hay desalineación.

Si todavía hay reglas no soportadas, se marcan como `notImplemented` y el estado de calidad pasa a `incomplete` en vez de fingir que la ejecución está completa.

## Contratos YAML

El engine lee `.calinter/archi-rules.yml` y `.calinter/archi-quality.yml`, y luego genera `reports/rule-results.json`, `reports/quality-score.json` y `reports/quickchart-radar.json`.

Las reglas aún no soportadas se marcan como `notImplemented` en vez de inventar resultados.

## Fixture De Entrada

El ejemplo ArchiMate vive en `artifact/source/design.archimate` y se trata como dato de validación de solo lectura.

## Workflow

El GitHub Action reutilizable vive en `.github/workflows/compliance.yml` y se alimenta con los contratos YAML de `.calinter/`.

## Semántica De Salida

- `PASS`: no hay problemas bloqueantes.
- `WARN`: hay hallazgos no bloqueantes, pero la ejecución puede continuar.
- `FAIL`: hay problemas bloqueantes y el workflow debe detenerse.
- `ERROR`: el motor o el workflow tuvieron un problema técnico.

La respuesta JSON usa el mismo valor en `status`.
