import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';

export function loadYamlFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');

  try {
    return parseYaml(text) ?? {};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo interpretar el archivo YAML '${filePath}': ${message}`);
  }
}
