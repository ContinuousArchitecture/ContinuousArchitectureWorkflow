import { isFile, readText } from '../infra/fs.mjs';

export function evaluateTextContainsCheck({ absolutePath, check }) {
  const ok = isFile(absolutePath) && readText(absolutePath).includes(check.text);
  return { status: ok ? 'PASS' : 'FAIL', detail: check.text };
}
