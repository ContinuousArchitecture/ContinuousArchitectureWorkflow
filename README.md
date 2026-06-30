# CALinter

[English](README.md) | [Español](README.es.md)

CALinter is a reusable governance linter for ArchiMate design repositories.

It validates repositories from YAML contracts under `.calinter/` and writes quality reports under `reports/`.

## YAML Contracts

The engine reads `.calinter/archi-rules.yml` and `.calinter/archi-quality.yml`, then writes `reports/rule-results.json`, `reports/quality-score.json`, and `reports/quickchart-radar.json`.

Unsupported rules are marked `notImplemented` instead of being invented.

## Workflow

The reusable GitHub Action lives in `.github/workflows/compliance.yml` and is driven by the YAML contracts in `.calinter/`.

## Output Semantics

- `PASS`: no blocking issues.
- `WARN`: non-blocking findings were detected, but the run can continue.
- `FAIL`: blocking issues were detected and the workflow should stop.
- `ERROR`: the engine or workflow hit a technical problem.

The JSON response uses the same top-level `status` value.
