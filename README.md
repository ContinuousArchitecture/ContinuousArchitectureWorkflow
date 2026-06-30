# CALinter

[English](README.md) | [Español](README.es.md)

CALinter is a reusable governance linter for ArchiMate design repositories.

It validates repositories from YAML contracts under `.calinter/` and writes quality reports under `reports/`.

## How It Works

1. `src/engine.mjs` receives the target repository through `--repo-root`.
2. `src/contracts.mjs` reads the governance contracts from CALinter, the adapter contract, and the target `.archimate` file.
3. The adapter builds `reports/catalog.json` from the real model.
4. The rule engine evaluates the supported YAML rules and emits `reports/rule-results.json`.
5. The quality model consumes those results and produces `reports/quality-score.json`.
6. The radar is generated from the quality score in `reports/quickchart-radar.json`.
7. `contract_consistency_check` runs at the end and blocks the summary if the contracts drift.

If some rules are still unsupported, they are marked `notImplemented` and the quality status becomes `incomplete` instead of pretending the run is complete.

## YAML Contracts

The engine reads `.calinter/archi-rules.yml` and `.calinter/archi-quality.yml`, then writes `reports/rule-results.json`, `reports/quality-score.json`, and `reports/quickchart-radar.json`.

Unsupported rules are marked `notImplemented` instead of being invented.

## Input Fixture

The sample ArchiMate input lives at `artifact/source/design.archimate` and is treated as read-only example data for validation.

## Workflow

The reusable GitHub Action lives in `.github/workflows/compliance.yml` and is driven by the YAML contracts in `.calinter/`.

## Output Semantics

- `PASS`: no blocking issues.
- `WARN`: non-blocking findings were detected, but the run can continue.
- `FAIL`: blocking issues were detected and the workflow should stop.
- `ERROR`: the engine or workflow hit a technical problem.

The JSON response uses the same top-level `status` value.
