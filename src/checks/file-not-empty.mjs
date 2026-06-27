import { isFile, readText } from '../infra/fs.mjs';

export function evaluateFileNotEmptyCheck({ absolutePath, check }) {
  const ok = isFile(absolutePath) && readText(absolutePath).trim().length > 0;
  return { status: ok ? 'PASS' : 'FAIL', detail: check.path };
}
