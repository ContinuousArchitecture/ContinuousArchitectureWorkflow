# Scripts de Gobernanza

Estos scripts viven en el repo central `ci-architecture-governance` y son usados por los workflows reutilizables.

## `validate-repository-structure.mjs`

Valida que el repositorio llamador tenga la estructura mínima esperada.

### Entrada

- `--repo-root`: raíz del repo a validar.
- `--repository-name-pattern`: regex del nombre del repo.
- `--report-file`: ruta del JSON de salida.

### Salida

- Imprime `PASS` o `FAIL` por stdout.
- Escribe un JSON con `name`, `status`, `checks` y `observations`.

## `validate-archimate-source.mjs`

Valida que `artifact/source` contenga exactamente `design.archimate` y que el archivo parezca un modelo ArchiMate XML.

### Entrada

- `--source-path`: carpeta fuente a validar.
- `--report-file`: ruta del JSON de salida.

### Salida

- Imprime `PASS` o `FAIL` por stdout.
- Escribe un JSON con `path`, `status`, `checks` y `observations`.

## `render-validation-report.mjs`

Toma los reportes JSON producidos por los validadores y arma el resumen consolidado del run.

### Entrada

- `STRUCTURE_REPORT`: JSON del validador de estructura.
- `SOURCE_REPORT`: JSON del validador de fuente.
- `GITHUB_STEP_SUMMARY`: archivo destino del resumen.

### Salida

- Imprime `PASS` o `FAIL` por stdout.
- Escribe el resumen final en Markdown.
