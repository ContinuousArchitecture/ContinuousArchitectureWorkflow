# CALinter

[English](README.md) | [Español](README.es.md)

CALinter es un linter de gobernanza reutilizable para repositorios de diseño ArchiMate.

Valida repositorios desde contratos YAML en `.calinter/` y escribe reportes de calidad en `reports/`.

## Contratos YAML

El engine lee `.calinter/archi-rules.yml` y `.calinter/archi-quality.yml`, y luego genera `reports/rule-results.json`, `reports/quality-score.json` y `reports/quickchart-radar.json`.

Las reglas aún no soportadas se marcan como `notImplemented` en vez de inventar resultados.

## Workflow

El GitHub Action reutilizable vive en `.github/workflows/compliance.yml` y se alimenta con los contratos YAML de `.calinter/`.

## Semántica De Salida

- `PASS`: no hay problemas bloqueantes.
- `WARN`: hay hallazgos no bloqueantes, pero la ejecución puede continuar.
- `FAIL`: hay problemas bloqueantes y el workflow debe detenerse.
- `ERROR`: el motor o el workflow tuvieron un problema técnico.

La respuesta JSON usa el mismo valor en `status`.
